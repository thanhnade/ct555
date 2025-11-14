// Servers Module - Quản lý máy chủ
(function () {
	'use strict';

	// Terminal state (tạm thời giữ trong module này, có thể tách riêng sau)
	let termWS = null; // WSClient instance
	let termInfo = { host: '', port: 22, username: '', id: null };
	let term = null; // xterm instance

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
		const tbody = document.getElementById('servers-tbody');
		if (!tbody) return;

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

			tbody.innerHTML = '';

			if (!data || data.length === 0) {
				tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color: #666666; padding: 20px;">Chưa có server nào</td></tr>`;
				return;
			}

			(data || []).forEach(s => {
				const tr = document.createElement('tr');
				const isConnected = (connectedIds || []).includes(s.id);
				const statusChip = isConnected
					? '<span class="chip green">CONNECTED</span>'
					: (s.status === 'ONLINE' 
						? '<span class="chip blue">ONLINE</span>' 
						: '<span class="chip red">OFFLINE</span>');
				
				const reconnectOrDisconnect = isConnected
					? `<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.ServersModule.disconnectServer(${s.id})" title="Ngắt kết nối">🔌</button>`
					: `<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.ServersModule.openReconnectModal(${s.id})" title="Kết nối lại">🔌</button>`;
				
				tr.innerHTML = `
					<td><strong>${escapeHtml(s.host || '-')}</strong></td>
					<td>${s.port || 22}</td>
					<td>${escapeHtml(s.username || '-')}</td>
					<td>${statusChip}</td>
					<td style="white-space: nowrap;">
						<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.ServersModule.editServer(${s.id})" title="Sửa">✏️</button>
						${reconnectOrDisconnect}
						${isConnected ? `<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.ServersModule.openTerminal(${s.id}, true)" title="Terminal">💻</button>` : ''}
						<button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="window.ServersModule.deleteServer(${s.id})" title="Xóa">🗑️</button>
					</td>
				`;
				tbody.appendChild(tr);
			});
		} catch (error) {
			if (tbody) {
				const errorMsg = (window.I18n && window.I18n.t) 
					? window.I18n.t('admin.server.loadError') 
					: 'Lỗi tải danh sách';
				tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color: #CC0000; padding: 20px;">${errorMsg}: ${(error.message || 'Error')}</td></tr>`;
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

	// Create server
	async function createServer(ev) {
		ev.preventDefault();
		
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		const form = ev.target;
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

		const body = {
			host: (hostEl?.value || '').trim(),
			port: parseInt(portEl?.value || '22', 10),
			username: (usernameEl?.value || '').trim(),
			password: passwordEl?.value || ''
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
			document.getElementById('edit-server-status').value = server.status || 'OFFLINE';

			// Clear password
			document.getElementById('edit-server-password').value = '';

			// Update title
			const titleEl = document.getElementById('edit-server-title');
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
		const statusEl = form.querySelector('[name="status"]') || form.elements?.status;

		const body = {
			host: (hostEl?.value || '').trim(),
			port: parseInt(portEl?.value || '22', 10),
			username: (usernameEl?.value || '').trim(),
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
		
		if (saveBtn) saveBtn.disabled = true;
		if (saveText) saveText.style.display = 'none';
		if (saveLoading) saveLoading.style.display = 'inline';

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
			if (saveBtn) saveBtn.disabled = false;
			if (saveText) saveText.style.display = 'inline';
			if (saveLoading) saveLoading.style.display = 'none';
		}
	}

	// Open edit server popup
	function openEditServerPopup() {
		const popup = document.getElementById('editServerPopup');
		if (popup) popup.style.display = 'flex';
	}

	// Close edit server popup
	function closeEditServerPopup() {
		const popup = document.getElementById('editServerPopup');
		if (popup) popup.style.display = 'none';
		const form = document.getElementById('edit-server-form');
		if (form) form.reset();
		hideEditServerError();
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
			const titleEl = document.getElementById('reconnect-server-title');
			if (titleEl) {
				titleEl.textContent = `🔌 Kết nối lại: ${escapeHtml(server.host || 'Unknown')}`;
			}

			// Clear password
			document.getElementById('reconnect-server-password').value = '';
			hideReconnectServerError();

			// Show modal
			const popup = document.getElementById('reconnectServerPopup');
			if (popup) popup.style.display = 'flex';
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
		
		if (saveBtn) saveBtn.disabled = true;
		if (saveText) saveText.style.display = 'none';
		if (saveLoading) saveLoading.style.display = 'inline';

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
			if (saveBtn) saveBtn.disabled = false;
			if (saveText) saveText.style.display = 'inline';
			if (saveLoading) saveLoading.style.display = 'none';
		}
	}

	// Close reconnect server popup
	function closeReconnectServerPopup() {
		const popup = document.getElementById('reconnectServerPopup');
		if (popup) popup.style.display = 'none';
		const form = document.getElementById('reconnect-server-form');
		if (form) form.reset();
		hideReconnectServerError();
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

		// Tạo WSClient mới
		termWS = new window.WSClient('/ws/terminal', {
			onOpen: () => {
				appendTerm('[client] Connected, opening SSH...\n');
				const passEl = document.getElementById('term-pass');
				if (passEl) {
					const pass = passEl.value || '';
					termWS.send({ host: termInfo.host, port: termInfo.port, username: termInfo.username, password: pass });
				} else {
					termWS.send({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id });
				}
			},
			onClose: () => {
				appendTerm('\n[client] Disconnected.\n');
			},
			onError: () => {
				appendTerm('\n[client] Error.\n');
			}
		});

		// Xử lý messages
		termWS.onMessage((data) => {
			if (typeof data === 'string') {
				appendTerm(data);
			} else if (data && typeof data === 'object' && data.message) {
				appendTerm(data.message);
			} else {
				appendTerm(JSON.stringify(data));
			}
		});
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

		// Tạo WSClient mới
		termWS = new window.WSClient('/ws/terminal', {
			onOpen: () => {
				appendTerm('[client] Connected, opening SSH (auto) ...\n');
				termWS.send({ host: termInfo.host, port: termInfo.port, username: termInfo.username, serverId: termInfo.id });
			},
			onClose: () => {
				appendTerm('\n[client] Disconnected.\n');
			},
			onError: () => {
				appendTerm('\n[client] Error.\n');
			}
		});

		// Xử lý messages
		termWS.onMessage((data) => {
			if (typeof data === 'string') {
				appendTerm(data);
			} else if (data && typeof data === 'object' && data.message) {
				appendTerm(data.message);
			} else {
				appendTerm(JSON.stringify(data));
			}
		});
	}

	function openTerminal(id, isConnected) {
		// Get server info from current table
		const rows = document.querySelectorAll('#servers-tbody tr');
		let server = null;
		for (const row of rows) {
			const hostCell = row.querySelector('td:first-child strong');
			if (hostCell) {
				// Try to find server by checking all servers
				// For now, we'll fetch from API
			}
		}

		// Fetch server info from API
		window.ApiClient.get('/admin/servers').then(servers => {
			const s = Array.isArray(servers) ? servers.find(s => s.id === id) : null;
			if (!s) {
				window.showAlert('error', 'Không tìm thấy server');
				return;
			}

			termInfo = { host: s.host, port: s.port || 22, username: s.username, id: s.id };
			const hostEl = document.getElementById('term-host');
			const portEl = document.getElementById('term-port');
			const userEl = document.getElementById('term-user');
			const passEl = document.getElementById('term-pass');
			if (hostEl) hostEl.value = s.host || '';
			if (portEl) portEl.value = (s.port || 22).toString();
			if (userEl) userEl.value = s.username || '';
			if (passEl) passEl.value = '';
			const title = document.getElementById('terminal-title');
			if (title) title.textContent = `${s.host || ''}:${s.port || 22} (${s.username || ''})`;
			const out = document.getElementById('term-output');
			if (out) out.innerHTML = '';
			if (term) {
				try { term.dispose(); } catch (_) { }
				term = null;
			}
			
			// Show modal
			const modal = document.getElementById('terminalModal');
			if (modal) modal.style.display = 'flex';
			
			if (isConnected) {
				setTimeout(() => connectTerminalAuto(), 200);
			}
		}).catch(err => {
			window.showAlert('error', 'Không thể tải thông tin server: ' + (err.message || 'Lỗi'));
		});
	}

	function closeTerminal() {
		const modal = document.getElementById('terminalModal');
		if (modal) modal.style.display = 'none';
		try { termWS?.close(); } catch (_) { }
		termWS = null;
		if (term) {
			try { term.dispose(); } catch (_) { }
			term = null;
		}
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

	// Export module
	window.ServersModule = {
		loadServers,
		createServer,
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
		const form = document.getElementById('create-server-form');
		if (form) {
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

		// Terminal form submit
		document.addEventListener('submit', (e) => {
			const f = e.target;
			if (f && f.id === 'term-input-form') {
				e.preventDefault();
				const inp = document.getElementById('term-input');
				const val = inp.value;
				if (val && termWS && termWS.socket && termWS.socket.readyState === WebSocket.OPEN) {
					termWS.send(val.endsWith('\n') ? val : (val + '\n'));
				} else if (val && term) {
					term.write(val + '\r\n');
				}
				if (inp) inp.value = '';
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
