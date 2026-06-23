// 생년월일 업데이트 스크립트 (주민번호에서 자동 추출)
// 실행: node update_birthdays.js

const https = require('https');

const BASE_URL = 'beyondfarm-production.up.railway.app';

// 주민번호 앞 6자리 + 뒷자리 첫번째로 생년월일 계산
function ssnToBirth(ssn) {
  const s = ssn.replace(/-/g, '');
  if (s.length < 7) return null;
  const yy = s.substring(0, 2);
  const mm = s.substring(2, 4);
  const dd = s.substring(4, 6);
  const genderDigit = parseInt(s[6]);
  let year;
  if ([1, 2, 5, 6].includes(genderDigit)) year = '19' + yy;
  else if ([3, 4, 7, 8].includes(genderDigit)) year = '20' + yy;
  else if ([9, 0].includes(genderDigit)) year = '18' + yy;
  else year = '19' + yy;
  return `${year}-${mm}-${dd}`;
}

const BIRTH_DATA = [
  { name: '장봉욱', ssn: '9212011081416' },
  { name: '이신호', ssn: '6506182388221' },
  { name: '조민경', ssn: '9611252078536' },
  { name: '문예은', ssn: '0402284178829' },
  { name: '신동현', ssn: '9308241081516' },
  { name: '김관형', ssn: '0309133059621' },
  { name: '김영진', ssn: '8212241148717' },
  { name: '정민채', ssn: '0412224890211' },
  { name: '오진우', ssn: '9310021846019' },
  { name: '이송',   ssn: '0407164169524' },
  { name: '조상희', ssn: '7705201005720' },
  { name: '조상하', ssn: '8709011113312' },
  { name: '정재호', ssn: '8901081667411' },
];

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
  console.log('관리자 로그인 중...');
  const loginBody = JSON.stringify({ username: 'admin', password: 'admin1234' });
  const loginRes = await request({
    hostname: BASE_URL, path: '/api/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginBody);

  if (loginRes.status !== 200) { console.error('로그인 실패'); return; }
  const cookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ');
  console.log('로그인 성공!\n');

  const empRes = await request({ hostname: BASE_URL, path: '/api/employees', method: 'GET', headers: { 'Cookie': cookie } });
  const employees = empRes.body;

  let success = 0;
  for (const item of BIRTH_DATA) {
    const birth = ssnToBirth(item.ssn);
    if (!birth) { console.log(`⚠️  ${item.name} - 생년월일 계산 실패`); continue; }

    const emp = employees.find(e => e.name === item.name);
    if (!emp) { console.log(`⚠️  ${item.name} - 직원을 찾을 수 없음`); continue; }

    const body = JSON.stringify({ birth_date: birth });
    const res = await request({
      hostname: BASE_URL, path: `/api/employees/${emp.id}`, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cookie': cookie }
    }, body);

    if (res.status === 200) {
      console.log(`✅ ${item.name} → 생년월일: ${birth}`);
      success++;
    } else {
      console.log(`❌ ${item.name} 실패: ${JSON.stringify(res.body)}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`\n완료! ${success}명 업데이트`);
}

main().catch(console.error);
