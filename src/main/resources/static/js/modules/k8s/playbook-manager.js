// Playbook Manager Loader
// This file loads the original playbook-manager.js from static/playbook-manager.js
// Keep file separate as requested (E3.1)
(function () {
	'use strict';
	if (window.__playbookManagerLoaded) {
		console.log('Playbook manager already loaded');
		return;
	}
	const script = document.createElement('script');
	// Load original implementation from static/playbook-manager.js
	script.src = '/playbook-manager.js?v=1';
	script.async = true;
	script.onload = function () {
		window.__playbookManagerLoaded = true;
		console.log('Playbook manager loaded from /playbook-manager.js');
	};
	script.onerror = function () {
		console.error('Failed to load playbook-manager.js from /playbook-manager.js');
	};
	document.head.appendChild(script);
})();


