// Kubernetes Ingress Module
(function () {
    'use strict';

    let ingressData = [];
    let filteredData = [];

    // Helper function để escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

            return `
                <tr>
                    <td>${escapeHtml(item.namespace || '-')}</td>
                    <td><span class="fw-medium">${escapeHtml(item.name || '-')}</span></td>
                    <td class="text-muted small">${escapeHtml(item.class || '-')}</td>
                    <td>${escapeHtml(host)}</td>
                    <td>${escapeHtml(address)}</td>
                    <td class="text-muted small">${escapeHtml(ports)}</td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.K8sIngressModule.showDetail('${escapeHtml(item.namespace || '')}', '${escapeHtml(item.name || '')}')">
                            Chi tiết
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Show detail (placeholder)
    function showDetail(namespace, name) {
        console.log('Show detail:', namespace, name);
        // TODO: Implement detail modal
        alert(`Chi tiết Ingress: ${name} trong namespace ${namespace}`);
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
        showDetail
    };
})();

