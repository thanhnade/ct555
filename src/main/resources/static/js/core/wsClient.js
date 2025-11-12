(function () {
	// Simple WebSocket client with auto-reconnect and topic subscription

	function buildUrl(path) {
		if (path.startsWith('ws://') || path.startsWith('wss://')) return path;
		const loc = window.location;
		const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = loc.host;
		if (path.startsWith('/')) return `${protocol}//${host}${path}`;
		return `${protocol}//${host}/${path}`;
	}

	class WSClient {
		constructor(path, options = {}) {
			this.url = buildUrl(path);
			this.maxRetries = options.maxRetries ?? 10;
			this.backoffBaseMs = options.backoffBaseMs ?? 500;
			this.socket = null;
			this.retryCount = 0;
			this.closedManually = false;
			this.messageHandlers = new Set();
			this.topicHandlers = new Map(); // topic -> Set<handler>
			this.onOpen = options.onOpen || (() => {});
			this.onClose = options.onClose || (() => {});
			this.onError = options.onError || (() => {});
			this.connect();
		}

		connect() {
			this.socket = new WebSocket(this.url);
			this.socket.onopen = () => {
				this.retryCount = 0;
				this.onOpen();
			};
			this.socket.onmessage = (evt) => {
				let data = evt.data;
				try { data = JSON.parse(evt.data); } catch (_) { /* non-JSON payload */ }
				// Topic dispatch if shape { topic, payload }
				if (data && typeof data === 'object' && data.topic) {
					const set = this.topicHandlers.get(data.topic);
					if (set) for (const h of Array.from(set)) { try { h(data.payload, data); } catch (_) {} }
				}
				for (const h of Array.from(this.messageHandlers)) { try { h(data); } catch (_) {} }
			};
			this.socket.onerror = (e) => this.onError(e);
			this.socket.onclose = () => {
				this.onClose();
				if (!this.closedManually) this.scheduleReconnect();
			};
		}

		scheduleReconnect() {
			if (this.retryCount >= this.maxRetries) return;
			const delay = Math.min(10000, this.backoffBaseMs * Math.pow(2, this.retryCount));
			this.retryCount += 1;
			setTimeout(() => this.connect(), delay);
		}

		close() {
			this.closedManually = true;
			try { this.socket && this.socket.close(); } catch (_) {}
		}

		send(objOrString) {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
			const payload = (typeof objOrString === 'string') ? objOrString : JSON.stringify(objOrString);
			this.socket.send(payload);
			return true;
		}

		onMessage(handler) {
			this.messageHandlers.add(handler);
			return () => this.messageHandlers.delete(handler);
		}

		subscribe(topic, handler) {
			if (!this.topicHandlers.has(topic)) this.topicHandlers.set(topic, new Set());
			this.topicHandlers.get(topic).add(handler);
			return () => this.unsubscribe(topic, handler);
		}

		unsubscribe(topic, handler) {
			const set = this.topicHandlers.get(topic);
			if (set) set.delete(handler);
		}
	}

	window.WSClient = WSClient;
})();


