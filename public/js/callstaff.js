const CallStaff = {
  _employees: [],
  _clockedInIds: new Set(),

  async render() {
    document.getElementById('content').innerHTML = `<div style="color:#94a3b8;text-align:center;padding:40px">불러오는 중...</div>`;
    try {
      const data = await API.get('/api/employees?status=active');
      this._employees = data.employees || [];
      const kstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const todayStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth()+1).padStart(2,'0')}-${String(kstDate.getDate()).padStart(2,'0')}`;
      const att = await API.get('/api/attendance?date=' + todayStr);
      this._clockedInIds = new Set(
        (Array.isArray(att) ? att : [])
          .filter(a => a.check_in && !a.check_out)
          .map(a => a.user_id)
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
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">📣 직원 호출</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:12px">알림을 받으려면 직원이 앱에서 <b>🔔 알림 켜기</b>를 눌러야 합니다.</div>

        <!-- 대상 선택 탭 -->
        <div style="display:flex;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:16px">
          <button id="tab-clocked" onclick="CallStaff.switchTab('clocked')"
            style="flex:1;padding:10px 4px;border:none;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer">
            출근 중
          </button>
          <button id="tab-individual" onclick="CallStaff.switchTab('individual')"
            style="flex:1;padding:10px 4px;border:none;background:#f8fafc;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">
            개별 선택
          </button>
          <button id="tab-all" onclick="CallStaff.switchTab('all')"
            style="flex:1;padding:10px 4px;border:none;background:#f8fafc;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">
            전체 (동의자)
          </button>
        </div>

        <!-- 출근 중 탭 -->
        <div id="panel-clocked">
          <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">현재 출근 중인 직원에게만 전송합니다.</div>
          <button onclick="CallStaff.send('clocked','전체 호출','모든 직원을 호출합니다.')"
            style="width:100%;padding:14px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:12px">
            📢 출근 중 전체 호출
          </button>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${emps.map(e => {
              const on = this._clockedInIds.has(e.user_id ?? e.id);
              return `
              <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:${on?'#f8fafc':'#f1f5f9'}">
                <div style="flex:1">
                  <div style="font-size:14px;font-weight:600;color:${on?'#1e293b':'#94a3b8'}">${e.name}</div>
                  <div style="font-size:12px;color:#94a3b8">${e.position||''} ${e.department||''} ${on?'<span style="color:#16a34a;font-weight:600">● 출근중</span>':'<span>● 퇴근</span>'}</div>
                </div>
                ${on ? `<button onclick="CallStaff.send(${e.id},'호출: ${e.name}','${e.name}님, 호출합니다.')"
                  style="padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">호출</button>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- 개별 선택 탭 -->
        <div id="panel-individual" style="display:none">
          <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">선택한 직원들에게만 전송합니다. (출근 여부 무관)</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
            ${emps.map(e => {
              const on = this._clockedInIds.has(e.user_id ?? e.id);
              return `
              <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;cursor:pointer">
                <input type="checkbox" value="${e.id}" class="ind-check" style="width:18px;height:18px;cursor:pointer">
                <div style="flex:1">
                  <div style="font-size:14px;font-weight:600;color:#1e293b">${e.name}</div>
                  <div style="font-size:12px;color:#94a3b8">${e.position||''} ${e.department||''} ${on?'<span style="color:#16a34a;font-weight:600">● 출근중</span>':'<span style="color:#94a3b8">● 퇴근</span>'}</div>
                </div>
              </label>`;
            }).join('')}
          </div>
          <button onclick="CallStaff.sendIndividual()"
            style="width:100%;padding:13px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">
            📢 선택 직원 호출
          </button>
        </div>

        <!-- 전체(동의자) 탭 -->
        <div id="panel-all" style="display:none">
          <div style="font-size:12px;color:#94a3b8;margin-bottom:12px">알림에 동의한 모든 직원에게 전송합니다. (출근 여부 무관)</div>
          <button onclick="CallStaff.send('all','전체 호출','모든 직원을 호출합니다.')"
            style="width:100%;padding:14px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">
            📢 전체 호출 (동의자 전원)
          </button>
        </div>
      </div>

      <!-- 직접 입력 -->
      <div class="card" style="max-width:600px;margin-top:12px">
        <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:10px">✏️ 직접 입력해서 보내기</div>
        <div style="display:flex;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:8px">
          <button id="ctab-clocked" onclick="CallStaff.switchCustomTab('clocked')"
            style="flex:1;padding:8px 4px;border:none;background:#2563eb;color:#fff;font-size:11px;font-weight:700;cursor:pointer">출근 중</button>
          <button id="ctab-individual" onclick="CallStaff.switchCustomTab('individual')"
            style="flex:1;padding:8px 4px;border:none;background:#f8fafc;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">개별 선택</button>
          <button id="ctab-all" onclick="CallStaff.switchCustomTab('all')"
            style="flex:1;padding:8px 4px;border:none;background:#f8fafc;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">전체 (동의자)</button>
        </div>
        <!-- 개별 선택 드롭다운 (기본 숨김) -->
        <select id="custom-individual-select" style="display:none;width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;margin-bottom:8px;background:#fff">
          ${emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
        </select>
        <input id="call-title" placeholder="제목" value="호출"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;margin-bottom:8px;outline:none">
        <textarea id="call-body" placeholder="내용" rows="3"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;resize:vertical;font-family:inherit;outline:none;margin-bottom:8px"></textarea>
        <button onclick="CallStaff.sendCustom()"
          style="width:100%;padding:11px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">전송</button>
      </div>

      <div style="max-width:600px;text-align:right;margin-top:8px">
        <button onclick="CallStaff.checkStatus()" style="font-size:11px;padding:4px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;color:#64748b;cursor:pointer">🔍 알림 상태 확인</button>
      </div>`;

    this._customTab = 'clocked';
  },

  _tab: 'clocked',
  _customTab: 'clocked',

  switchTab(tab) {
    this._tab = tab;
    ['clocked','individual','all'].forEach(t => {
      document.getElementById(`tab-${t}`).style.background = t === tab ? '#2563eb' : '#f8fafc';
      document.getElementById(`tab-${t}`).style.color = t === tab ? '#fff' : '#64748b';
      document.getElementById(`panel-${t}`).style.display = t === tab ? 'block' : 'none';
    });
  },

  switchCustomTab(tab) {
    this._customTab = tab;
    ['clocked','individual','all'].forEach(t => {
      document.getElementById(`ctab-${t}`).style.background = t === tab ? '#2563eb' : '#f8fafc';
      document.getElementById(`ctab-${t}`).style.color = t === tab ? '#fff' : '#64748b';
    });
    const sel = document.getElementById('custom-individual-select');
    if (sel) sel.style.display = tab === 'individual' ? 'block' : 'none';
  },

  async send(target, title, body) {
    try {
      const res = await API.post('/api/push/send', { to_user_id: target, title, body, url: '/' });
      const { sent } = res;
      if (sent > 0) Utils.showToast(`${sent}명에게 알림을 전송했습니다.`);
      else Utils.showToast(res.reason || '알림을 받을 기기가 없습니다. (알림 켜기 필요)', 'error');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async sendIndividual() {
    const checked = [...document.querySelectorAll('.ind-check:checked')].map(el => el.value);
    if (!checked.length) { Utils.showToast('직원을 선택해 주세요.', 'error'); return; }
    await this.send(checked.join(','), '호출', '호출합니다.');
  },

  async sendCustom() {
    const title = document.getElementById('call-title')?.value?.trim() || '호출';
    const body = document.getElementById('call-body')?.value?.trim() || '';
    let target = this._customTab;
    if (this._customTab === 'individual') {
      const sel = document.getElementById('custom-individual-select');
      target = sel?.value || 'clocked';
    }
    await this.send(target, title, body);
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
