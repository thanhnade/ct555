// Kubernetes Helpers Module - Common utility functions
(function () {
    'use strict';

    // Hàm hỗ trợ: Escape HTML để tránh XSS
    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Hàm hỗ trợ: Kiểm tra namespace có phải là namespace hệ thống không
    function isSystemNamespace(name) {
        if (!name) return false;
        const nsLower = name.toLowerCase();
        return nsLower === 'kube-system' || nsLower === 'kube-public' || 
               nsLower === 'kube-node-lease' || nsLower === 'default';
    }

    // Hàm hỗ trợ: Kiểm tra workload có phải là workload đặc biệt được phép xóa không
    function isAllowedSpecialWorkload(namespace, name) {
        if (!namespace || !name) return false;
        const nsLower = namespace.toLowerCase();
        const nameLower = name.toLowerCase();
        return (nsLower === 'kube-system' && nameLower === 'metrics-server') ||
               (nsLower === 'nfs-provisioner' && nameLower === 'nfs-client-provisioner') ||
               (nsLower === 'default' && nameLower === 'nfs-client-provisioner');
    }

    // Hàm hỗ trợ: Kiểm tra workload type có thể scale không
    function canScaleWorkloadType(type) {
        const t = (type || '').toLowerCase();
        return t === 'deployment' || t === 'statefulset';
    }

    // Hàm hỗ trợ: Lấy class badge cho trạng thái pod
    function getPodStatusBadgeClass(status) {
        switch ((status || '').toLowerCase()) {
            case 'running': return 'bg-success';
            case 'pending': return 'bg-warning';
            case 'failed': case 'error': return 'bg-danger';
            case 'succeeded': return 'bg-info';
            default: return 'bg-secondary';
        }
    }

    // Hàm hỗ trợ: Lấy class badge cho trạng thái namespace
    function getNamespaceStatusBadgeClass(status) {
        switch ((status || '').toLowerCase()) {
            case 'active': return 'bg-success';
            case 'terminating': return 'bg-warning';
            default: return 'bg-secondary';
        }
    }

    // Hàm hỗ trợ: Lấy class badge cho trạng thái workload
    function getWorkloadStatusBadgeClass(ready, total) {
        if (ready === total && ready > 0) return 'bg-success';
        if (ready > 0) return 'bg-warning';
        return 'bg-danger';
    }

    // Hàm hỗ trợ: Hiển thị output K8s trong modal (luôn dùng modal, không dùng alert)
    function showK8sOutput(title, output) {
        const modalEl = document.getElementById('k8s-output-modal');
        if (!modalEl) {
            // Nếu modal không tồn tại, log lỗi và không hiển thị gì cả
            console.error('k8s-output-modal không tồn tại. Vui lòng đảm bảo fragment k8s-modals được include trong trang.');
            return;
        }

        // Cập nhật title và content
        const titleEl = document.getElementById('k8s-output-title');
        if (titleEl) {
            titleEl.textContent = title || 'Chi tiết Kubernetes Resource';
        }
        const contentEl = document.getElementById('k8s-output-content');
        if (contentEl) {
            // Sử dụng textContent để tránh XSS và giữ nguyên định dạng
            contentEl.textContent = output || '';
        }

        // Bind copy button
        const copyBtn = document.getElementById('k8s-output-copy-btn');
        if (copyBtn) {
            // Xóa event listener cũ và thêm mới
            const newCopyBtn = copyBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
            
            newCopyBtn.addEventListener('click', () => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(output).then(() => {
                        if (window.showAlert) {
                            window.showAlert('success', 'Đã sao chép vào clipboard');
                        }
                    }).catch(err => {
                        console.error('Failed to copy:', err);
                        if (window.showAlert) {
                            window.showAlert('error', 'Không thể sao chép');
                        }
                    });
                } else {
                    // Fallback: select text
                    const textarea = document.createElement('textarea');
                    textarea.value = output;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    try {
                        document.execCommand('copy');
                        if (window.showAlert) {
                            window.showAlert('success', 'Đã sao chép vào clipboard');
                        }
                    } catch (err) {
                        if (window.showAlert) {
                            window.showAlert('error', 'Không thể sao chép');
                        }
                    }
                    document.body.removeChild(textarea);
                }
            });
        }

        // Hiển thị modal
        if (window.Modal) {
            window.Modal.show('k8s-output-modal');
        } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
                backdrop: true,
                keyboard: true,
                focus: true
            });
            modal.show();
        }
    }

    // Export module
    window.K8sHelpers = {
        escapeHtml,
        isSystemNamespace,
        isAllowedSpecialWorkload,
        canScaleWorkloadType,
        getPodStatusBadgeClass,
        getNamespaceStatusBadgeClass,
        getWorkloadStatusBadgeClass,
        showK8sOutput
    };
})();

