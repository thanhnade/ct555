// Kubernetes Ingress Module
(function () {
    'use strict';

    let ingressData = [];
    let filteredData = [];

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

    // Load ingress data
    async function loadIngress() {
        const tbody = document.getElementById('ingress-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Đang tải...</td></tr>';

            const response = await window.ApiClient.get('/admin/cluster/k8s/ingress').catch(() => null);

            if (response && response.ingress) {
                ingressData = response.ingress || [];
                applyFilters();
            } else {
                ingressData = [];
                renderIngress();
            }
        } catch (error) {
            console.error('Error loading ingress:', error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }

    // Load ingress data ngầm (không hiển thị loading state, giữ dữ liệu cũ)
    async function loadIngressSilent() {
        try {
            const response = await window.ApiClient.get('/admin/cluster/k8s/ingress').catch(() => null);

            if (response && response.ingress) {
                ingressData = response.ingress || [];
                applyFilters();
            } else {
                // Nếu response null, giữ nguyên dữ liệu cũ
                return;
            }
        } catch (error) {
            console.error('Error loading ingress silently:', error);
            // Không hiển thị lỗi, giữ nguyên dữ liệu cũ
        }
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('ingress-search')?.value.toLowerCase() || '';
        const namespaceFilter = document.getElementById('ingress-namespace-filter')?.value || '';

        filteredData = ingressData.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm)) ||
                (item.host && item.host.toLowerCase().includes(searchTerm)) ||
                (item.address && item.address.toLowerCase().includes(searchTerm));
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            return matchSearch && matchNamespace;
        });

        renderIngress();
        updateNamespaceFilter();
    }

    // Update namespace filter options
    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('ingress-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        ingressData.forEach(item => namespaces.add(item.namespace));

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

    // Render ingress
    function renderIngress() {
        const tbody = document.getElementById('ingress-tbody');
        if (!tbody) return;

        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có ingress</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(item => {
            const host = item.host || (item.hosts && item.hosts.length > 0 ? item.hosts[0] : '*');
            const address = item.address || (item.addresses && item.addresses.length > 0 ? item.addresses[0] : '-');
            const ports = item.ports ? item.ports.join(', ') : '80,443';
            const isSystem = isSystemNamespace(item.namespace);
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `
                <tr>
                    <td><code>${escapeHtml(namespace)}</code></td>
                    <td><span class="fw-medium">${escapeHtml(name)}</span></td>
                    <td class="text-muted small"><code>${escapeHtml(item.class || '-')}</code></td>
                    <td class="text-muted small">${escapeHtml(host)}</td>
                    <td class="text-muted small">${escapeHtml(address)}</td>
                    <td class="text-muted small">${escapeHtml(ports)}</td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-info" onclick="window.K8sIngressModule.describeIngress('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${!isSystem ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sIngressModule.deleteIngress('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                                <i class="bi bi-trash"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Describe ingress
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

    // Delete ingress
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
            // Load dữ liệu ngầm (không hiển thị loading state, giữ dữ liệu cũ)
            await loadIngressSilent();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi xóa ingress');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi xóa ingress'));
            }
        }
    }

    // Initialize module
    function init() {
        const reloadBtn = document.getElementById('ingress-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadIngress();
            });
        }

        const searchInput = document.getElementById('ingress-search');
        const namespaceFilter = document.getElementById('ingress-namespace-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyFilters();
            });
        }

        if (namespaceFilter) {
            namespaceFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        loadIngress();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.K8sIngressModule = {
        loadIngress,
        describeIngress,
        deleteIngress
    };
})();

