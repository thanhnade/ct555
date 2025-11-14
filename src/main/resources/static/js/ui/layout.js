// Layout UI - Initialize avatar circles and other layout components
(function () {
	'use strict';

	/**
	 * Initialize avatar circles with initials from data-initials attribute
	 */
	function initAvatarCircles() {
		const avatarCircles = document.querySelectorAll('.avatar-circle[data-initials]');
		avatarCircles.forEach(avatar => {
			const initials = avatar.getAttribute('data-initials') || 'AD';
			avatar.textContent = initials;
		});
	}

	/**
	 * Initialize layout components when DOM is ready
	 */
	function init() {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', initAvatarCircles);
		} else {
			initAvatarCircles();
		}
	}

	// Auto-initialize
	init();

	// Export for manual initialization if needed
	if (typeof window !== 'undefined') {
		window.LayoutUI = {
			initAvatarCircles
		};
	}
})();

