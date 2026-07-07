const ShareholderTimesheet = {
  data: null,
  extraData: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,

  // 이름 → 닉네임
  NICK: { '조상희': '샘', '조상하': '비드', '정재호': '캐리', '소재훈': '빌리' },
  // 담당자 요금
  RATE_WEEKDAY: 200000,   // 월~목
  RATE_FRIDAY:  250000,   // 금요일(비공휴)
  RATE_WEEKEND: 300000,   // 토·일·공휴(금요일 공휴 포함)
  // 추가 출근 요금
  RATE_EXTRA_WEEKDAY: 100000,  // 월~목
  RATE_EXTRA_FRIDAY:  150000,  // 금요일(비공휴)
  RATE_EXTRA_WEEKEND: 200000,  // 토·일·공휴

  // 공휴일 목록 YYYY-MM-DD (대체공휴일 포함)
  HOLIDAYS: new Set([
    // ── 2025 ──
    '2025-01-01',                                           // 신정
    '2025-01-28','2025-01-29','2025-01-30',                 // 설날 연휴
    '2025-03-01','2025-03-03',                              // 삼일절 + 대체(3/1토→3/3월)
    '2025-05-05','2025-05-06',                              // 어린이날 + 부처님오신날(겹침)대체
    '2025-06-06',                                           // 현충일
    '2025-08-15',                                           // 광복절
    '2025-10-03',                                           // 개천절
    '2025-10-05','2025-10-06','2025-10-07','2025-10-08',    // 추석연휴 + 대체(10/5일→10/8수)
    '2025-10-09',                                           // 한글날
    '2025-12-25',                                           // 크리스마스
    // ── 2026 ──
    '2026-01-01',                                           // 신정
    '2026-02-16','2026-02-17','2026-02-18',                 // 설날 연휴
    '2026-03-01','2026-03-02',                              // 삼일절 + 대체(3/1일→3/2월)
    '2026-05-05',                                           // 어린이날
    '2026-05-24','2026-05-25',                              // 부처님오신날 + 대체(5/24일→5/25월)
    '2026-06-06',                                           // 현충일(토, 대체없음)
    '2026-07-17',                                           // 제헌절(2026년 부활!)
    '2026-08-15','2026-08-17',                              // 광복절 + 대체(8/15토→8/17월)
    '2026-09-24','2026-09-25','2026-09-26','2026-09-28',    // 추석연휴 + 대체(9/26토→9/28월)
    '2026-10-03','2026-10-05',                              // 개천절 + 대체(10/3토→10/5월)
    '2026-10-09',                                           // 한글날
    '2026-12-25',                                           // 크리스마스
    // ── 2027 ──
    '2027-01-01',                                           // 신정
    '2027-02-06','2027-02-07','2027-02-08','2027-02-09',    // 설날 연휴 + 대체
    '2027-03-01',                                           // 삼일절(월)
    '2027-05-05',                                           // 어린이날
    '2027-05-13',                                           // 부처님오신날
    '2027-06-06','2027-06-07',                              // 현충일(일) + 대체(6/7월) - 현충일 대체 법개정 여부 확인 필요
    '2027-07-17',                                           // 제헌절
    '2027-08-15','2027-08-16',                              // 광복절(일) + 대체(8/16월)
    '2027-10-03','2027-10-04',                              // 개천절(일) + 대체(10/4월)
    '2027-10-09','2027-10-11',                              // 한글날(토) + 대체(10/11월)
    '2027-10-14','2027-10-15','2027-10-16',                 // 추석 연휴
    '2027-12-25','2027-12-27',                              // 크리스마스(토) + 대체(12/27월)
  ]),

  nick(name) { return this.NICK[name] || name; },

  isHoliday(year, month, day) {
    return this.HOLIDAYS.has(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
  },

  dayType(year, month, day) {
    if (this.isHoliday(year, month, day)) return 'holiday';
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0) return 'sunday';
    if (dow === 6) return 'saturday';
    if (dow === 5) return 'friday';
    return 'weekday';
  },

  rate(year, month, day) {
    const t = this.dayType(year, month, day);
    if (t === 'sunday' || t === 'saturday' || t === 'holiday') return this.RATE_WEEKEND;
    if (t === 'friday') return this.RATE_FRIDAY;
    return this.RATE_WEEKDAY;
  },

  extraRate(year, month, day) {
    const t = this.dayType(year, month, day);
    if (t === 'sunday' || t === 'saturday' || t === 'holiday') return this.RATE_EXTRA_WEEKEND;
    if (t === 'friday') return this.RATE_EXTRA_FRIDAY;
    return this.RATE_EXTRA_WEEKDAY;
  },

  async render() {
    if (!['admin','superadmin'].includes(App.user.role)) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>접근 권한이 없습니다</div>';
      return;
    }
    document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    await this.load(this.currentYear, this.currentMonth);
  },

  async load(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    try {
      [this.data, this.extraData] = await Promise.all([
        API.get(`/api/sh-timesheet?year=${year}&month=${month}`),
        API.get(`/api/sh-timesheet/extra?year=${year}&month=${month}`)
      ]);
      // 데이터가 비어있는 달이면 자동 입력
      const isEmpty = this.data.employees.every(e => e.days.length === 0);
      if (isEmpty) await this._silentAutoFill(year, month, this.data.days, this.data.employees);
      this.renderPage();
    } catch (e) {
      document.getElementById('content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  async _silentAutoFill(year, month, days, employees) {
    const find = (fullName, nick) =>
      employees.find(e => e.name === fullName) ||
      employees.find(e => this.nick(e.name) === nick) ||
      employees.find(e => e.name.includes(fullName.slice(1)));
    const sam = find('조상희','샘'), bid = find('조상하','비드');
    const cari = find('정재호','캐리'), billy = find('소재훈','빌리');
    if (!sam || !bid || !cari || !billy) return;

    const weekdayRot = [bid, cari, billy];
    const weekendRot = [bid, billy];
    const { wdIdx: wdStart, weIdx: weStart } = this._calcRotationStart(year, month);
    let wdIdx = wdStart, weIdx = weStart;

    const schedule = {};
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const isHol = this.isHoliday(year, month, d);
      if (dow === 0) { schedule[d] = [sam.id]; }
      else if (dow === 1 && !isHol) { schedule[d] = [sam.id]; }
      else if (isHol || dow === 6) { schedule[d] = [weekendRot[weIdx++ % 2].id]; }
      else { schedule[d] = [weekdayRot[wdIdx++ % 3].id]; }
    }

    const batchDays = [];
    employees.forEach(emp => {
      for (let d = 1; d <= days; d++) {
        batchDays.push({ user_id: emp.id, day: d, participated: !!(schedule[d]?.includes(emp.id)) });
      }
    });
    try {
      await API.post('/api/sh-timesheet/batch', { year, month, days: batchDays });
      employees.forEach(emp => {
        emp.days = [];
        for (let d = 1; d <= days; d++) {
          if (schedule[d]?.includes(emp.id)) emp.days.push(d);
        }
      });
    } catch {}
  },

  renderPage() {
    const { year, month, days, employees, note } = this.data;
    const now = new Date();

    // 월 탭 (현재 +2개월까지)
    const tabs = [];
    const startYear = 2026, startMonth = 6;
    let maxTm = now.getMonth() + 3, maxTy = now.getFullYear();
    if (maxTm > 12) { maxTm -= 12; maxTy++; }
    let ty = startYear, tm = startMonth;
    while (ty < maxTy || (ty === maxTy && tm <= maxTm)) {
      const active = (ty === year && tm === month) ? 'active' : '';
      tabs.push(`<button class="tab ${active}" onclick="ShareholderTimesheet.load(${ty},${tm})">${ty}년 ${tm}월</button>`);
      tm++; if (tm > 12) { tm = 1; ty++; }
    }

    // 달력 데이터: 참여 Set 구성
    const partMap = {};
    employees.forEach(e => { partMap[e.id] = new Set(e.days); });

    // 달력 HTML 생성
    const calHtml = this.buildCalendar(year, month, days, employees, partMap);

    // 요약 테이블
    const summaryHtml = this.buildSummary(year, month, days, employees, partMap);

    document.getElementById('content').innerHTML = `
      <style>
        .sh-cal-wrap { overflow-x: auto; }
        .sh-cal { border-collapse: collapse; width: 100%; font-size: 13px; }
        .sh-cal th { background: #1b4332; color: #fff; text-align: center; padding: 8px 4px; border: 1px solid #495057; font-size: 12px; }
        .sh-cal td { border: 1px solid #dee2e6; vertical-align: top; padding: 4px; }
        .sh-day-num { font-size: 11px; font-weight: 700; margin-bottom: 4px; padding: 2px 4px; display: inline-block; border-radius: 4px; min-width: 22px; text-align: center; }
        .sh-name-badge {
          display: inline-block; padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;
          margin: 1px; cursor: pointer; user-select: none; transition: all 0.15s;
        }
        .sh-name-badge.on  { opacity: 1; }
        .sh-name-badge.off { opacity: 0.2; filter: grayscale(1); }
        .sh-sum-table { border-collapse: collapse; width: 100%; font-size: 12px; }
        .sh-sum-table th { background: #1b4332; color: #fff; padding: 5px 8px; text-align: center; border: 1px solid #495057; }
        .sh-sum-table td { padding: 5px 8px; border: 1px solid #dee2e6; text-align: center; }
        .sh-sum-table tfoot td { background: #f8f9fa; font-weight: 700; }
        .sh-extra-cal .sh-name-badge { padding: 2px 5px; font-size: 10px; }
        .sh-extra-cal .sh-cal td { padding: 3px; }
      </style>

      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="tabs" style="margin:0;flex-wrap:wrap">${tabs.join('')}</div>
        <div style="margin-left:auto;display:flex;gap:6px">
          ${App.user.role === 'superadmin' ? '<button class="btn btn-primary btn-sm" onclick="ShareholderTimesheet.autoFill()">📅 자동 입력</button>' : ''}
          <button class="btn btn-secondary btn-sm" onclick="ShareholderTimesheet.downloadExcel()">📥 엑셀</button>
        </div>
      </div>

      <!-- 두 달력 가로 배치 -->
      <div class="card" style="padding:16px">
        <div style="display:flex;gap:16px;align-items:flex-start">
          <div style="flex:2;min-width:0">
            <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:12px;color:#1b4332">
              📋 ${year}년 ${month}월 주주 근무표
            </div>
            <div class="sh-cal-wrap">${calHtml}</div>
          </div>
          <div style="flex:1;min-width:0" class="sh-extra-cal">
            <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:12px;color:#495057">
              ➕ 추가 출근
            </div>
            <div class="sh-cal-wrap">${this.buildExtraCalendar(year, month, days)}</div>
          </div>
        </div>
      </div>

      <!-- 주주근무표 요약 + 추가수당합계 나란히 (2/3 + 1/3) -->
      <div class="card" style="margin-top:0;padding:16px">
        <div style="display:flex;gap:16px;align-items:flex-start">
          <div style="flex:2;min-width:0">
            <div style="font-weight:700;margin-bottom:8px;color:#495057">📋 주주 근무표 요약 <span style="font-size:11px;font-weight:400;color:#6c757d">(월~목 20만 · 금 25만 · 주말·공휴 30만원)</span></div>
            <div id="main-summary-wrap">${summaryHtml}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;margin-bottom:8px;color:#495057">➕ 추가 출근 요약 <span style="font-size:11px;font-weight:400;color:#6c757d">(월~목 10만 · 금 15만 · 주말·공휴 20만원)</span></div>
            <div id="extra-summary-wrap">${this.buildExtraSummaryTable(year, month)}</div>
          </div>
        </div>
      </div>

      <!-- 합계 (담당+추가 합산) -->
      <div class="card" style="margin-top:0">
        <div class="card-title">📊 ${year}년 ${month}월 합계</div>
        <div id="grand-total-wrap">${this.buildGrandTotal(year, month, days, employees, partMap)}</div>
      </div>

      <div class="card" style="margin-top:0">
        <div class="card-title">📝 고려사항 / 메모</div>
        <textarea id="sh-note" style="width:100%;min-height:80px;padding:10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px;resize:vertical">${note}</textarea>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="ShareholderTimesheet.saveNote()">메모 저장</button>
        </div>
      </div>
    `;
  },

  buildCalendar(year, month, days, employees, partMap) {
    const DOW_KR = ['일','월','화','수','목','금','토'];
    const COLORS = {
      '조상희': { on: '#2d6a4f', off: '#2d6a4f' },
      '조상하': { on: '#1864ab', off: '#1864ab' },
      '정재호': { on: '#862e9c', off: '#862e9c' },
      '소재훈': { on: '#c0392b', off: '#c0392b' }
    };

    // 날짜를 주 단위로 묶기
    const firstDow = new Date(year, month - 1, 1).getDay(); // 1일의 요일 (0=일)
    const weeks = [];
    let week = new Array(7).fill(null);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      week[dow] = d;
      if (dow === 6 || d === days) {
        weeks.push([...week]);
        week = new Array(7).fill(null);
      }
    }

    const thRow = DOW_KR.map((k, i) => {
      const c = i === 0 ? 'color:#ff8787' : i === 6 ? 'color:#74c0fc' : '';
      return `<th style="${c}">${k}</th>`;
    }).join('');

    const bodyRows = weeks.map(wk => {
      const cells = wk.map((d, dow) => {
        if (!d) return `<td style="background:#f8f9fa"></td>`;
        const dtype = this.dayType(year, month, d);
        const isRedDay = dtype === 'sunday' || dtype === 'holiday';
        const isSat = dtype === 'saturday';
        const isSpecial = isRedDay || isSat;
        const cellBg = isRedDay ? '#fff5f5' : isSat ? '#f0f5ff' : '';
        const numColor = isRedDay ? '#e03131' : isSat ? '#1971c2' : '#212529';
        const numBg = isRedDay ? '#ffe3e3' : isSat ? '#dbe4ff' : 'transparent';

        const badges = employees.map(emp => {
          const isOn = partMap[emp.id]?.has(d);
          const color = COLORS[emp.name]?.on || '#495057';
          const bgOn = color + '22';
          const style = isOn
            ? `background:${bgOn};color:${color};border:1.5px solid ${color}`
            : `background:#f1f3f5;color:#adb5bd;border:1.5px solid #dee2e6`;
          const clickable = App.user.role === 'superadmin';
          return `<span class="sh-name-badge ${isOn ? 'on' : 'off'}"
            id="badge-${emp.id}-${d}"
            style="${style};font-size:12px;padding:3px 6px;text-align:center${clickable ? ';cursor:pointer' : ''}"
            ${clickable ? `onclick="ShareholderTimesheet.toggle(${emp.id},${d},this)"` : ''}
          >${this.nick(emp.name)}</span>`;
        }).join('');

        return `<td style="${cellBg ? 'background:'+cellBg : ''}">
          <div class="sh-day-num" style="color:${numColor};background:${numBg}">${d}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">${badges}</div>
        </td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `<table class="sh-cal"><thead><tr>${thRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  },

  buildSummary(year, month, days, employees, partMap) {
    const rows = employees.map(emp => {
      let weekday = 0, friday = 0, weekend = 0;
      partMap[emp.id].forEach(d => {
        const t = this.dayType(year, month, d);
        if (t === 'sunday' || t === 'saturday' || t === 'holiday') weekend++;
        else if (t === 'friday') friday++;
        else weekday++;
      });
      const total = weekday + friday + weekend;
      const amt = weekday * this.RATE_WEEKDAY + friday * this.RATE_FRIDAY + weekend * this.RATE_WEEKEND;
      return { name: emp.name, nick: this.nick(emp.name), weekday, friday, weekend, total, amt };
    });

    const totals = rows.reduce((a, r) => {
      a.weekday += r.weekday; a.friday += r.friday; a.weekend += r.weekend;
      a.total += r.total; a.amt += r.amt;
      return a;
    }, { weekday:0, friday:0, weekend:0, total:0, amt:0 });

    const bodyRows = rows.map(r => `
      <tr>
        <td style="font-weight:700">${r.nick}<br><span style="font-size:11px;color:#6c757d">${r.name}</span></td>
        <td>${r.weekday}</td>
        <td>${r.friday}</td>
        <td>${r.weekend}</td>
        <td><strong>${r.total}</strong></td>
        <td style="font-weight:700;color:#1b4332">${r.amt ? Utils.formatNum(r.amt)+'원' : '-'}</td>
      </tr>`).join('');

    return `<table class="sh-sum-table">
      <thead>
        <tr>
          <th>이름</th>
          <th>주중횟수</th>
          <th>금요일횟수</th>
          <th>주말/공휴횟수</th>
          <th>합계</th>
          <th>총합계</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td>합계</td>
          <td>${totals.weekday}</td>
          <td>${totals.friday}</td>
          <td>${totals.weekend}</td>
          <td>${totals.total}</td>
          <td>${totals.amt ? Utils.formatNum(totals.amt)+'원' : '-'}</td>
        </tr>
      </tfoot>
    </table>`;
  },

  async toggle(userId, day, badge) {
    const emp = this.data.employees.find(e => e.id === userId);
    if (!emp) return;
    const isOn = badge.classList.contains('on');
    const newState = !isOn;

    // 즉시 UI 업데이트
    const COLORS = { '조상희': '#2d6a4f', '조상하': '#1864ab', '정재호': '#862e9c', '소재훈': '#c0392b' };
    const color = COLORS[emp.name] || '#495057';
    if (newState) {
      badge.classList.replace('off', 'on');
      badge.style.cssText = `background:${color}22;color:${color};border:1.5px solid ${color}`;
      emp.days.push(day);
    } else {
      badge.classList.replace('on', 'off');
      badge.style.cssText = `background:#f1f3f5;color:#adb5bd;border:1.5px solid #dee2e6`;
      emp.days = emp.days.filter(d => d !== day);
    }

    // 요약 갱신
    this.refreshSummary();

    try {
      await API.post('/api/sh-timesheet/toggle', {
        user_id: userId, year: this.currentYear, month: this.currentMonth, day, participated: newState
      });
    } catch (e) { Utils.showToast('저장 실패: ' + e.message, 'error'); }
  },

  refreshSummary() {
    const { year, month, days, employees } = this.data;
    const partMap = {};
    employees.forEach(e => { partMap[e.id] = new Set(e.days); });
    const wrap = document.getElementById('main-summary-wrap');
    if (wrap) wrap.innerHTML = this.buildSummary(year, month, days, employees, partMap);
    const grandWrap = document.getElementById('grand-total-wrap');
    if (grandWrap) grandWrap.innerHTML = this.buildGrandTotal(year, month, days, employees, partMap);
  },

  async saveNote() {
    const content = document.getElementById('sh-note')?.value || '';
    try {
      await API.post('/api/sh-timesheet/notes', { year: this.currentYear, month: this.currentMonth, content });
      Utils.showToast('메모가 저장되었습니다.');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  buildExtraCalendar(year, month, days) {
    if (!this.extraData) return '<div style="color:#adb5bd;font-size:13px;padding:8px">데이터 로딩 실패</div>';
    const emps = this.extraData.employees;
    const COLORS = { '조상희': '#2d6a4f', '조상하': '#1864ab', '정재호': '#862e9c', '소재훈': '#c0392b' };
    const DOW_KR = ['일','월','화','수','목','금','토'];

    const firstDow = new Date(year, month - 1, 1).getDay();
    const weeks = [];
    let week = new Array(7).fill(null);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      week[dow] = d;
      if (dow === 6 || d === days) { weeks.push([...week]); week = new Array(7).fill(null); }
    }

    const thRow = DOW_KR.map((k, i) => {
      const c = i === 0 ? 'color:#ff8787' : i === 6 ? 'color:#74c0fc' : '';
      return `<th style="${c}">${k}</th>`;
    }).join('');

    const bodyRows = weeks.map(wk => {
      const cells = wk.map((d, dow) => {
        if (!d) return `<td style="background:#f8f9fa"></td>`;
        const dtype = this.dayType(year, month, d);
        const isRedDay = dtype === 'sunday' || dtype === 'holiday';
        const isSat = dtype === 'saturday';
        const cellBg = isRedDay ? '#fff5f5' : isSat ? '#f0f5ff' : '';
        const numColor = isRedDay ? '#e03131' : isSat ? '#1971c2' : '#212529';
        const numBg = isRedDay ? '#ffe3e3' : isSat ? '#dbe4ff' : 'transparent';
        const badges = emps.map(emp => {
          const isOn = emp.days.includes(d);
          const color = COLORS[emp.name] || '#495057';
          const style = isOn
            ? `background:${color}22;color:${color};border:1.5px solid ${color}`
            : `background:#f1f3f5;color:#adb5bd;border:1.5px solid #dee2e6`;
          const clickableExtra = App.user.role === 'superadmin';
          return `<span class="sh-name-badge ${isOn ? 'on' : 'off'}"
            id="extra-badge-${emp.id}-${d}"
            style="${style}${clickableExtra ? ';cursor:pointer' : ''}"
            ${clickableExtra ? `onclick="ShareholderTimesheet.toggleExtra(${emp.id},${d},this)"` : ''}
          >${this.nick(emp.name)}</span>`;
        }).join('');

        return `<td style="${cellBg ? 'background:'+cellBg : ''}">
          <div class="sh-day-num" style="color:${numColor};background:${numBg}">${d}</div>
          <div style="display:flex;flex-wrap:wrap;gap:2px">${badges}</div>
        </td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `<table class="sh-cal"><thead><tr>${thRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  },

  buildExtraSummaryTable(year, month) {
    if (!this.extraData) return '<div style="color:#adb5bd;font-size:13px">데이터 없음</div>';
    const emps = this.extraData.employees;
    const rows = emps.map(emp => {
      let wd = 0, fri = 0, we = 0;
      emp.days.forEach(d => {
        const t = this.dayType(year, month, d);
        if (t === 'sunday' || t === 'saturday' || t === 'holiday') we++;
        else if (t === 'friday') fri++;
        else wd++;
      });
      const amt = wd * this.RATE_EXTRA_WEEKDAY + fri * this.RATE_EXTRA_FRIDAY + we * this.RATE_EXTRA_WEEKEND;
      return { nick: this.nick(emp.name), name: emp.name, wd, fri, we, total: wd+fri+we, amt };
    });
    const totals = rows.reduce((a,r) => { a.wd+=r.wd; a.fri+=r.fri; a.we+=r.we; a.total+=r.total; a.amt+=r.amt; return a; }, {wd:0,fri:0,we:0,total:0,amt:0});
    return `<table class="sh-sum-table">
      <thead><tr><th>이름</th><th>주중횟수</th><th>금요일횟수</th><th>주말/공휴횟수</th><th>합계</th><th>총합계</th></tr></thead>
      <tbody id="extra-summary-body">${rows.map(r => `<tr>
        <td style="font-weight:700">${r.nick}<br><span style="font-size:11px;color:#6c757d">${r.name}</span></td>
        <td>${r.wd}</td><td>${r.fri}</td><td>${r.we}</td><td><strong>${r.total}</strong></td>
        <td style="font-weight:700;color:#1b4332">${r.amt ? Utils.formatNum(r.amt)+'원' : '-'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td>합계</td><td>${totals.wd}</td><td>${totals.fri}</td><td>${totals.we}</td><td>${totals.total}</td><td>${totals.amt ? Utils.formatNum(totals.amt)+'원' : '-'}</td></tr></tfoot>
    </table>`;
  },

  buildGrandTotal(year, month, days, employees, partMap) {
    if (!this.extraData) return '';
    const extraEmps = this.extraData.employees;
    const rows = employees.map(emp => {
      // 담당 수당
      let wd=0, fri=0, we=0;
      (partMap[emp.id] || new Set()).forEach(d => {
        const t = this.dayType(year, month, d);
        if (t==='sunday'||t==='saturday'||t==='holiday') we++;
        else if (t==='friday') fri++;
        else wd++;
      });
      const mainAmt = wd*this.RATE_WEEKDAY + fri*this.RATE_FRIDAY + we*this.RATE_WEEKEND;
      // 추가 수당
      let ewd=0, efri=0, ewe=0;
      const extraEmp = extraEmps.find(e => e.id === emp.id);
      (extraEmp?.days || []).forEach(d => {
        const t = this.dayType(year, month, d);
        if (t==='sunday'||t==='saturday'||t==='holiday') ewe++;
        else if (t==='friday') efri++;
        else ewd++;
      });
      const extraAmt = ewd*this.RATE_EXTRA_WEEKDAY + efri*this.RATE_EXTRA_FRIDAY + ewe*this.RATE_EXTRA_WEEKEND;
      return { nick: this.nick(emp.name), name: emp.name, mainAmt, extraAmt, total: mainAmt+extraAmt };
    });
    const totals = rows.reduce((a,r) => { a.mainAmt+=r.mainAmt; a.extraAmt+=r.extraAmt; a.total+=r.total; return a; }, {mainAmt:0,extraAmt:0,total:0});
    return `<table class="sh-sum-table">
      <thead><tr><th>이름</th><th>담당 수당</th><th>추가 수당</th><th>최종 합계</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td style="font-weight:700">${r.nick}<br><span style="font-size:11px;color:#6c757d">${r.name}</span></td>
        <td>${r.mainAmt ? Utils.formatNum(r.mainAmt)+'원' : '-'}</td>
        <td>${r.extraAmt ? Utils.formatNum(r.extraAmt)+'원' : '-'}</td>
        <td style="font-weight:700;color:#1b4332">${r.total ? Utils.formatNum(r.total)+'원' : '-'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td>합계</td><td>${totals.mainAmt ? Utils.formatNum(totals.mainAmt)+'원' : '-'}</td><td>${totals.extraAmt ? Utils.formatNum(totals.extraAmt)+'원' : '-'}</td><td style="font-weight:700">${totals.total ? Utils.formatNum(totals.total)+'원' : '-'}</td></tr></tfoot>
    </table>`;
  },

  async toggleExtra(userId, day, badge) {
    const emp = this.extraData?.employees.find(e => e.id === userId);
    if (!emp) return;
    const isOn = badge.classList.contains('on');
    const newState = !isOn;
    const COLORS = { '조상희': '#2d6a4f', '조상하': '#1864ab', '정재호': '#862e9c', '소재훈': '#c0392b' };
    const color = COLORS[emp.name] || '#495057';

    if (newState) {
      badge.classList.replace('off', 'on');
      badge.style.cssText = `background:${color}22;color:${color};border:1.5px solid ${color}`;
      emp.days.push(day);
    } else {
      badge.classList.replace('on', 'off');
      badge.style.cssText = `background:#f1f3f5;color:#adb5bd;border:1.5px solid #dee2e6`;
      emp.days = emp.days.filter(d => d !== day);
    }
    this.refreshExtraSummary();

    try {
      await API.post('/api/sh-timesheet/extra/toggle', {
        user_id: userId, year: this.currentYear, month: this.currentMonth, day, participated: newState
      });
    } catch (e) { Utils.showToast('저장 실패: ' + e.message, 'error'); }
  },

  refreshExtraSummary() {
    const { year, month } = this.data;
    // 추가 출근 요약 테이블 전체 교체
    const wrap = document.getElementById('extra-summary-wrap');
    if (wrap) wrap.innerHTML = this.buildExtraSummaryTable(year, month);
    // 합계 테이블도 갱신
    const grandWrap = document.getElementById('grand-total-wrap');
    if (grandWrap) {
      const { days, employees } = this.data;
      const partMap = {};
      employees.forEach(e => { partMap[e.id] = new Set(e.days); });
      grandWrap.innerHTML = this.buildGrandTotal(year, month, days, employees, partMap);
    }
  },

  // 규칙 기반 자동 입력
  // 1. 샘: 일요일, 월요일(공휴일 제외)
  // 2. 비드→캐리→빌리 순환: 화~금 평일(공휴일 제외)
  // 3. 비드→빌리 순환: 토요일 + 공휴일(일요일 제외, 월요일 공휴일 포함)
  // 특정 달의 시작 시점에서 순환 인덱스를 계산 (2026-06부터 연속 누적)
  _calcRotationStart(targetYear, targetMonth) {
    const START_YEAR = 2026, START_MONTH = 6;
    let wdIdx = 0, weIdx = 0;
    let y = START_YEAR, m = START_MONTH;
    while (y < targetYear || (y === targetYear && m < targetMonth)) {
      const d = new Date(y, m, 0).getDate();
      for (let day = 1; day <= d; day++) {
        const dow = new Date(y, m - 1, day).getDay();
        const isHol = this.isHoliday(y, m, day);
        const isSun = dow === 0;
        const isMon = dow === 1;
        const isSat = dow === 6;
        if (isSun) continue;
        if (isMon && !isHol) continue;
        if (isHol || isSat) weIdx++;
        else wdIdx++;
      }
      m++; if (m > 12) { m = 1; y++; }
    }
    return { wdIdx, weIdx };
  },

  autoFill() {
    if (!this.data) return;
    const { year, month, days, employees } = this.data;

    const find = (fullName, nick) =>
      employees.find(e => e.name === fullName) ||
      employees.find(e => this.nick(e.name) === nick) ||
      employees.find(e => e.name.includes(fullName.slice(1)));
    const sam  = find('조상희', '샘');
    const bid  = find('조상하', '비드');
    const cari = find('정재호', '캐리');
    const billy= find('소재훈', '빌리');
    if (!sam || !bid || !cari || !billy) {
      const found = employees.map(e => `${e.name}(${this.nick(e.name)})`).join(', ');
      return Utils.showToast(`직원 매핑 실패. 등록된 주주: ${found || '없음'}`, 'error');
    }

    const weekdayRot = [bid, cari, billy]; // 화~금 비공휴일
    const weekendRot = [bid, billy];       // 토·공휴일

    // 이전 달까지 누적 인덱스로 이번 달 시작점 계산
    const { wdIdx: wdStart, weIdx: weStart } = this._calcRotationStart(year, month);
    let wdIdx = wdStart, weIdx = weStart;

    // 날짜별 담당자 계산
    const schedule = {}; // { day: [userId, ...] }
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay(); // 0=일
      const isHol = this.isHoliday(year, month, d);
      const isSun = dow === 0;
      const isMon = dow === 1;
      const isSat = dow === 6;

      if (isSun) {
        schedule[d] = [sam.id];
      } else if (isMon && !isHol) {
        schedule[d] = [sam.id];
      } else if (isHol || isSat) {
        // 토요일 + 모든 공휴일(일요일 포함하지만 일요일은 위에서 처리)
        schedule[d] = [weekendRot[weIdx % 2].id];
        weIdx++;
      } else {
        // 화~금 비공휴일
        schedule[d] = [weekdayRot[wdIdx % 3].id];
        wdIdx++;
      }
    }

    // 미리보기 생성
    const DOW_KR = ['일','월','화','수','목','금','토'];
    const NICK = this.NICK;
    const nameOf = id => employees.find(e => e.id === id)?.name || '';
    const nickOf = id => NICK[nameOf(id)] || nameOf(id);

    const rows = [];
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const isHol = this.isHoliday(year, month, d);
      const assigned = schedule[d].map(nickOf).join(', ');
      const typeLabel = isHol ? '🔴공휴' : dow === 0 ? '🔴일' : dow === 6 ? '🔵토' : DOW_KR[dow];
      rows.push(`<tr><td style="text-align:center;padding:3px 8px">${d}</td><td style="text-align:center">${typeLabel}</td><td style="padding:3px 8px;font-weight:600">${assigned}</td></tr>`);
    }

    const preview = `
      <div style="font-size:13px;margin-bottom:10px;color:#495057">
        <b>${year}년 ${month}월</b> 근무표를 아래 규칙으로 자동 입력합니다.<br>
        기존 데이터는 모두 덮어씁니다.
      </div>
      <div style="max-height:300px;overflow-y:auto;border:1px solid #dee2e6;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#1b4332;color:#fff"><th style="padding:4px 8px">일</th><th>요일</th><th style="padding:4px 8px">담당</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;

    // 확인 모달
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;max-height:90vh;overflow-y:auto">
        <div style="font-size:16px;font-weight:700;margin-bottom:12px">📅 자동 입력 확인</div>
        ${preview}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-secondary" onclick="this.closest('[style*=fixed]').remove()">취소</button>
          <button class="btn btn-primary" id="confirm-autofill-btn">입력 실행</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('#confirm-autofill-btn').onclick = async () => {
      modal.remove();
      await this._applyAutoFill(year, month, days, employees, schedule);
    };
  },

  async _applyAutoFill(year, month, days, employees, schedule) {
    Utils.showToast('자동 입력 중...', 'info');
    try {
      // 배치 데이터 구성: 모든 직원×모든 날짜
      const batchDays = [];
      employees.forEach(emp => {
        for (let d = 1; d <= days; d++) {
          const participated = !!(schedule[d] && schedule[d].includes(emp.id));
          batchDays.push({ user_id: emp.id, day: d, participated });
        }
      });

      await API.post('/api/sh-timesheet/batch', { year, month, days: batchDays });

      // 로컬 데이터 갱신
      employees.forEach(emp => {
        emp.days = [];
        for (let d = 1; d <= days; d++) {
          if (schedule[d]?.includes(emp.id)) emp.days.push(d);
        }
      });

      Utils.showToast('자동 입력 완료!');
      this.renderPage();
    } catch (e) {
      Utils.showToast('자동 입력 실패: ' + e.message, 'error');
    }
  },

  downloadExcel() {
    if (!this.data || typeof XLSX === 'undefined') return Utils.showToast('XLSX 라이브러리 미로드', 'error');
    const { year, month, days, employees } = this.data;
    const partMap = {};
    employees.forEach(e => { partMap[e.id] = new Set(e.days); });

    const DOW_KR = ['일','월','화','수','목','금','토'];
    const firstDow = new Date(year, month - 1, 1).getDay();
    const weeks = [];
    let week = new Array(7).fill(null);
    for (let d = 1; d <= days; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      week[dow] = d;
      if (dow === 6 || d === days) { weeks.push([...week]); week = new Array(7).fill(null); }
    }

    const aoa = [];
    aoa.push([`${year}년 ${month}월 비욘더팜 주주 근무표`]);
    aoa.push([]);
    aoa.push(['', ...DOW_KR]);
    weeks.forEach(wk => {
      const row = [''];
      wk.forEach((d, dow) => {
        if (!d) { row.push(''); return; }
        const names = employees.filter(e => partMap[e.id].has(d)).map(e => this.nick(e.name)).join('/');
        row.push(d + (names ? '\n'+names : ''));
      });
      aoa.push(row);
    });

    aoa.push([]);
    aoa.push(['이름', '주중횟수(20만)', '주말/공휴횟수(30만)', '합계', '주중금액', '주말금액', '총합계']);
    let totW=0, totWe=0, totAmt=0;
    employees.forEach(emp => {
      let w=0, fri=0, we=0;
      partMap[emp.id].forEach(d => {
        const t = this.dayType(year, month, d);
        if (t==='sunday'||t==='saturday'||t==='holiday') we++;
        else if (t==='friday') fri++;
        else w++;
      });
      const amt = w*this.RATE_WEEKDAY + fri*this.RATE_FRIDAY + we*this.RATE_WEEKEND;
      totW+=w; totWe+=we; totAmt+=amt;
      aoa.push([`${this.nick(emp.name)}(${emp.name})`, w, we, w+we, w*this.RATE_WEEKDAY, we*this.RATE_WEEKEND, amt]);
    });
    aoa.push(['합계', totW, totWe, totW+totWe, totW*this.RATE_WEEKDAY, totWe*this.RATE_WEEKEND, totAmt]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${month}월 주주근무표`);
    XLSX.writeFile(wb, `${year}년_${month}월_주주근무표.xlsx`);
  }
};
