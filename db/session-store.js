const session = require('express-session');
const { getDb } = require('./database');

const TTL_MS = 8 * 60 * 60 * 1000; // 8시간

class TursoStore extends session.Store {
  get(sid, cb = () => {}) {
    try {
      const db = getDb();
      db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires > ?')
        .get(sid, Date.now())
        .then(row => cb(null, row ? JSON.parse(row.data) : null))
        .catch(e => cb(e));
    } catch (e) { cb(e); }
  }

  set(sid, sessionData, cb = () => {}) {
    try {
      const db = getDb();
      const expires = Date.now() + TTL_MS;
      db.prepare(
        `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires=excluded.expires`
      ).run(sid, JSON.stringify(sessionData), expires)
        .then(() => cb(null))
        .catch(e => cb(e));
    } catch (e) { cb(e); }
  }

  destroy(sid, cb = () => {}) {
    try {
      const db = getDb();
      db.prepare('DELETE FROM sessions WHERE sid = ?')
        .run(sid)
        .then(() => cb(null))
        .catch(e => cb(e));
    } catch (e) { cb(e); }
  }

  // 만료된 세션 정리 (선택적, 주기적으로 호출 가능)
  cleanup() {
    try {
      const db = getDb();
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now()).catch(() => {});
    } catch {}
  }
}

module.exports = TursoStore;
