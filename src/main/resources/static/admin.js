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

// Function để reset dữ liệu cluster khi quay lại danh sách
function resetClusterData() {
  // Reset global cluster ID
  currentClusterId = null;
  window.currentClusterId = null;
  
  // Reset trong playbook-manager.js
  if (window.setCurrentClusterId) {
    window.setCurrentClusterId(null);
  }
  
  // Clear Chi tiết Cluster (cluster detail UI elements)
  const elementsToReset = [
    'cd-name', 'cd-master', 'cd-workers', 'cd-status', 'cd-version'
  ];
  
  elementsToReset.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = '';
    }
  });
  
  // Clear Nodes table
  const nodesTbody = document.getElementById('cd-nodes-tbody');
  if (nodesTbody) {
    nodesTbody.innerHTML = '';
  }
  
  // Clear cluster message
  const msgElement = document.getElementById('cd-msg');
  if (msgElement) {
    msgElement.innerHTML = '';
    msgElement.className = 'small mb-2';
  }
  
  // Clear Chi tiết server (Ansible status display)
  const ansibleStatusDisplay = document.getElementById('ansible-status-display');
  if (ansibleStatusDisplay) {
    ansibleStatusDisplay.innerHTML = `
      <div class="text-muted text-center py-3">
        <i class="bi bi-info-circle"></i> Click "Kiểm tra trạng thái" để xem thông tin Ansible trên các MASTER servers
      </div>
    `;
  }
  
  // Hide Ansible status table
  const ansibleStatusTable = document.getElementById('ansible-status-table');
  if (ansibleStatusTable) {
    ansibleStatusTable.classList.add('d-none');
  }
  
  // Clear Ansible status tbody (Chi tiết server)
  const ansibleStatusTbody = document.getElementById('ansible-status-tbody');
  if (ansibleStatusTbody) {
    ansibleStatusTbody.innerHTML = '';
  }
  
  console.log('Cluster data has been reset - Chi tiết Cluster, Nodes, Chi tiết server đã được xóa');
}

async function showClusterDetail(clusterId){
  // Set current cluster ID for Ansible functions
  currentClusterId = clusterId;
  
  // Also set in playbook-manager.js
  if (window.setCurrentClusterId) {
    window.setCurrentClusterId(clusterId);
  }
  
  // Chuyển đổi sections
  document.getElementById('k8s-list')?.classList.add('d-none');
  document.getElementById('k8s-create')?.classList.add('d-none');
  document.getElementById('k8s-assign')?.classList.add('d-none');
  document.getElementById('k8s-detail')?.classList.remove('d-none');


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

  // Tự động kiểm tra trạng thái Ansible và load playbooks sau khi có dữ liệu cluster
  // Chỉ gọi API nếu cluster có nodes
  try { 
    setTimeout(() => { 
      try { 
        // Kiểm tra nếu cluster có nodes trước khi gọi API
        if (detail.nodes && detail.nodes.length > 0) {
          checkAnsibleStatus(clusterId); 
          if (window.loadPlaybooks) { window.loadPlaybooks(clusterId); } else { loadPlaybooks(); }
        } else {
          console.log('Cluster không có nodes, bỏ qua việc gọi API Ansible và Playbook');
        }
      } catch(_){} 
    }, 100); // Tăng delay để đảm bảo UI đã render xong
  } catch(_) {}

  const tbody = document.getElementById('cd-nodes-tbody');
  tbody.innerHTML = '';
  // Hiển thị trạng thái đang tải cho bảng Nodes trong khi chờ script/requests
  const loadingRow = document.createElement('tr');
  loadingRow.innerHTML = `
    <td colspan="7" class="text-center py-3">
      <div class="d-inline-flex align-items-center text-muted">
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>Đang tải dữ liệu cụm...</span>
      </div>
    </td>
  `;
  tbody.appendChild(loadingRow);

  // Nếu không có nodes, hiển thị thông báo và dừng
  if (!detail.nodes || detail.nodes.length === 0) {
    // Thay thế loading bằng thông báo không có máy chủ
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7" class="text-center text-muted py-4">
        <i class="bi bi-server me-2"></i>
        Cluster này chưa có máy chủ nào. Vui lòng thêm máy chủ vào cluster để xem thông tin.
      </td>
    `;
    tbody.appendChild(tr);
  } else {
    // Tải trạng thái K8s từ backend để hiển thị Ready/NotReady cho node online
    let k8sNodeByIP = new Map();
    let k8sNodeByName = new Map();
    try {
      const k8sResp = await fetchJSON(`/admin/clusters/${clusterId}/k8s/nodes`).catch((err)=>{
        console.error('[k8s/nodes] fetch error:', err);
        return null;
      });
      if (k8sResp && k8sResp.wide) {
        console.log('[kubectl get nodes -o wide]\n' + k8sResp.wide);
      } else if (!k8sResp) {
        console.warn('[k8s/nodes] No response');
      } else {
        // Chỉ cảnh báo thiếu "wide" nếu nodes rỗng; nếu đã có nodes thì bỏ qua cảnh báo này
        const hasNodes = Array.isArray(k8sResp.nodes) && k8sResp.nodes.length > 0;
        if (!hasNodes) {
          console.warn('[k8s/nodes] wide output missing');
          if (k8sResp.rawJson) {
            console.log('[kubectl get nodes -o json]\n' + k8sResp.rawJson);
          }
          if (k8sResp.tried) {
            console.log('[k8s/nodes] attempts:\n' + k8sResp.tried);
          }
        }
      }
      if (k8sResp && Array.isArray(k8sResp.nodes)) {
        console.log('[k8s/nodes] parsed nodes:', k8sResp.nodes);
        k8sResp.nodes.forEach(nd => {
          if (nd.internalIP) {
            k8sNodeByIP.set(String(nd.internalIP), nd);
          }
          if (nd.name) {
            k8sNodeByName.set(String(nd.name), nd);
          }
        });
        console.log('[k8s/nodes] map keys (IP):', Array.from(k8sNodeByIP.keys()));
        console.log('[k8s/nodes] map keys (Name):', Array.from(k8sNodeByName.keys()));
      } else if (k8sResp) {
        console.warn('[k8s/nodes] nodes array missing or empty');
      }
    } catch(e){
      console.error('[k8s/nodes] unexpected error:', e);
    }

    // Kiểm tra lệch: nodes trong app nhưng không có trong kubectl; và ngược lại
    try {
      const appIps = new Set((detail.nodes||[]).map(n => String(n.ip)));
      const k8sIps = new Set(Array.from(k8sNodeByIP.keys()));
      const notInK8s = Array.from(appIps).filter(ip => !k8sIps.has(ip));
      const notInApp = Array.from(k8sIps).filter(ip => !appIps.has(ip));
      console.log('[k8s/nodes] app-but-not-in-k8s:', notInK8s);
      console.log('[k8s/nodes] k8s-but-not-in-app:', notInApp);
    } catch(_){}

    // Đã có dữ liệu, thay thế loading bằng nội dung bảng
    tbody.innerHTML = '';
    // Hiển thị danh sách nodes
    detail.nodes.forEach(n => {
      const isOnline = !!n.isConnected;
      // Nếu offline => OFFLINE; nếu online => đọc từ k8s map (Ready/NotReady)
      let statusLabel = 'OFFLINE';
      let statusBadge = 'secondary';
      if (isOnline) {
        // Tìm theo IP trước, nếu không có thì thử theo name
        const nd = k8sNodeByIP.get(String(n.ip)) || k8sNodeByName.get(String(n.ip));
        console.log('[k8s/nodes] map for row', { ip: n.ip, matched: nd });
        const k8sStatus = nd?.k8sStatus;
        if (k8sStatus === 'Ready') { statusLabel = 'Ready'; statusBadge = 'success'; }
        else if (k8sStatus === 'NotReady') { statusLabel = 'NotReady'; statusBadge = 'warning text-dark'; }
        else {
          // Không khớp kubectl → đánh dấu là CHƯA THÊM VÀO CLUSTER
          statusLabel = 'UNREGISTERED';
          statusBadge = 'dark';
        }
      }

      // Color coding cho RAM usage
      const ramPercentage = n.ramPercentage || 0;
      let ramColorClass = '';
      if (ramPercentage >= 90) {
        ramColorClass = 'text-danger fw-bold';
      } else if (ramPercentage >= 80) {
        ramColorClass = 'text-danger';
      } else if (ramPercentage >= 70) {
        ramColorClass = 'text-warning';
      } else if (ramPercentage >= 50) {
        ramColorClass = 'text-info';
      } else {
        ramColorClass = 'text-success';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td title="${n.username||''}">${n.ip}</td>
        <td>${n.role}</td>
        <td><span class="badge bg-${statusBadge}" title="${statusLabel==='UNREGISTERED'?'Node chưa đăng ký trong cụm (không thấy trong kubectl)':''}">${statusLabel}</span></td>
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
  }

  const backBtn = document.getElementById('cd-back');
  if(backBtn && !backBtn.dataset.bound){
    backBtn.dataset.bound='1';
    backBtn.addEventListener('click', async () => {
      // Reset Chi tiết Cluster, Nodes, Chi tiết server trước khi quay lại danh sách
      resetClusterData();
      
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
    
    // Gọi API kiểm tra trạng thái Ansible
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
    let alertType = 'danger';
    let iconClass = 'bi-exclamation-triangle';
    
    if (error.message.includes('Cluster không có servers nào')) {
      errorMessage = 'Cluster này chưa có máy chủ nào. Vui lòng thêm máy chủ vào cluster trước khi kiểm tra Ansible.';
      alertType = 'warning';
      iconClass = 'bi-server';
    } else if (error.message.includes('Yêu cầu không hợp lệ')) {
      errorMessage = 'Không có thông tin xác thực. Vui lòng kết nối lại các server trước khi kiểm tra Ansible.';
    } else if (error.message.includes('Không có session')) {
      errorMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    }
    
    statusDisplay.innerHTML = `
      <div class="alert alert-${alertType}">
        <i class="bi ${iconClass}"></i> ${errorMessage}
        <br><small class="text-muted">Vui lòng đảm bảo cluster có máy chủ và các server đã được kết nối.</small>
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
    
    // Kiểm tra sudo NOPASSWD cho server này
    const sudoInputsContainer = document.getElementById('sudo-password-inputs');
    sudoInputsContainer.innerHTML = '';
    
    let needsPassword = true;
    let statusMessage = '';
    
    try {
      const sudoCheckResponse = await fetch(`/api/ansible-config/check-sudo/${clusterId}?host=${targetHost}`);
      const sudoCheckData = await sudoCheckResponse.json();
      
      if (sudoCheckData.success && sudoCheckData.hasNopasswd) {
        needsPassword = false;
        statusMessage = '<span class="badge sudo-status-badge sudo-status-success"><i class="bi bi-check-circle"></i> Sudo NOPASSWD</span>';
      } else {
        statusMessage = '<span class="badge sudo-status-badge sudo-status-warning"><i class="bi bi-exclamation-triangle"></i> Cần mật khẩu sudo</span>';
      }
    } catch (error) {
      statusMessage = '<span class="badge sudo-status-badge sudo-status-secondary"><i class="bi bi-question-circle"></i> Không kiểm tra được</span>';
    }
    
    const colDiv = document.createElement('div');
    colDiv.className = 'col-12 mb-3';
    colDiv.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h6 class="card-title">${targetServer.ip} <span class="badge bg-${targetServer.role === 'MASTER' ? 'primary' : 'secondary'}">${targetServer.role}</span> ${statusMessage}</h6>
          ${needsPassword ? `
            <input type="password" class="form-control sudo-password-input" 
                   data-host="${targetServer.ip}" placeholder="Nhập mật khẩu sudo cho MASTER">
          ` : `
            <div class="form-control-plaintext text-success">
              <i class="bi bi-check-circle"></i> Không cần mật khẩu sudo (sudo NOPASSWD)
            </div>
          `}
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
  
  // Chỉ hiển thị MASTER server
  const masterNodes = clusterDetail.nodes.filter(node => node.role === 'MASTER');
  
  if (masterNodes.length === 0) {
    alert('Không tìm thấy MASTER server trong cluster');
    return;
  }
  
  // Kiểm tra sudo NOPASSWD cho MASTER server
  const sudoInputsContainer = document.getElementById('sudo-password-inputs');
  sudoInputsContainer.innerHTML = '';
  
  for (const node of masterNodes) {
    const colDiv = document.createElement('div');
    colDiv.className = 'col-12 mb-3';
    
    // Kiểm tra sudo NOPASSWD cho MASTER server
    let needsPassword = true;
    let statusMessage = '';
    
    try {
      const sudoCheckResponse = await fetch(`/api/ansible-config/check-sudo/${clusterId}?host=${node.ip}`);
      const sudoCheckData = await sudoCheckResponse.json();
      
      if (sudoCheckData.success && sudoCheckData.hasNopasswd) {
        needsPassword = false;
        statusMessage = '<span class="badge sudo-status-badge sudo-status-success"><i class="bi bi-check-circle"></i> Sudo NOPASSWD</span>';
      } else {
        statusMessage = '<span class="badge sudo-status-badge sudo-status-warning"><i class="bi bi-exclamation-triangle"></i> Cần mật khẩu sudo</span>';
      }
    } catch (error) {
      statusMessage = '<span class="badge sudo-status-badge sudo-status-secondary"><i class="bi bi-question-circle"></i> Không kiểm tra được</span>';
    }
    
    colDiv.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h6 class="card-title">${node.ip} <span class="badge bg-primary">MASTER</span> ${statusMessage}</h6>
          <p class="text-muted small">Ansible sẽ được cài đặt chỉ trên MASTER server</p>
          ${needsPassword ? `
            <input type="password" class="form-control sudo-password-input" 
                   data-host="${node.ip}" placeholder="Nhập mật khẩu sudo cho MASTER">
          ` : `
            <div class="form-control-plaintext text-success">
              <i class="bi bi-check-circle"></i> Không cần mật khẩu sudo (sudo NOPASSWD)
            </div>
          `}
        </div>
      </div>
    `;
    sudoInputsContainer.appendChild(colDiv);
  }
  
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
  let hasNopasswdServers = false;
  
  // Thu thập mật khẩu từ các input có sẵn (chỉ cho MASTER)
  document.querySelectorAll('.sudo-password-input').forEach(input => {
    const host = input.dataset.host;
    const password = input.value.trim();
    if (password) {
      sudoPasswords[host] = password;
      hasPassword = true;
    }
  });
  
  // Kiểm tra xem có server nào có sudo NOPASSWD không
  document.querySelectorAll('.form-control-plaintext.text-success').forEach(element => {
    hasNopasswdServers = true;
  });
  
  // Nếu không có mật khẩu và không có server nào có sudo NOPASSWD
  if (!hasPassword && !hasNopasswdServers) {
    alert('Vui lòng nhập mật khẩu sudo cho MASTER server hoặc cấu hình sudo NOPASSWD.');
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
      addLogMessage('error', '❌ Lỗi parse message: ' + (e.message || 'Không xác định'));
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
  let hasNopasswdServers = false;
  
  // Thu thập mật khẩu từ các input có sẵn
  document.querySelectorAll('.sudo-password-input').forEach(input => {
    const host = input.dataset.host;
    const password = input.value.trim();
    if (password) {
      sudoPasswords[host] = password;
      hasPassword = true;
    }
  });
  
  // Kiểm tra xem có server nào có sudo NOPASSWD không
  document.querySelectorAll('.form-control-plaintext.text-success').forEach(element => {
    hasNopasswdServers = true;
  });
  
  // Nếu không có mật khẩu và không có server nào có sudo NOPASSWD
  if (!hasPassword && !hasNopasswdServers) {
    addLogMessage('error', '❌ Vui lòng nhập mật khẩu sudo cho MASTER server hoặc cấu hình sudo NOPASSWD');
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
  
  // Log thông tin debug
  console.log('Sending WebSocket message:', message);
  console.log('Sudo passwords:', sudoPasswords);
  console.log('Has password:', hasPassword);
  console.log('Has NOPASSWD servers:', hasNopasswdServers);
  
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
      
      // Validation: Kiểm tra cfg và hosts không được rỗng
      if (!cfg.trim() || !hosts.trim()) {
        showAlert('error', 'Vui lòng nhập đầy đủ nội dung cho ansible.cfg và hosts inventory');
        return;
      }
      
      // Lấy thông tin server MASTER để hiển thị trong hộp thoại xác nhận
      let masterHost = 'MASTER';
      try {
        const response = await fetch(`/api/ansible-config/read/${currentClusterId}`);
        const data = await response.json();
        if (data.success && data.server) {
          masterHost = data.server;
        }
      } catch (error) {
        console.warn('Không thể lấy thông tin server:', error);
        // Không thể lấy thông tin server MASTER - sử dụng fallback
      }
      
      // Hiển thị hộp thoại xác nhận
      const confirmMessage = `Xác nhận ghi đè cấu hình Ansible trên server MASTER (${masterHost})?`;
      if (!confirm(confirmMessage)) {
        return;
      }
      
      // Kiểm tra SSH key và sudo NOPASSWD trước khi yêu cầu password
      let sudoPassword = '';
      try {
        const checkResponse = await fetch(`/api/ansible-config/read/${currentClusterId}`);
        const checkData = await checkResponse.json();
        
        if (!checkData.success || (!checkData.cfg && !checkData.hosts)) {
          // Không có SSH key, kiểm tra sudo NOPASSWD
          const sudoCheckResponse = await fetch(`/api/ansible-config/check-sudo/${currentClusterId}`);
          const sudoCheckData = await sudoCheckResponse.json();
          
          if (!sudoCheckData.success || !sudoCheckData.hasNopasswd) {
            // Không có sudo NOPASSWD, yêu cầu nhập password
            sudoPassword = prompt('Server không có SSH key hoặc sudo NOPASSWD. Nhập mật khẩu sudo để ghi cấu hình:') || '';
            if (!sudoPassword) {
              // User đã hủy nhập password
              return;
            }
          } else {
            // SSH key với sudo NOPASSWD - không cần mật khẩu
          }
        } else {
          // SSH key - không cần mật khẩu sudo
        }
      } catch (error) {
        // Fallback: yêu cầu password nếu không kiểm tra được
        sudoPassword = prompt('Nhập mật khẩu sudo để ghi cấu hình lên MASTER:') || '';
        if (!sudoPassword) {
          // User đã hủy nhập password
          return;
        }
      }

      // Show loading state
      saveCfgBtn.disabled = true;
      saveCfgBtn.classList.add('btn-loading');
      saveCfgBtn.textContent = 'Đang lưu...';

      const formData = new FormData();
      formData.append('sudoPassword', sudoPassword);
      formData.append('cfg', cfg);
      formData.append('hosts', hosts);
      formData.append('vars', vars);


      fetch(`/api/ansible-config/save/${currentClusterId}`, {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          const now = new Date().toLocaleTimeString('vi-VN');
          
          // Tạo thông báo chi tiết về kết quả lưu và validation
          let statusMessage = '✅ Cấu hình đã được lưu thành công';
          
          // Thêm thông tin validation vào status message nếu có
          if (data.validation) {
            const configOK = data.validation.configCheck && data.validation.configCheck.includes('OK');
            const inventoryOK = data.validation.inventoryCheck && data.validation.inventoryCheck.includes('OK');
            const pingOK = data.validation.pingCheck && data.validation.pingCheck.includes('SUCCESS');
            
            if (configOK && inventoryOK && pingOK) {
              statusMessage = '✅ Cấu hình đã lưu - Config ✓ Inventory ✓ Ping ✓';
            } else {
              const checks = [];
              if (configOK) checks.push('Config ✓');
              if (inventoryOK) checks.push('Inventory ✓');
              if (pingOK) checks.push('Ping ✓');
              statusMessage = `✅ Cấu hình đã lưu - ${checks.join(' ')}`;
            }
            
            console.log('Ansible Validation Results:');
            console.log('Config Check:', data.validation.configCheck);
            console.log('Inventory Check:', data.validation.inventoryCheck);
            console.log('Ping Check:', data.validation.pingCheck);
          }
          
          // Update status panel
          updateConfigStatus('success', statusMessage, now);
          
          // Highlight all textareas with success state
          highlightTextarea('ansible-cfg-editor', 'success');
          highlightTextarea('ansible-inventory-editor', 'success');
          if (document.getElementById('ansible-vars-editor').value.trim()) {
            highlightTextarea('ansible-vars-editor', 'success');
          }
          
          // Tự động load lại dữ liệu sau khi lưu thành công
        setTimeout(() => {
          readAnsibleConfig();
        }, 2000);
        } else {
          const now = new Date().toLocaleTimeString('vi-VN');
          // Clear previous highlights
          clearTextareaHighlights();
          
          // Tạo thông báo lỗi chi tiết
          let errorMessage = '❌ Không thể lưu cấu hình';
          
          // Thêm thông tin lỗi validation nếu có
          if (data.details) {
            const configError = data.details.configCheck && !data.details.configCheck.includes('OK');
            const inventoryError = data.details.inventoryCheck && !data.details.inventoryCheck.includes('OK');
            const pingError = data.details.pingCheck && !data.details.pingCheck.includes('SUCCESS');
            
            const errors = [];
            if (configError) errors.push('Config ✗');
            if (inventoryError) errors.push('Inventory ✗');
            if (pingError) errors.push('Ping ✗');
            
            if (errors.length > 0) {
              errorMessage = `❌ Lưu thất bại - ${errors.join(' ')}`;
            }
            
            console.log('Validation Error Details:');
            console.log('Config Check:', data.details.configCheck);
            console.log('Inventory Check:', data.details.inventoryCheck);
            console.log('Ping Check:', data.details.pingCheck);
          }
          
          // Update status panel with error
          updateConfigStatus('error', errorMessage, now);
          
          // Highlight textareas with error state
          highlightTextarea('ansible-cfg-editor', 'error');
          highlightTextarea('ansible-inventory-editor', 'error');
          // Error message already shown in status panel
        }
      })
      .catch(error => {
        const now = new Date().toLocaleTimeString('vi-VN');
        console.error('Error:', error);
        updateConfigStatus('error', 'Lỗi khi lưu cấu hình: ' + (error.message || 'Không xác định'), now);
      })
      .finally(() => {
        // Reset button state
        saveCfgBtn.disabled = false;
        saveCfgBtn.classList.remove('btn-loading');
        saveCfgBtn.textContent = 'Lưu cấu hình';
      });
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
  async function runInitActionWS(action, consoleId){
    if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
    const hostSelect = document.getElementById('init-host-select');
    const host = hostSelect ? (hostSelect.value || null) : null;
    const needSudo = (action === 'init_structure' || action === 'init_config' || action === 'init_sshkey');
    
    let sudoPassword = null;
    if (needSudo) {
      // Kiểm tra sudo NOPASSWD trước khi yêu cầu mật khẩu
      try {
        const sudoCheckResponse = await fetch(`/api/ansible-config/check-sudo/${currentClusterId}${host ? `?host=${host}` : ''}`);
        const sudoCheckData = await sudoCheckResponse.json();
        
        if (!sudoCheckData.success || !sudoCheckData.hasNopasswd) {
          // Không có sudo NOPASSWD, yêu cầu nhập mật khẩu cho MASTER
          sudoPassword = prompt('MASTER server không có sudo NOPASSWD. Nhập mật khẩu sudo cho MASTER:') || '';
          if (!sudoPassword) {
            appendInitLogTo(consoleId, '❌ Hủy bỏ do không có mật khẩu sudo cho MASTER');
            return;
          }
        } else {
          // Có sudo NOPASSWD, không cần mật khẩu
          appendInitLogTo(consoleId, '✅ Sử dụng sudo NOPASSWD - không cần mật khẩu cho MASTER');
        }
      } catch (error) {
        // Fallback: yêu cầu mật khẩu nếu không kiểm tra được
        sudoPassword = prompt('Nhập mật khẩu sudo cho MASTER:') || '';
        if (!sudoPassword) {
          appendInitLogTo(consoleId, '❌ Hủy bỏ do không có mật khẩu sudo cho MASTER');
          return;
        }
      }
    }

    try { if(initActionsWS) { initActionsWS.close(); } } catch(_) {}
    const protocol = (location.protocol === 'https:') ? 'wss' : 'ws';
    initActionsWS = new WebSocket(`${protocol}://${location.host}/ws/ansible`);

    initActionsWS.onopen = () => {
      appendInitLogTo(consoleId, '🔗 WebSocket connected');
      const payload = { action, clusterId: currentClusterId, host };
      if (needSudo) payload.sudoPassword = sudoPassword;
      if (action === 'init_sshkey' && needSudo && sudoPassword) {
        appendInitLogTo(consoleId, '🔒 Sẽ dùng mật khẩu MASTER này làm SSH mật khẩu lần đầu cho WORKER khi chưa có key.');
      }
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
          if (data.type === 'step') {
            const line = `[${data.server||''}] Bước ${data.step}: ${data.message||''}`;
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
            } else if (data2.type === 'step') {
              const line = `[${data2.server||''}] Bước ${data2.step}: ${data2.message||''}`;
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

  // Playbook Manager handlers
  const createPbBtn = document.getElementById('create-playbook-btn');
  if(createPbBtn && !createPbBtn.dataset.bound){
    createPbBtn.dataset.bound = '1';
    createPbBtn.addEventListener('click', () => {
      document.getElementById('playbook-editor').value = '---\n- name: New playbook\n  hosts: all\n  tasks:\n    - debug: msg:"hello"\n';
    });
  }
  const savePbBtn = document.getElementById('save-playbook-btn');
  if(savePbBtn && !savePbBtn.dataset.bound){
    savePbBtn.dataset.bound = '1';
    savePbBtn.addEventListener('click', async () => {
      await savePlaybook();
    });
  }
  
  // Refresh playbooks button
  const refreshPbBtn = document.getElementById('refresh-playbooks-btn');
  if(refreshPbBtn && !refreshPbBtn.dataset.bound){
    refreshPbBtn.dataset.bound = '1';
    refreshPbBtn.addEventListener('click', async () => {
      console.log('Refresh playbooks button clicked');
      try {
        // Hiển thị loading state
        const originalText = refreshPbBtn.innerHTML;
        refreshPbBtn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Đang tải...';
        refreshPbBtn.disabled = true;
        
        await loadPlaybooks();
        
        // Khôi phục button
        refreshPbBtn.innerHTML = originalText;
        refreshPbBtn.disabled = false;
        
        console.log('Playbooks refreshed successfully');
      } catch (error) {
        console.error('Error refreshing playbooks:', error);
        // Khôi phục button ngay cả khi lỗi
        refreshPbBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Làm mới';
        refreshPbBtn.disabled = false;
      }
    });
  }
  
  // Delete playbook button
  const deletePbBtn = document.getElementById('delete-playbook-btn');
  if(deletePbBtn && !deletePbBtn.dataset.bound){
    deletePbBtn.dataset.bound = '1';
    deletePbBtn.addEventListener('click', async () => {
      const filename = document.getElementById('playbook-filename')?.value;
      if(filename) {
        await deletePlaybook(filename);
      }
    });
  }
  
  // Execute playbook button
  const executePbBtn = document.getElementById('execute-playbook-btn');
  if(executePbBtn && !executePbBtn.dataset.bound){
    executePbBtn.dataset.bound = '1';
    executePbBtn.addEventListener('click', async () => {
      const filename = document.getElementById('playbook-filename')?.value;
      if(filename) {
        await executePlaybook(filename);
      }
    });
  }

  // Upload playbook button
  const uploadPbInput = document.getElementById('upload-playbook-input');
  if(uploadPbInput && !uploadPbInput.dataset.bound){
    uploadPbInput.dataset.bound = '1';
    uploadPbInput.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      
      try {
        // Load content into editor
        const text = await file.text();
      document.getElementById('playbook-editor').value = text;
        document.getElementById('playbook-filename').value = file.name.replace(/\.(yml|yaml)$/i, '');
        
        // Upload to server
        await uploadPlaybook(file);
        
        // Reset input
        event.target.value = '';
      } catch (error) {
        console.error('Error uploading playbook:', error);
      }
    });
  }




  
  // Close modal cleanup
  document.getElementById('ansibleInstallModal').addEventListener('hidden.bs.modal', function() {
    if (ansibleWebSocket) {
      ansibleWebSocket.close();
    }
    clearAnsibleOutput();
  });


// ================= Playbook Management Functions =================

// Load playbooks for current cluster (moved to playbook-manager.js)
async function loadPlaybooks() {
  if (window.loadPlaybooks) {
    return window.loadPlaybooks();
  }
  console.error('playbook-manager.js not loaded');
}

// Load playbook content
window.loadPlaybook = async function(filename) {
  if (!currentClusterId || !filename) return;
  
  try {
    // Hiển thị nội dung file và ẩn execution status
    window.showPlaybookContentView();
    
    const result = await fetchJSON(`/api/ansible-playbook/read/${currentClusterId}?filename=${encodeURIComponent(filename)}`);
    const editor = document.getElementById('playbook-editor');
    const filenameInput = document.getElementById('playbook-filename');
    const deleteBtn = document.getElementById('delete-playbook-btn');
    const executeBtn = document.getElementById('execute-playbook-btn');
    
    if (editor) {
      editor.value = result.content;
    }
    if (filenameInput) {
      filenameInput.value = filename;
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-block';
    }
    if (executeBtn) {
      executeBtn.style.display = 'inline-block';
    }
    
    return result;
  } catch (error) {
    console.error('Error loading playbook:', error);
    showAlert('error', 'Lỗi tải playbook: ' + error.message);
  }
}

// Save playbook
window.savePlaybook = async function() {
  if (!currentClusterId) {
    showAlert('error', 'Vui lòng chọn cluster trước');
    return;
  }
  
  const filename = document.getElementById('playbook-filename')?.value;
  const content = document.getElementById('playbook-editor')?.value;
  
  if (!filename || !content) {
    showAlert('error', 'Vui lòng nhập tên file và nội dung playbook');
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('content', content);
    
    const result = await fetch(`/api/ansible-playbook/save/${currentClusterId}`, {
      method: 'POST',
      body: formData
    });
    
    if (!result.ok) {
      const errorData = await result.json();
      throw new Error(errorData.error || 'Lỗi lưu playbook');
    }
    
    const response = await result.json();
    showAlert('success', 'Đã lưu playbook thành công');
    
    // Reload playbook list
    try {
      await loadPlaybooks();
      console.log('Playbook list refreshed successfully');
    } catch (error) {
      console.error('Error refreshing playbook list:', error);
    }
  } catch (error) {
    console.error('Error saving playbook:', error);
    showAlert('error', 'Lỗi lưu playbook: ' + error.message);
  }
}

// Delete playbook
window.deletePlaybook = async function(filename) {
  if (!currentClusterId || !filename) return;
  
  if (!confirm(`Bạn có chắc muốn xóa playbook "${filename}"?`)) return;
  
  try {
    const result = await fetchJSON(`/api/ansible-playbook/delete/${currentClusterId}?filename=${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    
    showAlert('success', `Đã xóa playbook "${filename}" thành công`);
    await loadPlaybooks(); // Reload playbook list
  } catch (error) {
    console.error('Error deleting playbook:', error);
    showAlert('error', 'Lỗi xóa playbook: ' + error.message);
  }
}

// Execute playbook
window.executePlaybook = async function(filename, extraVars = '') {
  if (!currentClusterId || !filename) return;
  
  try {
    // Ẩn content section và hiện execution status
    window.showPlaybookExecutionView();
    
    const formData = new FormData();
    formData.append('filename', filename);
    if (extraVars) {
      formData.append('extraVars', extraVars);
    }
    
    const result = await fetch(`/api/ansible-playbook/execute/${currentClusterId}`, {
      method: 'POST',
      body: formData
    });
    
    if (!result.ok) {
      const errorData = await result.json();
      throw new Error(errorData.error || 'Lỗi thực thi playbook');
    }
    
    const response = await result.json();
    showAlert('success', `Đã bắt đầu thực thi playbook: ${filename}`);
    
    // Start monitoring execution status
    if (response.taskId) {
      monitorPlaybookExecution(response.taskId);
    }
    
    return response; // Trả về response để có thể sử dụng taskId
  } catch (error) {
    console.error('Error executing playbook:', error);
    showAlert('error', 'Lỗi thực thi playbook: ' + error.message);
    // Hiện lại content section khi có lỗi
    window.showPlaybookContentView();
    throw error; // Ném lỗi để caller có thể xử lý
  }
}

// Functions to show/hide sections
window.showPlaybookExecutionView = function() {
  const contentArea = document.getElementById('playbook-content-area');
  const executionStatus = document.getElementById('playbook-execution-status');
  
  if (contentArea) {
    contentArea.style.display = 'none';
  }
  if (executionStatus) {
    executionStatus.style.display = 'block';
  }
}

window.showPlaybookContentView = function() {
  const contentArea = document.getElementById('playbook-content-area');
  const executionStatus = document.getElementById('playbook-execution-status');
  
  if (contentArea) {
    contentArea.style.display = 'block';
  }
  if (executionStatus) {
    executionStatus.style.display = 'none';
  }
}

// Monitor playbook execution
async function monitorPlaybookExecution(taskId) {
  const statusElement = document.getElementById('playbook-execution-status');
  if (!statusElement) return;
  
  // Tạo terminal-style output container
  statusElement.innerHTML = `
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0"><i class="bi bi-terminal"></i> Ansible Playbook Execution</h6>
        <div class="d-flex align-items-center">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status" id="execution-spinner">
            <span class="visually-hidden">Loading...</span>
          </div>
          <button class="btn btn-sm btn-outline-secondary" onclick="clearExecutionOutput()">
            <i class="bi bi-x-circle"></i> Clear
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="progress" style="height: 4px;">
          <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" id="execution-progress" style="width: 0%"></div>
        </div>
        <div id="ansible-output" class="bg-dark text-light p-3" style="font-family: 'Courier New', monospace; font-size: 0.875rem; height: 400px; overflow-y: auto; white-space: pre-wrap;">
          <div class="text-success">🚀 Bắt đầu thực thi playbook...</div>
        </div>
      </div>
    </div>
  `;
  
  const outputElement = document.getElementById('ansible-output');
  
  let lastOutputLength = 0;
  let lastProgress = 0;
  
  const checkStatus = async () => {
    try {
      const status = await fetchJSON(`/api/ansible-playbook/status/${currentClusterId}?taskId=${taskId}`);
      
      // Cập nhật progress bar
      const progressBar = document.getElementById('execution-progress');
      if (progressBar) {
        const progress = status.progress || 0;
        progressBar.style.width = `${progress}%`;
        
        if (status.status === 'running') {
          progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
        } else if (status.status === 'completed') {
          progressBar.className = 'progress-bar bg-success';
        } else if (status.status === 'failed') {
          progressBar.className = 'progress-bar bg-danger';
        }
      }
      
      // Cập nhật spinner
      const spinner = document.getElementById('execution-spinner');
      if (spinner) {
        if (status.status === 'running') {
          spinner.style.display = 'block';
        } else {
          spinner.style.display = 'none';
        }
      }
      
      // Chỉ cập nhật progress bar và spinner, không hiển thị status text
      lastProgress = status.progress || 0;
      
      // Thêm output mới vào terminal
      if (status.output && status.output.length > lastOutputLength) {
        const newOutput = status.output.substring(lastOutputLength);
        lastOutputLength = status.output.length;
        
        const outputLines = newOutput.split('\n');
        let hasNewContent = false;
        
        outputLines.forEach(line => {
          if (line.trim()) {
            hasNewContent = true;
            const lineElement = document.createElement('div');
            lineElement.style.marginBottom = '2px';
            
            // Color coding cho các loại output khác nhau
            if (line.includes('PLAY [')) {
              lineElement.className = 'text-primary fw-bold';
              lineElement.innerHTML = line.replace(/PLAY \[(.*?)\]/g, '🎭 PLAY [$1]');
            } else if (line.includes('TASK [')) {
              lineElement.className = 'text-warning fw-bold';
              lineElement.innerHTML = line.replace(/TASK \[(.*?)\]/g, '📋 TASK [$1]');
            } else if (line.includes('PLAY RECAP')) {
              lineElement.className = 'text-info fw-bold';
              lineElement.innerHTML = '📊 PLAY RECAP';
            } else if (line.includes('ok:')) {
              lineElement.className = 'text-success';
              lineElement.innerHTML = '✅ ' + line;
            } else if (line.includes('changed:')) {
              lineElement.className = 'text-warning';
              lineElement.innerHTML = '🔄 ' + line;
            } else if (line.includes('failed:')) {
              lineElement.className = 'text-danger';
              lineElement.innerHTML = '❌ ' + line;
            } else if (line.includes('unreachable:')) {
              lineElement.className = 'text-danger';
              lineElement.innerHTML = '🚫 ' + line;
            } else if (line.includes('skipping:')) {
              lineElement.className = 'text-secondary';
              lineElement.innerHTML = '⏭️ ' + line;
            } else if (line.includes('=>')) {
              lineElement.className = 'text-light';
              lineElement.innerHTML = '📤 ' + line;
            } else {
              lineElement.className = 'text-light';
              lineElement.textContent = line;
            }
            
            outputElement.appendChild(lineElement);
          }
        });
        
        // Chỉ scroll nếu có nội dung mới
        if (hasNewContent) {
          outputElement.scrollTop = outputElement.scrollHeight;
        }
      }
      
             if (status.status === 'completed') {
               // Dừng spinner và cập nhật progress bar
               const spinner = document.getElementById('execution-spinner');
               if (spinner) spinner.style.display = 'none';
               
               const progressBar = document.getElementById('execution-progress');
               if (progressBar) {
                 progressBar.style.width = '100%';
                 progressBar.className = 'progress-bar bg-success';
               }
               
              const summaryElement = document.createElement('div');
              summaryElement.className = 'text-success mt-3 border-top pt-2';
              const titleEl = document.createElement('div');
              titleEl.className = 'fw-bold';
              titleEl.textContent = '🎉 Hoàn thành thực thi playbook!';
              const timeEl = document.createElement('div');
              timeEl.className = 'small text-white';
              timeEl.textContent = `Thời gian thực thi: ${Math.round((status.endTime - status.startTime) / 1000)}s`;
              summaryElement.appendChild(titleEl);
              summaryElement.appendChild(timeEl);
              outputElement.appendChild(summaryElement);
               outputElement.scrollTop = outputElement.scrollHeight;
               return; // Stop monitoring
             } else if (status.status === 'failed') {
               // Dừng spinner và cập nhật progress bar
               const spinner = document.getElementById('execution-spinner');
               if (spinner) spinner.style.display = 'none';
               
               const progressBar = document.getElementById('execution-progress');
               if (progressBar) {
                 progressBar.className = 'progress-bar bg-danger';
               }
               
               const errorElement = document.createElement('div');
               errorElement.className = 'text-danger mt-3 border-top pt-2';
               errorElement.innerHTML = `
                 <div class="fw-bold">💥 Thất bại thực thi playbook!</div>
                 <div class="small">Lỗi: ${status.error || status.message}</div>
               `;
               outputElement.appendChild(errorElement);
               outputElement.scrollTop = outputElement.scrollHeight;
               return; // Stop monitoring
             }
      
      // Continue monitoring if still running
      setTimeout(checkStatus, 1000); // Check every second for real-time feel
    } catch (error) {
      console.error('Error checking execution status:', error);
      const errorElement = document.createElement('div');
      errorElement.className = 'text-danger mt-3 border-top pt-2';
      const errTitle = document.createElement('div');
      errTitle.className = 'fw-bold';
      errTitle.textContent = '⚠️ Lỗi kiểm tra trạng thái';
      const errMsg = document.createElement('div');
      errMsg.className = 'small';
      errMsg.textContent = error.message || 'Unknown error';
      errorElement.appendChild(errTitle);
      errorElement.appendChild(errMsg);
      outputElement.appendChild(errorElement);
    }
  };
  
  checkStatus();
}

// Function to clear execution output
window.clearExecutionOutput = function() {
  const statusElement = document.getElementById('playbook-execution-status');
  if (statusElement) {
    statusElement.innerHTML = '';
  }
};

// Global function để refresh playbooks (có thể gọi từ HTML)
window.refreshPlaybooks = async function() {
  console.log('Global refreshPlaybooks called');
  try {
    await loadPlaybooks();
    console.log('Playbooks refreshed via global function');
  } catch (error) {
    console.error('Error in global refreshPlaybooks:', error);
  }
};

// Test function for playbook search
window.testPlaybookSearch = function() {
  const searchInput = document.getElementById('search-playbook-input');
  const playbookList = document.getElementById('playbook-list');
  
  if (!searchInput || !playbookList) {
    console.error('Search elements not found');
    return;
  }
  
  const items = playbookList.querySelectorAll('.list-group-item');
  console.log(`Total playbook items: ${items.length}`);
  
  items.forEach((item, index) => {
    const nameElement = item.querySelector('.playbook-name');
    const name = nameElement ? nameElement.textContent : 'No name';
    console.log(`Item ${index + 1}: "${name}"`);
  });
  
  // Test search functionality
  searchInput.value = 'test';
  searchInput.dispatchEvent(new Event('input'));
};

// Function to test search with specific keyword
window.testSearchWithKeyword = function(keyword) {
  const searchInput = document.getElementById('search-playbook-input');
  if (!searchInput) {
    console.error('Search input not found');
    return;
  }
  
  console.log(`Testing search with keyword: "${keyword}"`);
  searchInput.value = keyword;
  searchInput.dispatchEvent(new Event('input'));
};

// Function to manually test item visibility
window.testItemVisibility = function() {
  const list = document.getElementById('playbook-list');
  if (!list) {
    console.error('playbook-list not found');
    return;
  }
  
  const items = list.querySelectorAll('.list-group-item');
  console.log(`Found ${items.length} items`);
  
  items.forEach((item, index) => {
    const nameElement = item.querySelector('.playbook-name');
    const name = nameElement ? nameElement.textContent : 'No name';
    console.log(`Item ${index + 1}: "${name}" - Display: ${item.style.display}`);
    
    // Test hiding/showing
    if (index === 0) {
      console.log('Hiding first item...');
      item.style.display = 'none';
    }
  });
};

// Simple search test function
window.testSimpleSearch = function() {
  const searchInput = document.getElementById('search-playbook-input');
  const list = document.getElementById('playbook-list');
  
  if (!searchInput || !list) {
    console.error('Search elements not found');
    return;
  }
  
  console.log('Testing simple search...');
  searchInput.value = 'nginx';
  searchInput.dispatchEvent(new Event('input'));
  
  setTimeout(() => {
    const items = list.querySelectorAll('.list-group-item');
    items.forEach((item, index) => {
      const nameElement = item.querySelector('.playbook-name');
      const name = nameElement ? nameElement.textContent : 'No name';
      console.log(`After search - Item ${index + 1}: "${name}" - Display: ${item.style.display}`);
    });
  }, 100);
};

// Upload playbook from local file
window.uploadPlaybook = async function(file) {
  if (!currentClusterId) {
    showAlert('error', 'Vui lòng chọn cluster trước');
    return;
  }
  
  if (!file) {
    showAlert('error', 'Vui lòng chọn file để tải lên');
    return;
  }

  // Validate file type
  const allowedTypes = ['.yml', '.yaml'];
  const fileName = file.name.toLowerCase();
  if (!allowedTypes.some(type => fileName.endsWith(type))) {
    showAlert('error', 'Chỉ hỗ trợ file .yml và .yaml');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const result = await fetch(`/api/ansible-playbook/upload/${currentClusterId}`, {
      method: 'POST',
      body: formData
    });

    if (!result.ok) {
      const errorData = await result.json();
      throw new Error(errorData.error || 'Lỗi tải lên playbook');
    }

    const response = await result.json();
    showAlert('success', response.message || 'Đã tải lên playbook thành công');
    
    // Refresh playbook list
    try {
      await loadPlaybooks();
      console.log('Playbook list refreshed after upload');
    } catch (error) {
      console.error('Error refreshing playbook list after upload:', error);
    }

    return response;
  } catch (error) {
    console.error('Error uploading playbook:', error);
    showAlert('error', 'Lỗi tải lên playbook: ' + error.message);
    throw error;
  }
};

  // Template selector change event listener
  const templateSelect = document.getElementById('playbook-template-select');
  if (templateSelect && !templateSelect.dataset.bound) {
    templateSelect.dataset.bound = '1';
    templateSelect.addEventListener('change', function() {
      const filenameInput = document.getElementById('playbook-filename');
      if (filenameInput && this.value) {
        // Auto-fill filename based on template selection
        const templateName = this.value;
        const displayText = this.options[this.selectedIndex].text;
        const filename = templateName.replace(/^\d+-/, ''); // Remove number prefix
        filenameInput.value = filename;
      }
    });
  }

  // Generate from template event listener
  const generateFromTemplateBtn = document.getElementById('generate-from-template-btn');
  if (generateFromTemplateBtn && !generateFromTemplateBtn.dataset.bound) {
    generateFromTemplateBtn.dataset.bound = '1';
    generateFromTemplateBtn.addEventListener('click', async function() {
      const templateSelect = document.getElementById('playbook-template-select');
      const filenameInput = document.getElementById('playbook-filename');
      const editor = document.getElementById('playbook-editor');
      
      if (!templateSelect || !filenameInput || !editor) {
        showAlert('error', 'Không tìm thấy các phần tử cần thiết');
        return;
      }
      
      const selectedTemplate = templateSelect.value;
      if (!selectedTemplate) {
        showAlert('error', 'Vui lòng chọn template');
        return;
      }
      
      try {
        // Generate and save playbook from template
        const result = await generateK8sPlaybook(selectedTemplate);
        
        if (result && result.success) {
          // Refresh playbook list
          await loadPlaybooks();
          
          // Load the newly created playbook content
          await loadPlaybook(result.filename);
          
          showAlert('success', `Đã tạo playbook: ${result.filename}`);
        } else {
          showAlert('error', 'Lỗi tạo playbook từ template');
        }
      } catch (error) {
        console.error('Error generating playbook from template:', error);
        
        // Check if user cancelled the operation
        if (error.message && error.message.includes('Đã hủy')) {
          // User cancelled - don't show error, just return silently
          return;
        }
        
        showAlert('error', 'Lỗi tạo playbook từ template: ' + error.message);
      }
    });
  }

  // Load current ansible config when opening the modal
  const ansibleConfigModalEl = document.getElementById('ansibleConfigModal');
  if(ansibleConfigModalEl && !ansibleConfigModalEl.dataset.bound){
    ansibleConfigModalEl.dataset.bound = '1';
    
    // No mode toggles needed - only direct edit mode
    
    // No line-by-line handlers needed
    
    // Control buttons handlers
    const reloadConfigBtn = document.getElementById('reload-config-btn');
    
    // Reload config button
    reloadConfigBtn.addEventListener('click', () => {
      // Show loading state
      reloadConfigBtn.disabled = true;
      reloadConfigBtn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Đang tải lại...';
      
      readAnsibleConfig();
    });
    
    ansibleConfigModalEl.addEventListener('shown.bs.modal', () => {
      // Update cluster name in modal
      updateClusterNameInModal(currentClusterId);
      // Clear any previous highlights
      clearTextareaHighlights();
      // Reset status panel
      updateConfigStatus(null, 'Chưa kiểm tra');
      // Load config
      readAnsibleConfig();
      // Auto verify after a short delay
      setTimeout(() => {
        verifyAnsible();
      }, 1000);
    });
    
    ansibleConfigModalEl.addEventListener('hidden.bs.modal', () => {
      // No WebSocket cleanup needed for REST API
    }, { once: true });
  }
  
  // Load playbooks when Playbook Manager opens
  const playbookManagerModalEl = document.getElementById('playbookManagerModal');
  if (playbookManagerModalEl && !playbookManagerModalEl.dataset.bound) {
    playbookManagerModalEl.dataset.bound = '1';
    playbookManagerModalEl.addEventListener('shown.bs.modal', () => {
      // Lấy cluster ID từ URL hoặc từ cluster detail page
      let clusterId = currentClusterId;
      if (!clusterId) {
        // Thử lấy từ URL nếu đang ở cluster detail
        const urlParams = new URLSearchParams(window.location.search);
        clusterId = urlParams.get('clusterId');
      }
      
      console.log('Playbook modal opened, clusterId:', clusterId);
      
      // Reset UI state
      const statusEl = document.getElementById('playbook-execution-status');
      if (statusEl) statusEl.innerHTML = '';
      
      // Hiện lại content view khi mở modal
      window.showPlaybookContentView();
      document.getElementById('delete-playbook-btn')?.style && (document.getElementById('delete-playbook-btn').style.display = 'none');
      document.getElementById('execute-playbook-btn')?.style && (document.getElementById('execute-playbook-btn').style.display = 'none');
      
      // Reset template selector
      const templateSelect = document.getElementById('playbook-template-select');
      if (templateSelect) templateSelect.value = '';
      
      // Load list
      if (clusterId) {
        currentClusterId = clusterId; // Set lại currentClusterId
        if (window.setCurrentClusterId) window.setCurrentClusterId(clusterId);
        if (window.loadPlaybooks) { window.loadPlaybooks(clusterId); } else { loadPlaybooks(); }
      } else {
        console.warn('No cluster selected when opening playbook modal');
        const playbookList = document.getElementById('playbook-list');
        if (playbookList) {
          playbookList.innerHTML = '<div class="list-group-item text-center text-muted"><i class="bi bi-exclamation-triangle"></i> Không tìm thấy cluster</div>';
        }
      }
    });
  }


  // Client-side filter for playbook list
  const searchPlaybookInput = document.getElementById('search-playbook-input');
  if (searchPlaybookInput && !searchPlaybookInput.dataset.bound) {
    searchPlaybookInput.dataset.bound = '1';
    searchPlaybookInput.addEventListener('input', () => {
      const q = (searchPlaybookInput.value || '').toLowerCase().trim();
      const list = document.getElementById('playbook-list');
      if (!list) {
        console.error('playbook-list element not found');
        return;
      }
      
      const allItems = list.querySelectorAll('.list-group-item');
      console.log(`Total items found: ${allItems.length}`);
      
      let visibleCount = 0;
      Array.from(allItems).forEach((item, index) => {
        const nameElement = item.querySelector('.playbook-name');
        if (!nameElement) {
          console.warn(`Item ${index + 1}: No .playbook-name found`);
          return;
        }
        
        const name = nameElement.textContent?.toLowerCase() || '';
        const isMatch = !q || name.includes(q);
        
        console.log(`Item ${index + 1}: "${name}" - Match: ${isMatch}`);
        
        if (isMatch) {
          item.style.display = 'flex';
          item.style.visibility = 'visible';
          item.style.height = '';
          item.style.margin = '';
          item.style.padding = '';
          visibleCount++;
        } else {
          item.style.display = 'none';
          item.style.visibility = 'hidden';
          item.style.height = '0';
          item.style.margin = '0';
          item.style.padding = '0';
        }
      });
      
      // Debug log
      console.log(`Search "${q}": ${visibleCount} playbooks found`);
    });
  }
  
  // Global function to remove line
  window.removeLine = function(lineId) {
    const lineElement = document.getElementById(lineId);
    if (lineElement) {
      lineElement.closest('.d-flex').remove();
    }
  };
  
  // No line-by-line functions needed
  
  // Function to show validation modal
  function showValidationModal(validation, isError = false) {
    const modalHtml = `
      <div class="modal fade" id="validationModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">
                <i class="bi bi-${isError ? 'exclamation-triangle' : 'check-circle'}"></i>
                ${isError ? 'Lỗi xác minh cấu hình Ansible' : 'Kết quả xác minh cấu hình Ansible'}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="row">
                <div class="col-md-4">
                  <div class="card">
                    <div class="card-header">
                      <h6><i class="bi bi-gear"></i> ansible-config</h6>
                    </div>
                    <div class="card-body">
                      <pre class="small" style="max-height: 200px; overflow-y: auto;">${validation.configCheck || 'Không có kết quả'}</pre>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card">
                    <div class="card-header">
                      <h6><i class="bi bi-server"></i> ansible-inventory</h6>
                    </div>
                    <div class="card-body">
                      <pre class="small" style="max-height: 200px; overflow-y: auto;">${validation.inventoryCheck || 'Không có kết quả'}</pre>
                    </div>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="card">
                    <div class="card-header">
                      <h6><i class="bi bi-wifi"></i> ansible ping</h6>
                    </div>
                    <div class="card-body">
                      <pre class="small" style="max-height: 200px; overflow-y: auto;">${validation.pingCheck || 'Không có kết quả'}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
              ${isError ? '<button type="button" class="btn btn-warning" onclick="document.getElementById(\'ansibleConfigModal\').style.display=\'block\'">Chỉnh sửa lại</button>' : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('validationModal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Add new modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('validationModal'));
    modal.show();
  }

  // Function to show alert messages
  function showAlert(type, message) {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show`;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';
    
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.remove();
      }
    }, 5000);
  }
  
  // Function to verify ansible connectivity
  function verifyAnsible() {
    // Update status to loading
    updateConfigStatus('loading', 'Đang kiểm tra kết nối Ansible...');
    
    fetch(`/api/ansible-config/verify/${currentClusterId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      const now = new Date().toLocaleTimeString('vi-VN');
      if (data.success) {
        // Tạo thông báo chi tiết về kết quả xác minh
        let statusMessage = 'Ansible hoạt động bình thường';
        if (data.pingResult) {
          const pingSuccess = data.pingResult.includes('SUCCESS') || data.pingResult.includes('pong');
          if (pingSuccess) {
            statusMessage = '✅ Ansible hoạt động bình thường - Ping thành công';
          } else {
            statusMessage = '⚠️ Ansible cài đặt nhưng ping có vấn đề';
          }
        }
        updateConfigStatus('success', statusMessage, now);
        console.log('Ansible Ping Result:', data.pingResult);
      } else {
        // Tạo thông báo lỗi chi tiết
        let errorMessage = data.message || 'Ansible không hoạt động';
        if (data.pingResult) {
          errorMessage += ` - ${data.pingResult}`;
        }
        updateConfigStatus('error', errorMessage, now);
      }
    })
    .catch(error => {
      const now = new Date().toLocaleTimeString('vi-VN');
      console.error('Error verifying ansible:', error);
      updateConfigStatus('error', 'Lỗi khi xác minh ansible: ' + (error.message || 'Không xác định'), now);
    });
  }

  // Function to rollback configuration
  async function rollbackConfig() {
    const rollbackBtn = document.getElementById('rollback-config-btn');
    if (!rollbackBtn) return;
    
    // Xác nhận rollback
    if (!confirm('Xác nhận phục hồi cấu hình từ file backup (.bak)?')) {
      return;
    }
    
    // Kiểm tra SSH key và sudo NOPASSWD trước khi yêu cầu password
    let sudoPassword = '';
    try {
      // Kiểm tra xem có thể sử dụng SSH key không
      const checkResponse = await fetch(`/api/ansible-config/read/${currentClusterId}`);
      const checkData = await checkResponse.json();
      
      if (!checkData.success || (!checkData.cfg && !checkData.hosts)) {
        // Không có SSH key, kiểm tra sudo NOPASSWD
        const sudoCheckResponse = await fetch(`/api/ansible-config/check-sudo/${currentClusterId}`);
        const sudoCheckData = await sudoCheckResponse.json();
        
        if (!sudoCheckData.success || !sudoCheckData.hasNopasswd) {
          // Không có sudo NOPASSWD, yêu cầu nhập password
          sudoPassword = prompt('Server không có SSH key hoặc sudo NOPASSWD. Nhập mật khẩu sudo để rollback cấu hình:') || '';
          if (!sudoPassword) {
            // User đã hủy nhập password
            return;
          }
        } else {
          // SSH key với sudo NOPASSWD - không cần mật khẩu
        }
      } else {
        // SSH key - không cần mật khẩu sudo
      }
    } catch (error) {
      // Fallback: yêu cầu password nếu không kiểm tra được
      sudoPassword = prompt('Nhập mật khẩu sudo để rollback cấu hình:') || '';
      if (!sudoPassword) {
        // User đã hủy nhập password
        return;
      }
    }
    
    rollbackBtn.disabled = true;
    rollbackBtn.classList.add('btn-loading');
    rollbackBtn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Đang rollback...';
    
    const formData = new FormData();
    formData.append('sudoPassword', sudoPassword);
    
    fetch(`/api/ansible-config/rollback/${currentClusterId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      const now = new Date().toLocaleTimeString('vi-VN');
      if (data.success) {
        updateConfigStatus('success', '✅ Đã rollback cấu hình từ backup thành công', now);
        // Tự động load lại dữ liệu sau khi rollback thành công
        setTimeout(() => {
          readAnsibleConfig();
        }, 2000);
      } else {
        updateConfigStatus('error', '❌ ' + (data.message || 'Không thể rollback cấu hình'), now);
      }
    })
    .catch(error => {
      const now = new Date().toLocaleTimeString('vi-VN');
      console.error('Error rolling back config:', error);
      updateConfigStatus('error', '❌ Lỗi khi rollback: ' + (error.message || 'Không xác định'), now);
    })
    .finally(() => {
      rollbackBtn.disabled = false;
      rollbackBtn.classList.remove('btn-loading');
      rollbackBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Rollback';
    });
  }

  // Function to update cluster name in modal
  function updateClusterNameInModal(clusterId) {
    const clusterNameEl = document.getElementById('current-cluster-name');
    if (!clusterNameEl) return;
    
    // Try to get cluster name from the cluster list or use ID as fallback
    try {
      // This would need to be implemented based on your cluster data structure
      // For now, we'll use a simple approach
      clusterNameEl.textContent = `Cluster #${clusterId}`;
    } catch (error) {
      clusterNameEl.textContent = `Cluster #${clusterId}`;
    }
  }

  // Function to highlight textarea with error/success state
  function highlightTextarea(textareaId, state) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    
    // Remove existing state classes
    textarea.classList.remove('error', 'success');
    
    if (state === 'error') {
      textarea.classList.add('error');
    } else if (state === 'success') {
      textarea.classList.add('success');
    }
    
    // Auto remove success highlight after 3 seconds
    if (state === 'success') {
      setTimeout(() => {
        textarea.classList.remove('success');
      }, 3000);
    }
  }

  // Function to clear all textarea highlights
  function clearTextareaHighlights() {
    const textareas = document.querySelectorAll('.ansible-config-textarea');
    textareas.forEach(textarea => {
      textarea.classList.remove('error', 'success');
    });
  }

  // Function to update config status panel
  function updateConfigStatus(status, message, lastCheck = null) {
    const statusPanel = document.getElementById('config-status-panel');
    const statusText = document.getElementById('config-status-text');
    const lastCheckText = document.getElementById('config-last-check');
    
    if (!statusPanel || !statusText) return;
    
    // Remove all status classes
    statusPanel.classList.remove('status-success', 'status-error', 'status-warning', 'status-loading');
    
    // Add appropriate status class
    if (status) {
      statusPanel.classList.add(`status-${status}`);
    }
    
    // Update text content
    statusText.textContent = message || 'Chưa kiểm tra';
    
    // Update last check time
    if (lastCheckText) {
      if (lastCheck) {
        lastCheckText.textContent = `Lần cuối: ${lastCheck}`;
      } else {
        lastCheckText.textContent = '-';
      }
    }
  }

  // Function to read ansible config via REST API
  function readAnsibleConfig() {
      // Update status to loading
      updateConfigStatus('loading', 'Đang tải cấu hình...');
      
      fetch(`/api/ansible-config/read/${currentClusterId}?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      })
    .then(response => response.json())
      .then(data => {
        const now = new Date().toLocaleTimeString('vi-VN');
        if (data.success) {
          // Backend đã trả về raw content, không cần decode escape
          const cfgEl = document.getElementById('ansible-cfg-editor');
          const hostsEl = document.getElementById('ansible-inventory-editor');
          const varsEl = document.getElementById('ansible-vars-editor');
          
          if(cfgEl) cfgEl.value = data.cfg || '';
          if(hostsEl) hostsEl.value = data.hosts || '';
          if(varsEl) varsEl.value = data.vars || '';
          
          // Update status to success
          updateConfigStatus('success', 'Cấu hình đã được tải thành công', now);
        } else {
          // Silently handle error - don't show alert for read operation
          console.warn('Could not read config:', data.message);
          updateConfigStatus('warning', 'Không thể tải cấu hình: ' + (data.message || 'Không xác định'), now);
        }
      })
      .catch(error => {
        const now = new Date().toLocaleTimeString('vi-VN');
        console.error('Error reading config:', error);
        updateConfigStatus('error', 'Lỗi khi tải cấu hình: ' + (error.message || 'Không xác định'), now);
      })
    .finally(() => {
      // Reset reload button state
      const reloadConfigBtn = document.getElementById('reload-config-btn');
      if (reloadConfigBtn) {
        reloadConfigBtn.disabled = false;
        reloadConfigBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Tải lại';
      }
    });
  }
  
  // Event listeners for new buttons
  const verifyBtn = document.getElementById('verify-ansible-btn');
  if (verifyBtn && !verifyBtn.dataset.bound) {
    verifyBtn.dataset.bound = '1';
    verifyBtn.addEventListener('click', verifyAnsible);
  }

  const rollbackBtn = document.getElementById('rollback-config-btn');
  if (rollbackBtn && !rollbackBtn.dataset.bound) {
    rollbackBtn.dataset.bound = '1';
    rollbackBtn.addEventListener('click', rollbackConfig);
  }

});




// Generate K8s playbook from template (wrapper function)
async function generateK8sPlaybook(template) {
  // Call the function from playbook-manager.js directly
  return await generateK8sPlaybookFromTemplate(template);
}



