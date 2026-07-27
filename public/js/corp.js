const Corp = {
  _data: [],
  _category: 'all',
  _categories: [],
  _showPw: {},

  async render() {
    document.getElementById('content').innerHTML =
      `<div style="color:#94a3b8;text-align:center;padding:40px">불러오는 중...</div>`;
    try {
      await this._load();
      this._renderUI();
    } catch (e) {
      document.getElementById('content').innerHTML =
        `<div style="color:#dc2626;text-align:center;padding:40px">${e.message}</div>`;
    }
  },

  async _load() {
    const [data, cats] = await Promise.all([
      API.get('/api/corp'),
      API.get('/api/corp/categories'),
    ]);
    this._data = data;
    this._categories = cats;
    this._showPw = {};
  },

  _filtered() {
    if (this._category === 'all') return this._data;
    return this._data.filter(r => r.category === this._category);
  },

  _renderUI() {
    const canEdit = App.canEdit('corp') || App.user?.role === 'superadmin';
    const cats = this._categories;
    const filtered = this._filtered();

    const catTabs = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
        ${['all', ...cats].map(c => `
          <button onclick="Corp.filterCat('${c}')"
            style="padding:6px 14px;border-radius:20px;border:1px solid ${this._category===c?'#2563eb':'#e2e8f0'};
                   background:${this._category===c?'#2563eb':'#fff'};color:${this._category===c?'#fff':'#64748b'};
                   font-size:12px;font-weight:600;cursor:pointer">
            ${c === 'all' ? '전체' : c}
          </button>`).join('')}
        ${canEdit ? `
          <button onclick="Corp.showAddModal()"
            style="padding:6px 16px;border-radius:20px;border:none;background:#16a34a;color:#fff;
                   font-size:12px;font-weight:700;cursor:pointer;margin-left:auto">
            + 추가
          </button>` : ''}
      </div>`;

    const groupByCategory = {};
    filtered.forEach(r => {
      if (!groupByCategory[r.category]) groupByCategory[r.category] = [];
      groupByCategory[r.category].push(r);
    });

    const cards = Object.entries(groupByCategory).map(([cat, items]) => `
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;
                    letter-spacing:1px;margin-bottom:8px;padding-left:4px">${cat}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${items.map(r => this._card(r, canEdit)).join('')}
        </div>
      </div>`).join('');

    const empty = !filtered.length ? `
      <div style="text-align:center;padding:60px 20px;color:#94a3b8">
        <div style="font-size:40px;margin-bottom:12px">🔐</div>
        <div style="font-size:14px">등록된 계정 정보가 없습니다</div>
        ${canEdit ? `<button onclick="Corp.showAddModal()"
          style="margin-top:16px;padding:10px 24px;background:#2563eb;color:#fff;border:none;
                 border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
          + 첫 계정 추가하기</button>` : ''}
      </div>` : '';

    document.getElementById('content').innerHTML = `
      <div style="max-width:700px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="font-size:18px;font-weight:700;color:#1e293b">🔐 법인 계정 정보</div>
        </div>
        ${catTabs}
        ${cards || empty}
      </div>`;
  },

  _card(r, canEdit) {
    const showPw = this._showPw[r.id];
    return `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:15px;font-weight:700;color:#1e293b">${this._esc(r.site_name)}</div>
            ${r.url ? `<a href="${this._esc(r.url)}" target="_blank"
              style="font-size:11px;color:#2563eb;text-decoration:none;word-break:break-all">${this._esc(r.url)}</a>` : ''}
          </div>
          ${canEdit ? `
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button onclick="Corp.showEditModal(${r.id})"
                style="padding:4px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;
                       color:#475569;font-size:11px;cursor:pointer">수정</button>
              <button onclick="Corp.delete(${r.id})"
                style="padding:4px 10px;border:1px solid #fca5a5;border-radius:6px;background:#fff;
                       color:#dc2626;font-size:11px;cursor:pointer">삭제</button>
            </div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:60px 1fr;gap:6px 10px;font-size:13px">
          ${r.login_id ? `
            <div style="color:#94a3b8;font-weight:600">아이디</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-family:monospace;color:#1e293b">${this._esc(r.login_id)}</span>
              <button onclick="Corp.copy('${this._esc(r.login_id)}')"
                style="padding:2px 8px;border:1px solid #e2e8f0;border-radius:4px;background:#f8fafc;
                       color:#64748b;font-size:10px;cursor:pointer">복사</button>
            </div>` : ''}
          ${r.password ? `
            <div style="color:#94a3b8;font-weight:600">비밀번호</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-family:monospace;color:#1e293b">
                ${showPw ? this._esc(r.password) : '••••••••'}
              </span>
              <button onclick="Corp.togglePw(${r.id})"
                style="padding:2px 8px;border:1px solid #e2e8f0;border-radius:4px;background:#f8fafc;
                       color:#64748b;font-size:10px;cursor:pointer">${showPw ? '숨기기' : '보기'}</button>
              <button onclick="Corp.copy('${this._esc(r.password)}')"
                style="padding:2px 8px;border:1px solid #e2e8f0;border-radius:4px;background:#f8fafc;
                       color:#64748b;font-size:10px;cursor:pointer">복사</button>
            </div>` : ''}
          ${r.memo ? `
            <div style="color:#94a3b8;font-weight:600">메모</div>
            <div style="color:#475569;white-space:pre-wrap">${this._esc(r.memo)}</div>` : ''}
        </div>
      </div>`;
  },

  filterCat(cat) {
    this._category = cat;
    this._renderUI();
  },

  togglePw(id) {
    this._showPw[id] = !this._showPw[id];
    this._renderUI();
  },

  copy(text) {
    navigator.clipboard?.writeText(text).then(() => Utils.showToast('복사됐습니다')).catch(() => {
      Utils.showToast('복사 실패', 'error');
    });
  },

  showAddModal() {
    this._showModal(null);
  },

  showEditModal(id) {
    const r = this._data.find(d => d.id === id);
    if (r) this._showModal(r);
  },

  _showModal(r) {
    const isEdit = !!r;
    const CATS = ['세무/회계', '은행/금융', 'SNS/마케팅', '정부/공공', '쇼핑몰/예약', '기타'];
    const modal = document.createElement('div');
    modal.id = 'corp-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;
      display:flex;align-items:center;justify-content:center;padding:16px`;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:20px">
          ${isEdit ? '계정 수정' : '계정 추가'}
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">카테고리</label>
            <select id="corp-cat" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px">
              ${CATS.map(c => `<option value="${c}" ${r?.category===c?'selected':''}>${c}</option>`).join('')}
              ${r && !CATS.includes(r.category) ? `<option value="${r.category}" selected>${r.category}</option>` : ''}
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">사이트명 *</label>
            <input id="corp-name" value="${r ? this._esc(r.site_name) : ''}" placeholder="예: 국세청 홈택스"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">URL</label>
            <input id="corp-url" value="${r ? this._esc(r.url||'') : ''}" placeholder="https://"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">아이디</label>
            <input id="corp-id" value="${r ? this._esc(r.login_id||'') : ''}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">비밀번호</label>
            <input id="corp-pw" type="text" value="${r ? this._esc(r.password||'') : ''}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:monospace">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#64748b;display:block;margin-bottom:4px">메모</label>
            <textarea id="corp-memo" rows="3" placeholder="추가 메모"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;resize:vertical;font-family:inherit">${r ? this._esc(r.memo||'') : ''}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px">
          <button onclick="Corp.closeModal()"
            style="flex:1;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;
                   color:#64748b;font-size:14px;font-weight:600;cursor:pointer">취소</button>
          <button onclick="Corp.save(${isEdit ? r.id : 'null'})"
            style="flex:2;padding:12px;border:none;border-radius:8px;background:#2563eb;
                   color:#fff;font-size:14px;font-weight:700;cursor:pointer">
            ${isEdit ? '저장' : '추가'}
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) this.closeModal(); });
  },

  closeModal() {
    document.getElementById('corp-modal')?.remove();
  },

  async save(id) {
    const body = {
      category: document.getElementById('corp-cat').value,
      site_name: document.getElementById('corp-name').value,
      url: document.getElementById('corp-url').value,
      login_id: document.getElementById('corp-id').value,
      password: document.getElementById('corp-pw').value,
      memo: document.getElementById('corp-memo').value,
    };
    try {
      if (id) await API.put(`/api/corp/${id}`, body);
      else await API.post('/api/corp', body);
      this.closeModal();
      await this._load();
      this._renderUI();
      Utils.showToast(id ? '수정됐습니다' : '추가됐습니다');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async delete(id) {
    const r = this._data.find(d => d.id === id);
    if (!confirm(`"${r?.site_name}" 계정을 삭제하시겠습니까?`)) return;
    try {
      await API.delete(`/api/corp/${id}`);
      await this._load();
      this._renderUI();
      Utils.showToast('삭제됐습니다');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
