// Ansible Config Module - Quản lý cấu hình Ansible (ansible.cfg, hosts, group_vars/all.yml)
(function () {
	'use strict';

	// Trạng thái module
	let ansibleStatusRequestToken = 0; // Token để track request hiện tại, tránh race condition

	// Helper: Get escapeHtml function
	function getEscapeHtml() {
		return window.K8sHelpers?.escapeHtml || ((text) => {
			if (text == null) return '';
			const div = document.createElement('div');
			div.textContent = String(text);
			return div.innerHTML;
		});
	}

	// Đọc cấu hình Ansible
	async function readAnsibleConfig() {
		// API backend không cần clusterId (single cluster architecture)

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(readAnsibleConfig()), 100);
			});
		}

		try {
			const data = await window.ApiClient.get('/api/ansible-config/read');
			return data;
		} catch (error) {
			console.error('Error reading Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi đọc cấu hình' };
		}
	}

	// Lưu cấu hình Ansible
	async function saveAnsibleConfig(cfg, hosts, vars, sudoPassword = '') {
		// API backend không cần clusterId (single cluster architecture)

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(saveAnsibleConfig(cfg, hosts, vars, sudoPassword)), 100);
			});
		}

		// Validation: cfg và hosts không được rỗng
		if (!cfg || !cfg.trim() || !hosts || !hosts.trim()) {
			return { success: false, error: 'Vui lòng nhập đầy đủ nội dung cho ansible.cfg và hosts inventory' };
		}

		try {
			// Sử dụng FormData cho multipart/form-data
			const formData = new FormData();
			formData.append('sudoPassword', sudoPassword || '');
			formData.append('cfg', cfg.trim());
			formData.append('hosts', hosts.trim());
			formData.append('vars', (vars || '').trim());

			// ApiClient không hỗ trợ FormData trực tiếp, nên dùng fetch
			const response = await fetch('/api/ansible-config/save', {
				method: 'POST',
				body: formData
			});

			const data = await response.json();
			return data;
		} catch (error) {
			console.error('Error saving Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi lưu cấu hình' };
		}
	}

	// Kiểm tra (verify) cấu hình Ansible
	async function verifyAnsibleConfig() {
		// API backend không cần clusterId (single cluster architecture)

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(verifyAnsibleConfig()), 100);
			});
		}

		try {
			const data = await window.ApiClient.post('/api/ansible-config/verify', {});
			return data;
		} catch (error) {
			console.error('Error verifying Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi kiểm tra cấu hình' };
		}
	}

	// Rollback cấu hình Ansible
	async function rollbackAnsibleConfig() {
		// API backend không cần clusterId (single cluster architecture)

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(rollbackAnsibleConfig()), 100);
			});
		}

		try {
			const data = await window.ApiClient.post('/api/ansible-config/rollback', {});
			return data;
		} catch (error) {
			console.error('Error rolling back Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi rollback cấu hình' };
		}
	}

	// Kiểm tra sudo NOPASSWD
	async function checkSudoNopasswd(host = null) {
		// API backend không cần clusterId (single cluster architecture)

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(checkSudoNopasswd(host)), 100);
			});
		}

		try {
			const url = host 
				? `/api/ansible-config/check-sudo?host=${encodeURIComponent(host)}`
				: '/api/ansible-config/check-sudo';
			const data = await window.ApiClient.get(url);
			return data;
		} catch (error) {
			console.error('Error checking sudo NOPASSWD:', error);
			return { success: false, hasNopasswd: false, error: error.message || 'Lỗi kiểm tra sudo' };
		}
	}

	// Kiểm tra trạng thái Ansible
	// Sử dụng clusterStatus = "AVAILABLE" để xác định cluster thay vì clusterId
	async function checkAnsibleStatus() {
		// Tăng token để đánh dấu request mới (hủy request cũ nếu có)
		ansibleStatusRequestToken++;

		const checkBtn = document.getElementById('cd-check-ansible');
		const statusDisplay = document.getElementById('ansible-status-display');
		const statusTable = document.getElementById('ansible-status-table');

		// Lưu token hiện tại để kiểm tra trong finally
		const requestToken = ansibleStatusRequestToken;

		try {
			if (checkBtn) {
				checkBtn.disabled = true;
				checkBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang kiểm tra...';
			}

			// Lấy thông tin cluster detail để có master node (sử dụng clusterStatus = "AVAILABLE" để xác định cluster)
			let clusterDetail = null;
			let masterNode = null;
			try {
				clusterDetail = await window.ApiClient.get('/admin/cluster/api');
				if (clusterDetail) {
					masterNode = clusterDetail.masterNode || null;
				}
			} catch (err) {
				throw err; // Re-throw để xử lý ở catch block
			}

			// Gọi API kiểm tra trạng thái Ansible (sử dụng clusterStatus = "AVAILABLE" để xác định cluster)
			const ansibleStatus = await window.ApiClient.get('/admin/cluster/ansible-status');
			
			// Kiểm tra nếu request này đã bị hủy bởi request mới hơn
			if (requestToken !== ansibleStatusRequestToken) {
				return; // Bỏ qua response này vì đã có request mới hơn
			}
			
			// Xác định controller node từ nhiều nguồn (ưu tiên ANSIBLE, sau đó MASTER)
			let controllerHost = null;
			let controllerRole = null;
			
			// 1. Từ ansibleStatus.ansibleStatus map - ưu tiên tìm ANSIBLE role trước
			if (ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
				const entries = Object.entries(ansibleStatus.ansibleStatus);
				// Tìm ANSIBLE role trước
				for (const [host, status] of entries) {
					if (status && status.role === 'ANSIBLE') {
						controllerHost = host;
						controllerRole = 'ANSIBLE';
						break;
					}
				}
				// Nếu không có ANSIBLE, tìm MASTER
				if (!controllerHost) {
					for (const [host, status] of entries) {
						if (status && status.role === 'MASTER') {
							controllerHost = host;
							controllerRole = 'MASTER';
							break;
						}
					}
				}
			}
			
			// 2. Từ clusterDetail.masterNode (fallback nếu không tìm thấy từ ansibleStatus)
			if (!controllerHost && masterNode && masterNode !== '' && masterNode !== '-') {
				controllerHost = masterNode;
				// Kiểm tra role từ ansibleStatus nếu có
				if (ansibleStatus.ansibleStatus && ansibleStatus.ansibleStatus[masterNode]) {
					const status = ansibleStatus.ansibleStatus[masterNode];
					controllerRole = status.role || 'MASTER';
				} else {
					controllerRole = 'MASTER'; // Default
				}
			}
			
			// 3. Từ ansibleStatus.masterInfo hoặc serverInfo (fallback cuối cùng)
			if (!controllerHost) {
				controllerHost = ansibleStatus.masterInfo || ansibleStatus.serverInfo || null;
				controllerRole = 'MASTER'; // Default
			}

			// Lưu controllerHost vào ansibleStatus để sử dụng sau
			if (controllerHost) {
				ansibleStatus.masterInfo = controllerHost;
				ansibleStatus.masterHost = controllerHost; // Giữ tên cũ để tương thích
				ansibleStatus.controllerHost = controllerHost; // Tên mới
				ansibleStatus.controllerRole = controllerRole || 'MASTER';
			}

			// Hiển thị thông tin đang kiểm tra controller node (nếu có)
			if (statusDisplay && controllerHost) {
				const roleDisplay = controllerRole === 'ANSIBLE' ? 'ANSIBLE Controller' : 'MASTER Controller';
				const escapeHtml = getEscapeHtml();
				statusDisplay.innerHTML = `
					<div class="alert alert-info">
						<i class="bi bi-info-circle"></i> Đang kiểm tra trạng thái Ansible trên ${roleDisplay}: <strong>${escapeHtml(controllerHost)}</strong>
					</div>
				`;
				statusDisplay.classList.remove('d-none');
			}

			// Kiểm tra lại token trước khi update UI (tránh update với dữ liệu cũ)
			if (requestToken !== ansibleStatusRequestToken) {
				return; // Bỏ qua update vì đã có request mới hơn
			}

			// Update summary badges
			updateAnsibleSummary(ansibleStatus);

		} catch (error) {
			// Kiểm tra nếu request này đã bị hủy bởi request mới hơn
			if (requestToken !== ansibleStatusRequestToken) {
				return; // Bỏ qua error này vì đã có request mới hơn
			}

			// Hiển thị lỗi chi tiết hơn
			let errorMessage = error.message || 'Không thể kiểm tra trạng thái Ansible';
			let alertType = 'danger';
			let iconClass = 'bi-exclamation-triangle';

			// Kiểm tra nếu error có response data
			if (error.error) {
				errorMessage = error.error;
			}

			if (errorMessage.includes('Cluster không có servers nào')) {
				errorMessage = 'Cluster này chưa có máy chủ nào. Vui lòng thêm máy chủ vào cluster trước khi kiểm tra Ansible.';
				alertType = 'warning';
				iconClass = 'bi-server';
			} else if (errorMessage.includes('Yêu cầu không hợp lệ') || errorMessage.includes('xác thực')) {
				errorMessage = 'Không có thông tin xác thực. Vui lòng kết nối lại các server trước khi kiểm tra Ansible.';
			} else if (errorMessage.includes('Không có session') || errorMessage.includes('đăng nhập')) {
				errorMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
			} else if (errorMessage.includes('Không tìm thấy') || errorMessage.includes('offline')) {
				errorMessage = 'Controller server (ANSIBLE hoặc MASTER) đang offline. Vui lòng kiểm tra kết nối máy chủ trước khi kiểm tra Ansible.';
				alertType = 'warning';
				iconClass = 'bi-server';
			}

			if (statusDisplay) {
				const escapeHtml = getEscapeHtml();
				statusDisplay.innerHTML = `
					<div class="alert alert-${alertType}">
						<i class="bi ${iconClass}"></i> ${escapeHtml(errorMessage)}
						<br><small class="text-muted">Vui lòng đảm bảo cluster có máy chủ và các server đã được kết nối.</small>
					</div>
				`;
				statusDisplay.classList.remove('d-none');
			}

			// Hide table (if exists) on error and reset summary
			if (statusTable) statusTable.classList.add('d-none');
			setAnsibleSummaryBadges({ state: 'unknown' });

		} finally {
			// Chỉ reset button nếu request này vẫn là request hiện tại
			if (requestToken === ansibleStatusRequestToken) {
				if (checkBtn) {
					checkBtn.disabled = false;
					checkBtn.innerHTML = '<i class="bi bi-search"></i> Kiểm tra trạng thái';
				}
			}
		}
	}

	// Update Ansible summary badges
	function updateAnsibleSummary(ansibleStatus) {
		const statusDisplay = document.getElementById('ansible-status-display');
		const badgeInstall = document.getElementById('ansible-summary-install');
		const badgeVersion = document.getElementById('ansible-summary-version');
		const badgeMaster = document.getElementById('ansible-summary-master');
		const actions = document.getElementById('ansible-summary-actions');

		if (!badgeInstall || !badgeVersion || !badgeMaster) return;
		if (actions) actions.innerHTML = '';

		// Defaults
		setAnsibleSummaryBadges({ state: 'unknown' });
		if (statusDisplay) statusDisplay.classList.add('d-none');

		if (!ansibleStatus) {
			setAnsibleSummaryBadges({ state: 'error', message: 'Không nhận được phản hồi từ server.' });
			return;
		}

		// Xử lý controller offline case
		if (ansibleStatus.masterOffline === true) {
			const controllerHost = ansibleStatus.controllerHost || ansibleStatus.masterHost || 'Controller';
			const controllerRole = ansibleStatus.controllerRole || 'MASTER';
			const roleDisplay = controllerRole === 'ANSIBLE' ? 'ANSIBLE Controller' : 'MASTER Controller';
			setAnsibleSummaryBadges({
				state: 'offline',
				master: controllerHost,
				message: `${roleDisplay} offline`
			});
			if (actions) {
				actions.innerHTML = `
					<div class="btn-group btn-group-sm">
						<button class="btn btn-outline-secondary" disabled title="${roleDisplay} offline">Cài đặt</button>
					</div>
				`;
			}
			if (statusDisplay) {
				const escapeHtml = getEscapeHtml();
				statusDisplay.innerHTML = `
					<div class="alert alert-warning"><i class="bi bi-server"></i> ${roleDisplay} (${escapeHtml(controllerHost)}) đang offline.</div>
				`;
				statusDisplay.classList.remove('d-none');
			}
			return;
		}

		// Xử lý empty map case (tương tự admin.js)
		const map = ansibleStatus.ansibleStatus || {};
		const entries = Object.entries(map);
		if (entries.length === 0) {
			setAnsibleSummaryBadges({
				state: 'empty',
				message: escapeHtml(ansibleStatus.recommendation || 'Không tìm thấy thông tin Ansible.')
			});
			return;
		}

		// Find controller entry từ map (ưu tiên ANSIBLE, sau đó MASTER)
		let controllerHost = '-';
		let controllerRole = null;
		let controllerInstalled = false;
		let controllerVersion = '-';
		
		// Tìm ANSIBLE role trước
		for (const [host, st] of entries) {
			if (st && st.role === 'ANSIBLE') {
				controllerHost = host;
				controllerRole = 'ANSIBLE';
				controllerInstalled = !!st.installed;
				controllerVersion = st.installed ? (st.version || '-') : '-';
				break;
			}
		}
		
		// Nếu không có ANSIBLE, tìm MASTER
		if (!controllerHost || controllerHost === '-') {
			for (const [host, st] of entries) {
				if (st && st.role === 'MASTER') {
					controllerHost = host;
					controllerRole = 'MASTER';
					controllerInstalled = !!st.installed;
					controllerVersion = st.installed ? (st.version || '-') : '-';
					break;
				}
			}
		}

		// Ưu tiên sử dụng controllerHost đã được xác định trong checkAnsibleStatus (nếu có)
		if (ansibleStatus.controllerHost && ansibleStatus.controllerHost !== '-' && ansibleStatus.controllerHost !== '') {
			controllerHost = ansibleStatus.controllerHost;
			controllerRole = ansibleStatus.controllerRole || 'MASTER';
			// Lấy thông tin từ map nếu có
			if (map[controllerHost]) {
				const st = map[controllerHost];
				controllerInstalled = !!st.installed;
				controllerVersion = st.installed ? (st.version || '-') : '-';
			}
		} else if (ansibleStatus.masterHost && ansibleStatus.masterHost !== '-' && ansibleStatus.masterHost !== '') {
			// Fallback cho tương thích ngược
			controllerHost = ansibleStatus.masterHost;
			controllerRole = ansibleStatus.controllerRole || 'MASTER';
			if (map[controllerHost]) {
				const st = map[controllerHost];
				controllerInstalled = !!st.installed;
				controllerVersion = st.installed ? (st.version || '-') : '-';
			}
		}

		// Update badges sử dụng setAnsibleSummaryBadges
		setAnsibleSummaryBadges({
			state: controllerInstalled ? 'installed' : 'not_installed',
			version: controllerVersion,
			master: controllerHost,
			role: controllerRole
		});

		// Render quick actions for install/reinstall
		if (actions) {
			if (controllerHost && controllerHost !== '-') {
				const roleDisplay = controllerRole === 'ANSIBLE' ? 'ANSIBLE Controller' : 'MASTER Controller';
				if (controllerInstalled) {
					actions.innerHTML = `
						<div class="btn-group btn-group-sm" role="group">
							<button class="btn btn-outline-warning" title="Cài đặt lại Ansible trên ${roleDisplay}" id="btn-reinstall-ansible">
								<i class="bi bi-arrow-repeat"></i> Cài đặt lại
							</button>
							<button class="btn btn-outline-danger" title="Gỡ Ansible khỏi ${roleDisplay}" id="btn-uninstall-ansible">
								<i class="bi bi-trash"></i> Gỡ cài đặt
							</button>
						</div>
					`;
					
					// Bind event handlers
					const reinstallBtn = document.getElementById('btn-reinstall-ansible');
					const uninstallBtn = document.getElementById('btn-uninstall-ansible');
					if (reinstallBtn) {
						reinstallBtn.addEventListener('click', () => reinstallAnsibleOnServer(controllerHost));
					}
					if (uninstallBtn) {
						uninstallBtn.addEventListener('click', () => uninstallAnsibleOnServer(controllerHost));
					}
				} else {
					actions.innerHTML = `
						<div class="btn-group btn-group-sm" role="group">
							<button class="btn btn-outline-primary" title="Cài đặt Ansible trên ${roleDisplay}" id="btn-install-ansible">
								<i class="bi bi-download"></i> Cài đặt
							</button>
						</div>
					`;
					
					// Bind event handler
					const installBtn = document.getElementById('btn-install-ansible');
					if (installBtn) {
						installBtn.addEventListener('click', () => installAnsibleOnServer(controllerHost));
					}
				}
			}
		}
	}

	// Set Ansible summary badges to default/unknown state
	function setAnsibleSummaryBadges({ state, version, master, role, message } = {}) {
		const badgeInstall = document.getElementById('ansible-summary-install');
		const badgeVersion = document.getElementById('ansible-summary-version');
		const badgeMaster = document.getElementById('ansible-summary-master');
		if (!badgeInstall || !badgeVersion || !badgeMaster) return;

		switch (state) {
			case 'installed':
				badgeInstall.className = 'badge bg-success';
				badgeInstall.innerHTML = '<i class="bi bi-check-circle"></i> Đã cài đặt';
				break;
			case 'not_installed':
				badgeInstall.className = 'badge bg-danger';
				badgeInstall.innerHTML = '<i class="bi bi-x-circle"></i> Chưa cài đặt';
				break;
			case 'offline':
				badgeInstall.className = 'badge bg-warning text-dark';
				const offlineRole = role === 'ANSIBLE' ? 'ANSIBLE Controller' : 'MASTER Controller';
				badgeInstall.innerHTML = `<i class="bi bi-wifi-off"></i> ${offlineRole} offline`;
				break;
			case 'error':
				badgeInstall.className = 'badge bg-danger';
				badgeInstall.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Lỗi${message ? `: ${escapeHtml(message)}` : ''}`;
				break;
			case 'empty':
				badgeInstall.className = 'badge bg-secondary';
				const escapeHtml = getEscapeHtml();
				badgeInstall.innerHTML = `<i class="bi bi-info-circle"></i> ${escapeHtml(message || 'Không có dữ liệu')}`;
				break;
			default:
				badgeInstall.className = 'badge bg-secondary';
				badgeInstall.textContent = 'Chưa kiểm tra';
		}

		badgeVersion.textContent = `Phiên bản: ${escapeHtml(version || '-')}`;
		const roleDisplay = role === 'ANSIBLE' ? 'ANSIBLE' : (role === 'MASTER' ? 'MASTER' : 'Controller');
		badgeMaster.textContent = `Controller: ${escapeHtml(master || '-')}${role ? ` (${roleDisplay})` : ''}`;
	}

	// Hiển thị modal cài đặt Ansible cho server
	async function showAnsibleInstallModalForServer(targetHost, isReinstall, isUninstall = false) {
		if (!targetHost) {
			window.showAlert('error', 'Server host là bắt buộc');
			return;
		}
		
		try {
			// Lấy thông tin cluster (sử dụng clusterStatus = "AVAILABLE" để xác định cluster)
			const clusterDetail = await window.ApiClient.get('/admin/cluster/api');

			// Tìm server cần cài đặt trong cluster nodes trước
			let targetServer = clusterDetail.nodes?.find(node => node.ip === targetHost);
			
			// Nếu không tìm thấy trong cluster nodes, có thể là ANSIBLE server
			// Tạo object server từ thông tin đã có (từ ansibleStatus hoặc từ badge)
			if (!targetServer) {
				let role = 'MASTER'; // Default
				let status = 'ONLINE'; // Default
				
				// Thử lấy thông tin từ ansibleStatus nếu có (từ checkAnsibleStatus)
				try {
					// Kiểm tra xem có ansibleStatus trong window hoặc từ ansibleStatus response
					const ansibleStatusResponse = await window.ApiClient.get('/admin/cluster/ansible-status');
					if (ansibleStatusResponse && ansibleStatusResponse.ansibleStatus) {
						const serverStatus = ansibleStatusResponse.ansibleStatus[targetHost];
						if (serverStatus) {
							role = serverStatus.role || role;
							status = serverStatus.installed ? 'ONLINE' : 'OFFLINE';
						}
					}
				} catch (e) {
					// Nếu không lấy được từ API, fallback về badge
					const badgeMaster = document.getElementById('ansible-summary-master');
					if (badgeMaster && badgeMaster.textContent) {
						const badgeText = badgeMaster.textContent;
						if (badgeText.includes('ANSIBLE')) {
							role = 'ANSIBLE';
						} else if (badgeText.includes('MASTER')) {
							role = 'MASTER';
						}
					}
				}
				
				// Tạo object server giả định từ thông tin đã có
				targetServer = {
					ip: targetHost,
					host: targetHost,
					role: role,
					status: status,
					id: null, // Không có ID vì không tìm thấy trong cluster
					port: 22,
					username: 'root' // Default
				};
				
				console.log(`Không tìm thấy server ${targetHost} trong cluster nodes, sử dụng thông tin giả định với role: ${role}`);
			}

			// Kiểm tra sudo NOPASSWD cho server này
			const sudoInputsContainer = document.getElementById('sudo-password-inputs');
			if (!sudoInputsContainer) {
				window.showAlert('error', 'Không tìm thấy modal ansibleInstallModal. Vui lòng tải lại trang.');
				return;
			}
			sudoInputsContainer.innerHTML = '';

			let needsPassword = true;
			let statusMessage = '';

			try {
				const sudoCheckData = await window.AnsibleConfigModule.checkSudoNopasswd(targetHost);
				if (sudoCheckData && sudoCheckData.success && sudoCheckData.hasNopasswd) {
					needsPassword = false;
					statusMessage = '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Sudo NOPASSWD</span>';
				} else {
					statusMessage = '<span class="badge bg-warning"><i class="bi bi-exclamation-triangle"></i> Cần mật khẩu sudo</span>';
				}
			} catch (error) {
				statusMessage = '<span class="badge bg-secondary"><i class="bi bi-question-circle"></i> Không kiểm tra được</span>';
			}

			const colDiv = document.createElement('div');
			colDiv.className = 'col-12 mb-3';
			colDiv.innerHTML = `
				<div class="card">
					<div class="card-body">
						<h6 class="card-title">${targetServer.ip} <span class="badge bg-${targetServer.role === 'MASTER' ? 'primary' : 'secondary'}">${targetServer.role}</span> ${statusMessage}</h6>
						${needsPassword ? `
							<input type="password" class="form-control sudo-password-input" 
								   data-host="${targetServer.ip}" placeholder="Nhập mật khẩu sudo cho ${targetServer.role}">
						` : `
							<div class="form-control-plaintext text-success">
								<i class="bi bi-check-circle"></i> Không cần mật khẩu sudo (sudo NOPASSWD)
							</div>
						`}
					</div>
				</div>
			`;
			sudoInputsContainer.appendChild(colDiv);

			// Update modal title
			const modalTitle = document.querySelector('#ansibleInstallModal .modal-title');
			if (modalTitle) {
				if (isUninstall) {
					modalTitle.innerHTML = `<i class="bi bi-trash"></i> Gỡ cài đặt Ansible - ${targetHost}`;
				} else {
					modalTitle.innerHTML = `<i class="bi bi-download"></i> ${isReinstall ? 'Cài đặt lại' : 'Cài đặt'} Ansible - ${targetHost}`;
				}
			}

			// Cập nhật nút bắt đầu
			const startBtn = document.getElementById('start-ansible-install-btn');
			if (startBtn) {
				if (isUninstall) {
					startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Bắt đầu gỡ cài đặt';
				} else if (isReinstall) {
					startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Bắt đầu cài đặt lại';
				} else {
					startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Bắt đầu cài đặt';
				}
			}

			// Reset modal state
			const sudoSection = document.getElementById('sudo-password-section');
			const outputSection = document.getElementById('ansible-output-section');
			const completeBtn = document.getElementById('ansible-complete-btn');
			
			if (sudoSection) sudoSection.classList.remove('d-none');
			if (outputSection) outputSection.classList.add('d-none');
			if (completeBtn) completeBtn.classList.add('d-none');

			// Clear console
			const consoleEl = document.getElementById('ansible-output-console');
			if (consoleEl) consoleEl.innerHTML = '';

			// Store target server info
			window.currentTargetServer = targetServer;
			window.isReinstallMode = isReinstall;
			window.isUninstallMode = isUninstall;

			// Show modal
			const modalElement = document.getElementById('ansibleInstallModal');
			if (!modalElement) {
				window.showAlert('error', 'Không tìm thấy modal ansibleInstallModal. Vui lòng tải lại trang.');
				return;
			}

			if (window.Modal) {
				window.Modal.show('ansibleInstallModal');
			} else {
				const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
				modal.show();
			}

		} catch (error) {
			console.error('Error showing Ansible install modal:', error);
			window.showAlert('error', 'Lỗi khi mở modal cài đặt: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Cài đặt Ansible trên server
	async function installAnsibleOnServer(serverHost) {
		await showAnsibleInstallModalForServer(serverHost, false, false);
	}

	// Cài đặt lại Ansible trên server
	async function reinstallAnsibleOnServer(serverHost) {
		await showAnsibleInstallModalForServer(serverHost, true, false);
	}

	// Gỡ cài đặt Ansible trên server
	async function uninstallAnsibleOnServer(serverHost) {
		await showAnsibleInstallModalForServer(serverHost, false, true);
	}

	// Export module để sử dụng từ bên ngoài
	window.AnsibleConfigModule = {
		readAnsibleConfig,
		saveAnsibleConfig,
		verifyAnsibleConfig,
		rollbackAnsibleConfig,
		checkSudoNopasswd,
		checkAnsibleStatus,
		updateAnsibleSummary,
		setAnsibleSummaryBadges,
		installAnsibleOnServer,
		reinstallAnsibleOnServer,
		uninstallAnsibleOnServer
	};

	// Tương thích ngược: expose các hàm global
	window.readAnsibleConfig = () => window.AnsibleConfigModule.readAnsibleConfig();
	window.saveAnsibleConfig = (cfg, hosts, vars, sudoPassword) => 
		window.AnsibleConfigModule.saveAnsibleConfig(cfg, hosts, vars, sudoPassword);
	window.verifyAnsibleConfig = () => window.AnsibleConfigModule.verifyAnsibleConfig();
	window.rollbackAnsibleConfig = () => window.AnsibleConfigModule.rollbackAnsibleConfig();
	window.checkSudoNopasswd = (host) => window.AnsibleConfigModule.checkSudoNopasswd(host);
	window.checkAnsibleStatus = () => window.AnsibleConfigModule.checkAnsibleStatus();
	window.updateAnsibleSummary = (status) => window.AnsibleConfigModule.updateAnsibleSummary(status);
	window.setAnsibleSummaryBadges = (status) => window.AnsibleConfigModule.setAnsibleSummaryBadges(status);
	window.installAnsibleOnServer = (serverHost) => window.AnsibleConfigModule.installAnsibleOnServer(serverHost);
	window.reinstallAnsibleOnServer = (serverHost) => window.AnsibleConfigModule.reinstallAnsibleOnServer(serverHost);
	window.uninstallAnsibleOnServer = (serverHost) => window.AnsibleConfigModule.uninstallAnsibleOnServer(serverHost);

	// Bind event handlers cho Ansible init buttons
	function bindAnsibleInitButtons() {
		// Helper: Append log to console
		function appendInitLog(line) {
			const consoleEl = document.getElementById('init-ansible-console');
			if (!consoleEl) return;
			const ts = new Date().toLocaleTimeString('vi-VN');
			const div = document.createElement('div');
			div.textContent = `[${ts}] ${line}`;
			consoleEl.appendChild(div);
			consoleEl.scrollTop = consoleEl.scrollHeight;
		}

		function appendInitLogBlock(text) {
			const consoleEl = document.getElementById('init-ansible-console');
			if (!consoleEl) return;
			const pre = document.createElement('pre');
			pre.className = 'm-0';
			pre.style.whiteSpace = 'pre-wrap';
			pre.textContent = text;
			consoleEl.appendChild(pre);
			consoleEl.scrollTop = consoleEl.scrollHeight;
		}

		// Clear console button
		const clearBtn = document.getElementById('init-output-clear-btn');
		if (clearBtn && !clearBtn.dataset.bound) {
			clearBtn.dataset.bound = '1';
			clearBtn.addEventListener('click', () => {
				const consoleEl = document.getElementById('init-ansible-console');
				if (consoleEl) {
					consoleEl.innerHTML = '';
				}
			});
		}

		// Init Structure button
		const initStructureBtn = document.getElementById('init-structure-btn');
		if (initStructureBtn && !initStructureBtn.dataset.bound) {
			initStructureBtn.dataset.bound = '1';
			initStructureBtn.addEventListener('click', async () => {
				appendInitLog('📁 Bắt đầu tạo cấu trúc thư mục Ansible...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_structure', {
						onLog: appendInitLog,
						onLogBlock: appendInitLogBlock
					});
				} else {
					appendInitLog('❌ AnsibleWebSocketModule chưa sẵn sàng');
				}
			});
		}

		// Init Config button
		const initConfigBtn = document.getElementById('init-config-btn');
		if (initConfigBtn && !initConfigBtn.dataset.bound) {
			initConfigBtn.dataset.bound = '1';
			initConfigBtn.addEventListener('click', async () => {
				appendInitLog('📝 Bắt đầu ghi cấu hình mặc định (ansible.cfg và hosts)...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_config', {
						onLog: appendInitLog,
						onLogBlock: appendInitLogBlock
					});
				} else {
					appendInitLog('❌ AnsibleWebSocketModule chưa sẵn sàng');
				}
			});
		}

		// Init SSH Key button
		const initSshKeyBtn = document.getElementById('init-sshkey-btn');
		if (initSshKeyBtn && !initSshKeyBtn.dataset.bound) {
			initSshKeyBtn.dataset.bound = '1';
			initSshKeyBtn.addEventListener('click', async () => {
				appendInitLog('🔑 Bắt đầu tạo và phân phối SSH key từ controller...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_sshkey', {
						onLog: appendInitLog,
						onLogBlock: appendInitLogBlock
					});
				} else {
					appendInitLog('❌ AnsibleWebSocketModule chưa sẵn sàng');
				}
			});
		}

		// Init Ping button
		const initPingBtn = document.getElementById('init-ping-btn');
		if (initPingBtn && !initPingBtn.dataset.bound) {
			initPingBtn.dataset.bound = '1';
			initPingBtn.addEventListener('click', async () => {
				appendInitLog('📡 Bắt đầu ping các nodes...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_ping', {
						onLog: appendInitLog,
						onLogBlock: appendInitLogBlock,
						needSudo: false
					});
				} else {
					appendInitLog('❌ AnsibleWebSocketModule chưa sẵn sàng');
				}
			});
		}

		// Init All button (chạy tất cả 4 bước)
		const initAllBtn = document.getElementById('init-all-btn');
		if (initAllBtn && !initAllBtn.dataset.bound) {
			initAllBtn.dataset.bound = '1';
			initAllBtn.addEventListener('click', async () => {
				appendInitLog('⚡ Bắt đầu khởi tạo Ansible (tất cả 4 bước)...');
				if (window.AnsibleWebSocketModule) {
					// Chạy lần lượt 4 bước
					const steps = [
						{ action: 'init_structure', name: 'Tạo cấu trúc' },
						{ action: 'init_config', name: 'Ghi cấu hình' },
						{ action: 'init_sshkey', name: 'SSH key' },
						{ action: 'init_ping', name: 'Ping nodes', needSudo: false }
					];

					for (let i = 0; i < steps.length; i++) {
						const step = steps[i];
						appendInitLog(`\n━━━ Bước ${i + 1}/4: ${step.name} ━━━`);
						await new Promise((resolve) => {
							let completed = false;
							window.AnsibleWebSocketModule.runInitActionWS(step.action, {
								onLog: (line) => {
									appendInitLog(line);
									// Kiểm tra nếu có thông báo hoàn thành
									if (line.includes('✅') || line.includes('thành công') || line.includes('OK')) {
										if (!completed) {
											completed = true;
											setTimeout(resolve, 500); // Đợi 500ms trước khi chuyển bước tiếp theo
										}
									}
								},
								onLogBlock: appendInitLogBlock,
								needSudo: step.needSudo !== false
							});
							// Timeout sau 30 giây nếu chưa hoàn thành
							setTimeout(() => {
								if (!completed) {
									completed = true;
									appendInitLog('⚠️ Timeout, chuyển sang bước tiếp theo...');
									resolve();
								}
							}, 30000);
						});
					}
					appendInitLog('\n✅ Hoàn tất khởi tạo Ansible!');
					window.showAlert('success', 'Khởi tạo Ansible hoàn tất!');
				} else {
					appendInitLog('❌ AnsibleWebSocketModule chưa sẵn sàng');
				}
			});
		}
	}

	// Update config status panel
	function updateConfigStatus(status, message, lastCheck = null) {
		const statusPanel = document.getElementById('config-status-panel');
		const statusText = document.getElementById('config-status-text');
		const lastCheckEl = document.getElementById('config-last-check');
		
		if (!statusPanel || !statusText) return;

		// Remove all status classes
		statusPanel.classList.remove('alert-info', 'alert-success', 'alert-warning', 'alert-danger');
		
		// Set status class and message
		switch (status) {
			case 'loading':
				statusPanel.classList.add('alert-info');
				statusText.textContent = message || 'Đang tải...';
				break;
			case 'success':
				statusPanel.classList.add('alert-success');
				statusText.textContent = message || 'Cấu hình hợp lệ';
				break;
			case 'warning':
				statusPanel.classList.add('alert-warning');
				statusText.textContent = message || 'Cảnh báo';
				break;
			case 'error':
				statusPanel.classList.add('alert-danger');
				statusText.textContent = message || 'Lỗi';
				break;
			default:
				statusPanel.classList.add('alert-info');
				statusText.textContent = message || 'Chưa kiểm tra';
		}

		// Update last check time
		if (lastCheckEl) {
			if (lastCheck) {
				lastCheckEl.textContent = `Lần kiểm tra: ${lastCheck}`;
			} else {
				lastCheckEl.textContent = '-';
			}
		}
	}

	// Bind event handlers cho Ansible Config Modal buttons
	function bindAnsibleConfigButtons() {
		// Load config khi modal mở
		const configModal = document.getElementById('ansibleConfigModal');
		if (configModal) {
			configModal.addEventListener('show.bs.modal', async () => {
				// Update status panel
				updateConfigStatus('loading', 'Đang tải cấu hình...');

				// Tự động load config khi mở modal
				try {
					const data = await readAnsibleConfig();
					if (data && data.success) {
						const cfgEditor = document.getElementById('ansible-cfg-editor');
						const inventoryEditor = document.getElementById('ansible-inventory-editor');
						const varsEditor = document.getElementById('ansible-vars-editor');
						
						if (cfgEditor) {
							cfgEditor.value = data.ansibleCfg || data.cfg || '';
						}
						if (inventoryEditor) {
							inventoryEditor.value = data.hosts || '';
						}
						if (varsEditor) {
							varsEditor.value = data.vars || '';
						}

						// Update status to success
						const now = new Date().toLocaleTimeString('vi-VN');
						updateConfigStatus('success', 'Cấu hình đã được tải thành công', now);
					} else {
						// Update status to warning/error
						const now = new Date().toLocaleTimeString('vi-VN');
						updateConfigStatus('warning', data?.error || 'Không thể tải cấu hình', now);
						
						// Set empty values
						const cfgEditor = document.getElementById('ansible-cfg-editor');
						const inventoryEditor = document.getElementById('ansible-inventory-editor');
						const varsEditor = document.getElementById('ansible-vars-editor');
						
						if (cfgEditor) cfgEditor.value = '';
						if (inventoryEditor) inventoryEditor.value = '';
						if (varsEditor) varsEditor.value = '';
					}
				} catch (err) {
					console.error('Error loading Ansible config:', err);
					const now = new Date().toLocaleTimeString('vi-VN');
					updateConfigStatus('error', 'Lỗi khi tải cấu hình: ' + (err.message || 'Không xác định'), now);
				}
			});
		}

		// Reload config button
		const reloadBtn = document.getElementById('reload-config-btn');
		if (reloadBtn && !reloadBtn.dataset.bound) {
			reloadBtn.dataset.bound = '1';
			reloadBtn.addEventListener('click', async () => {
				if (window.AnsibleConfigModule && window.AnsibleConfigModule.readAnsibleConfig) {
					reloadBtn.disabled = true;
					reloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang tải...';
					try {
						const data = await window.AnsibleConfigModule.readAnsibleConfig();
						if (data && data.success) {
							// Update editors
							const cfgEditor = document.getElementById('ansible-cfg-editor');
							const inventoryEditor = document.getElementById('ansible-inventory-editor');
							const varsEditor = document.getElementById('ansible-vars-editor');
							
							if (cfgEditor && data.ansibleCfg) {
								cfgEditor.value = data.ansibleCfg;
							}
							if (inventoryEditor && data.hosts) {
								inventoryEditor.value = data.hosts;
							}
							if (varsEditor && data.vars) {
								varsEditor.value = data.vars;
							}
							
							window.showAlert('success', 'Đã tải lại cấu hình');
						} else {
							window.showAlert('error', data?.error || 'Không thể tải lại cấu hình');
						}
					} finally {
						reloadBtn.disabled = false;
						reloadBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Tải lại';
					}
				}
			});
		}

		// Verify config button
		const verifyBtn = document.getElementById('verify-ansible-btn');
		if (verifyBtn && !verifyBtn.dataset.bound) {
			verifyBtn.dataset.bound = '1';
			verifyBtn.addEventListener('click', async () => {
				if (window.AnsibleConfigModule && window.AnsibleConfigModule.verifyAnsibleConfig) {
					verifyBtn.disabled = true;
					verifyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang xác minh...';
					try {
						const result = await window.AnsibleConfigModule.verifyAnsibleConfig();
						if (result && result.success) {
							window.showAlert('success', 'Cấu hình Ansible hợp lệ!');
							// Update status panel
							const statusText = document.getElementById('config-status-text');
							if (statusText) {
								statusText.textContent = 'Hợp lệ';
							}
							const lastCheck = document.getElementById('config-last-check');
							if (lastCheck) {
								lastCheck.textContent = new Date().toLocaleTimeString('vi-VN');
							}
						} else {
							window.showAlert('error', result?.error || 'Cấu hình Ansible không hợp lệ');
							const statusText = document.getElementById('config-status-text');
							if (statusText) {
								statusText.textContent = 'Không hợp lệ';
							}
						}
					} finally {
						verifyBtn.disabled = false;
						verifyBtn.innerHTML = '<i class="bi bi-check-circle"></i> Xác minh';
					}
				}
			});
		}

		// Rollback config button
		const rollbackBtn = document.getElementById('rollback-config-btn');
		if (rollbackBtn && !rollbackBtn.dataset.bound) {
			rollbackBtn.dataset.bound = '1';
			rollbackBtn.addEventListener('click', async () => {
				if (!confirm('Bạn có chắc chắn muốn rollback cấu hình Ansible về phiên bản trước đó?')) {
					return;
				}
				if (window.AnsibleConfigModule && window.AnsibleConfigModule.rollbackAnsibleConfig) {
					rollbackBtn.disabled = true;
					rollbackBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang rollback...';
					try {
						const result = await window.AnsibleConfigModule.rollbackAnsibleConfig();
						if (result && result.success) {
							window.showAlert('success', 'Đã rollback cấu hình Ansible');
							// Reload config
							if (window.AnsibleConfigModule && window.AnsibleConfigModule.readAnsibleConfig) {
								const data = await window.AnsibleConfigModule.readAnsibleConfig();
								if (data && data.success) {
									const cfgEditor = document.getElementById('ansible-cfg-editor');
									const inventoryEditor = document.getElementById('ansible-inventory-editor');
									const varsEditor = document.getElementById('ansible-vars-editor');
									
									if (cfgEditor && data.ansibleCfg) cfgEditor.value = data.ansibleCfg;
									if (inventoryEditor && data.hosts) inventoryEditor.value = data.hosts;
									if (varsEditor && data.vars) varsEditor.value = data.vars;
								}
							}
						} else {
							window.showAlert('error', result?.error || 'Không thể rollback cấu hình');
						}
					} finally {
						rollbackBtn.disabled = false;
						rollbackBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Rollback';
					}
				}
			});
		}

		// Save config button
		const saveBtn = document.getElementById('save-ansible-config-btn');
		if (saveBtn && !saveBtn.dataset.bound) {
			saveBtn.dataset.bound = '1';
			saveBtn.addEventListener('click', async () => {
				const cfgEditor = document.getElementById('ansible-cfg-editor');
				const inventoryEditor = document.getElementById('ansible-inventory-editor');
				const varsEditor = document.getElementById('ansible-vars-editor');
				
				if (!cfgEditor || !inventoryEditor || !varsEditor) {
					window.showAlert('error', 'Không tìm thấy các editor');
					return;
				}

				const cfg = cfgEditor.value.trim();
				const hosts = inventoryEditor.value.trim();
				const vars = varsEditor.value.trim();
				const sudoPassword = ''; // Có thể thêm input cho sudo password nếu cần

				if (window.AnsibleConfigModule && window.AnsibleConfigModule.saveAnsibleConfig) {
					saveBtn.disabled = true;
					saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...';
					try {
						const result = await window.AnsibleConfigModule.saveAnsibleConfig(
							cfg, hosts, vars, sudoPassword
						);
						if (result && result.success) {
							window.showAlert('success', 'Đã lưu cấu hình Ansible');
						} else {
							window.showAlert('error', result?.error || 'Không thể lưu cấu hình');
						}
					} finally {
						saveBtn.disabled = false;
						saveBtn.innerHTML = '<i class="bi bi-save"></i> Lưu cấu hình';
					}
				}
			});
		}
	}

	// Bind event handler cho button start-ansible-install-btn
	function bindAnsibleInstallButton() {
		const startBtn = document.getElementById('start-ansible-install-btn');
		if (startBtn && !startBtn.dataset.bound) {
			startBtn.dataset.bound = '1';
			startBtn.addEventListener('click', async () => {
				const sudoPasswords = {};
				let hasPassword = false;
				let hasNopasswdServers = false;

				// Thu thập mật khẩu từ các input
				document.querySelectorAll('.sudo-password-input').forEach(input => {
					const host = input.dataset.host;
					const password = input.value.trim();
					if (password) {
						sudoPasswords[host] = password;
						hasPassword = true;
					}
				});

				// Kiểm tra xem có server nào có sudo NOPASSWD không
				document.querySelectorAll('.form-control-plaintext.text-success').forEach(() => {
					hasNopasswdServers = true;
				});

				// Nếu không có mật khẩu và không có server nào có sudo NOPASSWD
				if (!hasPassword && !hasNopasswdServers) {
					window.showAlert('error', 'Vui lòng nhập mật khẩu sudo cho server hoặc cấu hình sudo NOPASSWD.');
					return;
				}

				const targetServer = window.currentTargetServer;
				const isReinstall = window.isReinstallMode || false;
				const isUninstall = window.isUninstallMode || false;

				if (!targetServer) {
					window.showAlert('error', 'Thông tin server không hợp lệ.');
					return;
				}

				// Hide sudo password section, show output section
				const sudoSection = document.getElementById('sudo-password-section');
				const outputSection = document.getElementById('ansible-output-section');
				const consoleEl = document.getElementById('ansible-output-console');

				if (sudoSection) sudoSection.classList.add('d-none');
				if (outputSection) outputSection.classList.remove('d-none');
				if (consoleEl) consoleEl.innerHTML = '';

				// Kết nối WebSocket và gửi lệnh sau khi WebSocket mở
				// Sử dụng clusterStatus = "AVAILABLE" để xác định cluster thay vì clusterId
				if (window.AnsibleWebSocketModule) {
					// Lưu thông tin để gửi sau khi WebSocket mở
					const installOptions = {
						targetServer: targetServer.ip,
						sudoPasswords: sudoPasswords,
						isReinstall: isReinstall,
						isUninstall: isUninstall
					};

					window.AnsibleWebSocketModule.connectAnsibleWebSocket({
						onLogMessage: (type, message) => {
							if (consoleEl) {
								const color = type === 'error' ? 'text-danger' : 
											  type === 'success' ? 'text-success' : 
											  type === 'warning' ? 'text-warning' : 'text-info';
								const div = document.createElement('div');
								div.className = color;
								div.textContent = message;
								consoleEl.appendChild(div);
								consoleEl.scrollTop = consoleEl.scrollHeight;
							}
						},
						onProgress: (percent, message) => {
							const progressBar = document.getElementById('ansible-progress-bar');
							const progressText = document.getElementById('progress-text');
							if (progressBar) {
								progressBar.style.width = `${percent}%`;
								progressBar.setAttribute('aria-valuenow', percent);
							}
							if (progressText) {
								progressText.textContent = message || `${percent}%`;
							}
						},
						onComplete: (success, message) => {
							const completeBtn = document.getElementById('ansible-complete-btn');
							if (completeBtn) {
								completeBtn.classList.remove('d-none');
							}
							if (success) {
								window.showAlert('success', isUninstall ? 'Gỡ cài đặt Ansible thành công!' : 
															isReinstall ? 'Cài đặt lại Ansible thành công!' : 
															'Cài đặt Ansible thành công!');
								// Reload status
								setTimeout(() => checkAnsibleStatus(), 2000);
							} else {
								window.showAlert('error', message || 'Thao tác thất bại');
							}
						},
						onOpen: () => {
							// Gửi lệnh sau khi WebSocket đã mở
							if (window.AnsibleWebSocketModule) {
								window.AnsibleWebSocketModule.sendInstallationStartCommand(installOptions);
							}
						}
					});
				} else {
					window.showAlert('error', 'AnsibleWebSocketModule chưa sẵn sàng. Vui lòng tải lại trang.');
				}
			});
		}
	}

	// Bind complete button (Hoàn thành)
	function bindAnsibleCompleteButton() {
		const completeBtn = document.getElementById('ansible-complete-btn');
		if (completeBtn && !completeBtn.dataset.bound) {
			completeBtn.dataset.bound = '1';
			completeBtn.addEventListener('click', async () => {
				// Đóng modal trước
				const modal = bootstrap.Modal.getInstance(document.getElementById('ansibleInstallModal'));
				if (modal) {
					modal.hide();
				}

				// Reload và kiểm tra trạng thái Ansible
				window.showAlert('info', 'Đang kiểm tra trạng thái Ansible...');
				
				try {
					// Kiểm tra trạng thái Ansible
					if (window.checkAnsibleStatus && typeof window.checkAnsibleStatus === 'function') {
						await window.checkAnsibleStatus();
					} else if (window.AnsibleConfigModule && window.AnsibleConfigModule.checkAnsibleStatus) {
						await window.AnsibleConfigModule.checkAnsibleStatus();
					} else {
						window.showAlert('error', 'Function checkAnsibleStatus không khả dụng. Vui lòng tải lại trang.');
						return;
					}

					// Reload cluster detail để cập nhật UI (nếu đang ở trang cluster detail)
					// Sử dụng clusterStatus = "AVAILABLE" để xác định cluster thay vì clusterId
						if (window.showClusterDetail && typeof window.showClusterDetail === 'function') {
							// Delay một chút để đảm bảo status đã được cập nhật
							setTimeout(() => {
							window.showClusterDetail();
							}, 1000);
						} else if (window.K8sClustersModule && window.K8sClustersModule.showClusterDetail) {
							setTimeout(() => {
							window.K8sClustersModule.showClusterDetail();
							}, 1000);
					}
				} catch (err) {
					console.error('Error checking Ansible status:', err);
					window.showAlert('error', 'Không thể kiểm tra trạng thái Ansible: ' + (err.message || 'Lỗi không xác định'));
				}
			});
		}
	}

	// Initialize event handlers khi DOM ready
	function initAnsibleEventHandlers() {
		// Bind init buttons
		bindAnsibleInitButtons();
		// Bind config buttons
		bindAnsibleConfigButtons();
		// Bind install button
		bindAnsibleInstallButton();
		// Bind complete button
		bindAnsibleCompleteButton();
	}

	// Auto-initialize khi DOM ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initAnsibleEventHandlers);
	} else {
		initAnsibleEventHandlers();
	}

	// Re-bind khi modal được mở (để đảm bảo buttons luôn được bind)
	document.addEventListener('shown.bs.modal', (event) => {
		if (event.target.id === 'initAnsibleModal' || event.target.id === 'ansibleConfigModal') {
			bindAnsibleInitButtons();
			bindAnsibleConfigButtons();
		}
		if (event.target.id === 'ansibleInstallModal') {
			bindAnsibleInstallButton();
			bindAnsibleCompleteButton();
		}
	});
})();


