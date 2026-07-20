const Announcement = {
  _synth: window.speechSynthesis,
  _voices: [],

  _defaultPresets: [
    { label: '입장 안내', text: '안녕하세요, 비욘더팜입니다. 잠시 후 입장을 시작하겠습니다. 준비해 주시기 바랍니다.' },
    { label: '퇴장 안내', text: '이용 시간이 종료되었습니다. 이용해 주셔서 감사합니다. 안전하게 이동해 주시기 바랍니다.' },
    { label: '풀장 이용', text: '풀장 이용 고객님께 안내드립니다. 풀장 입수 전 반드시 준비운동을 해주시고, 안전에 유의해 주시기 바랍니다.' },
    { label: '불멍 시작', text: '불멍 세트 이용 고객님, 지금부터 불멍을 시작하겠습니다. 화기 주변에서는 안전에 주의해 주시기 바랍니다.' },
    { label: '마감 안내', text: '오늘 비욘더팜의 운영이 곧 마감됩니다. 즐거운 시간 보내셨기를 바라며, 안전하게 귀가해 주시기 바랍니다.' },
  ],

  _loadPresets() {
    try {
      const saved = localStorage.getItem('ann_presets');
      return saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(this._defaultPresets));
    } catch { return JSON.parse(JSON.stringify(this._defaultPresets)); }
  },

  _savePresets(presets) {
    localStorage.setItem('ann_presets', JSON.stringify(presets));
  },

  _loadVoices() {
    this._voices = this._synth.getVoices();
    this._populateVoiceSelect();
  },

  _populateVoiceSelect() {
    const sel = document.getElementById('ann-voice');
    if (!sel || !this._voices.length) return;
    const current = sel.value;
    sel.innerHTML = '';
    const ko = this._voices.filter(v => v.lang.startsWith('ko'));
    ko.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      if (i === 0 && !current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  },

  render() {
    const presets = this._loadPresets();

    document.getElementById('content').innerHTML = `
      <div class="card" style="max-width:680px">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">📢 안내방송</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:20px">내용을 입력하고 방송 버튼을 누르면 음성으로 읽어드립니다. 기기 볼륨을 최대로 설정하면 더 크게 들립니다.</div>

        <div style="margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <div style="font-size:12px;font-weight:600;color:#64748b">빠른 선택</div>
            <button onclick="Announcement.openPresetEditor()"
              style="padding:2px 10px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;
                     color:#64748b;font-size:11px;cursor:pointer">✏️ 편집</button>
          </div>
          <div id="ann-preset-btns" style="display:flex;flex-wrap:wrap;gap:6px">
            ${presets.map((p, i) => `
              <button onclick="Announcement.setPreset(${i})"
                style="padding:6px 13px;border:1px solid #93c5fd;border-radius:20px;background:#eff6ff;
                       color:#1d4ed8;font-size:12px;font-weight:500;cursor:pointer;min-height:36px">
                ${p.label}
              </button>`).join('')}
          </div>
        </div>

        <div style="margin-bottom:14px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px">방송 내용</div>
          <textarea id="ann-text" rows="5"
            placeholder="방송할 내용을 입력하세요..."
            style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:8px;
                   font-size:15px;line-height:1.7;resize:vertical;font-family:inherit;outline:none">안녕하세요, 비욘더팜입니다. </textarea>
        </div>

        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px">목소리 선택</div>
          <select id="ann-voice"
            style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;background:#fff">
            <option value="">목소리 불러오는 중...</option>
          </select>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px;align-items:center">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <label style="font-size:12px;font-weight:600;color:#64748b;white-space:nowrap">속도</label>
            <input type="range" id="ann-rate" min="0.5" max="1.5" step="0.1" value="0.9"
              oninput="document.getElementById('ann-rate-val').textContent=this.value"
              style="flex:1">
            <span id="ann-rate-val" style="font-size:12px;color:#475569;min-width:28px">0.9</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:160px">
            <label style="font-size:12px;font-weight:600;color:#64748b;white-space:nowrap">음량</label>
            <input type="range" id="ann-vol" min="0.1" max="1" step="0.1" value="1"
              oninput="document.getElementById('ann-vol-val').textContent=this.value"
              style="flex:1">
            <span id="ann-vol-val" style="font-size:12px;color:#475569;min-width:28px">1</span>
          </div>
        </div>

        <div style="display:flex;gap:10px">
          <button id="ann-play-btn" onclick="Announcement.speak()"
            style="flex:1;padding:16px;background:#2563eb;color:#fff;border:none;border-radius:10px;
                   font-size:16px;font-weight:700;cursor:pointer;min-height:52px">
            ▶ 방송 시작
          </button>
          <button onclick="Announcement.stop()"
            style="padding:16px 22px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;
                   border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;min-height:52px">
            ■ 정지
          </button>
        </div>

        <div id="ann-status" style="margin-top:12px;font-size:13px;color:#64748b;min-height:20px;text-align:center"></div>
      </div>`;

    this._loadVoices();
    if (!this._voices.length) {
      speechSynthesis.addEventListener('voiceschanged', () => this._loadVoices(), { once: true });
    }
  },

  setPreset(idx) {
    const presets = this._loadPresets();
    const el = document.getElementById('ann-text');
    if (el && presets[idx]) { el.value = presets[idx].text; el.focus(); }
  },

  openPresetEditor() {
    let presets = this._loadPresets().map(p => ({ ...p }));

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(modal);

    const renderModal = () => {
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;padding:24px;width:480px;max-width:100%;max-height:85vh;
                    display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.25);overflow:hidden">
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">빠른 선택 편집</div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:16px">이름과 방송 내용을 수정하고, 항목을 추가하거나 삭제할 수 있습니다.</div>
          <div id="preset-edit-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
            ${presets.map((p, i) => `
              <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <input id="preset-label-${i}" value="${p.label.replace(/"/g,'&quot;')}"
                    placeholder="버튼 이름"
                    style="flex:1;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;font-weight:600;outline:none">
                  <button data-del="${i}"
                    style="padding:4px 10px;border:1px solid #fca5a5;border-radius:6px;background:#fff5f5;
                           color:#dc2626;font-size:12px;cursor:pointer;white-space:nowrap">삭제</button>
                </div>
                <textarea id="preset-text-${i}" rows="3"
                  placeholder="방송 내용"
                  style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;
                         border-radius:6px;font-size:13px;line-height:1.6;resize:vertical;font-family:inherit;outline:none">${p.text}</textarea>
              </div>`).join('')}
          </div>
          <button id="preset-add"
            style="margin-top:10px;padding:9px;border:1px dashed #93c5fd;border-radius:8px;background:#f0f9ff;
                   color:#2563eb;font-size:13px;font-weight:600;cursor:pointer;width:100%">+ 항목 추가</button>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button id="preset-cancel"
              style="flex:1;padding:9px;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;
                     font-size:13px;font-weight:600;cursor:pointer;color:#374151">취소</button>
            <button id="preset-save"
              style="flex:2;padding:9px;border:none;border-radius:7px;background:#2563eb;
                     font-size:13px;font-weight:700;cursor:pointer;color:#fff">저장</button>
          </div>
        </div>`;

      // 삭제 버튼
      modal.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.del);
          // 현재 입력값 반영 후 해당 항목 삭제
          presets = presets.map((p, idx) => ({
            label: document.getElementById(`preset-label-${idx}`)?.value ?? p.label,
            text: document.getElementById(`preset-text-${idx}`)?.value ?? p.text,
          }));
          presets.splice(i, 1);
          renderModal();
        };
      });

      // 추가 버튼
      modal.querySelector('#preset-add').onclick = () => {
        presets = presets.map((p, i) => ({
          label: document.getElementById(`preset-label-${i}`)?.value ?? p.label,
          text: document.getElementById(`preset-text-${i}`)?.value ?? p.text,
        }));
        presets.push({ label: '', text: '' });
        renderModal();
        // 새 항목으로 스크롤
        const list = modal.querySelector('#preset-edit-list');
        if (list) list.scrollTop = list.scrollHeight;
        document.getElementById(`preset-label-${presets.length - 1}`)?.focus();
      };

      modal.querySelector('#preset-save').onclick = () => {
        const updated = presets.map((_, i) => ({
          label: document.getElementById(`preset-label-${i}`)?.value?.trim() || `프리셋${i+1}`,
          text: document.getElementById(`preset-text-${i}`)?.value || '',
        }));
        this._savePresets(updated);
        modal.remove();
        this.render();
      };
      modal.querySelector('#preset-cancel').onclick = () => modal.remove();
    };

    renderModal();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  speak() {
    const text = document.getElementById('ann-text')?.value?.trim();
    if (!text) { this._setStatus('방송할 내용을 입력해주세요.', '#ef4444'); return; }

    this._synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = parseFloat(document.getElementById('ann-rate')?.value || '0.9');
    utter.volume = parseFloat(document.getElementById('ann-vol')?.value || '1');

    const selectedName = document.getElementById('ann-voice')?.value;
    if (selectedName) {
      const voice = this._voices.find(v => v.name === selectedName);
      if (voice) utter.voice = voice;
    }

    utter.onstart = () => {
      this._setStatus('🔊 방송 중...', '#2563eb');
      const btn = document.getElementById('ann-play-btn');
      if (btn) { btn.style.background = '#1d4ed8'; btn.textContent = '🔊 방송 중...'; }
    };
    utter.onend = () => {
      this._setStatus('✅ 방송이 완료되었습니다.', '#16a34a');
      const btn = document.getElementById('ann-play-btn');
      if (btn) { btn.style.background = '#2563eb'; btn.textContent = '▶ 방송 시작'; }
    };
    utter.onerror = (e) => {
      this._setStatus(`오류: ${e.error || '브라우저가 음성을 지원하는지 확인해주세요.'}`, '#ef4444');
      const btn = document.getElementById('ann-play-btn');
      if (btn) { btn.style.background = '#2563eb'; btn.textContent = '▶ 방송 시작'; }
    };

    this._synth.speak(utter);
  },

  stop() {
    this._synth.cancel();
    this._setStatus('정지되었습니다.', '#64748b');
    const btn = document.getElementById('ann-play-btn');
    if (btn) { btn.style.background = '#2563eb'; btn.textContent = '▶ 방송 시작'; }
  },

  _setStatus(msg, color) {
    const el = document.getElementById('ann-status');
    if (el) { el.textContent = msg; el.style.color = color; }
  },
};
