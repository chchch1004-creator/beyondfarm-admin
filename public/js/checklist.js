const Checklist = (() => {
  const TIMESLOTS = ['11', '15', '19'];
  const TENT4_ROWS = ['0','1','2','3','4','5'];
  const TENT2_ROWS = ['6','7','8','9','10','11'];
  const TENT8_ROWS = ['A','B','C','D','E','F','G','H','J','K','L','P','S','티켓'];
  const PRODUCTS = ['s','m','L','단체20','단체30','티켓','기타'];

  let state = {
    date: '',
    timeslot: '11',
    data: {},      // { '11': {...}, '15': {...}, '19': {...} }
    editable: false,
    dates: [],
  };

  function emptyTimeslot() {
    return {
      summary: { bulmung_count: '', play_count: '', child_pool: '', adult_pool: '',
                 tent4: '', tent2: '', tent8: '', group20: '', group30: '', total: '' },
      tent4: TENT4_ROWS.map(no => emptyRow(no)),
      tent2: TENT2_ROWS.map(no => emptyRow(no)),
      tent8: TENT8_ROWS.map(no => emptyRow(no)),
      extra: [],
    };
  }

  function emptyRow(tent_no) {
    return { tent_no, product: '', visit_count: '', name: '', reserved: '', actual: '',
             two_time: '', play: '', child_pool: '', adult_pool: '', bulmung: '', adult_only: '', memo: '' };
  }

  function getCurrentData() {
    return state.data[state.timeslot] || emptyTimeslot();
  }

  async function render() {
    state.editable = App.canEdit('checklist');
    const today = new Date().toISOString().slice(0, 10);
    if (!state.date) state.date = today;

    // 날짜 목록 로드
    try {
      state.dates = await API.get('/api/checklist/dates');
    } catch { state.dates = []; }

    // 현재 날짜의 모든 타임슬롯 로드
    await loadAllSlots();

    renderUI();
  }

  async function loadAllSlots() {
    state.data = {};
    await Promise.all(TIMESLOTS.map(async ts => {
      try {
        const d = await API.get(`/api/checklist/${state.date}/${ts}`);
        state.data[ts] = d || emptyTimeslot();
      } catch {
        state.data[ts] = emptyTimeslot();
      }
    }));
  }

  function renderUI() {
    const canEdit = state.editable;
    document.getElementById('content').innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <label style="font-weight:600">날짜</label>
          <input type="date" id="cl-date" value="${state.date}" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px">
          <button class="btn" onclick="Checklist.changeDate()">조회</button>
          ${canEdit ? `<button class="btn btn-primary" onclick="Checklist.saveAll()">💾 전체 저장</button>` : ''}
          <span style="color:#888;font-size:13px">${state.dates.length > 0 ? '저장된 날짜: ' + state.dates.slice(0,5).join(', ') + (state.dates.length > 5 ? ' ...' : '') : ''}</span>
        </div>
      </div>

      <div style="display:flex;gap:0;margin-bottom:0">
        ${TIMESLOTS.map(ts => `
          <button onclick="Checklist.switchSlot('${ts}')" id="cl-tab-${ts}"
            style="padding:10px 24px;border:1px solid #ddd;background:${ts===state.timeslot?'#2563eb':'#fff'};
            color:${ts===state.timeslot?'#fff':'#333'};cursor:pointer;font-size:14px;font-weight:600;
            border-radius:${ts==='11'?'8px 0 0 0':''}${ts==='19'?'0 8px 0 0':''}">
            ${ts}시
          </button>
        `).join('')}
      </div>

      <div id="cl-slot-content" style="border:1px solid #ddd;border-top:none;border-radius:0 8px 8px 8px;padding:16px;background:#fff">
        ${renderSlot(getCurrentData(), canEdit)}
      </div>
    `;
  }

  function renderSlot(d, editable) {
    const s = d.summary || {};
    const E = editable;

    function inp(val, field, extra='') {
      if (!E) return `<span>${val ?? ''}</span>`;
      return `<input type="text" value="${val ?? ''}" data-field="${field}" ${extra}
        style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:4px;padding:3px 4px;font-size:13px;text-align:center"
        oninput="Checklist.updateSummary(this)">`;
    }

    const summaryHtml = `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <div style="font-weight:700;margin-bottom:10px;font-size:14px">📋 요약</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
          ${summaryField('불멍갯수', 'bulmung_count', s, E)}
          ${summaryField('플레이 인원수', 'play_count', s, E)}
          ${summaryField('아이풀장 인원수', 'child_pool', s, E)}
          ${summaryField('성인풀장 인원수', 'adult_pool', s, E)}
          ${summaryField('풀장인원수합', 'total_pool', s, E)}
          ${summaryField('더 텐트 4', 'tent4', s, E)}
          ${summaryField('더 텐트 2', 'tent2', s, E)}
          ${summaryField('더 텐트 8', 'tent8', s, E)}
          ${summaryField('단체20', 'group20', s, E)}
          ${summaryField('단체30', 'group30', s, E)}
          ${summaryField('합계', 'total', s, E)}
        </div>
      </div>
    `;

    return summaryHtml
      + sectionTable('더 텐트 4', d.tent4 || [], 'tent4', E)
      + sectionTable('더 텐트 2', d.tent2 || [], 'tent2', E)
      + sectionTable('더 텐트 8', d.tent8 || [], 'tent8', E)
      + extraSection(d.extra || [], E);
  }

  function summaryField(label, key, s, editable) {
    const val = s[key] ?? '';
    return `<div style="display:flex;flex-direction:column;gap:4px">
      <label style="font-size:11px;color:#666;font-weight:600">${label}</label>
      ${editable
        ? `<input type="text" value="${val}" data-skey="${key}" oninput="Checklist.onSummaryInput(this)"
           style="border:1px solid #e2e8f0;border-radius:4px;padding:5px 8px;font-size:13px;text-align:center">`
        : `<div style="padding:5px 8px;background:#fff;border:1px solid #eee;border-radius:4px;text-align:center;font-size:13px">${val || '-'}</div>`}
    </div>`;
  }

  function rowCell(row, field, editable, type='text', w='') {
    const val = row[field] ?? '';
    if (!editable) return `<td style="text-align:center;padding:4px 6px;font-size:13px">${val}</td>`;
    return `<td style="padding:2px 3px">
      <input type="${type}" value="${val}" data-row-field="${field}"
        style="width:${w||'100%'};box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;padding:3px 4px;font-size:12px;text-align:center"
        oninput="Checklist.onRowInput(this)">
    </td>`;
  }

  function sectionTable(title, rows, section, editable) {
    const headers = ['번호','예약상품','방문횟수','예약자성함','예약인원','입장시인원','2타임여부','플레이','아이풀장','성인풀장','불멍세트','성인만','비고'];
    const fields = ['tent_no','product','visit_count','name','reserved','actual','two_time','play','child_pool','adult_pool','bulmung','adult_only','memo'];
    const widths = ['44px','70px','60px','90px','60px','60px','70px','60px','60px','60px','60px','60px','120px'];

    return `
      <div style="margin-bottom:20px">
        <div style="font-weight:700;font-size:14px;padding:8px 0 6px;color:#1e40af">${title}</div>
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#1e40af;color:#fff">
              ${headers.map((h,i) => `<th style="padding:7px 4px;text-align:center;white-space:nowrap;min-width:${widths[i]}">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody id="cl-tbody-${section}">
            ${rows.map((row, idx) => rowHtml(row, idx, section, fields, widths, editable)).join('')}
          </tbody>
        </table>
        </div>
      </div>
    `;
  }

  function rowHtml(row, idx, section, fields, widths, editable) {
    const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr style="background:${bg}" data-section="${section}" data-idx="${idx}">
      <td style="text-align:center;padding:4px 6px;font-size:13px;font-weight:600;color:#555">${row.tent_no ?? ''}</td>
      ${fields.slice(1).map((f,fi) => {
        const w = widths[fi+1];
        const val = row[f] ?? '';
        if (!editable) return `<td style="text-align:center;padding:4px 6px;font-size:13px">${val}</td>`;
        return `<td style="padding:2px 3px"><input type="text" value="${val}" data-section="${section}" data-idx="${idx}" data-field="${f}"
          style="width:${w};max-width:${w};box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;padding:3px 4px;font-size:12px;text-align:center"
          oninput="Checklist.onRowInput(this)"></td>`;
      }).join('')}
    </tr>`;
  }

  function extraSection(rows, editable) {
    if (!editable && rows.length === 0) return '';
    const fields = ['tent_no','product','visit_count','name','reserved','actual','two_time','play','child_pool','adult_pool','bulmung','adult_only','memo'];
    const headers = ['No.','예약상품','방문횟수','예약자성함','예약인원','입장시인원','2타임여부','플레이','아이풀장','성인풀장','불멍세트','성인만','비고'];
    const widths = ['44px','70px','60px','90px','60px','60px','70px','60px','60px','60px','60px','60px','120px'];

    return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0 6px">
          <div style="font-weight:700;font-size:14px;color:#1e40af">No. (추가)</div>
          ${editable ? `<button class="btn" onclick="Checklist.addExtraRow()" style="font-size:12px;padding:3px 10px">+ 행 추가</button>` : ''}
        </div>
        ${rows.length > 0 ? `
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#1e40af;color:#fff">
              ${headers.map((h,i) => `<th style="padding:7px 4px;text-align:center;white-space:nowrap;min-width:${widths[i]}">${h}</th>`).join('')}
              ${editable ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody id="cl-tbody-extra">
            ${rows.map((row, idx) => {
              const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
              return `<tr style="background:${bg}" data-section="extra" data-idx="${idx}">
                ${fields.map((f,fi) => {
                  const val = row[f] ?? '';
                  if (!editable) return `<td style="text-align:center;padding:4px 6px;font-size:13px">${val}</td>`;
                  return `<td style="padding:2px 3px"><input type="text" value="${val}" data-section="extra" data-idx="${idx}" data-field="${f}"
                    style="width:${widths[fi]};max-width:${widths[fi]};box-sizing:border-box;border:1px solid #e2e8f0;border-radius:3px;padding:3px 4px;font-size:12px;text-align:center"
                    oninput="Checklist.onRowInput(this)"></td>`;
                }).join('')}
                ${editable ? `<td><button onclick="Checklist.removeExtraRow(${idx})" style="border:none;background:none;color:#e53e3e;cursor:pointer;font-size:16px">×</button></td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        </div>` : '<div style="color:#aaa;font-size:13px;padding:8px 0">추가 행 없음</div>'}
      </div>
    `;
  }

  function onSummaryInput(el) {
    const key = el.dataset.skey;
    const d = getCurrentData();
    if (!d.summary) d.summary = {};
    d.summary[key] = el.value;
  }

  function onRowInput(el) {
    const section = el.dataset.section;
    const idx = parseInt(el.dataset.idx);
    const field = el.dataset.field;
    const d = getCurrentData();
    if (d[section] && d[section][idx]) {
      d[section][idx][field] = el.value;
    }
  }

  function switchSlot(ts) {
    state.timeslot = ts;
    const canEdit = state.editable;
    // update tab styles
    TIMESLOTS.forEach(t => {
      const btn = document.getElementById(`cl-tab-${t}`);
      if (btn) {
        btn.style.background = t === ts ? '#2563eb' : '#fff';
        btn.style.color = t === ts ? '#fff' : '#333';
      }
    });
    document.getElementById('cl-slot-content').innerHTML = renderSlot(getCurrentData(), canEdit);
  }

  async function changeDate() {
    const inp = document.getElementById('cl-date');
    state.date = inp.value;
    await loadAllSlots();
    renderUI();
  }

  async function saveAll() {
    const btn = document.querySelector('[onclick="Checklist.saveAll()"]');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      await Promise.all(TIMESLOTS.map(ts =>
        API.put(`/api/checklist/${state.date}/${ts}`, state.data[ts] || emptyTimeslot())
      ));
      // 날짜 목록 갱신
      if (!state.dates.includes(state.date)) {
        state.dates.unshift(state.date);
      }
      alert('저장 완료!');
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 전체 저장'; }
    }
  }

  function addExtraRow() {
    const d = getCurrentData();
    if (!d.extra) d.extra = [];
    d.extra.push(emptyRow(''));
    // re-render just the slot content
    document.getElementById('cl-slot-content').innerHTML = renderSlot(d, state.editable);
  }

  function removeExtraRow(idx) {
    const d = getCurrentData();
    if (d.extra) d.extra.splice(idx, 1);
    document.getElementById('cl-slot-content').innerHTML = renderSlot(d, state.editable);
  }

  return { render, switchSlot, changeDate, saveAll, addExtraRow, removeExtraRow, onSummaryInput, onRowInput };
})();
