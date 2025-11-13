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

	// Load cluster list
	async function loadClusterList() {
		// Ensure ApiClient is loaded
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient not available. Waiting for it to load...');
			setTimeout(loadClusterList, 100);
			return;
		}

		try {
			const allData = await window.ApiClient.get('/admin/clusters').catch(() => []);
			const tbody = document.getElementById('clusters-tbody');
			if (!tbody) {
				console.error('clusters-tbody element not found');
				return;
			}

			const search = (document.getElementById('cluster-search')?.value || '').toLowerCase();
			const statusFilter = document.getElementById('cluster-status-filter')?.value || '';

			// Filter clusters
			const filteredClusters = (allData || [])
				.filter(c => (!search || String(c.name || '').toLowerCase().includes(search))
					&& (!statusFilter || String(c.status || '') === statusFilter));

			allClusters = filteredClusters;

			// Initialize pagination if not exists
			if (!clusterPagination && window.Pagination) {
				const paginationContainer = document.getElementById('clusters-pagination');
				if (paginationContainer) {
					clusterPagination = window.Pagination.create('clusters-pagination', {
						currentPage: 1,
						totalPages: Math.ceil(filteredClusters.length / 10),
						pageSize: 10,
						onPageChange: (page) => {
							renderClusterPage(page);
						},
						onPageSizeChange: (size) => {
							clusterPagination.setTotalPages(Math.ceil(filteredClusters.length / size));
							renderClusterPage(1);
						}
					});
				}
			}

			// Update pagination total pages
			if (clusterPagination) {
				const pageSize = clusterPagination.getState().pageSize;
				clusterPagination.setTotalPages(Math.ceil(filteredClusters.length / pageSize));
				renderClusterPage(clusterPagination.getState().currentPage);
			} else {
				// Fallback: render all without pagination
				renderClusters(filteredClusters);
			}

			// Bind search/filter
			const searchEl = document.getElementById('cluster-search');
			const filterEl = document.getElementById('cluster-status-filter');
			if (searchEl && !searchEl.dataset.bound) {
				searchEl.dataset.bound = '1';
				searchEl.addEventListener('input', () => {
					if (clusterPagination) clusterPagination.setCurrentPage(1);
					loadClusterList();
				});
			}
			if (filterEl && !filterEl.dataset.bound) {
				filterEl.dataset.bound = '1';
				filterEl.addEventListener('change', () => {
					if (clusterPagination) clusterPagination.setCurrentPage(1);
					loadClusterList();
				});
			}
		} catch (err) {
			console.error('Error loading cluster list:', err);
			const tbody = document.getElementById('clusters-tbody');
			if (tbody) {
				tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Lỗi tải danh sách: ${escapeHtml(err.message || 'Unknown error')}</td></tr>`;
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
			tr.innerHTML = '<td colspan="6" class="text-center text-muted">Chưa có cluster nào</td>';
			tbody.appendChild(tr);
			return;
		}

		clusters.forEach(c => {
			const status = c.status || 'ERROR';
			const badge = status === 'HEALTHY' ? 'success' : (status === 'WARNING' ? 'warning text-dark' : 'danger');
			const tr = document.createElement('tr');
			tr.innerHTML = `
				<td>${c.id || ''}</td>
				<td>${escapeHtml(c.name || '')}</td>
				<td>${escapeHtml(c.masterNode || '')}</td>
				<td>${c.workerCount ?? 0}</td>
				<td><span class="badge bg-${badge}">${escapeHtml(status)}</span></td>
				<td class="text-nowrap">
					<button class="btn btn-sm btn-primary cluster-view-btn" data-id="${c.id}">View</button>
					${c.isOwner ? `<button class="btn btn-sm btn-outline-danger cluster-delete-btn" data-id="${c.id}">Delete</button>` : ''}
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Bind view/delete buttons
		document.querySelectorAll('.cluster-view-btn').forEach(btn => {
			if (!btn.dataset.bound) {
				btn.dataset.bound = '1';
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					// Dùng currentTarget hoặc btn trực tiếp thay vì e.target.closest()
					const button = e.currentTarget || btn;
					const idStr = button.dataset.id || button.getAttribute('data-id');
					if (!idStr) {
						console.error('Cluster view button missing data-id attribute');
						window.showAlert('error', 'Không tìm thấy ID của cluster');
						return;
					}
					const id = parseInt(idStr, 10);
					if (isNaN(id) || id <= 0) {
						console.error('Invalid cluster ID:', idStr);
						window.showAlert('error', 'ID cluster không hợp lệ: ' + idStr);
						return;
					}
					showClusterDetail(id);
				});
			}
		});

		document.querySelectorAll('.cluster-delete-btn').forEach(btn => {
			if (!btn.dataset.bound) {
				btn.dataset.bound = '1';
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					// Dùng currentTarget hoặc btn trực tiếp thay vì e.target.closest()
					const button = e.currentTarget || btn;
					const idStr = button.dataset.id || button.getAttribute('data-id');
					if (!idStr) {
						console.error('Cluster delete button missing data-id attribute');
						window.showAlert('error', 'Không tìm thấy ID của cluster');
						return;
					}
					const id = parseInt(idStr, 10);
					if (isNaN(id) || id <= 0) {
						console.error('Invalid cluster ID:', idStr);
						window.showAlert('error', 'ID cluster không hợp lệ: ' + idStr);
						return;
					}
					const name = allClusters.find(c => c.id === id)?.name || '';
					deleteCluster(id, name);
				});
			}
		});
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
			const [clusters, servers, connectedIds] = await Promise.all([
				window.ApiClient.get('/admin/clusters').catch(() => []),
				window.ApiClient.get('/admin/servers').catch(() => []),
				window.ApiClient.get('/admin/servers/connected').catch(() => [])
			]);

			// Fill cluster select
			const sel = document.getElementById('k8s-cluster-select');
			if (sel) {
				sel.innerHTML = '';
				(clusters || []).forEach(c => {
					const opt = document.createElement('option');
					opt.value = c.id;
					opt.textContent = `${c.name}`;
					sel.appendChild(opt);
				});
			}

			// Display servers table
			const tbody = document.getElementById('k8s-servers-tbody');
			if (tbody) {
				tbody.innerHTML = '';
				(servers || []).forEach(s => {
					const cName = (clusters || []).find(c => Number(c.id) === Number(s.clusterId))?.name || '';
					const isConnected = (connectedIds || []).includes(s.id);
					const statusBadge = isConnected ?
						'<span class="badge bg-success">CONNECTED</span>' :
						'<span class="badge bg-secondary">OFFLINE</span>';
					const tr = document.createElement('tr');
					tr.innerHTML = `
						<td><input type="checkbox" class="k8s-sel" value="${s.id}"></td>
						<td>${s.id}</td>
						<td>${escapeHtml(s.host || '')}</td>
						<td>${s.port || ''}</td>
						<td>${escapeHtml(s.username || '')}</td>
						<td>
							<select class="form-select form-select-sm" data-id="${s.id}" data-field="cluster">
								<option value="">-- Chọn cluster --</option>
								${(clusters || []).map(c => `<option value="${c.id}" ${s.clusterId === c.id ? 'selected' : ''}>${escapeHtml(c.name || '')}</option>`).join('')}
							</select>
						</td>
						<td>
							<select class="form-select form-select-sm" data-id="${s.id}" data-field="role">
								<option value="WORKER" ${s.role === 'WORKER' ? 'selected' : ''}>WORKER</option>
								<option value="MASTER" ${s.role === 'MASTER' ? 'selected' : ''}>MASTER</option>
							</select>
						</td>
						<td>${statusBadge}</td>
						<td class="text-nowrap">
							<button class="btn btn-sm btn-primary me-1" onclick="window.K8sClustersModule.saveServerClusterAndRole(${s.id})" title="Lưu thay đổi cluster và role">
								<i class="bi bi-check-lg"></i> Lưu
							</button>
							<button class="btn btn-sm btn-outline-danger" onclick="window.K8sClustersModule.removeSingleServerFromCluster(${s.id})" title="Gỡ server này khỏi cluster">
								<i class="bi bi-x-circle"></i> Bỏ khỏi Cluster
							</button>
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

			// Bind assignment buttons
			bindAssignmentButtons();
		} catch (err) {
			console.error('Error loading clusters and servers:', err);
		}
	}

	// Bind assignment buttons
	function bindAssignmentButtons() {
		// Assign selected
		const assignBtn = document.getElementById('btn-assign-selected');
		if (assignBtn && !assignBtn.dataset.bound) {
			assignBtn.dataset.bound = '1';
			assignBtn.addEventListener('click', async () => {
				const selected = Array.from(document.querySelectorAll('#k8s-servers-tbody .k8s-sel:checked')).map(el => parseInt(el.value, 10));
				if (selected.length === 0) {
					window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
					return;
				}
				const clusterId = parseInt(document.getElementById('k8s-cluster-select').value, 10);
				const role = document.getElementById('k8s-role-select').value;
				if (!clusterId) {
					window.showAlert('warning', 'Vui lòng chọn cluster');
					return;
				}
				await addExistingNodesToCluster(selected, role);
			});
		}

		// Update role selected
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
					await saveServerClusterAndRole(serverId, null, role);
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

	// Create cluster
	async function createCluster(name, description) {
		try {
			const data = await window.ApiClient.post('/admin/clusters', {
				name: name.trim(),
				description: description ? description.trim() : null
			});
			window.showAlert('success', 'Đã tạo cluster thành công');
			await Promise.all([loadClusterList(), loadClustersAndServers()]);
			return data;
		} catch (err) {
			window.showAlert('error', err.message || 'Tạo cluster thất bại');
			throw err;
		}
	}

	// Delete cluster
	async function deleteCluster(id, name) {
		if (!confirm(`Bạn có chắc chắn muốn xóa cluster "${name}" (ID: ${id})?\n\nCảnh báo: Tất cả dữ liệu liên quan sẽ bị xóa vĩnh viễn!`)) {
			return;
		}

		try {
			await window.ApiClient.delete(`/admin/clusters/${id}`);
			window.showAlert('success', `Đã xóa cluster "${name}" thành công`);
			await Promise.all([loadClusterList(), loadClustersAndServers()]);
			if (currentClusterId === id) {
				resetClusterData();
				showClusterList();
			}
		} catch (err) {
			window.showAlert('error', err.message || 'Xóa cluster thất bại');
		}
	}

	// Show cluster list view
	function showClusterList() {
		document.getElementById('k8s-list')?.classList.remove('d-none');
		document.getElementById('k8s-create')?.classList.remove('d-none');
		document.getElementById('k8s-assign')?.classList.remove('d-none');
		document.getElementById('k8s-detail')?.classList.add('d-none');
		resetClusterData();
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
		if (window.K8sResourcesModule && window.K8sResourcesModule.setCurrentClusterId) {
			window.K8sResourcesModule.setCurrentClusterId(null);
		}
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

		// Clear K8s resources data trong module (nếu có method)
		if (window.K8sResourcesModule && typeof window.K8sResourcesModule.clearResourcesData === 'function') {
			window.K8sResourcesModule.clearResourcesData();
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

		// Clear K8s resources data trong module (nếu có method)
		if (window.K8sResourcesModule && typeof window.K8sResourcesModule.clearResourcesData === 'function') {
			window.K8sResourcesModule.clearResourcesData();
		}
	}

	// Show cluster detail (simplified version - full implementation can be added later)
	async function showClusterDetail(clusterId) {
		// Validate clusterId
		if (!clusterId || clusterId === null || clusterId === undefined) {
			console.error('showClusterDetail: clusterId is required');
			window.showAlert('error', 'Không có ID cluster. Vui lòng thử lại.');
			return;
		}

		const id = typeof clusterId === 'number' ? clusterId : parseInt(clusterId, 10);
		if (isNaN(id) || id <= 0) {
			console.error('showClusterDetail: Invalid clusterId:', clusterId);
			window.showAlert('error', 'ID cluster không hợp lệ: ' + clusterId);
			return;
		}

		// Clear dữ liệu cũ trước khi load cluster mới
		clearClusterDetailUI();

		currentClusterId = id;
		window.currentClusterId = id;

		// Set in playbook-manager.js
		if (window.setCurrentClusterId) {
			window.setCurrentClusterId(id);
		}

		// Switch sections
		document.getElementById('k8s-list')?.classList.add('d-none');
		document.getElementById('k8s-create')?.classList.add('d-none');
		document.getElementById('k8s-assign')?.classList.add('d-none');
		document.getElementById('k8s-detail')?.classList.remove('d-none');

		try {
			// Thêm timeout cho API call (30 giây)
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Request timeout: Không nhận được phản hồi từ server sau 30 giây')), 30000);
			});
			
			const detailPromise = window.ApiClient.get(`/admin/clusters/${id}/detail`);
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
			loadClusterNodes(id, detail);

			// Set current cluster ID trong các module
			if (window.K8sResourcesModule) {
				window.K8sResourcesModule.setCurrentClusterId(id);
			}
			if (window.AnsibleConfigModule) {
				window.AnsibleConfigModule.setCurrentClusterId(id);
			}
			if (window.AnsibleWebSocketModule) {
				window.AnsibleWebSocketModule.setCurrentClusterId(id);
			}

			// Load K8s resources và networking resources
			if (window.K8sResourcesModule) {
				// Load K8s resources (pods, namespaces, workloads)
				window.K8sResourcesModule.loadK8sResources(id).catch(err => {
					console.error('Error loading K8s resources:', err);
				});
				// Load networking resources (services, ingress)
				window.K8sResourcesModule.loadNetworkingResources(id).catch(err => {
					console.error('Error loading networking resources:', err);
				});
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
						if (clusterIdInput) {
							clusterIdInput.value = id;
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

			// Bind refresh K8s resources button
			const refreshK8sResourcesBtn = document.getElementById('refresh-k8s-resources');
			if (refreshK8sResourcesBtn && !refreshK8sResourcesBtn.dataset.bound) {
				refreshK8sResourcesBtn.dataset.bound = '1';
				// Remove old onclick if exists
				refreshK8sResourcesBtn.removeAttribute('onclick');
				// Bind new event listener
				refreshK8sResourcesBtn.addEventListener('click', async () => {
					// Show loading state
					const originalHtml = refreshK8sResourcesBtn.innerHTML;
					refreshK8sResourcesBtn.disabled = true;
					refreshK8sResourcesBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Đang làm mới...';
					
					try {
						if (window.K8sResourcesModule && window.K8sResourcesModule.loadK8sResources) {
							await window.K8sResourcesModule.loadK8sResources(id);
						} else {
							window.showAlert('warning', 'K8s Resources Module chưa sẵn sàng');
						}
					} catch (error) {
						console.error('Error refreshing K8s resources:', error);
						if (window.showAlert) {
							window.showAlert('error', 'Lỗi khi làm mới tài nguyên Kubernetes: ' + (error.message || 'Unknown error'));
						}
					} finally {
						// Restore button state
						refreshK8sResourcesBtn.disabled = false;
						refreshK8sResourcesBtn.innerHTML = originalHtml;
					}
				});
			}

			// Bind refresh networking resources button
			const refreshNetworkingBtn = document.getElementById('refresh-networking-resources');
			if (refreshNetworkingBtn && !refreshNetworkingBtn.dataset.bound) {
				refreshNetworkingBtn.dataset.bound = '1';
				// Remove old onclick if exists
				refreshNetworkingBtn.removeAttribute('onclick');
				// Bind new event listener
				refreshNetworkingBtn.addEventListener('click', async () => {
					// Show loading state
					const originalHtml = refreshNetworkingBtn.innerHTML;
					refreshNetworkingBtn.disabled = true;
					refreshNetworkingBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Đang làm mới...';
					
					try {
						if (window.K8sResourcesModule && window.K8sResourcesModule.loadNetworkingResources) {
							await window.K8sResourcesModule.loadNetworkingResources(id);
						} else {
							window.showAlert('warning', 'K8s Resources Module chưa sẵn sàng');
						}
					} catch (error) {
						console.error('Error refreshing networking resources:', error);
						if (window.showAlert) {
							window.showAlert('error', 'Lỗi khi làm mới tài nguyên Networking: ' + (error.message || 'Unknown error'));
						}
					} finally {
						// Restore button state
						refreshNetworkingBtn.disabled = false;
						refreshNetworkingBtn.innerHTML = originalHtml;
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
	async function loadClusterNodes(clusterId, detail) {
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
		const k8sNodesPromise = window.ApiClient.get(`/admin/clusters/${clusterId}/k8s/nodes`).catch(() => null);

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
					<button class="btn btn-sm btn-outline-danger cd-remove-node" data-id="${nodeId}" data-cluster="${clusterId}">
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
				const clusterId = parseInt(e.target.closest('.cd-remove-node').dataset.cluster, 10);
				if (nodeId && clusterId) {
					removeNodeFromCluster(nodeId, clusterId);
				}
			});
		});
	}

	// Save server cluster and role
	async function saveServerClusterAndRole(serverId, clusterId = null, role = null) {
		const serverRow = document.querySelector(`#k8s-servers-tbody tr:has(input[value="${serverId}"])`);
		const clusterSelect = serverRow ? serverRow.querySelector('select[data-field="cluster"]') : null;
		const roleSelect = serverRow ? serverRow.querySelector('select[data-field="role"]') : null;

		if (!clusterSelect || !roleSelect) {
			console.error('Không tìm thấy cluster hoặc role select cho server', serverId);
			return;
		}

		const newClusterId = clusterId !== null ? clusterId : (clusterSelect.value ? parseInt(clusterSelect.value, 10) : null);
		const newRole = role !== null ? role : roleSelect.value;

		try {
			const body = { role: newRole };
			if (newClusterId) {
				body.clusterId = newClusterId;
			} else {
				body.clusterId = null;
			}

			await window.ApiClient.put(`/admin/servers/${serverId}`, body);

			const clusterName = newClusterId ? clusterSelect.options[clusterSelect.selectedIndex]?.text : 'không có cluster';
			window.showAlert('success', `Đã cập nhật server ${serverId}: cluster "${clusterName}", role ${newRole}`);

			await Promise.all([loadClusterList(), loadClustersAndServers()]);
		} catch (err) {
			console.error('Lỗi khi lưu cluster và role máy chủ:', err);
			window.showAlert('error', err.message || 'Cập nhật cluster và role thất bại');
		}
	}

	// Remove single server from cluster
	async function removeSingleServerFromCluster(serverId) {
		if (!confirm('Bỏ server này khỏi cluster?')) return;

		try {
			const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
			const server = servers.find(s => s.id === serverId);
			const currentRole = server ? server.role : 'WORKER';

			const body = { clusterId: null, role: currentRole };
			await window.ApiClient.put(`/admin/servers/${serverId}`, body);

			window.showAlert('success', `Đã bỏ server ${serverId} khỏi cluster`);

			await Promise.all([loadClusterList(), loadClustersAndServers()]);
		} catch (err) {
			console.error('Lỗi khi bỏ máy chủ đơn lẻ khỏi cluster:', err);
			window.showAlert('error', err.message || 'Bỏ khỏi cluster thất bại');
		}
	}

	// Add existing nodes to cluster (called from modal button)
	async function addExistingNodesToClusterFromModal() {
		const checkboxes = document.querySelectorAll('.existing-node-checkbox:checked');
		const nodeIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));
		const role = 'WORKER'; // Default role, có thể thêm dropdown sau

		if (nodeIds.length === 0) {
			window.showAlert('warning', 'Vui lòng chọn ít nhất một node');
			return;
		}

		const clusterIdInput = document.getElementById('add-node-cluster-id');
		if (!clusterIdInput || !clusterIdInput.value) {
			window.showAlert('error', 'Không tìm thấy cluster ID');
			return;
		}

		const clusterId = parseInt(clusterIdInput.value, 10);
		await addExistingNodesToCluster(nodeIds, role, clusterId, true);
	}

	// Add existing nodes to cluster
	async function addExistingNodesToCluster(nodeIds, role, clusterIdParam = null, isFromModal = false) {
		if (!nodeIds || nodeIds.length === 0) {
			window.showAlert('warning', 'Vui lòng chọn ít nhất một server');
			return;
		}

		// Tìm clusterId từ modal hoặc từ select box
		let clusterId = clusterIdParam;
		if (!clusterId) {
			const addNodeClusterIdInput = document.getElementById('add-node-cluster-id');
			const k8sClusterSelect = document.getElementById('k8s-cluster-select');
			
			if (addNodeClusterIdInput && addNodeClusterIdInput.value) {
				// Được gọi từ modal "Thêm Node"
				clusterId = parseInt(addNodeClusterIdInput.value, 10);
			} else if (k8sClusterSelect && k8sClusterSelect.value) {
				// Được gọi từ nút "Gán vào cluster"
				clusterId = parseInt(k8sClusterSelect.value, 10);
			}
		}

		if (!clusterId || isNaN(clusterId)) {
			window.showAlert('warning', 'Vui lòng chọn cluster');
			return;
		}

		const addExistingBtn = document.getElementById('add-existing-nodes-btn');
		const assignBtn = document.getElementById('btn-assign-selected');
		// isFromModal đã được truyền vào như parameter, không cần tính lại

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
				const body = { clusterId, role };
				await window.ApiClient.put(`/admin/servers/${nodeId}`, body);
			}

			window.showAlert('success', `✓ Đã thêm ${nodeIds.length} node vào cluster`);

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

					if (currentClusterId === clusterId) {
						await showClusterDetail(clusterId);
					}
					await Promise.all([loadClusterList(), loadClustersAndServers()]);
				}, 1000);
			} else {
				// Nếu được gọi từ nút "Gán vào cluster", refresh ngay
				if (currentClusterId === clusterId) {
					await showClusterDetail(clusterId);
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
				assignBtn.innerHTML = 'Gán vào Cluster';
			}
		}
	}

	// Remove node from cluster
	async function removeNodeFromCluster(nodeId, clusterId) {
		if (!confirm('Xóa node này khỏi cluster?')) return;

		try {
			const servers = await window.ApiClient.get('/admin/servers').catch(() => []);
			const server = servers.find(s => s.id === nodeId);
			const currentRole = server ? server.role : 'WORKER';

			const body = { clusterId: null, role: currentRole };
			await window.ApiClient.put(`/admin/servers/${nodeId}`, body);

			window.showAlert('success', `Đã xóa node ${nodeId} khỏi cluster`);
			await showClusterDetail(clusterId);
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

			// Lọc các server chưa thuộc cluster nào (clusterId null hoặc undefined)
			const availableNodes = servers.filter(server =>
				!server.clusterId || server.clusterId === null || server.clusterId === undefined
			);

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

	// Export module
	window.K8sClustersModule = {
		loadClusterList,
		loadClustersAndServers,
		createCluster,
		deleteCluster,
		showClusterDetail,
		showClusterList,
		resetClusterData,
		saveServerClusterAndRole,
		removeSingleServerFromCluster,
		addExistingNodesToCluster,
		removeNodeFromCluster
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
				
				// Load playbooks
				if (window.loadPlaybooks && typeof window.loadPlaybooks === 'function') {
					window.loadPlaybooks(currentClusterId);
				} else if (window.refreshPlaybooks && typeof window.refreshPlaybooks === 'function') {
					window.refreshPlaybooks();
				}
			});
		}
	}

	function init() {
		// Wait for ApiClient to be ready before loading clusters
		function waitForApiClient() {
			if (window.ApiClient && typeof window.ApiClient.get === 'function') {
				// Load cluster list
				loadClusterList();
				// Bind playbook manager modal
				bindPlaybookManagerModal();
				loadClustersAndServers();

				// Bind create cluster form
				const createForm = document.getElementById('create-cluster-form');
				if (createForm && !createForm.dataset.bound) {
					createForm.dataset.bound = '1';
					createForm.addEventListener('submit', async (e) => {
						e.preventDefault();
						const name = createForm.name.value.trim();
						const description = createForm.description.value.trim();
						const btn = createForm.querySelector('button[type="submit"]');

						if (!name) {
							window.showAlert('warning', 'Vui lòng nhập tên cluster');
							return;
						}

						try {
							btn.disabled = true;
							btn.textContent = 'Đang tạo...';
							await createCluster(name, description);
							// createCluster đã hiển thị thông báo success
							createForm.reset();
						} catch (err) {
							// createCluster đã hiển thị thông báo error
						} finally {
							btn.disabled = false;
							btn.textContent = 'Tạo';
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
						const clusterIdInput = document.getElementById('add-node-cluster-id');
						const submitBtn = document.getElementById('add-node-submit-btn');
						const msgEl = document.getElementById('add-node-msg');

						if (!clusterIdInput || !clusterIdInput.value) {
							window.showAlert('error', 'Không tìm thấy cluster ID');
							return;
						}

						const clusterId = parseInt(clusterIdInput.value, 10);
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

							// Tạo server mới và gán vào cluster với role
							const body = { host, port, username, password, clusterId, role };
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
								await showClusterDetail(clusterId);
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
	window.removeNodeFromCluster = (nodeId, clusterId) => window.K8sClustersModule.removeNodeFromCluster(nodeId, clusterId);
})();

