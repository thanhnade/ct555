// Ansible WebSocket Module - Quản lý WebSocket cho Ansible operations (installation, init actions)
(function () {
	'use strict';

	// Trạng thái module
	let ansibleWebSocket = null; // WebSocket cho Ansible installation
	let initActionsWS = null; // WebSocket cho Ansible init actions
	let currentClusterId = null;
	let ansibleLogData = [];

	// Callbacks cho các sự kiện
	let onLogMessage = null; // (type, message) => void
	let onProgress = null; // (percent, message) => void
	let onServerStatus = null; // (server, status, message) => void
	let onComplete = null; // (success, message) => void
	let onOpen = null; // () => void - callback khi WebSocket mở

	// Hàm hỗ trợ: Escape HTML để tránh XSS
	function escapeHtml(text) {
		if (text == null) return '';
		const div = document.createElement('div');
		div.textContent = String(text);
		return div.innerHTML;
	}

	// Kết nối WebSocket cho Ansible installation
	function connectAnsibleWebSocket(clusterId, callbacks = {}) {
		if (!clusterId) {
			console.error('connectAnsibleWebSocket: clusterId là bắt buộc');
			return;
		}

		currentClusterId = clusterId;

		// Lưu callbacks
		onLogMessage = callbacks.onLogMessage || null;
		onProgress = callbacks.onProgress || null;
		onServerStatus = callbacks.onServerStatus || null;
		onComplete = callbacks.onComplete || null;
		onOpen = callbacks.onOpen || null;

		// Đóng kết nối cũ nếu có
		if (ansibleWebSocket && ansibleWebSocket.readyState === WebSocket.OPEN) {
			ansibleWebSocket.close();
		}

		const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
		const wsUrl = `${protocol}://${location.host}/ws/ansible`;

		ansibleWebSocket = new WebSocket(wsUrl);

		ansibleWebSocket.onopen = function (event) {
			if (onLogMessage) {
				onLogMessage('success', '✅ Kết nối WebSocket thành công');
			}
			// Gọi callback onOpen nếu có (để gửi lệnh sau khi WebSocket mở)
			if (onOpen) {
				onOpen();
			}
		};

		ansibleWebSocket.onmessage = function (event) {
			try {
				const data = JSON.parse(event.data);
				handleAnsibleMessage(data);
			} catch (e) {
				console.error('Lỗi parse WebSocket message:', e);
				if (onLogMessage) {
					onLogMessage('error', '❌ Lỗi parse message: ' + (e.message || 'Không xác định'));
				}
			}
		};

		ansibleWebSocket.onclose = function (event) {
			if (onLogMessage) {
				onLogMessage('warning', `⚠️ WebSocket connection closed (Code: ${event.code})`);
			}

			if (event.code !== 1000) { // Not normal closure
				if (onLogMessage) {
					onLogMessage('error', '❌ WebSocket closed unexpectedly');
				}
			}
		};

		ansibleWebSocket.onerror = function (error) {
			if (onLogMessage) {
				onLogMessage('error', '❌ WebSocket error occurred');
			}
		};
	}

	// Gửi lệnh bắt đầu cài đặt Ansible
	function sendInstallationStartCommand(options = {}) {
		if (!ansibleWebSocket || ansibleWebSocket.readyState !== WebSocket.OPEN) {
			if (onLogMessage) {
				onLogMessage('error', '❌ WebSocket không sẵn sàng để gửi lệnh');
			}
			return;
		}

		const sudoPasswords = options.sudoPasswords || {};
		const targetServer = options.targetServer || null;
		const isReinstall = options.isReinstall || false;
		const isUninstall = options.isUninstall || false;

		// Nếu không có sudoPasswords, thử lấy từ DOM
		if (Object.keys(sudoPasswords).length === 0) {
			document.querySelectorAll('.sudo-password-input').forEach(input => {
				const host = input.dataset.host;
				const password = input.value.trim();
				if (password) {
					sudoPasswords[host] = password;
				}
			});
		}

		// Kiểm tra xem có server nào có sudo NOPASSWD không
		let hasNopasswdServers = false;
		document.querySelectorAll('.form-control-plaintext.text-success').forEach(() => {
			hasNopasswdServers = true;
		});

		const hasPassword = Object.keys(sudoPasswords).length > 0;

		// Nếu không có mật khẩu và không có server nào có sudo NOPASSWD
		if (!hasPassword && !hasNopasswdServers) {
			if (onLogMessage) {
				onLogMessage('error', '❌ Vui lòng nhập mật khẩu sudo cho MASTER server hoặc cấu hình sudo NOPASSWD');
			}
			return;
		}

		const message = {
			action: 'start_ansible_install',
			clusterId: currentClusterId,
			sudoPasswords: sudoPasswords,
			targetServer: targetServer,
			isReinstall: isReinstall,
			isUninstall: isUninstall
		};

		ansibleWebSocket.send(JSON.stringify(message));
		if (onLogMessage) {
			onLogMessage('info', '📤 Đã gửi lệnh cài đặt đến server');
		}
	}

	// Xử lý message từ Ansible WebSocket
	function handleAnsibleMessage(data) {
		switch (data.type) {
			case 'connected':
				// Server đã thông báo trạng thái kết nối; bỏ qua để tránh trùng lặp với log onopen
				break;

			case 'start':
				if (onLogMessage) {
					onLogMessage('info', '🚀 ' + (data.message || 'Bắt đầu...'));
				}
				if (onProgress) {
					onProgress(0, 'Bắt đầu...');
				}
				break;

			case 'info':
				if (onLogMessage) {
					onLogMessage('info', 'ℹ️ ' + (data.message || ''));
				}
				break;

			case 'server_start':
				if (onLogMessage) {
					onLogMessage('info', `🔄 [${data.progress || 0}%] Bắt đầu cài đặt trên ${data.server || ''}`);
				}
				if (onServerStatus) {
					onServerStatus(data.server || '', 'running', data.message || '');
				}
				break;

			case 'server_success':
				if (onLogMessage) {
					onLogMessage('success', data.message || 'Thành công');
				}
				if (onServerStatus) {
					let successMsg = 'Thành công';
					const m = (data && data.message) ? String(data.message).toLowerCase() : '';
					if (m.includes('gỡ') || m.includes('uninstall')) successMsg = 'Gỡ cài đặt thành công';
					else if (m.includes('cài đặt') || m.includes('install')) successMsg = 'Cài đặt thành công';
					onServerStatus(data.server || '', 'success', successMsg);
				}
				if (onProgress && data.progress !== undefined) {
					onProgress(data.progress, data.message || '');
				}
				break;

			case 'server_error':
				if (onLogMessage) {
					onLogMessage('error', '❌ ' + (data.message || 'Lỗi'));
				}
				if (onServerStatus) {
					onServerStatus(data.server || '', 'error', data.message || 'Lỗi');
				}
				if (onProgress && data.progress !== undefined) {
					onProgress(data.progress, data.message || '');
				}
				break;

			case 'progress':
				if (onProgress) {
					onProgress(data.progress || 0, data.message || '');
				}
				if (onLogMessage && data.message) {
					onLogMessage('info', `📊 [${data.progress || 0}%] ${data.message}`);
				}
				break;

			case 'output':
				if (onLogMessage) {
					onLogMessage('info', data.output || '');
				}
				break;

			case 'complete':
				if (onComplete) {
					onComplete(data.success || false, data.message || '');
				}
				if (onLogMessage) {
					if (data.success) {
						onLogMessage('success', '✅ ' + (data.message || 'Hoàn thành'));
					} else {
						onLogMessage('error', '❌ ' + (data.message || 'Thất bại'));
					}
				}
				break;

			default:
				if (onLogMessage && data.message) {
					onLogMessage('info', data.message);
				}
				break;
		}
	}

	// Đóng kết nối Ansible WebSocket
	function closeAnsibleWebSocket() {
		if (ansibleWebSocket) {
			ansibleWebSocket.close();
			ansibleWebSocket = null;
		}
	}

	// Chạy Ansible init action qua WebSocket
	function runInitActionWS(action, clusterId, options = {}) {
		if (!clusterId) {
			console.error('runInitActionWS: clusterId là bắt buộc');
			return;
		}

		const host = options.host || null;
		const sudoPassword = options.sudoPassword || null;
		const onLog = options.onLog || null; // (line) => void
		const onLogBlock = options.onLogBlock || null; // (text) => void
		const needSudo = options.needSudo !== undefined ? options.needSudo : 
		                (action === 'init_structure' || action === 'init_config' || action === 'init_sshkey');

		// Đóng kết nối cũ nếu có
		try {
			if (initActionsWS) {
				initActionsWS.close();
			}
		} catch (_) {}

		const protocol = (location.protocol === 'https:') ? 'wss' : 'ws';
		initActionsWS = new WebSocket(`${protocol}://${location.host}/ws/ansible`);

		initActionsWS.onopen = () => {
			const payload = { action, clusterId, host };
			if (needSudo && sudoPassword) {
				payload.sudoPassword = sudoPassword;
			}
			if (action === 'init_sshkey' && needSudo && sudoPassword && onLog) {
				onLog('🔒 Sẽ dùng mật khẩu MASTER này làm SSH mật khẩu lần đầu cho WORKER khi chưa có key.');
			}
			initActionsWS.send(JSON.stringify(payload));
		};

		initActionsWS.onmessage = (event) => {
			const raw = typeof event.data === 'string' ? event.data : '';
			
			// Thử parse JSON
			try {
				const data = JSON.parse(raw);
				if (data && typeof data === 'object') {
					if (data.type === 'terminal_output') {
						if (onLogBlock) {
							onLogBlock(data.output || '');
						}
						return;
					}
					if (data.type === 'terminal_prompt') {
						const line = `[${data.server || ''}] ${data.prompt || ''}${data.command || ''}`.trim();
						if (onLog) {
							onLog(line);
						}
						return;
					}
					if (data.type === 'step') {
						const line = `[${data.server || ''}] Bước ${data.step}: ${data.message || ''}`;
						if (onLog) {
							onLog(line);
						}
						return;
					}
					if (data.message) {
						if (onLog) {
							onLog(data.message);
						}
						return;
					}
				}
			} catch (_) {
				// Thử sanitize và parse lại
				try {
					const sanitized = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
					const data2 = JSON.parse(sanitized);
					if (data2 && typeof data2 === 'object') {
						if (data2.type === 'terminal_output') {
							if (onLogBlock) {
								onLogBlock(data2.output || '');
							}
						} else if (data2.type === 'terminal_prompt') {
							const line = `[${data2.server || ''}] ${data2.prompt || ''}${data2.command || ''}`.trim();
							if (onLog) {
								onLog(line);
							}
						} else if (data2.type === 'step') {
							const line = `[${data2.server || ''}] Bước ${data2.step}: ${data2.message || ''}`;
							if (onLog) {
								onLog(line);
							}
						} else if (data2.message) {
							if (onLog) {
								onLog(data2.message);
							}
						}
					}
				} catch (_) {
					// Fallback: hiển thị raw text
					if (onLog) {
						onLog(raw);
					}
				}
			}
		};

		initActionsWS.onerror = (error) => {
			if (onLog) {
				onLog('❌ WebSocket error occurred');
			}
		};

		initActionsWS.onclose = (event) => {
			if (onLog) {
				onLog(`⚠️ WebSocket closed (Code: ${event.code})`);
			}
		};
	}

	// Đóng kết nối init actions WebSocket
	function closeInitActionsWS() {
		if (initActionsWS) {
			initActionsWS.close();
			initActionsWS = null;
		}
	}

	// Export module để sử dụng từ bên ngoài
	window.AnsibleWebSocketModule = {
		connectAnsibleWebSocket,
		sendInstallationStartCommand,
		closeAnsibleWebSocket,
		runInitActionWS,
		closeInitActionsWS,
		setCurrentClusterId: (id) => { currentClusterId = id; },
		getCurrentClusterId: () => currentClusterId
	};

	// Tương thích ngược: expose các hàm global
	window.connectAnsibleWebSocket = (clusterId, callbacks) => 
		window.AnsibleWebSocketModule.connectAnsibleWebSocket(clusterId, callbacks);
	window.sendInstallationStartCommand = (options) => 
		window.AnsibleWebSocketModule.sendInstallationStartCommand(options);
	window.closeAnsibleWebSocket = () => window.AnsibleWebSocketModule.closeAnsibleWebSocket();
	window.runInitActionWS = (action, clusterId, options) => 
		window.AnsibleWebSocketModule.runInitActionWS(action, clusterId, options);
	window.closeInitActionsWS = () => window.AnsibleWebSocketModule.closeInitActionsWS();
})();

