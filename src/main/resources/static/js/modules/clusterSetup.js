// Cluster Setup Module
(function() {
    'use strict';

    const ClusterSetupModule = {
        currentClusterId: null,

        init: function() {
            this.loadClusters();
            this.bindEvents();
        },

        loadClusters: function() {
            if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
                setTimeout(() => this.loadClusters(), 100);
                return;
            }

            // Get clusterId from URL query parameter
            const urlParams = new URLSearchParams(window.location.search);
            const clusterIdFromUrl = urlParams.get('clusterId');

            window.ApiClient.get('/admin/clusters').then(clusters => {
                const select = document.getElementById('cluster-select');
                if (!select) return;

                // Hệ thống chỉ hỗ trợ 1 cluster - nếu đã có cluster, tự động chọn và ẩn dropdown
                if (clusters && clusters.length === 1) {
                    // Ẩn dropdown và label, hiển thị thông tin cluster
                    const parent = select.closest('div');
                    if (parent) {
                        // Ẩn label
                        const label = parent.querySelector('label');
                        if (label) label.style.display = 'none';
                        
                        // Tạo hoặc cập nhật thông tin cluster hiển thị
                        let clusterInfo = parent.querySelector('.cluster-info-display');
                        if (!clusterInfo) {
                            clusterInfo = document.createElement('div');
                            clusterInfo.className = 'cluster-info-display';
                            clusterInfo.style.cssText = 'padding: 8px 12px; background: #E8F5E9; border-radius: 6px; border: 1px solid #4CAF50; font-size: 13px; color: #2E7D32;';
                            parent.insertBefore(clusterInfo, select);
                        }
                        clusterInfo.innerHTML = `🧩 <strong>${clusters[0].name || `Cluster ${clusters[0].id}`}</strong>`;
                    }
                    
                    select.style.display = 'none';
                    select.innerHTML = '';
                    const opt = document.createElement('option');
                    opt.value = clusters[0].id;
                    opt.textContent = clusters[0].name || `Cluster ${clusters[0].id}`;
                    opt.selected = true;
                    select.appendChild(opt);
                    
                    this.currentClusterId = clusters[0].id;
                } else {
                    // Hiển thị dropdown nếu chưa có cluster hoặc có nhiều cluster (trường hợp hiếm)
                    select.innerHTML = '<option value="">-- Chọn cluster --</option>';
                    (clusters || []).forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c.id;
                        opt.textContent = c.name || `Cluster ${c.id}`;
                        select.appendChild(opt);
                    });

                    // Auto-select cluster from URL query parameter if provided
                    if (clusterIdFromUrl) {
                        const clusterId = parseInt(clusterIdFromUrl, 10);
                        const cluster = (clusters || []).find(c => Number(c.id) === clusterId);
                        if (cluster) {
                            select.value = clusterId;
                            this.currentClusterId = clusterId;
                        }
                    } else if (clusters && clusters.length === 1) {
                        // Auto-select first cluster if only one exists (fallback)
                        select.value = clusters[0].id;
                        this.currentClusterId = clusters[0].id;
                    }
                }

                // Listen for cluster selection change
                select.addEventListener('change', (e) => {
                    this.currentClusterId = e.target.value ? parseInt(e.target.value, 10) : null;
                });
            }).catch(err => {
                console.error('Error loading clusters:', err);
                window.showAlert('error', 'Không thể tải danh sách cluster');
            });
        },

        bindEvents: function() {
            // Back to clusters button
            const backBtn = document.getElementById('back-to-clusters-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    window.location.href = '/admin/cluster';
                });
            }

            // Helper function to get clusterID (tự động lấy nếu chưa có)
            const getClusterId = async () => {
                if (this.currentClusterId) {
                    return this.currentClusterId;
                }
                // Nếu chưa có, thử lấy cluster đầu tiên (hệ thống chỉ hỗ trợ 1 cluster)
                try {
                    const clusters = await window.ApiClient.get('/admin/clusters').catch(() => []);
                    if (clusters && clusters.length > 0) {
                        this.currentClusterId = clusters[0].id;
                        const select = document.getElementById('cluster-select');
                        if (select) select.value = this.currentClusterId;
                        return this.currentClusterId;
                    }
                } catch (err) {
                    console.error('Error getting cluster:', err);
                }
                return null;
            };

            // Step 1: Environment Check
            const btnStep1 = document.getElementById('btn-step-1-check');
            if (btnStep1) {
                btnStep1.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.runEnvironmentCheck();
                });
            }

            // Step 2: Install Ansible
            const btnStep2 = document.getElementById('btn-step-2-ansible');
            if (btnStep2) {
                btnStep2.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.installAnsible();
                });
            }

            // Step 3: Install Kubernetes
            const btnStep3 = document.getElementById('btn-step-3-k8s');
            if (btnStep3) {
                btnStep3.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.installKubernetes();
                });
            }

            // Step 4: Install Addons
            const btnStep4Calico = document.getElementById('btn-step-4-calico');
            if (btnStep4Calico) {
                btnStep4Calico.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.installCalico();
                });
            }

            const btnStep4Ingress = document.getElementById('btn-step-4-ingress');
            if (btnStep4Ingress) {
                btnStep4Ingress.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.installIngress();
                });
            }

            const btnStep4MetalLB = document.getElementById('btn-step-4-metallb');
            if (btnStep4MetalLB) {
                btnStep4MetalLB.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.installMetalLB();
                });
            }

            // Step 5: Verify Cluster
            const btnStep5 = document.getElementById('btn-step-5-verify');
            if (btnStep5) {
                btnStep5.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    this.verifyCluster();
                });
            }

            // Check Ansible Status button
            const checkAnsibleBtn = document.getElementById('cd-check-ansible');
            if (checkAnsibleBtn) {
                checkAnsibleBtn.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        return;
                    }
                    
                    // Gọi checkAnsibleStatus với clusterId hiện tại
                    // Function này sẽ tự động kiểm tra máy master của cluster
                    if (window.checkAnsibleStatus && typeof window.checkAnsibleStatus === 'function') {
                        try {
                            await window.checkAnsibleStatus(clusterId);
                        } catch (err) {
                            console.error('Error checking Ansible status:', err);
                            window.showAlert('error', 'Không thể kiểm tra trạng thái Ansible: ' + (err.message || 'Lỗi không xác định'));
                        }
                    } else if (window.AnsibleConfigModule && window.AnsibleConfigModule.checkAnsibleStatus) {
                        try {
                            await window.AnsibleConfigModule.checkAnsibleStatus(clusterId);
                        } catch (err) {
                            console.error('Error checking Ansible status:', err);
                            window.showAlert('error', 'Không thể kiểm tra trạng thái Ansible: ' + (err.message || 'Lỗi không xác định'));
                        }
                    } else {
                        window.showAlert('error', 'Function checkAnsibleStatus không khả dụng. Vui lòng tải lại trang.');
                        console.error('checkAnsibleStatus function not found');
                    }
                });
            }

            // Bind Playbook Manager Modal - tự động load playbooks khi mở modal
            const playbookModal = document.getElementById('playbookManagerModal');
            if (playbookModal) {
                playbookModal.addEventListener('show.bs.modal', async () => {
                    const clusterId = await getClusterId();
                    if (!clusterId) {
                        window.showAlert('warning', 'Chưa có cluster nào. Vui lòng tạo cluster trước.');
                        // Đóng modal nếu chưa có cluster
                        const modalInstance = bootstrap.Modal.getInstance(playbookModal);
                        if (modalInstance) {
                            modalInstance.hide();
                        }
                        return;
                    }
                    
                    // Set currentClusterId cho playbook manager
                    if (window.setCurrentClusterId && typeof window.setCurrentClusterId === 'function') {
                        window.setCurrentClusterId(clusterId);
                    }
                    
                    // Bind buttons trong modal (chỉ bind một lần)
                    if (window.bindPlaybookManagerButtons && typeof window.bindPlaybookManagerButtons === 'function') {
                        window.bindPlaybookManagerButtons();
                    }
                    
                    // Load playbooks cho cluster hiện tại
                    // Trước tiên kiểm tra cluster có tồn tại và có master không
                    try {
                        const clusterDetail = await window.ApiClient.get(`/admin/clusters/${clusterId}/detail`);
                        if (!clusterDetail) {
                            window.showAlert('warning', 'Không tìm thấy thông tin cluster. Vui lòng kiểm tra lại.');
                            return;
                        }
                        
                        // Kiểm tra cluster có master server không
                        const hasMaster = clusterDetail.masterNode && clusterDetail.masterNode !== 'Chưa có' && clusterDetail.masterNode !== '-';
                        if (!hasMaster) {
                            const playbookList = document.getElementById('playbook-list');
                            if (playbookList) {
                                playbookList.innerHTML = '<div class="list-group-item text-center text-warning">Cluster chưa có master server. Vui lòng thêm máy chủ master vào cluster trước.</div>';
                            }
                            window.showAlert('warning', 'Cluster chưa có master server. Vui lòng thêm máy chủ master vào cluster trước.');
                            return;
                        }
                    } catch (clusterErr) {
                        console.error('Error checking cluster:', clusterErr);
                        window.showAlert('error', 'Không thể kiểm tra thông tin cluster: ' + (clusterErr.message || 'Lỗi không xác định'));
                        return;
                    }
                    
                    // Load playbooks sau khi đã kiểm tra cluster
                    if (window.loadPlaybooks && typeof window.loadPlaybooks === 'function') {
                        try {
                            await window.loadPlaybooks(clusterId);
                        } catch (err) {
                            console.error('Error loading playbooks:', err);
                            // Không hiển thị alert nữa vì loadPlaybooks đã tự hiển thị error
                        }
                    } else if (window.refreshPlaybooks && typeof window.refreshPlaybooks === 'function') {
                        // Fallback nếu không có loadPlaybooks
                        try {
                            await window.refreshPlaybooks();
                        } catch (err) {
                            console.error('Error refreshing playbooks:', err);
                            window.showAlert('error', 'Không thể làm mới danh sách playbook: ' + (err.message || 'Lỗi không xác định'));
                        }
                    }
                });
            }

            // Bind cleanup backdrop cho tất cả các modal trong trang này
            const modalIds = [
                'initAnsibleModal',
                'ansibleConfigModal',
                'playbookManagerModal',
                'ansibleInstallModal'
            ];

            // NOTE: Không cần thêm individual hidden.bs.modal listeners ở đây
            // vì đã có global listener trong modal.js (line 355) sẽ cleanup backdrop cho TẤT CẢ modals
            // Global listener sẽ tự động cleanup backdrop cho tất cả modals khi đóng
        },

        runEnvironmentCheck: function() {
            window.showAlert('info', 'Đang chạy playbook kiểm tra môi trường...');
            // TODO: Implement environment check
            console.log('Running environment check for cluster:', this.currentClusterId);
        },

        installAnsible: function() {
            window.showAlert('info', 'Đang cài đặt Ansible qua playbook...');
            // TODO: Implement Ansible installation
            console.log('Installing Ansible for cluster:', this.currentClusterId);
        },

        installKubernetes: function() {
            window.showAlert('info', 'Đang chạy playbook cài K8s + join node...');
            // TODO: Implement Kubernetes installation
            console.log('Installing Kubernetes for cluster:', this.currentClusterId);
        },

        installCalico: function() {
            window.showAlert('info', 'Đang cài đặt Calico CNI...');
            // TODO: Implement Calico installation
            console.log('Installing Calico for cluster:', this.currentClusterId);
        },

        installIngress: function() {
            window.showAlert('info', 'Đang cài đặt Ingress NGINX...');
            // TODO: Implement Ingress installation
            console.log('Installing Ingress for cluster:', this.currentClusterId);
        },

        installMetalLB: function() {
            window.showAlert('info', 'Đang cài đặt MetalLB...');
            // TODO: Implement MetalLB installation
            console.log('Installing MetalLB for cluster:', this.currentClusterId);
        },

        verifyCluster: function() {
            window.showAlert('info', 'Đang verify cluster (kubectl get nodes, top nodes, pods...)...');
            // TODO: Implement cluster verification
            console.log('Verifying cluster:', this.currentClusterId);
        }
    };

    // Expose module globally
    window.ClusterSetupModule = ClusterSetupModule;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ClusterSetupModule.init());
    } else {
        ClusterSetupModule.init();
    }
})();

