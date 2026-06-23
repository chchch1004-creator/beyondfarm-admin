const MyPage = {
  async render() {
    const content = document.getElementById('content');
    try {
      const user = await API.get('/api/auth/profile');
      const roleLabel = { superadmin: '총괄관리자', admin: '관리자', employee: '직원' }[user.role] || user.role;

      content.innerHTML = `
        <div style="max-width:520px">
          <!-- 내 정보 -->
          <div class="card">
            <div class="card-title">👤 내 정보</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
              <div>
                <div style="font-size:11px;color:#6c757d;font-weight:600;margin-bottom:4px">이름</div>
                <div style="font-size:15px;font-weight:600">${user.name}</div>
              </div>
              <div>
                <div style="font-size:11px;color:#6c757d;font-weight:600;margin-bottom:4px">아이디</div>
                <div style="font-size:15px">${user.username}</div>
              </div>
              <div>
                <div style="font-size:11px;color:#6c757d;font-weight:600;margin-bottom:4px">권한</div>
                <div>${Utils.statusBadge(user.role === 'superadmin' ? 'active' : user.role === 'admin' ? 'approved' : 'pending')} <span style="font-size:13px">${roleLabel}</span></div>
              </div>
              <div>
                <div style="font-size:11px;color:#6c757d;font-weight:600;margin-bottom:4px">부서 / 직급</div>
                <div style="font-size:13px">${user.department || '-'} / ${user.position || '-'}</div>
              </div>
              <div>
                <div style="font-size:11px;color:#6c757d;font-weight:600;margin-bottom:4px">입사일</div>
                <div style="font-size:13px">${user.hire_date || '-'}</div>
              </div>
            </div>
          </div>

          <!-- 연락처 수정 -->
          <div class="card">
            <div class="card-title">📱 연락처 수정</div>
            <div class="form-grid">
              <div class="form-group">
                <label>휴대폰 번호</label>
                <input id="mp-phone" value="${user.phone || ''}" placeholder="010-0000-0000">
              </div>
              <div class="form-group">
                <label>이메일</label>
                <input id="mp-email" type="email" value="${user.email || ''}" placeholder="example@email.com">
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick="MyPage.saveContact()">저장</button>
            </div>
          </div>

          <!-- 비밀번호 변경 -->
          <div class="card">
            <div class="card-title">🔒 비밀번호 변경</div>
            <div class="form-grid">
              <div class="form-group" style="grid-column:1/-1">
                <label>현재 비밀번호</label>
                <input type="password" id="mp-cur-pw" placeholder="현재 비밀번호">
              </div>
              <div class="form-group">
                <label>새 비밀번호</label>
                <input type="password" id="mp-new-pw" placeholder="새 비밀번호 (6자 이상)">
              </div>
              <div class="form-group">
                <label>새 비밀번호 확인</label>
                <input type="password" id="mp-new-pw2" placeholder="새 비밀번호 재입력">
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick="MyPage.changePassword()">비밀번호 변경</button>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  async saveContact() {
    const phone = Utils.val('mp-phone');
    const email = Utils.val('mp-email');
    try {
      await API.put('/api/auth/profile', { phone, email });
      Utils.showToast('연락처가 저장되었습니다.');
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  },

  async changePassword() {
    const current_password = Utils.val('mp-cur-pw');
    const new_password = Utils.val('mp-new-pw');
    const new_password2 = Utils.val('mp-new-pw2');

    if (!current_password) return Utils.showToast('현재 비밀번호를 입력하세요.', 'error');
    if (!new_password) return Utils.showToast('새 비밀번호를 입력하세요.', 'error');
    if (new_password.length < 6) return Utils.showToast('비밀번호는 6자 이상이어야 합니다.', 'error');
    if (new_password !== new_password2) return Utils.showToast('새 비밀번호가 일치하지 않습니다.', 'error');

    try {
      await API.put('/api/auth/profile', { current_password, new_password });
      Utils.showToast('비밀번호가 변경되었습니다.');
      document.getElementById('mp-cur-pw').value = '';
      document.getElementById('mp-new-pw').value = '';
      document.getElementById('mp-new-pw2').value = '';
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }
};
