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

    // Hàm hỗ trợ: Normalize CPU cores (convert từ nan cores về cores nếu cần)
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

    // Hàm hỗ trợ: Format CPU để hiển thị (dạng millicores)
    function formatCpuDisplay(cpuValue) {
        const cores = normalizeCpuCores(cpuValue);
        if (cores <= 0) return '0m';
        // Luôn hiển thị dưới dạng millicores (m) để đồng nhất
        const millicores = Math.round(cores * 1000);
        return millicores + 'm';
    }

    // Hàm hỗ trợ: Format CPU cores đơn giản (cho servers/clusters - hiển thị "X cores")
    function formatCpuCores(cpuCores) {
        if (!cpuCores || cpuCores === '-') return '-';
        const cores = parseInt(cpuCores, 10);
        if (!isNaN(cores)) {
            return `${cores} cores`;
        }
        return String(cpuCores);
    }

    // Hàm hỗ trợ: Normalize RAM về Mi
    function normalizeRamMi(ramValue) {
        let ramRaw = typeof ramValue === 'number' ? ramValue : parseFloat(ramValue || '0');
        if (!Number.isFinite(ramRaw)) {
            return 0;
        }
        return ramRaw;
    }

    // Hàm hỗ trợ: Format RAM để hiển thị (Mi/Gi)
    function formatRamDisplay(ramValue) {
        const ramMi = normalizeRamMi(ramValue);
        if (ramMi <= 0) return '0 Mi';
        if (ramMi >= 1024) {
            const gib = ramMi / 1024;
            return gib.toFixed(2).replace(/\.?0+$/, '') + ' Gi';
        }
        return Math.round(ramMi) + ' Mi';
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
            titleEl.textContent = title || 'Kubernetes Output';
        }
        const contentEl = document.getElementById('k8s-output-content');
        if (contentEl) {
            // Cho phép render HTML khi cần (ví dụ hiển thị nút Logs)
            contentEl.innerHTML = output || '';
        }

        // Bind download button
        const downloadBtn = document.getElementById('k8s-output-download-btn');
        if (downloadBtn) {
            const newDownloadBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);
            newDownloadBtn.addEventListener('click', () => {
                const blob = new Blob([output || ''], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(title || 'k8s-output').replace(/\s+/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
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
        showK8sOutput,
        normalizeCpuCores,
        formatCpuDisplay,
        formatCpuCores,
        normalizeRamMi,
        formatRamDisplay
    };
})();

