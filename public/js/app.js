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

  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sidebar-name').textContent = App.user.name;
    const roleLabel = { superadmin: '총괄관리자', admin: '관리자', employee: '직원', '주말': '주말직원' };
    document.getElementById('sidebar-role').textContent = roleLabel[App.user.role] || '직원';
    App.goto(App.user.role === '주말' ? 'attendance' : 'dashboard');
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
      inflow: '유입량'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    const mpt = document.getElementById('mobile-page-title');
    if (mpt) mpt.textContent = titles[page] || page;

    // 권한 수준 설정
    const role = App.user.role;
    const isSuperAdmin = role === 'superadmin';
    const isAdminOrSuper = ['admin', 'superadmin'].includes(role);
    const isWeekend = role === '주말';

    // 총괄관리자 전용 메뉴 (휴가관리, 수입/지출, 재고현황, 설정)
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isSuperAdmin ? '' : 'none';
    });
    ['nav-settings', 'nav-admin-section'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isSuperAdmin ? '' : 'none';
    });
    const tsEl = document.getElementById('nav-timesheet');
    if (tsEl) tsEl.style.display = isSuperAdmin ? '' : 'none';
    // 주주근무표: 총괄관리자 전용
    const shEl = document.getElementById('nav-sh-timesheet');
    if (shEl) shEl.style.display = isSuperAdmin ? '' : 'none';
    // 매출현황·유입량: 총괄관리자 전용
    const salesEl = document.getElementById('nav-sales');
    if (salesEl) salesEl.style.display = isSuperAdmin ? '' : 'none';
    const inflowEl = document.getElementById('nav-inflow');
    if (inflowEl) inflowEl.style.display = isSuperAdmin ? '' : 'none';

    // 급여관리: 관리자/총괄만 열람 (주말직원 제외)
    const salEl = document.querySelector('[data-page="salary"]');
    if (salEl) salEl.style.display = (isAdminOrSuper && !isWeekend) ? '' : 'none';

    // 직원관리: 일반직원도 볼 수 있으나 주말직원은 제외
    const empEl = document.querySelector('[data-page="employees"]');
    if (empEl) empEl.style.display = isWeekend ? 'none' : '';

    // 대시보드: 주말직원은 숨김
    const dashEl = document.querySelector('[data-page="dashboard"]');
    if (dashEl) dashEl.style.display = isWeekend ? 'none' : '';

    // 주말직원 전용: 출퇴근+마이페이지만 허용
    if (isWeekend) {
      const weekendOnly = ['attendance', 'mypage'];
      if (!weekendOnly.includes(page)) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>접근 권한이 없습니다</div>';
        return;
      }
    }

    const superAdminOnly = ['leaves', 'finance', 'inventory', 'settings', 'shareholder_timesheet', 'sales', 'inflow'];
    if (superAdminOnly.includes(page) && !isSuperAdmin) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>총괄관리자만 접근 가능합니다</div>';
      return;
    }
    if (page === 'salary' && !isAdminOrSuper) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>접근 권한이 없습니다</div>';
      return;
    }
    const pages = { dashboard: Dashboard, employees: Employees, attendance: Attendance, leaves: Leaves, salary: Salary, finance: Finance, inventory: Inventory, settings: Settings, mypage: MyPage, timesheet: Timesheet, shareholder_timesheet: ShareholderTimesheet, sales: Sales, inflow: Inflow };
    pages[page]?.render();
    App.closeSidebar(); // 모바일에서 메뉴 선택 후 사이드바 닫기
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
