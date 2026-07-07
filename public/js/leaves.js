const Leaves = {
  data: [],
  employees: [],
  async render() {
    const content = document.getElementById('content');
    const isAdmin = App.user.role === 'superadmin';
    const year = new Date().getFullYear();
    try {
      if (isAdmin) this.employees = await API.get('/api/employees');
      this.data = await API.get(`/api/leaves?year=${year}`);
      const summary = await API.get(`/api/leaves/summary?year=${year}`);

      content.innerHTML = `
        <div class="card">
          <div class="card-title">
            📅 휴가 관리
            <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Leaves.showForm()">+ 휴가 신청</button>
          </div>
          <div class="tabs">
            <button class="tab active" onclick="Leaves.switchTab(this,'list')">신청 목록</button>
            <button class="tab" onclick="Leaves.switchTab(this,'summary')">사용 현황</button>
          </div>
          <div id="leaves-list">
            <div class="filter-bar">
              ${isAdmin ? `<select id="leave-user" onchange="Leaves.reload()">
                <option value="">전체</option>
                ${this.employees.filter(e=>e.status==='active').map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}
              </select>` : ''}
              <select id="leave-status" onchange="Leaves.reload()">
                <option value="">전체 상태</option>
                <option value="pending">대기중</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
              </select>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr>${isAdmin?'<th>직원</th>':''}<th>유형</th><th>시작일</th><th>종료일</th><th>일수</th><th>사유</th><th>상태</th>${isAdmin?'<th>승인/반려</th>':''}<th>취소</th></tr></thead>
                <tbody id="leaves-tbody"></tbody>
              </table>
            </div>
          </div>
          <div id="leaves-summary" style="display:none">
            <div class="table-wrap">
              <table>
                <thead><tr><th>직원</th><th>부서</th><th>사용 일수</th><th>잔여 (기준 15일)</th></tr></thead>
                <tbody>${summary.map(s => `
                  <tr>
                    <td>${s.name}</td><td>${s.department||'-'}</td>
                    <td>${s.used_days}일</td>
                    <td>${Math.max(0, 15 - s.used_days)}일</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      this.renderTable();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  switchTab(btn, tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('leaves-list').style.display = tab === 'list' ? '' : 'none';
    document.getElementById('leaves-summary').style.display = tab === 'summary' ? '' : 'none';
  },

  async reload() {
    const userId = document.getElementById('leave-user')?.value || '';
    const status = document.getElementById('leave-status')?.value || '';
    const year = new Date().getFullYear();
    let url = `/api/leaves?year=${year}`;
    if (userId) url += `&user_id=${userId}`;
    this.data = await API.get(url);
    this.renderTable(status);
  },

  renderTable(statusFilter) {
    const tbody = document.getElementById('leaves-tbody');
    if (!tbody) return;
    const isAdmin = App.user.role === 'superadmin';
    let rows = this.data;
    if (statusFilter) rows = rows.filter(l => l.status === statusFilter);
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">내역이 없습니다</div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(l => `
      <tr>
        ${isAdmin ? `<td>${l.user_name}</td>` : ''}
        <td>${Utils.leaveTypeName(l.type)}</td>
        <td>${l.start_date}</td><td>${l.end_date}</td>
        <td>${l.days}일</td>
        <td>${l.reason || '-'}</td>
        <td>${Utils.statusBadge(l.status)}</td>
        ${isAdmin ? `<td>
          ${l.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="Leaves.approve(${l.id},'approved')">승인</button>
            <button class="btn btn-danger btn-sm" onclick="Leaves.approve(${l.id},'rejected')">반려</button>` : '-'}
        </td>` : ''}
        <td>${l.status === 'pending' ? `<button class="btn btn-secondary btn-sm" onclick="Leaves.cancel(${l.id})">취소</button>` : '-'}</td>
      </tr>`).join('');
  },

  showForm() {
    const isAdmin = App.user.role === 'superadmin';
    const emps = this.employees.filter(e => e.status === 'active');
    Utils.modal('휴가 신청',
      `<div class="form-grid">
        ${isAdmin ? `<div class="form-group"><label>직원</label>
          <select id="f-uid">${emps.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select>
        </div>` : ''}
        <div class="form-group"><label>유형</label>
          <select id="f-type">
            <option value="annual">연차</option><option value="half">반차</option>
            <option value="sick">병가</option><option value="official">공가</option><option value="other">기타</option>
          </select>
        </div>
        <div class="form-group"><label>시작일</label><input type="date" id="f-start" value="${Utils.today()}"></div>
        <div class="form-group"><label>종료일</label><input type="date" id="f-end" value="${Utils.today()}"></div>
        <div class="form-group"><label>일수</label><input type="number" id="f-days" value="1" min="0.5" step="0.5"></div>
        <div class="form-group" style="grid-column:1/-1"><label>사유</label><textarea id="f-reason"></textarea></div>
      </div>`,
      async () => {
        const body = { type: Utils.val('f-type'), start_date: Utils.val('f-start'), end_date: Utils.val('f-end'), days: parseFloat(Utils.val('f-days')), reason: Utils.val('f-reason') };
        if (isAdmin && Utils.val('f-uid')) {
          // 관리자가 다른 직원 대신 신청 시: 직접 API 호출 필요 → 임시로 본인 신청
        }
        try {
          await API.post('/api/leaves', body);
          Utils.showToast('휴가 신청이 완료되었습니다.'); Utils.closeModal(); Leaves.render();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  async approve(id, status) {
    try {
      await API.put(`/api/leaves/${id}/status`, { status });
      Utils.showToast(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.');
      Leaves.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async cancel(id) {
    if (!confirm('휴가 신청을 취소하시겠습니까?')) return;
    try { await API.delete(`/api/leaves/${id}`); Utils.showToast('취소되었습니다.'); Leaves.render(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
