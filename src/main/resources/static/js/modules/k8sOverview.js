// Kubernetes Cluster Overview Module
(function() {
    'use strict';

    // Data state
    let nodesData = [];
    let workloadsData = [];
    let workloadsFilter = 'all'; // 'all', 'Deployment', 'StatefulSet', 'DaemonSet'
    let healthData = null;
    let activeSummaryTab = 'workloads'; // workloads | events

    // Helper function để hiển thị loading state
    function showLoading(element, loadingText = '...') {
        if (!element) return;
        if (element.tagName === 'INPUT' || element.tagName === 'BUTTON') {
            element.disabled = true;
            element.dataset.originalText = element.textContent;
            element.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${loadingText}`;
        } else {
            element.innerHTML = `<div class="text-center text-muted py-2"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${loadingText}</div>`;
        }
    }

    // Helper function để hiển thị loading cho số
    function showLoadingNumber(element) {
        if (!element) return;
        element.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 1rem; height: 1rem;"></span>';
    }

    function getResourceNoteEl() {
        let note = document.getElementById('resource-usage-note');
        if (!note) {
            const cardBody = document.querySelector('#overview-cpu-bar')?.closest('.card-body');
            if (cardBody) {
                note = document.createElement('div');
                note.id = 'resource-usage-note';
                note.className = 'mt-2 small text-muted';
                cardBody.appendChild(note);
            }
        }
        return note;
    }

    function updateResourceNote(message, isError = false) {
        const note = getResourceNoteEl();
        if (!note) return;
        if (!message) {
            note.textContent = '';
            note.style.display = 'none';
            return;
        }
        note.style.display = 'block';
        note.textContent = message;
        note.classList.toggle('text-danger', isError);
        note.classList.toggle('text-muted', !isError);
    }

    // Load overview data (tách thành nhiều API calls song song để hiển thị từng phần khi hoàn thành)
    async function loadOverview() {
        console.log('[Overview] reload start');
        
        // Reset state data
        nodesData = [];
        workloadsData = [];
        healthData = null;
        
        // Show loading state cho tất cả các phần với spinner
        const nodesListEl = document.getElementById('overview-nodes-list');
        const workloadsCountEl = document.getElementById('overview-workloads-count');
        const namespacesCountEl = document.getElementById('overview-namespaces-count');
        const servicesCountEl = document.getElementById('overview-services-count');
        const ingressCountEl = document.getElementById('overview-ingress-count');
        const cpuPercentEl = document.getElementById('overview-cpu-percent');
        const ramPercentEl = document.getElementById('overview-ram-percent');
        const diskPercentEl = document.getElementById('overview-disk-percent');
        updateResourceNote('', false);
        const nodesHealthEl = document.getElementById('overview-nodes-health');
        const podsHealthEl = document.getElementById('overview-pods-health');
        const podsHealthSubEl = document.getElementById('overview-pods-health-sub');
        const deploymentsHealthEl = document.getElementById('overview-deployments-health');
        const networkingHealthEl = document.getElementById('overview-networking-health');
        const eventsCountEl = document.getElementById('overview-events-count');
        const eventsTbody = document.getElementById('overview-events-tbody');
        const workloadsPane = document.getElementById('overview-workloads-pane');
        const eventsPane = document.getElementById('overview-events-pane');

        console.debug('[Overview] elements', {
            nodesListEl: !!nodesListEl,
            workloadsCountEl: !!workloadsCountEl,
            namespacesCountEl: !!namespacesCountEl,
            servicesCountEl: !!servicesCountEl,
            ingressCountEl: !!ingressCountEl,
            cpuPercentEl: !!cpuPercentEl,
            ramPercentEl: !!ramPercentEl,
            diskPercentEl: !!diskPercentEl
        });

        if (nodesListEl) showLoading(nodesListEl, 'Đang tải nodes...');
        if (workloadsCountEl) showLoadingNumber(workloadsCountEl);
        if (namespacesCountEl) showLoadingNumber(namespacesCountEl);
        if (servicesCountEl) showLoadingNumber(servicesCountEl);
        if (ingressCountEl) showLoadingNumber(ingressCountEl);
        
        // Hiển thị loading cho resource usage (sẽ load sau)
        if (cpuPercentEl) cpuPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (ramPercentEl) ramPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (diskPercentEl) diskPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (nodesHealthEl) nodesHealthEl.textContent = '...';
        if (podsHealthEl) podsHealthEl.textContent = '...';
        if (podsHealthSubEl) podsHealthSubEl.textContent = '...';
        if (deploymentsHealthEl) deploymentsHealthEl.textContent = '...';
        if (networkingHealthEl) networkingHealthEl.textContent = '...';
        if (eventsCountEl) eventsCountEl.textContent = '...';
        if (eventsTbody) eventsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</td></tr>';
        if (workloadsPane) workloadsPane.classList.remove('d-none');
        if (eventsPane) eventsPane.classList.add('d-none');

        // Gọi song song các API để load từng phần độc lập
        // Mỗi phần sẽ cập nhật UI ngay khi hoàn thành
        Promise.allSettled([
            // 1. Health summary + events (ưu tiên cao)
            window.ApiClient.get('/admin/cluster/overview/health')
                .then(data => {
                    healthData = data;
                    renderHealth();
                    renderEvents();
                })
                .catch(error => {
                    console.error('[Overview] Error loading health summary:', error);
                    healthData = null;
                    renderHealth();
                    renderEvents(true);
                }),

            // 2. Load nodes data (nhanh - không cần SSH)
            window.ApiClient.get('/admin/cluster/overview/nodes')
                .then(data => {
                    console.log('[Overview] Nodes response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const nodesListElCurrent = document.getElementById('overview-nodes-list');
                    
                    if (!nodesListElCurrent) {
                        console.error('[Overview] Elements không tìm thấy:', {
                            nodesListEl: !!nodesListElCurrent
                        });
                        return;
                    }
                    
                    const nodesCount = data.nodesCount || 0;
                    const masterCount = data.masterCount || 0;
                    const workerCount = data.workerCount || 0;
                    
                    console.log('[Overview] Nodes parsed: count=' + nodesCount + ', master=' + masterCount + ', worker=' + workerCount);
                    
                    if (data.recentNodes && Array.isArray(data.recentNodes)) {
                        nodesData = data.recentNodes;
                        console.log('[Overview] Recent nodes:', nodesData.length);
                        renderNodesList();
                    } else {
                        nodesData = [];
                        console.log('[Overview] No recent nodes');
                        renderNodesList();
                    }
                })
                .catch(error => {
                    console.error('[Overview] Error loading nodes:', error);
                    const nodesCountElCurrent = document.getElementById('overview-nodes-count');
                    const nodesSubElCurrent = document.getElementById('overview-nodes-sub');
                    const nodesListElCurrent = document.getElementById('overview-nodes-list');
                    if (nodesCountElCurrent) nodesCountElCurrent.textContent = '-';
                    if (nodesSubElCurrent) {
                        nodesSubElCurrent.textContent = 'Lỗi khi tải';
                        nodesSubElCurrent.classList.add('text-danger');
                    }
                    if (nodesListElCurrent) {
                        nodesListElCurrent.innerHTML = '<div class="text-center text-danger py-3">Lỗi khi tải nodes</div>';
                    }
                }),

            // 3. Load workloads count (nhanh - từ K8s API)
            window.ApiClient.get('/admin/cluster/overview/workloads')
                .then(data => {
                    console.log('[Overview] Workloads response:', data);
                    
                    const workloadsCountElCurrent = document.getElementById('overview-workloads-count');
                    if (!workloadsCountElCurrent) {
                        console.error('[Overview] Workloads count element không tìm thấy');
                        return;
                    }
                    
                    const workloadsCount = data.workloadsCount || 0;
                    workloadsCountElCurrent.textContent = workloadsCount;
                })
                .catch(error => {
                    console.error('[Overview] Error loading workloads:', error);
                    const workloadsCountElCurrent = document.getElementById('overview-workloads-count');
                    if (workloadsCountElCurrent) workloadsCountElCurrent.textContent = '-';
                }),

            // 4. Load pods và namespaces data (nhanh - từ K8s API)
            window.ApiClient.get('/admin/cluster/overview/pods-namespaces')
                .then(data => {
                    console.log('[Overview] Pods/Namespaces response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const namespacesCountElCurrent = document.getElementById('overview-namespaces-count');
                    
                    const runningPodsCount = data.runningPodsCount || 0;
                    const podsCount = data.podsCount || 0;
                    const namespacesCount = data.namespacesCount || 0;
                    console.log('[Overview] Pods: running=' + runningPodsCount + ', total=' + podsCount + ', Namespaces=' + namespacesCount);
                    
                    if (namespacesCountElCurrent) namespacesCountElCurrent.textContent = namespacesCount;
                })
                .catch(error => {
                    console.error('[Overview] Error loading pods/namespaces:', error);
                    const namespacesCountElCurrent = document.getElementById('overview-namespaces-count');
                    if (namespacesCountElCurrent) namespacesCountElCurrent.textContent = '-';
                }),

            // 5. Load resource usage data (chậm - cần SSH, ưu tiên sau)
            window.ApiClient.get('/admin/cluster/overview/resource-usage')
                .then(data => {
                    console.log('[Overview] Resource Usage response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const cpuPercentElCurrent = document.getElementById('overview-cpu-percent');
                    const ramPercentElCurrent = document.getElementById('overview-ram-percent');
                    const diskPercentElCurrent = document.getElementById('overview-disk-percent');
                    
                    if (!cpuPercentElCurrent || !ramPercentElCurrent || !diskPercentElCurrent) {
                        console.error('[Overview] Resource Usage elements không tìm thấy');
                        return;
                    }
                    
                    const noteMessage = data.warning || data.reason || '';
                    const hasUsage = !!data.resourceUsage;
                    const isError = !hasUsage || (!data.resourceUsage.cpu && !data.resourceUsage.ram && !data.resourceUsage.disk);

                    if (hasUsage) {
                        console.log('[Overview] Resource Usage:', data.resourceUsage);
                        if (data.reason) {
                            console.log('[Overview] Resource Usage reason:', data.reason);
                        }
                        updateResourceUsage(data.resourceUsage, data.resourceUsageRaw, noteMessage, isError);
                    } else {
                        console.warn('[Overview] Resource Usage response không có resourceUsage field');
                        cpuPercentElCurrent.textContent = 'N/A';
                        ramPercentElCurrent.textContent = 'N/A';
                        diskPercentElCurrent.textContent = 'N/A';
                        updateResourceNote(noteMessage || 'Không có dữ liệu Resource Usage', true);
                    }
                })
                .catch(error => {
                    console.error('[Overview] Error loading resource usage:', error);
                    const cpuPercentElCurrent = document.getElementById('overview-cpu-percent');
                    const ramPercentElCurrent = document.getElementById('overview-ram-percent');
                    const diskPercentElCurrent = document.getElementById('overview-disk-percent');
                    if (cpuPercentElCurrent) cpuPercentElCurrent.textContent = 'N/A';
                    if (ramPercentElCurrent) ramPercentElCurrent.textContent = 'N/A';
                    if (diskPercentElCurrent) diskPercentElCurrent.textContent = 'N/A';
                    updateResourceNote('Lỗi lấy Resource Usage: ' + (error?.message || 'Không xác định'), true);
                })
        ]);
    }

    // Update resource usage bars
    function updateResourceUsage(resourceUsageData, rawUsage, noteMessage, isError) {
        const cpuUsage = Math.round(resourceUsageData?.cpu ?? 0);
        const ramUsage = Math.round(resourceUsageData?.ram ?? 0);
        const diskUsage = Math.round(resourceUsageData?.disk ?? 0);
        const cpuRaw = rawUsage?.cpu || '';
        const ramRaw = rawUsage?.ram || '';

        // Ensure values are within 0-100 range
        const cpuValue = Math.max(0, Math.min(100, cpuUsage));
        const ramValue = Math.max(0, Math.min(100, ramUsage));
        const diskValue = Math.max(0, Math.min(100, diskUsage));

        const cpuBarEl = document.getElementById('overview-cpu-bar');
        const cpuPercentEl = document.getElementById('overview-cpu-percent');
        if (cpuBarEl) {
            cpuBarEl.style.width = cpuValue + '%';
            cpuBarEl.setAttribute('aria-valuenow', cpuValue);
            if (isError) cpuBarEl.style.width = '0%';
        }
        if (cpuPercentEl) {
            const rawText = cpuRaw && !isError ? ` (${cpuRaw})` : '';
            cpuPercentEl.textContent = isError ? 'N/A' : `${cpuValue}%${rawText}`;
            cpuPercentEl.style.color = ''; // dùng màu mặc định để tránh trắng trên nền trắng
            cpuPercentEl.title = noteMessage || '';
        }

        const ramBarEl = document.getElementById('overview-ram-bar');
        const ramPercentEl = document.getElementById('overview-ram-percent');
        if (ramBarEl) {
            ramBarEl.style.width = ramValue + '%';
            ramBarEl.setAttribute('aria-valuenow', ramValue);
            if (isError) ramBarEl.style.width = '0%';
        }
        if (ramPercentEl) {
            const rawText = ramRaw && !isError ? ` (${ramRaw})` : '';
            ramPercentEl.textContent = isError ? 'N/A' : `${ramValue}%${rawText}`;
            ramPercentEl.style.color = '';
            ramPercentEl.title = noteMessage || '';
        }

        const diskBarEl = document.getElementById('overview-disk-bar');
        const diskPercentEl = document.getElementById('overview-disk-percent');
        if (diskBarEl) {
            diskBarEl.style.width = diskValue + '%';
            diskBarEl.setAttribute('aria-valuenow', diskValue);
            if (isError) diskBarEl.style.width = '0%';
        }
        if (diskPercentEl) {
            diskPercentEl.textContent = isError ? 'N/A' : diskValue + '%';
            diskPercentEl.style.color = '';
            diskPercentEl.title = noteMessage || '';
        }

        const noteText = isError ? noteMessage : '';
        updateResourceNote(noteText, isError);
    }

    function renderHealth() {
        const nodesHealthEl = document.getElementById('overview-nodes-health');
        const podsHealthEl = document.getElementById('overview-pods-health');
        const podsHealthSubEl = document.getElementById('overview-pods-health-sub');
        const deploymentsHealthEl = document.getElementById('overview-deployments-health');
        if (!nodesHealthEl || !podsHealthEl || !deploymentsHealthEl) return;

        if (!healthData) {
            nodesHealthEl.textContent = 'N/A';
            podsHealthEl.textContent = 'N/A';
            deploymentsHealthEl.textContent = 'N/A';
            networkingHealthEl.textContent = 'N/A';
            if (podsHealthSubEl) podsHealthSubEl.textContent = 'Không có dữ liệu';
            return;
        }

        const nodes = healthData.nodes || { ready: 0, total: 0 };
        const pods = healthData.pods || { running: 0, total: 0, pending: 0, failed: 0 };
        const deployments = healthData.deployments || { available: 0, total: 0 };
        const networking = healthData.networking || { services: 0, ingress: 0 };
        const servicesCountEl = document.getElementById('overview-services-count');
        const ingressCountEl = document.getElementById('overview-ingress-count');

        nodesHealthEl.textContent = `${nodes.ready ?? 0} / ${nodes.total ?? 0}`;
        podsHealthEl.textContent = `${pods.running ?? 0} / ${pods.total ?? 0}`;
        if (podsHealthSubEl) podsHealthSubEl.textContent = `${pods.running ?? 0} Running • ${pods.pending ?? 0} Pending • ${pods.failed ?? 0} Failed`;
        deploymentsHealthEl.textContent = `${deployments.available ?? 0} / ${deployments.total ?? 0}`;
        if (servicesCountEl) servicesCountEl.textContent = networking.services ?? 0;
        if (ingressCountEl) ingressCountEl.textContent = networking.ingress ?? 0;
    }

    function renderEvents(isError = false) {
        const eventsCountEl = document.getElementById('overview-events-count');
        const tbody = document.getElementById('overview-events-tbody');
        if (!eventsCountEl || !tbody) return;

        if (isError) {
            eventsCountEl.textContent = 'N/A';
            eventsCountEl.classList.add('bg-danger');
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">Không tải được sự kiện</td></tr>';
            return;
        }

        const events = healthData?.events?.recent || [];
        const warnings = healthData?.events?.warnings ?? 0;
        eventsCountEl.textContent = warnings;
        eventsCountEl.classList.add('bg-warning', 'text-dark');

        if (!events.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có cảnh báo gần đây</td></tr>';
            return;
        }

        const escapeHtml = getEscapeHtml();
        tbody.innerHTML = events.map(ev => `
            <tr>
                <td class="${ev.type === 'Warning' || ev.type === 'Error' ? 'text-warning fw-semibold' : ''}">${escapeHtml(ev.type)}</td>
                <td>${escapeHtml(ev.reason)}</td>
                <td>${escapeHtml(ev.object)}</td>
                <td>${escapeHtml(ev.message)}</td>
                <td>${escapeHtml(ev.time)}</td>
            </tr>
        `).join('');
    }

    // Helper: Get escapeHtml function
    function getEscapeHtml() {
        return window.K8sHelpers?.escapeHtml || ((text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        });
    }

    function getChipClass(status) {
        if (!status) return 'bg-secondary';
        const s = status.toLowerCase();
        if (s === 'ready' || s === 'running' || s === 'active') return 'bg-success';
        if (s === 'notready' || s === 'pending' || s === 'warning') return 'bg-warning text-dark';
        if (s === 'error' || s === 'failed' || s === 'terminated') return 'bg-danger';
        return 'bg-secondary';
    }

    function getRoleClass(role) {
        if (!role) return 'bg-secondary';
        const r = role.toUpperCase();
        if (r === 'MASTER') return 'bg-primary';
        if (r === 'WORKER') return 'bg-info text-dark';
        return 'bg-secondary';
    }

    function getTypeBadgeClass(type) {
        if (!type) return 'bg-secondary';
        const t = type.toUpperCase();
        if (t === 'DEPLOYMENT') return 'bg-primary';
        if (t === 'STATEFULSET') return 'bg-success';
        if (t === 'DAEMONSET') return 'bg-warning text-dark';
        return 'bg-secondary';
    }

    // Render nodes list
    function renderNodesList() {
        const nodesListEl = document.getElementById('overview-nodes-list');

        if (!nodesListEl) return;

        if (!nodesData || nodesData.length === 0) {
            nodesListEl.innerHTML = '<div class="text-center text-muted py-4"><div style="font-size: 2rem; margin-bottom: 0.5rem;">📭</div><div>Chưa có nodes trong cluster</div><div class="small mt-2">Vui lòng thêm nodes vào cluster để bắt đầu</div></div>';
            return;
        }

        // Render all items
        const escapeHtml = getEscapeHtml();
        nodesListEl.innerHTML = nodesData.map((node, index) => {
            const chipClass = getChipClass(node.status);
            const roleClass = getRoleClass(node.role);
            const isLast = index === nodesData.length - 1;
            return `
                <div class="d-flex justify-content-between align-items-center pt-2 ${isLast ? 'pb-3' : 'pb-2 border-bottom'}">
                    <span class="fw-medium">${escapeHtml(node.name || '-')}</span>
                    <div class="d-flex gap-2 align-items-center">
                        <span class="badge ${roleClass} small">${escapeHtml(node.role || 'WORKER')}</span>
                        <span class="badge ${chipClass}">${escapeHtml(node.status || 'Unknown')}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Initialize module
    function init() {
        // Hiển thị loading ban đầu cho tất cả các phần
        const workloadsCountEl = document.getElementById('overview-workloads-count');
        const namespacesCountEl = document.getElementById('overview-namespaces-count');
        const nodesListEl = document.getElementById('overview-nodes-list');
        const cpuPercentEl = document.getElementById('overview-cpu-percent');
        const ramPercentEl = document.getElementById('overview-ram-percent');
        const diskPercentEl = document.getElementById('overview-disk-percent');

        if (workloadsCountEl) showLoadingNumber(workloadsCountEl);
        if (namespacesCountEl) showLoadingNumber(namespacesCountEl);
        if (nodesListEl) showLoading(nodesListEl, 'Đang tải nodes...');
        if (cpuPercentEl) cpuPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (ramPercentEl) ramPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (diskPercentEl) diskPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';

        // Bind reload button
        const reloadBtn = document.getElementById('cd-reload');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                console.log('[Reload] Bắt đầu reload overview...');
                loadOverview();
            });
        }

        // Không còn danh sách workloads ở overview; chỉ sự kiện

        // Initial load - Overview is the default page
        // Always load Overview first when page loads
        loadOverview();
    }

    // Auto-init on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external access
    window.K8sOverviewModule = {
        loadOverview
    };
})();