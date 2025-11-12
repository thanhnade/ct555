// I18n Helper - Load messages from backend and provide translation functions
(function () {
	'use strict';

	// Messages cache
	let messages = {};
	let locale = 'vi'; // Default locale

	/**
	 * Load messages from backend
	 */
	async function loadMessages(localeCode = 'vi') {
		try {
			const response = await fetch(`/api/i18n/messages?locale=${localeCode}`);
			if (response.ok) {
				const data = await response.json();
				messages = data.messages || {};
				locale = localeCode;
				return messages;
			}
		} catch (error) {
			console.warn('[i18n] Failed to load messages from backend:', error);
		}
		return messages;
	}

	/**
	 * Get message by key with optional parameters
	 * @param {string} key - Message key (e.g., 'admin.user.title')
	 * @param {...any} params - Parameters to replace {0}, {1}, etc.
	 * @returns {string} Translated message or key if not found
	 */
	function t(key, ...params) {
		let message = messages[key] || key;

		// Replace parameters {0}, {1}, etc.
		if (params && params.length > 0) {
			params.forEach((param, index) => {
				message = message.replace(new RegExp(`\\{${index}\\}`, 'g'), String(param));
			});
		}

		return message;
	}

	/**
	 * Get message by key (alias for t)
	 */
	function translate(key, ...params) {
		return t(key, ...params);
	}

	/**
	 * Get current locale
	 */
	function getLocale() {
		return locale;
	}

	/**
	 * Set locale and reload messages
	 */
	async function setLocale(localeCode) {
		locale = localeCode;
		await loadMessages(localeCode);
		// Emit event for modules to update
		if (window.EventBus) {
			window.EventBus.emit('locale:changed', localeCode);
		}
	}

	/**
	 * Format message with parameters (helper for complex formatting)
	 */
	function format(key, params = {}) {
		let message = messages[key] || key;

		// Replace named parameters {name} or indexed {0}
		if (typeof params === 'object') {
			Object.keys(params).forEach(key => {
				const value = params[key];
				message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
			});
		}

		return message;
	}

	// Export
	window.I18n = {
		load: loadMessages,
		t: t,
		translate: translate,
		format: format,
		getLocale: getLocale,
		setLocale: setLocale
	};

	// Auto-load messages on page load
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			loadMessages('vi').catch(() => {
				console.warn('[i18n] Using fallback messages');
			});
		});
	} else {
		loadMessages('vi').catch(() => {
			console.warn('[i18n] Using fallback messages');
		});
	}
})();

