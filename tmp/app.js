// ====================== STATE & SAMPLE DATA ======================
let currentUser = "admin"; // BỎ LOGIN: Luôn vào quyền admin
let selectedClusterId = 1; // demo

const data = {
  servers: [
    { id: 1, ip: "192.168.1.10", hostname: "srv-master", cpu: "4 vCPU", ram: "8 GB", disk: "120 GB", status: "Online" },
    { id: 2, ip: "192.168.1.11", hostname: "srv-worker-1", cpu: "2 vCPU", ram: "4 GB", disk: "80 GB", status: "Online" },
    { id: 3, ip: "192.168.1.12", hostname: "srv-worker-2", cpu: "2 vCPU", ram: "4 GB", disk: "80 GB", status: "Offline" }
  ],
  clusters: [
    { id: 1, name: "ctu-prod-cluster", desc: "Cụm sản xuất demo", status: "K8s Installed" },
    { id: 2, name: "student-demo-cluster", desc: "Demo cho sinh viên", status: "Servers Assigned" }
  ],
  assignments: [
    // clusterId, serverId, role
    { clusterId: 1, serverId: 1, role: "MASTER" },
    { clusterId: 1, serverId: 2, role: "WORKER" },
    { clusterId: 1, serverId: 3, role: "WORKER" }
  ],
  // K8s Rancher-like data
  nodes: [
    { name: "k8s-master-1", role: "master", cpu: "2 vCPU", ram: "4GB", status: "Ready" },
    { name: "k8s-worker-1", role: "worker", cpu: "2 vCPU", ram: "4GB", status: "Ready" },
    { name: "k8s-worker-2", role: "worker", cpu: "2 vCPU", ram: "4GB", status: "NotReady" }
  ],
  namespaces: [
    { name: "kube-system", pods: 22, cpu: "400m", ram: "1.2Gi" },
    { name: "apps", pods: 30, cpu: "1.5", ram: "3.1Gi" },
    { name: "student-b2110947", pods: 6, cpu: "300m", ram: "800Mi" }
  ],
  workloads: [
    { name: "student-app-1", ns: "student-b2110947", replicas: "2/2", status: "Running" },
    { name: "car-serv", ns: "apps", replicas: "1/1", status: "Running" },
    { name: "demo-error", ns: "apps", replicas: "0/1", status: "CrashLoop" }
  ],
  services: [
    { name: "car-serv-service", ns: "apps", type: "ClusterIP", ip: "10.107.144.56", port: "8081/TCP" },
    { name: "student-app-svc", ns: "student-b2110947", type: "ClusterIP", ip: "10.98.11.23", port: "80/TCP" }
  ],
  ingress: [
    { name: "student-ingress", ns: "student-b2110947", host: "student1.autodeploy.local", service: "student-app-svc", tls: "Yes" }
  ],
  storage: [
    { pvc: "mysql-data", ns: "apps", size: "10Gi", status: "Bound" }
  ]
};

// ====================== USER & APPLICATION DATA ======================

// Danh sách người dùng (dùng chung cho trang Users & User Detail)
data.users = [
  { id: 1, username: "admin", role: "ADMIN", created: "2025-01-20" },
  { id: 2, username: "thanh", role: "USER", created: "2025-02-02" },
  { id: 3, username: "nhut", role: "USER", created: "2025-02-11" },
  { id: 4, username: "bao", role: "USER", created: "2025-02-12" }
];

// Ứng dụng của từng người dùng
data.userApps = {
  1: [
    // Admin có thể có app hoặc không (demo: để trống)
  ],
  2: [
    { name: "car-serv", ns: "thanh", status: "Running", replicas: "1/1", url: "http://car.ctu.local" },
    { name: "shop-fe", ns: "thanh", status: "Running", replicas: "2/2", url: "http://shop.thanh.local" }
  ],
  3: [
    { name: "billing-api", ns: "nhut", status: "CrashLoop", replicas: "0/1", url: "-" }
  ],
  4: [
    { name: "shop-fe", ns: "bao", status: "Running", replicas: "2/2", url: "http://shop.bao.local" }
  ]
};


// ====================== LOGIN HANDLER ======================
function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById("username").value;
  const pass = document.getElementById("password").value;
  // demo: luôn cho login
  currentUser = user || "admin";
  document.getElementById("currentUserLabel").innerText = currentUser;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "flex";
  loadPage("servers");
}

// ====================== SIDEBAR NAV ======================
function navClick(ev) {
  ev.preventDefault();
  const page = ev.currentTarget.dataset.page;
  loadPage(page);
  document.querySelectorAll(".sidebar a").forEach(a => a.classList.remove("active"));
  ev.currentTarget.classList.add("active");
}

function setTitle(title) {
  document.getElementById("pageTitle").innerText = title;
}

// ====================== HELPERS ======================
function color(status) {
  if (["Active", "Running", "Ready", "Bound", "Online", "K8s Installed", "Ansible Installed"].includes(status)) return "green";
  if (["Warning", "Servers Assigned"].includes(status)) return "yellow";
  if (["NotReady", "Offline", "Error", "New"].includes(status)) return "red";
  return "yellow";
}

// ====================== YAML POPUP ======================
function openYamlPopup(yaml) {
  document.getElementById("yamlContent").textContent = yaml;
  document.getElementById("yamlPopup").style.display = "flex";
}
function closeYamlPopup() {
  document.getElementById("yamlPopup").style.display = "none";
}
function showYaml(name) {
  const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: apps
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
      - name: ${name}-container
        image: registry/${name}:latest
        ports:
        - containerPort: 80
`;
  openYamlPopup(yaml);
}

// ====================== PAGES – PHẦN SERVER & CLUSTER ======================

// 1. Servers list
function page_servers() {
  setTitle("Servers");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Quản lý máy chủ</div>
      <div class="page-subtitle">Danh sách các server được AutoDeployApp quản lý.</div>
    </div>
    <button class="btn btn-primary" onclick="loadPage('addServer')">+ Thêm Server</button>
  </div>

  <div class="table-card">
    <table class="table">
      <thead>
        <tr>
          <th>IP Address</th><th>Hostname</th><th>CPU</th><th>RAM</th><th>Disk</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${data.servers.map(s => `
          <tr>
            <td>${s.ip}</td>
            <td>${s.hostname}</td>
            <td>${s.cpu}</td>
            <td>${s.ram}</td>
            <td>${s.disk}</td>
            <td><span class="chip ${color(s.status)}">${s.status}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>`;
}

// 2. Add Server
function page_addServer() {
  setTitle("Add Server");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Thêm máy chủ mới</div>
      <div class="page-subtitle">Khai báo thông tin kết nối SSH để hệ thống quản lý.</div>
    </div>
  </div>

  <div class="card">
    <form onsubmit="fakeAddServer(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>IP Address</label>
          <input type="text" id="serverIp" placeholder="192.168.1.100" required/>
        </div>
        <div class="form-group">
          <label>SSH Username</label>
          <input type="text" id="serverUser" value="ubuntu" required/>
        </div>
        <div class="form-group">
          <label>SSH Port</label>
          <input type="number" id="serverPort" value="22" required/>
        </div>
        <div class="form-group">
          <label>Mô tả</label>
          <input type="text" id="serverDesc" placeholder="Master node, Lab CTU..." />
        </div>
      </div>
      <div class="form-group" style="margin-top:10px;">
        <label>SSH Private Key</label>
        <textarea id="serverKey" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button type="button" class="btn" onclick="alert('Demo: Test SSH connection')">Test Connection</button>
        <button type="submit" class="btn btn-primary">Lưu Server (demo)</button>
      </div>
    </form>
  </div>`;
}

function fakeAddServer(e) {
  e.preventDefault();
  alert("Demo: dữ liệu server được thêm vào CSDL. Ở bản thật sẽ gọi API.");
  loadPage("servers");
}

// 3. Cluster list
function page_clusters() {
  setTitle("Clusters");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Quản lý cụm Kubernetes (CSDL)</div>
      <div class="page-subtitle">Danh sách cụm được khai báo trong hệ thống.</div>
    </div>
    <button class="btn btn-primary" onclick="loadPage('createCluster')">+ Tạo Cluster</button>
  </div>

  <div class="table-card">
    <table class="table">
      <thead>
        <tr>
          <th>Tên Cluster</th><th>Mô tả</th><th>Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        ${data.clusters.map(c => `
        <tr onclick="selectCluster(${c.id})" style="cursor:pointer;">
          <td>${c.name}</td>
          <td>${c.desc}</td>
          <td><span class="chip ${color(c.status)}">${c.status}</span></td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>
  <div class="card">
    <div class="card-title">Cluster hiện tại: ${data.clusters.find(c => c.id === selectedClusterId)?.name || "(chưa chọn)"
    }</div>
  </div>`;
}

function selectCluster(id) {
  selectedClusterId = id;
  alert("Đã chọn cluster #" + id + ". Các trang Setup & Rancher sẽ sử dụng cụm này (demo).");
  loadPage("clusters");
}

// 4. Create cluster
function page_createCluster() {
  setTitle("Create Cluster");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Tạo cụm Kubernetes mới (CSDL)</div>
      <div class="page-subtitle">Chỉ lưu thông tin cấu hình vào database, chưa cài K8s.</div>
    </div>
  </div>

  <div class="card">
    <form onsubmit="fakeCreateCluster(event)">
      <div class="form-grid">
        <div class="form-group">
          <label>Tên Cluster</label>
          <input type="text" id="clusterName" placeholder="ctu-cluster-1" required/>
        </div>
        <div class="form-group">
          <label>Mô tả</label>
          <input type="text" id="clusterDesc" placeholder="Cụm cho sinh viên đồ án..." />
        </div>
      </div>
      <div style="margin-top:12px;">
        <button type="submit" class="btn btn-primary">Tạo Cluster (demo)</button>
      </div>
    </form>
  </div>`;
}

function fakeCreateCluster(e) {
  e.preventDefault();
  alert("Demo: Cluster mới đã được lưu vào CSDL.");
  loadPage("clusters");
}

// 5. Assign servers to cluster
function page_assignServers() {
  setTitle("Assign Servers");
  const cluster = data.clusters.find(c => c.id === selectedClusterId);
  const assignments = data.assignments.filter(a => a.clusterId === selectedClusterId);

  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Gán máy chủ vào cụm</div>
      <div class="page-subtitle">Chọn role MASTER/WORKER cho từng server trong cluster.</div>
    </div>
    <div>Cluster hiện tại: <b>${cluster ? cluster.name : "(chưa chọn)"}</b></div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Servers trong hệ thống</div>
    </div>
    <div class="table-card">
      <table class="table">
        <thead><tr><th>IP</th><th>Hostname</th><th>CPU</th><th>RAM</th><th>Status</th></tr></thead>
        <tbody>
        ${data.servers.map(s => `
          <tr>
            <td>${s.ip}</td>
            <td>${s.hostname}</td>
            <td>${s.cpu}</td>
            <td>${s.ram}</td>
            <td><span class="chip ${color(s.status)}">${s.status}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Máy chủ đã gán vào cluster (demo)</div>
    </div>
    <div class="table-card">
      <table class="table">
        <thead><tr><th>IP</th><th>Hostname</th><th>Role</th></tr></thead>
        <tbody>
          ${assignments.map(a => {
    const s = data.servers.find(x => x.id === a.serverId);
    return `
              <tr>
                <td>${s?.ip || ""}</td>
                <td>${s?.hostname || ""}</td>
                <td>${a.role}</td>
              </tr>
            `;
  }).join("")}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;">(Giao diện demo: bản thật sẽ cho phép chọn server & change role)</div>
  </div>`;
}

// 6. Cluster Setup (Ansible + K8s)
function page_clusterSetup() {
  setTitle("Cluster Setup");
  const cluster = data.clusters.find(c => c.id === selectedClusterId);

  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Thiết lập cụm Kubernetes bằng Ansible</div>
      <div class="page-subtitle">
        Thực hiện cài đặt Ansible, Kubernetes, CNI, Ingress, MetalLB trên các server đã gán.
      </div>
    </div>
    <div>Cluster: <b>${cluster ? cluster.name : "(chưa chọn)"}</b></div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Bước 1 – Kiểm tra môi trường</div>
      <button class="btn" onclick="alert('Demo: chạy playbook kiểm tra môi trường')">Run Check</button>
    </div>
    <div>Kiểm tra SSH, swapoff, kernel modules, containerd,... trên tất cả server.</div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Bước 2 – Cài Ansible trên master chính</div>
      <button class="btn btn-primary" onclick="alert('Demo: cài Ansible qua playbook')">Install Ansible</button>
    </div>
    <div>Sau khi cài xong, trạng thái cụm chuyển sang: <b>Ansible Installed</b> (demo).</div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Bước 3 – Cài Kubernetes (kubeadm)</div>
      <button class="btn btn-primary" onclick="alert('Demo: chạy playbook cài K8s + join node')">Install Kubernetes</button>
    </div>
    <div>Init master, join các master/worker còn lại bằng kubeadm và Ansible.</div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Bước 4 – Cài CNI, Ingress, MetalLB</div>
      <div style="display:flex;gap:8px;">
        <button class="btn" onclick="alert('Demo: cài Calico')">Install Calico</button>
        <button class="btn" onclick="alert('Demo: cài Ingress NGINX')">Install Ingress</button>
        <button class="btn" onclick="alert('Demo: cài MetalLB')">Install MetalLB</button>
      </div>
    </div>
    <div>Triển khai các addon cần thiết cho cụm.</div>
  </div>

  <div class="card">
    <div class="card-header">
      <div class="card-title">Bước 5 – Verify Cluster</div>
      <button class="btn btn-primary" onclick="alert('Demo: kubectl get nodes, top nodes, pods...')">Verify</button>
    </div>
    <div>Sau khi verify thành công, chuyển sang giao diện quản lý kiểu Rancher (Kubernetes Overview).</div>
  </div>`;
}

// ====================== PAGES – PHẦN K8S / RANCHER-LIKE ======================

function page_k8sOverview() {
  setTitle("Kubernetes Overview");

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Kubernetes Cluster Overview</div>
        <div class="page-subtitle">Tình trạng tổng quan của cụm Kubernetes.</div>
      </div>
    </div>

    <!-- TOP STAT CARDS -->
    <div class="overview-grid">
      <div class="overview-card">
        <div class="ov-title">Nodes</div>
        <div class="ov-value">${data.nodes.length}</div>
        <div class="ov-sub">${data.nodes.filter(n=>n.role==='master').length} master, ${data.nodes.filter(n=>n.role==='worker').length} worker</div>
      </div>

      <div class="overview-card">
        <div class="ov-title">Workloads</div>
        <div class="ov-value">${data.workloads.length}</div>
        <div class="ov-sub">Deployment / DaemonSet</div>
      </div>

      <div class="overview-card">
        <div class="ov-title">Pods</div>
        <div class="ov-value">${data.workloads.reduce((sum,w)=>sum + parseInt(w.replicas.split('/')[0]),0)}</div>
        <div class="ov-sub">Running pods</div>
      </div>

      <div class="overview-card">
        <div class="ov-title">Namespaces</div>
        <div class="ov-value">${data.namespaces.length}</div>
      </div>
    </div>

    <!-- RESOURCE USAGE -->
    <div class="card">
      <div class="card-title">Cluster Resource Usage</div>
      <div class="usage-grid">
        <div>
          <div>CPU Usage</div>
          <div class="bar-bg"><div class="bar-fill" style="width:65%;"></div></div>
        </div>
        <div>
          <div>RAM Usage</div>
          <div class="bar-bg"><div class="bar-fill" style="width:52%;"></div></div>
        </div>
        <div>
          <div>Disk Usage</div>
          <div class="bar-bg"><div class="bar-fill" style="width:40%;"></div></div>
        </div>
      </div>
    </div>

    <!-- SUMMARY TABLES -->
    <div class="overview-2col">
      <div class="card">
        <div class="card-title">Nodes Status</div>
        ${data.nodes.map(n => `
          <div class="line">
            <span>${n.name}</span>
            <span class="chip ${color(n.status)}">${n.status}</span>
          </div>
        `).join("")}
      </div>

      <div class="card">
        <div class="card-title">Workload Status</div>
        ${data.workloads.map(w => `
          <div class="line">
            <span>${w.name}</span>
            <span class="chip ${color(w.status)}">${w.status}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

let currentNode = null;

function openNodeDetail(name) {
  currentNode = data.nodes.find(n => n.name === name);
  if (!currentNode) return;

  document.getElementById("nodeDetailName").innerText = currentNode.name;
  document.getElementById("nodeDetailPopup").style.display = "flex";

  loadNodeTab("info");
}

function closeNodeDetail() {
  document.getElementById("nodeDetailPopup").style.display = "none";
}


function page_nodes() {
  setTitle("Nodes");

  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Nodes</div>
      <div class="page-subtitle">Danh sách node trong cụm Kubernetes.</div>
    </div>
  </div>

  <div class="table-card">
    <table class="table">
      <thead>
        <tr>
          <th>Tên Node</th>
          <th>Role</th>
          <th>CPU</th>
          <th>RAM</th>
          <th>Trạng thái</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
      ${data.nodes.map(n => `
        <tr>
          <td>${n.name}</td>
          <td>${n.role}</td>
          <td>${n.cpu}</td>
          <td>${n.ram}</td>
          <td><span class="chip ${color(n.status)}">${n.status}</span></td>
          <td><button class="btn" onclick="openNodeDetail('${n.name}')">Chi tiết</button></td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  </div>

  ${renderNodePopup()}
  `;
}

function renderNodePopup() {
  return `
  <div id="nodeDetailPopup" class="popup-backdrop" style="display:none;">
    <div class="popup-box node-popup">
      <div class="popup-header">
        <div class="popup-title">Node Detail: <span id="nodeDetailName"></span></div>
        <button class="btn" onclick="closeNodeDetail()">✕</button>
      </div>

      <div class="node-tabs">
        <button class="node-tab active" data-tab="info" onclick="loadNodeTab('info')">Info</button>
        <button class="node-tab" data-tab="resources" onclick="loadNodeTab('resources')">Resources</button>
        <button class="node-tab" data-tab="pods" onclick="loadNodeTab('pods')">Pods</button>
        <button class="node-tab" data-tab="labels" onclick="loadNodeTab('labels')">Labels</button>
        <button class="node-tab" data-tab="yaml" onclick="loadNodeTab('yaml')">YAML</button>
      </div>

      <div class="node-tab-content" id="nodeTabContent">
        <!-- Nội dung tab sẽ được render bằng JS -->
      </div>
    </div>
  </div>
  `;
}

function loadNodeTab(tab) {
  document.querySelectorAll(".node-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`.node-tab[data-tab="${tab}"]`)?.classList.add("active");

  if (!currentNode) return;

  let html = "";

  switch(tab) {
    case "info":
      html = `
        <div class="info-grid">
          <div><b>Node Name:</b> ${currentNode.name}</div>
          <div><b>Role:</b> ${currentNode.role}</div>
          <div><b>Status:</b> <span class="chip ${color(currentNode.status)}">${currentNode.status}</span></div>
          <div><b>CPU:</b> ${currentNode.cpu}</div>
          <div><b>RAM:</b> ${currentNode.ram}</div>
          <div><b>OS:</b> Ubuntu 22.04</div>
          <div><b>Kubelet:</b> v1.30.0</div>
          <div><b>Container Runtime:</b> containerd</div>
        </div>
      `;
      break;

    case "resources":
      html = `
      <div>
        <div class="resource-bar">
          <span>CPU Usage</span>
          <div class="bar-bg"><div class="bar-fill" style="width:70%;"></div></div>
        </div>

        <div class="resource-bar">
          <span>RAM Usage</span>
          <div class="bar-bg"><div class="bar-fill" style="width:55%;"></div></div>
        </div>
      </div>
      `;
      break;

    case "pods":
      html = `
        <table class="table">
          <thead><tr><th>Pod Name</th><th>Status</th><th>Namespace</th></tr></thead>
          <tbody>
            ${data.workloads.map(w => `
              <tr>
                <td>${w.name}-pod</td>
                <td><span class="chip ${color(w.status)}">${w.status}</span></td>
                <td>${w.ns}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      break;

    case "labels":
      html = `
        <div class="info-grid">
          <div><b>beta.kubernetes.io/os:</b> linux</div>
          <div><b>kubernetes.io/hostname:</b> ${currentNode.name}</div>
          <div><b>node-role.kubernetes.io/${currentNode.role}:</b> true</div>
        </div>
      `;
      break;

    case "yaml":
      html = `
      <pre class="yaml-box">
apiVersion: v1
kind: Node
metadata:
  name: ${currentNode.name}
  labels:
    node-role.kubernetes.io/${currentNode.role}: "true"
status:
  capacity:
    cpu: ${currentNode.cpu}
    memory: ${currentNode.ram}
      </pre>`;
      break;
  }

  document.getElementById("nodeTabContent").innerHTML = html;
}



function page_namespaces() {
  setTitle("Namespaces");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Namespaces</div>
      <div class="page-subtitle">Không gian tên phân tách tài nguyên của hệ thống.</div>
    </div>
  </div>

  <div class="table-card">
    <table class="table">
      <thead><tr><th>Name</th><th>Pods</th><th>CPU</th><th>RAM</th></tr></thead>
      <tbody>
      ${data.namespaces.map(ns => `
        <tr>
          <td>${ns.name}</td>
          <td>${ns.pods}</td>
          <td>${ns.cpu}</td>
          <td>${ns.ram}</td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  </div>`;
}

function page_workloads() {
  setTitle("Workloads");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Workloads</div>
      <div class="page-subtitle">Các deployment / pod ứng dụng đang chạy.</div>
    </div>
  </div>

  <div class="table-card">
    <table class="table">
      <thead><tr><th>Name</th><th>Namespace</th><th>Replicas</th><th>Status</th><th>YAML</th></tr></thead>
      <tbody>
      ${data.workloads.map(w => `
        <tr>
          <td>${w.name}</td>
          <td>${w.ns}</td>
          <td>${w.replicas}</td>
          <td><span class="chip ${color(w.status)}">${w.status}</span></td>
          <td><button class="btn" onclick="showYaml('${w.name}')">View</button></td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  </div>`;
}

function page_services() {
  setTitle("Services");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Services</div>
      <div class="page-subtitle">Các service nội bộ hoặc xuất ra ngoài (ClusterIP/NodePort/...)</div>
    </div>
  </div>

  <div class="table-card">
    <table class="table">
      <thead><tr><th>Name</th><th>Namespace</th><th>Type</th><th>Cluster IP</th><th>Port</th></tr></thead>
      <tbody>
      ${data.services.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.ns}</td>
          <td>${s.type}</td>
          <td>${s.ip}</td>
          <td>${s.port}</td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  </div>`;
}

function page_ingress() {
  setTitle("Ingress");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Ingress</div>
      <div class="page-subtitle">Quy tắc HTTP/HTTPS truy cập từ ngoài vào Kubernetes.</div>
    </div>
  </div>

  <div class="table-card">
    <table class="table">
      <thead><tr><th>Name</th><th>Namespace</th><th>Host</th><th>Service</th><th>TLS</th></tr></thead>
      <tbody>
      ${data.ingress.map(i => `
        <tr>
          <td>${i.name}</td>
          <td>${i.ns}</td>
          <td>${i.host}</td>
          <td>${i.service}</td>
          <td>${i.tls}</td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  </div>`;
}

function page_storage() {
  setTitle("Storage");
  return `
  <div class="page-title-row">
    <div>
      <div class="page-title">Storage</div>
      <div class="page-subtitle">PVC – PersistentVolumeClaim trong cụm.</div>
    </div>
  </div>

  <div class="table-card">
    <table class="table">
      <thead><tr><th>PVC</th><th>Namespace</th><th>Size</th><th>Status</th></tr></thead>
      <tbody>
      ${data.storage.map(s => `
        <tr>
          <td>${s.pvc}</td>
          <td>${s.ns}</td>
          <td>${s.size}</td>
          <td><span class="chip ${color(s.status)}">${s.status}</span></td>
        </tr>
      `).join("")}
      </tbody>
    </table>
  </div>`;
}

// ====================== ROUTER ======================
function loadPage(page, param) {
  const fn = window["page_" + page];
  if (typeof fn === "function") {
    document.getElementById("contentArea").innerHTML = fn(param);
  } else {
    document.getElementById("contentArea").innerHTML = "<div>Page not implemented</div>";
  }
}


// Khi mở file, để nguyên ở màn hình login, không auto load gì
// ====================== DROPDOWN HANDLER ======================
function toggleDropdown(header) {
  const group = header.parentElement;
  const isOpen = group.classList.contains("open");

  document.querySelectorAll(".dropdown-group").forEach(g => g.classList.remove("open"));

  if (!isOpen) {
    group.classList.add("open");
  }
}

function toggleAccordion(el) {
  const acc = el.parentElement;
  acc.classList.toggle("open");
}


// ====================== USERS PAGE ======================
function page_users() {
  setTitle("Users Management");

  const users = [
    { id: 1, username: "admin", role: "ADMIN", apps: 5, created: "2025-01-20" },
    { id: 2, username: "thanh", role: "USER", apps: 2, created: "2025-02-02" },
    { id: 3, username: "nhut", role: "USER", apps: 1, created: "2025-02-11" },
    { id: 4, username: "bao", role: "USER", apps: 4, created: "2025-02-12" }
  ];

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Quản lý người dùng</div>
        <div class="page-subtitle">Admin có thể thêm, sửa, xóa, xem ứng dụng của người dùng.</div>
      </div>
      <button class="btn btn-primary" onclick="alert('Demo: Add user')">+ Add User</button>
    </div>

    <div class="table-card">
      <table class="table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Số App</th>
            <th>Ngày tạo</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${u.username}</td>

              <td>
                <span class="chip ${u.role === 'ADMIN' ? 'green' : 'blue'}">
                  ${u.role}
                </span>
              </td>

              <td>${u.apps}</td>
              <td>${u.created}</td>

              <td>
                <button class="btn" onclick="loadPage('userDetail', ${u.id})">Apps</button>
                <button class="btn" onclick="alert('Edit User: ${u.username}')">Edit</button>
                <button class="btn btn-danger" onclick="confirmDeleteUser('${u.username}')">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


// ====================== APPS PAGE ======================
function page_apps() {
  setTitle("User Applications");

  const apps = [
    { id: 1, name: "car-serv", user: "thanh", ns: "thanh", status: "Running", replicas: "1/1", url: "http://car.ctu.local" },
    { id: 2, name: "shop-fe", user: "bao", ns: "bao", status: "Running", replicas: "2/2", url: "http://shop.ctu.local" },
    { id: 3, name: "billing-api", user: "nhut", ns: "nhut", status: "CrashLoop", replicas: "0/1", url: "-" }
  ];

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Quản lý ứng dụng người dùng</div>
        <div class="page-subtitle">Theo dõi tất cả ứng dụng được triển khai lên cụm Kubernetes.</div>
      </div>
    </div>

    <div class="table-card">
      <table class="table">
        <thead>
          <tr>
            <th>Tên App</th>
            <th>User</th>
            <th>Namespace</th>
            <th>Status</th>
            <th>Replicas</th>
            <th>URL</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${apps.map(a => `
            <tr>
              <td>${a.name}</td>
              <td>${a.user}</td>
              <td>${a.ns}</td>
              <td><span class="chip ${color(a.status)}">${a.status}</span></td>
              <td>${a.replicas}</td>
              <td><a href="${a.url}" target="_blank">${a.url}</a></td>
              <td>
                <button class="btn" onclick="showYaml('${a.name}')">YAML</button>
                <button class="btn" onclick="alert('Restart ${a.name}')">Restart</button>
                <button class="btn" onclick="alert('Delete ${a.name}')">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ====================== REVIEW PAGE ======================
function page_review() {
  setTitle("Duyệt ứng dụng người dùng");

  const requests = [
    { id: 1, user: "thanh", appName: "shop-fe", uploaded: "2025-02-15", status: "Pending", size: "48MB" },
    { id: 2, user: "nhut", appName: "billing-api", uploaded: "2025-02-16", status: "Pending", size: "12MB" }
  ];

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Yêu cầu duyệt ứng dụng</div>
        <div class="page-subtitle">Admin kiểm tra và cho phép triển khai ứng dụng.</div>
      </div>
    </div>

    <div class="table-card">
      <table class="table">
        <thead>
          <tr>
            <th>App</th>
            <th>User</th>
            <th>Ngày upload</th>
            <th>Kích thước</th>
            <th>Trạng thái</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map(r => `
            <tr>
              <td>${r.appName}</td>
              <td>${r.user}</td>
              <td>${r.uploaded}</td>
              <td>${r.size}</td>
              <td><span class="chip yellow">${r.status}</span></td>
              <td>
                <button class="btn" onclick="alert('Xem chi tiết ${r.appName}')">Xem</button>
                <button class="btn btn-primary" onclick="alert('Duyệt ${r.appName}')">Duyệt</button>
                <button class="btn" onclick="alert('Từ chối ${r.appName}')">Từ chối</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ====================== LOGS PAGE ======================
function page_logs() {
  setTitle("Logs");
  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Logs</div>
        <div class="page-subtitle">Logs của hệ thống.</div>
      </div>
    </div>
  `;
}

// ====================== USER DETAIL PAGE ======================
function page_userDetail(userId) {
  setTitle("User Details");

  const user = data.users.find(u => u.id === userId);
  if (!user) return `<div>User not found</div>`;

  const apps = data.userApps[userId] || [];

  return `
    <div class="page-title-row">
      <div>
        <div class="page-title">Thông tin người dùng: ${user.username}</div>
        <div class="page-subtitle">Quản lý ứng dụng triển khai bởi người dùng này.</div>
      </div>
      <button class="btn" onclick="loadPage('users')">← Back</button>
    </div>

    <div class="card">
      <div class="card-title">Thông tin chung</div>
      <p><b>Username:</b> ${user.username}</p>
      <p><b>Role:</b> ${user.role}</p>
      <p><b>Ngày tạo:</b> ${user.created}</p>
    </div>

    <div class="card">
      <div class="card-title">Ứng dụng của ${user.username}</div>
      <div class="table-card">
        <table class="table">
          <thead>
            <tr>
              <th>App</th>
              <th>Namespace</th>
              <th>Status</th>
              <th>Replicas</th>
              <th>URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${apps.map(a => `
              <tr>
                <td>${a.name}</td>
                <td>${a.ns}</td>
                <td><span class="chip ${color(a.status)}">${a.status}</span></td>
                <td>${a.replicas}</td>
                <td>${a.url === "-" ? "-" : `<a href="${a.url}" target="_blank">${a.url}</a>`}</td>
                <td>
                  <button class="btn" onclick="showYaml('${a.name}')">YAML</button>
                  <button class="btn" onclick="alert('Restart ${a.name}')">Restart</button>
                  <button class="btn" onclick="alert('Delete ${a.name}')">Delete</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ====================== K8S SIDEBAR ======================
function renderK8sSidebar() {
  return `
    <div class="sidebar-k8s">
      <div class="sidebar-section-title">KUBERNETES</div>

      <a data-page="k8sOverview" onclick="navClickK8s(event)">Overview</a>
      <a data-page="nodes" onclick="navClickK8s(event)">Nodes</a>
      <a data-page="namespaces" onclick="navClickK8s(event)">Namespaces</a>
      <a data-page="workloads" onclick="navClickK8s(event)">Workloads</a>
      <a data-page="pods" onclick="navClickK8s(event)">Pods</a>
      <a data-page="services" onclick="navClickK8s(event)">Services</a>
      <a data-page="ingress" onclick="navClickK8s(event)">Ingress</a>
      <a data-page="storage" onclick="navClickK8s(event)">Storage</a>
      <a data-page="events" onclick="navClickK8s(event)">Events</a>
    </div>
  `;
}

function navClickK8s(e) {
  e.preventDefault();
  const page = e.currentTarget.dataset.page;
  loadPage(page);

  document.querySelectorAll(".sidebar-k8s a").forEach(a => a.classList.remove("active"));
  e.currentTarget.classList.add("active");
}

function enterK8sView() {
  document.getElementById("sidebar").innerHTML = renderK8sSidebar();
  loadPage("k8sOverview");
}


