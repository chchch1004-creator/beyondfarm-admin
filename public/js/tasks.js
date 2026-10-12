const Tasks = {
  _tasks: [],
  _view: 'today', // today | all | manage

  PHASES: [
    { key: 'open',      label: '🌅 오픈시',  color: '#f59f00', bg: '#fff9db' },
    { key: 'operation', label: '⚡ 운영 중', color: '#1971c2', bg: '#e7f5ff' },
    { key: 'close',     label: '🌙 마감시',  color: '#5f3dc4', bg: '#f3f0ff' },
    { key: null,        label: '📋 기타',    color: '#495057', bg: '#f8f9fa' },
  ],

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    await this._load();
    this._render();
  },

  async _load() {
    try {
      this._tasks = await API.get('/api/tasks/today');
    } catch (e) {
      this._tasks = [];
    }
  },

  _render() {
    const content = document.getElementById('content');
    const role = App.user?.role;
    const isAdmin = role === 'superadmin' || role === 'admin';

    const todayTasks = this._tasks.filter(t => t.is_due_today);
    const doneTodayCount = todayTasks.filter(t => t.completed).length;
    const totalToday = todayTasks.length;
    const pct = totalToday > 0 ? Math.round(doneTodayCount / totalToday * 100) : 0;

    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dateStr = `${now.getUTCMonth() + 1}월 ${now.getUTCDate()}일 (${weekdays[now.getUTCDay()]})`;

    const tabBtn = (id, label) => {
      const active = this._view === id;
      return `<button onclick="Tasks._setView('${id}')" style="padding:8px 18px;font-size:13px;font-weight:600;border:none;cursor:pointer;border-bottom:2px solid ${active ? '#1b4332' : 'transparent'};background:none;color:${active ? '#1b4332' : '#6c757d'}">${label}</button>`;
    };

    content.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div style="display:flex;align-items:center;border-bottom:1px solid #dee2e6;padding:0 16px">
          ${tabBtn('today', '📋 오늘 할 일')}
          ${tabBtn('all', '📅 전체 보기')}
          ${isAdmin ? tabBtn('manage', '⚙️ 업무 관리') : ''}
        </div>
        <div id="task-body" style="padding:16px">
          ${this._view === 'today' ? this._renderToday(todayTasks, doneTodayCount, totalToday, pct, dateStr) :
            this._view === 'all'   ? this._renderAll() :
                                     this._renderManage()}
        </div>
      </div>
    `;
  },

  _renderToday(tasks, done, total, pct, dateStr) {
    const progressColor = pct === 100 ? '#2b8a3e' : pct >= 50 ? '#1971c2' : '#e67700';

    if (tasks.length === 0) {
      return `
        <div style="margin-bottom:16px">
          <span style="font-size:16px;font-weight:700;color:#1b4332">${dateStr}</span>
        </div>
        <div class="empty-state" style="padding:40px 0">
          <div class="icon">✨</div>
          <p>오늘 해당하는 업무가 없습니다</p>
          <p style="font-size:12px;color:#adb5bd">관리 탭에서 업무를 추가해주세요</p>
        </div>
      `;
    }

    // phase 순서대로 그룹핑
    const groups = {};
    for (const t of tasks) {
      const k = t.phase || 'null';
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    }

    const phaseBlocks = this.PHASES
      .filter(p => groups[String(p.key)])
      .map(p => {
        const list = groups[String(p.key)];
        const phaseDone = list.filter(t => t.completed).length;
        const pending = list.filter(t => !t.completed);
        const completed = list.filter(t => t.completed);
        return `
          <div style="margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div style="background:${p.bg};border:1px solid ${p.color}33;border-radius:8px;padding:5px 14px;display:flex;align-items:center;gap:8px">
                <span style="font-size:13px;font-weight:700;color:${p.color}">${p.label}</span>
              </div>
              <span style="font-size:12px;color:#adb5bd">${phaseDone}/${list.length}</span>
            </div>
            ${pending.map(t => this._taskCard(t)).join('')}
            ${completed.map(t => this._taskCard(t)).join('')}
          </div>
        `;
      }).join('');

    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <span style="font-size:16px;font-weight:700;color:#1b4332">${dateStr}</span>
          <span style="font-size:13px;font-weight:600;color:${progressColor}">${done}/${total} 완료</span>
        </div>
        <div style="height:8px;background:#e9ecef;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${progressColor};border-radius:4px;transition:width 0.4s"></div>
        </div>
      </div>
      ${phaseBlocks}
    `;
  },

  _renderAll() {
    const FREQ_ORDER = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual'];
    const FREQ_LABEL = {
      daily: '매일', weekly: '매주', biweekly: '격주',
      monthly: '매월', quarterly: '분기별', semiannual: '반기별',
    };

    if (this._tasks.length === 0) {
      return `<div class="empty-state"><div class="icon">📋</div><p>등록된 업무가 없습니다</p></div>`;
    }

    // phase → frequency 순으로 그룹핑
    const phaseBlocks = this.PHASES
      .map(p => {
        const list = this._tasks.filter(t => (t.phase || null) === p.key);
        if (!list.length) return '';

        const byFreq = {};
        for (const t of list) {
          if (!byFreq[t.frequency]) byFreq[t.frequency] = [];
          byFreq[t.frequency].push(t);
        }

        const freqBlocks = FREQ_ORDER.filter(f => byFreq[f]).map(f => `
          <div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:700;color:#adb5bd;margin-bottom:6px;letter-spacing:0.5px">${FREQ_LABEL[f]}</div>
            ${byFreq[f].map(t => this._taskCard(t)).join('')}
          </div>
        `).join('');

        return `
          <div style="margin-bottom:24px">
            <div style="background:${p.bg};border:1px solid ${p.color}33;border-radius:8px;padding:6px 14px;margin-bottom:12px;display:inline-flex;align-items:center;gap:6px">
              <span style="font-size:13px;font-weight:700;color:${p.color}">${p.label}</span>
              <span style="font-size:11px;color:${p.color}99">${list.filter(t => t.completed).length}/${list.length} 완료</span>
            </div>
            ${freqBlocks}
          </div>
        `;
      }).join('');

    return phaseBlocks || `<div class="empty-state"><div class="icon">📋</div><p>등록된 업무가 없습니다</p></div>`;
  },

  _renderManage() {
    const FREQ_LABEL = {
      daily: '매일', weekly: '매주', biweekly: '격주',
      monthly: '매월', quarterly: '분기별', semiannual: '반기별',
    };
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const PHASE_LABEL = { open: '🌅 오픈시', operation: '⚡ 운영 중', close: '🌙 마감시' };

    const rows = this._tasks.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:#adb5bd">등록된 업무 없음</td></tr>`
      : this._tasks.map(t => {
          const when = this._scheduleLabel(t, DOW);
          const phaseInfo = this.PHASES.find(p => p.key === (t.phase || null));
          return `<tr style="border-top:1px solid #f1f3f5;opacity:${t.active ? 1 : 0.45}">
            <td style="padding:10px 8px">
              ${t.phase ? `<span style="background:${phaseInfo?.bg};color:${phaseInfo?.color};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;white-space:nowrap">${PHASE_LABEL[t.phase] || t.phase}</span>` : '<span style="color:#adb5bd;font-size:11px">-</span>'}
            </td>
            <td style="padding:10px 8px;font-size:13px;font-weight:500">${t.title}</td>
            <td style="padding:10px 8px;font-size:12px;color:#495057">${t.category || '-'}</td>
            <td style="padding:10px 8px"><span style="background:${this._freqColor(t.frequency)};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${FREQ_LABEL[t.frequency] || t.frequency}</span></td>
            <td style="padding:10px 8px;font-size:12px;color:#495057">${when}</td>
            <td style="padding:10px 8px;white-space:nowrap">
              <button onclick="Tasks.openEdit(${t.id})" style="padding:4px 10px;font-size:11px;border:1px solid #dee2e6;border-radius:4px;background:#fff;cursor:pointer;margin-right:4px">수정</button>
              <button onclick="Tasks.confirmDelete(${t.id},'${t.title.replace(/'/g, "\\'")}')" style="padding:4px 10px;font-size:11px;border:1px solid #ffc9c9;border-radius:4px;background:#fff5f5;color:#c92a2a;cursor:pointer">삭제</button>
            </td>
          </tr>`;
        }).join('');

    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button onclick="Tasks.openAdd()" style="padding:8px 18px;font-size:13px;background:#1b4332;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">+ 업무 추가</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#495057;font-weight:600">시점</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#495057;font-weight:600">업무명</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#495057;font-weight:600">카테고리</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#495057;font-weight:600">주기</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#495057;font-weight:600">날짜/요일</th>
              <th style="padding:10px 8px;text-align:left;font-size:12px;color:#495057;font-weight:600"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  _taskCard(t) {
    const FREQ_LABEL = {
      daily: '매일', weekly: '매주', biweekly: '격주',
      monthly: '매월', quarterly: '분기별', semiannual: '반기별',
    };
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const scheduleLabel = this._scheduleLabel(t, DOW);
    const isDone = t.completed;

    return `
      <div onclick="Tasks.toggle(${t.id})" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;margin-bottom:8px;cursor:pointer;background:${isDone ? '#f8f9fa' : '#fff'};border:1px solid ${isDone ? '#e9ecef' : '#dee2e6'};transition:background 0.15s;user-select:none"
        onmouseenter="this.style.background='${isDone ? '#f1f3f5' : '#f0fdf4'}'"
        onmouseleave="this.style.background='${isDone ? '#f8f9fa' : '#fff'}'">
        <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${isDone ? '#2b8a3e' : '#ced4da'};background:${isDone ? '#2b8a3e' : 'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s">
          ${isDone ? '<span style="color:#fff;font-size:12px;font-weight:700">✓</span>' : ''}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:${isDone ? 400 : 600};color:${isDone ? '#adb5bd' : '#212529'};text-decoration:${isDone ? 'line-through' : 'none'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.title}</div>
          <div style="font-size:11px;color:#adb5bd;margin-top:2px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${t.category ? `<span>${t.category}</span><span>·</span>` : ''}
            <span style="background:${this._freqColor(t.frequency)};color:#fff;padding:1px 6px;border-radius:8px;font-size:10px">${FREQ_LABEL[t.frequency] || t.frequency}</span>
            ${scheduleLabel ? `<span>· ${scheduleLabel}</span>` : ''}
            ${isDone ? `<span>· ${t.completed_by || ''} 완료</span>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  _scheduleLabel(t, DOW) {
    if (t.frequency === 'weekly' || t.frequency === 'biweekly') {
      if (!t.day_of_week) return '';
      return t.day_of_week.split(',').map(d => DOW[parseInt(d)] + '요일').join(', ');
    }
    if (t.frequency === 'monthly') return t.day_of_month ? `${t.day_of_month}일` : '';
    if (t.frequency === 'quarterly') return t.day_of_month ? `분기 시작 ${t.day_of_month}일` : '';
    if (t.frequency === 'semiannual') return t.day_of_month ? `반기 시작 ${t.day_of_month}일` : '';
    return '';
  },

  _freqColor(freq) {
    const map = {
      daily: '#2b8a3e', weekly: '#1971c2', biweekly: '#5f3dc4',
      monthly: '#e67700', quarterly: '#c2255c', semiannual: '#862e9c',
    };
    return map[freq] || '#495057';
  },

  _setView(v) {
    this._view = v;
    this._render();
  },

  async toggle(id) {
    const task = this._tasks.find(t => t.id === id);
    if (!task) return;
    try {
      if (task.completed) {
        await API.delete(`/api/tasks/${id}/complete`);
      } else {
        await API.post(`/api/tasks/${id}/complete`, {});
      }
      await this._load();
      this._render();
    } catch (e) {
      Utils.showToast('오류: ' + e.message, 'error');
    }
  },

  openAdd() { this._openModal(null); },
  openEdit(id) {
    const task = this._tasks.find(t => t.id === id);
    if (task) this._openModal(task);
  },

  _openModal(task) {
    const isEdit = !!task;
    const DOW_ITEMS = [
      {v:'1',l:'월'},{v:'2',l:'화'},{v:'3',l:'수'},{v:'4',l:'목'},
      {v:'5',l:'금'},{v:'6',l:'토'},{v:'0',l:'일'},
    ];
    const selectedDays = (task?.day_of_week || '').split(',').filter(Boolean);

    const freqOpts = [
      ['daily','매일'],['weekly','매주 (요일 지정)'],['biweekly','격주 (요일 지정)'],
      ['monthly','매월 (날짜 지정)'],['quarterly','분기별'],['semiannual','반기별'],
    ].map(([v,l]) => `<option value="${v}" ${task?.frequency===v?'selected':''}>${l}</option>`).join('');

    const phaseOpts = [
      ['','선택 안 함'],['open','🌅 오픈시'],['operation','⚡ 운영 중'],['close','🌙 마감시'],
    ].map(([v,l]) => `<option value="${v}" ${(task?.phase||'')===v?'selected':''}>${l}</option>`).join('');

    Utils.showModal(`
      <h3 style="margin:0 0 18px;font-size:16px">${isEdit ? '업무 수정' : '업무 추가'}</h3>
      <div class="form-group">
        <label style="font-size:13px;font-weight:600;color:#495057">업무명 *</label>
        <input id="t-title" type="text" class="form-control" value="${task?.title || ''}" placeholder="예: 커피머신 대청소">
      </div>
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label style="font-size:13px;font-weight:600;color:#495057">시점</label>
          <select id="t-phase" class="form-control">${phaseOpts}</select>
        </div>
        <div class="form-group" style="flex:1">
          <label style="font-size:13px;font-weight:600;color:#495057">카테고리</label>
          <input id="t-category" type="text" class="form-control" value="${task?.category || ''}" placeholder="예: 청소, 재고">
        </div>
      </div>
      <div class="form-group">
        <label style="font-size:13px;font-weight:600;color:#495057">반복 주기 *</label>
        <select id="t-freq" class="form-control" onchange="Tasks._onFreqChange()">${freqOpts}</select>
      </div>
      <div id="t-dow-wrap" style="display:none;margin-bottom:12px">
        <label style="font-size:13px;font-weight:600;color:#495057;display:block;margin-bottom:6px">요일 선택</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${DOW_ITEMS.map(d => `
            <label style="display:flex;align-items:center;gap:4px;padding:5px 12px;border:1px solid ${selectedDays.includes(d.v)?'#1b4332':'#dee2e6'};border-radius:6px;cursor:pointer;font-size:13px;background:${selectedDays.includes(d.v)?'#ebfbee':'#fff'}">
              <input type="checkbox" name="t-dow" value="${d.v}" ${selectedDays.includes(d.v)?'checked':''} style="display:none" onchange="Tasks._updateDowStyle(this)">
              ${d.l}
            </label>
          `).join('')}
        </div>
      </div>
      <div id="t-dom-wrap" style="display:none;margin-bottom:12px">
        <label style="font-size:13px;font-weight:600;color:#495057">날짜 (일)</label>
        <input id="t-dom" type="number" min="1" max="31" class="form-control" value="${task?.day_of_month || ''}" placeholder="예: 5 (매월 5일)">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px">
        <button onclick="Utils.closeModal()" class="btn btn-secondary">취소</button>
        <button onclick="Tasks._save(${isEdit ? task.id : 'null'})" class="btn btn-primary">${isEdit ? '저장' : '추가'}</button>
      </div>
    `);
    setTimeout(() => Tasks._onFreqChange(), 0);
  },

  _updateDowStyle(cb) {
    const label = cb.closest('label');
    if (cb.checked) { label.style.borderColor = '#1b4332'; label.style.background = '#ebfbee'; }
    else            { label.style.borderColor = '#dee2e6'; label.style.background = '#fff'; }
  },

  _onFreqChange() {
    const freq = document.getElementById('t-freq')?.value;
    const dowWrap = document.getElementById('t-dow-wrap');
    const domWrap = document.getElementById('t-dom-wrap');
    if (!dowWrap || !domWrap) return;
    dowWrap.style.display = (freq === 'weekly' || freq === 'biweekly') ? 'block' : 'none';
    domWrap.style.display = (freq === 'monthly' || freq === 'quarterly' || freq === 'semiannual') ? 'block' : 'none';
  },

  async _save(id) {
    const title    = document.getElementById('t-title')?.value?.trim();
    const category = document.getElementById('t-category')?.value?.trim() || null;
    const phase    = document.getElementById('t-phase')?.value || null;
    const frequency = document.getElementById('t-freq')?.value;
    const dom      = document.getElementById('t-dom')?.value;
    const dowChecks = document.querySelectorAll('input[name="t-dow"]:checked');
    const day_of_week  = Array.from(dowChecks).map(c => c.value).join(',') || null;
    const day_of_month = dom ? parseInt(dom) : null;

    if (!title)     return Utils.showToast('업무명을 입력해주세요', 'error');
    if (!frequency) return Utils.showToast('주기를 선택해주세요', 'error');

    try {
      if (id) {
        await API.put(`/api/tasks/${id}`, { title, category, phase, frequency, day_of_week, day_of_month });
      } else {
        await API.post('/api/tasks', { title, category, phase, frequency, day_of_week, day_of_month });
      }
      Utils.closeModal();
      Utils.showToast(id ? '수정되었습니다' : '업무가 추가되었습니다');
      await this._load();
      this._render();
    } catch (e) {
      Utils.showToast('저장 실패: ' + e.message, 'error');
    }
  },

  async confirmDelete(id, title) {
    if (!confirm(`"${title}" 업무를 삭제할까요?\n완료 기록도 모두 삭제됩니다.`)) return;
    try {
      await API.delete(`/api/tasks/${id}`);
      Utils.showToast('삭제되었습니다');
      await this._load();
      this._render();
    } catch (e) {
      Utils.showToast('삭제 실패: ' + e.message, 'error');
    }
  },
};
