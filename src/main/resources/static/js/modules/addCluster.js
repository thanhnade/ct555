// Add Cluster Module - Initialize form for add-cluster page
(function() {
  'use strict';

  function initAddClusterPage() {
    // Đảm bảo showAlert được load trước khi sử dụng
    if (!window.showAlert || typeof window.showAlert !== 'function') {
      // Wait for admin.js or toast.js to load
      setTimeout(initAddClusterPage, 100);
      return;
    }
    
    // Check if cluster already exists
    if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
      setTimeout(initAddClusterPage, 100);
      return;
    }

    // Với 1 cluster duy nhất, không cần tạo cluster nữa
    // Chỉ cần set clusterStatus = "AVAILABLE" cho servers
    window.ApiClient.get('/admin/clusters').then(clusters => {
      // Luôn hiển thị thông báo: không cần tạo cluster, chỉ cần set clusterStatus
      const contentDiv = document.querySelector('div[th\\:fragment="content"]');
      if (contentDiv) {
        contentDiv.innerHTML = `
          <div class="page-title-row">
            <div>
              <div class="page-title">🧩 Cluster Management</div>
              <div class="page-subtitle">Hệ thống chỉ hỗ trợ 1 cluster duy nhất.</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn" onclick="window.location.href='/admin/cluster'">← Quay lại danh sách</button>
            </div>
          </div>
          <div class="table-card">
            <div style="padding: 20px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 16px;">ℹ️</div>
              <div style="font-size: 18px; font-weight: 600; color: #1976D2; margin-bottom: 8px;">
                Không cần tạo cluster
              </div>
              <div style="color: #666666; margin-bottom: 20px; line-height: 1.6; text-align: left; max-width: 600px; margin-left: auto; margin-right: auto;">
                Hệ thống hiện tại chỉ hỗ trợ quản lý <strong>1 cluster duy nhất</strong>. 
                <br><br>
                <strong style="color: #1976D2;">📋 Cách sử dụng:</strong>
                <ol style="text-align: left; margin-top: 12px;">
                  <li>Thêm servers vào hệ thống (nếu chưa có)</li>
                  <li>Set <code>clusterStatus = "AVAILABLE"</code> cho các servers bạn muốn thêm vào cluster</li>
                  <li>Servers có <code>clusterStatus = "AVAILABLE"</code> sẽ tự động thuộc cluster duy nhất</li>
                </ol>
                <br>
                <div style="background: #E3F2FD; padding: 12px; border-radius: 6px; margin-top: 16px;">
                  <strong>💡 Lưu ý:</strong> Cluster được quản lý tự động dựa trên <code>clusterStatus</code> của servers. 
                  Không cần tạo hoặc xóa cluster thủ công.
                </div>
              </div>
              <div style="display: flex; gap: 8px; justify-content: center;">
                <button class="btn btn-primary" onclick="window.location.href='/admin/cluster'">
                  Xem Cluster hiện tại
                </button>
                <button class="btn" onclick="window.location.href='/admin/servers'">
                  Quản lý Servers
                </button>
              </div>
            </div>
          </div>
        `;
      }
      return;
      
      // Code phía dưới không còn cần thiết vì không tạo cluster nữa
      /* REMOVED - Không cần tạo cluster nữa
      const form = document.getElementById('create-cluster-form');
      if (form && !form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', async function(e) {
          e.preventDefault();
          if (window.K8sClustersModule && window.K8sClustersModule.createCluster) {
            const nameInput = document.getElementById('cluster-name');
            const descInput = document.getElementById('cluster-description');
            const name = nameInput ? nameInput.value.trim() : '';
            const description = descInput ? descInput.value.trim() : '';
            const submitBtn = document.getElementById('create-cluster-submit-btn');
            const textSpan = document.getElementById('create-cluster-text');
            const loadingSpan = document.getElementById('create-cluster-loading');
            const errorDiv = document.getElementById('create-cluster-error');

            // Hide error
            if (errorDiv) {
              errorDiv.style.display = 'none';
              errorDiv.textContent = '';
            }

            if (!name) {
              const errorMsg = 'Vui lòng nhập tên cluster';
              if (errorDiv) {
                errorDiv.textContent = errorMsg;
                errorDiv.style.display = 'block';
              }
              if (typeof window.showAlert === 'function') {
                window.showAlert('warning', errorMsg);
              } else {
                alert(errorMsg);
              }
              return;
            }

            // Validate pattern
            if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
              const errorMsg = 'Tên cluster chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới';
              if (errorDiv) {
                errorDiv.textContent = errorMsg;
                errorDiv.style.display = 'block';
              }
              if (typeof window.showAlert === 'function') {
                window.showAlert('warning', errorMsg);
              } else {
                alert(errorMsg);
              }
              return;
            }

            // Check again if cluster already exists before submitting
            try {
              const existingClusters = await window.ApiClient.get('/admin/clusters').catch(() => []);
              if (existingClusters && existingClusters.length > 0) {
                const clusterName = existingClusters[0].name || `Cluster ${existingClusters[0].id}`;
                const errorMsg = `⚠️ Đã có cluster "${clusterName}" trong hệ thống. Để tạo cluster mới, bạn phải xóa cluster cũ trước.`;
                
                // Hiển thị error trong form
                if (errorDiv) {
                  errorDiv.textContent = errorMsg;
                  errorDiv.style.display = 'block';
                }
                
                // Đảm bảo showAlert được gọi và hiển thị
                if (typeof window.showAlert === 'function') {
                  window.showAlert('error', errorMsg);
                } else {
                  // Fallback nếu showAlert chưa load
                  alert(errorMsg);
                  console.error('showAlert not available, using alert fallback');
                }
                
                // Reset button state
                if (submitBtn) submitBtn.disabled = false;
                if (textSpan) textSpan.style.display = 'inline';
                if (loadingSpan) loadingSpan.style.display = 'none';
                
                return;
              }
            } catch (checkErr) {
              console.error('Error checking clusters:', checkErr);
              // Continue if check fails (network error, etc.)
            }

            try {
              if (submitBtn) submitBtn.disabled = true;
              if (textSpan) textSpan.style.display = 'none';
              if (loadingSpan) loadingSpan.style.display = 'inline';

              await window.K8sClustersModule.createCluster(name, description || null);
              
              // Redirect to cluster list on success (showAlert đã được gọi trong createCluster)
              setTimeout(() => {
                window.location.href = '/admin/cluster';
              }, 1000);
            } catch (err) {
              // createCluster đã hiển thị alert rồi, chỉ cần hiển thị error trong form
              const errorMsg = err.message || 'Tạo cluster thất bại';
              
              // Hiển thị error trong form (không cần showAlert nữa vì createCluster đã gọi)
              if (errorDiv) {
                errorDiv.textContent = errorMsg;
                errorDiv.style.display = 'block';
              }
              
              // Không cần gọi showAlert ở đây vì createCluster đã gọi rồi
              // Chỉ log để debug
              console.error('Error creating cluster:', err);
            } finally {
              if (submitBtn) submitBtn.disabled = false;
              if (textSpan) textSpan.style.display = 'inline';
              if (loadingSpan) loadingSpan.style.display = 'none';
            }
          }
        });
      }
      */
    }).catch(err => {
      console.error('Error checking clusters:', err);
      if (typeof window.showAlert === 'function') {
        window.showAlert('error', 'Không thể kiểm tra cluster hiện có');
      } else {
        alert('Không thể kiểm tra cluster hiện có');
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAddClusterPage);
  } else {
    initAddClusterPage();
  }
})();
