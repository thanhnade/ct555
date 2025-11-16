// Servers Module - Quản lý máy chủ
(function () {
	'use strict';

	// Terminal state (tạm thời giữ trong module này, có thể tách riêng sau)
	let termWS = null; // WSClient instance
	let termInfo = { host: '', port: 22, username: '', id: null };
	let term = null; // xterm instance
	let termTrySshKey = false; // Flag để track xem đã thử SSH key chưa

	// Auto-reconnect interval (45 seconds)
	let autoReconnectInterval = null;

	// Helper: Escape HTML
	function escapeHtml(text) {
		if (!text) return '';
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	// Load servers list
	async function loadServers() {
		const grid = document.getElementById('servers-grid');
		if (!grid) return;

		// Ensure ApiClient is loaded
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient not available. Waiting for it to load...');
			setTimeout(loadServers, 100);
			return;
		}

		try {
			const [data, connectedIds] = await Promise.all([
				window.ApiClient.get('/admin/servers').catch(() => []),
				window.ApiClient.get('/admin/servers/connected').catch(() => [])
			]);

			const grid = document.getElementById('servers-grid');
			if (!grid) return;

			grid.innerHTML = '';

			if (!data || data.length === 0) {
				grid.innerHTML = `<div class="col-12 text-center text-muted p-4">Chưa có server nào</div>`;
				return;
			}

			(data || []).forEach(s => {
				const isConnected = (connectedIds || []).includes(s.id);
				const statusChip = isConnected
					? '<span class="chip green">CONNECTED</span>'
					: (s.status === 'ONLINE' 
						? '<span class="chip blue">ONLINE</span>' 
						: '<span class="chip red">OFFLINE</span>');
				
				// Get hardware specs from database (saved in server entity)
				const cpuCores = s.cpuCores || '-';
				const ramTotal = s.ramTotal || '-';
				const diskTotal = s.diskTotal || '-';
				
				// Format CPU: number of cores
				let cpuDisplay = '-';
				if (cpuCores !== '-') {
					const cores = parseInt(cpuCores, 10);
					if (!isNaN(cores)) {
						cpuDisplay = `${cores} cores`;
					} else {
						cpuDisplay = escapeHtml(cpuCores);
					}
				}
				
				// Format RAM: total RAM capacity
				const ramDisplay = ramTotal !== '-' ? escapeHtml(ramTotal) : '-';
				
				// Format Disk: total disk capacity
				const diskDisplay = diskTotal !== '-' ? escapeHtml(diskTotal) : '-';
				
				// Format role badge
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
				
				const reconnectOrDisconnect = isConnected
					? `<button class="btn btn-sm" onclick="window.ServersModule.disconnectServer(${s.id})" title="Ngắt kết nối">🔌</button>`
					: `<button class="btn btn-sm" onclick="window.ServersModule.openReconnectModal(${s.id})" title="Kết nối lại">🔌</button>`;
				
				// Create server card with Bootstrap grid column
				const cardWrapper = document.createElement('div');
				cardWrapper.className = 'col-12 col-sm-6 col-md-4 col-lg-3';
				
				const card = document.createElement('div');
				card.className = 'server-card';
				card.setAttribute('data-server-id', s.id);
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
						<button class="btn btn-sm" style="margin-top: 6px; padding: 4px 8px; font-size: 11px;" 
							onclick="window.ServersModule.updateServerMetrics(${s.id})" 
							title="Cập nhật metrics từ server"
							data-server-id="${s.id}">
							📊 Cập nhật
						</button>
					</div>
					
					<div class="server-card-actions">
						<button class="btn btn-sm" onclick="window.ServersModule.editServer(${s.id})" title="Sửa">✏️</button>
						${reconnectOrDisconnect}
						${isConnected ? `<button class="btn btn-sm" onclick="window.ServersModule.openTerminal(${s.id}, true)" title="Terminal">💻</button>` : ''}
						<button class="btn btn-sm btn-danger" onclick="window.ServersModule.deleteServer(${s.id})" title="Xóa">🗑️</button>
					</div>
				`;
				cardWrapper.appendChild(card);
				grid.appendChild(cardWrapper);
			});
		} catch (error) {
			const grid = document.getElementById('servers-grid');
			if (grid) {
				const errorMsg = (window.I18n && window.I18n.t) 
					? window.I18n.t('admin.server.loadError') 
					: 'Lỗi tải danh sách';
				grid.innerHTML = `<div class="col-12 text-center text-danger p-4">${errorMsg}: ${(error.message || 'Error')}</div>`;
			}
			console.error('loadServers error:', error);
		}
	}

	// Validate server form
	function validateServerForm(form, isEdit = false) {
		const errors = [];
		
		if (!form) {
			errors.push('Form không tồn tại');
			return errors;
		}
		
		const hostEl = form.querySelector('[name="host"]') || form.elements?.host;
		const host = hostEl?.value?.trim() || '';
		if (!host) {
			errors.push('Host/IP không được để trống');
		} else if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-zA-Z0-9.-]+$/.test(host)) {
			errors.push('Host/IP không hợp lệ');
		}
		
		const portEl = form.querySelector('[name="port"]') || form.elements?.port;
		const port = parseInt(portEl?.value || '22', 10);
		if (isNaN(port) || port < 1 || port > 65535) {
			errors.push('Port phải là số từ 1 đến 65535');
		}
		
		const usernameEl = form.querySelector('[name="username"]') || form.elements?.username;
		const username = usernameEl?.value?.trim() || '';
		if (!username) {
			errors.push('Username không được để trống');
		}
		
		const passwordEl = form.querySelector('[name="password"]') || form.elements?.password;
		const password = passwordEl?.value || '';
		if (!isEdit && !password) {
			errors.push('Password không được để trống khi thêm server mới');
		}
		
		return errors;
	}

	// Show form error
	function showCreateServerError(message) {
		const errorEl = document.getElementById('create-server-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.display = 'block';
			setTimeout(() => {
				errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 100);
		}
	}

	// Hide form error
	function hideCreateServerError() {
		const errorEl = document.getElementById('create-server-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	// Show edit server error
	function showEditServerError(message) {
		const errorEl = document.getElementById('edit-server-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.display = 'block';
		}
	}

	// Hide edit server error
	function hideEditServerError() {
		const errorEl = document.getElementById('edit-server-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	// Show reconnect server error
	function showReconnectServerError(message) {
		const errorEl = document.getElementById('reconnect-server-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.display = 'block';
		}
	}

	// Hide reconnect server error
	function hideReconnectServerError() {
		const errorEl = document.getElementById('reconnect-server-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	// Set form loading state
	function setCreateFormLoading(loading) {
		const submitBtn = document.getElementById('create-server-submit-btn');
		const submitText = document.getElementById('create-server-text');
		const submitLoading = document.getElementById('create-server-loading');
		
		if (submitBtn) submitBtn.disabled = loading;
		if (submitText) submitText.style.display = loading ? 'none' : 'inline';
		if (submitLoading) submitLoading.style.display = loading ? 'inline' : 'none';
	}

	// Open add server modal
	function openAddServerModal() {
		const modalEl = document.getElementById('addServerModal');
		if (modalEl) {
			const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
			modal.show();
			// Reset form
			resetAddServerForm();
		}
	}

	// Close add server modal
	function closeAddServerModal() {
		const modalEl = document.getElementById('addServerModal');
		if (modalEl) {
			const modal = bootstrap.Modal.getInstance(modalEl);
			if (modal) {
				modal.hide();
			}
		}
		resetAddServerForm();
	}

	// Reset add server form
	function resetAddServerForm() {
		const form = document.getElementById('add-server-form');
		if (form) {
			form.reset();
			// Reset to default values
			const portEl = form.querySelector('[name="port"]');
			if (portEl) portEl.value = '22';
			const roleEl = form.querySelector('[name="role"]');
			if (roleEl) roleEl.value = 'WORKER';
			const clusterStatusEl = form.querySelector('[name="clusterStatus"]');
			if (clusterStatusEl) clusterStatusEl.value = 'UNAVAILABLE';
		}
		hideAddServerError();
		
		// Reset loading state
		const saveBtn = document.getElementById('save-add-server-btn');
		const saveText = document.getElementById('save-add-text');
		const saveLoading = document.getElementById('save-add-loading');
		
		if (saveBtn) {
			saveBtn.disabled = false;
			saveBtn.classList.remove('loading');
		}
		if (saveText) saveText.style.display = 'inline';
		if (saveLoading) {
			saveLoading.style.display = 'none';
			saveLoading.classList.add('d-none');
		}
	}

	// Show add server error
	function showAddServerError(message) {
		const errorEl = document.getElementById('add-server-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.classList.remove('d-none');
			errorEl.style.display = 'block';
		}
	}

	// Hide add server error
	function hideAddServerError() {
		const errorEl = document.getElementById('add-server-error');
		if (errorEl) {
			errorEl.textContent = '';
			errorEl.classList.add('d-none');
			errorEl.style.display = 'none';
		}
	}

	// Save add server (from modal)
	async function saveAddServer() {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		const form = document.getElementById('add-server-form');
		if (!form) {
			showAddServerError('Form không tồn tại');
			return;
		}

		hideAddServerError();

		// Validate
		const errors = validateServerForm(form, false);
		if (errors.length > 0) {
			showAddServerError(errors.join(', '));
			return;
		}

		const hostEl = form.querySelector('[name="host"]') || form.elements?.host;
		const portEl = form.querySelector('[name="port"]') || form.elements?.port;
		const usernameEl = form.querySelector('[name="username"]') || form.elements?.username;
		const passwordEl = form.querySelector('[name="password"]') || form.elements?.password;
		const roleEl = form.querySelector('[name="role"]') || form.elements?.role;
		const clusterStatusEl = form.querySelector('[name="clusterStatus"]') || form.elements?.clusterStatus;

		const body = {
			host: (hostEl?.value || '').trim(),
			port: parseInt(portEl?.value || '22', 10),
			username: (usernameEl?.value || '').trim(),
			password: passwordEl?.value || '',
			role: (roleEl?.value || 'WORKER').trim(),
			clusterStatus: (clusterStatusEl?.value || 'UNAVAILABLE').trim()
		};

		// Set loading state
		const saveBtn = document.getElementById('save-add-server-btn');
		const saveText = document.getElementById('save-add-text');
		const saveLoading = document.getElementById('save-add-loading');
		
		// Disable button and show loading
		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.classList.add('loading');
		}
		if (saveText) saveText.style.display = 'none';
		if (saveLoading) {
			saveLoading.style.display = 'inline';
			saveLoading.classList.remove('d-none');
		}

		try {
			await window.ApiClient.post('/admin/servers', body);
			
			// Giữ loading state cho đến khi có thông báo
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.server.create.success') 
				: 'Thêm máy chủ thành công';
			
			// Reset loading state trước khi hiển thị thông báo và đóng modal
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.classList.remove('loading');
			}
			if (saveText) saveText.style.display = 'inline';
			if (saveLoading) {
				saveLoading.style.display = 'none';
				saveLoading.classList.add('d-none');
			}
			
			window.showAlert('success', successMsg);
			
			// Close modal and reset form sau khi có thông báo
			setTimeout(() => {
				closeAddServerModal();
				loadServers();
			}, 500);
		} catch (error) {
			let errorMessage = 'Thêm server thất bại';
			if (error.message) {
				errorMessage = error.message;
			} else if (error.response && error.response.data) {
				if (typeof error.response.data === 'string') {
					errorMessage = error.response.data;
				} else if (error.response.data.message) {
					errorMessage = error.response.data.message;
				}
			}
			
			// Reset loading state khi có lỗi để có thể thử lại
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.classList.remove('loading');
			}
			if (saveText) saveText.style.display = 'inline';
			if (saveLoading) {
				saveLoading.style.display = 'none';
				saveLoading.classList.add('d-none');
			}
			
			showAddServerError(errorMessage);
			window.showAlert('error', errorMessage);
		}
	}

	// Create server (backward compatibility - for old form submit)
	async function createServer(ev) {
		if (ev) ev.preventDefault();
		
		// If called from modal, use saveAddServer instead
		const form = ev ? ev.target : document.getElementById('add-server-form');
		if (form && form.id === 'add-server-form') {
			await saveAddServer();
			return;
		}
		
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		if (!form) {
			window.showAlert('error', 'Form không tồn tại');
			return;
		}

		hideCreateServerError();

		// Validate
		const errors = validateServerForm(form, false);
		if (errors.length > 0) {
			showCreateServerError(errors.join(', '));
			return;
		}

		const hostEl = form.querySelector('[name="host"]') || form.elements?.host;
		const portEl = form.querySelector('[name="port"]') || form.elements?.port;
		const usernameEl = form.querySelector('[name="username"]') || form.elements?.username;
		const passwordEl = form.querySelector('[name="password"]') || form.elements?.password;
		const roleEl = form.querySelector('[name="role"]') || form.elements?.role;
		const clusterStatusEl = form.querySelector('[name="clusterStatus"]') || form.elements?.clusterStatus;

		const body = {
			host: (hostEl?.value || '').trim(),
			port: parseInt(portEl?.value || '22', 10),
			username: (usernameEl?.value || '').trim(),
			password: passwordEl?.value || '',
			role: (roleEl?.value || 'WORKER').trim(),
			clusterStatus: (clusterStatusEl?.value || 'UNAVAILABLE').trim()
		};

		setCreateFormLoading(true);

		try {
			await window.ApiClient.post('/admin/servers', body);
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.server.create.success') 
				: 'Thêm máy chủ thành công';
			window.showAlert('success', successMsg);
			
			// Close accordion and reset form
			const accordion = document.getElementById('server-create-accordion');
			if (accordion) accordion.classList.remove('open');
			
			resetServerForm();
			await loadServers();
		} catch (error) {
			let errorMessage = 'Thêm server thất bại';
			if (error.message) {
				errorMessage = error.message;
			} else if (error.response && error.response.data) {
				if (typeof error.response.data === 'string') {
					errorMessage = error.response.data;
				} else if (error.response.data.message) {
					errorMessage = error.response.data.message;
				}
			}
			
			showCreateServerError(errorMessage);
			window.showAlert('error', errorMessage);
		} finally {
			setCreateFormLoading(false);
		}
	}

	// Reset form
	function resetServerForm() {
		const form = document.getElementById('create-server-form');
		if (form) {
			form.reset();
			hideCreateServerError();
			
			// Reset to default values
			const portEl = form.querySelector('[name="port"]') || form.elements?.port;
			if (portEl) portEl.value = 22;
			const roleEl = form.querySelector('[name="role"]') || form.elements?.role;
			if (roleEl) roleEl.value = 'WORKER';
			const clusterStatusEl = form.querySelector('[name="clusterStatus"]') || form.elements?.clusterStatus;
			if (clusterStatusEl) clusterStatusEl.value = 'UNAVAILABLE';
			
			// Focus on first field
			const firstInput = form.querySelector('input');
			if (firstInput) {
				setTimeout(() => firstInput.focus(), 100);
			}
		}
	}

	// Edit server - Load server data and show modal
	async function editServer(id) {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		try {
			const servers = await window.ApiClient.get('/admin/servers');
			const server = Array.isArray(servers) ? servers.find(s => s.id === id) : null;
			
			if (!server) {
				window.showAlert('error', 'Không tìm thấy server');
				return;
			}

			// Fill form
			document.getElementById('edit-server-id').value = server.id || '';
			document.getElementById('edit-server-host').value = server.host || '';
			document.getElementById('edit-server-port').value = server.port || 22;
			document.getElementById('edit-server-username').value = server.username || '';
			document.getElementById('edit-server-role').value = server.role || 'WORKER';
			document.getElementById('edit-server-cluster-status').value = server.clusterStatus || 'UNAVAILABLE';
			document.getElementById('edit-server-status').value = server.status || 'OFFLINE';

			// Clear password
			document.getElementById('edit-server-password').value = '';

			// Update title
			const titleEl = document.getElementById('editServerModalLabel');
			if (titleEl) {
				titleEl.textContent = `✏️ Sửa Server: ${escapeHtml(server.host || 'Unknown')}`;
			}

			// Hide error
			hideEditServerError();

			// Show modal
			openEditServerPopup();
		} catch (error) {
			window.showAlert('error', 'Không thể tải thông tin server: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Save edit server - Save from modal
	async function saveEditServer() {
		if (!window.ApiClient || typeof window.ApiClient.put !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		hideEditServerError();

		const form = document.getElementById('edit-server-form');
		if (!form) {
			showEditServerError('Form không tồn tại');
			return;
		}

		const id = document.getElementById('edit-server-id').value;
		if (!id) {
			showEditServerError('ID server không hợp lệ');
			return;
		}

		// Validate
		const errors = validateServerForm(form, true);
		if (errors.length > 0) {
			showEditServerError(errors.join(', '));
			return;
		}

		const hostEl = form.querySelector('[name="host"]') || form.elements?.host;
		const portEl = form.querySelector('[name="port"]') || form.elements?.port;
		const usernameEl = form.querySelector('[name="username"]') || form.elements?.username;
		const passwordEl = form.querySelector('[name="password"]') || form.elements?.password;
		const roleEl = form.querySelector('[name="role"]') || form.elements?.role;
		const clusterStatusEl = form.querySelector('[name="clusterStatus"]') || form.elements?.clusterStatus;
		const statusEl = form.querySelector('[name="status"]') || form.elements?.status;

		const body = {
			host: (hostEl?.value || '').trim(),
			port: parseInt(portEl?.value || '22', 10),
			username: (usernameEl?.value || '').trim(),
			role: (roleEl?.value || 'WORKER').trim(),
			clusterStatus: (clusterStatusEl?.value || 'UNAVAILABLE').trim(),
			status: statusEl?.value || 'OFFLINE'
		};

		// Only include password if provided
		const password = passwordEl?.value || '';
		if (password) {
			body.password = password;
		}

		// Set loading state
		const saveBtn = document.getElementById('save-edit-server-btn');
		const saveText = document.getElementById('save-edit-text');
		const saveLoading = document.getElementById('save-edit-loading');
		
		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.classList.add('loading');
		}
		if (saveText) {
			saveText.style.display = 'none';
		}
		if (saveLoading) {
			saveLoading.style.display = 'inline';
			saveLoading.classList.remove('d-none');
		}

		try {
			await window.ApiClient.put(`/admin/servers/${id}`, body);
			
			// Close modal
			closeEditServerPopup();

			window.showAlert('success', 'Đã lưu thay đổi thành công');
			await loadServers();
		} catch (error) {
			const errorMsg = error.message || 'Lưu server thất bại';
			showEditServerError(errorMsg);
			window.showAlert('error', errorMsg);
		} finally {
			// Reset loading state
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.classList.remove('loading');
			}
			if (saveText) {
				saveText.style.display = 'inline';
			}
			if (saveLoading) {
				saveLoading.style.display = 'none';
				saveLoading.classList.add('d-none');
			}
		}
	}

	// Open edit server popup
	function openEditServerPopup() {
		const modalEl = document.getElementById('editServerModal');
		if (modalEl) {
			const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
			modal.show();
		}
	}

	// Close edit server popup
	function closeEditServerPopup() {
		const modalEl = document.getElementById('editServerModal');
		if (modalEl) {
			const modal = bootstrap.Modal.getInstance(modalEl);
			if (modal) {
				modal.hide();
			}
		}
		const form = document.getElementById('edit-server-form');
		if (form) form.reset();
		hideEditServerError();
		
		// Reset loading state
		const saveBtn = document.getElementById('save-edit-server-btn');
		const saveText = document.getElementById('save-edit-text');
		const saveLoading = document.getElementById('save-edit-loading');
		
		if (saveBtn) {
			saveBtn.disabled = false;
			saveBtn.classList.remove('loading');
		}
		if (saveText) {
			saveText.style.display = 'inline';
		}
		if (saveLoading) {
			saveLoading.style.display = 'none';
			saveLoading.classList.add('d-none');
		}
	}

	// Open reconnect modal
	async function openReconnectModal(id) {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		// Thử check-status trước (có thể tự động connect bằng key nếu có)
		try {
			await window.ApiClient.post('/admin/servers/check-status', {});
			const connected = await window.ApiClient.get('/admin/servers/connected').catch(() => []);
			if (Array.isArray(connected) && connected.includes(id)) {
				await loadServers();
				return;
			}
		} catch (_) { /* ignore */ }

		try {
			const servers = await window.ApiClient.get('/admin/servers');
			const server = Array.isArray(servers) ? servers.find(s => s.id === id) : null;
			
			if (!server) {
				window.showAlert('error', 'Không tìm thấy server');
				return;
			}

			// Fill form
			document.getElementById('reconnect-server-id').value = id || '';
			document.getElementById('reconnect-server-host').value = server.host || '';

			// Update title
			const titleEl = document.getElementById('reconnectServerModalLabel');
			if (titleEl) {
				titleEl.textContent = `🔌 Kết nối lại: ${escapeHtml(server.host || 'Unknown')}`;
			}

			// Clear password
			document.getElementById('reconnect-server-password').value = '';
			hideReconnectServerError();

			// Show modal
			const modalEl = document.getElementById('reconnectServerModal');
			if (modalEl) {
				const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
				modal.show();
			}
		} catch (error) {
			window.showAlert('error', 'Không thể tải thông tin server: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Save reconnect - Save from modal
	async function saveReconnect() {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		hideReconnectServerError();

		const id = document.getElementById('reconnect-server-id').value;
		const passwordEl = document.getElementById('reconnect-server-password');
		const password = passwordEl?.value || '';

		if (!id) {
			showReconnectServerError('ID server không hợp lệ');
			return;
		}

		if (!password) {
			showReconnectServerError('Password không được để trống');
			return;
		}

		// Set loading state
		const saveBtn = document.getElementById('save-reconnect-btn');
		const saveText = document.getElementById('save-reconnect-text');
		const saveLoading = document.getElementById('save-reconnect-loading');
		
		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.classList.add('loading');
		}
		if (saveText) {
			saveText.style.display = 'none';
		}
		if (saveLoading) {
			saveLoading.style.display = 'inline';
			saveLoading.classList.remove('d-none');
		}

		try {
			await window.ApiClient.post(`/admin/servers/${id}/reconnect`, { password: password });
			
			// Close modal
			closeReconnectServerPopup();

			window.showAlert('success', 'Đã kết nối lại thành công');
			await loadServers();
		} catch (error) {
			const errorMsg = error.message || 'Kết nối lại thất bại';
			showReconnectServerError(errorMsg);
			window.showAlert('error', errorMsg);
		} finally {
			// Reset loading state
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.classList.remove('loading');
			}
			if (saveText) {
				saveText.style.display = 'inline';
			}
			if (saveLoading) {
				saveLoading.style.display = 'none';
				saveLoading.classList.add('d-none');
			}
		}
	}

	// Close reconnect server popup
	function closeReconnectServerPopup() {
		const modalEl = document.getElementById('reconnectServerModal');
		if (modalEl) {
			const modal = bootstrap.Modal.getInstance(modalEl);
			if (modal) {
				modal.hide();
			}
		}
		const form = document.getElementById('reconnect-server-form');
		if (form) form.reset();
		hideReconnectServerError();
		
		// Reset loading state
		const saveBtn = document.getElementById('save-reconnect-btn');
		const saveText = document.getElementById('save-reconnect-text');
		const saveLoading = document.getElementById('save-reconnect-loading');
		
		if (saveBtn) {
			saveBtn.disabled = false;
			saveBtn.classList.remove('loading');
		}
		if (saveText) {
			saveText.style.display = 'inline';
		}
		if (saveLoading) {
			saveLoading.style.display = 'none';
			saveLoading.classList.add('d-none');
		}
	}

	// Delete server
	async function deleteServer(id) {
		if (!confirm('Bạn có chắc chắn muốn xóa server này?')) return;
		
		if (!window.ApiClient || typeof window.ApiClient.delete !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		try {
			await window.ApiClient.delete(`/admin/servers/${id}`);
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.server.delete.success') 
				: `Đã xoá máy ${id}`;
			window.showAlert('success', successMsg);
			await loadServers();
		} catch (e) {
			window.showAlert('error', e.message || `Xoá máy ${id} thất bại`);
		}
	}

	// Disconnect server
	async function disconnectServer(id) {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		try {
			await window.ApiClient.post(`/admin/servers/${id}/disconnect`, {});
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.server.disconnect.success') 
				: `Đã ngắt kết nối máy ${id}`;
			window.showAlert('success', successMsg);
			await loadServers();
		} catch (e) {
			window.showAlert('error', e.message || `Ngắt kết nối máy ${id} thất bại`);
		}
	}

	// Check server status
	async function checkServerStatus() {
		const btnCheck = document.getElementById('check-status-btn');

		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
				return;
			}

		if (btnCheck) {
			btnCheck.disabled = true;
			btnCheck.textContent = '⏳ Đang kiểm tra...';
		}

		try {
			await window.ApiClient.post('/admin/servers/check-status', {});
			window.showAlert('success', 'Đã kiểm tra trạng thái máy chủ');
			await loadServers();
		} catch (err) {
			window.showAlert('error', err.message || 'Kiểm tra trạng thái thất bại');
		} finally {
			if (btnCheck) {
				btnCheck.disabled = false;
				btnCheck.textContent = '🔍 Kiểm tra trạng thái';
			}
		}
	}

	// Terminal functions
	function ensureXTerm() {
		if (term) return term;
		const container = document.getElementById('term-output');
		if (!container) return null;
		term = new window.Terminal({
			fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
			fontSize: 14,
			lineHeight: 1.4,
			theme: {
				background: '#FFFFFF',
				foreground: '#1a1a1a',
				cursor: '#003366',
				cursorAccent: '#FFFFFF',
				selection: 'rgba(0, 51, 102, 0.2)',
				black: '#000000',
				red: '#CC0000',
				green: '#00AA00',
				yellow: '#CCAA00',
				blue: '#0066CC',
				magenta: '#CC00CC',
				cyan: '#00AAAA',
				white: '#CCCCCC',
				brightBlack: '#666666',
				brightRed: '#FF5555',
				brightGreen: '#55FF55',
				brightYellow: '#FFFF55',
				brightBlue: '#5555FF',
				brightMagenta: '#FF55FF',
				brightCyan: '#55FFFF',
				brightWhite: '#FFFFFF'
			},
			cursorBlink: true,
			cursorStyle: 'block',
			convertEol: true,
			scrollback: 1000,
			tabStopWidth: 4,
		});
		term.open(container);
		return term;
	}

	function appendTerm(text) {
		const t = ensureXTerm();
		if (!t) return;
		t.write(text);
	}

	function connectTerminal() {
		// Kiểm tra nếu đã kết nối
		if (termWS && termWS.socket && termWS.socket.readyState === WebSocket.OPEN) return;

		// Đóng kết nối cũ nếu có
		if (termWS) {
			try {
				termWS.close();
			} catch (_) { /* ignore */ }
		}

		const passEl = document.getElementById('term-pass');
		const password = passEl ? passEl.value.trim() : '';

		// Reset flag
		termTrySshKey = false;

		// Tạo WSClient mới
		termWS = new window.WSClient('/ws/terminal', {
			onOpen: () => {
				if (password) {
					appendTerm('[client] Connected, opening SSH with password...\n');
					// Nếu có password, gửi cả serverId và password (backend sẽ ưu tiên SSH key, nếu không được thì dùng password)
					termWS.send({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id, password: password });
				} else {
					appendTerm('[client] Connected, trying SSH key...\n');
					// Nếu không có password, thử SSH key trước
					termWS.send({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id });
					termTrySshKey = true;
				}
			},
			onClose: () => {
				appendTerm('\n[client] Disconnected.\n');
			},
			onError: () => {
				appendTerm('\n[client] Connection error.\n');
				if (termTrySshKey) {
					appendTerm('\n⚠️ Không thể kết nối bằng SSH key. Vui lòng nhập mật khẩu và thử lại.\n');
					termTrySshKey = false;
				}
			}
		});

		// Xử lý messages
		termWS.onMessage((data) => {
			let message = '';
			if (typeof data === 'string') {
				message = data;
				appendTerm(data);
			} else if (data && typeof data === 'object') {
				if (data.message) {
					message = data.message;
					appendTerm(data.message);
				} else if (data.data) {
					message = data.data;
					appendTerm(data.data);
				} else {
					message = JSON.stringify(data);
					appendTerm(message);
				}
			} else {
				message = String(data);
				appendTerm(message);
			}

			// Kiểm tra nếu có lỗi về SSH key khi đang thử SSH key và chưa có password
			if (termTrySshKey && !password && message && 
				(message.includes('Missing password') || 
				 message.includes('SSH key not available') ||
				 message.includes('SSH connection failed') ||
				 message.includes('authentication failed'))) {
				appendTerm('\n⚠️ Không thể kết nối bằng SSH key. Vui lòng nhập mật khẩu và nhấn "🔌 Kết nối".\n');
				termTrySshKey = false;
			}
		});

		// Handle terminal input - send keystrokes to server
		const t = ensureXTerm();
		if (t) {
			t.onData((data) => {
				if (termWS && termWS.socket && termWS.socket.readyState === WebSocket.OPEN) {
					termWS.send(data);
				}
			});
		}
	}

	function connectTerminalAuto() {
		// Kiểm tra nếu đã kết nối
		if (termWS && termWS.socket && termWS.socket.readyState === WebSocket.OPEN) return;

		// Đóng kết nối cũ nếu có
		if (termWS) {
			try {
				termWS.close();
			} catch (_) { /* ignore */ }
		}

		// Set flag: đang thử SSH key
		termTrySshKey = true;

		// Tạo WSClient mới
		termWS = new window.WSClient('/ws/terminal', {
			onOpen: () => {
				appendTerm('[client] Connected, trying SSH key authentication first...\n');
				// Ưu tiên thử kết nối bằng SSH key (gửi serverId, không gửi password)
				termWS.send({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id });
			},
			onClose: () => {
				appendTerm('\n[client] Disconnected.\n');
			},
			onError: () => {
				appendTerm('\n[client] Connection error.\n');
				if (termTrySshKey) {
					appendTerm('\n⚠️ Không thể kết nối bằng SSH key. Vui lòng nhập mật khẩu và nhấn "🔌 Kết nối".\n');
					termTrySshKey = false;
				}
			}
		});

		// Xử lý messages
		termWS.onMessage((data) => {
			let message = '';
			if (typeof data === 'string') {
				message = data;
				appendTerm(data);
			} else if (data && typeof data === 'object') {
				if (data.message) {
					message = data.message;
					appendTerm(data.message);
				} else if (data.data) {
					message = data.data;
					appendTerm(data.data);
				} else {
					message = JSON.stringify(data);
					appendTerm(message);
				}
			} else {
				message = String(data);
				appendTerm(message);
			}

			// Kiểm tra nếu có lỗi về SSH key hoặc password
			if (termTrySshKey && message && 
				(message.includes('Missing password') || 
				 message.includes('SSH key not available') ||
				 message.includes('SSH connection failed') ||
				 message.includes('authentication failed'))) {
				appendTerm('\n⚠️ Không thể kết nối bằng SSH key. Vui lòng nhập mật khẩu và nhấn "🔌 Kết nối".\n');
				termTrySshKey = false;
				// Đóng WebSocket để người dùng có thể thử lại với password
				try {
					if (termWS) termWS.close();
				} catch (_) { /* ignore */ }
			}
		});

		// Handle terminal input - send keystrokes to server
		const t = ensureXTerm();
		if (t) {
			t.onData((data) => {
				if (termWS && termWS.socket && termWS.socket.readyState === WebSocket.OPEN) {
					termWS.send(data);
				}
			});
		}
	}

	function openTerminal(id, isConnected) {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		// Fetch server info from API
		window.ApiClient.get('/admin/servers').then(servers => {
			const s = Array.isArray(servers) ? servers.find(s => s.id === id) : null;
			if (!s) {
				window.showAlert('error', 'Không tìm thấy server');
				return;
			}

			// Set terminal info
			termInfo = { host: s.host || '', port: s.port || 22, username: s.username || '', id: s.id };

			// Fill form fields
			const hostEl = document.getElementById('term-host');
			const portEl = document.getElementById('term-port');
			const userEl = document.getElementById('term-user');
			const passEl = document.getElementById('term-pass');
			const titleEl = document.getElementById('terminal-title');
			const outEl = document.getElementById('term-output');

			if (hostEl) hostEl.value = termInfo.host;
			if (portEl) portEl.value = termInfo.port.toString();
			if (userEl) userEl.value = termInfo.username;
			if (passEl) passEl.value = '';
			if (titleEl) titleEl.textContent = `${termInfo.host}:${termInfo.port} (${termInfo.username})`;

			// Clear and reset terminal
			if (outEl) outEl.innerHTML = '';
			if (term) {
				try {
					term.dispose();
				} catch (_) { /* ignore */ }
				term = null;
			}

			// Close existing WebSocket connection
			if (termWS) {
				try {
					termWS.close();
				} catch (_) { /* ignore */ }
				termWS = null;
			}

			// Reset flag
			termTrySshKey = false;

			// Show modal
			const modalEl = document.getElementById('terminalModal');
			if (modalEl) {
				const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
				modal.show();

				// Initialize terminal after modal is shown
				setTimeout(() => {
					const t = ensureXTerm();
					if (t && isConnected) {
						// Auto connect if server is already connected
						setTimeout(() => connectTerminalAuto(), 300);
					}
					// Terminal will automatically resize to fit its container
				}, 100);
			}
		}).catch(err => {
			window.showAlert('error', 'Không thể tải thông tin server: ' + (err.message || 'Lỗi'));
		});
	}

	function closeTerminal() {
		// Close WebSocket connection
		if (termWS) {
			try {
				termWS.close();
			} catch (_) { /* ignore */ }
			termWS = null;
		}

		// Dispose terminal
		if (term) {
			try {
				term.dispose();
			} catch (_) { /* ignore */ }
			term = null;
		}

		// Close modal
		const modalEl = document.getElementById('terminalModal');
		if (modalEl) {
			const modal = bootstrap.Modal.getInstance(modalEl);
			if (modal) {
				modal.hide();
			}
		}

			// Clear terminal info
			termInfo = { host: '', port: 22, username: '', id: null };
			termTrySshKey = false;
		}

	// Toggle accordion
	function toggleAccordion(el) {
		// Support both string ID and element
		if (typeof el === 'string') el = document.getElementById(el);
		if (!el) return;
		
		// If element has class 'accordion', toggle it directly
		// Otherwise, find parent with class 'accordion'
		let accordion = el;
		if (!accordion.classList.contains('accordion')) {
			if (typeof accordion.closest === 'function') {
				accordion = accordion.closest('.accordion');
			} else {
				// Fallback: manual traversal
				let parent = accordion.parentElement;
				while (parent && !parent.classList.contains('accordion')) {
					parent = parent.parentElement;
					if (!parent) break;
				}
				accordion = parent;
			}
		}
		
		if (accordion && accordion.classList) {
			accordion.classList.toggle('open');
		}
	}

	// Update server metrics
	async function updateServerMetrics(serverId) {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			if (window.showAlert) {
				window.showAlert('Lỗi: ApiClient chưa sẵn sàng', 'error');
			}
			return;
		}

		// Tìm server card để hiển thị loading
		const serverCard = document.querySelector(`.server-card[data-server-id="${serverId}"]`);
		const updateBtn = serverCard?.querySelector('button[onclick*="updateServerMetrics"]') 
			|| serverCard?.querySelector(`button[data-server-id="${serverId}"]`);
		const originalBtnText = updateBtn?.textContent || '📊 Cập nhật';
		
		if (updateBtn) {
			updateBtn.disabled = true;
			updateBtn.textContent = '⏳ Đang cập nhật...';
		}

		try {
			const response = await window.ApiClient.post(`/admin/servers/${serverId}/metrics`, {});
			if (response && response.ok) {
				const metrics = response.metrics || {};
				const cpuCores = metrics.cpuCores || '-';
				const ramTotal = metrics.ramTotal || '-';
				const diskTotal = metrics.diskTotal || '-';
				
				// Hiển thị thông báo chi tiết với HTML format
				const message = `📊 <strong>Metrics đã cập nhật:</strong><br>` +
					`• <strong>CPU:</strong> ${escapeHtml(cpuCores)} ${cpuCores !== '-' ? 'cores' : ''}<br>` +
					`• <strong>RAM:</strong> ${escapeHtml(ramTotal)}<br>` +
					`• <strong>DISK:</strong> ${escapeHtml(diskTotal)}`;
				
				if (window.showAlert) {
					window.showAlert('success', message);
				}
				
				// Reload server list to show updated metrics
				loadServers();
			} else {
				if (window.showAlert) {
					window.showAlert('error', response?.message || 'Cập nhật metrics thất bại');
				}
			}
		} catch (error) {
			console.error('Error updating server metrics:', error);
			const errorMsg = error.message || 'Unknown error';
			if (window.showAlert) {
				window.showAlert('error', 'Lỗi cập nhật metrics: ' + escapeHtml(errorMsg));
			}
		} finally {
			if (updateBtn) {
				updateBtn.disabled = false;
				updateBtn.textContent = originalBtnText;
			}
		}
	}

	// Refresh all servers metrics
	async function refreshAllMetrics() {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			if (window.showAlert) {
				window.showAlert('Lỗi: ApiClient chưa sẵn sàng', 'error');
			}
			return;
		}

		const btn = document.getElementById('refresh-all-metrics-btn');
		if (btn) {
			btn.disabled = true;
			btn.textContent = '⏳ Đang cập nhật...';
		}

		try {
			const response = await window.ApiClient.post('/admin/servers/metrics/refresh-all', {});
			if (response && response.ok) {
				const results = response.results || [];
				const successResults = results.filter(r => r.ok === true);
				const failResults = results.filter(r => r.ok === false);
				
				// Tạo thông báo chi tiết với HTML format
				let message = `📊 <strong>Cập nhật metrics hoàn tất!</strong><br><br>`;
				
				// Xử lý số lượng server (số ít/số nhiều)
				const successCount = successResults.length;
				const failCount = failResults.length;
				const successLabel = successCount === 1 ? 'server' : 'servers';
				const failLabel = failCount === 1 ? 'server' : 'servers';
				
				message += `✅ <strong>Thành công:</strong> ${successCount} ${successLabel}`;
				if (failCount > 0) {
					message += `<br>❌ <strong>Thất bại:</strong> ${failCount} ${failLabel}`;
				}
				
				// Hiển thị chi tiết nếu có ít server (tối đa 5 server)
				if (successResults.length > 0 && successResults.length <= 5) {
					message += `<br><br><strong>📋 Chi tiết:</strong><br>`;
					successResults.forEach(r => {
						const metrics = r.metrics || {};
						const cpu = metrics.cpuCores || '-';
						const ram = metrics.ramTotal || '-';
						const disk = metrics.diskTotal || '-';
						const cpuLabel = cpu !== '-' ? ' cores' : '';
						message += `• Server ${escapeHtml(String(r.serverId))}: ` +
							`CPU ${escapeHtml(cpu)}${cpuLabel}, ` +
							`RAM ${escapeHtml(ram)}, ` +
							`DISK ${escapeHtml(disk)}<br>`;
					});
				}
				
				if (window.showAlert) {
					window.showAlert('success', message);
				}
				
				// Reload server list to show updated metrics
				loadServers();
			} else {
				if (window.showAlert) {
					window.showAlert('error', response?.message || 'Cập nhật metrics thất bại');
				}
			}
		} catch (error) {
			console.error('Error refreshing all metrics:', error);
			const errorMsg = error.message || 'Unknown error';
			if (window.showAlert) {
				window.showAlert('error', 'Lỗi cập nhật metrics: ' + escapeHtml(errorMsg));
			}
		} finally {
			if (btn) {
				btn.disabled = false;
				btn.textContent = '📊 Cập nhật Metrics tất cả';
			}
		}
	}

	// Export module
	window.ServersModule = {
		updateServerMetrics: updateServerMetrics,
		refreshAllMetrics: refreshAllMetrics,
		loadServers,
		createServer,
		openAddServerModal: openAddServerModal,
		closeAddServerModal: closeAddServerModal,
		saveAddServer: saveAddServer,
		editServer,
		saveEditServer,
		deleteServer,
		disconnectServer,
		openReconnectModal,
		saveReconnect,
		checkServerStatus,
		openTerminal,
		closeTerminal,
		resetServerForm,
		resetAddServerForm: resetAddServerForm,
		openEditServerPopup,
		closeEditServerPopup,
		closeReconnectServerPopup,
		toggleAccordion
	};

	// Expose global functions for inline onclick handlers
	window.closeTerminal = closeTerminal;
	window.toggleAccordion = toggleAccordion;

	// Auto-init on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	function init() {
		// Add server form (modal)
		const addForm = document.getElementById('add-server-form');
		if (addForm && !addForm.dataset.bound) {
			addForm.dataset.bound = '1';
			addForm.addEventListener('submit', async (e) => {
				e.preventDefault();
				await window.ServersModule.saveAddServer();
			});
		}

		// Old create server form (for backward compatibility if exists)
		const form = document.getElementById('create-server-form');
		if (form && !form.dataset.bound) {
			form.dataset.bound = '1';
			form.addEventListener('submit', createServer);
		}

		const refreshBtn = document.getElementById('refresh-servers-btn');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', loadServers);
		}

		const btnCheck = document.getElementById('check-status-btn');
		if (btnCheck) {
			btnCheck.addEventListener('click', checkServerStatus);
		}

		const refreshAllMetricsBtn = document.getElementById('refresh-all-metrics-btn');
		if (refreshAllMetricsBtn) {
			refreshAllMetricsBtn.addEventListener('click', refreshAllMetrics);
		}

		// Terminal form submit (command input - fallback if xterm not working)
		document.addEventListener('submit', (e) => {
			const f = e.target;
			if (f && f.id === 'term-input-form') {
				e.preventDefault();
				const inp = document.getElementById('term-input');
				if (inp) {
					const val = inp.value.trim();
					if (val && termWS && termWS.socket && termWS.socket.readyState === WebSocket.OPEN) {
						termWS.send(val.endsWith('\n') ? val : (val + '\n'));
						inp.value = '';
					}
				}
			}
		});

		// Terminal connect button
		document.addEventListener('click', (e) => {
			const t = e.target;
			if (t && t.id === 'term-connect-btn') {
				e.preventDefault();
				connectTerminal();
			}
		});

		// Terminal modal events - terminal will automatically resize to fit its container
		const terminalModal = document.getElementById('terminalModal');
		if (terminalModal && !terminalModal.dataset.bound) {
			terminalModal.dataset.bound = '1';
			// Terminal will automatically resize to fit its container when modal is shown
		}

		// Wait for ApiClient to be ready before loading servers
		function waitForApiClient() {
			if (window.ApiClient && typeof window.ApiClient.get === 'function') {
				// Load servers initially
				loadServers();
				
				// Auto-connect servers immediately
				autoConnectServers();
				
				// Set up auto-reconnect interval (every 45 seconds)
				if (autoReconnectInterval) {
					clearInterval(autoReconnectInterval);
				}
				autoReconnectInterval = setInterval(() => {
					autoConnectServers();
				}, 45000); // 45 seconds
				
				// Listen for page events
				if (window.AdminBus && typeof window.AdminBus.on === 'function') {
					window.AdminBus.on('page:servers', () => loadServers());
				}
				if (window.EventBus && typeof window.EventBus.on === 'function') {
					window.EventBus.on('page:server', () => loadServers());
				}
			} else {
				setTimeout(waitForApiClient, 50);
			}
		}
		waitForApiClient();
		
		// Cleanup interval when page unloads
		window.addEventListener('beforeunload', () => {
			if (autoReconnectInterval) {
				clearInterval(autoReconnectInterval);
				autoReconnectInterval = null;
			}
		});
	}

	// Auto-connect servers
	async function autoConnectServers() {
		try {
			await window.ApiClient.post('/admin/servers/check-status', {});
			await loadServers();
		} catch (err) {
			console.debug('[servers.js] Auto-connect servers:', err.message || 'Error');
		}
	}

	// Backward compatibility: expose global functions
	window.loadServers = loadServers;
	window.createServer = (ev) => window.ServersModule.createServer(ev);
	window.saveServer = (id, btn) => window.ServersModule.saveServer?.(id, btn);
	window.deleteServer = (id) => window.ServersModule.deleteServer(id);
	window.disconnectServer = (id) => window.ServersModule.disconnectServer(id);
	window.checkServerStatus = () => window.ServersModule.checkServerStatus();
	window.openTerminal = (id, isConnected) => window.ServersModule.openTerminal(id, isConnected);
})();
