const ShareholderTimesheet = {
  data: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,

  // 이름 → 닉네임
  NICK: { '조상희': '샘', '조상하': '비드', '정재호': '캐리', '소재훈': '빌리' },
  // 요금
  RATE_WEEKDAY: 200000,
  RATE_FRIDAY: 200000,
  RATE_WEEKEND: 300000,

  // 공휴일 목록 YYYY-MM-DD
  HOLIDAYS: new Set([
    // 2025
    '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
    '2025-03-01','2025-05-05','2025-05-06','2025-06-06',
    '2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09',
    '2025-12-25',
    // 2026
    '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
    '2026-03-01','2026-05-05','2026-05-24',
    '2026-06-06','2026-08-15',
    '2026-09-24','2026-09-25','2026-09-26',
    '2026-10-03','2026-10-09','2026-12-25',
    // 2027
    '2027-01-01','2027-02-06','2027-02-07','2027-02-08',
    '2027-03-01','2027-05-05','2027-05-13',
    '2027-06-06','2027-08-15',
    '2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16',
    '2027-12-25',
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
    return 'weekday';
  },

  rate(year, month, day) {
    const t = this.dayType(year, month, day);
    if (t === 'sunday' || t === 'saturday' || t === 'holiday') return this.RATE_WEEKEND;
    return this.RATE_WEEKDAY;
  },

  async render() {
    if (!['admin','superadmin'].includes(App.user.role)) {
      document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>관리자만 접근 가능합니다</div>';
      return;
    }
    document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    await this.load(this.currentYear, this.currentMonth);
  },

  async load(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    try {
      this.data = await API.get(`/api/sh-timesheet?year=${year}&month=${month}`);
      this.renderPage();
    } catch (e) {
      document.getElementById('content').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  renderPage() {
    const { year, month, days, employees, note } = this.data;
    const now = new Date();

    // 월 탭
    const tabs = [];
    const startYear = 2026, startMonth = 6;
    let ty = startYear, tm = startMonth;
    while (ty < now.getFullYear() || (ty === now.getFullYear() && tm <= now.getMonth() + 1)) {
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
        .sh-cal { border-collapse: collapse; width: 100%; min-width: 640px; font-size: 13px; }
        .sh-cal th { background: #1b4332; color: #fff; text-align: center; padding: 8px 4px; border: 1px solid #495057; font-size: 12px; }
        .sh-cal td { border: 1px solid #dee2e6; vertical-align: top; padding: 4px; min-width: 80px; }
        .sh-day-num { font-size: 11px; font-weight: 700; margin-bottom: 4px; padding: 2px 4px; display: inline-block; border-radius: 4px; min-width: 22px; text-align: center; }
        .sh-day-weekend { background: #fff0f0; }
        .sh-day-friday { background: #fff8e1; }
        .sh-name-badge {
          display: inline-block; padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;
          margin: 1px; cursor: pointer; user-select: none; transition: all 0.15s;
        }
        .sh-name-badge.on  { opacity: 1; }
        .sh-name-badge.off { opacity: 0.2; filter: grayscale(1); }
        .sh-sum-table { border-collapse: collapse; width: 100%; font-size: 13px; }
        .sh-sum-table th { background: #1b4332; color: #fff; padding: 8px 12px; text-align: center; border: 1px solid #495057; }
        .sh-sum-table td { padding: 9px 12px; border: 1px solid #dee2e6; text-align: center; }
        .sh-sum-table tfoot td { background: #f8f9fa; font-weight: 700; }
      </style>

      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="tabs" style="margin:0;flex-wrap:wrap">${tabs.join('')}</div>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="ShareholderTimesheet.downloadExcel()">📥 엑셀</button>
        </div>
      </div>

      <div class="card">
        <div style="font-size:16px;font-weight:700;text-align:center;margin-bottom:16px;color:#1b4332">
          📋 ${year}년 ${month}월 비욘더팜 주주 근무표
        </div>
        <div class="sh-cal-wrap">${calHtml}</div>
      </div>

      <div class="card" style="margin-top:0">
        <div class="card-title">📊 ${year}년 ${month}월 요약</div>
        ${summaryHtml}
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
          return `<span class="sh-name-badge ${isOn ? 'on' : 'off'}"
            id="badge-${emp.id}-${d}"
            style="${style}"
            onclick="ShareholderTimesheet.toggle(${emp.id},${d},this)"
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

  buildSummary(year, month, days, employees, partMap) {
    const rows = employees.map(emp => {
      let weekday = 0, weekend = 0;
      partMap[emp.id].forEach(d => {
        const t = this.dayType(year, month, d);
        if (t === 'sunday' || t === 'saturday' || t === 'holiday') weekend++;
        else weekday++;
      });
      const total = weekday + weekend;
      const weekdayAmt = weekday * this.RATE_WEEKDAY;
      const weekendAmt = weekend * this.RATE_WEEKEND;
      const totalAmt = weekdayAmt + weekendAmt;
      const nick = this.nick(emp.name);
      return { name: emp.name, nick, weekday, weekend, total, weekdayAmt, weekendAmt, totalAmt };
    });

    const totals = rows.reduce((a, r) => {
      a.weekday += r.weekday; a.weekend += r.weekend; a.total += r.total;
      a.weekdayAmt += r.weekdayAmt; a.weekendAmt += r.weekendAmt; a.totalAmt += r.totalAmt;
      return a;
    }, { weekday:0, weekend:0, total:0, weekdayAmt:0, weekendAmt:0, totalAmt:0 });

    const bodyRows = rows.map(r => `
      <tr>
        <td style="font-weight:700">${r.nick}<br><span style="font-size:11px;color:#6c757d">${r.name}</span></td>
        <td>${r.weekday}</td>
        <td>${r.weekend}</td>
        <td><strong>${r.total}</strong></td>
        <td style="color:#2d6a4f">${r.weekdayAmt ? Utils.formatNum(r.weekdayAmt) : '-'}</td>
        <td style="color:#c0392b">${r.weekendAmt ? Utils.formatNum(r.weekendAmt) : '-'}</td>
        <td style="font-weight:700;color:#1b4332">${r.totalAmt ? Utils.formatNum(r.totalAmt)+'원' : '-'}</td>
      </tr>`).join('');

    return `<table class="sh-sum-table">
      <thead>
        <tr>
          <th>이름</th>
          <th>주중횟수<br><span style="font-size:10px;font-weight:400">20만원</span></th>
          <th>주말/공휴횟수<br><span style="font-size:10px;font-weight:400">30만원</span></th>
          <th>합계</th>
          <th>주중금액</th>
          <th>주말/공휴금액</th>
          <th>총합계</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td>합계</td>
          <td>${totals.weekday}</td>
          <td>${totals.weekend}</td>
          <td>${totals.total}</td>
          <td>${totals.weekdayAmt ? Utils.formatNum(totals.weekdayAmt) : '-'}</td>
          <td>${totals.weekendAmt ? Utils.formatNum(totals.weekendAmt) : '-'}</td>
          <td>${totals.totalAmt ? Utils.formatNum(totals.totalAmt)+'원' : '-'}</td>
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
    const summaryEl = document.querySelector('.sh-sum-table')?.closest('div');
    if (!summaryEl) return;
    summaryEl.innerHTML = this.buildSummary(year, month, days, employees, partMap);
  },

  async saveNote() {
    const content = document.getElementById('sh-note')?.value || '';
    try {
      await API.post('/api/sh-timesheet/notes', { year: this.currentYear, month: this.currentMonth, content });
      Utils.showToast('메모가 저장되었습니다.');
    } catch (e) { Utils.showToast(e.message, 'error'); }
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
      let w=0, we=0;
      partMap[emp.id].forEach(d => {
        const t = this.dayType(year, month, d);
        if (t==='sunday'||t==='saturday'||t==='holiday') we++; else w++;
      });
      const amt = w*this.RATE_WEEKDAY + we*this.RATE_WEEKEND;
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
