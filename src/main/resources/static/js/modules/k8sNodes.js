// Kubernetes Nodes Module
(function () {
    'use strict';

    let nodesData = [];
    let filteredNodesData = [];

    // Helper function để escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Helper function để lấy badge class cho status
    function getStatusClass(status) {
        if (!status) return 'bg-secondary';
        const s = status.toUpperCase();
        if (s === 'READY') return 'bg-success';
        if (s === 'NOTREADY') return 'bg-danger';
        return 'bg-secondary';
    }

    // Helper function để lấy badge class cho role
    function getRoleClass(roles) {
        if (!roles || !Array.isArray(roles) || roles.length === 0) return 'bg-secondary';
        if (roles.includes('master') || roles.includes('control-plane')) return 'bg-primary';
        if (roles.includes('worker')) return 'bg-info text-dark';
        return 'bg-secondary';
    }

    // Helper function để format role
    function formatRole(roles) {
        if (!roles || !Array.isArray(roles) || roles.length === 0) return 'WORKER';
        if (roles.includes('master') || roles.includes('control-plane')) return 'MASTER';
        if (roles.includes('worker')) return 'WORKER';
        return 'WORKER';
    }

    // Load nodes data nhanh từ database
    async function loadQuickNodes() {
        const tbody = document.getElementById('nodes-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Đang tải...</td></tr>';

            // Lấy nodes từ database (nhanh)
            const clusterInfo = await window.ApiClient.get('/admin/cluster/api').catch(() => null);

            if (clusterInfo && clusterInfo.nodes && clusterInfo.nodes.length > 0) {
                // Chuyển đổi từ database format sang format chuẩn
                nodesData = clusterInfo.nodes.map(node => ({
                    name: node.ip || node.host || '-',
                    role: node.role || 'WORKER',
                    status: node.status || 'Unknown',
                    k8sStatus: 'Unknown',
                    k8sRoles: node.role === 'MASTER' ? ['master', 'control-plane'] : ['worker'],
                    k8sCpu: '-',
                    k8sMemory: '-',
                    k8sInternalIP: node.ip || node.host || '-',
                    k8sVersion: '-',
                    fromDatabase: true // Flag để biết đây là data từ database
                }));

                // Render ngay với data từ database
                applyFilters();
            } else {
                nodesData = [];
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có nodes</td></tr>';
            }
        } catch (error) {
            console.error('Error loading quick nodes:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }

    // Load nodes data đầy đủ từ Kubernetes API
    async function loadFullNodes() {
        const tbody = document.getElementById('nodes-tbody');
        if (!tbody || nodesData.length === 0) return;

        try {
            // Hiển thị loading state cho các cột CPU, RAM, Status (chỉ với nodes từ database)
            const rows = tbody.querySelectorAll('tr');
            rows.forEach((row, index) => {
                if (index < filteredNodesData.length) {
                    const node = filteredNodesData[index];
                    if (node && node.fromDatabase) {
                        const cpuCell = row.cells[2]; // CPU column
                        const ramCell = row.cells[3]; // RAM column
                        const diskCell = row.cells[4]; // Disk column
                        const statusCell = row.cells[5]; // Status column
                        if (cpuCell && (!node.k8sCpu || node.k8sCpu === '-')) {
                            cpuCell.innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
                        }
                        if (ramCell && (!node.k8sMemory || node.k8sMemory === '-')) {
                            ramCell.innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
                        }
                        if (diskCell && !node.diskUsage) {
                            diskCell.innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
                        }
                        if (statusCell && (!node.k8sStatus || node.k8sStatus === 'Unknown')) {
                            statusCell.innerHTML = '<span class="spinner-border spinner-border-sm text-muted"></span>';
                        }
                    }
                }
            });

            // Load từ Kubernetes API (có thể chậm)
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
                    // Tìm node K8s theo name hoặc IP
                    let k8sNode = k8sNodesMap.get(dbNode.name);
                    if (!k8sNode && dbNode.k8sInternalIP) {
                        k8sNode = k8sNodesMap.get(dbNode.k8sInternalIP);
                    }

                    if (k8sNode) {
                        // Merge: ưu tiên K8s data nhưng giữ lại các field từ database
                        return {
                            ...dbNode,
                            ...k8sNode,
                            name: k8sNode.name || dbNode.name,
                            fromDatabase: false
                        };
                    }
                    // Nếu không tìm thấy trong K8s, giữ lại data từ database
                    return dbNode;
                });

                // Thêm các nodes mới từ K8s API mà không có trong database
                response.nodes.forEach(k8sNode => {
                    const exists = nodesData.some(n =>
                        n.name === k8sNode.name ||
                        (n.k8sInternalIP && n.k8sInternalIP === k8sNode.k8sInternalIP)
                    );
                    if (!exists) {
                        nodesData.push({
                            ...k8sNode,
                            fromDatabase: false
                        });
                    }
                });

                // Render lại với data đầy đủ
                applyFilters();
            }
        } catch (error) {
            console.error('Error loading full nodes:', error);
            // Không hiển thị lỗi vì đã có data từ database
        }
    }

    // Load nodes data (load nhanh trước, sau đó load đầy đủ)
    async function loadNodes() {
        // Load nhanh từ database trước
        await loadQuickNodes();

        // Sau đó load đầy đủ từ K8s API
        await loadFullNodes();
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
            const nodeRoles = node.k8sRoles || [];
            const isMaster = nodeRoles.includes('master') || nodeRoles.includes('control-plane');
            const isWorker = !isMaster; // Node không phải master thì là worker

            const matchRole = !roleFilter ||
                (roleFilter === 'master' && isMaster) ||
                (roleFilter === 'worker' && isWorker);

            // Status filter
            const matchStatus = !statusFilter ||
                (node.k8sStatus && node.k8sStatus === statusFilter);

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

        tbody.innerHTML = filteredNodesData.map(node => {
            const statusClass = getStatusClass(node.k8sStatus);
            const roleClass = getRoleClass(node.k8sRoles);
            const role = formatRole(node.k8sRoles);

            // Hiển thị usage nếu có, nếu không thì hiển thị capacity
            let cpuDisplay = '-';
            if (node.cpuUsage) {
                cpuDisplay = node.cpuUsage;
            } else if (node.k8sCpu) {
                cpuDisplay = node.k8sCpu;
            }

            let ramDisplay = '-';
            if (node.ramUsage) {
                ramDisplay = node.ramUsage;
            } else if (node.k8sMemory) {
                ramDisplay = node.k8sMemory;
            }

            // Hiển thị Disk usage
            let diskDisplay = '-';
            if (node.diskUsage) {
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

            const status = node.k8sStatus || 'Unknown';

            return `
                <tr>
                    <td><span class="fw-medium">${escapeHtml(node.name || '-')}</span></td>
                    <td><span class="badge ${roleClass} small">${escapeHtml(role)}</span></td>
                    <td><span class="text-muted small ${cpuClass}">${escapeHtml(cpuDisplay)}</span></td>
                    <td><span class="text-muted small ${ramClass}">${escapeHtml(ramDisplay)}</span></td>
                    <td><span class="text-muted small ${diskClass}">${escapeHtml(diskDisplay)}</span></td>
                    <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
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

        // Render Info tab
        if (infoContentEl) {
            const roleClass = getRoleClass(node.k8sRoles);
            const role = formatRole(node.k8sRoles);
            const statusClass = getStatusClass(node.k8sStatus);
            const status = node.k8sStatus || 'Unknown';

            infoContentEl.innerHTML = `
                <table class="table table-sm">
                    <tbody>
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
                            <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
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
            const cpuUsagePercent = node.cpuUsagePercent || 0;
            const ramUsagePercent = node.ramUsagePercent || 0;
            const diskUsagePercent = node.diskUsagePercent || 0;
            
            function getUsageBarClass(percent) {
                if (percent >= 80) return 'bg-danger';
                if (percent >= 60) return 'bg-warning';
                return 'bg-success';
            }
            
            const cpuDisplay = node.cpuUsage || node.k8sCpu || '-';
            const ramDisplay = node.ramUsage || node.k8sMemory || '-';
            const diskDisplay = node.diskUsage || '-';
            
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
                                ${ramUsagePercent > 0 ? ramUsagePercent + '%' : '-'}
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
            podsContentEl.innerHTML = '<p class="text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải pods...</p>';

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
                yamlContentEl.innerHTML = '<p class="text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải YAML...</p>';
                
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

