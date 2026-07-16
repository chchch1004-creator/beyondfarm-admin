const Checklist = (() => {
  const TIMESLOTS = ['11', '15', '19'];
  const TENT4_NOS = ['0','1','2','3','4','5'];
  const TENT2_NOS = ['6','7','8','9','10','11'];
  const TENT8_NOS = ['A','B','C','D','E','F','G','H','J','K','L','P','S'];

  const COLS = [
    { key: 'tent_no',    label: '번호',      w: 32 },
    { key: 'product',    label: '예약상품',   w: 44 },
    { key: 'visit_count',label: '방문횟수',   w: 52 },
    { key: 'name',       label: '예약자성함', w: 80 },
    { key: 'reserved',   label: '예약인원',   w: 44 },
    { key: 'actual',     label: '입장시인원', w: 52 },
    { key: 'two_time',   label: '2타임여부',  w: 58 },
    { key: 'play',       label: '플레이',     w: 34 },
    { key: 'child_pool', label: '아이풀장',   w: 44 },
    { key: 'adult_pool', label: '성인풀장',   w: 44 },
    { key: 'bulmung',    label: '불멍세트',   w: 44 },
    { key: 'adult_only', label: '성인만',     w: 34 },
    { key: 'memo',       label: '비고',       w: 264 },
  ];

  let state = {
    date: '',
    tab: 'slot',
    timeslot: '11',
    data: {},
    editable: false,
    dates: [],
  };

  let _saveTimer = null;

  function emptyTimeslot() {
    return {
      summary: {},
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

  // ── 요약 자동계산 ──
  function recalcSummary(d) {
    const allRows = [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[]), ...(d.extra||[])];
    const num = v => parseInt(v) || 0;
    let bulmung=0, play=0, child=0, adult=0, cntS=0, cntM=0, cntL=0, cnt20=0, cnt30=0;
    allRows.forEach(r => {
      bulmung += r.bulmung ? 1 : 0;  // 내용 있으면 1개
      play    += num(r.play);
      child   += num(r.child_pool);
      adult   += num(r.adult_pool);
      const p = (r.product||'').trim().toLowerCase();
      if (p === 's') cntS++;
      else if (p === 'm') cntM++;
      else if (p === 'l') cntL++;
      else if (p === '단체20' || p === '단체 20') cnt20++;
      else if (p === '단체30' || p === '단체 30') cnt30++;
    });
    if (!d.summary) d.summary = {};
    d.summary.bulmung_count = bulmung || '';
    d.summary.play_count    = play || '';
    d.summary.child_pool    = child || '';
    d.summary.adult_pool    = adult || '';
    d.summary.total_pool    = (child + adult) || '';
    d.summary.tent2         = cntS || '';
    d.summary.tent4         = cntM || '';
    d.summary.tent8         = cntL || '';
    d.summary.group20       = cnt20 || '';
    d.summary.group30       = cnt30 || '';
    d.summary.total         = (cntS + cntM + cntL + cnt20 + cnt30) || '';
  }

  function pushSummaryToDOM(s) {
    ['bulmung_count','play_count','child_pool','adult_pool','total_pool',
     'tent2','tent4','tent8','group20','group30','total'].forEach(k => {
      const el = document.getElementById(`cl-sum-${k}`);
      if (el) el.textContent = s[k] || '-';
    });
  }

  // ── 무음 자동저장 ──
  function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const ts = state.timeslot;
      API.put(`/api/checklist/${state.date}/${ts}`, state.data[ts] || emptyTimeslot())
        .then(() => { if (!state.dates.includes(state.date)) state.dates.unshift(state.date); })
        .catch(() => {});
    }, 800);
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
        const s = state.data[ts];
        s.tent4 = TENT4_NOS.map((no,i) => s.tent4?.[i] || emptyRow(no));
        s.tent2 = TENT2_NOS.map((no,i) => s.tent2?.[i] || emptyRow(no));
        // 티켓 행 제거 후 TENT8_NOS에 맞춤
        const t8 = (s.tent8 || []).filter(r => r.tent_no !== '티켓');
        s.tent8 = TENT8_NOS.map((no,i) => t8[i] || emptyRow(no));
        if (!s.extra) s.extra = [];
        recalcSummary(s);
      } catch {
        state.data[ts] = emptyTimeslot();
      }
    }));
  }

  function renderUI() {
    document.getElementById('content').innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="font-weight:600">날짜</label>
          <input type="date" id="cl-date" value="${state.date}"
            onchange="Checklist.changeDate()"
            style="padding:5px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
        </div>
      </div>

      <div style="display:flex;gap:0;margin-bottom:0">
        ${tabBtn('11','11시')}${tabBtn('15','15시')}${tabBtn('19','19시')}${tabBtnTwoTime()}
      </div>

      <div id="cl-panel" style="border:1px solid #2563eb;border-top:none;border-radius:0 8px 8px 8px;
           padding:16px;background:#fff;overflow-x:auto">
        ${renderPanel()}
      </div>`;
  }

  function tabBtn(ts, label) {
    const active = state.tab === 'slot' && state.timeslot === ts;
    return `<button id="cl-tab-${ts}" onclick="Checklist.switchSlot('${ts}')"
      style="padding:9px 20px;border:1px solid #2563eb;border-right:none;
      background:${active?'#2563eb':'#fff'};color:${active?'#fff':'#2563eb'};
      cursor:pointer;font-size:13px;font-weight:600;
      border-radius:${ts==='11'?'8px 0 0 0':'0'}">${label}</button>`;
  }

  function tabBtnTwoTime() {
    const active = state.tab === 'two_time';
    return `<button id="cl-tab-two" onclick="Checklist.switchTab('two_time')"
      style="padding:9px 20px;border:1px solid #2563eb;
      background:${active?'#2563eb':'#fff'};color:${active?'#fff':'#2563eb'};
      cursor:pointer;font-size:13px;font-weight:600;border-radius:0 8px 0 0">2타임연속여부</button>`;
  }

  function renderPanel() {
    if (state.tab === 'two_time') return renderTwoTimeTable();
    return renderSlot(getCurrentData(), state.editable);
  }

  /* ── 타임슬롯 렌더링 ── */
  function renderSlot(d, E) {
    recalcSummary(d);
    const s = d.summary || {};

    const sumItem = (label, key) =>
      `<div style="display:flex;flex-direction:column;gap:3px;min-width:90px">
        <div style="font-size:11px;color:#555;font-weight:600;text-align:center">${label}</div>
        <div id="cl-sum-${key}" style="padding:5px 6px;background:#fff;border:1px solid #d1d5db;
          border-radius:4px;text-align:center;font-size:13px;font-weight:700;color:#1e40af">
          ${s[key] || '-'}
        </div>
      </div>`;

    const summaryHtml = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:10px">📋 요약</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${sumItem('불멍갯수','bulmung_count')}
          ${sumItem('플레이 인원수','play_count')}
          ${sumItem('아이풀장','child_pool')}
          ${sumItem('성인풀장','adult_pool')}
          ${sumItem('풀장합계','total_pool')}
          ${sumItem('S텐트','tent2')}
          ${sumItem('M텐트','tent4')}
          ${sumItem('L텐트','tent8')}
          ${sumItem('단체20','group20')}
          ${sumItem('단체30','group30')}
          ${sumItem('합계','total')}
        </div>
      </div>`;

    const mRows = [...(d.tent4||[]), ...(d.tent2||[])];
    return summaryHtml
      + sectionTable('M텐트', mRows, 'mtent', E)
      + sectionTable('L텐트', d.tent8||[], 'tent8', E)
      + extraSection(d.extra||[], E);
  }

  function colgroup() {
    return `<colgroup>${COLS.map(c=>`<col style="width:${c.w}px;min-width:${c.w}px">`).join('')}</colgroup>`;
  }

  function thead(withDel) {
    return `<thead><tr style="background:#1e40af;color:#fff">
      ${COLS.map(c=>`<th style="padding:7px 4px;text-align:center;white-space:nowrap;font-size:12px">${c.label}</th>`).join('')}
      ${withDel ? '<th style="width:28px"></th>' : ''}
    </tr></thead>`;
  }

  function sectionTable(title, rows, section, E) {
    return `
      <div style="margin-bottom:18px">
        <div style="font-weight:700;font-size:13px;color:#1e40af;padding:6px 0 5px">${title}</div>
        <div style="overflow-x:auto">
          <table style="border-collapse:collapse;table-layout:fixed;font-size:12px">
            ${colgroup()}${thead(false)}
            <tbody>${rows.map((row,idx) => trHtml(row, idx, section, E, false)).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  function twoTimeBg(val) {
    if (!val) return '';
    return /19/.test(String(val)) ? '#bbf7d0' : '#fce7f3';
  }

  function trHtml(row, idx, section, E, withDel) {
    const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr style="background:${bg}">
      ${COLS.map((c, ci) => {
        const val = row[c.key] ?? '';
        const isTwoTime = c.key === 'two_time';
        const tdBg = isTwoTime ? twoTimeBg(val) : '';
        const tdStyle = `text-align:center;padding:4px 3px;border-bottom:1px solid #e5e7eb;${tdBg?'background:'+tdBg+';':''}`;
        if (ci === 0) return `<td style="${tdStyle}font-weight:600;color:#374151">${val}</td>`;
        if (!E)       return `<td style="${tdStyle}">${val}</td>`;
        return `<td id="td-${section}-${idx}-${c.key}" style="padding:2px 2px;border-bottom:1px solid #e5e7eb;${tdBg?'background:'+tdBg+';':''}">
          <input type="text" value="${String(val).replace(/"/g,'&quot;')}"
            data-section="${section}" data-idx="${idx}" data-field="${c.key}"
            oninput="Checklist.onRowInput(this)"
            style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;
                   padding:3px 2px;font-size:12px;text-align:center;background:transparent">
        </td>`;
      }).join('')}
      ${withDel && E ? `<td style="border-bottom:1px solid #e5e7eb;text-align:center;padding:0 2px">
        <button onclick="Checklist.removeExtraRow(${idx})" style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:15px;line-height:1">×</button>
      </td>` : (withDel ? '<td></td>' : '')}
    </tr>`;
  }

  function extraSection(rows, E) {
    if (!E && rows.length === 0) return '';
    return `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0 5px">
          <div style="font-weight:700;font-size:13px;color:#1e40af">티켓</div>
          ${E ? `<button class="btn" onclick="Checklist.addExtraRow()" style="font-size:11px;padding:2px 10px">+ 행 추가</button>` : ''}
        </div>
        ${rows.length ? `
        <div style="overflow-x:auto">
          <table style="border-collapse:collapse;table-layout:fixed;font-size:12px">
            <colgroup>${COLS.map(c=>`<col style="width:${c.w}px;min-width:${c.w}px">`).join('')}<col style="width:28px"></colgroup>
            ${thead(true)}
            <tbody>${rows.map((row,idx) => trHtml(row, idx, 'extra', E, true)).join('')}</tbody>
          </table>
        </div>` : '<div style="color:#aaa;font-size:12px;padding:4px 0">행 없음</div>'}
      </div>`;
  }

  /* ── 2타임연속여부 탭 ── */
  function renderTwoTimeTable() {
    const nameMap = {};
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts] || emptyTimeslot();
      [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])].forEach(r => {
        const key = String(r.tent_no);
        if (!nameMap[key]) nameMap[key] = {};
        if (r.name) nameMap[key][ts] = r.name;
        if (r.two_time) nameMap[key]['_two_'+ts] = r.two_time;
      });
    });

    // 여러 타임슬롯에 등장하는 이름 집합
    const nameCount = {};
    Object.values(nameMap).forEach(slotObj => {
      TIMESLOTS.forEach(ts => {
        const n = slotObj[ts];
        if (n) nameCount[n] = (nameCount[n] || 0) + 1;
      });
    });
    const multiNames = new Set(Object.keys(nameCount).filter(n => nameCount[n] > 1));

    function cell(key, ts) {
      const name = nameMap[key]?.[ts] || '';
      const twoTime = nameMap[key]?.['_two_'+ts] || '';
      const isMulti = name && multiNames.has(name);
      const bg = isMulti ? '#fce7f3' : (name ? '#dbeafe' : '#f9fafb');
      const badge = twoTime ? `<span style="font-size:9px;background:#fbbf24;color:#78350f;border-radius:3px;padding:1px 3px;margin-left:3px">${twoTime}</span>` : '';
      return `<td style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;background:${bg};font-size:12px;white-space:nowrap">${name}${badge}</td>`;
    }

    function buildTable(nos, title) {
      return `
        <div style="margin-bottom:20px">
          <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:8px">${title}</div>
          <table style="border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#1e40af;color:#fff">
              <th style="padding:7px 14px;text-align:center;border:1px solid #1e40af">번호</th>
              <th style="padding:7px 50px;text-align:center;border:1px solid #1e40af">11시</th>
              <th style="padding:7px 50px;text-align:center;border:1px solid #1e40af">15시</th>
              <th style="padding:7px 50px;text-align:center;border:1px solid #1e40af">19시</th>
            </tr></thead>
            <tbody>
              ${nos.map((no,i) => `
                <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                  <td style="padding:5px 8px;text-align:center;border:1px solid #e5e7eb;font-weight:600;color:#374151">${no}</td>
                  ${cell(String(no),'11')}${cell(String(no),'15')}${cell(String(no),'19')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    const twoTimeList = [];
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts] || emptyTimeslot();
      [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])].forEach(r => {
        if (r.two_time && r.name) {
          const key = `${r.name}_${r.two_time}`;
          if (!twoTimeList.find(x => x.key === key))
            twoTimeList.push({ key, name: r.name, two_time: r.two_time, tent_no: r.tent_no, product: r.product });
        }
      });
    });

    const twoTimeHtml = twoTimeList.length ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:8px">🔁 2타임 연속 예약자</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${twoTimeList.map(t => `
            <div style="background:#fff;border:1px solid #fcd34d;border-radius:6px;padding:6px 12px;font-size:12px">
              <b>${t.name}</b>
              <span style="color:#d97706;margin-left:6px">${t.two_time}</span>
              <span style="color:#6b7280;margin-left:6px">번호 ${t.tent_no}(${t.product})</span>
            </div>`).join('')}
        </div>
      </div>` : '<div style="color:#9ca3af;font-size:13px;margin-bottom:14px">2타임 연속 예약자 없음</div>';

    return twoTimeHtml
      + buildTable([...TENT4_NOS, ...TENT2_NOS], 'M텐트 (0~11번)')
      + buildTable(TENT8_NOS, 'L텐트 (A~S)');
  }

  /* ── 이벤트 핸들러 ── */
  function onRowInput(el) {
    let section = el.dataset.section;
    let idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    const d = getCurrentData();
    if (section === 'mtent') {
      if (idx < 6) { section = 'tent4'; }
      else { section = 'tent2'; idx -= 6; }
    }
    if (d[section]?.[idx] !== undefined) {
      d[section][idx][field] = el.value;
      // 2타임여부 셀 배경 즉시 반영
      if (field === 'two_time') {
        const td = document.getElementById(`td-${el.dataset.section}-${el.dataset.idx}-two_time`);
        if (td) td.style.background = twoTimeBg(el.value);
      }
      recalcSummary(d);
      pushSummaryToDOM(d.summary);
      silentSave();
    }
  }

  function silentSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const ts = state.timeslot;
      API.put(`/api/checklist/${state.date}/${ts}`, state.data[ts] || emptyTimeslot())
        .then(() => { if (!state.dates.includes(state.date)) state.dates.unshift(state.date); })
        .catch(() => {});
    }, 800);
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
    state.date = document.getElementById('cl-date').value;
    state.tab = 'slot';
    state.timeslot = '11';
    await loadAllSlots();
    renderUI();
  }

  function addExtraRow() {
    const d = getCurrentData();
    if (!d.extra) d.extra = [];
    d.extra.push(emptyRow(''));
    _refreshPanel();
    silentSave();
  }

  function removeExtraRow(idx) {
    const d = getCurrentData();
    if (d.extra) d.extra.splice(idx, 1);
    recalcSummary(d);
    _refreshPanel();
    silentSave();
  }

  return { render, switchSlot, switchTab, changeDate, addExtraRow, removeExtraRow, onRowInput };
})();
