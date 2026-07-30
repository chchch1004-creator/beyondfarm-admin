const Timesheet = {
  data: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  hiddenIds: new Set(),
  editMode: false,
  selectedIds: new Set(),
  isDragging: false,

  HOLIDAYS: new Set([
    '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
    '2025-03-01','2025-03-03','2025-05-05','2025-05-06',
    '2025-06-06','2025-08-15','2025-10-03','2025-10-05',
    '2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-12-25',
    '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
    '2026-03-01','2026-03-02','2026-05-05','2026-05-24','2026-05-25',
    '2026-06-06','2026-07-17','2026-08-15','2026-08-17',
    '2026-09-24','2026-09-25','2026-09-26','2026-09-28',
    '2026-10-03','2026-10-05','2026-10-09','2026-12-25',
    '2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-02-09',
    '2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-07-17',
    '2027-08-15','2027-08-16','2027-10-03','2027-10-04','2027-10-09',
    '2027-10-11','2027-10-14','2027-10-15','2027-10-16','2027-12-25','2027-12-27',
  ]),

  shRate(year, month, day) {
    const dow = new Date(year, month - 1, day).getDay();
    const pad = n => String(n).padStart(2,'0');
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const isHol = this.HOLIDAYS.has(dateStr);
    if (isHol || dow === 0 || dow === 6) return 30;
    if (dow === 5) return 25;
    return 20;
  },

  shExtraRate(year, month, day) {
    const dow = new Date(year, month - 1, day).getDay();
    const pad = n => String(n).padStart(2,'0');
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const isHol = this.HOLIDAYS.has(dateStr);
    if (isHol || dow === 0 || dow === 6) return 20;
    if (dow === 5) return 15;
    return 10;
  },

  getStorageKey() { return `ts-hidden-${this.currentYear}-${this.currentMonth}`; },
  loadHidden() { try { this.hiddenIds = new Set(JSON.parse(localStorage.getItem(this.getStorageKey()) || '[]')); } catch { this.hiddenIds = new Set(); } },
  saveHidden() { localStorage.setItem(this.getStorageKey(), JSON.stringify([...this.hiddenIds])); },

  async render() {
    document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    await this.load(this.currentYear, this.currentMonth);
  },

  async load(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    this.editMode = false;
    this.selectedIds = new Set();
    this.loadHidden();
    try {
      [this.data, this._confirmations, this._confirmHistory] = await Promise.all([
        API.get(`/api/timesheet?year=${year}&month=${month}`),
        API.get(`/api/timesheet/confirmations?year=${year}&month=${month}`).catch(() => null),
        API.get(`/api/timesheet/confirmations/history?year=${year}&month=${month}`).catch(() => []),
      ]);
      // 관리자: 배열, 직원: 단일 객체 or null → 통일
      if (this._confirmations && !Array.isArray(this._confirmations)) {
        this._myConfirmation = this._confirmations;
        this._confirmations = [];
      } else {
        this._myConfirmation = null;
      }
      if (!Array.isArray(this._confirmHistory)) this._confirmHistory = [];
      this.renderPage();
    } catch (e) {
      document.getElementById('content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  SH_FIXED_DAY: 10,
  SH_FIXED: { '조상희': 130, '조상하': 80, '정재호': 80, '소재훈': 200 },

  isShareholder(emp) { return emp.sh_days !== null && emp.sh_days !== undefined; },

  calc(emp) {
    if (this.isShareholder(emp)) {
      const shDays = emp.sh_days || [];
      const shExtraDays = emp.sh_extra_days || [];
      const shTotal = shDays.reduce((s, d) => s + this.shRate(this.currentYear, this.currentMonth, d) * 10000, 0);
      const shExtraTotal = shExtraDays.reduce((s, d) => s + this.shExtraRate(this.currentYear, this.currentMonth, d) * 10000, 0);
      const fixedAmt = (this.SH_FIXED[emp.name] || 0) * 10000;
      const netPay = Math.round(shTotal + shExtraTotal + fixedAmt + (emp.adj || 0) * 10000 + (emp.adj1 || 0) * 10000);
      const tax = Math.round(netPay * 0.03);
      const localTax = Math.round(netPay * 0.003);
      const transfer = netPay - tax - localTax;
      return { totalHours: shDays.length, netPay, tax, localTax, transfer };
    }
    const totalHours = Object.values(emp.daily).reduce((s, d) => s + (d.hours || 0), 0);
    const netPay = Math.round(totalHours * (emp.hourly_rate || 0) + (emp.adj || 0) * 10000 + (emp.adj1 || 0) * 10000);
    const tax = Math.round(netPay * 0.03);
    const localTax = Math.round(netPay * 0.003);
    const transfer = netPay - tax - localTax;
    return { totalHours, netPay, tax, localTax, transfer };
  },

  renderPage() {
    const { year, month, days, employees, note } = this.data;
    const isAdmin = App.user.role === 'superadmin';
    const myName = App.user.name;
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

    // 직원 행 생성 (일반 직원은 본인 행만)
    const visibleEmps = isAdmin ? employees : employees.filter(e => e.name === myName);

    let rowsHtml = '';
    visibleEmps.forEach(emp => {
      const shDaysSet = this.isShareholder(emp) ? new Set(emp.sh_days || []) : null;
      const shExtraDaysSet = this.isShareholder(emp) ? new Set(emp.sh_extra_days || []) : null;
      const dailyCells = Array.from({length: days}, (_, i) => {
        const d = i + 1;
        if (shDaysSet) {
          const inMain = shDaysSet.has(d);
          const inExtra = shExtraDaysSet.has(d);
          const fixedAmt = (d === this.SH_FIXED_DAY) ? (this.SH_FIXED[emp.name] || 0) : 0;
          const workAmt = (inMain ? this.shRate(year, month, d) : 0) + (inExtra ? this.shExtraRate(year, month, d) : 0);
          const total = fixedAmt + workAmt;
          if (total > 0) {
            const bg = fixedAmt > 0 ? '#fff9e6' : '#f0fff4';
            const color = fixedAmt > 0 && workAmt === 0 ? '#c17f00' : '#2d6a4f';
            return `<td style="text-align:center;font-weight:700;color:${color};background:${bg}">${total}</td>`;
          }
          return `<td style="text-align:center"></td>`;
        }
        const dayData = emp.daily[d];
        const h = dayData?.hours;
        const isManual = dayData?.is_manual;
        const manualColor = isManual ? 'color:#dc3545;font-weight:600' : '';
        if (isAdmin) {
          return `<td id="h-${emp.id}-${d}" style="text-align:center;cursor:pointer;${h ? manualColor : ''}"
            onclick="Timesheet.startEdit(this,${emp.id},${d})">${h || ''}</td>`;
        }
        return `<td style="text-align:center;${h ? manualColor : ''}">${h || ''}</td>`;
      }).join('');

      const { totalHours, netPay, tax, localTax, transfer } = this.calc(emp);
      const totalLabel = this.isShareholder(emp) ? '' : (totalHours || '');

      const isHidden = this.hiddenIds.has(emp.id);
      const conf = (this._confirmations || []).find(c => c.user_id === emp.id);
      const confBadge = conf
        ? (conf.status === 'confirmed'
            ? `<span style="margin-left:4px;font-size:9px;background:#dcfce7;color:#15803d;border-radius:3px;padding:1px 4px;cursor:default" title="${conf.confirmed_at} 확인">✓확인</span>`
            : (() => { const uid = `disp-${emp.id}`; this._disputeData = this._disputeData || {}; this._disputeData[emp.id] = conf; return `<span id="${uid}" style="margin-left:4px;font-size:9px;background:#fef2f2;color:#dc2626;border-radius:3px;padding:1px 4px;cursor:pointer" onclick="Timesheet.showDisputeDetail(${emp.id})">❗수정요청</span>`; })())
        : '';

      const payCols = `
        <td id="netpay-${emp.id}" style="text-align:right;padding:3px 6px;white-space:nowrap;font-weight:600">${netPay ? Utils.formatNum(netPay) : ''}</td>
        <td id="tax-${emp.id}" style="text-align:right;padding:3px 4px">${netPay ? Utils.formatNum(tax) : ''}</td>
        <td id="ltax-${emp.id}" style="text-align:right;padding:3px 4px">${netPay ? Utils.formatNum(localTax) : ''}</td>
        <td id="transfer-${emp.id}" style="text-align:right;padding:3px 6px;white-space:nowrap;font-weight:600;color:#1b4332">${netPay ? Utils.formatNum(transfer) : ''}</td>`;

      const adminOnlyCols = isAdmin ? (() => {
        let ssnDisplay = '-';
        if (emp.ssn) {
          const s = emp.ssn.replace(/-/g,'');
          ssnDisplay = s.length === 13 ? s.substring(0,6)+'-'+s.substring(6) : emp.ssn;
        }
        return `
          <td id="adj-${emp.id}" style="text-align:center;cursor:pointer;color:#e67700"
            onclick="Timesheet.startEditAdj(this,${emp.id},'adj')">${emp.adj || ''}</td>
          <td id="adj1-${emp.id}" style="text-align:center;cursor:pointer;color:#e67700"
            onclick="Timesheet.startEditAdj(this,${emp.id},'adj1')">${emp.adj1 || ''}</td>
          ${payCols}
          <td style="padding:3px 4px;font-size:10px;white-space:nowrap">${ssnDisplay}</td>
          <td style="padding:3px 4px;font-size:10px;white-space:nowrap">${emp.bank_name ? emp.bank_name+' '+(emp.bank_account||'') : (emp.bank_account||'-')}</td>`;
      })() : payCols;

      rowsHtml += `<tr data-uid="${emp.id}" style="border-bottom:1px solid #dee2e6;${isHidden && isAdmin ?'display:none':''}"
        ${isAdmin ? `onmousedown="Timesheet.onRowMouseDown(event,${emp.id})" onmouseover="Timesheet.onRowMouseOver(event,${emp.id})"` : ''}>
        <td style="padding:3px 8px;font-weight:600;white-space:nowrap">${emp.name}${isAdmin ? confBadge : ''}</td>
        <td id="total-${emp.id}" style="text-align:center;font-weight:600">${totalLabel}</td>
        ${dailyCells}
        ${adminOnlyCols}
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

    const payHeaderCols = `
              <th style="min-width:70px">합계금액</th>
              <th style="min-width:52px">국세</th>
              <th style="min-width:52px">지방세</th>
              <th style="min-width:70px">이체금액</th>`;

    const adminHeaderCols = isAdmin ? `
              <th style="min-width:34px;background:#856404;color:#fff">상여</th>
              <th style="min-width:34px;background:#856404;color:#fff">조정</th>
              ${payHeaderCols}
              <th style="min-width:108px">주민등록번호</th>
              <th style="min-width:130px">계좌번호</th>` : payHeaderCols;

    const adminFooterCols = isAdmin ? `
              ${Array.from({length: 2}, () => '<td></td>').join('')}
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.netPay) : ''}</td>
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.tax) : ''}</td>
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.localTax) : ''}</td>
              <td>${grandTotals.netPay ? Utils.formatNum(grandTotals.transfer) : ''}</td>
              <td colspan="2"></td>` : `
              <td></td><td></td><td></td><td></td>`;

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
        ${isAdmin ? `<div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button id="ts-edit-btn" class="btn btn-secondary btn-sm" onclick="Timesheet.toggleEditMode()">✏️ 행 숨김 편집</button>
          <div id="ts-edit-tools" style="display:none;gap:6px">
            <button class="btn btn-danger btn-sm" onclick="Timesheet.hideSelected()">숨기기</button>
            <button class="btn btn-success btn-sm" onclick="Timesheet.showAll()">전체 표시</button>
            <span id="ts-sel-count" style="font-size:12px;color:#6c757d"></span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Timesheet.downloadExcel()">📥 엑셀 다운로드</button>
        </div>` : ''}
      </div>

      <div class="card" style="padding:10px;overflow-x:auto">
        <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:8px">${year}년 ${month}월 비욘더팜 근무표</div>
        <table id="ts-table">
          <thead>
            <tr>
              <th style="min-width:72px;text-align:left;padding-left:8px">이름</th>
              <th style="min-width:32px">합계</th>
              ${dayHeaders}
              ${adminHeaderCols}
            </tr>
          </thead>
          <tbody id="ts-tbody">${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td style="text-align:left;padding-left:8px">${isAdmin ? '전체 합계' : myName}</td>
              <td style="text-align:center">${isAdmin ? (grandTotals.totalHours || '') : ''}</td>
              ${Array.from({length: days}, () => '<td></td>').join('')}
              ${adminFooterCols}
            </tr>
          </tfoot>
        </table>
      </div>

      ${isAdmin ? `<div class="card" style="margin-top:0">
        <div class="card-title">📝 ${year}년 ${month}월 메모</div>
        <textarea id="ts-note" style="width:100%;min-height:72px;padding:10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px;resize:vertical">${note}</textarea>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Timesheet.saveNote()">메모 저장</button>
        </div>
      </div>` : `
      <div class="card" style="margin-top:12px" id="ts-confirm-card">
        ${this._renderConfirmCard(year, month)}
      </div>`}
    `;
  },

  // 관리자: 수정요청 상세 + 답변 입력
  async showDisputeDetail(empId) {
    const conf = (this._disputeData || {})[empId];
    if (!conf) return;
    const year = conf.year || this.currentYear;
    const month = conf.month || this.currentMonth;
    let history = [];
    try { history = await API.get(`/api/timesheet/confirmations/history?year=${year}&month=${month}&user_id=${empId}`); } catch {}
    const histHtml = history.length ? `
      <details style="margin-top:14px;margin-bottom:4px" open>
        <summary style="font-size:12px;font-weight:600;color:#64748b;cursor:pointer;user-select:none">🕓 변경 이력 (${history.length}건)</summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px">
          ${history.map(h => `
            <div style="display:flex;gap:8px;align-items:flex-start;font-size:11px;border-bottom:1px solid #f1f5f9;padding-bottom:4px">
              <span style="color:#94a3b8;white-space:nowrap;flex-shrink:0">${h.created_at}</span>
              <span style="font-weight:600;white-space:nowrap;flex-shrink:0">${h.action}</span>
              ${h.comment ? `<span style="color:#374151;word-break:break-all">${h.comment}</span>` : ''}
            </div>`).join('')}
        </div>
      </details>` : '';
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:94vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <div style="font-size:15px;font-weight:700;color:#dc2626;margin-bottom:6px">❗ 수정 요청 내용</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:10px">${conf.name} · ${conf.confirmed_at} 제출</div>
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 14px;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;margin-bottom:14px">${conf.comment || '(코멘트 없음)'}</div>
        ${conf.admin_comment ? `
        <div style="font-size:12px;font-weight:600;color:#1e40af;margin-bottom:6px">📋 이전 답변 <span style="font-weight:400;color:#64748b">(${conf.admin_replied_at})</span></div>
        <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;font-size:13px;color:#374151;white-space:pre-wrap;margin-bottom:14px">${conf.admin_comment}</div>` : ''}
        ${histHtml}
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;margin-top:10px">답변 작성</div>
        <textarea id="admin-reply-text" rows="4"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;resize:vertical"
          placeholder="수정 처리 결과나 안내 내용을 입력하세요.">${conf.admin_comment || ''}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="this.closest('div[style*=fixed]').remove()"
            style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;font-size:13px;cursor:pointer">닫기</button>
          <button onclick="Timesheet.sendAdminReply(${conf.user_id},${year},${month},document.getElementById('admin-reply-text').value,this)"
            style="flex:2;padding:9px;border:none;border-radius:7px;background:#1e40af;color:#fff;font-size:13px;font-weight:700;cursor:pointer">답변 전송</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  async sendAdminReply(userId, year, month, comment, btn) {
    if (!comment.trim()) { Utils.showToast('답변 내용을 입력하세요.', 'error'); return; }
    btn.disabled = true; btn.textContent = '전송 중...';
    try {
      await API.post('/api/timesheet/confirmations/reply', { user_id: userId, year, month, admin_comment: comment.trim() });
      // 로컬 캐시 업데이트
      const conf = (this._disputeData || {})[userId];
      if (conf) { conf.admin_comment = comment.trim(); conf.admin_replied_at = '방금'; }
      Utils.showToast('답변을 전송했습니다.');
      btn.closest('div[style*=fixed]').remove();
    } catch (e) { Utils.showToast('전송 실패: ' + e.message, 'error'); btn.disabled = false; btn.textContent = '답변 전송'; }
  },

  // 직원: 급여 확인 카드
  _renderConfirmCard(year, month) {
    const c = this._myConfirmation;
    const histHtml = this._confirmHistory?.length ? `
      <details style="margin-top:14px">
        <summary style="font-size:12px;font-weight:600;color:#64748b;cursor:pointer;user-select:none">🕓 변경 이력 (${this._confirmHistory.length}건)</summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
          ${this._confirmHistory.map(h => `
            <div style="display:flex;gap:10px;align-items:flex-start;font-size:12px">
              <span style="color:#94a3b8;white-space:nowrap;flex-shrink:0">${h.created_at}</span>
              <span style="font-weight:600;white-space:nowrap;flex-shrink:0">${h.action}</span>
              ${h.comment ? `<span style="color:#374151;word-break:break-all">${h.comment}</span>` : ''}
            </div>`).join('')}
        </div>
      </details>` : '';

    const actionBtns = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button onclick="Timesheet.submitConfirmation('confirmed')"
          style="padding:8px 20px;background:#15803d;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
          ✅ 확인했습니다
        </button>
        <button onclick="Timesheet._openDisputeModal()"
          style="padding:8px 20px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">
          ❗ 수정 요청
        </button>
      </div>`;

    if (c) {
      const isConfirmed = c.status === 'confirmed';
      const statusColor = isConfirmed ? '#15803d' : '#dc2626';
      const statusBg    = isConfirmed ? '#dcfce7' : '#fef2f2';
      const statusText  = isConfirmed ? '✅ 급여 확인 완료' : '❗ 수정 요청됨';
      const adminReplyHtml = c.admin_comment ? `
        <div style="margin-top:12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;font-weight:700;color:#1e40af;margin-bottom:4px">📋 관리자 답변 ${c.admin_replied_at ? `<span style="font-weight:400;color:#64748b">(${c.admin_replied_at})</span>` : ''}</div>
          <div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.6">${c.admin_comment}</div>
        </div>` : '';
      return `
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="padding:6px 14px;background:${statusBg};color:${statusColor};border-radius:8px;font-weight:700;font-size:14px">${statusText}</span>
            <span style="font-size:12px;color:#64748b">${c.confirmed_at} 제출</span>
          </div>
          ${c.comment ? `<div style="margin-top:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:13px;color:#374151;white-space:pre-wrap">${c.comment}</div>` : ''}
          ${adminReplyHtml}
          ${actionBtns}
          ${histHtml}
        </div>`;
    }
    return `
      <div class="card-title" style="margin-bottom:12px">💰 ${year}년 ${month}월 급여 확인</div>
      <p style="font-size:13px;color:#374151;margin-bottom:14px">위 근무표와 급여 내역을 확인하신 후 아래 버튼을 눌러주세요.</p>
      ${actionBtns}
      ${histHtml}`;
  },

  // 재제출 / 수정: 기존 코멘트 pre-fill
  _openDisputeModal() {
    const existing = this._myConfirmation?.comment || '';
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:360px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <div style="font-size:15px;font-weight:700;color:#dc2626;margin-bottom:10px">❗ 수정 요청</div>
        <p style="font-size:13px;color:#374151;margin-bottom:10px">수정이 필요한 내용을 입력해주세요.</p>
        <textarea id="dispute-comment" rows="5"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;resize:vertical"
          placeholder="예: 7월 15일 근무시간이 8시간인데 6시간으로 기록되어 있습니다.">${existing}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="this.closest('div[style*=fixed]').remove()"
            style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;font-size:13px;cursor:pointer">취소</button>
          <button onclick="Timesheet.submitConfirmation('disputed', document.getElementById('dispute-comment').value); this.closest('div[style*=fixed]').remove()"
            style="flex:2;padding:9px;border:none;border-radius:7px;background:#dc2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer">수정 요청 보내기</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  async submitConfirmation(status, comment = '') {
    try {
      await API.post('/api/timesheet/confirmations', {
        year: this.currentYear, month: this.currentMonth, status, comment,
      });
      const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const pad = n => String(n).padStart(2,'0');
      const prevAdminComment = this._myConfirmation?.admin_comment || '';
      const prevAdminRepliedAt = this._myConfirmation?.admin_replied_at || '';
      this._myConfirmation = {
        status, comment,
        confirmed_at: `${kst.getFullYear()}-${pad(kst.getMonth()+1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}`,
        admin_comment: prevAdminComment,
        admin_replied_at: prevAdminRepliedAt,
      };
      const card = document.getElementById('ts-confirm-card');
      if (card) card.innerHTML = this._renderConfirmCard(this.currentYear, this.currentMonth);
      Utils.showToast(status === 'confirmed' ? '급여를 확인했습니다.' : '수정 요청을 보냈습니다.');
    } catch (e) { Utils.showToast('저장 실패: ' + e.message, 'error'); }
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
    cell.innerHTML = h || '';
    cell.style.color = h && isManual ? '#dc3545' : '';
    cell.style.fontWeight = isManual ? '600' : '';
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
    const totalLabel = this.isShareholder(emp) ? '' : (totalHours || '');
    set(`total-${userId}`, totalLabel);
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

  toggleEditMode() {
    this.editMode = !this.editMode;
    this.selectedIds = new Set();
    const btn = document.getElementById('ts-edit-btn');
    const tools = document.getElementById('ts-edit-tools');
    if (btn) btn.style.background = this.editMode ? '#dc3545' : '';
    if (btn) btn.style.color = this.editMode ? '#fff' : '';
    if (tools) tools.style.display = this.editMode ? 'flex' : 'none';
    // 숨긴 행 반투명 표시로 전환 (편집 모드에서는 보이게)
    document.querySelectorAll('#ts-tbody tr').forEach(tr => {
      const uid = parseInt(tr.dataset.uid);
      if (this.hiddenIds.has(uid)) tr.style.display = this.editMode ? '' : 'none';
      if (this.editMode && this.hiddenIds.has(uid)) tr.style.opacity = '0.35';
      else tr.style.opacity = '';
      tr.style.cursor = this.editMode ? 'pointer' : '';
    });
  },

  onRowMouseDown(e, uid) {
    if (!this.editMode) return;
    // 셀 편집 클릭 방지
    if (e.target.tagName === 'INPUT') return;
    this.isDragging = true;
    this.toggleRowSelect(uid);
    document.addEventListener('mouseup', () => { this.isDragging = false; }, { once: true });
  },

  onRowMouseOver(e, uid) {
    if (!this.editMode || !this.isDragging) return;
    this.toggleRowSelect(uid);
  },

  toggleRowSelect(uid) {
    if (this.selectedIds.has(uid)) this.selectedIds.delete(uid);
    else this.selectedIds.add(uid);
    const tr = document.querySelector(`#ts-tbody tr[data-uid="${uid}"]`);
    if (tr) tr.style.background = this.selectedIds.has(uid) ? '#fff3cd' : '';
    const cnt = document.getElementById('ts-sel-count');
    if (cnt) cnt.textContent = this.selectedIds.size > 0 ? `${this.selectedIds.size}행 선택됨` : '';
  },

  hideSelected() {
    this.selectedIds.forEach(uid => this.hiddenIds.add(uid));
    this.saveHidden();
    this.selectedIds = new Set();
    this.toggleEditMode(); // 편집모드 종료
    this.renderPage();
  },

  showAll() {
    this.hiddenIds = new Set();
    this.saveHidden();
    this.selectedIds = new Set();
    this.toggleEditMode();
    this.renderPage();
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
