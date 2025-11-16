// Modal Component - Wrapper for Bootstrap modals with enhanced functionality
(function () {
	'use strict';

	/**
	 * ModalManager - Manages Bootstrap modal instances with callbacks
	 */
	class ModalManager {
		constructor(modalId, options = {}) {
			this.modalId = modalId;
			this.modalElement = document.getElementById(modalId);
			if (!this.modalElement) {
				console.warn(`ModalManager: Modal #${modalId} not found`);
				// Throw error to prevent creating invalid instance
				throw new Error(`ModalManager: Modal #${modalId} not found in DOM`);
			}

			this.options = {
				backdrop: options.backdrop !== false, // Default: true
				keyboard: options.keyboard !== false, // Default: true
				focus: options.focus !== false, // Default: true
				...options
			};

			this.modal = null;
			this.onShow = options.onShow || null;
			this.onShown = options.onShown || null;
			this.onHide = options.onHide || null;
			this.onHidden = options.onHidden || null;
			this.onHidePrevented = options.onHidePrevented || null;

			// Store event listeners for cleanup
			this._eventListeners = [];

			this._init();
		}

		_init() {
			// Use Bootstrap's getOrCreateInstance to ensure proper initialization
			// This automatically handles existing instances and prevents duplicates
			const modalConfig = {
				backdrop: this.options.backdrop !== undefined ? this.options.backdrop : true,
				keyboard: this.options.keyboard !== undefined ? this.options.keyboard : true,
				focus: this.options.focus !== undefined ? this.options.focus : true
			};

			this.modal = bootstrap.Modal.getOrCreateInstance(this.modalElement, modalConfig);

			// Bind event listeners and store references for cleanup
			const showHandler = (e) => {
				// Ensure aria-hidden is removed for accessibility
				if (this.modalElement.hasAttribute('aria-hidden')) {
					this.modalElement.removeAttribute('aria-hidden');
				}
				if (this.onShow) this.onShow(e);
			};
			this.modalElement.addEventListener('show.bs.modal', showHandler);
			this._eventListeners.push({ event: 'show.bs.modal', handler: showHandler });

			const shownHandler = (e) => {
				if (this.onShown) this.onShown(e);
			};
			this.modalElement.addEventListener('shown.bs.modal', shownHandler);
			this._eventListeners.push({ event: 'shown.bs.modal', handler: shownHandler });

			const hideHandler = (e) => {
				if (this.onHide) {
					const result = this.onHide(e);
					if (result === false) {
						e.preventDefault();
						if (this.onHidePrevented) this.onHidePrevented(e);
					}
				}
			};
			this.modalElement.addEventListener('hide.bs.modal', hideHandler);
			this._eventListeners.push({ event: 'hide.bs.modal', handler: hideHandler });

			const hiddenHandler = (e) => {
				if (this.onHidden) this.onHidden(e);
			};
			this.modalElement.addEventListener('hidden.bs.modal', hiddenHandler);
			this._eventListeners.push({ event: 'hidden.bs.modal', handler: hiddenHandler });
		}

		/**
		 * Show the modal
		 */
		show() {
			if (this.modal) {
				this.modal.show();
			}
		}

		/**
		 * Hide the modal
		 */
		hide() {
			if (this.modal) {
				this.modal.hide();
			}
		}

		/**
		 * Toggle the modal
		 */
		toggle() {
			if (this.modal) {
				this.modal.toggle();
			}
		}

		/**
		 * Dispose the modal instance and cleanup event listeners
		 */
		dispose() {
			// Remove event listeners to prevent memory leaks
			if (this._eventListeners && this.modalElement) {
				this._eventListeners.forEach(({ event, handler }) => {
					this.modalElement.removeEventListener(event, handler);
				});
				this._eventListeners = [];
			}

			// Dispose Bootstrap modal instance
			if (this.modal) {
				this.modal.dispose();
				this.modal = null;
			}
		}

		/**
		 * Update modal title
		 */
		setTitle(title) {
			const titleEl = this.modalElement.querySelector('.modal-title');
			if (titleEl) {
				titleEl.textContent = title;
			}
		}

		/**
		 * Update modal body content
		 */
		setBody(html) {
			const bodyEl = this.modalElement.querySelector('.modal-body');
			if (bodyEl) {
				bodyEl.innerHTML = html;
			}
		}

		/**
		 * Get modal body element
		 */
		getBody() {
			return this.modalElement.querySelector('.modal-body');
		}

		/**
		 * Update modal footer content
		 */
		setFooter(html) {
			const footerEl = this.modalElement.querySelector('.modal-footer');
			if (footerEl) {
				footerEl.innerHTML = html;
			}
		}

		/**
		 * Get modal footer element
		 */
		getFooter() {
			return this.modalElement.querySelector('.modal-footer');
		}

		/**
		 * Reset modal (clear body, reset form if exists)
		 */
		reset() {
			const bodyEl = this.getBody();
			if (bodyEl) {
				const form = bodyEl.querySelector('form');
				if (form) {
					form.reset();
				}
			}
		}
	}

	/**
	 * Static helper: Get or create modal instance
	 */
	function getModal(modalId, options = {}) {
		if (!window.__MODAL_INSTANCES__) {
			window.__MODAL_INSTANCES__ = new Map();
		}

		// Check if instance exists and modal element still exists in DOM
		const existingInstance = window.__MODAL_INSTANCES__.get(modalId);
		const modalElement = document.getElementById(modalId);

		// If instance exists but modal element was removed, dispose and create new
		if (existingInstance && !modalElement) {
			existingInstance.dispose();
			window.__MODAL_INSTANCES__.delete(modalId);
		}

		// Create new instance if not exists or was disposed
		if (!window.__MODAL_INSTANCES__.has(modalId)) {
			try {
			window.__MODAL_INSTANCES__.set(modalId, new ModalManager(modalId, options));
			} catch (err) {
				console.error(`Failed to create ModalManager for #${modalId}:`, err);
				return null;
			}
		}

		return window.__MODAL_INSTANCES__.get(modalId);
	}

	/**
	 * Static helper: Show modal by ID
	 */
	function showModal(modalId, options = {}) {
		const modal = getModal(modalId, options);
		if (modal) {
		modal.show();
		}
		return modal;
	}

	/**
	 * Static helper: Hide modal by ID
	 */
	function hideModal(modalId) {
		const modalEl = document.getElementById(modalId);
		if (modalEl) {
			try {
				const modalInstance = bootstrap.Modal.getInstance(modalEl);
				if (modalInstance) {
					modalInstance.hide();
				} else {
					// If no instance exists, create one and hide it
					const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
					modal.hide();
				}
			} catch (err) {
				console.error(`Error hiding modal ${modalId}:`, err);
			}
		}
	}

	/**
	 * Force cleanup stuck backdrop elements
	 * Bootstrap handles backdrop cleanup automatically, but this function
	 * can be used as a fallback to clean up any stuck backdrops
	 */
	function forceCleanupBackdrop() {
		const showingModals = document.querySelectorAll('.modal.show');
		const backdrops = document.querySelectorAll('.modal-backdrop');
		
		// Only cleanup if no modals are showing
		if (showingModals.length === 0 && backdrops.length > 0) {
			backdrops.forEach(backdrop => backdrop.remove());
			document.body.classList.remove('modal-open');
			document.body.style.removeProperty('padding-right');
			document.body.style.removeProperty('overflow');
		}
	}

	// Global event listener to cleanup stuck backdrops after modal is hidden
	// Bootstrap handles cleanup automatically, but this ensures any stuck backdrops are removed
	document.addEventListener('hidden.bs.modal', function() {
		// Use requestAnimationFrame to ensure Bootstrap's cleanup has completed
		requestAnimationFrame(() => {
			forceCleanupBackdrop();
		});
	});

	// Cleanup stuck backdrops on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', forceCleanupBackdrop);
	} else {
		forceCleanupBackdrop();
	}

	/**
	 * Static helper: Create and show dynamic modal
	 */
	function createModal(options = {}) {
		const {
			title = 'Modal',
			body = '',
			footer = '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>',
			size = 'modal-lg', // modal-sm, modal-lg, modal-xl
			scrollable = false,
			centered = false,
			backdrop = true,
			keyboard = true,
			onShow = null,
			onShown = null,
			onHide = null,
			onHidden = null
		} = options;

		// Generate unique ID (use substring instead of deprecated substr)
		const modalId = `dynamic-modal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

		// Create modal HTML
		const modalHtml = `
			<div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
				<div class="modal-dialog ${size} ${scrollable ? 'modal-dialog-scrollable' : ''} ${centered ? 'modal-dialog-centered' : ''}">
					<div class="modal-content">
						<div class="modal-header">
							<h5 class="modal-title">${title}</h5>
							<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
						</div>
						<div class="modal-body">${body}</div>
						<div class="modal-footer">${footer}</div>
					</div>
				</div>
			</div>
		`;

		// Append to body
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = modalHtml;
		const modalElement = tempDiv.firstElementChild;
		document.body.appendChild(modalElement);

		// Create and show modal
		const modal = new ModalManager(modalId, {
			backdrop,
			keyboard,
			onShow,
			onShown,
			onHide,
			onHidden
		});

		// Auto-remove on hidden
		modalElement.addEventListener('hidden.bs.modal', () => {
			modal.dispose();
			modalElement.remove();
			if (window.__MODAL_INSTANCES__) {
				window.__MODAL_INSTANCES__.delete(modalId);
			}
		});

		modal.show();
		return modal;
	}

	// Export
	window.ModalManager = ModalManager;
	window.Modal = {
		get: getModal,
		show: showModal,
		hide: hideModal,
		create: createModal,
		cleanupBackdrop: forceCleanupBackdrop
	};
})();
