// Table Component - Render tables with sorting and empty state
// Supports interactive elements via col.html or col.render functions
// Example:
//   TableRenderer.create('table-container', {
//     columns: [
//       { key: 'id', label: 'ID' },
//       { key: 'name', label: 'Name', html: true }, // Render as HTML
//       { key: 'actions', label: 'Actions', render: (value, row) => `<button onclick="doSomething(${row.id})">Action</button>` }
//     ]
//   });
(function () {
	'use strict';

	/**
	 * TableRenderer - Renders data tables with sorting and empty state
	 */
	class TableRenderer {
		constructor(containerId, options = {}) {
			this.containerId = containerId;
			this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
			if (!this.container) {
				console.warn(`TableRenderer: Container not found`);
				return;
			}

			this.options = {
				columns: options.columns || [],
				sortable: options.sortable !== false, // Default: true
				emptyMessage: options.emptyMessage || 'Không có dữ liệu',
				emptyIcon: options.emptyIcon || '<i class="bi bi-inbox"></i>',
				rowClass: options.rowClass || null, // Function(row, index) => string
				onRowClick: options.onRowClick || null, // Function(row, index, event)
				...options
			};

			this.data = [];
			this.sortColumn = null;
			this.sortDirection = 'asc'; // 'asc' or 'desc'
			this.table = null;
			this.thead = null;
			this.tbody = null;

			this._init();
		}

		_init() {
			// Create table structure
			this.table = document.createElement('table');
			this.table.className = this.options.tableClass || 'table table-sm align-middle';
			this.thead = document.createElement('thead');
			this.tbody = document.createElement('tbody');
			this.table.appendChild(this.thead);
			this.table.appendChild(this.tbody);

			// Render header
			this._renderHeader();

			// Clear container and append table
			this.container.innerHTML = '';
			this.container.appendChild(this.table);
		}

		_renderHeader() {
			this.thead.innerHTML = '';
			const tr = document.createElement('tr');

			this.options.columns.forEach((col, index) => {
				const th = document.createElement('th');
				th.textContent = col.label || col.key || '';
				if (col.className) {
					th.className = col.className;
				}
				if (col.style) {
					Object.assign(th.style, col.style);
				}

				// Make sortable if enabled
				if (this.options.sortable && col.sortable !== false && col.key) {
					th.style.cursor = 'pointer';
					th.setAttribute('data-sort', col.key);
					th.addEventListener('click', () => this.sort(col.key));
					th.innerHTML = `
						${col.label || col.key}
						<span class="sort-indicator ms-1">
							${this.sortColumn === col.key ? (this.sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
						</span>
					`;
				}

				tr.appendChild(th);
			});

			this.thead.appendChild(tr);
		}

		/**
		 * Render data
		 */
		render(data) {
			this.data = Array.isArray(data) ? data : [];
			this.tbody.innerHTML = '';

			if (this.data.length === 0) {
				this._renderEmpty();
				return;
			}

			this.data.forEach((row, index) => {
				const tr = document.createElement('tr');
				if (this.options.rowClass) {
					const rowClass = this.options.rowClass(row, index);
					if (rowClass) {
						tr.className = rowClass;
					}
				}

				// Add click handler if provided
				if (this.options.onRowClick) {
					tr.style.cursor = 'pointer';
					tr.addEventListener('click', (e) => {
						this.options.onRowClick(row, index, e);
					});
				}

				this.options.columns.forEach(col => {
					const td = document.createElement('td');
					const value = this._getCellValue(row, col);

					// Render cell content
					if (col.render) {
						td.innerHTML = col.render(value, row, index);
					} else if (col.html) {
						td.innerHTML = value;
					} else {
						td.textContent = value;
					}

					if (col.className) {
						td.className = col.className;
					}
					if (col.style) {
						Object.assign(td.style, col.style);
					}

					tr.appendChild(td);
				});

				this.tbody.appendChild(tr);
			});
		}

		/**
		 * Get cell value from row data
		 */
		_getCellValue(row, col) {
			if (col.key) {
				const keys = col.key.split('.');
				let value = row;
				for (const key of keys) {
					value = value?.[key];
				}
				return value != null ? value : '';
			}
			return '';
		}

		/**
		 * Render empty state
		 */
		_renderEmpty() {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.colSpan = this.options.columns.length;
			td.className = 'text-center text-muted py-4';
			td.innerHTML = `
				<div>
					${this.options.emptyIcon}
					<div class="mt-2">${this.options.emptyMessage}</div>
				</div>
			`;
			tr.appendChild(td);
			this.tbody.appendChild(tr);
		}

		/**
		 * Sort data by column
		 */
		sort(columnKey) {
			if (!columnKey) return;

			// Toggle direction if same column
			if (this.sortColumn === columnKey) {
				this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
			} else {
				this.sortColumn = columnKey;
				this.sortDirection = 'asc';
			}

			// Sort data
			this.data.sort((a, b) => {
				const aVal = this._getCellValue(a, { key: columnKey });
				const bVal = this._getCellValue(b, { key: columnKey });

				// Handle null/undefined
				if (aVal == null && bVal == null) return 0;
				if (aVal == null) return 1;
				if (bVal == null) return -1;

				// Compare values
				let comparison = 0;
				if (typeof aVal === 'number' && typeof bVal === 'number') {
					comparison = aVal - bVal;
				} else {
					comparison = String(aVal).localeCompare(String(bVal));
				}

				return this.sortDirection === 'asc' ? comparison : -comparison;
			});

			// Re-render
			this.render(this.data);
		}

		/**
		 * Get current data
		 */
		getData() {
			return [...this.data];
		}

		/**
		 * Update columns configuration
		 */
		setColumns(columns) {
			this.options.columns = columns;
			this._renderHeader();
			if (this.data.length > 0) {
				this.render(this.data);
			}
		}
	}

	/**
	 * Simple table renderer helper
	 */
	function renderTable(containerId, data, columns, options = {}) {
		const renderer = new TableRenderer(containerId, {
			columns,
			...options
		});
		renderer.render(data);
		return renderer;
	}

	// Export
	window.TableRenderer = TableRenderer;
	window.Table = {
		render: renderTable,
		create: (containerId, options) => new TableRenderer(containerId, options)
	};
})();

