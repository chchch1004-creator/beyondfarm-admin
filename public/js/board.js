const Board = {
  _page: 1,
  _total: 0,
  _limit: 20,
  _highlightId: null,

  async render(params = {}) {
    this._page = 1;
    this._highlightId = params.postId || null;
    const content = document.getElementById('content');
    const isAdmin = ['admin','superadmin'].includes(App.user.role);

    content.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:14px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #dee2e6;background:#f8f9fa;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:700">📌 게시판</span>
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Board.showForm()">✏️ 글쓰기</button>
        </div>
        <div id="board-list" style="min-height:200px"></div>
        <div id="board-pager" style="display:flex;justify-content:center;gap:6px;padding:12px"></div>
      </div>
      <div id="board-detail" style="display:none"></div>`;

    await this.loadList();
  },

  async loadList() {
    const res = await API.get(`/api/board?page=${this._page}&limit=${this._limit}`);
    this._total = res.total;
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    const today = new Date().toISOString().slice(0, 10);

    const listEl = document.getElementById('board-list');
    if (!listEl) return;

    if (res.posts.length === 0) {
      listEl.innerHTML = '<div class="empty-state" style="padding:40px">게시글이 없습니다</div>';
    } else {
      listEl.innerHTML = `<table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6">
            <th style="padding:9px 16px;text-align:left;font-size:12px;color:#6c757d;width:60px">구분</th>
            <th style="padding:9px 8px;text-align:left;font-size:12px;color:#6c757d">제목</th>
            <th style="padding:9px 12px;text-align:center;font-size:12px;color:#6c757d;width:80px">작성자</th>
            <th style="padding:9px 12px;text-align:center;font-size:12px;color:#6c757d;width:90px">날짜</th>
            <th style="padding:9px 12px;text-align:center;font-size:12px;color:#6c757d;width:50px">조회</th>
          </tr>
        </thead>
        <tbody>
          ${res.posts.map(p => {
            const isActive = p.is_notice && (!p.notice_until || p.notice_until >= today);
            const highlight = p.id === this._highlightId;
            return `<tr onclick="Board.showDetail(${p.id})" style="cursor:pointer;border-bottom:1px solid #f1f3f5;${highlight ? 'background:#fffde7' : ''}${isActive ? 'font-weight:600' : ''}"
              onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='${highlight ? '#fffde7' : ''}'">
              <td style="padding:10px 16px;text-align:center">
                ${isActive ? '<span style="background:#1b4332;color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;white-space:nowrap">공지</span>'
                           : (p.is_notice ? '<span style="background:#dee2e6;color:#6c757d;font-size:10px;padding:2px 7px;border-radius:10px;white-space:nowrap">공지(만료)</span>' : '')}
              </td>
              <td style="padding:10px 8px;font-size:14px">${this._esc(p.title)}</td>
              <td style="padding:10px 12px;text-align:center;font-size:12px;color:#6c757d">${this._esc(p.author_name)}</td>
              <td style="padding:10px 12px;text-align:center;font-size:12px;color:#6c757d">${p.created_at.slice(0,10)}</td>
              <td style="padding:10px 12px;text-align:center;font-size:12px;color:#adb5bd">${p.views}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    }

    // 공지배너에서 넘어온 경우 해당 글 바로 열기
    if (params.postId) {
      await this.showDetail(params.postId);
    }

    // 페이저
    const totalPages = Math.ceil(this._total / this._limit);
    const pager = document.getElementById('board-pager');
    if (pager && totalPages > 1) {
      pager.innerHTML = Array.from({length: totalPages}, (_, i) => i+1).map(n =>
        `<button onclick="Board._page=${n};Board.loadList()"
          style="padding:5px 10px;border:1px solid ${n===this._page?'#1b4332':'#dee2e6'};border-radius:5px;
          background:${n===this._page?'#1b4332':'#fff'};color:${n===this._page?'#fff':'#495057'};cursor:pointer;font-size:13px">${n}</button>`
      ).join('');
    } else if (pager) pager.innerHTML = '';
  },

  async showDetail(id) {
    if (!id) return;
    const post = await API.get(`/api/board/${id}`);
    const isMine = post.user_id === App.user.id;
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    const canEdit = isMine || isAdmin;
    const today = new Date().toISOString().slice(0, 10);
    const isActive = post.is_notice && (!post.notice_until || post.notice_until >= today);

    const detailEl = document.getElementById('board-detail');
    const listEl   = document.getElementById('board-list');
    const pagerEl  = document.getElementById('board-pager');
    if (!detailEl) return;

    // 목록 숨기고 상세 표시
    if (listEl) listEl.style.display = 'none';
    if (pagerEl) pagerEl.style.display = 'none';
    // 헤더 글쓰기 버튼도 숨김
    const headerBtn = document.querySelector('#content .btn-primary');
    if (headerBtn) headerBtn.style.display = 'none';

    detailEl.style.display = 'block';
    detailEl.innerHTML = `
      <div style="padding:20px">
        <button onclick="Board._backToList()" style="border:none;background:none;color:#1b4332;font-size:13px;font-weight:600;cursor:pointer;padding:0;margin-bottom:16px">← 목록으로</button>
        <div style="border-bottom:2px solid #1b4332;padding-bottom:12px;margin-bottom:16px">
          ${isActive ? '<span style="background:#1b4332;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-right:6px">📌 공지사항</span>' : ''}
          <div style="font-size:18px;font-weight:700;margin-top:8px">${this._esc(post.title)}</div>
          <div style="display:flex;gap:12px;margin-top:6px;font-size:12px;color:#6c757d">
            <span>✍️ ${this._esc(post.author_name)}</span>
            <span>📅 ${post.created_at.slice(0,16).replace('T',' ')}</span>
            <span>👁 ${post.views}</span>
            ${post.is_notice && post.notice_until ? `<span>📌 ${post.notice_until}까지 고정</span>` : ''}
            ${post.is_notice && !post.notice_until ? '<span>📌 무기한 고정</span>' : ''}
          </div>
        </div>
        <div style="font-size:14px;line-height:1.8;white-space:pre-wrap;min-height:80px">${this._esc(post.content||'')}</div>
        ${canEdit ? `<div style="display:flex;gap:8px;margin-top:24px;padding-top:16px;border-top:1px solid #dee2e6">
          <button class="btn btn-secondary btn-sm" onclick="Board.showForm(${post.id})">수정</button>
          <button class="btn btn-danger btn-sm" onclick="Board.deletePost(${post.id})">삭제</button>
        </div>` : ''}
      </div>`;
    detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _backToList() {
    const detailEl = document.getElementById('board-detail');
    const listEl   = document.getElementById('board-list');
    const pagerEl  = document.getElementById('board-pager');
    const headerBtn = document.querySelector('#content .btn-primary');
    if (detailEl) detailEl.style.display = 'none';
    if (listEl)   listEl.style.display = '';
    if (pagerEl)  pagerEl.style.display = '';
    if (headerBtn) headerBtn.style.display = '';
  },

  showForm(id) {
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
    const rec = id ? null : null; // detail loaded separately if editing
    const now = new Date();
    const defaultUntil = new Date(now.getTime() + 7*24*60*60*1000).toISOString().slice(0,10);

    if (id) {
      // 수정: 현재 데이터 미리 불러오기
      API.get(`/api/board/${id}`).then(post => {
        this._openFormModal(post, isAdmin);
      }).catch(e => Utils.showToast(e.message, 'error'));
    } else {
      this._openFormModal(null, isAdmin);
    }
  },

  _openFormModal(post, isAdmin) {
    const defaultUntil = new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10);
    Utils.modal(
      post ? '게시글 수정' : '글쓰기',
      `<div style="display:flex;flex-direction:column;gap:12px">
        <div class="form-group">
          <label>제목 *</label>
          <input id="bf-title" value="${this._esc(post?.title||'')}" placeholder="제목을 입력하세요">
        </div>
        <div class="form-group">
          <label>내용</label>
          <textarea id="bf-content" rows="8" style="resize:vertical">${this._esc(post?.content||'')}</textarea>
        </div>
        ${isAdmin ? `
        <div style="border:1px solid #dee2e6;border-radius:8px;padding:12px;background:#f8f9fa">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;margin-bottom:10px">
            <input type="checkbox" id="bf-notice" ${post?.is_notice ? 'checked' : ''}
              onchange="document.getElementById('bf-notice-opts').style.display=this.checked?'':'none'">
            📌 공지사항으로 등록
          </label>
          <div id="bf-notice-opts" style="display:${post?.is_notice ? '' : 'none'};padding-left:4px">
            <label style="font-size:13px;color:#495057;margin-bottom:6px;display:block">고정 기간</label>
            <div style="display:flex;flex-direction:column;gap:6px">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="bf-period" value="unlimited" ${!post?.notice_until ? 'checked' : ''}> 무제한
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="radio" name="bf-period" value="until" ${post?.notice_until ? 'checked' : ''}> 날짜까지
                <input type="date" id="bf-until" value="${post?.notice_until || ''}"
                  min="${new Date().toISOString().slice(0,10)}"
                  style="font-size:13px;padding:4px 8px;border:1px solid #dee2e6;border-radius:5px">
              </label>
            </div>
          </div>
        </div>` : ''}
      </div>`,
      async () => {
        const title   = Utils.val('bf-title');
        const content = document.getElementById('bf-content')?.value || '';
        if (!title) { Utils.showToast('제목을 입력하세요', 'error'); return; }
        const isNotice = document.getElementById('bf-notice')?.checked || false;
        const periodRadio = document.querySelector('input[name="bf-period"]:checked');
        const notice_until = (isNotice && periodRadio?.value === 'until')
          ? (document.getElementById('bf-until')?.value || null) : null;
        try {
          if (post) {
            await API.put(`/api/board/${post.id}`, { title, content, is_notice: isNotice, notice_until });
          } else {
            await API.post('/api/board', { title, content, is_notice: isNotice, notice_until });
          }
          Utils.showToast(post ? '수정되었습니다.' : '게시글이 등록되었습니다.');
          Utils.closeModal();
          Board._backToList();
          Board._page = 1;
          await Board.loadList();
          Board.refreshNoticeBanner();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }, '등록'
    );
  },

  async deletePost(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await API.delete(`/api/board/${id}`);
      Utils.showToast('삭제되었습니다.');
      Board._backToList();
      await Board.loadList();
      Board.refreshNoticeBanner();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  // 공지 배너 갱신 (저장/삭제 후 호출)
  async refreshNoticeBanner() {
    try {
      const notices = await API.get('/api/board/notices/active');
      NoticeBanner.show(notices);
    } catch {}
  },

  _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};

// ── 공지사항 배너 (전역) ──────────────────────────────────────────────
const NoticeBanner = {
  _notices: [],
  _idx: 0,
  _timer: null,

  _readKey() { return `board_read_${App.user?.id || 'guest'}`; },
  _readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(this._readKey()) || '[]')); } catch { return new Set(); }
  },
  _markRead(id) {
    const s = this._readSet();
    s.add(id);
    try { localStorage.setItem(this._readKey(), JSON.stringify([...s])); } catch {}
  },

  async init() {
    try {
      const all = await API.get('/api/board/notices/active');
      this.show(all);
    } catch { this.show([]); }
  },

  show(all) {
    // 이미 읽은 공지는 제외
    const read = this._readSet();
    this._notices = (all || []).filter(n => !read.has(n.id));
    clearInterval(this._timer);
    const el = document.getElementById('notice-banner');
    if (!el) return;
    if (!this._notices.length) { el.style.display = 'none'; return; }
    this._idx = 0;
    this._render(el);
    if (this._notices.length > 1) {
      this._timer = setInterval(() => {
        this._idx = (this._idx + 1) % this._notices.length;
        this._render(el);
      }, 5000);
    }
  },

  _render(el) {
    const n = this._notices[this._idx];
    if (!n) return;
    const count = this._notices.length > 1
      ? `<span style="opacity:0.7;font-size:11px;flex-shrink:0">${this._idx+1}/${this._notices.length}</span>` : '';
    el.style.display = 'flex';
    el.innerHTML = `
      <span style="background:rgba(255,255,255,0.25);border-radius:3px;padding:0 5px;font-size:10px;font-weight:700;flex-shrink:0;margin-right:6px">공지</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer"
        onclick="NoticeBanner._open(${n.id})">${Board._esc(n.title)}</span>
      ${count}
      <button onclick="NoticeBanner._close(${n.id})" style="border:none;background:none;color:rgba(255,255,255,0.8);font-size:17px;cursor:pointer;padding:0;margin-left:8px;line-height:1;flex-shrink:0">×</button>`;
  },

  _open(id) {
    this._markRead(id);
    App.goto('board', { postId: id });
    // 나머지 미읽은 공지 재표시
    this._notices = this._notices.filter(n => n.id !== id);
    if (!this._notices.length) {
      clearInterval(this._timer);
      const el = document.getElementById('notice-banner');
      if (el) el.style.display = 'none';
    } else {
      this._idx = 0;
      this._render(document.getElementById('notice-banner'));
    }
  },

  _close(id) {
    this._markRead(id);
    this._notices = this._notices.filter(n => n.id !== id);
    clearInterval(this._timer);
    const el = document.getElementById('notice-banner');
    if (!this._notices.length) { if (el) el.style.display = 'none'; return; }
    this._idx = 0;
    this._render(el);
    if (this._notices.length > 1) {
      this._timer = setInterval(() => {
        this._idx = (this._idx + 1) % this._notices.length;
        this._render(document.getElementById('notice-banner'));
      }, 5000);
    }
  },
};
