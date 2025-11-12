// Pagination Component - Prev/next, page size
(function () {
	'use strict';

	/**
	 * PaginationManager - Manages pagination UI and logic
	 */
	class PaginationManager {
		constructor(containerId, options = {}) {
			this.containerId = containerId;
			this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
			if (!this.container) {
				console.warn(`PaginationManager: Container not found`);
				return;
			}

			this.options = {
				currentPage: options.currentPage || 1,
				totalPages: options.totalPages || 1,
				pageSize: options.pageSize || 10,
				pageSizeOptions: options.pageSizeOptions || [10, 20, 50, 100],
				showPageSize: options.showPageSize !== false, // Default: true
				showPageInfo: options.showPageInfo !== false, // Default: true
				onPageChange: options.onPageChange || null, // Function(page)
				onPageSizeChange: options.onPageSizeChange || null, // Function(pageSize)
				...options
			};

			this.currentPage = this.options.currentPage;
			this.totalPages = this.options.totalPages;
			this.pageSize = this.options.pageSize;

			this._init();
		}

		_init() {
			this.render();
		}

		/**
		 * Render pagination UI
		 */
		render() {
			this.container.innerHTML = '';

			// Create wrapper
			const wrapper = document.createElement('div');
			wrapper.className = 'd-flex align-items-center justify-content-between flex-wrap gap-2';

			// Page info
			if (this.options.showPageInfo) {
				const info = document.createElement('div');
				info.className = 'text-muted small';
				info.textContent = `Trang ${this.currentPage} / ${this.totalPages}`;
				wrapper.appendChild(info);
			}

			// Pagination controls
			const pagination = document.createElement('nav');
			pagination.setAttribute('aria-label', 'Page navigation');

			const ul = document.createElement('ul');
			ul.className = 'pagination pagination-sm mb-0';

			// Previous button
			const prevLi = document.createElement('li');
			prevLi.className = `page-item ${this.currentPage === 1 ? 'disabled' : ''}`;
			const prevA = document.createElement('a');
			prevA.className = 'page-link';
			prevA.href = '#';
			prevA.innerHTML = '<i class="bi bi-chevron-left"></i>';
			prevA.addEventListener('click', (e) => {
				e.preventDefault();
				if (this.currentPage > 1) {
					this.goToPage(this.currentPage - 1);
				}
			});
			prevLi.appendChild(prevA);
			ul.appendChild(prevLi);

			// Page numbers
			const pages = this._getPageNumbers();
			pages.forEach(page => {
				const li = document.createElement('li');
				li.className = `page-item ${page === this.currentPage ? 'active' : ''} ${page === '...' ? 'disabled' : ''}`;
				const a = document.createElement('a');
				a.className = 'page-link';
				a.href = '#';
				a.textContent = page;
				if (page !== '...') {
					a.addEventListener('click', (e) => {
						e.preventDefault();
						this.goToPage(page);
					});
				}
				li.appendChild(a);
				ul.appendChild(li);
			});

			// Next button
			const nextLi = document.createElement('li');
			nextLi.className = `page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}`;
			const nextA = document.createElement('a');
			nextA.className = 'page-link';
			nextA.href = '#';
			nextA.innerHTML = '<i class="bi bi-chevron-right"></i>';
			nextA.addEventListener('click', (e) => {
				e.preventDefault();
				if (this.currentPage < this.totalPages) {
					this.goToPage(this.currentPage + 1);
				}
			});
			nextLi.appendChild(nextA);
			ul.appendChild(nextLi);

			pagination.appendChild(ul);
			wrapper.appendChild(pagination);

			// Page size selector
			if (this.options.showPageSize) {
				const pageSizeWrapper = document.createElement('div');
				pageSizeWrapper.className = 'd-flex align-items-center gap-2';

				const label = document.createElement('label');
				label.className = 'small text-muted mb-0';
				label.textContent = 'Hiển thị:';
				pageSizeWrapper.appendChild(label);

				const select = document.createElement('select');
				select.className = 'form-select form-select-sm';
				select.style.width = 'auto';
				this.options.pageSizeOptions.forEach(size => {
					const option = document.createElement('option');
					option.value = size;
					option.textContent = size;
					option.selected = size === this.pageSize;
					select.appendChild(option);
				});
				select.addEventListener('change', (e) => {
					const newSize = parseInt(e.target.value, 10);
					this.setPageSize(newSize);
				});
				pageSizeWrapper.appendChild(select);

				wrapper.appendChild(pageSizeWrapper);
			}

			this.container.appendChild(wrapper);
		}

		/**
		 * Get page numbers to display (with ellipsis)
		 */
		_getPageNumbers() {
			const pages = [];
			const total = this.totalPages;
			const current = this.currentPage;

			if (total <= 7) {
				// Show all pages if total <= 7
				for (let i = 1; i <= total; i++) {
					pages.push(i);
				}
			} else {
				// Always show first page
				pages.push(1);

				if (current <= 3) {
					// Near start: 1, 2, 3, 4, ..., total
					for (let i = 2; i <= 4; i++) {
						pages.push(i);
					}
					pages.push('...');
					pages.push(total);
				} else if (current >= total - 2) {
					// Near end: 1, ..., total-3, total-2, total-1, total
					pages.push('...');
					for (let i = total - 3; i <= total; i++) {
						pages.push(i);
					}
				} else {
					// Middle: 1, ..., current-1, current, current+1, ..., total
					pages.push('...');
					for (let i = current - 1; i <= current + 1; i++) {
						pages.push(i);
					}
					pages.push('...');
					pages.push(total);
				}
			}

			return pages;
		}

		/**
		 * Go to specific page
		 */
		goToPage(page) {
			if (page < 1 || page > this.totalPages || page === this.currentPage) {
				return;
			}

			this.currentPage = page;
			this.render();

			if (this.options.onPageChange) {
				this.options.onPageChange(page);
			}
		}

		/**
		 * Set page size
		 */
		setPageSize(size) {
			if (this.pageSize === size) return;

			this.pageSize = size;
			// Recalculate total pages if needed
			// (This depends on total items, which should be provided by parent)

			if (this.options.onPageSizeChange) {
				this.options.onPageSizeChange(size);
			}

			// Reset to page 1 when page size changes
			this.goToPage(1);
		}

		/**
		 * Set total pages
		 */
		setTotalPages(total) {
			this.totalPages = total;
			if (this.currentPage > total) {
				this.currentPage = Math.max(1, total);
			}
			this.render();
		}

		/**
		 * Set current page
		 */
		setCurrentPage(page) {
			if (page >= 1 && page <= this.totalPages) {
				this.currentPage = page;
				this.render();
			}
		}

		/**
		 * Get current state
		 */
		getState() {
			return {
				currentPage: this.currentPage,
				totalPages: this.totalPages,
				pageSize: this.pageSize
			};
		}
	}

	/**
	 * Helper: Create pagination for data array
	 */
	function paginateData(data, page, pageSize) {
		const start = (page - 1) * pageSize;
		const end = start + pageSize;
		const paginated = data.slice(start, end);
		const totalPages = Math.ceil(data.length / pageSize);

		return {
			data: paginated,
			currentPage: page,
			totalPages,
			pageSize,
			totalItems: data.length,
			startIndex: start,
			endIndex: Math.min(end, data.length)
		};
	}

	// Export
	window.PaginationManager = PaginationManager;
	window.Pagination = {
		create: (containerId, options) => new PaginationManager(containerId, options),
		paginate: paginateData
	};
})();

