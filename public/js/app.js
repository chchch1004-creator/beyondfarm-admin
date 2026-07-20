const App = {
  user: null,
  currentPage: null,

  async init() {
    try {
      const data = await API.get('/api/auth/me');
      App.user = data.user;
      App.showApp();
    } catch {
      App.showLogin();
      // 저장된 아이디 불러오기
      const savedId = localStorage.getItem('savedUsername');
      if (savedId) {
        document.getElementById('login-username').value = savedId;
        document.getElementById('save-id').checked = true;
      }
      // 자동로그인 체크 복원
      if (localStorage.getItem('autoLogin') === 'true') {
        document.getElementById('auto-login').checked = true;
      }
    }
    // 시계 업데이트
    setInterval(() => {
      const el = document.getElementById('topbar-time');
      if (el) el.textContent = new Date().toLocaleString('ko-KR');
    }, 1000);
  },

  showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-username').addEventListener('keydown', e => e.key === 'Enter' && App.login());
    document.getElementById('login-password').addEventListener('keydown', e => e.key === 'Enter' && App.login());
  },

  canView(page) {
    if (App.user.role === 'superadmin') return true;
    return !!(App.user.permissions?.[page]?.view);
  },
  canEdit(page) {
    if (App.user.role === 'superadmin') return true;
    return !!(App.user.permissions?.[page]?.edit);
  },

  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sidebar-name').textContent = App.user.name;
    const roleLabel = { superadmin: '총괄관리자', user: '사용자' };
    document.getElementById('sidebar-role').textContent = roleLabel[App.user.role] || '사용자';
    const allPages = ['dashboard','employees','attendance','leaves','salary','finance','inventory','timesheet','shareholder_timesheet','sales','inflow','checklist'];
    NavOrder.init();
    // 저장된 메뉴 순서가 있으면 첫 번째 항목으로, 없으면 기본값
    const savedOrder = NavOrder.load();
    const firstPage = savedOrder?.[0] || (App.user.role === 'superadmin' ? 'dashboard' : (allPages.find(p => App.canView(p)) || 'mypage'));
    App.goto(firstPage);
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const saveId = document.getElementById('save-id').checked;
    const autoLogin = document.getElementById('auto-login').checked;
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';

    // 아이디 저장 처리
    if (saveId) localStorage.setItem('savedUsername', username);
    else localStorage.removeItem('savedUsername');

    // 자동로그인 설정 저장
    if (autoLogin) localStorage.setItem('autoLogin', 'true');
    else localStorage.removeItem('autoLogin');

    try {
      const data = await API.post('/api/auth/login', { username, password, autoLogin });
      App.user = data.user;
      App.showApp();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  },
  closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  },

  async logout() {
    await API.post('/api/auth/logout', {});
    App.user = null;
    App.showLogin();
  },

  goto(page) {
    event?.preventDefault();
    App.currentPage = page;

    // 네비 활성화
    document.querySelectorAll('#sidebar nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });

    const titles = {
      dashboard: '대시보드', employees: '직원 관리', attendance: '출퇴근 관리',
      leaves: '휴가 관리', salary: '급여 관리', finance: '수입/지출', inventory: '재고 현황',
      settings: '시스템 설정',
      mypage: '마이페이지',
      timesheet: '근무표',
      shareholder_timesheet: '주주근무표',
      sales: '매출현황',
      inflow: '유입량',
      checklist: '인원체크리스트'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    const mpt = document.getElementById('mobile-page-title');
    if (mpt) mpt.textContent = titles[page] || page;

    const isSuperAdmin = App.user.role === 'superadmin';

    // 메뉴 표시/숨김: 권한 기반
    const navPages = ['dashboard','employees','attendance','leaves','salary','finance','inventory','timesheet','shareholder_timesheet','sales','inflow','checklist'];
    navPages.forEach(p => {
      const el = document.querySelector(`#sidebar [data-page="${p}"]`);
      if (el) el.style.display = App.canView(p) ? '' : 'none';
    });

    // 설정: 총괄만
    const navSettings = document.getElementById('nav-settings');
    if (navSettings) navSettings.style.display = isSuperAdmin ? '' : 'none';

    // 접근 제어: mypage·settings는 항상 허용
    if (page !== 'mypage' && page !== 'settings') {
      if (!App.canView(page)) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>접근 권한이 없습니다</div>';
        return;
      }
    }
    if (page === 'settings' && !isSuperAdmin) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>총괄관리자만 접근 가능합니다</div>';
      return;
    }

    const pages = { dashboard: Dashboard, employees: Employees, attendance: Attendance, leaves: Leaves, salary: Salary, finance: Finance, inventory: Inventory, settings: Settings, mypage: MyPage, timesheet: Timesheet, shareholder_timesheet: ShareholderTimesheet, sales: Sales, inflow: Inflow, checklist: Checklist };
    pages[page]?.render();
    App.closeSidebar();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

/* ── 메뉴 순서 커스텀 ── */
const NavOrder = {
  storageKey() { return `nav_order_${App.user?.id || 'guest'}`; },

  load() {
    try { return JSON.parse(localStorage.getItem(this.storageKey()) || 'null'); } catch { return null; }
  },

  _saveOrder(order) {
    localStorage.setItem(this.storageKey(), JSON.stringify(order));
  },

  apply() {
    const order = this.load();
    if (!order) return;
    const nav = document.querySelector('#sidebar nav');
    if (!nav) return;
    nav.querySelectorAll('.nav-section').forEach(s => s.style.display = 'none');
    const links = Object.fromEntries(
      [...nav.querySelectorAll('a[data-page]')].map(a => [a.dataset.page, a])
    );
    [...nav.querySelectorAll('a[data-page]')].forEach(a => a.remove());
    order.forEach(page => { if (links[page]) nav.appendChild(links[page]); });
    Object.entries(links).forEach(([page, a]) => { if (!order.includes(page)) nav.appendChild(a); });
  },

  init() {
    this.apply();
  },

  openModal() {
    // 현재 nav 링크 목록 수집 (보이는 것만)
    const navLinks = [...document.querySelectorAll('#sidebar nav a[data-page]')]
      .filter(a => a.style.display !== 'none')
      .map(a => ({
        page: a.dataset.page,
        icon: a.querySelector('.icon')?.textContent || '',
        label: a.querySelector('span:last-child')?.textContent || a.dataset.page,
      }));

    let dragSrc = null;

    const itemHtml = navLinks.map((item, i) => `
      <div class="nm-item" data-idx="${i}" data-page="${item.page}"
        draggable="true"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;
               background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:grab;user-select:none">
        <span style="color:#94a3b8;font-size:16px">⠿</span>
        <span style="font-size:18px">${item.icon}</span>
        <span style="font-size:14px;font-weight:500">${item.label}</span>
      </div>`).join('');

    const modal = document.createElement('div');
    modal.id = 'nm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:24px;width:320px;max-width:92vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:6px">메뉴 순서 설정</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:14px">⠿ 핸들을 드래그해서 순서를 변경하세요</div>
        <div id="nm-list" style="flex:1;overflow-y:auto">${itemHtml}</div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button id="nm-reset"
            style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;
                   font-size:13px;font-weight:600;cursor:pointer;color:#64748b">초기화</button>
          <button id="nm-cancel"
            style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;
                   font-size:13px;font-weight:600;cursor:pointer;color:#374151">취소</button>
          <button id="nm-save"
            style="flex:2;padding:9px;border:none;border-radius:7px;background:#2563eb;
                   font-size:13px;font-weight:700;cursor:pointer;color:#fff">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // 드래그 로직
    const list = modal.querySelector('#nm-list');
    list.addEventListener('dragstart', e => {
      dragSrc = e.target.closest('.nm-item');
      if (dragSrc) { e.dataTransfer.effectAllowed = 'move'; setTimeout(() => dragSrc.style.opacity = '0.4', 0); }
    });
    list.addEventListener('dragend', e => {
      const item = e.target.closest('.nm-item');
      if (item) item.style.opacity = '';
      list.querySelectorAll('.nm-item').forEach(el => el.style.outline = '');
      dragSrc = null;
    });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('.nm-item');
      if (!target || !dragSrc || target === dragSrc) return;
      list.querySelectorAll('.nm-item').forEach(el => el.style.outline = '');
      const rect = target.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      target.style.outline = after ? '2px solid transparent' : '2px solid transparent';
      if (after) list.insertBefore(dragSrc, target.nextSibling);
      else list.insertBefore(dragSrc, target);
    });

    // 버튼
    modal.querySelector('#nm-save').onclick = () => {
      const order = [...list.querySelectorAll('.nm-item')].map(el => el.dataset.page);
      NavOrder._saveOrder(order);
      NavOrder.apply();
      modal.remove();
    };
    modal.querySelector('#nm-cancel').onclick = () => modal.remove();
    modal.querySelector('#nm-reset').onclick = () => {
      localStorage.removeItem(NavOrder.storageKey());
      location.reload();
    };
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },
};
