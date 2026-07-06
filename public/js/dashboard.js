const Dashboard = {
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  gcalEvents: [],

  HOLIDAYS: new Set([
    '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
    '2025-03-01','2025-03-03',
    '2025-05-05','2025-05-06',
    '2025-06-06','2025-08-15','2025-10-03',
    '2025-10-05','2025-10-06','2025-10-07','2025-10-08',
    '2025-10-09','2025-12-25',
    '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
    '2026-03-01','2026-03-02',
    '2026-05-05','2026-05-24','2026-05-25',
    '2026-06-06','2026-07-17',
    '2026-08-15','2026-08-17',
    '2026-09-24','2026-09-25','2026-09-26','2026-09-28',
    '2026-10-03','2026-10-05','2026-10-09','2026-12-25',
    '2027-01-01','2027-02-06','2027-02-07','2027-02-08','2027-02-09',
    '2027-03-01','2027-05-05','2027-05-13',
    '2027-06-06','2027-07-17',
    '2027-08-15','2027-08-16',
    '2027-10-03','2027-10-04','2027-10-09','2027-10-11',
    '2027-10-14','2027-10-15','2027-10-16',
    '2027-12-25','2027-12-27',
  ]),
  isHoliday(y, m, d) {
    return this.HOLIDAYS.has(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  },

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    try {
      const isAdmin = ['admin','superadmin'].includes(App.user.role);
      const now = new Date();
      const cy = now.getFullYear(), cm = now.getMonth() + 1;
      let ny = cy, nm = cm + 1; if (nm > 12) { nm = 1; ny++; }
      const requests = [
        API.get('/api/employees'),
        API.get('/api/leaves?year=' + cy),
        API.get(`/api/sh-timesheet?year=${cy}&month=${cm}`),
        API.get(`/api/sh-timesheet?year=${ny}&month=${nm}`),
      ];
      const [employees, leaves, shTimesheet, shTimesheetNext] = await Promise.all(requests);

      const testKeywords = ['테스트','TEST','관리자'];
      const isTest = e => testKeywords.some(k => e.name?.includes(k)) || e.name === 'T';
      const activeEmp = employees.filter(e => e.status === 'active' && !isTest(e)).length;
      const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
      const todayStr = Utils.today();
      const checkedIn = 0;

      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon green">👥</div>
            <div><div class="stat-label">재직 직원</div><div class="stat-value">${activeEmp}명</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">🕐</div>
            <div><div class="stat-label">오늘 출근</div><div class="stat-value">${checkedIn}명</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">📅</div>
            <div><div class="stat-label">휴가 대기</div><div class="stat-value">${pendingLeaves}건</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">🌿</div>
            <div><div class="stat-label">비욘더팜</div><div class="stat-value" style="font-size:14px">관리 시스템</div></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px" id="dash-bottom">
          <!-- 구글캘린더 달력 -->
          <div class="card" style="padding:16px">
            <div class="card-title" style="margin-bottom:12px">
              📅 일정 캘린더
              <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
                <button class="btn btn-secondary btn-sm" onclick="Dashboard.calPrev()">‹</button>
                <span id="cal-month-label" style="font-size:13px;font-weight:700;min-width:80px;text-align:center"></span>
                <button class="btn btn-secondary btn-sm" onclick="Dashboard.calNext()">›</button>
                <button class="btn btn-secondary btn-sm" onclick="Dashboard.loadGcalEvents()" title="구글캘린더 동기화">🔄</button>
              </div>
            </div>
            <div id="dash-calendar"></div>
          </div>

          <!-- 주주 근무표 (현재달 + 다음달) -->
          <div class="card" style="padding:12px">
            <div style="font-weight:700;font-size:13px;color:#1b4332;margin-bottom:8px">📋 ${cy}년 ${cm}월 주주 근무표</div>
            ${this.renderShTimesheet(shTimesheet)}
            <div style="font-weight:700;font-size:13px;color:#1b4332;margin:14px 0 8px">📋 ${ny}년 ${nm}월 주주 근무표</div>
            ${this.renderShTimesheet(shTimesheetNext)}
          </div>
        </div>
      `;

      this.renderCalendar();
      if (isAdmin) this.loadGcalEvents();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  calPrev() { this.calMonth--; if (this.calMonth < 1) { this.calMonth = 12; this.calYear--; } this.renderCalendar(); },
  calNext() { this.calMonth++; if (this.calMonth > 12) { this.calMonth = 1; this.calYear++; } this.renderCalendar(); },

  async loadGcalEvents() {
    const btn = document.querySelector('[onclick="Dashboard.loadGcalEvents()"]');
    if (btn) btn.textContent = '⏳';
    try {
      const events = await API.get('/api/gcal/events');
      this.gcalEvents = events || [];
    } catch {
      this.gcalEvents = [];
    }
    if (btn) btn.textContent = '🔄';
    this.renderCalendar();
  },

  renderCalendar() {
    const el = document.getElementById('dash-calendar');
    const label = document.getElementById('cal-month-label');
    if (!el) return;
    if (label) label.textContent = `${this.calYear}년 ${this.calMonth}월`;

    const year = this.calYear, month = this.calMonth;
    const days = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay();
    const todayStr = Utils.today();

    // 날짜별 이벤트 맵 (기간 이벤트도 각 날짜에 전개)
    const eventMap = {};
    const pad = n => String(n).padStart(2, '0');
    const monthPrefix = `${year}-${pad(month)}`;
    const monthEndStr = `${year}-${pad(month)}-${pad(days)}`;
    const monthStartStr = `${year}-${pad(month)}-01`;

    this.gcalEvents.forEach(e => {
      const rawStart = (e.start || '').slice(0, 10);
      // allDay end는 exclusive (구글은 마지막날+1을 보냄), dateTime은 당일
      let rawEnd = (e.end || e.start || '').slice(0, 10);
      if (e.allDay && rawEnd > rawStart) {
        // YYYY-MM-DD 에서 하루 빼기
        const [ey, em, ed] = rawEnd.split('-').map(Number);
        const endD = new Date(ey, em - 1, ed - 1);
        rawEnd = `${endD.getFullYear()}-${pad(endD.getMonth()+1)}-${pad(endD.getDate())}`;
      }

      // 이번 달과 겹치는지 문자열 비교 (YYYY-MM-DD는 사전순 정렬 가능)
      if (rawEnd < monthStartStr || rawStart > monthEndStr) return;

      // 이번 달 안에 해당하는 날짜마다 이벤트 추가
      for (let d = 1; d <= days; d++) {
        const dateStr = `${year}-${pad(month)}-${pad(d)}`;
        if (dateStr >= rawStart && dateStr <= rawEnd) {
          if (!eventMap[d]) eventMap[d] = [];
          const isFirst = dateStr === rawStart;
          eventMap[d].push({ ...e, _isFirst: isFirst });
        }
      }
    });

    const DOW_KR = ['일','월','화','수','목','금','토'];
    const thRow = DOW_KR.map((k, i) => {
      const c = i === 0 ? 'color:#e03131' : i === 6 ? 'color:#1c7ed6' : 'color:#495057';
      return `<th style="${c};padding:6px 2px;text-align:center;font-size:11px;font-weight:600;border-bottom:2px solid #dee2e6">${k}</th>`;
    }).join('');

    let cells = Array(firstDow).fill(`<td></td>`);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const isHol = this.isHoliday(year, month, d);
      const isSun = dow === 0;
      const isSat = dow === 6;
      const isRed = isHol || isSun;
      const evts = eventMap[d] || [];

      const numStyle = isToday
        ? 'background:#1b4332;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700'
        : isRed ? 'color:#e03131;font-weight:600' : isSat ? 'color:#1c7ed6;font-weight:600' : 'color:#212529';

      const evtHtml = evts.map(e => {
        const label = e._isFirst ? e.title : '↳ ' + e.title;
        const bg = e._isFirst ? '#d3f9d8' : '#e8f5e9';
        const border = e._isFirst ? '' : 'border-left:2px solid #2b8a3e;border-radius:0 3px 3px 0;';
        return `<div style="background:${bg};color:#2b8a3e;${border}border-radius:3px;padding:1px 4px;font-size:9px;word-break:break-all;margin-top:2px">${label}</div>`;
      }).join('');

      const bg = isToday ? '#f0fff4' : isRed ? '#fff5f5' : isSat ? '#f0f5ff' : '';
      const isAdmin = ['admin','superadmin'].includes(App.user?.role);

      cells.push(`<td style="padding:4px 3px;vertical-align:top;background:${bg};border:1px solid #f1f3f5;${isAdmin?'cursor:pointer':''}"
        ${isAdmin ? `onclick="Dashboard.openAddEvent('${dateStr}')"` : ''}>
        <div style="${numStyle};font-size:12px">${d}</div>
        ${evtHtml}
      </td>`);
    }

    while (cells.length % 7 !== 0) cells.push(`<td style="border:1px solid #f1f3f5"></td>`);

    let rows = '';
    for (let i = 0; i < cells.length; i += 7) {
      rows += `<tr>${cells.slice(i, i+7).join('')}</tr>`;
    }

    const gcalNote = this.gcalEvents.length > 0
      ? `<div style="font-size:11px;color:#6c757d;margin-top:8px;text-align:right">🟢 구글캘린더 ${this.gcalEvents.length}개 일정 동기화됨</div>`
      : `<div style="font-size:11px;color:#adb5bd;margin-top:8px;text-align:right">구글캘린더 미연동 (설정에서 연동 가능)</div>`;

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead><tr>${thRow}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${gcalNote}
    `;
  },

  renderShTimesheet(data) {
    if (!data || !data.employees || data.employees.length === 0) {
      return '<div style="color:#adb5bd;font-size:13px;text-align:center;padding:20px">주주 근무표 데이터 없음</div>';
    }
    const { year, month, days, employees } = data;
    const NICK = { '조상희':'샘', '조상하':'비드', '정재호':'캐리', '소재훈':'빌리' };
    const COLORS = { '조상희':'#2d6a4f', '조상하':'#1864ab', '정재호':'#862e9c', '소재훈':'#c0392b' };
    const nick = name => NICK[name] || name;
    const partMap = {};
    employees.forEach(e => { partMap[e.id] = new Set(e.days); });

    const firstDow = new Date(year, month - 1, 1).getDay();
    const weeks = [];
    let week = new Array(7).fill(null);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      week[dow] = d;
      if (dow === 6 || d === days) { weeks.push([...week]); week = new Array(7).fill(null); }
    }
    const DOW_KR = ['일','월','화','수','목','금','토'];
    const thRow = DOW_KR.map((k,i) => `<th style="padding:4px 2px;text-align:center;font-size:10px;font-weight:600;border-bottom:2px solid #dee2e6;color:${i===0?'#e03131':i===6?'#1c7ed6':'#495057'}">${k}</th>`).join('');
    const pad = n => String(n).padStart(2,'0');

    const bodyRows = weeks.map(wk => {
      const cells = wk.map((d, dow) => {
        if (!d) return `<td style="border:1px solid #f1f3f5"></td>`;
        const dateStr = `${year}-${pad(month)}-${pad(d)}`;
        const isHol = this.HOLIDAYS.has(dateStr);
        const isRed = dow === 0 || isHol;
        const isSat = dow === 6;
        const bg = isRed ? '#fff5f5' : isSat ? '#f0f5ff' : '';
        const numColor = isRed ? '#e03131' : isSat ? '#1c7ed6' : '#212529';
        const present = employees.filter(e => partMap[e.id].has(d));
        const badges = present.map(e => {
          const color = COLORS[e.name] || '#495057';
          return `<span style="display:inline-block;padding:1px 5px;border-radius:10px;font-size:10px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color};margin:1px">${nick(e.name)}</span>`;
        }).join('');
        return `<td style="padding:3px;vertical-align:top;${bg?'background:'+bg:''};border:1px solid #f1f3f5">
          <div style="font-size:11px;font-weight:700;color:${numColor};margin-bottom:2px">${d}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px">${badges}</div>
        </td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `<table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr>${thRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
  },

  openAddEvent(dateStr) {
    const existing = document.getElementById('gcal-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gcal-add-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px">📅 일정 추가 <span style="font-size:13px;font-weight:400;color:#6c757d">${dateStr}</span></div>
        <div class="form-group">
          <label class="form-label">제목 *</label>
          <input id="gcal-title" class="form-control" placeholder="일정 제목을 입력하세요" autofocus>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <div class="form-group" style="flex:1">
            <label class="form-label">시작 시간</label>
            <input id="gcal-start-time" type="time" class="form-control" value="09:00">
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">종료 시간</label>
            <input id="gcal-end-time" type="time" class="form-control" value="18:00">
          </div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="gcal-allday" onchange="Dashboard.toggleAllDay(this)"> 종일 일정
          </label>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label class="form-label">메모 (선택)</label>
          <textarea id="gcal-desc" class="form-control" rows="2" placeholder="메모"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-secondary" onclick="document.getElementById('gcal-add-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="Dashboard.submitAddEvent('${dateStr}')">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    setTimeout(() => document.getElementById('gcal-title')?.focus(), 50);
  },

  toggleAllDay(cb) {
    const timeRow = cb.closest('.form-group').previousElementSibling;
    if (timeRow) timeRow.style.display = cb.checked ? 'none' : 'flex';
  },

  async submitAddEvent(dateStr) {
    const title = document.getElementById('gcal-title')?.value.trim();
    if (!title) { Utils.showToast('제목을 입력해주세요', 'error'); return; }

    const allDay = document.getElementById('gcal-allday')?.checked;
    const startTime = document.getElementById('gcal-start-time')?.value || '09:00';
    const endTime = document.getElementById('gcal-end-time')?.value || '18:00';
    const desc = document.getElementById('gcal-desc')?.value.trim();

    const btn = document.querySelector('#gcal-add-modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

    try {
      const payload = allDay
        ? { title, start: dateStr, end: dateStr, description: desc, allDay: true }
        : { title, start: `${dateStr}T${startTime}:00`, end: `${dateStr}T${endTime}:00`, description: desc, allDay: false };

      await API.post('/api/gcal/push-event', payload);
      document.getElementById('gcal-add-modal')?.remove();
      Utils.showToast('일정이 구글캘린더에 등록되었습니다.');
      await this.loadGcalEvents(); // 달력 즉시 갱신
    } catch (e) {
      Utils.showToast('등록 실패: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
  },

  async approveLeave(id, status) {
    try {
      await API.put(`/api/leaves/${id}/status`, { status });
      Utils.showToast(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.');
      Dashboard.render();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }
};
