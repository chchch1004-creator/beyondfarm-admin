const Checklist = (() => {
  const TIMESLOTS = ['11', '15', '19'];
  const TENT4_NOS = ['0','1','2','3','4','5'];
  const TENT2_NOS = ['6','7','8','9','10','11'];
  const TENT_M_NOS = ['0','1','2','3','4','5','6','7','8','9','10','11'];
  const TENT8_NOS = ['A','B','C','D','E','F','G','H','J','K','L','P','S','티켓'];

  // 컬럼 정의: key, 헤더, 너비(px)
  const COLS = [
    { key: 'tent_no',    label: '번호',      w: 46 },
    { key: 'product',    label: '예약상품',   w: 68 },
    { key: 'visit_count',label: '방문횟수',   w: 60 },
    { key: 'name',       label: '예약자성함', w: 88 },
    { key: 'reserved',   label: '예약인원',   w: 58 },
    { key: 'actual',     label: '입장시인원', w: 58 },
    { key: 'two_time',   label: '2타임여부',  w: 66 },
    { key: 'play',       label: '플레이',     w: 50 },
    { key: 'child_pool', label: '아이풀장',   w: 58 },
    { key: 'adult_pool', label: '성인풀장',   w: 58 },
    { key: 'bulmung',    label: '불멍세트',   w: 58 },
    { key: 'adult_only', label: '성인만',     w: 50 },
    { key: 'memo',       label: '비고',       w: 110 },
  ];

  let state = {
    date: '',
    tab: 'slot',   // 'slot' | 'two_time'
    timeslot: '11',
    data: {},
    editable: false,
    dates: [],
  };

  function emptyTimeslot() {
    return {
      summary: { bulmung_count:'', play_count:'', child_pool:'', adult_pool:'',
                 total_pool:'', tent4:'', tent2:'', tent8:'', group20:'', group30:'', total:'' },
      tent4: TENT4_NOS.map(emptyRow),
      tent2: TENT2_NOS.map(emptyRow),
      tent8: TENT8_NOS.map(emptyRow),
      extra: [],
    };
  }

  function emptyRow(tent_no) {
    return { tent_no, product:'', visit_count:'', name:'', reserved:'', actual:'',
             two_time:'', play:'', child_pool:'', adult_pool:'', bulmung:'', adult_only:'', memo:'' };
  }

  function getCurrentData() {
    return state.data[state.timeslot] || emptyTimeslot();
  }

  // 요약 자동계산
  function recalcSummary(d) {
    const allRows = [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[]), ...(d.extra||[])];
    const num = v => parseInt(v) || 0;
    let bulmung=0, play=0, child=0, adult=0, cntS=0, cntM=0, cntL=0, cnt20=0, cnt30=0;
    allRows.forEach(r => {
      bulmung += num(r.bulmung);
      play += num(r.play);
      child += num(r.child_pool);
      adult += num(r.adult_pool);
      const p = (r.product||'').trim();
      if (p === 's') cntS++;
      else if (p === 'm') cntM++;
      else if (p === 'L') cntL++;
      else if (p === '단체20') cnt20++;
      else if (p === '단체30') cnt30++;
    });
    const total_pool = child + adult;
    const total = cntS + cntM + cntL + cnt20 + cnt30;
    if (!d.summary) d.summary = {};
    d.summary.bulmung_count = bulmung || '';
    d.summary.play_count    = play || '';
    d.summary.child_pool    = child || '';
    d.summary.adult_pool    = adult || '';
    d.summary.total_pool    = total_pool || '';
    d.summary.tent2         = cntS || '';
    d.summary.tent4         = cntM || '';
    d.summary.tent8         = cntL || '';
    d.summary.group20       = cnt20 || '';
    d.summary.group30       = cnt30 || '';
    d.summary.total         = total || '';
  }

  async function render() {
    state.editable = App.canEdit('checklist');
    if (!state.date) state.date = new Date().toISOString().slice(0,10);
    try { state.dates = await API.get('/api/checklist/dates'); } catch { state.dates = []; }
    await loadAllSlots();
    renderUI();
  }

  async function loadAllSlots() {
    state.data = {};
    await Promise.all(TIMESLOTS.map(async ts => {
      try {
        const d = await API.get(`/api/checklist/${state.date}/${ts}`);
        state.data[ts] = d || emptyTimeslot();
        recalcSummary(state.data[ts]);
      } catch {
        state.data[ts] = emptyTimeslot();
      }
    }));
  }

  function renderUI() {
    const E = state.editable;
    document.getElementById('content').innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="font-weight:600">날짜</label>
          <input type="date" id="cl-date" value="${state.date}"
            style="padding:5px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
          <button class="btn" onclick="Checklist.changeDate()">조회</button>
          ${E ? `<button class="btn btn-primary" onclick="Checklist.saveSlot()">💾 저장</button>` : ''}
          ${state.dates.length ? `<span style="color:#888;font-size:12px">저장 날짜: ${state.dates.slice(0,6).join(' · ')}${state.dates.length>6?' …':''}</span>` : ''}
        </div>
      </div>

      <div style="display:flex;gap:0;margin-bottom:0">
        ${tabBtn('slot_11','11시','11')}
        ${tabBtn('slot_15','15시','15')}
        ${tabBtn('slot_19','19시','19')}
        ${tabBtn2()}
      </div>

      <div id="cl-panel" style="border:1px solid #2563eb;border-top:none;border-radius:0 8px 8px 8px;padding:16px;background:#fff;overflow-x:auto">
        ${renderPanel()}
      </div>
    `;
  }

  function tabBtn(id, label, ts) {
    const active = state.tab === 'slot' && state.timeslot === ts;
    return `<button id="cl-tab-${ts}" onclick="Checklist.switchSlot('${ts}')"
      style="padding:9px 20px;border:1px solid #2563eb;border-right:none;
      background:${active?'#2563eb':'#fff'};color:${active?'#fff':'#2563eb'};
      cursor:pointer;font-size:13px;font-weight:600;border-radius:${ts==='11'?'8px 0 0 0':'0'}">
      ${label}
    </button>`;
  }

  function tabBtn2() {
    const active = state.tab === 'two_time';
    return `<button id="cl-tab-two" onclick="Checklist.switchTab('two_time')"
      style="padding:9px 20px;border:1px solid #2563eb;
      background:${active?'#2563eb':'#fff'};color:${active?'#fff':'#2563eb'};
      cursor:pointer;font-size:13px;font-weight:600;border-radius:0 8px 0 0">
      2타임연속여부
    </button>`;
  }

  function renderPanel() {
    if (state.tab === 'two_time') return renderTwoTimeTable();
    return renderSlot(getCurrentData(), state.editable);
  }

  /* ──────────── 타임슬롯 렌더링 ──────────── */
  function renderSlot(d, E) {
    recalcSummary(d);
    const s = d.summary || {};

    const summaryRow = (label, key) => `
      <div style="display:flex;flex-direction:column;gap:3px;min-width:110px">
        <div style="font-size:11px;color:#666;font-weight:600;text-align:center">${label}</div>
        <div style="padding:5px 6px;background:#fff;border:1px solid #d1d5db;border-radius:4px;text-align:center;font-size:13px;font-weight:600;color:#1e40af">${s[key] || '-'}</div>
      </div>`;

    const summaryHtml = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:10px">📋 요약 (자동계산)</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${summaryRow('불멍갯수','bulmung_count')}
          ${summaryRow('플레이 인원수','play_count')}
          ${summaryRow('아이풀장','child_pool')}
          ${summaryRow('성인풀장','adult_pool')}
          ${summaryRow('풀장합계','total_pool')}
          ${summaryRow('텐트 2인(s)','tent2')}
          ${summaryRow('텐트 4인(m)','tent4')}
          ${summaryRow('텐트 7인(L)','tent8')}
          ${summaryRow('단체20','group20')}
          ${summaryRow('단체30','group30')}
          ${summaryRow('합계','total')}
        </div>
      </div>`;

    const mRows = [...(d.tent4||[]), ...(d.tent2||[])];
    return summaryHtml
      + sectionTable('M텐트', mRows, null, E, d)
      + sectionTable('L텐트', d.tent8||[], 'tent8', E, d)
      + extraSection(d.extra||[], E);
  }

  function colgroup() {
    return `<colgroup>${COLS.map(c=>`<col style="width:${c.w}px;min-width:${c.w}px">`).join('')}</colgroup>`;
  }

  function theadRow() {
    return `<tr style="background:#1e40af;color:#fff">
      ${COLS.map(c=>`<th style="padding:7px 4px;text-align:center;white-space:nowrap;font-size:12px">${c.label}</th>`).join('')}
    </tr>`;
  }

  function sectionTable(title, rows, section, E, d) {
    // M텐트: section=null → use 'mtent' virtual section
    const sec = section || 'mtent';
    return `
      <div style="margin-bottom:18px">
        <div style="font-weight:700;font-size:13px;color:#1e40af;padding:6px 0 5px">${title}</div>
        <div style="overflow-x:auto">
        <table style="border-collapse:collapse;table-layout:fixed;font-size:12px">
          ${colgroup()}
          <thead>${theadRow()}</thead>
          <tbody>
            ${rows.map((row,idx) => trHtml(row, idx, sec, E)).join('')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  function trHtml(row, idx, section, E) {
    const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr style="background:${bg}" data-section="${section}" data-idx="${idx}">
      ${COLS.map((c,ci) => {
        const val = row[c.key] ?? '';
        if (!E || ci === 0) {
          // 번호 칸 또는 뷰전용
          return `<td style="text-align:center;padding:4px 3px;border-bottom:1px solid #e5e7eb;overflow:hidden;white-space:nowrap">${val}</td>`;
        }
        return `<td style="padding:2px 2px;border-bottom:1px solid #e5e7eb">
          <input type="text" value="${String(val).replace(/"/g,'&quot;')}"
            data-section="${section}" data-idx="${idx}" data-field="${c.key}"
            oninput="Checklist.onRowInput(this)"
            style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;
                   padding:3px 2px;font-size:12px;text-align:center;background:transparent">
        </td>`;
      }).join('')}
    </tr>`;
  }

  function extraSection(rows, E) {
    if (!E && rows.length === 0) return '';
    return `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0 5px">
          <div style="font-weight:700;font-size:13px;color:#1e40af">No. (추가)</div>
          ${E ? `<button class="btn" onclick="Checklist.addExtraRow()" style="font-size:11px;padding:2px 10px">+ 행 추가</button>` : ''}
        </div>
        ${rows.length ? `
        <div style="overflow-x:auto">
        <table style="border-collapse:collapse;table-layout:fixed;font-size:12px">
          ${colgroup()}
          <colgroup-extra></colgroup-extra>
          <colgroup>${COLS.map(c=>`<col style="width:${c.w}px;min-width:${c.w}px">`).join('')}<col style="width:32px"></colgroup>
          <thead><tr style="background:#1e40af;color:#fff">
            ${COLS.map(c=>`<th style="padding:7px 4px;text-align:center;white-space:nowrap;font-size:12px">${c.label}</th>`).join('')}
            ${E ? '<th></th>' : ''}
          </tr></thead>
          <tbody>
            ${rows.map((row,idx) => {
              const bg = idx%2===0?'#fff':'#f8fafc';
              return `<tr style="background:${bg}">
                ${COLS.map((c,ci) => {
                  const val = row[c.key]??'';
                  if (!E || ci===0) return `<td style="text-align:center;padding:4px 3px;border-bottom:1px solid #e5e7eb">${val}</td>`;
                  return `<td style="padding:2px 2px;border-bottom:1px solid #e5e7eb">
                    <input type="text" value="${String(val).replace(/"/g,'&quot;')}"
                      data-section="extra" data-idx="${idx}" data-field="${c.key}"
                      oninput="Checklist.onRowInput(this)"
                      style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;
                             padding:3px 2px;font-size:12px;text-align:center;background:transparent">
                  </td>`;
                }).join('')}
                ${E ? `<td style="border-bottom:1px solid #e5e7eb;text-align:center">
                  <button onclick="Checklist.removeExtraRow(${idx})" style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:15px;line-height:1">×</button>
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        </div>` : '<div style="color:#aaa;font-size:12px;padding:4px 0">추가 행 없음</div>'}
      </div>`;
  }

  /* ──────────── 2타임연속여부 탭 ──────────── */
  function renderTwoTimeTable() {
    // 슬롯별 이름 맵 빌드
    const nameMap = {}; // nameMap[slot][ts] = name
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts] || emptyTimeslot();
      const allRows = [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])];
      allRows.forEach(r => {
        if (!r.tent_no && r.tent_no !== 0) return;
        const key = String(r.tent_no);
        if (!nameMap[key]) nameMap[key] = {};
        if (r.name) nameMap[key][ts] = r.name;
        // 2타임 표시
        if (r.two_time) nameMap[key]['_two_'+ts] = r.two_time;
      });
    });

    const smallMedRows = [...TENT4_NOS, ...TENT2_NOS];
    const largeRows = TENT8_NOS;

    function cell(key, ts) {
      const name = nameMap[key]?.[ts] || '';
      const twoTime = nameMap[key]?.['_two_'+ts] || '';
      const bg = name ? '#dbeafe' : '#f9fafb';
      const badge = twoTime ? `<span style="font-size:9px;background:#fbbf24;color:#78350f;border-radius:3px;padding:1px 3px;margin-left:3px">${twoTime}</span>` : '';
      return `<td style="padding:5px 6px;text-align:center;border:1px solid #e5e7eb;background:${bg};font-size:12px;white-space:nowrap">
        ${name}${badge}
      </td>`;
    }

    function buildTable(rows, title) {
      return `
        <div style="margin-bottom:20px">
          <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:8px">${title}</div>
          <table style="border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#1e40af;color:#fff">
                <th style="padding:7px 12px;text-align:center;border:1px solid #1e40af">텐트번호</th>
                <th style="padding:7px 40px;text-align:center;border:1px solid #1e40af">11시</th>
                <th style="padding:7px 40px;text-align:center;border:1px solid #1e40af">15시</th>
                <th style="padding:7px 40px;text-align:center;border:1px solid #1e40af">19시</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((no,i) => `
                <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                  <td style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;font-weight:600;color:#374151">${no}</td>
                  ${cell(String(no),'11')}
                  ${cell(String(no),'15')}
                  ${cell(String(no),'19')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // 2타임 예약자 목록 추출
    const twoTimeList = [];
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts] || emptyTimeslot();
      [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])].forEach(r => {
        if (r.two_time && r.name) {
          const key = `${r.name}_${r.two_time}`;
          if (!twoTimeList.find(x => x.key === key)) {
            twoTimeList.push({ key, name: r.name, two_time: r.two_time, tent_no: r.tent_no, product: r.product });
          }
        }
      });
    });

    const twoTimeHtml = twoTimeList.length ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:8px">🔁 2타임 연속 예약자</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${twoTimeList.map(t => `
            <div style="background:#fff;border:1px solid #fcd34d;border-radius:6px;padding:6px 12px;font-size:12px">
              <span style="font-weight:700">${t.name}</span>
              <span style="color:#d97706;margin-left:6px">${t.two_time}</span>
              <span style="color:#6b7280;margin-left:6px">텐트 ${t.tent_no} (${t.product})</span>
            </div>`).join('')}
        </div>
      </div>` : '<div style="color:#9ca3af;font-size:13px;margin-bottom:14px">2타임 연속 예약자 없음</div>';

    return twoTimeHtml
      + buildTable(smallMedRows, '텐트 2인 & 4인 (0~11번)')
      + buildTable(largeRows, '텐트 7인 (A~S, 티켓)');
  }

  /* ──────────── 이벤트 핸들러 ──────────── */
  function onRowInput(el) {
    let section = el.dataset.section;
    let idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    const d = getCurrentData();
    // M텐트: 0-5 → tent4, 6-11 → tent2
    if (section === 'mtent') {
      if (idx < 6) { section = 'tent4'; }
      else { section = 'tent2'; idx = idx - 6; }
    }
    if (d[section]?.[idx]) {
      d[section][idx][field] = el.value;
      recalcSummary(d);
      updateSummaryDisplay(d.summary);
    }
  }

  function updateSummaryDisplay(s) {
    const map = {
      bulmung_count:'불멍갯수', play_count:'플레이 인원수',
      child_pool:'아이풀장', adult_pool:'성인풀장', total_pool:'풀장합계',
      tent2:'텐트 2인(s)', tent4:'텐트 4인(m)', tent8:'텐트 7인(L)',
      group20:'단체20', group30:'단체30', total:'합계'
    };
    // just re-render summary section - find the summary div
    const sEl = document.querySelector('.cl-summary-grid');
    if (!sEl) return;
    Object.entries(map).forEach(([key, label]) => {
      const el = document.getElementById(`cl-sum-${key}`);
      if (el) el.textContent = s[key] || '-';
    });
  }

  function switchSlot(ts) {
    state.tab = 'slot';
    state.timeslot = ts;
    _refreshPanel();
    _refreshTabs();
  }

  function switchTab(tab) {
    state.tab = tab;
    _refreshPanel();
    _refreshTabs();
  }

  function _refreshPanel() {
    const el = document.getElementById('cl-panel');
    if (el) el.innerHTML = renderPanel();
  }

  function _refreshTabs() {
    TIMESLOTS.forEach(ts => {
      const btn = document.getElementById(`cl-tab-${ts}`);
      if (!btn) return;
      const active = state.tab === 'slot' && state.timeslot === ts;
      btn.style.background = active ? '#2563eb' : '#fff';
      btn.style.color = active ? '#fff' : '#2563eb';
    });
    const btn2 = document.getElementById('cl-tab-two');
    if (btn2) {
      const active = state.tab === 'two_time';
      btn2.style.background = active ? '#2563eb' : '#fff';
      btn2.style.color = active ? '#fff' : '#2563eb';
    }
  }

  async function changeDate() {
    const inp = document.getElementById('cl-date');
    state.date = inp.value;
    state.tab = 'slot';
    state.timeslot = '11';
    await loadAllSlots();
    renderUI();
  }

  async function saveSlot() {
    const btn = document.querySelector('[onclick="Checklist.saveSlot()"]');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      const ts = state.timeslot;
      await API.put(`/api/checklist/${state.date}/${ts}`, state.data[ts] || emptyTimeslot());
      if (!state.dates.includes(state.date)) state.dates.unshift(state.date);
      if (btn) btn.textContent = '✅ 저장됨';
      setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; } }, 1500);
    } catch (e) {
      alert('저장 실패: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
    }
  }

  function addExtraRow() {
    const d = getCurrentData();
    if (!d.extra) d.extra = [];
    d.extra.push(emptyRow(''));
    _refreshPanel();
  }

  function removeExtraRow(idx) {
    const d = getCurrentData();
    if (d.extra) d.extra.splice(idx, 1);
    _refreshPanel();
  }

  return { render, switchSlot, switchTab, changeDate, saveSlot, addExtraRow, removeExtraRow, onRowInput };
})();
