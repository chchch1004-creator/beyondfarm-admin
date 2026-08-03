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
    if (page === 'timesheet') return true; // 모든 직원이 본인 근무표 열람 가능
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
    const allPages = ['dashboard','employees','attendance','leaves','salary','inventory','timesheet','shareholder_timesheet','sales','inflow','checklist'];
    // 서버에서 설정 불러온 후 메뉴/페이지 적용
    Announcement.syncPresets();
    NavOrder.fetchOrder().then(() => {
      NavOrder.apply();
      const savedOrder = NavOrder.load();
      let firstPage = savedOrder?.[0] || (App.user.role === 'superadmin' ? 'dashboard' : (allPages.find(p => App.canView(p)) || 'mypage'));
      // 알림 탭으로 열린 경우 해당 페이지로 이동
      const pendingNavRaw = sessionStorage.getItem('pendingNav');
      let pendingParams = {};
      if (pendingNavRaw) {
        sessionStorage.removeItem('pendingNav');
        try {
          const parsed = JSON.parse(pendingNavRaw);
          if (parsed.page) { firstPage = parsed.page; pendingParams = parsed.params || {}; }
          else firstPage = pendingNavRaw; // 구형 문자열 형식 호환
        } catch { firstPage = pendingNavRaw; }
      }
      App.goto(firstPage, pendingParams);
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

  goto(page, params = {}) {
    event?.preventDefault();
    App.currentPage = page;
    App._gotoParams = params;

    // 네비 활성화
    document.querySelectorAll('#sidebar nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });

    const titles = {
      dashboard: '대시보드', employees: '직원 관리', attendance: '출퇴근 관리',
      leaves: '휴가 관리', salary: '급여 관리', inventory: '재고 현황',
      settings: '시스템 설정',
      mypage: '마이페이지',
      timesheet: '근무표',
      shareholder_timesheet: '주주근무표',
      sales: '매출현황',
      inflow: '유입량',
      checklist: '인원체크리스트',
      charcoal: '숯방',
      announcement: '안내방송',
      callstaff: '직원 호출',
      community: '커뮤니티',
      corp: '법인 계정 정보'
    };
    document.getElementById('page-title').textContent = titles[page] || page;
    const mpt = document.getElementById('mobile-page-title');
    if (mpt) mpt.textContent = titles[page] || page;

    const isSuperAdmin = App.user.role === 'superadmin';

    // 메뉴 표시/숨김: 권한 기반
    const navPages = ['dashboard','employees','attendance','leaves','salary','inventory','timesheet','shareholder_timesheet','sales','inflow','checklist','charcoal','announcement','corp'];
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

    const pages = { dashboard: Dashboard, employees: Employees, attendance: Attendance, leaves: Leaves, salary: Salary, finance: Finance, inventory: Inventory, settings: Settings, mypage: MyPage, timesheet: Timesheet, shareholder_timesheet: ShareholderTimesheet, sales: Sales, inflow: Inflow, checklist: Checklist, charcoal: Charcoal, announcement: Announcement, callstaff: CallStaff, community: Community, corp: Corp };
    const renderParams = App._gotoParams || {};
    App._gotoParams = {};
    pages[page]?.render(renderParams);
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
        const url = e.data.url;
        const page = url.includes('community') ? 'community' : null;
        if (!page) return;
        const roomMatch = url.match(/room=(\d+)/);
        const params = roomMatch ? { roomId: parseInt(roomMatch[1]) } : {};
        if (App.currentPage !== null) App.goto(page, params);
        else sessionStorage.setItem('pendingNav', JSON.stringify({ page, params }));
      }
    });
  }
});

function initPullToRefresh() {
  const main = document.getElementById('main');
  const content = document.getElementById('content');
  const indicator = document.getElementById('pull-indicator');
  const pullIcon = document.getElementById('pull-icon');
  const pullText = document.getElementById('pull-text');
  if (!main || !indicator) return;

  const scroller = content || main;
  let startY = 0;
  let pulling = false;
  let blocked = false; // 이번 제스처에서 스크롤이 일어난 적 있으면 PTR 차단
  const THRESHOLD = 70;

  // 스크롤 중 scrollTop > 0이 되면 이 제스처에선 PTR 불가
  scroller.addEventListener('scroll', () => {
    if (scroller.scrollTop > 0) blocked = true;
  }, { passive: true });

  main.addEventListener('touchstart', e => {
    blocked = scroller.scrollTop > 0; // 이미 내려가 있으면 차단
    startY = e.touches[0].clientY;
    pulling = !blocked;
  }, { passive: true });

  main.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dist = e.touches[0].clientY - startY;
    if (dist <= 0) { indicator.style.display = 'none'; pulling = false; return; }
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
    if (!pulling) { indicator.style.display = 'none'; return; }
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

  // order 배열 형식: 문자열(페이지키) 또는 {group:'그룹명'} 객체 혼합
  apply() {
    const order = this.load();
    const nav = document.querySelector('#sidebar nav');
    if (!nav) return;

    // 기존 구분선 제거
    nav.querySelectorAll('.nav-section').forEach(s => s.remove());

    const links = Object.fromEntries(
      [...nav.querySelectorAll('a[data-page]')].map(a => [a.dataset.page, a])
    );
    [...nav.querySelectorAll('a[data-page]')].forEach(a => a.remove());

    if (order) {
      order.forEach(item => {
        if (typeof item === 'string') {
          if (links[item]) nav.appendChild(links[item]);
        } else if (item?.group) {
          const div = document.createElement('div');
          div.className = 'nav-section';
          div.textContent = item.group;
          nav.appendChild(div);
        }
      });
      // 순서에 없는 페이지는 맨 뒤에 추가
      Object.entries(links).forEach(([page, a]) => {
        if (!order.some(item => item === page)) nav.appendChild(a);
      });
    } else {
      // 저장된 순서 없음: 기본 순서로 복원
      Object.values(links).forEach(a => nav.appendChild(a));
    }
  },

  openModal() {
    const nav = document.querySelector('#sidebar nav');

    // 현재 표시 중인 페이지 링크 정보 수집
    const pageLinks = Object.fromEntries(
      [...nav.querySelectorAll('a[data-page]')]
        .filter(a => a.style.display !== 'none')
        .map(a => [a.dataset.page, {
          page: a.dataset.page,
          icon: a.querySelector('.icon')?.textContent || '',
          label: a.querySelector('span:last-child')?.textContent || a.dataset.page,
        }])
    );

    // 현재 저장된 순서(페이지 + 구분선 포함)로 초기 아이템 목록 구성
    const order = this.load();
    let initItems = [];
    if (order) {
      order.forEach(item => {
        if (typeof item === 'string' && pageLinks[item]) {
          initItems.push({ ...pageLinks[item], type: 'page' });
        } else if (item?.group) {
          initItems.push({ type: 'group', label: item.group });
        }
      });
      // 순서에 없는 페이지 뒤에 추가
      Object.values(pageLinks).forEach(p => {
        if (!initItems.some(i => i.page === p.page)) initItems.push({ ...p, type: 'page' });
      });
    } else {
      initItems = Object.values(pageLinks).map(p => ({ ...p, type: 'page' }));
    }

    let dragSrc = null;
    let itemCounter = 0;

    const makePageEl = (item) => {
      const div = document.createElement('div');
      div.className = 'nm-item';
      div.dataset.page = item.page;
      div.draggable = true;
      div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:grab;user-select:none';
      div.innerHTML = `<span style="color:#94a3b8;font-size:16px;flex-shrink:0">⠿</span>
        <span style="font-size:18px;flex-shrink:0">${item.icon}</span>
        <span style="font-size:14px;font-weight:500">${item.label}</span>`;
      return div;
    };

    const makeGroupEl = (label = '구분선') => {
      const id = `grp-${itemCounter++}`;
      const div = document.createElement('div');
      div.className = 'nm-item nm-group';
      div.dataset.group = '1';
      div.draggable = true;
      div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;margin-bottom:6px;background:#1e293b;border-radius:8px;cursor:grab;user-select:none';
      div.innerHTML = `
        <span style="color:rgba(255,255,255,0.4);font-size:16px;flex-shrink:0">⠿</span>
        <input id="${id}" value="${label}"
          style="flex:1;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.3);
                 color:#fff;font-size:12px;font-weight:700;outline:none;padding:2px 4px;text-transform:uppercase;letter-spacing:0.05em"
          onclick="event.stopPropagation()" ondragstart="event.stopPropagation()">
        <button onclick="this.closest('.nm-item').remove()"
          style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:16px;cursor:pointer;flex-shrink:0;line-height:1">×</button>`;
      return div;
    };

    const modal = document.createElement('div');
    modal.id = 'nm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:24px;width:340px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">메뉴 순서 설정</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">⠿ 드래그로 순서 변경 · 구분선 추가로 그룹 직접 설정</div>
        <button id="nm-add-group"
          style="padding:7px 12px;border:1px dashed #94a3b8;border-radius:8px;background:#f8fafc;
                 color:#475569;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:10px;text-align:left">
          + 구분선 추가
        </button>
        <div id="nm-list" style="flex:1;overflow-y:auto;min-height:0"></div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button id="nm-reset" style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;font-size:13px;font-weight:600;cursor:pointer;color:#64748b">초기화</button>
          <button id="nm-cancel" style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;font-size:13px;font-weight:600;cursor:pointer;color:#374151">취소</button>
          <button id="nm-save" style="flex:2;padding:9px;border:none;border-radius:7px;background:#2563eb;font-size:13px;font-weight:700;cursor:pointer;color:#fff">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const list = modal.querySelector('#nm-list');
    initItems.forEach(item => {
      list.appendChild(item.type === 'group' ? makeGroupEl(item.label) : makePageEl(item));
    });

    // 드래그 로직
    list.addEventListener('dragstart', e => {
      dragSrc = e.target.closest('.nm-item');
      if (dragSrc) { e.dataTransfer.effectAllowed = 'move'; setTimeout(() => dragSrc.style.opacity = '0.4', 0); }
    });
    list.addEventListener('dragend', e => {
      const item = e.target.closest('.nm-item');
      if (item) item.style.opacity = '';
      dragSrc = null;
    });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('.nm-item');
      if (!target || !dragSrc || target === dragSrc) return;
      const rect = target.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (after) list.insertBefore(dragSrc, target.nextSibling);
      else list.insertBefore(dragSrc, target);
    });

    modal.querySelector('#nm-add-group').onclick = () => {
      list.prepend(makeGroupEl('구분선'));
      list.querySelector('input')?.focus();
    };

    modal.querySelector('#nm-save').onclick = async () => {
      const order = [...list.querySelectorAll('.nm-item')].map(el => {
        if (el.dataset.group) return { group: el.querySelector('input')?.value || '구분선' };
        return el.dataset.page;
      }).filter(Boolean);
      await NavOrder._saveOrder(order);
      NavOrder.apply();
      modal.remove();
    };
    modal.querySelector('#nm-cancel').onclick = () => modal.remove();
    modal.querySelector('#nm-reset').onclick = async () => {
      await NavOrder._saveOrder(null);
      NavOrder.apply();
      modal.remove();
    };
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },
};
