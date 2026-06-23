const Finance = {
  data: [],
  async render() {
    const content = document.getElementById('content');
    const isAdmin = App.user.role === 'admin';
    const now = new Date();
    try {
      this.data = await API.get(`/api/finance?year=${now.getFullYear()}`);

      const totalIncome = this.data.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0);
      const totalExpense = this.data.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0);

      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon green">📈</div>
            <div><div class="stat-label">총 수입</div><div class="stat-value" style="font-size:18px;color:#198754">${Utils.formatNum(totalIncome)}원</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon red">📉</div>
            <div><div class="stat-label">총 지출</div><div class="stat-value" style="font-size:18px;color:#dc3545">${Utils.formatNum(totalExpense)}원</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">💰</div>
            <div><div class="stat-label">순이익</div><div class="stat-value" style="font-size:18px">${Utils.formatNum(totalIncome - totalExpense)}원</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">
            📒 수입/지출 내역
            ${isAdmin ? '<button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="Finance.showForm()">+ 내역 추가</button>' : ''}
          </div>
          <div class="filter-bar">
            <select id="fin-type" onchange="Finance.reload()">
              <option value="">전체</option>
              <option value="income">수입</option>
              <option value="expense">지출</option>
            </select>
            <select id="fin-year" onchange="Finance.reload()">
              ${[now.getFullYear(), now.getFullYear()-1].map(y=>`<option ${y===now.getFullYear()?'selected':''}>${y}</option>`).join('')}
            </select>
            <select id="fin-month" onchange="Finance.reload()">
              <option value="">전체 월</option>
              ${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}월</option>`).join('')}
            </select>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>날짜</th><th>유형</th><th>분류</th><th>금액</th><th>내용</th><th>영수증번호</th><th>등록자</th>${isAdmin?'<th>관리</th>':''}</tr></thead>
              <tbody id="fin-tbody"></tbody>
            </table>
          </div>
        </div>`;
      this.renderTable();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  async reload() {
    const type = document.getElementById('fin-type')?.value || '';
    const year = Utils.val('fin-year') || new Date().getFullYear();
    const month = document.getElementById('fin-month')?.value || '';
    let url = `/api/finance?year=${year}`;
    if (type) url += `&type=${type}`;
    if (month) url += `&month=${month}`;
    this.data = await API.get(url);
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('fin-tbody');
    if (!tbody) return;
    const isAdmin = App.user.role === 'admin';
    if (this.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">내역이 없습니다</div></td></tr>`;
      return;
    }
    tbody.innerHTML = this.data.map(f => `
      <tr>
        <td>${f.date}</td>
        <td>${f.type === 'income' ? '<span class="badge badge-success">수입</span>' : '<span class="badge badge-danger">지출</span>'}</td>
        <td>${f.category}</td>
        <td style="font-weight:600;color:${f.type==='income'?'#198754':'#dc3545'}">${f.type==='income'?'+':'-'}${Utils.formatNum(f.amount)}원</td>
        <td>${f.description || '-'}</td>
        <td>${f.receipt_no || '-'}</td>
        <td>${f.creator_name || '-'}</td>
        ${isAdmin ? `<td>
          <button class="btn btn-secondary btn-sm" onclick="Finance.showForm(${f.id})">수정</button>
          <button class="btn btn-danger btn-sm" onclick="Finance.delete(${f.id})">삭제</button>
        </td>` : ''}
      </tr>`).join('');
  },

  showForm(id) {
    const rec = id ? this.data.find(f => f.id === id) : null;
    Utils.modal(
      rec ? '내역 수정' : '내역 추가',
      `<div class="form-grid">
        <div class="form-group"><label>유형</label>
          <select id="f-type">
            <option value="income" ${rec?.type==='income'?'selected':''}>수입</option>
            <option value="expense" ${rec?.type==='expense'?'selected':''}>지출</option>
          </select>
        </div>
        <div class="form-group"><label>분류</label><input id="f-cat" placeholder="예: 매출, 인건비, 재료비" value="${rec?.category || ''}"></div>
        <div class="form-group"><label>금액 (원)</label><input type="number" id="f-amt" value="${rec?.amount || 0}"></div>
        <div class="form-group"><label>날짜</label><input type="date" id="f-date" value="${rec?.date || Utils.today()}"></div>
        <div class="form-group"><label>영수증/계산서 번호</label><input id="f-receipt" value="${rec?.receipt_no || ''}"></div>
        <div class="form-group" style="grid-column:1/-1"><label>내용</label><textarea id="f-desc">${rec?.description || ''}</textarea></div>
      </div>`,
      async () => {
        const body = { type: Utils.val('f-type'), category: Utils.val('f-cat'), amount: parseInt(Utils.val('f-amt')) || 0, date: Utils.val('f-date'), receipt_no: Utils.val('f-receipt'), description: Utils.val('f-desc') };
        if (!body.category) return Utils.showToast('분류를 입력하세요', 'error');
        try {
          if (rec) await API.put(`/api/finance/${rec.id}`, body);
          else await API.post('/api/finance', body);
          Utils.showToast('저장되었습니다.'); Utils.closeModal(); Finance.reload();
        } catch (e) { Utils.showToast(e.message, 'error'); }
      }
    );
  },

  async delete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await API.delete(`/api/finance/${id}`); Utils.showToast('삭제되었습니다.'); Finance.reload(); }
    catch (e) { Utils.showToast(e.message, 'error'); }
  }
};
