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
  // Set current cluster ID for Ansible functions
  currentClusterId = clusterId;
  
  // Chuyển đổi sections
  document.getElementById('k8s-list')?.classList.add('d-none');
  document.getElementById('k8s-create')?.classList.add('d-none');
  document.getElementById('k8s-assign')?.classList.add('d-none');
  document.getElementById('k8s-detail')?.classList.remove('d-none');

  // Tự động kiểm tra trạng thái Ansible khi mở chi tiết cụm (không chặn UI)
  try { setTimeout(() => { try { checkAnsibleStatus(clusterId); } catch(_){} }, 0); } catch(_) {}

  // Hiển thị loading state
  const msgElement = document.getElementById('cd-msg');
  if(msgElement) {
    msgElement.innerHTML = `
      <div class="d-flex align-items-center">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true"></div>
        <span>Đang tải dữ liệu của cụm...</span>
      </div>
    `;
    msgElement.className = 'alert alert-info mb-2';
  }

  const detail = await fetchJSON(`/admin/clusters/${clusterId}/detail`).catch(()=>null);
  if(!detail){
    if(msgElement) { 
      msgElement.innerHTML = '<span class="text-danger">❌ Không tải được chi tiết cluster</span>';
      msgElement.className = 'alert alert-danger mb-2';
    }
    return;
  }
  
  // Xóa loading state khi có dữ liệu
  if(msgElement) {
    msgElement.innerHTML = '';
    msgElement.className = 'small mb-2';
  }
  document.getElementById('cd-name').textContent = detail.name || '';
  document.getElementById('cd-master').textContent = detail.masterNode || '';
  document.getElementById('cd-workers').textContent = detail.workerCount ?? 0;
  document.getElementById('cd-status').textContent = detail.status || '';
  document.getElementById('cd-version').textContent = detail.version || '';

  const tbody = document.getElementById('cd-nodes-tbody');
  tbody.innerHTML = '';
  (detail.nodes||[]).forEach(n => {
    // Chỉ hiển thị connection status
    const connectionStatus = n.isConnected ? 'CONNECTED' : 'OFFLINE';
    const connectionBadge = n.isConnected ? 'success' : 'secondary';
    
    // Color coding cho RAM usage
    const ramPercentage = n.ramPercentage || 0;
    let ramColorClass = '';
    if (ramPercentage >= 90) {
      ramColorClass = 'text-danger fw-bold'; // Đỏ đậm nếu > 90%
    } else if (ramPercentage >= 80) {
      ramColorClass = 'text-danger'; // Đỏ nếu > 80%
    } else if (ramPercentage >= 70) {
      ramColorClass = 'text-warning'; // Vàng nếu > 70%
    } else if (ramPercentage >= 50) {
      ramColorClass = 'text-info'; // Xanh nhạt nếu > 50%
    } else {
      ramColorClass = 'text-success'; // Xanh lá nếu < 50%
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${n.ip}</td>
      <td>${n.role}</td>
      <td><span class="badge bg-${connectionBadge}">${connectionStatus}</span></td>
      <td>${n.cpu || '-'}</td>
      <td class="${ramColorClass}">${n.ram || '-'}</td>
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
      
      // Reload cả cluster list và server assignment table để cập nhật dữ liệu
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    });
  }

  // Thêm event listeners cho các nút retry
  document.querySelectorAll('.cd-retry-node').forEach(btn => {
    if(!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (e) => {
        const nodeId = e.target.dataset.id;
        const clusterId = e.target.dataset.cluster;
        
        // Hiển thị loading state cho nút retry
        const originalText = e.target.innerHTML;
        e.target.innerHTML = `
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          Đang retry...
        `;
        e.target.disabled = true;
        
        try {
          // Reload cluster detail
          await showClusterDetail(clusterId);
        } catch (error) {
          console.error('Error retrying node:', error);
        } finally {
          // Restore button state
          e.target.innerHTML = originalText;
          e.target.disabled = false;
        }
      });
    }
  });

  // Thêm event listeners cho các nút remove node
  document.querySelectorAll('.cd-remove-node').forEach(btn => {
    if(!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (e) => {
        const nodeId = e.target.dataset.id;
        const clusterId = e.target.dataset.cluster;
        
        if(!confirm('Bỏ node này khỏi cluster?')) return;
        
        // Hiển thị loading state cho nút delete
        const originalText = e.target.innerHTML;
        e.target.innerHTML = `
          <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
          Đang xóa...
        `;
        e.target.disabled = true;
        
        try {
          // Lấy dữ liệu server hiện tại để giữ nguyên role
          const servers = await fetchJSON('/admin/servers').catch(() => []);
          const server = servers.find(s => s.id === parseInt(nodeId, 10));
          const currentRole = server ? server.role : 'WORKER';
          
          // Bỏ node khỏi cluster (giữ nguyên role)
          const body = { clusterId: null, role: currentRole };
          await fetchJSON(`/admin/servers/${nodeId}`, { method: 'PUT', body: JSON.stringify(body) });
          
          // Hiển thị thông báo thành công
          const msgElement = document.getElementById('cd-msg');
          if(msgElement) {
            msgElement.innerHTML = `<span class="text-success">✓ Đã bỏ node khỏi cluster</span>`;
            msgElement.className = 'alert alert-success small mb-2';
            setTimeout(() => {
              msgElement.innerHTML = '';
              msgElement.className = 'small mb-2';
            }, 3000);
          }
          
          // Reload cluster detail để cập nhật dữ liệu
          await showClusterDetail(clusterId);
        } catch (error) {
          console.error('Error removing node:', error);
          const msgElement = document.getElementById('cd-msg');
          if(msgElement) {
            msgElement.innerHTML = `<span class="text-danger">❌ ${error.message || 'Không thể xóa node'}</span>`;
            msgElement.className = 'alert alert-danger small mb-2';
          }
          // Restore button state nếu có lỗi
          e.target.innerHTML = originalText;
          e.target.disabled = false;
        }
      });
    }
  });

  // Cập nhật thông tin cluster cho modal thêm node
  const addNodeBtn = document.getElementById('cd-add-node');
  if(addNodeBtn && !addNodeBtn.dataset.clusterBound) {
    addNodeBtn.dataset.clusterBound = '1';
    addNodeBtn.addEventListener('click', () => {
      // Lưu cluster ID và tên vào modal
      document.getElementById('add-node-cluster-id').value = clusterId;
      document.getElementById('add-node-cluster-name').textContent = detail.name || '';
      
      // Reset form thêm node mới
      const form = document.getElementById('add-node-form');
      if(form) {
        form.reset();
        document.getElementById('add-node-port').value = '22';
        document.getElementById('add-node-role').value = 'WORKER';
      }
      
      // Reset tab và load danh sách nodes có sẵn
      resetAddNodeModal();
      loadExistingNodes();
      
      // Clear message
      const msgEl = document.getElementById('add-node-msg');
      if(msgEl) {
        msgEl.textContent = '';
        msgEl.className = 'small';
      }
    });
  }
}

// ================= Add Node Modal Functions =================

// Helper function để reload server assignment table khi cần thiết
async function refreshServerAssignmentTable() {
  try {
    await loadClustersAndServers();
  } catch (error) {
    console.error('Error refreshing server assignment table:', error);
  }
}

// Reset modal về trạng thái ban đầu
function resetAddNodeModal() {
  // Reset về tab đầu tiên
  const selectExistingTab = document.getElementById('select-existing-tab');
  const addNewTab = document.getElementById('add-new-tab');
  const selectExistingPane = document.getElementById('select-existing');
  const addNewPane = document.getElementById('add-new');
  
  if(selectExistingTab && addNewTab && selectExistingPane && addNewPane) {
    selectExistingTab.classList.add('active');
    selectExistingTab.setAttribute('aria-selected', 'true');
    addNewTab.classList.remove('active');
    addNewTab.setAttribute('aria-selected', 'false');
    
    selectExistingPane.classList.add('show', 'active');
    addNewPane.classList.remove('show', 'active');
  }
  
  // Reset checkboxes
  const selectAllCheckbox = document.getElementById('select-all-existing');
  if(selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }
  
  // Reset role dropdown
  const selectedNodesRole = document.getElementById('selected-nodes-role');
  if(selectedNodesRole) {
    selectedNodesRole.value = 'WORKER';
  }
  
  // Hide/show buttons
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');
  const addNewBtn = document.getElementById('add-node-submit-btn');
  if(addExistingBtn && addNewBtn) {
    addExistingBtn.style.display = 'none';
    addNewBtn.style.display = 'inline-block';
  }
}

// Load danh sách nodes chưa thuộc cluster nào
async function loadExistingNodes() {
  const loadingEl = document.getElementById('existing-nodes-loading');
  const containerEl = document.getElementById('existing-nodes-container');
  const noNodesEl = document.getElementById('no-existing-nodes');
  const tbodyEl = document.getElementById('existing-nodes-tbody');
  
  if(!loadingEl || !containerEl || !noNodesEl || !tbodyEl) return;
  
  // Show loading
  loadingEl.classList.remove('d-none');
  containerEl.classList.add('d-none');
  noNodesEl.classList.add('d-none');
  
  try {
    // Load tất cả servers
    const servers = await fetchJSON('/admin/servers').catch(() => []);
    
    // Lọc các server chưa thuộc cluster nào (clusterId null hoặc undefined)
    const availableNodes = servers.filter(server => 
      !server.clusterId || server.clusterId === null || server.clusterId === undefined
    );
    
    // Clear tbody
    tbodyEl.innerHTML = '';
    
    if(availableNodes.length === 0) {
      // Không có node nào available
      loadingEl.classList.add('d-none');
      noNodesEl.classList.remove('d-none');
      return;
    }
    
    // Render nodes
    availableNodes.forEach(node => {
      const statusBadge = node.status === 'ONLINE' ? 'success' : 'secondary';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <input type="checkbox" class="form-check-input existing-node-checkbox" value="${node.id}">
        </td>
        <td>${node.host || ''}</td>
        <td>${node.username || ''}</td>
        <td><span class="badge bg-${statusBadge}">${node.status || 'OFFLINE'}</span></td>
        <td><span class="badge bg-info">${node.role || 'WORKER'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary add-single-node" data-id="${node.id}">
            <i class="bi bi-plus"></i> Thêm
          </button>
        </td>
      `;
      tbodyEl.appendChild(tr);
    });
    
    // Hide loading, show table
    loadingEl.classList.add('d-none');
    containerEl.classList.remove('d-none');
    
    // Bind events
    bindExistingNodesEvents();
    
  } catch(error) {
    console.error('Error loading existing nodes:', error);
    loadingEl.classList.add('d-none');
    noNodesEl.classList.remove('d-none');
    noNodesEl.innerHTML = '<i class="bi bi-exclamation-triangle text-warning"></i> Lỗi khi tải danh sách nodes';
  }
}

// Bind events cho existing nodes
function bindExistingNodesEvents() {
  // Select all checkbox
  const selectAllCheckbox = document.getElementById('select-all-existing');
  if(selectAllCheckbox && !selectAllCheckbox.dataset.bound) {
    selectAllCheckbox.dataset.bound = '1';
    selectAllCheckbox.addEventListener('change', () => {
      const checkboxes = document.querySelectorAll('.existing-node-checkbox');
      checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
      updateAddExistingButton();
    });
  }
  
  // Individual checkboxes
  document.querySelectorAll('.existing-node-checkbox').forEach(checkbox => {
    if(!checkbox.dataset.bound) {
      checkbox.dataset.bound = '1';
      checkbox.addEventListener('change', () => {
        updateSelectAllState();
        updateAddExistingButton();
      });
    }
  });
  
  // Add single node buttons
  document.querySelectorAll('.add-single-node').forEach(btn => {
    if(!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (e) => {
        const nodeId = parseInt(e.target.closest('button').dataset.id, 10);
        const role = document.getElementById('selected-nodes-role').value;
        await addExistingNodesToCluster([nodeId], role);
      });
    }
  });
}

// Update select all checkbox state
function updateSelectAllState() {
  const selectAllCheckbox = document.getElementById('select-all-existing');
  const checkboxes = document.querySelectorAll('.existing-node-checkbox');
  
  if(selectAllCheckbox && checkboxes.length > 0) {
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = checkedCount === checkboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }
}

// Update add existing button visibility
function updateAddExistingButton() {
  const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');
  
  if(addExistingBtn) {
    if(checkboxes.length > 0) {
      addExistingBtn.style.display = 'inline-block';
      addExistingBtn.innerHTML = `<i class="bi bi-list-check"></i> Thêm ${checkboxes.length} Node đã chọn`;
    } else {
      addExistingBtn.style.display = 'none';
    }
  }
}

// Add existing nodes to cluster
async function addExistingNodesToCluster(nodeIds, role) {
  const msgEl = document.getElementById('add-node-msg');
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');
  
  if(!msgEl || !addExistingBtn) return;
  
  msgEl.textContent = '';
  msgEl.className = 'small';
  
  try {
    addExistingBtn.disabled = true;
    addExistingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang thêm...';
    
    // Cập nhật từng node
    for(const nodeId of nodeIds) {
      const body = { clusterId: parseInt(document.getElementById('add-node-cluster-id').value, 10), role: role };
      await fetchJSON(`/admin/servers/${nodeId}`, { method: 'PUT', body: JSON.stringify(body) });
    }
    
    msgEl.textContent = `✓ Đã thêm ${nodeIds.length} node vào cluster`;
    msgEl.className = 'small text-success';
    
    // Reload danh sách và đóng modal sau 1 giây
    setTimeout(async () => {
      const modal = bootstrap.Modal.getInstance(document.getElementById('addNodeModal'));
      if(modal) modal.hide();
      
      // Reload cluster detail
      const currentClusterId = parseInt(document.getElementById('add-node-cluster-id').value, 10);
      if(!isNaN(currentClusterId)) {
        await showClusterDetail(currentClusterId);
      }
    }, 1000);
    
  } catch(error) {
    console.error('Error adding existing nodes:', error);
    msgEl.textContent = error.message || 'Thêm node thất bại';
    msgEl.className = 'small text-danger';
  } finally {
    addExistingBtn.disabled = false;
    addExistingBtn.innerHTML = '<i class="bi bi-list-check"></i> Thêm Node đã chọn';
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
  
  // Xử lý form thêm node vào cluster
  if(f && f.id === 'add-node-form'){
    e.preventDefault();
    const msgEl = document.getElementById('add-node-msg');
    const btn = document.getElementById('add-node-submit-btn');
    
    if(!msgEl || !btn) {
      console.error('add-node-msg or add-node-submit-btn element not found');
      return;
    }
    
    msgEl.textContent = '';
    msgEl.className = 'small';
    
    const clusterId = parseInt(document.getElementById('add-node-cluster-id').value, 10);
    if(isNaN(clusterId)) {
      msgEl.textContent = 'Cluster ID không hợp lệ';
      msgEl.className = 'small text-danger';
      return;
    }
    
    const body = {
      host: f.host.value.trim(),
      port: parseInt(f.port.value, 10),
      username: f.username.value.trim(),
      password: f.password.value,
      clusterId: clusterId,
      role: f.role.value
    };
    
    try {
      btn.disabled = true; 
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang thêm...';
      
      // Tạo server mới và gán vào cluster với role
      const result = await fetchJSON('/admin/servers', {method:'POST', body: JSON.stringify(body)});
      
      msgEl.textContent = '✓ Đã thêm node thành công'; 
      msgEl.className = 'small text-success';
      
      // Reset form
      f.reset();
      f.port.value = 22;
      f.role.value = 'WORKER';
      
      // Đóng modal sau 1 giây
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('addNodeModal'));
        if(modal) modal.hide();
        
        // Reload cluster detail để hiển thị node mới
        const currentClusterId = parseInt(document.getElementById('add-node-cluster-id').value, 10);
        if(!isNaN(currentClusterId)) {
          showClusterDetail(currentClusterId);
        }
      }, 1000);
      
    } catch(err){
      console.error('Add node error:', err);
      msgEl.textContent = err.message || 'Thêm node thất bại'; 
      msgEl.className = 'small text-danger';
    } finally {
      btn.disabled = false; 
      btn.innerHTML = 'Thêm Node';
    }
  }
});

document.addEventListener('click', async (e) => {
  const t = e.target;
  
  // Handle refresh existing nodes button
  if(t && t.id === 'refresh-existing-nodes'){
    e.preventDefault();
    await loadExistingNodes();
  }
  
  // Handle add existing nodes button
  if(t && t.id === 'add-existing-nodes-btn'){
    e.preventDefault();
    const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
    const nodeIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
    const role = document.getElementById('selected-nodes-role').value;
    
    if(nodeIds.length === 0) {
      const msgEl = document.getElementById('add-node-msg');
      if(msgEl) {
        msgEl.textContent = 'Vui lòng chọn ít nhất một node';
        msgEl.className = 'small text-warning';
      }
      return;
    }
    
    await addExistingNodesToCluster(nodeIds, role);
  }
  
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
      
      // Hiển thị indicator nếu đang ở tab server hoặc k8s
      const currentSection = document.querySelector('.section:not(.d-none)')?.id;
      const indicator = document.getElementById('auto-connect-indicator');
      if (indicator && (currentSection === 'section-server' || currentSection === 'section-k8s')) {
        indicator.style.display = 'block';
        indicator.textContent = 'Đang tự động kết nối máy chủ...';
      }
      
      await fetchJSON('/admin/servers/check-status', {method:'POST'});
      
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
  
  // Handle tab changes in add node modal
  const selectExistingTab = document.getElementById('select-existing-tab');
  const addNewTab = document.getElementById('add-new-tab');
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');
  const addNewBtn = document.getElementById('add-node-submit-btn');
  
  if(selectExistingTab && addNewTab && addExistingBtn && addNewBtn) {
    selectExistingTab.addEventListener('shown.bs.tab', () => {
      addExistingBtn.style.display = 'inline-block';
      addNewBtn.style.display = 'none';
    });
    
    addNewTab.addEventListener('shown.bs.tab', () => {
      addExistingBtn.style.display = 'none';
      addNewBtn.style.display = 'inline-block';
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

// ================= Ansible Installation Functions =================

let ansibleWebSocket = null;
let ansibleLogData = [];
let currentClusterId = null;

// Check Ansible Status
async function checkAnsibleStatus(clusterId) {
  const checkBtn = document.getElementById('cd-check-ansible');
  const statusDisplay = document.getElementById('ansible-status-display');
  const statusTable = document.getElementById('ansible-status-table');
  
  try {
    checkBtn.disabled = true;
    checkBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang kiểm tra...';
    
    
    const ansibleStatus = await fetchJSON(`/admin/clusters/${clusterId}/ansible-status`);
    
    
    // Hide default message
    statusDisplay.classList.add('d-none');
    
    // Show status table
    statusTable.classList.remove('d-none');
    
    // Update status table
    updateAnsibleStatusTable(ansibleStatus);
    
  } catch (error) {
    console.error('Lỗi kiểm tra trạng thái Ansible:', error);
    
    // Hiển thị lỗi chi tiết hơn
    let errorMessage = error.message;
    if (error.message.includes('Yêu cầu không hợp lệ')) {
      errorMessage = 'Không có thông tin xác thực. Vui lòng kết nối lại các server trước khi kiểm tra Ansible.';
    }
    
    statusDisplay.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle"></i> Lỗi kiểm tra trạng thái Ansible: ${errorMessage}
        <br><small class="text-muted">Vui lòng đảm bảo các server đã được kết nối và có thể SSH.</small>
      </div>
    `;
    statusDisplay.classList.remove('d-none');
    
    // Hide status table on error
    statusTable.classList.add('d-none');
    
  } finally {
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<i class="bi bi-search"></i> Kiểm tra trạng thái';
  }
}


function updateAnsibleStatusTable(ansibleStatus) {
  const tbody = document.getElementById('ansible-status-tbody');
  tbody.innerHTML = '';
  
  Object.entries(ansibleStatus.ansibleStatus).forEach(([host, status]) => {
    const tr = document.createElement('tr');
    tr.className = status.installed ? 'table-success' : 'table-danger';
    
    tr.innerHTML = `
      <td><strong>${host}</strong></td>
      <td>
        <span class="badge bg-${status.role === 'MASTER' ? 'primary' : 'secondary'}">
          ${status.role}
        </span>
      </td>
      <td>
        <span class="badge bg-${status.installed ? 'success' : 'danger'}">
          <i class="bi bi-${status.installed ? 'check-circle' : 'x-circle'}"></i>
          ${status.installed ? 'Đã cài đặt' : 'Chưa cài đặt'}
        </span>
      </td>
      <td>${status.installed ? `<code>${status.version}</code>` : 'N/A'}</td>
      <td>
        ${status.installed ? `
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-warning" onclick="reinstallAnsibleOnServer('${host}')">Cài đặt lại</button>
            <button class="btn btn-outline-danger" onclick="uninstallAnsibleOnServer('${host}')">Gỡ cài đặt</button>
          </div>` :
          `<button class="btn btn-sm btn-outline-primary" onclick="installAnsibleOnServer('${host}')">Cài đặt</button>`
        }
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

// Install Ansible on single server
async function installAnsibleOnServer(host) {
  
  if (!currentClusterId) {
    alert('Không tìm thấy thông tin cluster');
    return;
  }
  
  
  // Show modal for single server installation
  await showAnsibleInstallModalForServer(currentClusterId, host, false);
}

// Reinstall Ansible on single server
async function reinstallAnsibleOnServer(host) {
  
  if (!currentClusterId) {
    alert('Không tìm thấy thông tin cluster');
    return;
  }
  
  
  // Show modal for single server reinstallation
  await showAnsibleInstallModalForServer(currentClusterId, host, true);
}

// Uninstall Ansible on single server
async function uninstallAnsibleOnServer(host) {
  if (!currentClusterId) {
    alert('Không tìm thấy thông tin cluster');
    return;
  }
  // Đặt chế độ gỡ cài đặt và mở modal cho server này
  window.isUninstallMode = true;
  await showAnsibleInstallModalForServer(currentClusterId, host, false);
}

// Show Ansible Install Modal for single server
async function showAnsibleInstallModalForServer(clusterId, targetHost, isReinstall) {
  
  currentClusterId = clusterId;
  
  try {
    // Lấy thông tin cluster
    const clusterDetail = await fetchJSON(`/admin/clusters/${clusterId}/detail`);
    
    // Tìm server cần cài đặt
    const targetServer = clusterDetail.nodes.find(node => node.ip === targetHost);
    if (!targetServer) {
      alert('Không tìm thấy server: ' + targetHost);
      return;
    }
    
  
    // Populate sudo password input chỉ cho server này
    const sudoInputsContainer = document.getElementById('sudo-password-inputs');
    sudoInputsContainer.innerHTML = '';
    
    const colDiv = document.createElement('div');
    colDiv.className = 'col-12 mb-3';
    colDiv.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h6 class="card-title">${targetServer.ip} <span class="badge bg-${targetServer.role === 'MASTER' ? 'primary' : 'secondary'}">${targetServer.role}</span></h6>
          <input type="password" class="form-control sudo-password-input" 
                 data-host="${targetServer.ip}" placeholder="Nhập mật khẩu sudo">
        </div>
      </div>
    `;
    sudoInputsContainer.appendChild(colDiv);
    
    // Update modal title (hỗ trợ chế độ gỡ cài đặt)
    const modalTitle = document.querySelector('#ansibleInstallModal .modal-title');
    if (window.isUninstallMode) {
      modalTitle.innerHTML = `<i class="bi bi-trash"></i> Gỡ cài đặt Ansible - ${targetHost}`;
    } else {
      modalTitle.innerHTML = `<i class="bi bi-download"></i> ${isReinstall ? 'Cài đặt lại' : 'Cài đặt'} Ansible - ${targetHost}`;
    }

    // Cập nhật nút bắt đầu theo chế độ (cài đặt/gỡ cài đặt)
    const startBtn = document.getElementById('start-ansible-install-btn');
    if (startBtn) {
      if (window.isUninstallMode) {
        startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Bắt đầu gỡ cài đặt';
      } else if (isReinstall) {
        startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Bắt đầu cài đặt lại';
      } else {
        startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Bắt đầu cài đặt';
      }
    }
    
    // Reset modal state
    document.getElementById('sudo-password-section').classList.remove('d-none');
    document.getElementById('ansible-output-section').classList.add('d-none');
    document.getElementById('ansible-complete-btn').classList.add('d-none');
    
    // Store target server info
    window.currentTargetServer = targetServer;
    window.isReinstallMode = isReinstall;
    
    
    // Show modal
    const modalElement = document.getElementById('ansibleInstallModal');
    
    if (!modalElement) {
      alert('Lỗi: Không tìm thấy modal element');
      return;
    }
    
    try {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
      
      // Force modal visibility as fallback
      setTimeout(() => {
        modalElement.style.display = 'block';
        modalElement.classList.add('show');
        modalElement.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
      }, 100);
      
    } catch (bootstrapError) {
      alert('Lỗi Bootstrap: ' + bootstrapError.message);
    }
    
  } catch (error) {
    alert('Lỗi khi mở modal cài đặt: ' + error.message);
  }
}

// Show Ansible Install Modal
async function showAnsibleInstallModal(clusterId) {
  currentClusterId = clusterId;
  
  // Lấy thông tin cluster
  const clusterDetail = await fetchJSON(`/admin/clusters/${clusterId}/detail`);
  
  // Populate sudo password inputs
  const sudoInputsContainer = document.getElementById('sudo-password-inputs');
  sudoInputsContainer.innerHTML = '';
  
  clusterDetail.nodes.forEach(node => {
    const colDiv = document.createElement('div');
    colDiv.className = 'col-md-6 mb-3';
    colDiv.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h6 class="card-title">${node.ip} <span class="badge bg-${node.role === 'MASTER' ? 'primary' : 'secondary'}">${node.role}</span></h6>
          <input type="password" class="form-control sudo-password-input" 
                 data-host="${node.ip}" placeholder="Nhập mật khẩu sudo">
        </div>
      </div>
    `;
    sudoInputsContainer.appendChild(colDiv);
  });
  
  // Reset modal state
  document.getElementById('sudo-password-section').classList.remove('d-none');
  document.getElementById('ansible-output-section').classList.add('d-none');
  document.getElementById('ansible-complete-btn').classList.add('d-none');
  
  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('ansibleInstallModal'));
  modal.show();
}

function startAnsibleInstallation() {
  const sudoPasswords = {};
  let hasPassword = false;
  
  document.querySelectorAll('.sudo-password-input').forEach(input => {
    const host = input.dataset.host;
    const password = input.value.trim();
    if (password) {
      sudoPasswords[host] = password;
      hasPassword = true;
    }
  });
  
  if (!hasPassword) {
    alert('Vui lòng nhập mật khẩu sudo.');
    return;
  }
  
  // Hide sudo password section, show output section
  document.getElementById('sudo-password-section').classList.add('d-none');
  document.getElementById('ansible-output-section').classList.remove('d-none');
  
  // Initialize server status cards
  initializeServerStatusCards();
  
  // Connect WebSocket - command will be sent automatically when connected
  connectAnsibleWebSocket();
}

function initializeServerStatusCards() {
  const container = document.getElementById('server-status-cards');
  if(!container) return;
  container.innerHTML = '';
  
  // Nếu có target server, hiển thị card cho server đó
  if (window.currentTargetServer) {
    const server = window.currentTargetServer;
    const isReinstall = window.isReinstallMode || false;
    // Ẩn group nhiều server; chỉ hiển thị log realtime
    container.classList.add('d-none');

    addLogMessage('info', `Khởi tạo monitoring interface cho server ${server.ip}...`);
  } else {
    // Fallback cho trường hợp không có target server
    addLogMessage('info', 'Khởi tạo monitoring interface...');
  }
}

function connectAnsibleWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${location.host}/ws/ansible`;
  
  
  // Close existing connection if any
  if (ansibleWebSocket && ansibleWebSocket.readyState === WebSocket.OPEN) {
    ansibleWebSocket.close();
  }
  
  ansibleWebSocket = new WebSocket(wsUrl);
  
  ansibleWebSocket.onopen = function(event) {
    addLogMessage('success', '✅ Kết nối WebSocket thành công');
    addLogMessage('info', '🔗 WebSocket connected');
    
    // Send installation start command after connection is established
    sendInstallationStartCommand();
  };
  
  ansibleWebSocket.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      handleAnsibleMessage(data);
    } catch (e) {
      console.error('Lỗi parse WebSocket message:', e);
      addLogMessage('error', '❌ Lỗi parse message: ' + e.message);
    }
  };
  
  ansibleWebSocket.onclose = function(event) {
    addLogMessage('warning', `⚠️ WebSocket connection closed (Code: ${event.code})`);
    
    if (event.code !== 1000) { // Not normal closure
      addLogMessage('error', '❌ WebSocket closed unexpectedly');
    }
  };
  
  ansibleWebSocket.onerror = function(error) {
    addLogMessage('error', '❌ WebSocket error occurred');
  };
}

function sendInstallationStartCommand() {
  if (!ansibleWebSocket || ansibleWebSocket.readyState !== WebSocket.OPEN) {
    addLogMessage('error', '❌ WebSocket không sẵn sàng để gửi lệnh');
    return;
  }
  
  const sudoPasswords = {};
  let hasPassword = false;
  
  document.querySelectorAll('.sudo-password-input').forEach(input => {
    const host = input.dataset.host;
    const password = input.value.trim();
    if (password) {
      sudoPasswords[host] = password;
      hasPassword = true;
    }
  });
  
  if (!hasPassword) {
    addLogMessage('error', '❌ Vui lòng nhập mật khẩu sudo');
    return;
  }
  
  const message = {
    action: 'start_ansible_install',
    clusterId: currentClusterId,
    sudoPasswords: sudoPasswords,
    targetServer: window.currentTargetServer ? window.currentTargetServer.ip : null,
    isReinstall: window.isReinstallMode || false,
    isUninstall: window.isUninstallMode || false
  };
  
  ansibleWebSocket.send(JSON.stringify(message));
  addLogMessage('info', '📤 Đã gửi lệnh cài đặt đến server');
}

function handleAnsibleMessage(data) {
  switch (data.type) {
    case 'connected':
      addLogMessage('info', '🔗 ' + data.message);
      break;
      
    case 'start':
      addLogMessage('info', '🚀 ' + data.message);
      updateProgress(0, 'Bắt đầu...');
      break;
      
    case 'info':
      addLogMessage('info', 'ℹ️ ' + data.message);
      break;
      
    case 'server_start':
      addLogMessage('info', `🔄 [${data.progress}] Bắt đầu cài đặt trên ${data.server}`);
      updateServerStatus(data.server, 'running', data.message);
      break;
      
    case 'server_success':
      addLogMessage('success', `✅ ${data.message}`);
      (function(){
        let successMsg = 'Thành công';
        const m = (data && data.message) ? String(data.message).toLowerCase() : '';
        if (m.includes('gỡ') || m.includes('uninstall')) successMsg = 'Gỡ cài đặt thành công';
        else if (m.includes('cài đặt') || m.includes('install')) successMsg = 'Cài đặt thành công';
        updateServerStatus(data.server, 'success', successMsg);
      })();
      break;
      
    case 'server_error':
      addLogMessage('error', `❌ ${data.message}`);
      updateServerStatus(data.server, 'error', 'Cài đặt thất bại');
      break;
      
    case 'step':
      addLogMessage('info', `📋 [${data.server}] Bước ${data.step}: ${data.message}`);
      break;
      
    case 'terminal_prompt':
      addTerminalPrompt(data.server, data.prompt, data.command);
      break;
      
    case 'sudo_prompt':
      addSudoPrompt(data.server, data.message);
      break;
      
    case 'terminal_output':
      addTerminalOutput(data.server, data.output);
      break;
      
    case 'terminal_prompt_end':
      addTerminalPromptEnd(data.server, data.prompt);
      break;
      
    case 'complete':
      addLogMessage('success', '🎉 ' + data.message);
      updateProgress(100, 'Hoàn thành!');
      document.getElementById('ansible-complete-btn').classList.remove('d-none');
      break;
      
    case 'error':
      addLogMessage('error', '❌ ' + data.message);
      break;
  }
}

function addLogMessage(type, message) {
  const console = document.getElementById('ansible-output-console');
  const timestamp = new Date().toLocaleTimeString();
  
  const lineDiv = document.createElement('div');
  lineDiv.className = `ansible-output-line ${type}`;
  lineDiv.innerHTML = `[${timestamp}] ${message}`;
  
  console.appendChild(lineDiv);
  scrollToBottom();
  
  // Store log data
  ansibleLogData.push({
    timestamp: timestamp,
    type: type,
    message: message
  });
}

function addTerminalPrompt(server, prompt, command) {
  const console = document.getElementById('ansible-output-console');
  const timestamp = new Date().toLocaleTimeString();
  
  const lineDiv = document.createElement('div');
  lineDiv.className = 'ansible-output-line terminal-prompt';
  lineDiv.innerHTML = `
    <span class="timestamp">[${timestamp}]</span>
    <span class="server-label">[${server}]</span>
    <span class="prompt">${prompt}</span>
    <span class="command">${command}</span>
  `;
  
  console.appendChild(lineDiv);
  scrollToBottom();
  
  // Store log data
  ansibleLogData.push({
    timestamp: timestamp,
    type: 'terminal_prompt',
    server: server,
    prompt: prompt,
    command: command
  });
}

function addSudoPrompt(server, message) {
  const console = document.getElementById('ansible-output-console');
  const timestamp = new Date().toLocaleTimeString();
  
  const lineDiv = document.createElement('div');
  lineDiv.className = 'ansible-output-line sudo-prompt';
  lineDiv.innerHTML = `
    <span class="timestamp">[${timestamp}]</span>
    <span class="server-label">[${server}]</span>
    <span class="sudo-message">${message}</span>
    <span class="password-mask">••••••••</span>
  `;
  
  console.appendChild(lineDiv);
  scrollToBottom();
  
  // Store log data
  ansibleLogData.push({
    timestamp: timestamp,
    type: 'sudo_prompt',
    server: server,
    message: message
  });
}

function addTerminalOutput(server, output) {
  const console = document.getElementById('ansible-output-console');
  const timestamp = new Date().toLocaleTimeString();
  
  // Split output by lines để hiển thị từng dòng
  const lines = output.split('\n');
  
  lines.forEach(line => {
    if (line.trim()) { // Chỉ hiển thị dòng không rỗng
      const lineDiv = document.createElement('div');
      lineDiv.className = 'ansible-output-line terminal-output';
      lineDiv.innerHTML = `
        <span class="timestamp">[${timestamp}]</span>
        <span class="server-label">[${server}]</span>
        <span class="output-text">${escapeHtml(line)}</span>
      `;
      
      console.appendChild(lineDiv);
    }
  });
  
  scrollToBottom();
  
  // Store log data
  ansibleLogData.push({
    timestamp: timestamp,
    type: 'terminal_output',
    server: server,
    output: output
  });
}

function addTerminalPromptEnd(server, prompt) {
  const console = document.getElementById('ansible-output-console');
  const timestamp = new Date().toLocaleTimeString();
  
  const lineDiv = document.createElement('div');
  lineDiv.className = 'ansible-output-line terminal-prompt-end';
  lineDiv.innerHTML = `
    <span class="timestamp">[${timestamp}]</span>
    <span class="server-label">[${server}]</span>
    <span class="prompt">${prompt}</span>
  `;
  
  console.appendChild(lineDiv);
  scrollToBottom();
  
  // Store log data
  ansibleLogData.push({
    timestamp: timestamp,
    type: 'terminal_prompt_end',
    server: server,
    prompt: prompt
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  if (document.getElementById('auto-scroll-switch').checked) {
    const console = document.getElementById('ansible-output-console');
    console.scrollTop = console.scrollHeight;
  }
}

function updateProgress(percentage, text) {
  const progressBar = document.getElementById('ansible-progress-bar');
  const progressText = document.getElementById('progress-text');
  
  progressBar.style.width = percentage + '%';
  progressBar.setAttribute('aria-valuenow', percentage);
  progressText.textContent = text;
  
  if (percentage === 100) {
    progressBar.classList.remove('progress-bar-animated');
    progressBar.classList.add('bg-success');
  }
}

function updateServerStatus(serverHost, status, message) {
  // Tìm hoặc tạo server status card
  let card = document.querySelector(`[data-server="${serverHost}"]`);
  if (!card) {
    const container = document.getElementById('server-status-cards');
    card = document.createElement('div');
    card.className = 'col-md-6 mb-2';
    card.setAttribute('data-server', serverHost);
    card.innerHTML = `
      <div class="card server-status-card">
        <div class="card-body p-2">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>${serverHost}</strong>
              <div class="small text-muted" id="status-${serverHost}">Chờ xử lý...</div>
            </div>
            <div id="icon-${serverHost}">
              <i class="bi bi-clock text-muted"></i>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  }
  
  // Update status
  const statusDiv = document.getElementById(`status-${serverHost}`);
  const iconDiv = document.getElementById(`icon-${serverHost}`);
  
  statusDiv.textContent = message;
  
  // Update card class and icon
  const cardDiv = card.querySelector('.server-status-card');
  cardDiv.className = `card server-status-card ${status}`;
  
  switch (status) {
    case 'pending':
      iconDiv.innerHTML = '<i class="bi bi-clock text-muted"></i>';
      break;
    case 'running':
      iconDiv.innerHTML = '<i class="bi bi-arrow-repeat text-primary"></i>';
      break;
    case 'success':
      iconDiv.innerHTML = '<i class="bi bi-check-circle text-success"></i>';
      break;
    case 'error':
      iconDiv.innerHTML = '<i class="bi bi-x-circle text-danger"></i>';
      break;
  }
}

function clearAnsibleOutput() {
  document.getElementById('ansible-output-console').innerHTML = '';
  ansibleLogData = [];
  updateProgress(0, 'Chuẩn bị...');
}

function downloadAnsibleLog() {
  const logLines = ansibleLogData.map(entry => {
    switch (entry.type) {
      case 'terminal_prompt':
        return `[${entry.timestamp}] [${entry.server}] ${entry.prompt}${entry.command}`;
      case 'sudo_prompt':
        return `[${entry.timestamp}] [${entry.server}] ${entry.message}••••••••`;
      case 'terminal_output':
        return entry.output.split('\n').map(line => 
          `[${entry.timestamp}] [${entry.server}] ${line}`
        ).join('\n');
      case 'terminal_prompt_end':
        return `[${entry.timestamp}] [${entry.server}] ${entry.prompt}`;
      case 'info':
      case 'success':
      case 'error':
      case 'warning':
        return `[${entry.timestamp}] ${entry.type.toUpperCase()}: ${entry.message}`;
      default:
        return `[${entry.timestamp}] ${entry.message || ''}`;
    }
  }).join('\n');
  
  const blob = new Blob([logLines], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ansible-install-${currentClusterId}-${new Date().toISOString().slice(0, 19)}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ansibleInstallComplete() {
  // Close modal and refresh cluster status
  const modal = bootstrap.Modal.getInstance(document.getElementById('ansibleInstallModal'));
  modal.hide();
  
  // Refresh cluster detail
  if (currentClusterId) {
    showClusterDetail(currentClusterId);
  }
  
  // Close WebSocket
  if (ansibleWebSocket) {
    ansibleWebSocket.close();
  }
  // Reset chế độ uninstall
  window.isUninstallMode = false;
}

// Event listeners for Ansible
document.addEventListener('DOMContentLoaded', function() {
  // Start installation button
  document.getElementById('start-ansible-install-btn').addEventListener('click', startAnsibleInstallation);
  
  // Clear output button
  document.getElementById('clear-output-btn').addEventListener('click', clearAnsibleOutput);
  
  // Download log button
  document.getElementById('download-log-btn').addEventListener('click', downloadAnsibleLog);
  // Ansible Config Modal handlers (placeholders)
  const saveCfgBtn = document.getElementById('save-ansible-config-btn');
  if(saveCfgBtn && !saveCfgBtn.dataset.bound){
    saveCfgBtn.dataset.bound = '1';
    saveCfgBtn.addEventListener('click', async () => {
      const cfg = document.getElementById('ansible-cfg-editor')?.value || '';
      const hosts = document.getElementById('ansible-inventory-editor')?.value || '';
      const vars = document.getElementById('ansible-vars-editor')?.value || '';
      // TODO: call backend API to save
      alert('Đã lưu cấu hình (demo).');
    });
  }

  // ===== Khởi tạo Ansible - Quick Actions =====
  const initStructureBtn = document.getElementById('init-structure-btn');
  if (initStructureBtn && !initStructureBtn.dataset.bound) {
    initStructureBtn.dataset.bound = '1';
    initStructureBtn.addEventListener('click', () => runInitActionWS('init_structure', 'init-ansible-console'));
  }

  const initConfigBtn = document.getElementById('init-config-btn');
  if (initConfigBtn && !initConfigBtn.dataset.bound) {
    initConfigBtn.dataset.bound = '1';
    initConfigBtn.addEventListener('click', () => runInitActionWS('init_config', 'init-ansible-console'));
  }

  const initSshKeyBtn = document.getElementById('init-sshkey-btn');
  if (initSshKeyBtn && !initSshKeyBtn.dataset.bound) {
    initSshKeyBtn.dataset.bound = '1';
    initSshKeyBtn.addEventListener('click', () => runInitActionWS('init_sshkey', 'init-ansible-console'));
  }

  const initPingBtn = document.getElementById('init-ping-btn');
  if (initPingBtn && !initPingBtn.dataset.bound) {
    initPingBtn.dataset.bound = '1';
    initPingBtn.addEventListener('click', () => runInitActionWS('init_ping', 'init-ansible-console'));
  }

  // Helpers for Init Ansible console
  function appendInitLogTo(consoleId, line){
    const con = document.getElementById(consoleId);
    if(!con) return;
    const ts = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.textContent = `[${ts}] ${line}`;
    con.appendChild(div);
    con.scrollTop = con.scrollHeight;
  }

  function appendInitLogBlockTo(consoleId, text){
    const con = document.getElementById(consoleId);
    if(!con) return;
    const pre = document.createElement('pre');
    pre.className = 'm-0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = text;
    con.appendChild(pre);
    con.scrollTop = con.scrollHeight;
  }

  // Backward compatible helpers for the Structure tab console
  function appendInitLog(line){ appendInitLogTo('init-ansible-console', line); }
  function appendInitLogBlock(text){ appendInitLogBlockTo('init-ansible-console', text); }

  const clearInitBtn = document.getElementById('init-output-clear-btn');
  if(clearInitBtn && !clearInitBtn.dataset.bound){
    clearInitBtn.dataset.bound = '1';
    clearInitBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if(con) con.innerHTML = '';
    });
  }

  // Clear buttons for other tab consoles
  const clearInitCfgBtn = document.getElementById('init-config-output-clear-btn');
  if(clearInitCfgBtn && !clearInitCfgBtn.dataset.bound){
    clearInitCfgBtn.dataset.bound = '1';
    clearInitCfgBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if(con) con.innerHTML = '';
    });
  }
  const clearInitSshKeyBtn = document.getElementById('init-sshkey-output-clear-btn');
  if(clearInitSshKeyBtn && !clearInitSshKeyBtn.dataset.bound){
    clearInitSshKeyBtn.dataset.bound = '1';
    clearInitSshKeyBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if(con) con.innerHTML = '';
    });
  }
  const clearInitPingBtn = document.getElementById('init-ping-output-clear-btn');
  if(clearInitPingBtn && !clearInitPingBtn.dataset.bound){
    clearInitPingBtn.dataset.bound = '1';
    clearInitPingBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if(con) con.innerHTML = '';
    });
  }

  // WebSocket realtime for Init actions
  let initActionsWS = null;
  function runInitActionWS(action, consoleId){
    if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
    const hostSelect = document.getElementById('init-host-select');
    const host = hostSelect ? (hostSelect.value || null) : null;
    const needSudo = (action === 'init_structure' || action === 'init_config' || action === 'init_sshkey');
    const sudoPassword = needSudo ? prompt('Nhập mật khẩu sudo:') : null;
    if (needSudo && !sudoPassword) return;

    try { if(initActionsWS) { initActionsWS.close(); } } catch(_) {}
    const protocol = (location.protocol === 'https:') ? 'wss' : 'ws';
    initActionsWS = new WebSocket(`${protocol}://${location.host}/ws/ansible`);

    initActionsWS.onopen = () => {
      appendInitLogTo(consoleId, '🔗 WebSocket connected');
      const payload = { action, clusterId: currentClusterId, host };
      if (needSudo) payload.sudoPassword = sudoPassword;
      initActionsWS.send(JSON.stringify(payload));
    };
    initActionsWS.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      // First attempt: parse as JSON directly
      try {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (data.type === 'terminal_output') {
            appendInitLogBlockTo(consoleId, data.output || '');
            return;
          }
          if (data.type === 'terminal_prompt') {
            const line = `[${data.server||''}] ${data.prompt||''}${data.command||''}`.trim();
            appendInitLogTo(consoleId, line);
            return;
          }
          if (data.message) {
            appendInitLogTo(consoleId, data.message);
            return;
          }
        }
      } catch(_) {
        // Second attempt: sanitize control chars (except \n, \r, \t) then parse
        try {
          const sanitized = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
          const data2 = JSON.parse(sanitized);
          if (data2 && typeof data2 === 'object') {
            if (data2.type === 'terminal_output') {
              appendInitLogBlockTo(consoleId, data2.output || '');
            } else if (data2.type === 'terminal_prompt') {
              const line = `[${data2.server||''}] ${data2.prompt||''}${data2.command||''}`.trim();
              appendInitLogTo(consoleId, line);
            } else if (data2.message) {
              appendInitLogTo(consoleId, data2.message);
            } else {
              appendInitLogBlockTo(consoleId, sanitized);
            }
            return;
          }
        } catch(parseErr) {
          // Final fallback: show raw payload as text block
          appendInitLogBlockTo(consoleId, raw);
          return;
        }
      }
    };
    initActionsWS.onerror = () => appendInitLogTo(consoleId, '❌ WebSocket error');
    initActionsWS.onclose = (ev) => appendInitLogTo(consoleId, `🔌 WebSocket closed (${ev.code})`);
  }

  // Playbook Manager handlers (placeholders)
  const createPbBtn = document.getElementById('create-playbook-btn');
  if(createPbBtn && !createPbBtn.dataset.bound){
    createPbBtn.dataset.bound = '1';
    createPbBtn.addEventListener('click', () => {
      document.getElementById('playbook-editor').value = '---\n- name: New playbook\n  hosts: all\n  tasks:\n    - debug: msg:"hello"\n';
    });
  }
  const uploadPbInput = document.getElementById('upload-playbook-input');
  if(uploadPbInput && !uploadPbInput.dataset.bound){
    uploadPbInput.dataset.bound = '1';
    uploadPbInput.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if(!f) return;
      const text = await f.text();
      document.getElementById('playbook-editor').value = text;
    });
  }
  const savePbBtn = document.getElementById('save-playbook-btn');
  if(savePbBtn && !savePbBtn.dataset.bound){
    savePbBtn.dataset.bound = '1';
    savePbBtn.addEventListener('click', async () => {
      // TODO: send to backend
      alert('Đã lưu playbook (demo).');
    });
  }

  // K8s Deploy handlers (placeholders)
  const runDeployBtn = document.getElementById('run-k8s-deploy-btn');
  if(runDeployBtn && !runDeployBtn.dataset.bound){
    runDeployBtn.dataset.bound = '1';
    runDeployBtn.addEventListener('click', async () => {
      const playbook = document.getElementById('k8s-deploy-playbook-select')?.value || '';
      const extra = document.getElementById('k8s-deploy-extra-vars')?.value || '';
      if(!playbook){ alert('Vui lòng chọn playbook'); return; }
      // TODO: trigger backend to run ansible-playbook
      alert('Đang thực thi (demo): ' + playbook + (extra? (' with ' + extra) : ''));
    });
  }
  
  // Close modal cleanup
  document.getElementById('ansibleInstallModal').addEventListener('hidden.bs.modal', function() {
    if (ansibleWebSocket) {
      ansibleWebSocket.close();
    }
    clearAnsibleOutput();
  });
});



