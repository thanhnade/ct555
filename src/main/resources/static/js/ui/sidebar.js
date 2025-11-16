// Sidebar Navigation - Dropdown and active nav management
(function () {
	'use strict';

	/**
	 * Toggle dropdown group open/closed
	 * @param {HTMLElement} el - The dropdown header element
	 */
	function toggleDropdown(el) {
		if (!el) return;
		const group = el.parentElement;
		if (group && (group.classList.contains('dropdown-group') || group.classList.contains('dropdown-subgroup'))) {
			group.classList.toggle('open');
		}
	}

	/**
	 * Set active navigation link and auto-open parent dropdown
	 * @param {HTMLElement} el - The anchor element to activate
	 */
	function setActiveNav(el) {
		if (!el) return;
		
		// Remove active class from all sidebar links
		document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
		
		// Add active class to clicked link
		el.classList.add('active');
		
		// Auto-open parent dropdown-group and dropdown-subgroup
		let parent = el.parentElement;
		while (parent) {
			if (parent.classList.contains('dropdown-group') || parent.classList.contains('dropdown-subgroup')) {
				parent.classList.add('open');
			}
			parent = parent.parentElement;
		}
	}

	/**
	 * Initialize active nav on page load based on current URL
	 */
	function initActiveNav() {
		const currentPath = window.location.pathname;
		const currentSearch = window.location.search;
		
		// Normalize current path
		const normalizedCurrent = currentPath.endsWith('/') && currentPath !== '/' 
			? currentPath.slice(0, -1) 
			: currentPath;
		
		// Find best matching link (exact match preferred, then longest path match)
		let bestMatch = null;
		let bestMatchLength = 0;
		
		// First pass: look for exact matches (highest priority)
		const links = Array.from(document.querySelectorAll('.sidebar a'));
		
		for (const a of links) {
			const href = a.getAttribute('href');
			if (!href) continue;
			
			// Normalize href
			const normalizedHref = href.endsWith('/') && href !== '/' 
				? href.slice(0, -1) 
				: href;
			
			// Exact match (highest priority - stop searching)
			if (normalizedCurrent === normalizedHref) {
				bestMatch = a;
				break; // Found exact match, stop searching
			}
			
			// Match with query params
			if (currentPath + currentSearch === href) {
				bestMatch = a;
				break; // Found exact match with query, stop searching
			}
		}
		
		// If no exact match found, find best prefix match
		if (!bestMatch) {
			for (const a of links) {
				const href = a.getAttribute('href');
				if (!href) continue;
				
				// Normalize href
				const normalizedHref = href.endsWith('/') && href !== '/' 
					? href.slice(0, -1) 
					: href;
				
				// Path starts with href (for sub-paths)
				// Only match if current path starts with href + '/' to avoid partial matches
				// e.g., /admin/server should NOT match /admin/server/add
				if (normalizedCurrent.startsWith(normalizedHref + '/') && normalizedHref.length > bestMatchLength) {
					bestMatch = a;
					bestMatchLength = normalizedHref.length;
				}
			}
		}
		
		// Set the best matching link as active
		if (bestMatch) {
			setActiveNav(bestMatch);
		}
		
		// Auto-open dropdowns that contain active links
		document.querySelectorAll('.dropdown-group, .dropdown-subgroup').forEach(group => {
			const activeLink = group.querySelector('a.active');
			if (activeLink) {
				group.classList.add('open');
			}
		});
		
		// Auto-open first dropdown by default if no active link found
		if (document.querySelectorAll('.sidebar a.active').length === 0) {
			const firstDropdown = document.querySelector('.dropdown-group');
			if (firstDropdown) {
				firstDropdown.classList.add('open');
			}
		}
	}

	/**
	 * Setup event listeners for dropdown headers
	 */
	function setupDropdownListeners() {
		document.querySelectorAll('.dropdown-header, .dropdown-subheader').forEach(header => {
			// Remove existing onclick to prevent duplicates
			header.removeAttribute('onclick');
			header.addEventListener('click', function(e) {
				e.preventDefault();
				e.stopPropagation();
				toggleDropdown(this);
			});
		});
	}

	/**
	 * Setup event listeners for navigation links
	 */
	function setupNavListeners() {
		document.querySelectorAll('.sidebar a').forEach(link => {
			// Remove existing onclick to prevent duplicates
			link.removeAttribute('onclick');
			link.addEventListener('click', function(e) {
				setActiveNav(this);
				// Allow default navigation behavior
			});
		});
	}

	/**
	 * Initialize sidebar navigation
	 */
	function init() {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', function() {
				setupDropdownListeners();
				setupNavListeners();
				initActiveNav();
			});
		} else {
			setupDropdownListeners();
			setupNavListeners();
			initActiveNav();
		}
	}

	// Auto-initialize
	init();

	// Export functions globally for inline onclick handlers (backward compatibility)
	if (typeof window !== 'undefined') {
		window.toggleDropdown = toggleDropdown;
		window.setActiveNav = setActiveNav;
		
		window.SidebarNav = {
			toggleDropdown,
			setActiveNav,
			initActiveNav,
			setupDropdownListeners,
			setupNavListeners
		};
	}
})();

