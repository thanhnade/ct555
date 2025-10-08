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
  let connectedIds = [];
  try { connectedIds = await fetchJSON('/admin/servers/connected'); } catch(e) { connectedIds = []; }

  // Auth/SSH key selection đã bỏ; password là bắt buộc khi tạo lần đầu

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
      <td><input class="form-control form-control-sm" value="${s.host}" data-id="${s.id}" data-field="host" data-old-host="${s.host||''}" /></td>
      <td><input type="number" class="form-control form-control-sm" value="${s.port}" data-id="${s.id}" data-field="port" data-old-port="${s.port!=null?s.port:''}" /></td>
      <td><input class="form-control form-control-sm" value="${s.username}" data-id="${s.id}" data-field="username" data-old-username="${s.username||''}" /></td>
      <td>${statusCell}</td>
      <td>${s.lastConnected ? new Date(s.lastConnected).toLocaleString() : ''}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary me-1" onclick="saveServer(${s.id}, this)">Lưu</button>
        <button class="btn btn-sm btn-danger me-1" onclick="deleteServer(${s.id})">Xoá</button>
        <button class="btn btn-sm btn-outline-primary me-1 d-none" onclick="testKey(${s.id})">Test Key</button>
        <button class="btn btn-sm btn-outline-warning me-1 d-none" onclick="enablePublicKey(${s.id})">Enable PublicKey</button>
        <button class="btn btn-sm btn-outline-secondary me-1 d-none" onclick="showKey(${s.id})">Show Key</button>
        ${reconnectOrDisconnect}
        ${isConnected ? `<button class="btn btn-sm btn-dark" onclick="openTerminal(${s.id}, true)">CLI</button>` : ''}
      </td>
    `;
    if(isConnected) tbodyConn.appendChild(tr); else tbodyHist.appendChild(tr);
  });
}

// ================= Kubernetes Cluster UI =================
async function loadClustersAndServers(){
  const [clusters, servers, connectedIds] = await Promise.all([
    fetchJSON('/admin/clusters').catch(()=>[]),
    fetchJSON('/admin/servers').catch(()=>[]),
    fetchJSON('/admin/servers/connected').catch(()=>[]),
  ]);
  // Điền cluster select
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
  // Hiển thị bảng servers
  const tbody = document.getElementById('k8s-servers-tbody');
  if(tbody){
    tbody.innerHTML = '';
    (servers||[]).forEach(s => {
      const cName = (clusters||[]).find(c => Number(c.id) === Number(s.clusterId))?.name || '';
      const isConnected = (connectedIds||[]).includes(s.id);
      const statusBadge = isConnected ? 
        '<span class="badge bg-success">CONNECTED</span>' : 
        '<span class="badge bg-secondary">OFFLINE</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="k8s-sel" value="${s.id}"></td>
        <td>${s.id}</td>
        <td>${s.host}</td>
        <td>${s.port}</td>
        <td>${s.username}</td>
        <td>
          <select class="form-select form-select-sm" data-id="${s.id}" data-field="cluster">
            <option value="">-- Chọn cluster --</option>
            ${(clusters||[]).map(c => `<option value="${c.id}" ${s.clusterId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm" data-id="${s.id}" data-field="role">
            <option value="WORKER" ${s.role==='WORKER'?'selected':''}>WORKER</option>
            <option value="MASTER" ${s.role==='MASTER'?'selected':''}>MASTER</option>
          </select>
        </td>
        <td>${statusBadge}</td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-primary me-1" onclick="saveServerClusterAndRole(${s.id})" title="Lưu thay đổi cluster và role">
            <i class="bi bi-check-lg"></i> Lưu
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="removeSingleServerFromCluster(${s.id})" title="Gỡ server này khỏi cluster">
            <i class="bi bi-x-circle"></i> Bỏ khỏi Cluster
          </button>
        </td>
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
  try {
    const clusters = await fetchJSON('/admin/clusters').catch(()=>[]);
    const tbody = document.getElementById('clusters-tbody');
    if(!tbody) {
      console.error('clusters-tbody element not found');
      return;
    }
    const search = (document.getElementById('cluster-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('cluster-status-filter')?.value || '';
    tbody.innerHTML = '';
    
    if(!clusters || clusters.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="text-center text-muted">Chưa có cluster nào</td>';
      tbody.appendChild(tr);
      return;
    }
    
    (clusters||[])
      .filter(c => (!search || String(c.name||'').toLowerCase().includes(search))
                && (!statusFilter || String(c.status||'') === statusFilter))
      .forEach(c => {
        const status = c.status || 'ERROR';
        const badge = status==='HEALTHY' ? 'success' : (status==='WARNING' ? 'warning text-dark' : 'danger');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${c.id || ''}</td>
          <td>${c.name || ''}</td>
          <td>${c.masterNode || ''}</td>
          <td>${c.workerCount ?? 0}</td>
          <td><span class="badge bg-${badge}">${status}</span></td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-primary cluster-view-btn" data-id="${c.id}">View</button>
            ${c.isOwner ? `<button class="btn btn-sm btn-outline-danger cluster-delete-btn" data-id="${c.id}">Delete</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });
    // Liên kết search/filter
    const searchEl = document.getElementById('cluster-search');
    const filterEl = document.getElementById('cluster-status-filter');
    if(searchEl && !searchEl.dataset.bound){ searchEl.dataset.bound='1'; searchEl.addEventListener('input', loadClusterList); }
    if(filterEl && !filterEl.dataset.bound){ filterEl.dataset.bound='1'; filterEl.addEventListener('change', loadClusterList); }
  } catch(err) {
    console.error('Error loading cluster list:', err);
  }
}

async function showClusterDetail(clusterId){
  // Chuyển đổi sections
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
    const btn = f.querySelector('button[type="submit"]');
    
    if(!msg) {
      console.error('cluster-msg element not found');
      return;
    }
    
    try{
      btn.disabled = true; btn.textContent = 'Đang tạo...';
      await fetchJSON('/admin/clusters', { method: 'POST', body: JSON.stringify(body) });
      msg.textContent = 'Đã tạo cluster thành công'; 
      msg.className = 'mt-2 small text-success';
      f.reset();
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    }catch(err){
      console.error('Cluster creation error:', err);
      msg.textContent = err.message || 'Tạo cluster thất bại'; 
      msg.className = 'mt-2 small text-danger';
    } finally {
      btn.disabled = false; btn.textContent = 'Tạo';
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
      // Gán server vào cluster nhưng giữ nguyên role hiện tại
      await bulkAssignServersToCluster(ids, clusterId);
      if(msg){ msg.textContent = `Đã gán ${ids.length} máy vào cluster`; msg.className='mt-2 small text-success'; }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    }catch(err){
      if(msg){ msg.textContent = err.message || 'Gán thất bại'; msg.className='mt-2 small text-danger'; }
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  if(t && t.id === 'btn-update-role-selected'){
    e.preventDefault();
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value,10));
    const msg = document.getElementById('k8s-assign-msg');
    if(!ids.length){ 
      if(msg){ 
        msg.textContent='Vui lòng chọn máy chủ'; 
        msg.className='mt-2 small text-danger'; 
      } 
      return; 
    }
    
    const roleSelect = document.getElementById('k8s-role-select');
    const selectedRole = roleSelect ? roleSelect.value : 'WORKER';
    
    if(!confirm(`Cập nhật role thành ${selectedRole} cho ${ids.length} máy chủ (không thay đổi cluster)?`)) return;
    
    const btn = t; 
    btn.disabled = true; 
    const old = btn.textContent; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang cập nhật...';
    
    try{
      // Cập nhật role cho nhiều server mà không thay đổi cluster
      await bulkUpdateServerRoles(ids, selectedRole);
      if(msg){ 
        msg.textContent = `Đã cập nhật role thành ${selectedRole} cho ${ids.length} máy chủ (giữ nguyên cluster)`; 
        msg.className='mt-2 small text-success'; 
      }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    }catch(err){
      console.error('Lỗi khi cập nhật role máy chủ:', err);
      if(msg){ 
        msg.textContent = err.message || 'Cập nhật role thất bại'; 
        msg.className='mt-2 small text-danger'; 
      }
    } finally {
      btn.disabled = false; 
      btn.textContent = old;
    }
  }
  if(t && t.id === 'btn-remove-selected'){
    e.preventDefault();
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value,10));
    const msg = document.getElementById('k8s-assign-msg');
    if(!ids.length){ 
      if(msg){ 
        msg.textContent='Vui lòng chọn máy chủ'; 
        msg.className='mt-2 small text-danger'; 
      } 
      return; 
    }
    
    if(!confirm(`Bỏ ${ids.length} máy chủ khỏi cluster?`)) return;
    
    const btn = t; 
    btn.disabled = true; 
    const old = btn.textContent; 
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang bỏ...';
    
    try{
      // Sử dụng sentinel -1 để chỉ định xóa trên backend
      await bulkAssignServers(ids, -1);
      if(msg){ 
        msg.textContent = `Đã bỏ ${ids.length} máy khỏi cluster`; 
        msg.className='mt-2 small text-success'; 
      }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    }catch(err){
      console.error('Lỗi khi bỏ nhiều máy chủ khỏi cluster:', err);
      if(msg){ 
        msg.textContent = err.message || 'Bỏ khỏi cluster thất bại'; 
        msg.className='mt-2 small text-danger'; 
      }
    } finally {
      btn.disabled = false; 
      btn.textContent = old;
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
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
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
  // Lấy dữ liệu server hiện tại để giữ nguyên role khi bỏ khỏi cluster
  const servers = await fetchJSON('/admin/servers').catch(() => []);
  
  // Cập nhật tuần tự qua API PUT /admin/servers/{id}
  for(const id of ids){
    const body = { clusterId: clusterId };
    // Nếu bỏ khỏi cluster (clusterId = -1), giữ nguyên role hiện tại thay vì set về STANDALONE
    if (clusterId === -1) {
      const server = servers.find(s => s.id === id);
      const currentRole = server ? server.role : 'WORKER'; // Dự phòng WORKER nếu không tìm thấy
      body.role = currentRole;
      console.log('Đang bỏ nhiều máy chủ khỏi cluster (giữ nguyên role):', { id, currentRole });
    }
    await fetchJSON(`/admin/servers/${id}`, { method:'PUT', body: JSON.stringify(body) }).catch(()=>{});
  }
}

async function bulkAssignServersWithRole(ids, clusterId, role){
  // Cập nhật tuần tự qua API PUT /admin/servers/{id}
  for(const id of ids){
    const body = { clusterId: clusterId, role: role };
    await fetchJSON(`/admin/servers/${id}`, { method:'PUT', body: JSON.stringify(body) }).catch(()=>{});
  }
}

async function bulkAssignServersToCluster(ids, clusterId){
  // Lấy dữ liệu server hiện tại để giữ nguyên role
  const servers = await fetchJSON('/admin/servers').catch(() => []);
  
  // Gán server vào cluster nhưng giữ nguyên role hiện tại
  for(const id of ids){
    const server = servers.find(s => s.id === id);
    const currentRole = server ? server.role : 'WORKER'; // Dự phòng WORKER nếu không tìm thấy
    const body = { clusterId: clusterId, role: currentRole };
    console.log('Đang gán máy chủ vào cluster:', { id, clusterId, currentRole });
    await fetchJSON(`/admin/servers/${id}`, { method:'PUT', body: JSON.stringify(body) }).catch(()=>{});
  }
}

async function bulkUpdateServerRoles(ids, newRole){
  // Lấy dữ liệu server hiện tại để giữ nguyên cluster
  const servers = await fetchJSON('/admin/servers').catch(() => []);
  
  // Cập nhật role cho nhiều server mà không thay đổi cluster
  for(const id of ids){
    const server = servers.find(s => s.id === id);
    const currentClusterId = server && server.clusterId ? server.clusterId : null;
    const body = { role: newRole };
    if (currentClusterId) {
      body.clusterId = currentClusterId; // Giữ nguyên cluster hiện tại
    }
    console.log('Đang cập nhật role máy chủ:', { id, newRole, currentClusterId, body });
    await fetchJSON(`/admin/servers/${id}`, { method:'PUT', body: JSON.stringify(body) }).catch(()=>{});
  }
}

async function saveServerRole(serverId){
  // Tìm server row trước, sau đó tìm role select trong row đó
  const serverRow = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
  const roleSelect = serverRow ? serverRow.querySelector('select[data-field="role"]') : null;
  if(!roleSelect) {
    console.error('Không tìm thấy role select cho server', serverId);
    return;
  }
  
  const newRole = roleSelect.value;
  const btn = document.querySelector(`button[onclick="saveServerRole(${serverId})"]`);
  const msg = document.getElementById('k8s-assign-msg');
  
  if(btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang lưu...';
  }
  
  try{
    const body = { role: newRole };
    console.log('Đang lưu role máy chủ:', { serverId, newRole, body });
    await fetchJSON(`/admin/servers/${serverId}`, { method:'PUT', body: JSON.stringify(body) });
    
    if(msg) {
      msg.textContent = `Đã cập nhật role thành ${newRole} cho server ${serverId}`;
      msg.className = 'mt-2 small text-success';
    }
    
    // Tải lại cả danh sách cluster và bảng gán server
    await Promise.all([loadClusterList(), loadClustersAndServers()]);
  }catch(err){
    if(msg) {
      msg.textContent = err.message || 'Cập nhật role thất bại';
      msg.className = 'mt-2 small text-danger';
    }
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Lưu';
    }
  }
}

async function saveServerClusterAndRole(serverId){
  // Tìm server row trước, sau đó tìm cluster và role select trong row đó
  const serverRow = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
  const clusterSelect = serverRow ? serverRow.querySelector('select[data-field="cluster"]') : null;
  const roleSelect = serverRow ? serverRow.querySelector('select[data-field="role"]') : null;
  
  if(!clusterSelect || !roleSelect) {
    console.error('Không tìm thấy cluster hoặc role select cho server', serverId);
    return;
  }
  
  const newClusterId = clusterSelect.value ? parseInt(clusterSelect.value, 10) : null;
  const newRole = roleSelect.value;
  const btn = document.querySelector(`button[onclick="saveServerClusterAndRole(${serverId})"]`);
  const msg = document.getElementById('k8s-assign-msg');
  
  if(btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang lưu...';
  }
  
  try{
    const body = { role: newRole };
    if (newClusterId) {
      body.clusterId = newClusterId;
    } else {
      body.clusterId = null; // Bỏ khỏi cluster
    }
    
    console.log('Đang lưu cluster và role máy chủ:', { serverId, newClusterId, newRole, body });
    await fetchJSON(`/admin/servers/${serverId}`, { method:'PUT', body: JSON.stringify(body) });
    
    if(msg) {
      const clusterName = newClusterId ? clusterSelect.options[clusterSelect.selectedIndex].text : 'không có cluster';
      msg.textContent = `Đã cập nhật server ${serverId}: cluster "${clusterName}", role ${newRole}`;
      msg.className = 'mt-2 small text-success';
    }
    
    // Tải lại cả danh sách cluster và bảng gán server
    await Promise.all([loadClusterList(), loadClustersAndServers()]);
  }catch(err){
    console.error('Lỗi khi lưu cluster và role máy chủ:', err);
    if(msg) {
      msg.textContent = err.message || 'Cập nhật cluster và role thất bại';
      msg.className = 'mt-2 small text-danger';
    }
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Lưu';
    }
  }
}

async function removeSingleServerFromCluster(serverId){
  if(!confirm('Bỏ server này khỏi cluster?')) return;
  
  const btn = document.querySelector(`button[onclick="removeSingleServerFromCluster(${serverId})"]`);
  const msg = document.getElementById('k8s-assign-msg');
  
  if(btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang bỏ...';
  }
  
  try{
    // Lấy dữ liệu server hiện tại để giữ nguyên role
    const servers = await fetchJSON('/admin/servers').catch(() => []);
    const server = servers.find(s => s.id === serverId);
    const currentRole = server ? server.role : 'WORKER'; // Dự phòng WORKER nếu không tìm thấy
    
    const body = { clusterId: null, role: currentRole };
    console.log('Đang bỏ máy chủ đơn lẻ khỏi cluster (giữ nguyên role):', { serverId, currentRole, body });
    await fetchJSON(`/admin/servers/${serverId}`, { method:'PUT', body: JSON.stringify(body) });
    
    if(msg) {
      msg.textContent = `Đã bỏ server ${serverId} khỏi cluster`;
      msg.className = 'mt-2 small text-success';
    }
    
    // Tải lại cả danh sách cluster và bảng gán server
    await Promise.all([loadClusterList(), loadClustersAndServers()]);
  }catch(err){
    console.error('Lỗi khi bỏ máy chủ đơn lẻ khỏi cluster:', err);
    if(msg) {
      msg.textContent = err.message || 'Bỏ khỏi cluster thất bại';
      msg.className = 'mt-2 small text-danger';
    }
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-x-circle"></i> Bỏ khỏi Cluster';
    }
  }
}

async function promptReconnect(id){
  // Thử key-first bằng check-status nhanh cho riêng server này nếu cần (đơn giản: gọi check-status toàn bộ)
  try{
    await fetchJSON('/admin/servers/check-status', {method:'POST'});
    const connected = await fetchJSON('/admin/servers/connected').catch(()=>[]);
    if(Array.isArray(connected) && connected.includes(id)){
      await loadServers('connected');
      return;
    }
  }catch(_){ /* ignore */ }
  const pw = prompt('SSH key không khả dụng hoặc kết nối bằng key thất bại. Nhập mật khẩu để kết nối lại:');
  if(!pw) return;
  try{
    await fetchJSON(`/admin/servers/${id}/reconnect`, {method:'POST', body: JSON.stringify({password: pw})});
    await loadServers('connected');
  }catch(err){
    alert(err.message || 'Kết nối lại thất bại');
  }
}

async function testKey(id){
  const msg = document.getElementById('server-save-msg');
  try{
    const res = await fetchJSON(`/admin/servers/${id}/test-key`, {method:'POST'});
    if(res && res.ok){
      msg.textContent = res.message || `SSH key cho máy ${id} hoạt động`;
      msg.className = 'small mb-2 text-success';
      await loadServers();
    } else {
      msg.textContent = res.message || `SSH key cho máy ${id} không hoạt động`;
      msg.className = 'small mb-2 text-danger';
    }
  }catch(e){
    msg.textContent = e.message || `SSH key cho máy ${id} không hoạt động`;
    msg.className = 'small mb-2 text-danger';
  }
}

async function enablePublicKey(id){
  const msg = document.getElementById('server-save-msg');
  const sudoPassword = prompt('Nhập mật khẩu sudo để bật PublicKey trên máy đích:');
  if(!sudoPassword) return;
  try{
    const res = await fetchJSON(`/admin/servers/${id}/enable-publickey`, {method:'POST', body: JSON.stringify({ sudoPassword })});
    if(res && res.ok){
      msg.textContent = 'Đã bật PublicKey trên máy đích. Thử Test Key lại.';
      msg.className = 'small mb-2 text-success';
    } else {
      msg.textContent = res.message || 'Bật PublicKey thất bại';
      msg.className = 'small mb-2 text-danger';
    }
  }catch(e){
    msg.textContent = e.message || 'Bật PublicKey thất bại';
    msg.className = 'small mb-2 text-danger';
  }
}

async function showKey(id){
  try{
    const res = await fetchJSON(`/admin/servers/${id}/ssh-key`);
    if(res && res.ok && res.publicKey){
      const msg = document.getElementById('server-save-msg');
      msg.textContent = res.publicKey;
      msg.className = 'small mb-2 text-monospace';
    } else {
      const msg = document.getElementById('server-save-msg');
      msg.textContent = res.message || 'Chưa có public key';
      msg.className = 'small mb-2 text-danger';
    }
  }catch(e){
    const msg = document.getElementById('server-save-msg');
    msg.textContent = e.message || 'Không lấy được public key';
    msg.className = 'small mb-2 text-danger';
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
    password: f.password.value
  };
  const btn = f.querySelector('button[type="submit"]');
  try {
    btn.disabled = true; btn.textContent = 'Đang thêm...';
    await fetchJSON('/admin/servers', {method:'POST', body: JSON.stringify(body)});
    msgEl.textContent = 'Thêm máy chủ thành công';
    msgEl.className = 'mt-2 small text-success';
    f.reset(); f.port.value = 22;
    loadServers();
  } catch(err){
    msgEl.textContent = err.message || 'Thêm server thất bại';
    msgEl.className = 'mt-2 small text-danger';
  } finally {
    btn.disabled = false; btn.textContent = 'Thêm máy chủ';
  }
}

async function saveServer(id, btn){
  const row = btn ? btn.closest('tr') : null;
  const q = (sel) => row ? row.querySelector(sel) : document.querySelector(sel);
  const hostEl = q(`input[data-id="${id}"][data-field="host"]`);
  const portEl = q(`input[data-id="${id}"][data-field="port"]`);
  const userEl = q(`input[data-id="${id}"][data-field="username"]`);

  const host = hostEl.value.trim();
  const port = parseInt(portEl.value, 10);
  const username = userEl.value.trim();

  const oldHost = hostEl.getAttribute('data-old-host') || '';
  const oldPortStr = portEl.getAttribute('data-old-port') || '';
  const oldPort = oldPortStr === '' ? null : parseInt(oldPortStr, 10);
  const oldUsername = userEl.getAttribute('data-old-username') || '';

  const statusSel = q(`select[data-id="${id}"][data-field="status"]`);
  const body = {host, port, username};
  if(statusSel){ body.status = statusSel.value; }
  const msg = document.getElementById('server-save-msg');
  try {
    btn && (btn.disabled = true);
    await fetchJSON(`/admin/servers/${id}`, {method:'PUT', body: JSON.stringify(body)});
    const changes = [];
    if(oldHost !== host) changes.push(`host: "${oldHost}" -> "${host}"`);
    if((oldPort ?? null) !== (isNaN(port)?null:port)) changes.push(`port: "${oldPort ?? ''}" -> "${isNaN(port)?'':port}"`);
    if(oldUsername !== username) changes.push(`username: "${oldUsername}" -> "${username}"`);
    msg.textContent = changes.length ? `Đã lưu máy ${id}: ${changes.join(', ')}` : `Lưu máy ${id} thành công`;
    msg.className = 'small mb-2 text-success';
    msg.scrollIntoView({behavior:'smooth', block:'nearest'});
    setTimeout(()=>{ if(msg) msg.textContent=''; }, 4000);
    await loadServers();
  } catch(e){
    msg.textContent = e.message || `Lưu máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
    msg.scrollIntoView({behavior:'smooth', block:'nearest'});
  } finally { if(btn) btn.disabled = false; }
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

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('create-user-form');
  form.addEventListener('submit', createUser);
  loadUsers();
  
  // Tự động kết nối các máy chủ khi đăng nhập vào home-admin
  async function autoConnectServers() {
    try{
      console.log('Đang tự động kết nối máy chủ...');
      
      // Hiển thị indicator nếu đang ở tab server hoặc k8s
      const currentSection = document.querySelector('.section:not(.d-none)')?.id;
      const indicator = document.getElementById('auto-connect-indicator');
      if (indicator && (currentSection === 'section-server' || currentSection === 'section-k8s')) {
        indicator.style.display = 'block';
        indicator.textContent = 'Đang tự động kết nối máy chủ...';
      }
      
      await fetchJSON('/admin/servers/check-status', {method:'POST'});
      console.log('Tự động kết nối máy chủ hoàn thành');
      
      // Reload server data in current visible tab
      if (currentSection === 'section-server') {
        await loadServers();
      } else if (currentSection === 'section-k8s') {
        await loadClustersAndServers();
      }
      
      // Ẩn indicator sau khi hoàn thành
      if (indicator) {
        indicator.style.display = 'none';
      }
    }catch(err){ 
      console.warn('Tự động kết nối máy chủ thất bại:', err);
      const indicator = document.getElementById('auto-connect-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    }
  }
  
  // Kết nối lần đầu khi load page
  await autoConnectServers();
  
  // Tự động kết nối định kỳ sau 45 giây
  setInterval(autoConnectServers, 45000);
  
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
      // Servers đã được auto-connect khi load page, chỉ cần hiển thị
    }
    if(key==='k8s'){
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
      // Servers đã được auto-connect khi load page, chỉ cần hiển thị
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


