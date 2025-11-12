// Servers Module - Quản lý máy chủ
(function () {
	'use strict';

	// Terminal state (tạm thời giữ trong module này, có thể tách riêng sau)
	let termWS = null; // WSClient instance
	let termInfo = { host: '', port: 22, username: '', id: null };
	let term = null; // xterm instance

	// Auto-reconnect interval (45 seconds)
	let autoReconnectInterval = null;

	// Load servers list
	async function loadServers() {
		const tbodyConn = document.getElementById('servers-connected-tbody');
		const tbodyHist = document.getElementById('servers-history-tbody');
		if (!tbodyConn || !tbodyHist) return;

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

			tbodyConn.innerHTML = '';
			tbodyHist.innerHTML = '';

			(data || []).forEach(s => {
				const tr = document.createElement('tr');
				const isConnected = (connectedIds || []).includes(s.id);
				const statusCell = isConnected
					? `<span class="badge bg-success">CONNECTED</span>`
					: `
						<select class="form-select form-select-sm" data-id="${s.id}" data-field="status">
							<option ${s.status === 'OFFLINE' ? 'selected' : ''}>OFFLINE</option>
							<option ${s.status === 'ONLINE' ? 'selected' : ''}>ONLINE</option>
						</select>`;
				const reconnectOrDisconnect = isConnected
					? `<button class="btn btn-sm btn-outline-danger me-1" onclick="window.ServersModule.disconnectServer(${s.id})">Ngắt kết nối</button>`
					: `<button class="btn btn-sm btn-outline-secondary me-1" onclick="window.ServersModule.promptReconnect(${s.id})">Kết nối lại</button>`;
				tr.innerHTML = `
					<td>${s.id}</td>
					<td><input class="form-control form-control-sm" value="${s.host || ''}" data-id="${s.id}" data-field="host" data-old-host="${s.host || ''}" /></td>
					<td><input type="number" class="form-control form-control-sm" value="${s.port || 22}" data-id="${s.id}" data-field="port" data-old-port="${s.port != null ? s.port : ''}" /></td>
					<td><input class="form-control form-control-sm" value="${s.username || ''}" data-id="${s.id}" data-field="username" data-old-username="${s.username || ''}" /></td>
					<td>${statusCell}</td>
					<td>${s.lastConnected ? new Date(s.lastConnected).toLocaleString() : ''}</td>
					<td class="text-nowrap">
						<button class="btn btn-sm btn-primary me-1" onclick="window.ServersModule.saveServer(${s.id}, this)">Lưu</button>
						<button class="btn btn-sm btn-danger me-1" onclick="window.ServersModule.deleteServer(${s.id})">Xoá</button>
						${reconnectOrDisconnect}
						${isConnected ? `<button class="btn btn-sm btn-dark" onclick="window.ServersModule.openTerminal(${s.id}, true)">CLI</button>` : ''}
					</td>
				`;
				if (isConnected) tbodyConn.appendChild(tr);
				else tbodyHist.appendChild(tr);
			});
		} catch (error) {
			window.showAlert('error', 'Lỗi tải danh sách: ' + (error.message || 'Error'));
			console.error('loadServers error:', error);
		}
	}

	// Create server
	async function createServer(ev) {
		ev.preventDefault();
		const f = ev.target;
		const body = {
			host: f.host.value.trim(),
			port: parseInt(f.port.value, 10) || 22,
			username: f.username.value.trim(),
			password: f.password.value
		};

		const btn = f.querySelector('button[type="submit"]');
		try {
			if (btn) {
				btn.disabled = true;
				btn.textContent = 'Đang thêm...';
			}
			await window.ApiClient.post('/admin/servers', body);
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.server.create.success') 
				: 'Thêm máy chủ thành công';
			window.showAlert('success', successMsg);
			f.reset();
			if (f.port) f.port.value = 22;
			await loadServers();
		} catch (err) {
			window.showAlert('error', err.message || 'Thêm server thất bại');
		} finally {
			if (btn) {
				btn.disabled = false;
				btn.textContent = 'Thêm máy chủ';
			}
		}
	}

	// Save server
	async function saveServer(id, btn) {
		const row = btn ? btn.closest('tr') : null;
		const q = (sel) => row ? row.querySelector(sel) : document.querySelector(sel);
		const hostEl = q(`input[data-id="${id}"][data-field="host"]`);
		const portEl = q(`input[data-id="${id}"][data-field="port"]`);
		const userEl = q(`input[data-id="${id}"][data-field="username"]`);

		if (!hostEl || !portEl || !userEl) {
			window.showAlert('error', 'Không tìm thấy các trường dữ liệu');
			return;
		}

		const host = hostEl.value.trim();
		const port = parseInt(portEl.value, 10);
		const username = userEl.value.trim();

		const oldHost = hostEl.getAttribute('data-old-host') || '';
		const oldPortStr = portEl.getAttribute('data-old-port') || '';
		const oldPort = oldPortStr === '' ? null : parseInt(oldPortStr, 10);
		const oldUsername = userEl.getAttribute('data-old-username') || '';

		const statusSel = q(`select[data-id="${id}"][data-field="status"]`);
		const body = { host, port, username };
		if (statusSel) body.status = statusSel.value;

		try {
			if (btn) btn.disabled = true;
			await window.ApiClient.put(`/admin/servers/${id}`, body);
			const changes = [];
			if (oldHost !== host) changes.push(`host: "${oldHost}" -> "${host}"`);
			if ((oldPort ?? null) !== (isNaN(port) ? null : port)) changes.push(`port: "${oldPort ?? ''}" -> "${isNaN(port) ? '' : port}"`);
			if (oldUsername !== username) changes.push(`username: "${oldUsername}" -> "${username}"`);
			const successMsg = changes.length 
				? `Đã lưu máy ${id}: ${changes.join(', ')}` 
				: ((window.I18n && window.I18n.t) 
					? window.I18n.t('admin.server.update.success') 
					: `Lưu máy ${id} thành công`);
			window.showAlert('success', successMsg);
			await loadServers();
		} catch (e) {
			window.showAlert('error', e.message || `Lưu máy ${id} thất bại`);
		} finally {
			if (btn) btn.disabled = false;
		}
	}

	// Delete server
	async function deleteServer(id) {
		if (!confirm('Xoá server này?')) return;
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

	// Prompt reconnect
	async function promptReconnect(id) {
		// Thử check-status trước (có thể tự động connect bằng key nếu có)
		try {
			await window.ApiClient.post('/admin/servers/check-status', {});
			const connected = await window.ApiClient.get('/admin/servers/connected').catch(() => []);
			if (Array.isArray(connected) && connected.includes(id)) {
				await loadServers();
				return;
			}
		} catch (_) { /* ignore */ }

		const pw = prompt('SSH key không khả dụng hoặc kết nối bằng key thất bại. Nhập mật khẩu để kết nối lại:');
		if (!pw) return;

		try {
			await window.ApiClient.post(`/admin/servers/${id}/reconnect`, { password: pw });
			await loadServers();
			window.showAlert('success', 'Đã kết nối lại thành công');
		} catch (err) {
			window.showAlert('error', err.message || 'Kết nối lại thất bại');
		}
	}

	// Check server status
	async function checkServerStatus() {
		const btnCheck = document.getElementById('btn-check-status');

		if (btnCheck) {
			btnCheck.disabled = true;
			btnCheck.textContent = 'Đang kiểm tra...';
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
				btnCheck.textContent = 'Kiểm tra trạng thái';
			}
		}
	}

	// Terminal functions (tạm thời giữ trong module này)
	function ensureXTerm() {
		if (term) return term;
		const container = document.getElementById('term-output');
		if (!container) return null;
		term = new window.Terminal({
			fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
			fontSize: 13,
			theme: { background: '#0b1020' },
			cursorBlink: true,
			convertEol: true,
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

		// Xử lý messages (có thể là text hoặc JSON)
		termWS.onMessage((data) => {
			// Nếu là string, hiển thị trực tiếp
			if (typeof data === 'string') {
				appendTerm(data);
			} else if (data && typeof data === 'object' && data.message) {
				// Nếu là object có message, hiển thị message
				appendTerm(data.message);
			} else {
				// Fallback: stringify object
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

		// Xử lý messages (có thể là text hoặc JSON)
		termWS.onMessage((data) => {
			// Nếu là string, hiển thị trực tiếp
			if (typeof data === 'string') {
				appendTerm(data);
			} else if (data && typeof data === 'object' && data.message) {
				// Nếu là object có message, hiển thị message
				appendTerm(data.message);
			} else {
				// Fallback: stringify object
				appendTerm(JSON.stringify(data));
			}
		});
	}

	function openTerminal(id, isConnected) {
		const host = document.querySelector(`input[data-id="${id}"][data-field="host"]`)?.value.trim();
		const port = parseInt(document.querySelector(`input[data-id="${id}"][data-field="port"]`)?.value || '22', 10);
		const username = document.querySelector(`input[data-id="${id}"][data-field="username"]`)?.value.trim();
		termInfo = { host, port, username, id };
		const hostEl = document.getElementById('term-host');
		const portEl = document.getElementById('term-port');
		const userEl = document.getElementById('term-user');
		const passEl = document.getElementById('term-pass');
		if (hostEl) hostEl.value = host || '';
		if (portEl) portEl.value = isNaN(port) ? '' : String(port);
		if (userEl) userEl.value = username || '';
		if (passEl) passEl.value = '';
		const title = document.getElementById('terminal-title');
		if (title) title.textContent = `${host || ''}:${port || ''} (${username || ''})`;
		const out = document.getElementById('term-output');
		if (out) out.innerHTML = '';
		if (term) {
			try { term.dispose(); } catch (_) { }
			term = null;
		}
		// Show modal using UI component
		if (window.Modal) {
			window.Modal.show('terminalModal');
		} else {
			// Fallback to Bootstrap
			const modalEl = document.getElementById('terminalModal');
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
					console.error('Error showing terminal modal:', err);
					// Fallback: try to show without options
					const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
					modal.show();
				}
			}
		}
		if (isConnected) {
			setTimeout(() => connectTerminalAuto(), 200);
		}
	}

	// Export module
	window.ServersModule = {
		loadServers,
		createServer,
		saveServer,
		deleteServer,
		disconnectServer,
		promptReconnect,
		checkServerStatus,
		openTerminal
	};

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

		const btnCheck = document.getElementById('btn-check-status');
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

		// Terminal modal close
		document.addEventListener('hidden.bs.modal', (e) => {
			if (e.target && e.target.id === 'terminalModal') {
				try { termWS?.close(); } catch (_) { }
				termWS = null;
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

	// Auto-connect servers (gọi check-status để tự động kết nối các server có thể)
	async function autoConnectServers() {
		try {
			// Gọi check-status để tự động kết nối các server có SSH key
			await window.ApiClient.post('/admin/servers/check-status', {});
			// Load lại danh sách để cập nhật trạng thái
			await loadServers();
		} catch (err) {
			// Không hiển thị lỗi trong auto-connect để tránh spam
			console.debug('[servers.js] Auto-connect servers:', err.message || 'Error');
		}
	}

	// Backward compatibility: expose global functions
	window.loadServers = loadServers;
	window.createServer = (ev) => window.ServersModule.createServer(ev);
	window.saveServer = (id, btn) => window.ServersModule.saveServer(id, btn);
	window.deleteServer = (id) => window.ServersModule.deleteServer(id);
	window.disconnectServer = (id) => window.ServersModule.disconnectServer(id);
	window.promptReconnect = (id) => window.ServersModule.promptReconnect(id);
	window.checkServerStatus = () => window.ServersModule.checkServerStatus();
	window.openTerminal = (id, isConnected) => window.ServersModule.openTerminal(id, isConnected);
})();

