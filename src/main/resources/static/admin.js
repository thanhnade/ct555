// Ensure global showAlert exists early
if (typeof window !== 'undefined' && typeof window.showAlert !== 'function') {
  window.showAlert = function (type, message) {
    try {
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info'} alert-dismissible fade show`;
      alertDiv.style.position = 'fixed';
      alertDiv.style.top = '20px';
      alertDiv.style.right = '20px';
      alertDiv.style.zIndex = '9999';
      alertDiv.style.minWidth = '300px';
      alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
      document.body.appendChild(alertDiv);
      setTimeout(() => { if (alertDiv.parentNode) alertDiv.remove(); }, 5000);
    } catch (_) { alert(String(message || '')); }
  };
}

async function fetchJSON(url, options) {
  const res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
  if (!res.ok) {
    const cloned = res.clone();
    let msg = 'HTTP ' + res.status;
    try {
      const data = await res.json();
      if (typeof data === 'string') msg = data; else if (data.message) msg = data.message; else msg = JSON.stringify(data);
    } catch (e) {
      const text = await cloned.text().catch(() => '');
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
    if (!msg || msg === ('HTTP ' + res.status) || msg.startsWith('{') || msg.startsWith('[')) {
      msg = vi[res.status] || ('Lỗi (' + res.status + ')');
    }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

async function loadUsers() {
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
          <option ${u.role === 'CLIENT' ? 'selected' : ''}>CLIENT</option>
          <option ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
        </select>
      </td>
      <td><input type="number" class="form-control form-control-sm" min="100" step="1" value="${u.dataLimitMb}" data-id="${u.id}" data-field="dataLimitMb" /></td>
      <td><input type="text" class="form-control form-control-sm" value="${u.pathOnServer || ''}" placeholder="/data/${u.username}" data-id="${u.id}" data-field="pathOnServer" /></td>
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


function getRoleBadge(role) {
  const roleMap = {
    'ADMIN': '<span class="badge bg-primary">👑 Admin</span>',
    'OPERATOR': '<span class="badge bg-warning">⚙️ Operator</span>',
    'VIEWER': '<span class="badge bg-info">👁️ Viewer</span>',
    'CLIENT': '<span class="badge bg-secondary">👤 Client</span>'
  };
  return roleMap[role] || '<span class="badge bg-secondary">❓ Không xác định</span>';
}

// Server Management
async function loadServers() {
  const data = await fetchJSON('/admin/servers');
  let connectedIds = [];
  try { connectedIds = await fetchJSON('/admin/servers/connected'); } catch (e) { connectedIds = []; }

  // Auth/SSH key selection đã bỏ; password là bắt buộc khi tạo lần đầu

  const tbodyConn = document.getElementById('servers-connected-tbody');
  const tbodyHist = document.getElementById('servers-history-tbody');
  if (!tbodyConn || !tbodyHist) return;
  tbodyConn.innerHTML = '';
  tbodyHist.innerHTML = '';

  (data || []).forEach(s => {
    const tr = document.createElement('tr');
    const isConnected = connectedIds.includes(s.id);
    const statusCell = isConnected
      ? `<span class="badge bg-success">CONNECTED</span>`
      : `
        <select class="form-select form-select-sm" data-id="${s.id}" data-field="status">
          <option ${s.status === 'OFFLINE' ? 'selected' : ''}>OFFLINE</option>
          <option ${s.status === 'ONLINE' ? 'selected' : ''}>ONLINE</option>
        </select>`;
    const reconnectOrDisconnect = isConnected
      ? `<button class="btn btn-sm btn-outline-danger me-1" onclick="disconnectServer(${s.id})">Ngắt kết nối</button>`
      : `<button class="btn btn-sm btn-outline-secondary me-1" onclick="promptReconnect(${s.id})">Kết nối lại</button>`;
    tr.innerHTML = `
      <td>${s.id}</td>
      <td><input class="form-control form-control-sm" value="${s.host}" data-id="${s.id}" data-field="host" data-old-host="${s.host || ''}" /></td>
      <td><input type="number" class="form-control form-control-sm" value="${s.port}" data-id="${s.id}" data-field="port" data-old-port="${s.port != null ? s.port : ''}" /></td>
      <td><input class="form-control form-control-sm" value="${s.username}" data-id="${s.id}" data-field="username" data-old-username="${s.username || ''}" /></td>
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
    if (isConnected) tbodyConn.appendChild(tr); else tbodyHist.appendChild(tr);
  });
}


// ================= Kubernetes Cluster UI =================
async function loadClustersAndServers() {
  const [clusters, servers, connectedIds] = await Promise.all([
    fetchJSON('/admin/clusters').catch(() => []),
    fetchJSON('/admin/servers').catch(() => []),
    fetchJSON('/admin/servers/connected').catch(() => []),
  ]);
  // Điền cluster select
  const sel = document.getElementById('k8s-cluster-select');
  if (sel) {
    sel.innerHTML = '';
    (clusters || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name}`;
      sel.appendChild(opt);
    });
  }
  // Hiển thị bảng servers
  const tbody = document.getElementById('k8s-servers-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    (servers || []).forEach(s => {
      const cName = (clusters || []).find(c => Number(c.id) === Number(s.clusterId))?.name || '';
      const isConnected = (connectedIds || []).includes(s.id);
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
            ${(clusters || []).map(c => `<option value="${c.id}" ${s.clusterId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm" data-id="${s.id}" data-field="role">
            <option value="WORKER" ${s.role === 'WORKER' ? 'selected' : ''}>WORKER</option>
            <option value="MASTER" ${s.role === 'MASTER' ? 'selected' : ''}>MASTER</option>
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
  if (chkAll) {
    chkAll.checked = false;
    chkAll.addEventListener('change', () => {
      document.querySelectorAll('#k8s-servers-tbody .k8s-sel').forEach(el => { el.checked = chkAll.checked; });
    }, { once: true });
  }
}

async function loadClusterList() {
  try {
    const clusters = await fetchJSON('/admin/clusters').catch(() => []);
    const tbody = document.getElementById('clusters-tbody');
    if (!tbody) {
      console.error('clusters-tbody element not found');
      return;
    }
    const search = (document.getElementById('cluster-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('cluster-status-filter')?.value || '';
    tbody.innerHTML = '';

    if (!clusters || clusters.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="text-center text-muted">Chưa có cluster nào</td>';
      tbody.appendChild(tr);
      return;
    }

    (clusters || [])
      .filter(c => (!search || String(c.name || '').toLowerCase().includes(search))
        && (!statusFilter || String(c.status || '') === statusFilter))
      .forEach(c => {
        const status = c.status || 'ERROR';
        const badge = status === 'HEALTHY' ? 'success' : (status === 'WARNING' ? 'warning text-dark' : 'danger');
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
    if (searchEl && !searchEl.dataset.bound) { searchEl.dataset.bound = '1'; searchEl.addEventListener('input', loadClusterList); }
    if (filterEl && !filterEl.dataset.bound) { filterEl.dataset.bound = '1'; filterEl.addEventListener('change', loadClusterList); }
  } catch (err) {
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
  if (window.resetPlaybookUI) {
    window.resetPlaybookUI();
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

  // Xóa banner cảnh báo MASTER offline (nếu có)
  const clusterDetailSection = document.getElementById('k8s-detail');
  const cardBody = clusterDetailSection?.querySelector('.card-body');
  if (cardBody) {
    // Xóa tất cả các alert warning (có thể là banner MASTER offline)
    const alerts = cardBody.querySelectorAll('.alert.alert-warning');
    alerts.forEach(alert => {
      // Chỉ xóa alert có chứa "MASTER Node đang offline"
      const alertText = alert.textContent || '';
      if (alertText.includes('MASTER Node đang offline') || alertText.includes('MASTER node')) {
        alert.remove();
      }
    });
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

  // Reset K8s resources data
  resetK8sResourcesData();

  // Ẩn K8s resources sections
  const k8sResourcesSection = document.getElementById('k8s-resources-detail');
  const networkingResourcesSection = document.getElementById('networking-resources-detail');
  if (k8sResourcesSection) {
    k8sResourcesSection.classList.add('d-none');
  }
  if (networkingResourcesSection) {
    networkingResourcesSection.classList.add('d-none');
  }

  console.log('Cluster data has been reset - Chi tiết Cluster, Nodes, Chi tiết server, K8s resources đã được xóa');
}
async function showClusterDetail(clusterId) {
  // Set current cluster ID for Ansible functions
  currentClusterId = clusterId;

  // Also set in playbook-manager.js
  if (window.setCurrentClusterId) {
    window.setCurrentClusterId(clusterId);
  }

  // Reset dữ liệu K8s của cụm trước (tránh hiển thị nhầm)
  k8sRequestToken++; // vô hiệu hóa mọi request trước đó
  resetK8sResourcesData();

  // Chuyển đổi sections
  document.getElementById('k8s-list')?.classList.add('d-none');
  document.getElementById('k8s-create')?.classList.add('d-none');
  document.getElementById('k8s-assign')?.classList.add('d-none');
  document.getElementById('k8s-detail')?.classList.remove('d-none');

  // Hiển thị loading state
  const msgElement = document.getElementById('cd-msg');
  if (msgElement) {
    msgElement.innerHTML = '<span class="text-info">🔄 Đang tải chi tiết cluster...</span>';
    msgElement.className = 'alert alert-info mb-2';
  }

  // BƯỚC 1: Load Chi tiết Cluster trước
  const detail = await fetchJSON(`/admin/clusters/${clusterId}/detail`).catch(() => null);
  if (!detail) {
    if (msgElement) {
      msgElement.innerHTML = '<span class="text-danger">❌ Không tải được chi tiết cluster</span>';
      msgElement.className = 'alert alert-danger mb-2';
    }
    return;
  }

  // Xóa loading state khi có dữ liệu cluster
  if (msgElement) {
    msgElement.innerHTML = '';
    msgElement.className = 'small mb-2';
  }

  // Hiển thị thông tin cluster
  document.getElementById('cd-name').textContent = detail.name || '';
  document.getElementById('cd-master').textContent = detail.masterNode || '';
  document.getElementById('cd-workers').textContent = detail.workerCount ?? 0;
  document.getElementById('cd-status').textContent = detail.status || '';
  (function () {
    const verEl = document.getElementById('cd-version');
    const version = (detail.version || '').trim();
    if (!version) {
      // Khi chưa có version, hiển thị CTA cài đặt K8s
      verEl.innerHTML = `
        <span class="text-muted">Chưa cài đặt</span>
        <button type="button" class="btn btn-sm btn-outline-primary ms-2" data-bs-toggle="modal" data-bs-target="#playbookManagerModal">
          <i class="bi bi-gear"></i> Cài đặt K8s
        </button>
      `;
    } else {
      verEl.textContent = version;
    }
  })();

  // Kiểm tra MASTER online và hiển thị cảnh báo nếu cần
  const hasOnlineMaster = detail.nodes && detail.nodes.some(n => 
    (n.isConnected || n.status === 'ONLINE') && n.role === 'MASTER'
  );
  const masterNode = detail.nodes && detail.nodes.find(n => n.role === 'MASTER');
  
  // Hiển thị cảnh báo nếu MASTER offline
  if (!hasOnlineMaster && masterNode) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-warning alert-dismissible fade show mb-3';
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
      <div class="d-flex align-items-center">
        <i class="bi bi-exclamation-triangle-fill me-2 fs-5"></i>
        <div class="flex-grow-1">
          <strong>⚠️ MASTER Node đang offline</strong>
          <p class="mb-0 small">
            MASTER node (${masterNode.ip || 'N/A'}) đang offline. 
            Một số tính năng sẽ không hoạt động:
            <ul class="mb-0 small">
              <li>Không thể xem/tải Kubernetes resources (Pods, Services, Ingress)</li>
              <li>Không thể triển khai ứng dụng lên cluster này</li>
              <li>Không thể kiểm tra trạng thái Ansible</li>
              <li>Không thể xem Networking resources</li>
            </ul>
            <strong>Vui lòng kiểm tra kết nối máy chủ và đảm bảo MASTER node đang hoạt động.</strong>
          </p>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
    
    // Chèn cảnh báo vào đầu cluster detail section
    const clusterDetailSection = document.getElementById('k8s-detail');
    const firstChild = clusterDetailSection?.querySelector('.card-body');
    if (firstChild) {
      firstChild.insertBefore(alertDiv, firstChild.firstChild);
    }
  }
  
  // BƯỚC 2: Load K8s Resources sau khi có chi tiết cluster
  // Chỉ load nếu có MASTER online
  if (hasOnlineMaster) {
    showK8sResources();
    // BƯỚC 3: Load Networking resources (Services & Ingress)
    refreshNetworking(clusterId);
  } else {
    // Nếu không có MASTER online, vẫn hiển thị section nhưng không load data
    showK8sResources();
    // Hiển thị message thay vì load data
    showK8sResourcesOfflineMessage();
    showNetworkingOfflineMessage();
  }

  // Tự động kiểm tra trạng thái Ansible và load playbooks sau khi có dữ liệu cluster
  // Chỉ gọi API nếu cluster có nodes
  try {
    setTimeout(() => {
      try {
        // Kiểm tra nếu cluster có nodes trước khi gọi API
        if (detail.nodes && detail.nodes.length > 0) {
          // Chỉ gọi checkAnsibleStatus nếu có ít nhất 1 MASTER node online
          const hasOnlineMaster = detail.nodes.some(n => 
            (n.isConnected || n.status === 'ONLINE') && n.role === 'MASTER'
          );
          if (hasOnlineMaster) {
            checkAnsibleStatus(clusterId);
          }
          if (window.loadPlaybooks) { window.loadPlaybooks(clusterId); } else { loadPlaybooks(); }
        }
      } catch (err) {
        console.error('Error in auto-check Ansible status:', err);
      }
    }, 500); // Tăng delay để đảm bảo UI đã render xong và backend sẵn sàng
  } catch (err) {
    // Silent error handling
  }

  const tbody = document.getElementById('cd-nodes-tbody');
  tbody.innerHTML = '';

  // Nếu không có nodes, hiển thị thông báo và dừng
  if (!detail.nodes || detail.nodes.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7" class="text-center text-muted py-4">
        <i class="bi bi-server me-2"></i>
        Cluster này chưa có máy chủ nào. Vui lòng thêm máy chủ vào cluster để xem thông tin.
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  // Hiển thị servers ngay với thông tin cơ bản (không đợi metrics)
  // Tải trạng thái K8s từ backend để hiển thị Ready/NotReady cho node online
  let k8sNodeByIP = new Map();
  let k8sNodeByName = new Map();
  
  // Load K8s nodes status song song với việc render servers
  const k8sNodesPromise = fetchJSON(`/admin/clusters/${clusterId}/k8s/nodes`).catch(() => null);
  
  // Render servers ngay với dữ liệu hiện có
  let readyCount = 0, notReadyCount = 0, offlineCount = 0, unregisteredCount = 0;
  
  // Tạo một Map để lưu trữ row elements theo server ID để cập nhật sau
  const serverRows = new Map();
  
  detail.nodes.forEach(n => {
    // Xác định node có online không (dựa trên isConnected hoặc status từ DB)
    const isOnline = n.isConnected || (n.status === 'ONLINE');
    const isOffline = !isOnline || (n.status === 'OFFLINE');
    const hasMetrics = n.cpu && n.cpu !== '-';
    
    // Hiển thị status ban đầu dựa trên thông tin cơ bản
    // Sẽ cập nhật sau khi có K8s status (nếu master online)
    let statusLabel = 'OFFLINE';
    let statusBadge = 'secondary';
    if (isOnline) {
      // Node online → hiển thị ONLINE/CONNECTED tạm thời
      // Sẽ cập nhật thành Ready/NotReady nếu có K8s status
      statusLabel = n.isConnected ? 'CONNECTED' : 'ONLINE';
      statusBadge = 'info';
    }

    // Color coding cho RAM usage (chỉ áp dụng nếu có metrics)
    const ramPercentage = n.ramPercentage || 0;
    let ramColorClass = '';
    if (isOffline || !hasMetrics) {
      ramColorClass = 'text-muted'; // Màu xám cho offline hoặc chưa có metrics
    } else if (ramPercentage >= 90) {
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

    // Hiển thị metrics: offline nodes hiển thị "-" ngay, online nodes hiển thị loading nếu chưa có
    const cpuDisplay = isOffline ? '-' : (hasMetrics ? n.cpu : '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>');
    const ramDisplay = isOffline ? '-' : (hasMetrics ? n.ram : '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>');
    const diskDisplay = isOffline ? '-' : (hasMetrics ? n.disk : '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>');

    const tr = document.createElement('tr');
    tr.setAttribute('data-server-id', n.id);
    tr.innerHTML = `
      <td title="${n.username || ''}">${n.ip}</td>
      <td>${n.role}</td>
      <td><span class="badge bg-${statusBadge}" id="status-badge-${n.id}" title="${statusLabel === 'UNREGISTERED' ? 'Node chưa đăng ký trong cụm (không thấy trong kubectl)' : ''}">${statusLabel}</span></td>
      <td id="cpu-${n.id}">${cpuDisplay}</td>
      <td class="${ramColorClass}" id="ram-${n.id}">${ramDisplay}</td>
      <td id="disk-${n.id}">${diskDisplay}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-danger cd-remove-node" data-id="${n.id}" data-cluster="${clusterId}">
          <i class="bi bi-trash me-1"></i> Xóa
        </button>
        <button class="btn btn-sm btn-outline-secondary cd-retry-node" data-id="${n.id}" data-cluster="${clusterId}">
          <i class="bi bi-arrow-repeat me-1"></i> Thử lại
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    serverRows.set(n.id, tr);
  });

  // Sau khi render xong, cập nhật K8s status và metrics
  let hasK8sData = false;
  let k8sResp = null;
  try {
    k8sResp = await k8sNodesPromise;
    if (k8sResp && Array.isArray(k8sResp.nodes) && k8sResp.nodes.length > 0) {
      hasK8sData = true;
      k8sResp.nodes.forEach(nd => {
        // Backend trả về k8sInternalIP, không phải internalIP
        const ip = nd.k8sInternalIP || nd.internalIP;
        if (ip) {
          k8sNodeByIP.set(String(ip), nd);
        }
        if (nd.name) {
          k8sNodeByName.set(String(nd.name), nd);
        }
      });
      try { console.info(`[k8s] nodes loaded: ${k8sResp.nodes.length}, IPs:`, Array.from(k8sNodeByIP.keys())); } catch (_) { }
    }
  } catch (e) {
    // suppress debug logs
    hasK8sData = false;
    k8sResp = null;
  }

  // Cập nhật K8s status cho các servers
  // Quan trọng: Nếu master offline, vẫn hiển thị thông tin cơ bản (ONLINE/OFFLINE) cho worker nodes
  detail.nodes.forEach(n => {
    const tr = serverRows.get(n.id);
    if (!tr) return;
    
    // Xác định node có online không (dựa trên isConnected hoặc status từ DB)
    const isOnline = n.isConnected || (n.status === 'ONLINE');
    const statusBadgeEl = tr.querySelector(`#status-badge-${n.id}`);
    
    if (statusBadgeEl) {
      let statusLabel = 'OFFLINE';
      let statusBadge = 'secondary';
      
      if (isOnline) {
        // Node đang online (connected hoặc status = ONLINE)
        // Thử lấy K8s status nếu có (chỉ khi master online và có k8sResp)
        // Match theo IP (server IP với k8sInternalIP) hoặc theo name
        const nd = k8sNodeByIP.get(String(n.ip)) || 
                   k8sNodeByName.get(String(n.ip)) || 
                   k8sNodeByName.get(String(n.hostname || n.ip));
        const k8sStatus = nd?.k8sStatus;
        
        // Debug: log để kiểm tra matching (chỉ khi có K8s data nhưng không match được)
        if (isOnline && hasK8sData && k8sNodeByIP.size > 0 && !nd) {
          try {
            console.debug(`[k8s] Node ${n.ip} not found in K8s nodes. Available IPs:`, Array.from(k8sNodeByIP.keys()));
          } catch (_) {}
        }
        
        if (k8sStatus === 'Ready') { 
          // Có K8s status và Ready
          statusLabel = 'Ready'; 
          statusBadge = 'success'; 
        } else if (k8sStatus === 'NotReady') { 
          // Có K8s status nhưng NotReady
          statusLabel = 'NotReady'; 
          statusBadge = 'warning text-dark'; 
        } else if (k8sStatus !== undefined && k8sStatus !== null && k8sStatus !== 'Unknown') {
          // Có K8s status nhưng không phải Ready/NotReady/Unknown
          statusLabel = String(k8sStatus);
          statusBadge = 'dark';
        } else {
          // Không có K8s status (có thể master offline hoặc node chưa join cluster)
          // Nhưng node vẫn online → hiển thị ONLINE/CONNECTED
          statusLabel = n.isConnected ? 'CONNECTED' : 'ONLINE';
          statusBadge = 'info';
        }
      } else {
        // Node offline
        statusLabel = 'OFFLINE';
        statusBadge = 'secondary';
      }
      
      statusBadgeEl.textContent = statusLabel;
      statusBadgeEl.className = `badge bg-${statusBadge}`;
      
      // Tooltip để giải thích status
      let tooltip = '';
      if (statusLabel === 'UNREGISTERED') {
        tooltip = 'Node chưa đăng ký trong cụm (không thấy trong kubectl)';
      } else if (statusLabel === 'CONNECTED' || statusLabel === 'ONLINE') {
        tooltip = 'Node đang online nhưng không có thông tin K8s (có thể MASTER offline)';
      } else if (statusLabel === 'OFFLINE') {
        tooltip = 'Node đang offline';
      }
      statusBadgeEl.title = tooltip;
      
      // Tally summary
      if (statusLabel === 'Ready') readyCount++;
      else if (statusLabel === 'NotReady') notReadyCount++;
      else if (statusLabel === 'UNREGISTERED') unregisteredCount++;
      else if (statusLabel === 'CONNECTED' || statusLabel === 'ONLINE') {
        // Đếm là online nhưng không có K8s status
        // Không tăng offlineCount
      } else offlineCount++;
    }
    
    // Cập nhật metrics - chỉ cập nhật cho online nodes, offline nodes giữ nguyên "-"
    const isOffline = !isOnline || (n.status === 'OFFLINE');
    
    const cpuEl = tr.querySelector(`#cpu-${n.id}`);
    const ramEl = tr.querySelector(`#ram-${n.id}`);
    const diskEl = tr.querySelector(`#disk-${n.id}`);
    
    if (cpuEl) {
      if (isOffline) {
        // Offline nodes: hiển thị "-" và không load metrics
        cpuEl.textContent = '-';
      } else {
        const hasMetrics = n.cpu && n.cpu !== '-';
        if (hasMetrics) {
          cpuEl.textContent = n.cpu || '-';
        } else {
          // Online nhưng chưa có metrics → hiển thị loading
          cpuEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>';
        }
      }
    }
    
    if (ramEl) {
      if (isOffline) {
        // Offline nodes: hiển thị "-" và không load metrics
        ramEl.className = 'text-muted';
        ramEl.textContent = '-';
      } else {
        const hasMetrics = n.ram && n.ram !== '-';
        const ramPercentage = n.ramPercentage || 0;
        let ramColorClass = '';
        if (hasMetrics) {
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
        } else {
          ramColorClass = 'text-muted'; // Màu xám cho đang load
        }
        ramEl.className = ramColorClass;
        
        if (hasMetrics) {
          ramEl.textContent = n.ram || '-';
        } else {
          // Online nhưng chưa có metrics → hiển thị loading
          ramEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>';
        }
      }
    }
    
    if (diskEl) {
      if (isOffline) {
        // Offline nodes: hiển thị "-" và không load metrics
        diskEl.textContent = '-';
      } else {
        const hasMetrics = n.disk && n.disk !== '-';
        if (hasMetrics) {
          diskEl.textContent = n.disk || '-';
        } else {
          // Online nhưng chưa có metrics → hiển thị loading
          diskEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>';
        }
      }
    }
  });

  // Hiển thị các node có trong K8s nhưng không có trong DB (orphan nodes)
  if (hasK8sData && k8sResp && k8sResp.nodes && k8sNodeByIP.size > 0) {
    const dbNodeIPs = new Set(detail.nodes.map(n => String(n.ip)));
    const orphanNodes = [];
    
    // Tìm các node K8s không có trong DB
    k8sResp.nodes.forEach(nd => {
      const ip = nd.k8sInternalIP || nd.internalIP;
      if (ip && !dbNodeIPs.has(String(ip))) {
        // Kiểm tra xem có match theo name không
        const matchedByName = detail.nodes.some(n => 
          String(n.hostname || n.ip) === String(nd.name)
        );
        if (!matchedByName) {
          orphanNodes.push(nd);
        }
      }
    });
    
    // Hiển thị orphan nodes nếu có
    if (orphanNodes.length > 0) {
      const tbody = document.getElementById('cd-nodes-tbody');
      if (tbody) {
        orphanNodes.forEach(nd => {
          const ip = nd.k8sInternalIP || nd.internalIP || 'N/A';
          const name = nd.name || 'Unknown';
          const k8sStatus = nd.k8sStatus || 'Unknown';
          const statusBadge = k8sStatus === 'Ready' ? 'success' : 
                             k8sStatus === 'NotReady' ? 'warning text-dark' : 'dark';
          const roles = (nd.k8sRoles || []).join(', ') || 'Unknown';
          
          const tr = document.createElement('tr');
          tr.className = 'table-warning'; // Highlight orphan nodes
          tr.innerHTML = `
            <td title="Node không có trong database">${ip}</td>
            <td><span class="badge bg-info">${roles}</span></td>
            <td>
              <span class="badge bg-${statusBadge}" title="Node có trong K8s nhưng không có trong DB">
                ${k8sStatus === 'Ready' ? 'Ready' : k8sStatus === 'NotReady' ? 'NotReady' : k8sStatus}
              </span>
              <span class="badge bg-danger ms-1" title="Node không có trong database">ORPHAN</span>
            </td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td class="text-nowrap">
              <span class="text-muted small" title="Node: ${name}">${name}</span>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
      
      // Log orphan nodes
      try {
        console.warn(`[cluster] Found ${orphanNodes.length} orphan K8s nodes (not in DB):`, 
          orphanNodes.map(n => n.name || (n.k8sInternalIP || n.internalIP)));
      } catch (_) {}
    }
  }

  // Log tóm tắt quan trọng, không lộ dữ liệu máy chủ
  try {
    console.info(`[cluster] nodes total: ${detail.nodes.length}; Ready: ${readyCount}, NotReady: ${notReadyCount}, Unregistered: ${unregisteredCount}, Offline: ${offlineCount}`);
  } catch (_) { }

  // Đảm bảo back button không bị disabled (sẽ được xử lý bởi global event listener)
  const backBtn = document.getElementById('cd-back');
  if (backBtn) {
    backBtn.disabled = false;
  }

  // Reload button
  const reloadBtn = document.getElementById('cd-reload');
  if (reloadBtn && !reloadBtn.dataset.bound) {
    reloadBtn.dataset.bound = '1';
    reloadBtn.addEventListener('click', async () => {
      if (!currentClusterId) return;

      // Disable button và hiển thị loading
      reloadBtn.disabled = true;
      const originalText = reloadBtn.innerHTML;
      reloadBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang reload...';

      // Pre-reset: header fields, nodes table, K8s resources loading
      try {
        const headerIds = ['cd-name', 'cd-master', 'cd-workers', 'cd-status', 'cd-version'];
        headerIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
        const msgElement = document.getElementById('cd-msg');
        if (msgElement) {
          msgElement.innerHTML = '<span class="text-info">🔄 Đang tải chi tiết cluster...</span>';
          msgElement.className = 'alert alert-info mb-2';
        }
        const tbody = document.getElementById('cd-nodes-tbody');
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="8" class="text-center py-3">
                <div class="d-inline-flex align-items-center text-muted">
                  <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  <span>Đang tải dữ liệu nodes...</span>
                </div>
              </td>
            </tr>
          `;
        }
        if (typeof showK8sResourcesLoading === 'function') {
          showK8sResourcesLoading();
        }
      } catch (_) { }

      try {
        // Reload cluster detail
        await showClusterDetail(currentClusterId);
        console.log('[cluster] Reloaded cluster detail successfully');
      } catch (error) {
        console.error('[cluster] Error reloading cluster detail:', error);
        // Hiển thị thông báo lỗi
        const msgElement = document.getElementById('cd-msg');
        if (msgElement) {
          msgElement.innerHTML = '<span class="text-danger">❌ Lỗi reload: ' + error.message + '</span>';
          msgElement.className = 'alert alert-danger mb-2';
        }
      } finally {
        // Restore button
        reloadBtn.disabled = false;
        reloadBtn.innerHTML = originalText;
      }
    });
  }

  // Refresh K8s resources button
  const refreshK8sResourcesBtn = document.getElementById('refresh-k8s-resources');
  if (refreshK8sResourcesBtn && !refreshK8sResourcesBtn.dataset.bound) {
    refreshK8sResourcesBtn.dataset.bound = '1';
    refreshK8sResourcesBtn.addEventListener('click', async () => {
      // Show inline refreshing state
      const originalHtml = refreshK8sResourcesBtn.innerHTML;
      refreshK8sResourcesBtn.disabled = true;
      refreshK8sResourcesBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Đang làm mới...';
      try {
        await loadK8sResources();
      } finally {
        refreshK8sResourcesBtn.disabled = false;
        refreshK8sResourcesBtn.innerHTML = originalHtml;
      }
    });
  }

  // Refresh Networking resources button
  const refreshNetworkingBtn = document.getElementById('refresh-networking-resources');
  if (refreshNetworkingBtn && !refreshNetworkingBtn.dataset.bound) {
    refreshNetworkingBtn.dataset.bound = '1';
    refreshNetworkingBtn.addEventListener('click', async () => {
      // Show inline refreshing state
      const originalHtml = refreshNetworkingBtn.innerHTML;
      refreshNetworkingBtn.disabled = true;
      refreshNetworkingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Đang làm mới...';
      try {
        if (currentClusterId) {
          await loadNetworkingResources(currentClusterId);
        }
      } finally {
        refreshNetworkingBtn.disabled = false;
        refreshNetworkingBtn.innerHTML = originalHtml;
      }
    });
  }

  // Thêm event listeners cho các nút retry
  document.querySelectorAll('.cd-retry-node').forEach(btn => {
    if (!btn.dataset.bound) {
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
    if (!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (e) => {
        const nodeId = e.target.dataset.id;
        const clusterId = e.target.dataset.cluster;

        if (!confirm('Bỏ node này khỏi cluster?')) return;

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

          // Gọi regenerate inventory/hosts trên MASTER của cụm
          try {
            await fetch(`/admin/clusters/${clusterId}/ansible/init/config`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
          } catch (_) { }

          // Hiển thị thông báo thành công
          const msgElement = document.getElementById('cd-msg');
          if (msgElement) {
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
          if (msgElement) {
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
  if (addNodeBtn && !addNodeBtn.dataset.clusterBound) {
    addNodeBtn.dataset.clusterBound = '1';
    addNodeBtn.addEventListener('click', () => {
      // Lưu cluster ID và tên vào modal (đọc từ state/UI hiện tại để tránh capture sai cụm)
      const currentId = window.currentClusterId || currentClusterId;
      const currentName = (document.getElementById('cd-name')?.textContent || '').trim();
      const idInput = document.getElementById('add-node-cluster-id');
      const nameSpan = document.getElementById('add-node-cluster-name');
      if (idInput) idInput.value = currentId ?? '';
      if (nameSpan) nameSpan.textContent = currentName;

      // Reset form thêm node mới
      const form = document.getElementById('add-node-form');
      if (form) {
        form.reset();
        document.getElementById('add-node-port').value = '22';
        document.getElementById('add-node-role').value = 'WORKER';
      }

      // Reset tab và load danh sách nodes có sẵn
      resetAddNodeModal();
      loadExistingNodes();

      // Clear message
      const msgEl = document.getElementById('add-node-msg');
      if (msgEl) {
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

  if (selectExistingTab && addNewTab && selectExistingPane && addNewPane) {
    selectExistingTab.classList.add('active');
    selectExistingTab.setAttribute('aria-selected', 'true');
    addNewTab.classList.remove('active');
    addNewTab.setAttribute('aria-selected', 'false');

    selectExistingPane.classList.add('show', 'active');
    addNewPane.classList.remove('show', 'active');
  }

  // Reset checkboxes
  const selectAllCheckbox = document.getElementById('select-all-existing');
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
  }

  // Reset role dropdown
  const selectedNodesRole = document.getElementById('selected-nodes-role');
  if (selectedNodesRole) {
    selectedNodesRole.value = 'WORKER';
  }

  // Hide/show buttons
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');
  const addNewBtn = document.getElementById('add-node-submit-btn');
  if (addExistingBtn && addNewBtn) {
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

  if (!loadingEl || !containerEl || !noNodesEl || !tbodyEl) return;

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

    if (availableNodes.length === 0) {
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

  } catch (error) {
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
  if (selectAllCheckbox && !selectAllCheckbox.dataset.bound) {
    selectAllCheckbox.dataset.bound = '1';
    selectAllCheckbox.addEventListener('change', () => {
      const checkboxes = document.querySelectorAll('.existing-node-checkbox');
      checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
      updateAddExistingButton();
    });
  }

  // Individual checkboxes
  document.querySelectorAll('.existing-node-checkbox').forEach(checkbox => {
    if (!checkbox.dataset.bound) {
      checkbox.dataset.bound = '1';
      checkbox.addEventListener('change', () => {
        updateSelectAllState();
        updateAddExistingButton();
      });
    }
  });

  // Add single node buttons
  document.querySelectorAll('.add-single-node').forEach(btn => {
    if (!btn.dataset.bound) {
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

  if (selectAllCheckbox && checkboxes.length > 0) {
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = checkedCount === checkboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }
}

// Update add existing button visibility
function updateAddExistingButton() {
  const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');

  if (addExistingBtn) {
    if (checkboxes.length > 0) {
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

  if (!msgEl || !addExistingBtn) return;

  msgEl.textContent = '';
  msgEl.className = 'small';

  try {
    addExistingBtn.disabled = true;
    addExistingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang thêm...';

    // Cập nhật từng node
    for (const nodeId of nodeIds) {
      const body = { clusterId: parseInt(document.getElementById('add-node-cluster-id').value, 10), role: role };
      await fetchJSON(`/admin/servers/${nodeId}`, { method: 'PUT', body: JSON.stringify(body) });
    }

    msgEl.textContent = `✓ Đã thêm ${nodeIds.length} node vào cluster`;
    msgEl.className = 'small text-success';

    // Reload danh sách và đóng modal sau 1 giây
    setTimeout(async () => {
      const modal = bootstrap.Modal.getInstance(document.getElementById('addNodeModal'));
      if (modal) modal.hide();

      // Reload cluster detail
      const currentClusterId = parseInt(document.getElementById('add-node-cluster-id').value, 10);
      if (!isNaN(currentClusterId)) {
        await showClusterDetail(currentClusterId);
      }
    }, 1000);

  } catch (error) {
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
  if (f && f.id === 'create-cluster-form') {
    e.preventDefault();
    const body = { name: f.name.value.trim(), description: f.description.value.trim() || null };
    const msg = document.getElementById('cluster-msg');
    const btn = f.querySelector('button[type="submit"]');

    if (!msg) {
      console.error('cluster-msg element not found');
      return;
    }

    try {
      btn.disabled = true; btn.textContent = 'Đang tạo...';
      await fetchJSON('/admin/clusters', { method: 'POST', body: JSON.stringify(body) });
      msg.textContent = 'Đã tạo cluster thành công';
      msg.className = 'mt-2 small text-success';
      f.reset();
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    } catch (err) {
      console.error('Cluster creation error:', err);
      msg.textContent = err.message || 'Tạo cluster thất bại';
      msg.className = 'mt-2 small text-danger';
    } finally {
      btn.disabled = false; btn.textContent = 'Tạo';
    }
  }

  // Xử lý form thêm node vào cluster
  if (f && f.id === 'add-node-form') {
    e.preventDefault();
    const msgEl = document.getElementById('add-node-msg');
    const btn = document.getElementById('add-node-submit-btn');

    if (!msgEl || !btn) {
      console.error('add-node-msg or add-node-submit-btn element not found');
      return;
    }

    msgEl.textContent = '';
    msgEl.className = 'small';

    const clusterId = parseInt(document.getElementById('add-node-cluster-id').value, 10);
    if (isNaN(clusterId)) {
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
      const result = await fetchJSON('/admin/servers', { method: 'POST', body: JSON.stringify(body) });

      msgEl.textContent = '✓ Đã thêm node thành công';
      msgEl.className = 'small text-success';

      // Reset form
      f.reset();
      f.port.value = 22;
      f.role.value = 'WORKER';

      // Đóng modal sau 1 giây
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('addNodeModal'));
        if (modal) modal.hide();

        // Reload cluster detail để hiển thị node mới
        const currentClusterId = parseInt(document.getElementById('add-node-cluster-id').value, 10);
        if (!isNaN(currentClusterId)) {
          showClusterDetail(currentClusterId);
        }
      }, 1000);

    } catch (err) {
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
  if (t && t.id === 'refresh-existing-nodes') {
    e.preventDefault();
    await loadExistingNodes();
  }

  // Handle add existing nodes button
  if (t && t.id === 'add-existing-nodes-btn') {
    e.preventDefault();
    const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
    const nodeIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
    const role = document.getElementById('selected-nodes-role').value;

    if (nodeIds.length === 0) {
      const msgEl = document.getElementById('add-node-msg');
      if (msgEl) {
        msgEl.textContent = 'Vui lòng chọn ít nhất một node';
        msgEl.className = 'small text-warning';
      }
      return;
    }

    await addExistingNodesToCluster(nodeIds, role);
  }

  if (t && t.id === 'btn-assign-selected') {
    e.preventDefault();
    const clusterSel = document.getElementById('k8s-cluster-select');
    const clusterId = clusterSel && clusterSel.value ? parseInt(clusterSel.value, 10) : null;
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
    const msg = document.getElementById('k8s-assign-msg');
    if (!ids.length) { if (msg) { msg.textContent = 'Vui lòng chọn máy chủ'; msg.className = 'mt-2 small text-danger'; } return; }
    if (!clusterId) { if (msg) { msg.textContent = 'Vui lòng chọn cluster'; msg.className = 'mt-2 small text-danger'; } return; }
    const btn = t; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang gán...';
    try {
      // Gán server vào cluster nhưng giữ nguyên role hiện tại
      await bulkAssignServersToCluster(ids, clusterId);
      if (msg) { msg.textContent = `Đã gán ${ids.length} máy vào cluster`; msg.className = 'mt-2 small text-success'; }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Gán thất bại'; msg.className = 'mt-2 small text-danger'; }
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  if (t && t.id === 'btn-update-role-selected') {
    e.preventDefault();
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
    const msg = document.getElementById('k8s-assign-msg');
    if (!ids.length) {
      if (msg) {
        msg.textContent = 'Vui lòng chọn máy chủ';
        msg.className = 'mt-2 small text-danger';
      }
      return;
    }

    const roleSelect = document.getElementById('k8s-role-select');
    const selectedRole = roleSelect ? roleSelect.value : 'WORKER';

    if (!confirm(`Cập nhật role thành ${selectedRole} cho ${ids.length} máy chủ (không thay đổi cluster)?`)) return;

    const btn = t;
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang cập nhật...';

    try {
      // Cập nhật role cho nhiều server mà không thay đổi cluster
      await bulkUpdateServerRoles(ids, selectedRole);
      if (msg) {
        msg.textContent = `Đã cập nhật role thành ${selectedRole} cho ${ids.length} máy chủ (giữ nguyên cluster)`;
        msg.className = 'mt-2 small text-success';
      }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    } catch (err) {
      console.error('Lỗi khi cập nhật role máy chủ:', err);
      if (msg) {
        msg.textContent = err.message || 'Cập nhật role thất bại';
        msg.className = 'mt-2 small text-danger';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
  if (t && t.id === 'btn-remove-selected') {
    e.preventDefault();
    const ids = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
    const msg = document.getElementById('k8s-assign-msg');
    if (!ids.length) {
      if (msg) {
        msg.textContent = 'Vui lòng chọn máy chủ';
        msg.className = 'mt-2 small text-danger';
      }
      return;
    }

    if (!confirm(`Bỏ ${ids.length} máy chủ khỏi cluster?`)) return;

    const btn = t;
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang bỏ...';

    try {
      // Sử dụng sentinel -1 để chỉ định xóa trên backend
      await bulkAssignServers(ids, -1);
      if (msg) {
        msg.textContent = `Đã bỏ ${ids.length} máy khỏi cluster`;
        msg.className = 'mt-2 small text-success';
      }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    } catch (err) {
      console.error('Lỗi khi bỏ nhiều máy chủ khỏi cluster:', err);
      if (msg) {
        msg.textContent = err.message || 'Bỏ khỏi cluster thất bại';
        msg.className = 'mt-2 small text-danger';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }
  if (t && t.classList.contains('cluster-delete-btn')) {
    e.preventDefault();
    const id = parseInt(t.getAttribute('data-id'), 10);
    if (isNaN(id)) return;
    if (!confirm('Xoá cluster này? Các server sẽ được gỡ khỏi cluster.')) return;
    const msg = document.getElementById('clusters-msg');
    const btn = t; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang xoá...';
    try {
      await fetch(`/admin/clusters/${id}`, { method: 'DELETE' });
      if (msg) { msg.textContent = 'Đã xoá cluster'; msg.className = 'small text-success'; }
      // Reload both cluster list and server assignment table
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Xoá cluster thất bại'; msg.className = 'small text-danger'; }
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  if (t && t.classList.contains('cluster-view-btn')) {
    e.preventDefault();
    const id = parseInt(t.getAttribute('data-id'), 10);
    if (isNaN(id)) return;
    await showClusterDetail(id);
  }

  // Handle back button (cd-back) - dùng event delegation để luôn hoạt động
  // Kiểm tra nếu click vào button hoặc vào icon/text bên trong button
  let backButton = null;
  if (t && t.id === 'cd-back') {
    backButton = t;
  } else if (t && t.closest && t.closest('button#cd-back')) {
    backButton = t.closest('button#cd-back');
  }
  
  if (backButton) {
    e.preventDefault();
    e.stopPropagation();
    
    if (backButton.disabled) {
      console.log('Back button already disabled, ignoring click');
      return;
    }
    
    // Disable button để tránh double click
    backButton.disabled = true;
    const originalText = backButton.innerHTML;
    backButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang quay lại...';
    
    try {
      // Reset Chi tiết Cluster, Nodes, Chi tiết server trước khi quay lại danh sách
      resetClusterData();

      // Ẩn cluster detail section
      document.getElementById('k8s-detail')?.classList.add('d-none');
      document.getElementById('k8s-list')?.classList.remove('d-none');
      document.getElementById('k8s-create')?.classList.remove('d-none');
      document.getElementById('k8s-assign')?.classList.remove('d-none');

      // Reload cả cluster list và server assignment table để cập nhật dữ liệu
      await Promise.all([loadClusterList(), loadClustersAndServers()]);
    } catch (error) {
      console.error('Error going back to cluster list:', error);
      // Vẫn hiển thị lại danh sách ngay cả khi có lỗi reload
    } finally {
      // Re-enable button sau khi hoàn thành
      backButton.disabled = false;
      backButton.innerHTML = originalText;
    }
  }
});

async function bulkAssignServers(ids, clusterId) {
  // Lấy dữ liệu server hiện tại để giữ nguyên role khi bỏ khỏi cluster
  const servers = await fetchJSON('/admin/servers').catch(() => []);

  // Cập nhật tuần tự qua API PUT /admin/servers/{id}
  for (const id of ids) {
    const body = { clusterId: clusterId };
    // Nếu bỏ khỏi cluster (clusterId = -1), giữ nguyên role hiện tại thay vì set về STANDALONE
    if (clusterId === -1) {
      const server = servers.find(s => s.id === id);
      const currentRole = server ? server.role : 'WORKER'; // Dự phòng WORKER nếu không tìm thấy
      body.role = currentRole;
    }
    await fetchJSON(`/admin/servers/${id}`, { method: 'PUT', body: JSON.stringify(body) }).catch(() => { });
  }
}

async function bulkAssignServersWithRole(ids, clusterId, role) {
  // Cập nhật tuần tự qua API PUT /admin/servers/{id}
  for (const id of ids) {
    const body = { clusterId: clusterId, role: role };
    await fetchJSON(`/admin/servers/${id}`, { method: 'PUT', body: JSON.stringify(body) }).catch(() => { });
  }
}

async function bulkAssignServersToCluster(ids, clusterId) {
  // Lấy dữ liệu server hiện tại để giữ nguyên role
  const servers = await fetchJSON('/admin/servers').catch(() => []);

  // Gán server vào cluster nhưng giữ nguyên role hiện tại
  for (const id of ids) {
    const server = servers.find(s => s.id === id);
    const currentRole = server ? server.role : 'WORKER'; // Dự phòng WORKER nếu không tìm thấy
    const body = { clusterId: clusterId, role: currentRole };
    await fetchJSON(`/admin/servers/${id}`, { method: 'PUT', body: JSON.stringify(body) }).catch(() => { });
  }
}

async function bulkUpdateServerRoles(ids, newRole) {
  // Lấy dữ liệu server hiện tại để giữ nguyên cluster
  const servers = await fetchJSON('/admin/servers').catch(() => []);

  // Cập nhật role cho nhiều server mà không thay đổi cluster
  for (const id of ids) {
    const server = servers.find(s => s.id === id);
    const currentClusterId = server && server.clusterId ? server.clusterId : null;
    const body = { role: newRole };
    if (currentClusterId) {
      body.clusterId = currentClusterId; // Giữ nguyên cluster hiện tại
    }
    await fetchJSON(`/admin/servers/${id}`, { method: 'PUT', body: JSON.stringify(body) }).catch(() => { });
  }
}

async function saveServerRole(serverId) {
  // Tìm server row trước, sau đó tìm role select trong row đó
  const serverRow = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
  const roleSelect = serverRow ? serverRow.querySelector('select[data-field="role"]') : null;
  if (!roleSelect) {
    console.error('Không tìm thấy role select cho server', serverId);
    return;
  }

  const newRole = roleSelect.value;
  const btn = document.querySelector(`button[onclick="saveServerRole(${serverId})"]`);
  const msg = document.getElementById('k8s-assign-msg');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang lưu...';
  }

  try {
    const body = { role: newRole };
    await fetchJSON(`/admin/servers/${serverId}`, { method: 'PUT', body: JSON.stringify(body) });

    if (msg) {
      msg.textContent = `Đã cập nhật role thành ${newRole} cho server ${serverId}`;
      msg.className = 'mt-2 small text-success';
    }

    // Tải lại cả danh sách cluster và bảng gán server
    await Promise.all([loadClusterList(), loadClustersAndServers()]);
  } catch (err) {
    if (msg) {
      msg.textContent = err.message || 'Cập nhật role thất bại';
      msg.className = 'mt-2 small text-danger';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Lưu';
    }
  }
}

async function saveServerClusterAndRole(serverId) {
  // Tìm server row trước, sau đó tìm cluster và role select trong row đó
  const serverRow = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
  const clusterSelect = serverRow ? serverRow.querySelector('select[data-field="cluster"]') : null;
  const roleSelect = serverRow ? serverRow.querySelector('select[data-field="role"]') : null;

  if (!clusterSelect || !roleSelect) {
    console.error('Không tìm thấy cluster hoặc role select cho server', serverId);
    return;
  }

  const newClusterId = clusterSelect.value ? parseInt(clusterSelect.value, 10) : null;
  const newRole = roleSelect.value;
  const btn = document.querySelector(`button[onclick="saveServerClusterAndRole(${serverId})"]`);
  const msg = document.getElementById('k8s-assign-msg');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang lưu...';
  }

  try {
    const body = { role: newRole };
    if (newClusterId) {
      body.clusterId = newClusterId;
    } else {
      body.clusterId = null; // Bỏ khỏi cluster
    }

    await fetchJSON(`/admin/servers/${serverId}`, { method: 'PUT', body: JSON.stringify(body) });

    if (msg) {
      const clusterName = newClusterId ? clusterSelect.options[clusterSelect.selectedIndex].text : 'không có cluster';
      msg.textContent = `Đã cập nhật server ${serverId}: cluster "${clusterName}", role ${newRole}`;
      msg.className = 'mt-2 small text-success';
    }

    // Tải lại cả danh sách cluster và bảng gán server
    await Promise.all([loadClusterList(), loadClustersAndServers()]);
  } catch (err) {
    console.error('Lỗi khi lưu cluster và role máy chủ:', err);
    if (msg) {
      msg.textContent = err.message || 'Cập nhật cluster và role thất bại';
      msg.className = 'mt-2 small text-danger';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg"></i> Lưu';
    }
  }
}

async function removeSingleServerFromCluster(serverId) {
  if (!confirm('Bỏ server này khỏi cluster?')) return;

  const btn = document.querySelector(`button[onclick="removeSingleServerFromCluster(${serverId})"]`);
  const msg = document.getElementById('k8s-assign-msg');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Đang bỏ...';
  }

  try {
    // Lấy dữ liệu server hiện tại để giữ nguyên role
    const servers = await fetchJSON('/admin/servers').catch(() => []);
    const server = servers.find(s => s.id === serverId);
    const currentRole = server ? server.role : 'WORKER'; // Dự phòng WORKER nếu không tìm thấy

    const body = { clusterId: null, role: currentRole };
    await fetchJSON(`/admin/servers/${serverId}`, { method: 'PUT', body: JSON.stringify(body) });

    // Regenerate Ansible inventory/hosts trên MASTER của cụm hiện tại
    try {
      const clusterId = document.getElementById('add-node-cluster-id')?.value || window.currentClusterId || null;
      if (clusterId) {
        await fetch(`/admin/clusters/${clusterId}/ansible/init/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
      }
    } catch (_) { }

    if (msg) {
      msg.textContent = `Đã bỏ server ${serverId} khỏi cluster`;
      msg.className = 'mt-2 small text-success';
    }

    // Tải lại cả danh sách cluster và bảng gán server
    await Promise.all([loadClusterList(), loadClustersAndServers()]);
  } catch (err) {
    console.error('Lỗi khi bỏ máy chủ đơn lẻ khỏi cluster:', err);
    if (msg) {
      msg.textContent = err.message || 'Bỏ khỏi cluster thất bại';
      msg.className = 'mt-2 small text-danger';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-x-circle"></i> Bỏ khỏi Cluster';
    }
  }
}

async function promptReconnect(id) {
  // Thử key-first bằng check-status nhanh cho riêng server này nếu cần (đơn giản: gọi check-status toàn bộ)
  try {
    await fetchJSON('/admin/servers/check-status', { method: 'POST' });
    const connected = await fetchJSON('/admin/servers/connected').catch(() => []);
    if (Array.isArray(connected) && connected.includes(id)) {
      await loadServers('connected');
      return;
    }
  } catch (_) { /* ignore */ }
  const pw = prompt('SSH key không khả dụng hoặc kết nối bằng key thất bại. Nhập mật khẩu để kết nối lại:');
  if (!pw) return;
  try {
    await fetchJSON(`/admin/servers/${id}/reconnect`, { method: 'POST', body: JSON.stringify({ password: pw }) });
    await loadServers('connected');
  } catch (err) {
    alert(err.message || 'Kết nối lại thất bại');
  }
}

async function testKey(id) {
  const msg = document.getElementById('server-save-msg');
  try {
    const res = await fetchJSON(`/admin/servers/${id}/test-key`, { method: 'POST' });
    if (res && res.ok) {
      msg.textContent = res.message || `SSH key cho máy ${id} hoạt động`;
      msg.className = 'small mb-2 text-success';
      await loadServers();
    } else {
      msg.textContent = res.message || `SSH key cho máy ${id} không hoạt động`;
      msg.className = 'small mb-2 text-danger';
    }
  } catch (e) {
    msg.textContent = e.message || `SSH key cho máy ${id} không hoạt động`;
    msg.className = 'small mb-2 text-danger';
  }
}

async function enablePublicKey(id) {
  const msg = document.getElementById('server-save-msg');
  const sudoPassword = prompt('Nhập mật khẩu sudo để bật PublicKey trên máy đích:');
  if (!sudoPassword) return;
  try {
    const res = await fetchJSON(`/admin/servers/${id}/enable-publickey`, { method: 'POST', body: JSON.stringify({ sudoPassword }) });
    if (res && res.ok) {
      msg.textContent = 'Đã bật PublicKey trên máy đích. Thử Test Key lại.';
      msg.className = 'small mb-2 text-success';
    } else {
      msg.textContent = res.message || 'Bật PublicKey thất bại';
      msg.className = 'small mb-2 text-danger';
    }
  } catch (e) {
    msg.textContent = e.message || 'Bật PublicKey thất bại';
    msg.className = 'small mb-2 text-danger';
  }
}

async function showKey(id) {
  try {
    const res = await fetchJSON(`/admin/servers/${id}/ssh-key`);
    if (res && res.ok && res.publicKey) {
      const msg = document.getElementById('server-save-msg');
      msg.textContent = res.publicKey;
      msg.className = 'small mb-2 text-monospace';
    } else {
      const msg = document.getElementById('server-save-msg');
      msg.textContent = res.message || 'Chưa có public key';
      msg.className = 'small mb-2 text-danger';
    }
  } catch (e) {
    const msg = document.getElementById('server-save-msg');
    msg.textContent = e.message || 'Không lấy được public key';
    msg.className = 'small mb-2 text-danger';
  }
}

async function createServer(ev) {
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
    await fetchJSON('/admin/servers', { method: 'POST', body: JSON.stringify(body) });
    msgEl.textContent = 'Thêm máy chủ thành công';
    msgEl.className = 'mt-2 small text-success';
    f.reset(); f.port.value = 22;
    loadServers();
  } catch (err) {
    msgEl.textContent = err.message || 'Thêm server thất bại';
    msgEl.className = 'mt-2 small text-danger';
  } finally {
    btn.disabled = false; btn.textContent = 'Thêm máy chủ';
  }
}
async function saveServer(id, btn) {
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
  const body = { host, port, username };
  if (statusSel) { body.status = statusSel.value; }
  const msg = document.getElementById('server-save-msg');
  try {
    btn && (btn.disabled = true);
    await fetchJSON(`/admin/servers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    const changes = [];
    if (oldHost !== host) changes.push(`host: "${oldHost}" -> "${host}"`);
    if ((oldPort ?? null) !== (isNaN(port) ? null : port)) changes.push(`port: "${oldPort ?? ''}" -> "${isNaN(port) ? '' : port}"`);
    if (oldUsername !== username) changes.push(`username: "${oldUsername}" -> "${username}"`);
    msg.textContent = changes.length ? `Đã lưu máy ${id}: ${changes.join(', ')}` : `Lưu máy ${id} thành công`;
    msg.className = 'small mb-2 text-success';
    msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
    await loadServers();
  } catch (e) {
    msg.textContent = e.message || `Lưu máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
    msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } finally { if (btn) btn.disabled = false; }
}

async function deleteServer(id) {
  if (!confirm('Xoá server này?')) return;
  const msg = document.getElementById('server-save-msg');
  try {
    await fetch(`/admin/servers/${id}`, { method: 'DELETE' });
    msg.textContent = `Đã xoá máy ${id}`;
    msg.className = 'small mb-2 text-success';
    await loadServers();
  } catch (e) {
    msg.textContent = `Xoá máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
  }
}

async function disconnectServer(id) {
  const msg = document.getElementById('server-save-msg');
  try {
    await fetchJSON(`/admin/servers/${id}/disconnect`, { method: 'POST' });
    msg.textContent = `Đã ngắt kết nối máy ${id}`;
    msg.className = 'small mb-2 text-success';
    await loadServers();
  } catch (e) {
    msg.textContent = e.message || `Ngắt kết nối máy ${id} thất bại`;
    msg.className = 'small mb-2 text-danger';
  }
}

async function createUser(ev) {
  ev.preventDefault();
  const form = ev.target;
  const body = {
    username: form.username.value.trim(),
    password: form.password.value,
    role: form.role.value,
    dataLimitMb: parseInt(form.dataLimitMb.value, 10),
    pathOnServer: form.pathOnServer.value.trim() || null
  };

  try {
    await fetchJSON('/admin/users', { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    loadUsers();
    showCreateUserAlert('Thêm người dùng thành công!', 'success');
  } catch (error) {
    showCreateUserAlert(error.message, 'danger');
  }
}

function showCreateUserAlert(message, type) {
  const alertDiv = document.getElementById('create-user-alert');
  const messageSpan = document.getElementById('create-user-message');

  // Remove existing alert classes
  alertDiv.classList.remove('alert-success', 'alert-danger', 'alert-warning', 'alert-info');

  // Add new alert class
  alertDiv.classList.add(`alert-${type}`);

  // Set message
  messageSpan.textContent = message;

  // Show alert
  alertDiv.style.display = 'block';
  alertDiv.classList.add('show');

  // Auto hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      hideCreateUserAlert();
    }, 5000);
  }
}

function hideCreateUserAlert() {
  const alertDiv = document.getElementById('create-user-alert');
  alertDiv.classList.remove('show');
  setTimeout(() => {
    alertDiv.style.display = 'none';
  }, 150);
}

async function saveUser(id) {
  const selRole = document.querySelector(`select[data-id="${id}"][data-field="role"]`);
  const inpQuota = document.querySelector(`input[data-id="${id}"][data-field="dataLimitMb"]`);
  const inpPath = document.querySelector(`input[data-id="${id}"][data-field="pathOnServer"]`);
  const body = { role: selRole.value, dataLimitMb: parseInt(inpQuota.value, 10), pathOnServer: inpPath.value.trim() };
  await fetchJSON(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  loadUsers();
}

async function promptReset(id) {
  const pw = prompt('Nhập mật khẩu mới:');
  if (!pw) return;
  await fetchJSON(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
  alert('Đã đặt lại mật khẩu');
}

async function deleteUser(id) {
  if (!confirm('Xóa người dùng này?\n\nCảnh báo: Sẽ xóa luôn namespace của user và toàn bộ tài nguyên còn lại trong namespace đó trên các cluster liên quan.')) return;
  await fetch(`/admin/users/${id}`, { method: 'DELETE' });
  loadUsers();
}


async function viewActivities(id, username) {
  const data = await fetchJSON(`/admin/users/${id}/activities`);
  const list = document.getElementById('activity-list');
  const title = document.getElementById('activity-title');
  title.textContent = `Lịch sử - ${username}`;
  list.innerHTML = '';
  data.forEach(a => {
    const li = document.createElement('li');
    li.className = 'list-group-item';
    li.textContent = `${a.createdAt || ''} - ${a.action}: ${a.details || ''} ${a.ip ? ('(' + a.ip + ')') : ''}`;
    list.appendChild(li);
  });
  const modal = new bootstrap.Modal(document.getElementById('activityModal'));
  modal.show();
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('create-user-form');
  form.addEventListener('submit', createUser);
  loadUsers();

  // Alert close button event listener
  const alertCloseBtn = document.querySelector('#create-user-alert .btn-close');
  if (alertCloseBtn) {
    alertCloseBtn.addEventListener('click', hideCreateUserAlert);
  }

  // Tự động kết nối các máy chủ khi đăng nhập vào home-admin
  async function autoConnectServers() {
    // Show full-screen overlay immediately on auto connect
    const overlay = document.getElementById('overlay-connecting');
    if (overlay) overlay.classList.remove('d-none');

    // Determine which sections are visible by ID (no reliance on .section class)
    const sectionServer = document.getElementById('section-server');
    const sectionK8s = document.getElementById('section-k8s');
    const isServerVisible = !!(sectionServer && !sectionServer.classList.contains('d-none'));
    const isK8sVisible = !!(sectionK8s && !sectionK8s.classList.contains('d-none'));

    const indicator = document.getElementById('auto-connect-indicator');
    const serverStatusLoading = document.getElementById('server-check-status-loading');

    if (indicator && (isServerVisible || isK8sVisible)) {
      indicator.style.display = 'block';
      indicator.textContent = 'Đang tự động kết nối máy chủ...';
    }
    if (isServerVisible && serverStatusLoading) {
      serverStatusLoading.classList.remove('d-none');
    }
    try {
      await fetchJSON('/admin/servers/check-status', { method: 'POST' });
      if (isServerVisible) {
        await loadServers();
      } else if (isK8sVisible) {
        await loadClustersAndServers();
      }
    } catch (err) {

    } finally {
      if (indicator) indicator.style.display = 'none';
      if (isServerVisible && serverStatusLoading) {
        serverStatusLoading.classList.add('d-none');
      }
      if (overlay) overlay.classList.add('d-none');
    }
  }

  await autoConnectServers();

  // Tự động kết nối định kỳ sau 45 giây
  setInterval(autoConnectServers, 45000);

  // Section toggling
  const sectionIds = ['user', 'server', 'k8s', 'app', 'deployments'];
  async function showSection(key) {
    sectionIds.forEach(id => {
      const el = document.getElementById('section-' + id);
      if (el) { el.classList.toggle('d-none', id !== key); }
    });
    if (key === 'user') { await loadUsers(); }
    if (key === 'server') { await loadServers(); }
    if (key === 'deployments') { await loadDeploymentRequests(); }
    if (key === 'k8s') { await Promise.all([loadClusterList(), loadClustersAndServers()]); }
    // Có thể mở rộng cho 'app' nếu cần
  }

  // Xác định section nào đang active dựa vào hash URL hoặc mặc định là 'server'
  const hash = window.location.hash?.replace('#', '') || 'server';
  const defaultSection = sectionIds.includes(hash) ? hash : 'server';
  await showSection(defaultSection);

  // Listen for hash changes (when user clicks browser back/forward)
  window.addEventListener('hashchange', async () => {
    const newHash = window.location.hash?.replace('#', '') || 'server';
    if (sectionIds.includes(newHash)) {
      await showSection(newHash);
    }
  });

  document.querySelectorAll('.navbar .dropdown-menu a.dropdown-item, .navbar .nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) {
        const key = href.replace('#', '');
        if (['user', 'server', 'k8s', 'app', 'deployments'].includes(key)) {
          e.preventDefault();
          // Update URL hash without triggering navigation
          window.history.pushState(null, '', href);
          showSection(key);
          document.querySelector('.navbar-collapse')?.classList.remove('show');
        } else if (['svc-list', 'svc-actions', 'svc-logs'].includes(key)) {
          e.preventDefault();
          showSection('server');
          // Scroll to specific service section
          setTimeout(() => {
            const targetElement = document.getElementById(key);
            if (targetElement) {
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
          document.querySelector('.navbar-collapse')?.classList.remove('show');
        } else if (['k8s-ansible', 'k8s-playbook', 'k8s-namespace', 'k8s-pods', 'k8s-service'].includes(key)) {
          e.preventDefault();
          showSection('k8s');
          // Scroll to specific k8s section
          setTimeout(() => {
            const targetElement = document.getElementById(key);
            if (targetElement) {
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
          document.querySelector('.navbar-collapse')?.classList.remove('show');

        }
      }
    });
  });
  // Section đã được show ở trên dựa vào hash URL, không cần show default nữa

  // bind server forms
  const newSrv = document.getElementById('create-server-form');
  if (newSrv) { newSrv.addEventListener('submit', createServer); }
  const btnCheck = document.getElementById('btn-check-status');
  if (btnCheck) {
    btnCheck.addEventListener('click', async () => {
      const overlay = document.getElementById('overlay-connecting');
      if (overlay) overlay.classList.remove('d-none');
      try {
        btnCheck.disabled = true; btnCheck.textContent = 'Đang kiểm tra...';
        await fetchJSON('/admin/servers/check-status', { method: 'POST' });
        await loadServers();
      } finally {
        btnCheck.disabled = false; btnCheck.textContent = 'Kiểm tra trạng thái';
        if (overlay) overlay.classList.add('d-none');
      }
    });
  }

  // Handle tab changes in add node modal
  const selectExistingTab = document.getElementById('select-existing-tab');
  const addNewTab = document.getElementById('add-new-tab');
  const addExistingBtn = document.getElementById('add-existing-nodes-btn');
  const addNewBtn = document.getElementById('add-node-submit-btn');

  if (selectExistingTab && addNewTab && addExistingBtn && addNewBtn) {
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
let termInfo = { host: '', port: 22, username: '', id: null };
let term = null; // xterm instance

function ensureXTerm() {
  if (term) return term;
  const container = document.getElementById('term-output');
  if (!container) return null;
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

function appendTerm(text) {
  const t = ensureXTerm();
  if (!t) return;
  t.write(text);
}

function connectTerminal() {
  if (termWS && termWS.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  termWS = new WebSocket(proto + '://' + location.host + '/ws/terminal');
  termWS.onopen = () => {
    appendTerm('[client] Connected, opening SSH...\n');
    // If password field exists we can send password login, else require auto via session
    const passEl = document.getElementById('term-pass');
    if (passEl) {
      const pass = passEl.value || '';
      termWS.send(JSON.stringify({ host: termInfo.host, port: termInfo.port, username: termInfo.username, password: pass }));
    } else {
      termWS.send(JSON.stringify({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id }));
    }
  };
  termWS.onmessage = (e) => appendTerm(e.data);
  termWS.onclose = () => appendTerm('\n[client] Disconnected.\n');
  termWS.onerror = () => appendTerm('\n[client] Error.\n');
}

function connectTerminalAuto() {
  if (termWS && termWS.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  termWS = new WebSocket(proto + '://' + location.host + '/ws/terminal');
  termWS.onopen = () => {
    appendTerm('[client] Connected, opening SSH (auto) ...\n');
    termWS.send(JSON.stringify({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id }));
  };
  termWS.onmessage = (e) => appendTerm(e.data);
  termWS.onclose = () => appendTerm('\n[client] Disconnected.\n');
  termWS.onerror = () => appendTerm('\n[client] Error.\n');
}

function openTerminal(id, isConnected) {
  // Get current values from row inputs
  const host = document.querySelector(`input[data-id="${id}"][data-field="host"]`)?.value.trim();
  const port = parseInt(document.querySelector(`input[data-id="${id}"][data-field="port"]`)?.value || '22', 10);
  const username = document.querySelector(`input[data-id="${id}"][data-field="username"]`)?.value.trim();
  termInfo = { host, port, username, id };
  document.getElementById('term-host').value = host || '';
  document.getElementById('term-port').value = isNaN(port) ? '' : String(port);
  document.getElementById('term-user').value = username || '';
  document.getElementById('term-pass').value = '';
  const title = document.getElementById('terminal-title');
  if (title) title.textContent = `${host || ''}:${port || ''} (${username || ''})`;
  const out = document.getElementById('term-output');
  if (out) { out.innerHTML = ''; }
  if (term) { try { term.dispose(); } catch (_) { } term = null; }
  const modal = new bootstrap.Modal(document.getElementById('terminalModal'));
  modal.show();
  if (isConnected) {
    setTimeout(() => connectTerminalAuto(), 200);
  }
}

document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f && f.id === 'term-input-form') {
    e.preventDefault();
    const inp = document.getElementById('term-input');
    const val = inp.value;
    if (val && termWS && termWS.readyState === WebSocket.OPEN) {
      termWS.send(val.endsWith('\n') ? val : (val + '\n'));
    } else if (val && term) {
      // echo locally if not connected
      term.write(val + '\r\n');
    }
    inp.value = '';
  }
});

document.addEventListener('hidden.bs.modal', (e) => {
  if (e.target && e.target.id === 'terminalModal') {
    try { termWS?.close(); } catch (_) { }
    termWS = null;
  }
});

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.id === 'term-connect-btn') {
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
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang kiểm tra...';
    }

    // Gọi API kiểm tra trạng thái Ansible
    const ansibleStatus = await fetchJSON(`/admin/clusters/${clusterId}/ansible-status`);

    // Update status table
    updateAnsibleStatusTable(ansibleStatus);

  } catch (error) {
    // Hiển thị lỗi chi tiết hơn
    let errorMessage = error.message || 'Không thể kiểm tra trạng thái Ansible';
    let alertType = 'danger';
    let iconClass = 'bi-exclamation-triangle';

    // Kiểm tra nếu error có response data
    if (error.error) {
      errorMessage = error.error;
    }

    if (errorMessage.includes('Cluster không có servers nào')) {
      errorMessage = 'Cluster này chưa có máy chủ nào. Vui lòng thêm máy chủ vào cluster trước khi kiểm tra Ansible.';
      alertType = 'warning';
      iconClass = 'bi-server';
    } else if (errorMessage.includes('Yêu cầu không hợp lệ') || errorMessage.includes('xác thực')) {
      errorMessage = 'Không có thông tin xác thực. Vui lòng kết nối lại các server trước khi kiểm tra Ansible.';
    } else if (errorMessage.includes('Không có session') || errorMessage.includes('đăng nhập')) {
      errorMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    } else if (errorMessage.includes('Không tìm thấy MASTER') || errorMessage.includes('offline')) {
      errorMessage = 'MASTER server đang offline. Vui lòng kiểm tra kết nối máy chủ trước khi kiểm tra Ansible.';
      alertType = 'warning';
      iconClass = 'bi-server';
    }

    // Escape HTML để tránh XSS
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
    };

    statusDisplay.innerHTML = `
      <div class="alert alert-${alertType}">
        <i class="bi ${iconClass}"></i> ${escapeHtml(errorMessage)}
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
  const statusDisplay = document.getElementById('ansible-status-display');
  const statusTable = document.getElementById('ansible-status-table');
  
  if (!tbody || !statusDisplay || !statusTable) {
    return;
  }
  
  tbody.innerHTML = '';

  // Escape HTML helper function
  const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Kiểm tra nếu MASTER server offline
  if (ansibleStatus?.masterOffline === true) {
    const masterHost = ansibleStatus.masterHost || 'MASTER';
    statusDisplay.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-server"></i> <strong>Không tìm thấy máy chủ</strong><br>
        <small>MASTER server (${escapeHtml(masterHost)}) đang offline. Vui lòng kiểm tra kết nối máy chủ trước khi kiểm tra Ansible.</small>
      </div>
    `;
    statusDisplay.classList.remove('d-none');
    statusTable.classList.add('d-none');
    return;
  }

  // Kiểm tra ansibleStatus có tồn tại và có dữ liệu không
  if (!ansibleStatus) {
    statusDisplay.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> Không nhận được phản hồi từ server.
      </div>
    `;
    statusDisplay.classList.remove('d-none');
    statusTable.classList.add('d-none');
    return;
  }

  // Kiểm tra ansibleStatus property
  const ansibleStatusMap = ansibleStatus.ansibleStatus;
  if (!ansibleStatusMap || typeof ansibleStatusMap !== 'object') {
    statusDisplay.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> Không tìm thấy thông tin Ansible. 
        ${ansibleStatus?.recommendation ? escapeHtml(ansibleStatus.recommendation) : 'Vui lòng kiểm tra lại cluster có MASTER server không.'}
      </div>
    `;
    statusDisplay.classList.remove('d-none');
    statusTable.classList.add('d-none');
    return;
  }

  // Kiểm tra nếu Map rỗng
  const statusKeys = Object.keys(ansibleStatusMap);
  if (statusKeys.length === 0) {
    statusDisplay.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> Không tìm thấy thông tin Ansible. 
        ${ansibleStatus?.recommendation ? escapeHtml(ansibleStatus.recommendation) : 'Vui lòng kiểm tra lại cluster có MASTER server không.'}
      </div>
    `;
    statusDisplay.classList.remove('d-none');
    statusTable.classList.add('d-none');
    return;
  }

  // Có dữ liệu, hiển thị table
  statusDisplay.classList.add('d-none');
  statusTable.classList.remove('d-none');

  Object.entries(ansibleStatus.ansibleStatus).forEach(([host, status]) => {
    // Kiểm tra status object có hợp lệ không
    if (!status) {
      console.warn(`Invalid status for host: ${host}`);
      return;
    }

    const tr = document.createElement('tr');
    tr.className = status.installed ? 'table-success' : 'table-danger';

    tr.innerHTML = `
      <td><strong>${escapeHtml(host)}</strong></td>
      <td>
        <span class="badge bg-${status.role === 'MASTER' ? 'primary' : 'secondary'}">
          ${escapeHtml(status.role || 'UNKNOWN')}
        </span>
      </td>
      <td>
        <span class="badge bg-${status.installed ? 'success' : 'danger'}">
          <i class="bi bi-${status.installed ? 'check-circle' : 'x-circle'}"></i>
          ${status.installed ? 'Đã cài đặt' : 'Chưa cài đặt'}
        </span>
      </td>
      <td>${status.installed ? `<code>${escapeHtml(status.version || 'N/A')}</code>` : 'N/A'}</td>
      <td>
        ${status.installed ? `
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-warning" onclick="reinstallAnsibleOnServer('${escapeHtml(host)}')">Cài đặt lại</button>
            <button class="btn btn-outline-danger" onclick="uninstallAnsibleOnServer('${escapeHtml(host)}')">Gỡ cài đặt</button>
          </div>` :
        `<button class="btn btn-sm btn-outline-primary" onclick="installAnsibleOnServer('${escapeHtml(host)}')">Cài đặt</button>`
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
  if (!container) return;
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

  ansibleWebSocket.onopen = function (event) {
    addLogMessage('success', '✅ Kết nối WebSocket thành công');
    addLogMessage('info', '🔗 WebSocket connected');

    // Send installation start command after connection is established
    sendInstallationStartCommand();
  };

  ansibleWebSocket.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      handleAnsibleMessage(data);
    } catch (e) {
      console.error('Lỗi parse WebSocket message:', e);
      addLogMessage('error', '❌ Lỗi parse message: ' + (e.message || 'Không xác định'));
    }
  };

  ansibleWebSocket.onclose = function (event) {
    addLogMessage('warning', `⚠️ WebSocket connection closed (Code: ${event.code})`);

    if (event.code !== 1000) { // Not normal closure
      addLogMessage('error', '❌ WebSocket closed unexpectedly');
    }
  };

  ansibleWebSocket.onerror = function (error) {
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
      (function () {
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
document.addEventListener('DOMContentLoaded', function () {
  // Start installation button
  document.getElementById('start-ansible-install-btn').addEventListener('click', startAnsibleInstallation);

  // Clear output button
  document.getElementById('clear-output-btn').addEventListener('click', clearAnsibleOutput);

  // Download log button
  document.getElementById('download-log-btn').addEventListener('click', downloadAnsibleLog);
  // Ansible Config Modal handlers (placeholders)
  const saveCfgBtn = document.getElementById('save-ansible-config-btn');
  if (saveCfgBtn && !saveCfgBtn.dataset.bound) {
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
  function appendInitLogTo(consoleId, line) {
    const con = document.getElementById(consoleId);
    if (!con) return;
    const ts = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.textContent = `[${ts}] ${line}`;
    con.appendChild(div);
    con.scrollTop = con.scrollHeight;
  }

  function appendInitLogBlockTo(consoleId, text) {
    const con = document.getElementById(consoleId);
    if (!con) return;
    const pre = document.createElement('pre');
    pre.className = 'm-0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = text;
    con.appendChild(pre);
    con.scrollTop = con.scrollHeight;
  }

  // Backward compatible helpers for the Structure tab console
  function appendInitLog(line) { appendInitLogTo('init-ansible-console', line); }
  function appendInitLogBlock(text) { appendInitLogBlockTo('init-ansible-console', text); }

  const clearInitBtn = document.getElementById('init-output-clear-btn');
  if (clearInitBtn && !clearInitBtn.dataset.bound) {
    clearInitBtn.dataset.bound = '1';
    clearInitBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if (con) con.innerHTML = '';
    });
  }

  // Clear buttons for other tab consoles
  const clearInitCfgBtn = document.getElementById('init-config-output-clear-btn');
  if (clearInitCfgBtn && !clearInitCfgBtn.dataset.bound) {
    clearInitCfgBtn.dataset.bound = '1';
    clearInitCfgBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if (con) con.innerHTML = '';
    });
  }
  const clearInitSshKeyBtn = document.getElementById('init-sshkey-output-clear-btn');
  if (clearInitSshKeyBtn && !clearInitSshKeyBtn.dataset.bound) {
    clearInitSshKeyBtn.dataset.bound = '1';
    clearInitSshKeyBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if (con) con.innerHTML = '';
    });
  }
  const clearInitPingBtn = document.getElementById('init-ping-output-clear-btn');
  if (clearInitPingBtn && !clearInitPingBtn.dataset.bound) {
    clearInitPingBtn.dataset.bound = '1';
    clearInitPingBtn.addEventListener('click', () => {
      const con = document.getElementById('init-ansible-console');
      if (con) con.innerHTML = '';
    });
  }

  // WebSocket realtime for Init actions
  let initActionsWS = null;
  async function runInitActionWS(action, consoleId) {
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

    try { if (initActionsWS) { initActionsWS.close(); } } catch (_) { }
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
            const line = `[${data.server || ''}] ${data.prompt || ''}${data.command || ''}`.trim();
            appendInitLogTo(consoleId, line);
            return;
          }
          if (data.type === 'step') {
            const line = `[${data.server || ''}] Bước ${data.step}: ${data.message || ''}`;
            appendInitLogTo(consoleId, line);
            return;
          }
          if (data.message) {
            appendInitLogTo(consoleId, data.message);
            return;
          }
        }
      } catch (_) {
        // Second attempt: sanitize control chars (except \n, \r, \t) then parse
        try {
          const sanitized = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
          const data2 = JSON.parse(sanitized);
          if (data2 && typeof data2 === 'object') {
            if (data2.type === 'terminal_output') {
              appendInitLogBlockTo(consoleId, data2.output || '');
            } else if (data2.type === 'terminal_prompt') {
              const line = `[${data2.server || ''}] ${data2.prompt || ''}${data2.command || ''}`.trim();
              appendInitLogTo(consoleId, line);
            } else if (data2.type === 'step') {
              const line = `[${data2.server || ''}] Bước ${data2.step}: ${data2.message || ''}`;
              appendInitLogTo(consoleId, line);
            } else if (data2.message) {
              appendInitLogTo(consoleId, data2.message);
            } else {
              appendInitLogBlockTo(consoleId, sanitized);
            }
            return;
          }
        } catch (parseErr) {
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
  if (createPbBtn && !createPbBtn.dataset.bound) {
    createPbBtn.dataset.bound = '1';
    createPbBtn.addEventListener('click', () => {
      // Hiển thị khu vực nội dung và ẩn khu vực thực thi khi tạo mới
      try { if (window.showPlaybookContentView) window.showPlaybookContentView(); } catch (_) { }

      document.getElementById('playbook-editor').value = '---\n- name: New playbook\n  hosts: all\n  tasks:\n    - debug: msg:"hello"\n';
      // Gợi ý tên file trống để người dùng nhập
      const filenameInput = document.getElementById('playbook-filename');
      if (filenameInput) filenameInput.focus();
    });
  }
  const savePbBtn = document.getElementById('save-playbook-btn');
  if (savePbBtn && !savePbBtn.dataset.bound) {
    savePbBtn.dataset.bound = '1';
    savePbBtn.addEventListener('click', async () => {
      await savePlaybook();
    });
  }

  // Refresh playbooks button
  const refreshPbBtn = document.getElementById('refresh-playbooks-btn');
  if (refreshPbBtn && !refreshPbBtn.dataset.bound) {
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
  if (deletePbBtn && !deletePbBtn.dataset.bound) {
    deletePbBtn.dataset.bound = '1';
    deletePbBtn.addEventListener('click', async () => {
      const filename = document.getElementById('playbook-filename')?.value;
      if (filename) {
        await deletePlaybook(filename);
      }
    });
  }

  // Execute playbook button
  const executePbBtn = document.getElementById('execute-playbook-btn');
  if (executePbBtn && !executePbBtn.dataset.bound) {
    executePbBtn.dataset.bound = '1';
    executePbBtn.addEventListener('click', async () => {
      const filename = document.getElementById('playbook-filename')?.value;
      if (filename) {
        await executePlaybook(filename);
      }
    });
  }

  // Upload playbook button
  const uploadPbInput = document.getElementById('upload-playbook-input');
  if (uploadPbInput && !uploadPbInput.dataset.bound) {
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
  document.getElementById('ansibleInstallModal').addEventListener('hidden.bs.modal', function () {
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
  window.loadPlaybook = async function (filename) {
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
  window.savePlaybook = async function () {
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
  window.deletePlaybook = async function (filename) {
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
  window.executePlaybook = async function (filename, extraVars = '') {
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
  window.showPlaybookExecutionView = function () {
    const contentArea = document.getElementById('playbook-content-area');
    const executionStatus = document.getElementById('playbook-execution-status');

    if (contentArea) {
      contentArea.style.display = 'none';
    }
    if (executionStatus) {
      executionStatus.style.display = 'block';
    }
  }

  window.showPlaybookContentView = function () {
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
  window.clearExecutionOutput = function () {
    const statusElement = document.getElementById('playbook-execution-status');
    if (statusElement) {
      statusElement.innerHTML = '';
    }
  };

  // Global function để refresh playbooks (có thể gọi từ HTML)
  window.refreshPlaybooks = async function () {
    console.log('Global refreshPlaybooks called');
    try {
      await loadPlaybooks();
      console.log('Playbooks refreshed via global function');
    } catch (error) {
      console.error('Error in global refreshPlaybooks:', error);
    }
  };

  // Test function for playbook search
  window.testPlaybookSearch = function () {
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
  window.testSearchWithKeyword = function (keyword) {
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
  window.testItemVisibility = function () {
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
  window.testSimpleSearch = function () {
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
  window.uploadPlaybook = async function (file) {
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
    templateSelect.addEventListener('change', function () {
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
    generateFromTemplateBtn.addEventListener('click', async function () {
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

      // Luôn ẩn khung thực thi và hiển thị khu vực nội dung khi tạo playbook
      try { if (window.showPlaybookContentView) window.showPlaybookContentView(); } catch (_) { }

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
      } finally {
        // Đảm bảo khung thực thi bị ẩn và nội dung playbook được hiển thị
        try { if (window.showPlaybookContentView) window.showPlaybookContentView(); } catch (_) { }
      }
    });
  }

  // Load current ansible config when opening the modal
  const ansibleConfigModalEl = document.getElementById('ansibleConfigModal');
  if (ansibleConfigModalEl && !ansibleConfigModalEl.dataset.bound) {
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
  window.removeLine = function (lineId) {
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

  // Function to show alert messages (singleton at top-right)
  function showAlert(type, message) {
    try {
      const cls = (type === 'error') ? 'danger' : (type === 'warning' ? 'warning' : (type === 'success' ? 'success' : 'info'));

      // Create container if missing
      let container = document.getElementById('global-alert-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'global-alert-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.minWidth = '300px';
        document.body.appendChild(container);
      }

      // Reuse single alert element
      if (!window.__GLOBAL_ALERT__) {
        const el = document.createElement('div');
        el.id = 'global-alert';
        el.className = `alert alert-${cls} alert-dismissible fade show`;
        el.innerHTML = `
          ${message}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        container.replaceChildren(el);
        window.__GLOBAL_ALERT__ = el;
      } else {
        const el = window.__GLOBAL_ALERT__;
        el.className = `alert alert-${cls} alert-dismissible fade show`;
        el.innerHTML = `
          ${message}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        if (!el.parentNode) container.appendChild(el);
      }

      // Reset existing timeout and set a new one
      if (window.__GLOBAL_ALERT_TO__) {
        clearTimeout(window.__GLOBAL_ALERT_TO__);
      }
      window.__GLOBAL_ALERT_TO__ = setTimeout(() => {
        const el = window.__GLOBAL_ALERT__;
        if (el && el.parentNode) {
          el.remove();
        }
        window.__GLOBAL_ALERT__ = null;
        window.__GLOBAL_ALERT_TO__ = null;
      }, 5000);
    } catch (_) {
      // Fallback to native alert to avoid losing critical messages
      try { alert(typeof message === 'string' ? message.replace(/<[^>]*>/g, '') : String(message)); } catch (__) {}
    }
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

          if (cfgEl) cfgEl.value = data.cfg || '';
          if (hostsEl) hostsEl.value = data.hosts || '';
          if (varsEl) varsEl.value = data.vars || '';

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

// ==================== K8s Resources Management ====================

let k8sResourcesData = {
  pods: [],
  namespaces: [],
  workloads: {
    deployments: [],
    statefulSets: [],
    daemonSets: []
  },
  services: [],
  ingress: []
};

// Validation helpers for K8s resource actions
function isSystemNamespace(ns) {
  const n = (ns || '').toLowerCase();
  return n === 'kube-system' || n === 'kube-public' || n === 'kube-node-lease';
}
function canDeletePod(namespace) {
  return !isSystemNamespace(namespace);
}
function canScaleWorkloadType(type) {
  const t = (type || '').toLowerCase();
  return t === 'deployment' || t === 'statefulset';
}

// Filters state for K8s resources
const k8sFilters = {
  podsSearch: '',
  podsNamespace: '',
  namespacesSearch: '',
  workloadsSearch: '',
  workloadsType: '',
  servicesSearch: '',
  servicesNamespace: '',
  servicesType: '',
  ingressSearch: '',
  ingressNamespace: ''
};

// Token để vô hiệu hóa kết quả fetch cũ khi chuyển cụm
let k8sRequestToken = 0;

// Track các namespace đang được xóa
let deletingNamespaces = new Set();

// Show K8s resources section
function showK8sResources() {
  document.getElementById('k8s-resources-detail').classList.remove('d-none');
  document.getElementById('networking-resources-detail').classList.remove('d-none');
  bindK8sResourceFilters();
  loadK8sResources();
}

// Simple modal to display action outputs (created on demand)
function ensureK8sModal() {
  let modal = document.getElementById('k8sActionModal');
  if (modal) return modal;
  const html = `
    <div class="modal fade" id="k8sActionModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="k8s-action-title">Kubernetes Output</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <pre id="k8s-action-output" class="mb-0" style="white-space: pre-wrap; max-height: 60vh; overflow: auto;"></pre>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  return document.getElementById('k8sActionModal');
}
function showK8sOutput(title, content) {
  const modal = ensureK8sModal();
  document.getElementById('k8s-action-title').textContent = title || 'Kubernetes Output';
  document.getElementById('k8s-action-output').textContent = content || '';
  new bootstrap.Modal(modal).show();
}

// Hide K8s resources section
function hideK8sResources() {
  document.getElementById('k8s-resources-detail').classList.add('d-none');
  document.getElementById('networking-resources-detail').classList.add('d-none');
}

// Load all K8s resources
async function loadK8sResources() {
  if (!currentClusterId) return;
  
  // Kiểm tra MASTER online trước khi load
  try {
    const detail = await fetchJSON(`/admin/clusters/${currentClusterId}/detail`).catch(() => null);
    if (detail && detail.nodes) {
      const hasOnlineMaster = detail.nodes.some(n => 
        (n.isConnected || n.status === 'ONLINE') && n.role === 'MASTER'
      );
      if (!hasOnlineMaster) {
        // MASTER offline, không load resources
        showK8sResourcesOfflineMessage();
        return;
      }
    }
  } catch (error) {
    // Nếu không kiểm tra được, vẫn thử load (fallback)
  }
  
  // Tăng token để vô hiệu hóa mọi request cũ
  const myToken = ++k8sRequestToken;
  try {
    await Promise.all([
      loadPods(myToken),
      loadNamespaces(myToken),
      loadWorkloads(myToken)
    ]);
  } catch (error) {
    // Silent error handling
  }
}

// Load pods
async function loadPods(token) {
  try {
    const response = await fetch(`/admin/clusters/${currentClusterId}/k8s/pods`);
    const data = await response.json();

    if (token !== k8sRequestToken) return; // bỏ kết quả cũ
    if (response.ok) {
      k8sResourcesData.pods = data.pods || [];
      renderPods();
      updatePodsCount();
    } else {
      // Xử lý lỗi 503 - Kubernetes API unavailable
      if (response.status === 503) {
        showPodsError(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
      } else {
        showPodsError(data.error || 'Lỗi tải pods');
      }
    }
  } catch (error) {
    showPodsError('Lỗi kết nối: ' + error.message);
  }
}

// Load namespaces
async function loadNamespaces(token) {
  try {
    const response = await fetch(`/admin/clusters/${currentClusterId}/k8s/namespaces`);
    const data = await response.json();

    if (token !== k8sRequestToken) return; // bỏ kết quả cũ
    if (response.ok) {
      k8sResourcesData.namespaces = data.namespaces || [];
      renderNamespaces();
      updateNamespacesCount();
      updatePodsNamespaceFilter();
    } else {
      // Xử lý lỗi 503 - Kubernetes API unavailable
      if (response.status === 503) {
        showNamespacesError(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
      } else {
        showNamespacesError(data.error || 'Lỗi tải namespaces');
      }
    }
  } catch (error) {
    showNamespacesError('Lỗi kết nối: ' + error.message);
  }
}

// Load workloads
async function loadWorkloads(token) {
  try {
    const response = await fetch(`/admin/clusters/${currentClusterId}/k8s/workloads`);
    const data = await response.json();

    if (token !== k8sRequestToken) return; // bỏ kết quả cũ
    if (response.ok) {
      k8sResourcesData.workloads = {
        deployments: data.deployments || [],
        statefulSets: data.statefulSets || [],
        daemonSets: data.daemonSets || []
      };
      renderWorkloads();
      updateWorkloadsCount();
    } else {
      // Xử lý lỗi 503 - Kubernetes API unavailable
      if (response.status === 503) {
        showWorkloadsError(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
      } else {
        showWorkloadsError(data.error || 'Lỗi tải workloads');
      }
    }
  } catch (error) {
    showWorkloadsError('Lỗi kết nối: ' + error.message);
  }
}

// Load networking resources (Services & Ingress)
async function loadNetworkingResources(clusterId) {
  // Kiểm tra MASTER online trước khi load
  try {
    const detail = await fetchJSON(`/admin/clusters/${clusterId}/detail`).catch(() => null);
    if (detail && detail.nodes) {
      const hasOnlineMaster = detail.nodes.some(n => 
        (n.isConnected || n.status === 'ONLINE') && n.role === 'MASTER'
      );
      if (!hasOnlineMaster) {
        // MASTER offline, không load resources
        showNetworkingOfflineMessage();
        return;
      }
    }
  } catch (error) {
    // Nếu không kiểm tra được, vẫn thử load (fallback)
  }
  
  try {
    const response1 = await fetch(`/admin/clusters/${clusterId}/k8s/services`);
    const data1 = await response1.json();

    const response2 = await fetch(`/admin/clusters/${clusterId}/k8s/ingress`);
    const data2 = await response2.json();

    if (response1.ok) {
      k8sResourcesData.services = data1.services || [];
      renderServices();
      updateServicesCount();
    } else {
      // Xử lý lỗi 503 - Kubernetes API unavailable
      if (response1.status === 503) {
        showServicesError(data1.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
      } else {
        showServicesError(data1.error || 'Lỗi tải services');
      }
    }

    if (response2.ok) {
      k8sResourcesData.ingress = data2.ingress || [];
      renderIngress();
      updateIngressCount();
    } else {
      // Xử lý lỗi 503 - Kubernetes API unavailable
      if (response2.status === 503) {
        showIngressError(data2.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
      } else {
        showIngressError(data2.error || 'Lỗi tải ingress');
      }
    }
  } catch (error) {
    // Silent error handling
  }
}

// Refresh networking data
function refreshNetworking(clusterId) {
  if (!clusterId) return;
  loadNetworkingResources(clusterId);
}

// Render services table
function renderServices() {
  const tbody = document.getElementById('services-tbody');
  let services = k8sResourcesData.services || [];

  // Apply filters
  const q = (k8sFilters.servicesSearch || '').toLowerCase();
  const nsFilter = k8sFilters.servicesNamespace || '';
  const typeFilter = k8sFilters.servicesType || '';

  if (nsFilter) services = services.filter(s => (s.namespace || '') === nsFilter);
  if (typeFilter) services = services.filter(s => (s.type || '') === typeFilter);
  if (q) services = services.filter(s =>
    (s.name || '').toLowerCase().includes(q) ||
    (s.namespace || '').toLowerCase().includes(q) ||
    (s.clusterIP || '').toLowerCase().includes(q)
  );

  if (!services || services.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-3">
          <i class="bi bi-inbox"></i> Không có services nào
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = services.map(svc => `
    <tr>
      <td><span class="badge bg-secondary">${svc.namespace}</span></td>
      <td><code>${svc.name}</code></td>
      <td><span class="badge bg-info">${svc.type || 'ClusterIP'}</span></td>
      <td><code>${svc.clusterIP || '-'}</code></td>
      <td><small>${svc.externalIP || '-'}</small></td>
      <td><small>${svc.ports || '-'}</small></td>
      <td><small>${svc.age || '-'}</small></td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-info btn-sm" onclick="describeService('${svc.namespace}', '${svc.name}')" title="Chi tiết">
            <i class="bi bi-info-circle"></i> Chi tiết
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteService('${svc.namespace}', '${svc.name}')" title="Xóa">
            <i class="bi bi-trash"></i> Xóa
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Render ingress table
function renderIngress() {
  const tbody = document.getElementById('ingress-tbody');
  let ingress = k8sResourcesData.ingress || [];

  // Apply filters
  const q = (k8sFilters.ingressSearch || '').toLowerCase();
  const nsFilter = k8sFilters.ingressNamespace || '';

  if (nsFilter) ingress = ingress.filter(i => (i.namespace || '') === nsFilter);
  if (q) ingress = ingress.filter(i =>
    (i.name || '').toLowerCase().includes(q) ||
    (i.namespace || '').toLowerCase().includes(q) ||
    (i.host || '').toLowerCase().includes(q)
  );

  if (!ingress || ingress.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-3">
          <i class="bi bi-inbox"></i> Không có ingress nào
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = ingress.map(ing => `
    <tr>
      <td><span class="badge bg-secondary">${ing.namespace}</span></td>
      <td><code>${ing.name}</code></td>
      <td><small>${ing.class || '-'}</small></td>
      <td><small>${ing.host || '*'}</small></td>
      <td><small>${ing.address || '-'}</small></td>
      <td><small>${ing.ports || '80'}</small></td>
      <td><small>${ing.age || '-'}</small></td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-info btn-sm" onclick="describeIngress('${ing.namespace}', '${ing.name}')" title="Chi tiết">
            <i class="bi bi-info-circle"></i> Chi tiết
          </button>
          <button class="btn btn-outline-danger btn-sm" onclick="deleteIngress('${ing.namespace}', '${ing.name}')" title="Xóa">
            <i class="bi bi-trash"></i> Xóa
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Update counts
function updateServicesCount() {
  const count = k8sResourcesData.services ? k8sResourcesData.services.length : 0;
  document.getElementById('services-count').textContent = count;
}

function updateIngressCount() {
  const count = k8sResourcesData.ingress ? k8sResourcesData.ingress.length : 0;
  document.getElementById('ingress-count').textContent = count;
}

function showServicesError(msg) {
  const tbody = document.getElementById('services-tbody');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${msg}</td></tr>`;
}

function showIngressError(msg) {
  const tbody = document.getElementById('ingress-tbody');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${msg}</td></tr>`;
}

// Hiển thị message khi MASTER offline cho K8s resources
function showK8sResourcesOfflineMessage() {
  const offlineMessage = '⚠️ MASTER server đang offline. Không thể lấy thông tin Kubernetes resources.';
  showPodsError(offlineMessage);
  showNamespacesError(offlineMessage);
  showWorkloadsError(offlineMessage);
}

// Hiển thị message khi MASTER offline cho Networking resources
function showNetworkingOfflineMessage() {
  const offlineMessage = '⚠️ MASTER server đang offline. Không thể lấy thông tin Networking resources.';
  showServicesError(offlineMessage);
  showIngressError(offlineMessage);
}

// Placeholder functions for actions
function describeService(namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  fetch(`/admin/clusters/${currentClusterId}/k8s/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`)
    .then(r => {
      if (r.status === 503) {
        return r.json().then(data => {
          throw new Error(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
        });
      }
      return r.json();
    })
    .then(res => {
      if (res.error) { alert(res.error); return; }
      showK8sOutput(`Service ${namespace}/${name}`, res.output || '');
    })
    .catch(e => alert(e.message || 'Lỗi'));
}

function deleteService(namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  const nsLower = (namespace || '').toLowerCase();
  if (nsLower === 'kube-system' || nsLower === 'kube-public' || nsLower === 'kube-node-lease') {
    alert('Không cho phép xóa Service trong namespace hệ thống');
    return;
  }
  if (!confirm(`Xóa Service ${namespace}/${name}?`)) return;
  fetch(`/admin/clusters/${currentClusterId}/k8s/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
    .then(r => r.json())
      .then(async res => {
        if (res.error) { showAlert('danger', res.error); return; }
        const out = res.output || `service "${name}" deleted`;
        showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(out)}</pre>`);
        try { await loadNetworkingResources(currentClusterId); } catch (_) { }
      })
    .catch(e => alert(e.message || 'Lỗi'));
}

function describeIngress(namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  fetch(`/admin/clusters/${currentClusterId}/k8s/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`)
    .then(r => {
      if (r.status === 503) {
        return r.json().then(data => {
          throw new Error(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
        });
      }
      return r.json();
    })
    .then(res => {
      if (res.error) { alert(res.error); return; }
      showK8sOutput(`Ingress ${namespace}/${name}`, res.output || '');
    })
    .catch(e => alert(e.message || 'Lỗi'));
}

function deleteIngress(namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  const nsLower = (namespace || '').toLowerCase();
  if (nsLower === 'kube-system' || nsLower === 'kube-public' || nsLower === 'kube-node-lease') {
    alert('Không cho phép xóa Ingress trong namespace hệ thống');
    return;
  }
  if (!confirm(`Xóa Ingress ${namespace}/${name}?`)) return;
  fetch(`/admin/clusters/${currentClusterId}/k8s/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
    .then(r => r.json())
      .then(async res => {
        if (res.error) { showAlert('danger', res.error); return; }
        const out = res.output || `ingress.networking.k8s.io "${name}" deleted`;
        showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(out)}</pre>`);
        try { await loadNetworkingResources(currentClusterId); } catch (_) { }
      })
    .catch(e => alert(e.message || 'Lỗi'));
}

// Render pods table
function renderPods() {
  const tbody = document.getElementById('pods-tbody');
  let pods = k8sResourcesData.pods;
  // Apply filters
  const q = (k8sFilters.podsSearch || '').toLowerCase();
  const nsFilter = k8sFilters.podsNamespace || '';
  if (nsFilter) pods = pods.filter(p => (p.namespace || '') === nsFilter);
  if (q) pods = pods.filter(p => (p.name || '').toLowerCase().includes(q) || (p.node || '').toLowerCase().includes(q));

  if (!pods || pods.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-3">
          <i class="bi bi-inbox"></i> Không có pods nào
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pods.map(pod => {
    const delAllowed = canDeletePod(pod.namespace);
    const delAttrs = delAllowed ? '' : 'disabled title="Không cho phép xóa pod trong namespace hệ thống"';
    return `
    <tr>
      <td><span class="badge bg-secondary">${pod.namespace}</span></td>
      <td><code>${pod.name}</code></td>
      <td><small>${pod.node || '-'}</small></td>
      <td>
        <span class="badge ${getPodStatusBadgeClass(pod.status)}">${pod.status}</span>
      </td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-info btn-sm" onclick="describePod('${pod.namespace}', '${pod.name}')" title="Chi tiết">
            <i class="bi bi-info-circle me-1"></i> Chi tiết
          </button>
          <button class="btn btn-outline-danger btn-sm" ${delAttrs} onclick="deletePod('${pod.namespace}', '${pod.name}')" title="Xóa">
            <i class="bi bi-trash me-1"></i> Xóa
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// Render namespaces table
function renderNamespaces() {
  const tbody = document.getElementById('namespaces-tbody');
  let namespaces = k8sResourcesData.namespaces;
  // Apply filters
  const q = (k8sFilters.namespacesSearch || '').toLowerCase();
  if (q) namespaces = namespaces.filter(ns => (ns.name || '').toLowerCase().includes(q) || (ns.status || '').toLowerCase().includes(q));

  if (!namespaces || namespaces.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-muted py-3">
          <i class="bi bi-inbox"></i> Không có namespaces nào
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = namespaces.map(ns => {
    const isSystem = isSystemNamespace(ns.name);
    const isDeleting = deletingNamespaces.has(ns.name);
    const delAttrs = isSystem || isDeleting ? 'disabled' : '';
    const delTitle = isSystem ? 'title="Không cho phép xóa namespace hệ thống"' : 
                     isDeleting ? 'title="Đang xóa namespace..."' : '';
    const delText = isDeleting ? '<span class="spinner-border spinner-border-sm me-1"></span>Đang xóa...' : '<i class="bi bi-trash me-1"></i> Xóa';
    return `
    <tr>
      <td><code>${escapeHtml(ns.name)}</code></td>
      <td>
        <span class="badge ${getNamespaceStatusBadgeClass(ns.status)}">${escapeHtml(ns.status)}</span>
      </td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-info btn-sm" onclick="describeNamespace('${escapeHtml(ns.name)}')" title="Chi tiết">
            <i class="bi bi-info-circle me-1"></i> Chi tiết
          </button>
          <button class="btn btn-outline-danger btn-sm" ${delAttrs} ${delTitle} onclick="deleteNamespace('${escapeHtml(ns.name)}')">
            ${delText}
          </button>
        </div>
      </td>
    </tr>
    `;
  }).join('');
}

// Render workloads table
function renderWorkloads() {
  const tbody = document.getElementById('workloads-tbody');
  const { deployments, statefulSets, daemonSets } = k8sResourcesData.workloads;

  const allWorkloads = [
    ...deployments.map(d => ({
      ...d,
      type: 'Deployment',
      ready: Number(d.ready) || 0,
      total: (d.desired ?? d.replicas)
    })),
    ...statefulSets.map(s => ({
      ...s,
      type: 'StatefulSet',
      ready: Number(s.ready) || 0,
      total: (s.desired ?? s.replicas)
    })),
    ...daemonSets.map(ds => ({
      ...ds,
      type: 'DaemonSet',
      ready: Number(ds.ready) || 0,
      total: (ds.desired ?? ds.replicas)
    }))
  ];
  // Apply filters
  const q = (k8sFilters.workloadsSearch || '').toLowerCase();
  const type = k8sFilters.workloadsType || '';
  let filtered = allWorkloads;
  if (type) filtered = filtered.filter(w => w.type.toLowerCase() === type.toLowerCase());
  if (q) filtered = filtered.filter(w => (w.name || '').toLowerCase().includes(q) || (w.namespace || '').toLowerCase().includes(q));

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-3">
          <i class="bi bi-inbox"></i> Không có workloads nào
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(workload => {
    const wlType = (workload.type || '').toLowerCase();
    const scalable = canScaleWorkloadType(wlType) && !isSystemNamespace(workload.namespace);
    const scaleAttrs = scalable ? '' : 'disabled title="Chỉ hỗ trợ scale Deployment/StatefulSet ngoài namespace hệ thống"';
    const deletable = !isSystemNamespace(workload.namespace);
    const delAttrs = deletable ? '' : 'disabled title="Không cho phép xóa trong namespace hệ thống"';
    return `
    <tr>
      <td><span class="badge bg-primary">${workload.type}</span></td>
      <td><span class="badge bg-secondary">${workload.namespace}</span></td>
      <td><code>${workload.name}</code></td>
      <td>
        <span class="badge ${getWorkloadStatusBadgeClass(workload.ready, workload.total ?? '—')}">
          ${workload.ready}/${(workload.total ?? '—')}
        </span>
      </td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-info btn-sm" onclick="describeWorkload('${wlType}', '${workload.namespace}', '${workload.name}')" title="Chi tiết">
            <i class="bi bi-info-circle me-1"></i> Chi tiết
          </button>
          <button class="btn btn-outline-warning btn-sm" ${scaleAttrs} onclick="scaleWorkload('${wlType}', '${workload.namespace}', '${workload.name}')" title="Scale">
            <i class="bi bi-arrows-expand me-1"></i> Scale
          </button>
          <button class="btn btn-outline-danger btn-sm" ${delAttrs} onclick="deleteWorkload('${wlType}', '${workload.namespace}', '${workload.name}')" title="Xóa">
            <i class="bi bi-trash me-1"></i> Xóa
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// Bind filters with debounce
function bindK8sResourceFilters() {
  const podsSearch = document.getElementById('pods-search');
  const podsNs = document.getElementById('pods-namespace-filter');
  const nsSearch = document.getElementById('namespaces-search');
  const wlSearch = document.getElementById('workloads-search');
  const wlType = document.getElementById('workloads-type-filter');
  const svcSearch = document.getElementById('services-search');
  const svcNs = document.getElementById('services-namespace-filter');
  const svcType = document.getElementById('services-type-filter');
  const ingSearch = document.getElementById('ingress-search');
  const ingNs = document.getElementById('ingress-namespace-filter');

  const debounce = (fn, delay = 300) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  };

  if (podsSearch && !podsSearch.dataset.bound) { podsSearch.dataset.bound = '1'; podsSearch.addEventListener('input', debounce(e => { k8sFilters.podsSearch = e.target.value || ''; renderPods(); })); }
  if (podsNs && !podsNs.dataset.bound) { podsNs.dataset.bound = '1'; podsNs.addEventListener('change', e => { k8sFilters.podsNamespace = e.target.value || ''; renderPods(); }); }
  if (nsSearch && !nsSearch.dataset.bound) { nsSearch.dataset.bound = '1'; nsSearch.addEventListener('input', debounce(e => { k8sFilters.namespacesSearch = e.target.value || ''; renderNamespaces(); })); }
  if (wlSearch && !wlSearch.dataset.bound) { wlSearch.dataset.bound = '1'; wlSearch.addEventListener('input', debounce(e => { k8sFilters.workloadsSearch = e.target.value || ''; renderWorkloads(); })); }
  if (wlType && !wlType.dataset.bound) { wlType.dataset.bound = '1'; wlType.addEventListener('change', e => { k8sFilters.workloadsType = e.target.value || ''; renderWorkloads(); }); }
  if (svcSearch && !svcSearch.dataset.bound) { svcSearch.dataset.bound = '1'; svcSearch.addEventListener('input', debounce(e => { k8sFilters.servicesSearch = e.target.value || ''; renderServices(); })); }
  if (svcNs && !svcNs.dataset.bound) { svcNs.dataset.bound = '1'; svcNs.addEventListener('change', e => { k8sFilters.servicesNamespace = e.target.value || ''; renderServices(); }); }
  if (svcType && !svcType.dataset.bound) { svcType.dataset.bound = '1'; svcType.addEventListener('change', e => { k8sFilters.servicesType = e.target.value || ''; renderServices(); }); }
  if (ingSearch && !ingSearch.dataset.bound) { ingSearch.dataset.bound = '1'; ingSearch.addEventListener('input', debounce(e => { k8sFilters.ingressSearch = e.target.value || ''; renderIngress(); })); }
  if (ingNs && !ingNs.dataset.bound) { ingNs.dataset.bound = '1'; ingNs.addEventListener('change', e => { k8sFilters.ingressNamespace = e.target.value || ''; renderIngress(); }); }
}

// Helper functions for badge classes
function getPodStatusBadgeClass(status) {
  switch (status.toLowerCase()) {
    case 'running': return 'bg-success';
    case 'pending': return 'bg-warning';
    case 'failed': case 'error': return 'bg-danger';
    case 'succeeded': return 'bg-info';
    default: return 'bg-secondary';
  }
}

function getNamespaceStatusBadgeClass(status) {
  switch (status.toLowerCase()) {
    case 'active': return 'bg-success';
    case 'terminating': return 'bg-warning';
    default: return 'bg-secondary';
  }
}
function getWorkloadStatusBadgeClass(ready, total) {
  if (ready === total && total > 0) return 'bg-success';
  if (ready > 0) return 'bg-warning';
  return 'bg-danger';
}

// Update count badges
function updatePodsCount() {
  document.getElementById('pods-count').textContent = k8sResourcesData.pods.length;
}

function updateNamespacesCount() {
  document.getElementById('namespaces-count').textContent = k8sResourcesData.namespaces.length;
}

function updateWorkloadsCount() {
  const { deployments, statefulSets, daemonSets } = k8sResourcesData.workloads;
  const total = deployments.length + statefulSets.length + daemonSets.length;
  document.getElementById('workloads-count').textContent = total;
}

// Update pods namespace filter
function updatePodsNamespaceFilter() {
  const select = document.getElementById('pods-namespace-filter');
  const namespaces = k8sResourcesData.namespaces.map(ns => ns.name);

  // Clear existing options except first
  select.innerHTML = '<option value="">Tất cả namespace</option>';

  namespaces.forEach(ns => {
    const option = document.createElement('option');
    option.value = ns;
    option.textContent = ns;
    select.appendChild(option);
  });
}

// Error display functions
function showPodsError(message) {
  document.getElementById('pods-tbody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-danger py-3">
        <i class="bi bi-exclamation-triangle"></i> ${message}
      </td>
    </tr>
  `;
}

function showNamespacesError(message) {
  document.getElementById('namespaces-tbody').innerHTML = `
    <tr>
      <td colspan="3" class="text-center text-danger py-3">
        <i class="bi bi-exclamation-triangle"></i> ${message}
      </td>
    </tr>
  `;
}

function showWorkloadsError(message) {
  document.getElementById('workloads-tbody').innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-danger py-3">
        <i class="bi bi-exclamation-triangle"></i> ${message}
      </td>
    </tr>
  `;
}

// Button loading helper
function withButtonLoading(buttonEl, runner) {
  const btn = (buttonEl && buttonEl.tagName === 'BUTTON') ? buttonEl : (document.activeElement && document.activeElement.tagName === 'BUTTON' ? document.activeElement : null);
  const originalHtml = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Đang xử lý...';
  }
  const finalize = () => {
    if (btn) {
      btn.disabled = false;
      if (originalHtml !== null) btn.innerHTML = originalHtml;
    }
  };
  try {
    const maybePromise = runner();
    if (maybePromise && typeof maybePromise.then === 'function') {
      return maybePromise.finally(finalize);
    }
    finalize();
    return maybePromise;
  } catch (e) {
    finalize();
    throw e;
  }
}

// Wrap describe/delete/scale actions with loading (avoid hoisting recursion)
const _origDescribePod = (typeof window !== 'undefined' && typeof window.describePod === 'function') ? window.describePod : null;
if (typeof window !== 'undefined') {
  window.describePod = function(namespace, name, format = 'json') {
    return withButtonLoading(document.activeElement, () => _origDescribePod ? _origDescribePod(namespace, name, format) : Promise.resolve());
  };
}

const _origDeletePod = (typeof window !== 'undefined' && typeof window.deletePod === 'function') ? window.deletePod : null;
if (typeof window !== 'undefined') {
  window.deletePod = function(namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDeletePod ? _origDeletePod(namespace, name) : Promise.resolve());
  };
}

const _origDescribeNamespace = (typeof window !== 'undefined' && typeof window.describeNamespace === 'function') ? window.describeNamespace : null;
if (typeof window !== 'undefined') {
  window.describeNamespace = function(name) {
    return withButtonLoading(document.activeElement, () => _origDescribeNamespace ? _origDescribeNamespace(name) : Promise.resolve());
  };
}

const _origDeleteNamespace = (typeof window !== 'undefined' && typeof window.deleteNamespace === 'function') ? window.deleteNamespace : null;
if (typeof window !== 'undefined') {
  window.deleteNamespace = function(name) {
    return withButtonLoading(document.activeElement, () => _origDeleteNamespace ? _origDeleteNamespace(name) : Promise.resolve());
  };
}

const _origDescribeService = (typeof window !== 'undefined' && typeof window.describeService === 'function') ? window.describeService : null;
if (typeof window !== 'undefined') {
  window.describeService = function(namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDescribeService ? _origDescribeService(namespace, name) : Promise.resolve());
  };
}

const _origDeleteService = (typeof window !== 'undefined' && typeof window.deleteService === 'function') ? window.deleteService : null;
if (typeof window !== 'undefined') {
  window.deleteService = function(namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDeleteService ? _origDeleteService(namespace, name) : Promise.resolve());
  };
}

const _origDescribeIngress = (typeof window !== 'undefined' && typeof window.describeIngress === 'function') ? window.describeIngress : null;
if (typeof window !== 'undefined') {
  window.describeIngress = function(namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDescribeIngress ? _origDescribeIngress(namespace, name) : Promise.resolve());
  };
}

const _origDeleteIngress = (typeof window !== 'undefined' && typeof window.deleteIngress === 'function') ? window.deleteIngress : null;
if (typeof window !== 'undefined') {
  window.deleteIngress = function(namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDeleteIngress ? _origDeleteIngress(namespace, name) : Promise.resolve());
  };
}

const _origDescribeWorkload = (typeof window !== 'undefined' && typeof window.describeWorkload === 'function') ? window.describeWorkload : null;
if (typeof window !== 'undefined') {
  window.describeWorkload = function(type, namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDescribeWorkload ? _origDescribeWorkload(type, namespace, name) : Promise.resolve());
  };
}

const _origDeleteWorkload = (typeof window !== 'undefined' && typeof window.deleteWorkload === 'function') ? window.deleteWorkload : null;
if (typeof window !== 'undefined') {
  window.deleteWorkload = function(type, namespace, name) {
    return withButtonLoading(document.activeElement, () => _origDeleteWorkload ? _origDeleteWorkload(type, namespace, name) : Promise.resolve());
  };
}

const _origScaleWorkload = (typeof window !== 'undefined' && typeof window.scaleWorkload === 'function') ? window.scaleWorkload : null;
if (typeof window !== 'undefined') {
  window.scaleWorkload = function(type, namespace, name) {
    return withButtonLoading(document.activeElement, () => _origScaleWorkload ? _origScaleWorkload(type, namespace, name) : Promise.resolve());
  };
}

// Action functions (placeholders)
function describePod(namespace, name, format = 'json') {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  const formatParam = format === 'yaml' ? '?format=yaml' : '';
  fetch(`/admin/clusters/${currentClusterId}/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${formatParam}`)
    .then(r => {
      if (r.status === 503) {
        return r.json().then(data => {
          throw new Error(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
        });
      }
      return r.json();
    })
    .then(res => {
      if (res.error) { alert(res.error); return; }
      showK8sOutput(`Pod ${namespace}/${name} (${res.format || 'json'})`, res.output || '');
    })
    .catch(e => alert(e.message || 'Lỗi'));
}

function deletePod(namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  if (isSystemNamespace(namespace)) { alert('Không cho phép xóa pod trong namespace hệ thống'); return; }
  if (confirm(`Xóa pod ${namespace}/${name}?`)) {
    fetch(`/admin/clusters/${currentClusterId}/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
      .then(r => r.json())
      .then(async res => {
        if (res.error) { showAlert('danger', res.error); return; }
        const out = res.output || `pod "${name}" deleted`;
        showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(out)}</pre>`);
        try { await loadK8sResources(); } catch (_) { }
      })
      .catch(e => alert(e.message || 'Lỗi'));
  }
}

function describeNamespace(name) {
  if (!currentClusterId) {
    alert('Chưa chọn cluster');
    return;
  }

  // Gọi API để lấy chi tiết namespace
  fetch(`/admin/clusters/${currentClusterId}/k8s/namespaces/${encodeURIComponent(name)}`)
    .then(r => {
      if (r.status === 503) {
        return r.json().then(data => {
          throw new Error(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
        });
      }
      return r.json();
    })
    .then(res => {
      if (res.error) {
        alert('Lỗi: ' + res.error);
      } else {
        showK8sOutput(`Namespace ${name}`, res.output || '');
      }
    })
    .catch(e => alert('Lỗi kết nối: ' + e.message));
}

function deleteNamespace(name) {
  if (!currentClusterId) {
    alert('Chưa chọn cluster');
    return;
  }

  // Kiểm tra namespace hệ thống
  if (isSystemNamespace(name)) {
    alert('Không cho phép xóa namespace hệ thống');
    return;
  }

  // Kiểm tra đang xóa rồi
  if (deletingNamespaces.has(name)) {
    return; // Đã đang xóa, không làm gì
  }

  // Xác nhận xóa
  if (!confirm(`Xóa namespace "${name}"?\n\nCảnh báo: Tất cả tài nguyên trong namespace này sẽ bị xóa vĩnh viễn!\n\nQuá trình này có thể mất vài phút...`)) {
    return;
  }

  // Đánh dấu đang xóa
  deletingNamespaces.add(name);
  // Cập nhật UI để disable button và hiển thị "Đang xóa..."
  renderNamespaces();

  // Hiển thị loading
  showAlert('info', `Đang xóa namespace "${name}"... Vui lòng đợi (có thể mất vài phút nếu namespace có nhiều tài nguyên).`);

  // Gọi API xóa namespace (backend sẽ chờ đến khi xóa xong)
  fetch(`/admin/clusters/${currentClusterId}/k8s/namespaces/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
    .then(r => r.json())
    .then(res => {
      // Xóa khỏi Set đang xóa
      deletingNamespaces.delete(name);
      
      if (res.error) {
        showAlert('danger', `Lỗi xóa namespace: ${escapeHtml(res.error)}`);
        // Reload để restore button
        renderNamespaces();
      } else {
        const out = res.output || `namespace "${name}" deleted`;
        showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(out)}</pre>`);
        // Reload namespaces list
        loadNamespaces(k8sRequestToken);
        // Reload other resources that might be affected
        loadPods(k8sRequestToken);
        loadWorkloads(k8sRequestToken);
        loadNetworkingResources(currentClusterId);
      }
    })
    .catch(e => {
      // Xóa khỏi Set đang xóa
      deletingNamespaces.delete(name);
      showAlert('danger', `Lỗi kết nối: ${escapeHtml(e.message || 'Không xác định')}`);
      // Reload để restore button
      renderNamespaces();
    });
}

function describeWorkload(type, namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  fetch(`/admin/clusters/${currentClusterId}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`)
    .then(r => {
      if (r.status === 503) {
        return r.json().then(data => {
          throw new Error(data.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
        });
      }
      return r.json();
    })
    .then(res => {
      if (res.error) { alert(res.error); return; }
      showK8sOutput(`${type} ${namespace}/${name}`, res.output || '');
    })
    .catch(e => alert(e.message || 'Lỗi'));
}

function scaleWorkload(type, namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  if (!canScaleWorkloadType(type) || isSystemNamespace(namespace)) {
    alert('Chỉ hỗ trợ scale Deployment/StatefulSet ngoài namespace hệ thống');
    return;
  }
  const replicas = prompt(`Số replicas mới cho ${type} ${namespace}/${name}:`);
  if (replicas !== null) {
    const body = { replicas: Number(replicas) };
    if (!Number.isFinite(body.replicas) || body.replicas < 0) { alert('Giá trị replicas không hợp lệ'); return; }
    fetch(`/admin/clusters/${currentClusterId}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(r => r.json())
      .then(async res => {
        if (res.error) { showAlert('danger', res.error); return; }
        const out = res.output || '';
        showAlert('success', `Đã scale ${type} ${namespace}/${name} → ${body.replicas}<hr><pre class="small mb-0">${escapeHtml(out)}</pre>`);
        try { await loadK8sResources(); } catch (_) { }
      })
      .catch(e => alert(e.message || 'Lỗi'));
  }
}

function deleteWorkload(type, namespace, name) {
  if (!currentClusterId) { alert('Chưa chọn cluster'); return; }
  if (isSystemNamespace(namespace)) { showAlert('warning', 'Không cho phép xóa trong namespace hệ thống'); return; }
  if (!confirm(`Xóa ${type} ${namespace}/${name}?`)) return;
  fetch(`/admin/clusters/${currentClusterId}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
    .then(r => r.json())
      .then(async res => {
        if (res.error) { showAlert('danger', res.error); return; }
        const defaultOutput = type === 'deployment' ? `deployment.apps "${name}" deleted` :
                              type === 'statefulset' ? `statefulset.apps "${name}" deleted` :
                              type === 'daemonset' ? `daemonset.apps "${name}" deleted` : `${type} "${name}" deleted`;
        const out = res.output || defaultOutput;
        showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(out)}</pre>`);
        try { await loadK8sResources(); } catch (_) { }
      })
    .catch(e => alert(e.message || 'Lỗi'));
}

// Reset K8s resources data
function resetK8sResourcesData() {
  // Reset data object
  k8sResourcesData = {
    pods: [],
    namespaces: [],
    workloads: {
      deployments: [],
      statefulSets: [],
      daemonSets: []
    },
    services: [],
    ingress: []
  };

  // Clear all K8s resource tables
  const tablesToClear = [
    'pods-tbody', 'namespaces-tbody', 'workloads-tbody',
    'services-tbody', 'ingress-tbody'
  ];
  tablesToClear.forEach(id => {
    const tbody = document.getElementById(id);
    if (tbody) tbody.innerHTML = '';
  });

  // Reset count badges
  const countBadges = [
    'pods-count', 'namespaces-count', 'workloads-count',
    'services-count', 'ingress-count'
  ];
  countBadges.forEach(id => {
    const badge = document.getElementById(id);
    if (badge) badge.textContent = '0';
  });

  // Reset K8s filters
  k8sFilters.podsSearch = '';
  k8sFilters.podsNamespace = '';
  k8sFilters.namespacesSearch = '';
  k8sFilters.workloadsSearch = '';
  k8sFilters.workloadsType = '';
  k8sFilters.servicesSearch = '';
  k8sFilters.servicesNamespace = '';
  k8sFilters.servicesType = '';
  k8sFilters.ingressSearch = '';
  k8sFilters.ingressNamespace = '';

  // Clear filter inputs
  const filterInputs = [
    'pods-search', 'pods-namespace-filter',
    'namespaces-search',
    'workloads-search', 'workloads-type-filter',
    'services-search', 'services-namespace-filter', 'services-type-filter',
    'ingress-search', 'ingress-namespace-filter'
  ];
  filterInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });

  // Clear deployment logs console (if exists)
  const deploymentLogsConsole = document.getElementById('deployment-logs-console');
  if (deploymentLogsConsole) {
    deploymentLogsConsole.textContent = '';
  }

  // Reset deleting namespaces set
  deletingNamespaces.clear();

  // Hide sections
  hideK8sResources();
}

// ============================================================================
// Deployment Requests Management
// ============================================================================

async function loadDeploymentRequests() {
  const tbody = document.getElementById('deployment-requests-tbody');
  if (!tbody) return;

  try {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Đang tải...</td></tr>';
    
    // Lấy filter status nếu có
    const statusFilter = document.getElementById('deployment-status-filter');
    const status = statusFilter ? statusFilter.value : '';
    
    // Build URL với query parameter
    let url = '/admin/deployment-requests';
    if (status && status.trim() !== '') {
      url += '?status=' + encodeURIComponent(status);
    }
    
    const data = await fetchJSON(url);
    
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Không có yêu cầu nào' + (status ? ' với trạng thái này' : '') + '</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach(req => {
      const tr = document.createElement('tr');
      
      // Format date
      const createdAt = req.createdAt ? new Date(req.createdAt).toLocaleString('vi-VN') : 'N/A';
      
      // Status badge
      let statusBadge = '';
      if (req.status === 'PENDING') {
        statusBadge = '<span class="badge bg-warning">⏳ Chờ xử lý</span>';
      } else if (req.status === 'RUNNING') {
        statusBadge = '<span class="badge bg-success">✅ Đang chạy</span>';
      } else if (req.status === 'ERROR') {
        statusBadge = '<span class="badge bg-danger">❌ Lỗi</span>';
      } else if (req.status === 'REJECTED') {
        statusBadge = '<span class="badge bg-secondary">🚫 Từ chối</span>';
      } else if (req.status === 'DELETED') {
        statusBadge = '<span class="badge bg-secondary">🗑️ Đã đánh dấu xóa</span>';
      } else {
        statusBadge = `<span class="badge bg-secondary">${req.status}</span>`;
      }

      // Action buttons
      let actionBtn = '';
      if (req.status === 'DELETED') {
        // Khi status = DELETED, không hiển thị actionBtn (chỉ cần nút Delete để xóa hoàn toàn)
        actionBtn = '';
      } else if (req.status === 'PENDING') {
        actionBtn = `
        <button class="btn btn-sm btn-outline-primary" onclick="viewDeploymentRequest(${req.id})" title="Xem yêu cầu">
          <i class="bi bi-eye"></i> Xem
        </button>
        <button class="btn btn-sm btn-outline-secondary" onclick="rejectDeploymentRequest(${req.id})" title="Từ chối yêu cầu này">
          <i class="bi bi-x-circle"></i> Từ chối
        </button>`;
      } else if (req.status === 'RUNNING') {
        // Cho phép xử lý lại nếu cần
        actionBtn = `<button class="btn btn-sm btn-warning" onclick="processDeploymentRequest(${req.id})" title="Xử lý lại yêu cầu này">
          <i class="bi bi-arrow-clockwise"></i> Xử lý lại
        </button>`;
      } else if (req.status === 'ERROR') {
        // Cho phép xử lý lại nếu có lỗi
        actionBtn = `<button class="btn btn-sm btn-warning" onclick="processDeploymentRequest(${req.id})" title="Xử lý lại yêu cầu này">
          <i class="bi bi-arrow-clockwise"></i> Xử lý lại
        </button>`;
      } else {
        actionBtn = `<button class="btn btn-sm btn-secondary" disabled>${req.status}</button>`;
      }

      const deleteBtn = `<button class="btn btn-sm btn-outline-danger" onclick="deleteDeploymentRequest(${req.id}, '${escapeHtml(req.appName || '')}', '${escapeHtml(req.k8sNamespace || '')}')" title="Delete deployment request and namespace">
        <i class="bi bi-trash"></i> Delete
      </button>`;

      const viewLogsBtn = `<button class="btn btn-sm btn-outline-info" onclick="viewDeploymentLogs(${req.id})" title="Xem logs">
        <i class="bi bi-file-text"></i> Logs
      </button>`;

      let accessUrlCell = '<td><small class="text-muted">-</small></td>';
      if (req.accessUrl) {
        const fullUrl = escapeHtml(req.accessUrl);
        accessUrlCell = `<td><a href="${fullUrl}" target="_blank" class="text-primary" title="${fullUrl}"><code>${fullUrl}</code> <i class="bi bi-box-arrow-up-right"></i></a></td>`;
      }

      // Replicas và Port
      const replicas = req.replicas != null ? req.replicas : 1;
      const port = req.containerPort != null ? req.containerPort : 80;

      tr.innerHTML = `
        <td>${req.id}</td>
        <td><strong>${escapeHtml(req.appName || 'N/A')}</strong></td>
        <td><code>${escapeHtml(req.dockerImage || 'N/A')}</code></td>
        <td>${escapeHtml(req.username || 'Unknown')}</td>
        <td><code>${escapeHtml(req.k8sNamespace || 'N/A')}</code></td>
        <td><span class="badge bg-info">${replicas}</span></td>
        <td><code>${port}</code></td>
        <td>${statusBadge}</td>
        ${accessUrlCell}
        <td><small>${createdAt}</small></td>
        <td>
          <div class="d-flex gap-1 flex-wrap">
            ${actionBtn}
            ${viewLogsBtn}
            ${deleteBtn}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error('Error loading deployment requests:', error);
    tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">
      Lỗi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}
    </td></tr>`;
    showAlert('danger', 'Không thể tải danh sách yêu cầu: ' + (error.message || 'Lỗi không xác định'));
  }
}

async function processDeploymentRequest(id) {
  if (!confirm(`Bạn có chắc chắn muốn xử lý yêu cầu triển khai #${id}?\n\nHệ thống sẽ tạo các K8s resources (Deployment, Service, Ingress) cho ứng dụng này.`)) {
    return;
  }
  await processDeploymentRequestWithParams(id, {});
}

async function processDeploymentRequestWithParams(id, params = {}) {
  const alertDiv = document.getElementById('deployment-alert');
  const messageSpan = document.getElementById('deployment-message');

  try {
    // Show loading
    if (alertDiv && messageSpan) {
      alertDiv.className = 'alert alert-info alert-dismissible fade show';
      alertDiv.style.display = 'block';
      messageSpan.textContent = 'Đang xử lý yêu cầu...';
    }

    // Tự động xem logs cho deployment này
    viewDeploymentLogs(id);
    // Bắt đầu polling logs mỗi giây
    startPollingDeploymentLogs(id);

    const response = await fetch(`/admin/deployment-requests/${id}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: Object.keys(params).length > 0 ? JSON.stringify(params) : undefined
    });

    const data = await response.json();

    if (!response.ok) {
      // Stop polling nếu có lỗi
      stopPollingDeploymentLogs();
      throw new Error(data.message || data.error || 'Lỗi xử lý yêu cầu');
    }

    // Tiếp tục polling để xem logs tiếp theo (nếu đang deploy)
    // Nếu status là RUNNING, có thể vẫn đang deploy, nên tiếp tục polling thêm một chút
    if (data.status === 'RUNNING') {
      // Poll thêm 30 giây nữa để xem logs cuối cùng
      setTimeout(() => {
        stopPollingDeploymentLogs();
        loadDeploymentLogs(id); // Load lần cuối
      }, 30000);
    } else {
      stopPollingDeploymentLogs();
    }

    // Success
    if (alertDiv && messageSpan) {
      alertDiv.className = 'alert alert-success alert-dismissible fade show';
      alertDiv.style.display = 'block';
      messageSpan.innerHTML = `
        <strong>✅ Xử lý thành công!</strong><br>
        Ứng dụng #${data.applicationId} đã được triển khai.<br>
        Trạng thái: <strong>${data.status}</strong><br>
        ${data.message ? `<small>${escapeHtml(data.message)}</small>` : ''}
      `;
    }

    // Reload list
    await loadDeploymentRequests();

  } catch (error) {
    console.error('Error processing deployment request:', error);
    stopPollingDeploymentLogs();
    if (alertDiv && messageSpan) {
      alertDiv.className = 'alert alert-danger alert-dismissible fade show';
      alertDiv.style.display = 'block';
      messageSpan.textContent = 'Lỗi: ' + (error.message || 'Không thể xử lý yêu cầu');
    }
  }
}
async function viewDeploymentRequest(id) {
  try {
    const [detail, clusterResponse] = await Promise.all([
      fetchJSON(`/admin/deployment-requests/${id}`),
      fetchJSON('/admin/clusters').catch(() => [])
    ]);

    const clusters = Array.isArray(clusterResponse) ? clusterResponse : [];
    const existingClusterId = detail.clusterId != null ? Number(detail.clusterId) : null;
    const formatClusterName = (cluster) => escapeHtml(cluster && cluster.name ? cluster.name : `Cluster #${cluster.id}`);
    const formatClusterStatus = (cluster) =>
      cluster && cluster.status ? ` [${escapeHtml(String(cluster.status))}]` : '';
    let hasSelectedClusterOption = false;
    const clusterOptionHtmlPieces = clusters.map(cluster => {
      const cid = Number(cluster.id);
      const selected = existingClusterId != null && cid === existingClusterId;
      if (selected) {
        hasSelectedClusterOption = true;
      }
      return `<option value="${cid}" ${selected ? 'selected' : ''}>${formatClusterName(cluster)}${formatClusterStatus(cluster)}</option>`;
    });
    const clusterOptionsHtml = (existingClusterId != null && !hasSelectedClusterOption
        ? `<option value="${existingClusterId}" selected>Cluster #${existingClusterId} (đã lưu)</option>`
        : '') + clusterOptionHtmlPieces.join('');
    const clusterHelpText = clusters.length > 0
        ? 'Để trống để hệ thống tự chọn cluster HEALTHY.'
        : 'Chưa có cluster khả dụng. Nếu để trống hệ thống sẽ cố gắng chọn tự động.';
    const currentClusterLabel = existingClusterId != null
        ? (() => {
            const matched = clusters.find(c => Number(c.id) === existingClusterId);
            if (matched) {
              const displayName = matched.name != null && matched.name !== ''
                ? matched.name
                : `Cluster #${existingClusterId}`;
              return `${displayName} (ID: ${existingClusterId})`;
            }
            return `Cluster #${existingClusterId}`;
          })()
        : 'Chưa gán';

    const modalId = 'deploymentDetailModal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    // Parse envVars if exists
    let envVarsDisplay = '';
    if (detail.envVars) {
      try {
        const envVarsObj = typeof detail.envVars === 'string' ? JSON.parse(detail.envVars) : detail.envVars;
        envVarsDisplay = Object.entries(envVarsObj).map(([key, value]) => `${key}=${value}`).join('\n');
      } catch (e) {
        envVarsDisplay = detail.envVars;
      }
    }

    const modalHtml = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-info-circle"></i> Xử lý yêu cầu #${id}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <!-- Thông tin cơ bản -->
              <div class="card mb-3">
                <div class="card-header bg-light">
                  <h6 class="mb-0"><i class="bi bi-info-circle"></i> Thông tin cơ bản</h6>
                </div>
                <div class="card-body">
                  <div class="row g-2 mb-2">
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Tên app:</strong></label>
                      <div><code>${escapeHtml(detail.appName || '')}</code></div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Người dùng:</strong></label>
                      <div>${escapeHtml(detail.username || 'Unknown')}</div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Namespace:</strong></label>
                      <div><code>${escapeHtml(detail.k8sNamespace || '')}</code></div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Trạng thái:</strong></label>
                      <div><span class="badge ${detail.status==='PENDING'?'bg-warning':(detail.status==='ERROR'?'bg-danger':(detail.status==='RUNNING'?'bg-success':'bg-secondary'))}">${escapeHtml(detail.status || '')}</span></div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Cluster hiện tại:</strong></label>
                      <div>${escapeHtml(currentClusterLabel)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Cấu hình triển khai -->
              <div class="card mb-3">
                <div class="card-header bg-light">
                  <h6 class="mb-0"><i class="bi bi-gear"></i> Cấu hình triển khai</h6>
                </div>
                <div class="card-body">
                  <div class="mb-3">
                    <label class="form-label">Docker Image *</label>
                    <input id="dd-docker" class="form-control" value="${escapeHtml(detail.dockerImage || '')}" placeholder="nginx:latest" />
                    <small class="form-text text-muted">Ví dụ: nginx:latest, node:18-alpine</small>
                  </div>

                  <div class="row g-2 mb-3">
                    <div class="col-md-6">
                      <label class="form-label">Container Port *</label>
                      <input type="number" id="dd-port" class="form-control" value="${detail.containerPort != null ? detail.containerPort : 80}" min="1" max="65535" />
                      <small class="form-text text-muted">Port mà container lắng nghe (mặc định: 80)</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Replicas *</label>
                      <div class="input-group">
                        <input type="number" id="dd-replicas" class="form-control" value="${detail.replicas != null ? detail.replicas : 1}" min="1" max="10" />
                        <span class="input-group-text">pods</span>
                      </div>
                      <small class="form-text text-muted">Số lượng pods chạy ứng dụng (mặc định: 1)</small>
                    </div>
                  </div>

                  <div class="mb-3">
                    <label class="form-label">Cluster triển khai</label>
                    <select id="dd-cluster" class="form-select">
                      <option value="">-- Tự động chọn cluster HEALTHY --</option>
                      ${clusterOptionsHtml}
                    </select>
                    <small class="form-text text-muted">${escapeHtml(clusterHelpText)}</small>
                  </div>

                  <div class="row g-2">
                    <div class="col-md-6">
                      <label class="form-label">CPU Request</label>
                      <input id="dd-cpu-req" class="form-control" value="${escapeHtml(detail.cpuRequest || '100m')}" placeholder="100m" />
                      <small class="form-text text-muted">Ví dụ: 100m, 500m, 1</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">CPU Limit</label>
                      <input id="dd-cpu-lim" class="form-control" value="${escapeHtml(detail.cpuLimit || '500m')}" placeholder="500m" />
                      <small class="form-text text-muted">Ví dụ: 500m, 1000m, 2</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Memory Request</label>
                      <input id="dd-mem-req" class="form-control" value="${escapeHtml(detail.memoryRequest || '128Mi')}" placeholder="128Mi" />
                      <small class="form-text text-muted">Ví dụ: 128Mi, 512Mi, 1Gi</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Memory Limit</label>
                      <input id="dd-mem-lim" class="form-control" value="${escapeHtml(detail.memoryLimit || '256Mi')}" placeholder="256Mi" />
                      <small class="form-text text-muted">Ví dụ: 256Mi, 1Gi, 2Gi</small>
                    </div>
                  </div>

                  <div class="mt-3">
                    <label class="form-label">Environment Variables</label>
                    <textarea id="dd-env-vars" class="form-control" rows="4" placeholder="KEY1=value1&#10;KEY2=value2">${envVarsDisplay ? escapeHtml(envVarsDisplay) : ''}</textarea>
                    <small class="form-text text-muted">Mỗi biến một dòng, định dạng: KEY=value (để trống nếu không cần)</small>
                  </div>
                </div>
              </div>

              <!-- Tóm tắt cấu hình -->
              <div class="card mb-0">
                <div class="card-header bg-light">
                  <h6 class="mb-0"><i class="bi bi-list-check"></i> Tóm tắt cấu hình</h6>
                </div>
                <div class="card-body">
                  <div class="row g-2 small">
                    <div class="col-md-3">
                      <strong>Replicas:</strong> <span id="summary-replicas" class="badge bg-info">${detail.replicas != null ? detail.replicas : 1}</span>
                    </div>
                    <div class="col-md-3">
                      <strong>Port:</strong> <code id="summary-port">${detail.containerPort != null ? detail.containerPort : 80}</code>
                    </div>
                    <div class="col-md-3">
                      <strong>CPU:</strong> <span id="summary-cpu">${escapeHtml(detail.cpuRequest || '100m')} / ${escapeHtml(detail.cpuLimit || '500m')}</span>
                    </div>
                    <div class="col-md-3">
                      <strong>Memory:</strong> <span id="summary-memory">${escapeHtml(detail.memoryRequest || '128Mi')} / ${escapeHtml(detail.memoryLimit || '256Mi')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
              <button type="button" class="btn btn-outline-info" id="dd-validate">Kiểm tra image</button>
              <button type="button" class="btn btn-outline-primary" id="dd-save">Lưu</button>
              <button type="button" class="btn btn-success" id="dd-process">Xử lý</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    const saveBtn = document.getElementById('dd-save');
    const validateBtn = document.getElementById('dd-validate');
    const processBtn = document.getElementById('dd-process');

    // Function to update summary
    const updateSummary = () => {
      const replicas = document.getElementById('dd-replicas')?.value || '1';
      const port = document.getElementById('dd-port')?.value || '80';
      const cpuReq = document.getElementById('dd-cpu-req')?.value || '100m';
      const cpuLim = document.getElementById('dd-cpu-lim')?.value || '500m';
      const memReq = document.getElementById('dd-mem-req')?.value || '128Mi';
      const memLim = document.getElementById('dd-mem-lim')?.value || '256Mi';

      const summaryReplicas = document.getElementById('summary-replicas');
      const summaryPort = document.getElementById('summary-port');
      const summaryCpu = document.getElementById('summary-cpu');
      const summaryMemory = document.getElementById('summary-memory');

      if (summaryReplicas) summaryReplicas.textContent = replicas;
      if (summaryPort) summaryPort.textContent = port;
      if (summaryCpu) summaryCpu.textContent = `${cpuReq} / ${cpuLim}`;
      if (summaryMemory) summaryMemory.textContent = `${memReq} / ${memLim}`;
    };

    // Add event listeners to update summary on change
    ['dd-replicas', 'dd-port', 'dd-cpu-req', 'dd-cpu-lim', 'dd-mem-req', 'dd-mem-lim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateSummary);
        el.addEventListener('change', updateSummary);
      }
    });

    const doSave = async () => {
      const dockerImage = document.getElementById('dd-docker').value.trim();
      const containerPort = parseInt(document.getElementById('dd-port')?.value || '80');
      const replicas = parseInt(document.getElementById('dd-replicas')?.value || '1');
      
      if (!dockerImage) {
        throw new Error('Vui lòng nhập Docker Image');
      }
      if (containerPort < 1 || containerPort > 65535) {
        throw new Error('Port phải trong khoảng 1-65535');
      }
      if (replicas < 1 || replicas > 10) {
        throw new Error('Replicas phải trong khoảng 1-10');
      }

      const body = {
        dockerImage: dockerImage,
        containerPort: containerPort,
        replicas: replicas,
        cpuRequest: document.getElementById('dd-cpu-req').value.trim(),
        cpuLimit: document.getElementById('dd-cpu-lim').value.trim(),
        memoryRequest: document.getElementById('dd-mem-req').value.trim(),
        memoryLimit: document.getElementById('dd-mem-lim').value.trim()
      };

      // Parse env vars if exists
      const envVarsTextarea = document.getElementById('dd-env-vars');
      if (envVarsTextarea && envVarsTextarea.value.trim()) {
        const envVarsObj = {};
        const lines = envVarsTextarea.value.trim().split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && key.trim()) {
              envVarsObj[key.trim()] = valueParts.join('=').trim();
            }
          }
        });
        if (Object.keys(envVarsObj).length > 0) {
          body.envVars = JSON.stringify(envVarsObj);
        }
      }

      const resp = await fetch(`/admin/deployment-requests/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || data.error || 'Cập nhật thất bại');
      showAlert('success', 'Đã lưu cấu hình yêu cầu.');
      loadDeploymentRequests();
    };

    saveBtn.addEventListener('click', async () => {
      try { await doSave(); } catch (e) { showAlert('danger', e.message || 'Lỗi lưu'); }
    });

    validateBtn.addEventListener('click', async () => {
      try {
        const image = document.getElementById('dd-docker').value.trim();
        if (!image) { showAlert('warning', 'Vui lòng nhập Docker image'); return; }
        const resp = await fetch(`/admin/images/validate?image=${encodeURIComponent(image)}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || data.error || 'Không kiểm tra được');
        if (data.valid) {
          showAlert('success', `Image hợp lệ: ${image} (${data.message || 'OK'})`);
        } else {
          showAlert('danger', `Image không hợp lệ: ${image} (${data.message || 'UNKNOWN'})`);
        }
      } catch (e) {
        showAlert('danger', e.message || 'Lỗi kiểm tra image');
      }
    });

    processBtn.addEventListener('click', async () => {
      try {
        // Get values from form
        const dockerImage = document.getElementById('dd-docker').value.trim();
        const containerPort = parseInt(document.getElementById('dd-port')?.value || '80');
        const replicas = parseInt(document.getElementById('dd-replicas')?.value || '1');
        
        if (!dockerImage) {
          throw new Error('Vui lòng nhập Docker Image');
        }

        // Save configuration first
        await doSave();
        
        // Prepare process request body with all parameters
        const processBody = {
          dockerImage: dockerImage,
          containerPort: containerPort,
          replicas: replicas,
          cpuRequest: document.getElementById('dd-cpu-req').value.trim(),
          cpuLimit: document.getElementById('dd-cpu-lim').value.trim(),
          memoryRequest: document.getElementById('dd-mem-req').value.trim(),
          memoryLimit: document.getElementById('dd-mem-lim').value.trim()
        };

        // Add env vars if exists
        const envVarsTextarea = document.getElementById('dd-env-vars');
        if (envVarsTextarea && envVarsTextarea.value.trim()) {
          const envVarsObj = {};
          const lines = envVarsTextarea.value.trim().split('\n');
          lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const [key, ...valueParts] = trimmed.split('=');
              if (key && key.trim()) {
                envVarsObj[key.trim()] = valueParts.join('=').trim();
              }
            }
          });
        if (Object.keys(envVarsObj).length > 0) {
          processBody.envVars = JSON.stringify(envVarsObj);
        }
      }

      const clusterSelect = document.getElementById('dd-cluster');
      if (clusterSelect && clusterSelect.value) {
        processBody.clusterId = clusterSelect.value;
      }

      // Process deployment with parameters
      await processDeploymentRequestWithParams(id, processBody);
      modal.hide();
    } catch (e) {
      showAlert('danger', e.message || 'Lỗi xử lý');
      }
    });
  } catch (e) {
    showAlert('danger', 'Không thể tải chi tiết: ' + (e.message || 'Lỗi không xác định'));
  }
}

async function rejectDeploymentRequest(id) {
  const reason = prompt('Lý do từ chối (optional):', '');
  if (reason === null) return;
  try {
    const resp = await fetch(`/admin/deployment-requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || data.error || 'Từ chối thất bại');
    showAlert('info', 'Yêu cầu đã bị từ chối.');
    loadDeploymentRequests();
  } catch (e) {
    showAlert('danger', 'Không thể từ chối: ' + (e.message || 'Lỗi không xác định'));
  }
}

// Biến để lưu trữ polling interval
let deploymentLogsPollingInterval = null;
let currentViewingDeploymentId = null;

// Xem logs của deployment request
function viewDeploymentLogs(id) {
  currentViewingDeploymentId = id;
  loadDeploymentLogs(id);
}

// Load deployment logs từ API
async function loadDeploymentLogs(id) {
  const consoleDiv = document.getElementById('deployment-logs-console');
  if (!consoleDiv) return;

  try {
    const response = await fetch(`/admin/deployment-requests/${id}/logs`);
    const data = await response.json();

    if (response.ok && data.logs) {
      consoleDiv.textContent = data.logs || 'Chưa có logs...';
      // Auto scroll to bottom
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    } else {
      consoleDiv.innerHTML = '<div class="text-muted text-center">Không thể tải logs: ' + (data.message || 'Unknown error') + '</div>';
    }
  } catch (error) {
    console.error('Error loading deployment logs:', error);
    consoleDiv.innerHTML = '<div class="text-danger text-center">Lỗi tải logs: ' + escapeHtml(error.message || 'Unknown error') + '</div>';
  }
}

// Bắt đầu polling logs mỗi giây
function startPollingDeploymentLogs(id) {
  // Dừng polling cũ nếu có
  stopPollingDeploymentLogs();
  
  // Bắt đầu polling mới
  currentViewingDeploymentId = id;
  deploymentLogsPollingInterval = setInterval(() => {
    if (currentViewingDeploymentId === id) {
      loadDeploymentLogs(id);
    }
  }, 1000); // Mỗi 1 giây
}

// Dừng polling logs
function stopPollingDeploymentLogs() {
  if (deploymentLogsPollingInterval) {
    clearInterval(deploymentLogsPollingInterval);
    deploymentLogsPollingInterval = null;
  }
  currentViewingDeploymentId = null;
}

// Xóa logs trên màn hình
function clearDeploymentLogs() {
  const consoleDiv = document.getElementById('deployment-logs-console');
  if (consoleDiv) {
    consoleDiv.innerHTML = '<div class="text-muted text-center">Chọn một deployment request để xem logs...</div>';
  }
  stopPollingDeploymentLogs();
  currentViewingDeploymentId = null;
}

// Delete deployment request (including namespace)
async function deleteDeploymentRequest(id, appName, namespace) {
  const namespaceInfo = namespace && namespace.trim() !== '' ? `\n\nNamespace sẽ bị xóa: ${namespace}` : '';
  const confirmMsg = `Bạn có chắc chắn muốn xóa yêu cầu triển khai #${id}?\n\nỨng dụng: ${appName}${namespaceInfo}\n\nCảnh báo: Tất cả K8s resources (Deployment, Service, Ingress) và namespace sẽ bị xóa vĩnh viễn!\n\nQuá trình này có thể mất vài phút...`;
  
  if (!confirm(confirmMsg)) {
    return;
  }

  const alertDiv = document.getElementById('deployment-alert');
  const messageSpan = document.getElementById('deployment-message');

  try {
    // Show loading
    if (alertDiv && messageSpan) {
      alertDiv.className = 'alert alert-info';
      alertDiv.style.display = 'block';
      messageSpan.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xóa yêu cầu và namespace...';
    }

    const response = await fetch(`/admin/deployment-requests/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Show success
      if (alertDiv && messageSpan) {
        alertDiv.className = 'alert alert-success';
        messageSpan.textContent = data.message || 'Đã xóa yêu cầu và namespace thành công!';
      }
      showAlert('success', data.message || 'Đã xóa yêu cầu và namespace thành công!');
      
      // Reload deployment requests list
      loadDeploymentRequests();
      
      // Clear logs console if viewing this deployment
      if (currentViewingDeploymentId === id) {
        clearDeploymentLogs();
      }
    } else {
      // Show error
      const errorMsg = data.message || data.error || 'Lỗi không xác định';
      if (alertDiv && messageSpan) {
        alertDiv.className = 'alert alert-danger';
        messageSpan.textContent = '❌ Lỗi: ' + errorMsg;
      }
      showAlert('danger', '❌ Lỗi xóa yêu cầu: ' + escapeHtml(errorMsg));
    }
  } catch (error) {
    console.error('Error deleting deployment request:', error);
    const errorMsg = error.message || 'Lỗi kết nối';
    if (alertDiv && messageSpan) {
      alertDiv.className = 'alert alert-danger';
      messageSpan.textContent = '❌ Lỗi: ' + errorMsg;
    }
    showAlert('danger', '❌ Lỗi xóa yêu cầu: ' + escapeHtml(errorMsg));
  }
}