const Salary = {
  data: [],
  employees: [],
  departments: [],

  async render() {
    const content = document.getElementById('content');
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    const now = new Date();
    try {
      if (isAdmin) {
        this.employees = await API.get('/api/employees');
        this.departments = [...new Set(this.employees.filter(e=>e.department).map(e=>e.department))].sort();
      }
      this.data = await API.get(`/api/salary?year=${now.getFullYear()}`);

      content.innerHTML = `
        <div class="card">
          <div class="card-title" style="flex-wrap:wrap;gap:8px">
            💰 급여 관리
            ${isAdmin ? `
              <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <select id="sync-year" style="padding:6px;border:1px solid #dee2e6;border-radius:6px;font-size:13px">
                  ${[now.getFullYear(), now.getFullYear()-1].map(y=>`<option>${y}</option>`).join('')}
                </select>
                <select id="sync-month" style="padding:6px;border:1px solid #dee2e6;border-radius:6px;font-size:13px">
                  ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${i+1}월</option>`).join('')}
                </select>
                <button class="btn btn-primary btn-sm" onclick="Salary.syncFromTimesheet()">📋 근무표에서 불러오기</button>
                <button class="btn btn-secondary btn-sm" onclick="Salary.showForm()">+ 수동 등록</button>
              </div>
            ` : ''}
          </div>

          <!-- 조회 필터 -->
          <div class="filter-bar">
            ${isAdmin ? `
              <select id="sal-dept" onchange="Salary.reload()">
                <option value="">전체 부서</option>
                ${this.departments.map(d=>`<option>${d}</option>`).join('')}
              </select>
              <select id="sal-user" onchange="Salary.reload()">
                <option value="">전체 직원</option>
                ${this.employees.filter(e=>e.status==='active').map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}
              </select>
            ` : ''}
            <select id="sal-year" onchange="Salary.reload()">
              ${[now.getFullYear(), now.getFullYear()-1].map(y=>`<option ${y===now.getFullYear()?'selected':''}>${y}</option>`).join('')}
            </select>
            <select id="sal-month" onchange="Salary.reload()">
              <option value="">전체 월</option>
              ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${i+1}월</option>`).join('')}
            </select>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  ${isAdmin?'<th>직원</th><th>부서</th>':''}
                  <th>연도</th><th>월</th>
                  <th>월급여</th><th>상여금</th><th>공제</th><th>실수령액</th>
                  <th>비고</th>
                  ${isAdmin?'<th>관리</th>':''}
                </tr>
              </thead>
              <tbody id="sal-tbody"></tbody>
              <tfoot id="sal-tfoot"></tfoot>
            </table>
          </div>
        </div>`;
      this.renderTable();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  async reload() {
    const year = Utils.val('sal-year') || new Date().getFullYear();
    const month = document.getElementById('sal-month')?.value || '';
    const userId = document.getElementById('sal-user')?.value || '';
    const dept = document.getElementById('sal-dept')?.value || '';
    let url = `/api/salary?year=${year}`;
    if (month) url += `&month=${month}`;
    if (userId) url += `&user_id=${userId}`;
    if (dept) url += `&department=${encodeURIComponent(dept)}`;
    this.data = await API.get(url);
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('sal-tbody');
    const tfoot = document.getElementById('sal-tfoot');
    if (!tbody) return;
    const isAdmin = ['admin','superadmin'].includes(App.user.role);

    if (this.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">급여 내역이 없습니다</div></td></tr>`;
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    tbody.innerHTML = this.data.map(s => `
      <tr>
        ${isAdmin ? `<td><strong>${s.name}</strong></td><td>${s.department||'-'}</td>` : ''}
        <td>${s.year}</td><td>${s.month}월</td>
        <td style="text-align:right">${Utils.formatNum(s.base_salary)}원</td>
        <td style="text-align:right">${Utils.formatNum(s.bonus)}원</td>
        <td style="text-align:right;color:#dc3545">-${Utils.formatNum(s.deduction)}원</td>
        <td style="text-align:right;font-weight:600">${Utils.formatNum(s.net_pay)}원</td>
        <td>${s.note || '-'}</td>
        ${isAdmin ? `<td>
          <button class="btn btn-secondary btn-sm" onclick="Salary.showForm(${s.id})">수정</button>
          <button class="btn btn-danger btn-sm" onclick="Salary.delete(${s.id})">삭제</button>
        </td>` : ''}
      </tr>`).join('');

    // 합계 행
    const totals = this.data.reduce((acc, s) => {
      acc.base += s.base_salary||0;
      acc.bonus += s.bonus||0;
      acc.deduction += s.deduction||0;
      acc.net += s.net_pay||0;
      return acc;
    }, { base:0, bonus:0, deduction:0, net:0 });

    if (tfoot) {
      tfoot.innerHTML = `<tr style="background:#f0fdf4;font-weight:700">
        ${isAdmin ? '<td colspan="2">합계</td>' : ''}
        <td colspan="2"></td>
        <td style="text-align:right">${Utils.formatNum(totals.base)}원</td>
        <td style="text-align:right">${Utils.formatNum(totals.bonus)}원</td>
        <td style="text-align:right;color:#dc3545">-${Utils.formatNum(totals.deduction)}원</td>
        <td style="text-align:right">${Utils.formatNum(totals.net)}원</td>
        <td colspan="${isAdmin?2:1}"></td>
      </tr>`;
    }
  },

  async syncFromTimesheet() {
    const year = parseInt(document.getElementById('sync-year')?.value) || new Date().getFullYear();
    const month = parseInt(document.getElementById('sync-month')?.value) || new Date().getMonth()+1;
    if (!confirm(`${year}년 ${month}월 급여를 근무표에서 불러오시겠습니까?\n기존 데이터가 있으면 덮어씁니다.`)) return;
    try {
      const res = await API.post('/api/salary/sync-from-timesheet', { year, month });
      Utils.showToast(`${res.synced}명 급여가 연동되었습니다.`);
      // 해당 월로 필터 변경
      Utils.setVal('sal-year', String(year));
      const monthEl = document.getElementById('sal-month');
      if (monthEl) monthEl.value = String(month);
      Salary.reload();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  showForm(id) {
    const rec = id ? this.data.find(s => s.id === id) : null;
    const emps = this.employees.filter(e => e.status === 'active');
    const now = new Date();
    Utils.modal(
      rec ? '급여 수정' : '급여 등록',
      `<div class="form-grid">
        ${!rec ? `<div class="form-group"><label>직원 *</label>
          <select id="f-uid">${emps.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select>
        </div>` : ''}
        <div class="form-group"><label>연도</label><input type="number" id="f-year" value="${rec?.year || now.getFullYear()}"></div>
        <div class="form-group"><label>월</label>
          <select id="f-month">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(rec?.month||now.getMonth()+1)===i+1?'selected':''}>${i+1}월</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>월급여 (원)</label><input type="number" id="f-base" value="${rec?.base_salary || 0}"></div>
        <div class="form-group"><label>상여금 (원)</label><input type="number" id="f-bonus" value="${rec?.bonus || 0}"></div>
        <div class="form-group"><label>공제액 (원)</label><input type="number" id="f-deduction" value="${rec?.deduction || 0}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>비고</label><input id="f-note" value="${rec?.note || ''}"></div>
      </div>`,
      async () => {
        const base = parseInt(Utils.val('f-base'))||0;
        const bonus = parseInt(Utils.val('f-bonus'))||0;
        const deduction = parseInt(Utils.val('f-deduction'))||0;
        const body = { year: parseInt(Utils.val('f-year')), month: parseInt(Utils.val('f-month')), base_salary: base, bonus, deduction, note: Utils.val('f-note') };
        if (!rec) body.user_id = Utils.val('f-uid');
        try {
          if (rec) await API.put(`/api/salary/${rec.id}`, body);
          else await API.post('/api/salary', body);
          Utils.showToast('저장되었습니다.'); Utils.closeModal(); Salary.reload();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  async delete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await API.delete(`/api/salary/${id}`); Utils.showToast('삭제되었습니다.'); Salary.reload(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
