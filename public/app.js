const API = '';
let TOKEN = localStorage.getItem('token') || '';
let ROLE  = localStorage.getItem('role')  || '';
let NAME  = localStorage.getItem('name')  || '';
let INTER = localStorage.getItem('inter') || '';

let monitorTimer = null;
let statsTimer = null; 

// ---------- NAVIGATION (Landing & Logins) ----------
function showLanding() {
  document.getElementById('landingView').classList.remove('hidden');
  document.getElementById('adminLoginView').classList.add('hidden');
  document.getElementById('policeLoginView').classList.add('hidden');
  document.getElementById('appView').classList.add('hidden');
  window.scrollTo(0, 0);
}

function showLogin(type) {
  document.getElementById('landingView').classList.add('hidden');
  if (type === 'admin') {
    document.getElementById('adminLoginView').classList.remove('hidden');
  } else {
    document.getElementById('policeLoginView').classList.remove('hidden');
  }
}

// ---------- AUTHENTICATION ----------
async function login(type) {
  let username, password, errorDiv;
  
  if (type === 'admin') {
    username = document.getElementById('adminUser').value.trim();
    password = document.getElementById('adminPass').value;
    errorDiv = document.getElementById('adminError');
  } else {
    username = document.getElementById('policeUser').value.trim();
    password = document.getElementById('policePass').value;
    errorDiv = document.getElementById('policeError');
  }
  
  errorDiv.textContent = '';
  
  try {
    const r = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'login failed');
    
    if (type === 'admin' && d.role !== 'admin') {
      throw new Error("This is a Police account. Please use the Police Login portal.");
    }
    if (type === 'police' && d.role !== 'police') {
      throw new Error("This is an Admin account. Please use the Admin Login portal.");
    }

    TOKEN = d.token; ROLE = d.role; NAME = d.fullname || d.username; INTER = d.intersection_id;
    localStorage.setItem('token', TOKEN);
    localStorage.setItem('role',  ROLE);
    localStorage.setItem('name',  NAME);
    localStorage.setItem('inter', INTER);
    
    showApp();
  } catch (e) { 
    errorDiv.textContent = e.message; 
  }
}

function logout() {
  localStorage.clear();
  TOKEN = ROLE = NAME = INTER = '';
  if (monitorTimer) clearInterval(monitorTimer);
  if (statsTimer) clearInterval(statsTimer);
  document.getElementById('adminUser').value = '';
  document.getElementById('adminPass').value = '';
  document.getElementById('policeUser').value = '';
  document.getElementById('policePass').value = '';
  showLanding();
}

function showApp() {
  document.getElementById('landingView').classList.add('hidden');
  document.getElementById('adminLoginView').classList.add('hidden');
  document.getElementById('policeLoginView').classList.add('hidden');
  
  document.getElementById('appView').classList.remove('hidden');
  document.body.dataset.role = ROLE;
  document.getElementById('userInfo').innerHTML =
    `<b>${NAME}</b><br/>Role: ${ROLE.toUpperCase()}`;
  buildNav();
  go('dashboard');
}

// ---------- DASHBOARD NAVIGATION ----------
function buildNav() {
  const items = [
    { key:'dashboard',    label:'📊 Dashboard',         roles:['admin','police'] },
    { key:'accounts',     label:'👤 Police Accounts',   roles:['admin'] },
    { key:'intersections',label:'🛣️ Intersections',      roles:['admin'] },
    { key:'config',       label:'⚙️ Configure Signals', roles:['admin'] },
    { key:'inbox',        label:'📥 Admin Inbox',       roles:['admin'] },
    { key:'incidents',    label:'📝 Incident Reports',  roles:['admin','police'] },
    { key:'problems',     label:'⚠️ Problem Reports',   roles:['admin','police'] },
    { key:'emergency',    label:'🚨 Emergency Priority',roles:['police'] },
    { key:'reports',      label:'📑 Reports',           roles:['admin','police'] }
  ];
  const nav = document.getElementById('navMenu');
  nav.innerHTML = '';
  items.filter(i => i.roles.includes(ROLE)).forEach(i => {
    const b = document.createElement('button');
    b.textContent = i.label;
    b.dataset.view = i.key;
    b.onclick = () => go(i.key);
    nav.appendChild(b);
  });
}

// ---------- REPORT PAGE CONFIGURATION ----------
function configureReportPages() {
  const isAdmin = ROLE === 'admin';
  const incidentForm = document.getElementById('incidentForm');
  const problemForm = document.getElementById('problemForm');

  // Hide submission forms from Admin
  if (incidentForm) incidentForm.style.display = isAdmin ? 'none' : '';
  if (problemForm) problemForm.style.display = isAdmin ? 'none' : '';
}

// ---------- PAGE ROUTING ----------
function go(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + view).classList.remove('hidden');

  // Configure report pages according to user role
  if (view === 'incidents' || view === 'problems') {
    configureReportPages();
  }

  document.querySelectorAll('#navMenu button').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view)
  );

  document.getElementById('pageTitle').textContent =
    document.querySelector(`#navMenu button[data-view="${view}"]`)?.textContent || 'Dashboard';

  // Load page information
  if (view === 'accounts')      loadPolice();
  if (view === 'intersections') loadIntersections();
  if (view === 'config')        loadConfigOptions();
  if (view === 'incidents')     loadIncidents();
  if (view === 'problems')      loadProblems();
  if (view === 'reports')       { loadSummary(); loadEmergencyLogs(); }
  if (view === 'inbox')         loadAdminInbox();

  // Start timers ONLY on dashboard
  if (view === 'dashboard') {
    loadSummary();
    startMonitor();
  } else {
    if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
    if (statsTimer)   { clearInterval(statsTimer);   statsTimer = null; }
  }
}

// ---------- HELPERS ----------
async function api(path, opts = {}) {
  opts.headers = { ...(opts.headers || {}), 'Authorization': 'Bearer ' + TOKEN };
  if (opts.body) opts.headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, opts);
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  return r.json();
}
const cap = c => c.charAt(0).toUpperCase() + c.slice(1);

// ---------- DASHBOARD STATS ----------
async function loadSummary() {
  try {
    const d = await api('/api/reports/summary');
    updateStat('statIncidents', d.incidents || 0);
    updateStat('statProblems', d.problems || 0);
    updateStat('statEmergency', d.emergency || 0);
    updateStat('statPending', d.pending || 0);
    updateStat('statInProgress', d.in_progress || 0);
    updateStat('statResolved', d.resolved || 0);
    
    if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
      await loadDashboardReports();
    }
  } catch (e) {
    console.log('Failed to load summary', e);
  }
}

async function loadDashboardReports() {
  try {
    const rows = await api('/api/reports/recent');
    const tbody = document.querySelector('#dashboardReportsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${row.ref}</td>
        <td>${row.report_type}</td>
        <td>${row.subject || ''}</td>
        <td>${row.officer_name || ''}</td>
        <td>${row.level || ''}</td>
        <td>${row.status || 'Pending'}</td>
        <td>${row.created_at}</td>
        ${ROLE === 'admin' ? `<td class="admin-status-cell">${statusSelect(row.report_type === 'Incident' ? 'incident' : 'problem', row.id, row.status || 'Pending')}</td>` : ''}
      </tr>`).join('');
    if (!rows.length) tbody.innerHTML = '<tr><td colspan="8">No reports submitted yet.</td></tr>';
  } catch (e) { 
    console.log('Could not load dashboard reports', e); 
  }
}

function updateStat(id, value) {
  const el = document.getElementById(id);
  if (el) {
    if (el.textContent !== value.toString()) {
      el.style.opacity = '0.5';
      setTimeout(() => {
        el.textContent = value;
        el.style.opacity = '1';
      }, 150);
    }
  }
}

function startMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  if (statsTimer) clearInterval(statsTimer);
  
  pollMonitor();
  monitorTimer = setInterval(pollMonitor, 2000);
  statsTimer = setInterval(loadSummary, 3000);
  
  if (ROLE !== 'admin') document.getElementById('adminControls').classList.add('hidden');
  else                  document.getElementById('adminControls').classList.remove('hidden');
}

async function pollMonitor() {
  const id = INTER || 1;
  try {
    const d = await api('/api/monitor/' + id);
    
    ['n','s','e','w'].forEach(dir => {
      ['Red','Yel','Grn'].forEach(col => {
        const el = document.getElementById(dir + col);
        if(el) el.classList.remove('active');
      });
    });

    if (d.online) {
      document.getElementById('statusPill').className = 'pill online';
      document.getElementById('statusPill').textContent = '● online';
      
      if (d.mode === 'fixed' || d.mode === 'manual') {
        if (d.phase === 0) {
          document.getElementById('nGrn').classList.add('active');
          document.getElementById('sGrn').classList.add('active');
          document.getElementById('eRed').classList.add('active');
          document.getElementById('wRed').classList.add('active');
        } else if (d.phase === 1) {
          document.getElementById('nYel').classList.add('active');
          document.getElementById('sYel').classList.add('active');
          document.getElementById('eRed').classList.add('active');
          document.getElementById('wRed').classList.add('active');
        } else if (d.phase === 2) {
          document.getElementById('nRed').classList.add('active');
          document.getElementById('sRed').classList.add('active');
          document.getElementById('eGrn').classList.add('active');
          document.getElementById('wGrn').classList.add('active');
        } else if (d.phase === 3) {
          document.getElementById('nRed').classList.add('active');
          document.getElementById('sRed').classList.add('active');
          document.getElementById('eYel').classList.add('active');
          document.getElementById('wYel').classList.add('active');
        }
      } else if (d.mode === 'emergency') {
        ['nRed','sRed','eRed','wRed'].forEach(id => document.getElementById(id).classList.add('active'));
      }
      
      document.getElementById('mMode').textContent  = d.mode;
      document.getElementById('mCount').textContent = d.countdown;
      document.getElementById('mUpdated').textContent = 'Last update: ' + new Date(d.ts).toLocaleTimeString();
    } else {
      document.getElementById('statusPill').className = 'pill offline';
      document.getElementById('statusPill').textContent = '● offline';
      document.getElementById('mUpdated').textContent = 'ESP32 unreachable';
    }
  } catch {}
}

async function control(color) {
  try { await api('/api/control', { method:'POST', body: JSON.stringify({ color }) }); }
  catch { alert('ESP32 unreachable'); }
}
async function setMode(mode) {
  try { await api('/api/mode', { method:'POST', body: JSON.stringify({ mode }) }); }
  catch { alert('ESP32 unreachable'); }
}

// ---------- POLICE ----------
async function loadPolice() {
  const data  = await api('/api/police');
  const inter = await api('/api/intersections');
  document.querySelector('#policeTable tbody').innerHTML = data.map(p => `
    <tr>
      <td>${p.id}</td>
      <td>${p.username}</td>
      <td>${p.fullname || ''}</td>
      <td>${p.active ? '✅' : '❌'}</td>
      <td>${(inter.find(i => i.id === p.intersection_id) || {}).name || '-'}</td>
      <td>
        <button onclick="togglePolice(${p.id},${p.active ? 0 : 1})">${p.active ? 'Deactivate' : 'Activate'}</button>
        <button onclick="deletePolice(${p.id})">Delete</button>
      </td>
    </tr>`).join('');
  document.getElementById('pIntersection').innerHTML =
    inter.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
}

async function createPolice() {
  const username = document.getElementById('pUsername').value;
  const password = document.getElementById('pPassword').value;
  const fullname = document.getElementById('pFullname').value;
  const intersection_id = +document.getElementById('pIntersection').value;
  try {
    await api('/api/police', { method:'POST',
      body: JSON.stringify({ username, password, fullname, intersection_id }) });
    alert('Account created');
    loadPolice();
  } catch (e) { alert('Error: ' + e.message); }
}
async function togglePolice(id, active) {
  await api('/api/police/' + id, { method:'PUT', body: JSON.stringify({ active }) });
  loadPolice();
}
async function deletePolice(id) {
  if (!confirm('Delete this account?')) return;
  const r = await api('/api/police/' + id, { method:'DELETE' });
  alert(r.deactivated ? 'Account had records → deactivated' : 'Deleted');
  loadPolice();
}

// ---------- INTERSECTIONS ----------
async function loadIntersections() {
  const data = await api('/api/intersections');
  document.querySelector('#interTable tbody').innerHTML = data.map(i => `
    <tr><td>${i.id}</td><td>${i.name}</td><td>${i.location || ''}</td>
        <td>${i.active ? '✅' : '❌'}</td></tr>`).join('');
}
async function createIntersection() {
  const name = document.getElementById('iName').value;
  const location = document.getElementById('iLoc').value;
  await api('/api/intersections', { method:'POST', body: JSON.stringify({ name, location }) });
  loadIntersections();
}

// ---------- CONFIG ----------
async function loadConfigOptions() {
  const data = await api('/api/intersections');
  const sel = document.getElementById('cfgInter');
  sel.innerHTML = data.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
  sel.onchange = () => loadCurrentConfig(+sel.value);
  loadCurrentConfig(+sel.value || 1);
}
async function loadCurrentConfig(id) {
  const c = await api('/api/config/' + id);
  document.getElementById('cfgRed').value    = c.red;
  document.getElementById('cfgYellow').value = c.yellow;
  document.getElementById('cfgGreen').value  = c.green;
  document.getElementById('cfgMax').value    = c.maxEmergency;
}
async function saveConfig() {
  const id     = +document.getElementById('cfgInter').value;
  const red    = +document.getElementById('cfgRed').value;
  const yellow = +document.getElementById('cfgYellow').value;
  const green  = +document.getElementById('cfgGreen').value;
  const maxEmergency = +document.getElementById('cfgMax').value;
  try {
    const r = await api('/api/config/' + id, {
      method:'POST',
      body: JSON.stringify({ red, yellow, green, maxEmergency })
    });
    document.getElementById('cfgMsg').textContent =
      r.applied ? '✅ Saved & applied to ESP32' : '⚠️ Saved, ESP32 unreachable';
  } catch (e) { alert('Unsafe config: ' + e.message); }
}

// ---------- INCIDENTS ----------
async function recordIncident() {
  const type = document.getElementById('incType').value;
  const severity = document.getElementById('incSeverity').value;
  const description = document.getElementById('incDesc').value;
  try {
    const r = await api('/api/incidents', { method:'POST',
      body: JSON.stringify({ type, severity, description }) });
    document.getElementById('incMsg').textContent = '✅ Saved, ref: ' + r.ref;
    loadIncidents();
    loadSummary(); 
  } catch (e) { document.getElementById('incMsg').textContent = '❌ ' + e.message; }
}
async function loadIncidents() {
  const data = await api('/api/incidents');
  document.querySelector('#incTable tbody').innerHTML = data.map(i => `
    <tr><td>${i.ref}</td><td>${i.type}</td><td>${i.severity || ''}</td>
        <td>${i.fullname || NAME}</td><td>${i.status || 'Pending'}</td><td>${i.created_at}</td>
        ${ROLE === 'admin' ? `<td class="admin-status-cell">${statusSelect('incident', i.id, i.status || 'Pending')}</td>` : ''}</tr>`).join('');
}

// ---------- PROBLEMS ----------
async function reportProblem() {
  const category = document.getElementById('prbCategory').value;
  const urgency  = document.getElementById('prbUrgency').value;
  const details  = document.getElementById('prbDetails').value;
  try {
    const r = await api('/api/problems', { method:'POST',
      body: JSON.stringify({ category, details, urgency }) });
    document.getElementById('prbMsg').textContent = '✅ Submitted, ref: ' + r.ref;
    loadProblems();
    loadSummary(); 
  } catch (e) { document.getElementById('prbMsg').textContent = '❌ ' + e.message; }
}
async function loadProblems() {
  const data = await api('/api/problems');
  document.querySelector('#prbTable tbody').innerHTML = data.map(p => `
    <tr><td>${p.ref}</td><td>${p.category}</td><td>${p.urgency || ''}</td>
        <td>${p.fullname || NAME}</td><td>${p.status || 'Pending'}</td><td>${p.created_at}</td>
        ${ROLE === 'admin' ? `<td class="admin-status-cell">${statusSelect('problem', p.id, p.status || 'Pending')}</td>` : ''}</tr>`).join('');
}

// ---------- REPORT STATUS MANAGEMENT (ADMIN) ----------
function statusSelect(kind, id, current) {
  const options = ['Pending', 'In Progress', 'Resolved'];
  return `<select aria-label="Update report status" onchange="updateReportStatus('${kind}',${id},this.value)">
    ${options.map(value => `<option value="${value}" ${value === current ? 'selected' : ''}>${value}</option>`).join('')}
  </select>`;
}

async function updateReportStatus(kind, id, newStatus) {
  try {
    await api(`/api/reports/${kind}/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: newStatus })
    });
    await loadSummary();
    if (kind === 'incident') await loadIncidents();
    else await loadProblems();
    
    // If we are currently on the inbox page, reload it
    if (!document.getElementById('view-inbox').classList.contains('hidden')) {
      loadAdminInbox();
    }
  } catch (e) {
    alert('Could not update status: ' + e.message);
  }
}

// ---------- EMERGENCY ----------
async function startEmergency() {
  const direction = document.getElementById('emDirection').value;
  const movement  = document.getElementById('emMovement').value;
  try {
    await api('/api/emergency/start', { method:'POST',
      body: JSON.stringify({ direction, movement }) });
    document.getElementById('emMsg').textContent = '🚨 Emergency ACTIVE';
    loadSummary(); 
  } catch (e) { document.getElementById('emMsg').textContent = '❌ ' + e.message; }
}
async function endEmergency() {
  try {
    await api('/api/emergency/end', { method:'POST' });
    document.getElementById('emMsg').textContent = '✅ Emergency ended, normal ops resumed';
  } catch (e) { document.getElementById('emMsg').textContent = '❌ ' + e.message; }
}

// ---------- EMERGENCY HISTORY ----------
async function loadEmergencyLogs() {
  try {
    const rows = await api('/api/emergency/logs');
    const tbody = document.querySelector('#emergencyLogTable tbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td>${row.id}</td><td>${row.fullname || NAME}</td>
        <td>${row.intersection_name || '-'}</td><td>${row.direction || '-'}</td>
        <td>${row.movement || '-'}</td><td>${row.status}</td>
        <td>${row.start_at || '-'}</td><td>${row.end_at || '—'}</td>
      </tr>`).join('');
  } catch (e) { console.log('Could not load emergency history', e); }
}

// ---------- REPORTS ----------
async function generateReport(fmt) {
  const data = await api('/api/incidents');
  const box = document.getElementById('reportArea');
  if (fmt === 'excel') {
    let csv = 'Ref,Type,Severity,By,Date\n';
    data.forEach(i => csv += `${i.ref},${i.type},${i.severity || ''},${i.fullname || ''},${i.created_at}\n`);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'traffic_report.csv'; a.click();
    return;
  }
  box.innerHTML = `<h4>Traffic Incident Report (${new Date().toLocaleString()})</h4>
    <table><thead><tr><th>Ref</th><th>Type</th><th>Severity</th><th>By</th><th>Date</th></tr></thead>
    <tbody>${data.map(i =>
      `<tr><td>${i.ref}</td><td>${i.type}</td><td>${i.severity || ''}</td>
           <td>${i.fullname || ''}</td><td>${i.created_at}</td></tr>`
    ).join('')}</tbody></table>
    <button class="btn-primary" onclick="window.print()" style="margin-top:12px;">
      Print / Save as PDF
    </button>`;
}

// ---------- ADMIN INBOX (POLICE REPORTS) ----------
async function loadAdminInbox() {
  try {
    const incidents = await api('/api/incidents');
    const problems = await api('/api/problems');
    
    const allReports = [
      ...incidents.map(i => ({ ...i, reportType: 'Incident', subject: i.type })),
      ...problems.map(p => ({ ...p, reportType: 'Problem', subject: p.category }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const tbody = document.querySelector('#inboxTable tbody');
    tbody.innerHTML = allReports.map(r => {
      let badgeColor = '#f39c12';
      if (r.status === 'Resolved') badgeColor = '#2ecc71';
      if (r.status === 'In Progress') badgeColor = '#2f80ed';

      return `
        <tr>
          <td><b>${r.ref}</b></td>
          <td><span style="color:${r.reportType === 'Incident' ? '#ff5c7a' : '#f39c12'}">${r.reportType}</span><br>${r.subject}</td>
          <td>${r.fullname || 'Officer'}</td>
          <td style="max-width: 250px;">${r.description || r.details}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
          <td><span style="background:${badgeColor}; padding: 4px 8px; border-radius: 4px; color: white; font-size: 11px; font-weight: bold;">${r.status || 'Pending'}</span></td>
          <td>
            <select onchange="updateReportStatus('${r.reportType === 'Incident' ? 'incident' : 'problem'}', ${r.id}, this.value)" style="padding: 5px; border-radius: 4px; background: #0f1115; color: white; border: 1px solid #2a3140;">
              <option value="Pending" ${r.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="In Progress" ${r.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Resolved" ${r.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    alert('Failed to load reports: ' + e.message);
  }
}

// ---------- BOOT ----------
window.addEventListener('load', () => {
  if (TOKEN && ROLE) {
    showApp();
  } else {
    showLanding();
  }
});