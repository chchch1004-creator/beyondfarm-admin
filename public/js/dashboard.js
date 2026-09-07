const Dashboard = {
  gcalEvents: [],
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  _scheduleData: {},   // { 'YYYY-MM-DD': [{slot,text,color}] }
  _editMode: false,

  // ── 주 계산 (월요일 시작) ──────────────────────────────────────────
  _getWeekDates(baseDate) {
    const d = new Date(baseDate);
    const dow = d.getDay(); // 0=일
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      return day;
    });
  },
  _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _weekLabel(dates) {
    const m = dates[0].getMonth() + 1;
    // 해당 달의 몇째 주인지 계산
    const firstMonday = new Date(dates[0].getFullYear(), dates[0].getMonth(), 1);
    const firstDow = firstMonday.getDay();
    const offset = firstDow === 0 ? 1 : firstDow === 1 ? 0 : 8 - firstDow;
    firstMonday.setDate(1 + offset);
    // ISO week-of-month: 월요일 기준
    const weekNum = Math.ceil((dates[0].getDate() + (dates[0].getDay() === 0 ? 6 : dates[0].getDay() - 1)) / 7);
    return `${m}월 ${weekNum}주차`;
  },

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    try {
      const canEdit = App.canEdit('dashboard');

      // 이번주 + 다음주 날짜 범위
      const today = new Date();
      const thisWeek = this._getWeekDates(today);
      const nextWeekBase = new Date(today);
      nextWeekBase.setDate(today.getDate() + 7);
      const nextWeek = this._getWeekDates(nextWeekBase);

      const from = this._fmtDate(thisWeek[0]);
      const to   = this._fmtDate(nextWeek[6]);

      // 병렬 로딩
      const [schedData] = await Promise.all([
        API.get(`/api/dashboard/schedule?from=${from}&to=${to}`).catch(() => ({})),
      ]);
      this._scheduleData = schedData || {};

      const cy = today.getFullYear(), cm = today.getMonth() + 1;
      let ny = cy, nm = cm + 1; if (nm > 12) { nm = 1; ny++; }
      const [shTimesheet, shTimesheetNext] = await Promise.all([
        API.get(`/api/sh-timesheet?year=${cy}&month=${cm}`).catch(() => null),
        API.get(`/api/sh-timesheet?year=${ny}&month=${nm}`).catch(() => null),
      ]);

      content.innerHTML = `
        <!-- 2주 근무표 -->
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:20px">
          <div style="padding:14px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #dee2e6;background:#f8f9fa">
            <span style="font-size:15px;font-weight:700">📅 2주간 근무표</span>
            ${canEdit ? `<button id="dash-edit-btn" onclick="Dashboard.toggleEdit()"
              style="margin-left:auto;padding:5px 14px;font-size:12px;border-radius:6px;border:1px solid #6f42c1;background:#fff;color:#6f42c1;cursor:pointer;font-weight:600">
              ✏️ 수정
            </button>` : ''}
          </div>
          <div style="padding:16px" id="dash-schedule-wrap">
            ${this._renderTwoWeeks(thisWeek, nextWeek, canEdit)}
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

          <!-- 주주 근무표 -->
          <div class="card" style="padding:12px">
            <div style="font-weight:700;font-size:13px;color:#1b4332;margin-bottom:8px">📋 ${cy}년 ${cm}월 주주 근무표</div>
            ${this.renderShTimesheet(shTimesheet)}
            <div style="font-weight:700;font-size:13px;color:#1b4332;margin:14px 0 8px">📋 ${ny}년 ${nm}월 주주 근무표</div>
            ${this.renderShTimesheet(shTimesheetNext)}
          </div>
        </div>
      `;

      this.renderCalendar();
      this.loadGcalEvents();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  // ── 2주 근무표 렌더링 ──────────────────────────────────────────────
  _renderTwoWeeks(thisWeek, nextWeek, canEdit) {
    const todayStr = this._fmtDate(new Date());
    return [
      { label: this._weekLabel(thisWeek), dates: thisWeek },
      { label: this._weekLabel(nextWeek), dates: nextWeek },
    ].map(({ label, dates }) => this._renderWeekTable(label, dates, todayStr, canEdit)).join('');
  },

  _renderWeekTable(label, dates, todayStr, canEdit) {
    const DOW = ['월','화','수','목','금','토','일'];
    const COLORS = { red:'#dc2626', blue:'#1971c2', green:'#2f9e44', orange:'#e67700', purple:'#7048e8', default:'#495057' };
    const COLOR_OPTIONS = [
      { v:'', label:'기본', bg:'#f8f9fa', fg:'#495057' },
      { v:'red', label:'빨강', bg:'#fff5f5', fg:'#dc2626' },
      { v:'blue', label:'파랑', bg:'#e7f5ff', fg:'#1971c2' },
      { v:'green', label:'초록', bg:'#ebfbee', fg:'#2f9e44' },
      { v:'orange', label:'주황', bg:'#fff9db', fg:'#e67700' },
      { v:'purple', label:'보라', bg:'#f3f0ff', fg:'#7048e8' },
    ];

    const isEdit = this._editMode && canEdit;

    const headers = DOW.map((d, i) => {
      const isWknd = i >= 5;
      return `<th style="padding:8px 4px;text-align:center;font-size:12px;font-weight:700;border-bottom:2px solid #dee2e6;color:${isWknd?'#e03131':'#495057'};min-width:80px">${d}</th>`;
    }).join('');

    const dateCells = dates.map((d, i) => {
      const ds = this._fmtDate(d);
      const isToday = ds === todayStr;
      const isWknd = i >= 5;
      const isHol = typeof krIsHoliday === 'function' ? krIsHoliday(d.getFullYear(), d.getMonth()+1, d.getDate()) : false;
      const isRed = isWknd || isHol;
      const bg = isToday ? '#1b4332' : isRed ? '#fff5f5' : '#fff';
      const fg = isToday ? '#fff' : isRed ? '#dc2626' : '#212529';
      const numStyle = isToday
        ? `background:#1b4332;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px`
        : `font-size:13px;font-weight:700;color:${fg}`;
      return `<td style="padding:6px 4px;vertical-align:top;background:${isToday?'#f0fff4':isRed?'#fff5f5':'#fff'};border:1px solid #f1f3f5;min-width:80px;min-height:60px">
        <div style="${numStyle}">${d.getMonth()+1}/${d.getDate()}</div>
      </td>`;
    }).join('');

    const entryCells = dates.map((d, i) => {
      const ds = this._fmtDate(d);
      const isWknd = i >= 5;
      const isHol = typeof krIsHoliday === 'function' ? krIsHoliday(d.getFullYear(), d.getMonth()+1, d.getDate()) : false;
      const isRed = isWknd || isHol;
      const entries = this._scheduleData[ds] || [];

      const entryHtml = entries.map((e, ei) => {
        const fg = COLORS[e.color] || '#495057';
        const bg = e.color === 'red' ? '#fff5f5' : e.color === 'blue' ? '#e7f5ff' : e.color === 'green' ? '#ebfbee' : e.color === 'orange' ? '#fff9db' : e.color === 'purple' ? '#f3f0ff' : '#f8f9fa';
        if (isEdit) {
          return `<div style="display:flex;align-items:center;gap:2px;margin-bottom:3px">
            <input value="${e.text.replace(/"/g,'&quot;')}" data-date="${ds}" data-idx="${ei}" data-field="text"
              style="flex:1;min-width:0;font-size:11px;padding:2px 4px;border:1px solid #dee2e6;border-radius:4px;color:${fg};background:${bg}"
              oninput="Dashboard._onEntryInput(this)" onblur="Dashboard._saveDate('${ds}')">
            <select data-date="${ds}" data-idx="${ei}" data-field="color"
              style="font-size:10px;padding:2px;border:1px solid #dee2e6;border-radius:4px;width:44px"
              onchange="Dashboard._onEntryInput(this);Dashboard._saveDate('${ds}')">
              ${COLOR_OPTIONS.map(c => `<option value="${c.v}" ${e.color===c.v?'selected':''}>${c.label}</option>`).join('')}
            </select>
            <button onclick="Dashboard._removeEntry('${ds}',${ei})"
              style="font-size:10px;padding:1px 4px;border:1px solid #fca5a5;border-radius:4px;background:#fff5f5;color:#dc2626;cursor:pointer">✕</button>
          </div>`;
        }
        return e.text ? `<div style="font-size:11px;padding:2px 6px;border-radius:4px;margin-bottom:2px;background:${bg};color:${fg};font-weight:600">${e.text}</div>` : '';
      }).join('');

      const addBtn = isEdit ? `<button onclick="Dashboard._addEntry('${ds}')"
        style="font-size:10px;padding:2px 6px;border:1px dashed #adb5bd;border-radius:4px;background:#fff;color:#6c757d;cursor:pointer;width:100%;margin-top:2px">+ 추가</button>` : '';

      return `<td style="padding:6px 4px;vertical-align:top;background:${isRed?'#fff5f5':'#fff'};border:1px solid #f1f3f5">
        ${entryHtml}${addBtn}
      </td>`;
    }).join('');

    return `
      <div style="margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#1b4332;margin-bottom:8px;padding:6px 10px;background:#f0fff4;border-radius:6px;border-left:3px solid #2f9e44">${label}</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <thead><tr>${headers}</tr></thead>
            <tbody>
              <tr>${dateCells}</tr>
              <tr>${entryCells}</tr>
            </tbody>
          </table>
        </div>
      </div>`;
  },

  // ── 수정 모드 토글 ──────────────────────────────────────────────────
  toggleEdit() {
    this._editMode = !this._editMode;
    const btn = document.getElementById('dash-edit-btn');
    if (btn) {
      btn.textContent = this._editMode ? '✅ 완료' : '✏️ 수정';
      btn.style.background = this._editMode ? '#6f42c1' : '#fff';
      btn.style.color = this._editMode ? '#fff' : '#6f42c1';
    }
    this._rerenderSchedule();
  },

  _rerenderSchedule() {
    const wrap = document.getElementById('dash-schedule-wrap');
    if (!wrap) return;
    const canEdit = App.canEdit('dashboard');
    const today = new Date();
    const thisWeek = this._getWeekDates(today);
    const nextWeekBase = new Date(today); nextWeekBase.setDate(today.getDate() + 7);
    const nextWeek = this._getWeekDates(nextWeekBase);
    wrap.innerHTML = this._renderTwoWeeks(thisWeek, nextWeek, canEdit);
  },

  // ── 항목 편집 ──────────────────────────────────────────────────────
  _onEntryInput(el) {
    const ds = el.dataset.date;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    if (!this._scheduleData[ds]) this._scheduleData[ds] = [];
    if (!this._scheduleData[ds][idx]) this._scheduleData[ds][idx] = { text: '', color: '' };
    this._scheduleData[ds][idx][field] = el.value;
  },

  _addEntry(ds) {
    if (!this._scheduleData[ds]) this._scheduleData[ds] = [];
    this._scheduleData[ds].push({ text: '', color: '' });
    this._rerenderSchedule();
    // 새로 생성된 입력칸 포커스
    setTimeout(() => {
      const inputs = document.querySelectorAll(`[data-date="${ds}"][data-field="text"]`);
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  },

  _removeEntry(ds, idx) {
    if (!this._scheduleData[ds]) return;
    this._scheduleData[ds].splice(idx, 1);
    this._saveDate(ds);
    this._rerenderSchedule();
  },

  async _saveDate(ds) {
    try {
      const entries = (this._scheduleData[ds] || []).filter(e => e.text?.trim());
      await API.put(`/api/dashboard/schedule/${ds}`, { entries });
    } catch (e) { Utils.showToast('저장 실패: ' + e.message, 'error'); }
  },

  // ── 구글캘린더 달력 ────────────────────────────────────────────────
  calPrev() { this.calMonth--; if (this.calMonth < 1) { this.calMonth = 12; this.calYear--; } this.renderCalendar(); },
  calNext() { this.calMonth++; if (this.calMonth > 12) { this.calMonth = 1; this.calYear++; } this.renderCalendar(); },

  async loadGcalEvents() {
    const btn = document.querySelector('[onclick="Dashboard.loadGcalEvents()"]');
    if (btn) btn.textContent = '⏳';
    try { this.gcalEvents = await API.get('/api/gcal/events') || []; }
    catch { this.gcalEvents = []; }
    if (btn) btn.textContent = '🔄';
    this.renderCalendar();
  },

  renderCalendar() {
    const el = document.getElementById('dash-calendar');
    const label = document.getElementById('cal-month-label');
    if (!el) return;
    const year = this.calYear, month = this.calMonth;
    if (label) label.textContent = `${year}년 ${month}월`;

    const days = new Date(year, month, 0).getDate();
    const firstDow = new Date(year, month - 1, 1).getDay();
    const todayStr = this._fmtDate(new Date());
    const pad = n => String(n).padStart(2, '0');
    const monthStartStr = `${year}-${pad(month)}-01`;
    const monthEndStr = `${year}-${pad(month)}-${pad(days)}`;

    const eventMap = {};
    this.gcalEvents.forEach(e => {
      const rawStart = (e.start || '').slice(0, 10);
      let rawEnd = (e.end || e.start || '').slice(0, 10);
      if (e.allDay && rawEnd > rawStart) {
        const [ey, em, ed] = rawEnd.split('-').map(Number);
        const endD = new Date(ey, em - 1, ed - 1);
        rawEnd = `${endD.getFullYear()}-${pad(endD.getMonth()+1)}-${pad(endD.getDate())}`;
      }
      if (rawEnd < monthStartStr || rawStart > monthEndStr) return;
      for (let d = 1; d <= days; d++) {
        const dateStr = `${year}-${pad(month)}-${pad(d)}`;
        if (dateStr >= rawStart && dateStr <= rawEnd) {
          if (!eventMap[d]) eventMap[d] = [];
          eventMap[d].push({ ...e, _isFirst: dateStr === rawStart });
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
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;
      const isToday = dateStr === todayStr;
      const isHol = typeof krIsHoliday === 'function' ? krIsHoliday(year, month, d) : false;
      const isSun = dow === 0, isSat = dow === 6, isRed = isHol || isSun;
      const evts = eventMap[d] || [];
      const numStyle = isToday
        ? 'background:#1b4332;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700'
        : isRed ? 'color:#e03131;font-weight:600' : isSat ? 'color:#1c7ed6;font-weight:600' : 'color:#212529';
      const evtHtml = evts.map(e => {
        const label = e._isFirst ? e.title : '↳ ' + e.title;
        const bg = e._isFirst ? '#d3f9d8' : '#e8f5e9';
        const border = e._isFirst ? '' : 'border-left:2px solid #2b8a3e;';
        const clickAttr = e._isFirst
          ? `onclick="event.stopPropagation();Dashboard.openEditEvent('${e.id}')" style="background:${bg};color:#2b8a3e;${border}border-radius:3px;padding:1px 4px;font-size:9px;word-break:break-all;margin-top:2px;cursor:pointer"`
          : `style="background:${bg};color:#2b8a3e;${border}border-radius:3px;padding:1px 4px;font-size:9px;word-break:break-all;margin-top:2px"`;
        return `<div ${clickAttr}>${label}</div>`;
      }).join('');
      cells.push(`<td style="padding:4px 3px;vertical-align:top;background:${isToday?'#f0fff4':isRed?'#fff5f5':isSat?'#f0f5ff':''};border:1px solid #f1f3f5;cursor:pointer"
        onclick="Dashboard.openAddEvent('${dateStr}')">
        <div style="${numStyle};font-size:12px">${d}</div>${evtHtml}
      </td>`);
    }
    while (cells.length % 7 !== 0) cells.push(`<td style="border:1px solid #f1f3f5"></td>`);
    let rows = '';
    for (let i = 0; i < cells.length; i += 7) rows += `<tr>${cells.slice(i, i+7).join('')}</tr>`;
    const gcalNote = this.gcalEvents.length > 0
      ? `<div style="font-size:11px;color:#6c757d;margin-top:8px;text-align:right">🟢 구글캘린더 ${this.gcalEvents.length}개 일정 동기화됨</div>`
      : `<div style="font-size:11px;color:#adb5bd;margin-top:8px;text-align:right">구글캘린더 미연동 (설정에서 연동 가능)</div>`;
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <thead><tr>${thRow}</tr></thead><tbody>${rows}</tbody></table>${gcalNote}`;
  },

  // ── 주주 근무표 ────────────────────────────────────────────────────
  renderShTimesheet(data) {
    if (!data || !data.employees || data.employees.length === 0)
      return '<div style="color:#adb5bd;font-size:13px;text-align:center;padding:20px">주주 근무표 데이터 없음</div>';
    const { year, month, days, employees } = data;
    const NICK = { '조상희':'샘', '조상하':'비드', '정재호':'캐리', '소재훈':'빌리' };
    const COLORS = { '조상희':'#2d6a4f', '조상하':'#1864ab', '정재호':'#862e9c', '소재훈':'#c0392b' };
    const partMap = {};
    employees.forEach(e => { partMap[e.id] = new Set(e.days); });
    const pad = n => String(n).padStart(2,'0');
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
    const bodyRows = weeks.map(wk => {
      const cells = wk.map((d, dow) => {
        if (!d) return `<td style="border:1px solid #f1f3f5"></td>`;
        const dateStr = `${year}-${pad(month)}-${pad(d)}`;
        const isHol = typeof krIsHoliday === 'function' ? krIsHoliday(year, month, d) : false;
        const isRed = dow === 0 || isHol, isSat = dow === 6;
        const present = employees.filter(e => partMap[e.id].has(d));
        const badges = present.map(e => {
          const color = COLORS[e.name] || '#495057';
          return `<span style="display:inline-block;padding:1px 5px;border-radius:10px;font-size:10px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color};margin:1px">${NICK[e.name]||e.name}</span>`;
        }).join('');
        return `<td style="padding:3px;vertical-align:top;${isRed?'background:#fff5f5':isSat?'background:#f0f5ff':''};border:1px solid #f1f3f5">
          <div style="font-size:11px;font-weight:700;color:${isRed?'#e03131':isSat?'#1c7ed6':'#212529'};margin-bottom:2px">${d}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px">${badges}</div>
        </td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed">
      <thead><tr>${thRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  },

  // ── 구글캘린더 이벤트 추가/수정/삭제 (기존 유지) ─────────────────
  openAddEvent(dateStr) {
    const existing = document.getElementById('gcal-add-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'gcal-add-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px">📅 일정 추가 <span style="font-size:13px;font-weight:400;color:#6c757d">${dateStr}</span></div>
        <div class="form-group"><label class="form-label">제목 *</label>
          <input id="gcal-title" class="form-control" placeholder="일정 제목을 입력하세요" autofocus></div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <div class="form-group" style="flex:1"><label class="form-label">시작 시간</label>
            <input id="gcal-start-time" type="time" class="form-control" value="09:00"></div>
          <div class="form-group" style="flex:1"><label class="form-label">종료 시간</label>
            <input id="gcal-end-time" type="time" class="form-control" value="18:00"></div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="gcal-allday" onchange="Dashboard.toggleAllDay(this)"> 종일 일정</label></div>
        <div class="form-group" style="margin-top:10px"><label class="form-label">메모 (선택)</label>
          <textarea id="gcal-desc" class="form-control" rows="2" placeholder="메모"></textarea></div>
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
      await this.loadGcalEvents();
    } catch (e) {
      Utils.showToast('등록 실패: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
  },
  openEditEvent(eventId) {
    const ev = this.gcalEvents.find(e => e.id === eventId);
    if (!ev) return;
    const existing = document.getElementById('gcal-edit-modal');
    if (existing) existing.remove();
    const isAllDay = ev.allDay;
    const startRaw = ev.start || '';
    const startDate = startRaw.slice(0, 10);
    const startTime = isAllDay ? '09:00' : (startRaw.slice(11, 16) || '09:00');
    const endRaw = ev.end || '';
    const endTime = isAllDay ? '18:00' : (endRaw.slice(11, 16) || '18:00');
    const modal = document.createElement('div');
    modal.id = 'gcal-edit-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px">✏️ 일정 수정</div>
        <div class="form-group"><label class="form-label">제목 *</label>
          <input id="gcal-edit-title" class="form-control" value="${ev.title.replace(/"/g,'&quot;')}" autofocus></div>
        <div class="form-group" style="margin-top:10px"><label class="form-label">날짜</label>
          <input id="gcal-edit-date" type="date" class="form-control" value="${startDate}"></div>
        <div id="gcal-edit-time-row" style="display:${isAllDay?'none':'flex'};gap:10px;margin-top:10px">
          <div class="form-group" style="flex:1"><label class="form-label">시작 시간</label>
            <input id="gcal-edit-start-time" type="time" class="form-control" value="${startTime}"></div>
          <div class="form-group" style="flex:1"><label class="form-label">종료 시간</label>
            <input id="gcal-edit-end-time" type="time" class="form-control" value="${endTime}"></div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="gcal-edit-allday" ${isAllDay?'checked':''} onchange="Dashboard.toggleEditAllDay(this)"> 종일 일정</label></div>
        <div class="form-group" style="margin-top:10px"><label class="form-label">메모 (선택)</label>
          <textarea id="gcal-edit-desc" class="form-control" rows="2">${ev.description||''}</textarea></div>
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">
          <button class="btn btn-danger btn-sm" onclick="Dashboard.confirmDeleteEvent('${eventId}','gcal-edit-modal')">삭제</button>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary" onclick="document.getElementById('gcal-edit-modal').remove()">취소</button>
            <button id="gcal-edit-save-btn" class="btn btn-primary" onclick="Dashboard.submitEditEvent('${eventId}')">저장</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    setTimeout(() => document.getElementById('gcal-edit-title')?.focus(), 50);
  },
  toggleEditAllDay(cb) {
    const timeRow = document.getElementById('gcal-edit-time-row');
    if (timeRow) timeRow.style.display = cb.checked ? 'none' : 'flex';
  },
  async submitEditEvent(eventId) {
    const title = document.getElementById('gcal-edit-title')?.value.trim();
    if (!title) { Utils.showToast('제목을 입력해주세요', 'error'); return; }
    const allDay = document.getElementById('gcal-edit-allday')?.checked;
    const date = document.getElementById('gcal-edit-date')?.value;
    const startTime = document.getElementById('gcal-edit-start-time')?.value || '09:00';
    const endTime = document.getElementById('gcal-edit-end-time')?.value || '18:00';
    const desc = document.getElementById('gcal-edit-desc')?.value.trim();
    const btn = document.getElementById('gcal-edit-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      const payload = allDay
        ? { title, start: date, end: date, description: desc, allDay: true }
        : { title, start: `${date}T${startTime}:00`, end: `${date}T${endTime}:00`, description: desc, allDay: false };
      await API.put(`/api/gcal/events/${eventId}`, payload);
      document.getElementById('gcal-edit-modal')?.remove();
      Utils.showToast('일정이 수정되었습니다.');
      await this.loadGcalEvents();
    } catch (e) {
      Utils.showToast('수정 실패: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
  },
  async confirmDeleteEvent(eventId, modalId) {
    const mid = modalId || 'gcal-del-modal';
    const btn = document.querySelector(`#${mid} .btn-danger`);
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    try {
      await API.delete(`/api/gcal/events/${eventId}`);
      document.getElementById(mid)?.remove();
      Utils.showToast('일정이 삭제되었습니다.');
      await this.loadGcalEvents();
    } catch (e) {
      Utils.showToast('삭제 실패: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '삭제'; }
    }
  },
  async approveLeave(id, status) {
    try {
      await API.put(`/api/leaves/${id}/status`, { status });
      Utils.showToast(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.');
      Dashboard.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },
};
