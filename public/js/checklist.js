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
    { key: 'reserved',     label: '예약인원',   w: 34 },
    { key: 'actual',       label: '입장인원',   w: 34 },
    { key: 'two_time',     label: '2타임여부',  w: 38 },
    { key: 'play',         label: '플레이',     w: 28 },
    { key: 'child_pool',   label: '아이풀장',   w: 30 },
    { key: 'adult_pool',   label: '성인풀장',   w: 30 },
    { key: 'bulmung',      label: '불멍',       w: 24 },
    { key: 'adult_only',   label: '성인만',     w: 34 },
    { key: 'extra_hour',      label: '1시간추가',  w: 40 },
    { key: 'prev_extra_hour', label: '전타임1시간', w: 50, readOnly: true },
    { key: 'car',             label: '차량',       w: 70 },
    { key: 'memo',         label: '비고',       w: 256 },
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
             two_time:'', play:'', child_pool:'', adult_pool:'', bulmung:'', adult_only:'', extra_hour:'', prev_extra_hour:'', car:'', memo:'' };
  }

  function getCurrentData() {
    return state.data[state.timeslot] || emptyTimeslot();
  }

  // ── 전타임 1시간추가 맵 ──
  function getPrevExtraHourMap() {
    const order = ['11', '15', '19'];
    const i = order.indexOf(state.timeslot);
    if (i <= 0) return {};
    const prev = state.data[order[i - 1]];
    if (!prev) return {};
    const map = {};
    [...(prev.tent4||[]), ...(prev.tent2||[]), ...(prev.tent8||[])].forEach(r => {
      if (r.extra_hour) map[r.tent_no] = r.extra_hour;
    });
    return map;
  }

  function injectPrevExtraHour(d) {
    const map = getPrevExtraHourMap();
    ['tent4','tent2','tent8'].forEach(sec => {
      (d[sec]||[]).forEach(row => { row.prev_extra_hour = map[row.tent_no] || ''; });
    });
  }

  // ── 요약 자동계산 ──
  function recalcSummary(d, timeslot) {
    const allRows = [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[]), ...(d.extra||[])];
    const num = v => parseInt(v) || 0;
    let bulmung=0, play=0, child=0, adult=0, cntS=0, cntM=0, cntL=0, cnt20=0, cnt30=0;
    const extraHourNos = [];
    const prevExtraHourNos = [];
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
      if (r.prev_extra_hour) prevExtraHourNos.push(r.tent_no);
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
    d.summary.prev_extra_hour_nos = prevExtraHourNos.join(' ') || '';
    d.summary.extra_hour_nos      = extraHourNos.join(' ') || '';
    d.summary.extend_nos          = extendNos.join(' ') || '';
  }

  function pushSummaryToDOM(s) {
    ['bulmung_count','play_count','child_pool','adult_pool','total_pool',
     'tent2','tent4','tent8','group20','group30','total',
     'prev_extra_hour_nos','extra_hour_nos','extend_nos'].forEach(k => {
      const el = document.getElementById(`cl-sum-${k}`);
      if (el) el.textContent = s[k] || '-';
    });
  }

  // ── 무음 자동저장 ──
  function _doSave(date, ts) {
    return API.put(`/api/checklist/${date}/${ts}`, state.data[ts] || emptyTimeslot())
      .then(() => { if (!state.dates.includes(date)) state.dates.unshift(date); })
      .catch(() => {});
  }
  function silentSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => _doSave(state.date, state.timeslot), 800);
  }
  // 즉시 저장 (날짜/탭 전환 전에 호출)
  async function flushSave() {
    if (_saveTimer === null) return;
    clearTimeout(_saveTimer);
    _saveTimer = null;
    await _doSave(state.date, state.timeslot);
  }

  // ── 변경 로그 ──
  let _logTimer = null;
  const _pendingLogs = [];
  function sendLog(entry) {
    _pendingLogs.push({ ...entry, date: state.date, timeslot: state.timeslot });
    clearTimeout(_logTimer);
    _logTimer = setTimeout(() => {
      const batch = _pendingLogs.splice(0);
      batch.forEach(e => API.post('/api/checklist/log', e).catch(() => {}));
    }, 1000);
  }
  async function flushLogs() {
    clearTimeout(_logTimer);
    _logTimer = null;
    const batch = _pendingLogs.splice(0);
    await Promise.all(batch.map(e => API.post('/api/checklist/log', e).catch(() => {})));
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
          ${window.innerWidth < 700 ? `
          <div style="width:100%;display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
            <button onclick="Checklist.undo()" title="Ctrl+Z"
              style="flex:1;padding:5px 4px;border:1px solid #64748b;border-radius:6px;background:#f8fafc;
                     color:#374151;font-size:12px;font-weight:600;cursor:pointer">↩ 되돌리기</button>
            <button onclick="Checklist.redo()" title="Ctrl+Y"
              style="flex:1;padding:5px 4px;border:1px solid #64748b;border-radius:6px;background:#f8fafc;
                     color:#374151;font-size:12px;font-weight:600;cursor:pointer">↪ 앞으로</button>
            <input type="file" id="cl-excel-input" accept=".xlsx,.xls" style="display:none"
              onchange="Checklist.uploadExcel(this)">
            <button onclick="document.getElementById('cl-excel-input').click()"
              style="flex:1;padding:5px 4px;border:1px solid #16a34a;border-radius:6px;background:#f0fdf4;
                     color:#15803d;font-size:12px;font-weight:600;cursor:pointer">📥 예약가져오기</button>
            <button onclick="Checklist.deleteDate()"
              style="flex:0 0 auto;padding:5px 8px;border:1px solid #dc2626;border-radius:6px;background:#fef2f2;
                     color:#dc2626;font-size:12px;font-weight:600;cursor:pointer">🗑</button>
          </div>` : `
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
          </div>`}` : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <div style="position:relative;flex:1;min-width:160px;max-width:320px">
          <input type="text" id="cl-search" placeholder="이름 검색 (예: 공혜경)"
            oninput="Checklist.onSearch(this.value)"
            onkeydown="if(event.key==='Escape'){this.value='';Checklist.onSearch('');}"
            style="width:100%;box-sizing:border-box;padding:6px 32px 6px 10px;border:1px solid #93c5fd;
                   border-radius:6px;font-size:13px;outline:none">
          <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#93c5fd;font-size:14px;pointer-events:none">🔍</span>
        </div>
        <div id="cl-search-result" style="font-size:12px;color:#64748b"></div>
      </div>

      ${renderAnnouncementBar()}

      <div style="display:flex;gap:0;margin-bottom:0">
        ${tabBtn('11','11시')}${tabBtn('15','15시')}${tabBtn('19','19시')}${tabBtnTwoTime()}${tabBtnLog()}
      </div>

      <div id="cl-panel" style="border:1px solid #2563eb;border-top:none;border-radius:0 8px 8px 8px;
           padding:${window.innerWidth<700?'8px 4px':'16px'};background:#fff;overflow-x:auto">
        ${renderPanel()}
      </div>`;
  }

  function renderAnnouncementBar() {
    // 비동기로 서버에서 불러와 채움
    setTimeout(async () => {
      const el = document.getElementById('cl-ann-bar');
      if (!el) return;
      let presets = [];
      try {
        const res = await API.get('/api/user-settings/ann_presets');
        presets = res.value || [];
      } catch {
        try { presets = JSON.parse(localStorage.getItem('ann_presets') || '[]'); } catch {}
      }
      if (!presets.length) { el.style.display = 'none'; return; }
      const isMobile = window.innerWidth < 700;
      el.innerHTML = `
        <span style="font-size:11px;font-weight:600;color:#94a3b8;white-space:nowrap">📢 안내방송</span>
        ${presets.map((p, i) => `
          <button onclick="Checklist.playAnnouncement(${i})"
            style="padding:${isMobile?'5px 10px':'6px 13px'};border:1px solid #fed7aa;border-radius:20px;
                   background:#fff7ed;color:#c2410c;font-size:${isMobile?'11px':'12px'};
                   font-weight:500;cursor:pointer;white-space:nowrap">
            ${p.label}
          </button>`).join('')}`;
      // localStorage 동기화
      localStorage.setItem('ann_presets', JSON.stringify(presets));
    }, 0);
    return `<div id="cl-ann-bar" style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap"></div>`;
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
      style="padding:9px 20px;border:1px solid #2563eb;border-right:none;
      background:${active?'#2563eb':'#fff'};color:${active?'#fff':'#2563eb'};
      cursor:pointer;font-size:13px;font-weight:600;border-radius:0">2타임연속여부</button>`;
  }

  function tabBtnLog() {
    const active = state.tab === 'log';
    return `<button id="cl-tab-log" onclick="Checklist.switchTab('log')"
      style="padding:9px 20px;border:1px solid #2563eb;
      background:${active?'#2563eb':'#fff'};color:${active?'#fff':'#2563eb'};
      cursor:pointer;font-size:13px;font-weight:600;border-radius:0 8px 0 0">변경 로그</button>`;
  }

  function renderPanel() {
    if (state.tab === 'log') return renderLogPanel();
    if (state.tab === 'two_time') return renderTwoTimeTable();
    const isMobile = window.innerWidth < 700;
    return isMobile ? renderSlotMobile(getCurrentData(), state.editable) : renderSlot(getCurrentData(), state.editable);
  }

  /* ── 모바일 컴팩트 테이블 ── */
  function renderSlotMobile(d, E) {
    injectPrevExtraHour(d);
    recalcSummary(d, state.timeslot);
    const s = d.summary || {};

    // 요약 두 줄
    const sumItems1 = [
      ['불멍','bulmung_count'],['플레이','play_count'],['아이풀','child_pool'],
      ['성인풀','adult_pool'],['풀합계','total_pool'],['S','tent2'],['M','tent4'],
      ['L','tent8'],['단체20','group20'],['단체30','group30'],['합계','total'],
    ];
    const sumBox = (label, key, color='#1e40af', bg='#fff', border='#d1d5db') => `
      <div style="flex:0 0 auto;text-align:center;min-width:34px">
        <div style="font-size:9px;color:#555;font-weight:600;white-space:nowrap">${label}</div>
        <div id="cl-sum-${key}" style="padding:2px 3px;background:${bg};border:1px solid ${border};border-radius:3px;font-size:12px;font-weight:700;color:${color}">${s[key]||'-'}</div>
      </div>`;
    const summaryHtml = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 4px;margin-bottom:8px">
        <!-- 1줄: 인원/텐트 요약 -->
        <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;align-items:flex-end">
          ${sumItems1.map(([label,key])=>sumBox(label,key)).join('')}
        </div>
        <!-- 2줄: 전타임1시간·1시간추가·연장텐트 -->
        <div style="display:flex;gap:4px;margin-top:4px;border-top:1px solid #bfdbfe;padding-top:4px">
          <div style="flex:1;min-width:0">
            <div style="font-size:9px;color:#ea580c;font-weight:600;white-space:nowrap">전타임1시간</div>
            <div id="cl-sum-prev_extra_hour_nos" style="padding:2px 4px;background:#fff7ed;border:1px solid #fed7aa;border-radius:3px;font-size:11px;font-weight:700;color:#ea580c;word-break:break-all;line-height:1.3">${s.prev_extra_hour_nos||'-'}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:9px;color:#dc2626;font-weight:600;white-space:nowrap">1시간추가</div>
            <div id="cl-sum-extra_hour_nos" style="padding:2px 4px;background:#fef2f2;border:1px solid #fca5a5;border-radius:3px;font-size:11px;font-weight:700;color:#dc2626;word-break:break-all;line-height:1.3">${s.extra_hour_nos||'-'}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:9px;color:#2563eb;font-weight:600;white-space:nowrap">연장텐트</div>
            <div id="cl-sum-extend_nos" style="padding:2px 4px;background:#eff6ff;border:1px solid #93c5fd;border-radius:3px;font-size:11px;font-weight:700;color:#2563eb;word-break:break-all;line-height:1.3">${s.extend_nos||'-'}</div>
          </div>
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
        ['성인만','adult_only'],['1시간추가','extra_hour'],['차량','car'],['비고','memo'],
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
                    onfocus="Checklist.onRowFocus(this)"
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

      const child = parseInt(row.child_pool)||0;
      const adult = parseInt(row.adult_pool)||0;
      const poolText = (child||adult) ? [child?`아이${child}`:'', adult?`성인${adult}`:''].filter(Boolean).join('') : '';
      const td = (content, extra='') =>
        `<td style="padding:2px 1px;text-align:center;font-size:10px;border-bottom:1px solid #e5e7eb;overflow:hidden;${divBorder}${extra}">${content}</td>`;
      const dot = (val, bg) => val ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${bg}"></span>` : '';
      const memoText = row.memo ? String(row.memo).slice(0, 5) + (row.memo.length > 5 ? '…' : '') : '';

      return `<tr style="background:${rowBg};${divBorder}cursor:pointer" onclick="(function(){
          const r=document.getElementById('${expandId}');
          if(!r)return;
          r.style.display=r.style.display==='none'?'table-row':'none';
        })()">
        ${td(row.tent_no, 'font-weight:700;color:#1e40af;white-space:nowrap;')}
        ${td(row.name||'', `font-size:10px;font-weight:600;text-align:left;padding-left:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${nameBg?'background:'+nameBg+';':''}`)}
        ${td(row.reserved||'')}
        ${td(row.actual||'')}
        ${td(row.two_time ? `<span style="background:${two_bg};border-radius:3px;padding:0 2px;font-size:8px;white-space:nowrap">${row.two_time}</span>` : '')}
        ${td(row.play ? `<span style="font-size:9px">${row.play}</span>` : '')}
        ${td(dot(row.bulmung,'#fbbf24'))}
        ${td(dot(row.extra_hour,'#f87171'))}
        ${td(`<span style="font-size:9px;color:#64748b;line-height:1.2">${memoText}</span>`, 'text-align:left;padding-left:1px;')}
      </tr>${detailHtml}`;
    }

    function mobileTable(title, rows, section) {
      const th = (label, align='center', extra='') =>
        `<th style="padding:3px 1px;text-align:${align};white-space:nowrap;font-size:9px;${extra}">${label}</th>`;
      return `<div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:12px;color:#1e40af;padding:3px 0 4px">${title}</div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;word-break:break-all">
          <colgroup>
            <col style="width:17px"><!-- 번호 -->
            <col><!-- 이름: 남은 공간 -->
            <col style="width:18px"><!-- 예약 -->
            <col style="width:18px"><!-- 입장 -->
            <col style="width:24px"><!-- 2타임 -->
            <col style="width:14px"><!-- 플레이 -->
            <col style="width:10px"><!-- 불멍 -->
            <col style="width:10px"><!-- +1h -->
            <col style="width:30px"><!-- 비고 -->
          </colgroup>
          <thead><tr style="background:#1e40af;color:#fff">
            ${th('번')}${th('이름','left')}${th('예')}${th('입')}
            ${th('2타')}${th('플')}${th('불')}${th('+1')}${th('비고','left')}
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
    injectPrevExtraHour(d);
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
            ${sumItem('전타임1시간','prev_extra_hour_nos', 135)}
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
    if (key === 'two_time')        return twoTimeBg(row.two_time);
    if (key === 'name')            return row.actual ? '#bae6fd' : '';
    if (key === 'extra_hour')      return row.extra_hour ? '#fca5a5' : '';
    if (key === 'prev_extra_hour') return row.prev_extra_hour ? '#bbf7d0' : '';
    return '';
  }

  function trHtml(row, idx, section, E, withDel) {
    const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
    // 구분선: M텐트 0|1 사이, 5|6 사이 / L텐트 G(6)|H(7) 사이
    const divider = (
      (section === 'mtent' && (idx === 1 || idx === 6)) ||
      (section === 'tent8' && idx === 7)
    ) ? 'border-top:3px solid #94a3b8;' : '';
    const trDropAttrs = E ? `
      ondragover="Checklist.onDragOver(event)"
      ondragenter="Checklist.onDragEnter(event,'${section}',${idx})"
      ondragleave="Checklist.onDragLeave(event)"
      ondrop="Checklist.onDrop(event,'${section}',${idx})"` : '';
    return `<tr style="background:${bg};${divider}" ${trDropAttrs}>
      ${COLS.map((c, ci) => {
        const val = row[c.key] ?? '';
        const tdBg = cellBg(c.key, row);
        const baseStyle = `border-bottom:1px solid #e5e7eb;${divider}${tdBg?'background:'+tdBg+';':''}`;
        if (ci === 0) {
          const handleAttrs = E ? `draggable="true"
            ondragstart="Checklist.onDragStart(event,'${section}',${idx})"
            ondragend="Checklist.onDragEnd(event)"` : '';
          const handle = E ? `<span ${handleAttrs} style="color:#bbb;font-size:12px;margin-right:2px;vertical-align:middle;cursor:grab;user-select:none;display:inline-block;padding:0 2px">⠿</span>` : '';
          return `<td style="text-align:center;padding:4px 3px;${baseStyle}font-weight:600;color:#374151;">${handle}${val}</td>`;
        }
        if (!E) return `<td style="text-align:center;padding:4px 3px;${baseStyle}">${val}</td>`;
        if (c.readOnly) return `<td style="text-align:center;padding:4px 3px;${baseStyle}font-size:12px;color:#374151;">${val}</td>`;
        return `<td id="td-${section}-${idx}-${c.key}" style="padding:2px 2px;${baseStyle}">
          <input type="text" value="${String(val).replace(/"/g,'&quot;')}"
            data-section="${section}" data-idx="${idx}" data-field="${c.key}"
            onfocus="Checklist.onRowFocus(this)"
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

  /* ── 변경 로그 탭 ── */
  function renderLogPanel() {
    const dateFilter = state.date || '';
    return `<div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <span style="font-weight:700;font-size:14px;color:#1e40af">변경 로그</span>
        <label style="font-size:12px;color:#64748b">날짜 필터:
          <input type="date" id="log-date-filter" value="${dateFilter}"
            style="margin-left:4px;border:1px solid #cbd5e1;border-radius:4px;padding:3px 6px;font-size:12px">
        </label>
        <button onclick="Checklist.loadLog()"
          style="padding:4px 12px;background:#2563eb;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px">조회</button>
        <span style="font-size:11px;color:#94a3b8">최근 200건</span>
      </div>
      <div id="cl-log-body" style="overflow-x:auto">
        <div style="color:#94a3b8;font-size:13px;padding:20px 0;text-align:center">조회 버튼을 눌러 로그를 불러오세요</div>
      </div>
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
    const tr = e.currentTarget.closest('tr');
    if (tr) tr.style.opacity = '0.4';
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
    const srcTentNo = sa[si]?.tent_no ?? '';
    const dstTentNo = da[di]?.tent_no ?? '';
    const srcName = sa[si]?.name || '(빈자리)';
    const dstName = da[di]?.name || '(빈자리)';
    swapData(sa[si], da[di]);
    sendLog({ tent_no: `${srcTentNo}→${dstTentNo}`, field: '', old_value: srcName, new_value: dstName, action: '자리이동' });

    recalcSummary(d, state.timeslot);
    _refreshPanel();
    silentSave();
  }

  function onDragEnd(e) {
    const tr = e.currentTarget.closest('tr');
    if (tr) { tr.style.opacity = ''; tr.style.outline = ''; }
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
    sendLog({ tent_no, field: '', old_value: JSON.stringify(arr[i]), new_value: '', action: 'clear' });
    arr[i] = emptyRow(tent_no);
    recalcSummary(d, state.timeslot);
    _refreshPanel(); silentSave();
  }

  let _histTimer = null;
  const _cellOldVal = new Map(); // 셀 포커스 진입 시 이전 값 저장
  /* ── 이벤트 핸들러 ── */
  function onRowFocus(el) {
    const key = `${el.dataset.section}-${el.dataset.idx}-${el.dataset.field}`;
    if (!_cellOldVal.has(key)) _cellOldVal.set(key, el.value);
  }
  function onRowInput(el) {
    // 입력 중에는 500ms 후 히스토리 저장 (너무 잦은 스냅샷 방지)
    clearTimeout(_histTimer);
    _histTimer = setTimeout(pushHistory, 500);
    // 포커스 진입 시 이전 값 캡처 (oninput이 먼저 올 수도 있으므로 여기서도)
    const cellKey = `${el.dataset.section}-${el.dataset.idx}-${el.dataset.field}`;
    let section = el.dataset.section;
    let idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    const d = getCurrentData();
    if (section === 'mtent') {
      if (idx < 6) { section = 'tent4'; }
      else { section = 'tent2'; idx -= 6; }
    }
    if (d[section]?.[idx] !== undefined) {
      const oldVal = _cellOldVal.has(cellKey) ? _cellOldVal.get(cellKey) : (d[section][idx][field] ?? '');
      if (!_cellOldVal.has(cellKey)) _cellOldVal.set(cellKey, oldVal);
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
      // 로그: 1초 디바운스 후 최종 변경분 전송
      clearTimeout(el._logTimer);
      el._logTimer = setTimeout(() => {
        const newVal = el.value;
        if (newVal !== oldVal) {
          const action = !oldVal ? '입력' : !newVal ? '삭제' : '수정';
          sendLog({
            tent_no: d[section][idx]?.tent_no ?? '',
            field,
            old_value: oldVal,
            new_value: newVal,
            action,
          });
          _cellOldVal.set(cellKey, newVal);
        }
      }, 1000);
    }
  }

  async function switchSlot(ts) {
    await flushSave(); await flushLogs();
    state.tab = 'slot';
    state.timeslot = ts;
    _refreshPanel();
    _refreshTabs();
  }

  async function switchTab(tab) {
    await flushSave(); await flushLogs();
    state.tab = tab;
    _refreshPanel();
    _refreshTabs();
  }

  function _refreshPanel() {
    const el = document.getElementById('cl-panel');
    if (el) el.innerHTML = renderPanel();
    if (_searchQuery) setTimeout(_highlightSearch, 0);
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
    const btnLog = document.getElementById('cl-tab-log');
    if (btnLog) {
      const active = state.tab === 'log';
      btnLog.style.background = active ? '#2563eb' : '#fff';
      btnLog.style.color = active ? '#fff' : '#2563eb';
    }
  }

  async function changeDate() {
    await flushSave(); await flushLogs();
    state.date = document.getElementById('cl-date').value;
    state.tab = 'slot';
    state.timeslot = '11';
    await loadAllSlots();
    renderUI();
  }

  async function moveDate(delta) {
    await flushSave(); await flushLogs();
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

  /* ── 이름 검색 ── */
  let _searchQuery = '';
  function onSearch(q) {
    _searchQuery = q.trim();
    const resultEl = document.getElementById('cl-search-result');

    if (!_searchQuery) {
      if (resultEl) resultEl.innerHTML = '';
      // 하이라이트 전체 제거
      document.querySelectorAll('.cl-search-hi').forEach(el => {
        el.style.background = el.dataset.origBg || '';
        el.classList.remove('cl-search-hi');
      });
      return;
    }

    // 전체 타임에서 이름 검색
    const results = [];
    TIMESLOTS.forEach(ts => {
      const d = state.data[ts];
      if (!d) return;
      const sections = [
        { key: 'tent4', rows: d.tent4||[] },
        { key: 'tent2', rows: d.tent2||[] },
        { key: 'tent8', rows: d.tent8||[] },
        { key: 'extra', rows: d.extra||[] },
      ];
      sections.forEach(({ rows }) => {
        rows.forEach(r => {
          if (r.name && r.name.includes(_searchQuery)) {
            results.push({ ts, tent_no: r.tent_no, name: r.name });
          }
        });
      });
    });

    // 결과 표시
    if (resultEl) {
      if (!results.length) {
        resultEl.innerHTML = `<span style="color:#ef4444">검색 결과 없음</span>`;
      } else {
        resultEl.innerHTML = results.map(r =>
          `<button onclick="Checklist._jumpTo('${r.ts}','${r.tent_no}')"
            style="padding:2px 8px;margin:0 2px;border:1px solid #2563eb;border-radius:4px;
                   background:#eff6ff;color:#1e40af;font-size:12px;cursor:pointer;white-space:nowrap">
            ${r.ts}시 ${r.tent_no} ${r.name}
          </button>`
        ).join('');
      }
    }

    // 현재 탭에서 해당 행 하이라이트
    _highlightSearch();
  }

  function _highlightSearch() {
    // 이전 하이라이트 제거
    document.querySelectorAll('.cl-search-hi').forEach(el => {
      el.style.background = el.dataset.origBg || '';
      el.classList.remove('cl-search-hi');
    });
    if (!_searchQuery) return;
    // 현재 렌더된 input 중 name 필드이고 값이 검색어 포함하면 행 전체 강조
    document.querySelectorAll('input[data-field="name"]').forEach(inp => {
      if (inp.value.includes(_searchQuery)) {
        const tr = inp.closest('tr');
        if (tr) {
          tr.dataset.origBg = tr.style.background || '';
          tr.style.background = '#fef08a';
          tr.classList.add('cl-search-hi');
          // 첫 번째 결과는 스크롤해서 보이게
          if (!document.querySelector('.cl-search-hi-scrolled')) {
            tr.classList.add('cl-search-hi-scrolled');
            tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    });
  }

  async function _jumpTo(ts, tent_no) {
    await switchSlot(ts);
    // 렌더 후 해당 행으로 스크롤
    setTimeout(() => {
      _highlightSearch();
      const hi = document.querySelector('.cl-search-hi');
      if (hi) hi.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  async function loadLog() {
    const dateVal = document.getElementById('log-date-filter')?.value || '';
    const body = document.getElementById('cl-log-body');
    if (!body) return;
    body.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:16px">불러오는 중...</div>';
    try {
      const url = '/api/checklist/log' + (dateVal ? `?date=${dateVal}` : '');
      const rows = await API.get(url);
      if (!rows.length) {
        body.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:16px">로그가 없습니다</div>';
        return;
      }
      const ACTION_LABEL = { '입력':'입력', '수정':'수정', '삭제':'삭제', '한줄삭제':'한줄삭제', '자리이동':'자리이동', clear:'한줄삭제', delete:'타임삭제', upload:'엑셀업로드' };
      body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap">시각</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">아이디</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">날짜</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">타임</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">자리</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">항목</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">구분</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">이전값</th>
          <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0">변경값</th>
        </tr></thead>
        <tbody>${rows.map((r,i) => {
          const bg = i%2===0?'#fff':'#f8fafc';
          const act = ACTION_LABEL[r.action] || r.action;
          const actColor = (r.action==='삭제'||r.action==='한줄삭제'||r.action==='clear')?'#dc2626'
            : r.action==='입력'?'#16a34a'
            : r.action==='자리이동'?'#ea580c'
            : r.action==='upload'?'#7c3aed':'#2563eb';
          return `<tr style="background:${bg}">
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;white-space:nowrap">${r.created_at?.slice(0,16)||''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-weight:600">${r.username||''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9">${r.date||''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9">${r.timeslot?r.timeslot+'시':''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e40af">${r.tent_no||''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9">${r.field||''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;color:${actColor}">${act}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#64748b;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.old_value||'').replace(/"/g,'&quot;')}">${r.old_value||''}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.new_value||'').replace(/"/g,'&quot;')}">${r.new_value||''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    } catch (e) {
      body.innerHTML = `<div style="color:#dc2626;text-align:center;padding:16px">로드 실패: ${e.message}</div>`;
    }
  }

  function playAnnouncement(idx) {
    let presets = [];
    try { presets = JSON.parse(localStorage.getItem('ann_presets') || '[]'); } catch {}
    const p = presets[idx];
    if (!p?.text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(p.text);
    utter.lang = 'ko-KR';
    utter.rate = 0.9;
    utter.volume = 1;
    const voices = synth.getVoices().filter(v => v.lang.startsWith('ko'));
    if (voices.length) utter.voice = voices[0];
    synth.speak(utter);
  }

  return {
    render, switchSlot, switchTab, changeDate, moveDate,
    addExtraRow, removeExtraRow, onRowFocus, onRowInput, onRowKeydown, uploadExcel, deleteDate,
    clearRow, undo, redo, loadLog, onSearch, _jumpTo,
    onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, onDragEnd,
    playAnnouncement,
  };
})();
