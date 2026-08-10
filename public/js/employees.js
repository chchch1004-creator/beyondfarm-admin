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
      const roleLabel = { superadmin:'총괄관리자', user:'사용자' };

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
          <div id="menu-perm-section" style="display:none"></div>
          <div style="overflow-x:auto">
            <table id="emp-table" class="resizable-table" style="border-collapse:collapse;width:100%;min-width:700px;table-layout:fixed">
              <colgroup>
                <col style="width:70px"><col style="width:65px"><col style="width:65px">
                <col style="width:90px"><col style="width:65px"><col style="width:90px">
                <col style="width:65px"><col style="width:70px">
                ${isAdmin ? '<col style="width:65px"><col style="width:110px">' : ''}
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
        </div>
        ${isAdmin ? `
        <div class="card" style="margin-top:20px;padding:0;overflow:hidden">
          <div style="padding:14px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #dee2e6;background:#f8f9fa">
            <span style="font-size:15px;font-weight:600">🔑 메뉴별 권한관리</span>
            <span style="font-size:12px;color:#6c757d">특정 메뉴를 선택하면 전 직원에게 일괄로 권한을 부여하거나 해제할 수 있습니다</span>
          </div>
          <div id="menu-perm-btn-row" style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid #dee2e6"></div>
          <div id="menu-perm-body" style="padding:16px;display:none"></div>
        </div>` : ''}`;

      this.filter();
      this.initResize();
      if (isAdmin) this._initMenuPermBtns();
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
    const roleLabel = { superadmin:'총괄관리자', user:'사용자' };
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
    const p = 'padding:5px 6px';
    tbody.innerHTML = rows.map(e => `
      <tr style="border-bottom:1px solid #dee2e6;font-size:12px" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
        <td style="${p};font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${e.name}</td>
        <td style="${p};overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${e.department || '-'}</td>
        <td style="${p};overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${e.position || '-'}</td>
        <td style="${p}">${e.hire_date || '-'}</td>
        ${(() => { const d = this.calcDday(e.hire_date,'hire'); return `<td style="${p};${d.style||'color:#1971c2'}">${d.text}</td>`; })()}
        <td style="${p}">${e.birth_date || '-'}</td>
        ${(() => { const d = this.calcDday(e.birth_date,'birth'); return `<td style="${p};${d.style||'color:#198754'}">${d.text}</td>`; })()}
        ${isAdmin ? `<td style="${p}"><span class="badge ${e.role==='superadmin'?'badge-danger':'badge-secondary'}">${roleLabel[e.role]||'사용자'}</span></td>` : ''}
        ${isAdmin ? `<td style="${p};text-align:right">
          <span onclick="Employees.showRateHistory(${e.id},'${e.name}')"
            style="cursor:pointer;color:#1971c2;text-decoration:underline;font-size:12px">
            ${e.hourly_rate ? Utils.formatNum(e.hourly_rate)+'원' : '미설정'}
          </span>
        </td>` : ''}
        ${isAdmin ? `<td style="${p};white-space:nowrap">
          <button class="btn btn-secondary btn-sm" style="padding:2px 5px;font-size:11px" onclick="Employees.showForm(${e.id})">수정</button>
          <button class="btn btn-sm" style="background:#6f42c1;color:#fff;padding:2px 5px;font-size:11px" onclick="Employees.showPermissions(${e.id},'${e.name}')">권한</button>
          <button id="call-btn-${e.id}" class="btn btn-sm" onclick="Employees.toggleCall(${e.id})"
            style="padding:2px 5px;font-size:11px;background:${e.call_enabled?'#d97706':'#e2e8f0'};color:${e.call_enabled?'#fff':'#64748b'}">
            📣${e.call_enabled?'ON':'OFF'}</button>
          ${e.status === 'active'
            ? `<button class="btn btn-danger btn-sm" style="padding:2px 5px;font-size:11px" onclick="Employees.retire(${e.id},'${e.name}')">퇴직</button>`
            : `<button class="btn btn-success btn-sm" style="padding:2px 5px;font-size:11px" onclick="Employees.restore(${e.id},'${e.name}')">복구</button>`}
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
        <div class="form-group"><label>역할</label>
          <select id="f-role">
            <option value="user" ${(emp?.role!=='superadmin')?'selected':''}>사용자</option>
            <option value="superadmin" ${emp?.role==='superadmin'?'selected':''}>총괄관리자</option>
          </select>
        </div>
        <div class="form-group"><label>시급 (원)</label>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px;font-weight:600">${emp?.hourly_rate ? Utils.formatNum(emp.hourly_rate)+'원' : '미설정'}</span>
            ${emp ? `<button type="button" onclick="Utils.closeModal();Employees.showRateHistory(${emp.id},'${emp.name}')"
              style="padding:3px 10px;font-size:12px;background:#1971c2;color:#fff;border:none;border-radius:6px;cursor:pointer">이력/변경</button>` : ''}
          </div>
        </div>
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

  async showPermissions(id, name) {
    let PAGES;
    try { PAGES = await API.get('/api/permissions/pages'); }
    catch { PAGES = []; }
    let data;
    try { data = await API.get(`/api/permissions/${id}`); }
    catch (e) { Utils.showToast(e.message, 'error'); return; }

    const isSA = data.role === 'superadmin';
    const perms = data.permissions || {};

    const rows = PAGES.map(pg => {
      const v = !!perms[pg.key]?.view;
      const e = !!perms[pg.key]?.edit;
      return `<tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:8px 10px;font-size:13px">${pg.label}</td>
        <td style="text-align:center">
          <input type="checkbox" class="perm-view" data-page="${pg.key}" ${v?'checked':''} onchange="Employees._syncEdit(this)">
        </td>
        <td style="text-align:center">
          <input type="checkbox" class="perm-edit" data-page="${pg.key}" ${e?'checked':''} ${!v?'disabled':''}>
        </td>
      </tr>`;
    }).join('');

    Utils.modal(
      `🔑 ${name} 권한 설정`,
      `<div style="margin-bottom:14px;padding:10px 14px;background:#fff3cd;border-radius:8px;display:flex;align-items:center;gap:10px">
        <label style="font-weight:600;font-size:13px">총괄관리자 권한</label>
        <input type="checkbox" id="perm-sa" ${isSA?'checked':''} style="width:16px;height:16px" onchange="Employees._toggleSA(this)">
        <span style="font-size:12px;color:#856404">체크 시 모든 권한 자동 부여</span>
      </div>
      <div id="perm-table-wrap" style="${isSA?'opacity:0.4;pointer-events:none':''}">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8f9fa;font-size:12px;color:#6c757d">
              <th style="padding:8px 10px;text-align:left">메뉴</th>
              <th style="padding:8px 10px;text-align:center;width:70px">보기</th>
              <th style="padding:8px 10px;text-align:center;width:70px">수정</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
      async () => {
        const sa = document.getElementById('perm-sa')?.checked;
        const role = sa ? 'superadmin' : 'user';
        const permissions = {};
        PAGES.forEach(pg => {
          const v = document.querySelector(`.perm-view[data-page="${pg.key}"]`)?.checked;
          const e = document.querySelector(`.perm-edit[data-page="${pg.key}"]`)?.checked;
          permissions[pg.key] = { view: !!v, edit: !!e };
        });
        const btn = document.querySelector('.modal .btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
        try {
          await API.put(`/api/permissions/${id}`, { role, permissions });
          Utils.showToast('권한이 저장되었습니다.');
          Utils.closeModal(); Employees.render();
        } catch (e) {
          Utils.showToast(e.message, 'error');
          if (btn) { btn.disabled = false; btn.textContent = '저장'; }
        }
      },
      '저장'
    );
  },

  _syncEdit(viewCb) {
    const page = viewCb.dataset.page;
    const editCb = document.querySelector(`.perm-edit[data-page="${page}"]`);
    if (!editCb) return;
    if (!viewCb.checked) { editCb.checked = false; editCb.disabled = true; }
    else { editCb.disabled = false; }
  },

  _toggleSA(cb) {
    const wrap = document.getElementById('perm-table-wrap');
    if (wrap) { wrap.style.opacity = cb.checked ? '0.4' : ''; wrap.style.pointerEvents = cb.checked ? 'none' : ''; }
  },

  async showRateHistory(id, name) {
    let history = [];
    try { history = await API.get(`/api/employees/${id}/rate-history`); } catch {}

    const renderRows = (list) => list.length === 0
      ? `<tr><td colspan="3" style="text-align:center;padding:16px;color:#94a3b8">이력 없음</td></tr>`
      : list.map(h => `<tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:8px 10px;font-size:13px;font-weight:600">${Utils.formatNum(h.hourly_rate)}원</td>
          <td style="padding:8px 10px;font-size:13px">${h.effective_from}</td>
          <td style="padding:8px 10px;font-size:12px;color:#64748b">${h.note || ''}</td>
          <td style="padding:8px 4px;text-align:center">
            <button onclick="Employees._deleteRate(${id},'${name}',${h.id})"
              style="font-size:11px;padding:2px 7px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;cursor:pointer">삭제</button>
          </td>
        </tr>`).join('');

    Utils.modal(
      `💰 ${name} 시급 이력`,
      `<div style="margin-bottom:16px;padding:14px;background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd">
        <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:10px">새 시급 등록</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div><div style="font-size:11px;color:#64748b;margin-bottom:4px">시급 (원)</div>
            <input type="number" id="rh-rate" placeholder="예: 11000" style="width:110px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></div>
          <div><div style="font-size:11px;color:#64748b;margin-bottom:4px">적용 시작일</div>
            <input type="date" id="rh-from" value="${new Date().toISOString().slice(0,10)}" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></div>
          <div><div style="font-size:11px;color:#64748b;margin-bottom:4px">메모 (선택)</div>
            <input id="rh-note" placeholder="예: 2026년 최저임금" style="width:140px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></div>
          <button onclick="Employees._addRate(${id},'${name}')"
            style="padding:6px 14px;background:#0369a1;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">등록</button>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8f9fa;font-size:12px;color:#6c757d">
          <th style="padding:8px 10px;text-align:left">시급</th>
          <th style="padding:8px 10px;text-align:left">적용 시작일</th>
          <th style="padding:8px 10px;text-align:left">메모</th>
          <th style="width:50px"></th>
        </tr></thead>
        <tbody id="rh-tbody">${renderRows(history)}</tbody>
      </table>`,
      null, { confirmLabel: '닫기', cancelLabel: null }
    );
  },

  async _addRate(id, name) {
    const rate = parseInt(document.getElementById('rh-rate')?.value);
    const from = document.getElementById('rh-from')?.value;
    const note = document.getElementById('rh-note')?.value;
    if (!rate || rate <= 0) return Utils.showToast('시급을 입력하세요', 'error');
    if (!from) return Utils.showToast('적용 시작일을 선택하세요', 'error');
    try {
      await API.post(`/api/employees/${id}/rate-history`, { hourly_rate: rate, effective_from: from, note });
      Utils.showToast('등록되었습니다.');
      // 이력 새로고침
      const history = await API.get(`/api/employees/${id}/rate-history`);
      const tbody = document.getElementById('rh-tbody');
      if (tbody) tbody.innerHTML = history.length === 0
        ? `<tr><td colspan="3" style="text-align:center;padding:16px;color:#94a3b8">이력 없음</td></tr>`
        : history.map(h => `<tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:8px 10px;font-size:13px;font-weight:600">${Utils.formatNum(h.hourly_rate)}원</td>
            <td style="padding:8px 10px;font-size:13px">${h.effective_from}</td>
            <td style="padding:8px 10px;font-size:12px;color:#64748b">${h.note || ''}</td>
            <td style="padding:8px 4px;text-align:center">
              <button onclick="Employees._deleteRate(${id},'${name}',${h.id})"
                style="font-size:11px;padding:2px 7px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;cursor:pointer">삭제</button>
            </td>
          </tr>`).join('');
      Employees.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async _deleteRate(userId, name, histId) {
    if (!confirm('이 이력을 삭제하시겠습니까?')) return;
    try {
      await API.delete(`/api/employees/${userId}/rate-history/${histId}`);
      Utils.showToast('삭제되었습니다.');
      Employees.showRateHistory(userId, name);
    } catch (e) { Utils.showToast(e.message, 'error'); }
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
  },

  async toggleCall(id) {
    const emp = this.data.find(e => e.id === id);
    if (!emp) return;
    const newVal = !emp.call_enabled;
    try {
      await API.patch(`/api/employees/${id}/call-enabled`, { enabled: newVal });
      emp.call_enabled = newVal ? 1 : 0;
      const btn = document.getElementById(`call-btn-${id}`);
      if (btn) {
        btn.style.background = newVal ? '#d97706' : '#e2e8f0';
        btn.style.color = newVal ? '#fff' : '#64748b';
        btn.textContent = `📣${newVal ? '호출ON' : '호출OFF'}`;
      }
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  _menuPages: null,
  _menuSelected: null,

  async _initMenuPermBtns() {
    const btnRow = document.getElementById('menu-perm-btn-row');
    if (!btnRow) return;
    try {
      this._menuPages = await API.get('/api/permissions/pages');
    } catch { this._menuPages = []; }
    btnRow.innerHTML = this._menuPages.map(pg => `
      <button id="mpbtn-${pg.key}" onclick="Employees.showMenuPerm('${pg.key}','${pg.label}')"
        style="padding:5px 12px;font-size:12px;border:1px solid #dee2e6;border-radius:20px;background:#fff;cursor:pointer;transition:all .15s">
        ${pg.label}
      </button>`).join('');
  },

  async showMenuPerm(pageKey, pageLabel) {
    // 버튼 활성화 표시
    if (this._menuPages) {
      this._menuPages.forEach(pg => {
        const b = document.getElementById(`mpbtn-${pg.key}`);
        if (b) { b.style.background = pg.key === pageKey ? '#6f42c1' : '#fff'; b.style.color = pg.key === pageKey ? '#fff' : ''; b.style.borderColor = pg.key === pageKey ? '#6f42c1' : '#dee2e6'; }
      });
    }
    this._menuSelected = pageKey;
    const body = document.getElementById('menu-perm-body');
    if (!body) return;
    body.style.display = 'block';
    body.innerHTML = `<div style="text-align:center;padding:20px;color:#6c757d">불러오는 중...</div>`;

    try {
      const [permMap, employees] = await Promise.all([
        API.get(`/api/permissions/menu/${pageKey}`),
        Promise.resolve(this.data.filter(e => e.status === 'active')),
      ]);

      const allView = employees.every(e => permMap[e.id]?.view);
      const allEdit = employees.every(e => permMap[e.id]?.edit);

      body.innerHTML = `
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:14px;color:#6f42c1">[${pageLabel}]</span>
          <span style="font-size:12px;color:#6c757d">재직 중인 직원 ${employees.length}명</span>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            <button onclick="Employees._toggleAllMenuPerm('view',true)" style="padding:4px 10px;font-size:12px;border:1px solid #198754;border-radius:6px;background:#d1fae5;color:#065f46;cursor:pointer">조회 전체ON</button>
            <button onclick="Employees._toggleAllMenuPerm('view',false)" style="padding:4px 10px;font-size:12px;border:1px solid #dc3545;border-radius:6px;background:#fee2e2;color:#991b1b;cursor:pointer">조회 전체OFF</button>
            <button onclick="Employees._toggleAllMenuPerm('edit',true)" style="padding:4px 10px;font-size:12px;border:1px solid #1971c2;border-radius:6px;background:#dbeafe;color:#1e3a5f;cursor:pointer">수정 전체ON</button>
            <button onclick="Employees._toggleAllMenuPerm('edit',false)" style="padding:4px 10px;font-size:12px;border:1px solid #6c757d;border-radius:6px;background:#f1f5f9;color:#475569;cursor:pointer">수정 전체OFF</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead>
              <tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6">
                <th style="padding:8px 12px;text-align:left;font-weight:600">이름</th>
                <th style="padding:8px 12px;text-align:left;font-weight:600">부서</th>
                <th style="padding:8px 12px;text-align:center;font-weight:600">조회</th>
                <th style="padding:8px 12px;text-align:center;font-weight:600">수정</th>
              </tr>
            </thead>
            <tbody>
              ${employees.map(e => {
                const v = !!permMap[e.id]?.view;
                const ed = !!permMap[e.id]?.edit;
                return `<tr style="border-bottom:1px solid #f0f0f0" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
                  <td style="padding:7px 12px;font-weight:600">${e.name}</td>
                  <td style="padding:7px 12px;color:#64748b">${e.department || '-'}</td>
                  <td style="padding:7px 12px;text-align:center">
                    <input type="checkbox" class="mp-view" data-uid="${e.id}" ${v?'checked':''}
                      style="width:15px;height:15px;cursor:pointer" onchange="Employees._mpViewChange(this)">
                  </td>
                  <td style="padding:7px 12px;text-align:center">
                    <input type="checkbox" class="mp-edit" data-uid="${e.id}" ${ed?'checked':''} ${!v?'disabled':''}
                      style="width:15px;height:15px;cursor:pointer">
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end">
          <button onclick="Employees._saveMenuPerms('${pageKey}','${pageLabel}')"
            style="padding:8px 22px;background:#6f42c1;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
            저장
          </button>
        </div>`;
    } catch (e) {
      body.innerHTML = `<div style="color:#dc3545;padding:12px">${e.message}</div>`;
    }
  },

  _mpViewChange(cb) {
    const uid = cb.dataset.uid;
    const editCb = document.querySelector(`.mp-edit[data-uid="${uid}"]`);
    if (editCb) { if (!cb.checked) { editCb.checked = false; editCb.disabled = true; } else { editCb.disabled = false; } }
  },

  _toggleAllMenuPerm(type, val) {
    document.querySelectorAll(`.mp-${type}`).forEach(cb => {
      if (cb.disabled && val) return;
      cb.checked = val;
      if (type === 'view') Employees._mpViewChange(cb);
    });
    if (type === 'view' && !val) {
      document.querySelectorAll('.mp-edit').forEach(cb => { cb.checked = false; cb.disabled = true; });
    }
  },

  async _saveMenuPerms(pageKey, pageLabel) {
    const permissions = [];
    document.querySelectorAll('.mp-view').forEach(cb => {
      const uid = parseInt(cb.dataset.uid);
      const editCb = document.querySelector(`.mp-edit[data-uid="${uid}"]`);
      permissions.push({ user_id: uid, view: cb.checked, edit: !!(editCb?.checked) });
    });
    try {
      await API.put(`/api/permissions/menu/${pageKey}`, { permissions });
      Utils.showToast(`[${pageLabel}] 권한이 저장되었습니다.`);
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },
};
