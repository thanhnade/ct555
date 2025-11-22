// Kubernetes Events Module
(function () {
    'use strict';

    let eventsData = [];
    let filteredEvents = [];

    // Helper function
    function getEventTypeBadgeClass(type) {
        if (!type) return 'bg-secondary';
        const t = type.toUpperCase();
        if (t === 'NORMAL') return 'bg-info';
        if (t === 'WARNING') return 'bg-warning text-dark';
        return 'bg-secondary';
    }

    async function loadEvents() {
        const tbody = document.getElementById('events-tbody');
        if (!tbody) return;

        const namespaceFilter = document.getElementById('events-namespace-filter')?.value || '';
        const typeFilter = document.getElementById('events-type-filter')?.value || '';
        const kindFilter = document.getElementById('events-kind-filter')?.value || '';
        const searchTerm = document.getElementById('events-search')?.value.toLowerCase() || '';

        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';

        try {
            let url = '/admin/cluster/k8s/events?limit=500';
            if (namespaceFilter) {
                url += '&namespace=' + encodeURIComponent(namespaceFilter);
            }
            if (kindFilter) {
                url += '&involvedObjectKind=' + encodeURIComponent(kindFilter);
            }

            const response = await window.ApiClient.get(url);
            eventsData = response.events || [];
            filterEvents(searchTerm, typeFilter, kindFilter);
            renderEvents();
        } catch (error) {
            console.error('Error loading Events:', error);
            const errorMsg = error.message || 'Lỗi khi tải Events';
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-3">${window.K8sHelpers?.escapeHtml(errorMsg) || errorMsg}</td></tr>`;
        }
    }

    function filterEvents(searchTerm, typeFilter, kindFilter) {
        filteredEvents = eventsData.filter(event => {
            // Type filter
            if (typeFilter && event.type !== typeFilter) {
                return false;
            }

            // Kind filter
            if (kindFilter && event.involvedObjectKind !== kindFilter) {
                return false;
            }

            // Search filter
            if (searchTerm) {
                const name = (event.involvedObjectName || '').toLowerCase();
                const namespace = (event.namespace || '').toLowerCase();
                const reason = (event.reason || '').toLowerCase();
                const message = (event.message || '').toLowerCase();
                if (!name.includes(searchTerm) && !namespace.includes(searchTerm) &&
                    !reason.includes(searchTerm) && !message.includes(searchTerm)) {
                    return false;
                }
            }

            return true;
        });
    }

    function renderEvents() {
        const tbody = document.getElementById('events-tbody');
        if (!tbody) return;

        if (filteredEvents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-3">Không có Event nào</td></tr>';
            return;
        }

        const escapeHtml = window.K8sHelpers?.escapeHtml || ((text) => text || '');
        tbody.innerHTML = filteredEvents.map(event => {
            const typeClass = getEventTypeBadgeClass(event.type);
            return `
                <tr>
                    <td><span class="badge ${typeClass}">${escapeHtml(event.type || '')}</span></td>
                    <td>${escapeHtml(event.namespace || '')}</td>
                    <td>${escapeHtml(event.involvedObjectKind || '')}</td>
                    <td><strong>${escapeHtml(event.involvedObjectName || '')}</strong></td>
                    <td>${escapeHtml(event.reason || '')}</td>
                    <td class="text-break" style="max-width: 300px;">${escapeHtml(event.message || '')}</td>
                    <td>${event.count || 0}</td>
                    <td>${escapeHtml(event.age || '')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="describeEvent('${escapeHtml(event.namespace)}', '${escapeHtml(event.name)}')">
                            📄 Describe
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.describeEvent = async function(namespace, name) {
        try {
            const response = await window.ApiClient.get(`/admin/cluster/k8s/events/${namespace}/${name}`);
            if (window.K8sHelpers?.showK8sOutput) {
                window.K8sHelpers.showK8sOutput(`Event: ${namespace}/${name}`, response.output);
            }
        } catch (error) {
            if (window.showAlert) {
                window.showAlert('error', 'Lỗi khi lấy thông tin Event: ' + (error.message || ''));
            } else {
                alert('Lỗi khi lấy thông tin Event: ' + (error.message || ''));
            }
        }
    };

    // Initialize
    function init() {
        const reloadBtn = document.getElementById('events-reload');
        const searchInput = document.getElementById('events-search');
        const namespaceFilter = document.getElementById('events-namespace-filter');
        const typeFilter = document.getElementById('events-type-filter');
        const kindFilter = document.getElementById('events-kind-filter');

        if (reloadBtn) {
            reloadBtn.addEventListener('click', loadEvents);
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const type = typeFilter?.value || '';
                const kind = kindFilter?.value || '';
                filterEvents(searchInput.value.toLowerCase(), type, kind);
                renderEvents();
            });
        }

        if (namespaceFilter) {
            namespaceFilter.addEventListener('change', loadEvents);
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                const search = searchInput?.value.toLowerCase() || '';
                const kind = kindFilter?.value || '';
                filterEvents(search, typeFilter.value, kind);
                renderEvents();
            });
        }

        if (kindFilter) {
            kindFilter.addEventListener('change', () => {
                const search = searchInput?.value.toLowerCase() || '';
                const type = typeFilter?.value || '';
                filterEvents(search, type, kindFilter.value);
                renderEvents();
            });
        }

        // Load namespaces for filter
        loadNamespacesForFilter();

        // Initial load
        loadEvents();
    }

    async function loadNamespacesForFilter() {
        try {
            const response = await window.ApiClient.get('/admin/cluster/k8s/namespaces');
            const namespaces = response.namespaces || [];
            const escapeHtml = window.K8sHelpers?.escapeHtml || ((text) => text || '');
            const namespaceOptions = namespaces.map(ns => 
                `<option value="${escapeHtml(ns.name || '')}">${escapeHtml(ns.name || '')}</option>`
            ).join('');

            const filter = document.getElementById('events-namespace-filter');
            if (filter) {
                const currentValue = filter.value;
                filter.innerHTML = '<option value="">Tất cả namespace</option>' + namespaceOptions;
                if (currentValue) {
                    filter.value = currentValue;
                }
            }
        } catch (error) {
            console.error('Error loading namespaces for filter:', error);
        }
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export
    window.K8sEventsModule = {
        loadEvents
    };
})();

