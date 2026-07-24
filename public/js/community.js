const Community = {
  _channel: 'free',
  _ws: null,
  _wsRetry: null,

  async render() {
    document.getElementById('content').innerHTML = `
      <div id="community-wrap" style="display:flex;flex-direction:column;height:calc(100vh - 130px);max-width:700px">
        <!-- 탭 -->
        <div style="display:flex;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:12px;flex-shrink:0">
          <button id="ctab-free" onclick="Community.switchChannel('free')"
            style="flex:1;padding:11px;border:none;background:#2563eb;color:#fff;font-size:13px;font-weight:700;cursor:pointer">
            💬 자유 채팅
          </button>
          <button id="ctab-call" onclick="Community.switchChannel('call')"
            style="flex:1;padding:11px;border:none;background:#f8fafc;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;border-left:1px solid #e2e8f0">
            📣 호출 응답
          </button>
        </div>

        <!-- 메시지 영역 -->
        <div id="chat-messages" style="flex:1;overflow-y:auto;padding:8px 4px;display:flex;flex-direction:column;gap:8px"></div>

        <!-- 입력 영역 -->
        <div style="flex-shrink:0;display:flex;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0;margin-top:8px">
          <textarea id="chat-input" placeholder="메시지를 입력하세요" rows="2"
            style="flex:1;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;resize:none;font-family:inherit;outline:none"
            onkeydown="Community.onKey(event)"></textarea>
          <button onclick="Community.send()"
            style="padding:0 18px;background:#2563eb;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;align-self:stretch">
            전송
          </button>
        </div>
      </div>`;

    await this._loadMessages();
    this._connectWS();
  },

  switchChannel(ch) {
    this._channel = ch;
    ['free', 'call'].forEach(t => {
      const btn = document.getElementById(`ctab-${t}`);
      if (!btn) return;
      btn.style.background = t === ch ? '#2563eb' : '#f8fafc';
      btn.style.color = t === ch ? '#fff' : '#64748b';
    });
    this._loadMessages();
  },

  async _loadMessages() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    try {
      const msgs = await API.get(`/api/community/messages?channel=${this._channel}&limit=100`);
      box.innerHTML = '';
      msgs.forEach(m => this._appendMsg(m, false));
      this._scrollBottom();
    } catch (e) {
      if (box) box.innerHTML = `<div style="color:#dc2626;text-align:center;padding:20px">${e.message}</div>`;
    }
  },

  _appendMsg(msg, scroll = true) {
    const box = document.getElementById('chat-messages');
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
                  background:${isMine ? '#2563eb' : '#f1f5f9'};color:${isMine ? '#fff' : '#1e293b'};
                  font-size:14px;line-height:1.5;word-break:break-word;white-space:pre-wrap">${this._escape(msg.content)}</div>`;
    box.appendChild(el);
    if (scroll) this._scrollBottom();
  },

  _escape(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  _scrollBottom() {
    const box = document.getElementById('chat-messages');
    if (box) box.scrollTop = box.scrollHeight;
  },

  async send() {
    const input = document.getElementById('chat-input');
    const content = input?.value?.trim();
    if (!content) return;
    input.value = '';
    try {
      await API.post('/api/community/messages', { channel: this._channel, content });
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  onKey(e) {
    // Enter만 전송, Shift+Enter는 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.send();
    }
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
        if (type === 'community_message' && data.channel === this._channel) {
          this._appendMsg(data);
        }
        if (type === 'community_delete' && data.channel === this._channel) {
          const el = document.getElementById(`cmsg-${data.id}`);
          if (el) el.remove();
        }
      } catch {}
    };

    ws.onclose = () => {
      // 현재 페이지가 커뮤니티일 때만 재연결
      if (App.currentPage === 'community') {
        this._wsRetry = setTimeout(() => this._connectWS(), 3000);
      }
    };
    ws.onerror = () => {};
  },

  destroy() {
    clearTimeout(this._wsRetry);
    if (this._ws) { try { this._ws.close(); } catch {} this._ws = null; }
  },
};
