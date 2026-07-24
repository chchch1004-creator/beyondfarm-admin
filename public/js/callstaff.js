const CallStaff = {
  _employees: [],
  _clockedInIds: new Set(),
  _tab: 'clocked',

  async render() {
    document.getElementById('content').innerHTML = `<div style="color:#94a3b8;text-align:center;padding:40px">불러오는 중...</div>`;
    try {
      const data = await API.get('/api/employees?status=active');
      const all = Array.isArray(data) ? data : (data.employees || []);
      this._employees = all.filter(e => e.call_enabled);
      const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const todayStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth()+1).padStart(2,'0')}-${String(kstDate.getDate()).padStart(2,'0')}`;
      const att = await API.get('/api/attendance?date=' + todayStr);
      this._clockedInIds = new Set(
        (Array.isArray(att) ? att : []).filter(a => a.check_in && !a.check_out).map(a => a.user_id)
      );
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
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:12px">📣 직원 호출</div>

        <!-- 대상 탭 -->
        <div style="display:flex;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:16px">
          <button id="tab-clocked" onclick="CallStaff.switchTab('clocked')"
            style="flex:1;padding:11px 4px;border:none;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer">
            출근 중
          </button>
          <button id="tab-individual" onclick="CallStaff.switchTab('individual')"
            style="flex:1;padding:11px 4px;border:none;background:#f8fafc;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">
            개별 직원
          </button>
          <button id="tab-all" onclick="CallStaff.switchTab('all')"
            style="flex:1;padding:11px 4px;border:none;background:#f8fafc;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">
            전체 (동의자)
          </button>
        </div>

        <!-- 설명 -->
        <div id="tab-desc" style="font-size:12px;color:#94a3b8;margin-bottom:12px">현재 출근 중인 직원에게만 전송합니다.</div>

        <!-- 개별 선택 직원 목록 -->
        <div id="panel-individual" style="display:none;margin-bottom:12px">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
            ${emps.map(e => {
              const on = this._clockedInIds.has(e.user_id ?? e.id);
              return `
              <label style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;
                            border:2px solid #e2e8f0;border-radius:10px;background:#f8fafc;cursor:pointer;
                            text-align:center;position:relative">
                <input type="checkbox" value="${e.id}" class="ind-check"
                  style="position:absolute;top:6px;right:6px;width:16px;height:16px;cursor:pointer">
                <div style="font-size:14px;font-weight:600;color:#1e293b">${e.name}</div>
                <div style="font-size:11px;font-weight:600;color:${on?'#16a34a':'#94a3b8'}">${on?'● 출근중':'● 퇴근'}</div>
              </label>`;
            }).join('')}
          </div>
        </div>

        <!-- 내용 입력 -->
        <textarea id="call-body" placeholder="내용을 입력하세요" rows="4"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;resize:vertical;font-family:inherit;outline:none;margin-bottom:10px"></textarea>

        <button onclick="CallStaff.sendMessage()"
          style="width:100%;padding:14px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
          📢 호출
        </button>

        <div style="text-align:right;margin-top:10px">
          <button onclick="CallStaff.checkStatus()" style="font-size:11px;padding:4px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#94a3b8;cursor:pointer">🔍 알림 상태 확인</button>
        </div>
      </div>`;
  },

  switchTab(tab) {
    this._tab = tab;
    const descs = {
      clocked: '현재 출근 중인 직원에게만 전송합니다.',
      individual: '아래 직원 이름을 탭해서 선택하세요. (복수 선택 가능)',
      all: '알림에 동의한 모든 직원에게 전송합니다.',
    };
    ['clocked','individual','all'].forEach(t => {
      const btn = document.getElementById(`tab-${t}`);
      btn.style.background = t === tab ? '#2563eb' : '#f8fafc';
      btn.style.color = t === tab ? '#fff' : '#64748b';
    });
    document.getElementById('tab-desc').textContent = descs[tab];
    document.getElementById('panel-individual').style.display = tab === 'individual' ? 'block' : 'none';
  },

  async sendMessage() {
    const body = document.getElementById('call-body')?.value?.trim();
    if (!body) { Utils.showToast('내용을 입력해 주세요.', 'error'); return; }

    let target = this._tab;
    if (this._tab === 'individual') {
      const checked = [...document.querySelectorAll('.ind-check:checked')].map(el => el.value);
      if (!checked.length) { Utils.showToast('직원을 선택해 주세요.', 'error'); return; }
      target = checked.join(',');
    }

    try {
      const res = await API.post('/api/push/send', { to_user_id: target, title: '비욘더팜 호출', body, create_room: true });
      if (res.sent > 0) {
        Utils.showToast(`${res.sent}명에게 알림을 전송했습니다.`);
        document.getElementById('call-body').value = '';
        if (res.room_id) {
          setTimeout(() => App.goto('community', { roomId: res.room_id }), 600);
        }
      } else {
        Utils.showToast(res.reason || '알림을 받을 기기가 없습니다. (알림 켜기 필요)', 'error');
      }
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async checkStatus() {
    try {
      const s = await API.get('/api/push/status');
      const lines = [`Firebase: ${s.firebase_initialized ? '✅ 초기화됨' : '❌ 미초기화'}`];
      if (s.firebase_error) lines.push(`오류: ${s.firebase_error}`);
      lines.push(`FCM 토큰: ${s.fcm_tokens.length}개`, `웹 구독: ${s.web_subscriptions.length}개`);
      if (s.fcm_tokens.length > 0) lines.push(`최근 등록: ${s.fcm_tokens[0].updated_at}`);
      alert(lines.join('\n'));
    } catch (e) { alert('확인 실패: ' + e.message); }
  },
};
