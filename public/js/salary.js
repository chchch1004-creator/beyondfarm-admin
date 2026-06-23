const Salary = {
  data: [],
  employees: [],
  async render() {
    const content = document.getElementById('content');
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    const now = new Date();
    try {
      if (isAdmin) this.employees = await API.get('/api/employees');
      this.data = await API.get(`/api/salary?year=${now.getFullYear()}`);

      content.innerHTML = `
        <div class="card">
          <div class="card-title">
            💰 급여 관리
            ${isAdmin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Salary.showForm()">+ 급여 등록</button>' : ''}
          </div>
          <div class="filter-bar">
            ${isAdmin ? `<select id="sal-user" onchange="Salary.reload()">
              <option value="">전체 직원</option>
              ${this.employees.filter(e=>e.status==='active').map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}
            </select>` : ''}
            <select id="sal-year" onchange="Salary.reload()">
              ${[now.getFullYear(), now.getFullYear()-1].map(y=>`<option ${y===now.getFullYear()?'selected':''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>${isAdmin?'<th>직원</th><th>부서</th>':''}<th>연도</th><th>월</th><th>기본급</th><th>초과수당</th><th>상여금</th><th>공제</th><th>실수령액</th><th>비고</th>${isAdmin?'<th>관리</th>':''}</tr></thead>
              <tbody id="sal-tbody"></tbody>
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
    const userId = document.getElementById('sal-user')?.value || '';
    let url = `/api/salary?year=${year}`;
    if (userId) url += `&user_id=${userId}`;
    this.data = await API.get(url);
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('sal-tbody');
    if (!tbody) return;
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    if (this.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state">급여 내역이 없습니다</div></td></tr>`;
      return;
    }
    tbody.innerHTML = this.data.map(s => `
      <tr>
        ${isAdmin ? `<td><strong>${s.name}</strong></td><td>${s.department||'-'}</td>` : ''}
        <td>${s.year}</td><td>${s.month}월</td>
        <td>${Utils.formatNum(s.base_salary)}원</td>
        <td>${Utils.formatNum(s.overtime_pay)}원</td>
        <td>${Utils.formatNum(s.bonus)}원</td>
        <td style="color:#dc3545">-${Utils.formatNum(s.deduction)}원</td>
        <td><strong>${Utils.formatNum(s.net_pay)}원</strong></td>
        <td>${s.note || '-'}</td>
        ${isAdmin ? `<td>
          <button class="btn btn-secondary btn-sm" onclick="Salary.showForm(${s.id})">수정</button>
          <button class="btn btn-danger btn-sm" onclick="Salary.delete(${s.id})">삭제</button>
        </td>` : ''}
      </tr>`).join('');
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
        <div class="form-group"><label>기본급 (원)</label><input type="number" id="f-base" value="${rec?.base_salary || 0}"></div>
        <div class="form-group"><label>초과수당 (원)</label><input type="number" id="f-overtime" value="${rec?.overtime_pay || 0}"></div>
        <div class="form-group"><label>상여금 (원)</label><input type="number" id="f-bonus" value="${rec?.bonus || 0}"></div>
        <div class="form-group"><label>공제액 (원)</label><input type="number" id="f-deduction" value="${rec?.deduction || 0}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>비고</label><input id="f-note" value="${rec?.note || ''}"></div>
      </div>`,
      async () => {
        const body = {
          year: parseInt(Utils.val('f-year')), month: parseInt(Utils.val('f-month')),
          base_salary: parseInt(Utils.val('f-base')) || 0,
          overtime_pay: parseInt(Utils.val('f-overtime')) || 0,
          bonus: parseInt(Utils.val('f-bonus')) || 0,
          deduction: parseInt(Utils.val('f-deduction')) || 0,
          note: Utils.val('f-note'),
        };
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
