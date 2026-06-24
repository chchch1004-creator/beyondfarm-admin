const Dashboard = {
  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div>로딩 중...</div>';
    try {
      const [employees, leaves, attendance, finance] = await Promise.all([
        API.get('/api/employees'),
        API.get('/api/leaves?year=' + new Date().getFullYear()),
        API.get('/api/attendance?year=' + new Date().getFullYear() + '&month=' + (new Date().getMonth() + 1)),
        API.get('/api/finance/summary?year=' + new Date().getFullYear()),
      ]);

      const testKeywords = ['테스트','TEST','관리자'];
      const isTest = e => testKeywords.some(k => e.name?.includes(k)) || e.name === 'T';
      const activeEmp = employees.filter(e => e.status === 'active' && !isTest(e)).length;
      const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
      const todayStr = Utils.today();
      const todayAtt = attendance.filter(a => a.date === todayStr);
      const checkedIn = todayAtt.filter(a => a.check_in).length;

      const totalIncome = finance.reduce((s, r) => s + (r.income || 0), 0);
      const totalExpense = finance.reduce((s, r) => s + (r.expense || 0), 0);

      const monthLabels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
      const financeRows = monthLabels.map((m, i) => {
        const row = finance.find(r => parseInt(r.month) === i + 1) || {};
        const inc = row.income || 0;
        const exp = row.expense || 0;
        return `<tr><td>${m}</td><td style="color:#198754">+${Utils.formatNum(inc)}원</td><td style="color:#dc3545">-${Utils.formatNum(exp)}원</td><td style="font-weight:600">${Utils.formatNum(inc - exp)}원</td></tr>`;
      }).join('');

      const recentLeaves = leaves.filter(l => l.status === 'pending').slice(0, 5);

      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon green">👥</div>
            <div><div class="stat-label">재직 직원</div><div class="stat-value">${activeEmp}명</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon blue">🕐</div>
            <div><div class="stat-label">오늘 출근</div><div class="stat-value">${checkedIn}명</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">📅</div>
            <div><div class="stat-label">휴가 대기</div><div class="stat-value">${pendingLeaves}건</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">📈</div>
            <div><div class="stat-label">올해 순이익</div><div class="stat-value" style="font-size:18px">${Utils.formatNum(totalIncome - totalExpense)}원</div></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <div class="card">
            <div class="card-title">📊 월별 재무 현황 (${new Date().getFullYear()}년)</div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>월</th><th>수입</th><th>지출</th><th>순이익</th></tr></thead>
                <tbody>${financeRows}</tbody>
              </table>
            </div>
          </div>
          <div class="card">
            <div class="card-title">📋 휴가 승인 대기 <span class="badge badge-warning">${pendingLeaves}</span></div>
            ${recentLeaves.length === 0
              ? '<div class="empty-state"><div class="icon">✅</div>대기 중인 휴가 신청이 없습니다</div>'
              : `<div class="table-wrap"><table>
                  <thead><tr><th>직원</th><th>유형</th><th>기간</th><th>관리</th></tr></thead>
                  <tbody>${recentLeaves.map(l => `
                    <tr>
                      <td>${l.user_name}</td>
                      <td>${Utils.leaveTypeName(l.type)}</td>
                      <td>${l.start_date} ~ ${l.end_date}</td>
                      <td>
                        <button class="btn btn-success btn-sm" onclick="Dashboard.approveLeave(${l.id},'approved')">승인</button>
                        <button class="btn btn-danger btn-sm" onclick="Dashboard.approveLeave(${l.id},'rejected')">반려</button>
                      </td>
                    </tr>`).join('')}
                  </tbody></table></div>`
            }
          </div>
        </div>
      `;
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  },

  async approveLeave(id, status) {
    try {
      await API.put(`/api/leaves/${id}/status`, { status });
      Utils.showToast(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.');
      Dashboard.render();
    } catch (e) {
      Utils.showToast(e.message, 'error');
    }
  }
};
