// Ansible Config Module - Quản lý cấu hình Ansible (ansible.cfg, hosts, group_vars/all.yml)
(function () {
	'use strict';

	// Trạng thái module
	let currentClusterId = null;

	// Hàm hỗ trợ: Escape HTML để tránh XSS
	function escapeHtml(text) {
		if (text == null) return '';
		const div = document.createElement('div');
		div.textContent = String(text);
		return div.innerHTML;
	}

	// Đọc cấu hình Ansible
	async function readAnsibleConfig(clusterId) {
		if (!clusterId) {
			console.error('readAnsibleConfig: clusterId là bắt buộc');
			return null;
		}

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(readAnsibleConfig(clusterId)), 100);
			});
		}

		try {
			const data = await window.ApiClient.get(`/api/ansible-config/read/${clusterId}`);
			return data;
		} catch (error) {
			console.error('Error reading Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi đọc cấu hình' };
		}
	}

	// Lưu cấu hình Ansible
	async function saveAnsibleConfig(clusterId, cfg, hosts, vars, sudoPassword = '') {
		if (!clusterId) {
			console.error('saveAnsibleConfig: clusterId là bắt buộc');
			return { success: false, error: 'Cluster ID là bắt buộc' };
		}

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(saveAnsibleConfig(clusterId, cfg, hosts, vars, sudoPassword)), 100);
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
			const response = await fetch(`/api/ansible-config/save/${clusterId}`, {
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
	async function verifyAnsibleConfig(clusterId) {
		if (!clusterId) {
			console.error('verifyAnsibleConfig: clusterId là bắt buộc');
			return null;
		}

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(verifyAnsibleConfig(clusterId)), 100);
			});
		}

		try {
			const data = await window.ApiClient.post(`/api/ansible-config/verify/${clusterId}`, {});
			return data;
		} catch (error) {
			console.error('Error verifying Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi kiểm tra cấu hình' };
		}
	}

	// Rollback cấu hình Ansible
	async function rollbackAnsibleConfig(clusterId) {
		if (!clusterId) {
			console.error('rollbackAnsibleConfig: clusterId là bắt buộc');
			return null;
		}

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(rollbackAnsibleConfig(clusterId)), 100);
			});
		}

		try {
			const data = await window.ApiClient.post(`/api/ansible-config/rollback/${clusterId}`, {});
			return data;
		} catch (error) {
			console.error('Error rolling back Ansible config:', error);
			return { success: false, error: error.message || 'Lỗi rollback cấu hình' };
		}
	}

	// Kiểm tra sudo NOPASSWD
	async function checkSudoNopasswd(clusterId, host = null) {
		if (!clusterId) {
			console.error('checkSudoNopasswd: clusterId là bắt buộc');
			return { success: false, hasNopasswd: false };
		}

		// Đảm bảo ApiClient đã được load
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient chưa sẵn sàng. Đang chờ load...');
			return new Promise((resolve) => {
				setTimeout(() => resolve(checkSudoNopasswd(clusterId, host)), 100);
			});
		}

		try {
			const url = host 
				? `/api/ansible-config/check-sudo/${clusterId}?host=${encodeURIComponent(host)}`
				: `/api/ansible-config/check-sudo/${clusterId}`;
			const data = await window.ApiClient.get(url);
			return data;
		} catch (error) {
			console.error('Error checking sudo NOPASSWD:', error);
			return { success: false, hasNopasswd: false, error: error.message || 'Lỗi kiểm tra sudo' };
		}
	}

	// Kiểm tra trạng thái Ansible
	async function checkAnsibleStatus(clusterId) {
		if (!clusterId) {
			console.error('checkAnsibleStatus: clusterId là bắt buộc');
			window.showAlert('error', 'Cluster ID là bắt buộc');
			return;
		}

		currentClusterId = clusterId;

		const checkBtn = document.getElementById('cd-check-ansible');
		const statusDisplay = document.getElementById('ansible-status-display');
		const statusTable = document.getElementById('ansible-status-table');

		try {
			if (checkBtn) {
				checkBtn.disabled = true;
				checkBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang kiểm tra...';
			}

			// Lấy thông tin cluster detail để có master node
			let clusterDetail = null;
			try {
				clusterDetail = await window.ApiClient.get(`/admin/clusters/${clusterId}/detail`);
			} catch (err) {
				console.warn('Could not fetch cluster detail:', err);
			}

			// Gọi API kiểm tra trạng thái Ansible
			const ansibleStatus = await window.ApiClient.get(`/admin/clusters/${clusterId}/ansible-status`);

			// Nếu ansibleStatus không có masterInfo/serverInfo, lấy từ clusterDetail
			if (clusterDetail && clusterDetail.masterNode) {
				if (!ansibleStatus.masterInfo && !ansibleStatus.serverInfo) {
					ansibleStatus.masterInfo = clusterDetail.masterNode;
				}
				// Nếu ansibleStatus có ansibleStatus map, tìm master trong đó
				if (ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
					const entries = Object.entries(ansibleStatus.ansibleStatus);
					for (const [host, status] of entries) {
						if (status && status.role === 'MASTER') {
							ansibleStatus.masterInfo = host;
							break;
						}
					}
				}
			}

			// Update summary badges
			updateAnsibleSummary(ansibleStatus);

		} catch (error) {
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
			} else if (errorMessage.includes('Không tìm thấy MASTER') || errorMessage.includes('offline')) {
				errorMessage = 'MASTER server đang offline. Vui lòng kiểm tra kết nối máy chủ trước khi kiểm tra Ansible.';
				alertType = 'warning';
				iconClass = 'bi-server';
			}

			if (statusDisplay) {
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
			if (checkBtn) {
				checkBtn.disabled = false;
				checkBtn.innerHTML = '<i class="bi bi-search"></i> Kiểm tra trạng thái';
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

		if (!ansibleStatus) {
			setAnsibleSummaryBadges({ state: 'unknown' });
			return;
		}

		// Update install badge
		if (badgeInstall) {
			// Xác định isInstalled từ nhiều nguồn
			let isInstalled = ansibleStatus.state === 'installed' || ansibleStatus.installed === true;
			
			// Nếu không có trong ansibleStatus, thử tìm trong ansibleStatus map
			if (!isInstalled && ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
				const entries = Object.entries(ansibleStatus.ansibleStatus);
				for (const [host, status] of entries) {
					if (status && status.role === 'MASTER') {
						isInstalled = status.installed === true || status.installed === 'true';
						break;
					}
				}
			}
			
			if (isInstalled) {
				badgeInstall.className = 'badge bg-success';
				badgeInstall.textContent = '✅ Đã cài đặt';
			} else {
				badgeInstall.className = 'badge bg-danger';
				badgeInstall.textContent = '❌ Chưa cài đặt';
			}
		}

		// Update version badge
		if (badgeVersion) {
			let version = ansibleStatus.version || ansibleStatus.ansibleVersion || null;
			
			// Nếu không có trong ansibleStatus, thử tìm trong ansibleStatus map
			if (!version || version === '-') {
				if (ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
					const entries = Object.entries(ansibleStatus.ansibleStatus);
					for (const [host, status] of entries) {
						if (status && status.role === 'MASTER' && status.version) {
							version = status.version;
							break;
						}
					}
				}
			}
			
			badgeVersion.textContent = `Phiên bản: ${escapeHtml(String(version || '-'))}`;
		}

		// Update master badge
		if (badgeMaster) {
			let masterInfo = ansibleStatus.masterInfo || ansibleStatus.serverInfo || null;
			
			// Nếu không có trong ansibleStatus, thử lấy từ ansibleStatus map
			if (!masterInfo || masterInfo === '-') {
				if (ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
					const entries = Object.entries(ansibleStatus.ansibleStatus);
					for (const [host, status] of entries) {
						if (status && status.role === 'MASTER') {
							masterInfo = host;
							break;
						}
					}
				}
			}
			
			// Nếu vẫn không có, thử lấy từ cluster detail (nếu có trong DOM)
			if (!masterInfo || masterInfo === '-') {
				const masterNodeEl = document.getElementById('cd-master');
				if (masterNodeEl) {
					const masterText = masterNodeEl.textContent?.trim();
					if (masterText && masterText !== '') {
						masterInfo = masterText;
					}
				}
			}
			
			badgeMaster.textContent = `MASTER: ${escapeHtml(String(masterInfo || '-'))}`;
		}

		// Update actions - hiển thị các button install/reinstall/uninstall
		if (actions) {
			// Lấy masterHost từ nhiều nguồn
			let masterHost = ansibleStatus.masterInfo || ansibleStatus.serverInfo || null;
			let masterStatus = null; // Status của master node từ ansibleStatus map
			
			// Nếu không có trong ansibleStatus, thử lấy từ ansibleStatus map
			if (!masterHost || masterHost === '-' || masterHost === '') {
				if (ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
					const entries = Object.entries(ansibleStatus.ansibleStatus);
					for (const [host, status] of entries) {
						if (status && status.role === 'MASTER') {
							masterHost = host;
							masterStatus = status;
							break;
						}
					}
				}
			} else if (ansibleStatus.ansibleStatus && typeof ansibleStatus.ansibleStatus === 'object') {
				// Nếu đã có masterHost, lấy status từ map
				masterStatus = ansibleStatus.ansibleStatus[masterHost];
			}
			
			// Nếu vẫn không có, thử lấy từ cluster detail (nếu có trong DOM)
			if (!masterHost || masterHost === '-' || masterHost === '') {
				const masterNodeEl = document.getElementById('cd-master');
				if (masterNodeEl) {
					const masterText = masterNodeEl.textContent?.trim();
					if (masterText && masterText !== '') {
						masterHost = masterText;
					}
				}
			}
			
			// Xác định isInstalled từ nhiều nguồn
			let isInstalled = ansibleStatus.state === 'installed' || ansibleStatus.installed === true;
			if (!isInstalled && masterStatus) {
				isInstalled = masterStatus.installed === true || masterStatus.installed === 'true';
			}
			
			if (masterHost && masterHost !== '-' && masterHost !== '') {
				if (isInstalled) {
					// Đã cài đặt: hiển thị button "Cài đặt lại" và "Gỡ cài đặt"
					actions.innerHTML = `
						<div class="btn-group btn-group-sm" role="group">
							<button class="btn btn-outline-warning" title="Cài đặt lại Ansible trên MASTER" id="btn-reinstall-ansible">
								<i class="bi bi-arrow-repeat"></i> Cài đặt lại
							</button>
							<button class="btn btn-outline-danger" title="Gỡ Ansible khỏi MASTER" id="btn-uninstall-ansible">
								<i class="bi bi-trash"></i> Gỡ cài đặt
							</button>
						</div>
					`;
					
					// Bind event handlers
					const reinstallBtn = document.getElementById('btn-reinstall-ansible');
					const uninstallBtn = document.getElementById('btn-uninstall-ansible');
					if (reinstallBtn) {
						reinstallBtn.addEventListener('click', () => reinstallAnsibleOnServer(masterHost));
					}
					if (uninstallBtn) {
						uninstallBtn.addEventListener('click', () => uninstallAnsibleOnServer(masterHost));
					}
				} else {
					// Chưa cài đặt: hiển thị button "Cài đặt"
					actions.innerHTML = `
						<div class="btn-group btn-group-sm" role="group">
							<button class="btn btn-outline-primary" title="Cài đặt Ansible trên MASTER" id="btn-install-ansible">
								<i class="bi bi-download"></i> Cài đặt
							</button>
						</div>
					`;
					
					// Bind event handler
					const installBtn = document.getElementById('btn-install-ansible');
					if (installBtn) {
						installBtn.addEventListener('click', () => installAnsibleOnServer(masterHost));
					}
				}
			} else {
				// Không có master host
				actions.innerHTML = '';
			}
		}

		// Update status display
		if (statusDisplay) {
			statusDisplay.innerHTML = '';
			statusDisplay.classList.add('d-none');
		}
	}

	// Set Ansible summary badges to default/unknown state
	function setAnsibleSummaryBadges(status = {}) {
		const badgeInstall = document.getElementById('ansible-summary-install');
		const badgeVersion = document.getElementById('ansible-summary-version');
		const badgeMaster = document.getElementById('ansible-summary-master');

		if (badgeInstall) {
			if (status.state === 'unknown' || !status.state) {
				badgeInstall.className = 'badge bg-secondary';
				badgeInstall.textContent = 'Chưa kiểm tra';
			}
		}

		if (badgeVersion) {
			badgeVersion.textContent = 'Phiên bản: -';
		}

		if (badgeMaster) {
			badgeMaster.textContent = 'MASTER: -';
		}
	}

	// Hiển thị modal cài đặt Ansible cho server
	async function showAnsibleInstallModalForServer(clusterId, targetHost, isReinstall, isUninstall = false) {
		if (!clusterId || !targetHost) {
			window.showAlert('error', 'Cluster ID và server host là bắt buộc');
			return;
		}

		try {
			// Lấy thông tin cluster
			const clusterDetail = await window.ApiClient.get(`/admin/clusters/${clusterId}/detail`);

			// Tìm server cần cài đặt
			const targetServer = clusterDetail.nodes?.find(node => node.ip === targetHost);
			if (!targetServer) {
				window.showAlert('error', `Không tìm thấy server: ${targetHost}`);
				return;
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
				const sudoCheckData = await window.AnsibleConfigModule.checkSudoNopasswd(clusterId, targetHost);
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
			window.currentAnsibleInstallClusterId = clusterId;

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
		if (!currentClusterId) {
			window.showAlert('error', 'Không tìm thấy cluster ID. Vui lòng chọn cluster trước.');
			return;
		}

		// Mở modal cài đặt
		await showAnsibleInstallModalForServer(currentClusterId, serverHost, false, false);
	}

	// Cài đặt lại Ansible trên server
	async function reinstallAnsibleOnServer(serverHost) {
		if (!currentClusterId) {
			window.showAlert('error', 'Không tìm thấy cluster ID. Vui lòng chọn cluster trước.');
			return;
		}

		// Mở modal cài đặt lại
		await showAnsibleInstallModalForServer(currentClusterId, serverHost, true, false);
	}

	// Gỡ cài đặt Ansible trên server
	async function uninstallAnsibleOnServer(serverHost) {
		if (!currentClusterId) {
			window.showAlert('error', 'Không tìm thấy cluster ID. Vui lòng chọn cluster trước.');
			return;
		}

		// Mở modal gỡ cài đặt
		await showAnsibleInstallModalForServer(currentClusterId, serverHost, false, true);
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
		uninstallAnsibleOnServer,
		setCurrentClusterId: (id) => { currentClusterId = id; },
		getCurrentClusterId: () => currentClusterId
	};

	// Tương thích ngược: expose các hàm global
	window.readAnsibleConfig = (clusterId) => window.AnsibleConfigModule.readAnsibleConfig(clusterId);
	window.saveAnsibleConfig = (clusterId, cfg, hosts, vars, sudoPassword) => 
		window.AnsibleConfigModule.saveAnsibleConfig(clusterId, cfg, hosts, vars, sudoPassword);
	window.verifyAnsibleConfig = (clusterId) => window.AnsibleConfigModule.verifyAnsibleConfig(clusterId);
	window.rollbackAnsibleConfig = (clusterId) => window.AnsibleConfigModule.rollbackAnsibleConfig(clusterId);
	window.checkSudoNopasswd = (clusterId, host) => window.AnsibleConfigModule.checkSudoNopasswd(clusterId, host);
	window.checkAnsibleStatus = (clusterId) => window.AnsibleConfigModule.checkAnsibleStatus(clusterId);
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				appendInitLog('📁 Bắt đầu tạo cấu trúc thư mục Ansible...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_structure', currentClusterId, {
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				appendInitLog('📝 Bắt đầu ghi cấu hình mặc định (ansible.cfg và hosts)...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_config', currentClusterId, {
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				appendInitLog('🔑 Bắt đầu tạo SSH key cho MASTER...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_sshkey', currentClusterId, {
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				appendInitLog('📡 Bắt đầu ping các nodes...');
				if (window.AnsibleWebSocketModule) {
					window.AnsibleWebSocketModule.runInitActionWS('init_ping', currentClusterId, {
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
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
							window.AnsibleWebSocketModule.runInitActionWS(step.action, currentClusterId, {
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

	// Bind event handlers cho Ansible Config Modal buttons
	function bindAnsibleConfigButtons() {
		// Update cluster name khi modal mở
		const configModal = document.getElementById('ansibleConfigModal');
		if (configModal) {
			configModal.addEventListener('show.bs.modal', () => {
				const clusterNameEl = document.getElementById('current-cluster-name');
				if (clusterNameEl && currentClusterId) {
					// Lấy tên cluster từ DOM hoặc API
					const cdNameEl = document.getElementById('cd-name');
					if (cdNameEl) {
						clusterNameEl.textContent = cdNameEl.textContent.trim() || `Cluster #${currentClusterId}`;
					} else {
						clusterNameEl.textContent = `Cluster #${currentClusterId}`;
					}
					// Tự động load config khi mở modal
					if (window.AnsibleConfigModule && window.AnsibleConfigModule.readAnsibleConfig) {
						window.AnsibleConfigModule.readAnsibleConfig(currentClusterId).then(data => {
							if (data && data.success) {
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
							}
						}).catch(err => {
							console.error('Error loading Ansible config:', err);
						});
					}
				}
			});
		}

		// Reload config button
		const reloadBtn = document.getElementById('reload-config-btn');
		if (reloadBtn && !reloadBtn.dataset.bound) {
			reloadBtn.dataset.bound = '1';
			reloadBtn.addEventListener('click', async () => {
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				if (window.AnsibleConfigModule && window.AnsibleConfigModule.readAnsibleConfig) {
					reloadBtn.disabled = true;
					reloadBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang tải...';
					try {
						const data = await window.AnsibleConfigModule.readAnsibleConfig(currentClusterId);
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				if (window.AnsibleConfigModule && window.AnsibleConfigModule.verifyAnsibleConfig) {
					verifyBtn.disabled = true;
					verifyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang xác minh...';
					try {
						const result = await window.AnsibleConfigModule.verifyAnsibleConfig(currentClusterId);
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				if (!confirm('Bạn có chắc chắn muốn rollback cấu hình Ansible về phiên bản trước đó?')) {
					return;
				}
				if (window.AnsibleConfigModule && window.AnsibleConfigModule.rollbackAnsibleConfig) {
					rollbackBtn.disabled = true;
					rollbackBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang rollback...';
					try {
						const result = await window.AnsibleConfigModule.rollbackAnsibleConfig(currentClusterId);
						if (result && result.success) {
							window.showAlert('success', 'Đã rollback cấu hình Ansible');
							// Reload config
							if (window.AnsibleConfigModule && window.AnsibleConfigModule.readAnsibleConfig) {
								const data = await window.AnsibleConfigModule.readAnsibleConfig(currentClusterId);
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
				if (!currentClusterId) {
					window.showAlert('error', 'Chưa chọn cluster');
					return;
				}
				
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
							currentClusterId, cfg, hosts, vars, sudoPassword
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

				const clusterId = window.currentAnsibleInstallClusterId || currentClusterId;
				const targetServer = window.currentTargetServer;
				const isReinstall = window.isReinstallMode || false;
				const isUninstall = window.isUninstallMode || false;

				if (!clusterId || !targetServer) {
					window.showAlert('error', 'Thông tin cluster hoặc server không hợp lệ.');
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
				if (window.AnsibleWebSocketModule) {
					// Lưu thông tin để gửi sau khi WebSocket mở
					const installOptions = {
						targetServer: targetServer.ip,
						sudoPasswords: sudoPasswords,
						isReinstall: isReinstall,
						isUninstall: isUninstall
					};

					window.AnsibleWebSocketModule.connectAnsibleWebSocket(clusterId, {
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
								setTimeout(() => checkAnsibleStatus(clusterId), 2000);
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

	// Initialize event handlers khi DOM ready
	function initAnsibleEventHandlers() {
		// Bind init buttons
		bindAnsibleInitButtons();
		// Bind config buttons
		bindAnsibleConfigButtons();
		// Bind install button
		bindAnsibleInstallButton();
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
		}
	});
})();

