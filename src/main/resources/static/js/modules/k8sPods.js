// Kubernetes Pods Module
(function () {
    'use strict';

    let podsData = [];
    let filteredData = [];

    // Helper function để escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Helper function để lấy status badge class
    function getStatusClass(status) {
        if (!status) return 'bg-secondary';
        const s = status.toUpperCase();
        if (s === 'RUNNING') return 'bg-success';
        if (s === 'PENDING') return 'bg-warning text-dark';
        if (s === 'SUCCEEDED') return 'bg-info text-dark';
        if (s === 'FAILED' || s === 'CRASHLOOPBACKOFF') return 'bg-danger';
        return 'bg-secondary';
    }

    // Load pods data
    async function loadPods() {
        const tbody = document.getElementById('pods-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Đang tải...</td></tr>';

            const response = await window.ApiClient.get('/admin/cluster/k8s/pods').catch(() => null);

            if (response && response.pods) {
                podsData = response.pods || [];
                applyFilters();
            } else {
                podsData = [];
                renderPods();
            }
        } catch (error) {
            console.error('Error loading pods:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('pods-search')?.value.toLowerCase() || '';
        const namespaceFilter = document.getElementById('pods-namespace-filter')?.value || '';
        const statusFilter = document.getElementById('pods-status-filter')?.value || '';

        filteredData = podsData.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.namespace && item.namespace.toLowerCase().includes(searchTerm)) ||
                (item.node && item.node.toLowerCase().includes(searchTerm));
            const matchNamespace = !namespaceFilter || item.namespace === namespaceFilter;
            const matchStatus = !statusFilter || item.status === statusFilter;
            return matchSearch && matchNamespace && matchStatus;
        });

        renderPods();
        updateNamespaceFilter();
    }

    // Update namespace filter options
    function updateNamespaceFilter() {
        const namespaceFilter = document.getElementById('pods-namespace-filter');
        if (!namespaceFilter) return;

        const namespaces = new Set();
        podsData.forEach(item => namespaces.add(item.namespace));

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

    // Render pods
    function renderPods() {
        const tbody = document.getElementById('pods-tbody');
        if (!tbody) return;

        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có pods</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(item => {
            const statusClass = getStatusClass(item.status);
            const status = item.status || 'Unknown';
            const ready = item.ready || '0/0';
            const node = item.node || '-';

            return `<tr>
                <td>${escapeHtml(item.namespace || '-')}</td>
                <td><span class="fw-medium">${escapeHtml(item.name || '-')}</span></td>
                <td>${escapeHtml(ready)}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td class="text-muted small">${escapeHtml(node)}</td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="window.K8sPodsModule.showDetail('${escapeHtml(item.namespace || '')}', '${escapeHtml(item.name || '')}')">
                        Chi tiết
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // Show detail (placeholder)
    function showDetail(namespace, name) {
        console.log('Show detail:', namespace, name);
        // TODO: Implement detail modal
        alert(`Chi tiết Pod: ${name} trong namespace ${namespace}`);
    }

    // Initialize module
    function init() {
        const reloadBtn = document.getElementById('pods-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadPods();
            });
        }

        const searchInput = document.getElementById('pods-search');
        const namespaceFilter = document.getElementById('pods-namespace-filter');
        const statusFilter = document.getElementById('pods-status-filter');

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

        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        loadPods();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.K8sPodsModule = {
        loadPods,
        showDetail
    };
})();

