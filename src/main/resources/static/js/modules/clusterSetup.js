// Cluster Setup Module
(function() {
    'use strict';

    const ClusterSetupModule = {
        currentClusterId: 1, // Với 1 cluster duy nhất, luôn dùng ID = 1

        init: function() {
            this.loadClusterInfo();
            this.bindEvents();
        },

        loadClusterInfo: function() {
            if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
                setTimeout(() => this.loadClusterInfo(), 100);
                return;
            }

            window.ApiClient.get('/admin/clusters').then(clusters => {
                const select = document.getElementById('cluster-select');
                if (!select) return;

                // Với 1 cluster duy nhất, luôn hiển thị thông tin cluster
                if (clusters && clusters.length > 0) {
                    const cluster = clusters[0];
                    
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
                        clusterInfo.innerHTML = `🧩 <strong>${cluster.name || 'Default Cluster'}</strong> - Servers có clusterStatus = 'AVAILABLE'`;
                    }
                    
                    select.style.display = 'none';
                    select.innerHTML = '';
                    const opt = document.createElement('option');
                    opt.value = cluster.id;
                    opt.textContent = cluster.name || 'Default Cluster';
                    opt.selected = true;
                    select.appendChild(opt);
                    
                    this.currentClusterId = cluster.id;
                } else {
                    // Chưa có servers với clusterStatus = "AVAILABLE"
                    const parent = select.closest('div');
                    if (parent) {
                        const label = parent.querySelector('label');
                        if (label) label.style.display = 'none';
                        
                        let clusterInfo = parent.querySelector('.cluster-info-display');
                        if (!clusterInfo) {
                            clusterInfo = document.createElement('div');
                            clusterInfo.className = 'cluster-info-display';
                            clusterInfo.style.cssText = 'padding: 8px 12px; background: #FFF3E0; border-radius: 6px; border: 1px solid #FF9800; font-size: 13px; color: #E65100;';
                            parent.insertBefore(clusterInfo, select);
                        }
                        clusterInfo.innerHTML = `⚠️ Chưa có servers với clusterStatus = 'AVAILABLE'. Vui lòng thêm servers và set clusterStatus = 'AVAILABLE'.`;
                    }
                    select.style.display = 'none';
                }
            }).catch(err => {
                console.error('Error loading cluster info:', err);
                // Không hiển thị error vì có thể cluster chưa có servers
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

            // Helper function to get clusterID (với 1 cluster duy nhất, luôn trả về 1)
            const getClusterId = async () => {
                // Với 1 cluster duy nhất, luôn trả về ID = 1
                return this.currentClusterId || 1;
            };

            // Step 1: Environment Check
            const btnStep1 = document.getElementById('btn-step-1-check');
            if (btnStep1) {
                btnStep1.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.runEnvironmentCheck();
                });
            }

            // Step 2: Install Ansible
            const btnStep2 = document.getElementById('btn-step-2-ansible');
            if (btnStep2) {
                btnStep2.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.installAnsible();
                });
            }

            // Step 3: Install Kubernetes
            const btnStep3 = document.getElementById('btn-step-3-k8s');
            if (btnStep3) {
                btnStep3.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.installKubernetes();
                });
            }

            // Step 4: Install Addons
            const btnStep4Calico = document.getElementById('btn-step-4-calico');
            if (btnStep4Calico) {
                btnStep4Calico.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.installCalico();
                });
            }

            const btnStep4Ingress = document.getElementById('btn-step-4-ingress');
            if (btnStep4Ingress) {
                btnStep4Ingress.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.installIngress();
                });
            }

            const btnStep4MetalLB = document.getElementById('btn-step-4-metallb');
            if (btnStep4MetalLB) {
                btnStep4MetalLB.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.installMetalLB();
                });
            }

            // Step 5: Verify Cluster
            const btnStep5 = document.getElementById('btn-step-5-verify');
            if (btnStep5) {
                btnStep5.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    this.verifyCluster();
                });
            }

            // Check Ansible Status button
            const checkAnsibleBtn = document.getElementById('cd-check-ansible');
            if (checkAnsibleBtn) {
                checkAnsibleBtn.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    // Với 1 cluster duy nhất, không cần kiểm tra clusterId nữa
                    
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
                    // Với 1 cluster duy nhất, luôn có clusterId = 1
                    
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

