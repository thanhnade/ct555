// Deployment Requests Module - Quản lý yêu cầu triển khai
(function () {
	'use strict';

	// Helper: Escape HTML
	function escapeHtml(text) {
		if (text == null) return '';
		const div = document.createElement('div');
		div.textContent = String(text);
		return div.innerHTML;
	}

	// State
	let deploymentLogsPollingInterval = null;
	let currentViewingDeploymentId = null;

	// Load deployment requests list
	async function loadList() {
		const tbody = document.getElementById('deployment-requests-tbody');
		if (!tbody) return;

		try {
			tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Đang tải...</td></tr>';

			const statusFilter = document.getElementById('deployment-status-filter');
			const status = statusFilter ? statusFilter.value : '';
			const url = status ? `/admin/deployment-requests?status=${encodeURIComponent(status)}` : '/admin/deployment-requests';

			const data = await window.ApiClient.get(url);

			if (!data || data.length === 0) {
				tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Không có yêu cầu nào${status ? ' với trạng thái này' : ''}</td></tr>`;
				return;
			}

			tbody.innerHTML = '';
			data.forEach(req => {
				const tr = document.createElement('tr');
				const createdAt = req.createdAt ? new Date(req.createdAt).toLocaleString('vi-VN') : 'N/A';

				// Status badge
				let statusBadge = '';
				if (req.status === 'PENDING') {
					statusBadge = '<span class="badge bg-warning">⏳ Chờ xử lý</span>';
				} else if (req.status === 'RUNNING') {
					statusBadge = '<span class="badge bg-success">✅ Đang chạy</span>';
				} else if (req.status === 'PAUSED') {
					statusBadge = '<span class="badge bg-secondary text-dark">⏸️ Tạm dừng</span>';
				} else if (req.status === 'ERROR') {
					statusBadge = '<span class="badge bg-danger">❌ Lỗi</span>';
				} else if (req.status === 'REJECTED') {
					statusBadge = '<span class="badge bg-secondary">🚫 Từ chối</span>';
				} else if (req.status === 'DELETED') {
					statusBadge = '<span class="badge bg-secondary">🗑️ Đã đánh dấu xóa</span>';
				} else {
					statusBadge = `<span class="badge bg-secondary">${escapeHtml(req.status || '')}</span>`;
				}

				const currentReplicas = Number.isFinite(Number(req.replicas)) ? Number(req.replicas) : 1;
				const hasRequestedReplicas = Number.isFinite(Number(req.replicasRequested));
				const requestedReplicas = hasRequestedReplicas ? Number(req.replicasRequested) : currentReplicas;

				// Action buttons
				let actionBtn = '';
				if (req.status === 'DELETED') {
					actionBtn = '';
				} else if (req.status === 'PENDING') {
					actionBtn = `
						<button class="btn btn-sm btn-outline-primary" onclick="window.DeploymentRequestsModule.viewDeploymentRequest(${req.id})" title="Xem yêu cầu">
							<i class="bi bi-eye"></i> Xem
						</button>
						<button class="btn btn-sm btn-outline-secondary" onclick="window.DeploymentRequestsModule.rejectDeploymentRequest(${req.id})" title="Từ chối yêu cầu này">
							<i class="bi bi-x-circle"></i> Từ chối
						</button>`;
				} else if (req.status === 'RUNNING' || req.status === 'PAUSED') {
					actionBtn = `
						<button class="btn btn-sm btn-outline-success" onclick="window.DeploymentRequestsModule.promptScaleDeployment(${req.id}, ${requestedReplicas})" title="Điều chỉnh số replicas">
							<i class="bi bi-sliders"></i> ${req.status === 'PAUSED' ? 'Resume / Scale' : 'Scale'}
						</button>`;
				} else if (req.status === 'ERROR') {
					actionBtn = `<button class="btn btn-sm btn-warning" onclick="window.DeploymentRequestsModule.retryDeploymentRequest(${req.id})" title="Thử triển khai lại">
						<i class="bi bi-arrow-repeat"></i> Retry
					</button>`;
				} else {
					actionBtn = `<button class="btn btn-sm btn-secondary" disabled>${escapeHtml(req.status || '')}</button>`;
				}

				const diagnosticsBtn = `<button class="btn btn-sm btn-outline-dark" onclick="window.DeploymentRequestsModule.viewDeploymentDiagnostics(${req.id})" title="Thu thập diagnostics">
					<i class="bi bi-activity"></i> Diagnostics
				</button>`;

				const deleteBtn = `<button class="btn btn-sm btn-outline-danger" onclick="window.DeploymentRequestsModule.deleteDeploymentRequest(${req.id}, '${escapeHtml(req.appName || '').replace(/'/g, "\\'")}', '${escapeHtml(req.k8sNamespace || '').replace(/'/g, "\\'")}')" title="Delete deployment request and namespace">
					<i class="bi bi-trash"></i> Delete
				</button>`;

				const viewLogsBtn = `<button class="btn btn-sm btn-outline-info" onclick="window.DeploymentRequestsModule.viewDeploymentLogs(${req.id})" title="Xem logs">
					<i class="bi bi-file-text"></i> Logs
				</button>`;

				let accessUrlCell = '<td><small class="text-muted">-</small></td>';
				if (req.accessUrl) {
					const fullUrl = escapeHtml(req.accessUrl);
					accessUrlCell = `<td><a href="${fullUrl}" target="_blank" class="text-primary" title="${fullUrl}"><code>${fullUrl}</code> <i class="bi bi-box-arrow-up-right"></i></a></td>`;
				}

				const pendingActionNote = hasRequestedReplicas
					? `<div class="badge bg-info text-dark mt-1">User yêu cầu: ${currentReplicas} → ${requestedReplicas}</div>`
					: '';

				tr.innerHTML = `
					<td>
						<strong>${escapeHtml(req.appName || `#${req.id}`)}</strong>
						${pendingActionNote}
					</td>
					<td><code>${escapeHtml(req.dockerImage || 'N/A')}</code></td>
					<td>${escapeHtml(req.username || 'Unknown')}</td>
					<td><code>${escapeHtml(req.k8sNamespace || 'N/A')}</code></td>
					<td>${statusBadge}</td>
					${accessUrlCell}
					<td><small>${createdAt}</small></td>
					<td>
						<div class="d-flex gap-1 flex-wrap">
							${actionBtn}
							${viewLogsBtn}
							${diagnosticsBtn}
							${deleteBtn}
						</div>
					</td>
				`;
				tbody.appendChild(tr);
			});
		} catch (error) {
			if (tbody) {
				tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Lỗi tải dữ liệu: ${escapeHtml(error.message || 'Unknown error')}</td></tr>`;
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
		loadDeploymentLogs(id);
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
				window.ApiClient.get('/admin/clusters').catch(() => [])
			]);

			const clusters = Array.isArray(clusterResponse) ? clusterResponse : [];
			const existingClusterId = detail.clusterId != null ? Number(detail.clusterId) : null;
			const formatClusterName = (cluster) => escapeHtml(cluster && cluster.name ? cluster.name : `Cluster #${cluster.id}`);
			const formatClusterStatus = (cluster) =>
				cluster && cluster.status ? ` [${escapeHtml(String(cluster.status))}]` : '';

			let hasSelectedClusterOption = false;
			const clusterOptionHtmlPieces = clusters.map(cluster => {
				const cid = Number(cluster.id);
				const selected = existingClusterId != null && cid === existingClusterId;
				if (selected) {
					hasSelectedClusterOption = true;
				}
				return `<option value="${cid}" ${selected ? 'selected' : ''}>${formatClusterName(cluster)}${formatClusterStatus(cluster)}</option>`;
			});

			const clusterOptionsHtml = (existingClusterId != null && !hasSelectedClusterOption
				? `<option value="${existingClusterId}" selected>Cluster #${existingClusterId} (đã lưu)</option>`
				: '') + clusterOptionHtmlPieces.join('');

			const clusterHelpText = clusters.length > 0
				? 'Để trống để hệ thống tự chọn cluster HEALTHY.'
				: 'Chưa có cluster khả dụng. Nếu để trống hệ thống sẽ cố gắng chọn tự động.';

			// Fill form (nếu có appFormModal)
			const appIdEl = document.getElementById('app-id');
			const appNameEl = document.getElementById('app-name');
			const appChartEl = document.getElementById('app-chart');
			const appChartVersionEl = document.getElementById('app-chart-version');
			const appImageRepoEl = document.getElementById('app-image-repo');
			const appImageTagEl = document.getElementById('app-image-tag');
			const appNamespaceEl = document.getElementById('app-namespace');
			const appClusterIdEl = document.getElementById('app-cluster-id');
			const appReleaseNameEl = document.getElementById('app-release-name');

			if (appIdEl) appIdEl.value = detail.id || '';
			if (appNameEl) appNameEl.value = detail.appName || '';
			if (appChartEl) appChartEl.value = detail.chart || '';
			if (appChartVersionEl) appChartVersionEl.value = detail.chartVersion || '';
			if (appImageRepoEl) appImageRepoEl.value = detail.imageRepository || '';
			if (appImageTagEl) appImageTagEl.value = detail.imageTag || '';
			if (appNamespaceEl) appNamespaceEl.value = detail.k8sNamespace || '';
			if (appClusterIdEl) {
				appClusterIdEl.innerHTML = '<option value="">-- Chọn Cluster --</option>' + clusterOptionsHtml;
			}
			if (appReleaseNameEl) appReleaseNameEl.value = detail.releaseName || '';

			// Show modal using UI component
			if (window.Modal) {
				window.Modal.show('appFormModal');
			} else {
				// Fallback to Bootstrap
				const modalEl = document.getElementById('appFormModal');
				if (modalEl) {
					try {
						// Use getOrCreateInstance to avoid re-initialization issues
						const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
							backdrop: true,
							keyboard: true,
							focus: true
						});
						modal.show();
					} catch (err) {
						console.error('Error showing app form modal:', err);
						// Fallback: try to show without options
						const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
						modal.show();
					}
				}
			}
		} catch (error) {
			window.showAlert('error', error.message || 'Không thể tải thông tin yêu cầu');
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
