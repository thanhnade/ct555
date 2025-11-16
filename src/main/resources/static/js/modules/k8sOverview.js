// Kubernetes Cluster Overview Module
(function() {
    'use strict';

    let currentClusterId = null;
    
    // Pagination state
    let nodesData = [];
    let workloadsData = [];
    let nodesCurrentPage = 1;
    let workloadsCurrentPage = 1;
    const itemsPerPage = 5;

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

    // Load quick data từ database (nhanh - hiển thị ngay)
    async function loadQuickData() {
        try {
            // Hiển thị loading cho nodes count
            const nodesCountEl = document.getElementById('overview-nodes-count');
            const nodesSubEl = document.getElementById('overview-nodes-sub');
            const nodesListEl = document.getElementById('overview-nodes-list');
            
            if (nodesCountEl) showLoadingNumber(nodesCountEl);
            if (nodesSubEl) nodesSubEl.textContent = 'Đang tải...';
            if (nodesListEl) showLoading(nodesListEl, 'Đang tải nodes...');

            // Lấy nodes info từ database (nhanh)
            const clusterInfo = await window.ApiClient.get('/admin/cluster/api').catch(() => null);
            if (clusterInfo && clusterInfo.id) {
                currentClusterId = clusterInfo.id;
            }

            // Hiển thị nodes count và master/worker count từ database
            if (clusterInfo && clusterInfo.nodes) {
                const nodesCount = clusterInfo.nodes.length || 0;
                const masterCount = clusterInfo.nodes.filter(n => n.role === 'MASTER').length || 0;
                const workerCount = clusterInfo.nodes.filter(n => n.role === 'WORKER').length || 0;

                const nodesCountEl = document.getElementById('overview-nodes-count');
                const nodesSubEl = document.getElementById('overview-nodes-sub');
                if (nodesCountEl) {
                    nodesCountEl.textContent = nodesCount;
                }
                if (nodesSubEl) {
                    nodesSubEl.textContent = `${masterCount} master, ${workerCount} worker`;
                }

                // Lưu nodes data để phân trang
                if (clusterInfo.nodes && clusterInfo.nodes.length > 0) {
                    nodesData = clusterInfo.nodes.map(node => ({
                        name: node.ip || node.host || '-',
                        role: node.role || 'WORKER',
                        status: node.status || 'Unknown'
                    }));
                    nodesCurrentPage = 1; // Reset về trang 1
                    renderNodesList();
                } else {
                    nodesData = [];
                    nodesCurrentPage = 1;
                    renderNodesList();
                }

                const clusterNameEl = document.getElementById('overview-cluster-name');
                if (clusterInfo && clusterInfo.name && clusterNameEl) {
                    clusterNameEl.textContent = clusterInfo.name;
                } else if (clusterNameEl) {
                    clusterNameEl.textContent = 'Default Cluster';
                }
            }
        } catch (error) {
            console.error('Error loading quick data:', error);
        }
    }

    // Load overview data (full data - có thể chậm)
    async function loadOverview() {
        try {
            // Load quick data trước (từ database - nhanh)
            await loadQuickData();

            // Show loading state cho các phần chậm với spinner
            const workloadsCountEl = document.getElementById('overview-workloads-count');
            const podsCountEl = document.getElementById('overview-pods-count');
            const namespacesCountEl = document.getElementById('overview-namespaces-count');
            const workloadsListEl = document.getElementById('overview-workloads-list');
            const cpuPercentEl = document.getElementById('overview-cpu-percent');
            const ramPercentEl = document.getElementById('overview-ram-percent');
            const diskPercentEl = document.getElementById('overview-disk-percent');

            if (workloadsCountEl) showLoadingNumber(workloadsCountEl);
            if (podsCountEl) showLoadingNumber(podsCountEl);
            if (namespacesCountEl) showLoadingNumber(namespacesCountEl);
            if (workloadsListEl) showLoading(workloadsListEl, 'Đang tải workloads...');
            
            // Hiển thị loading cho resource usage
            if (cpuPercentEl) cpuPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
            if (ramPercentEl) ramPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';
            if (diskPercentEl) diskPercentEl.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.75rem; height: 0.75rem;"></span>';

            // Load full overview data (từ K8s API - có thể chậm)
            // Note: Resource usage sẽ được load cùng với overview (có thể chậm vì cần SSH)
            const overviewData = await window.ApiClient.get('/admin/cluster/overview');

            // Update stat cards (có thể đã được update từ quick data, nhưng update lại nếu có data mới từ K8s)
            const nodesCountEl = document.getElementById('overview-nodes-count');
            const nodesSubEl = document.getElementById('overview-nodes-sub');
            if (nodesCountEl && overviewData.nodesCount !== undefined) {
                nodesCountEl.textContent = overviewData.nodesCount || 0;
            }
            if (nodesSubEl && (overviewData.masterCount !== undefined || overviewData.workerCount !== undefined)) {
                nodesSubEl.textContent = `${overviewData.masterCount || 0} master, ${overviewData.workerCount || 0} worker`;
            }
            if (workloadsCountEl) {
                workloadsCountEl.textContent = overviewData.workloadsCount || 0;
            }
            if (podsCountEl) {
                podsCountEl.textContent = overviewData.runningPodsCount || 0;
            }
            const podsSubEl = document.getElementById('overview-pods-sub');
            if (podsSubEl) {
                podsSubEl.textContent = `${overviewData.runningPodsCount || 0}/${overviewData.podsCount || 0} running`;
            }
            if (namespacesCountEl) {
                namespacesCountEl.textContent = overviewData.namespacesCount || 0;
            }

            // Update resource usage bars (có thể chậm vì cần SSH)
            const resourceUsageData = overviewData.resourceUsage || {};
            const cpuUsage = Math.round(resourceUsageData?.cpu || 0);
            const ramUsage = Math.round(resourceUsageData?.ram || 0);
            const diskUsage = Math.round(resourceUsageData?.disk || 0);

            // Ensure values are within 0-100 range
            const cpuValue = Math.max(0, Math.min(100, cpuUsage));
            const ramValue = Math.max(0, Math.min(100, ramUsage));
            const diskValue = Math.max(0, Math.min(100, diskUsage));

            const cpuBarEl = document.getElementById('overview-cpu-bar');
            // cpuPercentEl đã được khai báo ở trên
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
            // ramPercentEl đã được khai báo ở trên
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
            // diskPercentEl đã được khai báo ở trên
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

            // Update nodes list với pagination
            nodesData = overviewData.recentNodes || [];
            nodesCurrentPage = 1; // Reset về trang 1 khi load lại
            renderNodesList();

            // Update workloads list với pagination
            workloadsData = overviewData.recentWorkloads || [];
            workloadsCurrentPage = 1; // Reset về trang 1 khi load lại
            renderWorkloadsList();

        } catch (error) {
            console.error('Error loading overview:', error);
            const nodesListEl = document.getElementById('overview-nodes-list');
            const workloadsListEl = document.getElementById('overview-workloads-list');
            if (nodesListEl) {
                nodesListEl.innerHTML = 
                    '<div class="text-center text-danger py-3">Lỗi khi tải dữ liệu: ' + (error.message || 'Unknown error') + '</div>';
            }
            if (workloadsListEl) {
                workloadsListEl.innerHTML = 
                    '<div class="text-center text-danger py-3">Lỗi khi tải dữ liệu</div>';
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

    // Render nodes list with pagination
    function renderNodesList() {
        const nodesListEl = document.getElementById('overview-nodes-list');
        const paginationEl = document.getElementById('overview-nodes-pagination');
        const paginationInfoEl = document.getElementById('overview-nodes-pagination-info');
        const prevBtn = document.getElementById('overview-nodes-prev');
        const nextBtn = document.getElementById('overview-nodes-next');

        if (!nodesListEl) return;

        if (!nodesData || nodesData.length === 0) {
            nodesListEl.innerHTML = '<div class="text-center text-muted py-3">Không có nodes</div>';
            if (paginationEl) paginationEl.style.display = 'none';
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(nodesData.length / itemsPerPage);
        const startIndex = (nodesCurrentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentItems = nodesData.slice(startIndex, endIndex);

        // Render items
        nodesListEl.innerHTML = currentItems.map(node => {
            const chipClass = getChipClass(node.status);
            const roleClass = getRoleClass(node.role);
            return `
                <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <span class="fw-medium">${escapeHtml(node.name || '-')}</span>
                    <div class="d-flex gap-2 align-items-center">
                        <span class="badge ${roleClass} small">${escapeHtml(node.role || 'WORKER')}</span>
                        <span class="badge ${chipClass}">${escapeHtml(node.status || 'Unknown')}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Update pagination controls
        if (totalPages > 1) {
            if (paginationEl) paginationEl.style.display = 'block';
            if (paginationInfoEl) {
                paginationInfoEl.textContent = `Trang ${nodesCurrentPage} / ${totalPages}`;
            }
            if (prevBtn) {
                prevBtn.disabled = nodesCurrentPage === 1;
            }
            if (nextBtn) {
                nextBtn.disabled = nodesCurrentPage === totalPages;
            }
        } else {
            if (paginationEl) paginationEl.style.display = 'none';
        }
    }

    // Render workloads list with pagination
    function renderWorkloadsList() {
        const workloadsListEl = document.getElementById('overview-workloads-list');
        const paginationEl = document.getElementById('overview-workloads-pagination');
        const paginationInfoEl = document.getElementById('overview-workloads-pagination-info');
        const prevBtn = document.getElementById('overview-workloads-prev');
        const nextBtn = document.getElementById('overview-workloads-next');

        if (!workloadsListEl) return;

        if (!workloadsData || workloadsData.length === 0) {
            workloadsListEl.innerHTML = '<div class="text-center text-muted py-3">Không có workloads</div>';
            if (paginationEl) paginationEl.style.display = 'none';
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(workloadsData.length / itemsPerPage);
        const startIndex = (workloadsCurrentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentItems = workloadsData.slice(startIndex, endIndex);

        // Render items
        workloadsListEl.innerHTML = currentItems.map(wl => {
            const chipClass = getChipClass(wl.status);
            const typeBadgeClass = getTypeBadgeClass(wl.type);
            return `
                <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <div class="d-flex flex-column">
                        <span class="fw-medium">${escapeHtml(wl.name || '-')}</span>
                        ${wl.namespace ? `<span class="text-muted small" style="font-size: 0.75rem;">${escapeHtml(wl.namespace)}</span>` : ''}
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <span class="badge ${typeBadgeClass} small">${escapeHtml(wl.type || '-')}</span>
                        <span class="badge ${chipClass}">${escapeHtml(wl.status || 'Unknown')}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Update pagination controls
        if (totalPages > 1) {
            if (paginationEl) paginationEl.style.display = 'block';
            if (paginationInfoEl) {
                paginationInfoEl.textContent = `Trang ${workloadsCurrentPage} / ${totalPages}`;
            }
            if (prevBtn) {
                prevBtn.disabled = workloadsCurrentPage === 1;
            }
            if (nextBtn) {
                nextBtn.disabled = workloadsCurrentPage === totalPages;
            }
        } else {
            if (paginationEl) paginationEl.style.display = 'none';
        }
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
                loadOverview();
            });
        }

        // Bind pagination buttons for nodes
        const nodesPrevBtn = document.getElementById('overview-nodes-prev');
        const nodesNextBtn = document.getElementById('overview-nodes-next');
        if (nodesPrevBtn) {
            nodesPrevBtn.addEventListener('click', () => {
                if (nodesCurrentPage > 1) {
                    nodesCurrentPage--;
                    renderNodesList();
                }
            });
        }
        if (nodesNextBtn) {
            nodesNextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(nodesData.length / itemsPerPage);
                if (nodesCurrentPage < totalPages) {
                    nodesCurrentPage++;
                    renderNodesList();
                }
            });
        }

        // Bind pagination buttons for workloads
        const workloadsPrevBtn = document.getElementById('overview-workloads-prev');
        const workloadsNextBtn = document.getElementById('overview-workloads-next');
        if (workloadsPrevBtn) {
            workloadsPrevBtn.addEventListener('click', () => {
                if (workloadsCurrentPage > 1) {
                    workloadsCurrentPage--;
                    renderWorkloadsList();
                }
            });
        }
        if (workloadsNextBtn) {
            workloadsNextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(workloadsData.length / itemsPerPage);
                if (workloadsCurrentPage < totalPages) {
                    workloadsCurrentPage++;
                    renderWorkloadsList();
                }
            });
        }

        // Initial load - Overview is the default page
        // Always load Overview first when page loads
        loadOverview();

        // Get cluster ID from K8sClustersModule if available
        if (window.K8sClustersModule && window.K8sClustersModule.currentClusterId) {
            currentClusterId = window.K8sClustersModule.currentClusterId;
        }
    }

    // Auto-init on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for external access
    window.K8sOverviewModule = {
        loadOverview,
        setClusterId: (id) => { currentClusterId = id; }
    };
})();

