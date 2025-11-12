// K8s Resources Module - Quản lý Kubernetes resources (pods, namespaces, workloads, services, ingress)
(function () {
	'use strict';

	// Trạng thái module
	let currentClusterId = null;
	let k8sRequestToken = 0;
	const k8sResourcesData = {
		pods: [],
		namespaces: [],
		workloads: { deployments: [], statefulSets: [], daemonSets: [] },
		services: [],
		ingress: []
	};
	const deletingNamespaces = new Set(); // Theo dõi các namespace đang được xóa

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

	// Hàm hỗ trợ: Kiểm tra workload type có thể scale không
	function canScaleWorkloadType(type) {
		const t = (type || '').toLowerCase();
		return t === 'deployment' || t === 'statefulset';
	}

	// Hàm hỗ trợ: Kiểm tra pod có thể xóa không
	function canDeletePod(namespace) {
		return !isSystemNamespace(namespace);
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

	// Load K8s resources (pods, namespaces, workloads)
	async function loadK8sResources(clusterId) {
		if (!clusterId) {
			console.error('loadK8sResources: clusterId is required');
			return;
		}

		currentClusterId = clusterId;

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			setTimeout(() => loadK8sResources(clusterId), 100);
			return;
		}

		// Kiểm tra MASTER có online không trước khi load
		try {
			const detail = await window.ApiClient.get(`/admin/clusters/${clusterId}/detail`).catch(() => null);
			if (detail && detail.nodes) {
				const hasOnlineMaster = detail.nodes.some(n => 
					(n.isConnected || n.status === 'ONLINE') && n.role === 'MASTER'
				);
				if (!hasOnlineMaster) {
					showK8sResourcesOfflineMessage();
					return;
				}
			}
		} catch (error) {
			// Nếu kiểm tra thất bại, vẫn thử load (fallback)
		}

		// Tăng token để vô hiệu hóa các request cũ
		const myToken = ++k8sRequestToken;
		try {
			await Promise.all([
				loadPods(clusterId, myToken),
				loadNamespaces(clusterId, myToken),
				loadWorkloads(clusterId, myToken)
			]);
		} catch (error) {
			console.error('Error loading K8s resources:', error);
		}
	}

	// Load pods
	async function loadPods(clusterId, token) {
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${clusterId}/k8s/pods`);
			if (token !== k8sRequestToken) return; // Bỏ qua kết quả cũ
			k8sResourcesData.pods = data.pods || [];
			renderPods();
			updatePodsCount();
		} catch (error) {
			if (token !== k8sRequestToken) return;
			const errorMsg = error.message || 'Lỗi tải pods';
			if (error.status === 503) {
				showPodsError('Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
			} else {
				showPodsError(errorMsg);
			}
		}
	}

	// Tải danh sách namespaces
	async function loadNamespaces(clusterId, token) {
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${clusterId}/k8s/namespaces`);
			if (token !== k8sRequestToken) return; // Bỏ qua kết quả cũ
			k8sResourcesData.namespaces = data.namespaces || [];
			renderNamespaces();
			updateNamespacesCount();
			updatePodsNamespaceFilter();
			updateServicesNamespaceFilter();
			updateIngressNamespaceFilter();
		} catch (error) {
			if (token !== k8sRequestToken) return;
			const errorMsg = error.message || 'Lỗi tải namespaces';
			if (error.status === 503) {
				showNamespacesError('Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
			} else {
				showNamespacesError(errorMsg);
			}
		}
	}

	// Tải danh sách workloads (deployments, statefulSets, daemonSets)
	async function loadWorkloads(clusterId, token) {
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${clusterId}/k8s/workloads`);
			if (token !== k8sRequestToken) return; // Bỏ qua kết quả cũ
			k8sResourcesData.workloads = {
				deployments: data.deployments || [],
				statefulSets: data.statefulSets || [],
				daemonSets: data.daemonSets || []
			};
			renderWorkloads();
			updateWorkloadsCount();
		} catch (error) {
			if (token !== k8sRequestToken) return;
			const errorMsg = error.message || 'Lỗi tải workloads';
			if (error.status === 503) {
				showWorkloadsError('Kubernetes API server không khả dụng - Master node có thể đang NOTREADY');
			} else {
				showWorkloadsError(errorMsg);
			}
		}
	}

	// Tải networking resources (Services & Ingress)
	async function loadNetworkingResources(clusterId) {
		if (!clusterId) return;

		// Kiểm tra MASTER có online không
		try {
			const detail = await window.ApiClient.get(`/admin/clusters/${clusterId}/detail`).catch(() => null);
			if (detail && detail.nodes) {
				const hasOnlineMaster = detail.nodes.some(n => 
					(n.isConnected || n.status === 'ONLINE') && n.role === 'MASTER'
				);
				if (!hasOnlineMaster) {
					showNetworkingOfflineMessage();
					return;
				}
			}
		} catch (error) {
			// Fallback: vẫn thử load
		}

		try {
			const [servicesData, ingressData] = await Promise.all([
				window.ApiClient.get(`/admin/clusters/${clusterId}/k8s/services`).catch(() => ({ services: [] })),
				window.ApiClient.get(`/admin/clusters/${clusterId}/k8s/ingress`).catch(() => ({ ingress: [] }))
			]);

			k8sResourcesData.services = servicesData.services || [];
			k8sResourcesData.ingress = ingressData.ingress || [];
			renderServices();
			renderIngress();
			updateServicesCount();
			updateIngressCount();
			updateServicesNamespaceFilter();
			updateIngressNamespaceFilter();
		} catch (error) {
			console.error('Error loading networking resources:', error);
		}
	}

	// Các hàm render
	function renderPods() {
		const tbody = document.getElementById('pods-tbody');
		if (!tbody) return;

		tbody.innerHTML = '';

		if (!k8sResourcesData.pods || k8sResourcesData.pods.length === 0) {
			tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có pod nào</td></tr>';
			return;
		}

		k8sResourcesData.pods.forEach(pod => {
			const tr = document.createElement('tr');
			const status = pod.status || 'Unknown';
			const statusClass = getPodStatusBadgeClass(status);
			const canDelete = canDeletePod(pod.namespace);
			const namespace = pod.namespace || '';
			const name = pod.name || '';

			tr.innerHTML = `
				<td><code>${escapeHtml(namespace)}</code></td>
				<td><strong>${escapeHtml(name)}</strong></td>
				<td><small>${escapeHtml(pod.node || '-')}</small></td>
				<td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
				<td>
					<div class="d-flex gap-1">
						<button class="btn btn-sm btn-outline-info pod-describe-btn" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xem chi tiết">
							<i class="bi bi-eye"></i>
						</button>
						${canDelete ? `<button class="btn btn-sm btn-outline-danger pod-delete-btn" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xóa">
							<i class="bi bi-trash"></i>
						</button>` : ''}
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Bind event listeners cho pod buttons
		tbody.querySelectorAll('.pod-describe-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.describePod) {
					window.K8sResourcesModule.describePod(namespace, name);
				}
			});
		});

		tbody.querySelectorAll('.pod-delete-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.deletePod) {
					window.K8sResourcesModule.deletePod(namespace, name);
				}
			});
		});
	}

	function renderNamespaces() {
		const tbody = document.getElementById('namespaces-tbody');
		if (!tbody) return;

		tbody.innerHTML = '';

		if (!k8sResourcesData.namespaces || k8sResourcesData.namespaces.length === 0) {
			tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Không có namespace nào</td></tr>';
			return;
		}

		k8sResourcesData.namespaces.forEach(ns => {
			const tr = document.createElement('tr');
			const status = ns.status || 'Active';
			const statusClass = getNamespaceStatusBadgeClass(status);
			const isSystem = isSystemNamespace(ns.name);
			const isDeleting = deletingNamespaces.has(ns.name);
			const name = ns.name || '';

			tr.innerHTML = `
				<td><strong>${escapeHtml(name)}</strong></td>
				<td>
					${isDeleting ? '<span class="badge bg-warning">Đang xóa...</span>' : `<span class="badge ${statusClass}">${escapeHtml(status)}</span>`}
				</td>
				<td>
					<div class="d-flex gap-1">
						<button class="btn btn-sm btn-outline-info namespace-describe-btn" data-name="${escapeHtml(name)}" title="Xem chi tiết">
							<i class="bi bi-eye"></i>
						</button>
						${!isSystem && !isDeleting ? `<button class="btn btn-sm btn-outline-danger namespace-delete-btn" data-name="${escapeHtml(name)}" title="Xóa">
							<i class="bi bi-trash"></i>
						</button>` : ''}
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Bind event listeners cho namespace buttons
		tbody.querySelectorAll('.namespace-describe-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.describeNamespace) {
					window.K8sResourcesModule.describeNamespace(name);
				}
			});
		});

		tbody.querySelectorAll('.namespace-delete-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.deleteNamespace) {
					window.K8sResourcesModule.deleteNamespace(name);
				}
			});
		});
	}

	function renderWorkloads() {
		const tbody = document.getElementById('workloads-tbody');
		if (!tbody) return;

		tbody.innerHTML = '';

		const allWorkloads = [
			...(k8sResourcesData.workloads.deployments || []).map(w => ({ ...w, type: 'Deployment' })),
			...(k8sResourcesData.workloads.statefulSets || []).map(w => ({ ...w, type: 'StatefulSet' })),
			...(k8sResourcesData.workloads.daemonSets || []).map(w => ({ ...w, type: 'DaemonSet' }))
		];

		if (allWorkloads.length === 0) {
			tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có workload nào</td></tr>';
			return;
		}

		allWorkloads.forEach(workload => {
			const tr = document.createElement('tr');
			const ready = workload.ready || 0;
			const total = workload.replicas || workload.total || 0;
			const statusClass = getWorkloadStatusBadgeClass(ready, total);
			const canScale = canScaleWorkloadType(workload.type);
			const isSystem = isSystemNamespace(workload.namespace);
			const type = (workload.type || '').toLowerCase();
			const namespace = workload.namespace || '';
			const name = workload.name || '';

			tr.innerHTML = `
				<td><span class="badge bg-primary">${escapeHtml(workload.type || '')}</span></td>
				<td><code>${escapeHtml(namespace)}</code></td>
				<td><strong>${escapeHtml(name)}</strong></td>
				<td><span class="badge ${statusClass}">${ready}/${total}</span></td>
				<td>
					<div class="d-flex gap-1">
						<button class="btn btn-sm btn-outline-info workload-describe-btn" data-type="${escapeHtml(type)}" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xem chi tiết">
							<i class="bi bi-eye"></i>
						</button>
						${canScale && !isSystem ? `<button class="btn btn-sm btn-outline-warning workload-scale-btn" data-type="${escapeHtml(type)}" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Scale">
							<i class="bi bi-arrows-angle-expand"></i>
						</button>` : ''}
						${!isSystem ? `<button class="btn btn-sm btn-outline-danger workload-delete-btn" data-type="${escapeHtml(type)}" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xóa">
							<i class="bi bi-trash"></i>
						</button>` : ''}
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Bind event listeners cho workload buttons
		tbody.querySelectorAll('.workload-describe-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const type = btn.dataset.type;
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.describeWorkload) {
					window.K8sResourcesModule.describeWorkload(type, namespace, name);
				}
			});
		});

		tbody.querySelectorAll('.workload-scale-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const type = btn.dataset.type;
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.scaleWorkload) {
					window.K8sResourcesModule.scaleWorkload(type, namespace, name);
				}
			});
		});

		tbody.querySelectorAll('.workload-delete-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const type = btn.dataset.type;
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.deleteWorkload) {
					window.K8sResourcesModule.deleteWorkload(type, namespace, name);
				}
			});
		});
	}

	function renderServices() {
		const tbody = document.getElementById('services-tbody');
		if (!tbody) return;

		tbody.innerHTML = '';

		if (!k8sResourcesData.services || k8sResourcesData.services.length === 0) {
			tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có service nào</td></tr>';
			return;
		}

		k8sResourcesData.services.forEach(svc => {
			const tr = document.createElement('tr');
			const type = svc.type || 'ClusterIP';
			const clusterIP = svc.clusterIP || '-';
			const externalIP = svc.externalIP || '-';
			// ports có thể là string (từ backend) hoặc array
			let portsText = '-';
			if (svc.ports) {
				if (Array.isArray(svc.ports)) {
					// Nếu là array, map qua các port objects
					portsText = svc.ports.length > 0 ? svc.ports.map(p => {
						const port = p.port || '';
						const targetPort = p.targetPort || '';
						const protocol = p.protocol || 'TCP';
						return targetPort ? `${port}:${targetPort}/${protocol}` : `${port}/${protocol}`;
					}).join(', ') : '-';
				} else if (typeof svc.ports === 'string') {
					// Nếu là string, sử dụng trực tiếp
					portsText = svc.ports || '-';
				}
			}
			const age = svc.age || '-';
			const isSystem = isSystemNamespace(svc.namespace);
			const namespace = svc.namespace || '';
			const name = svc.name || '';

			tr.innerHTML = `
				<td><code>${escapeHtml(namespace)}</code></td>
				<td><strong>${escapeHtml(name)}</strong></td>
				<td><span class="badge bg-info">${escapeHtml(type)}</span></td>
				<td><code>${escapeHtml(clusterIP)}</code></td>
				<td><code>${escapeHtml(externalIP)}</code></td>
				<td><small>${escapeHtml(portsText)}</small></td>
				<td><small>${escapeHtml(age)}</small></td>
				<td>
					<div class="d-flex gap-1">
						<button class="btn btn-sm btn-outline-info service-describe-btn" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xem chi tiết">
							<i class="bi bi-eye"></i>
						</button>
						${!isSystem ? `<button class="btn btn-sm btn-outline-danger service-delete-btn" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xóa">
							<i class="bi bi-trash"></i>
						</button>` : ''}
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Bind event listeners cho service buttons
		tbody.querySelectorAll('.service-describe-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.describeService) {
					window.K8sResourcesModule.describeService(namespace, name);
				}
			});
		});

		tbody.querySelectorAll('.service-delete-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.deleteService) {
					window.K8sResourcesModule.deleteService(namespace, name);
				}
			});
		});
	}

	function renderIngress() {
		const tbody = document.getElementById('ingress-tbody');
		if (!tbody) return;

		tbody.innerHTML = '';

		if (!k8sResourcesData.ingress || k8sResourcesData.ingress.length === 0) {
			tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Không có ingress nào</td></tr>';
			return;
		}

		k8sResourcesData.ingress.forEach(ing => {
			const tr = document.createElement('tr');
			const className = ing.class || '-';
			// hosts có thể là array hoặc string
			let hostsText = '-';
			if (ing.hosts) {
				if (Array.isArray(ing.hosts)) {
					hostsText = ing.hosts.length > 0 ? ing.hosts.join(', ') : '-';
				} else if (typeof ing.hosts === 'string') {
					hostsText = ing.hosts || '-';
				}
			}
			// addresses có thể là array hoặc string
			let addressesText = '-';
			if (ing.addresses) {
				if (Array.isArray(ing.addresses)) {
					addressesText = ing.addresses.length > 0 ? ing.addresses.join(', ') : '-';
				} else if (typeof ing.addresses === 'string') {
					addressesText = ing.addresses || '-';
				}
			}
			// ports có thể là array hoặc string
			let portsText = '-';
			if (ing.ports) {
				if (Array.isArray(ing.ports)) {
					portsText = ing.ports.length > 0 ? ing.ports.join(', ') : '-';
				} else if (typeof ing.ports === 'string') {
					portsText = ing.ports || '-';
				}
			}
			const age = ing.age || '-';
			const isSystem = isSystemNamespace(ing.namespace);
			const namespace = ing.namespace || '';
			const name = ing.name || '';

			tr.innerHTML = `
				<td><code>${escapeHtml(namespace)}</code></td>
				<td><strong>${escapeHtml(name)}</strong></td>
				<td><code>${escapeHtml(className)}</code></td>
				<td><small>${escapeHtml(hostsText)}</small></td>
				<td><small>${escapeHtml(addressesText)}</small></td>
				<td><small>${escapeHtml(portsText)}</small></td>
				<td><small>${escapeHtml(age)}</small></td>
				<td>
					<div class="d-flex gap-1">
						<button class="btn btn-sm btn-outline-info ingress-describe-btn" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xem chi tiết">
							<i class="bi bi-eye"></i>
						</button>
						${!isSystem ? `<button class="btn btn-sm btn-outline-danger ingress-delete-btn" data-namespace="${escapeHtml(namespace)}" data-name="${escapeHtml(name)}" title="Xóa">
							<i class="bi bi-trash"></i>
						</button>` : ''}
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});

		// Bind event listeners cho ingress buttons
		tbody.querySelectorAll('.ingress-describe-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.describeIngress) {
					window.K8sResourcesModule.describeIngress(namespace, name);
				}
			});
		});

		tbody.querySelectorAll('.ingress-delete-btn').forEach(btn => {
			btn.addEventListener('click', () => {
				const namespace = btn.dataset.namespace;
				const name = btn.dataset.name;
				if (window.K8sResourcesModule && window.K8sResourcesModule.deleteIngress) {
					window.K8sResourcesModule.deleteIngress(namespace, name);
				}
			});
		});
	}

	// Các hàm cập nhật số lượng
	function updatePodsCount() {
		const el = document.getElementById('pods-count');
		if (el) el.textContent = k8sResourcesData.pods.length;
	}

	function updateNamespacesCount() {
		const el = document.getElementById('namespaces-count');
		if (el) el.textContent = k8sResourcesData.namespaces.length;
	}

	function updateWorkloadsCount() {
		const total = (k8sResourcesData.workloads.deployments || []).length +
		              (k8sResourcesData.workloads.statefulSets || []).length +
		              (k8sResourcesData.workloads.daemonSets || []).length;
		const el = document.getElementById('workloads-count');
		if (el) el.textContent = total;
	}

	function updateServicesCount() {
		const el = document.getElementById('services-count');
		if (el) el.textContent = k8sResourcesData.services.length;
	}

	function updateIngressCount() {
		const el = document.getElementById('ingress-count');
		if (el) el.textContent = k8sResourcesData.ingress.length;
	}

	function updatePodsNamespaceFilter() {
		const select = document.getElementById('pods-namespace-filter');
		if (!select) return;
		
		// Lấy danh sách namespace duy nhất từ pods
		const namespaces = [...new Set(k8sResourcesData.pods.map(p => p.namespace).filter(Boolean))].sort();
		
		// Giữ option đầu tiên (Tất cả namespace)
		select.innerHTML = '<option value="">Tất cả namespace</option>';
		
		// Thêm các namespace
		namespaces.forEach(ns => {
			const option = document.createElement('option');
			option.value = ns;
			option.textContent = ns;
			select.appendChild(option);
		});
	}

	function updateServicesNamespaceFilter() {
		const select = document.getElementById('services-namespace-filter');
		if (!select) return;
		
		// Lấy danh sách namespace duy nhất từ services
		const namespaces = [...new Set(k8sResourcesData.services.map(s => s.namespace).filter(Boolean))].sort();
		
		// Giữ option đầu tiên (Tất cả namespace)
		select.innerHTML = '<option value="">Tất cả namespace</option>';
		
		// Thêm các namespace
		namespaces.forEach(ns => {
			const option = document.createElement('option');
			option.value = ns;
			option.textContent = ns;
			select.appendChild(option);
		});
	}

	function updateIngressNamespaceFilter() {
		const select = document.getElementById('ingress-namespace-filter');
		if (!select) return;
		
		// Lấy danh sách namespace duy nhất từ ingress
		const namespaces = [...new Set(k8sResourcesData.ingress.map(i => i.namespace).filter(Boolean))].sort();
		
		// Giữ option đầu tiên (Tất cả namespace)
		select.innerHTML = '<option value="">Tất cả namespace</option>';
		
		// Thêm các namespace
		namespaces.forEach(ns => {
			const option = document.createElement('option');
			option.value = ns;
			option.textContent = ns;
			select.appendChild(option);
		});
	}

	// Các hàm hiển thị lỗi
	function showPodsError(msg) {
		const tbody = document.getElementById('pods-tbody');
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">${escapeHtml(msg)}</td></tr>`;
		}
	}

	function showNamespacesError(msg) {
		const tbody = document.getElementById('namespaces-tbody');
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger py-3">${escapeHtml(msg)}</td></tr>`;
		}
	}

	function showWorkloadsError(msg) {
		const tbody = document.getElementById('workloads-tbody');
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">${escapeHtml(msg)}</td></tr>`;
		}
	}

	function showServicesError(msg) {
		const tbody = document.getElementById('services-tbody');
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${escapeHtml(msg)}</td></tr>`;
		}
	}

	function showIngressError(msg) {
		const tbody = document.getElementById('ingress-tbody');
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${escapeHtml(msg)}</td></tr>`;
		}
	}

	function showK8sResourcesOfflineMessage() {
		const msg = '⚠️ MASTER server đang offline. Không thể lấy thông tin Kubernetes resources.';
		showPodsError(msg);
		showNamespacesError(msg);
		showWorkloadsError(msg);
	}

	function showNetworkingOfflineMessage() {
		const msg = '⚠️ MASTER server đang offline. Không thể lấy thông tin Networking resources.';
		showServicesError(msg);
		showIngressError(msg);
	}

	// Các hàm thao tác: Xem chi tiết (Describe)
	async function describePod(namespace, name, format = 'json') {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		try {
			const formatParam = format === 'yaml' ? '?format=yaml' : '';
			const data = await window.ApiClient.get(`/admin/clusters/${currentClusterId}/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${formatParam}`);
			showK8sOutput(`Pod ${namespace}/${name} (${data.format || 'json'})`, data.output || '');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi lấy thông tin pod');
		}
	}

	async function describeNamespace(name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${currentClusterId}/k8s/namespaces/${encodeURIComponent(name)}`);
			showK8sOutput(`Namespace ${name}`, data.output || '');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi lấy thông tin namespace');
		}
	}

	async function describeService(namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${currentClusterId}/k8s/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			showK8sOutput(`Service ${namespace}/${name}`, data.output || '');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi lấy thông tin service');
		}
	}

	async function describeIngress(namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${currentClusterId}/k8s/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			showK8sOutput(`Ingress ${namespace}/${name}`, data.output || '');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi lấy thông tin ingress');
		}
	}

	async function describeWorkload(type, namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		try {
			const data = await window.ApiClient.get(`/admin/clusters/${currentClusterId}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			showK8sOutput(`${type} ${namespace}/${name}`, data.output || '');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi lấy thông tin workload');
		}
	}

	// Các hàm thao tác: Xóa (Delete)
	async function deletePod(namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		if (isSystemNamespace(namespace)) {
			window.showAlert('warning', 'Không cho phép xóa pod trong namespace hệ thống');
			return;
		}
		if (!confirm(`Xóa pod ${namespace}/${name}?`)) return;

		try {
			const data = await window.ApiClient.delete(`/admin/clusters/${currentClusterId}/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `pod "${name}" deleted`)}</pre>`);
			await loadK8sResources(currentClusterId);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi xóa pod');
		}
	}

	async function deleteNamespace(name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		if (isSystemNamespace(name)) {
			window.showAlert('warning', 'Không cho phép xóa namespace hệ thống');
			return;
		}
		if (deletingNamespaces.has(name)) {
			return; // Đang xóa rồi
		}
		if (!confirm(`Xóa namespace "${name}"?\n\nCảnh báo: Tất cả tài nguyên trong namespace này sẽ bị xóa vĩnh viễn!\n\nQuá trình này có thể mất vài phút...`)) {
			return;
		}

		deletingNamespaces.add(name);
		renderNamespaces();
		window.showAlert('info', `Đang xóa namespace "${name}"... Vui lòng đợi (có thể mất vài phút nếu namespace có nhiều tài nguyên).`);

		try {
			const data = await window.ApiClient.delete(`/admin/clusters/${currentClusterId}/k8s/namespaces/${encodeURIComponent(name)}`);
			deletingNamespaces.delete(name);
			window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `namespace "${name}" deleted`)}</pre>`);
			await loadNamespaces(currentClusterId, k8sRequestToken);
			await loadPods(currentClusterId, k8sRequestToken);
			await loadWorkloads(currentClusterId, k8sRequestToken);
			await loadNetworkingResources(currentClusterId);
		} catch (error) {
			deletingNamespaces.delete(name);
			window.showAlert('error', error.message || 'Lỗi xóa namespace');
			renderNamespaces();
		}
	}

	async function deleteService(namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		if (isSystemNamespace(namespace)) {
			window.showAlert('warning', 'Không cho phép xóa Service trong namespace hệ thống');
			return;
		}
		if (!confirm(`Xóa Service ${namespace}/${name}?`)) return;

		try {
			const data = await window.ApiClient.delete(`/admin/clusters/${currentClusterId}/k8s/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `service "${name}" deleted`)}</pre>`);
			await loadNetworkingResources(currentClusterId);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi xóa service');
		}
	}

	async function deleteIngress(namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		if (isSystemNamespace(namespace)) {
			window.showAlert('warning', 'Không cho phép xóa Ingress trong namespace hệ thống');
			return;
		}
		if (!confirm(`Xóa Ingress ${namespace}/${name}?`)) return;

		try {
			const data = await window.ApiClient.delete(`/admin/clusters/${currentClusterId}/k8s/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || `ingress.networking.k8s.io "${name}" deleted`)}</pre>`);
			await loadNetworkingResources(currentClusterId);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi xóa ingress');
		}
	}

	async function deleteWorkload(type, namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		if (isSystemNamespace(namespace)) {
			window.showAlert('warning', 'Không cho phép xóa trong namespace hệ thống');
			return;
		}
		if (!confirm(`Xóa ${type} ${namespace}/${name}?`)) return;

		try {
			const data = await window.ApiClient.delete(`/admin/clusters/${currentClusterId}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`);
			const defaultOutput = type === 'deployment' ? `deployment.apps "${name}" deleted` :
			                      type === 'statefulset' ? `statefulset.apps "${name}" deleted` :
			                      type === 'daemonset' ? `daemonset.apps "${name}" deleted` : `${type} "${name}" deleted`;
			window.showAlert('success', `<pre class="mb-0 font-monospace">${escapeHtml(data.output || defaultOutput)}</pre>`);
			await loadK8sResources(currentClusterId);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi xóa workload');
		}
	}

	// Các hàm thao tác: Scale (thay đổi số replicas)
	async function scaleWorkload(type, namespace, name) {
		if (!currentClusterId) {
			window.showAlert('warning', 'Chưa chọn cluster');
			return;
		}
		if (!canScaleWorkloadType(type) || isSystemNamespace(namespace)) {
			window.showAlert('warning', 'Chỉ hỗ trợ scale Deployment/StatefulSet ngoài namespace hệ thống');
			return;
		}

		// Hiển thị modal scale
		const modalEl = document.getElementById('scale-workload-modal');
		if (!modalEl) {
			// Fallback: dùng prompt nếu modal không tồn tại
			const replicas = prompt(`Số replicas mới cho ${type} ${namespace}/${name}:`);
			if (replicas === null) return;
			const replicasNum = Number(replicas);
			if (!Number.isFinite(replicasNum) || replicasNum < 0) {
				window.showAlert('error', 'Giá trị replicas không hợp lệ');
				return;
			}
			await performScale(type, namespace, name, replicasNum);
			return;
		}

		// Cập nhật thông tin trong modal
		document.getElementById('scale-workload-name').textContent = `${namespace}/${name}`;
		document.getElementById('scale-workload-type').textContent = type;
		document.getElementById('scale-workload-namespace').textContent = namespace;
		const replicasInput = document.getElementById('scale-replicas-input');
		if (replicasInput) {
			replicasInput.value = '1';
			replicasInput.focus();
		}

		// Xóa event listener cũ (nếu có) và thêm mới
		const confirmBtn = document.getElementById('scale-workload-confirm-btn');
		if (confirmBtn) {
			// Clone và replace để xóa event listeners cũ
			const newConfirmBtn = confirmBtn.cloneNode(true);
			confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
			
			newConfirmBtn.addEventListener('click', async () => {
				const replicas = replicasInput.value;
				const replicasNum = Number(replicas);
				if (!Number.isFinite(replicasNum) || replicasNum < 0) {
					window.showAlert('error', 'Giá trị replicas không hợp lệ. Vui lòng nhập số >= 0');
					return;
				}

				// Disable button trong khi xử lý
				newConfirmBtn.disabled = true;
				newConfirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang xử lý...';

				try {
					await performScale(type, namespace, name, replicasNum);
					// Đóng modal
					if (window.Modal) {
						window.Modal.hide('scale-workload-modal');
					} else {
						const modal = bootstrap.Modal.getInstance(modalEl);
						if (modal) modal.hide();
					}
				} catch (error) {
					// Error đã được xử lý trong performScale
				} finally {
					newConfirmBtn.disabled = false;
					newConfirmBtn.innerHTML = '<i class="bi bi-check-circle"></i> Xác nhận Scale';
				}
			});
		}

		// Hiển thị modal
		if (window.Modal) {
			window.Modal.show('scale-workload-modal');
		} else {
			const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
				backdrop: true,
				keyboard: true,
				focus: true
			});
			modal.show();
		}
	}

	// Hàm thực hiện scale
	async function performScale(type, namespace, name, replicasNum) {
		try {
			const data = await window.ApiClient.post(`/admin/clusters/${currentClusterId}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, {
				replicas: replicasNum
			});
			window.showAlert('success', `Đã scale ${type} ${namespace}/${name} → ${replicasNum} replicas`);
			await loadK8sResources(currentClusterId);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi scale workload');
			throw error;
		}
	}

	// Hàm hỗ trợ: Hiển thị output K8s trong modal
	function showK8sOutput(title, output) {
		const modalEl = document.getElementById('k8s-output-modal');
		if (!modalEl) {
			// Fallback: dùng alert nếu modal không tồn tại
			window.showAlert('info', `<strong>${escapeHtml(title)}</strong><hr><pre class="small mb-0">${escapeHtml(output)}</pre>`);
			return;
		}

		// Cập nhật title và content
		const titleEl = document.getElementById('k8s-output-title');
		if (titleEl) {
			titleEl.textContent = title;
		}
		const contentEl = document.getElementById('k8s-output-content');
		if (contentEl) {
			contentEl.textContent = output;
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
						window.showAlert('success', 'Đã sao chép vào clipboard');
					}).catch(err => {
						console.error('Failed to copy:', err);
						window.showAlert('error', 'Không thể sao chép');
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
						window.showAlert('success', 'Đã sao chép vào clipboard');
					} catch (err) {
						window.showAlert('error', 'Không thể sao chép');
					}
					document.body.removeChild(textarea);
				}
			});
		}

		// Hiển thị modal
		if (window.Modal) {
			window.Modal.show('k8s-output-modal');
		} else {
			const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
				backdrop: true,
				keyboard: true,
				focus: true
			});
			modal.show();
		}
	}

	// Export module để sử dụng từ bên ngoài
	window.K8sResourcesModule = {
		loadK8sResources,
		loadPods,
		loadNamespaces,
		loadWorkloads,
		loadNetworkingResources,
		describePod,
		describeNamespace,
		describeService,
		describeIngress,
		describeWorkload,
		deletePod,
		deleteNamespace,
		deleteService,
		deleteIngress,
		deleteWorkload,
		scaleWorkload,
		setCurrentClusterId: (id) => { currentClusterId = id; },
		getCurrentClusterId: () => currentClusterId,
		getResourcesData: () => ({ ...k8sResourcesData })
	};

	// Tương thích ngược: expose các hàm global
	window.loadK8sResources = (clusterId) => window.K8sResourcesModule.loadK8sResources(clusterId);
	window.loadNetworkingResources = (clusterId) => window.K8sResourcesModule.loadNetworkingResources(clusterId);
	window.describePod = (namespace, name, format) => window.K8sResourcesModule.describePod(namespace, name, format);
	window.deletePod = (namespace, name) => window.K8sResourcesModule.deletePod(namespace, name);
	window.describeNamespace = (name) => window.K8sResourcesModule.describeNamespace(name);
	window.deleteNamespace = (name) => window.K8sResourcesModule.deleteNamespace(name);
	window.describeService = (namespace, name) => window.K8sResourcesModule.describeService(namespace, name);
	window.deleteService = (namespace, name) => window.K8sResourcesModule.deleteService(namespace, name);
	window.describeIngress = (namespace, name) => window.K8sResourcesModule.describeIngress(namespace, name);
	window.deleteIngress = (namespace, name) => window.K8sResourcesModule.deleteIngress(namespace, name);
	window.describeWorkload = (type, namespace, name) => window.K8sResourcesModule.describeWorkload(type, namespace, name);
	window.deleteWorkload = (type, namespace, name) => window.K8sResourcesModule.deleteWorkload(type, namespace, name);
	window.scaleWorkload = (type, namespace, name) => window.K8sResourcesModule.scaleWorkload(type, namespace, name);
})();

