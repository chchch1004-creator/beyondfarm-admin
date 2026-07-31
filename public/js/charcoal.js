const Charcoal = (() => {
  const TIMESLOTS = ['11', '15', '19'];
  const TIMESLOT_LABELS = { '11': '11시', '15': '15시', '19': '19시' };

  function kstToday() {
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const p = n => String(n).padStart(2,'0');
    return `${kst.getFullYear()}-${p(kst.getMonth()+1)}-${p(kst.getDate())}`;
  }

  let date = kstToday();
  let slotData = {}; // { '11': {...}, '15': {...}, '19': {...} }
  let activeSlot = '11';
  let loading = false;

  const charKey = d => `charcoal_${d}`;
  const getChar = d => { try { return JSON.parse(localStorage.getItem(charKey(d)) || '{}'); } catch { return {}; } };

  // 숯 탭: 없음→주문→나감→초기화
  function tapCell(timeslot, tentNo) {
    const data = getChar(date);
    if (!data[timeslot]) data[timeslot] = {};
    const cur = data[timeslot][tentNo];
    if (!cur) {
      // 전체 순번 계산
      const allSeqs = Object.values(data).flatMap(ts => Object.values(ts)).map(v => v.seq || 0);
      const maxSeq = allSeqs.length ? Math.max(...allSeqs) : 0;
      data[timeslot][tentNo] = { status: 1, seq: maxSeq + 1 };
    } else if (cur.status === 1) {
      data[timeslot][tentNo] = { ...cur, status: 2 };
    } else {
      delete data[timeslot][tentNo];
    }
    localStorage.setItem(charKey(date), JSON.stringify(data));
    renderPanel();
  }

  function switchSlot(ts) {
    activeSlot = ts;
    renderPanel();
  }

  function moveDate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    const p = n => String(n).padStart(2,'0');
    date = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    loadData();
  }

  function goToday() {
    date = kstToday();
    loadData();
  }

  function renderDateHeader() {
    const today = kstToday();
    const [y, m, d] = date.split('-');
    const dayName = ['일','월','화','수','목','금','토'][new Date(date).getDay()];
    const isToday = date === today;
    const el = document.getElementById('char-date-header');
    if (!el) return;
    el.innerHTML = `
      <div style="font-size:16px;font-weight:700;color:#1e293b">${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${dayName})</div>
      ${isToday ? '<div style="font-size:11px;color:#16a34a;font-weight:600">오늘</div>' : ''}`;
    const todayBtn = document.getElementById('char-today-btn');
    if (todayBtn) todayBtn.style.display = isToday ? 'none' : '';
  }

  async function loadData() {
    renderDateHeader();
    const el = document.getElementById('char-panel');
    if (el) el.innerHTML = '<div style="padding:24px;color:#94a3b8;text-align:center">불러오는 중...</div>';
    slotData = {};
    await Promise.all(TIMESLOTS.map(async ts => {
      try {
        const d = await API.get(`/api/checklist/${date}/${ts}`);
        slotData[ts] = d || {};
      } catch { slotData[ts] = {}; }
    }));
    renderPanel();
  }

  function renderPanel() {
    const charAll = getChar(date);
    const charTs  = charAll[activeSlot] || {};
    const d       = slotData[activeSlot] || {};
    const allRows = [
      ...(d.tent4 || []),
      ...(d.tent2 || []),
      ...(d.tent8 || []),
      ...(d.extra || []),
    ];

    // 불멍 있는 행만 먼저, 없는 행은 뒤에
    const withBulmung = allRows.filter(r => r.name && r.bulmung);
    const others      = allRows.filter(r => r.name && !r.bulmung);
    const empty       = allRows.filter(r => !r.name);

    // 전체 주문/나감 카운트 (전 타임슬롯 합산)
    let totalOrdered = 0, totalDelivered = 0;
    for (const ts of TIMESLOTS) {
      const ts_char = charAll[ts] || {};
      totalOrdered   += Object.values(ts_char).filter(v => v.status === 1).length;
      totalDelivered += Object.values(ts_char).filter(v => v.status === 2).length;
    }

    function tentRow(r) {
      const cs = charTs[r.tent_no];
      const hasBulmung = !!r.bulmung;
      const rowBg = hasBulmung ? '#fff7ed' : '#fff';
      const border = hasBulmung ? '2px solid #f97316' : '1px solid #e2e8f0';

      let charBadge = '';
      if (cs) {
        const color = cs.status === 1 ? '#2563eb' : '#16a34a';
        const label = cs.status === 1 ? '주문' : '나감';
        charBadge = `<span style="margin-left:6px;background:${color};color:#fff;border-radius:4px;
                       font-size:10px;font-weight:700;padding:1px 6px">${cs.seq} ${label}</span>`;
      }

      return `<tr onclick="Charcoal.tapCell('${activeSlot}','${r.tent_no}')"
        style="cursor:pointer;background:${rowBg};border-bottom:${border}">
        <td style="padding:8px 6px;font-size:12px;font-weight:700;color:#1d4ed8;text-align:center;width:32px">${r.tent_no}</td>
        <td style="padding:8px 6px;font-size:13px;font-weight:600;color:#1e293b">
          ${r.name || ''}
          ${hasBulmung ? '<span style="margin-left:4px;font-size:11px">🔥</span>' : ''}
          ${charBadge}
        </td>
        <td style="padding:8px 6px;font-size:12px;color:#64748b">${r.bulmung || ''}</td>
        <td style="padding:8px 6px;font-size:12px;color:#64748b">${r.play || ''}</td>
        <td style="padding:8px 6px;font-size:12px;color:#64748b">${r.memo || ''}</td>
      </tr>`;
    }

    const hasAny = allRows.some(r => r.name);

    const tableHTML = hasAny ? `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
            <th style="padding:6px;font-size:11px;color:#64748b;text-align:center;width:32px">번호</th>
            <th style="padding:6px;font-size:11px;color:#64748b;text-align:left">이름</th>
            <th style="padding:6px;font-size:11px;color:#64748b;text-align:left">불멍</th>
            <th style="padding:6px;font-size:11px;color:#64748b;text-align:left">놀이</th>
            <th style="padding:6px;font-size:11px;color:#64748b;text-align:left">메모</th>
          </tr>
        </thead>
        <tbody>
          ${withBulmung.map(tentRow).join('')}
          ${withBulmung.length && others.length ? '<tr><td colspan="5" style="height:6px;background:#f8fafc"></td></tr>' : ''}
          ${others.map(tentRow).join('')}
        </tbody>
      </table>` : '<div style="color:#94a3b8;font-size:14px;padding:24px;text-align:center">이 타임에 데이터가 없습니다</div>';

    const el = document.getElementById('char-panel');
    if (!el) return;

    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <span style="font-size:12px;color:#f97316;font-weight:600">🔥 불멍</span>
        <span style="font-size:12px;padding:2px 8px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:600">주문 ${totalOrdered}건</span>
        <span style="font-size:12px;padding:2px 8px;background:#dcfce7;color:#16a34a;border-radius:4px;font-weight:600">나감 ${totalDelivered}건</span>
        <span style="font-size:12px;color:#94a3b8">1탭=주문 · 2탭=나감 · 3탭=초기화</span>
      </div>
      <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid #e2e8f0">
        ${TIMESLOTS.map(ts => {
          const tsChar = charAll[ts] || {};
          const cnt = Object.keys(tsChar).length;
          const isActive = ts === activeSlot;
          return `<button onclick="Charcoal.switchSlot('${ts}')"
            style="padding:8px 16px;border:none;border-bottom:3px solid ${isActive?'#1d4ed8':'transparent'};
                   background:transparent;font-size:13px;font-weight:${isActive?700:500};
                   color:${isActive?'#1d4ed8':'#64748b'};cursor:pointer">
            ${TIMESLOT_LABELS[ts]}${cnt ? ` <span style="font-size:10px;background:#f1f5f9;border-radius:8px;padding:1px 5px">${cnt}</span>` : ''}
          </button>`;
        }).join('')}
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
        </div>
        <div id="char-panel"><div style="padding:24px;color:#94a3b8;text-align:center">불러오는 중...</div></div>
      </div>`;

    await loadData();
  }

  return { render, tapCell, switchSlot, moveDate, goToday };
})();
