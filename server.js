// ============================================================
// Traffic Light Management System — Backend (XAMPP/MySQL Edition)
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');
const mysql    = require('mysql2');
const cors     = require('cors');
const path     = require('path');

const app    = express();
const PORT   = 3000;
const SECRET = 'traffic-light-secret-key-2025';

// >>> REPLACE WITH YOUR ESP32 IP <<<
const ESP32 = 'http://192.168.137.214'; 

// ---------- MYSQL CONNECTION ----------
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',      // Default XAMPP user
  password: '',      // Default XAMPP password (leave empty)
  database: 'traffic_system' // The DB you created in phpMyAdmin
});

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL connection failed:', err.message);
    return;
  }
  console.log('✅ Connected to XAMPP MySQL database');
  
  // Seed default Admin and Police accounts if they don't exist
  db.query("SELECT * FROM users WHERE role='admin'", (err, results) => {
    if (results && results.length === 0) {
      const hashAdmin = bcrypt.hashSync('admin123', 10);
      db.query("INSERT INTO users (username, password, fullname, role, active) VALUES (?, ?, ?, ?, 1)", 
        ['admin', hashAdmin, 'System Administrator', 'admin']);
      
      db.query("INSERT INTO intersections (name, location) VALUES (?, ?)", ['Main Junction', 'Hosanna Town Center'], (err, res) => {
        if (res) {
          const interId = res.insertId;
          db.query("INSERT INTO config (intersection_id) VALUES (?)", [interId]);
          
          const hashPolice = bcrypt.hashSync('police123', 10);
          db.query("INSERT INTO users (username, password, fullname, role, active, intersection_id) VALUES (?, ?, ?, ?, 1, ?)", 
            ['police1', hashPolice, 'Officer Dawit', 'police', interId]);
        }
      });
    }
  });
});

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
  db.query('SELECT * FROM users WHERE username=?', [username], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const u = results[0];
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
});

// ---------- POLICE ACCOUNTS ----------
app.get('/api/police', auth(['admin']), (req, res) => {
  db.query("SELECT id,username,fullname,active,intersection_id FROM users WHERE role='police'", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/police', auth(['admin']), (req, res) => {
  const { username, password, fullname, intersection_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });
  db.query('INSERT INTO users (username,password,fullname,role,active,intersection_id) VALUES (?,?,?,?,1,?)',
    [username, bcrypt.hashSync(password, 10), fullname, 'police', intersection_id], (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

app.put('/api/police/:id', auth(['admin']), (req, res) => {
  const { fullname, active, intersection_id } = req.body;
  db.query(`UPDATE users SET fullname=COALESCE(?,fullname), active=COALESCE(?,active), 
            intersection_id=COALESCE(?,intersection_id) WHERE id=? AND role='police'`,
    [fullname, active, intersection_id, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/police/:id', auth(['admin']), (req, res) => {
  db.query('SELECT 1 FROM incidents WHERE user_id=? UNION SELECT 1 FROM problems WHERE user_id=?',
    [req.params.id, req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results && results.length > 0) {
      db.query('UPDATE users SET active=0 WHERE id=?', [req.params.id], () => {
        res.json({ success: true, deactivated: true });
      });
    } else {
      db.query("DELETE FROM users WHERE id=? AND role='police'", [req.params.id], () => {
        res.json({ success: true });
      });
    }
  });
});

// ---------- INTERSECTIONS ----------
app.get('/api/intersections', auth(['admin', 'police']), (req, res) => {
  db.query('SELECT * FROM intersections', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/intersections', auth(['admin']), (req, res) => {
  const { name, location } = req.body;
  db.query('INSERT INTO intersections (name,location) VALUES (?,?)', [name, location], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    db.query('INSERT INTO config (intersection_id) VALUES (?)', [result.insertId]);
    res.json({ success: true, id: result.insertId });
  });
});

app.put('/api/intersections/:id', auth(['admin']), (req, res) => {
  const { name, location, active } = req.body;
  db.query(`UPDATE intersections SET name=COALESCE(?,name), location=COALESCE(?,location), active=COALESCE(?,active) WHERE id=?`,
    [name, location, active, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ---------- CONFIG ----------
app.get('/api/config/:id', auth(['admin', 'police']), (req, res) => {
  db.query('SELECT * FROM config WHERE intersection_id=?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) {
      db.query('INSERT INTO config (intersection_id) VALUES (?)', [req.params.id]);
      return res.json({ red: 30, yellow: 5, green: 30, maxEmergency: 60 });
    }
    res.json(results[0]);
  });
});

app.post('/api/config/:id', auth(['admin']), async (req, res) => {
  const { red, yellow, green, maxEmergency } = req.body;
  if (red < 5 || yellow < 2 || green < 5) return res.status(400).json({ error: 'unsafe durations' });
  
  db.query('UPDATE config SET red=?,yellow=?,green=?,maxEmergency=? WHERE intersection_id=?',
    [red, yellow, green, maxEmergency, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
  });

  try {
    await axios.get(`${ESP32}/config?red=${red}&yellow=${yellow}&green=${green}&maxEmergency=${maxEmergency}`);
    res.json({ success: true, applied: true });
  } catch {
    res.json({ success: true, applied: false, warning: 'ESP32 unreachable' });
  }
});

// ---------- MONITOR & CONTROL ----------
app.get('/api/monitor/:id', auth(['admin', 'police']), async (req, res) => {
  try {
    const { data } = await axios.get(`${ESP32}/status`, { timeout: 1500 });
    res.json({ ...data, online: true, ts: Date.now() });
  } catch {
    res.json({ online: false, ts: Date.now() });
  }
});

app.post('/api/control', auth(['admin']), async (req, res) => {
  try {
    await axios.get(`${ESP32}/control?color=${req.body.color}`);
    res.json({ success: true });
  } catch { 
    res.status(500).json({ error: 'ESP32 unreachable' }); 
  }
});

app.post('/api/mode', auth(['admin', 'police']), async (req, res) => {
  try {
    await axios.get(`${ESP32}/mode?mode=${req.body.mode}`);
    res.json({ success: true });
  } catch { 
    res.status(500).json({ error: 'ESP32 unreachable' }); 
  }
});

// ---------- EMERGENCY ----------
app.post('/api/emergency/start', auth(['police']), async (req, res) => {
  const { direction, movement } = req.body;
  let dirCode = direction === "South" ? "S" : direction === "East" ? "E" : direction === "West" ? "W" : "N";
  
  try {
    await axios.get(`${ESP32}/mode?mode=emergency&dir=${dirCode}`);
    db.query(`INSERT INTO emergency_log (user_id,intersection_id,direction,movement,start_at) VALUES (?,?,?,?,NOW())`,
      [req.user.id, req.user.intersection_id, direction, movement]);
    res.json({ success: true });
  } catch { 
    res.status(500).json({ error: 'ESP32 unreachable' }); 
  }
});

app.post('/api/emergency/end', auth(['police']), async (req, res) => {
  try {
    await axios.get(`${ESP32}/mode?mode=fixed`);
    db.query(`UPDATE emergency_log SET end_at=NOW() WHERE id=(SELECT MAX(id) FROM (SELECT id FROM emergency_log WHERE user_id=?) AS t)`, [req.user.id]);
    res.json({ success: true });
  } catch { 
    res.status(500).json({ error: 'ESP32 unreachable' }); 
  }
});

// ---------- INCIDENTS ----------
app.post('/api/incidents', auth(['police']), (req, res) => {
  const { type, severity, description } = req.body;
  const ref = 'INC-' + Date.now();
  db.query('INSERT INTO incidents (ref,type,severity,description,user_id,intersection_id) VALUES (?,?,?,?,?,?)',
    [ref, type, severity, description, req.user.id, req.user.intersection_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, ref });
  });
});

app.get('/api/incidents', auth(['admin', 'police']), (req, res) => {
  const sql = req.user.role === 'admin'
    ? 'SELECT i.*,u.fullname FROM incidents i LEFT JOIN users u ON u.id=i.user_id ORDER BY i.id DESC'
    : 'SELECT * FROM incidents WHERE user_id=? ORDER BY id DESC';
  db.query(sql, req.user.role === 'admin' ? [] : [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ---------- PROBLEMS ----------
app.post('/api/problems', auth(['police']), (req, res) => {
  const { category, details, urgency } = req.body;
  const ref = 'PRB-' + Date.now();
  db.query('INSERT INTO problems (ref,category,details,urgency,user_id,intersection_id) VALUES (?,?,?,?,?,?)',
    [ref, category, details, urgency, req.user.id, req.user.intersection_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, ref });
  });
});

app.get('/api/problems', auth(['admin', 'police']), (req, res) => {
  const sql = req.user.role === 'admin'
    ? 'SELECT p.*,u.fullname FROM problems p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC'
    : 'SELECT * FROM problems WHERE user_id=? ORDER BY id DESC';
  db.query(sql, req.user.role === 'admin' ? [] : [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ---------- SUMMARY & REPORTS ----------
app.get('/api/reports/summary', auth(['admin', 'police']), (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const where = isAdmin ? '' : ' WHERE user_id = ?';
  const args = isAdmin ? [] : [req.user.id];

  db.query(`SELECT COUNT(*) AS c FROM incidents${where}`, args, (err, r1) => {
    db.query(`SELECT COUNT(*) AS c FROM problems${where}`, args, (err, r2) => {
      db.query(`SELECT COUNT(*) AS c FROM emergency_log${where}`, args, (err, r3) => {
        db.query(`SELECT SUM(status='Pending') AS pending, SUM(status='In Progress') AS in_progress, SUM(status='Resolved') AS resolved FROM (SELECT status,user_id FROM incidents UNION ALL SELECT status,user_id FROM problems) reports ${where}`, args, (err, r4) => {
          res.json({
            incidents: r1[0] ? r1[0].c : 0, 
            problems: r2[0] ? r2[0].c : 0, 
            emergency: r3[0] ? r3[0].c : 0,
            pending: r4[0] ? (r4[0].pending || 0) : 0, 
            in_progress: r4[0] ? (r4[0].in_progress || 0) : 0, 
            resolved: r4[0] ? (r4[0].resolved || 0) : 0
          });
        });
      });
    });
  });
});

app.get('/api/reports/recent', auth(['admin', 'police']), (req, res) => {
  const ownOnly = req.user.role === 'admin' ? '' : 'WHERE user_id = ?';
  const params = req.user.role === 'admin' ? [] : [req.user.id];
  const sql = `SELECT * FROM (
    SELECT id, ref, 'Incident' AS report_type, type AS subject, severity AS level, description AS details, status, user_id, created_at FROM incidents
    UNION ALL
    SELECT id, ref, 'Problem' AS report_type, category AS subject, urgency AS level, details, status, user_id, created_at FROM problems
  ) reports ${ownOnly} ORDER BY created_at DESC LIMIT 15`;
  
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const withOfficer = results.map(r => ({ ...r, officer_name: 'Officer' }));
    res.json(withOfficer);
  });
});

app.patch('/api/reports/:kind/:id/status', auth(['admin']), (req, res) => {
  const { kind, id } = req.params;
  const { status } = req.body;
  const table = kind === 'incident' ? 'incidents' : kind === 'problem' ? 'problems' : null;
  if (!table) return res.status(400).json({ error: 'Invalid report type' });
  
  db.query(`UPDATE ${table} SET status=? WHERE id=?`, [status, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/emergency/logs', auth(['admin', 'police']), (req, res) => {
  const sql = req.user.role === 'admin'
    ? `SELECT e.*, u.fullname, i.name AS intersection_name FROM emergency_log e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN intersections i ON i.id=e.intersection_id ORDER BY e.id DESC LIMIT 100`
    : `SELECT e.*, u.fullname, i.name AS intersection_name FROM emergency_log e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN intersections i ON i.id=e.intersection_id WHERE e.user_id=? ORDER BY e.id DESC LIMIT 100`;
  
  db.query(sql, req.user.role === 'admin' ? [] : [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results.map(row => ({ ...row, status: row.end_at ? 'Completed' : 'Active' })));
  });
});

// ---------- START ----------
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`📡 ESP32 target: ${ESP32}`);
});