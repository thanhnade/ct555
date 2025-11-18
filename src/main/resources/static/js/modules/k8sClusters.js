// K8s Clusters Module - Quản lý Kubernetes clusters
(function () {
	'use strict';

	// Playbook manager is loaded separately via script tag in HTML
	// Integration: Set cluster ID for playbook-manager when needed

	// Helper: Escape HTML
	function escapeHtml(text) {
		if (text == null) return '';
		const div = document.createElement('div');
		div.textContent = String(text);
		return div.innerHTML;
	}

	// State
	let currentClusterId = null;
	let clusterPagination = null;
	let allClusters = []; // Store all clusters for pagination

	// Load cluster list - hiển thị servers có clusterStatus = AVAILABLE
	async function loadClusterList() {
		// Ensure ApiClient is loaded
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient not available. Waiting for it to load...');
			setTimeout(loadClusterList, 100);
			return;
		}

		try {
			// Load cluster summary và servers
			const [clusterDataRaw, servers, connectedIds] = await Promise.all([
				window.ApiClient.get('/admin/cluster/api').catch(() => null),
				window.ApiClient.get('/admin/servers').catch(() => []),
				window.ApiClient.get('/admin/servers/connected').catch(() => [])
			]);

			// Render cluster summary
			const summaryDiv = document.getElementById('cluster-summary-content');
			if (summaryDiv) {
				// clusterDataRaw là object (hệ thống chỉ có 1 cluster)
				const cluster = clusterDataRaw || null;
				if (cluster) {
					// Tính toán thống kê từ servers
					const clusterServers = (servers || []).filter(s => {
						const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
						return clusterStatus === 'AVAILABLE';
					});
					
					const masterCount = clusterServers.filter(s => s.role === 'MASTER').length;
					const workerCount = clusterServers.filter(s => s.role === 'WORKER').length;
					const totalNodes = clusterServers.length;
					
					// Tính toán connection status
					const connectedCount = clusterServers.filter(s => (connectedIds || []).includes(s.id)).length;
					const onlineCount = clusterServers.filter(s => s.status === 'ONLINE').length;
					
					// Tính tổng resources (nếu có metrics)
					let totalCpu = 0;
					let totalRam = 0;
					let totalDisk = 0;
					clusterServers.forEach(s => {
						const cpu = parseInt(s.cpuCores || '0', 10);
						if (!isNaN(cpu)) totalCpu += cpu;
					});
					
					const status = cluster.status || 'ERROR';
					let statusChip = '';
					if (status === 'HEALTHY') {
						statusChip = '<span class="chip green">HEALTHY</span>';
					} else if (status === 'WARNING') {
						statusChip = '<span class="chip yellow">WARNING</span>';
					} else {
						statusChip = '<span class="chip red">ERROR</span>';
					}
					
					// Connection health indicator
					let connectionHealth = '';
					if (totalNodes === 0) {
						connectionHealth = '<span class="chip red">No Nodes</span>';
					} else if (connectedCount === totalNodes) {
						connectionHealth = '<span class="chip green">All Connected</span>';
					} else if (connectedCount > 0) {
						connectionHealth = `<span class="chip yellow">${connectedCount}/${totalNodes} Connected</span>`;
					} else {
						connectionHealth = '<span class="chip red">Not Connected</span>';
					}
					
					// Render các phần khác trước (không đợi K8s version)
					summaryDiv.innerHTML = `
						<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
							<div style="background: #FFFFFF; padding: 12px; border-radius: 8px; border: 1px solid #E0E0E0;">
								<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Master Node</div>
								<div style="font-size: 18px; font-weight: 600;">${escapeHtml(cluster.masterNode || 'Chưa có')}</div>
								<div style="font-size: 11px; color: #999; margin-top: 2px;">${masterCount} master${masterCount !== 1 ? 's' : ''}</div>
							</div>
							<div style="background: #FFFFFF; padding: 12px; border-radius: 8px; border: 1px solid #E0E0E0;">
								<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Worker Nodes</div>
								<div style="font-size: 18px; font-weight: 600;">${workerCount}</div>
								<div style="font-size: 11px; color: #999; margin-top: 2px;">Total nodes: ${totalNodes}</div>
							</div>
							<div style="background: #FFFFFF; padding: 12px; border-radius: 8px; border: 1px solid #E0E0E0;">
								<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Cluster Status</div>
								<div style="font-size: 16px; margin-bottom: 4px;">${statusChip}</div>
								<div style="font-size: 12px; margin-top: 4px;">${connectionHealth}</div>
							</div>
							<div style="background: #FFFFFF; padding: 12px; border-radius: 8px; border: 1px solid #E0E0E0;">
								<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Connection</div>
								<div style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${connectedCount}/${totalNodes}</div>
								<div style="font-size: 11px; color: #999; margin-top: 2px;">${onlineCount} online, ${totalNodes - onlineCount} offline</div>
							</div>
							<div id="k8s-status-card" style="background: #FFFFFF; padding: 12px; border-radius: 8px; border: 1px solid #E0E0E0;">
								<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Kubernetes</div>
								<div style="font-size: 16px; margin-bottom: 4px;"><span class="chip info">Đang kiểm tra...</span></div>
								<div style="font-size: 11px; color: #999; margin-top: 2px;">-</div>
							</div>
						</div>
						<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-top: 16px; border-top: 1px solid #E0E0E0;">
							<button class="btn btn-primary" style="padding: 6px 12px; font-size: 13px;" onclick="window.location.href='/admin/kubernetes/overview'">👁️ Xem chi tiết</button>
							<button class="btn" style="padding: 6px 12px; font-size: 13px;" onclick="window.location.href='/admin/cluster/setup?clusterId=${cluster.id}'">⚙️ Cluster Setup</button>
							<button class="btn" style="padding: 6px 12px; font-size: 13px;" onclick="window.location.href='/admin/cluster/assign'">🔗 Gán Servers</button>
							${totalNodes > 0 ? `<button class="btn btn-success" style="padding: 6px 12px; font-size: 13px;" onclick="window.location.href='/admin/server'">🖥️ Quản lý Servers</button>` : ''}
						</div>
					`;
					
					// Load K8s version async sau (không block rendering)
					loadK8sVersionAsync();
				} else {
					summaryDiv.innerHTML = `
						<div class="text-center" style="color: #666666; padding: 16px;">
							<div style="margin-bottom: 8px;">Chưa có cluster nào</div>
							<div style="font-size: 12px; color: #999;">Thêm servers vào cluster bằng cách set <code>clusterStatus = "AVAILABLE"</code> trong phần "Gán máy chủ vào Cluster" bên dưới</div>
						</div>
					`;
				}
			}

			// Render servers có clusterStatus = AVAILABLE (Grid Layout)
			const grid = document.getElementById('cluster-servers-grid');
			if (!grid) {
				// Fallback to old table layout if grid doesn't exist
				const tbody = document.getElementById('cluster-servers-tbody');
				if (!tbody) {
					// Element không tồn tại - có thể đang ở trang khác
					return;
				}
				// Old table rendering logic (backward compatibility)
				// ... existing table code ...
				return;
			}

			// Lọc servers có clusterStatus = AVAILABLE
			const clusterServers = (servers || []).filter(s => {
				const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
				return clusterStatus === 'AVAILABLE';
			});

			grid.innerHTML = '';

			if (clusterServers.length === 0) {
				grid.innerHTML = '<div class="col-12 text-center text-muted p-4">Chưa có server nào trong cluster. Thêm servers bằng cách set <code>clusterStatus = "AVAILABLE"</code> trong phần "Gán máy chủ vào Cluster".</div>';
				return;
			}

			clusterServers.forEach(s => {
				const isConnected = (connectedIds || []).includes(s.id);
				let statusChip = '';
				if (isConnected) {
					statusChip = '<span class="chip green">CONNECTED</span>';
				} else if (s.status === 'ONLINE') {
					statusChip = '<span class="chip blue">ONLINE</span>';
				} else {
					statusChip = '<span class="chip red">OFFLINE</span>';
				}

				const role = s.role || 'WORKER';
				let roleBadge = '';
				if (role === 'MASTER') {
					roleBadge = '<span class="badge bg-primary">MASTER</span>';
				} else if (role === 'WORKER') {
					roleBadge = '<span class="badge bg-secondary">WORKER</span>';
				} else if (role === 'DOCKER') {
					roleBadge = '<span class="badge bg-info">DOCKER</span>';
				} else if (role === 'DATABASE') {
					roleBadge = '<span class="badge bg-warning">DATABASE</span>';
				} else if (role === 'ANSIBLE') {
					roleBadge = '<span class="badge bg-success">ANSIBLE</span>';
				} else {
					roleBadge = `<span class="badge bg-secondary">${escapeHtml(role)}</span>`;
				}

				// Get hardware specs from database
				const cpuCores = s.cpuCores || '-';
				const ramTotal = s.ramTotal || '-';
				const diskTotal = s.diskTotal || '-';
				
				// Format CPU
				let cpuDisplay = '-';
				if (cpuCores !== '-') {
					const cores = parseInt(cpuCores, 10);
					if (!isNaN(cores)) {
						cpuDisplay = `${cores} cores`;
					} else {
						cpuDisplay = escapeHtml(cpuCores);
					}
				}
				
				const ramDisplay = ramTotal !== '-' ? escapeHtml(ramTotal) : '-';
				const diskDisplay = diskTotal !== '-' ? escapeHtml(diskTotal) : '-';

				// Create server card with Bootstrap grid column
				const cardWrapper = document.createElement('div');
				cardWrapper.className = 'col-12 col-sm-6 col-md-4 col-lg-3';
				
				const card = document.createElement('div');
				card.className = 'server-card';
				card.innerHTML = `
					<div class="server-card-header">
						<h3 class="server-card-title">${escapeHtml(s.host || '-')}</h3>
						${statusChip}
					</div>
					
					<div class="server-card-info">
						<div class="server-card-info-item">
							<span class="server-card-info-label">Role:</span>
							<span class="server-card-info-value">${roleBadge}</span>
						</div>
					</div>
					
					<div class="server-card-metrics">
						<div class="server-card-metrics-row">
							<span><strong>CPU:</strong> ${cpuDisplay}</span>
							<span><strong>RAM:</strong> ${ramDisplay}</span>
							<span><strong>DISK:</strong> ${diskDisplay}</span>
						</div>
					</div>
					
					<div class="server-card-actions">
						<button class="btn btn-sm" onclick="window.location.href='/admin/server'" title="Quản lý server">⚙️ Quản lý</button>
					</div>
				`;
				cardWrapper.appendChild(card);
				grid.appendChild(cardWrapper);
			});

		} catch (err) {
			console.error('Error loading cluster list:', err);
			const grid = document.getElementById('cluster-servers-grid');
			if (grid) {
				grid.innerHTML = `<div class="col-12 text-center text-danger p-4">Lỗi tải danh sách: ${escapeHtml(err.message || 'Unknown error')}</div>`;
			}
			// Fallback to old table if grid doesn't exist
			const tbody = document.getElementById('cluster-servers-tbody');
			if (tbody) {
				tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: #CC0000; padding: 20px;">Lỗi tải danh sách: ${escapeHtml(err.message || 'Unknown error')}</td></tr>`;
			}
			const summaryDiv = document.getElementById('cluster-summary-content');
			if (summaryDiv) {
				summaryDiv.innerHTML = `<div class="text-center" style="color: #CC0000; padding: 16px;">Lỗi tải thông tin cluster: ${escapeHtml(err.message || 'Unknown error')}</div>`;
			}
		}
	}

	// Load K8s version async (không block rendering) - không cần clusterId nữa
	async function loadK8sVersionAsync() {
		try {
			const k8sVersionResponse = await window.ApiClient.get('/admin/cluster/k8s-version').catch(() => null);
			const k8sCard = document.getElementById('k8s-status-card');
			if (!k8sCard) return;
			
			let k8sVersion = '';
			let k8sStatusChip = '';
			
			if (k8sVersionResponse && k8sVersionResponse.installed && k8sVersionResponse.version) {
				k8sVersion = k8sVersionResponse.version.trim();
				k8sStatusChip = `<span class="chip green">Đã cài đặt</span>`;
			} else {
				k8sVersion = '';
				k8sStatusChip = `<span class="chip red">Chưa cài đặt</span>`;
			}
			
			// Cập nhật card khi có kết quả
			k8sCard.innerHTML = `
				<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Kubernetes</div>
				<div style="font-size: 16px; margin-bottom: 4px;">${k8sStatusChip}</div>
				<div style="font-size: 11px; color: #999; margin-top: 2px;">${k8sVersion ? escapeHtml(k8sVersion) : 'Chưa cài đặt'}</div>
			`;
		} catch (err) {
			const k8sCard = document.getElementById('k8s-status-card');
			if (k8sCard) {
				k8sCard.innerHTML = `
					<div style="font-size: 11px; color: #666; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Kubernetes</div>
					<div style="font-size: 16px; margin-bottom: 4px;"><span class="chip red">Chưa cài đặt</span></div>
					<div style="font-size: 11px; color: #999; margin-top: 2px;">Chưa cài đặt</div>
				`;
			}
		}
	}

	// Render clusters for a specific page
	function renderClusterPage(page) {
		if (!clusterPagination) {
			renderClusters(allClusters);
			return;
		}

		const pageSize = clusterPagination.getState().pageSize;
		const start = (page - 1) * pageSize;
		const end = start + pageSize;
		const pageData = allClusters.slice(start, end);
		renderClusters(pageData);
	}

	// Render clusters to table
	function renderClusters(clusters) {
		const tbody = document.getElementById('clusters-tbody');
		if (!tbody) return;

		tbody.innerHTML = '';


		if (!clusters || clusters.length === 0) {
			const tr = document.createElement('tr');
			tr.innerHTML = '<td colspan="5" class="text-center" style="color: #666666; padding: 20px;">Chưa có cluster nào</td>';
			tbody.appendChild(tr);
			return;
		}

		clusters.forEach(c => {
			const status = c.status || 'ERROR';
			let statusChip = '';
			if (status === 'HEALTHY') {
				statusChip = '<span class="chip green">HEALTHY</span>';
			} else if (status === 'WARNING') {
				statusChip = '<span class="chip yellow">WARNING</span>';
			} else {
				statusChip = '<span class="chip red">ERROR</span>';
			}
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td><strong>${escapeHtml(c.name || '')}</strong></td>
				<td>${escapeHtml(c.masterNode || 'Chưa có')}</td>
				<td>${c.workerCount ?? 0}</td>
				<td>${statusChip}</td>
				<td style="white-space: nowrap;">
					<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.location.href='/admin/kubernetes/overview'" title="Xem chi tiết">👁️</button>
					<button class="btn btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="window.location.href='/admin/cluster/setup?clusterId=${c.id}'" title="Cài đặt">⚙️</button>
					${c.isOwner ? `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="window.K8sClustersModule.deleteCluster(${c.id}, '${escapeHtml(c.name || '')}')" title="Xóa">🗑️</button>` : ''}
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Buttons are now using onclick handlers directly in the HTML
	}

	// Load clusters and servers for assignment
	async function loadClustersAndServers() {
		// Ensure ApiClient is loaded
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient not available. Waiting for it to load...');
			setTimeout(loadClustersAndServers, 100);
			return;
		}

		try {
			const [clusterResponse, servers, connectedIds] = await Promise.all([
				window.ApiClient.get('/admin/cluster/api').catch(() => null),
				window.ApiClient.get('/admin/servers').catch(() => []),
				window.ApiClient.get('/admin/servers/connected').catch(() => [])
			]);
			const clusters = [clusterResponse].filter(Boolean);

			// Fill cluster select - hiển thị tên cluster dạng text, không cần dropdown
			const sel = document.getElementById('k8s-cluster-select');
			if (sel) {
				const parent = sel.closest('div.form-group');
				const label = parent ? parent.querySelector('label') : null;
				
				// Ẩn select hoàn toàn - không dùng dropdown nữa
				sel.style.display = 'none';
				
				// Cập nhật label thành "Cluster hiện tại"
				if (label) {
					label.textContent = 'Cluster hiện tại';
					label.style.fontWeight = '500';
				}
				
				// Tìm hoặc tạo div hiển thị tên cluster
				let clusterDisplay = parent ? parent.querySelector('.cluster-name-display') : null;
				
				if (clusters && clusters.length === 1) {
					const clusterName = clusters[0].name || `Cluster ${clusters[0].id}`;
					
					// Set value của select ẩn để có thể lấy clusterId khi cần
					sel.value = clusters[0].id;
					
					// Tạo hoặc cập nhật div hiển thị tên cluster
					if (!clusterDisplay) {
						clusterDisplay = document.createElement('div');
						clusterDisplay.className = 'cluster-name-display';
						clusterDisplay.style.cssText = 'padding: 7px 9px; font-size: 13px; font-weight: 600; color: #2E7D32; background: #E8F5E9; border: 1px solid #4CAF50; border-radius: 4px; min-height: 38px; display: flex; align-items: center;';
						sel.parentNode.insertBefore(clusterDisplay, sel);
					}
					clusterDisplay.textContent = clusterName;
					clusterDisplay.style.display = 'flex';
				} else {
					// Chưa có cluster - hiển thị "Chưa có cluster"
					sel.value = '';
					
					// Tạo hoặc cập nhật div hiển thị "Chưa có cluster"
					if (!clusterDisplay) {
						clusterDisplay = document.createElement('div');
						clusterDisplay.className = 'cluster-name-display';
						clusterDisplay.style.cssText = 'padding: 7px 9px; font-size: 13px; color: #999; background: #F5F5F5; border: 1px solid #E0E0E0; border-radius: 4px; min-height: 38px; display: flex; align-items: center;';
						sel.parentNode.insertBefore(clusterDisplay, sel);
					}
					clusterDisplay.textContent = 'Chưa có cluster';
					clusterDisplay.style.display = 'flex';
				}
			}

			// Check if we're on the assign-servers page (with 2 separate tables)
			const availableTbody = document.getElementById('available-servers-tbody');
			const assignedTbody = document.getElementById('assigned-servers-tbody');
			
			if (availableTbody && assignedTbody) {
				// Split servers into available (not in cluster) and assigned (in cluster)
				const availableServers = (servers || []).filter(s => {
					const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
					return clusterStatus !== 'AVAILABLE';
				});
				const assignedServers = (servers || []).filter(s => {
					const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
					return clusterStatus === 'AVAILABLE';
				});

				// Render available servers (chưa gán vào cluster)
				availableTbody.innerHTML = '';
				if (availableServers.length === 0) {
					const tr = document.createElement('tr');
					tr.innerHTML = '<td colspan="7" class="text-center" style="color: #666666; padding: 20px;">Chưa có server nào chưa gán vào cluster</td>';
					availableTbody.appendChild(tr);
				} else {
					availableServers.forEach(s => {
						const isConnected = (connectedIds || []).includes(s.id);
						let statusChip = '';
						if (isConnected) {
							statusChip = '<span class="chip green">CONNECTED</span>';
						} else if (s.status === 'ONLINE') {
							statusChip = '<span class="chip blue">ONLINE</span>';
						} else {
							statusChip = '<span class="chip red">OFFLINE</span>';
						}
						const role = s.role || 'WORKER';
						const tr = document.createElement('tr');
						tr.innerHTML = `
							<td><input type="checkbox" class="available-sel" value="${s.id}"></td>
							<td><strong>${escapeHtml(s.host || '')}</strong></td>
							<td>${s.port || 22}</td>
							<td>${escapeHtml(s.username || '')}</td>
							<td>
								<select class="form-control" style="font-size: 13px; padding: 6px 8px; min-width: 120px;" data-id="${s.id}" data-field="role" data-server-id="${s.id}">
									<option value="WORKER" ${role === 'WORKER' ? 'selected' : ''}>WORKER</option>
									<option value="MASTER" ${role === 'MASTER' ? 'selected' : ''}>MASTER</option>
									<option value="DOCKER" ${role === 'DOCKER' ? 'selected' : ''}>DOCKER</option>
									<option value="DATABASE" ${role === 'DATABASE' ? 'selected' : ''}>DATABASE</option>
									<option value="ANSIBLE" ${role === 'ANSIBLE' ? 'selected' : ''}>ANSIBLE</option>
								</select>
							</td>
							<td>${statusChip}</td>
							<td><span class="badge bg-secondary">UNAVAILABLE</span></td>
						`;
						availableTbody.appendChild(tr);
					});
				}

				// Render assigned servers (đã gán vào cluster)
				assignedTbody.innerHTML = '';
				if (assignedServers.length === 0) {
					const tr = document.createElement('tr');
					tr.innerHTML = '<td colspan="8" class="text-center" style="color: #666666; padding: 20px;">Chưa có server nào được gán vào cluster</td>';
					assignedTbody.appendChild(tr);
				} else {
					assignedServers.forEach(s => {
						const isConnected = (connectedIds || []).includes(s.id);
						let statusChip = '';
						if (isConnected) {
							statusChip = '<span class="chip green">CONNECTED</span>';
						} else if (s.status === 'ONLINE') {
							statusChip = '<span class="chip blue">ONLINE</span>';
						} else {
							statusChip = '<span class="chip red">OFFLINE</span>';
						}
						const role = s.role || 'WORKER';
						const tr = document.createElement('tr');
						tr.innerHTML = `
							<td><input type="checkbox" class="assigned-sel" value="${s.id}"></td>
							<td><strong>${escapeHtml(s.host || '')}</strong></td>
							<td>${s.port || 22}</td>
							<td>${escapeHtml(s.username || '')}</td>
							<td>
								<select class="form-control role-select-assigned" style="font-size: 13px; padding: 6px 8px; min-width: 120px;" data-id="${s.id}" data-field="role" data-server-id="${s.id}" data-original-role="${role}">
									<option value="WORKER" ${role === 'WORKER' ? 'selected' : ''}>WORKER</option>
									<option value="MASTER" ${role === 'MASTER' ? 'selected' : ''}>MASTER</option>
									<option value="DOCKER" ${role === 'DOCKER' ? 'selected' : ''}>DOCKER</option>
									<option value="DATABASE" ${role === 'DATABASE' ? 'selected' : ''}>DATABASE</option>
									<option value="ANSIBLE" ${role === 'ANSIBLE' ? 'selected' : ''}>ANSIBLE</option>
								</select>
								<span class="role-update-status" data-server-id="${s.id}" style="display: none; margin-left: 4px; font-size: 11px;"></span>
							</td>
							<td>${statusChip}</td>
							<td><span class="badge bg-success">AVAILABLE</span></td>
							<td>
								<button class="btn btn-sm btn-outline-danger remove-single-server-btn" data-server-id="${s.id}" title="Bỏ khỏi cluster" style="padding: 4px 8px; font-size: 12px;">
									🗑️ Bỏ
								</button>
							</td>
						`;
						assignedTbody.appendChild(tr);
					});

					// Bind click event cho các button "Bỏ" từng server
					assignedTbody.querySelectorAll('.remove-single-server-btn').forEach(btn => {
						btn.addEventListener('click', async function() {
							const serverId = parseInt(this.dataset.serverId, 10);
							const server = assignedServers.find(s => s.id === serverId);
							const hostname = server ? (server.host || `Server ${serverId}`) : `Server ${serverId}`;
							
							if (!confirm(`Bỏ server "${hostname}" khỏi cluster (set clusterStatus = "UNAVAILABLE")?`)) {
								return;
							}

							// Hiển thị loading state
							this.disabled = true;
							const originalText = this.innerHTML;
							this.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px; border-width: 1.5px;"></span>';

							try {
								await removeSingleServerFromCluster(serverId);
								window.showAlert('success', `Đã bỏ server "${hostname}" khỏi cluster`);
								await loadClustersAndServers();
							} catch (err) {
								console.error('Lỗi khi bỏ server khỏi cluster:', err);
								window.showAlert('error', 'Không thể bỏ server khỏi cluster: ' + (err.message || 'Lỗi không xác định'));
								this.disabled = false;
								this.innerHTML = originalText;
							}
						});
					});

					// Bind onchange event cho role dropdowns trong assigned servers
					assignedTbody.querySelectorAll('.role-select-assigned').forEach(select => {
						select.addEventListener('change', async function() {
							const serverId = parseInt(this.dataset.serverId, 10);
							const newRole = this.value;
							const originalRole = this.dataset.originalRole;
							const statusSpan = assignedTbody.querySelector(`.role-update-status[data-server-id="${serverId}"]`);

							// Nếu role không thay đổi, không làm gì
							if (newRole === originalRole) {
								return;
							}

							// Kiểm tra nếu đang cố gắng thêm master mới trong khi đã có master
							if (newRole === 'MASTER') {
								const currentMasterCount = assignedServers.filter(s => s.role === 'MASTER').length;
								const isCurrentServerMaster = originalRole === 'MASTER';
								
								// Nếu đã có master và server hiện tại không phải là master → Không cho phép
								if (currentMasterCount > 0 && !isCurrentServerMaster) {
									window.showAlert('warning', 'Cụm chỉ có thể có 1 master. Đã có master trong cluster.');
									this.value = originalRole; // Revert về role cũ
									return;
								}
							}

							// Hiển thị loading state
							this.disabled = true;
							if (statusSpan) {
								statusSpan.style.display = 'inline';
								statusSpan.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>';
							}

							try {
								// Cập nhật role - giữ nguyên clusterStatus = "AVAILABLE"
								await saveServerClusterAndRole(serverId, 'AVAILABLE', newRole);
								
								// Cập nhật original role để tránh update lại
								this.dataset.originalRole = newRole;
								
								// Hiển thị success
								if (statusSpan) {
									statusSpan.innerHTML = '✓';
									statusSpan.style.color = '#28a745';
									setTimeout(() => {
										statusSpan.style.display = 'none';
									}, 2000);
								}

								// Reload để cập nhật trạng thái
								await loadClustersAndServers();
							} catch (err) {
								console.error('Lỗi khi cập nhật role:', err);
								
								// Revert về role cũ
								this.value = originalRole;
								
								// Hiển thị lỗi
								if (statusSpan) {
									statusSpan.innerHTML = '✗';
									statusSpan.style.color = '#dc3545';
									setTimeout(() => {
										statusSpan.style.display = 'none';
									}, 3000);
								}
								
								window.showAlert('error', 'Không thể cập nhật role: ' + (err.message || 'Lỗi không xác định'));
							} finally {
								this.disabled = false;
							}
						});
					});
				}

				// Bind check-all for available servers
				const availableCheckAll = document.getElementById('available-check-all');
				if (availableCheckAll && !availableCheckAll.dataset.bound) {
					availableCheckAll.dataset.bound = '1';
					availableCheckAll.addEventListener('change', () => {
						document.querySelectorAll('#available-servers-tbody .available-sel').forEach(el => {
							el.checked = availableCheckAll.checked;
						});
					});
				}

				// Bind check-all for assigned servers
				const assignedCheckAll = document.getElementById('assigned-check-all');
				if (assignedCheckAll && !assignedCheckAll.dataset.bound) {
					assignedCheckAll.dataset.bound = '1';
					assignedCheckAll.addEventListener('change', () => {
						document.querySelectorAll('#assigned-servers-tbody .assigned-sel').forEach(el => {
							el.checked = assignedCheckAll.checked;
						});
					});
				}
			} else {
				// Fallback: old single table format (for backward compatibility)
				const tbody = document.getElementById('k8s-servers-tbody');
				if (tbody) {
					tbody.innerHTML = '';
					if (!servers || servers.length === 0) {
						const tr = document.createElement('tr');
						tr.innerHTML = '<td colspan="8" class="text-center" style="color: #666666; padding: 20px;">Chưa có server nào</td>';
						tbody.appendChild(tr);
						return;
					}
					(servers || []).forEach(s => {
						const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
						const isInCluster = clusterStatus === 'AVAILABLE';
						const isConnected = (connectedIds || []).includes(s.id);
						let statusChip = '';
						if (isConnected) {
							statusChip = '<span class="chip green">CONNECTED</span>';
						} else if (s.status === 'ONLINE') {
							statusChip = '<span class="chip blue">ONLINE</span>';
						} else {
							statusChip = '<span class="chip red">OFFLINE</span>';
						}
						const tr = document.createElement('tr');
						tr.innerHTML = `
							<td><input type="checkbox" class="k8s-sel" value="${s.id}"></td>
							<td><strong>${escapeHtml(s.host || '')}</strong></td>
							<td>${s.port || 22}</td>
							<td>${escapeHtml(s.username || '')}</td>
							<td>
								<select class="form-control" style="font-size: 13px; padding: 6px 8px;" data-id="${s.id}" data-field="clusterStatus">
									<option value="UNAVAILABLE" ${!isInCluster ? 'selected' : ''}>UNAVAILABLE</option>
									<option value="AVAILABLE" ${isInCluster ? 'selected' : ''}>AVAILABLE</option>
								</select>
							</td>
							<td>
								<select class="form-control" style="font-size: 13px; padding: 6px 8px;" data-id="${s.id}" data-field="role">
									<option value="WORKER" ${s.role === 'WORKER' ? 'selected' : ''}>WORKER</option>
									<option value="MASTER" ${s.role === 'MASTER' ? 'selected' : ''}>MASTER</option>
									<option value="DOCKER" ${s.role === 'DOCKER' ? 'selected' : ''}>DOCKER</option>
									<option value="DATABASE" ${s.role === 'DATABASE' ? 'selected' : ''}>DATABASE</option>
									<option value="ANSIBLE" ${s.role === 'ANSIBLE' ? 'selected' : ''}>ANSIBLE</option>
								</select>
							</td>
							<td>${statusChip}</td>
							<td style="white-space: nowrap;">
								<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.K8sClustersModule.saveServerClusterAndRole(${s.id})" title="Lưu thay đổi">💾</button>
								<button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="window.K8sClustersModule.removeSingleServerFromCluster(${s.id})" title="Bỏ khỏi Cluster">🗑️</button>
							</td>
						`;
						tbody.appendChild(tr);
					});
				}

				// Bind check-all
				const chkAll = document.getElementById('k8s-check-all');
				if (chkAll && !chkAll.dataset.bound) {
					chkAll.dataset.bound = '1';
					chkAll.addEventListener('change', () => {
						document.querySelectorAll('#k8s-servers-tbody .k8s-sel').forEach(el => {
							el.checked = chkAll.checked;
						});
					});
				}
			}

			// Bind assignment buttons
			bindAssignmentButtons();
		} catch (err) {
			console.error('Error loading clusters and servers:', err);
		}
	}

	// Bind assignment buttons
	function bindAssignmentButtons() {
		// Check if we're using the new 2-table layout (assign-servers page)
		const availableTbody = document.getElementById('available-servers-tbody');
		const assignedTbody = document.getElementById('assigned-servers-tbody');

		if (availableTbody && assignedTbody) {
			// New layout: 2 separate tables
			
			// Assign selected from available servers - gán server vào cluster với role đã chọn
			const assignBtn = document.getElementById('btn-assign-selected');
			if (assignBtn && !assignBtn.dataset.bound) {
				assignBtn.dataset.bound = '1';
				assignBtn.addEventListener('click', async () => {
					const selected = Array.from(document.querySelectorAll('#available-servers-tbody .available-sel:checked')).map(el => parseInt(el.value, 10));
					if (selected.length === 0) {
						window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
						return;
					}
					
					// Lấy role từ dropdown trong bảng cho từng server
					const serverRoles = [];
					selected.forEach(serverId => {
						const row = document.querySelector(`#available-servers-tbody tr:has(input[value="${serverId}"])`);
						if (row) {
							const roleSelect = row.querySelector('select[data-field="role"]');
							const role = roleSelect && roleSelect.value ? roleSelect.value : 'WORKER';
							serverRoles.push({ serverId, role });
						} else {
							serverRoles.push({ serverId, role: 'WORKER' });
						}
					});
					// Gán server vào cluster (set clusterStatus = "AVAILABLE")
					await addServersToCluster(selected, serverRoles);
					await loadClustersAndServers();
				});
			}

			// Update role selected from assigned servers - chỉ cập nhật role, giữ nguyên clusterStatus = "AVAILABLE"
			const updateRoleBtn = document.getElementById('btn-update-role-selected');
			const bulkRoleSelect = document.getElementById('bulk-role-select');
			if (updateRoleBtn && !updateRoleBtn.dataset.bound) {
				updateRoleBtn.dataset.bound = '1';
				updateRoleBtn.addEventListener('click', async () => {
					const selected = Array.from(document.querySelectorAll('#assigned-servers-tbody .assigned-sel:checked')).map(el => parseInt(el.value, 10));
					if (selected.length === 0) {
						window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
						return;
					}

					// Lấy role từ bulk dropdown
					let bulkRole = '';
					if (bulkRoleSelect && bulkRoleSelect.value) {
						bulkRole = bulkRoleSelect.value;
					}
					
					if (!bulkRole) {
						window.showAlert('warning', 'Vui lòng chọn role để cập nhật');
						if (bulkRoleSelect) {
							bulkRoleSelect.focus();
						}
						return;
					}

					// Kiểm tra nếu đang cố gắng thêm master mới trong khi đã có master
					if (bulkRole === 'MASTER') {
						const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
						const assignedServers = (servers || []).filter(s => {
							const clusterStatus = s.clusterStatus || 'UNAVAILABLE';
							return clusterStatus === 'AVAILABLE';
						});
						const currentMasterCount = assignedServers.filter(s => s.role === 'MASTER').length;
						
						// Kiểm tra xem trong các server được chọn có server nào đang là master không
						const selectedServers = assignedServers.filter(s => selected.includes(s.id));
						const hasSelectedMaster = selectedServers.some(s => s.role === 'MASTER');
						
						// Nếu đã có master và không có server nào trong selected đang là master → Không cho phép
						if (currentMasterCount > 0 && !hasSelectedMaster) {
							window.showAlert('warning', 'Cụm chỉ có thể có 1 master. Đã có master trong cluster. Chỉ có thể thay đổi role của master hiện tại.');
							if (bulkRoleSelect) {
								bulkRoleSelect.value = '';
								bulkRoleSelect.focus();
							}
							return;
						}
						
						// Nếu đang cố gắng chuyển nhiều server thành master (trong đó có server không phải master hiện tại)
						if (currentMasterCount > 0 && hasSelectedMaster && selectedServers.filter(s => s.role === 'MASTER').length < selected.length) {
							// Có server không phải master đang được chọn để chuyển thành master
							window.showAlert('warning', 'Cụm chỉ có thể có 1 master. Chỉ có thể cập nhật role của master hiện tại thành MASTER.');
							if (bulkRoleSelect) {
								bulkRoleSelect.value = '';
								bulkRoleSelect.focus();
							}
							return;
						}
					}
					
					// Hiển thị loading state
					updateRoleBtn.disabled = true;
					if (bulkRoleSelect) bulkRoleSelect.disabled = true;
					const originalText = updateRoleBtn.innerHTML;
					updateRoleBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 14px; height: 14px; margin-right: 4px;"></span>Đang cập nhật...';

					let successCount = 0;
					let errorCount = 0;

					try {
						// Cập nhật role - sử dụng role từ bulk dropdown cho tất cả server được chọn
						for (const serverId of selected) {
							try {
								await saveServerClusterAndRole(serverId, 'AVAILABLE', bulkRole);
								successCount++;
							} catch (err) {
								errorCount++;
								console.error(`Lỗi khi cập nhật role cho server ${serverId}:`, err);
							}
						}

						// Hiển thị kết quả
						if (errorCount === 0) {
							window.showAlert('success', `Đã cập nhật role thành "${bulkRole}" cho ${successCount} server(s)`);
							// Reset bulk role select sau khi thành công
							if (bulkRoleSelect) bulkRoleSelect.value = '';
						} else {
							window.showAlert('warning', `Đã cập nhật role thành "${bulkRole}" cho ${successCount} server(s). ${errorCount} server(s) lỗi.`);
						}

						await loadClustersAndServers();
					} catch (err) {
						console.error('Lỗi khi cập nhật role:', err);
						window.showAlert('error', 'Không thể cập nhật role: ' + (err.message || 'Lỗi không xác định'));
					} finally {
						updateRoleBtn.disabled = false;
						if (bulkRoleSelect) bulkRoleSelect.disabled = false;
						updateRoleBtn.innerHTML = originalText;
					}
				});
			}

			// Remove selected from assigned servers - bỏ khỏi cluster (set clusterStatus = "UNAVAILABLE")
			const removeBtn = document.getElementById('btn-remove-selected');
			if (removeBtn && !removeBtn.dataset.bound) {
				removeBtn.dataset.bound = '1';
				removeBtn.addEventListener('click', async () => {
					const selected = Array.from(document.querySelectorAll('#assigned-servers-tbody .assigned-sel:checked')).map(el => parseInt(el.value, 10));
					if (selected.length === 0) {
						window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
						return;
					}

					// Lấy thông tin server để hiển thị trong confirm
					const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
					const selectedServers = (servers || []).filter(s => selected.includes(s.id));
					const serverNames = selectedServers.map(s => s.host || `Server ${s.id}`).join(', ');
					
					if (!confirm(`Bỏ ${selected.length} server khỏi cluster (set clusterStatus = "UNAVAILABLE")?\n\nServers: ${serverNames}\n\nXác nhận bỏ khỏi cluster?`)) {
						return;
					}

					// Hiển thị loading state
					removeBtn.disabled = true;
					const originalText = removeBtn.innerHTML;
					removeBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width: 14px; height: 14px; margin-right: 4px;"></span>Đang xử lý...';

					let successCount = 0;
					let errorCount = 0;
					const errorMessages = [];

					try {
						// Bỏ từng server khỏi cluster
						for (const serverId of selected) {
							try {
								await removeSingleServerFromCluster(serverId);
								successCount++;
							} catch (err) {
								errorCount++;
								const server = selectedServers.find(s => s.id === serverId);
								const serverName = server ? (server.host || `Server ${serverId}`) : `Server ${serverId}`;
								errorMessages.push(`${serverName}: ${err.message || 'Lỗi không xác định'}`);
								console.error(`Lỗi khi bỏ server ${serverId} khỏi cluster:`, err);
							}
						}

						// Hiển thị kết quả
						if (errorCount === 0) {
							window.showAlert('success', `Đã bỏ ${successCount} server(s) khỏi cluster thành công`);
						} else {
							let errorMsg = `Đã bỏ ${successCount} server(s) khỏi cluster. ${errorCount} server(s) lỗi:\n${errorMessages.join('\n')}`;
							window.showAlert('warning', errorMsg);
						}

						await loadClustersAndServers();
					} catch (err) {
						console.error('Lỗi khi bỏ servers khỏi cluster:', err);
						window.showAlert('error', 'Không thể bỏ servers khỏi cluster: ' + (err.message || 'Lỗi không xác định'));
					} finally {
						removeBtn.disabled = false;
						removeBtn.innerHTML = originalText;
					}
				});
			}
		} else {
			// Old layout: single table (for backward compatibility)
			
			// Assign selected - gán server vào cluster, giữ nguyên role hiện tại
			const assignBtn = document.getElementById('btn-assign-selected');
			if (assignBtn && !assignBtn.dataset.bound) {
				assignBtn.dataset.bound = '1';
				assignBtn.addEventListener('click', async () => {
					const selected = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
					if (selected.length === 0) {
						window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
						return;
					}
					
					const roleFromSelect = document.getElementById('k8s-role-select')?.value || 'WORKER';
					const serverRoles = [];
					selected.forEach(serverId => {
						const row = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
						if (row) {
							const roleSelect = row.querySelector('select[data-field="role"]');
							const role = roleSelect && roleSelect.value ? roleSelect.value : roleFromSelect;
							serverRoles.push({ serverId, role });
						} else {
							serverRoles.push({ serverId, role: roleFromSelect });
						}
					});
					await addServersToCluster(selected, serverRoles);
				});
			}

			// Update role selected - chỉ cập nhật role, giữ nguyên cluster hiện tại
			const updateRoleBtn = document.getElementById('btn-update-role-selected');
			if (updateRoleBtn && !updateRoleBtn.dataset.bound) {
				updateRoleBtn.dataset.bound = '1';
				updateRoleBtn.addEventListener('click', async () => {
					const selected = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
					if (selected.length === 0) {
						window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
						return;
					}
					
					const role = document.getElementById('k8s-role-select').value;
					for (const serverId of selected) {
						const row = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
						if (row) {
							const clusterStatusSelect = row.querySelector('select[data-field="clusterStatus"]');
							const currentClusterStatus = clusterStatusSelect && clusterStatusSelect.value ? clusterStatusSelect.value : 'UNAVAILABLE';
							await saveServerClusterAndRole(serverId, currentClusterStatus, role);
						} else {
							const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
							const server = servers.find(s => s.id === serverId);
							const currentClusterStatus = server ? (server.clusterStatus || 'UNAVAILABLE') : 'UNAVAILABLE';
							await saveServerClusterAndRole(serverId, currentClusterStatus, role);
						}
					}
					await loadClustersAndServers();
				});
			}

			// Remove selected
			const removeBtn = document.getElementById('btn-remove-selected');
			if (removeBtn && !removeBtn.dataset.bound) {
				removeBtn.dataset.bound = '1';
				removeBtn.addEventListener('click', async () => {
					const selected = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
					if (selected.length === 0) {
						window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
						return;
					}
					if (!confirm(`Bỏ ${selected.length} server khỏi cluster?`)) return;
					for (const serverId of selected) {
						await removeSingleServerFromCluster(serverId);
					}
					await loadClustersAndServers();
				});
			}
		}
	}

	// Create cluster - Với 1 cluster duy nhất, không cần tạo cluster nữa
	// Chỉ cần set clusterStatus = "AVAILABLE" cho servers
	async function createCluster(name, description) {
		try {
			// Check if cluster already exists (system only supports 1 cluster)
			const clusterResponse = await window.ApiClient.get('/admin/cluster/api').catch(() => null);
			const existingClusters = [clusterResponse].filter(Boolean);
			if (existingClusters && existingClusters.length > 0) {
				const clusterName = existingClusters[0].name || `Cluster ${existingClusters[0].id}`;
				const errorMsg = `⚠️ Đã có cluster "${clusterName}" trong hệ thống. Để tạo cluster mới, bạn phải xóa cluster cũ trước.`;
				window.showAlert('error', errorMsg);
				throw new Error(errorMsg);
			}

			// Create new cluster
			const data = await window.ApiClient.post('/admin/clusters', {
				name: name.trim(),
				description: description ? description.trim() : null
			});
			window.showAlert('success', 'Đã tạo cluster thành công');
			
			// Reload cluster list to show updated data (chỉ nếu đang ở trang cluster.html)
			const isClusterListPage = (document.getElementById('cluster-servers-tbody') !== null) || (document.getElementById('clusters-tbody') !== null);
			const isAssignServersPage = document.getElementById('k8s-assign') && !document.getElementById('k8s-list');
			
			if (isClusterListPage && !isAssignServersPage) {
				await loadClusterList();
			}
			// Also reload clusters for assign-servers page if exists
			const clusterSelect = document.getElementById('k8s-cluster-select');
			if (clusterSelect) {
				await loadClustersAndServers();
			}
			
			return data;
		} catch (err) {
			window.showAlert('error', err.message || 'Tạo cluster thất bại');
			throw err;
		}
	}

	// Delete cluster
	async function deleteCluster(id, name) {
		if (!confirm(`Bạn có chắc chắn muốn xóa cluster "${name}" (ID: ${id})?\n\nCảnh báo: Tất cả dữ liệu liên quan sẽ bị xóa vĩnh viễn!\n\nSau khi xóa, bạn có thể tạo cluster mới.`)) {
			return;
		}

		// Với hệ thống chỉ có 1 cluster, không cho phép xóa cluster
		// Thay vào đó, có thể set servers về clusterStatus = "UNAVAILABLE"
		window.showAlert('warning', 'Không thể xóa cluster. Với hệ thống chỉ có 1 cluster, vui lòng set servers về clusterStatus = "UNAVAILABLE" thay vì xóa cluster.');
	}

	// Show cluster list view
	function showClusterList() {
		const k8sListEl = document.getElementById('k8s-list');
		if (k8sListEl) {
			// We're on cluster.html, switch back to list view
			k8sListEl.classList.remove('d-none');
		document.getElementById('k8s-create')?.classList.remove('d-none');
		document.getElementById('k8s-assign')?.classList.remove('d-none');
		document.getElementById('k8s-detail')?.classList.add('d-none');
		resetClusterData();
		} else {
			// We're on kubernetes.html, redirect to cluster.html
			window.location.href = '/admin/cluster';
		}
	}

	// Reset cluster data
	function resetClusterData() {
		currentClusterId = null;
		window.currentClusterId = null;

		// Reset in playbook-manager.js
		if (window.setCurrentClusterId) {
			window.setCurrentClusterId(null);
		}
		if (window.resetPlaybookUI) {
			window.resetPlaybookUI();
		}

		// Reset trong các module khác
		if (window.AnsibleConfigModule && window.AnsibleConfigModule.setCurrentClusterId) {
			window.AnsibleConfigModule.setCurrentClusterId(null);
		}
		if (window.AnsibleWebSocketModule && window.AnsibleWebSocketModule.setCurrentClusterId) {
			window.AnsibleWebSocketModule.setCurrentClusterId(null);
		}

		// Đóng các WebSocket connections nếu có
		if (window.AnsibleWebSocketModule && window.AnsibleWebSocketModule.closeAnsibleWebSocket) {
			window.AnsibleWebSocketModule.closeAnsibleWebSocket();
		}
		if (window.AnsibleWebSocketModule && window.AnsibleWebSocketModule.closeInitActionsWS) {
			window.AnsibleWebSocketModule.closeInitActionsWS();
		}

		// Clear cluster detail UI elements
		const elementsToReset = ['cd-name', 'cd-master', 'cd-workers', 'cd-status', 'cd-version'];
		elementsToReset.forEach(id => {
			const element = document.getElementById(id);
			if (element) {
				element.textContent = '';
			}
		});

		// Clear nodes table
		const nodesTbody = document.getElementById('cd-nodes-tbody');
		if (nodesTbody) {
			nodesTbody.innerHTML = '';
		}

		// Clear Ansible summary badges
		const ansibleSummaryInstall = document.getElementById('ansible-summary-install');
		const ansibleSummaryVersion = document.getElementById('ansible-summary-version');
		const ansibleSummaryMaster = document.getElementById('ansible-summary-master');
		const ansibleSummaryActions = document.getElementById('ansible-summary-actions');
		const ansibleStatusDisplay = document.getElementById('ansible-status-display');
		
		if (ansibleSummaryInstall) {
			ansibleSummaryInstall.className = 'badge bg-secondary';
			ansibleSummaryInstall.textContent = 'Chưa kiểm tra';
		}
		if (ansibleSummaryVersion) {
			ansibleSummaryVersion.textContent = 'Phiên bản: -';
		}
		if (ansibleSummaryMaster) {
			ansibleSummaryMaster.textContent = 'MASTER: -';
		}
		if (ansibleSummaryActions) {
			ansibleSummaryActions.innerHTML = '';
		}
		if (ansibleStatusDisplay) {
			ansibleStatusDisplay.innerHTML = '';
			ansibleStatusDisplay.classList.add('d-none');
		}

		// Clear K8s resources tables
		const podsTbody = document.getElementById('pods-tbody');
		const namespacesTbody = document.getElementById('namespaces-tbody');
		const workloadsTbody = document.getElementById('workloads-tbody');
		const servicesTbody = document.getElementById('services-tbody');
		const ingressTbody = document.getElementById('ingress-tbody');
		
		if (podsTbody) {
			podsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (namespacesTbody) {
			namespacesTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (workloadsTbody) {
			workloadsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (servicesTbody) {
			servicesTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (ingressTbody) {
			ingressTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}

		// Reset K8s resources counts
		const podsCount = document.getElementById('pods-count');
		const namespacesCount = document.getElementById('namespaces-count');
		const workloadsCount = document.getElementById('workloads-count');
		const servicesCount = document.getElementById('services-count');
		const ingressCount = document.getElementById('ingress-count');
		
		if (podsCount) podsCount.textContent = '0';
		if (namespacesCount) namespacesCount.textContent = '0';
		if (workloadsCount) workloadsCount.textContent = '0';
		if (servicesCount) servicesCount.textContent = '0';
		if (ingressCount) ingressCount.textContent = '0';

		// Clear namespace filters
		const podsNamespaceFilter = document.getElementById('pods-namespace-filter');
		const servicesNamespaceFilter = document.getElementById('services-namespace-filter');
		const ingressNamespaceFilter = document.getElementById('ingress-namespace-filter');
		
		if (podsNamespaceFilter) {
			podsNamespaceFilter.innerHTML = '<option value="">Tất cả namespaces</option>';
		}
		if (servicesNamespaceFilter) {
			servicesNamespaceFilter.innerHTML = '<option value="">Tất cả namespaces</option>';
		}
		if (ingressNamespaceFilter) {
			ingressNamespaceFilter.innerHTML = '<option value="">Tất cả namespaces</option>';
		}

		// Reset Ansible summary badges bằng cách gọi setAnsibleSummaryBadges (nếu có)
		if (window.AnsibleConfigModule && typeof window.AnsibleConfigModule.setAnsibleSummaryBadges === 'function') {
			window.AnsibleConfigModule.setAnsibleSummaryBadges({ state: 'unknown' });
		} else if (window.setAnsibleSummaryBadges && typeof window.setAnsibleSummaryBadges === 'function') {
			window.setAnsibleSummaryBadges({ state: 'unknown' });
		}

		// Đóng các modals đang mở (nếu có)
		const modalsToClose = [
			'ansibleInstallModal',
			'initAnsibleModal',
			'ansibleConfigModal',
			'k8s-output-modal',
			'scale-workload-modal',
			'addNodeModal',
			'playbookManagerModal'
		];
		modalsToClose.forEach(modalId => {
			const modalElement = document.getElementById(modalId);
			if (modalElement) {
				const modalInstance = bootstrap.Modal.getInstance(modalElement);
				if (modalInstance) {
					modalInstance.hide();
				}
			}
		});

		// Đã clear tất cả dữ liệu cluster
	}

	// Clear cluster detail UI (không reset currentClusterId - dùng khi chuyển cluster)
	function clearClusterDetailUI() {
		// Clear cluster info
		const elementsToReset = ['cd-name', 'cd-master', 'cd-workers', 'cd-status', 'cd-version'];
		elementsToReset.forEach(id => {
			const element = document.getElementById(id);
			if (element) {
				if (id === 'cd-version') {
					element.textContent = '';
				} else {
					element.textContent = '';
				}
			}
		});

		// Clear nodes table
		const nodesTbody = document.getElementById('cd-nodes-tbody');
		if (nodesTbody) {
			nodesTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-hourglass-split"></i> Đang tải...</td></tr>';
		}

		// Clear Ansible summary badges
		const ansibleSummaryInstall = document.getElementById('ansible-summary-install');
		const ansibleSummaryVersion = document.getElementById('ansible-summary-version');
		const ansibleSummaryMaster = document.getElementById('ansible-summary-master');
		const ansibleSummaryActions = document.getElementById('ansible-summary-actions');
		const ansibleStatusDisplay = document.getElementById('ansible-status-display');
		
		if (ansibleSummaryInstall) {
			ansibleSummaryInstall.className = 'badge bg-secondary';
			ansibleSummaryInstall.textContent = 'Chưa kiểm tra';
		}
		if (ansibleSummaryVersion) {
			ansibleSummaryVersion.textContent = 'Phiên bản: -';
		}
		if (ansibleSummaryMaster) {
			ansibleSummaryMaster.textContent = 'MASTER: -';
		}
		if (ansibleSummaryActions) {
			ansibleSummaryActions.innerHTML = '';
		}
		if (ansibleStatusDisplay) {
			ansibleStatusDisplay.innerHTML = '';
			ansibleStatusDisplay.classList.add('d-none');
		}

		// Clear K8s resources tables
		const podsTbody = document.getElementById('pods-tbody');
		const namespacesTbody = document.getElementById('namespaces-tbody');
		const workloadsTbody = document.getElementById('workloads-tbody');
		const servicesTbody = document.getElementById('services-tbody');
		const ingressTbody = document.getElementById('ingress-tbody');
		
		if (podsTbody) {
			podsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (namespacesTbody) {
			namespacesTbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (workloadsTbody) {
			workloadsTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (servicesTbody) {
			servicesTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}
		if (ingressTbody) {
			ingressTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Đang tải dữ liệu...</td></tr>';
		}

		// Reset K8s resources counts
		const podsCount = document.getElementById('pods-count');
		const namespacesCount = document.getElementById('namespaces-count');
		const workloadsCount = document.getElementById('workloads-count');
		const servicesCount = document.getElementById('services-count');
		const ingressCount = document.getElementById('ingress-count');
		
		if (podsCount) podsCount.textContent = '0';
		if (namespacesCount) namespacesCount.textContent = '0';
		if (workloadsCount) workloadsCount.textContent = '0';
		if (servicesCount) servicesCount.textContent = '0';
		if (ingressCount) ingressCount.textContent = '0';
	}

	// Show cluster detail (simplified version - full implementation can be added later)
	// Với hệ thống chỉ có 1 cluster, clusterId không còn bắt buộc
	async function showClusterDetail(clusterId = null) {
		// Với hệ thống chỉ có 1 cluster, luôn dùng id = 1
		const id = 1;

		// Clear dữ liệu cũ trước khi load cluster mới
		clearClusterDetailUI();

		currentClusterId = id;
		window.currentClusterId = id;

		// Set in playbook-manager.js
		if (window.setCurrentClusterId) {
			window.setCurrentClusterId(id);
		}

		// Switch sections (only if we're on cluster.html, not kubernetes.html)
		const k8sListEl = document.getElementById('k8s-list');
		const k8sCreateEl = document.getElementById('k8s-create');
		const k8sAssignEl = document.getElementById('k8s-assign');
		const k8sDetailEl = document.getElementById('k8s-detail');
		if (k8sListEl) {
			// We're on cluster.html, switch views
			k8sListEl.classList.add('d-none');
			k8sCreateEl?.classList.add('d-none');
			k8sAssignEl?.classList.add('d-none');
			k8sDetailEl?.classList.remove('d-none');
		} else if (k8sDetailEl) {
			// We're on kubernetes.html, detail section is always visible
			// No need to switch sections
		}

		try {
			// Thêm timeout cho API call (30 giây)
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Request timeout: Không nhận được phản hồi từ server sau 30 giây')), 30000);
			});
			
			// Với 1 cluster duy nhất, dùng endpoint /detail không có id
			// Endpoint này có metrics chi tiết (CPU, RAM, disk) cho từng node
			const detailPromise = window.ApiClient.get('/admin/cluster/detail');
			const detail = await Promise.race([detailPromise, timeoutPromise]);

			// Kiểm tra detail có hợp lệ không
			if (!detail) {
				window.showAlert('error', 'Không tải được chi tiết cluster. Vui lòng thử lại.');
				return;
			}

			// Display cluster info với xử lý null/undefined an toàn
			const nameEl = document.getElementById('cd-name');
			const masterEl = document.getElementById('cd-master');
			const workersEl = document.getElementById('cd-workers');
			const statusEl = document.getElementById('cd-status');

			if (nameEl) {
				nameEl.textContent = detail.name || 'N/A';
			}
			if (masterEl) {
				masterEl.textContent = detail.masterNode || 'Chưa có';
			}
			if (workersEl) {
				workersEl.textContent = (detail.workerCount !== null && detail.workerCount !== undefined) ? detail.workerCount : 0;
			}
			if (statusEl) {
				statusEl.textContent = detail.status || 'UNKNOWN';
			}

			const verEl = document.getElementById('cd-version');
			const version = (detail.version || '').trim();
			if (!version) {
				verEl.innerHTML = `
					<span class="text-muted">Hãy cài đặt K8s trước</span>
					<button type="button" class="btn btn-sm btn-outline-primary ms-2" data-bs-toggle="modal" data-bs-target="#playbookManagerModal">
						<i class="bi bi-gear"></i> Chạy playbook cài đặt K8s
					</button>
				`;
			} else {
				verEl.textContent = version;
			}

			// Load nodes (simplified - can be enhanced later)
			// Đảm bảo detail có nodes array
			if (detail && (detail.nodes === null || detail.nodes === undefined)) {
				detail.nodes = [];
			}
			loadClusterNodes(detail);

			// Set current cluster ID trong các module
			if (window.AnsibleConfigModule) {
				window.AnsibleConfigModule.setCurrentClusterId(id);
			}
			if (window.AnsibleWebSocketModule) {
				window.AnsibleWebSocketModule.setCurrentClusterId(id);
			}

			// Tự động load trạng thái Ansible
			if (window.checkAnsibleStatus && typeof window.checkAnsibleStatus === 'function') {
				window.checkAnsibleStatus(id).catch(err => {
					console.error('Error checking Ansible status:', err);
				});
			} else if (window.AnsibleConfigModule && window.AnsibleConfigModule.checkAnsibleStatus) {
				window.AnsibleConfigModule.checkAnsibleStatus(id).catch(err => {
					console.error('Error checking Ansible status:', err);
				});
			}

			// Bind back button (reset bound để có thể bind lại)
			const backBtn = document.getElementById('cd-back');
			if (backBtn) {
				// Remove old listener if exists
				const newBackBtn = backBtn.cloneNode(true);
				backBtn.parentNode.replaceChild(newBackBtn, backBtn);
				newBackBtn.addEventListener('click', showClusterList);
			}

			// Bind reload button (reset bound để có thể bind lại)
			const reloadBtn = document.getElementById('cd-reload');
			if (reloadBtn) {
				// Remove old listener if exists
				const newReloadBtn = reloadBtn.cloneNode(true);
				reloadBtn.parentNode.replaceChild(newReloadBtn, reloadBtn);
				newReloadBtn.addEventListener('click', () => showClusterDetail(id));
			}

			// Bind add node button
			const addNodeBtn = document.getElementById('cd-add-node');
			if (addNodeBtn) {
				// Remove old onclick if exists
				addNodeBtn.removeAttribute('onclick');
				// Set cluster ID in modal when button is clicked
				addNodeBtn.addEventListener('click', () => {
					const modal = document.getElementById('addNodeModal');
					if (modal) {
						const clusterIdInput = modal.querySelector('#add-node-cluster-id');
						const clusterNameSpan = modal.querySelector('#add-node-cluster-name');
						// Với hệ thống chỉ có 1 cluster, set mặc định là 1
						if (clusterIdInput) {
							clusterIdInput.value = '1';
						}
						if (clusterNameSpan) {
							const clusterName = document.getElementById('cd-name')?.textContent?.trim() || '';
							clusterNameSpan.textContent = clusterName;
						}
						// Reset modal và load existing nodes
						resetAddNodeModal();
						loadExistingNodes();
					}
				});
			}

			// Bind check Ansible status button
			const checkAnsibleBtn = document.getElementById('cd-check-ansible');
			if (checkAnsibleBtn) {
				// Remove old onclick if exists
				checkAnsibleBtn.removeAttribute('onclick');
				// Bind new event listener
				checkAnsibleBtn.addEventListener('click', async () => {
					// Check if checkAnsibleStatus function exists (from ansibleConfig.js or admin.js)
					if (window.checkAnsibleStatus && typeof window.checkAnsibleStatus === 'function') {
						await window.checkAnsibleStatus(id);
					} else if (window.AnsibleConfigModule && window.AnsibleConfigModule.checkAnsibleStatus) {
						await window.AnsibleConfigModule.checkAnsibleStatus(id);
					} else {
						window.showAlert('error', 'Function checkAnsibleStatus không khả dụng. Vui lòng tải lại trang.');
						console.error('checkAnsibleStatus function not found');
					}
				});
			}


		} catch (err) {
			console.error('Error loading cluster detail:', err);
			console.error('Error stack:', err.stack);
			const errorMsg = err.message || err.toString() || 'Lỗi không xác định';
			
			// Xử lý các loại lỗi khác nhau
			let userMessage = 'Không tải được chi tiết cluster';
			if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
				userMessage = 'Timeout: Server đang xử lý quá lâu. Cluster có thể đang load metrics từ các nodes. Vui lòng thử lại sau.';
			} else if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
				userMessage = 'Không tìm thấy cluster với ID: ' + id;
			} else if (errorMsg.includes('400') || errorMsg.includes('Bad Request')) {
				userMessage = 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại.';
			} else if (errorMsg.includes('500') || errorMsg.includes('Internal Server Error')) {
				userMessage = 'Lỗi server. Vui lòng thử lại sau.';
			} else {
				userMessage = 'Không tải được chi tiết cluster: ' + errorMsg;
			}
			
			window.showAlert('error', userMessage);
			
			// Hiển thị thông báo lỗi trong UI
			const nameEl = document.getElementById('cd-name');
			if (nameEl) {
				nameEl.textContent = 'Lỗi tải dữ liệu';
			}
			const masterEl = document.getElementById('cd-master');
			if (masterEl) {
				masterEl.textContent = '-';
			}
			const workersEl = document.getElementById('cd-workers');
			if (workersEl) {
				workersEl.textContent = '-';
			}
			const statusEl = document.getElementById('cd-status');
			if (statusEl) {
				statusEl.textContent = 'ERROR';
			}
			
			// Clear nodes table
			const tbody = document.getElementById('cd-nodes-tbody');
			if (tbody) {
				tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Không thể tải danh sách nodes</td></tr>';
			}
		}
	}

	// Load cluster nodes với K8s status (Ready/NotReady/Unregistered)
	// Với hệ thống chỉ có 1 cluster, không cần clusterId parameter
	async function loadClusterNodes(detail) {
		const tbody = document.getElementById('cd-nodes-tbody');
		if (!tbody) {
			console.warn('cd-nodes-tbody element not found');
			return;
		}

		tbody.innerHTML = '';

		// Kiểm tra detail và nodes
		if (!detail) {
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td colspan="7" class="text-center text-danger py-4">
					<i class="bi bi-exclamation-triangle me-2"></i>
					Không có dữ liệu cluster
				</td>
			`;
			tbody.appendChild(tr);
			return;
		}

		// Đảm bảo nodes là array
		const nodes = Array.isArray(detail.nodes) ? detail.nodes : [];
		
		if (nodes.length === 0) {
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td colspan="7" class="text-center text-muted py-4">
					<i class="bi bi-server me-2"></i>
					Cluster này chưa có máy chủ nào. Vui lòng thêm máy chủ vào cluster để xem thông tin.
				</td>
			`;
			tbody.appendChild(tr);
			return;
		}

		// Load K8s nodes status song song với việc render servers
		let k8sNodeByIP = new Map();
		let k8sNodeByName = new Map();
		const k8sNodesPromise = window.ApiClient.get('/admin/cluster/k8s/nodes').catch(() => null);

		// Tạo Map để lưu trữ row elements theo server ID để cập nhật sau
		const serverRows = new Map();

		// Render nodes ngay với thông tin cơ bản
		nodes.forEach(n => {
			if (!n) return; // Bỏ qua null/undefined nodes
			
			const isOnline = n.isConnected === true || (n.status === 'ONLINE');
			const isOffline = !isOnline || (n.status === 'OFFLINE');
			const hasMetrics = n.cpu && n.cpu !== '-';
			
			// Hiển thị status ban đầu dựa trên thông tin cơ bản
			// Sẽ cập nhật sau khi có K8s status (nếu master online)
			let statusLabel = 'OFFLINE';
			let statusBadge = 'secondary';
			if (isOnline) {
				statusLabel = n.isConnected ? 'CONNECTED' : 'ONLINE';
				statusBadge = 'info';
			}

			// Color coding cho RAM usage
			const ramPercentage = n.ramPercentage || 0;
			let ramColorClass = '';
			if (isOffline || !hasMetrics) {
				ramColorClass = 'text-muted';
			} else if (ramPercentage >= 90) {
				ramColorClass = 'text-danger fw-bold';
			} else if (ramPercentage >= 80) {
				ramColorClass = 'text-danger';
			} else if (ramPercentage >= 70) {
				ramColorClass = 'text-warning';
			} else if (ramPercentage >= 50) {
				ramColorClass = 'text-info';
			} else {
				ramColorClass = 'text-success';
			}

			// Hiển thị metrics
			const cpuDisplay = isOffline ? '-' : (hasMetrics ? n.cpu : '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>');
			const ramDisplay = isOffline ? '-' : (hasMetrics ? n.ram : '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>');
			const diskDisplay = isOffline ? '-' : (hasMetrics ? n.disk : '<span class="spinner-border spinner-border-sm me-1" role="status"></span><span class="text-muted">Đang tải...</span>');

			const nodeId = n.id || '';
			const nodeIp = n.ip || n.host || '';
			const nodeRole = n.role || 'UNKNOWN';
			
			const tr = document.createElement('tr');
			tr.setAttribute('data-server-id', nodeId);
			tr.innerHTML = `
				<td>${escapeHtml(nodeIp)}</td>
				<td>${escapeHtml(nodeRole)}</td>
				<td><span class="badge bg-${statusBadge}" id="status-badge-${nodeId}">${statusLabel}</span></td>
				<td id="cpu-${nodeId}">${cpuDisplay}</td>
				<td class="${ramColorClass}" id="ram-${nodeId}">${ramDisplay}</td>
				<td id="disk-${nodeId}">${diskDisplay}</td>
				<td class="text-nowrap">
					<button class="btn btn-sm btn-outline-danger cd-remove-node" data-id="${nodeId}">
						<i class="bi bi-trash me-1"></i> Xóa
					</button>
				</td>
			`;
			tbody.appendChild(tr);
			serverRows.set(nodeId, tr);
		});

		// Sau khi render xong, cập nhật K8s status
		let hasK8sData = false;
		let k8sResp = null;
		try {
			k8sResp = await k8sNodesPromise;
			if (k8sResp && Array.isArray(k8sResp.nodes) && k8sResp.nodes.length > 0) {
				hasK8sData = true;
				k8sResp.nodes.forEach(nd => {
					// Backend trả về k8sInternalIP, không phải internalIP
					const ip = nd.k8sInternalIP || nd.internalIP;
					if (ip) {
						k8sNodeByIP.set(String(ip), nd);
					}
					if (nd.name) {
						k8sNodeByName.set(String(nd.name), nd);
					}
				});
			}
		} catch (e) {
			hasK8sData = false;
			k8sResp = null;
		}

		// Cập nhật K8s status cho các servers
		nodes.forEach(n => {
			const tr = serverRows.get(n.id);
			if (!tr) return;
			
			const isOnline = n.isConnected || (n.status === 'ONLINE');
			const statusBadgeEl = tr.querySelector(`#status-badge-${n.id}`);
			
			if (statusBadgeEl) {
				let statusLabel = 'OFFLINE';
				let statusBadge = 'secondary';
				
				if (isOnline) {
					// Node đang online - thử lấy K8s status nếu có
					const nd = k8sNodeByIP.get(String(n.ip)) || 
							   k8sNodeByName.get(String(n.ip)) || 
							   k8sNodeByName.get(String(n.hostname || n.ip));
					const k8sStatus = nd?.k8sStatus;
					
					if (k8sStatus === 'Ready') {
						statusLabel = 'Ready';
						statusBadge = 'success';
					} else if (k8sStatus === 'NotReady') {
						statusLabel = 'NotReady';
						statusBadge = 'warning text-dark';
					} else if (k8sStatus !== undefined && k8sStatus !== null && k8sStatus !== 'Unknown') {
						statusLabel = String(k8sStatus);
						statusBadge = 'dark';
					} else if (hasK8sData && k8sNodeByIP.size > 0) {
						// Có K8s data nhưng không match được node này → Unregistered
						statusLabel = 'UNREGISTERED';
						statusBadge = 'danger';
					} else {
						// Không có K8s status (có thể master offline hoặc node chưa join cluster)
						statusLabel = n.isConnected ? 'CONNECTED' : 'ONLINE';
						statusBadge = 'info';
					}
				} else {
					statusLabel = 'OFFLINE';
					statusBadge = 'secondary';
				}
				
				statusBadgeEl.textContent = statusLabel;
				statusBadgeEl.className = `badge bg-${statusBadge}`;
				
				// Tooltip để giải thích status
				let tooltip = '';
				if (statusLabel === 'UNREGISTERED') {
					tooltip = 'Node chưa đăng ký trong cụm (không thấy trong kubectl)';
				} else if (statusLabel === 'CONNECTED' || statusLabel === 'ONLINE') {
					tooltip = 'Node đang online nhưng không có thông tin K8s (có thể MASTER offline)';
				} else if (statusLabel === 'OFFLINE') {
					tooltip = 'Node đang offline';
				}
				statusBadgeEl.title = tooltip;
			}
		});

		// Bind remove node buttons (reset để có thể bind lại mỗi lần load)
		document.querySelectorAll('.cd-remove-node').forEach(btn => {
			// Remove old listeners by cloning
			const newBtn = btn.cloneNode(true);
			btn.parentNode.replaceChild(newBtn, btn);
			newBtn.addEventListener('click', (e) => {
				const nodeId = parseInt(e.target.closest('.cd-remove-node').dataset.id, 10);
				if (nodeId) {
					removeNodeFromCluster(nodeId);
				}
			});
		});
	}

	// Add servers to cluster (set clusterStatus = "AVAILABLE")
	async function addServersToCluster(nodeIds, serverRoles) {
		if (!nodeIds || nodeIds.length === 0) {
			window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
			return;
		}

		const assignBtn = document.getElementById('btn-assign-selected');

		try {
			// Disable button
			if (assignBtn) {
				assignBtn.disabled = true;
				assignBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang gán...';
			}

			// Gán từng server vào cluster với role riêng của nó (set clusterStatus = "AVAILABLE")
			for (const { serverId, role } of serverRoles) {
				const body = { clusterStatus: 'AVAILABLE', role: role || 'WORKER' };
				await window.ApiClient.put(`/admin/servers/${serverId}`, body);
			}

			window.showAlert('success', `✓ Đã gán ${nodeIds.length} server vào cluster (clusterStatus = "AVAILABLE") với role tương ứng`);

			// Refresh ngay
			if (currentClusterId) {
				await showClusterDetail(currentClusterId);
			}
			await Promise.all([loadClusterList(), loadClustersAndServers()]);
		} catch (error) {
			console.error('Error adding servers to cluster:', error);
			window.showAlert('error', error.message || 'Gán server thất bại');
		} finally {
			// Restore button state
			if (assignBtn) {
				assignBtn.disabled = false;
				assignBtn.innerHTML = '📌 Thêm vào Cluster (AVAILABLE)';
			}
		}
	}

	// Save server cluster status and role
	async function saveServerClusterAndRole(serverId, clusterStatus = null, role = null) {
		// Try to find server row in new layout (2 separate tables)
		let serverRow = document.querySelector(`#available-servers-tbody tr:has(input[value="${serverId}"])`) ||
		                document.querySelector(`#assigned-servers-tbody tr:has(input[value="${serverId}"])`);
		
		// If not found, try old layout
		if (!serverRow) {
			serverRow = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
		}

		// Determine clusterStatus based on which table the server is in (if not explicitly provided)
		let newClusterStatus = clusterStatus;
		if (newClusterStatus === null) {
			if (serverRow) {
				// Check if server is in assigned table (AVAILABLE) or available table (UNAVAILABLE)
				if (serverRow.closest('#assigned-servers-tbody')) {
					newClusterStatus = 'AVAILABLE';
				} else if (serverRow.closest('#available-servers-tbody')) {
					newClusterStatus = 'UNAVAILABLE';
				} else {
					// Old layout: try to get from clusterStatus select
					const clusterStatusSelect = serverRow.querySelector('select[data-field="clusterStatus"]');
					newClusterStatus = clusterStatusSelect ? clusterStatusSelect.value : 'UNAVAILABLE';
				}
			} else {
				// If row not found, default to UNAVAILABLE
				newClusterStatus = 'UNAVAILABLE';
			}
		}

		// Get role from role select
		let newRole = role;
		if (newRole === null) {
			if (serverRow) {
				const roleSelect = serverRow.querySelector('select[data-field="role"]');
				if (roleSelect) {
					newRole = roleSelect.value;
				} else {
					// If no role select found, try to get from API
					const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
					const server = servers.find(s => s.id === serverId);
					newRole = server ? (server.role || 'WORKER') : 'WORKER';
				}
			} else {
				// If row not found, try to get from API
				const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
				const server = servers.find(s => s.id === serverId);
				newRole = server ? (server.role || 'WORKER') : 'WORKER';
			}
		}

		try {
			const body = { 
				role: newRole || 'WORKER',
				clusterStatus: newClusterStatus || 'UNAVAILABLE'
			};

			await window.ApiClient.put(`/admin/servers/${serverId}`, body);

			const clusterStatusText = newClusterStatus === 'AVAILABLE' ? 'AVAILABLE (trong cluster)' : 'UNAVAILABLE (ngoài cluster)';
			window.showAlert('success', `Đã cập nhật server ${serverId}: clusterStatus = "${newClusterStatus}", role = "${newRole}"`);

			await Promise.all([loadClusterList(), loadClustersAndServers()]);
		} catch (err) {
			console.error('Lỗi khi lưu clusterStatus và role máy chủ:', err);
			window.showAlert('error', err.message || 'Cập nhật clusterStatus và role thất bại');
		}
	}

	// Remove single server from cluster (set clusterStatus = "UNAVAILABLE")
	async function removeSingleServerFromCluster(serverId) {
		// Không hiển thị confirm ở đây vì đã có confirm ở nơi gọi (button hoặc bulk action)
		try {
			const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
			const server = servers.find(s => s.id === serverId);
			const currentRole = server ? (server.role || 'WORKER') : 'WORKER';

			const body = { clusterStatus: 'UNAVAILABLE', role: currentRole };
			await window.ApiClient.put(`/admin/servers/${serverId}`, body);

			// Không hiển thị alert ở đây vì sẽ hiển thị ở nơi gọi (để tránh nhiều alert)
		} catch (err) {
			console.error('Lỗi khi bỏ máy chủ đơn lẻ khỏi cluster:', err);
			throw err; // Throw để nơi gọi có thể xử lý
		}
	}

	// Add existing nodes to cluster (called from modal button)
	// Với 1 cluster duy nhất, luôn set clusterStatus = "AVAILABLE"
	async function addExistingNodesToClusterFromModal() {
		const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
		const nodeIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
		const role = 'WORKER'; // Default role, có thể thêm dropdown sau

		if (nodeIds.length === 0) {
			window.showAlert('warning', 'Vui lòng chọn ít nhất một node');
			return;
		}

		// Với 1 cluster duy nhất, không cần clusterId nữa, luôn set clusterStatus = "AVAILABLE"
		await addExistingNodesToCluster(nodeIds, role, true);
	}

	// Add existing nodes to cluster with individual roles (set clusterStatus = "AVAILABLE")
	// Với 1 cluster duy nhất, không cần clusterId parameter
	async function addExistingNodesToClusterWithRoles(nodeIds, serverRoles) {
		if (!nodeIds || nodeIds.length === 0) {
			window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
			return;
		}

		// Với 1 cluster duy nhất, không cần kiểm tra clusterId
		const assignBtn = document.getElementById('btn-assign-selected');

		try {
			// Disable button
			if (assignBtn) {
				assignBtn.disabled = true;
				assignBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang gán...';
			}

			// Gán từng server vào cluster với role riêng của nó (set clusterStatus = "AVAILABLE")
			for (const { serverId, role } of serverRoles) {
				const body = { clusterStatus: 'AVAILABLE', role: role || 'WORKER' };
				await window.ApiClient.put(`/admin/servers/${serverId}`, body);
			}

			window.showAlert('success', `✓ Đã gán ${nodeIds.length} server vào cluster (clusterStatus = "AVAILABLE") với role tương ứng`);

			// Refresh ngay
			if (currentClusterId) {
				await showClusterDetail(currentClusterId);
			}
			await Promise.all([loadClusterList(), loadClustersAndServers()]);
		} catch (error) {
			console.error('Error adding existing nodes with roles:', error);
			window.showAlert('error', error.message || 'Gán server thất bại');
		} finally {
			// Restore button state
			if (assignBtn) {
				assignBtn.disabled = false;
				assignBtn.innerHTML = '📌 Thêm vào Cluster (AVAILABLE)';
			}
		}
	}

	// Add existing nodes to cluster (với role chung - từ modal hoặc các trường hợp khác)
	// Với 1 cluster duy nhất, luôn set clusterStatus = "AVAILABLE"
	async function addExistingNodesToCluster(nodeIds, role, isFromModal = false) {
		if (!nodeIds || nodeIds.length === 0) {
			window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
			return;
		}

		// Với 1 cluster duy nhất, không cần clusterId nữa, luôn set clusterStatus = "AVAILABLE"
		const addExistingBtn = document.getElementById('add-existing-nodes-btn');
		const assignBtn = document.getElementById('btn-assign-selected');

		try {
			// Disable button nếu có
			if (addExistingBtn) {
				addExistingBtn.disabled = true;
				addExistingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang thêm...';
			}
			if (assignBtn) {
				assignBtn.disabled = true;
				assignBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang gán...';
			}

			for (const nodeId of nodeIds) {
				const body = { clusterStatus: 'AVAILABLE', role: role || 'WORKER' };
				await window.ApiClient.put(`/admin/servers/${nodeId}`, body);
			}

			window.showAlert('success', `✓ Đã thêm ${nodeIds.length} node vào cluster (clusterStatus = "AVAILABLE")`);

			// Nếu được gọi từ modal, đóng modal sau 1 giây
			if (isFromModal) {
				setTimeout(async () => {
				// Hide modal using UI component
				if (window.Modal) {
					window.Modal.hide('addNodeModal');
				} else {
					// Fallback to Bootstrap
					try {
						const modalEl = document.getElementById('addNodeModal');
						if (modalEl) {
							const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
							if (modal) modal.hide();
						}
					} catch (err) {
						console.error('Error hiding add node modal:', err);
					}
				}

					if (currentClusterId) {
						await showClusterDetail(currentClusterId);
					}
					await Promise.all([loadClusterList(), loadClustersAndServers()]);
				}, 1000);
			} else {
				// Nếu được gọi từ nút "Gán vào cluster", refresh ngay
				if (currentClusterId) {
					await showClusterDetail(currentClusterId);
				}
				await Promise.all([loadClusterList(), loadClustersAndServers()]);
			}
		} catch (error) {
			console.error('Error adding existing nodes:', error);
			window.showAlert('error', error.message || 'Thêm node thất bại');
		} finally {
			// Restore button state
			if (addExistingBtn) {
				addExistingBtn.disabled = false;
				addExistingBtn.innerHTML = '<i class="bi bi-list-check"></i> Thêm Node đã chọn';
			}
			if (assignBtn) {
				assignBtn.disabled = false;
				assignBtn.innerHTML = '📌 Thêm vào Cluster (AVAILABLE)';
			}
		}
	}

	// Remove node from cluster (set clusterStatus = "UNAVAILABLE")
	// Với hệ thống chỉ có 1 cluster, không cần clusterId parameter
	async function removeNodeFromCluster(nodeId) {
		if (!confirm('Xóa node này khỏi cluster (set clusterStatus = "UNAVAILABLE")?')) return;

		try {
			const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
			const server = servers.find(s => s.id === nodeId);
			const currentRole = server ? (server.role || 'WORKER') : 'WORKER';

			const body = { clusterStatus: 'UNAVAILABLE', role: currentRole };
			await window.ApiClient.put(`/admin/servers/${nodeId}`, body);

			window.showAlert('success', `Đã xóa node ${nodeId} khỏi cluster (clusterStatus = "UNAVAILABLE")`);
			if (currentClusterId) {
				await showClusterDetail(currentClusterId);
			}
			await Promise.all([loadClusterList(), loadClustersAndServers()]);
		} catch (err) {
			window.showAlert('error', err.message || 'Xóa node thất bại');
		}
	}

	// ================= Add Node Modal Functions =================

	// Reset modal về trạng thái ban đầu
	function resetAddNodeModal() {
		// Reset về tab đầu tiên
		const selectExistingTab = document.getElementById('select-existing-tab');
		const addNewTab = document.getElementById('add-new-tab');
		const selectExistingPane = document.getElementById('select-existing');
		const addNewPane = document.getElementById('add-new');

		if (selectExistingTab && addNewTab && selectExistingPane && addNewPane) {
			selectExistingTab.classList.add('active');
			selectExistingTab.setAttribute('aria-selected', 'true');
			addNewTab.classList.remove('active');
			addNewTab.setAttribute('aria-selected', 'false');

			selectExistingPane.classList.add('show', 'active');
			addNewPane.classList.remove('show', 'active');
		}

		// Reset checkboxes
		const selectAllCheckbox = document.getElementById('existing-nodes-check-all');
		if (selectAllCheckbox) {
			selectAllCheckbox.checked = false;
		}

		// Hide/show buttons
		const addExistingBtn = document.getElementById('add-existing-nodes-btn');
		const addNewBtn = document.getElementById('add-node-submit-btn');
		if (addExistingBtn && addNewBtn) {
			addExistingBtn.style.display = 'none';
			addNewBtn.style.display = 'inline-block';
		}

		// Reset form
		const form = document.getElementById('add-node-form');
		if (form) {
			form.reset();
			const portInput = document.getElementById('add-node-port');
			const roleInput = document.getElementById('add-node-role');
			if (portInput) portInput.value = '22';
			if (roleInput) roleInput.value = 'WORKER';
		}

		// Clear message
		const msgEl = document.getElementById('add-node-msg');
		if (msgEl) {
			msgEl.textContent = '';
			msgEl.className = 'small';
		}
	}

	// Load danh sách nodes chưa thuộc cluster nào
	async function loadExistingNodes() {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.warn('ApiClient chưa sẵn sàng');
			return;
		}

		const tbodyEl = document.getElementById('existing-nodes-tbody');
		if (!tbodyEl) return;

		tbodyEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Đang tải...</td></tr>';

		try {
			// Load tất cả servers
			const servers = await window.ApiClient.get('/admin/servers').catch(() => []);

			// Lọc các server chưa thuộc cluster nào (clusterStatus = "UNAVAILABLE" hoặc null/undefined)
			const availableNodes = servers.filter(server => {
				const clusterStatus = server.clusterStatus || 'UNAVAILABLE';
				return clusterStatus !== 'AVAILABLE';
			});

			// Clear tbody
			tbodyEl.innerHTML = '';

			if (availableNodes.length === 0) {
				tbodyEl.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Không có node nào chưa thuộc cluster</td></tr>';
				return;
			}

			// Render nodes
			availableNodes.forEach(node => {
				const statusBadge = node.status === 'ONLINE' ? 'success' : 'secondary';
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td><input type="checkbox" class="form-check-input existing-node-checkbox" value="${node.id}"></td>
					<td>${node.id || ''}</td>
					<td>${node.host || ''}</td>
					<td>${node.port || '22'}</td>
					<td>${node.username || ''}</td>
					<td><span class="badge bg-${statusBadge}">${node.status || 'OFFLINE'}</span></td>
				`;
				tbodyEl.appendChild(tr);
			});

			// Bind events
			bindExistingNodesEvents();

		} catch (error) {
			console.error('Error loading existing nodes:', error);
			tbodyEl.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Lỗi khi tải danh sách nodes</td></tr>';
		}
	}

	// Bind events cho existing nodes
	function bindExistingNodesEvents() {
		// Select all checkbox
		const selectAllCheckbox = document.getElementById('existing-nodes-check-all');
		if (selectAllCheckbox && !selectAllCheckbox.dataset.bound) {
			selectAllCheckbox.dataset.bound = '1';
			selectAllCheckbox.addEventListener('change', () => {
				const checkboxes = document.querySelectorAll('.existing-node-checkbox');
				checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
				updateAddExistingButton();
			});
		}

		// Individual checkboxes
		document.querySelectorAll('.existing-node-checkbox').forEach(checkbox => {
			if (!checkbox.dataset.bound) {
				checkbox.dataset.bound = '1';
				checkbox.addEventListener('change', () => {
					updateSelectAllState();
					updateAddExistingButton();
				});
			}
		});
	}

	// Update select all checkbox state
	function updateSelectAllState() {
		const selectAllCheckbox = document.getElementById('existing-nodes-check-all');
		const checkboxes = document.querySelectorAll('.existing-node-checkbox');

		if (selectAllCheckbox && checkboxes.length > 0) {
			const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
			selectAllCheckbox.checked = checkedCount === checkboxes.length;
			selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
		}
	}

	// Update add existing button visibility
	function updateAddExistingButton() {
		const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
		const addExistingBtn = document.getElementById('add-existing-nodes-btn');

		if (addExistingBtn) {
			if (checkboxes.length > 0) {
				addExistingBtn.style.display = 'inline-block';
				addExistingBtn.innerHTML = `<i class="bi bi-list-check"></i> Thêm ${checkboxes.length} Node đã chọn`;
			} else {
				addExistingBtn.style.display = 'none';
			}
		}
	}

	// Reset cluster form
	function resetClusterForm() {
		const form = document.getElementById('create-cluster-inline-form');
		if (form) {
			form.reset();
			const errorDiv = document.getElementById('create-cluster-inline-error');
			if (errorDiv) {
				errorDiv.style.display = 'none';
				errorDiv.textContent = '';
			}
			// Close accordion
			const accordion = document.getElementById('create-cluster-accordion');
			if (accordion) {
				accordion.classList.remove('open');
			}
		}
	}

	// Toggle create cluster accordion (inline trong danh sách)
	function toggleCreateCluster() {
		const accordion = document.getElementById('create-cluster-accordion');
		if (accordion) {
			const isOpen = accordion.classList.contains('open');
			if (isOpen) {
				accordion.classList.remove('open');
				// Reset form when closing
				const form = document.getElementById('create-cluster-inline-form');
				if (form) form.reset();
				const errorDiv = document.getElementById('create-cluster-inline-error');
				if (errorDiv) {
					errorDiv.style.display = 'none';
					errorDiv.textContent = '';
				}
			} else {
				accordion.classList.add('open');
			}
		}
	}

	// Export module
	window.K8sClustersModule = {
		loadClusterList,
		loadClustersAndServers,
		createCluster,
		deleteCluster,
		showClusterDetail,
		showClusterList,
		resetClusterData,
		resetClusterForm,
		saveServerClusterAndRole,
		removeSingleServerFromCluster,
		addExistingNodesToCluster,
		removeNodeFromCluster,
		toggleCreateCluster
	};

	// Auto-init on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	// Bind Playbook Manager Modal - tự động load playbooks khi mở modal
	function bindPlaybookManagerModal() {
		const playbookModal = document.getElementById('playbookManagerModal');
		if (playbookModal) {
			playbookModal.addEventListener('show.bs.modal', () => {
				if (!currentClusterId) {
					if (window.showAlert) {
						window.showAlert('warning', 'Vui lòng chọn cluster trước khi mở Playbook Manager');
					}
					return;
				}
				
				// Set currentClusterId cho playbook manager
				if (window.setCurrentClusterId && typeof window.setCurrentClusterId === 'function') {
					window.setCurrentClusterId(currentClusterId);
				}
				
				// Bind buttons
				if (window.bindPlaybookManagerButtons && typeof window.bindPlaybookManagerButtons === 'function') {
					window.bindPlaybookManagerButtons();
				}
				
				// Load playbooks (với hệ thống chỉ có 1 cluster, không cần clusterId)
				if (window.loadPlaybooks && typeof window.loadPlaybooks === 'function') {
					window.loadPlaybooks();
				} else if (window.refreshPlaybooks && typeof window.refreshPlaybooks === 'function') {
					window.refreshPlaybooks();
				}
			});
		}
	}

	function init() {
		// Check if we're on the kubernetes.html page and need to auto-load cluster detail
		const urlParams = new URLSearchParams(window.location.search);
		// Với hệ thống chỉ có 1 cluster, luôn tự động load cluster detail nếu có k8s-detail element
		if (document.getElementById('k8s-detail')) {
			// Auto-load cluster detail (không cần clusterId parameter)
			setTimeout(() => {
				if (window.ApiClient && typeof window.ApiClient.get === 'function') {
					showClusterDetail();
				} else {
					// Wait for ApiClient
					const checkApiClient = setInterval(() => {
						if (window.ApiClient && typeof window.ApiClient.get === 'function') {
							clearInterval(checkApiClient);
							showClusterDetail();
						}
					}, 100);
				}
			}, 100);
			return; // Don't load cluster list on kubernetes.html page
		}


		// Check if we're on the assign-servers.html page (with new 2-table layout)
		const hasAvailableServers = document.getElementById('available-servers-tbody');
		const hasAssignedServers = document.getElementById('assigned-servers-tbody');
		const isAssignServersPage = hasAvailableServers && hasAssignedServers && !document.getElementById('cluster-summary');
		
		// Check if we're on the old assign-servers page layout (for backward compatibility)
		const hasOldAssignSection = document.getElementById('k8s-assign') && !document.getElementById('cluster-summary');
		
		// Check if we're on cluster.html page (which includes cluster summary and servers list)
		const hasClusterSummary = document.getElementById('cluster-summary');
		const hasClusterServers = document.getElementById('cluster-servers-tbody');
		
		// Wait for ApiClient to be ready before loading clusters
		function waitForApiClient() {
			if (window.ApiClient && typeof window.ApiClient.get === 'function') {
				if (isAssignServersPage || hasOldAssignSection) {
					// We're on assign-servers.html page (standalone) - load servers into 2 tables
					loadClustersAndServers();
				} else {
					// We're on cluster.html page - load cluster summary (with servers list)
					if (hasClusterSummary) {
						loadClusterList();
					}
					// Bind playbook manager modal (if exists)
					bindPlaybookManagerModal();
				}


				// Bind refresh clusters button (on cluster.html)
				const refreshBtn = document.getElementById('refresh-clusters-btn');
				if (refreshBtn && !refreshBtn.dataset.bound) {
					refreshBtn.dataset.bound = '1';
					refreshBtn.addEventListener('click', () => {
						if (hasClusterSummary) {
							loadClusterList();
						}
					});
				}

				// Bind refresh servers button (on assign-servers.html)
				const refreshServersBtn = document.getElementById('refresh-servers-btn');
				if (refreshServersBtn && !refreshServersBtn.dataset.bound) {
					refreshServersBtn.dataset.bound = '1';
					refreshServersBtn.addEventListener('click', () => {
						loadClustersAndServers();
					});
				}

				// Bind create cluster inline form (trong danh sách)
				const createInlineForm = document.getElementById('create-cluster-inline-form');
				if (createInlineForm && !createInlineForm.dataset.bound) {
					createInlineForm.dataset.bound = '1';
					createInlineForm.addEventListener('submit', async (e) => {
						e.preventDefault();
						const nameInput = document.getElementById('cluster-name-inline');
						const descInput = document.getElementById('cluster-description-inline');
						const name = nameInput ? nameInput.value.trim() : '';
						const description = descInput ? descInput.value.trim() : '';
						const submitBtn = document.getElementById('create-cluster-inline-submit-btn');
						const textSpan = document.getElementById('create-cluster-inline-text');
						const loadingSpan = document.getElementById('create-cluster-inline-loading');
						const errorDiv = document.getElementById('create-cluster-inline-error');

						// Hide error
						if (errorDiv) {
							errorDiv.style.display = 'none';
							errorDiv.textContent = '';
						}

						if (!name) {
							if (errorDiv) {
								errorDiv.textContent = 'Vui lòng nhập tên cluster';
								errorDiv.style.display = 'block';
							}
							window.showAlert('warning', 'Vui lòng nhập tên cluster');
							return;
						}

						// Validate pattern
						if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
							if (errorDiv) {
								errorDiv.textContent = 'Tên cluster chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới';
								errorDiv.style.display = 'block';
							}
							window.showAlert('warning', 'Tên cluster chỉ được chứa chữ, số, dấu gạch ngang và gạch dưới');
							return;
						}

						try {
							if (submitBtn) submitBtn.disabled = true;
							if (textSpan) textSpan.style.display = 'none';
							if (loadingSpan) loadingSpan.style.display = 'inline';

							await createCluster(name, description || null);
							
							// Reset form and close accordion
							createInlineForm.reset();
							toggleCreateCluster();
							
							// Reload cluster list
							if (!isAssignServersPage) {
								await loadClusterList();
							}
						} catch (err) {
							const errorMsg = err.message || 'Tạo cluster thất bại';
							if (errorDiv) {
								errorDiv.textContent = errorMsg;
								errorDiv.style.display = 'block';
							}
						} finally {
							if (submitBtn) submitBtn.disabled = false;
							if (textSpan) textSpan.style.display = 'inline';
							if (loadingSpan) loadingSpan.style.display = 'none';
						}
					});
				}

				// Bind add existing nodes button
				const addExistingBtn = document.getElementById('add-existing-nodes-btn');
				if (addExistingBtn && !addExistingBtn.dataset.bound) {
					addExistingBtn.dataset.bound = '1';
					addExistingBtn.addEventListener('click', addExistingNodesToClusterFromModal);
				}

				// Bind add new node form submit
				const addNodeForm = document.getElementById('add-node-form');
				if (addNodeForm && !addNodeForm.dataset.bound) {
					addNodeForm.dataset.bound = '1';
					addNodeForm.addEventListener('submit', async (e) => {
						e.preventDefault();
						const form = e.target;
						const submitBtn = document.getElementById('add-node-submit-btn');
						const msgEl = document.getElementById('add-node-msg');

						const host = form.host.value.trim();
						const port = parseInt(form.port.value || '22', 10);
						const username = form.username.value.trim();
						const password = form.password.value.trim();
						const role = form.role.value;

						if (!host || !username || !password) {
							window.showAlert('warning', 'Vui lòng điền đầy đủ thông tin');
							return;
						}

						try {
							submitBtn.disabled = true;
							submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang thêm...';

							// Tạo server mới và gán vào cluster với role (với hệ thống chỉ có 1 cluster, không cần clusterId)
							const body = { host, port, username, password, role, clusterStatus: 'AVAILABLE' };
							await window.ApiClient.post('/admin/servers', body);

							if (msgEl) {
								msgEl.textContent = '✓ Đã thêm node thành công';
								msgEl.className = 'small text-success';
							}

							// Reset form
							form.reset();
							form.port.value = '22';
							form.role.value = 'WORKER';

							// Đóng modal sau 1 giây và reload
							setTimeout(async () => {
								if (window.Modal) {
									window.Modal.hide('addNodeModal');
								} else {
									const modalEl = document.getElementById('addNodeModal');
									if (modalEl) {
										try {
											const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
											if (modal) modal.hide();
										} catch (err) {
											console.error('Error hiding modal:', err);
										}
									}
								}
								await showClusterDetail();
								await Promise.all([loadClusterList(), loadClustersAndServers()]);
							}, 1000);

						} catch (err) {
							console.error('Add node error:', err);
							if (msgEl) {
								msgEl.textContent = err.message || 'Thêm node thất bại';
								msgEl.className = 'small text-danger';
							}
						} finally {
							submitBtn.disabled = false;
							submitBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Thêm Node mới';
						}
					});
				}

				// Listen for page events
				if (window.AdminBus && typeof window.AdminBus.on === 'function') {
					window.AdminBus.on('page:k8s', () => {
						loadClusterList();
						loadClustersAndServers();
					});
				}
				if (window.EventBus && typeof window.EventBus.on === 'function') {
					window.EventBus.on('page:k8s', () => {
						loadClusterList();
						loadClustersAndServers();
					});
				}
			} else {
				setTimeout(waitForApiClient, 50);
			}
		}
		waitForApiClient();
	}

	// Backward compatibility: expose global functions
	window.loadClusterList = loadClusterList;
	window.loadClustersAndServers = loadClustersAndServers;
	window.createCluster = (name, description) => window.K8sClustersModule.createCluster(name, description);
	window.deleteCluster = (id, name) => window.K8sClustersModule.deleteCluster(id, name);
	window.showClusterDetail = (id) => window.K8sClustersModule.showClusterDetail(id);
	window.showClusterList = () => window.K8sClustersModule.showClusterList();
	window.resetClusterData = () => window.K8sClustersModule.resetClusterData();
	window.saveServerClusterAndRole = (serverId) => window.K8sClustersModule.saveServerClusterAndRole(serverId);
	window.removeSingleServerFromCluster = (serverId) => window.K8sClustersModule.removeSingleServerFromCluster(serverId);
	window.addExistingNodesToCluster = (nodeIds, role) => window.K8sClustersModule.addExistingNodesToCluster(nodeIds, role);
	window.removeNodeFromCluster = (nodeId) => window.K8sClustersModule.removeNodeFromCluster(nodeId);
})();

