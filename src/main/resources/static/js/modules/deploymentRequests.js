// Deployment Requests Module - Quản lý yêu cầu triển khai
(function () {
	'use strict';

	// Helper: Get escapeHtml function
	function getEscapeHtml() {
		return window.K8sHelpers?.escapeHtml || ((text) => {
			if (text == null) return '';
			const div = document.createElement('div');
			div.textContent = String(text);
			return div.innerHTML;
		});
	}

	// State
	let deploymentLogsPollingInterval = null;
	let currentViewingDeploymentId = null;

	// Load deployment requests list
	async function loadList() {
		const tbody = document.getElementById('deployment-requests-tbody');
		if (!tbody) return;

		try {
			tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: #666666; padding: 20px;">Đang tải...</td></tr>';

			const statusFilter = document.getElementById('deployment-status-filter');
			const status = statusFilter ? statusFilter.value : '';
			const url = status ? `/admin/deployment-requests?status=${encodeURIComponent(status)}` : '/admin/deployment-requests';

			const data = await window.ApiClient.get(url);

			if (!data || data.length === 0) {
				tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: #666666; padding: 20px;">Không có yêu cầu nào${status ? ' với trạng thái này' : ''}</td></tr>`;
				return;
			}

			tbody.innerHTML = '';
			data.forEach(req => {
				const tr = document.createElement('tr');
				const createdAt = req.createdAt ? new Date(req.createdAt).toLocaleString('vi-VN') : 'N/A';

				// Status badge (chip style like in mẫu)
				let statusBadge = '';
				let chipClass = 'yellow';
				if (req.status === 'PENDING') {
					statusBadge = 'Pending';
					chipClass = 'yellow';
				} else if (req.status === 'RUNNING') {
					statusBadge = 'Running';
					chipClass = 'green';
				} else if (req.status === 'PAUSED') {
					statusBadge = 'Paused';
					chipClass = 'yellow';
				} else if (req.status === 'ERROR') {
					statusBadge = 'Error';
					chipClass = 'red';
				} else if (req.status === 'REJECTED') {
					statusBadge = 'Rejected';
					chipClass = 'red';
				} else if (req.status === 'DELETED') {
					statusBadge = 'Deleted';
					chipClass = 'yellow';
				} else {
					const escapeHtml = getEscapeHtml();
					statusBadge = escapeHtml(req.status || '');
					chipClass = 'yellow';
				}
				statusBadge = `<span class="chip ${chipClass}">${statusBadge}</span>`;

				const currentReplicas = Number.isFinite(Number(req.replicas)) ? Number(req.replicas) : 1;
				const hasRequestedReplicas = Number.isFinite(Number(req.replicasRequested));
				const requestedReplicas = hasRequestedReplicas ? Number(req.replicasRequested) : currentReplicas;

				// Action buttons (giống mẫu: Xem, Duyệt, Từ chối)
				let actionButtons = '';
				if (req.status === 'DELETED') {
					actionButtons = '';
				} else if (req.status === 'PENDING') {
					actionButtons = `
						<button class="btn" onclick="window.DeploymentRequestsModule.viewDeploymentRequest(${req.id})">Xem</button>
						<button class="btn btn-primary" onclick="window.DeploymentRequestsModule.approveDeploymentRequest(${req.id})">Duyệt</button>
						<button class="btn" onclick="window.DeploymentRequestsModule.rejectDeploymentRequest(${req.id})">Từ chối</button>`;
				} else if (req.status === 'RUNNING' || req.status === 'PAUSED') {
					actionButtons = `
						<button class="btn" onclick="window.DeploymentRequestsModule.viewDeploymentRequest(${req.id})">Xem</button>
						<button class="btn" onclick="window.DeploymentRequestsModule.promptScaleDeployment(${req.id}, ${requestedReplicas})">Scale</button>`;
				} else if (req.status === 'ERROR') {
					actionButtons = `
						<button class="btn" onclick="window.DeploymentRequestsModule.viewDeploymentRequest(${req.id})">Xem</button>
						<button class="btn" onclick="window.DeploymentRequestsModule.retryDeploymentRequest(${req.id})">Retry</button>`;
				} else {
					actionButtons = `<button class="btn" onclick="window.DeploymentRequestsModule.viewDeploymentRequest(${req.id})">Xem</button>`;
				}

				const uploadedDate = req.createdAt ? new Date(req.createdAt).toLocaleDateString('vi-VN') : 'N/A';
				const escapeHtml = getEscapeHtml();
				const dockerImage = escapeHtml(req.dockerImage || 'N/A');

				tr.innerHTML = `
					<td>${escapeHtml(req.appName || `#${req.id}`)}</td>
					<td>${escapeHtml(req.username || 'Unknown')}</td>
					<td>${uploadedDate}</td>
					<td><code style="font-size: 12px;">${dockerImage}</code></td>
					<td>${statusBadge}</td>
					<td>
						${actionButtons}
					</td>
				`;
				tbody.appendChild(tr);
			});
		} catch (error) {
			if (tbody) {
				const escapeHtml = getEscapeHtml();
				tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: #dc3545; padding: 20px;">Lỗi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
			}
			console.error('loadDeploymentRequests error:', error);
			if (typeof window.showAlert === 'function') {
				window.showAlert('error', 'Không thể tải danh sách yêu cầu: ' + (error.message || 'Lỗi không xác định'));
			} else {
				console.error('showAlert not available:', error);
			}
		}
	}

	// View deployment logs
	function viewDeploymentLogs(id) {
		currentViewingDeploymentId = id;
		const logsSection = document.getElementById('deployment-logs-section');
		if (logsSection) {
			logsSection.style.display = 'block';
		}
		loadDeploymentLogs(id);
		startPollingDeploymentLogs(id);
	}

	// Load deployment logs from API
	async function loadDeploymentLogs(id) {
		const consoleDiv = document.getElementById('deployment-logs-console');
		if (!consoleDiv) return;

		try {
			const data = await window.ApiClient.get(`/admin/deployment-requests/${id}/logs`);
			if (data && data.logs) {
				consoleDiv.textContent = data.logs || 'Chưa có logs...';
				consoleDiv.scrollTop = consoleDiv.scrollHeight;
			} else {
				consoleDiv.innerHTML = '<div class="text-muted text-center">Không có logs...</div>';
			}
		} catch (error) {
			console.error('Error loading deployment logs:', error);
			const escapeHtml = getEscapeHtml();
			consoleDiv.innerHTML = `<div class="text-danger text-center">Lỗi tải logs: ${escapeHtml(error.message || 'Unknown error')}</div>`;
		}
	}

	// Start polling logs
	function startPollingDeploymentLogs(id) {
		stopPollingDeploymentLogs();
		currentViewingDeploymentId = id;
		deploymentLogsPollingInterval = setInterval(() => {
			if (currentViewingDeploymentId === id) {
				loadDeploymentLogs(id);
			}
		}, 1000);
	}

	// Stop polling logs
	function stopPollingDeploymentLogs() {
		if (deploymentLogsPollingInterval) {
			clearInterval(deploymentLogsPollingInterval);
			deploymentLogsPollingInterval = null;
		}
		currentViewingDeploymentId = null;
	}

	// Clear deployment logs
	function clearDeploymentLogs() {
		const consoleDiv = document.getElementById('deployment-logs-console');
		if (consoleDiv) {
			consoleDiv.innerHTML = '<div class="text-muted text-center">Chọn một deployment request để xem logs...</div>';
		}
		stopPollingDeploymentLogs();
	}

	// Scale deployment request
	async function scaleDeploymentRequest(id, replicas) {
		try {
			window.showAlert('info', `Đang scale ứng dụng #${id} lên ${replicas} replicas...`);
			const data = await window.ApiClient.post(`/admin/deployment-requests/${id}/scale`, { replicas });
			const scaleLabel = data.replicas === 0 ? '0 replicas (tạm dừng)' : `${data.replicas} replicas`;
			window.showAlert('success', `✅ Đã scale ứng dụng #${data.applicationId} về ${scaleLabel}`);
			await loadList();
		} catch (err) {
			window.showAlert('error', err.message || 'Scale thất bại');
		}
	}

	// Prompt scale deployment
	async function promptScaleDeployment(id, currentReplicas = 1) {
		const input = prompt(`Nhập số replicas mới cho deployment #${id}:`, currentReplicas ?? 1);
		if (input === null) return;

		const replicas = Number.parseInt(input, 10);
		if (!Number.isFinite(replicas) || replicas < 0) {
			window.showAlert('error', 'Số replicas phải là số nguyên >= 0');
			return;
		}

		if (replicas === 0) {
			const confirmPause = confirm('Bạn đang scale deployment về 0 replicas (tạm dừng toàn bộ pod). Tiếp tục?');
			if (!confirmPause) return;
		}

		await scaleDeploymentRequest(id, replicas);
	}

	// Delete deployment request
	async function deleteDeploymentRequest(id, appName, namespace) {
		const namespaceInfo = namespace && namespace.trim() !== '' ? `\n\nNamespace sẽ bị xóa: ${namespace}` : '';
		const confirmMsg = `Bạn có chắc chắn muốn xóa yêu cầu triển khai #${id}?\n\nỨng dụng: ${appName}${namespaceInfo}\n\nCảnh báo: Tất cả K8s resources (Deployment, Service, Ingress) và namespace sẽ bị xóa vĩnh viễn!\n\nQuá trình này có thể mất vài phút...`;

		if (!confirm(confirmMsg)) {
			return;
		}

		try {
			window.showAlert('info', `Đang xóa yêu cầu #${id} và dọn namespace...`);
			const data = await window.ApiClient.delete(`/admin/deployment-requests/${id}`);
			if (data && data.success) {
				window.showAlert('success', data.message || 'Đã xóa yêu cầu và namespace thành công!');
				await loadList();
				if (currentViewingDeploymentId === id) {
					clearDeploymentLogs();
				}
			} else {
				throw new Error(data?.message || data?.error || 'Lỗi không xác định');
			}
		} catch (error) {
			console.error('Error deleting deployment request:', error);
			const escapeHtml = getEscapeHtml();
			window.showAlert('error', '❌ Lỗi xóa yêu cầu: ' + escapeHtml(error.message || 'Lỗi kết nối'));
		}
	}

	// View deployment diagnostics
	async function viewDeploymentDiagnostics(id) {
		try {
			const data = await window.ApiClient.get(`/admin/deployment-requests/${id}/diagnostics`);
			stopPollingDeploymentLogs();
			currentViewingDeploymentId = null;
			const consoleEl = document.getElementById('deployment-logs-console');
			if (consoleEl) {
				consoleEl.innerHTML = `<div class="small mb-2">Deployment diagnostics cho #${id}</div><pre class="pre-wrap" style="font-size: 12px;">${escapeHtml(data.diagnostics || 'Không có dữ liệu')}</pre>`;
				consoleEl.scrollTop = 0;
			}
			window.showAlert('info', 'Đã tải diagnostics cho deployment #' + id);
		} catch (error) {
			window.showAlert('error', error.message || 'Không thể lấy diagnostics');
		}
	}

	// Approve deployment request (alias for processDeploymentRequest)
	async function approveDeploymentRequest(id) {
		if (!confirm('Bạn có chắc chắn muốn duyệt yêu cầu triển khai này?')) {
			return;
		}
		try {
			await processDeploymentRequest(id);
			window.showAlert('success', 'Yêu cầu đã được duyệt và đang triển khai.');
			await loadList();
		} catch (e) {
			window.showAlert('error', 'Không thể duyệt: ' + (e.message || 'Lỗi không xác định'));
		}
	}

	// Reject deployment request
	async function rejectDeploymentRequest(id) {
		const reason = prompt('Lý do từ chối (optional):', '');
		if (reason === null) return;
		try {
			await window.ApiClient.post(`/admin/deployment-requests/${id}/reject`, { reason });
			window.showAlert('info', 'Yêu cầu đã bị từ chối.');
			await loadList();
		} catch (e) {
			window.showAlert('error', 'Không thể từ chối: ' + (e.message || 'Lỗi không xác định'));
		}
	}

	// View deployment request (modal)
	async function viewDeploymentRequest(id) {
		try {
			const [detail, clusterResponse] = await Promise.all([
				window.ApiClient.get(`/admin/deployment-requests/${id}`),
				window.ApiClient.get('/admin/cluster/api').catch(() => null)
			]);

			// Với 1 cluster duy nhất, không cần chọn cluster nữa
			const cluster = clusterResponse || null;
			const clusterName = cluster ? (cluster.name || 'Default Cluster') : 'Default Cluster';
			const clusterStatus = cluster ? (cluster.status || 'UNKNOWN') : 'UNKNOWN';

			const clusterHelpText = 'Hệ thống sẽ tự động sử dụng cluster duy nhất (servers có clusterStatus = "AVAILABLE")';
			const currentClusterLabel = cluster ? `${clusterName} (${clusterStatus})` : 'Chưa có cluster';

			const modalId = 'deploymentDetailModal';
			const existing = document.getElementById(modalId);
			if (existing) existing.remove();

			// Parse envVars if exists
			let envVarsDisplay = '';
			if (detail.envVars) {
				try {
					const envVarsObj = typeof detail.envVars === 'string' ? JSON.parse(detail.envVars) : detail.envVars;
					envVarsDisplay = Object.entries(envVarsObj).map(([key, value]) => `${key}=${value}`).join('\n');
				} catch (e) {
					envVarsDisplay = detail.envVars;
				}
			}

			const statusBadgeClass = detail.status === 'PENDING' ? 'bg-warning' :
				(detail.status === 'ERROR' ? 'bg-danger' :
					(detail.status === 'RUNNING' ? 'bg-success' : 'bg-secondary'));

			const escapeHtml = getEscapeHtml();
			const modalHtml = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-info-circle"></i> Xử lý yêu cầu #${id}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div class="card mb-3">
                <div class="card-header bg-light">
                  <h6 class="mb-0"><i class="bi bi-info-circle"></i> Thông tin cơ bản</h6>
                </div>
                <div class="card-body">
                  <div class="row g-2 mb-2">
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Tên app:</strong></label>
                      <div><code>${escapeHtml(detail.appName || '')}</code></div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Người dùng:</strong></label>
                      <div>${escapeHtml(detail.username || 'Unknown')}</div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Namespace:</strong></label>
                      <div><code>${escapeHtml(detail.k8sNamespace || '')}</code></div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Trạng thái:</strong></label>
                      <div><span class="badge ${statusBadgeClass}">${escapeHtml(detail.status || '')}</span></div>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small"><strong>Cluster hiện tại:</strong></label>
                      <div>${escapeHtml(currentClusterLabel)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card mb-3">
                <div class="card-header bg-light">
                  <h6 class="mb-0"><i class="bi bi-gear"></i> Cấu hình triển khai</h6>
                </div>
                <div class="card-body">
                  <div class="mb-3">
                    <label class="form-label">Docker Image *</label>
                    <input id="dd-docker" class="form-control" value="${escapeHtml(detail.dockerImage || '')}" placeholder="nginx:latest" />
                    <small class="form-text text-muted">Ví dụ: nginx:latest, node:18-alpine</small>
                  </div>

                  <div class="row g-2 mb-3">
                    <div class="col-md-6">
                      <label class="form-label">Container Port *</label>
                      <input type="number" id="dd-port" class="form-control" value="${detail.containerPort != null ? detail.containerPort : 80}" min="1" max="65535" />
                      <small class="form-text text-muted">Port mà container lắng nghe (mặc định: 80)</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Replicas *</label>
                      <div class="input-group">
                        <input type="number" id="dd-replicas" class="form-control" value="${detail.replicas != null ? detail.replicas : 1}" min="1" max="10" />
                        <span class="input-group-text">pods</span>
                      </div>
                      <small class="form-text text-muted">Số lượng pods chạy ứng dụng (mặc định: 1)</small>
                    </div>
                  </div>

                  <div class="mb-3">
                    <label class="form-label">Cluster triển khai</label>
                    <div class="form-control" style="background: #E8F5E9; border: 1px solid #4CAF50; color: #2E7D32; padding: 8px 12px;">
                      🧩 <strong>${escapeHtml(currentClusterLabel)}</strong>
                    </div>
                    <small class="form-text text-muted">${escapeHtml(clusterHelpText)}</small>
                  </div>

                  <div class="row g-2">
                    <div class="col-md-6">
                      <label class="form-label">CPU Request</label>
                      <input id="dd-cpu-req" class="form-control" value="${escapeHtml(detail.cpuRequest || '100m')}" placeholder="100m" />
                      <small class="form-text text-muted">Ví dụ: 100m, 500m, 1</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">CPU Limit</label>
                      <input id="dd-cpu-lim" class="form-control" value="${escapeHtml(detail.cpuLimit || '500m')}" placeholder="500m" />
                      <small class="form-text text-muted">Ví dụ: 500m, 1000m, 2</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Memory Request</label>
                      <input id="dd-mem-req" class="form-control" value="${escapeHtml(detail.memoryRequest || '128Mi')}" placeholder="128Mi" />
                      <small class="form-text text-muted">Ví dụ: 128Mi, 512Mi, 1Gi</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Memory Limit</label>
                      <input id="dd-mem-lim" class="form-control" value="${escapeHtml(detail.memoryLimit || '256Mi')}" placeholder="256Mi" />
                      <small class="form-text text-muted">Ví dụ: 256Mi, 1Gi, 2Gi</small>
                    </div>
                  </div>

                  <div class="mt-3">
                    <label class="form-label">Environment Variables</label>
                    <textarea id="dd-env-vars" class="form-control" rows="4" placeholder="KEY1=value1&#10;KEY2=value2">${envVarsDisplay ? escapeHtml(envVarsDisplay) : ''}</textarea>
                    <small class="form-text text-muted">Mỗi biến một dòng, định dạng: KEY=value (để trống nếu không cần)</small>
                  </div>
                </div>
              </div>

              <div class="card mb-0">
                <div class="card-header bg-light">
                  <h6 class="mb-0"><i class="bi bi-list-check"></i> Tóm tắt cấu hình</h6>
                </div>
                <div class="card-body">
                  <div class="row g-2 small">
                    <div class="col-md-3">
                      <strong>Replicas:</strong> <span id="summary-replicas" class="badge bg-info">${detail.replicas != null ? detail.replicas : 1}</span>
                    </div>
                    <div class="col-md-3">
                      <strong>Port:</strong> <code id="summary-port">${detail.containerPort != null ? detail.containerPort : 80}</code>
                    </div>
                    <div class="col-md-3">
                      <strong>CPU:</strong> <span id="summary-cpu">${escapeHtml(detail.cpuRequest || '100m')} / ${escapeHtml(detail.cpuLimit || '500m')}</span>
                    </div>
                    <div class="col-md-3">
                      <strong>Memory:</strong> <span id="summary-memory">${escapeHtml(detail.memoryRequest || '128Mi')} / ${escapeHtml(detail.memoryLimit || '256Mi')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
              <button type="button" class="btn btn-outline-info" id="dd-validate">Kiểm tra image</button>
              <button type="button" class="btn btn-outline-primary" id="dd-save">Lưu</button>
              <button type="button" class="btn btn-success" id="dd-process">Xử lý</button>
            </div>
          </div>
        </div>
      </div>`;

			document.body.insertAdjacentHTML('beforeend', modalHtml);
			const modalEl = document.getElementById(modalId);
			const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
			modal.show();

			const saveBtn = document.getElementById('dd-save');
			const validateBtn = document.getElementById('dd-validate');
			const processBtn = document.getElementById('dd-process');

			// Function to update summary
			const updateSummary = () => {
				const replicas = document.getElementById('dd-replicas')?.value || '1';
				const port = document.getElementById('dd-port')?.value || '80';
				const cpuReq = document.getElementById('dd-cpu-req')?.value || '100m';
				const cpuLim = document.getElementById('dd-cpu-lim')?.value || '500m';
				const memReq = document.getElementById('dd-mem-req')?.value || '128Mi';
				const memLim = document.getElementById('dd-mem-lim')?.value || '256Mi';

				const summaryReplicas = document.getElementById('summary-replicas');
				const summaryPort = document.getElementById('summary-port');
				const summaryCpu = document.getElementById('summary-cpu');
				const summaryMemory = document.getElementById('summary-memory');

				if (summaryReplicas) summaryReplicas.textContent = replicas;
				if (summaryPort) summaryPort.textContent = port;
				if (summaryCpu) summaryCpu.textContent = `${cpuReq} / ${cpuLim}`;
				if (summaryMemory) summaryMemory.textContent = `${memReq} / ${memLim}`;
			};

			// Add event listeners to update summary on change
			['dd-replicas', 'dd-port', 'dd-cpu-req', 'dd-cpu-lim', 'dd-mem-req', 'dd-mem-lim'].forEach(id => {
				const el = document.getElementById(id);
				if (el) {
					el.addEventListener('input', updateSummary);
					el.addEventListener('change', updateSummary);
				}
			});

			const doSave = async () => {
				const dockerImage = document.getElementById('dd-docker').value.trim();
				const containerPort = parseInt(document.getElementById('dd-port')?.value || '80');
				const replicas = parseInt(document.getElementById('dd-replicas')?.value || '1');

				if (!dockerImage) {
					throw new Error('Vui lòng nhập Docker Image');
				}
				if (containerPort < 1 || containerPort > 65535) {
					throw new Error('Port phải trong khoảng 1-65535');
				}
				if (replicas < 1 || replicas > 10) {
					throw new Error('Replicas phải trong khoảng 1-10');
				}

				const body = {
					dockerImage: dockerImage,
					containerPort: containerPort,
					replicas: replicas,
					cpuRequest: document.getElementById('dd-cpu-req').value.trim(),
					cpuLimit: document.getElementById('dd-cpu-lim').value.trim(),
					memoryRequest: document.getElementById('dd-mem-req').value.trim(),
					memoryLimit: document.getElementById('dd-mem-lim').value.trim()
				};

				// Parse env vars if exists
				const envVarsTextarea = document.getElementById('dd-env-vars');
				if (envVarsTextarea && envVarsTextarea.value.trim()) {
					const envVarsObj = {};
					const lines = envVarsTextarea.value.trim().split('\n');
					lines.forEach(line => {
						const trimmed = line.trim();
						if (trimmed && !trimmed.startsWith('#')) {
							const [key, ...valueParts] = trimmed.split('=');
							if (key && key.trim()) {
								envVarsObj[key.trim()] = valueParts.join('=').trim();
							}
						}
					});
					if (Object.keys(envVarsObj).length > 0) {
						body.envVars = JSON.stringify(envVarsObj);
					}
				}

				const data = await window.ApiClient.put(`/admin/deployment-requests/${id}`, body);
				if (window.showAlert) {
					window.showAlert('success', 'Đã lưu cấu hình yêu cầu.');
				}
				loadList();
			};

			saveBtn.addEventListener('click', async () => {
				try {
					await doSave();
				} catch (e) {
					if (window.showAlert) {
						window.showAlert('error', e.message || 'Lỗi lưu');
					}
				}
			});

			validateBtn.addEventListener('click', async () => {
				try {
					const image = document.getElementById('dd-docker').value.trim();
					if (!image) {
						if (window.showAlert) {
							window.showAlert('warning', 'Vui lòng nhập Docker image');
						}
						return;
					}
					const data = await window.ApiClient.get(`/admin/images/validate?image=${encodeURIComponent(image)}`);
					if (data.valid) {
						if (window.showAlert) {
							window.showAlert('success', `Image hợp lệ: ${image} (${data.message || 'OK'})`);
						}
					} else {
						if (window.showAlert) {
							window.showAlert('error', `Image không hợp lệ: ${image} (${data.message || 'UNKNOWN'})`);
						}
					}
				} catch (e) {
					if (window.showAlert) {
						window.showAlert('error', e.message || 'Lỗi kiểm tra image');
					}
				}
			});

			processBtn.addEventListener('click', async () => {
				try {
					const dockerImage = document.getElementById('dd-docker').value.trim();
					const containerPort = parseInt(document.getElementById('dd-port')?.value || '80');
					const replicas = parseInt(document.getElementById('dd-replicas')?.value || '1');

					if (!dockerImage) {
						throw new Error('Vui lòng nhập Docker Image');
					}

					// Save configuration first
					await doSave();

					// Prepare process request body with all parameters
					const processBody = {
						dockerImage: dockerImage,
						containerPort: containerPort,
						replicas: replicas,
						cpuRequest: document.getElementById('dd-cpu-req').value.trim(),
						cpuLimit: document.getElementById('dd-cpu-lim').value.trim(),
						memoryRequest: document.getElementById('dd-mem-req').value.trim(),
						memoryLimit: document.getElementById('dd-mem-lim').value.trim()
					};

					// Add env vars if exists
					const envVarsTextarea = document.getElementById('dd-env-vars');
					if (envVarsTextarea && envVarsTextarea.value.trim()) {
						const envVarsObj = {};
						const lines = envVarsTextarea.value.trim().split('\n');
						lines.forEach(line => {
							const trimmed = line.trim();
							if (trimmed && !trimmed.startsWith('#')) {
								const [key, ...valueParts] = trimmed.split('=');
								if (key && key.trim()) {
									envVarsObj[key.trim()] = valueParts.join('=').trim();
								}
							}
						});
						if (Object.keys(envVarsObj).length > 0) {
							processBody.envVars = JSON.stringify(envVarsObj);
						}
					}

				// Với 1 cluster duy nhất, không cần gửi clusterId nữa
				// Backend sẽ tự động sử dụng servers có clusterStatus = "AVAILABLE"
				// processBody.clusterId = null; // hoặc không gửi field này

					// Process deployment with parameters
					await processDeploymentRequestWithParams(id, processBody);
					modal.hide();
				} catch (e) {
					if (window.showAlert) {
						window.showAlert('error', e.message || 'Lỗi xử lý');
					}
				}
			});

			// Clean up modal when hidden
			modalEl.addEventListener('hidden.bs.modal', () => {
				modalEl.remove();
			});
		} catch (error) {
			if (window.showAlert) {
				window.showAlert('error', 'Không thể tải chi tiết: ' + (error.message || 'Lỗi không xác định'));
			}
		}
	}

	// Process deployment request
	async function processDeploymentRequest(id) {
		if (!confirm(`Bạn có chắc chắn muốn xử lý yêu cầu triển khai #${id}?\n\nHệ thống sẽ tạo các K8s resources (Deployment, Service, Ingress) cho ứng dụng này.`)) {
			return;
		}
		await processDeploymentRequestWithParams(id, {}, 'process');
	}

	// Process deployment request with params
	async function processDeploymentRequestWithParams(id, params = {}, endpoint = 'process') {
		try {
			window.showAlert('info', `Đang xử lý yêu cầu #${id}...`);
			viewDeploymentLogs(id);
			startPollingDeploymentLogs(id);

			const data = await window.ApiClient.post(`/admin/deployment-requests/${id}/${endpoint}`, params);

			if (data.status === 'RUNNING') {
				setTimeout(() => {
					stopPollingDeploymentLogs();
					loadDeploymentLogs(id);
				}, 30000);
			} else {
				stopPollingDeploymentLogs();
			}

			window.showAlert('success', `
				✅ Ứng dụng #${data.applicationId} đã được xử lý.
				<br>Trạng thái: <strong>${escapeHtml(data.status || '')}</strong>
				${data.message ? `<br><small>${escapeHtml(data.message)}</small>` : ''}
			`);

			await loadList();
		} catch (error) {
			console.error('Error processing deployment request:', error);
			stopPollingDeploymentLogs();
			window.showAlert('error', 'Không thể xử lý yêu cầu: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Retry deployment request
	async function retryDeploymentRequest(id) {
		if (!confirm(`Retry triển khai cho yêu cầu #${id}?`)) {
			return;
		}
		await processDeploymentRequestWithParams(id, {}, 'retry');
	}

	// Kiểm tra tính hợp lệ của Docker image
	async function validateDockerImage(image) {
		if (!image || !image.trim()) {
			window.showAlert('warning', 'Vui lòng nhập Docker image');
			return { valid: false, message: 'Image rỗng' };
		}

		try {
			const data = await window.ApiClient.get(`/admin/images/validate?image=${encodeURIComponent(image.trim())}`);
			return data;
		} catch (error) {
			console.error('Error validating Docker image:', error);
			return { valid: false, message: error.message || 'Không kiểm tra được' };
		}
	}

	// Update deployment request (chỉ cho phép khi status là PENDING hoặc ERROR)
	async function updateDeploymentRequest(id) {
		try {
			// Lấy thông tin hiện tại
			const detail = await window.ApiClient.get(`/admin/deployment-requests/${id}`);

			// Kiểm tra status
			if (detail.status !== 'PENDING' && detail.status !== 'ERROR') {
				window.showAlert('error', `Chỉ có thể chỉnh sửa khi trạng thái là PENDING hoặc ERROR. Trạng thái hiện tại: ${detail.status || 'N/A'}`);
				return;
			}

			// Hiển thị form để chỉnh sửa (dùng prompt đơn giản, có thể nâng cấp thành modal sau)
			const dockerImage = prompt('Docker Image (để trống để giữ nguyên):', detail.dockerImage || '');
			if (dockerImage === null) return; // User cancelled

			const cpuRequest = prompt('CPU Request (ví dụ: 100m, để trống để giữ nguyên):', detail.cpuRequest || '');
			if (cpuRequest === null) return;

			const cpuLimit = prompt('CPU Limit (ví dụ: 500m, để trống để giữ nguyên):', detail.cpuLimit || '');
			if (cpuLimit === null) return;

			const memoryRequest = prompt('Memory Request (ví dụ: 128Mi, để trống để giữ nguyên):', detail.memoryRequest || '');
			if (memoryRequest === null) return;

			const memoryLimit = prompt('Memory Limit (ví dụ: 512Mi, để trống để giữ nguyên):', detail.memoryLimit || '');
			if (memoryLimit === null) return;

			const replicasInput = prompt('Replicas (số nguyên, để trống để giữ nguyên):', detail.replicas != null ? String(detail.replicas) : '');
			if (replicasInput === null) return;

			const containerPortInput = prompt('Container Port (số nguyên, để trống để giữ nguyên):', detail.containerPort != null ? String(detail.containerPort) : '');
			if (containerPortInput === null) return;

			// Xây dựng request body (chỉ gửi các field đã thay đổi)
			const body = {};
			if (dockerImage !== '' && dockerImage !== detail.dockerImage) {
				body.dockerImage = dockerImage.trim();
			}
			if (cpuRequest !== '' && cpuRequest !== detail.cpuRequest) {
				body.cpuRequest = cpuRequest.trim();
			}
			if (cpuLimit !== '' && cpuLimit !== detail.cpuLimit) {
				body.cpuLimit = cpuLimit.trim();
			}
			if (memoryRequest !== '' && memoryRequest !== detail.memoryRequest) {
				body.memoryRequest = memoryRequest.trim();
			}
			if (memoryLimit !== '' && memoryLimit !== detail.memoryLimit) {
				body.memoryLimit = memoryLimit.trim();
			}
			if (replicasInput !== '') {
				const replicas = parseInt(replicasInput, 10);
				if (!isNaN(replicas) && replicas >= 0 && replicas !== detail.replicas) {
					body.replicas = String(replicas);
				}
			}
			if (containerPortInput !== '') {
				const containerPort = parseInt(containerPortInput, 10);
				if (!isNaN(containerPort) && containerPort > 0 && containerPort !== detail.containerPort) {
					body.containerPort = String(containerPort);
				}
			}

			// Kiểm tra có thay đổi gì không
			if (Object.keys(body).length === 0) {
				window.showAlert('info', 'Không có thay đổi nào');
				return;
			}

			// Gửi PUT request
			window.showAlert('info', `Đang cập nhật yêu cầu #${id}...`);
			const data = await window.ApiClient.put(`/admin/deployment-requests/${id}`, body);

			window.showAlert('success', `
				✅ Đã cập nhật yêu cầu #${data.id} thành công.
				const escapeHtml = getEscapeHtml();
				<br>Docker Image: <strong>${escapeHtml(data.dockerImage || '')}</strong>
				<br>Trạng thái: <strong>${escapeHtml(data.status || '')}</strong>
			`);

			await loadList();
		} catch (error) {
			console.error('Error updating deployment request:', error);
			window.showAlert('error', 'Không thể cập nhật yêu cầu: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Export module để sử dụng từ bên ngoài
	window.DeploymentRequestsModule = {
		loadList,
		viewDeploymentLogs,
		loadDeploymentLogs,
		startPollingDeploymentLogs,
		stopPollingDeploymentLogs,
		clearDeploymentLogs,
		scaleDeploymentRequest,
		promptScaleDeployment,
		deleteDeploymentRequest,
		viewDeploymentDiagnostics,
		approveDeploymentRequest,
		rejectDeploymentRequest,
		viewDeploymentRequest,
		processDeploymentRequest,
		processDeploymentRequestWithParams,
		retryDeploymentRequest,
		updateDeploymentRequest,
		validateDockerImage
	};

	// Tự động khởi tạo khi trang load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	function init() {
		// Chờ ApiClient và showAlert sẵn sàng
		function waitForDependencies() {
			if (window.ApiClient && typeof window.ApiClient.get === 'function' && typeof window.showAlert === 'function') {
				// Tải danh sách khi trang load
				loadList();

				// Nút xóa logs
				const clearLogsBtn = document.getElementById('clear-deployment-logs-btn');
				if (clearLogsBtn) {
					clearLogsBtn.addEventListener('click', clearDeploymentLogs);
				}

				// Thay đổi filter trạng thái
				const statusFilter = document.getElementById('deployment-status-filter');
				if (statusFilter) {
					statusFilter.addEventListener('change', loadList);
				}

				// Lắng nghe sự kiện trang
				if (window.AdminBus && typeof window.AdminBus.on === 'function') {
					window.AdminBus.on('page:deployments', () => {
						loadList();
					});
				}
				if (window.EventBus && typeof window.EventBus.on === 'function') {
					window.EventBus.on('page:deployments', () => {
						loadList();
					});
				}

				// Logs được lấy qua polling (không dùng WebSocket)
				// setupLogsWS(); // Không sử dụng WebSocket cho deployment logs
			} else {
				setTimeout(waitForDependencies, 50);
			}
		}
		waitForDependencies();
	}

	// Không sử dụng WebSocket cho deployment logs - chỉ dùng polling
	// function setupLogsWS() {
	// 	// Code này không được sử dụng vì không có WebSocket endpoint cho deployment logs
	// 	// Deployment logs được lấy qua polling: GET /admin/deployment-requests/{id}/logs
	// }

	// Tương thích ngược: expose các hàm global
	window.loadDeploymentRequests = loadList;
	window.viewDeploymentLogs = (id) => window.DeploymentRequestsModule.viewDeploymentLogs(id);
	window.scaleDeploymentRequest = (id, replicas) => window.DeploymentRequestsModule.scaleDeploymentRequest(id, replicas);
	window.promptScaleDeployment = (id, currentReplicas) => window.DeploymentRequestsModule.promptScaleDeployment(id, currentReplicas);
	window.deleteDeploymentRequest = (id, appName, namespace) => window.DeploymentRequestsModule.deleteDeploymentRequest(id, appName, namespace);
	window.viewDeploymentDiagnostics = (id) => window.DeploymentRequestsModule.viewDeploymentDiagnostics(id);
	window.rejectDeploymentRequest = (id) => window.DeploymentRequestsModule.rejectDeploymentRequest(id);
	window.viewDeploymentRequest = (id) => window.DeploymentRequestsModule.viewDeploymentRequest(id);
	window.processDeploymentRequest = (id) => window.DeploymentRequestsModule.processDeploymentRequest(id);
	window.retryDeploymentRequest = (id) => window.DeploymentRequestsModule.retryDeploymentRequest(id);
	window.updateDeploymentRequest = (id) => window.DeploymentRequestsModule.updateDeploymentRequest(id);
	window.clearDeploymentLogs = () => window.DeploymentRequestsModule.clearDeploymentLogs();
	window.validateDockerImage = (image) => window.DeploymentRequestsModule.validateDockerImage(image);
})();
