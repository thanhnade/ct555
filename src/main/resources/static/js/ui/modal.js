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
				return;
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

			this._init();
		}

		_init() {
			// Initialize Bootstrap modal
			// Ensure backdrop is a valid value (true, false, or 'static')
			const backdropValue = this.options.backdrop === undefined ? true : this.options.backdrop;
			const keyboardValue = this.options.keyboard === undefined ? true : this.options.keyboard;
			const focusValue = this.options.focus === undefined ? true : this.options.focus;

			this.modal = new bootstrap.Modal(this.modalElement, {
				backdrop: backdropValue,
				keyboard: keyboardValue,
				focus: focusValue
			});

			// Bind event listeners
			this.modalElement.addEventListener('show.bs.modal', (e) => {
				if (this.onShow) this.onShow(e);
			});

			this.modalElement.addEventListener('shown.bs.modal', (e) => {
				if (this.onShown) this.onShown(e);
			});

			this.modalElement.addEventListener('hide.bs.modal', (e) => {
				if (this.onHide) {
					const result = this.onHide(e);
					if (result === false) {
						e.preventDefault();
						if (this.onHidePrevented) this.onHidePrevented(e);
					}
				}
			});

			this.modalElement.addEventListener('hidden.bs.modal', (e) => {
				if (this.onHidden) this.onHidden(e);
			});
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
		 * Dispose the modal instance
		 */
		dispose() {
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

		if (!window.__MODAL_INSTANCES__.has(modalId)) {
			window.__MODAL_INSTANCES__.set(modalId, new ModalManager(modalId, options));
		}

		return window.__MODAL_INSTANCES__.get(modalId);
	}

	/**
	 * Static helper: Show modal by ID
	 */
	function showModal(modalId, options = {}) {
		const modal = getModal(modalId, options);
		modal.show();
		return modal;
	}

	/**
	 * Static helper: Hide modal by ID
	 */
	function hideModal(modalId) {
		const modalEl = document.getElementById(modalId);
		if (modalEl) {
			try {
				const modalInstance = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
				if (modalInstance) {
					modalInstance.hide();
				}
			} catch (err) {
				console.error(`Error hiding modal ${modalId}:`, err);
			}
		}
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

		// Generate unique ID
		const modalId = `dynamic-modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
		create: createModal
	};
})();

