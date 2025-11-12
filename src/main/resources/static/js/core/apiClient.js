(function () {
	// Simple API client with centralized error handling
	const DEFAULT_HEADERS = {
		'Accept': 'application/json'
	};

	function getBaseUrl() {
		// Allow override via global variable if needed
		return (window.API_BASE && typeof window.API_BASE === 'string') ? window.API_BASE : '';
	}

	async function parseResponse(response) {
		const contentType = response.headers.get('content-type') || '';
		const isJson = contentType.includes('application/json');

		if (!response.ok) {
			let errorBody;
			try {
				errorBody = isJson ? await response.json() : await response.text();
			} catch (_) {
				errorBody = null;
			}
			const error = new Error((errorBody && (errorBody.message || errorBody.error)) || response.statusText || 'Request failed');
			error.status = response.status;
			error.body = errorBody;
			throw error;
		}

		if (isJson) return await response.json();
		return await response.text();
	}

	async function request(path, options = {}) {
		const baseUrl = getBaseUrl();
		const url = path.startsWith('http') ? path : (baseUrl + path);

		const headers = Object.assign({}, DEFAULT_HEADERS, options.headers || {});
		const init = Object.assign({}, options, { headers });

		return parseResponse(await fetch(url, init));
	}

	function json(method, path, body, headers) {
		return request(path, {
			method,
			headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
			body: body != null ? JSON.stringify(body) : undefined
		});
	}

	const ApiClient = {
		request,
		get: (path, headers) => request(path, { method: 'GET', headers }),
		delete: (path, headers) => request(path, { method: 'DELETE', headers }),
		post: (path, body, headers) => json('POST', path, body, headers),
		put: (path, body, headers) => json('PUT', path, body, headers),
		patch: (path, body, headers) => json('PATCH', path, body, headers)
	};

	// Expose globally
	window.ApiClient = ApiClient;
})();


