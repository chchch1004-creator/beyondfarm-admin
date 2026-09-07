const express = require('express');
const router = express.Router();
const https = require('https');
const { getDb } = require('../db/database');

function requireSuperAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인 필요' });
  if (req.session.user.role !== 'superadmin') return res.status(403).json({ error: '권한 없음' });
  next();
}

// 전체 DB 덤프 (모든 테이블)
async function dumpAllTables() {
  const db = getDb();
  const tables = await db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).all();

  const dump = { exportedAt: new Date().toISOString(), tables: {} };
  for (const { name } of tables) {
    try {
      dump.tables[name] = await db.prepare(`SELECT * FROM ${name}`).all();
    } catch { dump.tables[name] = []; }
  }
  return dump;
}

// https 요청 helper (fetch 대체)
function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text: () => data, json: () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// GitHub에 파일 커밋
async function pushToGitHub(filename, content) {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo  = process.env.GITHUB_BACKUP_REPO;
  if (!token || !repo) throw new Error('GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO 환경변수 미설정');

  const api = `https://api.github.com/repos/${repo}/contents/${filename}`;
  const headers = {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'beyondfarm-backup',
  };

  // 기존 파일 SHA 조회 (업데이트 시 필요)
  let sha;
  try {
    const res = await httpsRequest(api, { headers });
    if (res.status === 200) sha = res.json().sha;
  } catch {}

  const bodyObj = { message: `backup: ${filename}`, content: Buffer.from(content).toString('base64') };
  if (sha) bodyObj.sha = sha;

  const res = await httpsRequest(api, { method: 'PUT', headers }, JSON.stringify(bodyObj));
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`GitHub API 오류: ${res.status} ${res.text()}`);
  }
}

// 백업 실행 (서버 내부에서도 호출 가능)
async function runBackup() {
  const kstNow = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace('T', ' ');
  const dateStr = kstNow.slice(0, 10); // YYYY-MM-DD
  try {
    const dump = await dumpAllTables();
    dump.backupTime = kstNow;
    const json = JSON.stringify(dump, null, 2);
    const filename = `backups/${dateStr}.json`;
    await pushToGitHub(filename, json);
    console.log(`[백업] ${dateStr} 완료 (${Object.keys(dump.tables).length}개 테이블)`);
    return { ok: true, date: dateStr, tables: Object.keys(dump.tables).length };
  } catch (e) {
    console.error(`[백업] 실패:`, e.message);
    throw e;
  }
}

// 수동 백업 트리거 (슈퍼관리자)
router.post('/run', requireSuperAdmin, async (req, res) => {
  try {
    const result = await runBackup();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 백업 상태 확인
router.get('/status', requireSuperAdmin, async (req, res) => {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo  = process.env.GITHUB_BACKUP_REPO;
  if (!token || !repo) return res.json({ configured: false });
  try {
    const headers = { Authorization: `token ${token}`, 'User-Agent': 'beyondfarm-backup' };
    const r = await httpsRequest(`https://api.github.com/repos/${repo}/contents/backups`, { headers });
    const files = r.status === 200 ? r.json() : [];
    const list = Array.isArray(files)
      ? files.map(f => f.name).filter(n => n.endsWith('.json')).sort().reverse().slice(0, 10)
      : [];
    res.json({ configured: true, repo, recentBackups: list });
  } catch (e) {
    res.json({ configured: true, repo, error: e.message });
  }
});

module.exports = router;
module.exports.runBackup = runBackup;
