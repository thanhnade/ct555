// Kubernetes Namespaces Module
(function () {
    'use strict';

    let namespacesData = [];
    let filteredData = [];
    const deletingNamespaces = new Set(); // Theo dõi các namespace đang được xóa
    let namespaceDetailRequestId = 0;
    let namespaceDetailState = {
        name: '',
        yamlLoaded: false,
        yamlLoading: false
    };

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

    function normalizeCpuCores(cpuValue) {
        let cpuRaw = typeof cpuValue === 'number' ? cpuValue : parseFloat(cpuValue || '0');
        if (!Number.isFinite(cpuRaw)) {
            return 0;
        }
        if (cpuRaw > 1000) {
            cpuRaw = cpuRaw / 1_000_000_000.0;
        }
        return cpuRaw;
    }

    function formatCpuDisplay(cpuValue) {
        const cores = normalizeCpuCores(cpuValue);
        if (cores <= 0) return '0';
        if (cores < 1) {
            return Math.round(cores * 1000) + 'm';
        }
        return cores.toFixed(2).replace(/\.?0+$/, '');
    }

    function normalizeRamMi(ramValue) {
        let ramRaw = typeof ramValue === 'number' ? ramValue : parseFloat(ramValue || '0');
        if (!Number.isFinite(ramRaw)) {
            return 0;
        }
        return ramRaw;
    }

    function formatRamDisplay(ramValue) {
        const ramMi = normalizeRamMi(ramValue);
        if (ramMi <= 0) return '0 Mi';
        if (ramMi >= 1024) {
            const gib = ramMi / 1024;
            return gib.toFixed(2).replace(/\.?0+$/, '') + ' Gi';
        }
        return Math.round(ramMi) + ' Mi';
    }

    function formatKeyValueBadges(obj, badgeClass = 'bg-secondary') {
        const entries = Object.entries(obj || {});
        if (entries.length === 0) {
            return '<span class="text-muted">Không có</span>';
        }
        return entries.map(([k, v]) => `<span class="badge ${badgeClass} me-1 mb-1">${escapeHtml(k)}=${escapeHtml(v)}</span>`).join('');
    }

    function formatAnnotationsList(annotations) {
        const entries = Object.entries(annotations || {});
        if (entries.length === 0) {
            return '<span class="text-muted">Không có</span>';
        }
        return entries.map(([k, v]) => `
            <div class="border rounded p-2 mb-2">
                <div class="text-uppercase small text-muted fw-semibold">${escapeHtml(k)}</div>
                <div class="font-monospace small text-break">${escapeHtml(String(v))}</div>
            </div>
        `).join('');
    }

    function formatFinalizersList(finalizers) {
        if (!Array.isArray(finalizers) || finalizers.length === 0) {
            return '<span class="text-muted">Không có</span>';
        }
        return `<div class="d-flex flex-wrap gap-1">${finalizers
            .map(item => `<span class="badge bg-dark">${escapeHtml(item)}</span>`)
            .join('')}</div>`;
    }

    function formatConditionsTable(conditions) {
        if (!Array.isArray(conditions) || conditions.length === 0) {
            return '<span class="text-muted">Không có</span>';
        }
        const rows = conditions.map(cond => {
            const lastTransition = cond.lastTransitionTime ? new Date(cond.lastTransitionTime).toLocaleString('vi-VN') : '-';
            const message = cond.message ? `<div class="text-muted small">${escapeHtml(cond.message)}</div>` : '';
            return `
                <tr>
                    <td><strong>${escapeHtml(cond.type || '-')}</strong></td>
                    <td>${escapeHtml(cond.status || '-')}</td>
                    <td>
                        <div>${escapeHtml(cond.reason || '-')}</div>
                        ${message}
                    </td>
                    <td class="text-muted small">${lastTransition}</td>
                </tr>
            `;
        }).join('');
        return `
            <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Reason</th>
                            <th>Last update</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    function getSpinnerHtml() {
        return '<div class="text-center py-3 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</div>';
    }

    function resetNamespaceYamlSection() {
        const yamlEl = document.getElementById('namespace-detail-yaml');
        if (yamlEl) {
            yamlEl.textContent = 'Chọn tab YAML để tải manifest...';
        }
        const copyBtn = document.getElementById('namespace-detail-yaml-copy-btn');
        if (copyBtn) {
            copyBtn.disabled = true;
        }
    }

    function setupNamespaceYamlTab(name) {
        const yamlTabBtn = document.querySelector('#namespace-detail-tabs button[data-bs-target="#namespace-yaml-tab"]');
        if (!yamlTabBtn || typeof bootstrap === 'undefined' || !bootstrap.Tab) return;
        if (yamlTabBtn._handler) {
            yamlTabBtn.removeEventListener('shown.bs.tab', yamlTabBtn._handler);
        }
        const handler = () => loadNamespaceYaml(name);
        yamlTabBtn._handler = handler;
        yamlTabBtn.addEventListener('shown.bs.tab', handler);
    }

    async function loadNamespaceYaml(name) {
        if (namespaceDetailState.name !== name) {
            namespaceDetailState = { name, yamlLoaded: false, yamlLoading: false };
        }
        if (namespaceDetailState.yamlLoaded || namespaceDetailState.yamlLoading) {
            return;
        }
        namespaceDetailState.yamlLoading = true;
        const yamlEl = document.getElementById('namespace-detail-yaml');
        if (yamlEl) {
            yamlEl.textContent = 'Đang tải YAML...';
        }
        const copyBtn = document.getElementById('namespace-detail-yaml-copy-btn');
        if (copyBtn) {
            copyBtn.disabled = true;
        }
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/namespaces/${encodeURIComponent(name)}?format=yaml`);
            if (namespaceDetailState.name !== name) {
                return;
            }
            const yamlContent = data?.output || '# Không có dữ liệu YAML';
            if (yamlEl) {
                yamlEl.textContent = yamlContent;
            }
            if (copyBtn) {
                copyBtn.disabled = !yamlContent || yamlContent.startsWith('# Failed');
            }
            namespaceDetailState.yamlLoaded = true;
            namespaceDetailState.yamlLoading = false;
        } catch (error) {
            if (namespaceDetailState.name !== name) {
                return;
            }
            namespaceDetailState.yamlLoading = false;
            const message = error?.message || 'Không tải được YAML';
            if (yamlEl) {
                yamlEl.textContent = message;
            }
            const copyBtnErr = document.getElementById('namespace-detail-yaml-copy-btn');
            if (copyBtnErr) {
                copyBtnErr.disabled = true;
            }
            if (window.showAlert) {
                window.showAlert('error', message);
            }
        }
    }

    async function copyNamespaceYaml() {
        const yamlEl = document.getElementById('namespace-detail-yaml');
        if (!yamlEl) return;
        const text = yamlEl.textContent || '';
        if (!text || text.startsWith('Không tải được') || text.startsWith('Chọn tab YAML')) {
            return;
        }
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else if (window.K8sHelpers && typeof window.K8sHelpers.copyText === 'function') {
                window.K8sHelpers.copyText(text);
            } else {
                throw new Error('Clipboard API không khả dụng');
            }
            if (window.showAlert) {
                window.showAlert('success', 'Đã copy YAML của namespace vào clipboard');
            }
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', error?.message || 'Không copy được nội dung');
            }
        }
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
            const cpuDisplay = formatCpuDisplay(item.cpu);
            const ramDisplay = formatRamDisplay(item.ram);

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
                        <button class="btn btn-sm btn-outline-info px-2 d-flex align-items-center gap-1" onclick="window.K8sNamespacesModule.describeNamespace('${escapeHtml(name)}')" title="Xem chi tiết">
                            <i class="bi bi-eye"></i><span>View</span>
                        </button>
                        ${!isSystem && !isDeleting ? `<button class="btn btn-sm btn-outline-danger" onclick="window.K8sNamespacesModule.deleteNamespace('${escapeHtml(name)}')" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    function setNamespaceDetailSummary(name, summary) {
        const titleEl = document.getElementById('namespace-detail-title');
        if (titleEl) {
            titleEl.textContent = name;
        }
        const statusEl = document.getElementById('namespace-detail-status');
        const podsEl = document.getElementById('namespace-detail-pods');
        const cpuEl = document.getElementById('namespace-detail-cpu');
        const ramEl = document.getElementById('namespace-detail-ram');

        if (statusEl) {
            if (summary && summary.status) {
                const cls = getStatusClass(summary.status);
                statusEl.innerHTML = `<span class="badge ${cls}">${escapeHtml(summary.status)}</span>`;
            } else {
                statusEl.innerHTML = '<span class="badge bg-secondary">Unknown</span>';
            }
        }
        if (podsEl) {
            const pods = summary && summary.pods !== undefined ? summary.pods : '-';
            podsEl.textContent = pods;
        }
        if (cpuEl) {
            cpuEl.textContent = summary && summary.cpu !== undefined ? formatCpuDisplay(summary.cpu) : '0';
        }
        if (ramEl) {
            ramEl.textContent = summary && summary.ram !== undefined ? formatRamDisplay(summary.ram) : '0 Mi';
        }
    }

    function setNamespaceDetailLoading() {
        const placeholders = [
            'namespace-detail-basic',
            'namespace-detail-labels',
            'namespace-detail-annotations',
            'namespace-detail-finalizers',
            'namespace-detail-conditions'
        ];
        placeholders.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = getSpinnerHtml();
            }
        });
        resetNamespaceYamlSection();
        const lastUpdatedEl = document.getElementById('namespace-detail-last-updated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = '';
        }
    }

    function setNamespaceDefaultTab() {
        try {
            const overviewTabBtn = document.querySelector('#namespace-detail-tabs button[data-bs-target="#namespace-overview"]');
            if (overviewTabBtn && window.bootstrap && typeof window.bootstrap.Tab === 'function') {
                window.bootstrap.Tab.getOrCreateInstance(overviewTabBtn).show();
            }
        } catch (error) {
            console.warn('Không đặt được tab mặc định cho namespace detail:', error);
        }
    }

    function parseNamespaceOutput(output) {
        if (!output) return {};
        try {
            return JSON.parse(output);
        } catch (error) {
            console.warn('Không parse được namespace JSON:', error);
            return {};
        }
    }

    function populateNamespaceDetailContent(namespaceObj) {
        const metadata = namespaceObj.metadata || {};
        const status = namespaceObj.status || {};
        const spec = namespaceObj.spec || {};
        const creation = metadata.creationTimestamp
            ? new Date(metadata.creationTimestamp).toLocaleString('vi-VN')
            : '-';

        const basicEl = document.getElementById('namespace-detail-basic');
        if (basicEl) {
            basicEl.innerHTML = `
                <div class="row g-3">
                    <div class="col-12">
                        <div class="fw-semibold text-uppercase small text-muted">Name</div>
                        <div><code>${escapeHtml(metadata.name || '-')}</code></div>
                    </div>
                    <div class="col-md-6">
                        <div class="fw-semibold text-uppercase small text-muted">Created</div>
                        <div class="text-muted small">${creation}</div>
                    </div>
                    <div class="col-md-6">
                        <div class="fw-semibold text-uppercase small text-muted">UID</div>
                        <div class="text-muted small"><code>${escapeHtml(metadata.uid || '-')}</code></div>
                    </div>
                    <div class="col-md-6">
                        <div class="fw-semibold text-uppercase small text-muted">Resource Version</div>
                        <div class="text-muted small"><code>${escapeHtml(metadata.resourceVersion || '-')}</code></div>
                    </div>
                    <div class="col-md-6">
                        <div class="fw-semibold text-uppercase small text-muted">Phase</div>
                        <div>${escapeHtml(status.phase || 'Unknown')}</div>
                    </div>
                </div>
            `;
        }

        const labelsEl = document.getElementById('namespace-detail-labels');
        if (labelsEl) {
            labelsEl.innerHTML = formatKeyValueBadges(metadata.labels || {}, 'bg-primary');
        }

        const annotationsEl = document.getElementById('namespace-detail-annotations');
        if (annotationsEl) {
            annotationsEl.innerHTML = formatAnnotationsList(metadata.annotations || {});
        }

        const finalizersEl = document.getElementById('namespace-detail-finalizers');
        if (finalizersEl) {
            finalizersEl.innerHTML = formatFinalizersList(spec.finalizers);
        }

        const conditionsEl = document.getElementById('namespace-detail-conditions');
        if (conditionsEl) {
            conditionsEl.innerHTML = formatConditionsTable(status.conditions);
        }

    }

    async function describeNamespace(name) {
        const modalEl = document.getElementById('namespace-detail-modal');
        const bootstrapReady = typeof bootstrap !== 'undefined' && bootstrap.Modal;

        if (!modalEl || !bootstrapReady) {
            return showNamespaceRawDescribe(name);
        }

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        const summary = namespacesData.find(ns => ns.name === name);
        setNamespaceDetailSummary(name, summary);
        setNamespaceDetailLoading();
        namespaceDetailState = { name, yamlLoaded: false, yamlLoading: false };
        setupNamespaceYamlTab(name);
        namespaceDetailRequestId += 1;
        const currentRequestId = namespaceDetailRequestId;

        const lastUpdatedEl = document.getElementById('namespace-detail-last-updated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = 'Đang tải chi tiết...';
        }

        const yamlCopyBtn = document.getElementById('namespace-detail-yaml-copy-btn');
        if (yamlCopyBtn) {
            yamlCopyBtn.onclick = copyNamespaceYaml;
            yamlCopyBtn.disabled = true;
        }

        setNamespaceDefaultTab();
        modal.show();

        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/namespaces/${encodeURIComponent(name)}`);
            if (currentRequestId !== namespaceDetailRequestId) {
                return; // Có request mới hơn
            }
            const namespaceObj = parseNamespaceOutput(data.output);
            populateNamespaceDetailContent(namespaceObj);
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = `Cập nhật lúc ${new Date().toLocaleString('vi-VN')}`;
            }
        } catch (error) {
            if (currentRequestId !== namespaceDetailRequestId) {
                return;
            }
            const message = error?.message || 'Lỗi lấy thông tin namespace';
            const basicEl = document.getElementById('namespace-detail-basic');
            if (basicEl) {
                basicEl.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(message)}</div>`;
            }
            if (lastUpdatedEl) {
                lastUpdatedEl.textContent = '';
            }
            if (window.showAlert) {
                window.showAlert('error', message);
            }
        }
    }

    async function showNamespaceRawDescribe(name) {
        try {
            const data = await window.ApiClient.get(`/admin/cluster/k8s/namespaces/${encodeURIComponent(name)}`);
            showK8sOutput(`Namespace ${name}`, data.output || '');
        } catch (error) {
            const message = error?.message || 'Lỗi lấy thông tin namespace';
            if (window.showAlert) {
                window.showAlert('error', message);
            } else {
                alert('Lỗi: ' + message);
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
        viewNamespaceDetail: describeNamespace,
        showNamespaceRawDescribe,
        deleteNamespace
    };
})();

