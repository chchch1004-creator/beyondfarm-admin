const Timesheet = {
  data: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,

  async render() {
    if (App.user.role !== 'superadmin') {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>총괄관리자만 접근 가능합니다</div>';
      return;
    }
    document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    await this.load(this.currentYear, this.currentMonth);
  },

  async load(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    try {
      this.data = await API.get(`/api/timesheet?year=${year}&month=${month}`);
      this.renderPage();
    } catch (e) {
      document.getElementById('content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  calc(emp) {
    const totalHours = Object.values(emp.daily).reduce((s, d) => s + (d.hours || 0), 0);
    const netPay = Math.round(totalHours * (emp.hourly_rate || 0) + (emp.adj || 0) * 10000 + (emp.adj1 || 0) * 10000);
    const tax = Math.round(netPay * 0.03);
    const localTax = Math.round(netPay * 0.003);
    const transfer = netPay - tax - localTax;
    return { totalHours, netPay, tax, localTax, transfer };
  },

  renderPage() {
    const { year, month, days, employees, note } = this.data;
    const now = new Date();

    // 월 탭
    const tabs = [];
    const startYear = 2026, startMonth = 6;
    let ty = startYear, tm = startMonth;
    while (ty < now.getFullYear() || (ty === now.getFullYear() && tm <= now.getMonth() + 1)) {
      const active = (ty === year && tm === month) ? 'active' : '';
      tabs.push(`<button class="tab ${active}" onclick="Timesheet.load(${ty},${tm})">${ty}년 ${tm}월</button>`);
      tm++; if (tm > 12) { tm = 1; ty++; }
    }

    const getDow = (d) => new Date(year, month - 1, d).getDay();

    // 헤더 날짜
    const dayHeaders = Array.from({length: days}, (_, i) => {
      const d = i + 1, dow = getDow(d);
      const c = dow === 0 ? 'color:#ff4444' : dow === 6 ? 'color:#4488ff' : '';
      return `<th style="${c}">${d}</th>`;
    }).join('');

    // 직원 행 생성
    let rowsHtml = '';
    employees.forEach(emp => {
      const dailyCells = Array.from({length: days}, (_, i) => {
        const d = i + 1;
        const dayData = emp.daily[d];
        const h = dayData?.hours;
        const isManual = dayData?.is_manual;
        const dow = getDow(d);
        const wkColor = dow === 0 ? 'color:#ff4444' : dow === 6 ? 'color:#4488ff' : '';
        const manualColor = isManual ? 'color:#dc3545;font-weight:600' : wkColor;
        return `<td id="h-${emp.id}-${d}" style="text-align:center;cursor:pointer;${h ? manualColor : wkColor}"
          onclick="Timesheet.startEdit(this,${emp.id},${d})">${h || ''}</td>`;
      }).join('');

      const { totalHours, netPay, tax, localTax, transfer } = this.calc(emp);

      // 주민번호 포맷
      let ssnDisplay = '-';
      if (emp.ssn) {
        const s = emp.ssn.replace(/-/g,'');
        ssnDisplay = s.length === 13 ? s.substring(0,6)+'-'+s.substring(6) : emp.ssn;
      }

      rowsHtml += `<tr style="border-bottom:1px solid #dee2e6">
        <td style="padding:3px 8px;font-weight:600;white-space:nowrap">${emp.name}</td>
        <td id="total-${emp.id}" style="text-align:center;font-weight:600">${totalHours || ''}</td>
        ${dailyCells}
        <td id="adj-${emp.id}" style="text-align:center;cursor:pointer;color:#e67700"
          onclick="Timesheet.startEditAdj(this,${emp.id},'adj')">${emp.adj || ''}</td>
        <td id="adj1-${emp.id}" style="text-align:center;cursor:pointer;color:#e67700"
          onclick="Timesheet.startEditAdj(this,${emp.id},'adj1')">${emp.adj1 || ''}</td>
        <td id="netpay-${emp.id}" style="text-align:right;padding:3px 6px;white-space:nowrap">${netPay ? Utils.formatNum(netPay) : ''}</td>
        <td id="tax-${emp.id}" style="text-align:right;padding:3px 4px">${netPay ? Utils.formatNum(tax) : ''}</td>
        <td id="ltax-${emp.id}" style="text-align:right;padding:3px 4px">${netPay ? Utils.formatNum(localTax) : ''}</td>
        <td id="transfer-${emp.id}" style="text-align:right;padding:3px 6px;white-space:nowrap">${netPay ? Utils.formatNum(transfer) : ''}</td>
        <td style="padding:3px 4px;font-size:10px;white-space:nowrap">${ssnDisplay}</td>
        <td style="padding:3px 4px;font-size:10px;white-space:nowrap">${emp.bank_name ? emp.bank_name+' '+(emp.bank_account||'') : (emp.bank_account||'-')}</td>
      </tr>`;
    });

    // 전체 합계 계산
    const grandTotals = employees.reduce((acc, emp) => {
      const c = this.calc(emp);
      acc.totalHours += c.totalHours;
      acc.netPay += c.netPay;
      acc.tax += c.tax;
      acc.localTax += c.localTax;
      acc.transfer += c.transfer;
      return acc;
    }, { totalHours: 0, netPay: 0, tax: 0, localTax: 0, transfer: 0 });

    const content = document.getElementById('content');
    content.innerHTML = `
      <style>
        #ts-table { border-collapse:collapse; font-size:11px; }
        #ts-table th, #ts-table td { border:1px solid #ccc; }
        #ts-table thead th { background:#1b4332; color:#fff; padding:5px 3px; text-align:center; position:sticky; top:0; z-index:2; white-space:nowrap; }
        #ts-table thead th:first-child { text-align:left; padding-left:8px; }
        #ts-table tfoot td { background:#1b4332; color:#fff; padding:5px 4px; font-weight:700; text-align:right; }
        #ts-table tfoot td:first-child { text-align:left; padding-left:8px; }
        #ts-table td:hover { background:#fffde7 !important; }
        .ts-input { width:100%;border:none;text-align:center;background:#fff3cd;font-size:11px;outline:none; }
      </style>

      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="tabs" style="margin:0;flex-wrap:wrap">${tabs.join('')}</div>
        <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="Timesheet.downloadExcel()">📥 엑셀 다운로드</button>
      </div>

      <div class="card" style="padding:10px;overflow-x:auto">
        <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:8px">${year}년 ${month}월 비욘더팜 근무표</div>
        <table id="ts-table">
          <thead>
            <tr>
              <th style="min-width:72px;text-align:left;padding-left:8px">이름</th>
              <th style="min-width:32px">합계</th>
              ${dayHeaders}
              <th style="min-width:34px;background:#856404;color:#fff">상여</th>
              <th style="min-width:34px;background:#856404;color:#fff">조정</th>
              <th style="min-width:70px">합계금액</th>
              <th style="min-width:52px">국세</th>
              <th style="min-width:52px">지방세</th>
              <th style="min-width:70px">이체금액</th>
              <th style="min-width:108px">주민등록번호</th>
              <th style="min-width:130px">계좌번호</th>
            </tr>
          </thead>
          <tbody id="ts-tbody">${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td style="text-align:left;padding-left:8px">전체 합계</td>
              <td style="text-align:center">${grandTotals.totalHours || ''}</td>
              ${Array.from({length: days+2}, () => '<td></td>').join('')}
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.netPay) : ''}</td>
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.tax) : ''}</td>
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.localTax) : ''}</td>
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.transfer) : ''}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="card" style="margin-top:0">
        <div class="card-title">📝 ${year}년 ${month}월 메모</div>
        <textarea id="ts-note" style="width:100%;min-height:72px;padding:10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px;resize:vertical">${note}</textarea>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Timesheet.saveNote()">메모 저장</button>
        </div>
      </div>
    `;
  },

  // 날짜 셀 편집
  startEdit(cell, userId, day) {
    const emp = this.data.employees.find(e => e.id === userId);
    const cur = emp.daily[day]?.hours || '';
    cell.innerHTML = `<input class="ts-input" type="number" step="0.5" min="0" value="${cur}">`;
    const input = cell.querySelector('input');
    input.focus(); input.select();
    const done = () => {
      const val = parseFloat(input.value);
      this.applyHours(cell, userId, day, isNaN(val) ? 0 : val);
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { this.renderCell(cell, userId, day); }
    });
  },

  async applyHours(cell, userId, day, hours) {
    const emp = this.data.employees.find(e => e.id === userId);
    const getDow = (d) => new Date(this.currentYear, this.currentMonth - 1, d).getDay();
    if (hours > 0) {
      emp.daily[day] = { hours, is_manual: true };
    } else {
      delete emp.daily[day];
    }
    this.renderCell(cell, userId, day);
    this.recalcRow(userId);
    try {
      await API.put('/api/timesheet/hours', { user_id: userId, year: this.currentYear, month: this.currentMonth, day, hours });
    } catch (e) { Utils.showToast('저장 실패: ' + e.message, 'error'); }
  },

  renderCell(cell, userId, day) {
    const emp = this.data.employees.find(e => e.id === userId);
    const dayData = emp.daily[day];
    const h = dayData?.hours;
    const isManual = dayData?.is_manual;
    const getDow = (d) => new Date(this.currentYear, this.currentMonth - 1, d).getDay();
    const dow = getDow(day);
    const wkColor = dow === 0 ? '#ff4444' : dow === 6 ? '#4488ff' : '';
    cell.innerHTML = h || '';
    cell.style.color = h ? (isManual ? '#dc3545' : wkColor) : wkColor;
    cell.style.fontWeight = isManual ? '600' : '';
  },

  // 조정 셀 편집
  startEditAdj(cell, userId, field) {
    const emp = this.data.employees.find(e => e.id === userId);
    const cur = emp[field] || '';
    cell.innerHTML = `<input class="ts-input" type="number" step="0.5" value="${cur}">`;
    const input = cell.querySelector('input');
    input.focus(); input.select();
    const done = () => {
      const val = parseFloat(input.value) || 0;
      emp[field] = val;
      cell.innerHTML = val || '';
      cell.style.color = '#e67700';
      this.recalcRow(userId);
      API.put('/api/timesheet/adjustments', { user_id: userId, year: this.currentYear, month: this.currentMonth, adj: emp.adj || 0, adj1: emp.adj1 || 0 })
        .catch(e => Utils.showToast('저장 실패: ' + e.message, 'error'));
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { cell.innerHTML = cur || ''; }
    });
  },

  recalcRow(userId) {
    const emp = this.data.employees.find(e => e.id === userId);
    const { totalHours, netPay, tax, localTax, transfer } = this.calc(emp);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set(`total-${userId}`, totalHours || '');
    set(`netpay-${userId}`, netPay ? Utils.formatNum(netPay) : '');
    set(`tax-${userId}`, netPay ? Utils.formatNum(tax) : '');
    set(`ltax-${userId}`, netPay ? Utils.formatNum(localTax) : '');
    set(`transfer-${userId}`, netPay ? Utils.formatNum(transfer) : '');
    this.recalcGrandTotal();
  },

  recalcGrandTotal() {
    const gt = this.data.employees.reduce((acc, emp) => {
      const c = this.calc(emp);
      acc.totalHours += c.totalHours; acc.netPay += c.netPay;
      acc.tax += c.tax; acc.localTax += c.localTax; acc.transfer += c.transfer;
      return acc;
    }, { totalHours: 0, netPay: 0, tax: 0, localTax: 0, transfer: 0 });
    const tfCells = document.querySelectorAll('#ts-table tfoot td');
    if (tfCells.length >= 7) {
      tfCells[1].textContent = gt.totalHours || '';
      const offset = tfCells.length - 6;
      tfCells[offset].textContent = gt.netPay ? Utils.formatNum(gt.netPay) : '';
      tfCells[offset+1].textContent = gt.netPay ? Utils.formatNum(gt.tax) : '';
      tfCells[offset+2].textContent = gt.netPay ? Utils.formatNum(gt.localTax) : '';
      tfCells[offset+3].textContent = gt.netPay ? Utils.formatNum(gt.transfer) : '';
    }
  },

  async saveNote() {
    const content = document.getElementById('ts-note')?.value || '';
    try {
      await API.post('/api/timesheet/notes', { year: this.currentYear, month: this.currentMonth, content });
      Utils.showToast('메모가 저장되었습니다.');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  downloadExcel() {
    if (!this.data || typeof XLSX === 'undefined') return;
    const { year, month, days, employees } = this.data;
    const getDow = (d) => new Date(year, month - 1, d).getDay();
    const header = ['이름','합계',...Array.from({length:days},(_,i)=>i+1),'조정','조정','합계금액','국세','지방세','이체금액','주민등록번호','계좌번호'];
    const rows = [[`${year}년 ${month}월 비욘더팜 근무표`], header];

    employees.forEach(emp => {
      const { totalHours, netPay, tax, localTax, transfer } = this.calc(emp);
      const dailyVals = Array.from({length:days}, (_,i) => emp.daily[i+1]?.hours || '');
      const s = (emp.ssn||'').replace(/-/g,'');
      const ssn = s.length===13 ? s.substring(0,6)+'-'+s.substring(6) : emp.ssn || '';
      rows.push([emp.name, totalHours||'', ...dailyVals, emp.adj||'', emp.adj1||'',
        netPay||'', netPay?tax:'', netPay?localTax:'', netPay?transfer:'',
        ssn, emp.bank_name ? emp.bank_name+' '+(emp.bank_account||'') : (emp.bank_account||'')]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:12},{wch:5},...Array(days).fill({wch:4}),{wch:5},{wch:5},{wch:12},{wch:10},{wch:10},{wch:12},{wch:16},{wch:22}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${month}월 근무표`);
    XLSX.writeFile(wb, `${year}년_${month}월_비욘더팜_근무표.xlsx`);
  }
};
