// Kubernetes Nodes Module
(function () {
    'use strict';

    let nodesData = [];
    let filteredNodesData = [];

    // Helper: Get escapeHtml function
    function getEscapeHtml() {
        return window.K8sHelpers?.escapeHtml || ((text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        });
    }

    // Helper function để lấy badge class cho status
    function getStatusClass(status, isOfflineInCluster = false) {
        if (!status) return 'bg-secondary';
        const s = status.toUpperCase();
        if (s === 'READY') return 'bg-success';
        if (s === 'NOTREADY') return 'bg-danger';
        // Nếu node offline nhưng thuộc cluster (clusterStatus=AVAILABLE), hiển thị warning
        if (s === 'OFFLINE' && isOfflineInCluster) return 'bg-warning text-dark';
        return 'bg-secondary';
    }

    // Helper function để lấy badge class cho role
    function getRoleClass(roles, isUnregistered = false, isNotAssigned = false) {
        // Nếu node chưa được assign vào cụm, hiển thị màu danger
        if (isNotAssigned) return 'bg-danger text-white';
        // Nếu node chưa đăng ký, hiển thị màu warning
        if (isUnregistered) return 'bg-warning text-dark';
        if (!roles || !Array.isArray(roles) || roles.length === 0) return 'bg-secondary';
        if (roles.includes('master') || roles.includes('control-plane')) return 'bg-primary';
        if (roles.includes('worker')) return 'bg-info text-dark';
        return 'bg-secondary';
    }

    // Helper function để format role
    function formatRole(roles, isUnregistered = false, isNotAssigned = false) {
        // Nếu node chưa được assign vào cụm, hiển thị "Chưa assign"
        if (isNotAssigned) return 'Not Assign';
        // Nếu node chưa đăng ký trong K8s cluster, hiển thị "Chưa đăng ký"
        if (isUnregistered) return 'No Join Cluster';
        if (!roles || !Array.isArray(roles) || roles.length === 0) return 'WORKER';
        if (roles.includes('master') || roles.includes('control-plane')) return 'MASTER';
        if (roles.includes('worker')) return 'WORKER';
        return 'WORKER';
    }

    // Load nodes data đầy đủ từ database và Kubernetes API
    async function loadNodes() {
        const tbody = document.getElementById('nodes-tbody');
        if (!tbody) return;

        try {
            // Hiển thị loading state
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Đang tải...</td></tr>';

            // Load nodes từ database trước
            const clusterInfo = await window.ApiClient.get('/admin/cluster/api').catch(() => null);
            
            if (!clusterInfo || !clusterInfo.nodes || clusterInfo.nodes.length === 0) {
                nodesData = [];
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có nodes</td></tr>';
                return;
            }

            // Chuyển đổi từ database format sang format chuẩn
            nodesData = clusterInfo.nodes.map(node => {
                const isOffline = (node.status && node.status.toUpperCase() === 'OFFLINE');
                // Node có clusterStatus=AVAILABLE (vì được trả về từ endpoint này) nhưng status=OFFLINE
                const isOfflineInCluster = isOffline;
                
                return {
                    name: node.ip || node.host || '-',
                    role: node.role || 'WORKER',
                    status: node.status || 'Unknown',
                    k8sStatus: 'Unknown',
                    k8sRoles: node.role === 'MASTER' ? ['master', 'control-plane'] : ['worker'],
                    // Lưu metrics từ database
                    dbCpu: node.cpu || '-',
                    dbRam: node.ram || '-',
                    dbDisk: node.disk || '-',
                    dbRamPercentage: node.ramPercentage || undefined,
                    // K8s metrics (sẽ được cập nhật sau)
                    k8sCpu: '-',
                    k8sMemory: '-',
                    cpuUsage: undefined,
                    ramUsage: undefined,
                    diskUsage: undefined,
                    cpuUsagePercent: undefined,
                    ramUsagePercent: undefined,
                    diskUsagePercent: undefined,
                    k8sInternalIP: node.ip || node.host || '-',
                    k8sVersion: '-',
                    fromDatabase: true, // Flag để biết đây là data từ database
                    isOffline: isOffline, // Flag để biết node đang offline
                    isOfflineInCluster: isOfflineInCluster, // Flag để biết node offline nhưng thuộc cluster
                    isUnregistered: false // Sẽ được cập nhật sau khi check K8s API
                };
            });

            // Load từ Kubernetes API để merge thêm thông tin
            const response = await window.ApiClient.get('/admin/cluster/k8s/nodes').catch(() => null);

            if (response && response.nodes && response.nodes.length > 0) {
                // Merge data từ K8s API với data từ database
                // Tạo Map để tìm node theo name hoặc IP
                const k8sNodesMap = new Map();
                response.nodes.forEach(node => {
                    k8sNodesMap.set(node.name, node);
                    // Cũng thêm vào map theo internal IP để match với database
                    if (node.k8sInternalIP) {
                        k8sNodesMap.set(node.k8sInternalIP, node);
                    }
                });

                // Cập nhật nodesData với thông tin từ K8s API
                nodesData = nodesData.map(dbNode => {
                    // Tìm node K8s theo name hoặc IP (check cả khi offline)
                    let k8sNode = k8sNodesMap.get(dbNode.name);
                    if (!k8sNode && dbNode.k8sInternalIP) {
                        k8sNode = k8sNodesMap.get(dbNode.k8sInternalIP);
                    }

                    if (k8sNode) {
                        // Node có trong K8s cluster
                        if (dbNode.isOffline) {
                            // Node offline nhưng có trong K8s - giữ nguyên offline status
                            return {
                                ...dbNode,
                                ...k8sNode,
                                name: k8sNode.name || dbNode.name,
                                // Giữ lại dữ liệu từ database
                                dbCpu: dbNode.dbCpu,
                                dbRam: dbNode.dbRam,
                                dbDisk: dbNode.dbDisk,
                                dbRamPercentage: dbNode.dbRamPercentage,
                                status: dbNode.status, // Giữ status OFFLINE từ database
                                fromDatabase: false,
                                // Giữ lại flags
                                isOffline: dbNode.isOffline,
                                isOfflineInCluster: dbNode.isOfflineInCluster,
                                isUnregistered: false // Node đã có trong K8s cluster
                            };
                        } else {
                            // Node online và có trong K8s - merge bình thường
                            return {
                                ...dbNode,
                                ...k8sNode,
                                name: k8sNode.name || dbNode.name,
                                // Giữ lại dữ liệu từ database
                                dbCpu: dbNode.dbCpu,
                                dbRam: dbNode.dbRam,
                                dbDisk: dbNode.dbDisk,
                                dbRamPercentage: dbNode.dbRamPercentage,
                                status: dbNode.status, // Giữ status từ database
                                fromDatabase: false,
                                // Giữ lại flags
                                isOffline: dbNode.isOffline,
                                isOfflineInCluster: dbNode.isOfflineInCluster,
                                isUnregistered: false // Node đã có trong K8s cluster
                            };
                        }
                    } else {
                        // Node không có trong K8s cluster
                        if (dbNode.isOffline) {
                            // Node offline và không có trong K8s - hiển thị cả 2 trạng thái
                            return {
                                ...dbNode,
                                isUnregistered: true // Node offline và chưa đăng ký trong K8s cluster
                            };
                        } else {
                            // Node online nhưng không có trong K8s - chưa đăng ký
                            return {
                                ...dbNode,
                                isUnregistered: true // Node có trong DB nhưng chưa đăng ký trong K8s cluster
                            };
                        }
                    }
                });

                // Thêm các nodes mới từ K8s API mà không có trong database (chưa được assign vào cụm)
                response.nodes.forEach(k8sNode => {
                    const exists = nodesData.some(n =>
                        n.name === k8sNode.name ||
                        (n.k8sInternalIP && n.k8sInternalIP === k8sNode.k8sInternalIP)
                    );
                    if (!exists) {
                        // Xác định role từ k8sRoles
                        let role = 'WORKER';
                        if (k8sNode.k8sRoles && Array.isArray(k8sNode.k8sRoles)) {
                            if (k8sNode.k8sRoles.includes('master') || k8sNode.k8sRoles.includes('control-plane')) {
                                role = 'MASTER';
                            }
                        }
                        nodesData.push({
                            ...k8sNode,
                            role: role,
                            fromDatabase: false,
                            isOffline: false,
                            isOfflineInCluster: false,
                            isUnregistered: false,
                            isNotAssigned: true // Node có trong K8s nhưng chưa được assign vào cụm (không có trong DB)
                        });
                    }
                });
            } else {
                // Nếu không có response từ K8s API (có thể master offline), đánh dấu tất cả nodes online là chưa đăng ký
                nodesData = nodesData.map(dbNode => {
                    if (!dbNode.isOffline) {
                        return {
                            ...dbNode,
                            isUnregistered: true // Không thể xác định vì không có K8s API
                        };
                    }
                    return dbNode;
                });
            }

            // Render với data đầy đủ
            applyFilters();
        } catch (error) {
            console.error('Error loading nodes:', error);
            const escapeHtml = getEscapeHtml();
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('nodes-search')?.value.toLowerCase() || '';
        const roleFilter = document.getElementById('nodes-role-filter')?.value || '';
        const statusFilter = document.getElementById('nodes-status-filter')?.value || '';

        filteredNodesData = nodesData.filter(node => {
            // Search filter
            const matchSearch = !searchTerm ||
                (node.name && node.name.toLowerCase().includes(searchTerm)) ||
                (node.k8sInternalIP && node.k8sInternalIP.toLowerCase().includes(searchTerm));

            // Role filter
            let matchRole = true;
            if (roleFilter) {
                // Nếu node chưa được assign vào cụm, chỉ match với filter 'not-assigned'
                if (node.isNotAssigned) {
                    matchRole = roleFilter === 'not-assigned';
                } else if (node.isUnregistered) {
                    // Nếu node chưa đăng ký, chỉ match với filter 'unregistered'
                    matchRole = roleFilter === 'unregistered';
                } else {
                    const nodeRoles = node.k8sRoles || [];
                    const isMaster = nodeRoles.includes('master') || nodeRoles.includes('control-plane');
                    const isWorker = !isMaster; // Node không phải master thì là worker
                    matchRole = (roleFilter === 'master' && isMaster) ||
                                (roleFilter === 'worker' && isWorker);
                }
            }

            // Status filter - sử dụng status từ database hoặc K8s
            const displayStatus = (node.k8sStatus && node.k8sStatus !== 'Unknown') ? node.k8sStatus : (node.status || 'Unknown');
            const matchStatus = !statusFilter || displayStatus === statusFilter;

            return matchSearch && matchRole && matchStatus;
        });

        renderNodes();
    }

    // Render nodes table
    function renderNodes() {
        const tbody = document.getElementById('nodes-tbody');
        if (!tbody) return;

        if (filteredNodesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có nodes</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filteredNodesData.map(node => {
            // Ưu tiên hiển thị status từ database, chỉ dùng k8sStatus khi có giá trị hợp lệ
            // Nhưng nếu node offline, luôn hiển thị OFFLINE
            let displayStatus = (node.k8sStatus && node.k8sStatus !== 'Unknown') ? node.k8sStatus : (node.status || 'Unknown');
            // Nếu node offline trong cluster, hiển thị OFFLINE với cảnh báo
            if (node.isOfflineInCluster) {
                displayStatus = 'OFFLINE';
            }
            const statusClass = getStatusClass(displayStatus, node.isOfflineInCluster);
            const roleClass = getRoleClass(node.k8sRoles, node.isUnregistered, node.isNotAssigned);
            const role = formatRole(node.k8sRoles, node.isUnregistered, node.isNotAssigned);
            
            // Tạo tooltip cho node offline trong cluster
            let statusTooltip = '';
            if (node.isOfflineInCluster) {
                statusTooltip = 'Node thuộc cluster nhưng hiện đang offline - không thể kết nối';
            }

            // Ưu tiên hiển thị metrics từ database, chỉ cập nhật khi có dữ liệu mới từ K8s/metrics
            let cpuDisplay = '-';
            if (node.dbCpu && node.dbCpu !== '-') {
                cpuDisplay = node.dbCpu;
            } else if (node.cpuUsage) {
                cpuDisplay = node.cpuUsage;
            } else if (node.k8sCpu && node.k8sCpu !== '-') {
                cpuDisplay = node.k8sCpu;
            }

            let ramDisplay = '-';
            if (node.dbRam && node.dbRam !== '-') {
                ramDisplay = node.dbRam;
            } else if (node.ramUsage) {
                ramDisplay = node.ramUsage;
            } else if (node.k8sMemory && node.k8sMemory !== '-') {
                ramDisplay = node.k8sMemory;
            }

            // Hiển thị Disk usage - ưu tiên từ database
            let diskDisplay = '-';
            if (node.dbDisk && node.dbDisk !== '-') {
                diskDisplay = node.dbDisk;
            } else if (node.diskUsage) {
                diskDisplay = node.diskUsage;
            }

            // Lấy class màu cho usage percentage
            const cpuUsagePercent = node.cpuUsagePercent || 0;
            const ramUsagePercent = node.ramUsagePercent || 0;
            const diskUsagePercent = node.diskUsagePercent || 0;

            function getUsageClass(percent) {
                if (percent >= 80) return 'text-danger';
                if (percent >= 60) return 'text-warning';
                return 'text-success';
            }

            const cpuClass = node.cpuUsagePercent !== undefined ? getUsageClass(cpuUsagePercent) : '';
            const ramClass = node.ramUsagePercent !== undefined ? getUsageClass(ramUsagePercent) : '';
            const diskClass = node.diskUsagePercent !== undefined ? getUsageClass(diskUsagePercent) : '';

            // Tạo tooltip cho role badge
            let roleTooltip = '';
            if (node.isNotAssigned) {
                roleTooltip = 'Node có trong K8s cluster nhưng chưa được assign vào cụm (chưa có clusterStatus=AVAILABLE trong database)';
            } else if (node.isUnregistered) {
                roleTooltip = 'Node có trong database nhưng chưa join vào cluster (không thấy trong kubectl)';
            }
            
            return `
                <tr>
                    <td><span class="fw-medium">${escapeHtml(node.name || '-')}</span></td>
                    <td>
                        <span class="badge ${roleClass} small" ${roleTooltip ? `title="${escapeHtml(roleTooltip)}"` : ''}>
                            ${escapeHtml(role)}
                        </span>
                    </td>
                    <td><span class="text-muted small ${cpuClass}">${escapeHtml(cpuDisplay)}</span></td>
                    <td><span class="text-muted small ${ramClass}">${escapeHtml(ramDisplay)}</span></td>
                    <td><span class="text-muted small ${diskClass}">${escapeHtml(diskDisplay)}</span></td>
                    <td>
                        <span class="badge ${statusClass}" ${statusTooltip ? `title="${escapeHtml(statusTooltip)}"` : ''}>
                            ${escapeHtml(displayStatus)}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.K8sNodesModule.showNodeDetail('${escapeHtml(node.name || '')}')">
                            Chi tiết
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Show node detail
    async function showNodeDetail(nodeName) {
        const modal = new bootstrap.Modal(document.getElementById('nodeDetailModal'));
        const nameEl = document.getElementById('node-detail-name');
        const infoContentEl = document.getElementById('node-info-content');
        const resourcesContentEl = document.getElementById('node-resources-content');
        const podsContentEl = document.getElementById('node-pods-content');
        const labelsContentEl = document.getElementById('node-labels-content');
        const yamlContentEl = document.getElementById('node-yaml-content');

        if (nameEl) nameEl.textContent = nodeName;

        // Find node data
        const node = nodesData.find(n => n.name === nodeName);
        if (!node) {
            if (infoContentEl) infoContentEl.innerHTML = '<p class="text-danger">Không tìm thấy thông tin node</p>';
            modal.show();
            return;
        }

        // Get escapeHtml function for use throughout this function
        const escapeHtml = getEscapeHtml();

        // Render Info tab
        if (infoContentEl) {
            const roleClass = getRoleClass(node.k8sRoles, node.isUnregistered, node.isNotAssigned);
            const role = formatRole(node.k8sRoles, node.isUnregistered, node.isNotAssigned);
            // Ưu tiên hiển thị status từ database, chỉ dùng k8sStatus khi có giá trị hợp lệ
            // Nhưng nếu node offline, luôn hiển thị OFFLINE
            let displayStatus = (node.k8sStatus && node.k8sStatus !== 'Unknown') ? node.k8sStatus : (node.status || 'Unknown');
            if (node.isOfflineInCluster) {
                displayStatus = 'OFFLINE';
            }
            const statusClass = getStatusClass(displayStatus, node.isOfflineInCluster);

            // Thêm cảnh báo nếu node offline trong cluster
            const offlineWarning = node.isOfflineInCluster ? `
                <tr>
                    <th colspan="2">
                        <div class="alert alert-warning mb-0 py-2">
                            <strong>Cảnh báo:</strong> Node này thuộc cluster (clusterStatus=AVAILABLE) nhưng hiện đang offline (status=OFFLINE). 
                            Không thể kết nối để lấy thông tin chi tiết từ Kubernetes API.
                        </div>
                    </th>
                </tr>
            ` : '';
            
            infoContentEl.innerHTML = `
                <table class="table table-sm">
                    <tbody>
                        ${offlineWarning}
                        <tr>
                            <th style="width: 200px;">Tên Node:</th>
                            <td>${escapeHtml(node.name || '-')}</td>
                        </tr>
                        <tr>
                            <th>Role:</th>
                            <td><span class="badge ${roleClass}">${escapeHtml(role)}</span></td>
                        </tr>
                        <tr>
                            <th>Trạng thái:</th>
                            <td>
                                <span class="badge ${statusClass}">${escapeHtml(displayStatus)}</span>
                            </td>
                        </tr>
                        <tr>
                            <th>Internal IP:</th>
                            <td>${escapeHtml(node.k8sInternalIP || '-')}</td>
                        </tr>
                        <tr>
                            <th>External IP:</th>
                            <td>${escapeHtml(node.k8sExternalIP || '-')}</td>
                        </tr>
                        <tr>
                            <th>Kubernetes Version:</th>
                            <td>${escapeHtml(node.k8sVersion || '-')}</td>
                        </tr>
                        ${node.k8sOsImage ? `
                        <tr>
                            <th>OS Image:</th>
                            <td>${escapeHtml(node.k8sOsImage)}</td>
                        </tr>
                        ` : ''}
                        ${node.k8sContainerRuntime ? `
                        <tr>
                            <th>Container Runtime:</th>
                            <td>${escapeHtml(node.k8sContainerRuntime)}</td>
                        </tr>
                        ` : ''}
                        ${node.k8sKernelVersion ? `
                        <tr>
                            <th>Kernel Version:</th>
                            <td>${escapeHtml(node.k8sKernelVersion)}</td>
                        </tr>
                        ` : ''}
                        ${node.k8sOperatingSystem ? `
                        <tr>
                            <th>Operating System:</th>
                            <td>${escapeHtml(node.k8sOperatingSystem)}</td>
                        </tr>
                        ` : ''}
                        ${node.k8sStatusReason ? `
                        <tr>
                            <th>Status Reason:</th>
                            <td class="text-danger">${escapeHtml(node.k8sStatusReason)}</td>
                        </tr>
                        ` : ''}
                        ${node.k8sStatusMessage ? `
                        <tr>
                            <th>Status Message:</th>
                            <td class="text-danger">${escapeHtml(node.k8sStatusMessage)}</td>
                        </tr>
                        ` : ''}
                    </tbody>
                </table>
            `;
        }

        // Render Resources tab
        if (resourcesContentEl) {
            // Ưu tiên sử dụng percentage từ database hoặc từ metrics mới
            const cpuUsagePercent = node.cpuUsagePercent || 0;
            const ramUsagePercent = node.ramUsagePercent || node.dbRamPercentage || 0;
            const diskUsagePercent = node.diskUsagePercent || 0;
            
            function getUsageBarClass(percent) {
                if (percent >= 80) return 'bg-danger';
                if (percent >= 60) return 'bg-warning';
                return 'bg-success';
            }
            
            // Ưu tiên hiển thị metrics từ database, chỉ cập nhật khi có dữ liệu mới từ K8s/metrics
            const cpuDisplay = (node.dbCpu && node.dbCpu !== '-') ? node.dbCpu : 
                              (node.cpuUsage ? node.cpuUsage : 
                              (node.k8sCpu && node.k8sCpu !== '-' ? node.k8sCpu : '-'));
            const ramDisplay = (node.dbRam && node.dbRam !== '-') ? node.dbRam : 
                              (node.ramUsage ? node.ramUsage : 
                              (node.k8sMemory && node.k8sMemory !== '-' ? node.k8sMemory : '-'));
            const diskDisplay = (node.dbDisk && node.dbDisk !== '-') ? node.dbDisk : 
                               (node.diskUsage ? node.diskUsage : '-');
            
            // Tính toán phần trăm CPU để hiển thị (có thể > 100%)
            let cpuPercentDisplay = '-';
            if (cpuUsagePercent > 0) {
                cpuPercentDisplay = cpuUsagePercent.toFixed(1) + '%';
            } else if (cpuDisplay && cpuDisplay !== '-') {
                // Nếu chưa có cpuUsagePercent, tính từ cpuDisplay string "cores / load"
                try {
                    const parts = cpuDisplay.split(' / ');
                    if (parts.length === 2) {
                        const coresStr = parts[0].replace(' cores', '').trim();
                        const loadStr = parts[1].replace(' load', '').trim();
                        const cores = parseFloat(coresStr);
                        const load = parseFloat(loadStr);
                        if (cores > 0 && !isNaN(load)) {
                            const calculatedPercent = Math.min(200, (load / cores) * 100); // Giới hạn 200% để hiển thị
                            cpuPercentDisplay = calculatedPercent.toFixed(1) + '%';
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }
            
            resourcesContentEl.innerHTML = `
                <div class="d-flex flex-column gap-3">
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="fw-medium">CPU Usage</span>
                            <span class="text-muted small">${escapeHtml(cpuDisplay)}</span>
                        </div>
                        <div class="progress" style="height: 24px;">
                            <div class="progress-bar ${getUsageBarClass(cpuUsagePercent)}" 
                                 role="progressbar" 
                                 style="width: ${Math.min(100, cpuUsagePercent)}%" 
                                 aria-valuenow="${cpuUsagePercent}" 
                                 aria-valuemin="0" 
                                 aria-valuemax="100">
                                ${cpuPercentDisplay}
                            </div>
                        </div>
                        ${cpuUsagePercent > 100 ? `<small class="text-danger">⚠️ CPU usage vượt quá 100%</small>` : ''}
                    </div>
                    
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="fw-medium">RAM Usage</span>
                            <span class="text-muted small">${escapeHtml(ramDisplay)}</span>
                        </div>
                        <div class="progress" style="height: 24px;">
                            <div class="progress-bar ${getUsageBarClass(ramUsagePercent)}" 
                                 role="progressbar" 
                                 style="width: ${Math.min(100, ramUsagePercent)}%" 
                                 aria-valuenow="${ramUsagePercent}" 
                                 aria-valuemin="0" 
                                 aria-valuemax="100">
                                ${ramUsagePercent > 0 ? ramUsagePercent + '%' : (node.dbRamPercentage !== undefined ? node.dbRamPercentage + '%' : '-')}
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="fw-medium">Disk Usage</span>
                            <span class="text-muted small">${escapeHtml(diskDisplay)}</span>
                        </div>
                        <div class="progress" style="height: 24px;">
                            <div class="progress-bar ${getUsageBarClass(diskUsagePercent)}" 
                                 role="progressbar" 
                                 style="width: ${Math.min(100, diskUsagePercent)}%" 
                                 aria-valuenow="${diskUsagePercent}" 
                                 aria-valuemin="0" 
                                 aria-valuemax="100">
                                ${diskUsagePercent > 0 ? diskUsagePercent.toFixed(1) + '%' : '-'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Render Pods tab - load pods on this node
        if (podsContentEl) {
            podsContentEl.innerHTML = '<p class="text-muted">Đang tải pods...</p>';

            try {
                const response = await window.ApiClient.get(`/admin/cluster/k8s/pods?node=${encodeURIComponent(nodeName)}`).catch(() => null);
                if (response && response.pods && response.pods.length > 0) {
                    const pods = response.pods;
                    podsContentEl.innerHTML = `
                        <table class="table table-sm table-hover">
                            <thead>
                                <tr>
                                    <th>Tên Pod</th>
                                    <th>Namespace</th>
                                    <th>Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pods.map(pod => {
                        const podStatus = pod.status || 'Unknown';
                        const statusClass = podStatus === 'Running' ? 'bg-success' :
                            podStatus === 'Pending' ? 'bg-warning text-dark' :
                                podStatus === 'Failed' || podStatus === 'Error' ? 'bg-danger' : 'bg-secondary';
                        return `
                                        <tr>
                                            <td>${escapeHtml(pod.name || '-')}</td>
                                            <td>${escapeHtml(pod.namespace || '-')}</td>
                                            <td><span class="badge ${statusClass}">${escapeHtml(podStatus)}</span></td>
                                        </tr>
                                    `;
                    }).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    podsContentEl.innerHTML = '<p class="text-muted">Không có pods nào trên node này</p>';
                }
            } catch (error) {
                podsContentEl.innerHTML = `<p class="text-danger">Lỗi khi tải pods: ${escapeHtml(error.message || 'Unknown error')}</p>`;
            }
        }

        // Render Labels tab - show all labels (k8sLabels)
        if (labelsContentEl) {
            const labels = node.k8sLabels || {};
            if (Object.keys(labels).length === 0) {
                labelsContentEl.innerHTML = '<p class="text-muted">Không có labels</p>';
            } else {
                labelsContentEl.innerHTML = `
                    <div class="d-flex flex-column gap-2">
                        ${Object.entries(labels).map(([key, value]) => `
                            <div>
                                <code>${escapeHtml(key)}: ${escapeHtml(value)}</code>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }

        // Render YAML tab - lazy load YAML từ backend khi tab được click
        if (yamlContentEl) {
            // Reset loaded state khi mở modal mới
            yamlContentEl.dataset.loaded = 'false';
            yamlContentEl.dataset.nodeName = nodeName;
            
            // Hiển thị placeholder - sẽ load khi tab được click
            yamlContentEl.innerHTML = '<p class="text-muted">Nhấp vào tab YAML để tải nội dung...</p>';
            
            // Load YAML function
            const loadYaml = async () => {
                const currentNodeName = yamlContentEl.dataset.nodeName;
                
                // Kiểm tra nếu đã load cho node này
                if (yamlContentEl.dataset.loaded === 'true' && yamlContentEl.dataset.nodeName === currentNodeName) {
                    return; // Đã load rồi, không load lại
                }
                
                // Hiển thị loading state
                yamlContentEl.innerHTML = '<p class="text-muted">Đang tải YAML...</p>';
                
                // Fetch YAML từ backend
                try {
                    const response = await fetch(`/admin/cluster/k8s/nodes/${encodeURIComponent(currentNodeName || nodeName)}?format=yaml`);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const data = await response.json();
                    const yamlOutput = data.output || '';
                    
                    // Hiển thị YAML từ backend
                    yamlContentEl.innerHTML = `
                        <pre class="bg-light p-3 rounded" style="max-height: 500px; overflow: auto; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word;"><code>${escapeHtml(yamlOutput)}</code></pre>
                    `;
                    yamlContentEl.dataset.loaded = 'true';
                } catch (error) {
                    yamlContentEl.innerHTML = `<p class="text-danger">Lỗi khi tải YAML: ${escapeHtml(error.message || 'Unknown error')}</p>`;
                }
            };
            
            // Lắng nghe sự kiện khi tab YAML được click
            const yamlTab = document.getElementById('node-yaml-tab');
            if (yamlTab) {
                // Remove existing listener nếu có
                const existingHandler = yamlTab._yamlTabHandler;
                if (existingHandler) {
                    yamlTab.removeEventListener('shown.bs.tab', existingHandler);
                }
                
                // Add new listener
                const yamlTabHandler = () => {
                    loadYaml();
                };
                yamlTab.addEventListener('shown.bs.tab', yamlTabHandler);
                yamlTab._yamlTabHandler = yamlTabHandler; // Lưu reference để có thể remove sau
            }
        }

        modal.show();
    }

    // Initialize module
    function init() {
        // Bind reload button
        const reloadBtn = document.getElementById('nodes-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadNodes();
            });
        }

        // Bind filter inputs
        const searchInput = document.getElementById('nodes-search');
        const roleFilter = document.getElementById('nodes-role-filter');
        const statusFilter = document.getElementById('nodes-status-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyFilters();
            });
        }

        if (roleFilter) {
            roleFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        // Initial load
        loadNodes();
    }

    // Auto-init on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external access
    window.K8sNodesModule = {
        loadNodes,
        showNodeDetail
    };
})();


