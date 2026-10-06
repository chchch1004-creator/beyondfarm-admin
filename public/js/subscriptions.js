const Subscriptions = {
  _list: [],
  _plans: {},
  _tab: 'list', // list | check

  async render() {
    const content = document.getElementById('content');
    const role = App.user?.role;
    const isAdmin = role === 'superadmin' || role === 'admin';
    if (!isAdmin) {
      content.innerHTML = '<div class="empty-state"><div class="icon">🔒</div>접근 권한이 없습니다</div>';
      return;
    }
    content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    try {
      const [list, plans] = await Promise.all([
        API.get('/api/subscriptions'),
        API.get('/api/subscriptions/meta/plans'),
      ]);
      this._list = list || [];
      this._plans = plans || {};
      this._render();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  _render() {
    const content = document.getElementById('content');
    const active = this._list.filter(s => s.status === 'active');
    const totalMRR = active.reduce((sum, s) => sum + (this._plans[s.plan]?.price || 0), 0);

    const tabStyle = (t) => `padding:8px 18px;font-size:13px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid ${this._tab===t?'#1b4332':'transparent'};background:none;color:${this._tab===t?'#1b4332':'#6c757d'}`;

    content.innerHTML = `
      <div style="display:flex;gap:14px;margin-bottom:18px;flex-wrap:wrap">
        ${this._statCard('👥 전체 구독자', this._list.length + '명', '#1b4332')}
        ${this._statCard('✅ 활성', active.length + '명', '#2b8a3e')}
        ${this._statCard('💰 월 구독료', totalMRR.toLocaleString() + '원', '#1971c2')}
        ${this._statCard('🔒 의무기간 中', active.filter(s => s.mandatory_end_date > new Date().toISOString().slice(0,10)).length + '명', '#e67700')}
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div style="display:flex;align-items:center;border-bottom:1px solid #dee2e6;padding:0 16px">
          <button style="${tabStyle('list')}" onclick="Subscriptions._setTab('list')">📋 구독자 명단</button>
          <button style="${tabStyle('check')}" onclick="Subscriptions._setTab('check')">🔍 혜택 확인</button>
          <button onclick="Subscriptions.openAdd()" style="margin-left:auto;padding:7px 16px;font-size:12px;border-radius:6px;border:none;background:#1b4332;color:#fff;cursor:pointer;font-weight:600">+ 구독 등록</button>
        </div>
        <div id="sub-tab-body" style="padding:16px">
          ${this._tab === 'list' ? this._renderList() : this._renderCheck()}
        </div>
      </div>
    `;
  },

  _statCard(label, value, color) {
    return `<div class="card" style="padding:14px 20px;flex:1;min-width:130px">
      <div style="font-size:11px;color:#6c757d;margin-bottom:4px">${label}</div>
      <div style="font-size:22px;font-weight:700;color:${color}">${value}</div>
    </div>`;
  },

  _setTab(tab) {
    this._tab = tab;
    const body = document.getElementById('sub-tab-body');
    if (body) body.innerHTML = tab === 'list' ? this._renderList() : this._renderCheck();
    document.querySelectorAll('[onclick^="Subscriptions._setTab"]').forEach(b => {
      const t = b.getAttribute('onclick').match(/'(\w+)'/)[1];
      b.style.borderBottomColor = t === tab ? '#1b4332' : 'transparent';
      b.style.color = t === tab ? '#1b4332' : '#6c757d';
    });
  },

  _planColor(plan) {
    if (plan === 'charcoal') return '#e67700';
    if (plan === 'charcoal_extra_5' || plan === 'charcoal_extra_unlim') return '#d9480f';
    if (plan === 'extra_hour_unlim') return '#0c7de6';
    return '#1971c2';
  },

  _planBadge(plan) {
    const p = this._plans[plan] || {};
    const color = this._planColor(plan);
    return `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}">${p.name || plan}</span>`;
  },

  _statusBadge(status) {
    const map = { active: ['활성','#2b8a3e'], paused: ['일시정지','#e67700'], cancelled: ['해지','#c92a2a'] };
    const [label, color] = map[status] || [status, '#6c757d'];
    return `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${color}22;color:${color}">${label}</span>`;
  },

  _renderList() {
    const statusFilter = ['all', 'active', 'paused', 'cancelled'];
    const filterHtml = statusFilter.map(s => {
      const labels = { all:'전체', active:'활성', paused:'일시정지', cancelled:'해지' };
      return `<option value="${s}">${labels[s]}</option>`;
    }).join('');

    const rows = this._list.map(s => {
      const today = new Date().toISOString().slice(0, 10);
      const inMandatory = s.mandatory_end_date > today;
      return `<tr style="cursor:pointer" onclick="Subscriptions.openDetail(${s.id})">
        <td style="padding:10px 12px;font-weight:600">${s.customer_name}</td>
        <td style="padding:10px 12px;color:#495057">${s.phone}</td>
        <td style="padding:10px 12px">${this._planBadge(s.plan)}</td>
        <td style="padding:10px 12px">${this._statusBadge(s.status)}</td>
        <td style="padding:10px 12px;font-size:12px;color:#495057">${s.start_date}</td>
        <td style="padding:10px 12px;font-size:12px">
          ${inMandatory ? `<span style="color:#e67700;font-size:11px">🔒 ${s.mandatory_end_date}까지</span>` : '<span style="color:#adb5bd;font-size:11px">의무기간 완료</span>'}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:${s.next_bill_at <= today ? '#c92a2a' : '#495057'}">${s.next_bill_at || '-'}</td>
        <td style="padding:10px 12px;font-size:12px;color:#495057">${(this._plans[s.plan]?.price || 0).toLocaleString()}원</td>
      </tr>`;
    }).join('');

    if (!this._list.length) return '<div style="text-align:center;padding:40px;color:#adb5bd">구독자가 없습니다</div>';

    return `
      <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
        <select id="sub-filter" onchange="Subscriptions._applyFilter()" style="padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:13px">
          ${filterHtml}
        </select>
        <input id="sub-search" oninput="Subscriptions._applyFilter()" placeholder="이름 또는 전화번호 검색..." style="padding:6px 12px;border:1px solid #dee2e6;border-radius:6px;font-size:13px;flex:1">
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px" id="sub-table">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">이름</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">전화번호</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">플랜</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">상태</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">시작일</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">의무기간</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">다음 결제일</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6c757d;border-bottom:2px solid #dee2e6">월 금액</th>
            </tr>
          </thead>
          <tbody id="sub-tbody">${rows}</tbody>
        </table>
      </div>`;
  },

  _applyFilter() {
    const filter = document.getElementById('sub-filter')?.value || 'all';
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase();
    const rows = document.querySelectorAll('#sub-tbody tr');
    rows.forEach((row, i) => {
      const s = this._list[i];
      if (!s) return;
      const matchStatus = filter === 'all' || s.status === filter;
      const matchSearch = !search || s.customer_name.includes(search) || s.phone.replace(/-/g,'').includes(search.replace(/-/g,''));
      row.style.display = matchStatus && matchSearch ? '' : 'none';
    });
  },

  _renderCheck() {
    return `
      <div style="max-width:420px;margin:0 auto;padding:20px 0">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px;color:#1b4332">📱 전화번호로 혜택 확인</div>
        <div style="display:flex;gap:8px">
          <input id="check-phone" type="tel" placeholder="010-0000-0000"
            style="flex:1;padding:10px 14px;border:1px solid #dee2e6;border-radius:8px;font-size:14px"
            onkeydown="if(event.key==='Enter')Subscriptions.checkBenefit()">
          <button onclick="Subscriptions.checkBenefit()"
            style="padding:10px 20px;background:#1b4332;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">확인</button>
        </div>
        <div id="check-result" style="margin-top:16px"></div>
      </div>`;
  },

  async checkBenefit() {
    const phone = document.getElementById('check-phone')?.value.replace(/[^0-9]/g,'');
    const result = document.getElementById('check-result');
    if (!phone || phone.length < 10) { result.innerHTML = '<div style="color:#c92a2a;font-size:13px">전화번호를 입력해주세요</div>'; return; }
    result.innerHTML = '<div style="color:#6c757d;font-size:13px">조회 중...</div>';
    try {
      const data = await API.get(`/api/subscriptions/check/${phone}`);
      if (!data.active) {
        result.innerHTML = `<div style="padding:16px;background:#fff5f5;border-radius:8px;border:1px solid #ffc9c9;color:#c92a2a;font-weight:600">❌ 구독 중인 플랜 없음</div>`;
      } else {
        const cards = data.benefits.map(b => {
          const color = this._planColor(b.plan);
          return `<div style="padding:14px 16px;background:${color}11;border-radius:8px;border:1px solid ${color}44;margin-bottom:8px">
            <div style="font-size:13px;font-weight:700;color:${color}">${this._plans[b.plan]?.name || b.plan}</div>
            <div style="font-size:15px;font-weight:700;margin-top:4px">✅ ${b.benefit}</div>
          </div>`;
        }).join('');
        result.innerHTML = cards;
      }
    } catch (e) {
      result.innerHTML = `<div style="color:#c92a2a;font-size:13px">${e.message}</div>`;
    }
  },

  openAdd() {
    document.getElementById('sub-modal')?.remove();
    const planOptions = Object.entries(this._plans).map(([k, v]) =>
      `<option value="${k}">${v.name} (${v.price.toLocaleString()}원/월, 의무 ${v.mandatory}개월)</option>`
    ).join('');
    const modal = document.createElement('div');
    modal.id = 'sub-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:400px;max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="font-size:16px;font-weight:700;margin-bottom:18px">📋 구독 등록</div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">이름 *</label>
          <input id="sub-name" class="form-control" placeholder="고객 이름" autofocus>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">전화번호 *</label>
          <input id="sub-phone" class="form-control" placeholder="010-0000-0000" type="tel">
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">플랜 *</label>
          <select id="sub-plan" class="form-control">${planOptions}</select>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px">
          <div class="form-group" style="flex:1">
            <label class="form-label">시작일 *</label>
            <input id="sub-start" class="form-control" type="date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">결제일 (매월)</label>
            <input id="sub-bday" class="form-control" type="number" min="1" max="28" value="1">
          </div>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">메모</label>
          <input id="sub-memo" class="form-control" placeholder="선택사항">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="document.getElementById('sub-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="Subscriptions.submitAdd()">등록</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  async submitAdd() {
    const name = document.getElementById('sub-name')?.value.trim();
    const phone = document.getElementById('sub-phone')?.value.trim();
    const plan  = document.getElementById('sub-plan')?.value;
    const start = document.getElementById('sub-start')?.value;
    const bday  = parseInt(document.getElementById('sub-bday')?.value || '1');
    const memo  = document.getElementById('sub-memo')?.value.trim();
    if (!name || !phone || !plan || !start) { Utils.showToast('필수 항목을 입력해주세요', 'error'); return; }
    try {
      await API.post('/api/subscriptions', { customer_name: name, phone, plan, start_date: start, billing_day: bday, memo });
      document.getElementById('sub-modal')?.remove();
      Utils.showToast('구독 등록 완료');
      await this.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async openDetail(id) {
    document.getElementById('sub-detail-modal')?.remove();
    const data = await API.get(`/api/subscriptions/${id}`);
    const plan = this._plans[data.plan] || {};
    const today = new Date().toISOString().slice(0, 10);
    const inMandatory = data.mandatory_end_date > today;

    const paymentRows = (data.payments || []).map(p => {
      const color = p.status === 'success' ? '#2b8a3e' : p.status === 'fail' ? '#c92a2a' : '#6c757d';
      const label = { success: '성공', fail: '실패', pending: '대기' }[p.status] || p.status;
      return `<tr>
        <td style="padding:7px 10px;font-size:12px">${p.billed_at || '-'}</td>
        <td style="padding:7px 10px;font-size:12px">${(p.amount||0).toLocaleString()}원</td>
        <td style="padding:7px 10px"><span style="font-size:11px;font-weight:600;color:${color}">${label}</span></td>
        <td style="padding:7px 10px;font-size:11px;color:#6c757d">${p.fail_reason || ''}</td>
      </tr>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'sub-detail-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:520px;max-width:95vw;max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="display:flex;align-items:center;margin-bottom:16px">
          <span style="font-size:16px;font-weight:700">${data.customer_name}</span>
          <span style="margin-left:10px">${this._planBadge(data.plan)}</span>
          <span style="margin-left:8px">${this._statusBadge(data.status)}</span>
          <button onclick="document.getElementById('sub-detail-modal').remove()" style="margin-left:auto;border:none;background:none;font-size:18px;cursor:pointer;color:#6c757d">✕</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f8f9fa;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px">
          <div><span style="color:#6c757d">전화번호</span><br><strong>${data.phone}</strong></div>
          <div><span style="color:#6c757d">월 구독료</span><br><strong>${(plan.price||0).toLocaleString()}원</strong></div>
          <div><span style="color:#6c757d">혜택</span><br><strong>${plan.benefit||'-'}</strong></div>
          <div><span style="color:#6c757d">시작일</span><br><strong>${data.start_date}</strong></div>
          <div><span style="color:#6c757d">의무기간</span><br><strong ${inMandatory?'style="color:#e67700"':''}>${data.mandatory_end_date}까지 ${inMandatory?'🔒':''}</strong></div>
          <div><span style="color:#6c757d">다음 결제일</span><br><strong>${data.next_bill_at||'-'}</strong></div>
          ${data.memo ? `<div style="grid-column:1/-1"><span style="color:#6c757d">메모</span><br>${data.memo}</div>` : ''}
        </div>

        <div style="background:${data.billing_key?'#ebfbee':'#fff5f5'};border:1px solid ${data.billing_key?'#b2f2bb':'#ffc9c9'};border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;display:flex;align-items:center;gap:10px">
          <span>${data.billing_key ? '✅ 카드 등록됨' : '⚠️ 카드 미등록 — 자동결제 불가'}</span>
          ${data.status === 'active' ? `<button onclick="Subscriptions.registerCard(${id})" style="margin-left:auto;padding:5px 14px;font-size:12px;border:none;border-radius:6px;background:#1971c2;color:#fff;cursor:pointer">${data.billing_key ? '카드 재등록' : '💳 카드 등록'}</button>` : ''}
        </div>

        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          ${data.status === 'active' ? `
            <button onclick="Subscriptions.changeStatus(${id},'paused')" style="padding:6px 14px;font-size:12px;border:1px solid #e67700;border-radius:6px;background:#fff;color:#e67700;cursor:pointer">일시정지</button>
            <button onclick="Subscriptions.changeStatus(${id},'cancelled')" style="padding:6px 14px;font-size:12px;border:1px solid #c92a2a;border-radius:6px;background:#fff;color:#c92a2a;cursor:pointer">해지</button>
            ${data.billing_key ? `<button onclick="Subscriptions.chargeNow(${id})" style="padding:6px 14px;font-size:12px;border:none;border-radius:6px;background:#1b4332;color:#fff;cursor:pointer">⚡ 즉시 결제</button>` : ''}
            <button onclick="Subscriptions.manualCharge(${id})" style="padding:6px 14px;font-size:12px;border:1px solid #1971c2;border-radius:6px;background:#fff;color:#1971c2;cursor:pointer">📝 수동 기록</button>
          ` : `
            <button onclick="Subscriptions.changeStatus(${id},'active')" style="padding:6px 14px;font-size:12px;border:none;border-radius:6px;background:#2b8a3e;color:#fff;cursor:pointer">재활성화</button>
          `}
        </div>

        <div style="font-size:13px;font-weight:700;color:#1b4332;margin-bottom:8px">💳 결제 내역</div>
        ${data.payments?.length ? `
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f8f9fa">
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6c757d;border-bottom:1px solid #dee2e6">결제일</th>
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6c757d;border-bottom:1px solid #dee2e6">금액</th>
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6c757d;border-bottom:1px solid #dee2e6">상태</th>
              <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6c757d;border-bottom:1px solid #dee2e6">비고</th>
            </tr></thead>
            <tbody>${paymentRows}</tbody>
          </table>` : '<div style="color:#adb5bd;font-size:13px;text-align:center;padding:20px">결제 내역 없음</div>'}
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  async changeStatus(id, status) {
    const labels = { active: '재활성화', paused: '일시정지', cancelled: '해지' };
    if (!confirm(`${labels[status]}하시겠습니까?`)) return;
    try {
      await API.put(`/api/subscriptions/${id}`, { status });
      document.getElementById('sub-detail-modal')?.remove();
      Utils.showToast(`${labels[status]} 처리되었습니다`);
      await this.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async manualCharge(id) {
    document.getElementById('sub-charge-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'sub-charge-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10000;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18)">
        <div style="font-size:15px;font-weight:700;margin-bottom:16px">💳 결제 기록</div>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">결제일</label>
          <input id="charge-date" class="form-control" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">상태</label>
          <select id="charge-status" class="form-control">
            <option value="success">성공</option>
            <option value="fail">실패</option>
          </select>
        </div>
        <div id="charge-fail-row" style="display:none;margin-bottom:12px">
          <label class="form-label">실패 사유</label>
          <input id="charge-fail" class="form-control" placeholder="카드 한도 초과 등">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="document.getElementById('sub-charge-modal').remove()">취소</button>
          <button class="btn btn-primary" onclick="Subscriptions.submitManualCharge(${id})">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('charge-status').addEventListener('change', function() {
      document.getElementById('charge-fail-row').style.display = this.value === 'fail' ? '' : 'none';
    });
  },

  async submitManualCharge(id) {
    const status = document.getElementById('charge-status')?.value;
    const billed_at = document.getElementById('charge-date')?.value;
    const fail_reason = document.getElementById('charge-fail')?.value;
    try {
      await API.post(`/api/subscriptions/${id}/payments`, { status, billed_at, fail_reason });
      document.getElementById('sub-charge-modal')?.remove();
      document.getElementById('sub-detail-modal')?.remove();
      Utils.showToast('결제 기록 완료');
      await this.render();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  async chargeNow(id) {
    if (!confirm('지금 바로 결제를 진행하시겠습니까?')) return;
    try {
      Utils.showToast('결제 중...');
      await API.post(`/api/subscriptions/${id}/charge`, {});
      document.getElementById('sub-detail-modal')?.remove();
      Utils.showToast('결제 성공');
      await this.render();
    } catch (e) { Utils.showToast('결제 실패: ' + e.message, 'error'); }
  },

  async registerCard(id) {
    try {
      const { clientKey } = await API.get('/api/subscriptions/meta/client-key');
      if (!window.TossPayments) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://js.tosspayments.com/v2/standard';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const tossPayments = TossPayments(clientKey);
      const customerKey = `customer_${id}`;
      const successUrl = `${location.origin}/billing-success?subId=${id}`;
      const failUrl    = `${location.origin}/billing-fail?subId=${id}`;
      const payment = tossPayments.payment({ customerKey });
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl,
        failUrl,
      });
    } catch (e) {
      if (e.code !== 'USER_CANCEL') Utils.showToast('카드 등록 실패: ' + (e.message || e.code), 'error');
    }
  },
};
