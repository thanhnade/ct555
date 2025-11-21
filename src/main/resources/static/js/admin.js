// Admin bootstrap - Configuration and initialization only
// Feature modules are loaded separately and handle their own logic
(function () {
	'use strict';

	// Global utility: Force cleanup stuck modal backdrops
	// Can be called from console: window.cleanupModalBackdrops()
	window.cleanupModalBackdrops = function() {
		const backdrops = document.querySelectorAll('.modal-backdrop');
		const showingModals = document.querySelectorAll('.modal.show');
		
		if (showingModals.length === 0) {
			// No modals showing - remove all backdrops
			backdrops.forEach(backdrop => backdrop.remove());
			document.body.classList.remove('modal-open');
			document.body.style.removeProperty('padding-right');
			document.body.style.removeProperty('overflow');
			console.log('✅ Cleaned up all modal backdrops');
		} else {
			// Some modals are showing - only remove non-showing backdrops
			let removedCount = 0;
			backdrops.forEach(backdrop => {
				if (!backdrop.classList.contains('show')) {
					backdrop.remove();
					removedCount++;
				}
			});
			if (removedCount > 0) {
				console.log(`✅ Cleaned up ${removedCount} stuck modal backdrop(s)`);
			} else {
				console.log('ℹ️ No stuck backdrops found');
			}
		}
		
		// Also try using Modal.cleanupBackdrop if available
		if (window.Modal && typeof window.Modal.cleanupBackdrop === 'function') {
			window.Modal.cleanupBackdrop();
		}
	};

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
			'/admin/kubernetes': 'page:k8s',
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
						
						// Add event listener to ensure aria-hidden is properly managed
						// Remove aria-hidden before modal gains focus (in show.bs.modal event)
						// Use capture phase to ensure it runs before Bootstrap's handler
						modalEl.addEventListener('show.bs.modal', function() {
							// Ensure aria-hidden is removed before modal becomes visible and gains focus
							this.removeAttribute('aria-hidden');
						}, { once: false, capture: true });
						
						// NOTE: Không cần thêm individual hidden.bs.modal listener ở đây
						// vì đã có global listener trong modal.js (line 355) sẽ cleanup cho TẤT CẢ modals
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
						
						// Cleanup any stuck backdrops before showing new modal
						if (window.Modal && typeof window.Modal.cleanupBackdrop === 'function') {
							window.Modal.cleanupBackdrop();
						}
						
						// CRITICAL: Remove aria-hidden TRƯỚC KHI show modal để tránh accessibility violation
						// khi focus vào button trong modal. Phải remove ngay lập tức, nhiều lần để đảm bảo.
						modalEl.removeAttribute('aria-hidden');
						
						// Prevent Bootstrap's default handler from running to avoid duplicate initialization
						e.preventDefault();
						e.stopPropagation();
						
						// Đảm bảo aria-hidden vẫn bị remove trước khi show
						// Sử dụng requestAnimationFrame để đảm bảo remove trước khi Bootstrap xử lý
						requestAnimationFrame(() => {
							// Remove aria-hidden một lần nữa trước khi show để đảm bảo
							modalEl.removeAttribute('aria-hidden');
							// Modal is now initialized, show it explicitly
							// This ensures the modal opens even if Bootstrap's default handler doesn't fire
							modalInstance.show();
						});
						
						return false;
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
									
									// Add event listener to ensure aria-hidden is properly managed
									// Remove aria-hidden TRƯỚC KHI modal gains focus (in show.bs.modal event)
									// Sử dụng capture phase để chạy TRƯỚC Bootstrap's handler
									modalEl.addEventListener('show.bs.modal', function() {
										// CRITICAL: Remove aria-hidden TRƯỚC KHI modal becomes visible và focus vào button
										if (this.hasAttribute('aria-hidden')) {
											this.removeAttribute('aria-hidden');
										}
									}, { once: false, capture: true, passive: false });
									
									// NOTE: Không cần thêm individual hidden.bs.modal listener ở đây
									// vì đã có global listener trong modal.js (line 355) sẽ cleanup cho TẤT CẢ modals
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

	// Cleanup stuck backdrops on initialization
	function cleanupStuckBackdrops() {
		// Remove all stuck backdrops that don't have a corresponding showing modal
		const backdrops = document.querySelectorAll('.modal-backdrop');
		const showingModals = document.querySelectorAll('.modal.show');
		
		if (showingModals.length === 0 && backdrops.length > 0) {
			// No modals showing but backdrops exist - remove them
			backdrops.forEach(backdrop => backdrop.remove());
			document.body.classList.remove('modal-open');
			document.body.style.removeProperty('padding-right');
			document.body.style.removeProperty('overflow');
		}
	}

	// Initialize on DOM ready
	function init() {
		// Cleanup stuck backdrops first
		cleanupStuckBackdrops();
		
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


