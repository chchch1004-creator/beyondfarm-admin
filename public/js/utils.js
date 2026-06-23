const Utils = {
  formatNum: (n) => Number(n || 0).toLocaleString('ko-KR'),
  formatDate: (d) => d ? d.slice(0, 10) : '-',
  today: () => new Date().toISOString().split('T')[0],
  statusBadge(status) {
    const map = { active: ['badge-success', '재직중'], inactive: ['badge-secondary', '퇴직'], pending: ['badge-warning', '대기중'], approved: ['badge-success', '승인'], rejected: ['badge-danger', '반려'], normal: ['badge-info', '정상'], late: ['badge-warning', '지각'], early: ['badge-warning', '조퇴'], absent: ['badge-danger', '결근'], remote: ['badge-info', '재택'] };
    const [cls, label] = map[status] || ['badge-secondary', status];
    return `<span class="badge ${cls}">${label}</span>`;
  },
  leaveTypeName(t) {
    return { annual: '연차', half: '반차', sick: '병가', official: '공가', other: '기타' }[t] || t;
  },
  showToast(msg, type = 'success') {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;color:#fff;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);background:${type === 'success' ? '#198754' : '#dc3545'}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },
  modal(title, bodyHtml, onConfirm, confirmLabel = '저장') {
    document.getElementById('modal-container').innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this)Utils.closeModal()">
        <div class="modal">
          <button class="modal-close" onclick="Utils.closeModal()">✕</button>
          <div class="modal-title">${title}</div>
          <div id="modal-body">${bodyHtml}</div>
          <div class="form-actions">
            <button class="btn btn-secondary" onclick="Utils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="Utils._onConfirm()">${confirmLabel}</button>
          </div>
        </div>
      </div>`;
    Utils._onConfirm = onConfirm;
  },
  closeModal() { document.getElementById('modal-container').innerHTML = ''; },
  val(id) { return document.getElementById(id)?.value?.trim() || ''; },
  setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; },
};
