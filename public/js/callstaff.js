const CallStaff = {
  _employees: [],

  async render() {
    document.getElementById('content').innerHTML = `<div style="color:#94a3b8;text-align:center;padding:40px">불러오는 중...</div>`;
    try {
      const data = await API.get('/api/employees?status=active');
      this._employees = data.employees || [];
    } catch (e) {
      document.getElementById('content').innerHTML = `<div style="color:#dc2626;text-align:center;padding:40px">${e.message}</div>`;
      return;
    }
    this._renderUI();
  },

  _renderUI() {
    const emps = this._employees;
    document.getElementById('content').innerHTML = `
      <div class="card" style="max-width:600px">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">📣 직원 호출</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">호출 버튼을 누르면 해당 직원의 핸드폰에 알림이 전송됩니다.<br>알림을 받으려면 직원이 앱에서 <b>🔔 알림 켜기</b>를 눌러야 합니다.</div>
        <button onclick="CallStaff.checkStatus()" style="font-size:11px;padding:4px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#64748b;cursor:pointer;margin-bottom:16px">🔍 알림 상태 확인</button>

        <div style="margin-bottom:16px">
          <button onclick="CallStaff.send('all','전체 호출','모든 직원을 호출합니다.')"
            style="width:100%;padding:14px;background:#dc2626;color:#fff;border:none;border-radius:10px;
                   font-size:15px;font-weight:700;cursor:pointer;margin-bottom:12px">
            📢 전체 호출
          </button>
        </div>

        <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:10px">개별 호출</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${emps.length === 0 ? '<div style="color:#94a3b8;text-align:center;padding:20px">활성 직원이 없습니다</div>' :
            emps.map(e => `
              <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                          border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc">
                <div style="flex:1">
                  <div style="font-size:14px;font-weight:600;color:#1e293b">${e.name}</div>
                  <div style="font-size:12px;color:#94a3b8">${e.position || ''} ${e.department || ''}</div>
                </div>
                <button onclick="CallStaff.send(${e.id},'호출: ${e.name}','${e.name}님, 호출합니다.')"
                  style="padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;
                         font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">
                  호출
                </button>
              </div>`).join('')}
        </div>
      </div>

      <div id="call-custom" class="card" style="max-width:600px;margin-top:12px">
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:10px">✏️ 직접 입력해서 보내기</div>
        <select id="call-target" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;margin-bottom:8px;background:#fff">
          <option value="all">전체</option>
          ${emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
        </select>
        <input id="call-title" placeholder="제목" value="호출"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;margin-bottom:8px;outline:none">
        <textarea id="call-body" placeholder="내용" rows="3"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;resize:vertical;font-family:inherit;outline:none;margin-bottom:8px"></textarea>
        <button onclick="CallStaff.sendCustom()"
          style="width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:8px;
                 font-size:14px;font-weight:700;cursor:pointer">전송</button>
      </div>`;
  },

  async send(userId, title, body) {
    try {
      const { sent } = await API.post('/api/push/send', {
        to_user_id: userId === 'all' ? 'all' : String(userId),
        title,
        body,
        url: '/',
      });
      Utils.showToast(sent > 0 ? `${sent}명에게 알림을 전송했습니다.` : '알림을 받을 기기가 없습니다. (알림 켜기 필요)');
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  },

  async checkStatus() {
    try {
      const s = await API.get('/api/push/status');
      const lines = [
        `Firebase: ${s.firebase_initialized ? '✅ 초기화됨' : '❌ 미초기화'}`,
        `FCM 토큰: ${s.fcm_tokens.length}개`,
        `웹 구독: ${s.web_subscriptions.length}개`,
      ];
      if (s.fcm_tokens.length > 0) lines.push(`최근 등록: ${s.fcm_tokens[0].updated_at}`);
      alert(lines.join('\n'));
    } catch (e) { alert('확인 실패: ' + e.message); }
  },

  async sendCustom() {
    const userId = document.getElementById('call-target')?.value;
    const title = document.getElementById('call-title')?.value?.trim() || '호출';
    const body = document.getElementById('call-body')?.value?.trim() || '';
    await this.send(userId, title, body);
  },
};
