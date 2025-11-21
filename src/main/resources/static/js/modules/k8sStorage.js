// Kubernetes Storage Module
(function () {
    'use strict';

    const storageData = {
        pvcs: [],
        pvs: [],
        storageclasses: []
    };
    const filteredData = {
        pvcs: [],
        pvs: [],
        storageclasses: []
    };

    const loadedTabs = {
        pvcs: false,
        pvs: false,
        storageclasses: false
    };

    const requestTokens = {};

    function escapeHtml(text) {
        return window.K8sHelpers ? window.K8sHelpers.escapeHtml(text) : (text || '');
    }

    function getNextToken(tabName) {
        requestTokens[tabName] = (requestTokens[tabName] || 0) + 1;
        return requestTokens[tabName];
    }

    function isValidToken(tabName, token) {
        return requestTokens[tabName] === token;
    }

    const storageConfig = {
        pvcs: { endpoint: '/admin/cluster/k8s/storage/pvcs', responseKey: 'pvcs', dataKey: 'pvcs', colspan: 8 },
        pvs: { endpoint: '/admin/cluster/k8s/storage/pvs', responseKey: 'pvs', dataKey: 'pvs', colspan: 8 },
        storageclasses: { endpoint: '/admin/cluster/k8s/storage/storageclasses', responseKey: 'storageclasses', dataKey: 'storageclasses', colspan: 7 }
    };

    const tabPathMap = {
        pvcs: '/pvcs',
        pvs: '/pvs',
        storageclasses: '/storageclasses'
    };

    function getTabFromPath(path) {
        for (const [tab, tabPath] of Object.entries(tabPathMap)) {
            if (path.includes(tabPath)) {
                return tab;
            }
        }
        return 'pvcs';
    }

    function showLoadingState(tabName) {
        const tbody = document.getElementById(`${tabName}-tbody`);
        const config = storageConfig[tabName];
        if (tbody && config) {
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>`;
        }
    }

    function handleApiError(error, tabName) {
        const tbody = document.getElementById(`${tabName}-tbody`);
        const config = storageConfig[tabName];
        if (!tbody || !config) return;

        if (error.status === 503 || error.response?.status === 503) {
            const errorMsg = error.message || error.response?.data?.error || 'Kubernetes API server không khả dụng';
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-warning py-3"><i class="bi bi-exclamation-triangle me-2"></i>${escapeHtml(errorMsg)}</td></tr>`;
        } else {
            const errorMsg = error.message || 'Lỗi khi tải dữ liệu';
            tbody.innerHTML = `<tr><td colspan="${config.colspan}" class="text-center text-danger py-3">${escapeHtml(errorMsg)}</td></tr>`;
        }
    }

    async function loadTabData(tabName) {
        const config = storageConfig[tabName];
        if (!config) return;

        const myToken = getNextToken(tabName);
        showLoadingState(tabName);

        try {
            const namespace = document.getElementById('k8s-storage-namespace-filter')?.value || '';
            let url = config.endpoint;
            if (tabName === 'pvcs' && namespace) {
                url = `${config.endpoint}?namespace=${encodeURIComponent(namespace)}`;
            }
            const response = await window.ApiClient.get(url);

            if (!isValidToken(tabName, myToken)) return;

            storageData[config.dataKey] = response && response[config.responseKey] ? response[config.responseKey] : [];
            loadedTabs[tabName] = true;
            applyFilters();
        } catch (error) {
            if (!isValidToken(tabName, myToken)) return;
            console.error(`Error loading ${tabName}:`, error);
            handleApiError(error, tabName);
        }
    }

    async function reloadTabData(tabName) {
        loadedTabs[tabName] = false;
        await loadTabData(tabName);
    }

    async function reloadTabDataSilent(tabName) {
        const config = storageConfig[tabName];
        if (!config) return;

        const myToken = getNextToken(tabName);

        try {
            const namespace = document.getElementById('k8s-storage-namespace-filter')?.value || '';
            let url = config.endpoint;
            if (tabName === 'pvcs' && namespace) {
                url = `${config.endpoint}?namespace=${encodeURIComponent(namespace)}`;
            }
            const response = await window.ApiClient.get(url);

            if (!isValidToken(tabName, myToken)) return;

            if (response && response[config.responseKey]) {
                storageData[config.dataKey] = response[config.responseKey];
                loadedTabs[tabName] = true;
                applyFilters();
            }
        } catch (error) {
            if (!isValidToken(tabName, myToken)) return;
            console.error(`Error reloading ${tabName}:`, error);
        }
    }

    async function loadAllStorage(forceAll = false) {
        const tabsToLoad = Object.keys(storageConfig).filter(tabName => forceAll || !loadedTabs[tabName]);
        if (tabsToLoad.length === 0) return;

        tabsToLoad.forEach(showLoadingState);
        await Promise.all(tabsToLoad.map(loadTabData));
    }

    function applyFilters() {
        const searchTerm = document.getElementById('k8s-storage-search')?.value.toLowerCase() || '';
        const namespaceFilter = document.getElementById('k8s-storage-namespace-filter')?.value || '';

        Object.keys(storageConfig).forEach(tabName => {
            const config = storageConfig[tabName];
            const data = storageData[config.dataKey] || [];

            filteredData[config.dataKey] = data.filter(item => {
                const textBucket = JSON.stringify(item || {}).toLowerCase();
                const matchSearch = !searchTerm || textBucket.includes(searchTerm);
                const matchNamespace = tabName !== 'pvcs' || !namespaceFilter || item.namespace === namespaceFilter;
                return matchSearch && matchNamespace;
            });
        });

        renderAll();
        updateNamespaceFilter();
        updateCounts();
    }

    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('k8s-storage-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        (storageData.pvcs || []).forEach(item => {
            if (item.namespace) {
                namespaces.add(item.namespace);
            }
        });

        const currentValue = namespaceFilter.value;
        namespaceFilter.innerHTML = '<option value="">Tất cả namespace (PVC)</option>';
        Array.from(namespaces).sort().forEach(ns => {
            const option = document.createElement('option');
            option.value = ns;
            option.textContent = ns;
            namespaceFilter.appendChild(option);
        });
        namespaceFilter.value = currentValue;
    }

    function updateCounts() {
        Object.keys(storageConfig).forEach(tabName => {
            const countEl = document.getElementById(`${tabName}-count`);
            if (countEl) {
                const config = storageConfig[tabName];
                const filtered = filteredData[config.dataKey] || [];
                const data = storageData[config.dataKey] || [];
                countEl.textContent = filtered.length || data.length || 0;
            }
        });
    }

    function renderPVCs() {
        const tbody = document.getElementById('pvcs-tbody');
        if (!tbody || !loadedTabs.pvcs) return;

        const data = filteredData.pvcs || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có PVC</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const accessModes = item.accessModesStr || '-';
            const namespace = escapeHtml(item.namespace || '');
            const name = escapeHtml(item.name || '');
            const storageClass = item.storageClass || '-';
            const status = item.status || 'Unknown';
            const statusClass = status === 'Bound' ? 'bg-success' : status === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary';
            const volume = item.volume || '-';
            const capacity = item.capacity || '-';

            return `
                <tr>
                    <td><code>${namespace}</code></td>
                    <td>
                        <span class="fw-medium">${name}</span>
                        <div class="text-muted small">Age: ${escapeHtml(item.age || '-')}</div>
                    </td>
                    <td><code>${escapeHtml(volume)}</code></td>
                    <td><code>${escapeHtml(capacity)}</code></td>
                    <td><code>${escapeHtml(storageClass || '-')}</code></td>
                    <td class="text-muted small">${escapeHtml(accessModes)}</td>
                    <td><span class="badge ${statusClass} small">${escapeHtml(status)}</span></td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sStorageModule.describePVC('${namespace}', '${name}')" title="Describe PVC">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.K8sStorageModule.deletePVC('${namespace}', '${name}')" title="Xóa PVC">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderPVs() {
        const tbody = document.getElementById('pvs-tbody');
        if (!tbody || !loadedTabs.pvs) return;

        const data = filteredData.pvs || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có PV</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const name = escapeHtml(item.name || '');
            const capacity = item.capacity || '-';
            const accessModes = item.accessModesStr || '-';
            const reclaimPolicy = item.reclaimPolicy || '-';
            const status = item.phase || 'Unknown';
            const statusClass = status === 'Bound' ? 'bg-success' : status === 'Released' ? 'bg-warning text-dark' : 'bg-secondary';
            const claim = item.claimRef || '-';
            const storageClass = item.storageClass || '-';

            return `
                <tr>
                    <td>
                        <span class="fw-medium">${name}</span>
                        <div class="text-muted small">Age: ${escapeHtml(item.age || '-')}</div>
                    </td>
                    <td><code>${escapeHtml(capacity)}</code></td>
                    <td class="text-muted small">${escapeHtml(accessModes)}</td>
                    <td><code>${escapeHtml(reclaimPolicy)}</code></td>
                    <td><span class="badge ${statusClass} small">${escapeHtml(status)}</span></td>
                    <td><code>${escapeHtml(claim)}</code></td>
                    <td><code>${escapeHtml(storageClass)}</code></td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sStorageModule.describePV('${name}')" title="Describe PV">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.K8sStorageModule.deletePV('${name}')" title="Xóa PV">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderStorageClasses() {
        const tbody = document.getElementById('storageclasses-tbody');
        if (!tbody || !loadedTabs.storageclasses) return;

        const data = filteredData.storageclasses || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có StorageClass</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => {
            const name = escapeHtml(item.name || '');
            const provisioner = item.provisioner || '-';
            const bindingMode = item.volumeBindingMode || '-';
            const reclaimPolicy = item.reclaimPolicy || '-';
            const isDefault = item.isDefault ? 'Yes' : 'No';
            const parameters = item.parameters ? JSON.stringify(item.parameters) : '-';
            const defaultClass = item.isDefault ? 'bg-success' : 'bg-secondary';

            return `
                <tr>
                    <td>
                        <span class="fw-medium">${name}</span>
                        <div class="text-muted small">Allow Expansion: ${item.allowVolumeExpansion ? 'Yes' : 'No'}</div>
                        <div class="text-muted small">Age: ${escapeHtml(item.age || '-')}</div>
                    </td>
                    <td><code>${escapeHtml(provisioner)}</code></td>
                    <td><code>${escapeHtml(bindingMode)}</code></td>
                    <td><code>${escapeHtml(reclaimPolicy)}</code></td>
                    <td><span class="badge ${defaultClass} small">${isDefault}</span></td>
                    <td class="text-muted small" style="font-size: 0.75rem;">${escapeHtml(parameters)}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sStorageModule.describeStorageClass('${name}')" title="Describe StorageClass">
                                <i class="bi bi-eye"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.K8sStorageModule.deleteStorageClass('${name}')" title="Xóa StorageClass">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderAll() {
        renderPVCs();
        renderPVs();
        renderStorageClasses();
    }

    async function describePVC(namespace, name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/storage/pvcs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            if (window.K8sHelpers && window.K8sHelpers.showK8sOutput) {
                window.K8sHelpers.showK8sOutput(`PVC ${namespace}/${name}`, data.output || '');
            }
        } catch (error) {
            window.showAlert?.('error', error.message || 'Lỗi lấy thông tin PVC');
        }
    }

    async function deletePVC(namespace, name) {
        if (!confirm(`Xóa PVC ${namespace}/${name}?`)) return;
        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/storage/pvcs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            window.showAlert?.('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || '')}</pre>`);
            await reloadTabDataSilent('pvcs');
        } catch (error) {
            window.showAlert?.('error', error.message || 'Lỗi xóa PVC');
        }
    }

    async function describePV(name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/storage/pvs/${encodeURIComponent(name)}`);
            window.K8sHelpers?.showK8sOutput(`PV ${name}`, data.output || '');
        } catch (error) {
            window.showAlert?.('error', error.message || 'Lỗi lấy thông tin PV');
        }
    }

    async function deletePV(name) {
        if (!confirm(`Xóa PV ${name}?`)) return;
        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/storage/pvs/${encodeURIComponent(name)}`);
            window.showAlert?.('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || '')}</pre>`);
            await reloadTabDataSilent('pvs');
        } catch (error) {
            window.showAlert?.('error', error.message || 'Lỗi xóa PV');
        }
    }

    async function describeStorageClass(name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/storage/storageclasses/${encodeURIComponent(name)}`);
            window.K8sHelpers?.showK8sOutput(`StorageClass ${name}`, data.output || '');
        } catch (error) {
            window.showAlert?.('error', error.message || 'Lỗi lấy thông tin StorageClass');
        }
    }

    async function deleteStorageClass(name) {
        if (!confirm(`Xóa StorageClass ${name}?`)) return;
        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/storage/storageclasses/${encodeURIComponent(name)}`);
            window.showAlert?.('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || '')}</pre>`);
            await reloadTabDataSilent('storageclasses');
        } catch (error) {
            window.showAlert?.('error', error.message || 'Lỗi xóa StorageClass');
        }
    }

    function activateTab(tabName, forceReload = false) {
        const tabButton = document.getElementById(`${tabName}-tab`);
        const tabPane = document.getElementById(tabName);
        if (!tabButton || !tabPane) return;

        document.querySelectorAll('#k8s-storage-tabs .nav-link').forEach(link => link.classList.remove('active'));
        document.querySelectorAll('#k8s-storage-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

        tabButton.classList.add('active');
        tabPane.classList.add('show', 'active');

        if (forceReload) {
            loadedTabs[tabName] = false;
        }
        loadTabData(tabName);
    }

    function init() {
        const defaultTab = getTabFromPath(window.location.pathname);

        const reloadBtn = document.getElementById('k8s-storage-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', async () => {
                Object.keys(loadedTabs).forEach(key => loadedTabs[key] = false);
                Object.keys(storageData).forEach(key => storageData[key] = []);
                Object.keys(filteredData).forEach(key => filteredData[key] = []);
                Object.keys(storageConfig).forEach(showLoadingState);
                await loadAllStorage(true);
            });
        }

        Object.keys(storageConfig).forEach(tabName => {
            const reloadButton = document.getElementById(`reload-${tabName}`);
            if (reloadButton) {
                reloadButton.addEventListener('click', () => reloadTabData(tabName));
            }
            const tabButton = document.getElementById(`${tabName}-tab`);
            if (tabButton) {
                tabButton.addEventListener('shown.bs.tab', () => activateTab(tabName, true));
            }
        });

        const searchInput = document.getElementById('k8s-storage-search');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => applyFilters(), 300);
            });
        }

        const namespaceFilter = document.getElementById('k8s-storage-namespace-filter');
        if (namespaceFilter) {
            namespaceFilter.addEventListener('change', () => {
                loadedTabs.pvcs = false;
                loadTabData('pvcs');
            });
        }

        activateTab(defaultTab);
        loadAllStorage(true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.K8sStorageModule = {
        describePVC,
        deletePVC,
        describePV,
        deletePV,
        describeStorageClass,
        deleteStorageClass
    };
})();

