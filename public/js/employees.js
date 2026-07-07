const Employees = {
  data: [],
  sortKey: 'name',
  sortDir: 1,

  calcDday(dateStr, type) {
    if (!dateStr) return { text: '-', style: '' };
    const today = new Date(); today.setHours(0,0,0,0);
    const [, mm, dd] = dateStr.split('-');

    if (type === 'hire') {
      // 입사일 D+경과일
      const hire = new Date(dateStr);
      const elapsed = Math.floor((today - hire) / 86400000);
      // 올해 기념일까지 남은 일수 (월/일 기준)
      let anniv = new Date(today.getFullYear(), parseInt(mm)-1, parseInt(dd));
      if (anniv < today) anniv = new Date(today.getFullYear()+1, parseInt(mm)-1, parseInt(dd));
      const daysLeft = Math.floor((anniv - today) / 86400000);
      let style = '';
      let text = `D+${elapsed}`;
      if (daysLeft === 0) { text = `🎂 D+${elapsed}`; style = 'color:#dc3545;font-weight:700'; }
      else if (daysLeft <= 7) style = 'color:#dc3545';
      return { text, style };
    }

    if (type === 'birth') {
      let next = new Date(today.getFullYear(), parseInt(mm)-1, parseInt(dd));
      if (next < today) next = new Date(today.getFullYear()+1, parseInt(mm)-1, parseInt(dd));
      const daysLeft = Math.floor((next - today) / 86400000);
      let style = '';
      let text = `D-${daysLeft}`;
      if (daysLeft === 0) { text = '🎂 D-0'; style = 'color:#dc3545;font-weight:700'; }
      else if (daysLeft <= 7) style = 'color:#dc3545';
      return { text, style };
    }
    return { text: '-', style: '' };
  },

  async render() {
    const content = document.getElementById('content');
    const isAdmin = App.user.role === 'superadmin';
    try {
      this.data = await API.get('/api/employees');
      const roleLabel = { superadmin:'총괄관리자', admin:'관리자', employee:'직원' };

      content.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:16px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #dee2e6">
            <span style="font-size:15px;font-weight:600">👥 직원 관리</span>
            ${isAdmin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Employees.showForm()">+ 직원 등록</button>' : ''}
          </div>
          <div style="padding:12px 16px;border-bottom:1px solid #dee2e6;display:flex;gap:10px;flex-wrap:wrap">
            <select id="emp-status-filter" onchange="Employees.filter()" style="padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px">
              <option value="">전체</option>
              <option value="active">재직중</option>
              <option value="inactive">퇴직</option>
            </select>
            <input id="emp-search" placeholder="이름 검색" oninput="Employees.filter()" style="padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px">
          </div>
          <div style="overflow-x:auto">
            <table id="emp-table" class="resizable-table" style="border-collapse:collapse;width:100%;min-width:900px;table-layout:fixed">
              <colgroup>
                <col style="width:90px"><col style="width:80px"><col style="width:80px">
                <col style="width:100px"><col style="width:80px"><col style="width:100px">
                <col style="width:80px"><col style="width:90px">
                ${isAdmin ? '<col style="width:80px"><col style="width:120px">' : ''}
              </colgroup>
              <thead>
                <tr style="background:#f8f9fa">
                  ${[['name','이름'],['department','부서'],['position','직급'],['hire_date','입사일'],['hire_dday','입사 D-day'],['birth_date','생일'],['birth_dday','생일 D-day']].map(([k,l])=>`
                    <th class="resizable-th" onclick="Employees.sortBy('${k}')" style="cursor:pointer;user-select:none">
                      ${l} <span id="sort-arr-${k}"></span>
                    </th>`).join('')}
                  ${isAdmin ? '<th class="resizable-th">권한</th>' : ''}
                  ${isAdmin ? '<th class="resizable-th">시급</th>' : ''}
                  ${isAdmin ? '<th class="resizable-th">관리</th>' : ''}
                </tr>
              </thead>
              <tbody id="emp-tbody"></tbody>
            </table>
          </div>
        </div>`;

      this.filter();
      this.initResize();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  sortBy(key) {
    if (this.sortKey === key) this.sortDir *= -1;
    else { this.sortKey = key; this.sortDir = 1; }
    this.filter();
  },

  updateArrows() {
    ['name','department','position','hire_date','hire_dday','birth_date','birth_dday'].forEach(k => {
      const el = document.getElementById(`sort-arr-${k}`);
      if (el) el.textContent = k === this.sortKey ? (this.sortDir === 1 ? ' ▲' : ' ▼') : '';
    });
  },

  filter() {
    const status = document.getElementById('emp-status-filter')?.value || '';
    const search = document.getElementById('emp-search')?.value?.toLowerCase() || '';
    const isAdmin = App.user.role === 'superadmin';
    const roleLabel = { superadmin:'총괄관리자', admin:'관리자', employee:'직원' };
    let rows = this.data.filter(e =>
      (!status || e.status === status) &&
      (!search || e.name.toLowerCase().includes(search))
    );

    // 정렬
    const todayMs = new Date(); todayMs.setHours(0,0,0,0);

    const elapsedDays = (dateStr) => {
      if (!dateStr) return -1;
      // YYYY-MM-DD → 로컬 날짜로 파싱
      const [y,m,d] = dateStr.split('-').map(Number);
      return Math.floor((todayMs - new Date(y, m-1, d)) / 86400000);
    };
    const daysUntilAnniv = (dateStr) => {
      if (!dateStr) return 9999;
      const [,m,d] = dateStr.split('-').map(Number);
      let next = new Date(todayMs.getFullYear(), m-1, d);
      if (next < todayMs) next = new Date(todayMs.getFullYear()+1, m-1, d);
      return Math.floor((next - todayMs) / 86400000);
    };

    rows.sort((a, b) => {
      let av, bv, result;
      if (this.sortKey === 'hire_dday') {
        av = elapsedDays(a.hire_date);
        bv = elapsedDays(b.hire_date);
        // 첫 클릭: 큰 D+(오래 근무) 먼저 → 내림차순
        result = bv - av;
      } else if (this.sortKey === 'birth_dday') {
        av = daysUntilAnniv(a.birth_date);
        bv = daysUntilAnniv(b.birth_date);
        result = av - bv;
      } else {
        av = a[this.sortKey] || '';
        bv = b[this.sortKey] || '';
        result = av < bv ? -1 : av > bv ? 1 : 0;
      }
      return result * this.sortDir;
    });

    this.updateArrows();
    const tbody = document.getElementById('emp-tbody');
    if (!tbody) return;
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#6c757d">직원이 없습니다</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(e => `
      <tr style="border-bottom:1px solid #dee2e6" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
        <td style="padding:8px 10px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${e.name}</td>
        <td style="padding:8px 10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${e.department || '-'}</td>
        <td style="padding:8px 10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${e.position || '-'}</td>
        <td style="padding:8px 10px;font-size:12px">${e.hire_date || '-'}</td>
        ${(() => { const d = this.calcDday(e.hire_date,'hire'); return `<td style="padding:8px 10px;font-size:12px;${d.style||'color:#1971c2'}">${d.text}</td>`; })()}
        <td style="padding:8px 10px;font-size:12px">${e.birth_date || '-'}</td>
        ${(() => { const d = this.calcDday(e.birth_date,'birth'); return `<td style="padding:8px 10px;font-size:12px;${d.style||'color:#198754'}">${d.text}</td>`; })()}
        ${isAdmin ? `<td style="padding:8px 10px"><span class="badge ${e.role==='superadmin'?'badge-danger':e.role==='admin'?'badge-info':'badge-secondary'}">${roleLabel[e.role]||e.role}</span></td>` : ''}
        ${isAdmin ? `<td style="padding:8px 10px;text-align:right;font-size:12px">${e.hourly_rate ? Utils.formatNum(e.hourly_rate)+'원' : '-'}</td>` : ''}
        ${isAdmin ? `<td style="padding:8px 10px">
          <button class="btn btn-secondary btn-sm" onclick="Employees.showForm(${e.id})">수정</button>
          ${e.status === 'active'
            ? `<button class="btn btn-danger btn-sm" onclick="Employees.retire(${e.id},'${e.name}')">퇴직</button>`
            : `<button class="btn btn-success btn-sm" onclick="Employees.restore(${e.id},'${e.name}')">복구</button>`}
        </td>` : ''}
      </tr>`).join('');
  },

  initResize() {
    const ths = document.querySelectorAll('.resizable-th');
    ths.forEach(th => {
      const handle = document.createElement('div');
      handle.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:4px;cursor:col-resize;background:transparent;';
      th.style.position = 'relative';
      th.style.padding = '8px 10px';
      th.style.borderBottom = '2px solid #dee2e6';
      th.style.borderRight = '1px solid #dee2e6';
      th.style.fontSize = '12px';
      th.style.fontWeight = '600';
      th.style.color = '#6c757d';
      th.style.whiteSpace = 'nowrap';
      th.style.overflow = 'hidden';
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.pageX;
        const startW = th.offsetWidth;
        const col = document.querySelectorAll('#emp-table col')[Array.from(ths).indexOf(th)];
        const onMove = (e) => { if (col) col.style.width = Math.max(60, startW + e.pageX - startX) + 'px'; };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      th.appendChild(handle);
    });
  },

  showForm(id) {
    const emp = id ? this.data.find(e => e.id === id) : null;
    const isAdmin = App.user.role === 'superadmin';
    Utils.modal(
      emp ? '직원 정보 수정' : '직원 등록',
      `<div class="form-grid">
        <div class="form-group"><label>이름 *</label><input id="f-name" value="${emp?.name || ''}"></div>
        <div class="form-group"><label>아이디 *</label><input id="f-username" value="${emp?.username || ''}" ${(emp && !isAdmin) ? 'disabled' : ''}></div>
        <div class="form-group"><label>비밀번호 ${emp ? '(변경시 입력)' : '*'}</label><input type="password" id="f-password"></div>
        <div class="form-group"><label>부서</label><input id="f-dept" value="${emp?.department || ''}"></div>
        <div class="form-group"><label>직급</label><input id="f-pos" value="${emp?.position || ''}"></div>
        <div class="form-group"><label>연락처</label><input id="f-phone" value="${emp?.phone || ''}"></div>
        <div class="form-group"><label>이메일</label><input id="f-email" value="${emp?.email || ''}"></div>
        <div class="form-group"><label>입사일</label><input type="date" id="f-hire" value="${emp?.hire_date || ''}"></div>
        <div class="form-group"><label>생일</label><input type="date" id="f-birth" value="${emp?.birth_date || ''}"></div>
        ${isAdmin ? `
        <div class="form-group"><label>권한</label>
          <select id="f-role">
            <option value="employee" ${emp?.role==='employee'?'selected':''}>직원</option>
            <option value="admin" ${emp?.role==='admin'?'selected':''}>관리자</option>
            ${App.user.role === 'superadmin' ? `<option value="superadmin" ${emp?.role==='superadmin'?'selected':''}>총괄관리자</option>` : ''}
          </select>
        </div>
        <div class="form-group"><label>시급 (원)</label><input type="number" id="f-hourly" placeholder="예: 10030" value="${emp?.hourly_rate || ''}"></div>
        <div class="form-group"><label>주민등록번호</label><input id="f-ssn" placeholder="숫자만 입력" value="${emp?.ssn || ''}"></div>
        <div class="form-group"><label>은행명</label><input id="f-bank" placeholder="예: 농협" value="${emp?.bank_name || ''}"></div>
        <div class="form-group"><label>계좌번호</label><input id="f-account" placeholder="계좌번호 입력" value="${emp?.bank_account || ''}"></div>` : ''}
      </div>`,
      async () => {
        const body = {
          name: Utils.val('f-name'), department: Utils.val('f-dept'), position: Utils.val('f-pos'),
          phone: Utils.val('f-phone'), email: Utils.val('f-email'),
          hire_date: Utils.val('f-hire'), birth_date: Utils.val('f-birth'),
        };
        const newUsername = Utils.val('f-username');
        if (!emp) body.username = newUsername;
        else if (isAdmin && newUsername && newUsername !== emp.username) body.username = newUsername;
        const pw = Utils.val('f-password');
        if (pw) body.password = pw;
        if (isAdmin) {
          body.role = Utils.val('f-role');
          body.ssn = Utils.val('f-ssn');
          body.bank_name = Utils.val('f-bank');
          body.bank_account = Utils.val('f-account');
          body.hourly_rate = Utils.val('f-hourly');
        }
        if (!body.name) return Utils.showToast('이름을 입력하세요', 'error');
        try {
          if (emp) await API.put(`/api/employees/${id}`, body);
          else await API.post('/api/employees', body);
          Utils.showToast(emp ? '수정되었습니다.' : '등록되었습니다.');
          Utils.closeModal(); Employees.render();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  async retire(id, name) {
    if (!confirm(`${name} 직원을 퇴직 처리하시겠습니까?`)) return;
    try { await API.delete(`/api/employees/${id}`); Utils.showToast('퇴직 처리되었습니다.'); Employees.render(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async restore(id, name) {
    if (!confirm(`${name} 직원을 재직 상태로 복구하시겠습니까?`)) return;
    try { await API.put(`/api/employees/${id}`, { status: 'active' }); Utils.showToast('복구되었습니다.'); Employees.render(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
