const Sales = {
  activeYear: new Date().getFullYear(),
  activeTab: 'revenue',
  revenueData: {},
  ytsData: {},

  years() {
    const cur = new Date().getFullYear();
    const result = [];
    for (let y = 2023; y <= cur + 1; y++) result.push(y);
    return result;
  },

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="card" style="padding:0">
        <div style="padding:20px 20px 0">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
            <strong style="font-size:16px">📈 매출 관리</strong>
            <div style="margin-left:auto;display:flex;gap:6px">
              ${this.years().map(y => `<button class="btn btn-sm ${y === this.activeYear ? 'btn-primary' : 'btn-secondary'}" onclick="Sales.switchYear(${y})">${y}년</button>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:0;border-bottom:2px solid #dee2e6;margin:0 -20px;padding:0 20px">
            <button onclick="Sales.switchTab('revenue')" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:${this.activeTab==='revenue'?'700':'400'};border-bottom:${this.activeTab==='revenue'?'2px solid #1b4332':'2px solid transparent'};color:${this.activeTab==='revenue'?'#1b4332':'#6c757d'};margin-bottom:-2px">매출현황</button>
            <button onclick="Sales.switchTab('yts')" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:${this.activeTab==='yts'?'700':'400'};border-bottom:${this.activeTab==='yts'?'2px solid #1b4332':'2px solid transparent'};color:${this.activeTab==='yts'?'#1b4332':'#6c757d'};margin-bottom:-2px">연말정산</button>
          </div>
        </div>
        <div id="sales-tab-content" style="padding:20px"></div>
      </div>`;
    await this.loadAndRenderTab();
  },

  async switchYear(y) {
    this.activeYear = y;
    await this.render();
  },

  async switchTab(tab) {
    this.activeTab = tab;
    await this.render();
  },

  async loadAndRenderTab() {
    if (this.activeTab === 'revenue') await this.renderRevenue();
    else await this.renderYts();
  },

  fmt(n) {
    if (!n) return '-';
    return Number(n).toLocaleString('ko-KR');
  },

  fmtRate(n) {
    if (!n || !isFinite(n)) return '-';
    return (n * 100).toFixed(1) + '%';
  },

  // 콤마 포맷 표시용
  fmtInput(n) { return n ? Number(n).toLocaleString('ko-KR') : ''; },
  // 콤마 제거 후 숫자 파싱
  parseInput(s) { return parseFloat(String(s).replace(/,/g, '')) || 0; },

  // 숫자 입력 포커스 시 콤마 제거, blur 시 콤마 추가
  onFocusNum(el) { el.value = el.value.replace(/,/g, ''); },
  onBlurNum(el, month) {
    const raw = parseFloat(el.value.replace(/,/g, '')) || 0;
    el.value = raw ? raw.toLocaleString('ko-KR') : '';
    Sales.saveRevenue(month);
  },

  async renderRevenue() {
    const rows = await API.get(`/api/sales/revenue?year=${this.activeYear}`);
    const map = {};
    rows.forEach(r => { map[r.month] = r; });

    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    let totalWd = 0, totalBaemin = 0, totalOther = 0, totalIncome = 0, totalSum = 0;

    const bodyRows = months.map(m => {
      const r = map[m] || {};
      const wd = r.working_days || 0;
      const baemin = r.baemin || 0;
      const other = r.other_sales || 0;
      const income = r.other_income || 0;
      const sum = baemin + other + income;
      const avg = wd > 0 ? Math.round(sum / wd) : 0;
      totalWd += wd; totalBaemin += baemin; totalOther += other; totalIncome += income; totalSum += sum;
      return `<tr>
        <td style="text-align:center;font-weight:600">${m}월</td>
        <td><input type="text" inputmode="decimal" class="sales-input" style="width:70px;text-align:center" value="${wd || ''}" onfocus="Sales.onFocusNum(this)" onblur="Sales.saveRevenue(${m})" data-field="working_days" data-month="${m}"></td>
        <td><input type="text" inputmode="numeric" class="sales-input" value="${this.fmtInput(baemin)}" onfocus="Sales.onFocusNum(this)" onblur="Sales.onBlurNum(this,${m})" data-field="baemin" data-month="${m}"></td>
        <td><input type="text" inputmode="numeric" class="sales-input" value="${this.fmtInput(other)}" onfocus="Sales.onFocusNum(this)" onblur="Sales.onBlurNum(this,${m})" data-field="other_sales" data-month="${m}"></td>
        <td><input type="text" inputmode="numeric" class="sales-input" value="${this.fmtInput(income)}" onfocus="Sales.onFocusNum(this)" onblur="Sales.onBlurNum(this,${m})" data-field="other_income" data-month="${m}"></td>
        <td style="text-align:right;font-weight:600;color:${sum>0?'#1b4332':'#aaa'}">${sum > 0 ? this.fmt(sum) : '-'}</td>
        <td style="text-align:right;color:#495057">${avg > 0 ? this.fmt(avg) : '-'}</td>
        <td><input type="text" class="sales-input" style="font-size:12px;color:#6c757d;text-align:left" value="${r.note || ''}" placeholder="메모" onblur="Sales.saveRevenue(${m})" data-field="note" data-month="${m}"></td>
      </tr>`;
    }).join('');

    const totalAvg = totalWd > 0 ? Math.round(totalSum / totalWd) : 0;

    document.getElementById('sales-tab-content').innerHTML = `
      <p style="font-size:12px;color:#6c757d;margin-bottom:12px">※ 근무일수: 다루기어려운날·창업다리 = 0.5로 입력 | 합산매출 = 배달의민족 + 기타매출 + 기타입금 | 일평균매출 = 합산 ÷ 근무일수</p>
      <div class="table-wrap">
        <table id="sales-revenue-table">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="text-align:center">월</th>
              <th>근무일수</th>
              <th>배달의민족</th>
              <th>기타매출</th>
              <th>기타입금</th>
              <th style="text-align:right">합산매출</th>
              <th style="text-align:right">일평균매출</th>
              <th>메모</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr style="background:#f0fdf4;font-weight:700">
              <td style="text-align:center">합계</td>
              <td>${totalWd}</td>
              <td style="text-align:right">${this.fmt(totalBaemin)}</td>
              <td style="text-align:right">${this.fmt(totalOther)}</td>
              <td style="text-align:right">${this.fmt(totalIncome)}</td>
              <td style="text-align:right;color:#1b4332">${this.fmt(totalSum)}</td>
              <td style="text-align:right">${totalAvg > 0 ? this.fmt(totalAvg) : '-'}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <style>
        .sales-input { border:1px solid transparent;border-radius:4px;padding:4px 6px;font-size:13px;width:100%;box-sizing:border-box;background:transparent;text-align:right }
        .sales-input:focus { border-color:#1b4332;outline:none;background:#fff }
        .sales-input[data-field="note"] { text-align:left }
        .sales-input[data-field="working_days"] { text-align:center }
        #sales-revenue-table td { padding:6px 8px }
      </style>`;
  },

  async saveRevenue(month) {
    const inputs = document.querySelectorAll(`.sales-input[data-month="${month}"]`);
    const body = { year: this.activeYear, month };
    inputs.forEach(inp => {
      const field = inp.dataset.field;
      body[field] = field === 'note' ? inp.value : (parseFloat(String(inp.value).replace(/,/g, '')) || 0);
    });
    try {
      await API.post('/api/sales/revenue', body);
      this.updateRevenueTotals();
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  updateRevenueTotals() {
    let totalWd = 0, totalBaemin = 0, totalOther = 0, totalIncome = 0, totalSum = 0;
    for (let m = 1; m <= 12; m++) {
      const get = (field) => parseFloat(String(document.querySelector(`.sales-input[data-month="${m}"][data-field="${field}"]`)?.value || '').replace(/,/g, '')) || 0;
      const wd = get('working_days'), baemin = get('baemin'), other = get('other_sales'), income = get('other_income');
      const sum = baemin + other + income;
      const avg = wd > 0 ? Math.round(sum / wd) : 0;
      const tr = document.querySelector(`.sales-input[data-month="${m}"]`)?.closest('tr');
      if (tr) {
        const tds = tr.querySelectorAll('td');
        if (tds[5]) tds[5].textContent = sum > 0 ? this.fmt(sum) : '-';
        if (tds[5]) tds[5].style.color = sum > 0 ? '#1b4332' : '#aaa';
        if (tds[6]) tds[6].textContent = avg > 0 ? this.fmt(avg) : '-';
      }
      totalWd += wd; totalBaemin += baemin; totalOther += other; totalIncome += income; totalSum += sum;
    }
    const totalAvg = totalWd > 0 ? Math.round(totalSum / totalWd) : 0;
    const tfoot = document.querySelector('#sales-revenue-table tfoot tr');
    if (tfoot) {
      const tds = tfoot.querySelectorAll('td');
      tds[1].textContent = totalWd;
      tds[2].textContent = this.fmt(totalBaemin);
      tds[3].textContent = this.fmt(totalOther);
      tds[4].textContent = this.fmt(totalIncome);
      tds[5].textContent = this.fmt(totalSum);
      tds[6].textContent = totalAvg > 0 ? this.fmt(totalAvg) : '-';
    }
  },

  async renderYts() {
    const rows = await API.get(`/api/sales/yts?year=${this.activeYear}`);
    const map = {};
    rows.forEach(r => { map[r.month] = r; });
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const rat = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '-';

    const bodyRows = months.map(m => {
      const r = map[m] || {};
      const bi = r.baemin_input || 0, oi = r.other_input || 0, ei = r.external_input || 0;
      const br = r.baemin_request || 0, or_ = r.other_request || 0, er = r.external_request || 0;
      const bn = r.baemin_next || 0, on_ = r.other_next || 0, en = r.external_next || 0;
      const ti = bi + oi + ei, tr_ = br + or_ + er, tn = bn + on_ + en;

      const inp = (field, val, w) => `<input type="number" class="yts-input" style="width:${w||60}px" value="${val || ''}" onblur="Sales.saveYts(${m})" data-field="${field}" data-month="${m}">`;

      return `<tr>
        <td style="text-align:center;font-weight:600">${m}월</td>
        <td>${inp('baemin_input', bi)}</td><td>${inp('other_input', oi)}</td><td>${inp('external_input', ei)}</td>
        <td style="text-align:right;font-weight:600;background:#f8f9fa">${ti > 0 ? ti.toLocaleString() : '-'}</td>
        <td>${inp('baemin_request', br)}</td><td>${inp('other_request', or_)}</td><td>${inp('external_request', er)}</td>
        <td style="text-align:right;font-weight:600;background:#f8f9fa">${tr_ > 0 ? tr_.toLocaleString() : '-'}</td>
        <td style="text-align:right;color:#666;background:#f0fdf4">${rat(br,bi)}</td><td style="text-align:right;color:#666;background:#f0fdf4">${rat(or_,oi)}</td><td style="text-align:right;color:#666;background:#f0fdf4">${rat(er,ei)}</td>
        <td style="text-align:right;font-weight:600;background:#f0fdf4">${rat(tr_,ti)}</td>
        <td>${inp('baemin_next', bn)}</td><td>${inp('other_next', on_)}</td><td>${inp('external_next', en)}</td>
        <td style="text-align:right;font-weight:600;background:#f8f9fa">${tn > 0 ? tn.toLocaleString() : '-'}</td>
        <td style="text-align:right;color:#666;background:#fff3cd">${rat(bn,bi)}</td><td style="text-align:right;color:#666;background:#fff3cd">${rat(on_,oi)}</td><td style="text-align:right;color:#666;background:#fff3cd">${rat(en,ei)}</td>
        <td style="text-align:right;font-weight:600;background:#fff3cd">${rat(tn,ti)}</td>
        <td style="text-align:right;color:#666;background:#e8f4fd">${rat(bn,br)}</td><td style="text-align:right;color:#666;background:#e8f4fd">${rat(on_,or_)}</td><td style="text-align:right;color:#666;background:#e8f4fd">${rat(en,er)}</td>
        <td style="text-align:right;font-weight:600;background:#e8f4fd">${rat(tn,tr_)}</td>
      </tr>`;
    }).join('');

    document.getElementById('sales-tab-content').innerHTML = `
      <p style="font-size:12px;color:#6c757d;margin-bottom:12px">※ 외부 = 네이버 외 | 기타 = 아름다운 서비스, 인스타그램 | 일로율 = 요청/입력 | 일로+다음율 = 다음/입력 | 요청/일로 = 다음/요청</p>
      <div class="table-wrap" style="overflow-x:auto">
        <table id="sales-yts-table" style="min-width:1200px">
          <thead>
            <tr style="background:#1b4332;color:#fff;text-align:center">
              <th rowspan="2" style="min-width:40px">월</th>
              <th colspan="4" style="background:#2d6a4f">배달이 입력</th>
              <th colspan="4" style="background:#1e4d8c">요청액</th>
              <th colspan="4" style="background:#2d6a4f;font-size:11px">일로율<br>(요청/입력)</th>
              <th colspan="4" style="background:#7b5e00">일로+다음</th>
              <th colspan="4" style="background:#7b5e00;font-size:11px">일로+다음율<br>(다음/입력)</th>
              <th colspan="4" style="background:#1e4d8c;font-size:11px">요청/일로<br>(다음/요청)</th>
            </tr>
            <tr style="background:#f8f9fa;text-align:center;font-size:12px">
              <th>배민</th><th>기타</th><th>외부</th><th>합계</th>
              <th>배민</th><th>기타</th><th>외부</th><th>합계</th>
              <th>배민</th><th>기타</th><th>외부</th><th>합계</th>
              <th>배민</th><th>기타</th><th>외부</th><th>합계</th>
              <th>배민</th><th>기타</th><th>외부</th><th>합계</th>
              <th>배민</th><th>기타</th><th>외부</th><th>합계</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <style>
        .yts-input { border:1px solid transparent;border-radius:4px;padding:3px 4px;font-size:12px;width:100%;box-sizing:border-box;background:transparent;text-align:right }
        .yts-input:focus { border-color:#1b4332;outline:none;background:#fff }
        #sales-yts-table td { padding:4px 6px;font-size:12px }
      </style>`;
  },

  async saveYts(month) {
    const inputs = document.querySelectorAll(`.yts-input[data-month="${month}"]`);
    const body = { year: this.activeYear, month };
    inputs.forEach(inp => { body[inp.dataset.field] = parseInt(inp.value) || 0; });
    try {
      await API.post('/api/sales/yts', body);
      this.updateYtsTotals(month);
    } catch (e) { Utils.showToast(e.message, 'error'); }
  },

  updateYtsTotals(month) {
    const get = (field) => parseInt(document.querySelector(`.yts-input[data-month="${month}"][data-field="${field}"]`)?.value) || 0;
    const bi = get('baemin_input'), oi = get('other_input'), ei = get('external_input');
    const br = get('baemin_request'), or_ = get('other_request'), er = get('external_request');
    const bn = get('baemin_next'), on_ = get('other_next'), en = get('external_next');
    const ti = bi + oi + ei, tr_ = br + or_ + er, tn = bn + on_ + en;
    const rat = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '-';

    const tr = document.querySelector(`.yts-input[data-month="${month}"]`)?.closest('tr');
    if (!tr) return;
    const tds = tr.querySelectorAll('td');
    tds[4].textContent = ti > 0 ? ti.toLocaleString() : '-';
    tds[8].textContent = tr_ > 0 ? tr_.toLocaleString() : '-';
    tds[9].textContent = rat(br, bi); tds[10].textContent = rat(or_, oi); tds[11].textContent = rat(er, ei); tds[12].textContent = rat(tr_, ti);
    tds[16].textContent = tn > 0 ? tn.toLocaleString() : '-';
    tds[17].textContent = rat(bn, bi); tds[18].textContent = rat(on_, oi); tds[19].textContent = rat(en, ei); tds[20].textContent = rat(tn, ti);
    tds[21].textContent = rat(bn, br); tds[22].textContent = rat(on_, or_); tds[23].textContent = rat(en, er); tds[24].textContent = rat(tn, tr_);
  }
};
