// Users Module - Quản lý người dùng
(function () {
	'use strict';

	// Helper: Get role badge HTML
	function getRoleBadge(role) {
		const roleMap = {
			'ADMIN': '<span class="badge bg-primary">👑 Admin</span>',
			'OPERATOR': '<span class="badge bg-warning">⚙️ Operator</span>',
			'VIEWER': '<span class="badge bg-info">👁️ Viewer</span>',
			'CLIENT': '<span class="badge bg-secondary">👤 Client</span>'
		};
		return roleMap[role] || '<span class="badge bg-secondary">❓ Không xác định</span>';
	}

	// Load users list
	async function loadUsers() {
		const tbody = document.getElementById('users-tbody');
		if (!tbody) return;

		// Ensure ApiClient is loaded
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			console.error('ApiClient not available. Waiting for it to load...');
			setTimeout(loadUsers, 100);
			return;
		}

		try {
			const data = await window.ApiClient.get('/admin/users');
			tbody.innerHTML = '';

			(data || []).forEach(u => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td>${u.id}</td>
					<td>${u.username}</td>
					<td>
						<select class="form-select form-select-sm" data-id="${u.id}" data-field="role">
							<option ${u.role === 'CLIENT' ? 'selected' : ''}>CLIENT</option>
							<option ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
						</select>
					</td>
					<td><input type="number" class="form-control form-control-sm" min="100" step="1" value="${u.dataLimitMb}" data-id="${u.id}" data-field="dataLimitMb" /></td>
					<td><input type="text" class="form-control form-control-sm" value="${u.pathOnServer || ''}" placeholder="/data/${u.username}" data-id="${u.id}" data-field="pathOnServer" /></td>
					<td class="text-nowrap">
						<button class="btn btn-sm btn-primary me-1" onclick="window.UsersModule.saveUser(${u.id})">Lưu</button>
						<button class="btn btn-sm btn-warning me-1" onclick="window.UsersModule.promptReset(${u.id})">Đặt lại mật khẩu</button>
						<button class="btn btn-sm btn-danger" onclick="window.UsersModule.deleteUser(${u.id})">Xoá</button>
					</td>
					<td><button class="btn btn-sm btn-outline-secondary" onclick="window.UsersModule.viewActivities(${u.id}, '${(u.username || '').replace(/'/g, "\\'")}')">Lịch sử</button></td>
				`;
				tbody.appendChild(tr);
			});
		} catch (error) {
			if (tbody) {
				const errorMsg = (window.I18n && window.I18n.t) 
					? window.I18n.t('admin.user.loadError') 
					: 'Lỗi tải danh sách';
				tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${errorMsg}: ${(error.message || 'Error')}</td></tr>`;
			}
			console.error('loadUsers error:', error);
		}
	}

	// Create user
	async function createUser(ev) {
		ev.preventDefault();
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		const form = ev.target;
		const body = {
			username: form.username.value.trim(),
			password: form.password.value,
			role: form.role.value,
			dataLimitMb: parseInt(form.dataLimitMb.value, 10) || 1024,
			pathOnServer: form.pathOnServer.value.trim() || null
		};

		try {
			await window.ApiClient.post('/admin/users', body);
			form.reset();
			await loadUsers();
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.create.success') 
				: 'Thêm người dùng thành công!';
			window.showAlert('success', successMsg);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi tạo người dùng');
		}
	}

	// Save user
	async function saveUser(id) {
		if (!window.ApiClient || typeof window.ApiClient.put !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		const selRole = document.querySelector(`select[data-id="${id}"][data-field="role"]`);
		const inpQuota = document.querySelector(`input[data-id="${id}"][data-field="dataLimitMb"]`);
		const inpPath = document.querySelector(`input[data-id="${id}"][data-field="pathOnServer"]`);

		if (!selRole || !inpQuota || !inpPath) {
			window.showAlert('error', 'Không tìm thấy các trường dữ liệu');
			return;
		}

		const body = {
			role: selRole.value,
			dataLimitMb: parseInt(inpQuota.value, 10),
			pathOnServer: inpPath.value.trim()
		};

		try {
			await window.ApiClient.put(`/admin/users/${id}`, body);
			await loadUsers();
			const msg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.update.success') 
				: 'Đã cập nhật người dùng';
			window.showAlert('success', msg);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi cập nhật người dùng');
		}
	}

	// Prompt reset password
	async function promptReset(id) {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		const pw = prompt('Nhập mật khẩu mới:');
		if (!pw) return;

		try {
			await window.ApiClient.post(`/admin/users/${id}/reset-password`, { password: pw });
			window.showAlert('success', 'Đã đặt lại mật khẩu');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi đặt lại mật khẩu');
		}
	}

	// Delete user
	async function deleteUser(id) {
		if (!window.ApiClient || typeof window.ApiClient.delete !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		if (!confirm('Xóa người dùng này?\n\nCảnh báo: Sẽ xóa luôn namespace của user và toàn bộ tài nguyên còn lại trong namespace đó trên các cluster liên quan.')) {
			return;
		}

		try {
			await window.ApiClient.delete(`/admin/users/${id}`);
			await loadUsers();
			const msg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.delete.success') 
				: 'Đã xóa người dùng';
			window.showAlert('success', msg);
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi xóa người dùng');
		}
	}

	// View activities
	async function viewActivities(id, username) {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		try {
			const data = await window.ApiClient.get(`/admin/users/${id}/activities`);
			const list = document.getElementById('activity-list');
			const title = document.getElementById('activity-title');
			if (!list || !title) return;

			title.textContent = `📈 Lịch sử - ${username}`;
			list.innerHTML = '';

			(data || []).forEach(a => {
				const li = document.createElement('li');
				li.className = 'list-group-item';
				li.textContent = `${a.createdAt || ''} - ${a.action || ''}: ${a.details || ''} ${a.ip ? ('(' + a.ip + ')') : ''}`;
				list.appendChild(li);
			});

			// Show modal using UI component
			if (window.Modal) {
				window.Modal.show('activityModal');
			} else {
				// Fallback to Bootstrap
				const modalEl = document.getElementById('activityModal');
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
						console.error('Error showing activity modal:', err);
						// Fallback: try to show without options
						const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
						modal.show();
					}
				}
			}
		} catch (error) {
			const errorMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.loadError') 
				: 'Lỗi tải lịch sử hoạt động';
			window.showAlert('error', error.message || errorMsg);
		}
	}

	// Export module
	window.UsersModule = {
		loadUsers,
		createUser,
		saveUser,
		deleteUser,
		promptReset,
		viewActivities,
		getRoleBadge
	};

	// Auto-init on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	function init() {
		const form = document.getElementById('create-user-form');
		if (form) {
			form.addEventListener('submit', createUser);
		}

		// Wait for ApiClient to be ready before loading users
		function waitForApiClient() {
			if (window.ApiClient && typeof window.ApiClient.get === 'function') {
				loadUsers();
				// Listen for page events
				if (window.AdminBus && typeof window.AdminBus.on === 'function') {
					window.AdminBus.on('page:users', () => loadUsers());
				}
				if (window.EventBus && typeof window.EventBus.on === 'function') {
					window.EventBus.on('page:user', () => loadUsers());
				}
			} else {
				setTimeout(waitForApiClient, 50);
			}
		}
		waitForApiClient();
	}

	// Backward compatibility: expose global functions
	window.loadUsers = loadUsers;
	window.createUser = createUser;
	window.saveUser = (id) => window.UsersModule.saveUser(id);
	window.deleteUser = (id) => window.UsersModule.deleteUser(id);
	window.promptReset = (id) => window.UsersModule.promptReset(id);
	window.viewActivities = (id, username) => window.UsersModule.viewActivities(id, username);
})();

