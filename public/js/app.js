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
    const firstPage = App.user.role === 'superadmin' ? 'dashboard' : (allPages.find(p => App.canView(p)) || 'mypage');
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

    // 설정·관리자 섹션: 총괄만
    ['nav-settings','nav-admin-section'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isSuperAdmin ? '' : 'none';
    });

    // nav section labels 표시 제어
    const sectionMap = {
      '인사관리': ['employees','attendance','leaves','salary'],
      '재무관리': ['finance'],
      '재고관리': ['inventory'],
    };
    document.querySelectorAll('#sidebar .nav-section').forEach(sec => {
      const pages = sectionMap[sec.textContent?.trim()];
      if (pages) sec.style.display = (isSuperAdmin || pages.some(p => App.canView(p))) ? '' : 'none';
    });

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
