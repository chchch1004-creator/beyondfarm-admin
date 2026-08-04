const Inventory = {
  data: [],
  _tab: 'manual', // 'manual' | 'payhere'

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #e2e8f0">
        <button onclick="Inventory.switchTab('manual')" id="inv-tab-manual"
          style="padding:10px 20px;border:none;background:none;font-size:14px;font-weight:600;cursor:pointer;color:#64748b;border-bottom:2px solid transparent;margin-bottom:-2px">
          📦 재고 현황
        </button>
        <button onclick="Inventory.switchTab('payhere')" id="inv-tab-payhere"
          style="padding:10px 20px;border:none;background:none;font-size:14px;font-weight:600;cursor:pointer;color:#64748b;border-bottom:2px solid transparent;margin-bottom:-2px">
          🔔 페이히어 재고 알림
        </button>
      </div>
      <div id="inv-tab-content"></div>`;
    this.switchTab(this._tab);
  },

  switchTab(tab) {
    this._tab = tab;
    ['manual','payhere'].forEach(t => {
      const btn = document.getElementById(`inv-tab-${t}`);
      if (!btn) return;
      if (t === tab) {
        btn.style.color = '#2563eb';
        btn.style.borderBottomColor = '#2563eb';
      } else {
        btn.style.color = '#64748b';
        btn.style.borderBottomColor = 'transparent';
      }
    });
    if (tab === 'manual') this._renderManual();
    else PayhereAlert.render();
  },

  async _renderManual() {
    const content = document.getElementById('inv-tab-content');
    const isAdmin = App.user.role === 'superadmin';
    try {
      this.data = await API.get('/api/inventory');
      const lowStock = this.data.filter(i => i.min_quantity > 0 && i.quantity <= i.min_quantity).length;

      content.innerHTML = `
        <div class="card">
          <div class="card-title">
            📦 재고 현황
            ${lowStock > 0 ? `<span class="badge badge-danger">${lowStock}개 재고 부족</span>` : ''}
            ${isAdmin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Inventory.showForm()">+ 품목 등록</button>' : ''}
          </div>
          <div class="filter-bar">
            <input id="inv-search" placeholder="품목명 검색" oninput="Inventory.filter()">
            <select id="inv-cat" onchange="Inventory.filter()">
              <option value="">전체 분류</option>
              ${[...new Set(this.data.map(i => i.category))].map(c => `<option>${c}</option>`).join('')}
            </select>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>품목명</th><th>분류</th><th>재고</th><th>단위</th><th>최소재고</th><th>위치</th><th>최종수정</th><th>입출고</th>${isAdmin?'<th>관리</th>':''}</tr></thead>
              <tbody id="inv-tbody"></tbody>
            </table>
          </div>
        </div>`;
      this.filter();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  filter() {
    const search = document.getElementById('inv-search')?.value?.toLowerCase() || '';
    const cat = document.getElementById('inv-cat')?.value || '';
    const rows = this.data.filter(i =>
      (!search || i.name.toLowerCase().includes(search)) && (!cat || i.category === cat)
    );
    const tbody = document.getElementById('inv-tbody');
    if (!tbody) return;
    const isAdmin = App.user.role === 'superadmin';
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">품목이 없습니다</div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(i => {
      const isLow = i.min_quantity > 0 && i.quantity <= i.min_quantity;
      return `<tr class="${isLow ? 'low-stock' : ''}">
        <td><strong>${i.name}</strong>${isLow ? ' ⚠️' : ''}</td>
        <td>${i.category}</td>
        <td style="font-weight:600;color:${isLow?'#dc3545':'inherit'}">${i.quantity}</td>
        <td>${i.unit}</td>
        <td>${i.min_quantity || '-'}</td>
        <td>${i.location || '-'}</td>
        <td>${i.updated_at ? i.updated_at.slice(0, 16) : '-'}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="Inventory.showLog(${i.id},'in','${i.name}')">입고</button>
          <button class="btn btn-secondary btn-sm" onclick="Inventory.showLog(${i.id},'out','${i.name}')">출고</button>
        </td>
        ${isAdmin ? `<td>
          <button class="btn btn-secondary btn-sm" onclick="Inventory.showForm(${i.id})">수정</button>
          <button class="btn btn-danger btn-sm" onclick="Inventory.delete(${i.id})">삭제</button>
        </td>` : ''}
      </tr>`;
    }).join('');
  },

  showForm(id) {
    const item = id ? this.data.find(i => i.id === id) : null;
    Utils.modal(
      item ? '품목 수정' : '품목 등록',
      `<div class="form-grid">
        <div class="form-group"><label>품목명 *</label><input id="f-name" value="${item?.name || ''}"></div>
        <div class="form-group"><label>분류 *</label><input id="f-cat" placeholder="예: 농자재, 소모품" value="${item?.category || ''}"></div>
        <div class="form-group"><label>재고량</label><input type="number" id="f-qty" value="${item?.quantity || 0}" step="0.1"></div>
        <div class="form-group"><label>단위</label><input id="f-unit" value="${item?.unit || '개'}"></div>
        <div class="form-group"><label>최소 재고 (경고 기준)</label><input type="number" id="f-min" value="${item?.min_quantity || 0}" step="0.1"></div>
        <div class="form-group"><label>보관 위치</label><input id="f-loc" value="${item?.location || ''}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>비고</label><input id="f-note" value="${item?.note || ''}"></div>
      </div>`,
      async () => {
        const body = { name: Utils.val('f-name'), category: Utils.val('f-cat'), quantity: parseFloat(Utils.val('f-qty')) || 0, unit: Utils.val('f-unit') || '개', min_quantity: parseFloat(Utils.val('f-min')) || 0, location: Utils.val('f-loc'), note: Utils.val('f-note') };
        if (!body.name || !body.category) return Utils.showToast('품목명과 분류를 입력하세요', 'error');
        try {
          if (item) await API.put(`/api/inventory/${item.id}`, body);
          else await API.post('/api/inventory', body);
          Utils.showToast('저장되었습니다.'); Utils.closeModal(); Inventory._renderManual();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  showLog(id, type, name) {
    Utils.modal(
      `${name} ${type === 'in' ? '입고' : '출고'}`,
      `<div class="form-grid">
        <div class="form-group"><label>수량 *</label><input type="number" id="f-qty" value="1" min="0.1" step="0.1"></div>
        <div class="form-group"><label>사유</label><input id="f-reason" placeholder="${type==='in'?'예: 발주입고':'예: 현장사용'}"></div>
      </div>`,
      async () => {
        const qty = parseFloat(Utils.val('f-qty'));
        if (!qty || qty <= 0) return Utils.showToast('수량을 입력하세요', 'error');
        try {
          const res = await API.post(`/api/inventory/${id}/log`, { type, quantity: qty, reason: Utils.val('f-reason') });
          Utils.showToast(`${type==='in'?'입고':'출고'} 완료. 현재 재고: ${res.quantity}`);
          Utils.closeModal(); Inventory._renderManual();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      },
      type === 'in' ? '입고 처리' : '출고 처리'
    );
  },

  async delete(id) {
    if (!confirm('품목을 삭제하시겠습니까?')) return;
    try { await API.delete(`/api/inventory/${id}`); Utils.showToast('삭제되었습니다.'); Inventory._renderManual(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};

// ─── 페이히어 재고 알림 ───────────────────────────────────
const PayhereAlert = {
  _data: [],
  _filter: 'low', // 'low' | 'all'
  _search: '',
  _lastUpload: null,

  async render() {
    const content = document.getElementById('inv-tab-content');
    const isAdmin = App.user.role === 'superadmin';
    content.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:40px">불러오는 중...</div>`;
    try {
      await this._load();
      this._renderUI(isAdmin);
    } catch (e) {
      content.innerHTML = `<div style="color:#dc2626;text-align:center;padding:40px">${e.message}</div>`;
    }
  },

  async _load() {
    this._data = await API.get('/api/payhere/products');
  },

  _lowItems() {
    return this._data.filter(r => r.threshold !== null && r.threshold > 0 && r.stock_qty <= r.threshold);
  },

  _filtered() {
    let rows = this._filter === 'low' ? this._lowItems() : this._data;
    if (this._search) {
      const q = this._search.toLowerCase();
      rows = rows.filter(r => r.product_name.toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q));
    }
    return rows;
  },

  _renderUI(isAdmin) {
    const content = document.getElementById('inv-tab-content');
    if (!content) return;
    const lowCount = this._lowItems().length;
    const totalCount = this._data.length;
    const filtered = this._filtered();

    const uploadSection = isAdmin ? `
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:10px">📤 페이히어 재고 엑셀 업로드</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">
          페이히어 POS에서 내보낸 재고 엑셀 파일을 업로드하면 재고 부족 상품을 자동으로 감지합니다.
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="file" id="payhere-file" accept=".xlsx,.xls,.csv"
            style="flex:1;min-width:200px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">
          <button onclick="PayhereAlert.upload()"
            style="padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">
            업로드
          </button>
          <button onclick="PayhereAlert.clearAll()"
            style="padding:8px 14px;background:#fff;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">
            전체 초기화
          </button>
        </div>
        ${this._lastUpload ? `<div style="font-size:11px;color:#94a3b8;margin-top:8px">마지막 업로드: ${this._lastUpload}</div>` : ''}
      </div>` : '';

    const statsSection = `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#1e293b">${totalCount}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">전체 상품</div>
        </div>
        <div style="flex:1;min-width:120px;background:${lowCount>0?'#fef2f2':'#fff'};border:1px solid ${lowCount>0?'#fca5a5':'#e2e8f0'};border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:${lowCount>0?'#dc2626':'#1e293b'}">${lowCount}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">재고 부족</div>
        </div>
        ${isAdmin && lowCount > 0 ? `
        <button onclick="PayhereAlert.sendNotify()"
          style="flex:1;min-width:140px;background:#dc2626;color:#fff;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:700;cursor:pointer">
          🔔 알림 발송<br><span style="font-size:11px;font-weight:400;opacity:0.85">${lowCount}개 상품 부족</span>
        </button>` : ''}
      </div>`;

    const filterSection = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <button onclick="PayhereAlert.setFilter('low')"
          style="padding:6px 14px;border-radius:20px;border:1px solid ${this._filter==='low'?'#dc2626':'#e2e8f0'};
                 background:${this._filter==='low'?'#dc2626':'#fff'};color:${this._filter==='low'?'#fff':'#64748b'};
                 font-size:12px;font-weight:600;cursor:pointer">
          ⚠️ 부족 상품만
        </button>
        <button onclick="PayhereAlert.setFilter('all')"
          style="padding:6px 14px;border-radius:20px;border:1px solid ${this._filter==='all'?'#2563eb':'#e2e8f0'};
                 background:${this._filter==='all'?'#2563eb':'#fff'};color:${this._filter==='all'?'#fff':'#64748b'};
                 font-size:12px;font-weight:600;cursor:pointer">
          전체
        </button>
        <input placeholder="상품명 검색" value="${this._search}"
          oninput="PayhereAlert._search=this.value;PayhereAlert._renderUI(${isAdmin})"
          style="flex:1;min-width:160px;padding:6px 12px;border:1px solid #e2e8f0;border-radius:20px;font-size:13px">
      </div>`;

    const rows = filtered.length === 0
      ? `<div style="text-align:center;padding:40px;color:#94a3b8">
          <div style="font-size:36px;margin-bottom:8px">${this._filter==='low'?'✅':'📦'}</div>
          <div>${this._filter==='low'?'재고 부족 상품이 없습니다':'등록된 상품이 없습니다. 엑셀을 업로드하세요.'}</div>
         </div>`
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${filtered.map(r => this._card(r, isAdmin)).join('')}
         </div>`;

    content.innerHTML = `
      <div style="max-width:700px">
        ${uploadSection}
        ${totalCount > 0 ? statsSection : ''}
        ${totalCount > 0 ? filterSection : ''}
        ${rows}
      </div>`;
  },

  _card(r, isAdmin) {
    const isLow = r.threshold !== null && r.threshold > 0 && r.stock_qty <= r.threshold;
    const noThreshold = r.threshold === null || r.threshold === undefined;
    return `
      <div style="background:#fff;border:1px solid ${isLow?'#fca5a5':'#e2e8f0'};border-radius:10px;padding:12px 14px;
                  display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:2px">
            ${isLow ? '⚠️ ' : ''}${this._esc(r.product_name)}
          </div>
          <div style="font-size:11px;color:#94a3b8">${this._esc(r.category||'')} ${r.updated_at ? '· ' + r.updated_at.slice(0,10) : ''}</div>
        </div>
        <div style="text-align:center;min-width:50px">
          <div style="font-size:18px;font-weight:800;color:${isLow?'#dc2626':'#1e293b'}">${r.stock_qty}</div>
          <div style="font-size:10px;color:#94a3b8">현재</div>
        </div>
        <div style="text-align:center;min-width:50px">
          ${isAdmin ? `
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" value="${r.threshold ?? ''}" placeholder="기준"
              style="width:52px;padding:4px 6px;border:1px solid ${noThreshold?'#fbbf24':'#e2e8f0'};border-radius:6px;font-size:12px;text-align:center"
              onchange="PayhereAlert.updateThreshold('${this._esc(r.sku)}',this.value)">
          </div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">안전재고</div>
          ` : `
          <div style="font-size:14px;font-weight:600;color:#64748b">${r.threshold ?? '-'}</div>
          <div style="font-size:10px;color:#94a3b8">안전재고</div>
          `}
        </div>
      </div>`;
  },

  setFilter(f) {
    this._filter = f;
    this._renderUI(App.user.role === 'superadmin');
  },

  async upload() {
    const fileInput = document.getElementById('payhere-file');
    if (!fileInput?.files[0]) return Utils.showToast('파일을 선택하세요', 'error');
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const btn = document.querySelector('button[onclick="PayhereAlert.upload()"]');
      if (btn) btn.textContent = '업로드 중...';
      const res = await fetch('/api/payhere/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      this._lastUpload = data.uploaded_at;
      await this._load();
      this._renderUI(App.user.role === 'superadmin');
      Utils.showToast(`업로드 완료 · 신규 ${data.inserted}개 · 업데이트 ${data.updated}개 · 부족 ${data.low_count}개`);
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async clearAll() {
    if (!confirm('전체 상품 목록을 초기화하시겠습니까?\n이후 엑셀을 다시 업로드하세요.')) return;
    try {
      await API.delete('/api/payhere/products');
      this._data = [];
      this._renderUI(App.user.role === 'superadmin');
      Utils.showToast('초기화 완료');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async updateThreshold(sku, val) {
    try {
      await API.put(`/api/payhere/products/${encodeURIComponent(sku)}/threshold`, { threshold: val === '' ? null : val });
      await this._load();
      this._renderUI(App.user.role === 'superadmin');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async sendNotify() {
    try {
      const res = await API.post('/api/payhere/notify', {});
      if (res.sent > 0) Utils.showToast(`알림 발송 완료 (${res.sent}명)`);
      else Utils.showToast('알림을 받을 구독자가 없습니다', 'error');
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
};
