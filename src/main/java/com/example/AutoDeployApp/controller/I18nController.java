package com.example.AutoDeployApp.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.MessageSource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/i18n")
public class I18nController {

	@Autowired
	private MessageSource messageSource;

	/**
	 * Get all messages for a locale
	 */
	@GetMapping("/messages")
	public ResponseEntity<?> getMessages(@RequestParam(defaultValue = "vi") String locale) {
		try {
			Locale loc = Locale.forLanguageTag(locale);
			Map<String, String> messages = new HashMap<>();

			// Load all message keys from message source
			// Note: This is a simplified approach. In production, you might want to
			// maintain a list of keys or use reflection to get all keys.
			// For now, we'll return a subset of commonly used keys.

			// Common messages
			String[] commonKeys = {
				"common.loading", "common.error", "common.success", "common.warning", "common.info",
				"common.close", "common.save", "common.delete", "common.cancel", "common.confirm",
				"common.refresh", "common.search", "common.filter", "common.all", "common.actions",
				"common.status", "common.createdAt", "common.updatedAt"
			};

			// Admin messages
			String[] adminKeys = {
				"admin.dashboard.title", "admin.dashboard.welcome", "admin.dashboard.logout",
				"admin.user.title", "admin.user.list.title", "admin.user.create.title",
				"admin.user.id", "admin.user.username", "admin.user.role", "admin.user.dataLimit",
				"admin.user.pathOnServer", "admin.user.history", "admin.user.resetPassword",
				"admin.user.delete", "admin.user.export",
				"admin.user.create.success", "admin.user.update.success", "admin.user.delete.success",
				"admin.user.delete.confirm", "admin.user.resetPassword.confirm", "admin.user.resetPassword.success",
				"admin.user.noUsers", "admin.user.loadError",
				"admin.server.title", "admin.server.list.title", "admin.server.connected.title",
				"admin.server.history.title", "admin.server.create.title",
				"admin.server.create.success", "admin.server.update.success", "admin.server.delete.success",
				"admin.server.delete.confirm", "admin.server.connect.success", "admin.server.disconnect.success",
				"admin.server.noServers", "admin.server.loadError",
				"admin.k8s.title", "admin.k8s.list.title", "admin.k8s.create.title",
				"admin.k8s.assign.title", "admin.k8s.detail.title",
				"admin.k8s.create.success", "admin.k8s.delete.success", "admin.k8s.delete.confirm",
				"admin.k8s.noClusters", "admin.k8s.loadError",
				"admin.deployment.title", "admin.deployment.list.title",
				"admin.deployment.scale.success", "admin.deployment.delete.success", "admin.deployment.delete.confirm",
				"admin.deployment.noRequests", "admin.deployment.loadError"
			};

			// Status and roles
			String[] statusKeys = {
				"status.pending", "status.running", "status.paused", "status.error",
				"status.rejected", "status.deleted", "status.healthy", "status.warning",
				"status.offline", "status.online", "status.connected"
			};

			String[] roleKeys = {
				"role.admin", "role.operator", "role.viewer", "role.client"
			};

			// Combine all keys
			String[] allKeys = new String[commonKeys.length + adminKeys.length + statusKeys.length + roleKeys.length];
			System.arraycopy(commonKeys, 0, allKeys, 0, commonKeys.length);
			System.arraycopy(adminKeys, 0, allKeys, commonKeys.length, adminKeys.length);
			System.arraycopy(statusKeys, 0, allKeys, commonKeys.length + adminKeys.length, statusKeys.length);
			System.arraycopy(roleKeys, 0, allKeys, commonKeys.length + adminKeys.length + statusKeys.length, roleKeys.length);

			// Get messages
			for (String key : allKeys) {
				try {
					@SuppressWarnings("null")
					String message = messageSource.getMessage(key, null, key, loc);
					messages.put(key, message);
				} catch (Exception e) {
					// If message not found, use key as fallback
					messages.put(key, key);
				}
			}

			return ResponseEntity.ok(Map.of(
				"locale", locale,
				"messages", messages
			));
		} catch (Exception e) {
			return ResponseEntity.status(500)
				.body(Map.of("error", "Failed to load messages", "message", e.getMessage()));
		}
	}
}

