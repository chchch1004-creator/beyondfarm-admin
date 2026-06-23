const Employees = {
  data: [],
  async render() {
    const content = document.getElementById('content');
    const user = App.user;
    try {
      this.data = await API.get('/api/employees');
      const isAdmin = user.role === 'admin';

      content.innerHTML = `
        <div class="card">
          <div class="card-title">
            👥 직원 관리
            ${isAdmin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Employees.showForm()">+ 직원 등록</button>' : ''}
          </div>
          <div class="filter-bar">
            <select id="emp-status-filter" onchange="Employees.filter()">
              <option value="">전체</option>
              <option value="active">재직중</option>
              <option value="inactive">퇴직</option>
            </select>
            <input id="emp-search" placeholder="이름 검색" oninput="Employees.filter()">
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>이름</th><th>부서</th><th>직급</th><th>아이디</th>
                  <th>연락처</th><th>입사일</th><th>상태</th>
                  ${isAdmin ? '<th>관리</th>' : ''}
                </tr>
              </thead>
              <tbody id="emp-tbody"></tbody>
            </table>
          </div>
        </div>`;
      this.filter();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  filter() {
    const status = document.getElementById('emp-status-filter')?.value || '';
    const search = document.getElementById('emp-search')?.value?.toLowerCase() || '';
    const isAdmin = App.user.role === 'admin';
    const rows = this.data.filter(e =>
      (!status || e.status === status) &&
      (!search || e.name.toLowerCase().includes(search))
    );
    const tbody = document.getElementById('emp-tbody');
    if (!tbody) return;
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">직원이 없습니다</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(e => `
      <tr>
        <td><strong>${e.name}</strong></td>
        <td>${e.department || '-'}</td>
        <td>${e.position || '-'}</td>
        <td>${e.username}</td>
        <td>${e.phone || '-'}</td>
        <td>${Utils.formatDate(e.hire_date)}</td>
        <td>${Utils.statusBadge(e.status)}</td>
        ${isAdmin ? `<td>
          <button class="btn btn-secondary btn-sm" onclick="Employees.showForm(${e.id})">수정</button>
          ${e.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="Employees.retire(${e.id},'${e.name}')">퇴직</button>` : ''}
        </td>` : ''}
      </tr>`).join('');
  },

  showForm(id) {
    const emp = id ? this.data.find(e => e.id === id) : null;
    const isAdmin = App.user.role === 'admin';
    Utils.modal(
      emp ? '직원 정보 수정' : '직원 등록',
      `<div class="form-grid">
        <div class="form-group"><label>이름 *</label><input id="f-name" value="${emp?.name || ''}"></div>
        <div class="form-group"><label>아이디 *</label><input id="f-username" value="${emp?.username || ''}" ${emp ? 'disabled' : ''}></div>
        <div class="form-group"><label>비밀번호 ${emp ? '(변경시 입력)' : '*'}</label><input type="password" id="f-password"></div>
        <div class="form-group"><label>부서</label><input id="f-dept" value="${emp?.department || ''}"></div>
        <div class="form-group"><label>직급</label><input id="f-pos" value="${emp?.position || ''}"></div>
        <div class="form-group"><label>연락처</label><input id="f-phone" value="${emp?.phone || ''}"></div>
        <div class="form-group"><label>이메일</label><input id="f-email" value="${emp?.email || ''}"></div>
        <div class="form-group"><label>입사일</label><input type="date" id="f-hire" value="${emp?.hire_date || ''}"></div>
        ${isAdmin ? `<div class="form-group"><label>권한</label>
          <select id="f-role">
            <option value="employee" ${emp?.role === 'employee' ? 'selected' : ''}>직원</option>
            <option value="admin" ${emp?.role === 'admin' ? 'selected' : ''}>관리자</option>
            <option value="superadmin" ${emp?.role === 'superadmin' ? 'selected' : ''}>총괄관리자</option>
          </select>
        </div>
        <div class="form-group"><label>직원 구분</label>
          <select id="f-emptype">
            ${['평일','소장','주말고정','주말','주주'].map(t => `<option value="${t}" ${emp?.employee_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>주민등록번호</label><input id="f-ssn" placeholder="숫자만 입력" value="${emp?.ssn || ''}"></div>
        <div class="form-group"><label>은행명</label><input id="f-bank" placeholder="예: 농협" value="${emp?.bank_name || ''}"></div>
        <div class="form-group"><label>계좌번호</label><input id="f-account" placeholder="계좌번호 입력" value="${emp?.bank_account || ''}"></div>` : ''}
      </div>`,
      async () => {
        const body = {
          name: Utils.val('f-name'), department: Utils.val('f-dept'), position: Utils.val('f-pos'),
          phone: Utils.val('f-phone'), email: Utils.val('f-email'), hire_date: Utils.val('f-hire'),
        };
        if (!emp) body.username = Utils.val('f-username');
        const pw = Utils.val('f-password');
        if (pw) body.password = pw;
        if (isAdmin) {
          body.role = Utils.val('f-role');
          body.employee_type = Utils.val('f-emptype');
          body.ssn = Utils.val('f-ssn');
          body.bank_name = Utils.val('f-bank');
          body.bank_account = Utils.val('f-account');
        }
        if (!body.name) return Utils.showToast('이름을 입력하세요', 'error');
        try {
          if (emp) await API.put(`/api/employees/${id}`, body);
          else await API.post('/api/employees', body);
          Utils.showToast(emp ? '수정되었습니다.' : '등록되었습니다.');
          Utils.closeModal();
          Employees.render();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  async retire(id, name) {
    if (!confirm(`${name} 직원을 퇴직 처리하시겠습니까?`)) return;
    try {
      await API.delete(`/api/employees/${id}`);
      Utils.showToast('퇴직 처리되었습니다.');
      Employees.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
