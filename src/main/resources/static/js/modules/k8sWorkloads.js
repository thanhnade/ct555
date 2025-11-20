// Kubernetes Workloads Module
(function () {
    'use strict';

    let workloadsData = {
        deployments: [],
        statefulSets: [],
        daemonSets: [],
        cronJobs: [],
        jobs: [],
        pods: []
    };
    let filteredData = {
        deployments: [],
        statefulSets: [],
        daemonSets: [],
        cronJobs: [],
        jobs: [],
        pods: []
    };
    
    // Track which tabs have been loaded
    let loadedTabs = {
        deployments: false,
        statefulsets: false,
        daemonsets: false,
        cronjobs: false,
        jobs: false,
        pods: false
    };
    
    // Token để vô hiệu hóa kết quả fetch cũ khi có request mới (tránh race condition)
    let workloadsRequestToken = 0;

    // Helper functions từ k8sHelpers
    function escapeHtml(text) {
        return window.K8sHelpers ? window.K8sHelpers.escapeHtml(text) : (text || '');
    }

    function isSystemNamespace(name) {
        return window.K8sHelpers ? window.K8sHelpers.isSystemNamespace(name) : false;
    }

    function isAllowedSpecialWorkload(namespace, name) {
        return window.K8sHelpers ? window.K8sHelpers.isAllowedSpecialWorkload(namespace, name) : false;
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

    // Helper: Cấu hình endpoint và response key cho từng loại workload
    const workloadConfig = {
        deployments: { endpoint: '/admin/cluster/k8s/workloads/deployments', responseKey: 'deployments', dataKey: 'deployments', colspan: 7, typeFilter: 'deployment' },
        statefulsets: { endpoint: '/admin/cluster/k8s/workloads/statefulsets', responseKey: 'statefulSets', dataKey: 'statefulSets', colspan: 5, typeFilter: 'statefulset' },
        daemonsets: { endpoint: '/admin/cluster/k8s/workloads/daemonsets', responseKey: 'daemonSets', dataKey: 'daemonSets', colspan: 9, typeFilter: 'daemonset' },
        cronjobs: { endpoint: '/admin/cluster/k8s/workloads/cronjobs', responseKey: 'cronJobs', dataKey: 'cronJobs', colspan: 8, typeFilter: 'cronjob' },
        jobs: { endpoint: '/admin/cluster/k8s/workloads/jobs', responseKey: 'jobs', dataKey: 'jobs', colspan: 8, typeFilter: 'job' },
        pods: { endpoint: '/admin/cluster/k8s/workloads/pods', responseKey: 'pods', dataKey: 'pods', colspan: 7, typeFilter: 'pod' }
    };

    // Tab path mapping
    const tabPathMap = {
        deployments: '/deployments',
        statefulsets: '/statefulsets',
        daemonsets: '/daemonsets',
        cronjobs: '/cronjobs',
        jobs: '/jobs',
        pods: '/pods'
    };

    // Helper: Lấy tab name từ URL path
    function getTabFromPath(path) {
        for (const [tab, tabPath] of Object.entries(tabPathMap)) {
            if (path.includes(tabPath)) return tab;
        }
        return 'deployments';
    }

    // Helper: Lấy path từ tab name
    function getPathFromTab(tabName) {
        return '/admin/kubernetes/workloads' + (tabPathMap[tabName] || '');
    }

    // Helper: Hiển thị loading state cho tbody
    function showLoadingState(tabName) {
        const tbody = document.getElementById(`${tabName}-tbody`);
        const config = workloadConfig[tabName];
        if (tbody && config) {
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>`;
        }
    }

    // Helper: Xử lý lỗi API và hiển thị trong tbody
    function handleApiError(error, tabName) {
        const tbody = document.getElementById(`${tabName}-tbody`);
        const config = workloadConfig[tabName];
        if (!tbody || !config) return;

        if (error.status === 503 || error.response?.status === 503) {
            const errorMsg = error.message || error.response?.data?.error || 'Kubernetes API server không khả dụng - Master node có thể đang NOTREADY';
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-warning py-3"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(errorMsg)}</td></tr>`;
        } else {
            const errorMsg = error.message || 'Lỗi khi tải dữ liệu';
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-danger py-3">${escapeHtml(errorMsg)}</td></tr>`;
        }
    }

    // Helper: Kiểm tra token có hợp lệ không
    function isValidToken(token) {
        return token === workloadsRequestToken;
    }

    // Helper: Reset tất cả loadedTabs và workloadsData
    function resetAllData() {
        Object.keys(loadedTabs).forEach(key => loadedTabs[key] = false);
        Object.keys(workloadsData).forEach(key => workloadsData[key] = []);
    }

    // Helper: Đảm bảo workloadsData arrays được khởi tạo
    function ensureDataArrays() {
        Object.keys(workloadConfig).forEach(tabName => {
            const config = workloadConfig[tabName];
            if (!Array.isArray(workloadsData[config.dataKey])) {
                workloadsData[config.dataKey] = [];
            }
            if (!Array.isArray(filteredData[config.dataKey])) {
                filteredData[config.dataKey] = [];
            }
        });
    }

    // Helper: Map workload type sang tab name
    const typeToTabMap = {
        'deployment': 'deployments',
        'statefulset': 'statefulsets',
        'daemonset': 'daemonsets',
        'cronjob': 'cronjobs',
        'job': 'jobs',
        'pod': 'pods'
    };

    function getTabNameFromType(type) {
        return typeToTabMap[type?.toLowerCase()] || null;
    }

    // Helper: Map workload type sang default output message
    const typeToOutputMap = {
        'deployment': 'deployment.apps',
        'statefulset': 'statefulset.apps',
        'daemonset': 'daemonset.apps',
        'cronjob': 'cronjob.batch',
        'job': 'job.batch',
        'pod': 'pod'
    };

    function getDefaultOutput(type, name) {
        const prefix = typeToOutputMap[type?.toLowerCase()] || type;
        return `${prefix} "${name}" deleted`;
    }

    // Helper: Hiển thị alert hoặc alert fallback
    function showAlertOrFallback(type, message, fallbackFn) {
        if (window.showAlert) {
            window.showAlert(type, message);
        } else if (fallbackFn) {
            fallbackFn(message);
        }
    }

    // Helper: Reload pods nếu đang xem pods tab
    async function reloadPodsIfActive() {
        if (loadedTabs.pods) {
            const activeTab = document.querySelector('#workloads-tabs .nav-link.active');
            if (activeTab?.getAttribute('data-bs-target')?.replace('#', '') === 'pods') {
                await reloadTabDataSilent('pods');
            }
        }
    }

    // Helper: Reload các tab liên quan dựa trên thao tác
    // Một số thao tác ảnh hưởng đến nhiều workload types:
    // - Scale/Restart/Delete Deployment/StatefulSet → ảnh hưởng đến Pods
    // - Suspend/Resume CronJob → ảnh hưởng đến Jobs và Pods
    async function reloadRelatedTabs(operationType, workloadType) {
        const tabsToReload = new Set();
        
        // Thêm tab chính
        const mainTab = getTabNameFromType(workloadType);
        if (mainTab) {
            tabsToReload.add(mainTab);
        }
        
        // Xác định các tab liên quan dựa trên thao tác và workload type
        if (operationType === 'scale' || operationType === 'restart' || operationType === 'delete') {
            // Scale/Restart/Delete Deployment/StatefulSet → ảnh hưởng đến Pods
            if (workloadType === 'deployment' || workloadType === 'statefulset' || workloadType === 'daemonset') {
                if (loadedTabs.pods) {
                    tabsToReload.add('pods');
                }
            }
        } else if (operationType === 'suspend' || operationType === 'resume') {
            // Suspend/Resume CronJob → ảnh hưởng đến Jobs và Pods
            if (workloadType === 'cronjob') {
                if (loadedTabs.jobs) {
                    tabsToReload.add('jobs');
                }
                if (loadedTabs.pods) {
                    tabsToReload.add('pods');
                }
            }
        }
        
        // Reload các tab liên quan (song song)
        const reloadPromises = Array.from(tabsToReload).map(tabName => reloadTabDataSilent(tabName));
        await Promise.all(reloadPromises);
    }

    // Helper: Kiểm tra workload có ready không
    function isWorkloadReady(workload, type) {
        if (!workload) return false;
        
        if (type === 'deployment' || type === 'statefulset') {
            const ready = workload.ready || 0;
            const desired = workload.desired || workload.replicas || 0;
            return desired > 0 && ready === desired;
        } else if (type === 'daemonset') {
            const ready = workload.ready || 0;
            const desired = workload.desired || 0;
            return desired > 0 && ready === desired;
        } else if (type === 'pod') {
            return workload.status === 'Running';
        }
        
        return true; // Default: coi như ready nếu không xác định được
    }

    // Helper: Lấy workload từ data hiện tại
    function getWorkloadFromData(type, namespace, name) {
        const tabName = getTabNameFromType(type);
        if (!tabName) return null;
        
        const config = workloadConfig[tabName];
        if (!config) return null;
        
        const data = workloadsData[config.dataKey] || [];
        return data.find(w => w.namespace === namespace && w.name === name) || null;
    }

    // Helper: Polling để chờ workload ready với timeout và cập nhật UI
    async function waitForWorkloadReady(type, namespace, name, options = {}) {
        const {
            maxAttempts = 60, // Tối đa 60 lần (5 phút với interval 5s)
            interval = 5000, // 5 giây
            onUpdate = null, // Callback khi có cập nhật
            onComplete = null // Callback khi hoàn thành
        } = options;

        return new Promise(async (resolve) => {
            let attempts = 0;
            let lastStatus = null;

            const poll = async () => {
                try {
                    // Reload tab để lấy dữ liệu mới nhất
                    const tabName = getTabNameFromType(type);
                    if (tabName) {
                        await reloadTabDataSilent(tabName);
                    }

                    // Lấy workload từ data
                    const workload = getWorkloadFromData(type, namespace, name);
                    
                    if (!workload) {
                        // Workload không tồn tại (có thể đã bị xóa)
                        const result = { success: false, status: 'Workload không tồn tại' };
                        if (onComplete) onComplete(false, result.status);
                        resolve(result);
                        return;
                    }

                    // Kiểm tra trạng thái hiện tại
                    const ready = isWorkloadReady(workload, type);
                    const currentStatus = type === 'deployment' || type === 'statefulset' || type === 'daemonset'
                        ? `${workload.ready || 0}/${workload.desired || workload.replicas || 0}`
                        : workload.status || 'Unknown';

                    // Nếu status thay đổi, gọi callback
                    if (currentStatus !== lastStatus && onUpdate) {
                        onUpdate(workload, currentStatus, attempts);
                        lastStatus = currentStatus;
                    }

                    if (ready) {
                        const result = { success: true, status: currentStatus };
                        if (onComplete) onComplete(true, currentStatus);
                        resolve(result);
                        return;
                    }

                    attempts++;
                    if (attempts >= maxAttempts) {
                        const result = { success: false, status: `Timeout sau ${maxAttempts} lần thử. Trạng thái hiện tại: ${currentStatus}` };
                        if (onComplete) onComplete(false, result.status);
                        resolve(result);
                        return;
                    }

                    // Tiếp tục polling
                    setTimeout(poll, interval);
                } catch (error) {
                    console.error('Error polling workload status:', error);
                    const result = { success: false, status: `Lỗi: ${error.message}` };
                    if (onComplete) onComplete(false, result.status);
                    resolve(result);
                }
            };

            // Bắt đầu polling
            poll();
        });
    }

    // Load workloads data - reload tất cả các tab đã được load (dùng cho reload button)
    async function loadWorkloads() {
        const tabsToLoad = Object.keys(workloadConfig).filter(tabName => loadedTabs[tabName]);
        
        if (tabsToLoad.length === 0) {
            const activeTab = document.querySelector('#workloads-tabs .nav-link.active');
            const tabName = activeTab?.getAttribute('data-bs-target')?.replace('#', '') || 'deployments';
            await reloadTabData(tabName);
            return;
        }

        tabsToLoad.forEach(tabName => showLoadingState(tabName));
        await loadTabsData(tabsToLoad);
    }

    // Helper: Load data cho nhiều tabs
    async function loadTabsData(tabNames, showLoading = true) {
        const myToken = ++workloadsRequestToken;
        
        const promises = tabNames.map(tabName => {
            const config = workloadConfig[tabName];
            if (!config) return Promise.resolve(null);
            
            if (showLoading) showLoadingState(tabName);
            
            return window.ApiClient.get(config.endpoint)
                .then(res => isValidToken(myToken) ? { type: tabName, data: res[config.responseKey] || [] } : null)
                .catch(error => {
                    if (!isValidToken(myToken)) return null;
                    handleApiError(error, tabName);
                    console.error(`Error loading ${tabName}:`, error);
                    return { type: tabName, data: [] };
                });
        });

        const results = await Promise.all(promises);
        if (!isValidToken(myToken)) return;

        results.forEach(result => {
            if (!result) return;
            const config = workloadConfig[result.type];
            if (config) {
                workloadsData[config.dataKey] = result.data;
                loadedTabs[result.type] = true;
            }
        });

        // applyFilters() sẽ tự gọi updateCounts()
        applyFilters();
    }

    // Load data cho một tab cụ thể (chỉ load nếu chưa có dữ liệu)
    async function loadTabData(tabName) {
        if (loadedTabs[tabName] || !workloadConfig[tabName]) return;
        await loadTabsData([tabName]);
    }

    // Reload data cho một tab cụ thể (luôn reload, không check loadedTabs)
    async function reloadTabData(tabName) {
        if (!workloadConfig[tabName]) return;
        loadedTabs[tabName] = false; // Reset để force reload
        await loadTabsData([tabName]);
    }

    // Reload data cho một tab cụ thể mà không hiển thị loading state (dùng cho silent reload)
    async function reloadTabDataSilent(tabName) {
        if (!workloadConfig[tabName]) return;
        const myToken = ++workloadsRequestToken;
        
        try {
            const config = workloadConfig[tabName];
            const response = await window.ApiClient.get(config.endpoint);
            
            if (!isValidToken(myToken)) return;
            
            workloadsData[config.dataKey] = response[config.responseKey] || [];
            loadedTabs[tabName] = true;
            // applyFilters() sẽ tự gọi updateCounts()
            applyFilters();
        } catch (error) {
            if (!isValidToken(myToken)) return;
            if (error.status !== 503 && error.response?.status !== 503) {
                console.error(`Error reloading ${tabName} silently:`, error);
            }
        }
    }

    // Update counts - hiển thị số lượng đã được filter
    // Nếu filteredData chưa được cập nhật, fallback về workloadsData
    function updateCounts() {
        ensureDataArrays();
        
        Object.keys(workloadConfig).forEach(tabName => {
            const config = workloadConfig[tabName];
            const countEl = document.getElementById(`${tabName}-count`);
            if (countEl) {
                const filtered = filteredData[config.dataKey] || [];
                const data = workloadsData[config.dataKey] || [];
                
                // Nếu filteredData đã được khởi tạo và có dữ liệu, dùng filtered.length
                // Nếu filteredData rỗng nhưng workloadsData có dữ liệu, có thể filteredData chưa được cập nhật
                // → dùng data.length để hiển thị tổng số
                // Nếu cả hai đều rỗng, hiển thị 0
                const count = (filtered.length > 0 || data.length === 0) 
                    ? filtered.length 
                    : data.length;
                countEl.textContent = count;
            }
        });
    }

    // Debounce helper function (từ admin.js pattern)
    function debounce(fn, delay = 300) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Helper: Filter một workload array
    function filterWorkloadArray(dataArray, typeFilterValue) {
        const searchTerm = document.getElementById('workloads-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('workloads-type-filter')?.value || '';
        const namespaceFilter = document.getElementById('workloads-namespace-filter')?.value || '';

        return dataArray.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm));
            const matchType = !typeFilter || typeFilter === typeFilterValue;
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            return matchSearch && matchType && matchNamespace;
        });
    }

    // Apply filters
    function applyFilters() {
        ensureDataArrays();

        // Filter từng loại workload
        Object.keys(workloadConfig).forEach(tabName => {
            const config = workloadConfig[tabName];
            filteredData[config.dataKey] = filterWorkloadArray(workloadsData[config.dataKey] || [], config.typeFilter);
        });

        updateCounts();
        renderWorkloads();
        updateNamespaceFilter();
    }

    // Update namespace filter options
    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('workloads-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        Object.keys(workloadConfig).forEach(tabName => {
            const config = workloadConfig[tabName];
            (workloadsData[config.dataKey] || []).forEach(item => {
                if (item.namespace) namespaces.add(item.namespace);
            });
        });

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
        renderCronJobs();
        renderJobs();
        renderPods();
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
            const rolloutStatus = item.rolloutStatus || 'Unknown';
            const image = item.image || 'N/A';
            
            // Xác định badge class cho rollout status
            let rolloutStatusClass = 'bg-secondary';
            if (rolloutStatus === 'Complete') {
                rolloutStatusClass = 'bg-success';
            } else if (rolloutStatus === 'Progressing') {
                rolloutStatusClass = 'bg-info';
            } else if (rolloutStatus === 'Failed' || rolloutStatus === 'Degraded') {
                rolloutStatusClass = 'bg-danger';
            }

            const isSystem = isSystemNamespace(item.namespace);
            const isSpecial = isAllowedSpecialWorkload(item.namespace, item.name);
            const canScale = canScaleWorkloadType('deployment');
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `<tr>
                <td style="word-break: break-word;"><code>${escapeHtml(namespace)}</code></td>
                <td style="word-break: break-word;"><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td style="white-space: nowrap;"><span class="badge ${statusClass}">${ready}/${desired}</span></td>
                <td style="white-space: nowrap;"><span class="badge ${rolloutStatusClass}">${escapeHtml(rolloutStatus)}</span></td>
                <td style="word-break: break-all; max-width: 350px;"><code class="text-muted small">${escapeHtml(image)}</code></td>
                <td class="text-muted small" style="white-space: nowrap;">${escapeHtml(item.age || '-')}</td>
                <td style="white-space: nowrap;">
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-primary" onclick="window.K8sWorkloadsModule.restartWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Restart">
                            <i class="bi bi-arrow-clockwise"></i>
                        </button>` : ''}
                        ${canScale && !isSystem ? `<button class="btn btn-sm btn-outline-warning" onclick="window.K8sWorkloadsModule.scaleWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Scale">
                            <i class="bi bi-arrows-angle-expand"></i>
                        </button>` : ''}
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-success" onclick="window.K8sWorkloadsModule.showRolloutHistory('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Lịch sử Rollout">
                            <i class="bi bi-clock-history"></i>
                        </button>` : ''}
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-secondary" onclick="window.K8sWorkloadsModule.showUpdateImage('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Update Image">
                            <i class="bi bi-pencil-square"></i>
                        </button>` : ''}
                        ${!isSystem || isSpecial ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('deployment', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
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
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có statefulsets</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.statefulSets.map(item => {
            const ready = item.ready || 0;
            const desired = item.desired || item.replicas || 0;
            const current = item.current || 0;
            const statusClass = getStatusClass(ready, desired);
            const podNames = item.podNames || [];
            const pvcCount = item.pvcCount || 0;
            const currentRevision = item.currentRevision || '';
            const updateRevision = item.updateRevision || '';
            
            // Update status
            let updateStatus = 'Up-to-date';
            let updateStatusClass = 'bg-success';
            if (updateRevision && currentRevision && updateRevision !== currentRevision) {
                updateStatus = 'Updating';
                updateStatusClass = 'bg-warning text-dark';
            }

            const isSystem = isSystemNamespace(item.namespace);
            const isSpecial = isAllowedSpecialWorkload(item.namespace, item.name);
            const canScale = canScaleWorkloadType('statefulset');
            const namespace = item.namespace || '';
            const name = item.name || '';
            
            // Pods list (hiển thị tối đa 3 pods, còn lại hiển thị "...")
            let podsDisplay = podNames.length > 0 ? podNames.slice(0, 3).join(', ') : '-';
            if (podNames.length > 3) {
                podsDisplay += ` ... (+${podNames.length - 3})`;
            }

            return `<tr>
                <td style="word-break: break-word;"><code>${escapeHtml(namespace)}</code></td>
                <td style="word-break: break-word;"><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td style="white-space: nowrap;"><span class="badge ${statusClass}">${ready}/${desired}</span></td>
                <td style="word-break: break-word; max-width: 300px;" title="${escapeHtml(podNames.join(', '))}"><code class="text-muted small">${escapeHtml(podsDisplay)}</code></td>
                <td style="white-space: nowrap;">${pvcCount}</td>
                <td style="white-space: nowrap;"><span class="badge ${updateStatusClass}">${escapeHtml(updateStatus)}</span></td>
                <td class="text-muted small" style="white-space: nowrap;">${escapeHtml(item.age || '-')}</td>
                <td style="white-space: nowrap;">
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('statefulset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${canScale && !isSystem ? `<button class="btn btn-sm btn-outline-warning" onclick="window.K8sWorkloadsModule.scaleWorkload('statefulset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Scale">
                            <i class="bi bi-arrows-angle-expand"></i>
                        </button>` : ''}
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-primary" onclick="window.K8sWorkloadsModule.showStatefulSetVolumes('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Quản lý Volume">
                            <i class="bi bi-hdd"></i>
                        </button>` : ''}
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-secondary" onclick="window.K8sWorkloadsModule.showUpdateStatefulSetImage('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Update Image">
                            <i class="bi bi-pencil-square"></i>
                        </button>` : ''}
                        ${!isSystem || isSpecial ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('statefulset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
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
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có daemonsets</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.daemonSets.map(item => {
            const ready = item.ready || 0;
            const desired = item.desired || 0;
            const podsPerNode = item.podsPerNode || 0;
            const image = item.image || 'N/A';
            const rolloutStatus = item.rolloutStatus || 'Available';
            
            // Rollout status badge
            let rolloutStatusClass = 'bg-success';
            if (rolloutStatus === 'Progressing') {
                rolloutStatusClass = 'bg-warning text-dark';
            } else if (rolloutStatus === 'Failed' || rolloutStatus === 'Degraded') {
                rolloutStatusClass = 'bg-danger';
            }

            const isSystem = isSystemNamespace(item.namespace);
            const isSpecial = isAllowedSpecialWorkload(item.namespace, item.name);
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `<tr>
                <td style="word-break: break-word;"><code>${escapeHtml(namespace)}</code></td>
                <td style="word-break: break-word;"><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td style="white-space: nowrap;">${ready}/${desired}</td>
                <td style="word-break: break-all; max-width: 350px;"><code class="text-muted small">${escapeHtml(image)}</code></td>
                <td style="white-space: nowrap;"><span class="badge ${rolloutStatusClass}">${escapeHtml(rolloutStatus)}</span></td>
                <td class="text-muted small" style="white-space: nowrap;">${escapeHtml(item.age || '-')}</td>
                <td style="white-space: nowrap;">
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('daemonset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-secondary" onclick="window.K8sWorkloadsModule.showUpdateDaemonSetImage('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Update Image">
                            <i class="bi bi-pencil-square"></i>
                        </button>` : ''}
                        ${!isSystem || isSpecial ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('daemonset', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Render CronJobs
    function renderCronJobs() {
        const tbody = document.getElementById('cronjobs-tbody');
        if (!tbody) return;

        if (filteredData.cronJobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có cronjobs</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.cronJobs.map(item => {
            const isSystem = isSystemNamespace(item.namespace);
            const isSpecial = isAllowedSpecialWorkload(item.namespace, item.name);
            const namespace = item.namespace || '';
            const name = item.name || '';
            const schedule = item.schedule || '-';
            const status = item.status || (item.suspend ? 'Suspended' : 'Active');
            const active = item.active || 0;
            const successfulJobsHistoryLimit = item.successfulJobsHistoryLimit || 3;
            const failedJobsHistoryLimit = item.failedJobsHistoryLimit || 1;
            
            // Status badge
            let statusBadge = 'bg-success';
            if (status === 'Suspended') {
                statusBadge = 'bg-warning text-dark';
            } else if (status === 'Inactive') {
                statusBadge = 'bg-secondary';
            }

            return `<tr>
                <td style="word-break: break-word;"><code>${escapeHtml(namespace)}</code></td>
                <td style="word-break: break-word;"><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td style="white-space: nowrap;"><code>${escapeHtml(schedule)}</code></td>
                <td style="white-space: nowrap;"><span class="badge ${statusBadge}">${escapeHtml(status)}</span></td>
                <td style="white-space: nowrap;">${active} jobs</td>
                <td style="white-space: nowrap;" class="text-muted small">Success: ${successfulJobsHistoryLimit}, Failed: ${failedJobsHistoryLimit}</td>
                <td class="text-muted small" style="white-space: nowrap;">${escapeHtml(item.age || '-')}</td>
                <td style="white-space: nowrap;">
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('cronjob', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!isSystem ? `<button class="btn btn-sm btn-outline-primary" onclick="window.K8sWorkloadsModule.showCronJobHistory('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Lịch sử Jobs">
                            <i class="bi bi-clock-history"></i>
                        </button>` : ''}
                        ${!isSystem || isSpecial ? item.suspend ? `<button class="btn btn-sm btn-outline-success" onclick="window.K8sWorkloadsModule.resumeCronJob('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Resume">
                            <i class="bi bi-play-circle"></i>
                        </button>` : `<button class="btn btn-sm btn-outline-warning" onclick="window.K8sWorkloadsModule.suspendCronJob('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Suspend">
                            <i class="bi bi-pause-circle"></i>
                        </button>` : ''}
                        ${!isSystem || isSpecial ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('cronjob', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Render Jobs
    function renderJobs() {
        const tbody = document.getElementById('jobs-tbody');
        if (!tbody) return;

        if (filteredData.jobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có jobs</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.jobs.map(item => {
            const isSystem = isSystemNamespace(item.namespace);
            const isSpecial = isAllowedSpecialWorkload(item.namespace, item.name);
            const namespace = item.namespace || '';
            const name = item.name || '';
            const podCount = item.podCount || 0;
            const status = item.status || 'Unknown';
            const startTime = item.startTime || '-';
            const completionTime = item.completionTime || '-';
            const retryConfig = item.retryConfig || '-';
            
            // Status badge
            let statusClass = 'bg-secondary';
            if (status === 'Complete' || status === 'Succeeded') {
                statusClass = 'bg-success';
            } else if (status === 'Failed') {
                statusClass = 'bg-danger';
            } else if (status === 'Running') {
                statusClass = 'bg-warning text-dark';
            }
            
            // Thời gian hiển thị
            const timeDisplay = completionTime !== '-' ? `Completed: ${completionTime}` : (startTime !== '-' ? `Started: ${startTime}` : '-');

            return `<tr>
                <td style="word-break: break-word;"><code>${escapeHtml(namespace)}</code></td>
                <td style="word-break: break-word;"><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td style="white-space: nowrap;">${podCount}</td>
                <td style="white-space: nowrap;"><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td style="white-space: nowrap;" class="text-muted small">${escapeHtml(timeDisplay)}</td>
                <td style="word-break: break-word; max-width: 200px;" class="text-muted small"><code>${escapeHtml(retryConfig)}</code></td>
                <td class="text-muted small" style="white-space: nowrap;">${escapeHtml(item.age || '-')}</td>
                <td style="white-space: nowrap;">
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('job', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!isSystem || isSpecial ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('job', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Render Pods
    function renderPods() {
        const tbody = document.getElementById('pods-tbody');
        if (!tbody) return;

        if (filteredData.pods.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có pods</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.pods.map(item => {
            const isSystem = isSystemNamespace(item.namespace);
            const isSpecial = isAllowedSpecialWorkload(item.namespace, item.name);
            const namespace = item.namespace || '';
            const name = item.name || '';
            const status = item.status || 'Unknown';
            const image = item.image || 'N/A';
            const node = item.node || '-';
            const podIP = item.podIP || '-';
            
            // Status badge based on pod status
            let statusClass = 'bg-secondary';
            if (status === 'Running') {
                statusClass = 'bg-success';
            } else if (status === 'Pending') {
                statusClass = 'bg-warning text-dark';
            } else if (status === 'Failed' || status === 'Error') {
                statusClass = 'bg-danger';
            }

            return `<tr>
                <td style="word-break: break-word;"><code>${escapeHtml(namespace)}</code></td>
                <td style="word-break: break-word;"><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td style="white-space: nowrap;"><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td style="word-break: break-all; max-width: 350px;"><code class="text-muted small">${escapeHtml(image)}</code></td>
                <td class="text-muted small" style="word-break: break-word;">${escapeHtml(node)}</td>
                <td style="white-space: nowrap;"><code class="text-muted small">${escapeHtml(podIP)}</code></td>
                <td class="text-muted small" style="white-space: nowrap;">${escapeHtml(item.age || '-')}</td>
                <td style="white-space: nowrap;">
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sWorkloadsModule.describeWorkload('pod', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.K8sWorkloadsModule.showPodLogs('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem logs">
                            <i class="bi bi-file-text"></i>
                        </button>
                        ${status === 'Running' ? `<button class="btn btn-sm btn-outline-success" onclick="window.K8sWorkloadsModule.showExecPod('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Exec vào pod">
                            <i class="bi bi-terminal"></i>
                        </button>` : ''}
                        ${!isSystem || isSpecial ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sWorkloadsModule.deleteWorkload('pod', '${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
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
        
        if (!tabButton || !tabPane) return;
        
        // Remove active from all tabs
        document.querySelectorAll('#workloads-tabs .nav-link').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#workloads-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
        
        // Activate selected tab
        tabButton.classList.add('active');
        tabPane.classList.add('show', 'active');
        
        if (updateUrl) {
            const newPath = getPathFromTab(tabName);
            if (window.history?.pushState) {
                window.history.pushState({ tab: tabName }, '', newPath);
            }
            syncSidebarForTab(tabName);
        }
    }
    
    // Đồng bộ sidebar khi tab được chọn
    function syncSidebarForTab(tabName) {
        const targetPath = getPathFromTab(tabName);
        const normalizedTarget = targetPath.endsWith('/') && targetPath !== '/' ? targetPath.slice(0, -1) : targetPath;
        
        // Tìm link trong sidebar có href khớp
        const sidebarLinks = document.querySelectorAll('.sidebar a');
        for (const link of sidebarLinks) {
            const href = link.getAttribute('href');
            if (!href) continue;
            
            // Normalize href (remove trailing slash và context path nếu có)
            let normalizedHref = href.endsWith('/') && href !== '/' 
                ? href.slice(0, -1) 
                : href;
            
            // Remove context path nếu có (ví dụ: /AutoDeployApp/admin/... -> /admin/...)
            // Hoặc có thể href đã là relative path
            if (normalizedHref.startsWith('/')) {
                // Extract path after context (nếu có)
                const pathMatch = normalizedHref.match(/\/admin\/kubernetes\/workloads\/.*/);
                if (pathMatch) {
                    normalizedHref = pathMatch[0];
                }
            }
            
            // So sánh: exact match hoặc ends with target path
            if (normalizedHref === normalizedTarget || 
                normalizedHref.endsWith(normalizedTarget) ||
                normalizedTarget.endsWith(normalizedHref)) {
                // Gọi setActiveNav để highlight và mở dropdown
                if (typeof setActiveNav === 'function') {
                    setActiveNav(link);
                } else if (typeof window.setActiveNav === 'function') {
                    window.setActiveNav(link);
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
                return; // Đã tìm thấy và xử lý, thoát khỏi hàm
            }
        }
        
        // Nếu không tìm thấy link chính xác, thử tìm bằng cách so sánh phần cuối của path
        const pathParts = normalizedTarget.split('/');
        const lastPart = pathParts[pathParts.length - 1]; // deployments, statefulsets, etc.
        
        for (const link of sidebarLinks) {
            const href = link.getAttribute('href');
            if (!href) continue;
            
            // Kiểm tra xem href có chứa lastPart không
            if (href.includes(lastPart)) {
                const linkText = link.textContent.trim().toLowerCase();
                const tabNameLower = tabName.toLowerCase();
                
                // So sánh text content với tab name
                if (linkText === tabNameLower || linkText.includes(tabNameLower)) {
                    if (typeof setActiveNav === 'function') {
                        setActiveNav(link);
                    } else if (typeof window.setActiveNav === 'function') {
                        window.setActiveNav(link);
                    } else {
                        document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
                        link.classList.add('active');
                        
                        let parent = link.parentElement;
                        while (parent) {
                            if (parent.classList.contains('dropdown-group') || parent.classList.contains('dropdown-subgroup')) {
                                parent.classList.add('open');
                            }
                            parent = parent.parentElement;
                        }
                    }
                    return;
                }
            }
        }
    }

    // Describe workload
    async function describeWorkload(type, namespace, name) {
        // Hiển thị loading state trong modal/output
        const originalTitle = `${type} ${namespace}/${name}`;
        let loadingShown = false;
        
        try {
            // Hiển thị loading nếu có hàm showK8sOutput với loading
            if (window.showK8sOutput) {
                // Có thể hiển thị loading trong output nếu hàm hỗ trợ
                showK8sOutput(originalTitle, '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải thông tin...</div>');
                loadingShown = true;
            }
            
            const data = await window.ApiClient.get(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            
            // Hiển thị kết quả
            const output = data.output || '';
            if (output.trim()) {
                showK8sOutput(originalTitle, output);
            } else {
                showK8sOutput(originalTitle, '<div class="text-muted">Không có thông tin chi tiết</div>');
            }
        } catch (error) {
            const errorMsg = error.message || 'Lỗi lấy thông tin workload';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            } else {
                alert('Lỗi: ' + errorMsg);
            }
            // Hiển thị lỗi trong output nếu đã mở modal
            if (loadingShown) {
                showK8sOutput(originalTitle, `<div class="text-danger">${escapeHtml(errorMsg)}</div>`);
            }
        }
    }

    // Delete workload
    async function deleteWorkload(type, namespace, name) {
        // Cho phép xóa các workloads đặc biệt ngay cả khi nằm trong namespace hệ thống
        const isSpecial = isAllowedSpecialWorkload(namespace, name);
        if (isSystemNamespace(namespace) && !isSpecial) {
            if (window.showAlert) {
                window.showAlert('warning', 'Không cho phép xóa trong namespace hệ thống');
            } else {
                alert('Không cho phép xóa trong namespace hệ thống');
            }
            return;
        }
        
        // Xác nhận xóa với thông tin chi tiết hơn
        const confirmMsg = `Bạn có chắc chắn muốn xóa ${type} "${name}" trong namespace "${namespace}"?\n\nHành động này không thể hoàn tác!`;
        if (!confirm(confirmMsg)) return;

        try {
            // Hiển thị loading state trên button nếu có thể
            let deleteBtn = null;
            try {
                // Tìm button delete trong DOM
                const buttons = document.querySelectorAll(`button[onclick*="deleteWorkload('${type}'"][onclick*="'${namespace}'"][onclick*="'${name}'"]`);
                if (buttons.length > 0) {
                    deleteBtn = buttons[0];
                }
            } catch (e) {
                // Ignore nếu không tìm thấy
            }
            
            if (deleteBtn) {
                const originalHTML = deleteBtn.innerHTML;
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang xóa...';
                
                try {
                    const data = await window.ApiClient.delete(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
                    const defaultOutput = getDefaultOutput(type, name);
                    
                    showAlertOrFallback('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || defaultOutput)}</pre>`);
                    
                    // Reload tab chính và các tab liên quan (ví dụ: delete deployment → reload deployments + pods)
                    await reloadRelatedTabs('delete', type);
                } finally {
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = originalHTML;
                }
            } else {
                // Fallback nếu không tìm thấy button
                const data = await window.ApiClient.delete(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
                const defaultOutput = getDefaultOutput(type, name);
                
                showAlertOrFallback('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || defaultOutput)}</pre>`);
                
                // Reload tab chính và các tab liên quan (reloadTabDataSilent đã gọi applyFilters() → updateCounts())
                const tabName = getTabNameFromType(type);
                if (tabName) {
                    await reloadTabDataSilent(tabName);
                }
            }
        } catch (error) {
            const errorMsg = error.message || 'Lỗi xóa workload';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            } else {
                alert('Lỗi: ' + errorMsg);
            }
            throw error;
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

        // Lấy giá trị replicas hiện tại từ dữ liệu
        const tabName = getTabNameFromType(type);
        const config = tabName ? workloadConfig[tabName] : null;
        const workload = config ? workloadsData[config.dataKey]?.find(w => w.namespace === namespace && w.name === name) : null;
        const currentReplicas = workload ? (workload.desired || workload.replicas || 0) : 0;

        // Hiển thị modal scale
        const modalEl = document.getElementById('scale-workload-modal');
        if (!modalEl) {
            // Fallback: dùng prompt nếu modal không tồn tại
            const promptMsg = `Số replicas mới cho ${type} ${namespace}/${name}${currentReplicas > 0 ? ` (hiện tại: ${currentReplicas})` : ''}:`;
            const replicas = prompt(promptMsg, currentReplicas.toString());
            if (replicas === null) return;
            const replicasNum = Number(replicas);
            if (!Number.isFinite(replicasNum) || replicasNum < 0) {
                if (window.showAlert) {
                    window.showAlert('error', 'Giá trị replicas không hợp lệ. Vui lòng nhập số >= 0');
                }
                return;
            }
            await performScale(type, namespace, name, replicasNum);
            return;
        }

        // Cập nhật thông tin trong modal
        const nameEl = document.getElementById('scale-workload-name');
        const typeEl = document.getElementById('scale-workload-type');
        const namespaceEl = document.getElementById('scale-workload-namespace');
        const currentReplicasEl = document.getElementById('scale-current-replicas');
        
        if (nameEl) nameEl.textContent = `${namespace}/${name}`;
        if (typeEl) typeEl.textContent = type;
        if (namespaceEl) namespaceEl.textContent = namespace;
        if (currentReplicasEl) {
            currentReplicasEl.textContent = currentReplicas > 0 ? `(Hiện tại: ${currentReplicas})` : '';
        }
        
        const replicasInput = document.getElementById('scale-replicas-input');
        if (replicasInput) {
            replicasInput.value = currentReplicas.toString();
            replicasInput.min = '0';
            replicasInput.focus();
            // Select text để dễ chỉnh sửa
            replicasInput.select();
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
            // Lấy số replicas hiện tại trước khi scale
            const currentWorkload = getWorkloadFromData(type, namespace, name);
            const currentReplicas = currentWorkload ? (currentWorkload.desired || currentWorkload.replicas || 0) : 0;
            const isScalingDown = replicasNum < currentReplicas;
            
            const data = await window.ApiClient.post(`/admin/cluster/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, {
                replicas: replicasNum
            });
            
            // Reload tab chính và các tab liên quan ngay lập tức để cập nhật count
            await reloadRelatedTabs('scale', type);
            
            // Hiển thị thông báo
            if (replicasNum === 0) {
                if (window.showAlert) {
                    window.showAlert('success', `✅ Đã scale ${type} <strong>${namespace}/${name}</strong> về 0 replicas`);
                }
            } else if (isScalingDown) {
                // Khi giảm replica, reload nhiều lần để đảm bảo count được cập nhật
                // (Kubernetes cần thời gian để terminate pods)
                if (window.showAlert) {
                    window.showAlert('success', `✅ Đã scale ${type} <strong>${namespace}/${name}</strong> từ ${currentReplicas} → ${replicasNum} replicas`);
                }
                
                // Reload ngay lập tức (đã được gọi ở trên)
                // Reload lại sau 1 giây và 3 giây để đảm bảo count được cập nhật
                setTimeout(async () => {
                    await reloadRelatedTabs('scale', type);
                }, 1000);
                
                setTimeout(async () => {
                    await reloadRelatedTabs('scale', type);
                }, 3000);
            } else {
                // Khi tăng replica, chờ workload ready
                const initialMsg = `✅ Đã scale ${type} <strong>${namespace}/${name}</strong> từ ${currentReplicas} → ${replicasNum} replicas. Đang chờ workload ready...`;
                if (window.showAlert) {
                    window.showAlert('info', initialMsg);
                }
                
                waitForWorkloadReady(type, namespace, name, {
                    maxAttempts: 60,
                    interval: 5000,
                    onUpdate: (workload, status, attempts) => {
                        // Cập nhật UI trong khi chờ
                        const tabName = getTabNameFromType(type);
                        if (tabName) {
                            reloadTabDataSilent(tabName);
                        }
                    },
                    onComplete: (success, status) => {
                        if (success) {
                            if (window.showAlert) {
                                window.showAlert('success', `✅ Workload <strong>${namespace}/${name}</strong> đã ready! Trạng thái: ${status}`);
                            }
                        } else {
                            if (window.showAlert) {
                                window.showAlert('warning', `⚠️ Workload <strong>${namespace}/${name}</strong> chưa ready. ${status}`);
                            }
                        }
                        // Reload lại để đảm bảo UI cập nhật
                        reloadRelatedTabs('scale', type);
                    }
                });
            }
        } catch (error) {
            const errorMsg = error.message || 'Lỗi scale workload';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            } else {
                alert('Lỗi: ' + errorMsg);
            }
            throw error;
        }
    }

    // Restart workload (Deployment)
    async function restartWorkload(type, namespace, name) {
        if (type !== 'deployment') {
            if (window.showAlert) {
                window.showAlert('warning', 'Chỉ hỗ trợ restart cho Deployment');
            } else {
                alert('Chỉ hỗ trợ restart cho Deployment');
            }
            return;
        }

        if (isSystemNamespace(namespace)) {
            showAlertOrFallback('warning', 'Không cho phép restart trong namespace hệ thống', alert);
            return;
        }

        if (!confirm(`Restart deployment ${namespace}/${name}?`)) return;

        try {
            await window.ApiClient.post(`/admin/cluster/k8s/deployment/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`);
            showAlertOrFallback('info', `✅ Đã restart deployment <strong>${namespace}/${name}</strong>. Đang chờ workload ready...`);
            
            // Reload deployments và pods (nếu đã load)
            await reloadRelatedTabs('restart', 'deployment');
            
            // Chờ deployment ready sau khi restart
            waitForWorkloadReady('deployment', namespace, name, {
                maxAttempts: 60,
                interval: 5000,
                onUpdate: (workload, status, attempts) => {
                    reloadTabDataSilent('deployments');
                    reloadPodsIfActive();
                },
                onComplete: (success, status) => {
                    if (success) {
                        showAlertOrFallback('success', `✅ Deployment <strong>${namespace}/${name}</strong> đã ready sau restart! Trạng thái: ${status}`);
                    } else {
                        showAlertOrFallback('warning', `⚠️ Deployment <strong>${namespace}/${name}</strong> chưa ready. ${status}`);
                    }
                    reloadRelatedTabs('restart', 'deployment');
                }
            });
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi restart deployment', (msg) => alert('Lỗi: ' + msg));
        }
    }

    // Suspend CronJob
    async function suspendCronJob(namespace, name) {
        if (isSystemNamespace(namespace)) {
            showAlertOrFallback('warning', 'Không cho phép suspend trong namespace hệ thống', alert);
            return;
        }

        if (!confirm(`Suspend CronJob ${namespace}/${name}?`)) return;

        try {
            await window.ApiClient.post(`/admin/cluster/k8s/cronjob/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/suspend`);
            showAlertOrFallback('success', `✅ Đã suspend CronJob <strong>${namespace}/${name}</strong>`);
            // Reload cronjobs và các tab liên quan (jobs, pods nếu đã load)
            await reloadRelatedTabs('suspend', 'cronjob');
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi suspend CronJob', (msg) => alert('Lỗi: ' + msg));
        }
    }

    // Resume CronJob
    async function resumeCronJob(namespace, name) {
        if (isSystemNamespace(namespace)) {
            showAlertOrFallback('warning', 'Không cho phép resume trong namespace hệ thống', alert);
            return;
        }

        if (!confirm(`Resume CronJob ${namespace}/${name}?`)) return;

        try {
            await window.ApiClient.post(`/admin/cluster/k8s/cronjob/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/resume`);
            showAlertOrFallback('success', `✅ Đã resume CronJob <strong>${namespace}/${name}</strong>`);
            // Reload cronjobs và các tab liên quan (jobs, pods nếu đã load)
            await reloadRelatedTabs('resume', 'cronjob');
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi resume CronJob', (msg) => alert('Lỗi: ' + msg));
        }
    }

    // ========== Pods Operations (Logs, Exec) ==========
    
    // Get pod logs
    async function getPodLogs(namespace, name, container, tailLines = 100) {
        try {
            const params = new URLSearchParams();
            if (container) params.append('container', container);
            params.append('tailLines', tailLines.toString());
            
            const data = await window.ApiClient.get(`/admin/cluster/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs?${params.toString()}`);
            return data.logs || '';
        } catch (error) {
            throw new Error(error.message || 'Lỗi lấy logs pod');
        }
    }

    // Get pod containers
    async function getPodContainers(namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/containers`);
            return data.containers || [];
        } catch (error) {
            console.error('Error getting pod containers:', error);
            return [];
        }
    }

    // Show pod logs modal
    async function showPodLogs(namespace, name) {
        try {
            // Hiển thị loading
            const logsTitle = `Pod Logs: ${namespace}/${name}`;
            showK8sOutput(logsTitle, '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải logs...</div>');
            
            // Lấy danh sách containers
            const containers = await getPodContainers(namespace, name);
            let containerName = containers.length > 0 ? containers[0] : null;
            
            // Lấy logs
            const logs = await getPodLogs(namespace, name, containerName, 500);
            
            // Hiển thị logs với container selector nếu có nhiều containers
            let logsContent = '';
            if (containers.length > 1) {
                logsContent += `<div class="mb-2">
                    <label class="form-label small">Container:</label>
                    <select id="pod-logs-container-select" class="form-select form-select-sm" onchange="window.K8sWorkloadsModule.reloadPodLogs('${escapeHtml(namespace)}', '${escapeHtml(name)}', this.value)">
                        ${containers.map(c => `<option value="${escapeHtml(c)}" ${c === containerName ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                    </select>
                </div>`;
            }
            
            logsContent += `<div class="mb-2">
                <button class="btn btn-sm btn-outline-secondary" onclick="window.K8sWorkloadsModule.reloadPodLogs('${escapeHtml(namespace)}', '${escapeHtml(name)}', '${escapeHtml(containerName || '')}')">
                    <i class="bi bi-arrow-clockwise"></i> Làm mới
                </button>
                <span class="text-muted small ms-2">Hiển thị 500 dòng gần nhất</span>
            </div>`;
            
            logsContent += `<pre class="bg-dark text-light p-3 rounded" style="max-height: 500px; overflow-y: auto; font-size: 12px; line-height: 1.4;">${escapeHtml(logs || 'Không có logs')}</pre>`;
            
            showK8sOutput(logsTitle, logsContent);
        } catch (error) {
            const errorMsg = error.message || 'Lỗi lấy logs pod';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            } else {
                alert('Lỗi: ' + errorMsg);
            }
            showK8sOutput(`Pod Logs: ${namespace}/${name}`, `<div class="text-danger">${escapeHtml(errorMsg)}</div>`);
        }
    }

    // Reload pod logs
    async function reloadPodLogs(namespace, name, container) {
        try {
            const logsTitle = `Pod Logs: ${namespace}/${name}`;
            showK8sOutput(logsTitle, '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải logs...</div>');
            
            const logs = await getPodLogs(namespace, name, container || null, 500);
            const containers = await getPodContainers(namespace, name);
            
            let logsContent = '';
            if (containers.length > 1) {
                logsContent += `<div class="mb-2">
                    <label class="form-label small">Container:</label>
                    <select id="pod-logs-container-select" class="form-select form-select-sm" onchange="window.K8sWorkloadsModule.reloadPodLogs('${escapeHtml(namespace)}', '${escapeHtml(name)}', this.value)">
                        ${containers.map(c => `<option value="${escapeHtml(c)}" ${c === container ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                    </select>
                </div>`;
            }
            
            logsContent += `<div class="mb-2">
                <button class="btn btn-sm btn-outline-secondary" onclick="window.K8sWorkloadsModule.reloadPodLogs('${escapeHtml(namespace)}', '${escapeHtml(name)}', '${escapeHtml(container || '')}')">
                    <i class="bi bi-arrow-clockwise"></i> Làm mới
                </button>
                <span class="text-muted small ms-2">Hiển thị 500 dòng gần nhất</span>
            </div>`;
            
            logsContent += `<pre class="bg-dark text-light p-3 rounded" style="max-height: 500px; overflow-y: auto; font-size: 12px; line-height: 1.4;">${escapeHtml(logs || 'Không có logs')}</pre>`;
            
            showK8sOutput(logsTitle, logsContent);
        } catch (error) {
            const errorMsg = error.message || 'Lỗi lấy logs pod';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            }
            showK8sOutput(`Pod Logs: ${namespace}/${name}`, `<div class="text-danger">${escapeHtml(errorMsg)}</div>`);
        }
    }

    // Show exec pod modal
    async function showExecPod(namespace, name) {
        try {
            // Lấy danh sách containers
            const containers = await getPodContainers(namespace, name);
            const containerName = containers.length > 0 ? containers[0] : '';
            
            // Tạo modal content
            let execContent = `<div class="mb-3">
                <label class="form-label">Pod: <strong>${escapeHtml(namespace)}/${escapeHtml(name)}</strong></label>
            </div>`;
            
            if (containers.length > 1) {
                execContent += `<div class="mb-3">
                    <label for="exec-container-select" class="form-label">Container:</label>
                    <select id="exec-container-select" class="form-select">
                        ${containers.map(c => `<option value="${escapeHtml(c)}" ${c === containerName ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                    </select>
                </div>`;
            } else if (containerName) {
                execContent += `<input type="hidden" id="exec-container-select" value="${escapeHtml(containerName)}">`;
            }
            
            execContent += `<div class="mb-3">
                <label for="exec-command-input" class="form-label">Command:</label>
                <input type="text" class="form-control font-monospace" id="exec-command-input" placeholder="Ví dụ: ls -la, ps aux, env" value="ls -la">
                <div class="form-text">Nhập lệnh để thực thi trong pod (non-interactive)</div>
            </div>`;
            
            execContent += `<div class="mb-3">
                <button class="btn btn-primary" onclick="window.K8sWorkloadsModule.execPodCommand('${escapeHtml(namespace)}', '${escapeHtml(name)}')">
                    <i class="bi bi-play-circle"></i> Thực thi
                </button>
                <button class="btn btn-secondary ms-2" onclick="document.getElementById('exec-command-input').value=''">
                    <i class="bi bi-x-circle"></i> Xóa
                </button>
            </div>`;
            
            execContent += `<div id="exec-output-area" class="mt-3" style="display: none;">
                <label class="form-label">Output:</label>
                <pre class="bg-dark text-light p-3 rounded" style="max-height: 400px; overflow-y: auto; font-size: 12px; line-height: 1.4;" id="exec-output"></pre>
            </div>`;
            
            showK8sOutput(`Exec Pod: ${namespace}/${name}`, execContent);
        } catch (error) {
            const errorMsg = error.message || 'Lỗi khởi tạo exec';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            }
        }
    }

    // Exec pod command
    async function execPodCommand(namespace, name) {
        try {
            const containerSelect = document.getElementById('exec-container-select');
            const commandInput = document.getElementById('exec-command-input');
            const outputArea = document.getElementById('exec-output-area');
            const outputPre = document.getElementById('exec-output');
            
            if (!commandInput || !commandInput.value.trim()) {
                if (window.showAlert) {
                    window.showAlert('error', 'Vui lòng nhập command');
                }
                return;
            }
            
            const container = containerSelect ? containerSelect.value : null;
            const command = commandInput.value.trim();
            
            // Hiển thị loading
            if (outputArea) outputArea.style.display = 'block';
            if (outputPre) outputPre.textContent = 'Đang thực thi command...';
            
            // Gọi API
            const data = await window.ApiClient.post(`/admin/cluster/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/exec`, {
                container: container,
                command: command
            });
            
            // Hiển thị output
            if (outputPre) {
                const output = data.output || '';
                outputPre.textContent = output || '(Không có output)';
            }
            
            if (window.showAlert && data.success) {
                window.showAlert('success', 'Command thực thi thành công');
            }
        } catch (error) {
            const errorMsg = error.message || 'Lỗi thực thi command';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            }
            const outputPre = document.getElementById('exec-output');
            if (outputPre) {
                outputPre.textContent = `Error: ${errorMsg}`;
            }
            const outputArea = document.getElementById('exec-output-area');
            if (outputArea) outputArea.style.display = 'block';
        }
    }

    // Helper: Quản lý button state (loading/restore)
    async function withButtonState(button, asyncFn) {
        const originalHTML = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang tải...';
        try {
            await asyncFn();
        } finally {
            button.disabled = false;
            button.innerHTML = originalHTML;
        }
    }

    // Initialize module
    function init() {
        const defaultTab = getTabFromPath(window.location.pathname);
        
        // Render dữ liệu đã có nếu có
        const hasLoadedData = Object.keys(workloadConfig).some(tabName => {
            const config = workloadConfig[tabName];
            return loadedTabs[tabName] && (workloadsData[config.dataKey]?.length > 0);
        });
        
        if (hasLoadedData) {
            // applyFilters() sẽ tự gọi updateCounts(), không cần gọi riêng
            applyFilters();
        }
        
        // Hiển thị loading state cho các tab chưa có dữ liệu
        Object.keys(workloadConfig).forEach(tabName => {
            if (!loadedTabs[tabName]) showLoadingState(tabName);
        });
        
        activateTab(defaultTab, false);
        syncSidebarForTab(defaultTab);
        loadAllWorkloads();
        
        // Bind reload button (reload tất cả)
        const reloadBtn = document.getElementById('workloads-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => withButtonState(reloadBtn, async () => {
                resetAllData();
                Object.keys(workloadConfig).forEach(showLoadingState);
                await loadAllWorkloads(true);
            }));
        }

        // Bind reload buttons cho từng tab
        Object.entries({
            'reload-deployments': 'deployments',
            'reload-statefulsets': 'statefulsets',
            'reload-daemonsets': 'daemonsets',
            'reload-cronjobs': 'cronjobs',
            'reload-jobs': 'jobs',
            'reload-pods': 'pods'
        }).forEach(([buttonId, tabName]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    withButtonState(button, () => reloadTabData(tabName));
                });
            }
        });

        // Bind filter inputs với debounce cho search (pattern từ admin.js)
        const searchInput = document.getElementById('workloads-search');
        const typeFilter = document.getElementById('workloads-type-filter');
        const namespaceFilter = document.getElementById('workloads-namespace-filter');

        // Sử dụng debounce cho search input để giảm số lần render
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.dataset.bound = '1';
            searchInput.addEventListener('input', debounce(() => {
                applyFilters();
            }, 300));
        }

        // Bind trực tiếp cho select (không cần debounce)
        if (typeFilter && !typeFilter.dataset.bound) {
            typeFilter.dataset.bound = '1';
            typeFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        if (namespaceFilter && !namespaceFilter.dataset.bound) {
            namespaceFilter.dataset.bound = '1';
            namespaceFilter.addEventListener('change', () => {
                applyFilters();
            });
        }
        
        // Lắng nghe sự kiện khi tab được click
        document.querySelectorAll('#workloads-tabs .nav-link').forEach(button => {
            button.addEventListener('shown.bs.tab', (event) => {
                const tabName = event.target.getAttribute('data-bs-target')?.replace('#', '');
                if (tabName) {
                    reloadTabData(tabName);
                    const newPath = getPathFromTab(tabName);
                    if (window.history?.pushState) {
                        window.history.pushState({ tab: tabName }, '', newPath);
                    }
                    syncSidebarForTab(tabName);
                }
            });
        });
        
        // Xử lý browser back/forward buttons
        window.addEventListener('popstate', () => {
            const tabName = getTabFromPath(window.location.pathname);
            activateTab(tabName, false);
            reloadTabData(tabName);
            syncSidebarForTab(tabName);
        });
    }

    // Load tất cả các loại workloads song song
    async function loadAllWorkloads(forceAll = false) {
        const tabsToLoad = forceAll 
            ? Object.keys(workloadConfig)
            : Object.keys(workloadConfig).filter(tabName => !loadedTabs[tabName]);
        
        if (tabsToLoad.length === 0) return;
        await loadTabsData(tabsToLoad, !forceAll);
    }

    // Auto-init on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ========== Deployment Operations (Rollback, Update Image, History) ==========
    
    // Show rollout history modal
    async function showRolloutHistory(namespace, name) {
        try {
            const historyTitle = `Rollout History: ${namespace}/${name}`;
            showK8sOutput(historyTitle, '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải lịch sử...</div>');
            
            const data = await window.ApiClient.get(`/admin/cluster/k8s/deployment/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/history`);
            const history = data.history || [];
            
            if (history.length === 0) {
                showK8sOutput(historyTitle, '<div class="text-muted">Không có lịch sử rollout</div>');
                return;
            }
            
            let historyContent = '<div class="table-responsive"><table class="table table-sm table-hover">';
            historyContent += '<thead><tr><th>Revision</th><th>Images</th><th>Replicas</th><th>Ready</th><th>Created At</th><th>Status</th><th>Actions</th></tr></thead>';
            historyContent += '<tbody>';
            
            history.forEach(rev => {
                const isCurrent = rev.current ? '<span class="badge bg-success">Current</span>' : '';
                const images = (rev.images || []).map(img => `<code>${escapeHtml(img)}</code>`).join('<br>') || '-';
                const createdAt = rev.createdAt ? new Date(rev.createdAt).toLocaleString('vi-VN') : '-';
                
                historyContent += `<tr ${rev.current ? 'class="table-success"' : ''}>
                    <td><strong>${rev.revision}</strong></td>
                    <td>${images}</td>
                    <td>${rev.replicas || 0}</td>
                    <td>${rev.readyReplicas || 0}</td>
                    <td class="text-muted small">${createdAt}</td>
                    <td>${isCurrent}</td>
                    <td>
                        ${!rev.current ? `<button class="btn btn-sm btn-outline-primary" onclick="window.K8sWorkloadsModule.rollbackToRevision('${escapeHtml(namespace)}', '${escapeHtml(name)}', ${rev.revision})" title="Rollback về revision này">
                            <i class="bi bi-arrow-counterclockwise"></i> Rollback
                        </button>` : ''}
                    </td>
                </tr>`;
            });
            
            historyContent += '</tbody></table></div>';
            showK8sOutput(historyTitle, historyContent);
        } catch (error) {
            const errorMsg = error.message || 'Lỗi lấy rollout history';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            }
            showK8sOutput(`Rollout History: ${namespace}/${name}`, `<div class="text-danger">${escapeHtml(errorMsg)}</div>`);
        }
    }
    
    // Rollback to specific revision
    async function rollbackToRevision(namespace, name, revision) {
        if (!confirm(`Rollback deployment ${namespace}/${name} về revision ${revision}?`)) return;
        
        try {
            await window.ApiClient.post(`/admin/cluster/k8s/deployment/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/rollback`, {
                toRevision: revision
            });
            
            showAlertOrFallback('success', `✅ Đã rollback deployment <strong>${namespace}/${name}</strong> về revision ${revision}. Đang chờ rollout...`);
            
            // Reload deployments và pods
            await reloadRelatedTabs('restart', 'deployment');
            
            // Chờ deployment ready sau rollback
            waitForWorkloadReady('deployment', namespace, name, {
                maxAttempts: 60,
                interval: 5000,
                onUpdate: (workload, status, attempts) => {
                    reloadTabDataSilent('deployments');
                    reloadPodsIfActive();
                },
                onComplete: (success, status) => {
                    if (success) {
                        showAlertOrFallback('success', `✅ Deployment <strong>${namespace}/${name}</strong> đã ready sau rollback! Trạng thái: ${status}`);
                    } else {
                        showAlertOrFallback('warning', `⚠️ Deployment <strong>${namespace}/${name}</strong> chưa ready. ${status}`);
                    }
                    reloadRelatedTabs('restart', 'deployment');
                }
            });
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi rollback deployment', (msg) => alert('Lỗi: ' + msg));
        }
    }
    
    // Show update image modal
    async function showUpdateImage(namespace, name) {
        try {
            // Lấy thông tin deployment để biết containers
            const deploymentData = await window.ApiClient.get(`/admin/cluster/k8s/deployment/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            const output = deploymentData.output || '';
            
            // Parse containers từ output (hoặc có thể lấy từ API riêng)
            // Tạm thời dùng cách đơn giản: prompt cho container name và image
            const containerName = prompt(`Nhập tên container để cập nhật image:\n\nDeployment: ${namespace}/${name}`);
            if (!containerName) return;
            
            const currentImage = prompt(`Nhập image hiện tại (để tham khảo):`);
            const newImage = prompt(`Nhập image mới cho container "${containerName}":`);
            if (!newImage) return;
            
            if (!confirm(`Cập nhật image của container "${containerName}" từ "${currentImage || 'N/A'}" sang "${newImage}"?\n\nDeployment: ${namespace}/${name}`)) return;
            
            await window.ApiClient.post(`/admin/cluster/k8s/deployment/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/update-image`, {
                containerName: containerName,
                newImage: newImage
            });
            
            showAlertOrFallback('success', `✅ Đã cập nhật image cho container <strong>${containerName}</strong> trong deployment <strong>${namespace}/${name}</strong>. Đang chờ rollout...`);
            
            // Reload deployments và pods
            await reloadRelatedTabs('restart', 'deployment');
            
            // Chờ deployment ready sau update
            waitForWorkloadReady('deployment', namespace, name, {
                maxAttempts: 60,
                interval: 5000,
                onUpdate: (workload, status, attempts) => {
                    reloadTabDataSilent('deployments');
                    reloadPodsIfActive();
                },
                onComplete: (success, status) => {
                    if (success) {
                        showAlertOrFallback('success', `✅ Deployment <strong>${namespace}/${name}</strong> đã ready sau update image! Trạng thái: ${status}`);
                    } else {
                        showAlertOrFallback('warning', `⚠️ Deployment <strong>${namespace}/${name}</strong> chưa ready. ${status}`);
                    }
                    reloadRelatedTabs('restart', 'deployment');
                }
            });
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi cập nhật image', (msg) => alert('Lỗi: ' + msg));
        }
    }

    // ========== StatefulSet Operations (Volumes, Update Image) ==========
    
    // Show StatefulSet volumes (PVCs)
    async function showStatefulSetVolumes(namespace, name) {
        try {
            const volumesTitle = `Volumes: ${namespace}/${name}`;
            showK8sOutput(volumesTitle, '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải volumes...</div>');
            
            const data = await window.ApiClient.get(`/admin/cluster/k8s/statefulset/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/volumes`);
            const volumes = data.volumes || [];
            
            if (volumes.length === 0) {
                showK8sOutput(volumesTitle, '<div class="text-muted">StatefulSet này không có volumes (PVCs)</div>');
                return;
            }
            
            let volumesContent = '<div class="table-responsive"><table class="table table-sm table-hover">';
            volumesContent += '<thead><tr><th>Pod Ordinal</th><th>PVC Name</th><th>Status</th><th>Capacity</th><th>Storage Class</th><th>Access Modes</th><th>Created At</th></tr></thead>';
            volumesContent += '<tbody>';
            
            volumes.forEach(vol => {
                const podOrdinal = vol.podOrdinal !== null && vol.podOrdinal >= 0 ? vol.podOrdinal : '-';
                const status = vol.status || 'Unknown';
                const statusClass = status === 'Bound' ? 'bg-success' : status === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary';
                const capacity = vol.capacity || '-';
                const storageClass = vol.storageClass || '-';
                const accessModes = Array.isArray(vol.accessModes) ? vol.accessModes.join(', ') : '-';
                const createdAt = vol.createdAt ? new Date(vol.createdAt).toLocaleString('vi-VN') : '-';
                
                volumesContent += `<tr>
                    <td><strong>${podOrdinal}</strong></td>
                    <td><code>${escapeHtml(vol.name)}</code></td>
                    <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                    <td>${escapeHtml(capacity)}</td>
                    <td><code>${escapeHtml(storageClass)}</code></td>
                    <td class="text-muted small">${escapeHtml(accessModes)}</td>
                    <td class="text-muted small">${createdAt}</td>
                </tr>`;
            });
            
            volumesContent += '</tbody></table></div>';
            volumesContent += '<div class="mt-3"><small class="text-muted">💡 StatefulSets tự động tạo PVCs cho mỗi pod theo thứ tự (ordinal). Mỗi pod có volume riêng để giữ định danh và dữ liệu.</small></div>';
            
            showK8sOutput(volumesTitle, volumesContent);
        } catch (error) {
            const errorMsg = error.message || 'Lỗi lấy volumes';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            }
            showK8sOutput(`Volumes: ${namespace}/${name}`, `<div class="text-danger">${escapeHtml(errorMsg)}</div>`);
        }
    }
    
    // Show update image modal for StatefulSet
    async function showUpdateStatefulSetImage(namespace, name) {
        try {
            // Lấy thông tin statefulset để biết containers
            const statefulSetData = await window.ApiClient.get(`/admin/cluster/k8s/statefulset/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            const output = statefulSetData.output || '';
            
            // Tạm thời dùng cách đơn giản: prompt cho container name và image
            const containerName = prompt(`Nhập tên container để cập nhật image:\n\nStatefulSet: ${namespace}/${name}`);
            if (!containerName) return;
            
            const currentImage = prompt(`Nhập image hiện tại (để tham khảo):`);
            const newImage = prompt(`Nhập image mới cho container "${containerName}":`);
            if (!newImage) return;
            
            if (!confirm(`Cập nhật image của container "${containerName}" từ "${currentImage || 'N/A'}" sang "${newImage}"?\n\nStatefulSet: ${namespace}/${name}\n\n⚠️ Lưu ý: StatefulSet sẽ rolling update từng pod một theo thứ tự.`)) return;
            
            await window.ApiClient.post(`/admin/cluster/k8s/statefulset/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/update-image`, {
                containerName: containerName,
                newImage: newImage
            });
            
            showAlertOrFallback('success', `✅ Đã cập nhật image cho container <strong>${containerName}</strong> trong statefulset <strong>${namespace}/${name}</strong>. Đang chờ rolling update...`);
            
            // Reload statefulsets và pods
            await reloadRelatedTabs('restart', 'statefulset');
            
            // Chờ statefulset ready sau update
            waitForWorkloadReady('statefulset', namespace, name, {
                maxAttempts: 90, // StatefulSet có thể mất nhiều thời gian hơn vì update từng pod một
                interval: 5000,
                onUpdate: (workload, status, attempts) => {
                    reloadTabDataSilent('statefulsets');
                    reloadPodsIfActive();
                },
                onComplete: (success, status) => {
                    if (success) {
                        showAlertOrFallback('success', `✅ StatefulSet <strong>${namespace}/${name}</strong> đã ready sau update image! Trạng thái: ${status}`);
                    } else {
                        showAlertOrFallback('warning', `⚠️ StatefulSet <strong>${namespace}/${name}</strong> chưa ready. ${status}`);
                    }
                    reloadRelatedTabs('restart', 'statefulset');
                }
            });
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi cập nhật image', (msg) => alert('Lỗi: ' + msg));
        }
    }

    // ========== DaemonSet Operations (Update Image) ==========

    // Show update DaemonSet image modal
    async function showUpdateDaemonSetImage(namespace, name) {
        try {
            // Lấy thông tin daemonset để biết containers
            const daemonSetData = await window.ApiClient.get(`/admin/cluster/k8s/daemonset/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            const output = daemonSetData.output || '';
            
            // Tạm thời dùng cách đơn giản: prompt cho container name và image
            const containerName = prompt(`Nhập tên container để cập nhật image:\n\nDaemonSet: ${namespace}/${name}`);
            if (!containerName) return;
            
            const currentImage = prompt(`Nhập image hiện tại (để tham khảo):`);
            const newImage = prompt(`Nhập image mới cho container "${containerName}":`);
            if (!newImage) return;
            
            if (!confirm(`Cập nhật image của container "${containerName}" từ "${currentImage || 'N/A'}" sang "${newImage}"?\n\nDaemonSet: ${namespace}/${name}\n\n⚠️ Lưu ý: DaemonSet sẽ rolling update trên tất cả các nodes.`)) return;
            
            await window.ApiClient.post(`/admin/cluster/k8s/daemonset/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/update-image`, {
                containerName: containerName,
                newImage: newImage
            });
            
            showAlertOrFallback('success', `✅ Đã cập nhật image cho container <strong>${containerName}</strong> trong daemonset <strong>${namespace}/${name}</strong>. Đang chờ rolling update...`);
            
            // Reload daemonsets và pods
            await reloadRelatedTabs('restart', 'daemonset');
            
            // Chờ daemonset ready sau update
            waitForWorkloadReady('daemonset', namespace, name, {
                maxAttempts: 90, // DaemonSet có thể mất nhiều thời gian vì update trên tất cả nodes
                interval: 5000,
                onUpdate: (workload, status, attempts) => {
                    reloadTabDataSilent('daemonsets');
                    reloadPodsIfActive();
                },
                onComplete: (success, status) => {
                    if (success) {
                        showAlertOrFallback('success', `✅ DaemonSet <strong>${namespace}/${name}</strong> đã ready sau update image! Trạng thái: ${status}`);
                    } else {
                        showAlertOrFallback('warning', `⚠️ DaemonSet <strong>${namespace}/${name}</strong> chưa ready. ${status}`);
                    }
                    reloadRelatedTabs('restart', 'daemonset');
                }
            });
        } catch (error) {
            showAlertOrFallback('error', error.message || 'Lỗi cập nhật image', (msg) => alert('Lỗi: ' + msg));
        }
    }

    // Export for external access
    window.K8sWorkloadsModule = {
        loadWorkloads,
        loadTabData,
        reloadTabData,
        reloadTabDataSilent,
        loadAllWorkloads,
        describeWorkload,
        deleteWorkload,
        scaleWorkload,
        restartWorkload,
        suspendCronJob,
        resumeCronJob,
        // Pods operations
        getPodLogs,
        getPodContainers,
        showPodLogs,
        reloadPodLogs,
        showExecPod,
        execPodCommand,
        // Deployment operations
        showRolloutHistory,
        rollbackToRevision,
        showUpdateImage,
        // StatefulSet operations
        showStatefulSetVolumes,
        showUpdateStatefulSetImage,
        // DaemonSet operations
        showUpdateDaemonSetImage,
        // CronJob operations
        showCronJobHistory
    };
    
    // ========== CronJob Operations (Job History) ==========
    
    // Show CronJob job history (danh sách Jobs được tạo từ CronJob)
    async function showCronJobHistory(namespace, name) {
        try {
            const historyTitle = `Job History: ${namespace}/${name}`;
            showK8sOutput(historyTitle, '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải lịch sử Jobs...</div>');
            
            const data = await window.ApiClient.get(`/admin/cluster/k8s/cronjob/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/jobs`);
            const jobs = data.jobs || [];
            
            if (jobs.length === 0) {
                showK8sOutput(historyTitle, '<div class="text-muted">CronJob này chưa tạo Job nào</div>');
                return;
            }
            
            let historyContent = '<div class="table-responsive"><table class="table table-sm table-hover">';
            historyContent += '<thead><tr><th>Job Name</th><th>Status</th><th>Succeeded</th><th>Failed</th><th>Active</th><th>Images</th><th>Start Time</th><th>Completion Time</th><th>Created At</th></tr></thead>';
            historyContent += '<tbody>';
            
            jobs.forEach(job => {
                const status = job.status || 'Unknown';
                let statusClass = 'bg-secondary';
                if (status === 'Succeeded') {
                    statusClass = 'bg-success';
                } else if (status === 'Failed') {
                    statusClass = 'bg-danger';
                } else if (status === 'Active') {
                    statusClass = 'bg-warning text-dark';
                } else if (status === 'Pending') {
                    statusClass = 'bg-info text-dark';
                }
                
                const succeeded = job.succeeded || 0;
                const failed = job.failed || 0;
                const active = job.active || 0;
                const images = Array.isArray(job.images) ? job.images.map(img => `<code>${escapeHtml(img)}</code>`).join('<br>') : '-';
                const startTime = job.startTime ? new Date(job.startTime).toLocaleString('vi-VN') : '-';
                const completionTime = job.completionTime ? new Date(job.completionTime).toLocaleString('vi-VN') : '-';
                const createdAt = job.createdAt ? new Date(job.createdAt).toLocaleString('vi-VN') : '-';
                
                historyContent += `<tr>
                    <td><code>${escapeHtml(job.name)}</code></td>
                    <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                    <td>${succeeded}</td>
                    <td>${failed}</td>
                    <td>${active}</td>
                    <td class="text-muted small">${images}</td>
                    <td class="text-muted small">${startTime}</td>
                    <td class="text-muted small">${completionTime}</td>
                    <td class="text-muted small">${createdAt}</td>
                </tr>`;
            });
            
            historyContent += '</tbody></table></div>';
            historyContent += '<div class="mt-3"><small class="text-muted">💡 CronJob tự động tạo Jobs theo lịch trình (schedule). Mỗi Job chạy một lần và có thể thành công hoặc thất bại.</small></div>';
            
            showK8sOutput(historyTitle, historyContent);
        } catch (error) {
            const errorMsg = error.message || 'Lỗi lấy lịch sử Jobs';
            if (window.showAlert) {
                window.showAlert('error', errorMsg);
            }
            showK8sOutput(`Job History: ${namespace}/${name}`, `<div class="text-danger">${escapeHtml(errorMsg)}</div>`);
        }
    }
})();



