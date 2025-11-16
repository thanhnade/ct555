// Cluster Setup Module
(function() {
    'use strict';

    // Helper function to escape HTML
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    const ClusterSetupModule = {
        currentClusterId: 1, // Với 1 cluster duy nhất, luôn dùng ID = 1

        init: function() {
            this.loadClusterInfo();
            this.loadStep5ClusterInfo();
            this.bindEvents();
        },

        loadClusterInfo: async function() {
            if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
                setTimeout(() => this.loadClusterInfo(), 100);
                return;
            }

            const clusterStatusDisplay = document.getElementById('cluster-status-display');
            if (!clusterStatusDisplay) return;

            // Hiển thị loading state với spinner
            clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #E3F2FD; border-radius: 6px; border: 1px solid #2196F3; font-size: 13px; color: #1565C0; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
            clusterStatusDisplay.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 14px; height: 14px; border-width: 2px; color: #2196F3;"></span><span>Trạng thái: Đang tải...</span>';

            try {
                const [clusterResponse, servers] = await Promise.all([
                    window.ApiClient.get('/admin/cluster/api').catch(() => null),
                    window.ApiClient.get('/admin/servers').catch(() => [])
                ]);
                
                const select = document.getElementById('cluster-select');
                if (select) {
                    select.style.display = 'none';
                }

                // Kiểm tra cluster sẵn sàng
                const cluster = clusterResponse || null;
                const availableServers = (servers || []).filter(s => {
                    const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
                    return clusterStatus === 'AVAILABLE';
                });

                // Kiểm tra trạng thái sẵn sàng
                if (!cluster || availableServers.length === 0) {
                    // Chưa có servers trong cluster
                    clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #FFF3E0; border-radius: 6px; border: 1px solid #FF9800; font-size: 13px; color: #E65100; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
                    clusterStatusDisplay.innerHTML = '<span>⚠️</span> <span>Trạng thái: Chưa có servers</span>';
                    if (cluster && select) {
                        select.innerHTML = '';
                        const opt = document.createElement('option');
                        opt.value = cluster.id;
                        opt.textContent = cluster.name || 'Default Cluster';
                        opt.selected = true;
                        select.appendChild(opt);
                        this.currentClusterId = cluster.id;
                    }
                } else {
                    // Có servers, kiểm tra K8s status
                    this.currentClusterId = cluster.id;
                    if (select) {
                        select.innerHTML = '';
                        const opt = document.createElement('option');
                        opt.value = cluster.id;
                        opt.textContent = cluster.name || 'Default Cluster';
                        opt.selected = true;
                        select.appendChild(opt);
                    }

                    // Load K8s version để kiểm tra sẵn sàng
                    try {
                        const k8sVersionResponse = await window.ApiClient.get('/admin/cluster/k8s-version').catch(() => null);
                        const hasK8s = k8sVersionResponse && k8sVersionResponse.installed && k8sVersionResponse.version;
                        const masterCount = availableServers.filter(s => s.role === 'MASTER').length;
                        const workerCount = availableServers.filter(s => s.role === 'WORKER').length;
                        const hasMaster = masterCount > 0;

                        if (hasK8s && hasMaster) {
                            // Cluster đã sẵn sàng
                            clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #E8F5E9; border-radius: 6px; border: 1px solid #4CAF50; font-size: 13px; color: #2E7D32; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
                            const version = k8sVersionResponse.version ? escapeHtml(k8sVersionResponse.version) : '';
                            clusterStatusDisplay.innerHTML = `<span>✅</span> <span>Trạng thái: K8s ${version} | ${masterCount} master | ${workerCount} worker</span>`;
                        } else if (hasMaster) {
                            // Có master nhưng chưa cài K8s
                            clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #FFF3E0; border-radius: 6px; border: 1px solid #FF9800; font-size: 13px; color: #E65100; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
                            clusterStatusDisplay.innerHTML = `<span>⏳</span> <span>Trạng thái: Chưa cài K8s | ${masterCount} master | ${workerCount} worker</span>`;
                        } else {
                            // Chưa có master
                            clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #FFF3E0; border-radius: 6px; border: 1px solid #FF9800; font-size: 13px; color: #E65100; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
                            clusterStatusDisplay.innerHTML = `<span>⚠️</span> <span>Trạng thái: Chưa có master | ${workerCount} worker</span>`;
                        }
                    } catch (k8sErr) {
                        // Lỗi khi kiểm tra K8s, hiển thị thông tin cơ bản
                        const masterCount = availableServers.filter(s => s.role === 'MASTER').length;
                        const workerCount = availableServers.filter(s => s.role === 'WORKER').length;
                        clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #E3F2FD; border-radius: 6px; border: 1px solid #2196F3; font-size: 13px; color: #1565C0; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
                        clusterStatusDisplay.innerHTML = `<span>ℹ️</span> <span>Trạng thái: Đang kiểm tra... | ${masterCount} master | ${workerCount} worker</span>`;
                    }
                }
            } catch (err) {
                console.error('Error loading cluster info:', err);
                clusterStatusDisplay.style.cssText = 'padding: 8px 12px; background: #FFEBEE; border-radius: 6px; border: 1px solid #F44336; font-size: 13px; color: #C62828; display: flex; align-items: center; gap: 8px; white-space: nowrap;';
                clusterStatusDisplay.innerHTML = '<span>❌</span> <span>Trạng thái: Lỗi</span>';
            }
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

            // Step 1: Prepare Nodes
            const btnStep1 = document.getElementById('btn-step-1-prepare');
            if (btnStep1) {
                btnStep1.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.prepareNodes();
                });
            }

            // Step 2: Setup Controller Node
            const btnStep2 = document.getElementById('btn-step-2-controller');
            if (btnStep2) {
                btnStep2.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.setupControllerNode();
                });
            }

            // Step 3: Clone Kubespray
            const btnStep3 = document.getElementById('btn-step-3-clone');
            if (btnStep3) {
                btnStep3.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.cloneKubespray();
                });
            }

            // Step 4: Build Inventory
            const btnStep4 = document.getElementById('btn-step-4-inventory');
            if (btnStep4) {
                btnStep4.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.buildInventory();
                });
            }

            // Step 5: Configure Roles & Addons
            const btnStep5 = document.getElementById('btn-step-5-configure');
            if (btnStep5) {
                btnStep5.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.configureRolesAndAddons();
                });
            }

            // Step 6: Deploy Cluster
            const btnStep6 = document.getElementById('btn-step-6-deploy');
            if (btnStep6) {
                btnStep6.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.deployCluster();
                });
            }

            // Step 7: Get Kubeconfig
            const btnStep7 = document.getElementById('btn-step-7-kubeconfig');
            if (btnStep7) {
                btnStep7.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.getKubeconfig();
                });
            }

            // Step 8: Install Additional Addons
            const btnStep8Calico = document.getElementById('btn-step-8-calico');
            if (btnStep8Calico) {
                btnStep8Calico.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.installCalico();
                });
            }

            const btnStep8Ingress = document.getElementById('btn-step-8-ingress');
            if (btnStep8Ingress) {
                btnStep8Ingress.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.installIngress();
                });
            }

            const btnStep8MetalLB = document.getElementById('btn-step-8-metallb');
            if (btnStep8MetalLB) {
                btnStep8MetalLB.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.installMetalLB();
                });
            }

            const btnStep8Helm = document.getElementById('btn-step-8-helm');
            if (btnStep8Helm) {
                btnStep8Helm.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
                    this.installHelm();
                });
            }

            // Step 9: Verify Cluster
            const btnStep9 = document.getElementById('btn-step-9-verify');
            if (btnStep9) {
                btnStep9.addEventListener('click', async () => {
                    const clusterId = await getClusterId();
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
                        const clusterDetail = await window.ApiClient.get(`/admin/cluster/${clusterId}/detail`);
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

        prepareNodes: function() {
            window.showAlert('info', 'Đang chuẩn bị nodes (hostname, update, swapoff, kernel modules)...');
            // TODO: Implement node preparation
            // Run playbook để cập nhật hostname, system update, tắt swap, load kernel modules trên tất cả nodes
            console.log('Preparing nodes for cluster:', this.currentClusterId);
        },

        setupControllerNode: function() {
            window.showAlert('info', 'Đang cài đặt Python, Ansible, Git trên controller node...');
            // TODO: Implement controller node setup
            // Cài Python, Ansible, Git trên master node để dùng làm controller
            console.log('Setting up controller node for cluster:', this.currentClusterId);
        },

        cloneKubespray: function() {
            window.showAlert('info', 'Đang clone Kubespray repository...');
            // TODO: Implement Kubespray cloning
            // Clone kubespray từ GitHub vào controller node (ví dụ: /opt/kubespray)
            console.log('Cloning Kubespray for cluster:', this.currentClusterId);
        },

        buildInventory: function() {
            window.showAlert('info', 'Đang tạo inventory từ servers có clusterStatus = "AVAILABLE"...');
            // TODO: Implement inventory building
            // Tạo inventory từ template của Kubespray, điền thông tin nodes dựa trên servers
            console.log('Building inventory for cluster:', this.currentClusterId);
        },

        configureRolesAndAddons: function() {
            window.showAlert('info', 'Mở cấu hình Roles trong inventory...');
            // TODO: Implement configuration UI
            // Mở modal hoặc form để chỉnh roles (master/worker) trong inventory của Kubespray
            console.log('Configuring roles in inventory for cluster:', this.currentClusterId);
        },

        loadStep5ClusterInfo: async function() {
            const displayDiv = document.getElementById('step5-cluster-info-display');
            if (!displayDiv) return;

            // Hiển thị trạng thái đang tải
            displayDiv.style.cssText = 'margin-top: 12px; padding: 8px 12px; background: #E3F2FD; border-radius: 6px; border: 1px solid #2196F3; font-size: 13px; color: #1565C0; display: flex; align-items: center; gap: 8px;';
            displayDiv.innerHTML = '<span>ℹ️</span> <span>Đang tải thông tin cluster...</span>';

            try {
                // Lấy thông tin cluster và servers (hệ thống chỉ có 1 cluster)
                const clusterResponse = await window.ApiClient.get('/admin/cluster/api').catch(() => null);
                if (!clusterResponse) {
                    displayDiv.style.cssText = 'margin-top: 12px; padding: 8px 12px; background: #FFF3E0; border-radius: 6px; border: 1px solid #FF9800; font-size: 13px; color: #E65100; display: flex; align-items: center; gap: 8px;';
                    displayDiv.innerHTML = '<span>⚠️</span> <span>Chưa có cluster hoặc servers. Vui lòng thêm servers vào cluster trước.</span>';
                    return;
                }

                const serversResponse = await window.ApiClient.get('/admin/servers').catch(() => []);
                const allServers = Array.isArray(serversResponse) ? serversResponse : (serversResponse.data || []);
                const availableServers = allServers.filter(s => s.clusterStatus === 'AVAILABLE');

                if (availableServers.length === 0) {
                    displayDiv.style.cssText = 'margin-top: 12px; padding: 8px 12px; background: #FFF3E0; border-radius: 6px; border: 1px solid #FF9800; font-size: 13px; color: #E65100; display: flex; align-items: center; gap: 8px;';
                    displayDiv.innerHTML = '<span>⚠️</span> <span>Chưa có servers với clusterStatus = "AVAILABLE". Vui lòng gán servers vào cluster trước.</span>';
                    return;
                }

                const masterCount = availableServers.filter(s => s.role === 'MASTER').length;
                const workerCount = availableServers.filter(s => s.role === 'WORKER').length;

                // Hiển thị thông tin roles
                displayDiv.style.cssText = 'margin-top: 12px; padding: 8px 12px; background: #E8F5E9; border-radius: 6px; border: 1px solid #4CAF50; font-size: 13px; color: #2E7D32; display: flex; align-items: center; gap: 8px;';
                displayDiv.innerHTML = `<span>✅</span> <span><strong>Roles hiện tại:</strong> ${masterCount} master node(s), ${workerCount} worker node(s) | Tổng: ${availableServers.length} node(s)</span>`;
            } catch (err) {
                console.error('Error loading step5 cluster info:', err);
                displayDiv.style.cssText = 'margin-top: 12px; padding: 8px 12px; background: #FFEBEE; border-radius: 6px; border: 1px solid #F44336; font-size: 13px; color: #C62828; display: flex; align-items: center; gap: 8px;';
                displayDiv.innerHTML = '<span>❌</span> <span>Lỗi khi tải thông tin cluster: ' + (err.message || 'Lỗi không xác định') + '</span>';
            }
        },

        deployCluster: function() {
            window.showAlert('info', 'Đang triển khai cluster bằng ansible-playbook cluster.yml...');
            // TODO: Implement cluster deployment
            // Chạy ansible-playbook cluster.yml từ controller node
            console.log('Deploying cluster for cluster:', this.currentClusterId);
        },

        getKubeconfig: function() {
            window.showAlert('info', 'Đang lấy kubeconfig từ master node...');
            // TODO: Implement kubeconfig retrieval
            // Lấy /etc/kubernetes/admin.conf từ master node và hiển thị/download
            console.log('Getting kubeconfig for cluster:', this.currentClusterId);
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

        installHelm: function() {
            window.showAlert('info', 'Đang cài đặt Helm 3...');
            // TODO: Implement Helm installation
            console.log('Installing Helm for cluster:', this.currentClusterId);
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

