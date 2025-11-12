// Verification Helper - Check if all modules and components are loaded correctly
(function () {
	'use strict';

	/**
	 * Verify all modules and components are loaded
	 */
	function verifyModules() {
		const results = {
			core: {},
			ui: {},
			modules: {},
			global: {}
		};

		// Core modules
		results.core.apiClient = typeof window.ApiClient !== 'undefined';
		results.core.eventBus = typeof window.EventBus !== 'undefined';
		results.core.wsClient = typeof window.WSClient !== 'undefined';
		results.core.i18n = typeof window.I18n !== 'undefined';
		results.core.adminBus = typeof window.AdminBus !== 'undefined';

		// UI components
		results.ui.modal = typeof window.Modal !== 'undefined';
		results.ui.table = typeof window.Table !== 'undefined';
		results.ui.pagination = typeof window.Pagination !== 'undefined';
		results.ui.toast = typeof window.Toast !== 'undefined';

		// Feature modules
		results.modules.users = typeof window.UsersModule !== 'undefined';
		results.modules.servers = typeof window.ServersModule !== 'undefined';
		results.modules.k8sClusters = typeof window.K8sClustersModule !== 'undefined';
		results.modules.deploymentRequests = typeof window.DeploymentRequestsModule !== 'undefined';

		// Global utilities
		results.global.showAlert = typeof window.showAlert === 'function';

		return results;
	}

	/**
	 * Check for console errors
	 */
	function checkConsoleErrors() {
		const errors = [];
		const originalError = console.error;
		console.error = function (...args) {
			errors.push(args.join(' '));
			originalError.apply(console, args);
		};
		return {
			errors,
			restore: () => { console.error = originalError; }
		};
	}

	/**
	 * Verify static resources
	 */
	async function verifyStaticResources() {
		const resources = [
			'/js/core/apiClient.js',
			'/js/core/eventBus.js',
			'/js/core/wsClient.js',
			'/js/core/i18n.js',
			'/js/ui/modal.js',
			'/js/ui/table.js',
			'/js/ui/pagination.js',
			'/js/ui/toast.js',
			'/js/admin.js',
			'/css/admin.css',
			'/login.css',
			'/home-admin.css'
		];

		const results = {};
		for (const resource of resources) {
			try {
				const response = await fetch(resource, { method: 'HEAD' });
				results[resource] = response.ok;
			} catch (error) {
				results[resource] = false;
			}
		}

		return results;
	}

	/**
	 * Run all verifications
	 */
	async function runVerification() {
		console.log('=== Admin Dashboard Verification ===');
		
		// Module verification
		const modules = verifyModules();
		console.log('\n📦 Modules:');
		console.table(modules);

		// Static resources verification
		console.log('\n📁 Static Resources:');
		const resources = await verifyStaticResources();
		const resourceResults = Object.entries(resources).map(([path, ok]) => ({
			path,
			status: ok ? '✓' : '✗'
		}));
		console.table(resourceResults);

		// Summary
		const allModulesOk = Object.values(modules.core).every(v => v) &&
			Object.values(modules.ui).every(v => v) &&
			Object.values(modules.modules).every(v => v) &&
			modules.global.showAlert;
		const allResourcesOk = Object.values(resources).every(v => v);

		console.log('\n📊 Summary:');
		console.log(`Modules: ${allModulesOk ? '✓ All loaded' : '✗ Some missing'}`);
		console.log(`Resources: ${allResourcesOk ? '✓ All accessible' : '✗ Some missing'}`);
		console.log(`Overall: ${allModulesOk && allResourcesOk ? '✓ PASS' : '✗ FAIL'}`);

		return {
			modules,
			resources,
			allOk: allModulesOk && allResourcesOk
		};
	}

	// Export
	window.Verification = {
		verifyModules,
		checkConsoleErrors,
		verifyStaticResources,
		run: runVerification
	};

	// Auto-run on page load (optional, can be disabled)
	if (window.location.search.includes('verify=true')) {
		document.addEventListener('DOMContentLoaded', () => {
			setTimeout(runVerification, 1000); // Wait for all scripts to load
		});
	}
})();

