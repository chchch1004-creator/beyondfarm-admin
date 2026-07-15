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
  tables.push(`CREATE TABLE IF NOT EXISTS sales_revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    working_days REAL DEFAULT 0,
    baemin INTEGER DEFAULT 0,
    other_sales INTEGER DEFAULT 0,
    other_income INTEGER DEFAULT 0,
    note TEXT,
    UNIQUE(year, month)
  )`);
  tables.push(`CREATE TABLE IF NOT EXISTS sales_yts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    baemin_input INTEGER DEFAULT 0,
    other_input INTEGER DEFAULT 0,
    external_input INTEGER DEFAULT 0,
    baemin_request INTEGER DEFAULT 0,
    other_request INTEGER DEFAULT 0,
    external_request INTEGER DEFAULT 0,
    baemin_next INTEGER DEFAULT 0,
    other_next INTEGER DEFAULT 0,
    external_next INTEGER DEFAULT 0,
    UNIQUE(year, month)
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

  // 매출 데이터 초기 시드 (이미 있으면 skip)
  const existingSales = await client.execute({ sql: 'SELECT COUNT(*) as cnt FROM sales_revenue', args: [] });
  if (!existingSales.rows[0]?.cnt) {
    const salesSeed = [
      // 2023년 (배민 = 전체 매출, 세분화 없음)
      [2023,1,11,5500000,0,0],[2023,2,8,14705500,0,0],[2023,3,9,28322700,0,0],
      [2023,4,10,46472400,0,0],[2023,5,10.5,100758000,0,0],[2023,6,9.5,118087500,0,0],
      [2023,7,10,53516500,0,0],[2023,8,9.5,81734700,0,0],[2023,9,11,72946500,0,0],
      [2023,10,12,119215800,0,0],[2023,11,8,53222500,0,0],[2023,12,9,43000000,0,0],
      // 2024년
      [2024,1,9,17187000,3892500,0],[2024,2,10,24000000,7159000,0],
      [2024,3,11,40259000,14960000,0],[2024,4,9,69948000,27993900,0],
      [2024,5,10.5,97861500,33315500,0],[2024,6,11.5,85867500,31179450,0],
      [2024,7,8,34817000,12766300,0],[2024,8,10.5,51302600,12020450,0],
      [2024,9,12,73819100,23016740,0],[2024,10,11.5,109577800,32513438,5646000],
      [2024,11,9,75885500,25768700,674000],[2024,12,10,36552000,8438000,0],
      // 2025년
      [2025,1,13,26269700,5010500,0],[2025,2,8,17145000,2844200,1000000],
      [2025,3,11,34687500,10995500,0],[2025,4,8,44850600,17964200,1350000],
      [2025,5,11.5,112593000,32492608,0],[2025,6,11,83518100,25759850,0],
      [2025,7,8,63635700,15819153,0],[2025,8,11,71286900,19683003,0],
      [2025,9,8,41199700,15470455,0],[2025,10,13,100067700,24985778,0],
      [2025,11,10,70413900,20259358,0],[2025,12,9,47863400,10887275,0],
      // 2026년 (1~6월까지만)
      [2026,1,10,6666300,1364000,0],[2026,2,11,29718100,6201300,0],
      [2026,3,10,36096800,11070054,0],[2026,4,8,60335100,20358850,0],
      [2026,5,13,119620700,39115890,0],[2026,6,9,84841000,21910750,0],
    ];
    for (const [year,month,wd,baemin,other,income] of salesSeed) {
      try {
        await client.execute({
          sql: 'INSERT OR IGNORE INTO sales_revenue (year,month,working_days,baemin,other_sales,other_income) VALUES (?,?,?,?,?,?)',
          args: [year, month, wd, baemin, other, income]
        });
      } catch {}
    }
    console.log('매출 초기 데이터 삽입 완료');
  }

  _db = wrap(client);
  return _db;
}

function getDb() { return _db; }
module.exports = { init, getDb };
