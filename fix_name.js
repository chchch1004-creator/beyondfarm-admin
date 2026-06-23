// 장봉욱 → 장병욱 이름/아이디 수정
const https = require('https');
const BASE_URL = 'beyondfarm-production.up.railway.app';

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] || [];
        try { resolve({ body: JSON.parse(data), cookies, status: res.statusCode }); }
        catch { resolve({ body: data, cookies, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const loginBody = JSON.stringify({ username: 'admin', password: 'admin1234' });
  const loginRes = await request({
    hostname: BASE_URL, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginBody);
  const cookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ');

  const empRes = await request({ hostname: BASE_URL, path: '/api/employees', method: 'GET', headers: { Cookie: cookie } });
  const emp = empRes.body.find(e => e.name === '장봉욱');
  if (!emp) { console.log('장봉욱을 찾을 수 없습니다.'); return; }

  const body = JSON.stringify({ name: '장병욱', username: '장병욱' });
  const res = await request({
    hostname: BASE_URL, path: `/api/employees/${emp.id}`, method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Cookie: cookie }
  }, body);

  console.log(res.status === 200 ? '✅ 장봉욱 → 장병욱 변경 완료!' : `❌ 실패: ${JSON.stringify(res.body)}`);
}
main().catch(console.error);
