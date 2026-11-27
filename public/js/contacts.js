// v20261127b
const Contacts = {
  _groups: [],
  _selGroupId: null,
  _contacts: [],

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
        <input id="ct-search" type="text" placeholder="이름·이메일·전화번호 검색…"
          style="flex:1;min-width:160px;padding:8px 12px;border:1px solid #dee2e6;border-radius:8px;font-size:14px"
          oninput="Contacts._search(this.value)">
        <button class="btn btn-primary btn-sm" onclick="Contacts._openGroupForm(null)">+ 그룹 추가</button>
      </div>
      <div id="ct-search-result" style="display:none;margin-bottom:16px"></div>
      <div id="ct-layout" style="display:grid;grid-template-columns:${window.innerWidth<768?'1fr':'220px 1fr'};gap:16px">
        <div>
          <div style="font-size:12px;color:#6c757d;font-weight:600;margin-bottom:6px;padding:0 4px">그룹</div>
          <div id="ct-group-list"></div>
        </div>
        <div id="ct-contact-panel">
          <div class="empty-state" style="padding:60px 0">
            <div class="icon">👥</div>
            <p>왼쪽에서 그룹을 선택하세요</p>
          </div>
        </div>
      </div>`;
    await this._loadGroups();
  },

  async _loadGroups() {
    this._groups = await API.get('/api/contacts/groups');
    this._renderGroupList();
    if (this._selGroupId) await this._loadContacts(this._selGroupId);
  },

  _renderGroupList() {
    const el = document.getElementById('ct-group-list');
    if (!el) return;
    if (!this._groups.length) {
      el.innerHTML = `<div style="font-size:13px;color:#adb5bd;padding:12px 8px">그룹이 없습니다<br><span style="font-size:11px">위 '+ 그룹 추가'를 눌러 시작하세요</span></div>`;
      return;
    }
    el.innerHTML = this._groups.map(g => `
      <div onclick="Contacts._selectGroup(${g.id})"
        style="padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;
          background:${g.id===this._selGroupId?'#1b4332':'transparent'};
          color:${g.id===this._selGroupId?'#fff':'#212529'};
          margin-bottom:3px;display:flex;justify-content:space-between;align-items:center">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">
          ${this._esc(g.name)}
          ${g.category ? `<span style="font-size:10px;opacity:0.7;margin-left:4px">[${this._esc(g.category)}]</span>` : ''}
        </span>
        <span style="font-size:11px;opacity:0.65;flex-shrink:0;margin-left:6px">${g.contact_count}</span>
      </div>`).join('');
  },

  async _selectGroup(id) {
    this._selGroupId = id;
    this._renderGroupList();
    await this._loadContacts(id);
  },

  async _loadContacts(groupId) {
    const panel = document.getElementById('ct-contact-panel');
    if (!panel) return;
    const g = this._groups.find(x => x.id === groupId);
    this._contacts = await API.get(`/api/contacts/groups/${groupId}/contacts`);

    const emailList = this._contacts.filter(c => c.email).map(c => c.email).join(', ');
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <span style="font-size:15px;font-weight:700">${this._esc(g?.name||'')}</span>
        ${g?.category ? `<span style="font-size:12px;background:#e9ecef;padding:2px 8px;border-radius:10px">${this._esc(g.category)}</span>` : ''}
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="Contacts._openGroupForm(${groupId})">그룹 수정</button>
          <button class="btn btn-primary btn-sm" onclick="Contacts._openContactForm(${groupId}, null)">+ 연락처 추가</button>
        </div>
      </div>
      ${g?.memo ? `<div style="font-size:12px;color:#6c757d;margin-bottom:12px;padding:8px 12px;background:#f8f9fa;border-radius:6px">${this._esc(g.memo)}</div>` : ''}
      ${emailList ? `
        <div style="margin-bottom:14px;padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="color:#1b4332;font-weight:600;flex-shrink:0">📧 이메일 목록</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#495057">${this._esc(emailList)}</span>
          <button id="ct-copy-btn" onclick="Contacts._copyEmails()"
            style="border:1px solid #1b4332;background:#fff;color:#1b4332;padding:3px 10px;border-radius:5px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0">복사</button>
        </div>` : ''}
      ${!this._contacts.length
        ? `<div class="empty-state" style="padding:40px 0"><div class="icon">📋</div><p>연락처가 없습니다<br><small>'+ 연락처 추가'를 눌러 추가하세요</small></p></div>`
        : `<div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;min-width:400px">
              <thead>
                <tr style="background:#f8f9fa;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">
                  <th style="padding:8px 12px;text-align:left;font-weight:600">이름</th>
                  <th style="padding:8px 12px;text-align:left;font-weight:600">이메일</th>
                  <th style="padding:8px 12px;text-align:left;font-weight:600">전화번호</th>
                  <th style="padding:8px 12px;text-align:left;font-weight:600">메모</th>
                  <th style="padding:8px 12px;width:70px"></th>
                </tr>
              </thead>
              <tbody>
                ${this._contacts.map(c => `
                  <tr style="border-bottom:1px solid #f1f3f5;font-size:13px">
                    <td style="padding:9px 12px;font-weight:500">${this._esc(c.name)}</td>
                    <td style="padding:9px 12px">${c.email ? `<a href="mailto:${this._esc(c.email)}" style="color:#0d6efd;text-decoration:none">${this._esc(c.email)}</a>` : '<span style="color:#ced4da">-</span>'}</td>
                    <td style="padding:9px 12px">${this._esc(c.phone||'')||'<span style="color:#ced4da">-</span>'}</td>
                    <td style="padding:9px 12px;color:#6c757d;font-size:12px">${this._esc(c.memo||'')}</td>
                    <td style="padding:9px 12px;text-align:center;white-space:nowrap">
                      <button onclick="Contacts._openContactForm(${groupId},${c.id})"
                        style="border:none;background:none;cursor:pointer;font-size:14px;padding:2px 4px" title="수정">✏️</button>
                      <button onclick="Contacts._delContact(${c.id},${groupId})"
                        style="border:none;background:none;cursor:pointer;font-size:14px;padding:2px 4px" title="삭제">🗑️</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
           </div>`}`;
    this._emailList = emailList;
  },

  _copyEmails() {
    if (!this._emailList) return;
    navigator.clipboard.writeText(this._emailList).then(() => {
      const btn = document.getElementById('ct-copy-btn');
      if (btn) { btn.textContent = '✓ 복사됨'; setTimeout(() => { btn.textContent = '복사'; }, 1500); }
    }).catch(() => Utils.showToast('복사 실패', 'error'));
  },

  // ── 그룹 폼 ──────────────────────────────────────────────────────────
  _openGroupForm(id) {
    const g = id ? this._groups.find(x => x.id === id) : null;
    const title = g ? '그룹 수정' : '새 그룹 추가';
    Utils.modal(title, `
      <div class="form-group">
        <label>그룹명 *</label>
        <input id="gf-name" class="form-control" value="${this._esc(g?.name||'')}" placeholder="예: 율촌어린이집">
      </div>
      <div class="form-group">
        <label>분류</label>
        <input id="gf-category" class="form-control" value="${this._esc(g?.category||'')}" placeholder="예: 어린이집, 유치원, 회사">
      </div>
      <div class="form-group">
        <label>메모</label>
        <input id="gf-memo" class="form-control" value="${this._esc(g?.memo||'')}" placeholder="간단한 메모 (선택)">
      </div>
      ${g ? `<div style="margin-top:8px"><button class="btn btn-danger btn-sm" onclick="Contacts._delGroup(${g.id})">그룹 삭제</button></div>` : ''}
    `, () => Contacts._saveGroup(g?.id||null));
    setTimeout(() => document.getElementById('gf-name')?.focus(), 100);
  },

  async _saveGroup(id) {
    const name = document.getElementById('gf-name')?.value.trim();
    if (!name) { Utils.showToast('그룹명을 입력하세요', 'error'); return; }
    const payload = {
      name,
      category: document.getElementById('gf-category')?.value.trim() || null,
      memo:     document.getElementById('gf-memo')?.value.trim() || null,
    };
    try {
      if (id) {
        await API.put(`/api/contacts/groups/${id}`, payload);
      } else {
        const r = await API.post('/api/contacts/groups', payload);
        this._selGroupId = r.id;
      }
      Utils.closeModal();
      await this._loadGroups();
      Utils.showToast('저장되었습니다');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async _delGroup(id) {
    if (!confirm('그룹과 모든 연락처가 삭제됩니다. 계속할까요?')) return;
    try {
      await API.delete(`/api/contacts/groups/${id}`);
      this._selGroupId = null;
      Utils.closeModal();
      await this._loadGroups();
      const panel = document.getElementById('ct-contact-panel');
      if (panel) panel.innerHTML = `<div class="empty-state" style="padding:60px 0"><div class="icon">👥</div><p>왼쪽에서 그룹을 선택하세요</p></div>`;
      Utils.showToast('삭제되었습니다');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  // ── 연락처 폼 ─────────────────────────────────────────────────────────
  _openContactForm(groupId, contactId) {
    const c = contactId ? this._contacts.find(x => x.id === contactId) : null;
    const title = c ? '연락처 수정' : '연락처 추가';
    Utils.modal(title, `
      <div class="form-group">
        <label>이름 *</label>
        <input id="cf-name" class="form-control" value="${this._esc(c?.name||'')}" placeholder="이름 또는 담당자명">
      </div>
      <div class="form-group">
        <label>이메일</label>
        <input id="cf-email" class="form-control" type="email" value="${this._esc(c?.email||'')}" placeholder="example@email.com">
      </div>
      <div class="form-group">
        <label>전화번호</label>
        <input id="cf-phone" class="form-control" type="tel" value="${this._esc(c?.phone||'')}" placeholder="010-0000-0000">
      </div>
      <div class="form-group">
        <label>주소</label>
        <input id="cf-address" class="form-control" value="${this._esc(c?.address||'')}" placeholder="선택 입력">
      </div>
      <div class="form-group">
        <label>메모</label>
        <input id="cf-memo" class="form-control" value="${this._esc(c?.memo||'')}" placeholder="선택 입력">
      </div>
    `, () => Contacts._saveContact(groupId, c?.id||null));
    setTimeout(() => document.getElementById('cf-name')?.focus(), 100);
  },

  async _saveContact(groupId, id) {
    const name = document.getElementById('cf-name')?.value.trim();
    if (!name) { Utils.showToast('이름을 입력하세요', 'error'); return; }
    const payload = {
      name,
      email:   document.getElementById('cf-email')?.value.trim() || null,
      phone:   document.getElementById('cf-phone')?.value.trim() || null,
      address: document.getElementById('cf-address')?.value.trim() || null,
      memo:    document.getElementById('cf-memo')?.value.trim() || null,
    };
    try {
      if (id) await API.put(`/api/contacts/contacts/${id}`, payload);
      else    await API.post(`/api/contacts/groups/${groupId}/contacts`, payload);
      Utils.closeModal();
      await this._loadContacts(groupId);
      Utils.showToast('저장되었습니다');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async _delContact(id, groupId) {
    if (!confirm('연락처를 삭제할까요?')) return;
    try {
      await API.delete(`/api/contacts/contacts/${id}`);
      await this._loadContacts(groupId);
      Utils.showToast('삭제되었습니다');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  // ── 전체 검색 ─────────────────────────────────────────────────────────
  _searchTimer: null,
  _search(q) {
    clearTimeout(this._searchTimer);
    const sr = document.getElementById('ct-search-result');
    if (!q.trim()) { if (sr) sr.style.display = 'none'; return; }
    this._searchTimer = setTimeout(async () => {
      const rows = await API.get(`/api/contacts/search?q=${encodeURIComponent(q)}`);
      if (!sr) return;
      if (!rows.length) {
        sr.style.display = 'block';
        sr.innerHTML = `<div style="font-size:13px;color:#6c757d;padding:10px;background:#f8f9fa;border-radius:8px">검색 결과 없음</div>`;
        return;
      }
      sr.style.display = 'block';
      sr.innerHTML = `
        <div style="font-size:12px;color:#6c757d;margin-bottom:6px">검색 결과 ${rows.length}건</div>
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:360px">
          <thead><tr style="background:#f8f9fa;font-size:11px;color:#6c757d;border-bottom:1px solid #dee2e6">
            <th style="padding:6px 10px;text-align:left">이름</th>
            <th style="padding:6px 10px;text-align:left">그룹</th>
            <th style="padding:6px 10px;text-align:left">이메일</th>
            <th style="padding:6px 10px;text-align:left">전화번호</th>
          </tr></thead>
          <tbody>${rows.map(c => `
            <tr style="border-bottom:1px solid #f1f3f5;cursor:pointer"
              onclick="Contacts._selectGroup(${c.group_id})"
              onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background=''">
              <td style="padding:7px 10px;font-weight:500">${this._esc(c.name)}</td>
              <td style="padding:7px 10px;color:#6c757d">${this._esc(c.group_name)}</td>
              <td style="padding:7px 10px;color:#0d6efd">${this._esc(c.email||'')}</td>
              <td style="padding:7px 10px">${this._esc(c.phone||'')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    }, 300);
  },

  _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
