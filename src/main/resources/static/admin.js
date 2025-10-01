async function fetchJSON(url, options){
  const res = await fetch(url, Object.assign({headers:{'Content-Type':'application/json'}}, options||{}));
  if(!res.ok){
    const cloned = res.clone();
    let msg = 'HTTP '+res.status;
    try {
      const data = await res.json();
      if(typeof data === 'string') msg = data; else if(data.message) msg = data.message; else msg = JSON.stringify(data);
    } catch(e){
      const text = await cloned.text().catch(()=> '');
      msg = text || msg;
    }
    // Fallback tiếng Việt nếu không có thông điệp rõ ràng
    const vi = {
      400: 'Yêu cầu không hợp lệ',
      401: 'Chưa đăng nhập',
      403: 'Không có quyền truy cập',
      404: 'Không tìm thấy tài nguyên',
      409: 'Xung đột dữ liệu',
      500: 'Lỗi máy chủ nội bộ'
    };
    if(!msg || msg === ('HTTP '+res.status) || msg.startsWith('{') || msg.startsWith('[')){
      msg = vi[res.status] || ('Lỗi ('+res.status+')');
    }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

async function loadUsers(){
  const data = await fetchJSON('/admin/users');
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  data.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>
        <select class="form-select form-select-sm" data-id="${u.id}" data-field="role">
          <option ${u.role==='CLIENT'?'selected':''}>CLIENT</option>
          <option ${u.role==='ADMIN'?'selected':''}>ADMIN</option>
        </select>
      </td>
      <td><input type="number" class="form-control form-control-sm" min="100" step="100" value="${u.dataLimitMb}" data-id="${u.id}" data-field="dataLimitMb" /></td>
      <td><input type="text" class="form-control form-control-sm" value="${u.pathOnServer||''}" placeholder="/data/${u.username}" data-id="${u.id}" data-field="pathOnServer" /></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary me-1" onclick="saveUser(${u.id})">Lưu</button>
        <button class="btn btn-sm btn-warning me-1" onclick="promptReset(${u.id})">Đặt lại mật khẩu</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Xoá</button>
      </td>
      <td><button class="btn btn-sm btn-outline-secondary" onclick="viewActivities(${u.id}, '${u.username}')">Lịch sử</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Server Management
async function loadServers(){
  const data = await fetchJSON('/admin/servers');
  const clusters = await fetchJSON('/admin/clusters').catch(() => []);
  let connectedIds = [];
  try { connectedIds = await fetchJSON('/admin/servers/connected'); } catch(e) { connectedIds = []; }

  // Populate cluster list in create-server form
  const createFormClusterSel = document.querySelector('#create-server-form select[name="clusterId"]');
  if(createFormClusterSel){
    createFormClusterSel.innerHTML = '<option value="">-- Cluster --</option>' +
      (clusters||[]).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  const tbodyConn = document.getElementById('servers-connected-tbody');
  const tbodyHist = document.getElementById('servers-history-tbody');
  if(!tbodyConn || !tbodyHist) return;
  tbodyConn.innerHTML = '';
  tbodyHist.innerHTML = '';

  (data || []).forEach(s => {
    const tr = document.createElement('tr');
    const isConnected = connectedIds.includes(s.id);
    const statusCell = isConnected
      ? `<span class="badge bg-success">CONNECTED</span>`
      : `
        <select class="form-select form-select-sm" data-id="${s.id}" data-field="status">
          <option ${s.status==='OFFLINE'?'selected':''}>OFFLINE</option>
          <option ${s.status==='ONLINE'?'selected':''}>ONLINE</option>
        </select>`;
    const reconnectOrDisconnect = isConnected
      ? `<button class="btn btn-sm btn-outline-danger me-1" onclick="disconnectServer(${s.id})">Ngắt kết nối</button>`
      : `<button class="btn btn-sm btn-outline-secondary me-1" onclick="promptReconnect(${s.id})">Kết nối lại</button>`;
    tr.innerHTML = `
      <td>${s.id}</td>
      <td><input class="form-control form-control-sm" value="${s.host}" data-id="${s.id}" data-field="host" /></td>
      <td><input type="number" class="form-control form-control-sm" value="${s.port}" data-id="${s.id}" data-field="port" /></td>
      <td><input class="form-control form-control-sm" value="${s.username}" data-id="${s.id}" data-field="username" /></td>
      <td>
        <select class="form-select form-select-sm" data-id="${s.id}" data-field="clusterId">
          <option value="">--</option>
          ${(clusters||[]).map(c => `<option value="${c.id}" ${s.clusterId===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="form-select form-select-sm" data-id="${s.id}" data-field="role">
          <option ${s.role==='WORKER'?'selected':''}>WORKER</option>
          <option ${s.role==='MASTER'?'selected':''}>MASTER</option>
          <option ${s.role==='STANDALONE'?'selected':''}>STANDALONE</option>
        </select>
      </td>
      <td>${statusCell}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary me-1" onclick="saveServer(${s.id})">Lưu</button>
        <button class="btn btn-sm btn-danger me-1" onclick="deleteServer(${s.id})">Xoá</button>
        ${reconnectOrDisconnect}
        ${isConnected ? `<button class="btn btn-sm btn-dark" onclick="openTerminal(${s.id}, true)">CLI</button>` : ''}
      </td>
    `;
    if(isConnected) tbodyConn.appendChild(tr); else tbodyHist.appendChild(tr);
  });
}

// ================= Kubernetes Cluster UI =================
async function loadClustersAndServers(){
  const [clusters, servers] = await Promise.all([
    fetchJSON('/admin/clusters').catch(()=>[]),
    fetchJSON('/admin/servers').catch(()=>[]),
  ]);
  // Fill cluster select
  const sel = document.getElementById('k8s-cluster-select');
  if(sel){
    sel.innerHTML = '';
    (clusters||[]).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name}`;
      sel.appendChild(opt);
    });
  }
  // Render servers table
  const tbody = document.getElementById('k8s-servers-tbody');
  if(tbody){
    tbody.innerHTML = '';
    (servers||[]).forEach(s => {
      const cName = (clusters||[]).find(c => Number(c.id) === Number(s.clusterId))?.name || '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="k8s-sel" value="${s.id}"></td>
        <td>${s.id}</td>
        <td>${s.host}</td>
        <td>${s.port}</td>
        <td>${s.username}</td>
        <td>${cName}</td>
        <td>${s.status}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  const chkAll = document.getElementById('k8s-check-all');
  if(chkAll){
    chkAll.checked = false;
    chkAll.addEventListener('change', () => {
      document.querySelectorAll('#k8s-servers-tbody .k8s-sel').forEach(el => { el.checked = chkAll.checked; });
    }, { once: true });
  }
}

async function loadClusterList(){
  const clusters = await fetchJSON('/admin/clusters').catch(()=>[]);
  const tbody = document.getElementById('clusters-tbody');
  if(!tbody) return;
  const search = (document.getElementById('cluster-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('cluster-status-filter')?.value || '';
  tbody.innerHTML = '';
  (clusters||[])
    .filter(c => (!search || String(c.name||'').toLowerCase().includes(search))
              && (!statusFilter || String(c.status||'') === statusFilter))
    .forEach(c => {
      const badge = c.status==='HEALTHY' ? 'success' : (c.status==='WARNING' ? 'warning text-dark' : 'danger');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td>${c.name || ''}</td>
        <td>${c.masterNode || ''}</td>
        <td>${c.workerCount ?? 0}</td>
        <td><span class="badge bg-${badge}">${c.status || ''}</span></td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-primary cluster-view-btn" data-id="${c.id}">View</button>
          <button class="btn btn-sm btn-outline-danger cluster-delete-btn" data-id="${c.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  // bind search/filter
  const searchEl = document.getElementById('cluster-search');
  const filterEl = document.getElementById('cluster-status-filter');
  if(searchEl && !searchEl.dataset.bound){ searchEl.dataset.bound='1'; searchEl.addEventListener('input', loadClusterList); }
  if(filterEl && !filterEl.dataset.bound){ filterEl.dataset.bound='1'; filterEl.addEventListener('change', loadClusterList); }
}

async function showClusterDetail(clusterId){
  // toggle sections
  document.getElementById('k8s-list')?.classList.add('d-none');
  document.getElementById('k8s-create')?.classList.add('d-none');
  document.getElementById('k8s-assign')?.classList.add('d-none');
  document.getElementById('k8s-detail')?.classList.remove('d-none');

  const detail = await fetchJSON(`/admin/clusters/${clusterId}/detail`).catch(()=>null);
  if(!detail){
    const msg = document.getElementById('cd-msg');
    if(msg){ msg.textContent = 'Không tải được chi tiết cluster'; msg.className='small text-danger'; }
    return;
  }
  document.getElementById('cd-name').textContent = detail.name || '';
  document.getElementById('cd-master').textContent = detail.masterNode || '';
  document.getElementById('cd-workers').textContent = detail.workerCount ?? 0;
  document.getElementById('cd-status').textContent = detail.status || '';
  document.getElementById('cd-version').textContent = detail.version || '';

  const tbody = document.getElementById('cd-nodes-tbody');
  tbody.innerHTML = '';
  (detail.nodes||[]).forEach(n => {
    const statusBadge = n.status==='ONLINE'||n.status==='Ready' ? 'success' : (n.status==='WARNING'||n.status==='NotReady' ? 'warning text-dark' : 'danger');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${n.ip}</td>
      <td>${n.role}</td>
      <td><span class="badge bg-${statusBadge}">${n.status}</span></td>
      <td>${n.cpu || '-'}</td>
      <td>${n.ram || '-'}</td>
      <td>${n.disk || '-'}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-danger cd-remove-node" data-id="${n.id}" data-cluster="${clusterId}">Delete</button>
        <button class="btn btn-sm btn-outline-secondary cd-retry-node" data-id="${n.id}" data-cluster="${clusterId}">Retry</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const backBtn = document.getElementById('cd-back');
  if(backBtn && !backBtn.dataset.bound){
    backBtn.dataset.bound='1';
    backBtn.addEventListener('click', async () => {
      document.getElementById('k8s-detail')?.classList.add('d-none');
      document.getElementById('k8s-list')?.classList.remove('d-none');
      document.getElementById('k8s-create')?.classList.remove('d-none');
      document.getElementById('k8s-assign')?.classList.remove('d-none');
      await loadClusterList();
    });
  }
}

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if(f && f.id === 'create-cluster-form'){
    e.preventDefault();
    const body = { name: f.name.value.trim(), description: f.description.value.trim() || null };
    const msg = document.getElementById('cluster-msg');
    try{
      await fetchJSON('/admin/clusters', { method: 'POST', body: JSON.stringify(body) });
      msg.textContent = 'Đã tạo cluster'; msg.className = 'mt-2 small text-success';
      f.reset();
      await loadClustersAndServers();
    }catch(err){
      msg.textContent = err.message || 'Tạo cluster thất bại'; msg.className = 'mt-2 small text-danger';
    }
  }
});

document.addEventListener('click', async (e) => {
  const t = e.target;
  if(t && t.id === 'btn-assign-selected'){
    e.preventDefault();
    const clusterSel = document.getElementById('k8s-cluster-select');
    const clusterId = clusterSel && clusterSel.value ? parseInt(clusterSel.value, 10) : null;
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value,10));
    const msg = document.getElementById('k8s-assign-msg');
    if(!ids.length){ if(msg){ msg.textContent='Vui lòng chọn máy chủ'; msg.className='mt-2 small text-danger'; } return; }
    if(!clusterId){ if(msg){ msg.textContent='Vui lòng chọn cluster'; msg.className='mt-2 small text-danger'; } return; }
    const btn = t; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang gán...';
    try{
      await bulkAssignServers(ids, clusterId);
      if(msg){ msg.textContent = `Đã gán ${ids.length} máy vào cluster`; msg.className='mt-2 small text-success'; }
      await loadClustersAndServers();
    }catch(err){
      if(msg){ msg.textContent = err.message || 'Gán thất bại'; msg.className='mt-2 small text-danger'; }
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  if(t && t.id === 'btn-remove-selected'){
    e.preventDefault();
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value,10));
    const msg = document.getElementById('k8s-assign-msg');
    if(!ids.length){ if(msg){ msg.textContent='Vui lòng chọn máy chủ'; msg.className='mt-2 small text-danger'; } return; }
    const btn = t; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang bỏ...';
    try{
      // use sentinel -1 to indicate clear on backend
      await bulkAssignServers(ids, -1);
      if(msg){ msg.textContent = `Đã bỏ ${ids.length} máy khỏi cluster`; msg.className='mt-2 small text-success'; }
      await loadClustersAndServers();
    }catch(err){
      if(msg){ msg.textContent = err.message || 'Bỏ khỏi cluster thất bại'; msg.className='mt-2 small text-danger'; }
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  if(t && t.classList.contains('cluster-delete-btn')){
    e.preventDefault();
    const id = parseInt(t.getAttribute('data-id'), 10);
    if(isNaN(id)) return;
    if(!confirm('Xoá cluster này? Các server sẽ được gỡ khỏi cluster.')) return;
    const msg = document.getElementById('clusters-msg');
    const btn = t; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang xoá...';
    try{
      await fetch(`/admin/clusters/${id}`, { method: 'DELETE' });
      if(msg){ msg.textContent = 'Đã xoá cluster'; msg.className='small text-success'; }
      await loadClusterList();
    }catch(err){
      if(msg){ msg.textContent = err.message || 'Xoá cluster thất bại'; msg.className='small text-danger'; }
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  if(t && t.classList.contains('cluster-view-btn')){
    e.preventDefault();
    const id = parseInt(t.getAttribute('data-id'), 10);
    if(isNaN(id)) return;
    await showClusterDetail(id);
  }
});

async function bulkAssignServers(ids, clusterId){
  // naive sequential updates via existing API PUT /admin/servers/{id}
  for(const id of ids){
    const body = { clusterId: clusterId };
    await fetchJSON(`/admin/servers/${id}`, { method:'PUT', body: JSON.stringify(body) }).catch(()=>{});
  }
}

async function promptReconnect(id){
  const pw = prompt('Nhập mật khẩu để kết nối lại:');
  if(!pw) return;
  try{
    await fetchJSON(`/admin/servers/${id}/reconnect`, {method:'POST', body: JSON.stringify({password: pw})});
    await loadServers('connected');
  }catch(err){
    alert(err.message || 'Kết nối lại thất bại');
  }
}

async function createServer(ev){
  ev.preventDefault();
  const f = ev.target;
  const msgEl = document.getElementById('server-msg');
  msgEl.textContent = '';
  const body = {
    host: f.host.value.trim(),
    port: parseInt(f.port.value, 10),
    username: f.username.value.trim(),
    password: f.password.value,
    role: f.role.value,
    clusterId: (f.clusterId && f.clusterId.value) ? parseInt(f.clusterId.value, 10) : null
  };
  const btn = f.querySelector('button[type="submit"]');
  try {
    btn.disabled = true; btn.textContent = 'Đang thêm...';
    await fetchJSON('/admin/servers', {method:'POST', body: JSON.stringify(body)});
    msgEl.textContent = 'Thêm máy chủ thành công';
    msgEl.className = 'mt-2 small text-success';
    f.reset(); f.port.value = 22; f.role.value='WORKER';
    loadServers();
  } catch(err){
    msgEl.textContent = err.message || 'Thêm server thất bại';
    msgEl.className = 'mt-2 small text-danger';
  } finally {
    btn.disabled = false; btn.textContent = 'Thêm máy chủ';
  }
}

async function saveServer(id){
  const host = document.querySelector(`input[data-id="${id}"][data-field="host"]`).value.trim();
  const port = parseInt(document.querySelector(`input[data-id="${id}"][data-field="port"]`).value, 10);
  const username = document.querySelector(`input[data-id="${id}"][data-field="username"]`).value.trim();
  const clusterSel = document.querySelector(`select[data-id="${id}"][data-field="clusterId"]`);
  const clusterId = clusterSel && clusterSel.value ? parseInt(clusterSel.value, 10) : null;
  const role = document.querySelector(`select[data-id="${id}"][data-field="role"]`).value;
  const statusSel = document.querySelector(`select[data-id="${id}"][data-field="status"]`);
  const body = {host, port, username, role, clusterId};
  if(statusSel){ body.status = statusSel.value; }
  const msg = document.getElementById('server-save-msg');
  try {
    await fetchJSON(`/admin/servers/${id}`, {method:'PUT', body: JSON.stringify(body)});
    msg.textContent = `Lưu máy ${id} thành công`;
    msg.className = 'small mb-2 text-success';
    msg.scrollIntoView({behavior:'smooth', block:'nearest'});
    setTimeout(()=>{ if(msg) msg.textContent=''; }, 3000);
    await loadServers();
  } catch(e){
    msg.textContent = e.message || `Lưu máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
    msg.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
}

async function deleteServer(id){
  if(!confirm('Xoá server này?')) return;
  const msg = document.getElementById('server-save-msg');
  try{
    await fetch(`/admin/servers/${id}`, {method:'DELETE'});
    msg.textContent = `Đã xoá máy ${id}`;
    msg.className = 'small mb-2 text-success';
    await loadServers();
  }catch(e){
    msg.textContent = `Xoá máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
  }
}

async function disconnectServer(id){
  const msg = document.getElementById('server-save-msg');
  try{
    await fetchJSON(`/admin/servers/${id}/disconnect`, { method: 'POST' });
    msg.textContent = `Đã ngắt kết nối máy ${id}`;
    msg.className = 'small mb-2 text-success';
    await loadServers();
  }catch(e){
    msg.textContent = e.message || `Ngắt kết nối máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
  }
}

async function createUser(ev){
  ev.preventDefault();
  const form = ev.target;
  const body = {
    username: form.username.value.trim(),
    password: form.password.value,
    role: form.role.value,
    dataLimitMb: parseInt(form.dataLimitMb.value, 10),
    pathOnServer: form.pathOnServer.value.trim() || null
  };
  await fetchJSON('/admin/users', {method: 'POST', body: JSON.stringify(body)});
  form.reset();
  loadUsers();
}

async function saveUser(id){
  const selRole = document.querySelector(`select[data-id="${id}"][data-field="role"]`);
  const inpQuota = document.querySelector(`input[data-id="${id}"][data-field="dataLimitMb"]`);
  const inpPath = document.querySelector(`input[data-id="${id}"][data-field="pathOnServer"]`);
  const body = { role: selRole.value, dataLimitMb: parseInt(inpQuota.value, 10), pathOnServer: inpPath.value.trim() };
  await fetchJSON(`/admin/users/${id}`, {method: 'PUT', body: JSON.stringify(body)});
  loadUsers();
}

async function promptReset(id){
  const pw = prompt('Nhập mật khẩu mới:');
  if(!pw) return;
  await fetchJSON(`/admin/users/${id}/reset-password`, {method: 'POST', body: JSON.stringify({password: pw})});
  alert('Đã đặt lại mật khẩu');
}

async function deleteUser(id){
  if(!confirm('Xoá user này?')) return;
  await fetch(`/admin/users/${id}`, {method: 'DELETE'});
  loadUsers();
}

async function viewActivities(id, username){
  const data = await fetchJSON(`/admin/users/${id}/activities`);
  const list = document.getElementById('activity-list');
  const title = document.getElementById('activity-title');
  title.textContent = `Lịch sử - ${username}`;
  list.innerHTML = '';
  data.forEach(a => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `${a.createdAt || ''} - ${a.action}: ${a.details || ''} ${a.ip?('('+a.ip+')'):''}`;
    list.appendChild(li);
  });
  const modal = new bootstrap.Modal(document.getElementById('activityModal'));
  modal.show();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('create-user-form');
  form.addEventListener('submit', createUser);
  loadUsers();
  // Section toggling
  const sectionIds = ['user','server','k8s','service','app','monitor'];
  async function showSection(key){
    sectionIds.forEach(id => {
      const el = document.getElementById('section-'+id);
      if(el){ el.classList.toggle('d-none', id !== key); }
    });
    if(key==='user'){ loadUsers(); }
    if(key==='server'){
      await loadServers();
      try{
        // tự động kiểm tra trạng thái sau khi vào tab server
        await fetchJSON('/admin/servers/check-status', {method:'POST'});
        await loadServers();
      }catch(_){ /* ignore */ }
    }
    if(key==='k8s'){
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    }
  }
  document.querySelectorAll('.navbar .dropdown-menu a.dropdown-item, .navbar .nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
      if(href.startsWith('#')){
        const key = href.replace('#','');
        if(['user','server','k8s','service','app','monitor'].includes(key)){
          e.preventDefault();
          showSection(key);
          document.querySelector('.navbar-collapse')?.classList.remove('show');
        }
      }
    });
  });
  // default
  showSection('user');

  // bind server forms
  const newSrv = document.getElementById('create-server-form');
  if(newSrv){ newSrv.addEventListener('submit', createServer); }
  const btnCheck = document.getElementById('btn-check-status');
  if(btnCheck){
    btnCheck.addEventListener('click', async () => {
      try{
        btnCheck.disabled = true; btnCheck.textContent = 'Đang kiểm tra...';
        await fetchJSON('/admin/servers/check-status', {method:'POST'});
        await loadServers();
      } finally {
        btnCheck.disabled = false; btnCheck.textContent = 'Kiểm tra trạng thái';
      }
    });
  }
});

// ================= Web Terminal =================
let termWS = null;
let termInfo = {host:'', port:22, username:'', id:null};
let term = null; // xterm instance

function ensureXTerm(){
  if(term) return term;
  const container = document.getElementById('term-output');
  if(!container) return null;
  term = new window.Terminal({
    fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 13,
    theme: { background: '#0b1020' },
    cursorBlink: true,
    convertEol: true,
  });
  term.open(container);
  return term;
}

function appendTerm(text){
  const t = ensureXTerm();
  if(!t) return;
  t.write(text);
}

function connectTerminal(){
  if(termWS && termWS.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  termWS = new WebSocket(proto + '://' + location.host + '/ws/terminal');
  termWS.onopen = () => {
    appendTerm('[client] Connected, opening SSH...\n');
    // If password field exists we can send password login, else require auto via session
    const passEl = document.getElementById('term-pass');
    if(passEl){
      const pass = passEl.value || '';
      termWS.send(JSON.stringify({host: termInfo.host, port: termInfo.port, username: termInfo.username, password: pass}));
    } else {
      termWS.send(JSON.stringify({host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id}));
    }
  };
  termWS.onmessage = (e) => appendTerm(e.data);
  termWS.onclose = () => appendTerm('\n[client] Disconnected.\n');
  termWS.onerror = () => appendTerm('\n[client] Error.\n');
}

function connectTerminalAuto(){
  if(termWS && termWS.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  termWS = new WebSocket(proto + '://' + location.host + '/ws/terminal');
  termWS.onopen = () => {
    appendTerm('[client] Connected, opening SSH (auto) ...\n');
    termWS.send(JSON.stringify({host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id}));
  };
  termWS.onmessage = (e) => appendTerm(e.data);
  termWS.onclose = () => appendTerm('\n[client] Disconnected.\n');
  termWS.onerror = () => appendTerm('\n[client] Error.\n');
}

function openTerminal(id, isConnected){
  // Get current values from row inputs
  const host = document.querySelector(`input[data-id="${id}"][data-field="host"]`)?.value.trim();
  const port = parseInt(document.querySelector(`input[data-id="${id}"][data-field="port"]`)?.value || '22', 10);
  const username = document.querySelector(`input[data-id="${id}"][data-field="username"]`)?.value.trim();
  termInfo = {host, port, username, id};
  document.getElementById('term-host').value = host || '';
  document.getElementById('term-port').value = isNaN(port)?'':String(port);
  document.getElementById('term-user').value = username || '';
  document.getElementById('term-pass').value = '';
  const title = document.getElementById('terminal-title');
  if(title) title.textContent = `${host || ''}:${port || ''} (${username || ''})`;
  const out = document.getElementById('term-output');
  if(out){ out.innerHTML = ''; }
  if(term){ try { term.dispose(); } catch(_){} term = null; }
  const modal = new bootstrap.Modal(document.getElementById('terminalModal'));
  modal.show();
  if(isConnected){
    setTimeout(() => connectTerminalAuto(), 200);
  }
}

document.addEventListener('submit', (e) => {
  const f = e.target;
  if(f && f.id === 'term-input-form'){
    e.preventDefault();
    const inp = document.getElementById('term-input');
    const val = inp.value;
    if(val && termWS && termWS.readyState === WebSocket.OPEN){
      termWS.send(val.endsWith('\n') ? val : (val + '\n'));
    } else if(val && term) {
      // echo locally if not connected
      term.write(val + '\r\n');
    }
    inp.value = '';
  }
});

document.addEventListener('hidden.bs.modal', (e) => {
  if(e.target && e.target.id === 'terminalModal'){
    try { termWS?.close(); } catch(_){}
    termWS = null;
  }
});

document.addEventListener('click', (e) => {
  const t = e.target;
  if(t && t.id === 'term-connect-btn'){
    e.preventDefault();
    connectTerminal();
  }
});


