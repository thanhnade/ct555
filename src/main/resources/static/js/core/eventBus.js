(function () {
	// Lightweight Pub/Sub for modules
	const subscribers = new Map(); // topic -> Set<handler>

	function on(topic, handler) {
		if (!subscribers.has(topic)) subscribers.set(topic, new Set());
		subscribers.get(topic).add(handler);
		return () => off(topic, handler);
	}

	function off(topic, handler) {
		const set = subscribers.get(topic);
		if (set) set.delete(handler);
	}

	function emit(topic, payload) {
		const set = subscribers.get(topic);
		if (!set) return;
		for (const handler of Array.from(set)) {
			try { handler(payload); } catch (_) { /* swallow */ }
		}
	}

	window.EventBus = { on, off, emit };

	// Backward-compat with earlier AdminBus if exists
	if (!window.AdminBus) window.AdminBus = { on, emit };
})();


