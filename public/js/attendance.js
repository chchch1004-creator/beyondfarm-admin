const Attendance = {
  data: [],
  employees: [],
  changeRequests: [],

  async render() {
    const content = document.getElementById('content');
    const role = App.user.role;
    const isAdmin = ['admin','superadmin'].includes(role);
    const isSuperAdmin = role === 'superadmin';
    const now = new Date();

    try {
      if (isAdmin) this.employees = await API.get('/api/employees');
      await this.load(now.getFullYear(), now.getMonth() + 1);

      // 총괄관리자는 대기중인 수정요청 수 표시
      let pendingCount = 0;
      if (isSuperAdmin) {
        this.changeRequests = await API.get('/api/attendance/change-requests?status=pending');
        pendingCount = this.changeRequests.length;
      } else {
        this.changeRequests = await API.get('/api/attendance/change-requests');
      }

      const today = Utils.today();
      const myToday = this.data.find(a => a.date === today && a.user_id === App.user.id);

      content.innerHTML = `
        <!-- 출퇴근 버튼 -->
        <div class="card" style="text-align:center;padding:32px">
          <div style="font-size:13px;color:#6c757d;margin-bottom:8px">오늘 날짜: ${today}</div>
          <div id="clock" style="font-size:42px;font-weight:700;letter-spacing:2px;color:#1b4332;margin-bottom:24px"></div>
          <div style="display:flex;gap:16px;justify-content:center;margin-bottom:20px">
            <button id="btn-checkin" onclick="Attendance.checkIn()" style="
              width:160px;height:160px;border-radius:50%;border:none;cursor:pointer;
              background:${myToday?.check_in ? '#d1fae5' : '#1b4332'};
              color:${myToday?.check_in ? '#065f46' : '#fff'};
              font-size:18px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,0.15);
              transition:all 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
              <span style="font-size:36px">🟢</span><span>출근</span>
              <small style="font-size:12px;font-weight:400">${myToday?.check_in ? '✅ ' + myToday.check_in : '미처리'}</small>
            </button>
            <button id="btn-checkout" onclick="Attendance.checkOut()" style="
              width:160px;height:160px;border-radius:50%;border:none;cursor:pointer;
              background:${myToday?.check_out ? '#fee2e2' : (myToday?.check_in ? '#dc3545' : '#adb5bd')};
              color:${myToday?.check_out ? '#991b1b' : '#fff'};
              font-size:18px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,0.15);
              transition:all 0.2s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
              <span style="font-size:36px">🔴</span><span>퇴근</span>
              <small style="font-size:12px;font-weight:400">${myToday?.check_out ? '✅ ' + myToday.check_out : '미처리'}</small>
            </button>
          </div>
          <div id="location-status" style="font-size:12px;color:#6c757d">📍 위치 확인 중...</div>
        </div>

        <!-- 총괄관리자: 수정요청 승인 패널 -->
        ${isSuperAdmin ? `
        <div class="card">
          <div class="card-title">📝 출퇴근 수정 요청 <span class="badge badge-warning">${pendingCount}</span></div>
          <div class="tabs">
            <button class="tab active" onclick="Attendance.switchReqTab(this,'pending')">대기중</button>
            <button class="tab" onclick="Attendance.switchReqTab(this,'all')">전체</button>
          </div>
          <div id="req-table-wrap"><div class="table-wrap">
            <table>
              <thead><tr><th>직원</th><th>날짜</th><th>요청 출근</th><th>요청 퇴근</th><th>유형</th><th>사유</th><th>신청일</th><th>처리</th></tr></thead>
              <tbody id="req-tbody"></tbody>
            </table>
          </div></div>
        </div>` : ''}

        <!-- 기록 테이블 -->
        <div class="card">
          <div class="card-title">
            📋 출퇴근 기록
            ${isAdmin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Attendance.showForm()">+ 기록 추가</button>' : ''}
          </div>
          <div class="tabs" style="margin-bottom:0">
            <button class="tab active" onclick="Attendance.switchView(this,'list')">목록 보기</button>
            ${isAdmin ? '<button class="tab" onclick="Attendance.switchView(this,\'calendar\')">달력 보기</button>' : ''}
          </div>
          <div id="att-list-view">
          <div class="filter-bar">
            ${isAdmin ? `<select id="att-user" onchange="Attendance.reload()">
              <option value="">전체 직원</option>
              ${this.employees.filter(e => e.status === 'active').map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>` : ''}
            <select id="att-year" onchange="Attendance.reload()">
              ${[now.getFullYear(), now.getFullYear()-1].map(y => `<option ${y===now.getFullYear()?'selected':''}>${y}</option>`).join('')}
            </select>
            <select id="att-month" onchange="Attendance.reload()">
              ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${i+1}월</option>`).join('')}
            </select>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>${isAdmin?'<th>직원</th>':''}<th>날짜</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>유형</th><th>비고</th><th>수정요청</th>${isAdmin?'<th>관리</th>':''}</tr></thead>
              <tbody id="att-tbody"></tbody>
            </table>
          </div>
          </div><!-- /att-list-view -->
          <div id="att-cal-view" style="display:none">
            <div class="filter-bar">
              <select id="cal-year" onchange="Attendance.renderCalendar()">
                ${[now.getFullYear(), now.getFullYear()-1].map(y => `<option ${y===now.getFullYear()?'selected':''}>${y}</option>`).join('')}
              </select>
              <select id="cal-month" onchange="Attendance.renderCalendar()">
                ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${i+1}월</option>`).join('')}
              </select>
              <select id="cal-user" onchange="Attendance.renderCalendar()">
                <option value="">전체 직원</option>
                ${this.employees.filter(e => e.status === 'active').map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
              </select>
            </div>
            <div id="att-calendar"></div>
          </div>
        </div>

        <!-- 내 수정 요청 현황 -->
        <div class="card">
          <div class="card-title">📨 내 수정 요청 현황</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>날짜</th><th>요청 출근</th><th>요청 퇴근</th><th>사유</th><th>상태</th><th>처리일</th></tr></thead>
              <tbody id="my-req-tbody"></tbody>
            </table>
          </div>
        </div>`;

      this.renderTable();
      this.renderMyRequests();
      if (isSuperAdmin) this.renderRequestTable('pending');
      this.startClock();
      this.checkLocationPermission();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  renderRequestTable(filter) {
    const tbody = document.getElementById('req-tbody');
    if (!tbody) return;
    const rows = filter === 'pending'
      ? this.changeRequests.filter(r => r.status === 'pending')
      : this.changeRequests;
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">요청이 없습니다</div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.user_name}</td>
        <td>${r.date}</td>
        <td>${r.requested_check_in || '-'}</td>
        <td>${r.requested_check_out || '-'}</td>
        <td>${{normal:'정상',late:'지각',early:'조퇴',absent:'결근',remote:'재택'}[r.requested_type]||r.requested_type}</td>
        <td>${r.reason || '-'}</td>
        <td>${r.created_at?.slice(0,16) || '-'}</td>
        <td>
          ${r.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="Attendance.reviewRequest(${r.id},'approved')">승인</button>
            <button class="btn btn-danger btn-sm" onclick="Attendance.reviewRequest(${r.id},'rejected')">반려</button>
          ` : Utils.statusBadge(r.status === 'approved' ? 'approved' : 'rejected')}
        </td>
      </tr>`).join('');
  },

  switchReqTab(btn, filter) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    this.renderRequestTable(filter);
  },

  async reviewRequest(id, status) {
    try {
      await API.put(`/api/attendance/change-requests/${id}`, { status });
      Utils.showToast(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.');
      Attendance.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  renderMyRequests() {
    const tbody = document.getElementById('my-req-tbody');
    if (!tbody) return;
    const mine = this.changeRequests.filter(r => r.user_id === App.user.id);
    if (mine.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">수정 요청 내역이 없습니다</div></td></tr>';
      return;
    }
    const statusMap = { pending: ['badge-warning','대기중'], approved: ['badge-success','승인'], rejected: ['badge-danger','반려'] };
    tbody.innerHTML = mine.map(r => {
      const [cls, label] = statusMap[r.status] || ['badge-secondary', r.status];
      return `<tr>
        <td>${r.date}</td>
        <td>${r.requested_check_in || '-'}</td>
        <td>${r.requested_check_out || '-'}</td>
        <td>${r.reason || '-'}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>${r.reviewed_at?.slice(0,16) || '-'}</td>
      </tr>`;
    }).join('');
  },

  switchView(btn, view) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('att-list-view').style.display = view === 'list' ? '' : 'none';
    document.getElementById('att-cal-view').style.display = view === 'calendar' ? '' : 'none';
    if (view === 'calendar') this.renderCalendar();
  },

  async renderCalendar() {
    const calEl = document.getElementById('att-calendar');
    if (!calEl) return;
    const year = parseInt(Utils.val('cal-year')) || new Date().getFullYear();
    const month = parseInt(document.getElementById('cal-month')?.value) || new Date().getMonth() + 1;
    const userId = document.getElementById('cal-user')?.value || '';
    const days = new Date(year, month, 0).getDate();
    const getDow = (d) => new Date(year, month-1, d).getDay();
    const dowNames = ['일','월','화','수','목','금','토'];

    // 해당 월 데이터 로드
    let url = `/api/attendance?year=${year}&month=${month}`;
    if (userId) url += `&user_id=${userId}`;
    const data = await API.get(url);
    const selectedName = userId ? this.employees.find(e => e.id === parseInt(userId))?.name : '';

    // 날짜별 그룹화
    const byDay = {};
    data.forEach(a => {
      const d = parseInt(a.date.split('-')[2]);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(a);
    });

    // 월 총 근무시간 계산
    let totalMins = 0;
    data.forEach(a => {
      if (a.check_in && a.check_out) {
        const [ih,im] = a.check_in.split(':').map(Number);
        const [oh,om] = a.check_out.split(':').map(Number);
        totalMins += Math.max(0, (oh*60+om) - (ih*60+im));
      }
    });
    const totalH = Math.floor(totalMins/60), totalM = totalMins%60;

    // 달력 그리기
    let html = `<style>
      .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
      .cal-day-header { text-align:center; font-size:12px; font-weight:600; padding:6px; background:#1b4332; color:#fff; border-radius:6px; }
      .cal-day-header.sun { color:#ff9999; }
      .cal-day-header.sat { color:#99ccff; }
      .cal-cell { border:1px solid #dee2e6; border-radius:6px; padding:6px; min-height:90px; background:#fff; font-size:11px; }
      .cal-cell.today { border-color:#1b4332; border-width:2px; }
      .cal-cell.empty { background:#f8f9fa; border:none; }
      .cal-date { font-weight:600; margin-bottom:4px; font-size:13px; }
      .cal-date.sun { color:#dc3545; }
      .cal-date.sat { color:#1971c2; }
      .cal-entry { display:flex; justify-content:space-between; padding:2px 4px; border-radius:4px; margin-bottom:2px; font-size:10px; }
      .cal-entry.present { background:#d1fae5; }
      .cal-entry.absent { background:#fee2e2; }
    </style>
    ${selectedName ? `<div style="padding:8px 4px 12px;display:flex;align-items:center;gap:16px">
      <span style="font-size:14px;font-weight:600">👤 ${selectedName}</span>
      <span style="font-size:13px;color:#6c757d">이번 달 총 근무: <strong style="color:#1b4332">${totalH}시간${totalM ? ' ' + totalM + '분' : ''}</strong></span>
    </div>` : ''}
    <div class="cal-grid">
      ${dowNames.map((d,i) => `<div class="cal-day-header ${i===0?'sun':i===6?'sat':''}">${d}</div>`).join('')}
    `;

    // 첫날 요일 맞추기
    const firstDow = getDow(1);
    for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell empty"></div>';

    const todayStr = Utils.today();
    for (let d = 1; d <= days; d++) {
      const dow = getDow(d);
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const isSun = dow === 0, isSat = dow === 6;
      const entries = byDay[d] || [];

      html += `<div class="cal-cell ${isToday?'today':''}">
        <div class="cal-date ${isSun?'sun':isSat?'sat':''}">${d}</div>`;

      if (entries.length === 0) {
        html += '';
      } else {
        entries.forEach(a => {
          const hasOut = !!a.check_out;
          let workHours = '';
          if (a.check_in && a.check_out) {
            const [ih,im] = a.check_in.split(':').map(Number);
            const [oh,om] = a.check_out.split(':').map(Number);
            const mins = (oh*60+om)-(ih*60+im);
            if (mins > 0) workHours = `(${Math.floor(mins/60)}h${mins%60?mins%60+'m':''})`;
          }
          html += `<div class="cal-entry ${hasOut?'present':'absent'}">
            <span>${a.name}</span>
            <span>${a.check_in||'?'} ${a.check_out?'→'+a.check_out:''} ${workHours}</span>
          </div>`;
        });
      }
      html += '</div>';
    }

    // 마지막 주 빈칸
    const lastDow = getDow(days);
    for (let i = lastDow + 1; i <= 6; i++) html += '<div class="cal-cell empty"></div>';
    html += '</div>';
    calEl.innerHTML = html;
  },

  startClock() {
    const tick = () => {
      const el = document.getElementById('clock');
      if (!el) return;
      el.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTimeout(tick, 1000);
    };
    tick();
  },

  checkLocationPermission() {
    const el = document.getElementById('location-status');
    if (!el || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const el2 = document.getElementById('location-status');
        if (el2) el2.innerHTML = `📍 위치 확인됨 — 출퇴근 버튼을 누르면 자동으로 위치가 전송됩니다`;
      },
      () => {
        const el2 = document.getElementById('location-status');
        if (el2) el2.innerHTML = `⚠️ 위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.`;
      }
    );
  },

  getLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({ lat: null, lon: null });
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve({ lat: null, lon: null }),
        { timeout: 8000, maximumAge: 30000 }
      );
    });
  },

  async load(year, month, userId) {
    let url = `/api/attendance?year=${year}&month=${month}`;
    if (userId) url += `&user_id=${userId}`;
    this.data = await API.get(url);
  },

  async reload() {
    const year = Utils.val('att-year') || new Date().getFullYear();
    const month = Utils.val('att-month') || new Date().getMonth() + 1;
    const userId = document.getElementById('att-user')?.value || '';
    await this.load(year, month, userId);
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('att-tbody');
    if (!tbody) return;
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    if (this.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">기록이 없습니다</div></td></tr>`;
      return;
    }
    tbody.innerHTML = this.data.map(a => {
      let workHours = '-';
      if (a.check_in && a.check_out) {
        const [ih, im] = a.check_in.split(':').map(Number);
        const [oh, om] = a.check_out.split(':').map(Number);
        const mins = (oh * 60 + om) - (ih * 60 + im);
        if (mins > 0) workHours = `${Math.floor(mins/60)}h ${mins%60}m`;
      }
      // 내 기록인지 여부
      const isMine = a.user_id === App.user.id;
      return `<tr>
        ${isAdmin ? `<td>${a.name}</td>` : ''}
        <td>${a.date}</td>
        <td>${a.check_in || '-'}</td>
        <td>${a.check_out || '-'}</td>
        <td>${workHours}</td>
        <td>${Utils.statusBadge(a.type || 'normal')}</td>
        <td>${a.note || '-'}</td>
        <td>${isMine || isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="Attendance.showChangeRequest(${JSON.stringify(a).replace(/"/g,'&quot;')})">수정요청</button>` : '-'}</td>
        ${isAdmin ? `<td>
          <button class="btn btn-secondary btn-sm" onclick="Attendance.showForm(${JSON.stringify(a).replace(/"/g,'&quot;')})">수정</button>
          <button class="btn btn-danger btn-sm" onclick="Attendance.delete(${a.id})">삭제</button>
        </td>` : ''}
      </tr>`;
    }).join('');
  },

  showChangeRequest(rec) {
    Utils.modal(
      '출퇴근 수정 요청',
      `<p style="color:#6c757d;font-size:12px;margin-bottom:16px">총괄관리자 승인 후 반영됩니다.</p>
      <div class="form-grid">
        <div class="form-group"><label>날짜</label><input type="date" id="f-date" value="${rec.date}" readonly></div>
        <div class="form-group"><label>요청 출근시간</label><input type="time" id="f-in" value="${rec.check_in || ''}"></div>
        <div class="form-group"><label>요청 퇴근시간</label><input type="time" id="f-out" value="${rec.check_out || ''}"></div>
        <div class="form-group"><label>유형</label>
          <select id="f-type">
            ${['normal','late','early','absent','remote'].map(t => `<option value="${t}" ${rec.type===t?'selected':''}>${{normal:'정상',late:'지각',early:'조퇴',absent:'결근',remote:'재택'}[t]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>수정 사유 *</label><textarea id="f-reason" placeholder="수정이 필요한 이유를 입력하세요"></textarea></div>
      </div>`,
      async () => {
        const reason = Utils.val('f-reason');
        if (!reason) return Utils.showToast('수정 사유를 입력하세요', 'error');
        try {
          await API.post('/api/attendance/change-requests', {
            attendance_id: rec.id,
            date: rec.date,
            requested_check_in: Utils.val('f-in'),
            requested_check_out: Utils.val('f-out'),
            requested_type: Utils.val('f-type'),
            reason,
          });
          Utils.showToast('수정 요청이 제출되었습니다. 총괄관리자 승인을 기다려주세요.');
          Utils.closeModal();
          Attendance.render();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      },
      '요청 제출'
    );
  },

  async checkIn() {
    const btn = document.getElementById('btn-checkin');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      const { lat, lon } = await this.getLocation();
      await API.post('/api/attendance/check-in', { lat, lon });
      Utils.showToast('출근 처리되었습니다!');
      await Attendance.render();
    } catch (e) {
      Utils.showToast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  },

  async checkOut() {
    const btn = document.getElementById('btn-checkout');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    try {
      const { lat, lon } = await this.getLocation();
      await API.post('/api/attendance/check-out', { lat, lon });
      Utils.showToast('퇴근 처리되었습니다!');
      await Attendance.render();
    } catch (e) {
      Utils.showToast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }
  },

  showForm(rec) {
    const emps = this.employees.filter(e => e.status === 'active');
    Utils.modal(
      rec ? '출퇴근 기록 수정' : '출퇴근 기록 추가',
      `<div class="form-grid">
        ${!rec ? `<div class="form-group"><label>직원</label>
          <select id="f-uid">${emps.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select>
        </div>` : ''}
        <div class="form-group"><label>날짜</label><input type="date" id="f-date" value="${rec?.date || Utils.today()}"></div>
        <div class="form-group"><label>출근시간</label><input type="time" id="f-in" value="${rec?.check_in || ''}"></div>
        <div class="form-group"><label>퇴근시간</label><input type="time" id="f-out" value="${rec?.check_out || ''}"></div>
        <div class="form-group"><label>유형</label>
          <select id="f-type">
            ${['normal','late','early','absent','remote'].map(t => `<option value="${t}" ${rec?.type===t?'selected':''}>${{normal:'정상',late:'지각',early:'조퇴',absent:'결근',remote:'재택'}[t]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>비고</label><input id="f-note" value="${rec?.note || ''}"></div>
      </div>`,
      async () => {
        const body = { date: Utils.val('f-date'), check_in: Utils.val('f-in'), check_out: Utils.val('f-out'), type: Utils.val('f-type'), note: Utils.val('f-note') };
        try {
          if (rec) await API.put(`/api/attendance/${rec.id}`, body);
          else { body.user_id = Utils.val('f-uid'); await API.post('/api/attendance', body); }
          Utils.showToast('저장되었습니다.'); Utils.closeModal(); Attendance.reload();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  async delete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await API.delete(`/api/attendance/${id}`); Utils.showToast('삭제되었습니다.'); Attendance.reload(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
