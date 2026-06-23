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
        <div class="form-grid">
          <div class="form-group">
            <label>기본 연차 일수</label>
            <input id="s-annual" type="number" value="${cfg.annual_days || 15}" min="1">
          </div>
          <div class="form-group">
            <label>정시 출근 기준</label>
            <input id="s-workon" type="time" value="${cfg.work_start || '09:00'}">
          </div>
          <div class="form-group">
            <label>정시 퇴근 기준</label>
            <input id="s-workoff" type="time" value="${cfg.work_end || '18:00'}">
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="Settings.saveGeneral()">저장</button>
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

  async saveGeneral() {
    try {
      await API.post('/api/settings', {
        annual_days: Utils.val('s-annual'),
        work_start: Utils.val('s-workon'),
        work_end: Utils.val('s-workoff'),
      });
      Utils.showToast('설정이 저장되었습니다.');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
