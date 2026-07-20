const Announcement = {
  _synth: window.speechSynthesis,
  _voices: [],

  _loadVoices() {
    this._voices = this._synth.getVoices();
    this._populateVoiceSelect();
  },

  _populateVoiceSelect() {
    const sel = document.getElementById('ann-voice');
    if (!sel || !this._voices.length) return;
    const current = sel.value;
    sel.innerHTML = '';

    // 한국어 음성 먼저, 그 다음 나머지
    const ko = this._voices.filter(v => v.lang.startsWith('ko'));
    const others = this._voices.filter(v => !v.lang.startsWith('ko'));

    if (ko.length) {
      const grp = document.createElement('optgroup');
      grp.label = '한국어';
      ko.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        if (i === 0 && !current) opt.selected = true;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    }
    if (current) sel.value = current;
  },

  render() {
    const presets = [
      { label: '입장 안내', text: '안녕하세요, 비욘더팜입니다. 잠시 후 입장을 시작하겠습니다. 준비해 주시기 바랍니다.' },
      { label: '퇴장 안내', text: '이용 시간이 종료되었습니다. 이용해 주셔서 감사합니다. 안전하게 이동해 주시기 바랍니다.' },
      { label: '풀장 이용', text: '풀장 이용 고객님께 안내드립니다. 풀장 입수 전 반드시 준비운동을 해주시고, 안전에 유의해 주시기 바랍니다.' },
      { label: '불멍 시작', text: '불멍 세트 이용 고객님, 지금부터 불멍을 시작하겠습니다. 화기 주변에서는 안전에 주의해 주시기 바랍니다.' },
      { label: '마감 안내', text: '오늘 비욘더팜의 운영이 곧 마감됩니다. 즐거운 시간 보내셨기를 바라며, 안전하게 귀가해 주시기 바랍니다.' },
    ];

    document.getElementById('content').innerHTML = `
      <div class="card" style="max-width:680px">
        <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px">📢 안내방송</div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:20px">내용을 입력하고 방송 버튼을 누르면 음성으로 읽어드립니다. 기기 볼륨을 최대로 설정하면 더 크게 들립니다.</div>

        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px">빠른 선택</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${presets.map(p => `
              <button onclick="Announcement.setPreset(${JSON.stringify(p.text).replace(/"/g,'&quot;')})"
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

    // 음성 목록 로드
    this._loadVoices();
    if (!this._voices.length) {
      speechSynthesis.addEventListener('voiceschanged', () => this._loadVoices(), { once: true });
    }
  },

  setPreset(text) {
    const el = document.getElementById('ann-text');
    if (el) { el.value = text; el.focus(); }
  },

  speak() {
    // iOS Safari: 유저 제스처 컨텍스트에서 호출되어야 함 (버튼 onclick이므로 정상)
    const text = document.getElementById('ann-text')?.value?.trim();
    if (!text) { this._setStatus('방송할 내용을 입력해주세요.', '#ef4444'); return; }

    this._synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ko-KR';
    utter.rate = parseFloat(document.getElementById('ann-rate')?.value || '0.9');
    utter.volume = parseFloat(document.getElementById('ann-vol')?.value || '1');

    // 선택된 목소리 적용
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
