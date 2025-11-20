// Kubernetes Service Discovery Module
(function () {
    'use strict';

    let serviceDiscoveryData = {
        services: [],
        endpoints: [],
        coredns: [],
        ingress: []
    };
    let filteredData = {
        services: [],
        endpoints: [],
        coredns: [],
        ingress: []
    };
    
    // Track which tabs have been loaded
    let loadedTabs = {
        services: false,
        endpoints: false,
        coredns: false,
        ingress: false
    };
    
    // Token để vô hiệu hóa kết quả fetch cũ khi có request mới (tránh race condition)
    let serviceDiscoveryRequestToken = 0;

    // Helper functions từ k8sHelpers
    function escapeHtml(text) {
        return window.K8sHelpers ? window.K8sHelpers.escapeHtml(text) : (text || '');
    }

    function isSystemNamespace(name) {
        return window.K8sHelpers ? window.K8sHelpers.isSystemNamespace(name) : false;
    }

    function showK8sOutput(title, output) {
        if (window.K8sHelpers && window.K8sHelpers.showK8sOutput) {
            window.K8sHelpers.showK8sOutput(title, output);
        } else {
            alert(`${title}\n\n${output}`);
        }
    }

    // Helper function để lấy type badge class
    function getTypeClass(type) {
        if (!type) return 'bg-secondary';
        const t = type.toUpperCase();
        if (t === 'CLUSTERIP') return 'bg-primary';
        if (t === 'NODEPORT') return 'bg-info text-dark';
        if (t === 'LOADBALANCER') return 'bg-success';
        if (t === 'EXTERNALNAME') return 'bg-warning text-dark';
        return 'bg-secondary';
    }

    // Helper: Cấu hình endpoint và response key cho từng loại
    const serviceDiscoveryConfig = {
        services: { endpoint: '/admin/cluster/k8s/services', responseKey: 'services', dataKey: 'services', colspan: 11 },
        endpoints: { endpoint: '/admin/cluster/k8s/endpoints', responseKey: 'endpoints', dataKey: 'endpoints', colspan: 9 },
        coredns: { endpoint: '/admin/cluster/k8s/coredns', responseKey: 'coredns', dataKey: 'coredns', colspan: 10 },
        ingress: { endpoint: '/admin/cluster/k8s/ingress', responseKey: 'ingress', dataKey: 'ingress', colspan: 10 }
    };

    // Tab path mapping
    const tabPathMap = {
        services: '/services',
        endpoints: '/endpoints',
        coredns: '/coredns',
        ingress: '/ingress'
    };

    // Helper: Lấy tab name từ URL path
    function getTabFromPath(path) {
        for (const [tab, tabPath] of Object.entries(tabPathMap)) {
            if (path.includes(tabPath)) return tab;
        }
        return 'services';
    }

    // Helper: Hiển thị loading state cho tbody
    function showLoadingState(tabName) {
        const tbody = document.getElementById(`${tabName}-tbody`);
        const config = serviceDiscoveryConfig[tabName];
        if (tbody && config) {
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>`;
        }
    }

    // Helper: Xử lý lỗi API
    function handleApiError(error, tabName) {
        const tbody = document.getElementById(`${tabName}-tbody`);
        const config = serviceDiscoveryConfig[tabName];
        if (!tbody || !config) return;

        if (error.status === 503 || error.response?.status === 503) {
            const errorMsg = error.message || error.response?.data?.error || 'Kubernetes API server không khả dụng';
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-warning py-3"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(errorMsg)}</td></tr>`;
        } else {
            const errorMsg = error.message || 'Lỗi khi tải dữ liệu';
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-danger py-3">${escapeHtml(errorMsg)}</td></tr>`;
        }
    }

    // Helper: Kiểm tra token có hợp lệ không
    function isValidToken(token) {
        return token === serviceDiscoveryRequestToken;
    }

    // Load data cho một tab cụ thể
    async function loadTabData(tabName) {
        const config = serviceDiscoveryConfig[tabName];
        if (!config) return;

        const myToken = ++serviceDiscoveryRequestToken;
        showLoadingState(tabName);

        try {
            const namespace = document.getElementById('service-discovery-namespace-filter')?.value || '';
            const url = namespace ? `${config.endpoint}?namespace=${encodeURIComponent(namespace)}` : config.endpoint;
            const response = await window.ApiClient.get(url);

            if (!isValidToken(myToken)) return;

            if (response && response[config.responseKey]) {
                serviceDiscoveryData[config.dataKey] = response[config.responseKey] || [];
                loadedTabs[tabName] = true;
                applyFilters();
            } else {
                serviceDiscoveryData[config.dataKey] = [];
                applyFilters();
            }
        } catch (error) {
            if (!isValidToken(myToken)) return;
            console.error(`Error loading ${tabName}:`, error);
            handleApiError(error, tabName);
        }
    }

    // Reload data cho một tab cụ thể
    async function reloadTabData(tabName) {
        loadedTabs[tabName] = false;
        await loadTabData(tabName);
    }

    // Reload data ngầm (không hiển thị loading)
    async function reloadTabDataSilent(tabName) {
        const config = serviceDiscoveryConfig[tabName];
        if (!config) return;

        const myToken = ++serviceDiscoveryRequestToken;

        try {
            const namespace = document.getElementById('service-discovery-namespace-filter')?.value || '';
            const url = namespace ? `${config.endpoint}?namespace=${encodeURIComponent(namespace)}` : config.endpoint;
            const response = await window.ApiClient.get(url);

            if (!isValidToken(myToken)) return;

            if (response && response[config.responseKey]) {
                serviceDiscoveryData[config.dataKey] = response[config.responseKey] || [];
                applyFilters();
            }
        } catch (error) {
            if (!isValidToken(myToken)) return;
            console.error(`Error reloading ${tabName} silently:`, error);
        }
    }

    // Load tất cả data
    async function loadAllServiceDiscovery(forceAll = false) {
        const tabsToLoad = Object.keys(serviceDiscoveryConfig).filter(tabName => {
            return forceAll || !loadedTabs[tabName];
        });

        if (tabsToLoad.length === 0) return;

        tabsToLoad.forEach(tabName => showLoadingState(tabName));
        
        const promises = tabsToLoad.map(tabName => loadTabData(tabName));
        await Promise.all(promises);
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('service-discovery-search')?.value.toLowerCase() || '';
        const namespaceFilter = document.getElementById('service-discovery-namespace-filter')?.value || '';

        Object.keys(serviceDiscoveryConfig).forEach(tabName => {
            const config = serviceDiscoveryConfig[tabName];
            const data = serviceDiscoveryData[config.dataKey] || [];

            filteredData[config.dataKey] = data.filter(item => {
                const matchSearch = !searchTerm ||
                    (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                    (item.namespace && item.namespace.toLowerCase().includes(searchTerm)) ||
                    (item.clusterIP && item.clusterIP.toLowerCase().includes(searchTerm)) ||
                    (item.externalIP && item.externalIP.toLowerCase().includes(searchTerm)) ||
                    (item.nodePorts && item.nodePorts.toLowerCase().includes(searchTerm)) ||
                    (item.ports && item.ports.toLowerCase().includes(searchTerm)) ||
                    (item.selectors && JSON.stringify(item.selectors).toLowerCase().includes(searchTerm)) ||
                    (item.exposeStatus && item.exposeStatus.toLowerCase().includes(searchTerm)) ||
                    (item.endpoints && JSON.stringify(item.endpoints).toLowerCase().includes(searchTerm)) ||
                    (item.serviceLink && item.serviceLink.toLowerCase().includes(searchTerm)) ||
                    (item.dnsDomain && item.dnsDomain.toLowerCase().includes(searchTerm)) ||
                    (item.dnsMapping && item.dnsMapping.toLowerCase().includes(searchTerm)) ||
                    (item.hostnames && JSON.stringify(item.hostnames).toLowerCase().includes(searchTerm)) ||
                    (item.hosts && JSON.stringify(item.hosts).toLowerCase().includes(searchTerm)) ||
                    (item.host && item.host.toLowerCase().includes(searchTerm)) ||
                    (item.address && item.address.toLowerCase().includes(searchTerm)) ||
                    (item.loadBalancerIP && item.loadBalancerIP.toLowerCase().includes(searchTerm)) ||
                    (item.ingressController && item.ingressController.toLowerCase().includes(searchTerm)) ||
                    (item.tlsConfig && item.tlsConfig.toLowerCase().includes(searchTerm));
                const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
                return matchSearch && matchNamespace;
            });
        });

        renderAll();
        updateNamespaceFilter();
        updateCounts();
    }

    // Update namespace filter options
    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('service-discovery-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        Object.keys(serviceDiscoveryConfig).forEach(tabName => {
            const config = serviceDiscoveryConfig[tabName];
            (serviceDiscoveryData[config.dataKey] || []).forEach(item => {
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

    // Update counts
    function updateCounts() {
        Object.keys(serviceDiscoveryConfig).forEach(tabName => {
            const config = serviceDiscoveryConfig[tabName];
            const countEl = document.getElementById(`${tabName}-count`);
            if (countEl) {
                const filtered = filteredData[config.dataKey] || [];
                const data = serviceDiscoveryData[config.dataKey] || [];
                countEl.textContent = filtered.length || data.length || 0;
            }
        });
    }

    // Render Services
    function renderServices() {
        const tbody = document.getElementById('services-tbody');
        if (!tbody) return;

        const data = filteredData.services || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-3">Không có services</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const typeClass = getTypeClass(item.type);
            const externalIP = item.externalIP || '-';
            const clusterIP = item.clusterIP === 'None' ? '<none>' : (item.clusterIP || '-');
            const nodePorts = item.nodePorts || '-';
            const portMapping = item.ports || '-';
            
            // Selectors
            const selectors = item.selectors || {};
            const selectorStr = Object.keys(selectors).length > 0 
                ? Object.entries(selectors).map(([k, v]) => `${k}=${v}`).join(', ')
                : '<none>';
            
            // Trạng thái expose
            const exposeStatus = item.exposeStatus || 'Unknown';
            const exposeStatusClass = item.isExposed ? 'bg-success' : 'bg-secondary';
            
            const isSystem = isSystemNamespace(item.namespace);
            const namespace = escapeHtml(item.namespace || '');
            const name = escapeHtml(item.name || '');

            return `
                <tr>
                    <td><code>${namespace}</code></td>
                    <td><span class="fw-medium">${name}</span></td>
                    <td><span class="badge ${typeClass} small">${escapeHtml(item.type || '-')}</span></td>
                    <td><code>${escapeHtml(clusterIP)}</code></td>
                    <td><code>${escapeHtml(externalIP)}</code></td>
                    <td class="text-muted small">${escapeHtml(nodePorts)}</td>
                    <td class="text-muted small" style="font-size: 0.75rem;">${escapeHtml(portMapping)}</td>
                    <td class="text-muted small" style="font-size: 0.75rem;"><code>${escapeHtml(selectorStr)}</code></td>
                    <td><span class="badge ${exposeStatusClass} small">${escapeHtml(exposeStatus)}</span></td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sServiceDiscoveryModule.describeService('${namespace}', '${name}')" title="Xem chi tiết">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${!isSystem ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sServiceDiscoveryModule.deleteService('${namespace}', '${name}')" title="Xóa">
                                <i class="bi bi-trash"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render Endpoints
    function renderEndpoints() {
        const tbody = document.getElementById('endpoints-tbody');
        if (!tbody) return;

        const data = filteredData.endpoints || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Không có endpoints</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const namespace = escapeHtml(item.namespace || '');
            const name = escapeHtml(item.name || '');
            const endpoints = item.endpoints || [];
            const endpointsStr = endpoints.length > 0 
                ? (endpoints.length > 3 ? endpoints.slice(0, 3).join(', ') + '...' : endpoints.join(', '))
                : '<none>';
            const endpointCount = item.endpointCount || 0;
            const readyCount = item.readyCount || 0;
            const notReadyCount = item.notReadyCount || 0;
            const statusStr = `${readyCount}/${endpointCount} Ready`;
            const statusClass = readyCount > 0 ? (readyCount === endpointCount ? 'bg-success' : 'bg-warning text-dark') : 'bg-danger';
            const serviceLink = item.serviceLink || '';
            const ports = item.ports || '-';

            return `
                <tr>
                    <td><code>${namespace}</code></td>
                    <td><span class="fw-medium">${name}</span></td>
                    <td class="text-muted small" style="font-size: 0.75rem;"><code>${escapeHtml(endpointsStr)}</code></td>
                    <td class="text-center"><span class="badge bg-info text-dark">${endpointCount}</span></td>
                    <td><span class="badge ${statusClass} small">${statusStr}</span></td>
                    <td class="text-muted small"><code>${escapeHtml(serviceLink || name)}</code></td>
                    <td class="text-muted small">${escapeHtml(ports)}</td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sServiceDiscoveryModule.describeEndpoint('${namespace}', '${name}')" title="Xem chi tiết">
                                <i class="bi bi-eye"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render CoreDNS
    function renderCoreDNS() {
        const tbody = document.getElementById('coredns-tbody');
        if (!tbody) return;

        const data = filteredData.coredns || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-3">Không có CoreDNS pods</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const namespace = escapeHtml(item.namespace || '');
            const name = escapeHtml(item.name || '');
            const pods = item.pods || [];
            const podsStr = pods.length > 0 ? pods.join(', ') : '<none>';
            const ip = item.ip || '-';
            const status = item.status || 'Unknown';
            const statusClass = status === 'Running' ? 'bg-success' : status === 'Pending' ? 'bg-warning text-dark' : 'bg-danger';
            const dnsDomain = item.dnsDomain || '-';
            const dnsStatus = item.dnsStatus || 'Unknown';
            const dnsStatusClass = item.canResolveDNS ? 'bg-success' : 'bg-danger';
            const dnsMapping = item.dnsMapping || (item.serviceIP ? `${dnsDomain} → ${item.serviceIP}` : '-');

            return `
                <tr>
                    <td><code>${namespace}</code></td>
                    <td><span class="fw-medium">${name}</span></td>
                    <td class="text-muted small">${escapeHtml(podsStr)}</td>
                    <td><code>${escapeHtml(ip)}</code></td>
                    <td class="text-muted small" style="font-size: 0.75rem;"><code>${escapeHtml(dnsDomain)}</code></td>
                    <td><span class="badge ${dnsStatusClass} small">${escapeHtml(dnsStatus)}</span></td>
                    <td class="text-muted small" style="font-size: 0.75rem;"><code>${escapeHtml(dnsMapping)}</code></td>
                    <td><span class="badge ${statusClass} small">${escapeHtml(status)}</span></td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sServiceDiscoveryModule.describePod('${namespace}', '${name}')" title="Xem chi tiết">
                                <i class="bi bi-eye"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render Ingress
    function renderIngress() {
        const tbody = document.getElementById('ingress-tbody');
        if (!tbody) return;

        const data = filteredData.ingress || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-3">Không có ingress</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const hostnames = item.hostnames || item.hosts || [];
            const hostnamesStr = hostnames.length > 0 
                ? (hostnames.length > 2 ? hostnames.slice(0, 2).join(', ') + '...' : hostnames.join(', '))
                : '*';
            
            // Paths và Service backends
            const paths = item.paths || [];
            let pathsStr = '<none>';
            if (paths.length > 0) {
                const pathItems = paths.slice(0, 2).map(p => {
                    const path = p.path || '/';
                    const svcName = p.serviceName || '';
                    const svcPort = p.servicePort || '';
                    return `${path} → ${svcName}:${svcPort}`;
                });
                pathsStr = pathItems.join('<br>');
                if (paths.length > 2) pathsStr += '<br>...';
            }
            
            const tlsConfig = item.tlsConfig || (item.hasTls ? 'Yes' : 'No');
            const tlsClass = item.hasTls ? 'bg-success' : 'bg-secondary';
            const loadBalancerIP = item.loadBalancerIP || item.address || '<pending>';
            const ingressController = item.ingressController || item.class || 'Unknown';
            const ports = item.ports ? item.ports.join(', ') : '80,443';
            const isSystem = isSystemNamespace(item.namespace);
            const namespace = escapeHtml(item.namespace || '');
            const name = escapeHtml(item.name || '');

            return `
                <tr>
                    <td><code>${namespace}</code></td>
                    <td><span class="fw-medium">${name}</span></td>
                    <td class="text-muted small"><code>${escapeHtml(ingressController)}</code></td>
                    <td class="text-muted small" style="font-size: 0.75rem;">${escapeHtml(hostnamesStr)}</td>
                    <td class="text-muted small" style="font-size: 0.7rem;">${pathsStr}</td>
                    <td><span class="badge ${tlsClass} small">${escapeHtml(tlsConfig)}</span></td>
                    <td class="text-muted small"><code>${escapeHtml(loadBalancerIP)}</code></td>
                    <td class="text-muted small">${escapeHtml(ports)}</td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sServiceDiscoveryModule.describeIngress('${namespace}', '${name}')" title="Xem chi tiết">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${!isSystem ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sServiceDiscoveryModule.deleteIngress('${namespace}', '${name}')" title="Xóa">
                                <i class="bi bi-trash"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render all tabs
    function renderAll() {
        renderServices();
        renderEndpoints();
        renderCoreDNS();
        renderIngress();
    }

    // Describe Service
    async function describeService(namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            showK8sOutput(`Service ${namespace}/${name}`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin service');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin service'));
            }
        }
    }

    // Delete Service
    async function deleteService(namespace, name) {
        if (isSystemNamespace(namespace)) {
            if (window.showAlert) {
                window.showAlert('warning', 'Không cho phép xóa Service trong namespace hệ thống');
            } else {
                alert('Không cho phép xóa Service trong namespace hệ thống');
            }
            return;
        }
        if (!confirm(`Xóa Service ${namespace}/${name}?`)) return;

        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            if (window.showAlert) {
                window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `service "${name}" deleted`)}</pre>`);
            }
            await reloadTabDataSilent('services');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi xóa service');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi xóa service'));
            }
        }
    }

    // Describe Endpoint
    async function describeEndpoint(namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/endpoints/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            showK8sOutput(`Endpoint ${namespace}/${name}`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin endpoint');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin endpoint'));
            }
        }
    }

    // Describe Pod (for CoreDNS)
    async function describePod(namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            showK8sOutput(`Pod ${namespace}/${name}`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin pod');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin pod'));
            }
        }
    }

    // Describe Ingress
    async function describeIngress(namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            showK8sOutput(`Ingress ${namespace}/${name}`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin ingress');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin ingress'));
            }
        }
    }

    // Delete Ingress
    async function deleteIngress(namespace, name) {
        if (isSystemNamespace(namespace)) {
            if (window.showAlert) {
                window.showAlert('warning', 'Không cho phép xóa Ingress trong namespace hệ thống');
            } else {
                alert('Không cho phép xóa Ingress trong namespace hệ thống');
            }
            return;
        }
        if (!confirm(`Xóa Ingress ${namespace}/${name}?`)) return;

        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            if (window.showAlert) {
                window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `ingress.networking.k8s.io "${name}" deleted`)}</pre>`);
            }
            await reloadTabDataSilent('ingress');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi xóa ingress');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi xóa ingress'));
            }
        }
    }

    // Activate tab
    function activateTab(tabName) {
        const tabButton = document.getElementById(`${tabName}-tab`);
        const tabPane = document.getElementById(tabName);
        if (!tabButton || !tabPane) return;

        // Remove active class from all tabs
        document.querySelectorAll('#service-discovery-tabs .nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelectorAll('#service-discovery-tab-content .tab-pane').forEach(pane => {
            pane.classList.remove('show', 'active');
        });

        // Add active class to selected tab
        tabButton.classList.add('active');
        tabPane.classList.add('show', 'active');

        // Load data if not loaded
        if (!loadedTabs[tabName]) {
            loadTabData(tabName);
        }
    }

    // Initialize module
    function init() {
        // Get default tab from URL or default to 'services'
        const path = window.location.pathname;
        const defaultTab = getTabFromPath(path) || 'services';

        // Setup reload button
        const reloadBtn = document.getElementById('service-discovery-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', async () => {
                Object.keys(loadedTabs).forEach(key => loadedTabs[key] = false);
                Object.keys(serviceDiscoveryData).forEach(key => serviceDiscoveryData[key] = []);
                Object.keys(filteredData).forEach(key => filteredData[key] = []);
                Object.keys(serviceDiscoveryConfig).forEach(tabName => showLoadingState(tabName));
                await loadAllServiceDiscovery(true);
            });
        }

        // Setup individual reload buttons
        Object.keys(serviceDiscoveryConfig).forEach(tabName => {
            const reloadBtn = document.getElementById(`reload-${tabName}`);
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => reloadTabData(tabName));
            }
        });

        // Setup search and filters
        const searchInput = document.getElementById('service-discovery-search');
        const namespaceFilter = document.getElementById('service-discovery-namespace-filter');

        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => applyFilters(), 300);
            });
        }

        if (namespaceFilter) {
            namespaceFilter.addEventListener('change', () => {
                Object.keys(loadedTabs).forEach(key => loadedTabs[key] = false);
                loadAllServiceDiscovery(true);
            });
        }

        // Setup tab click handlers
        Object.keys(serviceDiscoveryConfig).forEach(tabName => {
            const tabButton = document.getElementById(`${tabName}-tab`);
            if (tabButton) {
                tabButton.addEventListener('shown.bs.tab', () => {
                    activateTab(tabName);
                });
            }
        });

        // Load initial data
        activateTab(defaultTab);
        loadAllServiceDiscovery();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.K8sServiceDiscoveryModule = {
        loadAllServiceDiscovery,
        loadTabData,
        reloadTabData,
        describeService,
        deleteService,
        describeEndpoint,
        describePod,
        describeIngress,
        deleteIngress
    };
})();

