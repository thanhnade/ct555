// Kubernetes Configuration Module (ConfigMaps, Secrets, RBAC, Network Policies)
(function () {
    'use strict';

    // Helper: Get escapeHtml function
    function getEscapeHtml() {
        return window.K8sHelpers?.escapeHtml || ((text) => text || '');
    }

    // ===================== ConfigMaps =====================

    let configMapsData = [];
    let filteredConfigMaps = [];

    async function loadConfigMaps() {
        const tbody = document.getElementById('configmaps-tbody');
        if (!tbody) return;

        const namespaceFilter = document.getElementById('configmaps-namespace-filter')?.value || '';
        const searchTerm = document.getElementById('configmaps-search')?.value.toLowerCase() || '';

        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';

        try {
            const url = `/admin/cluster/k8s/configmaps${namespaceFilter ? '?namespace=' + encodeURIComponent(namespaceFilter) : ''}`;
            const response = await window.ApiClient.get(url);
            configMapsData = response.configmaps || [];
            filterConfigMaps(searchTerm);
            renderConfigMaps();
        } catch (error) {
            console.error('Error loading ConfigMaps:', error);
            const errorMsg = error.message || 'Lỗi khi tải ConfigMaps';
            const escapeHtml = getEscapeHtml();
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">${escapeHtml(errorMsg)}</td></tr>`;
        }
    }

    function filterConfigMaps(searchTerm) {
        if (!searchTerm) {
            filteredConfigMaps = configMapsData;
            return;
        }
        filteredConfigMaps = configMapsData.filter(cm => {
            const name = (cm.name || '').toLowerCase();
            const namespace = (cm.namespace || '').toLowerCase();
            return name.includes(searchTerm) || namespace.includes(searchTerm);
        });
    }

    function renderConfigMaps() {
        const tbody = document.getElementById('configmaps-tbody');
        if (!tbody) return;

        if (filteredConfigMaps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có ConfigMap nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filteredConfigMaps.map(cm => `
            <tr>
                <td>${escapeHtml(cm.namespace || '')}</td>
                <td><strong>${escapeHtml(cm.name || '')}</strong></td>
                <td>${cm.dataKeys || 0}</td>
                <td>${escapeHtml(cm.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeConfigMap('${escapeHtml(cm.namespace)}', '${escapeHtml(cm.name)}')">
                        📄 Describe
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteConfigMap('${escapeHtml(cm.namespace)}', '${escapeHtml(cm.name)}')">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.describeConfigMap = async function(namespace, name) {
        try {
            const response = await window.ApiClient.get(`/admin/cluster/k8s/configmaps/${namespace}/${name}?format=json`);
            if (window.K8sHelpers?.showK8sOutput) {
                window.K8sHelpers.showK8sOutput(`ConfigMap: ${namespace}/${name}`, response.output);
            }
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi lấy thông tin ConfigMap: ' + (error.message || ''));
            } else {
                alert('Lỗi khi lấy thông tin ConfigMap: ' + (error.message || ''));
            }
        }
    };

    window.deleteConfigMap = async function(namespace, name) {
        if (!confirm(`Bạn có chắc muốn xóa ConfigMap "${name}" trong namespace "${namespace}"?`)) {
            return;
        }
        try {
            await window.ApiClient.delete(`/admin/cluster/k8s/configmaps/${namespace}/${name}`);
            if (window.showAlert) {
                window.showAlert('success', 'Đã xóa ConfigMap thành công');
            } else {
                alert('Đã xóa ConfigMap thành công');
            }
            loadConfigMaps();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi xóa ConfigMap: ' + (error.message || ''));
            } else {
                alert('Lỗi khi xóa ConfigMap: ' + (error.message || ''));
            }
        }
    };

    // ===================== Secrets =====================

    let secretsData = [];
    let filteredSecrets = [];

    async function loadSecrets() {
        const tbody = document.getElementById('secrets-tbody');
        if (!tbody) return;

        const namespaceFilter = document.getElementById('secrets-namespace-filter')?.value || '';
        const searchTerm = document.getElementById('secrets-search')?.value.toLowerCase() || '';

        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';

        try {
            const url = `/admin/cluster/k8s/secrets${namespaceFilter ? '?namespace=' + encodeURIComponent(namespaceFilter) : ''}`;
            const response = await window.ApiClient.get(url);
            secretsData = response.secrets || [];
            filterSecrets(searchTerm);
            renderSecrets();
        } catch (error) {
            console.error('Error loading Secrets:', error);
            const errorMsg = error.message || 'Lỗi khi tải Secrets';
            const escapeHtml = getEscapeHtml();
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">${escapeHtml(errorMsg)}</td></tr>`;
        }
    }

    function filterSecrets(searchTerm) {
        if (!searchTerm) {
            filteredSecrets = secretsData;
            return;
        }
        filteredSecrets = secretsData.filter(secret => {
            const name = (secret.name || '').toLowerCase();
            const namespace = (secret.namespace || '').toLowerCase();
            const type = (secret.type || '').toLowerCase();
            return name.includes(searchTerm) || namespace.includes(searchTerm) || type.includes(searchTerm);
        });
    }

    function renderSecrets() {
        const tbody = document.getElementById('secrets-tbody');
        if (!tbody) return;

        if (filteredSecrets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Không có Secret nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filteredSecrets.map(secret => `
            <tr>
                <td>${escapeHtml(secret.namespace || '')}</td>
                <td><strong>${escapeHtml(secret.name || '')}</strong></td>
                <td><span class="badge bg-info">${escapeHtml(secret.type || 'Opaque')}</span></td>
                <td>${secret.dataKeys || 0}</td>
                <td>${escapeHtml(secret.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeSecret('${escapeHtml(secret.namespace)}', '${escapeHtml(secret.name)}')">
                        📄 Describe
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteSecret('${escapeHtml(secret.namespace)}', '${escapeHtml(secret.name)}')">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.describeSecret = async function(namespace, name) {
        try {
            const response = await window.ApiClient.get(`/admin/cluster/k8s/secrets/${namespace}/${name}?format=json`);
            if (window.K8sHelpers?.showK8sOutput) {
                window.K8sHelpers.showK8sOutput(`Secret: ${namespace}/${name}`, response.output);
            }
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi lấy thông tin Secret: ' + (error.message || ''));
            } else {
                alert('Lỗi khi lấy thông tin Secret: ' + (error.message || ''));
            }
        }
    };

    window.deleteSecret = async function(namespace, name) {
        if (!confirm(`Bạn có chắc muốn xóa Secret "${name}" trong namespace "${namespace}"?`)) {
            return;
        }
        try {
            await window.ApiClient.delete(`/admin/cluster/k8s/secrets/${namespace}/${name}`);
            if (window.showAlert) {
                window.showAlert('success', 'Đã xóa Secret thành công');
            } else {
                alert('Đã xóa Secret thành công');
            }
            loadSecrets();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi xóa Secret: ' + (error.message || ''));
            } else {
                alert('Lỗi khi xóa Secret: ' + (error.message || ''));
            }
        }
    };

    // ===================== Network Policies =====================

    let networkPoliciesData = [];
    let filteredNetworkPolicies = [];

    async function loadNetworkPolicies() {
        const tbody = document.getElementById('networkpolicies-tbody');
        if (!tbody) return;

        const namespaceFilter = document.getElementById('networkpolicies-namespace-filter')?.value || '';
        const searchTerm = document.getElementById('networkpolicies-search')?.value.toLowerCase() || '';

        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';

        try {
            const url = `/admin/cluster/k8s/networkpolicies${namespaceFilter ? '?namespace=' + encodeURIComponent(namespaceFilter) : ''}`;
            const response = await window.ApiClient.get(url);
            networkPoliciesData = response.networkPolicies || [];
            filterNetworkPolicies(searchTerm);
            renderNetworkPolicies();
        } catch (error) {
            console.error('Error loading Network Policies:', error);
            const errorMsg = error.message || 'Lỗi khi tải Network Policies';
            const escapeHtml = getEscapeHtml();
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">${escapeHtml(errorMsg)}</td></tr>`;
        }
    }

    function filterNetworkPolicies(searchTerm) {
        if (!searchTerm) {
            filteredNetworkPolicies = networkPoliciesData;
            return;
        }
        filteredNetworkPolicies = networkPoliciesData.filter(np => {
            const name = (np.name || '').toLowerCase();
            const namespace = (np.namespace || '').toLowerCase();
            return name.includes(searchTerm) || namespace.includes(searchTerm);
        });
    }

    function renderNetworkPolicies() {
        const tbody = document.getElementById('networkpolicies-tbody');
        if (!tbody) return;

        if (filteredNetworkPolicies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Không có Network Policy nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filteredNetworkPolicies.map(np => `
            <tr>
                <td>${escapeHtml(np.namespace || '')}</td>
                <td><strong>${escapeHtml(np.name || '')}</strong></td>
                <td>${escapeHtml(np.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeNetworkPolicy('${escapeHtml(np.namespace)}', '${escapeHtml(np.name)}')">
                        📄 Describe
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteNetworkPolicy('${escapeHtml(np.namespace)}', '${escapeHtml(np.name)}')">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.describeNetworkPolicy = async function(namespace, name) {
        try {
            const response = await window.ApiClient.get(`/admin/cluster/k8s/networkpolicies/${namespace}/${name}?format=json`);
            if (window.K8sHelpers?.showK8sOutput) {
                window.K8sHelpers.showK8sOutput(`NetworkPolicy: ${namespace}/${name}`, response.output);
            }
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi lấy thông tin NetworkPolicy: ' + (error.message || ''));
            } else {
                alert('Lỗi khi lấy thông tin NetworkPolicy: ' + (error.message || ''));
            }
        }
    };

    window.deleteNetworkPolicy = async function(namespace, name) {
        if (!confirm(`Bạn có chắc muốn xóa NetworkPolicy "${name}" trong namespace "${namespace}"?`)) {
            return;
        }
        try {
            await window.ApiClient.delete(`/admin/cluster/k8s/networkpolicies/${namespace}/${name}`);
            if (window.showAlert) {
                window.showAlert('success', 'Đã xóa NetworkPolicy thành công');
            } else {
                alert('Đã xóa NetworkPolicy thành công');
            }
            loadNetworkPolicies();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi xóa NetworkPolicy: ' + (error.message || ''));
            } else {
                alert('Lỗi khi xóa NetworkPolicy: ' + (error.message || ''));
            }
        }
    };

    // ===================== RBAC =====================

    let rbacData = {
        roles: [],
        clusterRoles: [],
        roleBindings: [],
        clusterRoleBindings: []
    };

    async function loadRBAC() {
        try {
            const [rolesRes, clusterRolesRes, roleBindingsRes, clusterRoleBindingsRes] = await Promise.all([
                window.ApiClient.get('/admin/cluster/k8s/rbac/roles').catch(() => ({ roles: [] })),
                window.ApiClient.get('/admin/cluster/k8s/rbac/clusterroles').catch(() => ({ clusterRoles: [] })),
                window.ApiClient.get('/admin/cluster/k8s/rbac/rolebindings').catch(() => ({ roleBindings: [] })),
                window.ApiClient.get('/admin/cluster/k8s/rbac/clusterrolebindings').catch(() => ({ clusterRoleBindings: [] }))
            ]);

            rbacData.roles = rolesRes.roles || [];
            rbacData.clusterRoles = clusterRolesRes.clusterRoles || [];
            rbacData.roleBindings = roleBindingsRes.roleBindings || [];
            rbacData.clusterRoleBindings = clusterRoleBindingsRes.clusterRoleBindings || [];

            document.getElementById('roles-count').textContent = rbacData.roles.length;
            document.getElementById('clusterroles-count').textContent = rbacData.clusterRoles.length;
            document.getElementById('rolebindings-count').textContent = rbacData.roleBindings.length;
            document.getElementById('clusterrolebindings-count').textContent = rbacData.clusterRoleBindings.length;

            renderRoles();
            renderClusterRoles();
            renderRoleBindings();
            renderClusterRoleBindings();
        } catch (error) {
            console.error('Error loading RBAC:', error);
        }
    }

    function renderRoles() {
        const tbody = document.getElementById('roles-tbody');
        if (!tbody) return;

        const searchTerm = document.getElementById('roles-search')?.value.toLowerCase() || '';
        const namespaceFilter = document.getElementById('roles-namespace-filter')?.value || '';

        let filtered = rbacData.roles.filter(r => {
            if (namespaceFilter && r.namespace !== namespaceFilter) return false;
            if (searchTerm) {
                const name = (r.name || '').toLowerCase();
                const namespace = (r.namespace || '').toLowerCase();
                if (!name.includes(searchTerm) && !namespace.includes(searchTerm)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có Role nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filtered.map(role => `
            <tr>
                <td>${escapeHtml(role.namespace || '')}</td>
                <td><strong>${escapeHtml(role.name || '')}</strong></td>
                <td>${role.rules || 0}</td>
                <td>${escapeHtml(role.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeRole('${escapeHtml(role.namespace)}', '${escapeHtml(role.name)}')">
                        📄 Describe
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderClusterRoles() {
        const tbody = document.getElementById('clusterroles-tbody');
        if (!tbody) return;

        const searchTerm = document.getElementById('clusterroles-search')?.value.toLowerCase() || '';

        let filtered = rbacData.clusterRoles.filter(cr => {
            if (searchTerm) {
                const name = (cr.name || '').toLowerCase();
                if (!name.includes(searchTerm)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Không có ClusterRole nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filtered.map(cr => `
            <tr>
                <td><strong>${escapeHtml(cr.name || '')}</strong></td>
                <td>${cr.rules || 0}</td>
                <td>${escapeHtml(cr.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeClusterRole('${escapeHtml(cr.name)}')">
                        📄 Describe
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderRoleBindings() {
        const tbody = document.getElementById('rolebindings-tbody');
        if (!tbody) return;

        const searchTerm = document.getElementById('rolebindings-search')?.value.toLowerCase() || '';
        const namespaceFilter = document.getElementById('rolebindings-namespace-filter')?.value || '';

        let filtered = rbacData.roleBindings.filter(rb => {
            if (namespaceFilter && rb.namespace !== namespaceFilter) return false;
            if (searchTerm) {
                const name = (rb.name || '').toLowerCase();
                const namespace = (rb.namespace || '').toLowerCase();
                if (!name.includes(searchTerm) && !namespace.includes(searchTerm)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Không có RoleBinding nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filtered.map(rb => `
            <tr>
                <td>${escapeHtml(rb.namespace || '')}</td>
                <td><strong>${escapeHtml(rb.name || '')}</strong></td>
                <td>${escapeHtml(rb.roleRef || '')}</td>
                <td>${rb.subjects || 0}</td>
                <td>${escapeHtml(rb.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeRoleBinding('${escapeHtml(rb.namespace)}', '${escapeHtml(rb.name)}')">
                        📄 Describe
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function renderClusterRoleBindings() {
        const tbody = document.getElementById('clusterrolebindings-tbody');
        if (!tbody) return;

        const searchTerm = document.getElementById('clusterrolebindings-search')?.value.toLowerCase() || '';

        let filtered = rbacData.clusterRoleBindings.filter(crb => {
            if (searchTerm) {
                const name = (crb.name || '').toLowerCase();
                if (!name.includes(searchTerm)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có ClusterRoleBinding nào</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = filtered.map(crb => `
            <tr>
                <td><strong>${escapeHtml(crb.name || '')}</strong></td>
                <td>${escapeHtml(crb.roleRef || '')}</td>
                <td>${crb.subjects || 0}</td>
                <td>${escapeHtml(crb.age || '')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="describeClusterRoleBinding('${escapeHtml(crb.name)}')">
                        📄 Describe
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.describeRole = async function(namespace, name) {
        const message = 'Describe Role chưa được triển khai. Vui lòng sử dụng kubectl.';
        if (window.showAlert) {
            window.showAlert('info', message);
        } else {
            alert(message);
        }
    };

    window.describeClusterRole = async function(name) {
        const message = 'Describe ClusterRole chưa được triển khai. Vui lòng sử dụng kubectl.';
        if (window.showAlert) {
            window.showAlert('info', message);
        } else {
            alert(message);
        }
    };

    window.describeRoleBinding = async function(namespace, name) {
        const message = 'Describe RoleBinding chưa được triển khai. Vui lòng sử dụng kubectl.';
        if (window.showAlert) {
            window.showAlert('info', message);
        } else {
            alert(message);
        }
    };

    window.describeClusterRoleBinding = async function(name) {
        const message = 'Describe ClusterRoleBinding chưa được triển khai. Vui lòng sử dụng kubectl.';
        if (window.showAlert) {
            window.showAlert('info', message);
        } else {
            alert(message);
        }
    };

    // ===================== Initialize =====================

    function init() {
        // ConfigMaps
        const configMapsReload = document.getElementById('configmaps-reload');
        const configMapsSearch = document.getElementById('configmaps-search');
        const configMapsNamespaceFilter = document.getElementById('configmaps-namespace-filter');

        if (configMapsReload) {
            configMapsReload.addEventListener('click', loadConfigMaps);
        }
        if (configMapsSearch) {
            configMapsSearch.addEventListener('input', () => {
                filterConfigMaps(configMapsSearch.value.toLowerCase());
                renderConfigMaps();
            });
        }
        if (configMapsNamespaceFilter) {
            configMapsNamespaceFilter.addEventListener('change', loadConfigMaps);
        }

        // Secrets
        const secretsReload = document.getElementById('secrets-reload');
        const secretsSearch = document.getElementById('secrets-search');
        const secretsNamespaceFilter = document.getElementById('secrets-namespace-filter');

        if (secretsReload) {
            secretsReload.addEventListener('click', loadSecrets);
        }
        if (secretsSearch) {
            secretsSearch.addEventListener('input', () => {
                filterSecrets(secretsSearch.value.toLowerCase());
                renderSecrets();
            });
        }
        if (secretsNamespaceFilter) {
            secretsNamespaceFilter.addEventListener('change', loadSecrets);
        }

        // Network Policies
        const networkPoliciesReload = document.getElementById('networkpolicies-reload');
        const networkPoliciesSearch = document.getElementById('networkpolicies-search');
        const networkPoliciesNamespaceFilter = document.getElementById('networkpolicies-namespace-filter');

        if (networkPoliciesReload) {
            networkPoliciesReload.addEventListener('click', loadNetworkPolicies);
        }
        if (networkPoliciesSearch) {
            networkPoliciesSearch.addEventListener('input', () => {
                filterNetworkPolicies(networkPoliciesSearch.value.toLowerCase());
                renderNetworkPolicies();
            });
        }
        if (networkPoliciesNamespaceFilter) {
            networkPoliciesNamespaceFilter.addEventListener('change', loadNetworkPolicies);
        }

        // RBAC
        const rbacReload = document.getElementById('rbac-reload');
        if (rbacReload) {
            rbacReload.addEventListener('click', loadRBAC);
        }

        // RBAC search and filters
        const rolesSearch = document.getElementById('roles-search');
        const rolesNamespaceFilter = document.getElementById('roles-namespace-filter');
        if (rolesSearch) {
            rolesSearch.addEventListener('input', renderRoles);
        }
        if (rolesNamespaceFilter) {
            rolesNamespaceFilter.addEventListener('change', renderRoles);
        }

        const clusterRolesSearch = document.getElementById('clusterroles-search');
        if (clusterRolesSearch) {
            clusterRolesSearch.addEventListener('input', renderClusterRoles);
        }

        const roleBindingsSearch = document.getElementById('rolebindings-search');
        const roleBindingsNamespaceFilter = document.getElementById('rolebindings-namespace-filter');
        if (roleBindingsSearch) {
            roleBindingsSearch.addEventListener('input', renderRoleBindings);
        }
        if (roleBindingsNamespaceFilter) {
            roleBindingsNamespaceFilter.addEventListener('change', renderRoleBindings);
        }

        const clusterRoleBindingsSearch = document.getElementById('clusterrolebindings-search');
        if (clusterRoleBindingsSearch) {
            clusterRoleBindingsSearch.addEventListener('input', renderClusterRoleBindings);
        }

        // Load namespaces for filters
        loadNamespacesForFilters();

        // Load data based on current page
        if (document.getElementById('configmaps-tbody')) {
            loadConfigMaps();
        }
        if (document.getElementById('secrets-tbody')) {
            loadSecrets();
        }
        if (document.getElementById('networkpolicies-tbody')) {
            loadNetworkPolicies();
        }
        if (document.getElementById('roles-tbody')) {
            loadRBAC();
        }
    }

    async function loadNamespacesForFilters() {
        try {
            const response = await window.ApiClient.get('/admin/cluster/k8s/namespaces');
            const namespaces = response.namespaces || [];
            const escapeHtml = getEscapeHtml();
            const namespaceOptions = namespaces.map(ns => 
                `<option value="${escapeHtml(ns.name || '')}">${escapeHtml(ns.name || '')}</option>`
            ).join('');

            // Update all namespace filters
            ['configmaps', 'secrets', 'networkpolicies', 'roles', 'rolebindings'].forEach(prefix => {
                const filter = document.getElementById(`${prefix}-namespace-filter`);
                if (filter) {
                    const currentValue = filter.value;
                    filter.innerHTML = '<option value="">Tất cả namespace</option>' + namespaceOptions;
                    if (currentValue) {
                        filter.value = currentValue;
                    }
                }
            });
        } catch (error) {
            console.error('Error loading namespaces for filters:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export
    window.K8sConfigurationModule = {
        loadConfigMaps,
        loadSecrets,
        loadNetworkPolicies,
        loadRBAC
    };
})();

