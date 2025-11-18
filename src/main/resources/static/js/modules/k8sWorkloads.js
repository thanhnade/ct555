// Kubernetes Workloads Module
(function () {
    'use strict';

    // Storage keys for persisting data across page reloads
    const STORAGE_KEY = 'k8s-workloads-data';
    const STORAGE_LOADED_KEY = 'k8s-workloads-loaded-tabs';
    
    // Load data from sessionStorage or initialize empty
    function loadFromStorage() {
        try {
            const storedData = sessionStorage.getItem(STORAGE_KEY);
            const storedLoaded = sessionStorage.getItem(STORAGE_LOADED_KEY);
            
            if (storedData) {
                workloadsData = JSON.parse(storedData);
            } else {
                workloadsData = {
                    deployments: [],
                    statefulSets: [],
                    daemonSets: []
                };
            }
            
            if (storedLoaded) {
                loadedTabs = JSON.parse(storedLoaded);
            } else {
                loadedTabs = {
                    deployments: false,
                    statefulsets: false,
                    daemonsets: false
                };
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
            workloadsData = {
                deployments: [],
                statefulSets: [],
                daemonSets: []
            };
            loadedTabs = {
                deployments: false,
                statefulsets: false,
                daemonsets: false
            };
        }
    }
    
    // Save data to sessionStorage
    function saveToStorage() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workloadsData));
            sessionStorage.setItem(STORAGE_LOADED_KEY, JSON.stringify(loadedTabs));
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }
    
    let workloadsData = {
        deployments: [],
        statefulSets: [],
        daemonSets: []
    };
    let filteredData = {
        deployments: [],
        statefulSets: [],
        daemonSets: []
    };
    
    // Track which tabs have been loaded
    let loadedTabs = {
        deployments: false,
        statefulsets: false,
        daemonsets: false
    };
    
    // Load from storage on module initialization
    loadFromStorage();

    // Helper functions từ k8sHelpers
    function escapeHtml(text) {
        return window.K8sHelpers ? window.K8sHelpers.escapeHtml(text) : (text || '');
    }

    function isSystemNamespace(name) {
        return window.K8sHelpers ? window.K8sHelpers.isSystemNamespace(name) : false;
    }

    function canScaleWorkloadType(type) {
        return window.K8sHelpers ? window.K8sHelpers.canScaleWorkloadType(type) : false;
    }

    function showK8sOutput(title, output) {
        if (window.K8sHelpers && window.K8sHelpers.showK8sOutput) {
            window.K8sHelpers.showK8sOutput(title, output);
        } else {
            alert(`${title}\n\n${output}`);
        }
    }

    // Helper function để lấy status class
    function getStatusClass(ready, desired) {
        if (ready === desired && ready > 0) return 'bg-success';
        if (ready > 0) return 'bg-warning text-dark';
        return 'bg-danger';
    }

    // Load workloads data - load cả 3 loại (dùng cho reload button)
    async function loadWorkloads() {
        const deploymentsTbody = document.getElementById('deployments-tbody');
        const statefulSetsTbody = document.getElementById('statefulsets-tbody');
        const daemonSetsTbody = document.getElementById('daemonsets-tbody');

        try {
            // Hiển thị loading state với spinner cho cả 3 tabs
            showLoadingState();

            // Fetch workloads từ backend - luôn lấy cả 3 loại (deployments, statefulSets, daemonSets)
            const response = await window.ApiClient.get('/admin/cluster/k8s/workloads').catch(() => null);

            // Luôn xử lý dữ liệu, kể cả khi một số loại thiếu hoặc rỗng
            if (response) {
                workloadsData = {
                    deployments: response.deployments || [],
                    statefulSets: response.statefulSets || [],
                    daemonSets: response.daemonSets || []
                };
            } else {
                // Nếu response null, khởi tạo mảng rỗng
                workloadsData = {
                    deployments: [],
                    statefulSets: [],
                    daemonSets: []
                };
            }

            // Đánh dấu tất cả tabs đã được load
            loadedTabs.deployments = true;
            loadedTabs.statefulsets = true;
            loadedTabs.daemonsets = true;

            // Lưu vào sessionStorage
            saveToStorage();

            // Update counts
            updateCounts();

            // Apply filters và render
            applyFilters();
        } catch (error) {
            console.error('Error loading workloads:', error);
            if (deploymentsTbody) {
                deploymentsTbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
            }
            if (statefulSetsTbody) {
                statefulSetsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
            }
            if (daemonSetsTbody) {
                daemonSetsTbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
            }
        }
    }
    
    // Load data cho một tab cụ thể (chỉ load nếu chưa có dữ liệu)
    async function loadTabData(tabName) {
        // Nếu tab đã được load rồi, không load lại (giữ dữ liệu cũ)
        if (loadedTabs[tabName]) {
            return;
        }
        
        const tbody = document.getElementById(`${tabName}-tbody`);
        if (!tbody) return;
        
        try {
            // Hiển thị loading state chỉ cho tab này
            if (tabName === 'deployments') {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
            } else if (tabName === 'statefulsets') {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
            } else if (tabName === 'daemonsets') {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
            }
            
            // Fetch workloads từ backend (luôn trả về cả 3 loại)
            const response = await window.ApiClient.get('/admin/cluster/k8s/workloads').catch(() => null);
            
            if (response) {
                // Chỉ cập nhật dữ liệu của tab này, giữ nguyên các tab khác
                if (tabName === 'deployments') {
                    workloadsData.deployments = response.deployments || [];
                } else if (tabName === 'statefulsets') {
                    workloadsData.statefulSets = response.statefulSets || [];
                } else if (tabName === 'daemonsets') {
                    workloadsData.daemonSets = response.daemonSets || [];
                }
                
                // Đánh dấu tab đã được load
                loadedTabs[tabName] = true;
                
                // Lưu vào sessionStorage
                saveToStorage();
                
                // Update counts và render
                updateCounts();
                applyFilters();
            } else {
                // Nếu không có response, đánh dấu là đã load (với dữ liệu rỗng)
                loadedTabs[tabName] = true;
                saveToStorage();
                renderWorkloads();
            }
        } catch (error) {
            console.error(`Error loading ${tabName}:`, error);
            if (tabName === 'deployments') {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
            } else if (tabName === 'statefulsets') {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
            } else if (tabName === 'daemonsets') {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
            }
        }
    }

    // Update counts
    function updateCounts() {
        const deploymentsCount = document.getElementById('deployments-count');
        const statefulSetsCount = document.getElementById('statefulsets-count');
        const daemonSetsCount = document.getElementById('daemonsets-count');

        if (deploymentsCount) {
            deploymentsCount.textContent = filteredData.deployments.length || workloadsData.deployments.length || 0;
        }
        if (statefulSetsCount) {
            statefulSetsCount.textContent = filteredData.statefulSets.length || workloadsData.statefulSets.length || 0;
        }
        if (daemonSetsCount) {
            daemonSetsCount.textContent = filteredData.daemonSets.length || workloadsData.daemonSets.length || 0;
        }
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('workloads-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('workloads-type-filter')?.value || '';
        const namespaceFilter = document.getElementById('workloads-namespace-filter')?.value || '';

        // Filter deployments
        filteredData.deployments = workloadsData.deployments.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm));
            const matchType = !typeFilter || typeFilter === 'deployment';
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            return matchSearch && matchType && matchNamespace;
        });

        // Filter statefulSets
        filteredData.statefulSets = workloadsData.statefulSets.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm));
            const matchType = !typeFilter || typeFilter === 'statefulset';
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            return matchSearch && matchType && matchNamespace;
        });

        // Filter daemonSets
        filteredData.daemonSets = workloadsData.daemonSets.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm));
            const matchType = !typeFilter || typeFilter === 'daemonset';
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            return matchSearch && matchType && matchNamespace;
        });

        // Update counts
        updateCounts();

        // Render
        renderWorkloads();

        // Update namespace filter options
        updateNamespaceFilter();
    }

    // Update namespace filter options
    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('workloads-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        workloadsData.deployments.forEach(item => namespaces.add(item.namespace));
        workloadsData.statefulSets.forEach(item => namespaces.add(item.namespace));
        workloadsData.daemonSets.forEach(item => namespaces.add(item.namespace));

        const currentValue = namespaceFilter.value;
        namespaceFilter.innerHTML = '<option value="">Tất cả namespace</option>';
        Array.from(namespaces).sort().forEach(ns => {
            const option = document.createElement('option');
            option.value = ns;
            option.textContent = ns;
            namespaceFilter.appendChild(option);
        });
        namespaceFilter.value = currentValue;
    }

    // Render workloads
    function renderWorkloads() {
        renderDeployments();
        renderStatefulSets();
        renderDaemonSets();
    }

    // Render Deployments
    function renderDeployments() {
        const tbody = document.getElementById('deployments-tbody');
        if (!tbody) return;

        if (filteredData.deployments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có deployments</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.deployments.map(item => {
            const ready = item.ready || 0;
            const desired = item.desired || item.replicas || 0;
            const statusClass = getStatusClass(ready, desired);
            const available = item.available || ready; // Fallback to ready if available not present
            const upToDate = item.updated || ready; // Up-to-date replicas

            const isSystem = isSystemNamespace(item.namespace);
            const canScale = canScaleWorkloadType('deployment');
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `<tr>
                <td><code>${escapeHtml(namespace)}</code></td>
                <td><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td><span class="badge ${statusClass}">${ready}/${desired}</span></td>
                <td>${upToDate}</td>
                <td>${available}</td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${canScale && !isSystem ? `<button class="btn btn-sm btn-outline-warning" onclick="window.K8sWorkloadsModule.scaleWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Scale">
                            <i class="bi bi-arrows-angle-expand"></i>
                        </button>` : ''}
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Render StatefulSets
    function renderStatefulSets() {
        const tbody = document.getElementById('statefulsets-tbody');
        if (!tbody) return;

        if (filteredData.statefulSets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có statefulsets</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.statefulSets.map(item => {
            const ready = item.ready || 0;
            const desired = item.desired || item.replicas || 0;
            const statusClass = getStatusClass(ready, desired);

            const isSystem = isSystemNamespace(item.namespace);
            const canScale = canScaleWorkloadType('statefulset');
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `<tr>
                <td><code>${escapeHtml(namespace)}</code></td>
                <td><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td><span class="badge ${statusClass}">${ready}/${desired}</span></td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('statefulset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${canScale && !isSystem ? `<button class="btn btn-sm btn-outline-warning" onclick="window.K8sWorkloadsModule.scaleWorkload('statefulset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Scale">
                            <i class="bi bi-arrows-angle-expand"></i>
                        </button>` : ''}
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('statefulset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Render DaemonSets
    function renderDaemonSets() {
        const tbody = document.getElementById('daemonsets-tbody');
        if (!tbody) return;

        if (filteredData.daemonSets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Không có daemonsets</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.daemonSets.map(item => {
            const ready = item.ready || 0;
            const desired = item.desired || 0;
            const current = item.current || ready;
            const updated = item.updated || ready;
            const available = item.available || ready;
            const statusClass = getStatusClass(ready, desired);

            const isSystem = isSystemNamespace(item.namespace);
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `<tr>
                <td><code>${escapeHtml(namespace)}</code></td>
                <td><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td>${desired}</td>
                <td>${current}</td>
                <td><span class="badge ${statusClass}">${ready}</span></td>
                <td>${updated}</td>
                <td>${available}</td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('daemonset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('daemonset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Activate tab by name and sync with sidebar
    function activateTab(tabName, updateUrl = true) {
        const tabButton = document.getElementById(`${tabName}-tab`);
        const tabPane = document.getElementById(`${tabName}`);
        
        if (tabButton && tabPane) {
            // Remove active from all tabs
            document.querySelectorAll('#workloads-tabs .nav-link').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('#workloads-tab-content .tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
            });
            
            // Activate selected tab
            tabButton.classList.add('active');
            tabPane.classList.add('show', 'active');
            
            // Cập nhật URL và đồng bộ sidebar nếu cần
            if (updateUrl) {
                const basePath = '/admin/kubernetes/workloads';
                let newPath = basePath;
                
                if (tabName === 'deployments') {
                    newPath = basePath + '/deployments';
                } else if (tabName === 'statefulsets') {
                    newPath = basePath + '/statefulsets';
                } else if (tabName === 'daemonsets') {
                    newPath = basePath + '/daemonsets';
                }
                
                // Cập nhật URL mà không reload trang
                if (window.history && window.history.pushState) {
                    window.history.pushState({ tab: tabName }, '', newPath);
                }
                
                // Đồng bộ sidebar - tìm và highlight link tương ứng
                syncSidebarForTab(tabName);
            }
        }
    }
    
    // Đồng bộ sidebar khi tab được chọn
    function syncSidebarForTab(tabName) {
        // Tìm link tương ứng trong sidebar
        let targetHref = '/admin/kubernetes/workloads';
        
        if (tabName === 'deployments') {
            targetHref = '/admin/kubernetes/workloads/deployments';
        } else if (tabName === 'statefulsets') {
            targetHref = '/admin/kubernetes/workloads/statefulsets';
        } else if (tabName === 'daemonsets') {
            targetHref = '/admin/kubernetes/workloads/daemonsets';
        }
        
        // Tìm link trong sidebar có href khớp
        const sidebarLinks = document.querySelectorAll('.sidebar a');
        for (const link of sidebarLinks) {
            const href = link.getAttribute('href');
            if (href && (href === targetHref || href.endsWith(targetHref))) {
                // Gọi setActiveNav để highlight và mở dropdown
                if (typeof setActiveNav === 'function') {
                    setActiveNav(link);
                } else {
                    // Fallback: tự xử lý nếu setActiveNav không có
                    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
                    link.classList.add('active');
                    
                    // Mở parent dropdowns
                    let parent = link.parentElement;
                    while (parent) {
                        if (parent.classList.contains('dropdown-group') || parent.classList.contains('dropdown-subgroup')) {
                            parent.classList.add('open');
                        }
                        parent = parent.parentElement;
                    }
                }
                break;
            }
        }
    }

    // Describe workload
    async function describeWorkload(type, namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            showK8sOutput(`${type} ${namespace}/${name}`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin workload');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin workload'));
            }
        }
    }

    // Delete workload
    async function deleteWorkload(type, namespace, name) {
        if (isSystemNamespace(namespace)) {
            if (window.showAlert) {
                window.showAlert('warning', 'Không cho phép xóa trong namespace hệ thống');
            } else {
                alert('Không cho phép xóa trong namespace hệ thống');
            }
            return;
        }
        if (!confirm(`Xóa ${type} ${namespace}/${name}?`)) return;

        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            const defaultOutput = type === 'deployment' ? `deployment.apps "${name}" deleted` :
                                  type === 'statefulset' ? `statefulset.apps "${name}" deleted` :
                                  type === 'daemonset' ? `daemonset.apps "${name}" deleted` : `${type} "${name}" deleted`;
            if (window.showAlert) {
                window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || defaultOutput)}</pre>`);
            }
            await loadWorkloads();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi xóa workload');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi xóa workload'));
            }
        }
    }

    // Scale workload
    async function scaleWorkload(type, namespace, name) {
        if (!canScaleWorkloadType(type) || isSystemNamespace(namespace)) {
            if (window.showAlert) {
                window.showAlert('warning', 'Chỉ hỗ trợ scale Deployment/StatefulSet ngoài namespace hệ thống');
            } else {
                alert('Chỉ hỗ trợ scale Deployment/StatefulSet ngoài namespace hệ thống');
            }
            return;
        }

        // Hiển thị modal scale
        const modalEl = document.getElementById('scale-workload-modal');
        if (!modalEl) {
            // Fallback: dùng prompt nếu modal không tồn tại
            const replicas = prompt(`Số replicas mới cho ${type} ${namespace}/${name}:`);
            if (replicas === null) return;
            const replicasNum = Number(replicas);
            if (!Number.isFinite(replicasNum) || replicasNum < 0) {
                if (window.showAlert) {
                    window.showAlert('error', 'Giá trị replicas không hợp lệ');
                }
                return;
            }
            await performScale(type, namespace, name, replicasNum);
            return;
        }

        // Cập nhật thông tin trong modal
        document.getElementById('scale-workload-name').textContent = `${namespace}/${name}`;
        document.getElementById('scale-workload-type').textContent = type;
        document.getElementById('scale-workload-namespace').textContent = namespace;
        const replicasInput = document.getElementById('scale-replicas-input');
        if (replicasInput) {
            replicasInput.value = '1';
            replicasInput.focus();
        }

        // Xóa event listener cũ (nếu có) và thêm mới
        const confirmBtn = document.getElementById('scale-workload-confirm-btn');
        if (confirmBtn) {
            // Clone và replace để xóa event listeners cũ
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            
            newConfirmBtn.addEventListener('click', async () => {
                const replicas = replicasInput.value;
                const replicasNum = Number(replicas);
                if (!Number.isFinite(replicasNum) || replicasNum < 0) {
                    if (window.showAlert) {
                        window.showAlert('error', 'Giá trị replicas không hợp lệ. Vui lòng nhập số >= 0');
                    }
                    return;
                }

                // Disable button trong khi xử lý
                newConfirmBtn.disabled = true;
                newConfirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xử lý...';

                try {
                    await performScale(type, namespace, name, replicasNum);
                    // Đóng modal
                    if (window.Modal) {
                        window.Modal.hide('scale-workload-modal');
                    } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                        const modal = bootstrap.Modal.getInstance(modalEl);
                        if (modal) modal.hide();
                    }
                } catch (error) {
                    // Error đã được xử lý trong performScale
                } finally {
                    newConfirmBtn.disabled = false;
                    newConfirmBtn.innerHTML = '✅ Xác nhận Scale';
                }
            });
        }

        // Hiển thị modal
        if (window.Modal) {
            window.Modal.show('scale-workload-modal');
        } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
                backdrop: true,
                keyboard: true,
                focus: true
            });
            modal.show();
        }
    }

    // Hàm thực hiện scale
    async function performScale(type, namespace, name, replicasNum) {
        try {
            const data = await window.ApiClient.post(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, {
                replicas: replicasNum
            });
            if (window.showAlert) {
                window.showAlert('success', `Đã scale ${type} ${namespace}/${name} → ${replicasNum} replicas`);
            }
            await loadWorkloads();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi scale workload');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi scale workload'));
            }
            throw error;
        }
    }

    // Show loading state for all tabs
    function showLoadingState() {
        const deploymentsTbody = document.getElementById('deployments-tbody');
        const statefulSetsTbody = document.getElementById('statefulsets-tbody');
        const daemonSetsTbody = document.getElementById('daemonsets-tbody');
        
        if (deploymentsTbody) {
            deploymentsTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
        }
        if (statefulSetsTbody) {
            statefulSetsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
        }
        if (daemonSetsTbody) {
            daemonSetsTbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
        }
    }

    // Initialize module
    // Logic này áp dụng cho cả việc vào trang từ sidebar link và từ tab navigation
    // - Khi click sidebar link (Deployments/StatefulSets/DaemonSets): trang reload → init() → khôi phục dữ liệu đã lưu → chỉ load tab đó nếu chưa có
    // - Khi click tab trong trang: chỉ load tab đó (nếu chưa có dữ liệu), giữ dữ liệu các tab khác
    function init() {
        // Khôi phục dữ liệu từ sessionStorage (giữ dữ liệu các tab đã load trước đó)
        loadFromStorage();
        
        // Xác định tab mặc định dựa trên URL (áp dụng cho cả sidebar link và direct URL)
        const urlPath = window.location.pathname;
        let defaultTab = 'deployments';
        
        if (urlPath.includes('/deployments')) {
            defaultTab = 'deployments';
        } else if (urlPath.includes('/statefulsets')) {
            defaultTab = 'statefulsets';
        } else if (urlPath.includes('/daemonsets')) {
            defaultTab = 'daemonsets';
        }
        
        // Render dữ liệu đã có cho các tab đã load trước đó (nếu có)
        // Điều này đảm bảo khi reload trang, dữ liệu của các tab khác vẫn hiển thị
        // Chỉ render nếu có ít nhất một tab đã có dữ liệu
        const hasLoadedData = (loadedTabs.deployments && workloadsData.deployments.length > 0) ||
                              (loadedTabs.statefulsets && workloadsData.statefulSets.length > 0) ||
                              (loadedTabs.daemonsets && workloadsData.daemonSets.length > 0);
        
        if (hasLoadedData) {
            // Update counts và render tất cả dữ liệu đã có
            updateCounts();
            applyFilters();
        }
        
        // Hiển thị loading state cho tab mặc định chỉ nếu chưa có dữ liệu
        if (!loadedTabs[defaultTab]) {
            const defaultTbody = document.getElementById(`${defaultTab}-tbody`);
            if (defaultTbody) {
                if (defaultTab === 'deployments') {
                    defaultTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
                } else if (defaultTab === 'statefulsets') {
                    defaultTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
                } else if (defaultTab === 'daemonsets') {
                    defaultTbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
                }
            }
        }
        
        // Kích hoạt tab mặc định ngay (không cập nhật URL vì đã đúng từ sidebar hoặc direct link)
        activateTab(defaultTab, false);
        // Đồng bộ sidebar với tab mặc định
        syncSidebarForTab(defaultTab);
        
        // Load dữ liệu cho tab mặc định (chỉ load nếu chưa có dữ liệu)
        // Nếu đã có dữ liệu từ sessionStorage, sẽ không load lại
        loadTabData(defaultTab);
        
        // Bind reload button
        const reloadBtn = document.getElementById('workloads-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                // Reset loaded flags để load lại tất cả
                loadedTabs.deployments = false;
                loadedTabs.statefulsets = false;
                loadedTabs.daemonsets = false;
                
                // Xóa dữ liệu cũ trong sessionStorage
                try {
                    sessionStorage.removeItem(STORAGE_KEY);
                    sessionStorage.removeItem(STORAGE_LOADED_KEY);
                } catch (error) {
                    console.error('Error clearing storage:', error);
                }
                
                // Load lại cả 3 loại khi reload
                loadWorkloads();
            });
        }

        // Bind filter inputs
        const searchInput = document.getElementById('workloads-search');
        const typeFilter = document.getElementById('workloads-type-filter');
        const namespaceFilter = document.getElementById('workloads-namespace-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyFilters();
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        if (namespaceFilter) {
            namespaceFilter.addEventListener('change', () => {
                applyFilters();
            });
        }
        
        // Lắng nghe sự kiện khi tab được click (Bootstrap tab event)
        // Logic này áp dụng khi user click vào tab trong trang (không phải từ sidebar)
        // - Chỉ load dữ liệu của tab được click (nếu chưa có)
        // - Giữ nguyên dữ liệu của các tab khác
        const tabButtons = document.querySelectorAll('#workloads-tabs .nav-link');
        tabButtons.forEach(button => {
            button.addEventListener('shown.bs.tab', (event) => {
                // Bootstrap đã kích hoạt tab rồi
                const targetId = event.target.getAttribute('data-bs-target');
                if (targetId) {
                    const tabName = targetId.replace('#', '');
                    
                    // Load dữ liệu cho tab này (chỉ load nếu chưa có dữ liệu)
                    // Giữ nguyên dữ liệu của các tab khác
                    loadTabData(tabName);
                    
                    // Cập nhật URL
                    const basePath = '/admin/kubernetes/workloads';
                    let newPath = basePath;
                    
                    if (tabName === 'deployments') {
                        newPath = basePath + '/deployments';
                    } else if (tabName === 'statefulsets') {
                        newPath = basePath + '/statefulsets';
                    } else if (tabName === 'daemonsets') {
                        newPath = basePath + '/daemonsets';
                    }
                    
                    // Cập nhật URL mà không reload trang
                    if (window.history && window.history.pushState) {
                        window.history.pushState({ tab: tabName }, '', newPath);
                    }
                    
                    // Đồng bộ sidebar
                    syncSidebarForTab(tabName);
                }
            });
        });
        
        // Xử lý browser back/forward buttons
        window.addEventListener('popstate', (event) => {
            const urlPath = window.location.pathname;
            let defaultTab = 'deployments';
            
            if (urlPath.includes('/deployments')) {
                defaultTab = 'deployments';
            } else if (urlPath.includes('/statefulsets')) {
                defaultTab = 'statefulsets';
            } else if (urlPath.includes('/daemonsets')) {
                defaultTab = 'daemonsets';
            }
            
            // Kích hoạt tab tương ứng (không cập nhật URL vì đã có trong history)
            activateTab(defaultTab, false);
            // Load dữ liệu cho tab này (chỉ load nếu chưa có)
            loadTabData(defaultTab);
            syncSidebarForTab(defaultTab);
        });
    }

    // Auto-init on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external access
    window.K8sWorkloadsModule = {
        loadWorkloads,
        describeWorkload,
        deleteWorkload,
        scaleWorkload
    };
})();

