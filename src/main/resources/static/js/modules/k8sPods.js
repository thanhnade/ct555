// Kubernetes Pods Module
(function () {
    'use strict';

    let podsData = [];
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

    // Load pods data ngầm (không hiển thị loading state, giữ dữ liệu cũ)
    async function loadPodsSilent() {
        try {
            const response = await window.ApiClient.get('/admin/cluster/k8s/pods').catch(() => null);

            if (response && response.pods) {
                podsData = response.pods || [];
                applyFilters();
            } else {
                // Nếu response null, giữ nguyên dữ liệu cũ
                return;
            }
        } catch (error) {
            console.error('Error loading pods silently:', error);
            // Không hiển thị lỗi, giữ nguyên dữ liệu cũ
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

            const canDelete = !isSystemNamespace(item.namespace);
            const namespace = item.namespace || '';
            const name = item.name || '';

            return `<tr>
                <td><code>${escapeHtml(namespace)}</code></td>
                <td><span class="fw-medium">${escapeHtml(name)}</span></td>
                <td>${escapeHtml(ready)}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td class="text-muted small">${escapeHtml(node)}</td>
                <td class="text-muted small">${escapeHtml(item.age || '-')}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-info" onclick="window.K8sPodsModule.describePod('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sPodsModule.deletePod('${escapeHtml(namespace)}', '${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Describe pod
    async function describePod(namespace, name, format = 'json') {
        try {
            const formatParam = format === 'yaml' ? '?format=yaml' : '';
            const data = await window.ApiClient.get(`/admin/cluster/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${formatParam}`);
            showK8sOutput(`Pod ${namespace}/${name} (${data.format || 'json'})`, data.output || '');
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi lấy thông tin pod');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi lấy thông tin pod'));
            }
        }
    }

    // Delete pod
    async function deletePod(namespace, name) {
        if (isSystemNamespace(namespace)) {
            if (window.showAlert) {
                window.showAlert('warning', 'Không cho phép xóa pod trong namespace hệ thống');
            } else {
                alert('Không cho phép xóa pod trong namespace hệ thống');
            }
            return;
        }
        if (!confirm(`Xóa pod ${namespace}/${name}?`)) return;

        try {
            const data = await window.ApiClient.delete(`/admin/cluster/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
            if (window.showAlert) {
                window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `pod "${name}" deleted`)}</pre>`);
            }
            // Load dữ liệu ngầm (không hiển thị loading state, giữ dữ liệu cũ)
            await loadPodsSilent();
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error.message || 'Lỗi xóa pod');
            } else {
                alert('Lỗi: ' + (error.message || 'Lỗi xóa pod'));
            }
        }
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
        describePod,
        deletePod
    };
})();

