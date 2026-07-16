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

  tables.push(`CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INTEGER NOT NULL,
    page TEXT NOT NULL,
    can_view INTEGER DEFAULT 0,
    can_edit INTEGER DEFAULT 0,
    PRIMARY KEY(user_id, page)
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
      args: ['admin', hash, '관리자', 'superadmin', '경영', '대표']
    });
    console.log('관리자 계정 생성: admin / admin1234');
  }

  // 권한 마이그레이션: 구 role(admin/employee/주말) → user + user_permissions
  const DEFAULT_PERMS = {
    admin: {
      dashboard: {view:1,edit:1}, employees: {view:1,edit:1},
      attendance: {view:1,edit:1}, salary: {view:1,edit:1},
    },
    employee: {
      dashboard: {view:1,edit:0}, employees: {view:1,edit:0},
      attendance: {view:1,edit:1}, salary: {view:1,edit:0},
    },
    '주말': {
      attendance: {view:1,edit:1},
    },
  };
  const oldRoleUsers = await client.execute({ sql: "SELECT id, role FROM users WHERE role IN ('admin','employee','주말')", args: [] });
  for (const u of oldRoleUsers.rows) {
    const perms = DEFAULT_PERMS[u.role] || {};
    for (const [page, perm] of Object.entries(perms)) {
      await client.execute({
        sql: 'INSERT OR IGNORE INTO user_permissions (user_id,page,can_view,can_edit) VALUES (?,?,?,?)',
        args: [u.id, page, perm.view, perm.edit]
      });
    }
    await client.execute({ sql: "UPDATE users SET role='user' WHERE id=?", args: [u.id] });
  }

  // 유입 데이터 초기 시드 (이미 있으면 skip)
  const existingYts = await client.execute({ sql: 'SELECT COUNT(*) as cnt FROM sales_yts', args: [] });
  if (!existingYts.rows[0]?.cnt) {
    // [year, month, naver_input, other_input, ext_input, naver_req, other_req, ext_req, naver_next, other_next, ext_next]
    const ytsSeed = [
      // 2022년 (5월부터 시작)
      [2022,5,18281,452,10,3751,127,0,1204,95,0],
      [2022,6,10537,168,9,1463,26,2,1473,38,1],
      [2022,7,7680,107,4,800,13,0,522,8,0],
      [2022,8,6502,80,9,685,8,1,592,9,1],
      [2022,9,6002,79,24,671,6,0,390,3,0],
      [2022,10,6987,160,26,667,15,0,592,16,0],
      [2022,11,13068,235,81,390,12,1,246,7,0],
      [2022,12,2070,47,17,60,1,0,45,1,0],
      // 2023년
      [2023,1,2421,23,3,79,1,0,44,1,0],
      [2023,2,3449,38,0,114,0,0,95,0,0],
      [2023,3,6350,72,1,321,8,0,184,3,0],
      [2023,4,15097,156,0,768,8,0,326,6,0],
      [2023,5,26616,239,2,1383,29,0,749,12,0],
      [2023,6,21972,276,1,1063,11,0,840,11,0],
      [2023,7,13360,120,1,516,10,0,330,2,0],
      [2023,8,13081,113,11,818,12,0,624,4,0],
      [2023,9,14749,104,3,820,10,0,464,9,0],
      [2023,10,15630,175,4,1001,25,0,810,20,0],
      [2023,11,7117,73,4,433,9,0,355,8,0],
      [2023,12,5056,30,0,326,5,0,301,5,0],
      // 2024년
      [2024,1,4573,19,0,223,3,0,172,2,0],
      [2024,2,6254,41,1,337,4,0,234,4,0],
      [2024,3,9165,88,7,540,11,0,368,3,0],
      [2024,4,16523,141,77,1199,20,2,608,7,1],
      [2024,5,18492,220,136,1140,32,4,822,25,2],
      [2024,6,16320,149,137,784,13,0,714,13,0],
      [2024,7,18429,121,73,538,10,1,307,6,1],
      [2024,8,16251,81,75,549,4,2,438,4,0],
      [2024,9,18529,200,124,1038,31,8,670,14,3],
      [2024,10,20435,156,187,1093,25,10,844,17,6],
      [2024,11,11690,127,123,590,12,3,598,14,4],
      [2024,12,8574,65,49,352,4,3,316,3,3],
      // 2025년
      [2025,1,7385,50,69,272,9,1,240,7,2],
      [2025,2,6382,48,46,223,5,0,159,2,0],
      [2025,3,10094,73,91,376,7,1,287,7,1],
      [2025,4,17911,115,75,841,14,2,349,3,2],
      [2025,5,17892,117,33,796,26,0,785,23,0],
      [2025,6,16137,116,27,632,16,1,588,17,0],
      [2025,7,16630,64,21,701,4,0,485,4,0],
      [2025,8,15261,46,12,558,16,0,499,9,0],
      [2025,9,14524,23,13,619,6,1,322,3,1],
      [2025,10,17433,35,13,942,7,1,749,10,0],
      [2025,11,10580,15,10,543,5,0,527,4,1],
      [2025,12,8215,25,2,411,10,0,375,7,0],
      // 2026년 (1~6월)
      [2026,1,3308,12,3,75,0,0,52,0,0],
      [2026,2,5466,7,6,333,1,0,263,1,0],
      [2026,3,8067,19,5,381,6,0,286,2,0],
      [2026,4,15320,24,16,943,3,1,471,5,1],
      [2026,5,19119,68,12,869,9,1,870,4,1],
      [2026,6,13355,50,6,720,4,0,561,5,0],
    ];
    for (const [y,m,bi,oi,ei,br,or_,er,bn,on_,en] of ytsSeed) {
      try {
        await client.execute({
          sql: 'INSERT OR IGNORE INTO sales_yts (year,month,baemin_input,other_input,external_input,baemin_request,other_request,external_request,baemin_next,other_next,external_next) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          args: [y,m,bi,oi,ei,br,or_,er,bn,on_,en]
        });
      } catch {}
    }
    console.log('유입 초기 데이터 삽입 완료');
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
