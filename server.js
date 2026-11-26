// ============================================================
// Traffic Light Management System — Backend
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');
const Database = require('better-sqlite3');
const cors     = require('cors');
const path     = require('path');

const app    = express();
const PORT   = 3000;
const SECRET = 'traffic-light-secret-key-2025';

// >>> REPLACE WITH YOUR ESP32 IP (printed on Serial Monitor) <<<
const ESP32 = 'http://192.168.137.237';

// ---------- DATABASE ----------
const db = new Database(path.join(__dirname, 'traffic.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  fullname TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin','police')),
  active INTEGER DEFAULT 1,
  intersection_id INTEGER
);
CREATE TABLE IF NOT EXISTS intersections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS config (
  intersection_id INTEGER PRIMARY KEY,
  red INTEGER DEFAULT 30,
  yellow INTEGER DEFAULT 5,
  green INTEGER DEFAULT 30,
  maxEmergency INTEGER DEFAULT 60
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  type TEXT,
  severity TEXT,
  description TEXT,
  user_id INTEGER,
  intersection_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  category TEXT,
  details TEXT,
  urgency TEXT,
  user_id INTEGER,
  intersection_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS emergency_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  intersection_id INTEGER,
  direction TEXT,
  movement TEXT,
  start_at TEXT,
  end_at TEXT
);
`);

// ---------- SAFE DATABASE MIGRATIONS ----------
// Add report status columns to existing databases without deleting records.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(col => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('incidents', 'status', "TEXT NOT NULL DEFAULT 'Pending'");
ensureColumn('problems', 'status', "TEXT NOT NULL DEFAULT 'Pending'");

// ---------- SEED DATA ----------
(function seed() {
  const admin = db.prepare("SELECT * FROM users WHERE role='admin'").get();
  if (!admin) {
    db.prepare(`INSERT INTO users (username,password,fullname,role,active)
                VALUES (?,?,?,?,1)`)
      .run('admin', bcrypt.hashSync('admin123', 10), 'System Administrator', 'admin');
  }
  const inter = db.prepare("SELECT * FROM intersections").get();
  if (!inter) {
    db.prepare(`INSERT INTO intersections (name,location)
                VALUES ('Main Junction','Hosanna Town Center')`).run();
    const id = db.prepare("SELECT last_insert_rowid() AS id").get().id;
    db.prepare(`INSERT INTO config (intersection_id) VALUES (?)`).run(id);
    db.prepare(`INSERT INTO users (username,password,fullname,role,active,intersection_id)
                VALUES (?,?,?,?,1,?)`)
      .run('police1', bcrypt.hashSync('police123', 10), 'Officer Dawit', 'police', id);
  }
})();

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(roles = []) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'no token' });
    try {
      const payload = jwt.verify(token, SECRET);
      req.user = payload;
      if (roles.length && !roles.includes(payload.role))
        return res.status(403).json({ error: 'forbidden' });
      next();
    } catch {
      res.status(401).json({ error: 'bad token' });
    }
  };
}

// ---------- AUTH ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) return res.status(401).json({ error: 'invalid credentials' });
  if (!u.active) return res.status(403).json({ error: 'account deactivated' });
  if (!bcrypt.compareSync(password, u.password))
    return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign(
    { id: u.id, username: u.username, role: u.role, intersection_id: u.intersection_id },
    SECRET, { expiresIn: '8h' }
  );
  res.json({ token, role: u.role, fullname: u.fullname, intersection_id: u.intersection_id });
});

// ---------- POLICE ACCOUNTS ----------
app.get('/api/police', auth(['admin']), (req, res) => {
  res.json(db.prepare(
    "SELECT id,username,fullname,active,intersection_id FROM users WHERE role='police'"
  ).all());
});

app.post('/api/police', auth(['admin']), (req, res) => {
  const { username, password, fullname, intersection_id } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'missing fields' });
  try {
    db.prepare(`INSERT INTO users (username,password,fullname,role,active,intersection_id)
                VALUES (?,?,?,?,1,?)`)
      .run(username, bcrypt.hashSync(password, 10), fullname, 'police', intersection_id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/police/:id', auth(['admin']), (req, res) => {
  const { fullname, active, intersection_id } = req.body;
  db.prepare(`UPDATE users SET fullname=COALESCE(?,fullname),
              active=COALESCE(?,active),
              intersection_id=COALESCE(?,intersection_id)
              WHERE id=? AND role='police'`)
    .run(fullname, active, intersection_id, req.params.id);
  res.json({ success: true });
});

app.delete('/api/police/:id', auth(['admin']), (req, res) => {
  const hasIncident =
    db.prepare('SELECT 1 FROM incidents WHERE user_id=?').get(req.params.id) ||
    db.prepare('SELECT 1 FROM problems  WHERE user_id=?').get(req.params.id);
  if (hasIncident) {
    db.prepare('UPDATE users SET active=0 WHERE id=?').run(req.params.id);
    return res.json({ success: true, deactivated: true });
  }
  db.prepare("DELETE FROM users WHERE id=? AND role='police'").run(req.params.id);
  res.json({ success: true });
});

// ---------- INTERSECTIONS ----------
app.get('/api/intersections', auth(['admin', 'police']), (req, res) => {
  res.json(db.prepare('SELECT * FROM intersections').all());
});

app.post('/api/intersections', auth(['admin']), (req, res) => {
  const { name, location } = req.body;
  db.prepare('INSERT INTO intersections (name,location) VALUES (?,?)').run(name, location);
  const id = db.prepare('SELECT last_insert_rowid() AS id').get().id;
  db.prepare('INSERT INTO config (intersection_id) VALUES (?)').run(id);
  res.json({ success: true, id });
});

app.put('/api/intersections/:id', auth(['admin']), (req, res) => {
  const { name, location, active } = req.body;
  db.prepare(`UPDATE intersections SET name=COALESCE(?,name),
              location=COALESCE(?,location),
              active=COALESCE(?,active) WHERE id=?`)
    .run(name, location, active, req.params.id);
  res.json({ success: true });
});

// ---------- CONFIG ----------
app.get('/api/config/:id', auth(['admin', 'police']), (req, res) => {
  let c = db.prepare('SELECT * FROM config WHERE intersection_id=?').get(req.params.id);
  if (!c) {
    db.prepare('INSERT INTO config (intersection_id) VALUES (?)').run(req.params.id);
    c = db.prepare('SELECT * FROM config WHERE intersection_id=?').get(req.params.id);
  }
  res.json(c);
});

app.post('/api/config/:id', auth(['admin']), async (req, res) => {
  const { red, yellow, green, maxEmergency } = req.body;
  if (red < 5 || yellow < 2 || green < 5)
    return res.status(400).json({ error: 'unsafe durations' });
  db.prepare(`UPDATE config SET red=?,yellow=?,green=?,maxEmergency=?
              WHERE intersection_id=?`)
    .run(red, yellow, green, maxEmergency, req.params.id);
  try {
    await axios.get(
      `${ESP32}/config?red=${red}&yellow=${yellow}&green=${green}&maxEmergency=${maxEmergency}`
    );
    res.json({ success: true, applied: true });
  } catch {
    res.json({ success: true, applied: false, warning: 'ESP32 unreachable' });
  }
});

// ---------- MONITOR ----------
app.get('/api/monitor/:id', auth(['admin', 'police']), async (req, res) => {
  try {
    const { data } = await axios.get(`${ESP32}/status`, { timeout: 1500 });
    res.json({ ...data, online: true, ts: Date.now() });
  } catch {
    res.json({ online: false, ts: Date.now() });
  }
});

// ---------- CONTROL ----------
app.post('/api/control', auth(['admin']), async (req, res) => {
  const { color } = req.body;
  try {
    await axios.get(`${ESP32}/control?color=${color}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'ESP32 unreachable' });
  }
});

app.post('/api/mode', auth(['admin', 'police']), async (req, res) => {
  const { mode } = req.body;
  try {
    await axios.get(`${ESP32}/mode?mode=${mode}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'ESP32 unreachable' });
  }
});

// ---------- EMERGENCY ----------
app.post('/api/emergency/start', auth(['police']), async (req, res) => {
  const { direction, movement } = req.body; // e.g., direction = "North"
  const u = req.user;
  
  // Map direction to ESP32 pins (N, S, E, W)
  let dirCode = "N";
  if (direction === "South") dirCode = "S";
  if (direction === "East")  dirCode = "E";
  if (direction === "West")  dirCode = "W";

  try {
    await axios.get(`${ESP32}/mode?mode=emergency&dir=${dirCode}`);
    db.prepare(`INSERT INTO emergency_log (user_id,intersection_id,direction,movement,start_at)
                VALUES (?,?,?,?,datetime('now'))`).run(u.id, u.intersection_id, direction, movement);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'ESP32 unreachable' });
  }
});

app.post('/api/emergency/end', auth(['police']), async (req, res) => {
  try {
    await axios.get(`${ESP32}/mode?mode=fixed`);
    db.prepare(`UPDATE emergency_log SET end_at=datetime('now')
                WHERE id=(SELECT MAX(id) FROM emergency_log WHERE user_id=?)`)
      .run(req.user.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'ESP32 unreachable' });
  }
});

// ---------- INCIDENTS ----------
app.post('/api/incidents', auth(['police']), (req, res) => {
  const { type, severity, description } = req.body;
  const ref = 'INC-' + Date.now();
  db.prepare(`INSERT INTO incidents (ref,type,severity,description,user_id,intersection_id)
              VALUES (?,?,?,?,?,?)`)
    .run(ref, type, severity, description, req.user.id, req.user.intersection_id);
  res.json({ success: true, ref });
});

app.get('/api/incidents', auth(['admin', 'police']), (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT i.*,u.fullname FROM incidents i
                  LEFT JOIN users u ON u.id=i.user_id ORDER BY i.id DESC`).all()
    : db.prepare('SELECT * FROM incidents WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- PROBLEMS ----------
app.post('/api/problems', auth(['police']), (req, res) => {
  const { category, details, urgency } = req.body;
  const ref = 'PRB-' + Date.now();
  db.prepare(`INSERT INTO problems (ref,category,details,urgency,user_id,intersection_id)
              VALUES (?,?,?,?,?,?)`)
    .run(ref, category, details, urgency, req.user.id, req.user.intersection_id);
  res.json({ success: true, ref, notified: true });
});

app.get('/api/problems', auth(['admin', 'police']), (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT p.*,u.fullname FROM problems p
                  LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC`).all()
    : db.prepare('SELECT * FROM problems WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// ---------- ROLE-BASED DASHBOARD SUMMARY ----------
// Police statistics are private to the logged-in officer. Admin sees all officers.
app.get('/api/reports/summary', auth(['admin', 'police']), (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const where = isAdmin ? '' : ' WHERE user_id = ?';
  const args = isAdmin ? [] : [req.user.id];

  const incidents = db.prepare(`SELECT COUNT(*) AS c FROM incidents${where}`).get(...args).c;
  const problems = db.prepare(`SELECT COUNT(*) AS c FROM problems${where}`).get(...args).c;
  const emergencyWhere = isAdmin ? '' : ' WHERE user_id = ?';
  const emergency = db.prepare(`SELECT COUNT(*) AS c FROM emergency_log${emergencyWhere}`).get(...args).c;

  const incidentStatuses = db.prepare(`
    SELECT
      SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='In Progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved
    FROM (SELECT status,user_id FROM incidents UNION ALL SELECT status,user_id FROM problems) reports
    ${isAdmin ? '' : 'WHERE user_id = ?'}
  `).get(...args);

  res.json({
    incidents, problems, emergency,
    pending: incidentStatuses.pending || 0,
    in_progress: incidentStatuses.in_progress || 0,
    resolved: incidentStatuses.resolved || 0
  });
});

// ---------- RECENT REPORTS FOR DASHBOARDS ----------
app.get('/api/reports/recent', auth(['admin', 'police']), (req, res) => {
  const ownOnly = req.user.role === 'admin' ? '' : 'WHERE user_id = ?';
  const params = req.user.role === 'admin' ? [] : [req.user.id];
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT id, ref, 'Incident' AS report_type, type AS subject, severity AS level,
             description AS details, status, user_id, created_at FROM incidents
      UNION ALL
      SELECT id, ref, 'Problem' AS report_type, category AS subject, urgency AS level,
             details, status, user_id, created_at FROM problems
    ) reports
    ${ownOnly}
    ORDER BY created_at DESC LIMIT 15
  `).all(...params);
  const withOfficer = rows.map(row => ({
    ...row, officer_name: db.prepare('SELECT fullname FROM users WHERE id=?').get(row.user_id)?.fullname || 'Unknown'
  }));
  res.json(withOfficer);
});

// ---------- ADMIN: UPDATE INCIDENT / PROBLEM STATUS ----------
app.patch('/api/reports/:kind/:id/status', auth(['admin']), (req, res) => {
  const { kind, id } = req.params;
  const { status } = req.body;
  const table = kind === 'incident' ? 'incidents' : kind === 'problem' ? 'problems' : null;
  const allowed = ['Pending', 'In Progress', 'Resolved'];
  if (!table) return res.status(400).json({ error: 'Invalid report type' });
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(status, Number(id));
  if (!result.changes) return res.status(404).json({ error: 'Report not found' });
  res.json({ success: true, message: 'Report status updated' });
});

// ---------- EMERGENCY HISTORY (ADMIN ALL / POLICE OWN) ----------
app.get('/api/emergency/logs', auth(['admin', 'police']), (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT e.*, u.fullname, i.name AS intersection_name
                  FROM emergency_log e
                  LEFT JOIN users u ON u.id=e.user_id
                  LEFT JOIN intersections i ON i.id=e.intersection_id
                  ORDER BY e.id DESC LIMIT 100`).all()
    : db.prepare(`SELECT e.*, u.fullname, i.name AS intersection_name
                  FROM emergency_log e
                  LEFT JOIN users u ON u.id=e.user_id
                  LEFT JOIN intersections i ON i.id=e.intersection_id
                  WHERE e.user_id=? ORDER BY e.id DESC LIMIT 100`).all(req.user.id);
  res.json(rows.map(row => ({ ...row, status: row.end_at ? 'Completed' : 'Active' })));
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`📡 ESP32 target: ${ESP32}`);
});