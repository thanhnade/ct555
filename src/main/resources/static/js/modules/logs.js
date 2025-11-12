// Logs Module - Utility module for log display and filtering
(function () {
	'use strict';

	// Log levels
	const LOG_LEVELS = {
		INFO: 'info',
		SUCCESS: 'success',
		ERROR: 'error',
		WARNING: 'warning',
		DEBUG: 'debug'
	};

	// Log level colors (Bootstrap-based)
	const LOG_COLORS = {
		info: 'text-info',
		success: 'text-success',
		error: 'text-danger',
		warning: 'text-warning',
		debug: 'text-muted'
	};

	/**
	 * LogConsole - Manages a log console element
	 */
	class LogConsole {
		constructor(containerId, options = {}) {
			this.containerId = containerId;
			this.container = document.getElementById(containerId);
			if (!this.container) {
				console.warn(`LogConsole: Container #${containerId} not found`);
				return;
			}

			this.options = {
				autoScroll: options.autoScroll !== false, // Default: true
				maxLines: options.maxLines || 1000, // Maximum lines to keep
				monospace: options.monospace !== false, // Default: true
				timestamp: options.timestamp !== false, // Default: true
				...options
			};

			this.logs = []; // Array of log entries
			this.filteredLogs = [];
			this.currentFilter = null;
			this.autoScrollEnabled = this.options.autoScroll;

			// Initialize container
			this._initContainer();
		}

		_initContainer() {
			if (!this.container) return;
			if (this.options.monospace) {
				this.container.classList.add('monospace-12', 'pre-wrap');
			}
			if (!this.container.classList.contains('overflow-auto')) {
				this.container.classList.add('overflow-auto');
			}
		}

		/**
		 * Append a log entry
		 * @param {string|object} entry - Log message or log object {message, level, timestamp, server, ...}
		 */
		append(entry) {
			if (!this.container) return;

			const logEntry = this._normalizeEntry(entry);
			this.logs.push(logEntry);

			// Apply current filter if exists
			if (this.currentFilter && !this._matchesFilter(logEntry)) {
				return;
			}

			// Add to filtered logs
			this.filteredLogs.push(logEntry);

			// Trim logs if exceeds maxLines
			if (this.logs.length > this.options.maxLines) {
				this.logs.shift();
			}
			if (this.filteredLogs.length > this.options.maxLines) {
				this.filteredLogs.shift();
			}

			// Render
			this._renderEntry(logEntry);

			// Auto scroll
			if (this.autoScrollEnabled) {
				this.scrollToBottom();
			}
		}

		/**
		 * Append multiple log entries
		 */
		appendMultiple(entries) {
			entries.forEach(entry => this.append(entry));
		}

		/**
		 * Append a block of text (multiline)
		 */
		appendBlock(text, level = LOG_LEVELS.INFO) {
			if (!text) return;
			const lines = String(text).split('\n');
			lines.forEach(line => {
				if (line.trim()) {
					this.append({ message: line, level });
				}
			});
		}

		/**
		 * Clear all logs
		 */
		clear() {
			this.logs = [];
			this.filteredLogs = [];
			this.currentFilter = null;
			if (this.container) {
				this.container.innerHTML = '<div class="text-muted text-center">Chưa có logs...</div>';
			}
		}

		/**
		 * Clear and set a placeholder message
		 */
		clearWithMessage(message = 'Chưa có logs...') {
			this.logs = [];
			this.filteredLogs = [];
			this.currentFilter = null;
			if (this.container) {
				this.container.innerHTML = `<div class="text-muted text-center">${this._escapeHtml(message)}</div>`;
			}
		}

		/**
		 * Filter logs
		 * @param {object} filter - Filter options {keyword, level, timeRange, server}
		 */
		filter(filter) {
			this.currentFilter = filter;
			this.filteredLogs = this.logs.filter(entry => this._matchesFilter(entry));
			this._renderAll();
		}

		/**
		 * Clear filter and show all logs
		 */
		clearFilter() {
			this.currentFilter = null;
			this.filteredLogs = [...this.logs];
			this._renderAll();
		}

		/**
		 * Scroll to bottom
		 */
		scrollToBottom() {
			if (this.container) {
				this.container.scrollTop = this.container.scrollHeight;
			}
		}

		/**
		 * Scroll to top
		 */
		scrollToTop() {
			if (this.container) {
				this.container.scrollTop = 0;
			}
		}

		/**
		 * Enable/disable auto scroll
		 */
		setAutoScroll(enabled) {
			this.autoScrollEnabled = enabled;
		}

		/**
		 * Export logs to text file
		 */
		exportToFile(filename = null) {
			const logLines = this.logs.map(entry => this._formatEntryForExport(entry)).join('\n');
			const blob = new Blob([logLines], { type: 'text/plain' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename || `logs-${new Date().toISOString().slice(0, 19)}.txt`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}

		/**
		 * Get logs as text
		 */
		getLogsText() {
			return this.logs.map(entry => this._formatEntryForExport(entry)).join('\n');
		}

		/**
		 * Get filtered logs as text
		 */
		getFilteredLogsText() {
			return this.filteredLogs.map(entry => this._formatEntryForExport(entry)).join('\n');
		}

		// Private methods

		_normalizeEntry(entry) {
			if (typeof entry === 'string') {
				return {
					message: entry,
					level: LOG_LEVELS.INFO,
					timestamp: new Date(),
					server: null
				};
			}

			return {
				message: entry.message || entry.output || entry.prompt || '',
				level: entry.level || entry.type || LOG_LEVELS.INFO,
				timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
				server: entry.server || null,
				prompt: entry.prompt || null,
				command: entry.command || null,
				...entry
			};
		}

		_matchesFilter(entry) {
			if (!this.currentFilter) return true;

			const filter = this.currentFilter;

			// Keyword filter
			if (filter.keyword) {
				const keyword = filter.keyword.toLowerCase();
				const message = (entry.message || '').toLowerCase();
				const server = (entry.server || '').toLowerCase();
				if (!message.includes(keyword) && !server.includes(keyword)) {
					return false;
				}
			}

			// Level filter
			if (filter.level && entry.level !== filter.level) {
				return false;
			}

			// Server filter
			if (filter.server && entry.server !== filter.server) {
				return false;
			}

			// Time range filter
			if (filter.timeRange) {
				const entryTime = entry.timestamp.getTime();
				const { start, end } = filter.timeRange;
				if (start && entryTime < start.getTime()) return false;
				if (end && entryTime > end.getTime()) return false;
			}

			return true;
		}

		_renderEntry(entry) {
			if (!this.container) return;

			// Remove placeholder if exists
			if (this.container.children.length === 1) {
				const firstChild = this.container.firstElementChild;
				if (firstChild && firstChild.classList.contains('text-muted') && firstChild.classList.contains('text-center')) {
					this.container.innerHTML = '';
				}
			}

			const line = document.createElement('div');
			line.className = 'log-entry';

			// Timestamp
			if (this.options.timestamp) {
				const timestamp = entry.timestamp.toLocaleTimeString('vi-VN');
				const timestampSpan = document.createElement('span');
				timestampSpan.className = 'text-muted me-2';
				timestampSpan.textContent = `[${timestamp}]`;
				line.appendChild(timestampSpan);
			}

			// Server
			if (entry.server) {
				const serverSpan = document.createElement('span');
				serverSpan.className = 'text-primary me-2';
				serverSpan.textContent = `[${entry.server}]`;
				line.appendChild(serverSpan);
			}

			// Level badge
			if (entry.level && entry.level !== LOG_LEVELS.INFO) {
				const levelSpan = document.createElement('span');
				levelSpan.className = `badge bg-${this._getLevelBgColor(entry.level)} me-2`;
				levelSpan.textContent = entry.level.toUpperCase();
				line.appendChild(levelSpan);
			}

			// Message
			const messageSpan = document.createElement('span');
			messageSpan.className = LOG_COLORS[entry.level] || '';
			messageSpan.textContent = entry.message || entry.output || entry.prompt || '';
			line.appendChild(messageSpan);

			// Command (if exists)
			if (entry.command) {
				const commandSpan = document.createElement('span');
				commandSpan.className = 'text-warning ms-2';
				commandSpan.textContent = entry.command;
				line.appendChild(commandSpan);
			}

			this.container.appendChild(line);
		}

		_renderAll() {
			if (!this.container) return;

			this.container.innerHTML = '';
			if (this.filteredLogs.length === 0) {
				this.container.innerHTML = '<div class="text-muted text-center">Không có logs phù hợp...</div>';
				return;
			}

			this.filteredLogs.forEach(entry => this._renderEntry(entry));
			if (this.autoScrollEnabled) {
				this.scrollToBottom();
			}
		}

		_formatEntryForExport(entry) {
			const parts = [];
			if (this.options.timestamp) {
				parts.push(`[${entry.timestamp.toISOString()}]`);
			}
			if (entry.server) {
				parts.push(`[${entry.server}]`);
			}
			if (entry.level && entry.level !== LOG_LEVELS.INFO) {
				parts.push(`[${entry.level.toUpperCase()}]`);
			}
			if (entry.prompt) {
				parts.push(entry.prompt);
			}
			if (entry.command) {
				parts.push(entry.command);
			}
			if (entry.message || entry.output) {
				parts.push(entry.message || entry.output);
			}
			return parts.join(' ');
		}

		_getLevelBgColor(level) {
			const colorMap = {
				info: 'info',
				success: 'success',
				error: 'danger',
				warning: 'warning',
				debug: 'secondary'
			};
			return colorMap[level] || 'secondary';
		}

		_escapeHtml(text) {
			if (text == null) return '';
			const div = document.createElement('div');
			div.textContent = String(text);
			return div.innerHTML;
		}
	}

	/**
	 * LogFilter - Utility for filtering logs
	 */
	class LogFilter {
		constructor() {
			this.filters = {
				keyword: null,
				level: null,
				server: null,
				timeRange: null
			};
		}

		setKeyword(keyword) {
			this.filters.keyword = keyword && keyword.trim() ? keyword.trim() : null;
		}

		setLevel(level) {
			this.filters.level = level || null;
		}

		setServer(server) {
			this.filters.server = server || null;
		}

		setTimeRange(start, end) {
			this.filters.timeRange = start || end ? { start, end } : null;
		}

		clear() {
			this.filters = {
				keyword: null,
				level: null,
				server: null,
				timeRange: null
			};
		}

		getFilter() {
			// Return null if no filters are set
			const hasFilters = Object.values(this.filters).some(v => v !== null);
			return hasFilters ? { ...this.filters } : null;
		}
	}

	// Export module
	window.LogsModule = {
		LogConsole,
		LogFilter,
		LOG_LEVELS,
		LOG_COLORS
	};

	// Backward compatibility: create a simple log console helper
	window.createLogConsole = (containerId, options) => {
		return new LogConsole(containerId, options);
	};
})();

