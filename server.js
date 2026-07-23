const express = require('express');
const session = require('express-session');
const path = require('path');
const { init } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'beyondfarm-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/timesheet', require('./routes/timesheet'));
app.use('/api/gcal', require('./routes/gcal'));
app.use('/api/sh-timesheet', require('./routes/sh_timesheet'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/push', require('./routes/push'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`비욘더팜 관리 시스템 실행 중: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('DB 초기화 실패:', err);
  process.exit(1);
});
