const Inventory = {
  data: [],
  async render() {
    const content = document.getElementById('content');
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
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
    const isAdmin = ['admin','superadmin'].includes(App.user.role);
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
          Utils.showToast('저장되었습니다.'); Utils.closeModal(); Inventory.render();
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
          Utils.closeModal(); Inventory.render();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      },
      type === 'in' ? '입고 처리' : '출고 처리'
    );
  },

  async delete(id) {
    if (!confirm('품목을 삭제하시겠습니까?')) return;
    try { await API.delete(`/api/inventory/${id}`); Utils.showToast('삭제되었습니다.'); Inventory.render(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
