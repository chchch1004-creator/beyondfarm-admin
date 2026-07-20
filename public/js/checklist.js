const Checklist = (() => {
  const TIMESLOTS = ['11', '15', '19'];
  const TENT4_NOS = ['0','1','2','3','4','5'];
  const TENT2_NOS = ['6','7','8','9','10','11'];
  const TENT8_NOS = ['A','B','C','D','E','F','G','H','J','K','L','P','S'];

  const COLS = [
    { key: 'tent_no',      label: '번호',      w: 32 },
    { key: 'product',      label: '예약상품',   w: 36 },
    { key: 'visit_count',  label: '방문횟수',   w: 38 },
    { key: 'name',         label: '예약자성함', w: 52 },
    { key: 'reserved',     label: '예약인원',   w: 44 },
    { key: 'actual',       label: '입장시인원', w: 40 },
    { key: 'two_time',     label: '2타임여부',  w: 48 },
    { key: 'play',         label: '플레이',     w: 34 },
    { key: 'child_pool',   label: '아이풀장',   w: 38 },
    { key: 'adult_pool',   label: '성인풀장',   w: 38 },
    { key: 'bulmung',      label: '불멍세트',   w: 38 },
    { key: 'adult_only',   label: '성인만',     w: 34 },
    { key: 'extra_hour',   label: '1시간추가',  w: 40 },
    { key: 'memo',         label: '비고',       w: 290 },
  ];

  // 티켓(extra) 테이블: 삭제버튼 28px 만큼 memo를 줄여서 전체 폭을 M텐트/L텐트와 맞춤
  const DEL_COL_W = 28;

  let state = {
    date: '',
    tab: 'slot',
    timeslot: '11',
    data: {},
    editable: false,
    dates: [],
  };

  let _saveTimer = null;
  let _dragState = null;
  let _history = [];
  let _histIdx = -1;

  function pushHistory() {
    const snap = JSON.stringify(state.data);
    _history = _history.slice(0, _histIdx + 1);
    _history.push(snap);
    if (_history.length > 50) _history.shift(); else _histIdx = _history.length - 1;
  }
  function undo() {
    if (_histIdx <= 0) return;
    _histIdx--;
    state.data = JSON.parse(_history[_histIdx]);
    _refreshPanel(); silentSave();
  }
  function redo() {
    if (_histIdx >= _history.length - 1) return;
    _histIdx++;
    state.data = JSON.parse(_history[_histIdx]);
    _refreshPanel(); silentSave();
  }

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
             two_time:'', play:'', child_pool:'', adult_pool:'', bulmung:'', adult_only:'', extra_hour:'', memo:'' };
  }

  function getCurrentData() {
    return state.data[state.timeslot] || emptyTimeslot();
  }

  // ── 요약 자동계산 ──
  function recalcSummary(d, timeslot) {
    const allRows = [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[]), ...(d.extra||[])];
    const num = v => parseInt(v) || 0;
    let bulmung=0, play=0, child=0, adult=0, cntS=0, cntM=0, cntL=0, cnt20=0, cnt30=0;
    const extraHourNos = [];
    const extendNos = [];
    const extendTarget = timeslot === '11' ? '15' : timeslot === '15' ? '19' : null;

    allRows.forEach(r => {
      bulmung += r.bulmung ? 1 : 0;
      play    += num(r.play);
      child   += num(r.child_pool);
      adult   += num(r.adult_pool);
      const p = (r.product||'').trim().toLowerCase();
      if (p === 's') cntS++;
      else if (p === 'm') cntM++;
      else if (p === 'l') cntL++;
      else if (p === '단체20' || p === '단체 20') cnt20++;
      else if (p === '단체30' || p === '단체 30') cnt30++;
      if (r.extra_hour) extraHourNos.push(r.tent_no);
      if (extendTarget && r.two_time && String(r.two_time).includes(extendTarget))
        extendNos.push(r.tent_no);
    });
    if (!d.summary) d.summary = {};
    d.summary.bulmung_count  = bulmung || '';
    d.summary.play_count     = play || '';
    d.summary.child_pool     = child || '';
    d.summary.adult_pool     = adult || '';
    d.summary.total_pool     = (child + adult) || '';
    d.summary.tent2          = cntS || '';
    d.summary.tent4          = cntM || '';
    d.summary.tent8          = cntL || '';
    d.summary.group20        = cnt20 || '';
    d.summary.group30        = cnt30 || '';
    d.summary.total          = (cntS + cntM + cntL + cnt20 + cnt30) || '';
    d.summary.extra_hour_nos = extraHourNos.join(' ') || '';
    d.summary.extend_nos     = extendNos.join(' ') || '';
  }

  function pushSummaryToDOM(s) {
    ['bulmung_count','play_count','child_pool','adult_pool','total_pool',
     'tent2','tent4','tent8','group20','group30','total',
     'extra_hour_nos','extend_nos'].forEach(k => {
      const el = document.getElementById(`cl-sum-${k}`);
      if (el) el.textContent = s[k] || '-';
    });
  }

  // ── 무음 자동저장 ──
  function silentSave() {
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
    // Ctrl+Z / Ctrl+Y 전역 리스너 (중복 방지)
    if (!window._clHistoryBound) {
      window._clHistoryBound = true;
      document.addEventListener('keydown', e => {
        if (App.currentPage !== 'checklist') return;
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); Checklist.undo(); }
        if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); Checklist.redo(); }
      });
    }
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
        const t8 = (s.tent8 || []).filter(r => r.tent_no !== '티켓');
        s.tent8 = TENT8_NOS.map((no,i) => t8[i] || emptyRow(no));
        if (!s.extra) s.extra = [];
        recalcSummary(s, ts);
      } catch {
        state.data[ts] = emptyTimeslot();
      }
    }));
    autoFillTwoTime();
    // 로드 후 히스토리 초기화
    _history = [JSON.stringify(state.data)];
    _histIdx = 0;
  }

  // 복수 타임슬롯에 같은 이름이 있으면 two_time 자동 입력 (비어있는 경우만)
  function autoFillTwoTime() {
    const nameToSlots = {};
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts];
      [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])].forEach(r => {
        if (!r.name) return;
        if (!nameToSlots[r.name]) nameToSlots[r.name] = [];
        if (!nameToSlots[r.name].includes(ts)) nameToSlots[r.name].push(ts);
      });
    });
    let changed = false;
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts];
      [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])].forEach(r => {
        if (!r.name || r.two_time) return;
        const slots = nameToSlots[r.name];
        if (slots && slots.length > 1) {
          r.two_time = slots.join(' ');
          changed = true;
        }
      });
    });
    if (changed) {
      TIMESLOTS.forEach(ts => {
        const d = state.data[ts];
        recalcSummary(d, ts);
        API.put(`/api/checklist/${state.date}/${ts}`, d).catch(() => {});
      });
    }
  }

  function renderUI() {
    document.getElementById('content').innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <label style="font-weight:600">날짜</label>
          <button onclick="Checklist.moveDate(-1)"
            style="padding:4px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa;
                   font-size:15px;cursor:pointer;line-height:1">◀</button>
          <input type="date" id="cl-date" value="${state.date}"
            onchange="Checklist.changeDate()"
            style="padding:5px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
          <button onclick="Checklist.moveDate(1)"
            style="padding:4px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa;
                   font-size:15px;cursor:pointer;line-height:1">▶</button>
          ${state.editable ? `
          <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
            <button onclick="Checklist.undo()" title="되돌리기 (Ctrl+Z)"
              style="padding:6px 10px;border:1px solid #64748b;border-radius:6px;background:#f8fafc;
                     color:#374151;font-size:13px;font-weight:600;cursor:pointer">↩ 되돌리기</button>
            <button onclick="Checklist.redo()" title="앞으로가기 (Ctrl+Y)"
              style="padding:6px 10px;border:1px solid #64748b;border-radius:6px;background:#f8fafc;
                     color:#374151;font-size:13px;font-weight:600;cursor:pointer">↪ 앞으로</button>
            <input type="file" id="cl-excel-input" accept=".xlsx,.xls" style="display:none"
              onchange="Checklist.uploadExcel(this)">
            <button onclick="document.getElementById('cl-excel-input').click()"
              style="padding:6px 14px;border:1px solid #16a34a;border-radius:6px;background:#f0fdf4;
                     color:#15803d;font-size:13px;font-weight:600;cursor:pointer">
              📥 네이버 예약 가져오기
            </button>
            <button onclick="Checklist.deleteDate()"
              style="padding:6px 14px;border:1px solid #dc2626;border-radius:6px;background:#fef2f2;
                     color:#dc2626;font-size:13px;font-weight:600;cursor:pointer">
              🗑 날짜 삭제
            </button>
          </div>` : ''}
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
    const isMobile = window.innerWidth < 700;
    return isMobile ? renderSlotMobile(getCurrentData(), state.editable) : renderSlot(getCurrentData(), state.editable);
  }

  /* ── 모바일 컴팩트 테이블 ── */
  function renderSlotMobile(d, E) {
    recalcSummary(d, state.timeslot);
    const s = d.summary || {};

    // 요약 한 줄 (가로 스크롤)
    const sumItems = [
      ['불멍','bulmung_count'],['플레이','play_count'],['아이풀','child_pool'],
      ['성인풀','adult_pool'],['풀합계','total_pool'],['S','tent2'],['M','tent4'],
      ['L','tent8'],['단체20','group20'],['단체30','group30'],['합계','total'],
    ];
    const summaryHtml = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 10px;margin-bottom:10px">
        <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;align-items:flex-end">
          ${sumItems.map(([label,key])=>`
            <div style="flex:0 0 auto;text-align:center;min-width:36px">
              <div style="font-size:9px;color:#555;font-weight:600;white-space:nowrap">${label}</div>
              <div id="cl-sum-${key}" style="padding:2px 3px;background:#fff;border:1px solid #d1d5db;border-radius:3px;font-size:12px;font-weight:700;color:#1e40af">${s[key]||'-'}</div>
            </div>`).join('')}
        </div>
        <div style="font-size:10px;color:#555;margin-top:4px">
          1시간추가: <span id="cl-sum-extra_hour_nos" style="font-weight:700;color:#dc2626">${s.extra_hour_nos||'-'}</span>
          &nbsp;연장: <span id="cl-sum-extend_nos" style="font-weight:700;color:#2563eb">${s.extend_nos||'-'}</span>
        </div>
      </div>`;

    // 컴팩트 테이블 행: 번호·이름·예약/입장·2타임·불멍·비고
    // 탭하면 expanded row가 토글되어 전체 필드 편집 가능
    function compactRow(row, idx, section) {
      const divBorder = (
        (section === 'mtent' && (idx === 1 || idx === 6)) ||
        (section === 'tent8' && idx === 7)
      ) ? 'border-top:3px solid #94a3b8;' : '';

      const two_bg  = twoTimeBg(row.two_time);
      const rowBg   = idx % 2 === 0 ? '#fff' : '#f8fafc';
      const nameBg  = row.actual ? '#bae6fd' : '';

      // 뱃지들 (2타임·불멍·플레이·추가옵션)
      const badges = [
        row.two_time   ? `<span style="background:${two_bg};color:#374151;font-size:9px;border-radius:3px;padding:1px 3px">${row.two_time}</span>` : '',
        row.bulmung    ? `<span style="background:#fef3c7;color:#92400e;font-size:9px;border-radius:3px;padding:1px 3px">불멍</span>` : '',
        row.play       ? `<span style="background:#e0e7ff;color:#3730a3;font-size:9px;border-radius:3px;padding:1px 3px">플레이${row.play}</span>` : '',
        row.extra_hour ? `<span style="background:#fca5a5;color:#7f1d1d;font-size:9px;border-radius:3px;padding:1px 3px">+1h</span>` : '',
        row.child_pool ? `<span style="background:#d1fae5;color:#065f46;font-size:9px;border-radius:3px;padding:1px 3px">아이${row.child_pool}</span>` : '',
        row.adult_pool ? `<span style="background:#d1fae5;color:#065f46;font-size:9px;border-radius:3px;padding:1px 3px">성인${row.adult_pool}</span>` : '',
      ].filter(Boolean).join('');

      const expandId = `mob-exp-${section}-${idx}`;

      // 펼침 상세 편집 행
      const DETAIL_FIELDS = [
        ['예약상품','product'],['방문횟수','visit_count'],['예약인원','reserved'],
        ['입장시인원','actual'],['2타임','two_time'],['플레이','play'],
        ['아이풀','child_pool'],['성인풀','adult_pool'],['불멍','bulmung'],
        ['성인만','adult_only'],['1시간추가','extra_hour'],['비고','memo'],
      ];
      const detailHtml = E ? `
        <tr id="${expandId}" style="display:none;background:#f0f9ff">
          <td colspan="6" style="padding:8px 6px;border-bottom:2px solid #bfdbfe">
            <div style="display:flex;flex-wrap:wrap;gap:6px 10px">
              ${DETAIL_FIELDS.map(([label,key])=>{
                const val = row[key]??'';
                const bg = key==='extra_hour'&&val?'#fca5a5':key==='two_time'&&val?two_bg:'#fff';
                return `<div style="flex:1 1 42%;min-width:100px">
                  <div style="font-size:10px;color:#64748b;margin-bottom:2px">${label}</div>
                  <input type="text" value="${String(val).replace(/"/g,'&quot;')}"
                    data-section="${section}" data-idx="${idx}" data-field="${key}"
                    oninput="Checklist.onRowInput(this)"
                    style="width:100%;box-sizing:border-box;border:1px solid #bfdbfe;border-radius:4px;
                           padding:5px 7px;font-size:13px;background:${bg}">
                </div>`;
              }).join('')}
            </div>
            <button onclick="Checklist.clearRow('${section}',${idx})"
              style="margin-top:8px;border:1px solid #e5e7eb;background:#fff;color:#e53e3e;
                     padding:4px 12px;border-radius:4px;font-size:12px;cursor:pointer">× 한 줄 지우기</button>
          </td>
        </tr>` : '';

      const pool = (parseInt(row.child_pool)||0) + (parseInt(row.adult_pool)||0);
      const td = (content, extra='') =>
        `<td style="padding:3px 1px;text-align:center;font-size:10px;border-bottom:1px solid #e5e7eb;${divBorder}${extra}">${content}</td>`;
      const dot = (val, bg) => val ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${bg}"></span>` : '';

      return `<tr style="background:${rowBg};${divBorder}cursor:pointer" onclick="(function(){
          const r=document.getElementById('${expandId}');
          if(!r)return;
          r.style.display=r.style.display==='none'?'table-row':'none';
        })()">
        ${td(row.tent_no, 'font-weight:700;color:#1e40af;white-space:nowrap;')}
        ${td(row.name||'', `font-size:11px;font-weight:600;text-align:left;padding-left:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${nameBg?'background:'+nameBg+';':''}`)}
        ${td(row.reserved||'')}
        ${td(row.actual||'')}
        ${td(row.two_time ? `<span style="background:${two_bg};border-radius:3px;padding:1px 2px;font-size:8px;white-space:nowrap">${row.two_time}</span>` : '')}
        ${td(row.play||'')}
        ${td(pool||'')}
        ${td(dot(row.bulmung,'#fbbf24'))}
        ${td(dot(row.extra_hour,'#f87171'))}
      </tr>${detailHtml}`;
    }

    function mobileTable(title, rows, section) {
      const th = (label, align='center') =>
        `<th style="padding:4px 2px;text-align:${align};white-space:nowrap;font-size:10px">${label}</th>`;
      return `<div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:12px;color:#1e40af;padding:3px 0 4px">${title}</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px">
          <colgroup>
            <col style="width:20px">
            <col style="width:40px">
            <col style="width:22px"><col style="width:22px">
            <col style="width:32px">
            <col style="width:18px"><col style="width:18px">
            <col style="width:14px"><col style="width:14px">
          </colgroup>
          <thead><tr style="background:#1e40af;color:#fff">
            ${th('번호')}${th('이름','left')}${th('예약')}${th('입장')}
            ${th('2타임')}${th('플레이')}${th('풀장')}${th('불멍')}${th('+1h')}
          </tr></thead>
          <tbody>${rows.map((row,idx)=>compactRow(row,idx,section)).join('')}</tbody>
        </table>
      </div>`;
    }

    const mRows = [...(d.tent4||[]), ...(d.tent2||[])];
    return summaryHtml
      + mobileTable('M텐트 (0~11)', mRows, 'mtent')
      + mobileTable('L텐트 (A~S)', d.tent8||[], 'tent8');
  }

  /* ── 타임슬롯 렌더링 ── */
  function renderSlot(d, E) {
    recalcSummary(d, state.timeslot);
    const s = d.summary || {};

    const sumItem = (label, key, minW=90) =>
      `<div style="display:flex;flex-direction:column;gap:3px;min-width:${minW}px">
        <div style="font-size:11px;color:#555;font-weight:600;text-align:center">${label}</div>
        <div id="cl-sum-${key}" style="padding:5px 6px;background:#fff;border:1px solid #d1d5db;
          border-radius:4px;text-align:center;font-size:13px;font-weight:700;color:#1e40af">
          ${s[key] || '-'}
        </div>
      </div>`;

    const summaryHtml = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:10px">📋 요약</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start">
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
          <div style="margin-left:auto;display:flex;gap:8px">
            ${sumItem('1시간추가','extra_hour_nos', 135)}
            ${sumItem('연장텐트','extend_nos', 135)}
          </div>
        </div>
      </div>`;

    const mRows = [...(d.tent4||[]), ...(d.tent2||[])];
    return summaryHtml
      + sectionTable('M텐트', mRows, 'mtent', E)
      + sectionTable('L텐트', d.tent8||[], 'tent8', E)
      + extraSection(d.extra||[], E);
  }

  function colgroup(withClear) {
    return `<colgroup>${COLS.map(c=>`<col style="width:${c.w}px;min-width:${c.w}px">`).join('')}${withClear?`<col style="width:${DEL_COL_W}px">`:''}</colgroup>`;
  }

  // 티켓 테이블용 colgroup: memo를 DEL_COL_W만큼 줄여서 삭제버튼 컬럼 포함 시 전체 폭 동일
  function colgroupExtra() {
    return `<colgroup>${COLS.map(c => {
      const w = c.key === 'memo' ? c.w - DEL_COL_W : c.w;
      return `<col style="width:${w}px;min-width:${w}px">`;
    }).join('')}<col style="width:${DEL_COL_W}px"></colgroup>`;
  }

  function thead(withDel) {
    return `<thead><tr style="background:#1e40af;color:#fff">
      ${COLS.map(c=>`<th style="padding:7px 4px;text-align:center;white-space:nowrap;font-size:12px">${c.label}</th>`).join('')}
      ${withDel ? `<th style="width:${DEL_COL_W}px"></th>` : ''}
    </tr></thead>`;
  }

  function sectionTable(title, rows, section, E) {
    const dragHint = E ? '<span style="font-size:10px;color:#9ca3af;font-weight:400;margin-left:6px">행 드래그로 순서 변경</span>' : '';
    return `
      <div style="margin-bottom:18px">
        <div style="font-weight:700;font-size:13px;color:#1e40af;padding:6px 0 5px">${title}${dragHint}</div>
        <div style="overflow-x:auto">
          <table style="border-collapse:collapse;table-layout:fixed;font-size:12px">
            ${colgroup(E)}${thead(E)}
            <tbody>${rows.map((row,idx) => trHtml(row, idx, section, E, false)).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  function twoTimeBg(val) {
    if (!val) return '';
    return /19/.test(String(val)) ? '#bbf7d0' : '#fce7f3';
  }

  function cellBg(key, row) {
    if (key === 'two_time')   return twoTimeBg(row.two_time);
    if (key === 'name')       return row.actual ? '#bae6fd' : '';
    if (key === 'extra_hour') return row.extra_hour ? '#fca5a5' : '';
    return '';
  }

  function trHtml(row, idx, section, E, withDel) {
    const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
    // 구분선: M텐트 0|1 사이, 5|6 사이 / L텐트 G(6)|H(7) 사이
    const divider = (
      (section === 'mtent' && (idx === 1 || idx === 6)) ||
      (section === 'tent8' && idx === 7)
    ) ? 'border-top:3px solid #94a3b8;' : '';
    const dragAttrs = E ? `draggable="true"
      ondragstart="Checklist.onDragStart(event,'${section}',${idx})"
      ondragover="Checklist.onDragOver(event)"
      ondragenter="Checklist.onDragEnter(event,'${section}',${idx})"
      ondragleave="Checklist.onDragLeave(event)"
      ondrop="Checklist.onDrop(event,'${section}',${idx})"
      ondragend="Checklist.onDragEnd(event)"` : '';
    return `<tr style="background:${bg};${divider}" ${dragAttrs}>
      ${COLS.map((c, ci) => {
        const val = row[c.key] ?? '';
        const tdBg = cellBg(c.key, row);
        const baseStyle = `border-bottom:1px solid #e5e7eb;${divider}${tdBg?'background:'+tdBg+';':''}`;
        if (ci === 0) {
          const handle = E ? '<span style="color:#ccc;font-size:10px;margin-right:2px;vertical-align:middle">⠿</span>' : '';
          return `<td style="text-align:center;padding:4px 3px;${baseStyle}font-weight:600;color:#374151;${E?'cursor:grab;user-select:none':''}">${handle}${val}</td>`;
        }
        if (!E) return `<td style="text-align:center;padding:4px 3px;${baseStyle}">${val}</td>`;
        return `<td id="td-${section}-${idx}-${c.key}" style="padding:2px 2px;${baseStyle}">
          <input type="text" value="${String(val).replace(/"/g,'&quot;')}"
            data-section="${section}" data-idx="${idx}" data-field="${c.key}"
            oninput="Checklist.onRowInput(this)"
            onkeydown="Checklist.onRowKeydown(this,event)"
            style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;
                   padding:3px 2px;font-size:12px;text-align:center;background:transparent">
        </td>`;
      }).join('')}
      ${withDel && E ? `<td style="border-bottom:1px solid #e5e7eb;${divider}text-align:center;padding:0 2px">
        <button onclick="Checklist.removeExtraRow(${idx})" style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:15px;line-height:1">×</button>
      </td>` : withDel ? '<td></td>' : E ? `<td style="border-bottom:1px solid #e5e7eb;${divider}text-align:center;padding:0 2px">
        <button onclick="Checklist.clearRow('${section}',${idx})" title="한 줄 지우기"
          style="border:none;background:none;color:#cbd5e1;cursor:pointer;font-size:15px;line-height:1"
          onmouseover="this.style.color='#e53e3e'" onmouseout="this.style.color='#cbd5e1'">×</button>
      </td>` : ''}
    </tr>`;
  }

  function extraSection(rows, E) {
    if (!E && rows.length === 0) return '';
    const dragHint = E ? '<span style="font-size:10px;color:#9ca3af;font-weight:400;margin-left:6px">행 드래그로 순서 변경</span>' : '';
    return `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0 5px">
          <div style="font-weight:700;font-size:13px;color:#1e40af">티켓${dragHint}</div>
          ${E ? `<button class="btn" onclick="Checklist.addExtraRow()" style="font-size:11px;padding:2px 10px">+ 행 추가</button>` : ''}
        </div>
        ${rows.length ? `
        <div style="overflow-x:auto">
          <table style="border-collapse:collapse;table-layout:fixed;font-size:12px">
            ${colgroupExtra()}
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

  /* ── 드래그앤드롭 행 순서 변경 ── */
  function onDragStart(e, section, idx) {
    _dragState = { section, idx };
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDragEnter(e, section, idx) {
    if (!_dragState || _dragState.idx === idx) return;
    e.currentTarget.style.outline = '2px dashed #2563eb';
    e.currentTarget.style.outlineOffset = '-2px';
  }

  function onDragLeave(e) {
    e.currentTarget.style.outline = '';
  }

  function onDrop(e, section, idx) {
    e.preventDefault();
    e.currentTarget.style.outline = '';
    if (!_dragState || (_dragState.section === section && _dragState.idx === idx)) {
      _dragState = null; return;
    }
    const srcSection = _dragState.section;
    const srcIdx = _dragState.idx;
    _dragState = null;
    pushHistory();

    const d = getCurrentData();
    function swapData(a, b) {
      const keys = Object.keys(a).filter(k => k !== 'tent_no');
      keys.forEach(k => { const t = a[k]; a[k] = b[k]; b[k] = t; });
    }
    function resolveRow(sec, i) {
      if (sec === 'mtent') return i < 6 ? [d.tent4, i] : [d.tent2, i - 6];
      return [d[sec], i];
    }
    const [sa, si] = resolveRow(srcSection, srcIdx);
    const [da, di] = resolveRow(section, idx);
    if (!sa || !da) return;
    swapData(sa[si], da[di]);

    recalcSummary(d, state.timeslot);
    _refreshPanel();
    silentSave();
  }

  function onDragEnd(e) {
    e.currentTarget.style.opacity = '';
    e.currentTarget.style.outline = '';
    _dragState = null;
  }

  /* ── 화살표 키 셀 이동 ── */
  function onRowKeydown(el, e) {
    const dir = e.key;
    if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(dir)) return;
    const section = el.dataset.section;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    const fieldKeys = COLS.slice(1).map(c => c.key); // 번호 제외한 입력 가능 컬럼
    const fi = fieldKeys.indexOf(field);

    if (dir === 'ArrowDown' || dir === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = dir === 'ArrowDown' ? idx + 1 : idx - 1;
      const next = document.querySelector(`input[data-section="${section}"][data-idx="${nextIdx}"][data-field="${field}"]`);
      if (next) { next.focus(); next.select(); }
    } else if (dir === 'ArrowRight' && el.selectionStart === el.value.length) {
      e.preventDefault();
      const nextFi = fi + 1;
      if (nextFi < fieldKeys.length) {
        const next = document.querySelector(`input[data-section="${section}"][data-idx="${idx}"][data-field="${fieldKeys[nextFi]}"]`);
        if (next) { next.focus(); next.select(); }
      }
    } else if (dir === 'ArrowLeft' && el.selectionStart === 0) {
      e.preventDefault();
      const prevFi = fi - 1;
      if (prevFi >= 0) {
        const prev = document.querySelector(`input[data-section="${section}"][data-idx="${idx}"][data-field="${fieldKeys[prevFi]}"]`);
        if (prev) { prev.focus(); prev.select(); }
      }
    }
  }

  /* ── 한 줄 지우기 ── */
  function clearRow(section, idx) {
    pushHistory();
    const d = getCurrentData();
    let arr, i;
    if (section === 'mtent') {
      arr = idx < 6 ? d.tent4 : d.tent2;
      i = idx < 6 ? idx : idx - 6;
    } else { arr = d[section]; i = idx; }
    if (!arr || arr[i] === undefined) return;
    const tent_no = arr[i].tent_no;
    arr[i] = emptyRow(tent_no);
    recalcSummary(d, state.timeslot);
    _refreshPanel(); silentSave();
  }

  let _histTimer = null;
  /* ── 이벤트 핸들러 ── */
  function onRowInput(el) {
    // 입력 중에는 500ms 후 히스토리 저장 (너무 잦은 스냅샷 방지)
    clearTimeout(_histTimer);
    _histTimer = setTimeout(pushHistory, 500);
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
      const sec0 = el.dataset.section, i0 = el.dataset.idx;
      if (field === 'two_time') {
        const td = document.getElementById(`td-${sec0}-${i0}-two_time`);
        if (td) td.style.background = twoTimeBg(el.value);
      }
      if (field === 'actual') {
        const td = document.getElementById(`td-${sec0}-${i0}-name`);
        if (td) td.style.background = el.value ? '#bae6fd' : '';
      }
      if (field === 'extra_hour') {
        const td = document.getElementById(`td-${sec0}-${i0}-extra_hour`);
        if (td) td.style.background = el.value ? '#fca5a5' : '';
      }
      recalcSummary(d, state.timeslot);
      pushSummaryToDOM(d.summary);
      silentSave();
    }
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

  async function moveDate(delta) {
    const d = new Date(state.date);
    d.setDate(d.getDate() + delta);
    state.date = d.toISOString().slice(0, 10);
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
    recalcSummary(d, state.timeslot);
    _refreshPanel();
    silentSave();
  }

  async function uploadExcel(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    const btn = document.querySelector('button[onclick*="cl-excel-input"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 처리 중...'; }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/checklist/upload-excel', {
        method: 'POST', body: fd,
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '업로드 실패');
      state.date = json.date;
      state.tab = 'slot';
      state.timeslot = '11';
      await loadAllSlots();
      renderUI();
    } catch (e) {
      alert('엑셀 업로드 실패: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '📥 네이버 예약 가져오기'; }
    }
  }

  async function deleteDate() {
    if (!confirm(`${state.date} 날짜의 체크리스트를 모두 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/checklist/${state.date}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).error);
      state.data = {};
      renderUI();
    } catch (e) { alert('삭제 실패: ' + e.message); }
  }

  return {
    render, switchSlot, switchTab, changeDate, moveDate,
    addExtraRow, removeExtraRow, onRowInput, onRowKeydown, uploadExcel, deleteDate,
    clearRow, undo, redo,
    onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, onDragEnd,
  };
})();
