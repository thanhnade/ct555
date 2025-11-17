// Kubernetes Namespaces Module
(function () {
    'use strict';

    let namespacesData = [];
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
        if (s === 'ACTIVE') return 'bg-success';
        if (s === 'TERMINATING') return 'bg-danger';
        if (s === 'PENDING') return 'bg-warning text-dark';
        return 'bg-secondary';
    }

    // Show loading state
    function showLoadingState() {
        const tbody = document.getElementById('namespaces-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
        }
    }

    // Load namespaces data
    async function loadNamespaces() {
        const tbody = document.getElementById('namespaces-tbody');
        if (!tbody) return;

        try {
            // Hiển thị loading state với spinner
            showLoadingState();

            const response = await window.ApiClient.get('/admin/cluster/k8s/namespaces').catch(() => null);

            if (response && response.namespaces) {
                namespacesData = response.namespaces || [];
                applyFilters();
            } else {
                namespacesData = [];
                renderNamespaces();
            }
        } catch (error) {
            console.error('Error loading namespaces:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
        }
    }

    // Apply filters
    function applyFilters() {
        const searchTerm = document.getElementById('namespaces-search')?.value.toLowerCase() || '';
        const statusFilter = document.getElementById('namespaces-status-filter')?.value || '';

        filteredData = namespacesData.filter(item => {
            const matchSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm));
            const matchStatus = !statusFilter || item.status === statusFilter;
            return matchSearch && matchStatus;
        });

        renderNamespaces();
    }

    // Render namespaces
    function renderNamespaces() {
        const tbody = document.getElementById('namespaces-tbody');
        if (!tbody) return;

        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Không có namespaces</td></tr>';
            return;
        }

        tbody.innerHTML = filteredData.map(item => {
            const statusClass = getStatusClass(item.status);
            const status = item.status || 'Unknown';
            const pods = item.pods !== undefined ? item.pods : 0;
            const cpuRaw = typeof item.cpu === 'number' ? item.cpu : parseFloat(item.cpu || '0');
            const ramRaw = typeof item.ram === 'number' ? item.ram : parseFloat(item.ram || '0');

            const cpuDisplay = Number.isFinite(cpuRaw) ? cpuRaw : 0;
            const ramDisplay = Number.isFinite(ramRaw) ? ramRaw : 0;

            return `<tr>
                <td><span class="fw-medium">${escapeHtml(item.name || '-')}</span></td>
                <td>${pods}</td>
                <td>${cpuDisplay}</td>
                <td>${ramDisplay}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="window.K8sNamespacesModule.showDetail('${escapeHtml(item.name || '')}')">
                        Chi tiết
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // Show detail (placeholder)
    function showDetail(name) {
        console.log('Show detail:', name);
        // TODO: Implement detail modal
        alert(`Chi tiết Namespace: ${name}`);
    }

    // Initialize module
    function init() {
        const reloadBtn = document.getElementById('namespaces-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadNamespaces();
            });
        }

        const searchInput = document.getElementById('namespaces-search');
        const statusFilter = document.getElementById('namespaces-status-filter');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                applyFilters();
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                applyFilters();
            });
        }

        loadNamespaces();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.K8sNamespacesModule = {
        loadNamespaces,
        showDetail
    };
})();

