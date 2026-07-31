const Charcoal = (() => {
  const HOURS    = ['10','11','12','13','14','15','16','17','18','19','20','21'];
  const NUMBERED = ['0','1','2','3','4','5','6','7','8','9','10','11'];
  const LETTERED = ['A','B','C','D','E','F','G','H','J','K','P','S'];

  function kstToday() {
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const p = n => String(n).padStart(2,'0');
    return `${kst.getFullYear()}-${p(kst.getMonth()+1)}-${p(kst.getDate())}`;
  }

  let date = kstToday();

  const wdKey    = d => `cl_weekday_${d}`;
  const colorKey = d => `cl_weekday_colors_${d}`;
  const charKey  = d => `charcoal_${d}`;
  const getWd    = d => { try { return JSON.parse(localStorage.getItem(wdKey(d))    || '{}'); } catch { return {}; } };
  const getColor = d => { try { return JSON.parse(localStorage.getItem(colorKey(d)) || '{}'); } catch { return {}; } };
  const getChar  = d => { try { return JSON.parse(localStorage.getItem(charKey(d))  || '{}'); } catch { return {}; } };

  // 터치: 없음→주문→나감→초기화
  function tapCell(tent, hour) {
    const data = getChar(date);
    const key = `${tent}_${hour}`;
    const cur = data[key];
    if (!cur) {
      const maxSeq = Object.values(data).reduce((m, v) => Math.max(m, v.seq || 0), 0);
      data[key] = { status: 1, seq: maxSeq + 1 };
    } else if (cur.status === 1) {
      data[key] = { ...cur, status: 2 };
    } else {
      delete data[key];
    }
    localStorage.setItem(charKey(date), JSON.stringify(data));
    const grid = document.getElementById('char-grid');
    if (grid) grid.innerHTML = renderGrid();
  }

  function moveDate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    const p = n => String(n).padStart(2,'0');
    date = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    render();
  }

  function goToday() {
    date = kstToday();
    render();
  }

  function renderGrid() {
    const wd    = getWd(date);
    const colors = getColor(date);
    const char  = getChar(date);

    const noStyle  = 'width:28px;min-width:28px;padding:0 4px;font-size:12px;font-weight:700;text-align:center;white-space:nowrap;';
    const hdrStyle = 'font-size:11px;font-weight:700;color:#64748b;text-align:center;padding:5px 0;border-bottom:2px solid #e2e8f0;';

    const hdrRow = `<tr>
      <th style="${noStyle}border-bottom:2px solid #e2e8f0"></th>
      ${HOURS.map(h => `<th style="${hdrStyle}">${h}</th>`).join('')}
    </tr>`;

    function tentRow(tent, nameColor) {
      // 커버리지 맵
      const blockOf = {};
      for (let hi = 0; hi < HOURS.length; hi++) {
        const entry = wd[tent]?.[HOURS[hi]];
        if (entry?.content) {
          const span = Math.min(4, HOURS.length - hi);
          for (let s = 0; s < span; s++) blockOf[hi + s] = HOURS[hi];
        }
      }

      let cells = '';
      for (let hi = 0; hi < HOURS.length; hi++) {
        const hour = HOURS[hi];
        const blockStart = blockOf[hi];
        const isStart    = blockStart === hour;
        const charState  = char[`${tent}_${hour}`];

        if (blockStart !== undefined) {
          const content    = wd[tent][blockStart].content;
          const bg         = colors[content] || '#fde68a';
          const hasBulmung = content.includes('불멍');
          const border     = hasBulmung ? '2px solid #f97316' : '1px solid #d1d5db';

          if (isStart) {
            const span = Math.min(4, HOURS.length - hi);
            cells += `<td onclick="Charcoal.tapCell('${tent}','${hour}')"
              style="position:relative;border:${border};cursor:pointer;background:${bg};height:32px;padding:0;overflow:visible">
              ${hasBulmung ? '<span style="position:absolute;top:1px;left:2px;font-size:10px;z-index:15;line-height:1;pointer-events:none">🔥</span>' : ''}
              <div style="position:absolute;top:0;left:0;height:100%;width:calc(${span}*100%);
                          display:flex;align-items:center;padding:2px ${hasBulmung?'4px 2px 16px':'5px'};box-sizing:border-box;
                          font-size:11px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;
                          pointer-events:none;z-index:10">${content}</div>
              ${charState ? charBadge(charState) : ''}
            </td>`;
          } else {
            // 덮인 칸: 탭은 blockStart 기준
            cells += `<td onclick="Charcoal.tapCell('${tent}','${blockStart}')"
              style="border:${border};cursor:pointer;background:${bg};height:32px"></td>`;
          }
        } else {
          // 빈 칸
          cells += `<td onclick="Charcoal.tapCell('${tent}','${hour}')"
            style="position:relative;border:1px solid #e2e8f0;cursor:pointer;background:#fff;height:32px">
            ${charState ? emptyBadge(charState) : ''}
          </td>`;
        }
      }
      return `<tr><td style="${noStyle}color:${nameColor}">${tent}</td>${cells}</tr>`;
    }

    function charBadge(cs) {
      const color = cs.status === 1 ? '#2563eb' : '#16a34a';
      const label = cs.status === 1 ? '주문' : '나감';
      return `<div style="position:absolute;top:2px;right:2px;background:${color};color:#fff;
                border-radius:4px;font-size:9px;font-weight:700;padding:0 4px;line-height:16px;z-index:20;
                pointer-events:none">${cs.seq} ${label}</div>`;
    }

    function emptyBadge(cs) {
      const color = cs.status === 1 ? '#2563eb' : '#16a34a';
      const label = cs.status === 1 ? '주문' : '나감';
      return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
               background:${color}22;font-size:10px;font-weight:700;color:${color};pointer-events:none">
               ${cs.seq} ${label}</div>`;
    }

    const numberedRows = NUMBERED.map(t => tentRow(t, '#1d4ed8')).join('');
    const sep          = `<tr><td colspan="${HOURS.length+1}" style="height:8px;background:#f8fafc;border:none"></td></tr>`;
    const letteredRows = LETTERED.map(t => tentRow(t, '#15803d')).join('');

    const ordered   = Object.values(char).filter(v => v.status === 1).length;
    const delivered = Object.values(char).filter(v => v.status === 2).length;

    return `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <span style="font-size:12px;color:#f97316;font-weight:600">🔥 불멍</span>
        <span style="font-size:12px;padding:2px 8px;background:#dbeafe;color:#1d4ed8;border-radius:4px;font-weight:600">주문 ${ordered}건</span>
        <span style="font-size:12px;padding:2px 8px;background:#dcfce7;color:#16a34a;border-radius:4px;font-weight:600">나감 ${delivered}건</span>
        <span style="font-size:12px;color:#94a3b8">1탭=주문 · 2탭=나감 · 3탭=초기화</span>
      </div>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;table-layout:fixed;width:100%">
          <colgroup>
            <col style="width:28px">
            ${HOURS.map(() => '<col>').join('')}
          </colgroup>
          <thead>${hdrRow}</thead>
          <tbody>${numberedRows}${sep}${letteredRows}</tbody>
        </table>
      </div>`;
  }

  function render() {
    const today = kstToday();
    const [y, m, d] = date.split('-');
    const dayName = ['일','월','화','수','목','금','토'][new Date(date).getDay()];
    const isToday = date === today;

    // 인원체크리스트와 같은 날짜 데이터 표시
    const hasData = Object.keys(getWd(date)).length > 0;

    document.getElementById('content').innerHTML = `
      <div style="padding:16px;max-width:100%">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <button onclick="Charcoal.moveDate(-1)"
            style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">◀</button>
          <div style="text-align:center;min-width:150px">
            <div style="font-size:16px;font-weight:700;color:#1e293b">${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${dayName})</div>
            ${isToday ? '<div style="font-size:11px;color:#16a34a;font-weight:600">오늘</div>' : ''}
          </div>
          <button onclick="Charcoal.moveDate(1)"
            style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;font-size:14px">▶</button>
          ${!isToday ? `<button onclick="Charcoal.goToday()"
            style="padding:6px 10px;border:1px solid #22c55e;border-radius:6px;background:#f0fdf4;color:#16a34a;font-size:12px;font-weight:600;cursor:pointer">오늘</button>` : ''}
        </div>
        <div id="char-grid">
          ${hasData ? renderGrid() : '<div style="color:#94a3b8;font-size:14px;padding:24px 0;text-align:center">이 날짜의 인원체크리스트 데이터가 없습니다.<br>인원체크리스트 메뉴에서 평일ver.로 입력해주세요.</div>'}
        </div>
      </div>`;
  }

  return { render, tapCell, moveDate, goToday };
})();
