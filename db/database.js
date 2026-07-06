const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let _db = null;

function wrap(client) {
  const prepare = (sql) => ({
    async get(...args) {
      const r = await client.execute({ sql, args: args.flat().map(a => a ?? null) });
      return r.rows[0] ?? undefined;
    },
    async all(...args) {
      const r = await client.execute({ sql, args: args.flat().map(a => a ?? null) });
      return r.rows;
    },
    async run(...args) {
      const r = await client.execute({ sql, args: args.flat().map(a => a ?? null) });
      return { lastInsertRowid: r.lastInsertRowid ? Number(r.lastInsertRowid) : null };
    }
  });
  return {
    prepare,
    async exec(sql) {
      const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const s of stmts) await client.execute({ sql: s, args: [] });
    }
  };
}

async function init() {
  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
  });

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      department TEXT,
      position TEXT,
      phone TEXT,
      email TEXT,
      hire_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      type TEXT NOT NULL DEFAULT 'normal',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by INTEGER,
      approved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      base_salary INTEGER NOT NULL DEFAULT 0,
      overtime_pay INTEGER NOT NULL DEFAULT 0,
      bonus INTEGER NOT NULL DEFAULT 0,
      deduction INTEGER NOT NULL DEFAULT 0,
      net_pay INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      receipt_no TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '개',
      min_quantity REAL DEFAULT 0,
      location TEXT,
      note TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      reason TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS attendance_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_id INTEGER,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      requested_check_in TEXT,
      requested_check_out TEXT,
      requested_type TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  ];

  // 새 테이블들
  tables.push(`CREATE TABLE IF NOT EXISTS timesheet_manual_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    hours REAL NOT NULL,
    UNIQUE(user_id, year, month, day)
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS timesheet_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    adj REAL DEFAULT 0,
    adj1 REAL DEFAULT 0,
    UNIQUE(user_id, year, month)
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS timesheet_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    content TEXT,
    UNIQUE(year, month)
  )`);

  tables.push(`CREATE TABLE IF NOT EXISTS shareholder_participation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    participated INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, year, month, day)
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS sh_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    content TEXT,
    UNIQUE(year, month)
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS google_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    access_token TEXT,
    refresh_token TEXT NOT NULL,
    expiry_date INTEGER,
    calendar_id TEXT DEFAULT 'primary',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS shareholder_extra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    participated INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, year, month, day)
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS gcal_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id INTEGER,
    gcal_event_id TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  for (const sql of tables) {
    await client.execute({ sql, args: [] });
  }

  // users 테이블에 새 컬럼 추가 (이미 있으면 무시)
  const newCols = [
    "ALTER TABLE users ADD COLUMN employee_type TEXT DEFAULT '평일'",
    "ALTER TABLE users ADD COLUMN ssn TEXT",
    "ALTER TABLE users ADD COLUMN bank_name TEXT",
    "ALTER TABLE users ADD COLUMN bank_account TEXT",
    "ALTER TABLE users ADD COLUMN hourly_rate INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN birth_date TEXT",
  ];
  for (const sql of newCols) {
    try { await client.execute({ sql, args: [] }); } catch {}
  }

  const r = await client.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: ['admin'] });
  if (!r.rows[0]) {
    const hash = bcrypt.hashSync('admin1234', 10);
    await client.execute({
      sql: 'INSERT INTO users (username, password, name, role, department, position) VALUES (?, ?, ?, ?, ?, ?)',
      args: ['admin', hash, '관리자', 'admin', '경영', '대표']
    });
    console.log('관리자 계정 생성: admin / admin1234');
  }

  _db = wrap(client);
  return _db;
}

function getDb() { return _db; }
module.exports = { init, getDb };
