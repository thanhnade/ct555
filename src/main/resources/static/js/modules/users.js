// Users Module - Quản lý người dùng
(function () {
	'use strict';

	// Helper: Get escapeHtml function
	function getEscapeHtml() {
		return window.K8sHelpers?.escapeHtml || ((text) => {
			if (text == null) return '';
			const div = document.createElement('div');
			div.textContent = String(text);
			return div.innerHTML;
		});
	}

	// Helper: Get role badge HTML
	function getRoleBadge(role) {
		const roleMap = {
			'ADMIN': '<span class="badge bg-danger">👑 Admin</span>',
			'USER': '<span class="badge bg-primary">👤 User</span>'
		};
		return roleMap[role] || '<span class="badge bg-secondary">❓ Không xác định</span>';
	}

	// Helper: Get tier badge HTML
	function getTierBadge(tier) {
		const tierMap = {
			'STANDARD': '<span class="badge bg-info">📦 Standard</span>',
			'PREMIUM': '<span class="badge bg-warning">⭐ Premium</span>'
		};
		return tierMap[tier] || '<span class="badge bg-secondary">❓ Không xác định</span>';
	}

	// Helper: Get status badge HTML
	function getStatusBadge(status) {
		const statusMap = {
			'ACTIVE': '<span class="badge bg-success">✅ Active</span>',
			'INACTIVE': '<span class="badge bg-secondary">⏸️ Inactive</span>'
		};
		return statusMap[status] || '<span class="badge bg-secondary">❓ Không xác định</span>';
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
				const roleChip = u.role === 'ADMIN' ? '<span class="chip green">ADMIN</span>' : '<span class="chip blue">USER</span>';
				const statusChip = u.status === 'ACTIVE' ? '<span class="chip green">ACTIVE</span>' : '<span class="chip red">INACTIVE</span>';
				const createdAt = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '-';
				
				tr.innerHTML = `
					const escapeHtml = getEscapeHtml();
					<td><strong>${escapeHtml(u.username || '-')}</strong></td>
					<td>${escapeHtml(u.fullname || '-')}</td>
					<td>${roleChip}</td>
					<td>${statusChip}</td>
					<td>${createdAt}</td>
					<td style="white-space: nowrap;">
						<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.UsersModule.editUser(${u.id})" title="Sửa">✏️</button>
						<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.UsersModule.openResetPasswordModal(${u.id}, '${(u.username || '').replace(/'/g, "\\'")}')" title="Đặt lại mật khẩu">🔑</button>
						<button class="btn" style="padding: 4px 8px; font-size: 12px;" onclick="window.UsersModule.viewActivities(${u.id}, '${(u.username || '').replace(/'/g, "\\'")}')" title="Lịch sử">📋</button>
						<button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="window.UsersModule.deleteUser(${u.id})" title="Xóa">🗑️</button>
					</td>
				`;
				tbody.appendChild(tr);
			});
		} catch (error) {
			if (tbody) {
				const errorMsg = (window.I18n && window.I18n.t) 
					? window.I18n.t('admin.user.loadError') 
					: 'Lỗi tải danh sách';
				tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color: #CC0000; padding: 20px;">${errorMsg}: ${(error.message || 'Error')}</td></tr>`;
			}
			console.error('loadUsers error:', error);
		}
	}

	// Validate form
	function validateUserForm(form) {
		const errors = [];
		
		if (!form) {
			errors.push('Form không tồn tại');
			return errors;
		}
		
		const fullnameEl = form.querySelector('[name="fullname"]') || form.elements?.fullname;
		const fullname = fullnameEl?.value?.trim() || '';
		if (!fullname || fullname.length < 2) {
			errors.push('Họ tên phải có ít nhất 2 ký tự');
		}
		
		const usernameEl = form.querySelector('[name="username"]') || form.elements?.username;
		const username = usernameEl?.value?.trim() || '';
		if (!username || username.length < 3 || username.length > 20) {
			errors.push('Tên đăng nhập phải có từ 3 đến 20 ký tự');
		} else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
			errors.push('Tên đăng nhập chỉ được chứa chữ, số và dấu gạch dưới');
		}
		
		const passwordEl = form.querySelector('[name="password"]') || form.elements?.password;
		const password = passwordEl?.value || '';
		if (!password || password.length < 6) {
			errors.push('Mật khẩu phải có ít nhất 6 ký tự');
		}
		
		const roleEl = form.querySelector('[name="role"]') || form.elements?.role;
		if (!roleEl || !roleEl.value) {
			errors.push('Vui lòng chọn vai trò');
		}
		
		const tierEl = form.querySelector('[name="tier"]') || form.elements?.tier;
		if (!tierEl || !tierEl.value) {
			errors.push('Vui lòng chọn gói dịch vụ');
		}
		
		const statusEl = form.querySelector('[name="status"]') || form.elements?.status;
		if (!statusEl || !statusEl.value) {
			errors.push('Vui lòng chọn trạng thái');
		}
		
		return errors;
	}

	// Show form error
	function showFormError(message) {
		const errorEl = document.getElementById('form-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.display = 'block';
			setTimeout(() => {
				errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}, 100);
		}
	}

	// Hide form error
	function hideFormError() {
		const errorEl = document.getElementById('form-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	// Set form loading state
	function setFormLoading(loading) {
		const submitBtn = document.getElementById('submit-btn');
		const submitText = document.getElementById('submit-text');
		const submitLoading = document.getElementById('submit-loading');
		
		if (submitBtn) {
			submitBtn.disabled = loading;
			if (loading) {
				submitBtn.style.opacity = '0.6';
				submitBtn.style.cursor = 'not-allowed';
			} else {
				submitBtn.style.opacity = '1';
				submitBtn.style.cursor = 'pointer';
			}
		}
		
		if (submitText) submitText.style.display = loading ? 'none' : 'inline';
		if (submitLoading) submitLoading.style.display = loading ? 'inline' : 'none';
	}

	// Create user
	async function createUser(ev) {
		ev.preventDefault();
		
		const form = ev.target;
		
		// Hide previous errors
		hideFormError();
		
		// Validate form
		const validationErrors = validateUserForm(form);
		if (validationErrors.length > 0) {
			showFormError(validationErrors.join('. '));
			return;
		}
		
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			showFormError('ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		// Get form elements safely
		const fullnameEl = form.querySelector('[name="fullname"]') || form.elements?.fullname;
		const usernameEl = form.querySelector('[name="username"]') || form.elements?.username;
		const passwordEl = form.querySelector('[name="password"]') || form.elements?.password;
		const roleEl = form.querySelector('[name="role"]') || form.elements?.role;
		const tierEl = form.querySelector('[name="tier"]') || form.elements?.tier;
		const statusEl = form.querySelector('[name="status"]') || form.elements?.status;
		
		if (!fullnameEl || !usernameEl || !passwordEl || !roleEl || !tierEl || !statusEl) {
			showFormError('Không tìm thấy các trường dữ liệu trong form. Vui lòng tải lại trang.');
			return;
		}
		
		const body = {
			fullname: (fullnameEl.value || '').trim(),
			username: (usernameEl.value || '').trim(),
			password: passwordEl.value || '',
			role: roleEl.value || '',
			tier: tierEl.value || '',
			status: statusEl.value || ''
		};

		// Set loading state
		setFormLoading(true);

		try {
			const response = await window.ApiClient.post('/admin/users', body);
			
			// Success
			hideFormError();
			form.reset();
			
			// Close accordion after success
			const accordion = document.getElementById('user-create-accordion');
			if (accordion) {
				accordion.classList.remove('open');
			}
			
			// Reload users list
			await loadUsers();
			
			const successMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.create.success') 
				: '✅ Thêm người dùng thành công!';
			window.showAlert('success', successMsg);
		} catch (error) {
			// Error handling
			let errorMessage = 'Lỗi tạo người dùng';
			
			if (error.message) {
				errorMessage = error.message;
			} else if (error.response && error.response.data) {
				if (typeof error.response.data === 'string') {
					errorMessage = error.response.data;
				} else if (error.response.data.message) {
					errorMessage = error.response.data.message;
				}
			}
			
			showFormError(errorMessage);
			window.showAlert('error', errorMessage);
		} finally {
			setFormLoading(false);
		}
	}

	// Reset form
	function resetUserForm() {
		const form = document.getElementById('create-user-form');
		if (form) {
			form.reset();
			hideFormError();
			
			// Reset to default values
			form.role.value = 'USER';
			form.tier.value = 'STANDARD';
			form.status.value = 'ACTIVE';
			
			// Focus on first field
			const firstInput = form.querySelector('input');
			if (firstInput) {
				setTimeout(() => firstInput.focus(), 100);
			}
		}
	}

	// Edit user - Load user data and show modal
	async function editUser(id) {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		try {
			const users = await window.ApiClient.get('/admin/users');
			const user = Array.isArray(users) ? users.find(u => u.id === id) : null;
			
			if (!user) {
				window.showAlert('error', 'Không tìm thấy người dùng');
				return;
			}

			// Fill form
			document.getElementById('edit-user-id').value = user.id || '';
			document.getElementById('edit-user-fullname').value = user.fullname || '';
			document.getElementById('edit-user-username').value = user.username || '';
			document.getElementById('edit-user-role').value = user.role || 'USER';
			document.getElementById('edit-user-tier').value = user.tier || 'STANDARD';
			document.getElementById('edit-user-status').value = user.status || 'ACTIVE';

			// Update title
			const titleEl = document.getElementById('edit-user-title');
			if (titleEl) {
				const escapeHtml = getEscapeHtml();
				titleEl.textContent = `✏️ Sửa thông tin: ${escapeHtml(user.username || 'Người dùng')}`;
			}

			// Hide error
			hideEditFormError();

			// Show modal
			if (typeof openEditUserPopup === 'function') {
				openEditUserPopup();
			} else {
				const popup = document.getElementById('editUserPopup');
				if (popup) popup.style.display = 'flex';
			}
		} catch (error) {
			window.showAlert('error', 'Không thể tải thông tin người dùng: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Save edit user - Save from modal
	async function saveEditUser() {
		if (!window.ApiClient || typeof window.ApiClient.put !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		const form = document.getElementById('edit-user-form');
		if (!form) {
			window.showAlert('error', 'Không tìm thấy form');
			return;
		}

		// Hide previous errors
		hideEditFormError();

		// Get form values
		const id = document.getElementById('edit-user-id').value;
		const fullname = document.getElementById('edit-user-fullname').value.trim();
		const role = document.getElementById('edit-user-role').value;
		const tier = document.getElementById('edit-user-tier').value;
		const status = document.getElementById('edit-user-status').value;

		// Validate
		if (!id) {
			showEditFormError('ID người dùng không hợp lệ');
			return;
		}

		if (!fullname || fullname.length < 2) {
			showEditFormError('Họ tên phải có ít nhất 2 ký tự');
			return;
		}

		if (!role) {
			showEditFormError('Vui lòng chọn vai trò');
			return;
		}

		if (!tier) {
			showEditFormError('Vui lòng chọn gói dịch vụ');
			return;
		}

		if (!status) {
			showEditFormError('Vui lòng chọn trạng thái');
			return;
		}

		// Set loading state
		const saveBtn = document.getElementById('save-edit-user-btn');
		const saveText = document.getElementById('save-edit-text');
		const saveLoading = document.getElementById('save-edit-loading');
		
		if (saveBtn) saveBtn.disabled = true;
		if (saveText) saveText.style.display = 'none';
		if (saveLoading) saveLoading.style.display = 'inline';

		try {
			const body = {
				fullname: fullname,
				role: role,
				tier: tier,
				status: status
			};

			await window.ApiClient.put(`/admin/users/${id}`, body);
			
			// Reload users list
			await loadUsers();
			
			// Close modal
			if (typeof closeEditUserPopup === 'function') {
				closeEditUserPopup();
			} else {
				const popup = document.getElementById('editUserPopup');
				if (popup) popup.style.display = 'none';
			}

			const msg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.update.success') 
				: 'Đã cập nhật thông tin người dùng';
			window.showAlert('success', msg);
		} catch (error) {
			const errorMsg = error.message || 'Lỗi cập nhật người dùng';
			showEditFormError(errorMsg);
			window.showAlert('error', errorMsg);
		} finally {
			// Reset loading state
			if (saveBtn) saveBtn.disabled = false;
			if (saveText) saveText.style.display = 'inline';
			if (saveLoading) saveLoading.style.display = 'none';
		}
	}

	// Show edit form error
	function showEditFormError(message) {
		const errorEl = document.getElementById('edit-form-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.display = 'block';
		}
	}

	// Hide edit form error
	function hideEditFormError() {
		const errorEl = document.getElementById('edit-form-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	// Open reset password modal
	async function openResetPasswordModal(id, username) {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		try {
			// Load user info
			const users = await window.ApiClient.get('/admin/users');
			const user = Array.isArray(users) ? users.find(u => u.id === id) : null;
			
			if (!user) {
				window.showAlert('error', 'Không tìm thấy người dùng');
				return;
			}

			// Fill form
			document.getElementById('reset-password-user-id').value = id || '';
			document.getElementById('reset-password-username').value = user.username || username || '';

			// Update title
			const titleEl = document.getElementById('reset-password-title');
			if (titleEl) {
				const escapeHtml = getEscapeHtml();
				titleEl.textContent = `🔑 Đặt lại mật khẩu: ${escapeHtml(user.username || username || 'Người dùng')}`;
			}

			// Clear form
			document.getElementById('reset-password-new').value = '';
			document.getElementById('reset-password-confirm').value = '';
			hideResetPasswordError();

			// Show modal
			const popup = document.getElementById('resetPasswordPopup');
			if (popup) popup.style.display = 'flex';
		} catch (error) {
			window.showAlert('error', 'Không thể tải thông tin người dùng: ' + (error.message || 'Lỗi không xác định'));
		}
	}

	// Save reset password - Save from modal
	async function saveResetPassword() {
		if (!window.ApiClient || typeof window.ApiClient.post !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng. Vui lòng thử lại sau.');
			return;
		}

		// Hide previous errors
		hideResetPasswordError();

		// Get form values
		const id = document.getElementById('reset-password-user-id').value;
		const password = document.getElementById('reset-password-new').value;
		const passwordConfirm = document.getElementById('reset-password-confirm').value;

		// Validate
		if (!id) {
			showResetPasswordError('ID người dùng không hợp lệ');
			return;
		}

		if (!password || password.length < 6) {
			showResetPasswordError('Mật khẩu phải có ít nhất 6 ký tự');
			return;
		}

		if (password !== passwordConfirm) {
			showResetPasswordError('Mật khẩu xác nhận không khớp');
			return;
		}

		// Set loading state
		const saveBtn = document.getElementById('save-reset-password-btn');
		const saveText = document.getElementById('save-reset-text');
		const saveLoading = document.getElementById('save-reset-loading');
		
		if (saveBtn) saveBtn.disabled = true;
		if (saveText) saveText.style.display = 'none';
		if (saveLoading) saveLoading.style.display = 'inline';

		try {
			await window.ApiClient.post(`/admin/users/${id}/reset-password`, { password: password });
			
			// Close modal
			closeResetPasswordPopup();

			window.showAlert('success', 'Đã đặt lại mật khẩu thành công');
		} catch (error) {
			const errorMsg = error.message || 'Lỗi đặt lại mật khẩu';
			showResetPasswordError(errorMsg);
			window.showAlert('error', errorMsg);
		} finally {
			// Reset loading state
			if (saveBtn) saveBtn.disabled = false;
			if (saveText) saveText.style.display = 'inline';
			if (saveLoading) saveLoading.style.display = 'none';
		}
	}

	// Show reset password error
	function showResetPasswordError(message) {
		const errorEl = document.getElementById('reset-password-error');
		if (errorEl) {
			errorEl.textContent = message;
			errorEl.style.display = 'block';
		}
	}

	// Hide reset password error
	function hideResetPasswordError() {
		const errorEl = document.getElementById('reset-password-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	// Close reset password popup
	function closeResetPasswordPopup() {
		const popup = document.getElementById('resetPasswordPopup');
		if (popup) popup.style.display = 'none';
		const form = document.getElementById('reset-password-form');
		if (form) form.reset();
		hideResetPasswordError();
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

			title.textContent = `📈 Lịch sử hoạt động - ${username}`;
			list.innerHTML = '';

			if (!data || data.length === 0) {
				list.innerHTML = '<li style="padding: 12px; color: #666666;">Chưa có lịch sử hoạt động</li>';
			} else {
				(data || []).forEach(a => {
					const li = document.createElement('li');
					li.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid #E0E0E0; color: #333333; font-size: 13px;';
					const date = a.createdAt ? new Date(a.createdAt).toLocaleString('vi-VN') : '';
					const actionBadge = `<span class="chip ${a.action === 'LOGIN' ? 'green' : a.action === 'LOGOUT' ? 'yellow' : 'blue'}" style="margin-right: 8px;">${a.action || ''}</span>`;
					li.innerHTML = `${actionBadge} <strong>${date}</strong> - ${a.details || ''} ${a.ip ? ('<span style="color: #666666;">(' + a.ip + ')</span>') : ''}`;
					list.appendChild(li);
				});
			}

			// Show popup
			if (typeof openActivityPopup === 'function') {
				openActivityPopup();
			} else {
				const popup = document.getElementById('activityPopup');
				if (popup) popup.style.display = 'flex';
			}
		} catch (error) {
			const errorMsg = (window.I18n && window.I18n.t) 
				? window.I18n.t('admin.user.loadError') 
				: 'Lỗi tải lịch sử hoạt động';
			window.showAlert('error', error.message || errorMsg);
		}
	}

	// UI Helper functions
	function toggleAccordion(el) {
		if (typeof el === 'string') el = document.getElementById(el);
		if (!el) return;
		el.classList.toggle('open');
	}

	function closeActivityPopup() {
		const popup = document.getElementById('activityPopup');
		if (popup) popup.style.display = 'none';
	}

	function openActivityPopup() {
		const popup = document.getElementById('activityPopup');
		if (popup) popup.style.display = 'flex';
	}

	function closeEditUserPopup() {
		const popup = document.getElementById('editUserPopup');
		if (popup) popup.style.display = 'none';
		const form = document.getElementById('edit-user-form');
		if (form) form.reset();
		const errorEl = document.getElementById('edit-form-error');
		if (errorEl) {
			errorEl.style.display = 'none';
			errorEl.textContent = '';
		}
	}

	function openEditUserPopup() {
		const popup = document.getElementById('editUserPopup');
		if (popup) popup.style.display = 'flex';
	}

	// Export module
	window.UsersModule = {
		loadUsers,
		createUser,
		editUser,
		saveEditUser,
		deleteUser,
		openResetPasswordModal,
		saveResetPassword,
		closeResetPasswordPopup,
		viewActivities,
		getRoleBadge,
		getTierBadge,
		getStatusBadge,
		resetUserForm,
		validateUserForm,
		showFormError,
		hideFormError,
		showEditFormError,
		hideEditFormError,
		showResetPasswordError,
		hideResetPasswordError,
		toggleAccordion,
		closeActivityPopup,
		openActivityPopup,
		closeEditUserPopup,
		openEditUserPopup
	};

	// Expose global functions for inline onclick handlers
	window.toggleAccordion = toggleAccordion;
	window.closeActivityPopup = closeActivityPopup;
	window.openActivityPopup = openActivityPopup;
	window.closeEditUserPopup = closeEditUserPopup;
	window.openEditUserPopup = openEditUserPopup;
	window.closeResetPasswordPopup = closeResetPasswordPopup;

	// Auto-init on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	// Export users list
	async function exportUsers() {
		if (!window.ApiClient || typeof window.ApiClient.get !== 'function') {
			window.showAlert('error', 'ApiClient chưa sẵn sàng.');
			return;
		}
		
		try {
			const data = await window.ApiClient.get('/admin/users');
			// Convert to CSV
			const headers = ['ID', 'Họ tên', 'Username', 'Role', 'Gói dịch vụ', 'Trạng thái', 'Ngày tạo'];
			const rows = (data || []).map(u => [
				u.id,
				u.fullname || '',
				u.username || '',
				u.role || '',
				u.tier || '',
				u.status || '',
				u.createdAt || ''
			]);
			const csvContent = [
				headers.join(','),
				...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
			].join('\n');
			
			// Download
			const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
			const link = document.createElement('a');
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute('download', `users_${new Date().toISOString().split('T')[0]}.csv`);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			window.showAlert('success', 'Đã xuất danh sách người dùng');
		} catch (error) {
			window.showAlert('error', error.message || 'Lỗi xuất danh sách');
		}
	}

	function init() {
		const form = document.getElementById('create-user-form');
		if (form) {
			form.addEventListener('submit', createUser);
		}

		// Refresh button
		const refreshBtn = document.getElementById('refresh-users-btn');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => loadUsers());
		}

		// Export button
		const exportBtn = document.getElementById('export-users-btn');
		if (exportBtn) {
			exportBtn.addEventListener('click', exportUsers);
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
	window.deleteUser = (id) => window.UsersModule.deleteUser(id);
	window.viewActivities = (id, username) => window.UsersModule.viewActivities(id, username);
	window.resetUserForm = resetUserForm;
})();

