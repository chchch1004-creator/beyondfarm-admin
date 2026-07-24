const Community = {
  _channel: 'free',   // 'free' | 'rooms'
  _roomId: null,       // 현재 열린 방 ID
  _ws: null,
  _wsRetry: null,

  async render(params = {}) {
    document.getElementById('content').innerHTML = `
      <div id="community-wrap" style="display:flex;flex-direction:column;height:calc(100vh - 130px);max-width:700px">
        <!-- 탭 -->
        <div style="display:flex;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:12px;flex-shrink:0">
          <button id="ctab-free" onclick="Community.switchChannel('free')"
            style="flex:1;padding:11px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:700;cursor:pointer">
            💬 자유 채팅
          </button>
          <button id="ctab-rooms" onclick="Community.switchChannel('rooms')"
            style="flex:1;padding:11px;border:none;background:#f8fafc;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">
            📣 호출 응답
          </button>
        </div>

        <!-- 콘텐츠 영역 -->
        <div id="community-body" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
      </div>`;

    this._connectWS();

    if (params.roomId) {
      await this.switchChannel('rooms');
      await this.openRoom(params.roomId);
    } else {
      await this._loadFree();
    }
  },

  async switchChannel(ch) {
    this._channel = ch;
    ['free','rooms'].forEach(t => {
      const btn = document.getElementById(`ctab-${t}`);
      if (!btn) return;
      btn.style.background = t === ch ? '#2563eb' : '#f8fafc';
      btn.style.color = t === ch ? '#fff' : '#64748b';
    });
    if (ch === 'free') {
      this._roomId = null;
      await this._loadFree();
    } else {
      this._roomId = null;
      await this._loadRoomList();
    }
  },

  // ── 자유 채팅 ──
  async _loadFree() {
    const body = document.getElementById('community-body');
    if (!body) return;
    body.innerHTML = `
      <div id="chat-messages" style="flex:1;overflow-y:auto;padding:8px 4px;display:flex;flex-direction:column;gap:8px"></div>
      <div style="flex-shrink:0;display:flex;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0;margin-top:8px">
        <textarea id="chat-input" placeholder="메시지를 입력하세요" rows="2"
          style="flex:1;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;resize:none;font-family:inherit;outline:none"
          onkeydown="Community.onKey(event)"></textarea>
        <button onclick="Community.sendFree()"
          style="padding:0 18px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;align-self:stretch">
          전송
        </button>
      </div>`;
    try {
      const msgs = await API.get('/api/community/messages?channel=free&limit=100');
      const box = document.getElementById('chat-messages');
      if (!box) return;
      msgs.forEach(m => this._appendMsg(m, false, box));
      this._scrollBottom();
    } catch (e) { }
  },

  async sendFree() {
    const input = document.getElementById('chat-input');
    const content = input?.value?.trim();
    if (!content) return;
    input.value = '';
    try {
      await API.post('/api/community/messages', { channel: 'free', content });
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  // ── 호출 방 목록 ──
  async _loadRoomList() {
    const body = document.getElementById('community-body');
    if (!body) return;
    body.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:20px;font-size:13px">불러오는 중...</div>`;
    try {
      const rooms = await API.get('/api/community/rooms');
      if (!rooms.length) {
        body.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:40px;font-size:13px">📭 참여 중인 호출 채팅방이 없습니다</div>`;
        return;
      }
      body.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;padding:4px 0">
        ${rooms.map(r => {
          const time = (r.last_msg_at || r.created_at || '').slice(11, 16);
          const date = (r.last_msg_at || r.created_at || '').slice(5, 10);
          return `
          <div onclick="Community.openRoom(${r.id})"
            style="padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;cursor:pointer;
                   display:flex;flex-direction:column;gap:4px;transition:background .15s"
            onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-size:14px;font-weight:700;color:#1e293b;flex:1;margin-right:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                📣 ${this._escape(r.title)}
              </div>
              <div style="font-size:11px;color:#94a3b8;white-space:nowrap">${date} ${time}</div>
            </div>
            <div style="font-size:12px;color:#64748b">호출자: ${this._escape(r.created_by_name)}</div>
            ${r.last_msg ? `<div style="font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._escape(r.last_msg)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    } catch (e) {
      body.innerHTML = `<div style="color:#dc2626;text-align:center;padding:20px">${e.message}</div>`;
    }
  },

  // ── 개별 호출 방 ──
  async openRoom(roomId) {
    this._roomId = roomId;
    this._channel = 'rooms';

    // 탭 활성화
    ['free','rooms'].forEach(t => {
      const btn = document.getElementById(`ctab-${t}`);
      if (!btn) return;
      btn.style.background = t === 'rooms' ? '#dc2626' : '#f8fafc';
      btn.style.color = t === 'rooms' ? '#fff' : '#64748b';
    });

    const body = document.getElementById('community-body');
    if (!body) return;
    body.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:20px;font-size:13px">불러오는 중...</div>`;

    try {
      const [msgs, members] = await Promise.all([
        API.get(`/api/community/rooms/${roomId}/messages`),
        API.get(`/api/community/rooms/${roomId}/members`),
      ]);

      const memberNames = members.map(m => m.name).join(', ');
      body.innerHTML = `
        <!-- 방 헤더 -->
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e2e8f0;margin-bottom:8px;flex-shrink:0">
          <button onclick="Community._loadRoomList()"
            style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#475569;font-size:13px;cursor:pointer">
            ← 목록
          </button>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">호출 응답 채팅</div>
            <div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._escape(memberNames)}</div>
          </div>
        </div>
        <!-- 메시지 -->
        <div id="chat-messages" style="flex:1;overflow-y:auto;padding:8px 4px;display:flex;flex-direction:column;gap:8px"></div>
        <!-- 입력 -->
        <div style="flex-shrink:0;display:flex;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0;margin-top:8px">
          <textarea id="chat-input" placeholder="메시지를 입력하세요" rows="2"
            style="flex:1;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;resize:none;font-family:inherit;outline:none"
            onkeydown="Community.onKey(event)"></textarea>
          <button onclick="Community.sendRoom()"
            style="padding:0 18px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;align-self:stretch">
            전송
          </button>
        </div>`;

      const box = document.getElementById('chat-messages');
      if (box) {
        msgs.forEach(m => this._appendMsg(m, false, box));
        this._scrollBottom();
      }
    } catch (e) {
      body.innerHTML = `<div style="color:#dc2626;text-align:center;padding:20px">${e.message}</div>`;
    }
  },

  async sendRoom() {
    if (!this._roomId) return;
    const input = document.getElementById('chat-input');
    const content = input?.value?.trim();
    if (!content) return;
    input.value = '';
    try {
      await API.post(`/api/community/rooms/${this._roomId}/messages`, { content });
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  // ── 공통 ──
  onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (this._roomId) this.sendRoom();
      else this.sendFree();
    }
  },

  _appendMsg(msg, scroll = true, boxEl) {
    const box = boxEl || document.getElementById('chat-messages');
    if (!box) return;
    const isMine = msg.user_id === App.user?.id;
    const time = msg.created_at ? msg.created_at.slice(11, 16) : '';
    const el = document.createElement('div');
    el.id = `cmsg-${msg.id}`;
    el.style.cssText = `display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'}`;
    el.innerHTML = `
      <div style="font-size:11px;color:#94a3b8;margin-bottom:3px;padding:0 4px">
        ${isMine ? '' : `<strong style="color:#475569">${msg.user_name}</strong> · `}${time}
        ${isMine || App.user?.role === 'superadmin'
          ? `<span onclick="Community.deleteMsg(${msg.id})" style="cursor:pointer;margin-left:6px;color:#cbd5e1;font-size:10px">✕</span>`
          : ''}
      </div>
      <div style="max-width:75%;padding:10px 14px;border-radius:${isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px'};
                  background:${isMine ? (this._roomId ? '#dc2626' : '#2563eb') : '#f1f5f9'};
                  color:${isMine ? '#fff' : '#1e293b'};
                  font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap">${this._escape(msg.content)}</div>`;
    box.appendChild(el);
    if (scroll) this._scrollBottom();
  },

  _escape(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  _scrollBottom() {
    const box = document.getElementById('chat-messages');
    if (box) box.scrollTop = box.scrollHeight;
  },

  async deleteMsg(id) {
    try {
      await API.delete(`/api/community/messages/${id}`);
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  _connectWS() {
    if (this._ws) { try { this._ws.close(); } catch {} }
    clearTimeout(this._wsRetry);

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    this._ws = ws;

    ws.onmessage = (e) => {
      try {
        const { type, data } = JSON.parse(e.data);

        // 자유 채팅
        if (type === 'community_message' && this._channel === 'free' && !this._roomId) {
          this._appendMsg(data);
        }
        // 호출 방 메시지
        if (type === 'room_message' && this._roomId === data.room_id) {
          this._appendMsg(data);
        }
        // 삭제
        if (type === 'community_delete') {
          const el = document.getElementById(`cmsg-${data.id}`);
          if (el) el.remove();
        }
        // 방 목록 보는 중이면 목록 새로고침
        if (type === 'room_message' && this._channel === 'rooms' && !this._roomId) {
          this._loadRoomList();
        }
      } catch {}
    };

    ws.onclose = () => {
      if (App.currentPage === 'community') {
        this._wsRetry = setTimeout(() => this._connectWS(), 3000);
      }
    };
    ws.onerror = () => {};
  },

  destroy() {
    clearTimeout(this._wsRetry);
    if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
    this._roomId = null;
  },
};
