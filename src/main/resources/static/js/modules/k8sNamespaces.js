// Kubernetes Namespaces Module
(function () {
    'use strict';

    let namespacesData = [];
    let filteredData = [];
    const deletingNamespaces = new Set(); // Theo dõi các namespace đang được xóa

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

    // Load namespaces data ngầm (không hiển thị loading state, giữ dữ liệu cũ)
    async function loadNamespacesSilent() {
        try {
            const response = await window.ApiClient.get('/admin/cluster/k8s/namespaces').catch(() => null);

            if (response && response.namespaces) {
                namespacesData = response.namespaces || [];
                applyFilters();
            } else {
                // Nếu response null, giữ nguyên dữ liệu cũ
                return;
            }
        } catch (error) {
            console.error('Error loading namespaces silently:', error);
            // Không hiển thị lỗi, giữ nguyên dữ liệu cũ
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
            let cpuRaw = typeof item.cpu === 'number' ? item.cpu : parseFloat(item.cpu || '0');
            const ramRaw = typeof item.ram === 'number' ? item.ram : parseFloat(item.ram || '0');

            // Kiểm tra nếu CPU là nano cores (giá trị lớn hơn 1000) thì convert sang cores
            // Backend có thể trả về nano cores hoặc cores tùy trường hợp
            if (cpuRaw > 1000) {
                // Có thể là nano cores, convert sang cores
                cpuRaw = cpuRaw / 1_000_000_000.0;
            }

            // Format CPU: nếu < 1 core thì hiển thị millicores (m), nếu >= 1 thì hiển thị cores
            let cpuDisplay = '0';
            if (Number.isFinite(cpuRaw) && cpuRaw > 0) {
                if (cpuRaw < 1) {
                    const millicores = Math.round(cpuRaw * 1000);
                    cpuDisplay = millicores + 'm';
                } else {
                    cpuDisplay = cpuRaw.toFixed(2) + '';
                    // Xóa trailing zeros
                    cpuDisplay = cpuDisplay.replace(/\.?0+$/, '');
                }
            }

            // Format RAM: đã là Mi, hiển thị với đơn vị Mi hoặc Gi nếu >= 1024 Mi
            let ramDisplay = '0 Mi';
            if (Number.isFinite(ramRaw) && ramRaw > 0) {
                if (ramRaw >= 1024) {
                    const gib = (ramRaw / 1024).toFixed(2);
                    ramDisplay = gib.replace(/\.?0+$/, '') + ' Gi';
                } else {
                    const mi = Math.round(ramRaw);
                    ramDisplay = mi + ' Mi';
                }
            }

            const isSystem = isSystemNamespace(item.name);
            const isDeleting = deletingNamespaces.has(item.name);
            const name = item.name || '';

            return `<tr>
                <td><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td>${pods}</td>
                <td>${cpuDisplay}</td>
                <td>${ramDisplay}</td>
                <td>${isDeleting ? '<span class="badge bg-warning">Đang xóa...</span>' : `<span class="badge ${statusClass}">${escapeHtml(status)}</span>`}</td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sNamespacesModule.describeNamespace('${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${!isSystem && !isDeleting ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sNamespacesModule.deleteNamespace('${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Describe namespace
    async function describeNamespace(name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/namespaces/${encodeURIComponent(name)}`);
            showK8sOutput(`Namespace ${name}`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin namespace');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin namespace'));
            }
        }
    }

    // Delete namespace
    async function deleteNamespace(name) {
        if (isSystemNamespace(name)) {
            if (window.showAlert) {
                window.showAlert('warning', 'Không cho phép xóa namespace hệ thống');
            } else {
                alert('Không cho phép xóa namespace hệ thống');
            }
            return;
        }
        if (deletingNamespaces.has(name)) {
            return; // Đang xóa rồi
        }
        if (!confirm(`Xóa namespace "${name}"?\n\nCảnh báo: Tất cả tài nguyên trong namespace này sẽ bị xóa vĩnh viễn!\n\nQuá trình này có thể mất vài phút...`)) {
            return;
        }

        deletingNamespaces.add(name);
        renderNamespaces();
        if (window.showAlert) {
            window.showAlert('info', `Đang xóa namespace "${name}"... Vui lòng đợi (có thể mất vài phút nếu namespace có nhiều tài nguyên).`);
        }

        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/namespaces/${encodeURIComponent(name)}`);
            deletingNamespaces.delete(name);
            if (window.showAlert) {
                window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `namespace "${name}" deleted`)}</pre>`);
            }
            // Load dữ liệu ngầm (không hiển thị loading state, giữ dữ liệu cũ)
            await loadNamespacesSilent();
        } catch (error) {
            deletingNamespaces.delete(name);
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi xóa namespace');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi xóa namespace'));
            }
            renderNamespaces();
        }
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
        describeNamespace,
        deleteNamespace
    };
})();

