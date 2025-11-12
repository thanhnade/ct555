// Toast Component - Success/error/info notifications with timeout
(function () {
	'use strict';

	/**
	 * ToastManager - Manages toast notifications
	 */
	class ToastManager {
		constructor(options = {}) {
			this.options = {
				position: options.position || 'top-end', // top-start, top-center, top-end, bottom-start, bottom-center, bottom-end
				containerId: options.containerId || 'toast-container',
				defaultDuration: options.defaultDuration || 5000,
				...options
			};

			this.container = null;
			this.toasts = new Map(); // id -> toast element
			this._init();
		}

		_init() {
			// Get or create container
			this.container = document.getElementById(this.options.containerId);
			if (!this.container) {
				this.container = document.createElement('div');
				this.container.id = this.options.containerId;
				this.container.className = `toast-container position-fixed p-3`;
				this._setPosition(this.options.position);
				this.container.style.zIndex = '9999';
				document.body.appendChild(this.container);
			}
		}

		_setPosition(position) {
			const [vertical, horizontal] = position.split('-');
			this.container.style[vertical] = '20px';
			if (horizontal === 'start') {
				this.container.style.left = '20px';
			} else if (horizontal === 'center') {
				this.container.style.left = '50%';
				this.container.style.transform = 'translateX(-50%)';
			} else { // end
				this.container.style.right = '20px';
			}
		}

		/**
		 * Show a toast notification
		 */
		show(message, type = 'info', options = {}) {
			const {
				title = null,
				duration = this.options.defaultDuration,
				persistent = false,
				onClose = null
			} = options;

			// Generate unique ID
			const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

			// Type mapping
			const typeMap = {
				success: { bg: 'bg-success', icon: 'bi-check-circle-fill', text: 'Thành công' },
				error: { bg: 'bg-danger', icon: 'bi-x-circle-fill', text: 'Lỗi' },
				warning: { bg: 'bg-warning', icon: 'bi-exclamation-triangle-fill', text: 'Cảnh báo' },
				info: { bg: 'bg-info', icon: 'bi-info-circle-fill', text: 'Thông tin' }
			};

			const typeConfig = typeMap[type] || typeMap.info;

			// Create toast element
			const toast = document.createElement('div');
			toast.id = id;
			toast.className = 'toast align-items-center text-white border-0';
			toast.setAttribute('role', 'alert');
			toast.setAttribute('aria-live', 'assertive');
			toast.setAttribute('aria-atomic', 'true');
			toast.innerHTML = `
				<div class="d-flex">
					<div class="toast-body ${typeConfig.bg} text-white">
						${title ? `<strong>${title}</strong><br>` : ''}
						<i class="bi ${typeConfig.icon} me-2"></i>${message}
					</div>
					<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
				</div>
			`;

			// Initialize Bootstrap toast
			const bsToast = new bootstrap.Toast(toast, {
				autohide: !persistent,
				delay: persistent ? 0 : duration
			});

			// Handle close
			toast.addEventListener('hidden.bs.toast', () => {
				toast.remove();
				this.toasts.delete(id);
				if (onClose) onClose();
			});

			// Append to container
			this.container.appendChild(toast);
			this.toasts.set(id, toast);

			// Show toast
			bsToast.show();

			return { id, toast, bsToast };
		}

		/**
		 * Show success toast
		 */
		success(message, options = {}) {
			return this.show(message, 'success', options);
		}

		/**
		 * Show error toast
		 */
		error(message, options = {}) {
			return this.show(message, 'error', options);
		}

		/**
		 * Show warning toast
		 */
		warning(message, options = {}) {
			return this.show(message, 'warning', options);
		}

		/**
		 * Show info toast
		 */
		info(message, options = {}) {
			return this.show(message, 'info', options);
		}

		/**
		 * Hide a toast by ID
		 */
		hide(id) {
			const toast = this.toasts.get(id);
			if (toast) {
				const bsToast = bootstrap.Toast.getInstance(toast);
				if (bsToast) {
					bsToast.hide();
				}
			}
		}

		/**
		 * Hide all toasts
		 */
		hideAll() {
			this.toasts.forEach((toast) => {
				const bsToast = bootstrap.Toast.getInstance(toast);
				if (bsToast) {
					bsToast.hide();
				}
			});
		}
	}

	// Create global instance
	const defaultToastManager = new ToastManager();

	/**
	 * Global toast functions (backward compatibility with showAlert)
	 */
	function showToast(message, type = 'info', options = {}) {
		return defaultToastManager.show(message, type, options);
	}

	function showSuccess(message, options = {}) {
		return defaultToastManager.success(message, options);
	}

	function showError(message, options = {}) {
		return defaultToastManager.error(message, options);
	}

	function showWarning(message, options = {}) {
		return defaultToastManager.warning(message, options);
	}

	function showInfo(message, options = {}) {
		return defaultToastManager.info(message, options);
	}

	// Export
	window.ToastManager = ToastManager;
	window.Toast = {
		show: showToast,
		success: showSuccess,
		error: showError,
		warning: showWarning,
		info: showInfo,
		create: (options) => new ToastManager(options)
	};

	// Backward compatibility: Enhance showAlert to use toast
	if (window.showAlert) {
		const originalShowAlert = window.showAlert;
		window.showAlert = function (type, message) {
			// Map type
			const toastType = type === 'danger' ? 'error' : type;
			// Use toast for better UX
			showToast(message, toastType);
			// Also call original for compatibility
			originalShowAlert.call(this, type, message);
		};
	}
})();

