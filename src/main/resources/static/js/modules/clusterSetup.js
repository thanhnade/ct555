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

            window.ApiClient.get('/admin/clusters').then(clusters => {
                const select = document.getElementById('cluster-select');
                if (!select) return;

                select.innerHTML = '<option value="">-- Chọn cluster --</option>';
                (clusters || []).forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name || `Cluster ${c.id}`;
                    select.appendChild(opt);
                });

                // Auto-select first cluster if only one exists
                if (clusters && clusters.length === 1) {
                    select.value = clusters[0].id;
                    this.currentClusterId = clusters[0].id;
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
            // Step 1: Environment Check
            const btnStep1 = document.getElementById('btn-step-1-check');
            if (btnStep1) {
                btnStep1.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.runEnvironmentCheck();
                });
            }

            // Step 2: Install Ansible
            const btnStep2 = document.getElementById('btn-step-2-ansible');
            if (btnStep2) {
                btnStep2.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.installAnsible();
                });
            }

            // Step 3: Install Kubernetes
            const btnStep3 = document.getElementById('btn-step-3-k8s');
            if (btnStep3) {
                btnStep3.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.installKubernetes();
                });
            }

            // Step 4: Install Addons
            const btnStep4Calico = document.getElementById('btn-step-4-calico');
            if (btnStep4Calico) {
                btnStep4Calico.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.installCalico();
                });
            }

            const btnStep4Ingress = document.getElementById('btn-step-4-ingress');
            if (btnStep4Ingress) {
                btnStep4Ingress.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.installIngress();
                });
            }

            const btnStep4MetalLB = document.getElementById('btn-step-4-metallb');
            if (btnStep4MetalLB) {
                btnStep4MetalLB.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.installMetalLB();
                });
            }

            // Step 5: Verify Cluster
            const btnStep5 = document.getElementById('btn-step-5-verify');
            if (btnStep5) {
                btnStep5.addEventListener('click', () => {
                    if (!this.currentClusterId) {
                        window.showAlert('warning', 'Vui lòng chọn cluster');
                        return;
                    }
                    this.verifyCluster();
                });
            }
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

