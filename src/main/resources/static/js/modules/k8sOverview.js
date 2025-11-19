// Kubernetes Cluster Overview Module
(function() {
    'use strict';

    // Data state
    let nodesData = [];
    let workloadsData = [];
    let workloadsFilter = 'all'; // 'all', 'Deployment', 'StatefulSet', 'DaemonSet'

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

    // Load overview data (tách thành nhiều API calls song song để hiển thị từng phần khi hoàn thành)
    async function loadOverview() {
        console.log('[Reload] ========== Bắt đầu loadOverview() ==========');
        
        // Reset state data
        nodesData = [];
        workloadsData = [];
        
        // Show loading state cho tất cả các phần với spinner
        const nodesCountEl = document.getElementById('overview-nodes-count');
        const nodesSubEl = document.getElementById('overview-nodes-sub');
        const nodesListEl = document.getElementById('overview-nodes-list');
        const workloadsCountEl = document.getElementById('overview-workloads-count');
        const podsCountEl = document.getElementById('overview-pods-count');
        const namespacesCountEl = document.getElementById('overview-namespaces-count');
        const workloadsListEl = document.getElementById('overview-workloads-list');
        const cpuPercentEl = document.getElementById('overview-cpu-percent');
        const ramPercentEl = document.getElementById('overview-ram-percent');
        const diskPercentEl = document.getElementById('overview-disk-percent');
        
        console.log('[Reload] Elements found:', {
            nodesCountEl: !!nodesCountEl,
            nodesSubEl: !!nodesSubEl,
            nodesListEl: !!nodesListEl,
            workloadsCountEl: !!workloadsCountEl,
            podsCountEl: !!podsCountEl,
            namespacesCountEl: !!namespacesCountEl,
            workloadsListEl: !!workloadsListEl,
            cpuPercentEl: !!cpuPercentEl,
            ramPercentEl: !!ramPercentEl,
            diskPercentEl: !!diskPercentEl
        });

        if (nodesCountEl) showLoadingNumber(nodesCountEl);
        if (nodesSubEl) nodesSubEl.textContent = 'Đang tải...';
        if (nodesListEl) showLoading(nodesListEl, 'Đang tải nodes...');
        if (workloadsCountEl) showLoadingNumber(workloadsCountEl);
        if (podsCountEl) showLoadingNumber(podsCountEl);
        if (namespacesCountEl) showLoadingNumber(namespacesCountEl);
        if (workloadsListEl) showLoading(workloadsListEl, 'Đang tải workloads...');
        
        // Hiển thị loading cho resource usage (sẽ load sau)
        if (cpuPercentEl) cpuPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (ramPercentEl) ramPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
        if (diskPercentEl) diskPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';

        // Gọi song song các API để load từng phần độc lập
        // Mỗi phần sẽ cập nhật UI ngay khi hoàn thành
        Promise.allSettled([
            // 1. Load nodes data (nhanh - không cần SSH)
            window.ApiClient.get('/admin/cluster/overview/nodes')
                .then(data => {
                    console.log('[Reload] Nodes response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const nodesCountElCurrent = document.getElementById('overview-nodes-count');
                    const nodesSubElCurrent = document.getElementById('overview-nodes-sub');
                    const nodesListElCurrent = document.getElementById('overview-nodes-list');
                    
                    if (!nodesCountElCurrent || !nodesSubElCurrent || !nodesListElCurrent) {
                        console.error('[Reload] Elements không tìm thấy:', {
                            nodesCountEl: !!nodesCountElCurrent,
                            nodesSubEl: !!nodesSubElCurrent,
                            nodesListEl: !!nodesListElCurrent
                        });
                        return;
                    }
                    
                    const nodesCount = data.nodesCount || 0;
                    const masterCount = data.masterCount || 0;
                    const workerCount = data.workerCount || 0;
                    
                    console.log('[Reload] Nodes parsed: count=' + nodesCount + ', master=' + masterCount + ', worker=' + workerCount);
                    
                    nodesCountElCurrent.textContent = nodesCount;
                    
                    if (nodesCount === 0) {
                        nodesSubElCurrent.textContent = 'Chưa có nodes';
                        nodesSubElCurrent.classList.add('text-muted');
                    } else {
                        nodesSubElCurrent.textContent = `${masterCount} master, ${workerCount} worker`;
                        nodesSubElCurrent.classList.remove('text-muted');
                    }
                    
                    if (data.recentNodes && Array.isArray(data.recentNodes)) {
                        nodesData = data.recentNodes;
                        console.log('[Reload] Recent nodes:', nodesData.length);
                        renderNodesList();
                    } else {
                        nodesData = [];
                        console.log('[Reload] No recent nodes');
                        renderNodesList();
                    }
                })
                .catch(error => {
                    console.error('[Reload] Error loading nodes:', error);
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

            // 2. Load workloads data (nhanh - từ K8s API)
            window.ApiClient.get('/admin/cluster/overview/workloads')
                .then(data => {
                    console.log('[Reload] Workloads response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const workloadsCountElCurrent = document.getElementById('overview-workloads-count');
                    const workloadsListElCurrent = document.getElementById('overview-workloads-list');
                    
                    if (!workloadsCountElCurrent || !workloadsListElCurrent) {
                        console.error('[Reload] Workloads elements không tìm thấy');
                        return;
                    }
                    
                    const workloadsCount = data.workloadsCount || 0;
                    console.log('[Reload] Workloads count:', workloadsCount);
                    
                    workloadsCountElCurrent.textContent = workloadsCount;
                    
                    if (data.recentWorkloads && Array.isArray(data.recentWorkloads)) {
                        workloadsData = data.recentWorkloads;
                        console.log('[Reload] Recent workloads:', workloadsData.length);
                        renderWorkloadsList();
                    } else {
                        workloadsData = [];
                        console.log('[Reload] No recent workloads');
                        renderWorkloadsList();
                    }
                })
                .catch(error => {
                    console.error('[Reload] Error loading workloads:', error);
                    const workloadsCountElCurrent = document.getElementById('overview-workloads-count');
                    const workloadsListElCurrent = document.getElementById('overview-workloads-list');
                    if (workloadsCountElCurrent) workloadsCountElCurrent.textContent = '-';
                    if (workloadsListElCurrent) {
                        workloadsListElCurrent.innerHTML = '<div class="text-center text-danger py-3">Lỗi khi tải workloads</div>';
                    }
                }),

            // 3. Load pods và namespaces data (nhanh - từ K8s API)
            window.ApiClient.get('/admin/cluster/overview/pods-namespaces')
                .then(data => {
                    console.log('[Reload] Pods/Namespaces response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const podsCountElCurrent = document.getElementById('overview-pods-count');
                    const podsSubElCurrent = document.getElementById('overview-pods-sub');
                    const namespacesCountElCurrent = document.getElementById('overview-namespaces-count');
                    
                    if (!podsCountElCurrent || !namespacesCountElCurrent) {
                        console.error('[Reload] Pods/Namespaces elements không tìm thấy');
                        return;
                    }
                    
                    const runningPodsCount = data.runningPodsCount || 0;
                    const podsCount = data.podsCount || 0;
                    const namespacesCount = data.namespacesCount || 0;
                    console.log('[Reload] Pods: running=' + runningPodsCount + ', total=' + podsCount + ', Namespaces=' + namespacesCount);
                    
                    podsCountElCurrent.textContent = runningPodsCount;
                    if (podsSubElCurrent && data.podsCount !== undefined && data.runningPodsCount !== undefined) {
                        podsSubElCurrent.textContent = `${runningPodsCount}/${podsCount} running`;
                    }
                    namespacesCountElCurrent.textContent = namespacesCount;
                })
                .catch(error => {
                    console.error('[Reload] Error loading pods/namespaces:', error);
                    const podsCountElCurrent = document.getElementById('overview-pods-count');
                    const podsSubElCurrent = document.getElementById('overview-pods-sub');
                    const namespacesCountElCurrent = document.getElementById('overview-namespaces-count');
                    if (podsCountElCurrent) podsCountElCurrent.textContent = '-';
                    if (podsSubElCurrent) podsSubElCurrent.textContent = 'Lỗi khi tải';
                    if (namespacesCountElCurrent) namespacesCountElCurrent.textContent = '-';
                }),

            // 4. Load resource usage data (chậm - cần SSH, load sau cùng)
            window.ApiClient.get('/admin/cluster/overview/resource-usage')
                .then(data => {
                    console.log('[Reload] Resource Usage response:', data);
                    
                    // Lấy lại elements để đảm bảo chúng vẫn tồn tại
                    const cpuPercentElCurrent = document.getElementById('overview-cpu-percent');
                    const ramPercentElCurrent = document.getElementById('overview-ram-percent');
                    const diskPercentElCurrent = document.getElementById('overview-disk-percent');
                    
                    if (!cpuPercentElCurrent || !ramPercentElCurrent || !diskPercentElCurrent) {
                        console.error('[Reload] Resource Usage elements không tìm thấy');
                        return;
                    }
                    
                    if (data.resourceUsage) {
                        console.log('[Reload] Resource Usage:', data.resourceUsage);
                        if (data.reason) {
                            console.log('[Reload] Resource Usage reason:', data.reason);
                        }
                        updateResourceUsage(data.resourceUsage);
                    } else {
                        console.warn('[Reload] Resource Usage response không có resourceUsage field');
                        cpuPercentElCurrent.textContent = '0%';
                        ramPercentElCurrent.textContent = '0%';
                        diskPercentElCurrent.textContent = '0%';
                    }
                })
                .catch(error => {
                    console.error('[Reload] Error loading resource usage:', error);
                    const cpuPercentElCurrent = document.getElementById('overview-cpu-percent');
                    const ramPercentElCurrent = document.getElementById('overview-ram-percent');
                    const diskPercentElCurrent = document.getElementById('overview-disk-percent');
                    if (cpuPercentElCurrent) cpuPercentElCurrent.textContent = '0%';
                    if (ramPercentElCurrent) ramPercentElCurrent.textContent = '0%';
                    if (diskPercentElCurrent) diskPercentElCurrent.textContent = '0%';
                })
        ]);
    }

    // Update resource usage bars
    function updateResourceUsage(resourceUsageData) {
        const cpuUsage = Math.round(resourceUsageData?.cpu || 0);
        const ramUsage = Math.round(resourceUsageData?.ram || 0);
        const diskUsage = Math.round(resourceUsageData?.disk || 0);

        // Ensure values are within 0-100 range
        const cpuValue = Math.max(0, Math.min(100, cpuUsage));
        const ramValue = Math.max(0, Math.min(100, ramUsage));
        const diskValue = Math.max(0, Math.min(100, diskUsage));

        const cpuBarEl = document.getElementById('overview-cpu-bar');
        const cpuPercentEl = document.getElementById('overview-cpu-percent');
        if (cpuBarEl) {
            cpuBarEl.style.width = cpuValue + '%';
            cpuBarEl.setAttribute('aria-valuenow', cpuValue);
        }
        if (cpuPercentEl) {
            cpuPercentEl.textContent = cpuValue + '%';
            // Adjust text color based on usage
            if (cpuValue > 80) {
                cpuPercentEl.style.color = '#fff';
            } else {
                cpuPercentEl.style.color = '#333';
            }
        }

        const ramBarEl = document.getElementById('overview-ram-bar');
        const ramPercentEl = document.getElementById('overview-ram-percent');
        if (ramBarEl) {
            ramBarEl.style.width = ramValue + '%';
            ramBarEl.setAttribute('aria-valuenow', ramValue);
        }
        if (ramPercentEl) {
            ramPercentEl.textContent = ramValue + '%';
            // Adjust text color based on usage
            if (ramValue > 80) {
                ramPercentEl.style.color = '#fff';
            } else {
                ramPercentEl.style.color = '#333';
            }
        }

        const diskBarEl = document.getElementById('overview-disk-bar');
        const diskPercentEl = document.getElementById('overview-disk-percent');
        if (diskBarEl) {
            diskBarEl.style.width = diskValue + '%';
            diskBarEl.setAttribute('aria-valuenow', diskValue);
        }
        if (diskPercentEl) {
            diskPercentEl.textContent = diskValue + '%';
            // Adjust text color based on usage
            if (diskValue > 80) {
                diskPercentEl.style.color = '#fff';
            } else {
                diskPercentEl.style.color = '#333';
            }
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    // Render workloads list
    function renderWorkloadsList() {
        const workloadsListEl = document.getElementById('overview-workloads-list');

        if (!workloadsListEl) return;

        if (!workloadsData || workloadsData.length === 0) {
            workloadsListEl.innerHTML = '<div class="text-center text-muted py-3">Không có workloads</div>';
            return;
        }

        // Filter workloads theo loại đã chọn
        const filteredWorkloads = workloadsFilter === 'all' 
            ? workloadsData 
            : workloadsData.filter(wl => wl.type === workloadsFilter);

        if (filteredWorkloads.length === 0) {
            workloadsListEl.innerHTML = `<div class="text-center text-muted py-3">Không có ${workloadsFilter === 'all' ? 'workloads' : workloadsFilter.toLowerCase()}</div>`;
            return;
        }

        // Render filtered items
        workloadsListEl.innerHTML = filteredWorkloads.map((wl, index) => {
            const chipClass = getChipClass(wl.status);
            const typeBadgeClass = getTypeBadgeClass(wl.type);
            const isLast = index === filteredWorkloads.length - 1;
            return `
                <div class="d-flex justify-content-between align-items-center pt-2 ${isLast ? 'pb-3' : 'pb-2 border-bottom'}">
                    <div class="d-flex flex-column">
                        <span class="fw-medium mb-1">${escapeHtml(wl.name || '-')}</span>
                        ${wl.namespace ? `<span class="text-muted" style="font-size: 0.75rem; line-height: 1.2;">${escapeHtml(wl.namespace)}</span>` : ''}
                    </div>
                    <div class="d-flex gap-2 align-items-center flex-shrink-0">
                        <span class="badge ${typeBadgeClass} small">${escapeHtml(wl.type || '-')}</span>
                        <span class="badge ${chipClass} small">${escapeHtml(wl.status || 'Unknown')}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Initialize module
    function init() {
        // Hiển thị loading ban đầu cho tất cả các phần
        const nodesCountEl = document.getElementById('overview-nodes-count');
        const nodesSubEl = document.getElementById('overview-nodes-sub');
        const workloadsCountEl = document.getElementById('overview-workloads-count');
        const podsCountEl = document.getElementById('overview-pods-count');
        const namespacesCountEl = document.getElementById('overview-namespaces-count');
        const nodesListEl = document.getElementById('overview-nodes-list');
        const workloadsListEl = document.getElementById('overview-workloads-list');
        const cpuPercentEl = document.getElementById('overview-cpu-percent');
        const ramPercentEl = document.getElementById('overview-ram-percent');
        const diskPercentEl = document.getElementById('overview-disk-percent');

        if (nodesCountEl) showLoadingNumber(nodesCountEl);
        if (nodesSubEl) nodesSubEl.textContent = 'Đang tải...';
        if (workloadsCountEl) showLoadingNumber(workloadsCountEl);
        if (podsCountEl) showLoadingNumber(podsCountEl);
        if (namespacesCountEl) showLoadingNumber(namespacesCountEl);
        if (nodesListEl) showLoading(nodesListEl, 'Đang tải nodes...');
        if (workloadsListEl) showLoading(workloadsListEl, 'Đang tải workloads...');
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

        // Bind workload filter buttons
        const filterInputs = document.querySelectorAll('input[name="workload-filter"]');
        filterInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                workloadsFilter = e.target.value;
                renderWorkloadsList();
            });
        });

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

