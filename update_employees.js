// 직원 주민번호/계좌번호 업데이트 스크립트
// 실행: node update_employees.js

const https = require('https');

const BASE_URL = 'beyondfarm-production.up.railway.app';

const UPDATE_DATA = [
  { name: '장봉욱', ssn: '9212011081416', bank_name: '신한', bank_account: '110-239-388023' },
  { name: '이신호', ssn: '6506182388221', bank_name: '우리', bank_account: '1002-807-752569' },
  { name: '조민경', ssn: '9611252078536', bank_name: '농협', bank_account: '351-1203-3634-93' },
  { name: '문예은', ssn: '0402284178829', bank_name: '농협', bank_account: '1000-3507-7339' },
  { name: '신동현', ssn: '9308241081516', bank_name: '신한', bank_account: '110-357-661798' },
  { name: '김관형', ssn: '0309133059621', bank_name: '농협', bank_account: '352-1226-7212-43' },
  { name: '김영진', ssn: '8212241148717', bank_name: '카카오', bank_account: '3333-02-0478651' },
  { name: '정민채', ssn: '0412224890211', bank_name: '농협', bank_account: '3560989890843' },
  { name: '오진우', ssn: '9310021846019', bank_name: '농협', bank_account: '302-1171-9911-21' },
  { name: '이송',   ssn: '0407164169524', bank_name: '토스', bank_account: '1000-3389-6236' },
  { name: '조상희', ssn: '7705201005720', bank_name: '신한', bank_account: '010-7285-8888' },
  { name: '조상하', ssn: '8709011113312', bank_name: '신한', bank_account: '110-385-724903' },
  { name: '정재호', ssn: '8901081667411', bank_name: '카카오', bank_account: '3333-033-245255' },
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
    hostname: BASE_URL,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) }
  }, loginBody);

  if (loginRes.status !== 200) {
    console.error('로그인 실패. admin 비밀번호를 확인해주세요.');
    return;
  }
  const cookie = loginRes.cookies.map(c => c.split(';')[0]).join('; ');
  console.log('로그인 성공!\n');

  // 전체 직원 목록 조회
  const empRes = await request({
    hostname: BASE_URL,
    path: '/api/employees',
    method: 'GET',
    headers: { 'Cookie': cookie }
  });
  const employees = empRes.body;
  console.log(`총 ${employees.length}명 조회됨\n`);

  let success = 0, notFound = 0;

  for (const upd of UPDATE_DATA) {
    const emp = employees.find(e => e.name === upd.name);
    if (!emp) {
      console.log(`⚠️  ${upd.name} - 직원을 찾을 수 없음 (이름 확인 필요)`);
      notFound++;
      continue;
    }

    const body = JSON.stringify({ ssn: upd.ssn, bank_name: upd.bank_name, bank_account: upd.bank_account });
    const res = await request({
      hostname: BASE_URL,
      path: `/api/employees/${emp.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cookie': cookie }
    }, body);

    if (res.status === 200) {
      console.log(`✅ ${upd.name} 업데이트 완료`);
      success++;
    } else {
      console.log(`❌ ${upd.name} 업데이트 실패: ${JSON.stringify(res.body)}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n완료! 성공: ${success}, 미발견: ${notFound}`);
}

main().catch(console.error);
