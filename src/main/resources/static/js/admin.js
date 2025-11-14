// Admin bootstrap - Configuration and initialization only
// Feature modules are loaded separately and handle their own logic
(function () {
	'use strict';

	// Global showAlert utility - Uses Toast component if available
	window.showAlert = function (type, message) {
		try {
			// Use Toast component if available (loaded after this file)
			if (window.Toast && typeof window.Toast.show === 'function') {
				const toastType = type === 'danger' ? 'error' : type;
				window.Toast.show(message, toastType);
				return;
			}

			// Fallback: Simple alert if Toast not available
			const clsMap = { error: 'danger', warning: 'warning', success: 'success', info: 'info' };
			const cls = clsMap[type] || 'info';

			// Get or create alert container
			let container = document.getElementById('global-alert-container');
			if (!container) {
				container = document.createElement('div');
				Object.assign(container.style, {
					position: 'fixed', bottom: '20px', right: '20px',
					zIndex: '9999', minWidth: '300px', maxWidth: '400px'
				});
				container.id = 'global-alert-container';
				document.body.appendChild(container);
			}

			// Reuse or create alert element
			let el = window.__GLOBAL_ALERT__;
			if (!el) {
				el = document.createElement('div');
				el.id = 'global-alert';
				window.__GLOBAL_ALERT__ = el;
			}
			el.className = `alert alert-${cls} alert-dismissible fade show`;
			el.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
			container.replaceChildren(el);

			// Auto-dismiss after 5 seconds
			clearTimeout(window.__GLOBAL_ALERT_TO__);
			window.__GLOBAL_ALERT_TO__ = setTimeout(() => {
				el?.remove();
				window.__GLOBAL_ALERT__ = null;
				window.__GLOBAL_ALERT_TO__ = null;
			}, 5000);
		} catch (err) {
			console.error('[showAlert]', err);
			console.log(`[${type.toUpperCase()}] ${message}`);
		}
	};

	// Page routing: Emit events for modules to initialize
	// EventBus from core/eventBus.js provides AdminBus backward compatibility
	function initPageRouting() {
		const path = window.location.pathname || '';
		const routes = {
			'/admin/user': 'page:user',
			'/admin/server': 'page:server',
			'/admin/k8s': 'page:k8s',
			'/admin/deployments': 'page:deployments'
		};

		// Find matching route and emit event
		for (const [route, event] of Object.entries(routes)) {
			if (path.includes(route)) {
				// Use EventBus (from core) or AdminBus (backward compat)
				const bus = window.EventBus || window.AdminBus;
				if (bus && typeof bus.emit === 'function') {
					bus.emit(event, undefined); // payload is undefined for page events
				}
				break; // Only emit one event per page
			}
		}
	}

	// Initialize modals with valid options to prevent Bootstrap auto-init errors
	function initModals() {
		// Find all modal elements that might be auto-initialized by Bootstrap
		document.querySelectorAll('[data-bs-toggle="modal"]').forEach(btn => {
			const targetId = btn.getAttribute('data-bs-target');
			if (targetId && targetId.startsWith('#')) {
				const modalId = targetId.substring(1);
				const modalEl = document.getElementById(modalId);
				if (modalEl) {
					// Prevent Bootstrap from auto-initializing with invalid options
					// by pre-initializing with valid options using getOrCreateInstance
					try {
						// Use getOrCreateInstance to safely initialize or get existing instance
						// Only initialize if not already initialized
						if (!bootstrap.Modal.getInstance(modalEl)) {
							bootstrap.Modal.getOrCreateInstance(modalEl, {
								backdrop: true,
								keyboard: true,
								focus: true
							});
						}
					} catch (err) {
						console.warn(`Could not pre-initialize modal ${modalId}:`, err);
						// Remove data-bs-toggle to prevent Bootstrap from trying to auto-initialize
						btn.removeAttribute('data-bs-toggle');
						btn.setAttribute('data-modal-manual', 'true');
					}
				} else {
					// Modal doesn't exist - check if it's a dynamically created modal
					// These modals are created by JavaScript (playbook-manager.js, etc.)
					const dynamicModals = ['initAnsibleModal', 'ansibleConfigModal', 'playbookManagerModal'];
					if (dynamicModals.includes(modalId)) {
						// These modals are created dynamically, don't show warning
						// Just remove data-bs-toggle to prevent Bootstrap from trying to auto-initialize
						btn.removeAttribute('data-bs-toggle');
						btn.setAttribute('data-modal-dynamic', 'true');
					} else {
						// Modal doesn't exist and is not a known dynamic modal
						console.warn(`Modal #${modalId} not found. Removing data-bs-toggle from button.`);
						btn.removeAttribute('data-bs-toggle');
						btn.setAttribute('data-modal-manual', 'true');
						// Add manual click handler
						btn.addEventListener('click', (e) => {
							e.preventDefault();
							console.warn(`Cannot show modal #${modalId}: modal element not found in DOM.`);
							if (window.showAlert) {
								window.showAlert('warning', `Modal "${modalId}" chưa được tạo. Vui lòng tải lại trang.`);
							}
						});
					}
				}
			}
		});
	}

	// Intercept clicks on modal toggle buttons to ensure modal is initialized with valid options
	function setupModalClickInterceptor() {
		document.addEventListener('click', (e) => {
			const btn = e.target.closest('[data-bs-toggle="modal"]');
			if (btn) {
				const targetId = btn.getAttribute('data-bs-target');
				if (targetId && targetId.startsWith('#')) {
					const modalId = targetId.substring(1);
					const modalEl = document.getElementById(modalId);
					
					if (!modalEl) {
						// Modal doesn't exist - prevent Bootstrap from trying to initialize it
						console.warn(`Modal #${modalId} not found in DOM. Preventing Bootstrap initialization.`);
						e.preventDefault();
						e.stopPropagation();
						e.stopImmediatePropagation();
						return false;
					}
					
					try {
						// Check if modal is already initialized first
						let modalInstance = bootstrap.Modal.getInstance(modalEl);
						
						if (!modalInstance) {
							// Initialize with valid options before Bootstrap tries to auto-initialize
							modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl, {
								backdrop: true,
								keyboard: true,
								focus: true
							});
						}
						
						// Modal is now initialized, Bootstrap's event handler will handle showing it
						// Don't prevent default - let Bootstrap handle the show
						return true;
					} catch (err) {
						console.error(`Error initializing modal ${modalId}:`, err);
						// Prevent Bootstrap from trying to initialize with invalid options
						e.preventDefault();
						e.stopPropagation();
						e.stopImmediatePropagation();
						// Show error to user
						if (window.showAlert) {
							window.showAlert('error', `Không thể mở modal "${modalId}": ${err.message || 'Lỗi không xác định'}`);
						}
						return false;
					}
				}
			}
		}, true); // Use capture phase to intercept before Bootstrap
	}

	// Also initialize modals when they are dynamically added to DOM
	// Use MutationObserver to watch for new modal elements
	if (typeof MutationObserver !== 'undefined') {
		const modalObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType === 1) { // Element node
						// Check if the added node is a modal or contains modals
						const modals = node.matches && node.matches('.modal') 
							? [node] 
							: (node.querySelectorAll ? node.querySelectorAll('.modal') : []);
						
						modals.forEach((modalEl) => {
							if (modalEl.id) {
								try {
									// Initialize modal if not already initialized
									if (!bootstrap.Modal.getInstance(modalEl)) {
										bootstrap.Modal.getOrCreateInstance(modalEl, {
											backdrop: true,
											keyboard: true,
											focus: true
										});
									}
								} catch (err) {
									console.warn(`Could not initialize dynamically added modal ${modalEl.id}:`, err);
								}
							}
						});
					}
				});
			});
		});

		// Start observing
		if (document.body) {
			modalObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
		}
	}

	// Initialize on DOM ready
	function init() {
		initPageRouting();
		// Setup click interceptor first to catch early clicks
		setupModalClickInterceptor();
		// Initialize modals after a short delay to ensure all elements are in DOM
		setTimeout(initModals, 100);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();


