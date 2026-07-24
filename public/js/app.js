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
    // 서버에서 설정 불러온 후 메뉴/페이지 적용
    Announcement.syncPresets();
    NavOrder.fetchOrder().then(() => {
      NavOrder.apply();
      const savedOrder = NavOrder.load();
      let firstPage = savedOrder?.[0] || (App.user.role === 'superadmin' ? 'dashboard' : (allPages.find(p => App.canView(p)) || 'mypage'));
      // 알림 탭으로 열린 경우 해당 페이지로 이동
      const pendingNav = sessionStorage.getItem('pendingNav');
      if (pendingNav) { sessionStorage.removeItem('pendingNav'); firstPage = pendingNav; }
      App.goto(firstPage);
    });
    Push.init().then(() => {
      const subscribed = Push.isSubscribed();
      const btnEnable = document.getElementById('btn-push-enable');
      const btnDisable = document.getElementById('btn-push-disable');
      if (btnEnable) btnEnable.style.display = subscribed ? 'none' : '';
      if (btnDisable) btnDisable.style.display = subscribed ? '' : 'none';
    });
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
      checklist: '인원체크리스트',
      announcement: '안내방송',
      callstaff: '직원 호출',
      community: '커뮤니티'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    const mpt = document.getElementById('mobile-page-title');
    if (mpt) mpt.textContent = titles[page] || page;

    const isSuperAdmin = App.user.role === 'superadmin';

    // 메뉴 표시/숨김: 권한 기반
    const navPages = ['dashboard','employees','attendance','leaves','salary','finance','inventory','timesheet','shareholder_timesheet','sales','inflow','checklist','announcement'];
    navPages.forEach(p => {
      const el = document.querySelector(`#sidebar [data-page="${p}"]`);
      if (el) el.style.display = App.canView(p) ? '' : 'none';
    });

    // 설정: 총괄만
    const navSettings = document.getElementById('nav-settings');
    if (navSettings) navSettings.style.display = isSuperAdmin ? '' : 'none';

    // 접근 제어: mypage·settings는 항상 허용
    // 페이지 이탈 시 커뮤니티 WS 정리
    if (page !== 'community' && Community._ws) Community.destroy();
    if (page !== 'checklist') Checklist.destroy();

    if (page !== 'mypage' && page !== 'settings' && page !== 'callstaff' && page !== 'community') {
      if (!App.canView(page)) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>접근 권한이 없습니다</div>';
        return;
      }
    }
    if (page === 'settings' && !isSuperAdmin) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>총괄관리자만 접근 가능합니다</div>';
      return;
    }

    const pages = { dashboard: Dashboard, employees: Employees, attendance: Attendance, leaves: Leaves, salary: Salary, finance: Finance, inventory: Inventory, settings: Settings, mypage: MyPage, timesheet: Timesheet, shareholder_timesheet: ShareholderTimesheet, sales: Sales, inflow: Inflow, checklist: Checklist, announcement: Announcement, callstaff: CallStaff, community: Community };
    pages[page]?.render();
    App.closeSidebar();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  initPullToRefresh();

  // 웹 푸시 알림 탭 → 페이지 이동 (서비스 워커 메시지 수신)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate' && e.data.url) {
        const page = e.data.url.includes('community') ? 'community' : null;
        if (!page) return;
        if (App.currentPage !== null) App.goto(page);
        else sessionStorage.setItem('pendingNav', page);
      }
    });
  }
});

function initPullToRefresh() {
  const main = document.getElementById('main');
  const indicator = document.getElementById('pull-indicator');
  const pullIcon = document.getElementById('pull-icon');
  const pullText = document.getElementById('pull-text');
  if (!main || !indicator) return;

  let startY = 0;
  let pulling = false;
  const THRESHOLD = 70;

  main.addEventListener('touchstart', e => {
    if (main.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  main.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dist = e.touches[0].clientY - startY;
    if (dist <= 0) { indicator.style.display = 'none'; return; }
    if (dist > 10) {
      indicator.style.display = 'flex';
      if (dist >= THRESHOLD) {
        pullIcon.style.transform = 'rotate(180deg)';
        pullText.textContent = '놓아서 새로고침';
      } else {
        pullIcon.style.transform = 'rotate(0deg)';
        pullText.textContent = '당겨서 새로고침';
      }
    }
  }, { passive: true });

  main.addEventListener('touchend', e => {
    if (!pulling) return;
    pulling = false;
    const dist = e.changedTouches[0].clientY - startY;
    if (dist >= THRESHOLD) {
      pullIcon.style.transform = 'rotate(0deg)';
      pullText.textContent = '새로고침 중...';
      setTimeout(() => {
        indicator.style.display = 'none';
        App.goto(App.currentPage);
      }, 300);
    } else {
      indicator.style.display = 'none';
    }
  }, { passive: true });
}

/* ── 메뉴 순서 커스텀 ── */
const NavOrder = {
  _order: null,

  async fetchOrder() {
    try {
      const res = await API.get('/api/user-settings/nav_order');
      if (res.value) {
        this._order = res.value;
      } else {
        // 서버에 없으면 localStorage에서 마이그레이션
        const localKey = `nav_order_${App.user?.id || 'guest'}`;
        const local = localStorage.getItem(localKey);
        if (local) {
          this._order = JSON.parse(local);
          await API.put('/api/user-settings/nav_order', { value: this._order });
          localStorage.removeItem(localKey);
        } else {
          this._order = null;
        }
      }
    } catch { this._order = null; }
  },

  load() { return this._order; },

  async _saveOrder(order) {
    this._order = order;
    try { await API.put('/api/user-settings/nav_order', { value: order }); } catch {}
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
    modal.querySelector('#nm-save').onclick = async () => {
      const order = [...list.querySelectorAll('.nm-item')].map(el => el.dataset.page);
      await NavOrder._saveOrder(order);
      NavOrder.apply();
      modal.remove();
    };
    modal.querySelector('#nm-cancel').onclick = () => modal.remove();
    modal.querySelector('#nm-reset').onclick = async () => {
      await NavOrder._saveOrder(null);
      location.reload();
    };
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },
};
