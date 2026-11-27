// ── 자동배치 기본 규칙 (서버에 저장된 규칙이 없을 때 fallback)
// JS Date.getDay: 0=일,1=월,2=화,3=수,4=목,5=금,6=토
const DEFAULT_SCHEDULE_RULES = {
  field: {
    '이신호': { days: [1,2,3,4,5], excludeHoliday: true },
    '문예은': { days: [0,6], excludeHoliday: false },
    '정민채': { days: [6],   excludeHoliday: false },
    '신동현': { days: [0],   excludeHoliday: false },
    '장병욱': { days: [1,2], excludeHoliday: false },
    '김관형': { days: [3,4,5,6,0], excludeHoliday: false },
  },
  office: {
    '문예은': { days: [1,3,4] },
    '정민채': { days: [1,3,4] },
    '이승재': { days: [3,4,5], excludeHoliday: true },
  },
};
let FIELD_RULES  = DEFAULT_SCHEDULE_RULES.field;
let OFFICE_RULES = DEFAULT_SCHEDULE_RULES.office;
const ALL_SCHEDULE_NAMES = [...new Set([
  ...Object.keys(FIELD_RULES), ...Object.keys(OFFICE_RULES)
])];

const Dashboard = {
  gcalEvents: [],
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  _scheduleData: {},
  _leaveMap: {},
  _shMap: {},
  _employees: [],
  _editMode: false,

  // ── 주주근무표 → 날짜맵 ────────────────────────────────────────────
  _buildShMap(...sheets) {
    const map = {};
    const pad = n => String(n).padStart(2,'0');
    for (const data of sheets) {
      if (!data?.employees) continue;
      const { year, month, employees } = data;
      employees.forEach(emp => {
        (emp.days || []).forEach(d => {
          const ds = `${year}-${pad(month)}-${pad(d)}`;
          if (!map[ds]) map[ds] = [];
          if (!map[ds].includes(emp.name)) map[ds].push(emp.name);
        });
      });
    }
    return map;
  },

  // ── 날짜 유틸 ──────────────────────────────────────────────────────
  _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  _getWeekDates(baseDate) {
    const d = new Date(baseDate);
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay()); // 해당 주 일요일
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      return day;
    });
  },
  _isHoliday(d) {
    return typeof krIsHoliday === 'function'
      ? krIsHoliday(d.getFullYear(), d.getMonth()+1, d.getDate())
      : false;
  },

  // ── 휴가맵 구축 ────────────────────────────────────────────────────
  _buildLeaveMap(leaves) {
    const map = {};
    for (const lv of leaves) {
      let cur = new Date(lv.start_date);
      const end = new Date(lv.end_date);
      while (cur <= end) {
        const ds = this._fmtDate(cur);
        if (!map[ds]) map[ds] = new Set();
        map[ds].add(lv.user_name);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  },

  // ── 자동배치 계산 ──────────────────────────────────────────────────
  _autoField(d) {
    const dow = d.getDay();
    const isHol = this._isHoliday(d);
    const leaveSet = this._leaveMap[this._fmtDate(d)] || new Set();
    return Object.entries(FIELD_RULES)
      .filter(([name, rule]) => {
        if (!rule.days.includes(dow)) return false;
        if (rule.excludeHoliday && isHol) return false;
        if (leaveSet.has(name)) return false;
        return true;
      })
      .map(([name]) => name);
  },
  _autoOffice(d) {
    const dow = d.getDay();
    const isHol = this._isHoliday(d);
    const leaveSet = this._leaveMap[this._fmtDate(d)] || new Set();
    return Object.entries(OFFICE_RULES)
      .filter(([name, rule]) => {
        if (!rule.days.includes(dow)) return false;
        const exHol = rule.excludeHoliday !== false; // 기본값 true (휴일 제외)
        if (exHol && (isHol || dow === 0 || dow === 6)) return false;
        if (leaveSet.has(name)) return false;
        return true;
      })
      .map(([name]) => name);
  },

  // ── 저장 항목 파싱 (@field|... / @office|... / @xfield|... / @xoffice|...) ─
  _parseStored(entries) {
    let fieldExtra = [], officeExtra = [], fieldExclude = [], officeExclude = [];
    for (const e of entries) {
      if (e.text.startsWith('@field|'))   fieldExtra   = e.text.slice(7).split('|').filter(Boolean);
      else if (e.text.startsWith('@office|'))  officeExtra  = e.text.slice(8).split('|').filter(Boolean);
      else if (e.text.startsWith('@xfield|'))  fieldExclude = e.text.slice(8).split('|').filter(Boolean);
      else if (e.text.startsWith('@xoffice|')) officeExclude = e.text.slice(9).split('|').filter(Boolean);
    }
    return { fieldExtra, officeExtra, fieldExclude, officeExclude };
  },

  // ── 렌더 ───────────────────────────────────────────────────────────
  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    try {
      const canEdit = App.canEdit('dashboard');
      const today = new Date();
      const thisWeek = this._getWeekDates(today);
      const nextWeekBase = new Date(today); nextWeekBase.setDate(today.getDate() + 7);
      const nextWeek = this._getWeekDates(nextWeekBase);
      const week3Base = new Date(today); week3Base.setDate(today.getDate() + 14);
      const week3 = this._getWeekDates(week3Base);
      const from = this._fmtDate(thisWeek[0]);
      const to   = this._fmtDate(week3[6]);

      const cy = today.getFullYear(), cm = today.getMonth() + 1;
      let ny = cy, nm = cm + 1; if (nm > 12) { nm = 1; ny++; }

      const [schedData, leaveData, empData, shTimesheet, shTimesheetNext, settingsData] = await Promise.all([
        API.get(`/api/dashboard/schedule?from=${from}&to=${to}`).catch(() => ({})),
        API.get(`/api/leaves/approved-range?from=${from}&to=${to}`).catch(() => []),
        API.get('/api/employees').catch(() => []),
        API.get(`/api/sh-timesheet?year=${cy}&month=${cm}`).catch(() => null),
        API.get(`/api/sh-timesheet?year=${ny}&month=${nm}`).catch(() => null),
        API.get('/api/settings').catch(() => ({})),
      ]);

      // 서버에 저장된 자동배치 규칙 로드
      try {
        const saved = settingsData?.schedule_rules ? JSON.parse(settingsData.schedule_rules) : null;
        if (saved?.field && saved?.office) {
          FIELD_RULES  = saved.field;
          OFFICE_RULES = saved.office;
        }
      } catch { /* 파싱 실패 시 기본값 유지 */ }

      this._scheduleData = schedData || {};
      this._leaveMap = this._buildLeaveMap(leaveData || []);
      this._shMap = this._buildShMap(shTimesheet, shTimesheetNext);
      this._employees = (empData || []).filter(e => e.status === 'active').map(e => e.name);

      content.innerHTML = `
        <div id="dash-3day" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px"></div>

        <div class="card" style="padding:0;overflow:hidden;margin-bottom:20px">
          <div style="padding:14px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #dee2e6;background:#f8f9fa">
            <span style="font-size:15px;font-weight:700">📅 3주간 근무표</span>
            ${canEdit ? `
            <button id="dash-edit-btn" onclick="Dashboard.toggleEdit()"
              style="margin-left:auto;padding:5px 14px;font-size:12px;border-radius:6px;border:1px solid #6f42c1;background:#fff;color:#6f42c1;cursor:pointer;font-weight:600">
              ✏️ 수정
            </button>
            <button onclick="Dashboard.openRulesModal()"
              style="padding:5px 14px;font-size:12px;border-radius:6px;border:1px solid #0c8599;background:#fff;color:#0c8599;cursor:pointer;font-weight:600">
              ⚙️ 자동배치 규칙
            </button>` : ''}
          </div>
          <div style="padding:16px" id="dash-schedule-wrap">
            ${this._renderTwoWeeks(thisWeek, nextWeek, week3, canEdit)}
          </div>
        </div>

        <div class="dash-grid">
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
      document.getElementById('content').innerHTML =
        `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  // ── 3주 테이블 (헤더 1회, 3행) ────────────────────────────────────
  _renderTwoWeeks(thisWeek, nextWeek, week3, canEdit) {
    if (window.innerWidth < 768) return this._renderWeeksMobile([thisWeek, nextWeek, week3], canEdit);
    const DOW = ['일','월','화','수','목','금','토'];
    const headers = DOW.map((d, i) =>
      `<th style="padding:8px 4px;text-align:center;font-size:12px;font-weight:700;border-bottom:2px solid #dee2e6;color:${i>=5?'#e03131':'#495057'};min-width:110px">${d}</th>`
    ).join('');

    return `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        <thead><tr>${headers}</tr></thead>
        <tbody>
          ${this._makeRow(thisWeek, canEdit)}
          ${this._makeRow(nextWeek, canEdit)}
          ${this._makeRow(week3, canEdit)}
        </tbody>
      </table>
    </div>`;
  },

  // ── 모바일 전용: 탭으로 주차 선택, 날짜를 행으로 ────────────────
  _renderWeeksMobile(weeks, canEdit) {
    const labels = ['이번 주', '다음 주', '3주 후'];
    const DOW = ['일','월','화','수','목','금','토'];
    const isEdit = this._editMode && canEdit;
    const todayStr = this._fmtDate(new Date());
    const sel = this._mobileWeekTab || 0;

    const tabs = labels.map((l, i) => {
      const active = i === sel;
      return `<button onclick="Dashboard._mobileWeekTab=${i};Dashboard._rerenderSchedule()"
        style="flex:1;padding:8px 4px;font-size:12px;font-weight:600;border:none;cursor:pointer;
          background:${active?'#1b4332':'#f8f9fa'};color:${active?'#fff':'#495057'};
          border-bottom:2px solid ${active?'#1b4332':'transparent'}">${l}</button>`;
    }).join('');

    const week = weeks[sel];
    const rows = week.map((d, i) => {
      const ds = this._fmtDate(d);
      const isToday = ds === todayStr;
      const isWknd = i === 0 || i === 6;
      const isHol  = this._isHoliday(d);
      const isRed  = isWknd || isHol;

      const autoField  = this._autoField(d);
      const autoOffice = this._autoOffice(d);
      const stored = this._scheduleData[ds] || [];
      const { fieldExtra, officeExtra, fieldExclude, officeExclude } = this._parseStored(stored);
      const shNames = isRed ? (this._shMap[ds] || []) : [];
      const autoFieldFiltered  = autoField.filter(n => !fieldExclude.includes(n));
      const autoOfficeFiltered = autoOffice.filter(n => !officeExclude.includes(n));
      const fieldNames  = [...new Set([...shNames, ...autoFieldFiltered, ...fieldExtra])];
      const officeNames = [...new Set([...autoOfficeFiltered, ...officeExtra])];

      const rowBg    = isToday ? '#f0fff4' : isRed ? '#fff9f9' : '#fff';
      const dowColor = isRed ? '#e03131' : '#212529';
      const dateBg   = isToday ? '#1b4332' : 'transparent';
      const dateColor= isToday ? '#fff' : dowColor;

      const fieldHtml  = this._renderSection('현장',  'field',  ds, fieldNames,  autoFieldFiltered,  fieldExtra,  shNames, isEdit);
      const officeHtml = this._renderSection('사무실', 'office', ds, officeNames, autoOfficeFiltered, officeExtra, [],     isEdit);
      const hasContent = fieldNames.length || officeNames.length;

      // 추가 행: input 한 줄 + select·버튼 한 줄로 분리 (모바일 오버플로 방지)
      const addRow = isEdit ? `
        <tr style="background:#fafafa">
          <td colspan="2" style="padding:4px 8px 7px;border-bottom:1px solid #f1f3f5">
            <input id="inp-${ds}" list="emp-dl-${ds}" placeholder="이름 입력..."
              style="width:100%;font-size:16px;padding:7px 10px;border:1px solid #dee2e6;border-radius:6px;margin-bottom:5px;box-sizing:border-box"
              onkeydown="if(event.key==='Enter'&&!event.isComposing){Dashboard._addByText('${ds}')}"
            >
            <datalist id="emp-dl-${ds}">${this._employees.map(n=>`<option value="${n}">`).join('')}</datalist>
            <div style="display:flex;gap:5px">
              <select id="typ-${ds}" style="flex:1;font-size:15px;padding:7px 6px;border:1px solid #dee2e6;border-radius:6px">
                <option value="field">현장</option>
                <option value="office">사무실</option>
              </select>
              <button onclick="Dashboard._addByText('${ds}')"
                style="flex:1;padding:7px 0;font-size:14px;font-weight:600;border:1px solid #6f42c1;border-radius:6px;background:#6f42c1;color:#fff;cursor:pointer">추가</button>
            </div>
          </td>
        </tr>` : '';

      return `
        <tr style="background:${rowBg};border-bottom:1px solid #f1f3f5">
          <td style="padding:6px 8px;width:46px;vertical-align:top">
            <div style="border-radius:7px;background:${dateBg};padding:3px 5px;text-align:center;min-width:38px">
              <div style="font-size:11px;font-weight:700;color:${dateColor}">${DOW[i]}</div>
              <div style="font-size:11px;color:${dateColor}">${d.getMonth()+1}/${d.getDate()}</div>
            </div>
          </td>
          <td style="padding:6px 8px 6px 4px;vertical-align:top">
            ${fieldHtml}${officeHtml}
            ${!hasContent && !isEdit ? '<span style="font-size:11px;color:#ced4da">-</span>' : ''}
          </td>
        </tr>
        ${addRow}`;
    }).join('');

    return `
      <div style="border:1px solid #dee2e6;border-radius:8px;overflow:hidden">
        <div style="display:flex;border-bottom:1px solid #dee2e6">${tabs}</div>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      </div>`;
  },

  _makeRow(dates, canEdit) {
    const todayStr = this._fmtDate(new Date());
    const isEdit = this._editMode && canEdit;
    const cells = dates.map((d, i) => {
      const ds = this._fmtDate(d);
      const isToday = ds === todayStr;
      const isWknd = i === 0 || i === 6;
      const isHol = this._isHoliday(d);
      const isRed = isWknd || isHol;
      const cellBg = isToday ? '#f0fff4' : isRed ? '#fff5f5' : '#fff';
      const numStyle = isToday
        ? 'background:#1b4332;color:#fff;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px'
        : `font-size:13px;font-weight:700;color:${isRed?'#e03131':'#212529'}`;

      const autoField  = this._autoField(d);
      const autoOffice = this._autoOffice(d);
      const stored = this._scheduleData[ds] || [];
      const { fieldExtra, officeExtra, fieldExclude, officeExclude } = this._parseStored(stored);
      const shNames = isRed ? (this._shMap[ds] || []) : [];

      const autoFieldFiltered  = autoField.filter(n => !fieldExclude.includes(n));
      const autoOfficeFiltered = autoOffice.filter(n => !officeExclude.includes(n));

      const fieldNames  = [...new Set([...shNames, ...autoFieldFiltered, ...fieldExtra])];
      const officeNames = [...new Set([...autoOfficeFiltered, ...officeExtra])];

      const addRow = isEdit ? `
        <div style="margin-top:5px;border-top:1px solid #f1f3f5;padding-top:5px;display:flex;gap:3px">
          <input id="inp-${ds}" list="emp-dl-${ds}" placeholder="이름 입력..."
            style="flex:1;min-width:0;font-size:12px;padding:3px 5px;border:1px solid #dee2e6;border-radius:4px"
            onkeydown="if(event.key==='Enter'&&!event.isComposing){Dashboard._addByText('${ds}')}"
          >
          <datalist id="emp-dl-${ds}">${this._employees.map(n=>`<option value="${n}">`).join('')}</datalist>
          <select id="typ-${ds}" style="font-size:10px;padding:3px;border:1px solid #dee2e6;border-radius:4px;color:#495057">
            <option value="field">현장</option>
            <option value="office">사무실</option>
          </select>
          <button onclick="Dashboard._addByText('${ds}')"
            style="font-size:10px;padding:3px 7px;border:1px solid #6f42c1;border-radius:4px;background:#6f42c1;color:#fff;cursor:pointer;white-space:nowrap">+추가</button>
        </div>` : '';

      return `<td style="padding:6px 5px;vertical-align:top;background:${cellBg};border:1px solid #f1f3f5;min-width:110px">
        <div style="${numStyle};margin-bottom:4px">${d.getMonth()+1}/${d.getDate()}</div>
        ${this._renderSection('현장', 'field', ds, fieldNames, autoFieldFiltered, fieldExtra, shNames, isEdit)}
        ${this._renderSection('사무실', 'office', ds, officeNames, autoOfficeFiltered, officeExtra, [], isEdit)}
        ${addRow}
      </td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  },

  // ── 현장/사무실 섹션 렌더링 ────────────────────────────────────────
  _renderSection(label, type, ds, allNames, autoNames, extraNames, shNames, isEdit) {
    const COLOR = { field: { bg:'#fff3e0', fg:'#e65100', border:'#ffb74d' }, office: { bg:'#e3f2fd', fg:'#1565c0', border:'#90caf9' } };
    const SH_COLOR = { '조상희':'#2d6a4f', '조상하':'#1864ab', '정재호':'#862e9c', '소재훈':'#c0392b' };
    const c = COLOR[type];
    if (!allNames.length && !isEdit) return '';

    const badges = allNames.map(name => {
      const isSh = shNames.includes(name);
      const isExtra = extraNames.includes(name);
      const isAuto = autoNames.includes(name) && !isSh;
      // 주주근무표 이름 → 개인 전용 색상
      if (isSh && SH_COLOR[name]) {
        const shc = SH_COLOR[name];
        return `<span style="display:inline-block;padding:1px 5px;border-radius:10px;font-size:10px;font-weight:700;background:${shc}22;color:${shc};border:1px solid ${shc};margin:1px">${name}</span>`;
      }
      if (isEdit && (isExtra || isAuto)) {
        const removeFn = isExtra
          ? `Dashboard._removeExtra('${ds}','${type}','${name}')`
          : `Dashboard._removeAuto('${ds}','${type}','${name}')`;
        return `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;border-radius:10px;font-size:10px;font-weight:600;background:${c.bg};color:${c.fg};border:1px solid ${c.border};margin:1px">
          ${name}<button onclick="${removeFn}" style="border:none;background:none;cursor:pointer;color:#dc2626;font-size:10px;padding:0;line-height:1">✕</button>
        </span>`;
      }
      return `<span style="display:inline-block;padding:1px 5px;border-radius:10px;font-size:10px;font-weight:600;background:${c.bg};color:${c.fg};border:1px solid ${c.border};margin:1px">${name}</span>`;
    }).join('');

    return `<div style="margin-bottom:4px">
      <div style="font-size:9px;font-weight:700;color:${c.fg};margin-bottom:2px;letter-spacing:0.5px">${label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:1px">${badges || (isEdit ? '' : `<span style="font-size:10px;color:#adb5bd">-</span>`)}</div>
    </div>`;
  },


  // ── 수정 모드 ──────────────────────────────────────────────────────
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
    const week3Base = new Date(today); week3Base.setDate(today.getDate() + 14);
    const week3 = this._getWeekDates(week3Base);
    wrap.innerHTML = this._renderTwoWeeks(thisWeek, nextWeek, week3, canEdit);
  },

  // ── 직원 추가 (이름 직접 입력 + 현장/사무실 선택) ───────────────────
  _addByText(ds) {
    const inp = document.getElementById(`inp-${ds}`);
    const typ = document.getElementById(`typ-${ds}`);
    const name = inp?.value.trim();
    const type = typ?.value || 'field';
    if (!name) { inp?.focus(); return; }
    const stored = this._scheduleData[ds] || [];
    const { fieldExtra, officeExtra, fieldExclude, officeExclude } = this._parseStored(stored);
    if (type === 'field') { if (!fieldExtra.includes(name)) fieldExtra.push(name); }
    else { if (!officeExtra.includes(name)) officeExtra.push(name); }
    this._rebuildStored(ds, fieldExtra, officeExtra, fieldExclude, officeExclude);
    this._saveDate(ds);
    inp.value = '';
    this._rerenderSchedule();
  },

  _removeExtra(ds, type, name) {
    const stored = this._scheduleData[ds] || [];
    let { fieldExtra, officeExtra, fieldExclude, officeExclude } = this._parseStored(stored);
    if (type === 'field') fieldExtra = fieldExtra.filter(n => n !== name);
    else officeExtra = officeExtra.filter(n => n !== name);
    this._rebuildStored(ds, fieldExtra, officeExtra, fieldExclude, officeExclude);
    this._saveDate(ds);
    this._rerenderSchedule();
  },

  _removeAuto(ds, type, name) {
    const stored = this._scheduleData[ds] || [];
    let { fieldExtra, officeExtra, fieldExclude, officeExclude } = this._parseStored(stored);
    if (type === 'field') { if (!fieldExclude.includes(name)) fieldExclude.push(name); }
    else { if (!officeExclude.includes(name)) officeExclude.push(name); }
    this._rebuildStored(ds, fieldExtra, officeExtra, fieldExclude, officeExclude);
    this._saveDate(ds);
    this._rerenderSchedule();
  },

  // ── 저장 데이터 재구성 ─────────────────────────────────────────────
  _rebuildStored(ds, fieldExtra, officeExtra, fieldExclude = [], officeExclude = []) {
    const entries = [];
    if (fieldExtra.length)   entries.push({ text: '@field|'   + fieldExtra.join('|'),   color: '' });
    if (officeExtra.length)  entries.push({ text: '@office|'  + officeExtra.join('|'),  color: '' });
    if (fieldExclude.length) entries.push({ text: '@xfield|'  + fieldExclude.join('|'), color: '' });
    if (officeExclude.length)entries.push({ text: '@xoffice|' + officeExclude.join('|'),color: '' });
    this._scheduleData[ds] = entries;
  },

  async _saveDate(ds) {
    try {
      const entries = (this._scheduleData[ds] || []).filter(e => e.text?.trim());
      await API.put(`/api/dashboard/schedule/${ds}`, { entries });
    } catch (e) { Utils.showToast('저장 실패: ' + e.message, 'error'); }
  },

  // ── 자동배치 규칙 편집 모달 ───────────────────────────────────────
  openRulesModal() {
    document.getElementById('dash-rules-modal')?.remove();
    const DOW_LABELS = ['일','월','화','수','목','금','토'];

    const renderRuleRows = (rules, type) =>
      Object.entries(rules).map(([name, rule], idx) => `
        <tr id="rule-row-${type}-${idx}" style="border-bottom:1px solid #f1f3f5">
          <td style="padding:6px 8px">
            <input value="${name}" data-type="${type}" data-idx="${idx}" data-field="name"
              style="width:72px;border:1px solid #dee2e6;border-radius:4px;padding:3px 6px;font-size:13px">
          </td>
          <td style="padding:6px 4px">
            <div style="display:flex;gap:3px;flex-wrap:wrap">
              ${DOW_LABELS.map((d,i) => `
                <label style="display:flex;align-items:center;gap:1px;font-size:11px;cursor:pointer">
                  <input type="checkbox" data-type="${type}" data-idx="${idx}" data-dow="${i}"
                    ${(rule.days||[]).includes(i)?'checked':''}
                    style="margin:0;cursor:pointer"> ${d}
                </label>`).join('')}
            </div>
          </td>
          <td style="padding:6px 8px;text-align:center">
            <input type="checkbox" data-type="${type}" data-idx="${idx}" data-field="excludeHoliday"
              ${rule.excludeHoliday!==false?'checked':''}
              style="cursor:pointer">
          </td>
          <td style="padding:6px 4px;text-align:center">
            <button onclick="Dashboard._deleteRuleRow('${type}',${idx})"
              style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:16px;line-height:1">×</button>
          </td>
        </tr>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'dash-rules-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;width:100%;max-width:620px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
        <div style="padding:16px 20px;border-bottom:1px solid #dee2e6;display:flex;align-items:center">
          <span style="font-weight:700;font-size:15px">⚙️ 자동배치 규칙 편집</span>
          <button onclick="document.getElementById('dash-rules-modal').remove()"
            style="margin-left:auto;border:none;background:none;font-size:20px;cursor:pointer;color:#868e96">×</button>
        </div>
        <div style="padding:16px 20px">
          <p style="font-size:12px;color:#868e96;margin:0 0 12px">요일 체크 = 해당 요일에 자동 표시 / 공휴일제외 = 공휴일엔 미표시</p>

          <div style="font-weight:700;font-size:13px;color:#1b4332;margin-bottom:6px">🏕 현장</div>
          <table id="rules-field-table" style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px">
            <thead><tr style="background:#f8f9fa">
              <th style="padding:6px 8px;text-align:left;font-weight:600;width:88px">이름</th>
              <th style="padding:6px 4px;text-align:left;font-weight:600">요일</th>
              <th style="padding:6px 8px;text-align:center;font-weight:600;width:60px">공휴일제외</th>
              <th style="width:30px"></th>
            </tr></thead>
            <tbody id="rules-field-body">${renderRuleRows(FIELD_RULES,'field')}</tbody>
          </table>
          <button onclick="Dashboard._addRuleRow('field')"
            style="font-size:12px;padding:4px 12px;border:1px dashed #74c0fc;background:#f0f9ff;color:#1971c2;border-radius:6px;cursor:pointer;margin-bottom:16px">+ 현장 추가</button>

          <div style="font-weight:700;font-size:13px;color:#364fc7;margin-bottom:6px">🏢 사무실</div>
          <table id="rules-office-table" style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px">
            <thead><tr style="background:#f8f9fa">
              <th style="padding:6px 8px;text-align:left;font-weight:600;width:88px">이름</th>
              <th style="padding:6px 4px;text-align:left;font-weight:600">요일</th>
              <th style="padding:6px 8px;text-align:center;font-weight:600;width:60px">공휴일제외</th>
              <th style="width:30px"></th>
            </tr></thead>
            <tbody id="rules-office-body">${renderRuleRows(OFFICE_RULES,'office')}</tbody>
          </table>
          <button onclick="Dashboard._addRuleRow('office')"
            style="font-size:12px;padding:4px 12px;border:1px dashed #74c0fc;background:#f0f9ff;color:#1971c2;border-radius:6px;cursor:pointer;margin-bottom:16px">+ 사무실 추가</button>

          <div style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #dee2e6;padding-top:12px">
            <button onclick="document.getElementById('dash-rules-modal').remove()"
              style="padding:8px 20px;border:1px solid #dee2e6;background:#fff;border-radius:6px;cursor:pointer">취소</button>
            <button onclick="Dashboard._saveRules()"
              style="padding:8px 20px;background:#1b4332;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">저장</button>
          </div>
        </div>
      </div>`;
    overlay.addEventListener('mousedown', e => { overlay._mdTarget = e.target; });
    overlay.addEventListener('click', e => { if (e.target === overlay && overlay._mdTarget === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  },

  _addRuleRow(type) {
    const tbody = document.getElementById(`rules-${type}-body`);
    const idx = tbody.querySelectorAll('tr').length;
    const DOW_LABELS = ['일','월','화','수','목','금','토'];
    const tr = document.createElement('tr');
    tr.id = `rule-row-${type}-${idx}`;
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.innerHTML = `
      <td style="padding:6px 8px">
        <input value="" data-type="${type}" data-idx="${idx}" data-field="name"
          style="width:72px;border:1px solid #dee2e6;border-radius:4px;padding:3px 6px;font-size:13px" placeholder="이름">
      </td>
      <td style="padding:6px 4px">
        <div style="display:flex;gap:3px;flex-wrap:wrap">
          ${DOW_LABELS.map((d,i) => `
            <label style="display:flex;align-items:center;gap:1px;font-size:11px;cursor:pointer">
              <input type="checkbox" data-type="${type}" data-idx="${idx}" data-dow="${i}"
                style="margin:0;cursor:pointer"> ${d}
            </label>`).join('')}
        </div>
      </td>
      <td style="padding:6px 8px;text-align:center">
        <input type="checkbox" data-type="${type}" data-idx="${idx}" data-field="excludeHoliday" checked style="cursor:pointer">
      </td>
      <td style="padding:6px 4px;text-align:center">
        <button onclick="this.closest('tr').remove()"
          style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:16px;line-height:1">×</button>
      </td>`;
    tbody.appendChild(tr);
  },

  _deleteRuleRow(type, idx) {
    document.getElementById(`rule-row-${type}-${idx}`)?.remove();
  },

  _collectRules(type) {
    const tbody = document.getElementById(`rules-${type}-body`);
    const rules = {};
    tbody.querySelectorAll('tr').forEach(tr => {
      const nameEl = tr.querySelector('[data-field="name"]');
      const name = nameEl?.value.trim();
      if (!name) return;
      const days = [];
      tr.querySelectorAll('[data-dow]').forEach(cb => { if (cb.checked) days.push(parseInt(cb.dataset.dow)); });
      const exHolEl = tr.querySelector('[data-field="excludeHoliday"]');
      rules[name] = { days, excludeHoliday: exHolEl ? exHolEl.checked : false };
    });
    return rules;
  },

  async _saveRules() {
    const newField  = this._collectRules('field');
    const newOffice = this._collectRules('office');
    try {
      await API.post('/api/settings', { schedule_rules: JSON.stringify({ field: newField, office: newOffice }) });
      FIELD_RULES  = newField;
      OFFICE_RULES = newOffice;
      document.getElementById('dash-rules-modal').remove();
      this._rerenderSchedule();
      Utils.showToast('자동배치 규칙이 저장되었습니다.');
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
    this._render3Day();
  },

  _render3Day() {
    const el = document.getElementById('dash-3day');
    if (!el) return;
    const pad = n => String(n).padStart(2, '0');
    const toStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const labels = ['오늘', '내일', '모레'];
    const days = [0, 1, 2].map(i => { const d = new Date(); d.setDate(d.getDate() + i); return d; });

    el.innerHTML = days.map((d, i) => {
      const dateStr = toStr(d);
      const dow = ['일','월','화','수','목','금','토'][d.getDay()];
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const events = (this.gcalEvents || []).filter(e => {
        const start = (e.start || '').slice(0, 10);
        const end   = (e.end   || '').slice(0, 10);
        return start <= dateStr && dateStr <= (end || start);
      });
      const evHtml = events.length
        ? events.map(e => `<div style="font-size:11px;color:#1b4332;background:#d1fae5;border-radius:3px;padding:2px 5px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.title||''}">${e.title||'(제목없음)'}</div>`).join('')
        : `<div style="font-size:11px;color:#adb5bd;margin-top:4px">일정 없음</div>`;
      return `<div style="background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:8px 10px;min-width:0">
        <div style="font-size:11px;font-weight:700;color:${isWeekend?'#e74c3c':'#495057'};margin-bottom:2px">${labels[i]} <span style="font-weight:400">(${d.getMonth()+1}/${d.getDate()} ${dow})</span></div>
        ${evHtml}
      </div>`;
    }).join('');
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
    const thRow = DOW_KR.map((k,i) => {
      const c = i===0?'color:#e03131':i===6?'color:#1c7ed6':'color:#495057';
      return `<th style="${c};padding:6px 2px;text-align:center;font-size:11px;font-weight:600;border-bottom:2px solid #dee2e6">${k}</th>`;
    }).join('');

    let cells = Array(firstDow).fill(`<td></td>`);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;
      const isToday = dateStr === todayStr;
      const isHol = typeof krIsHoliday === 'function' ? krIsHoliday(year, month, d) : false;
      const isSun = dow===0, isSat = dow===6, isRed = isHol||isSun;
      const evts = eventMap[d] || [];
      const numStyle = isToday
        ? 'background:#1b4332;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-weight:700'
        : isRed?'color:#e03131;font-weight:600':isSat?'color:#1c7ed6;font-weight:600':'color:#212529';
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
    for (let i = 0; i < cells.length; i += 7) rows += `<tr>${cells.slice(i,i+7).join('')}</tr>`;
    const gcalNote = this.gcalEvents.length > 0
      ? `<div style="font-size:11px;color:#6c757d;margin-top:8px;text-align:right">🟢 구글캘린더 ${this.gcalEvents.length}개 일정 동기화됨</div>`
      : `<div style="font-size:11px;color:#adb5bd;margin-top:8px;text-align:right">구글캘린더 미연동</div>`;
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
        const isHol = typeof krIsHoliday === 'function' ? krIsHoliday(year, month, d) : false;
        const isRed = dow===0||isHol, isSat = dow===6;
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

  // ── 구글캘린더 이벤트 추가/수정/삭제 ─────────────────────────────
  openAddEvent(dateStr) {
    document.getElementById('gcal-add-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'gcal-add-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px">📅 일정 추가 <span style="font-size:13px;font-weight:400;color:#6c757d">${dateStr}</span></div>
        <div class="form-group"><label class="form-label">제목 *</label>
          <input id="gcal-title" class="form-control" placeholder="일정 제목" autofocus></div>
        <div style="display:flex;gap:10px;margin-top:10px" id="gcal-time-row">
          <div class="form-group" style="flex:1"><label class="form-label">시작</label>
            <input id="gcal-start-time" type="time" class="form-control" value="09:00"></div>
          <div class="form-group" style="flex:1"><label class="form-label">종료</label>
            <input id="gcal-end-time" type="time" class="form-control" value="18:00"></div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="gcal-allday" onchange="Dashboard.toggleAllDay(this)"> 종일 일정</label></div>
        <div class="form-group" style="margin-top:10px"><label class="form-label">메모</label>
          <textarea id="gcal-desc" class="form-control" rows="2"></textarea></div>
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
    const row = document.getElementById('gcal-time-row');
    if (row) row.style.display = cb.checked ? 'none' : 'flex';
  },
  async submitAddEvent(dateStr) {
    const title = document.getElementById('gcal-title')?.value.trim();
    if (!title) { Utils.showToast('제목을 입력해주세요', 'error'); return; }
    const allDay = document.getElementById('gcal-allday')?.checked;
    const startTime = document.getElementById('gcal-start-time')?.value || '09:00';
    const endTime   = document.getElementById('gcal-end-time')?.value   || '18:00';
    const desc = document.getElementById('gcal-desc')?.value.trim();
    const btn = document.querySelector('#gcal-add-modal .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      const payload = allDay
        ? { title, start: dateStr, end: dateStr, description: desc, allDay: true }
        : { title, start: `${dateStr}T${startTime}:00`, end: `${dateStr}T${endTime}:00`, description: desc, allDay: false };
      await API.post('/api/gcal/push-event', payload);
      document.getElementById('gcal-add-modal')?.remove();
      Utils.showToast('구글캘린더에 등록되었습니다.');
      await this.loadGcalEvents();
    } catch (e) {
      Utils.showToast('등록 실패: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    }
  },
  openEditEvent(eventId) {
    const ev = this.gcalEvents.find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('gcal-edit-modal')?.remove();
    const isAllDay = ev.allDay;
    const startRaw = ev.start || '', startDate = startRaw.slice(0,10);
    const startTime = isAllDay ? '09:00' : (startRaw.slice(11,16) || '09:00');
    const endRaw = ev.end || '', endTime = isAllDay ? '18:00' : (endRaw.slice(11,16) || '18:00');
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
          <div class="form-group" style="flex:1"><label class="form-label">시작</label>
            <input id="gcal-edit-start-time" type="time" class="form-control" value="${startTime}"></div>
          <div class="form-group" style="flex:1"><label class="form-label">종료</label>
            <input id="gcal-edit-end-time" type="time" class="form-control" value="${endTime}"></div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" id="gcal-edit-allday" ${isAllDay?'checked':''} onchange="Dashboard.toggleEditAllDay(this)"> 종일 일정</label></div>
        <div class="form-group" style="margin-top:10px"><label class="form-label">메모</label>
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
    const row = document.getElementById('gcal-edit-time-row');
    if (row) row.style.display = cb.checked ? 'none' : 'flex';
  },
  async submitEditEvent(eventId) {
    const title = document.getElementById('gcal-edit-title')?.value.trim();
    if (!title) { Utils.showToast('제목을 입력해주세요', 'error'); return; }
    const allDay = document.getElementById('gcal-edit-allday')?.checked;
    const date = document.getElementById('gcal-edit-date')?.value;
    const startTime = document.getElementById('gcal-edit-start-time')?.value || '09:00';
    const endTime   = document.getElementById('gcal-edit-end-time')?.value   || '18:00';
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
    const btn = document.querySelector(`#${modalId} .btn-danger`);
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    try {
      await API.delete(`/api/gcal/events/${eventId}`);
      document.getElementById(modalId)?.remove();
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
