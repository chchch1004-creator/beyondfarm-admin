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

  renderPage() {
    const { year, month, days, employees, note } = this.data;
    const now = new Date();

    // 월 탭 생성 (2026년 6월부터 현재까지)
    const tabs = [];
    const startYear = 2026, startMonth = 6;
    let ty = startYear, tm = startMonth;
    while (ty < now.getFullYear() || (ty === now.getFullYear() && tm <= now.getMonth() + 1)) {
      const active = (ty === year && tm === month) ? 'active' : '';
      tabs.push(`<button class="tab ${active}" onclick="Timesheet.load(${ty},${tm})">${ty}년 ${tm}월</button>`);
      tm++;
      if (tm > 12) { tm = 1; ty++; }
    }

    // 요일 계산 (1=월, 7=일)
    const getDow = (d) => new Date(year, month - 1, d).getDay(); // 0=일, 6=토

    // 직원 구분별 그룹
    const groups = {};
    for (const emp of employees) {
      const t = emp.employee_type || '평일';
      if (!groups[t]) groups[t] = [];
      groups[t].push(emp);
    }
    const groupOrder = ['평일', '소장', '주말고정', '주말', '주주'];

    // 헤더 날짜 열
    const dayHeaders = Array.from({length: days}, (_, i) => {
      const d = i + 1;
      const dow = getDow(d);
      const color = dow === 0 ? 'color:#dc3545' : dow === 6 ? 'color:#1971c2' : '';
      return `<th style="min-width:28px;padding:4px 2px;font-size:11px;${color}">${d}</th>`;
    }).join('');

    // 직원 행 생성
    let rowsHtml = '';
    let grandTotal = 0;

    for (const type of groupOrder) {
      const emps = groups[type];
      if (!emps || emps.length === 0) continue;

      // 구분 헤더 행
      rowsHtml += `<tr style="background:#f0fdf4">
        <td colspan="2" style="font-weight:700;padding:6px 8px;font-size:12px">${type}</td>
        ${Array.from({length: days}, () => '<td></td>').join('')}
        <td colspan="5"></td>
      </tr>`;

      let groupTotal = 0;

      for (const emp of emps) {
        const dailyCells = Array.from({length: days}, (_, i) => {
          const d = i + 1;
          const h = emp.daily[d];
          const dow = getDow(d);
          const color = dow === 0 ? 'color:#dc3545' : dow === 6 ? 'color:#1971c2' : '';
          return `<td style="text-align:center;font-size:11px;${color}">${h ? h : ''}</td>`;
        }).join('');

        const totalHours = emp.total_hours || 0;
        groupTotal += totalHours;
        grandTotal += totalHours;

        // 주민번호 표시 (앞 6자리-뒤 7자리 형식)
        let ssnDisplay = '-';
        if (emp.ssn) {
          const s = emp.ssn.replace(/-/g, '');
          ssnDisplay = s.length === 13 ? s.substring(0, 6) + '-' + s.substring(6) : emp.ssn;
        }

        rowsHtml += `<tr>
          <td style="padding:4px 8px;white-space:nowrap;font-size:12px">${emp.name}</td>
          <td style="text-align:right;padding:4px 6px;font-size:11px">${totalHours > 0 ? totalHours : ''}</td>
          ${dailyCells}
          <td style="text-align:right;padding:4px 6px;font-size:11px;white-space:nowrap">${emp.net_pay ? Utils.formatNum(emp.net_pay) : ''}</td>
          <td style="text-align:right;padding:4px 6px;font-size:11px">${emp.net_pay ? Utils.formatNum(Math.round(emp.net_pay * 0.033)) : ''}</td>
          <td style="text-align:right;padding:4px 6px;font-size:11px">${emp.net_pay ? Utils.formatNum(Math.round(emp.net_pay * 0.0033)) : ''}</td>
          <td style="text-align:right;padding:4px 6px;font-size:11px;white-space:nowrap">${emp.net_pay ? Utils.formatNum(Math.round(emp.net_pay * 0.9637)) : ''}</td>
          <td style="font-size:10px;white-space:nowrap">${ssnDisplay}</td>
          <td style="font-size:10px;white-space:nowrap">${emp.bank_name ? emp.bank_name + ' ' + (emp.bank_account || '') : (emp.bank_account || '-')}</td>
        </tr>`;
      }

      // 구분 합계 행
      rowsHtml += `<tr style="background:#e8f5e9;font-weight:700">
        <td style="padding:4px 8px;font-size:12px">${type} 합계</td>
        <td style="text-align:right;font-size:11px">${groupTotal}</td>
        ${Array.from({length: days}, () => '<td></td>').join('')}
        <td colspan="5"></td>
      </tr>`;
    }

    const content = document.getElementById('content');
    content.innerHTML = `
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="tabs" style="margin-bottom:0;flex-wrap:wrap">${tabs.join('')}</div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="Timesheet.downloadExcel()">📥 엑셀 다운로드</button>
        </div>
      </div>

      <div class="card" style="overflow-x:auto;padding:12px">
        <div style="font-size:16px;font-weight:700;text-align:center;margin-bottom:12px">
          ${year}년 ${month}월 비욘더팜 근무표
        </div>
        <table id="timesheet-table" style="border-collapse:collapse;font-size:12px;width:100%">
          <thead>
            <tr style="background:#1b4332;color:#fff">
              <th style="padding:6px 8px;white-space:nowrap;text-align:left">이름</th>
              <th style="padding:6px 4px;white-space:nowrap">합계</th>
              ${dayHeaders}
              <th style="padding:6px 4px;white-space:nowrap">합계금액</th>
              <th style="padding:6px 4px;white-space:nowrap">국세</th>
              <th style="padding:6px 4px;white-space:nowrap">지방세</th>
              <th style="padding:6px 4px;white-space:nowrap">이체금액</th>
              <th style="padding:6px 4px;white-space:nowrap">주민등록번호</th>
              <th style="padding:6px 4px;white-space:nowrap">계좌번호</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr style="background:#1b4332;color:#fff;font-weight:700">
              <td style="padding:6px 8px">전체 합계</td>
              <td style="text-align:right;padding:4px 6px">${grandTotal}</td>
              ${Array.from({length: days}, () => '<td></td>').join('')}
              <td colspan="5"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="card" style="margin-top:0">
        <div class="card-title">📝 ${year}년 ${month}월 메모</div>
        <textarea id="ts-note" style="width:100%;min-height:80px;padding:10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px;resize:vertical">${note}</textarea>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Timesheet.saveNote()">메모 저장</button>
        </div>
      </div>
    `;
  },

  async saveNote() {
    const content = document.getElementById('ts-note')?.value || '';
    try {
      await API.post('/api/timesheet/notes', { year: this.currentYear, month: this.currentMonth, content });
      Utils.showToast('메모가 저장되었습니다.');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  downloadExcel() {
    if (!this.data) return;
    const { year, month, days, employees } = this.data;

    const getDow = (d) => new Date(year, month - 1, d).getDay();

    // 헤더 행
    const header = ['이름', '합계', ...Array.from({length: days}, (_, i) => i + 1), '합계금액', '국세', '지방세', '이체금액', '주민등록번호', '계좌번호'];

    const rows = [
      [`${year}년 ${month}월 비욘더팜 근무표`],
      header,
    ];

    const groupOrder = ['평일', '소장', '주말고정', '주말', '주주'];
    const groups = {};
    for (const emp of employees) {
      const t = emp.employee_type || '평일';
      if (!groups[t]) groups[t] = [];
      groups[t].push(emp);
    }

    for (const type of groupOrder) {
      const emps = groups[type];
      if (!emps || emps.length === 0) continue;
      rows.push([type]);
      for (const emp of emps) {
        const dailyVals = Array.from({length: days}, (_, i) => emp.daily[i + 1] || '');
        const netPay = emp.net_pay || 0;
        rows.push([
          emp.name,
          emp.total_hours || '',
          ...dailyVals,
          netPay || '',
          netPay ? Math.round(netPay * 0.033) : '',
          netPay ? Math.round(netPay * 0.0033) : '',
          netPay ? Math.round(netPay * 0.9637) : '',
          emp.ssn || '',
          emp.bank_name ? emp.bank_name + ' ' + (emp.bank_account || '') : (emp.bank_account || ''),
        ]);
      }
    }

    // SheetJS로 엑셀 생성
    if (typeof XLSX === 'undefined') {
      Utils.showToast('엑셀 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 6 }, ...Array(days).fill({ wch: 4 }), { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${month}월 근무표`);
    XLSX.writeFile(wb, `${year}년_${month}월_비욘더팜_근무표.xlsx`);
  }
};
