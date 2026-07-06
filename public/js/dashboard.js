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
      const requests = [
        API.get('/api/employees'),
        API.get('/api/leaves?year=' + new Date().getFullYear()),
        API.get('/api/attendance?year=' + new Date().getFullYear() + '&month=' + (new Date().getMonth() + 1)),
      ];
      const [employees, leaves, attendance] = await Promise.all(requests);

      const testKeywords = ['테스트','TEST','관리자'];
      const isTest = e => testKeywords.some(k => e.name?.includes(k)) || e.name === 'T';
      const activeEmp = employees.filter(e => e.status === 'active' && !isTest(e)).length;
      const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
      const todayStr = Utils.today();
      const todayAtt = attendance.filter(a => a.date === todayStr);
      const checkedIn = todayAtt.filter(a => a.check_in).length;

      const recentLeaves = leaves.filter(l => l.status === 'pending').slice(0, 5);

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

          <!-- 휴가 대기 -->
          <div class="card">
            <div class="card-title">📋 휴가 승인 대기 <span class="badge badge-warning">${pendingLeaves}</span></div>
            ${recentLeaves.length === 0
              ? '<div class="empty-state" style="padding:24px"><div class="icon">✅</div>대기 중인 휴가 신청이 없습니다</div>'
              : `<div class="table-wrap"><table>
                  <thead><tr><th>직원</th><th>유형</th><th>기간</th>${isAdmin?'<th>관리</th>':''}</tr></thead>
                  <tbody>${recentLeaves.map(l => `
                    <tr>
                      <td>${l.user_name}</td>
                      <td>${Utils.leaveTypeName(l.type)}</td>
                      <td style="font-size:11px">${l.start_date}~${l.end_date}</td>
                      ${isAdmin ? `<td>
                        <button class="btn btn-success btn-sm" onclick="Dashboard.approveLeave(${l.id},'approved')">승인</button>
                        <button class="btn btn-danger btn-sm" onclick="Dashboard.approveLeave(${l.id},'rejected')">반려</button>
                      </td>` : ''}
                    </tr>`).join('')}
                  </tbody></table></div>`
            }

            <!-- 오늘 출근 현황 -->
            <div class="card-title" style="margin-top:16px;border-top:1px solid #dee2e6;padding-top:16px">🕐 오늘 출근 현황</div>
            ${todayAtt.length === 0
              ? '<div style="color:#6c757d;font-size:13px;padding:8px 0">오늘 출근 기록이 없습니다</div>'
              : `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${todayAtt.map(a => `
                  <span class="badge ${a.check_out ? 'badge-secondary' : 'badge-success'}" style="font-size:12px;padding:4px 10px">
                    ${a.user_name || a.user_id} ${a.check_in ? a.check_in.slice(0,5) : ''} ${a.check_out ? '→'+a.check_out.slice(0,5) : '근무중'}
                  </span>`).join('')}</div>`
            }
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

    // 이번 달 이벤트 필터링 (구글캘린더 + 휴가 표시)
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;
    const monthEvents = this.gcalEvents.filter(e => (e.start || '').startsWith(monthStr));

    // 날짜별 이벤트 맵
    const eventMap = {};
    monthEvents.forEach(e => {
      const d = parseInt((e.start || '').slice(8, 10));
      if (!eventMap[d]) eventMap[d] = [];
      eventMap[d].push(e);
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

      const evtHtml = evts.slice(0, 2).map(e =>
        `<div style="background:#d3f9d8;color:#2b8a3e;border-radius:3px;padding:1px 4px;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px" title="${e.title}">${e.title}</div>`
      ).join('') + (evts.length > 2 ? `<div style="font-size:9px;color:#6c757d">+${evts.length-2}개</div>` : '');

      const bg = isToday ? '#f0fff4' : isRed ? '#fff5f5' : isSat ? '#f0f5ff' : '';

      cells.push(`<td style="padding:4px 3px;vertical-align:top;background:${bg};border:1px solid #f1f3f5;min-height:52px">
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
