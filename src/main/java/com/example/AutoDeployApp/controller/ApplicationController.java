package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Application;
import com.example.AutoDeployApp.service.KubernetesService;
import com.example.AutoDeployApp.service.ApplicationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/applications")
public class ApplicationController {

    private final ApplicationService applicationService;
    private final KubernetesService kubernetesService;

    public ApplicationController(ApplicationService applicationService, KubernetesService kubernetesService) {
        this.applicationService = applicationService;
        this.kubernetesService = kubernetesService;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadApplication(
            @RequestParam("appName") String appName,
            @RequestParam("dockerImage") String dockerImage,
            HttpServletRequest request) {

        try {
            // Lấy userId từ session
            Long userId = getUserIdFromSession(request);
            if (userId == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            // Tạo application
            Application application = applicationService.createApplication(userId, appName, dockerImage);

            // Return response
            Map<String, Object> response = new HashMap<>();
            response.put("applicationId", application.getId());
            response.put("status", application.getStatus());
            response.put("message", "Yêu cầu của bạn đã được gửi và đang chờ admin xử lý");

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Validation Error", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<?> getApplications(HttpServletRequest request) {
        try {
            Long userId = getUserIdFromSession(request);
            if (userId == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            List<Application> applications = applicationService.getUserApplications(userId);

            // Convert to DTO format
            List<Map<String, Object>> response = applications.stream()
                    .map(app -> {
                        Map<String, Object> map = new HashMap<>();
                        map.put("id", app.getId());
                        map.put("appName", app.getAppName());
                        map.put("dockerImage", app.getDockerImage());
                        map.put("status", app.getStatus());
                        map.put("k8sNamespace", app.getK8sNamespace());
                        map.put("accessUrl", app.getAccessUrl());
                        map.put("createdAt", app.getCreatedAt());
                        return map;
                    })
                    .collect(Collectors.toList());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getApplication(@PathVariable Long id, HttpServletRequest request) {
        try {
            Long userId = getUserIdFromSession(request);
            if (userId == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            return applicationService.getApplicationById(id)
                    .map(app -> {
                        // Kiểm tra user có quyền xem app này không
                        if (!app.getUserId().equals(userId)) {
                            return ResponseEntity.status(403)
                                    .body(Map.of("error", "Forbidden", "message", "Không có quyền truy cập"));
                        }

                        Map<String, Object> map = new HashMap<>();
                        map.put("id", app.getId());
                        map.put("appName", app.getAppName());
                        map.put("dockerImage", app.getDockerImage());
                        map.put("status", app.getStatus());
                        map.put("k8sNamespace", app.getK8sNamespace());
                        map.put("k8sDeploymentName", app.getK8sDeploymentName());
                        map.put("k8sServiceName", app.getK8sServiceName());
                        map.put("k8sIngressName", app.getK8sIngressName());
                        map.put("accessUrl", app.getAccessUrl());
                        map.put("createdAt", app.getCreatedAt());
                        map.put("updatedAt", app.getUpdatedAt());
                        return ResponseEntity.ok(map);
                    })
                    .orElse(ResponseEntity.status(404)
                            .body(Map.of("error", "Not Found", "message", "Application not found")));

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    @GetMapping("/{id}/status")
    public ResponseEntity<?> getApplicationStatus(@PathVariable Long id, HttpServletRequest request) {
        try {
            Long userId = getUserIdFromSession(request);
            if (userId == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            return applicationService.getApplicationById(id)
                    .map(app -> {
                        if (!app.getUserId().equals(userId)) {
                            return ResponseEntity.status(403)
                                    .body(Map.of("error", "Forbidden", "message", "Không có quyền truy cập"));
                        }

                        Map<String, Object> status = new HashMap<>();
                        status.put("status", app.getStatus());
                        status.put("accessUrl", app.getAccessUrl());
                        return ResponseEntity.ok(status);
                    })
                    .orElse(ResponseEntity.status(404)
                            .body(Map.of("error", "Not Found", "message", "Application not found")));

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * User request delete: Chỉ đánh dấu status = DELETED, chờ admin xóa hoàn toàn
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteApplication(@PathVariable Long id, HttpServletRequest request) {
        try {
            Long userId = getUserIdFromSession(request);
            if (userId == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            Application deletedApp = applicationService.markAsDeleted(id, userId);

            // Best-effort cleanup K8s resources for this app, but DO NOT delete namespace
            try {
                String namespace = deletedApp.getK8sNamespace();
                Long clusterId = deletedApp.getClusterId();
                if (clusterId != null && namespace != null && !namespace.isBlank()) {
                    kubernetesService.deleteApplicationResources(
                            namespace,
                            deletedApp.getK8sDeploymentName(),
                            deletedApp.getK8sServiceName(),
                            deletedApp.getK8sIngressName(),
                            clusterId);
                }
            } catch (Exception cleanupEx) {
                // Log only; still return success for delete request marking
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("applicationId", deletedApp.getId());
            response.put("status", deletedApp.getStatus());
            response.put("message",
                    "Đã xóa tài nguyên K8s của ứng dụng (không xóa namespace). Ứng dụng được đánh dấu DELETED.");

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Bad Request", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    private Long getUserIdFromSession(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object userIdObj = session.getAttribute("USER_ID");
        if (userIdObj instanceof Long) {
            return (Long) userIdObj;
        } else if (userIdObj instanceof Number) {
            return ((Number) userIdObj).longValue();
        }
        return null;
    }
}
