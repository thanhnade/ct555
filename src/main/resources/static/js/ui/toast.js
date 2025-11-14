// Toast Component - Success/error/info notifications with timeout
(function () {
	'use strict';

	/**
	 * ToastManager - Manages toast notifications
	 */
	class ToastManager {
		constructor(options = {}) {
			this.options = {
				position: options.position || 'bottom-end', // top-start, top-center, top-end, bottom-start, bottom-center, bottom-end
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
			this.container.style.left = 'auto';
			this.container.style.right = 'auto';
			this.container.style.transform = 'none';
			
			if (horizontal === 'start') {
				this.container.style.left = '20px';
			} else if (horizontal === 'center') {
				this.container.style.left = '50%';
				this.container.style.transform = 'translateX(-50%)';
			} else { // end
				this.container.style.right = '20px';
			}
			
			// Set display flex and flex-direction for stacking
			this.container.style.display = 'flex';
			this.container.style.flexDirection = 'column';
			this.container.style.gap = '12px';
			this.container.style.maxWidth = '400px';
			this.container.style.minWidth = '300px';
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

			// Create toast element with custom style
			const toast = document.createElement('div');
			toast.id = id;
			toast.className = 'custom-toast';
			toast.setAttribute('role', 'alert');
			toast.setAttribute('aria-live', 'assertive');
			toast.setAttribute('aria-atomic', 'true');
			
			// Type color mapping
			const colorMap = {
				success: { bg: '#22c55e', icon: '✓', border: '#16a34a' },
				error: { bg: '#ef4444', icon: '✕', border: '#dc2626' },
				warning: { bg: '#f59e0b', icon: '⚠', border: '#d97706' },
				info: { bg: '#3b82f6', icon: 'ℹ', border: '#2563eb' }
			};
			const color = colorMap[type] || colorMap.info;
			
			// Apply styles
			toast.style.cssText = `
				background: ${color.bg};
				color: #ffffff;
				border-left: 4px solid ${color.border};
				border-radius: 6px;
				padding: 12px 16px;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
				display: flex;
				align-items: flex-start;
				gap: 12px;
				min-width: 300px;
				max-width: 400px;
				animation: slideInRight 0.3s ease-out;
			`;
			
			toast.innerHTML = `
				<div style="flex: 1;">
					${title ? `<div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${title}</div>` : ''}
					<div style="font-size: 13px; line-height: 1.5;">${message}</div>
				</div>
				<button type="button" class="toast-close-btn" aria-label="Close" style="
					background: transparent;
					border: none;
					color: #ffffff;
					cursor: pointer;
					font-size: 18px;
					line-height: 1;
					padding: 0;
					width: 20px;
					height: 20px;
					display: flex;
					align-items: center;
					justify-content: center;
					opacity: 0.8;
					transition: opacity 0.2s;
				" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">×</button>
			`;

			// Setup close button
			const closeBtn = toast.querySelector('.toast-close-btn');
			if (closeBtn) {
				closeBtn.addEventListener('click', () => {
					hideToast();
				});
			}

			// Hide function
			const hideToast = () => {
				toast.style.animation = 'slideOutRight 0.3s ease-out';
				setTimeout(() => {
					if (toast.parentElement) {
						toast.remove();
					}
					this.toasts.delete(id);
					if (onClose) onClose();
				}, 300);
			};

			// Auto-hide after duration (if not persistent)
			let autoHideTimer = null;
			if (!persistent && duration > 0) {
				autoHideTimer = setTimeout(() => {
					hideToast();
				}, duration);
			}

			// Cancel auto-hide on hover
			toast.addEventListener('mouseenter', () => {
				if (autoHideTimer) {
					clearTimeout(autoHideTimer);
					autoHideTimer = null;
				}
			});

			toast.addEventListener('mouseleave', () => {
				if (!persistent && duration > 0 && !autoHideTimer) {
					autoHideTimer = setTimeout(() => {
						hideToast();
					}, duration);
				}
			});

			// Append to container
			this.container.appendChild(toast);
			this.toasts.set(id, { toast, hideToast, autoHideTimer });

			return { id, toast, hide: hideToast };
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
			const toastData = this.toasts.get(id);
			if (toastData && toastData.hide) {
				if (toastData.autoHideTimer) {
					clearTimeout(toastData.autoHideTimer);
				}
				toastData.hide();
			}
		}

		/**
		 * Hide all toasts
		 */
		hideAll() {
			this.toasts.forEach((toastData) => {
				if (toastData && toastData.hide) {
					if (toastData.autoHideTimer) {
						clearTimeout(toastData.autoHideTimer);
					}
					toastData.hide();
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

