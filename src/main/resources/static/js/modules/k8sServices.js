// Kubernetes Services Module
(function () {
    'use strict';

    let servicesData = [];
    let filteredData = [];

    // Helper function để escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    // Load services data
    async function loadServices() {
        const tbody = document.getElementById('services-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Đang tải...</td></tr>';

            const response = await window.ApiClient.get('/admin/cluster/k8s/services').catch(() => null);

            if (response && response.services) {
                servicesData = response.services || [];
                applyFilters();
            } else {
                servicesData = [];
                renderServices();
            }
        } catch (error) {
            console.error('Error loading services:', error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('services-search')?.value.toLowerCase() || '';
        const typeFilter = document.getElementById('services-type-filter')?.value || '';
        const namespaceFilter = document.getElementById('services-namespace-filter')?.value || '';

        filteredData = servicesData.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm)) ||
                (item.clusterIP && item.clusterIP.toLowerCase().includes(searchTerm));
            const matchType = !typeFilter || item.type === typeFilter;
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            return matchSearch && matchType && matchNamespace;
        });

        renderServices();
        updateNamespaceFilter();
    }

    // Update namespace filter options
    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('services-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        servicesData.forEach(item => namespaces.add(item.namespace));

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

    // Render services
    function renderServices() {
        const tbody = document.getElementById('services-tbody');
        if (!tbody) return;

        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có services</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(item => {
            const typeClass = getTypeClass(item.type);
            const externalIP = item.externalIP || '-';
            const clusterIP = item.clusterIP === 'None' ? '<none>' : (item.clusterIP || '-');

            return `
                <tr>
                    <td>${escapeHtml(item.namespace || '-')}</td>
                    <td><span class="fw-medium">${escapeHtml(item.name || '-')}</span></td>
                    <td><span class="badge ${typeClass} small">${escapeHtml(item.type || '-')}</span></td>
                    <td>${escapeHtml(clusterIP)}</td>
                    <td>${escapeHtml(externalIP)}</td>
                    <td class="text-muted small">${escapeHtml(item.ports || '-')}</td>
                    <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.K8sServicesModule.showDetail('${escapeHtml(item.namespace || '')}', '${escapeHtml(item.name || '')}')">
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
        alert(`Chi tiết Service: ${name} trong namespace ${namespace}`);
    }

    // Initialize module
    function init() {
        const reloadBtn = document.getElementById('services-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadServices();
            });
        }

        const searchInput = document.getElementById('services-search');
        const typeFilter = document.getElementById('services-type-filter');
        const namespaceFilter = document.getElementById('services-namespace-filter');

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

        loadServices();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.K8sServicesModule = {
        loadServices,
        showDetail
    };
})();

