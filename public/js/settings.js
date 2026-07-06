const Settings = {
  async render() {
    if (App.user.role !== 'superadmin') {
      // admin도 일부 설정 가능
      if (!['admin','superadmin'].includes(App.user.role)) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><div class="icon">🔒</div>관리자만 접근 가능합니다</div>';
        return;
      }
    }
    const content = document.getElementById('content');
    const cfg = await API.get('/api/settings');

    content.innerHTML = `
      <!-- 근무지 1 -->
      <div class="card" style="max-width:640px">
        <div class="card-title">📍 근무지 1 설정 <span class="badge badge-info">${cfg.work_name || '사무실'}</span></div>
        <div class="form-grid">
          <div class="form-group">
            <label>장소명</label>
            <input id="s-name" value="${cfg.work_name || '사무실'}" placeholder="예: 사무실">
          </div>
          <div class="form-group">
            <label>위도 (Latitude)</label>
            <input id="s-lat" value="${cfg.work_lat || ''}" placeholder="예: 37.5123">
          </div>
          <div class="form-group">
            <label>경도 (Longitude)</label>
            <input id="s-lon" value="${cfg.work_lon || ''}" placeholder="예: 127.0234">
          </div>
          <div class="form-group">
            <label>허용 반경 (미터)</label>
            <input id="s-radius" type="number" value="${cfg.work_radius || 300}" min="50" max="2000">
          </div>
        </div>
        <div style="margin:12px 0;padding:12px;background:#f8f9fa;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:12px">
          <button class="btn btn-secondary btn-sm" onclick="Settings.useMyLocation(1)">📍 현재 위치로 설정</button>
          <span id="my-loc-status-1" style="color:#6c757d;font-size:12px"></span>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Settings.saveLocation(1)">근무지 1 저장</button>
        </div>
      </div>

      <!-- 근무지 2 -->
      <div class="card" style="max-width:640px;margin-top:0">
        <div class="card-title">📍 근무지 2 설정 <span class="badge badge-info">${cfg.work_name2 || '현장'}</span></div>
        <p style="color:#6c757d;font-size:12px;margin-bottom:16px">사무실과 현장 중 어디서든 출퇴근이 가능합니다. 두 곳 중 하나의 반경 안에 있으면 허용됩니다.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>장소명</label>
            <input id="s-name2" value="${cfg.work_name2 || '현장'}" placeholder="예: 현장">
          </div>
          <div class="form-group">
            <label>위도 (Latitude)</label>
            <input id="s-lat2" value="${cfg.work_lat2 || ''}" placeholder="예: 37.5456">
          </div>
          <div class="form-group">
            <label>경도 (Longitude)</label>
            <input id="s-lon2" value="${cfg.work_lon2 || ''}" placeholder="예: 127.0567">
          </div>
          <div class="form-group">
            <label>허용 반경 (미터)</label>
            <input id="s-radius2" type="number" value="${cfg.work_radius2 || 300}" min="50" max="2000">
          </div>
        </div>
        <div style="margin:12px 0;padding:12px;background:#f8f9fa;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:12px">
          <button class="btn btn-secondary btn-sm" onclick="Settings.useMyLocation(2)">📍 현재 위치로 설정</button>
          <span id="my-loc-status-2" style="color:#6c757d;font-size:12px"></span>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Settings.saveLocation(2)">근무지 2 저장</button>
        </div>
      </div>

      <!-- 기타 설정 -->
      <div class="card" style="max-width:640px;margin-top:0">
        <div class="card-title">⚙️ 근무 기준 설정</div>
        <p style="color:#6c757d;font-size:12px;margin-bottom:16px">공식 출근 시간 이전에 출근한 경우 근무표에는 공식 시간부터 계산됩니다.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>기본 연차 일수</label>
            <input id="s-annual" type="number" value="${cfg.annual_days || 15}" min="1">
          </div>
          <div class="form-group">
            <label>사무실 공식 출근 시간</label>
            <input id="s-office-start" type="time" value="${cfg.office_start || '10:00'}">
          </div>
          <div class="form-group">
            <label>현장 공식 출근 시간 (평일)</label>
            <input id="s-field-weekday" type="time" value="${cfg.field_weekday_start || '13:00'}">
          </div>
          <div class="form-group">
            <label>현장 공식 출근 시간 (주말)</label>
            <input id="s-field-weekend" type="time" value="${cfg.field_weekend_start || '09:30'}">
          </div>
        </div>
        <div style="padding:12px;background:#fff3cd;border-radius:8px;font-size:12px;margin-bottom:12px">
          💡 <strong>손님이 일찍 와서 조기 출근해야 하는 경우:</strong> 근무표에서 해당 날짜 칸을 클릭해 직접 시간을 입력(빨간색 표시)하면 됩니다.
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Settings.saveGeneral()">저장</button>
        </div>
      </div>

      <!-- 구글캘린더 연동 -->
      <div class="card" style="max-width:640px;margin-top:0">
        <div class="card-title">📅 구글캘린더 연동</div>
        <p style="color:#6c757d;font-size:12px;margin-bottom:16px">
          연동하면 ①홈페이지에서 구글캘린더 일정을 확인하고 ②휴가 승인 시 캘린더에 자동 등록되며 ③직접 이벤트를 캘린더로 보낼 수 있습니다.
        </p>
        <div id="gcal-status-area" style="padding:12px;background:#f8f9fa;border-radius:8px;font-size:13px;margin-bottom:12px">
          확인 중...
        </div>
        <div id="gcal-events-area" style="display:none;margin-bottom:12px"></div>
        <div class="form-actions">
          <button id="gcal-connect-btn" class="btn btn-primary" onclick="Settings.gcalConnect()" style="display:none">🔗 구글 계정 연동</button>
          <button id="gcal-disconnect-btn" class="btn btn-danger btn-sm" onclick="Settings.gcalDisconnect()" style="display:none">연동 해제</button>
          <button id="gcal-fetch-btn" class="btn btn-secondary" onclick="Settings.gcalFetch()" style="display:none">📥 캘린더 일정 가져오기</button>
          <button id="gcal-push-btn" class="btn btn-success btn-sm" onclick="Settings.gcalPushForm()" style="display:none">📤 일정 등록</button>
        </div>
      </div>

      <!-- 모바일 접속 안내 -->
      <div class="card" style="max-width:640px;margin-top:0">
        <div class="card-title">📱 모바일 접속 안내</div>
        <div id="mobile-url-info" style="font-size:13px;color:#6c757d">서버 IP 확인 중...</div>
        <div style="margin-top:12px;padding:12px;background:#d1fae5;border-radius:8px;font-size:13px">
          <strong>📌 직원 핸드폰에서 접속하는 방법:</strong><br>
          1. 회사 Wi-Fi에 연결<br>
          2. 브라우저에서 위 주소 입력<br>
          3. 주소창 옆 <strong>홈 화면에 추가</strong> 버튼으로 앱처럼 설치 가능
        </div>
      </div>
    `;

    this.loadServerIP();
    this.gcalCheckStatus();
  },

  async loadServerIP() {
    try {
      const res = await API.get('/api/settings/server-ip');
      const el = document.getElementById('mobile-url-info');
      if (el && res.ips) {
        el.innerHTML = `
          <strong>이 PC의 로컬 IP 주소:</strong><br>
          ${res.ips.map(ip => `
            <div style="margin:6px 0;padding:8px 12px;background:#f8f9fa;border-radius:6px;font-family:monospace;font-size:15px;display:flex;align-items:center;gap:10px">
              <strong>http://${ip}:3000</strong>
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard?.writeText('http://${ip}:3000')">복사</button>
            </div>`).join('')}
          <span style="font-size:11px;color:#adb5bd">같은 Wi-Fi 네트워크에서만 접속 가능합니다</span>
        `;
      }
    } catch {}
  },

  useMyLocation(num) {
    const el = document.getElementById(`my-loc-status-${num}`);
    el.textContent = '위치 가져오는 중...';
    navigator.geolocation.getCurrentPosition(
      pos => {
        Utils.setVal(`s-lat${num === 1 ? '' : '2'}`, pos.coords.latitude.toFixed(6));
        Utils.setVal(`s-lon${num === 1 ? '' : '2'}`, pos.coords.longitude.toFixed(6));
        el.textContent = `✅ 위치 설정됨 (정확도: ±${Math.round(pos.coords.accuracy)}m)`;
      },
      () => { el.textContent = '❌ 위치 권한이 필요합니다'; }
    );
  },

  async saveLocation(num) {
    const suffix = num === 1 ? '' : '2';
    const body = {};
    body[`work_lat${suffix}`] = Utils.val(`s-lat${suffix}`);
    body[`work_lon${suffix}`] = Utils.val(`s-lon${suffix}`);
    body[`work_radius${suffix}`] = Utils.val(`s-radius${suffix}`);
    body[`work_name${suffix}`] = Utils.val(`s-name${suffix}`);
    try {
      await API.post('/api/settings', body);
      Utils.showToast(`근무지 ${num} 설정이 저장되었습니다.`);
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async gcalCheckStatus() {
    try {
      const s = await API.get('/api/gcal/status');
      const area = document.getElementById('gcal-status-area');
      if (!area) return;
      if (s.connected) {
        area.innerHTML = `<span style="color:#198754;font-weight:600">✅ 구글캘린더 연동됨</span><br><span style="color:#6c757d;font-size:11px">최근 업데이트: ${s.updated_at || '-'}</span>`;
        document.getElementById('gcal-disconnect-btn').style.display = '';
        document.getElementById('gcal-fetch-btn').style.display = '';
        document.getElementById('gcal-push-btn').style.display = '';
        document.getElementById('gcal-connect-btn').style.display = 'none';
      } else {
        area.innerHTML = `<span style="color:#6c757d">❌ 연동되지 않음</span><br><span style="font-size:11px;color:#adb5bd">구글 계정을 연결하면 캘린더와 동기화됩니다</span>`;
        document.getElementById('gcal-connect-btn').style.display = '';
        document.getElementById('gcal-disconnect-btn').style.display = 'none';
        document.getElementById('gcal-fetch-btn').style.display = 'none';
        document.getElementById('gcal-push-btn').style.display = 'none';
      }
    } catch(e) {
      const area = document.getElementById('gcal-status-area');
      if (area) area.innerHTML = `<span style="color:#dc3545">오류: ${e.message}</span>`;
    }
  },

  async gcalConnect() {
    try {
      const { url } = await API.get('/api/gcal/auth-url');
      const popup = window.open(url, 'gcal-auth', 'width=500,height=600');
      window.addEventListener('message', async (e) => {
        if (e.data?.type === 'gcal-connected') {
          popup?.close();
          Utils.showToast('구글캘린더 연동이 완료되었습니다!');
          await Settings.gcalCheckStatus();
        }
      }, { once: true });
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async gcalDisconnect() {
    if (!confirm('구글캘린더 연동을 해제하시겠습니까?')) return;
    try {
      await API.delete('/api/gcal/disconnect');
      Utils.showToast('연동이 해제되었습니다.');
      await Settings.gcalCheckStatus();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async gcalFetch() {
    const area = document.getElementById('gcal-events-area');
    area.style.display = '';
    area.innerHTML = '<div style="color:#6c757d;font-size:13px">📅 일정 불러오는 중...</div>';
    try {
      const events = await API.get('/api/gcal/events');
      if (!events.length) {
        area.innerHTML = '<div style="color:#6c757d;font-size:13px">앞으로 1개월 내 일정이 없습니다</div>';
        return;
      }
      area.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">📅 구글캘린더 일정 (앞으로 1개월)</div>
        <div style="border:1px solid #dee2e6;border-radius:8px;overflow:hidden">
          ${events.map(e => `
            <div style="padding:10px 14px;border-bottom:1px solid #dee2e6;display:flex;gap:10px;align-items:flex-start">
              <div style="min-width:100px;font-size:11px;color:#6c757d">${e.start?.slice(0,10) || ''}</div>
              <div>
                <div style="font-weight:600;font-size:13px">${e.title}</div>
                ${e.description ? `<div style="font-size:11px;color:#6c757d;margin-top:2px">${e.description}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>`;
    } catch (e) {
      area.innerHTML = `<div style="color:#dc3545;font-size:13px">오류: ${e.message}</div>`;
    }
  },

  gcalPushForm() {
    const today = Utils.today();
    Utils.modal('📤 구글캘린더에 일정 등록',
      `<div class="form-grid">
        <div class="form-group"><label>제목 *</label><input id="f-gcal-title" placeholder="일정 제목"></div>
        <div class="form-group"><label>시작일 *</label><input type="date" id="f-gcal-start" value="${today}"></div>
        <div class="form-group"><label>종료일</label><input type="date" id="f-gcal-end" value="${today}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>내용</label><textarea id="f-gcal-desc" placeholder="일정 내용 (선택)"></textarea></div>
      </div>`,
      async () => {
        const body = { title: Utils.val('f-gcal-title'), start: Utils.val('f-gcal-start'), end: Utils.val('f-gcal-end'), description: Utils.val('f-gcal-desc'), allDay: true };
        if (!body.title || !body.start) return Utils.showToast('제목과 시작일을 입력하세요', 'error');
        try {
          await API.post('/api/gcal/push-event', body);
          Utils.showToast('구글캘린더에 등록되었습니다!');
          Utils.closeModal();
          Settings.gcalFetch();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      },
      '캘린더에 등록'
    );
  },

  async saveGeneral() {
    try {
      await API.post('/api/settings', {
        annual_days: Utils.val('s-annual'),
        office_start: Utils.val('s-office-start'),
        field_weekday_start: Utils.val('s-field-weekday'),
        field_weekend_start: Utils.val('s-field-weekend'),
      });
      Utils.showToast('설정이 저장되었습니다.');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
