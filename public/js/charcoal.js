const Charcoal = (() => {
  const TIMESLOTS = ['11', '15', '19'];
  const TS_LABEL  = { '11': '11시', '15': '15시', '19': '19시' };

  function kstToday() {
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const p = n => String(n).padStart(2,'0');
    return `${kst.getFullYear()}-${p(kst.getMonth()+1)}-${p(kst.getDate())}`;
  }

  let date       = kstToday();
  let slotData   = {};
  let activeSlot = '11';

  const charKey = d => `charcoal_${d}`;
  const getChar = d => { try { return JSON.parse(localStorage.getItem(charKey(d)) || '{}'); } catch { return {}; } };

  function charcoalCount(row) {
    const p = (row.product || '').replace(/\s/g, '');
    if (p.includes('단체30')) return 3;
    if (p.includes('단체20')) return 2;
    if (row.bulmung) return 1;
    return 0;
  }

  // 탭: 없음→주문→나감→초기화 (타임슬롯 독립)
  function tapCell(timeslot, tentNo) {
    const data = getChar(date);
    if (!data[timeslot]) data[timeslot] = {};
    const cur = data[timeslot][tentNo];
    if (!cur) {
      const maxSeq = Object.values(data).flatMap(ts => Object.values(ts)).reduce((m,v) => Math.max(m, v.seq||0), 0);
      data[timeslot][tentNo] = { status: 1, seq: maxSeq + 1 };
    } else if (cur.status === 1) {
      data[timeslot][tentNo] = { ...cur, status: 2 };
    } else {
      delete data[timeslot][tentNo];
    }
    localStorage.setItem(charKey(date), JSON.stringify(data));
    renderPanel();
  }

  function allRowsOf(ts) {
    const d = slotData[ts] || {};
    return [...(d.tent4||[]), ...(d.tent2||[]), ...(d.tent8||[])];
  }

  function switchSlot(ts) { activeSlot = ts; renderPanel(); }

  function moveDate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    const p = n => String(n).padStart(2,'0');
    date = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    loadData();
  }

  function goToday() { date = kstToday(); loadData(); }

  function openDatePicker() {
    const inp = document.getElementById('char-date-input');
    if (inp) { inp.value = date; inp.showPicker ? inp.showPicker() : inp.click(); }
  }

  function setDate(val) {
    if (val) { date = val; loadData(); }
  }

  function renderDateHeader() {
    const [y, m, d] = date.split('-');
    const dayName = ['일','월','화','수','목','금','토'][new Date(date).getDay()];
    const isToday = date === kstToday();
    const el = document.getElementById('char-date-header');
    if (el) el.innerHTML = `
      <div onclick="Charcoal.openDatePicker()"
        style="font-size:16px;font-weight:700;color:#1e293b;cursor:pointer;text-decoration:underline dotted #94a3b8;user-select:none">
        ${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${dayName})
      </div>
      ${isToday ? '<div style="font-size:11px;color:#16a34a;font-weight:600">오늘</div>' : ''}`;
    const btn = document.getElementById('char-today-btn');
    if (btn) btn.style.display = isToday ? 'none' : '';
  }

  async function loadData() {
    renderDateHeader();
    const el = document.getElementById('char-panel');
    if (el) el.innerHTML = '<div style="padding:24px;color:#94a3b8;text-align:center">불러오는 중...</div>';
    slotData = {};
    await Promise.all(TIMESLOTS.map(async ts => {
      try { slotData[ts] = (await API.get(`/api/checklist/${date}/${ts}`)) || {}; }
      catch { slotData[ts] = {}; }
    }));
    renderPanel();
  }

  function renderPanel() {
    const charAll = getChar(date);
    const charTs  = charAll[activeSlot] || {};
    const d       = slotData[activeSlot] || {};

    // 전타임1시간 맵
    const prevTs = TIMESLOTS[TIMESLOTS.indexOf(activeSlot) - 1];
    const prevExtraMap = {};
    if (prevTs) {
      [...(slotData[prevTs]?.tent4||[]), ...(slotData[prevTs]?.tent2||[]), ...(slotData[prevTs]?.tent8||[])].forEach(r => {
        if (r.extra_hour) prevExtraMap[r.tent_no] = r.extra_hour;
      });
    }

    // 요약 계산
    const allRows      = allRowsOf(activeSlot);
    const extraNos     = allRows.filter(r => r.name && r.extra_hour).map(r => r.tent_no);
    const prevExtraNos = allRows.filter(r => r.name && prevExtraMap[r.tent_no]).map(r => r.tent_no);
    const extendTarget = activeSlot === '11' ? '15' : activeSlot === '15' ? '19' : null;
    const extendNos    = extendTarget
      ? allRows.filter(r => r.name && r.two_time && String(r.two_time).includes(extendTarget)).map(r => r.tent_no)
      : [];
    const bulmungCount = allRows.filter(r => r.name && r.bulmung).length;

    // 주문/나감 통계 (현재 탭만)
    const ordered   = Object.values(charTs).filter(v => v.status === 1).length;
    const delivered = Object.values(charTs).filter(v => v.status === 2).length;

    // 테이블 행 생성
    function tentRow(r) {
      const cs  = charTs[r.tent_no];
      const cnt = charcoalCount(r);
      const hasBulmung = cnt > 0;
      const bg     = hasBulmung ? '#fff7ed' : '#fff';
      const border = hasBulmung ? '2px solid #f97316' : '1px solid #e2e8f0';
      const prevExtra = prevExtraMap[r.tent_no] || '';

      let badge = '';
      if (cs) {
        const color = cs.status === 1 ? '#2563eb' : '#16a34a';
        const label = cs.status === 1 ? '주문' : '나감';
        const cntTxt = cnt > 1 ? `×${cnt}` : '';
        badge = `<span style="display:inline-block;background:${color};color:#fff;border-radius:4px;
                   font-size:10px;font-weight:700;padding:1px 5px;margin-left:4px;white-space:nowrap">${cs.seq} ${label}${cntTxt}</span>`;
      }
      const charcoalHint = cnt > 1
        ? `<span style="font-size:9px;color:#dc2626;font-weight:700;margin-left:3px">(숯${cnt})</span>` : '';

      return `<tr onclick="Charcoal.tapCell('${activeSlot}','${r.tent_no}')"
        style="cursor:pointer;background:${bg};border-bottom:${border}">
        <td style="padding:4px 3px;font-size:11px;font-weight:700;color:#1d4ed8;text-align:center">${r.tent_no}</td>
        <td style="padding:4px 3px;font-size:12px;font-weight:600;color:#1e293b;word-break:break-word">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px">
            <span>${r.name || ''}${hasBulmung?'🔥':''}</span>${charcoalHint}${badge}
          </div>
        </td>
        <td style="padding:4px 3px;font-size:11px;color:#374151;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.bulmung||''}</td>
        <td style="padding:4px 3px;font-size:11px;color:#374151;text-align:center">${r.reserved||''}</td>
        <td style="padding:4px 3px;font-size:11px;color:#374151;text-align:center">${r.two_time||''}</td>
        <td style="padding:4px 3px;font-size:11px;color:#374151;text-align:center">${r.extra_hour||''}</td>
        <td style="padding:4px 3px;font-size:11px;color:#374151;text-align:center">${prevExtra}</td>
        <td style="padding:4px 3px;font-size:11px;color:#374151;text-align:center;word-break:break-all">${r.car||''}</td>
        <td style="padding:4px 3px;font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.memo||''}</td>
      </tr>`;
    }

    // 선만 있는 구분행
    const divRow = `<tr><td colspan="9" style="padding:0;height:3px;background:#e2e8f0;border:none"></td></tr>`;

    // tent8: G와 H 사이 구분
    function buildT8Rows(tent8) {
      const named = tent8.filter(r => r.name && r.tent_no !== '티켓');
      const beforeH = named.filter(r => ['A','B','C','D','E','F','G'].includes(r.tent_no));
      const afterH  = named.filter(r => !['A','B','C','D','E','F','G'].includes(r.tent_no));
      const rows = [];
      if (beforeH.length) rows.push(...beforeH.map(tentRow));
      if (beforeH.length && afterH.length) rows.push(divRow);
      if (afterH.length) rows.push(...afterH.map(tentRow));
      return rows.join('');
    }

    const t4 = (d.tent4 || []).filter(r => r.name);
    const t2 = (d.tent2 || []).filter(r => r.name);
    const t8 = d.tent8 || [];
    const hasAny = t4.length || t2.length || t8.some(r => r.name && r.tent_no !== '티켓');

    const tableHTML = hasAny ? `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed">
          <colgroup>
            <col style="width:24px">
            <col style="width:130px">
            <col style="width:36px">
            <col style="width:24px">
            <col style="width:40px">
            <col style="width:28px">
            <col style="width:38px">
            <col style="width:250px">
            <col>
          </colgroup>
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">번호</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:left">이름</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">불멍</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">예약</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">2타임</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">1시간+</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">전타임1시간</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:center">차량</th>
              <th style="padding:5px 3px;font-size:10px;color:#64748b;text-align:left">메모</th>
            </tr>
          </thead>
          <tbody>
            ${t4.length ? t4.map(tentRow).join('') : ''}
            ${t4.length && (t2.length || t8.some(r=>r.name&&r.tent_no!=='티켓')) ? divRow : ''}
            ${t2.length ? t2.map(tentRow).join('') : ''}
            ${t2.length && t8.some(r=>r.name&&r.tent_no!=='티켓') ? divRow : ''}
            ${buildT8Rows(t8)}
          </tbody>
        </table>
      </div>` : '<div style="color:#94a3b8;font-size:14px;padding:24px;text-align:center">이 타임에 데이터가 없습니다</div>';

    const el = document.getElementById('char-panel');
    if (!el) return;
    el.innerHTML = `
      <!-- 요약 (항상 표시) -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
        <div style="padding:4px 10px;background:#fff7ed;border:1px solid #f97316;border-radius:6px;font-size:12px;font-weight:700;color:#c2410c">🔥 불멍 ${bulmungCount || '-'}</div>
        <div style="padding:4px 10px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:12px;font-weight:700;color:#854d0e">전타임1시간 ${prevExtraNos.join(' ') || '-'}</div>
        <div style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;font-size:12px;font-weight:700;color:#dc2626">1시간추가 ${extraNos.join(' ') || '-'}</div>
        <div style="padding:4px 10px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;font-size:12px;font-weight:700;color:#1d4ed8">연장텐트 ${extendNos.join(' ') || '-'}</div>
      </div>
      <!-- 주문/나감 + 타임 탭 -->
      <div style="display:flex;align-items:center;gap:0;margin-bottom:10px;border-bottom:2px solid #e2e8f0">
        ${TIMESLOTS.map(ts => {
          const tc = charAll[ts] || {};
          const cnt = Object.keys(tc).length;
          const isActive = ts === activeSlot;
          return `<button onclick="Charcoal.switchSlot('${ts}')"
            style="padding:8px 14px;border:none;border-bottom:3px solid ${isActive?'#1d4ed8':'transparent'};
                   background:transparent;font-size:13px;font-weight:${isActive?700:500};
                   color:${isActive?'#1d4ed8':'#64748b'};cursor:pointer">
            ${TS_LABEL[ts]}${cnt?` <span style="font-size:10px;background:#f1f5f9;border-radius:8px;padding:1px 5px">${cnt}</span>`:''}
          </button>`;
        }).join('')}
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;padding-right:4px">
          <span style="font-size:11px;padding:2px 7px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:600">주문 ${ordered}</span>
          <span style="font-size:11px;padding:2px 7px;background:#dcfce7;color:#16a34a;border-radius:4px;font-weight:600">나감 ${delivered}</span>
          <span style="font-size:11px;color:#94a3b8">1탭=주문 · 2탭=나감 · 3탭=초기화</span>
        </div>
      </div>
      ${tableHTML}`;
  }

  async function render() {
    document.getElementById('content').innerHTML = `
      <div style="padding:16px;max-width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <button onclick="Charcoal.moveDate(-1)"
            style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">◀</button>
          <div id="char-date-header" style="text-align:center;min-width:150px"></div>
          <button onclick="Charcoal.moveDate(1)"
            style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">▶</button>
          <button id="char-today-btn" onclick="Charcoal.goToday()"
            style="padding:6px 10px;border:1px solid #22c55e;border-radius:6px;background:#f0fdf4;color:#16a34a;font-size:12px;font-weight:600;cursor:pointer;display:none">오늘</button>
          <input type="date" id="char-date-input"
            style="position:absolute;opacity:0;pointer-events:none;width:0;height:0"
            onchange="Charcoal.setDate(this.value)">
        </div>
        <div id="char-panel"><div style="padding:24px;color:#94a3b8;text-align:center">불러오는 중...</div></div>
      </div>`;
    await loadData();
  }

  return { render, tapCell, switchSlot, moveDate, goToday, openDatePicker, setDate };
})();
