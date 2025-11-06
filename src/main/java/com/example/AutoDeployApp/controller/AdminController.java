package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Application;
import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.entity.User;
import com.example.AutoDeployApp.entity.UserActivity;
import com.example.AutoDeployApp.service.ApplicationService;
import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.service.KubernetesService;
import com.example.AutoDeployApp.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin")
public class AdminController {

    private static final Logger logger = LoggerFactory.getLogger(AdminController.class);

    private final UserService userService;
    private final ApplicationService applicationService;
    private final KubernetesService kubernetesService;
    private final ClusterService clusterService;

    public AdminController(UserService userService, ApplicationService applicationService,
            KubernetesService kubernetesService, ClusterService clusterService) {
        this.userService = userService;
        this.applicationService = applicationService;
        this.kubernetesService = kubernetesService;
        this.clusterService = clusterService;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        return userService.findAll().stream()
                .map(u -> Map.<String, Object>of(
                        "id", u.getId(),
                        "username", u.getUsername(),
                        "role", Objects.toString(u.getRole(), "CLIENT"),
                        "dataLimitMb", u.getDataLimitMb(),
                        "pathOnServer", Objects.toString(u.getPathOnServer(), "")))
                .toList();
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestBody Map<String, Object> body) {
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String role = (String) body.getOrDefault("role", "CLIENT");
        Integer dataLimitMb = body.get("dataLimitMb") != null ? ((Number) body.get("dataLimitMb")).intValue() : null;
        String pathOnServer = (String) body.get("pathOnServer");
        User created = userService.createUser(username, password, role, dataLimitMb, pathOnServer);
        return ResponseEntity.ok(Map.of("id", created.getId()));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<?> updateUser(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String role = (String) body.get("role");
        Integer dataLimitMb = body.get("dataLimitMb") != null ? ((Number) body.get("dataLimitMb")).intValue() : null;
        String pathOnServer = (String) body.get("pathOnServer");
        User updated = userService.updateUser(id, role, dataLimitMb, pathOnServer);
        return ResponseEntity.ok(Map.of("id", updated.getId()));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        // Cleanup all apps and namespace for this user across clusters, then delete
        // user
        User user = userService.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String username = user.getUsername();
        String userNamespace = sanitizeUserNamespace(username);

        // Find all applications of this user
        List<Application> userApps = applicationService.getApplicationsByUserId(id);

        List<String> cleanupErrors = new ArrayList<>();

        // First, delete K8s resources for each app (but not namespace)
        for (Application app : userApps) {
            try {
                Long clusterId = app.getClusterId();
                if (clusterId != null) {
                    kubernetesService.deleteApplicationResources(
                            userNamespace,
                            app.getK8sDeploymentName(),
                            app.getK8sServiceName(),
                            app.getK8sIngressName(),
                            clusterId);
                }
            } catch (Exception ex) {
                String message = "Không thể xóa tài nguyên Kubernetes cho ứng dụng #" + app.getId() + ": "
                        + ex.getMessage();
                cleanupErrors.add(message);
                logger.error(message, ex);
            }
        }

        // Then, delete namespace on each distinct cluster used by the user
        userApps.stream()
                .map(Application::getClusterId)
                .filter(Objects::nonNull)
                .distinct()
                .forEach(clusterId -> {
                    try {
                        kubernetesService.deleteNamespace(userNamespace, clusterId);
                    } catch (Exception ex) {
                        String message = "Không thể xóa namespace \"" + userNamespace + "\" trên cluster #" + clusterId
                                + ": " + ex.getMessage();
                        cleanupErrors.add(message);
                        logger.error(message, ex);
                    }
                });

        if (!cleanupErrors.isEmpty()) {
            return ResponseEntity.status(500)
                    .body(Map.of(
                            "error", "CleanupFailed",
                            "message", "Không thể xóa người dùng do lỗi khi dọn dẹp tài nguyên Kubernetes",
                            "details", cleanupErrors));
        }

        List<String> deletionErrors = new ArrayList<>();
        for (Application app : userApps) {
            try {
                applicationService.deleteApplicationCompletely(app.getId());
            } catch (Exception ex) {
                String message = "Không thể xóa bản ghi ứng dụng #" + app.getId() + ": " + ex.getMessage();
                deletionErrors.add(message);
                logger.error(message, ex);
            }
        }

        if (!deletionErrors.isEmpty()) {
            return ResponseEntity.status(500)
                    .body(Map.of(
                            "error", "DatabaseCleanupFailed",
                            "message", "Không thể xóa hết ứng dụng của người dùng. Đã dừng thao tác.",
                            "details", deletionErrors));
        }

        try {
            userService.deleteUser(id);
        } catch (Exception ex) {
            String message = "Không thể xóa người dùng khỏi database: " + ex.getMessage();
            logger.error("Failed to delete user {}", id, ex);
            return ResponseEntity.status(500)
                    .body(Map.of(
                            "error", "UserDeleteFailed",
                            "message", message));
        }

        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String newPassword = body.get("password");
        userService.resetPassword(id, newPassword);
        return ResponseEntity.ok(Map.of("id", id));
    }

    @GetMapping("/users/{id}/activities")
    public List<UserActivity> activities(@PathVariable Long id) {
        return userService.getActivitiesForUser(id);
    }

    /**
     * Admin: Xem danh sách deployment requests (pending hoặc tất cả)
     */
    @GetMapping("/deployment-requests")
    public ResponseEntity<?> getDeploymentRequests(
            @RequestParam(required = false) String status,
            @RequestHeader(value = "X-Forwarded-For", required = false) String xff,
            @RequestHeader(value = "X-Real-IP", required = false) String xri,
            jakarta.servlet.http.HttpServletRequest request) {

        try {
            // Kiểm tra admin role (có thể thêm interceptor sau)
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền truy cập"));
            }

            List<Application> applications;
            if (status != null && !status.trim().isEmpty()) {
                // Filter theo status nếu có
                String statusFilter = status.trim();
                if ("PENDING".equalsIgnoreCase(statusFilter)) {
                    applications = applicationService.getPendingApplications();
                } else {
                    // Filter theo status khác (RUNNING, ERROR, etc.)
                    applications = applicationService.getAllApplications().stream()
                            .filter(app -> statusFilter.equalsIgnoreCase(app.getStatus()))
                            .collect(Collectors.toList());
                }
            } else {
                // Lấy tất cả applications (không filter) - sắp xếp theo created_at DESC
                applications = applicationService.getAllApplications();
            }

            Map<Long, User> userLookup = userService.findAllByIds(
                    applications.stream()
                            .map(Application::getUserId)
                            .filter(Objects::nonNull)
                            .collect(Collectors.toSet()));

            // Convert to DTO với username
            List<Map<String, Object>> response = applications.stream()
                    .map(app -> {
                        // Lấy username từ userId
                        String username = "Unknown";
                        if (app.getUserId() != null) {
                            User matchedUser = userLookup.get(app.getUserId());
                            if (matchedUser != null && matchedUser.getUsername() != null) {
                                username = matchedUser.getUsername();
                            }
                        }

                        Map<String, Object> map = new HashMap<>();
                        map.put("id", app.getId());
                        map.put("appName", app.getAppName());
                        map.put("dockerImage", app.getDockerImage());
                        map.put("userId", app.getUserId());
                        map.put("username", username);
                        map.put("status", app.getStatus());
                        map.put("k8sNamespace", app.getK8sNamespace());
                        map.put("clusterId", app.getClusterId());
                        map.put("accessUrl", app.getAccessUrl());
                        map.put("cpuRequest", app.getCpuRequest());
                        map.put("cpuLimit", app.getCpuLimit());
                        map.put("memoryRequest", app.getMemoryRequest());
                        map.put("memoryLimit", app.getMemoryLimit());
                        map.put("replicas", app.getReplicas());
                        map.put("containerPort", app.getContainerPort());
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

    /**
     * Admin: Xử lý deployment request - tạo K8s resources
     */
    @PostMapping("/deployment-requests/{id}/process")
    public ResponseEntity<?> processDeploymentRequest(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> requestBody,
            @RequestHeader(value = "X-Forwarded-For", required = false) String xff,
            @RequestHeader(value = "X-Real-IP", required = false) String xri,
            jakarta.servlet.http.HttpServletRequest request) {

        try {
            // Kiểm tra admin role
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền xử lý"));
            }

            // Parse optional clusterId from request body (admin có thể chọn thủ công)
            Long requestedClusterId = null;
            if (requestBody != null && requestBody.containsKey("clusterId")) {
                Object clusterObj = requestBody.get("clusterId");
                if (clusterObj instanceof Number) {
                    requestedClusterId = ((Number) clusterObj).longValue();
                } else if (clusterObj instanceof String) {
                    String clusterStr = ((String) clusterObj).trim();
                    if (!clusterStr.isEmpty()) {
                        try {
                            requestedClusterId = Long.parseLong(clusterStr);
                        } catch (NumberFormatException nfe) {
                            throw new IllegalArgumentException("clusterId không hợp lệ");
                        }
                    }
                }
            }

            // Load Application từ database
            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            // Kiểm tra status - cho phép PENDING (lần đầu) hoặc ERROR (retry)
            String currentStatus = application.getStatus();
            if (!"PENDING".equals(currentStatus) && !"ERROR".equals(currentStatus)) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Bad Request", "message",
                                "Application không thể xử lý lại. Status hiện tại: " + currentStatus
                                        + ". Chỉ có thể retry khi status là ERROR."));
            }

            // Nếu đang retry từ ERROR, cleanup resources cũ trước
            boolean isRetry = "ERROR".equals(currentStatus);
            if (isRetry && application.getClusterId() != null
                    && application.getK8sDeploymentName() != null
                    && !application.getK8sDeploymentName().isEmpty()) {
                try {
                    logger.info("Retry deployment: Cleaning up old K8s resources for application: {}", id);
                    kubernetesService.deleteApplicationResources(
                            application.getK8sNamespace(),
                            application.getK8sDeploymentName(),
                            application.getK8sServiceName(),
                            application.getK8sIngressName(),
                            application.getClusterId());
                    logger.info("Old K8s resources cleaned up successfully");
                } catch (Exception cleanupException) {
                    logger.warn("Failed to cleanup old K8s resources, will continue with new deployment",
                            cleanupException);
                    // Continue anyway - resources might not exist or already deleted
                }
            }

            // Lấy thông tin user để có username
            User user = userService.findById(application.getUserId())
                    .orElseThrow(() -> new IllegalArgumentException("User not found"));

            String username = user.getUsername();
            String appName = application.getAppName();
            // Namespace đã được gán khi tạo application (mỗi user 1 namespace), nên dùng
            // trực tiếp
            String namespace = application.getK8sNamespace();
            if (namespace == null || namespace.trim().isEmpty()) {
                // Fallback: tạo theo username nếu namespace chưa có (legacy data)
                namespace = sanitizeUserNamespace(username);
            }

            // Enforce: mỗi user chỉ có 1 namespace = sanitized(username)
            String expectedUserNamespace = sanitizeUserNamespace(username);
            if (!expectedUserNamespace.equals(namespace)) {
                namespace = expectedUserNamespace;
                application.setK8sNamespace(namespace);
                applicationService.updateApplication(application);
            }
            String dockerImage = application.getDockerImage();

            Cluster cluster;
            boolean autoSelectedCluster = requestedClusterId == null;
            if (autoSelectedCluster) {
                // Tự động chọn cluster HEALTHY đầu tiên (có MASTER online)
                cluster = clusterService.getFirstHealthyCluster()
                        .orElseThrow(() -> new RuntimeException(
                                "Không tìm thấy cluster K8s nào để triển khai. Vui lòng thêm cluster và đảm bảo MASTER node đang online."));
                if (!clusterService.hasMasterOnline(cluster.getId())) {
                    throw new RuntimeException(
                            "MASTER node trong cluster \"" + cluster.getName() + "\" đang offline. "
                                    + "Không thể triển khai ứng dụng. Vui lòng kiểm tra kết nối MASTER node và thử lại.");
                }
            } else {
                cluster = clusterService.findById(requestedClusterId)
                        .orElseThrow(() -> new IllegalArgumentException("Cluster được chọn không tồn tại"));
                if (!clusterService.hasMasterOnline(cluster.getId())) {
                    throw new IllegalArgumentException(
                            "MASTER node trong cluster \"" + cluster.getName() + "\" đang offline. "
                                    + "Vui lòng chọn cluster khác hoặc kiểm tra kết nối.");
                }
            }
            Long clusterId = cluster.getId();

            if (autoSelectedCluster) {
                logger.info("Auto-selected cluster for deployment: {} (ID: {}), MASTER is online", cluster.getName(),
                        clusterId);
            } else {
                logger.info("Admin selected cluster for deployment: {} (ID: {}), MASTER is online", cluster.getName(),
                        clusterId);
            }

            // Lưu clusterId ngay sau khi chọn cluster (trước khi tạo resources)
            // Để có thể cleanup nếu deployment lỗi
            application.setClusterId(clusterId);
            applicationService.updateApplication(application);

            // Helper method để append log
            java.util.function.Consumer<String> appendLog = (logMessage) -> {
                String currentLogs = application.getDeploymentLogs() != null ? application.getDeploymentLogs() : "";
                String timestamp = java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss"));
                String newLog = currentLogs + "[" + timestamp + "] " + logMessage + "\n";
                application.setDeploymentLogs(newLog);
                applicationService.updateApplication(application);
            };

            // Clear old logs nếu đang retry
            if (isRetry) {
                application.setDeploymentLogs("");
                applicationService.updateApplication(application);
                appendLog.accept("🔄 Bắt đầu retry quá trình triển khai ứng dụng: " + appName);
                appendLog.accept("🧹 Đã cleanup các K8s resources cũ (nếu có)");
            } else {
                // Initialize logs cho lần deploy đầu tiên
                appendLog.accept("🚀 Bắt đầu quá trình triển khai ứng dụng: " + appName);
            }

            try {
                // 1. Tự động chọn cluster HEALTHY đầu tiên
                if (autoSelectedCluster) {
                    appendLog.accept("✅ Đã tự động chọn cluster: " + cluster.getName() + " (ID: " + clusterId + ")");
                } else {
                    appendLog.accept("✅ Đã sử dụng cluster do admin chọn: " + cluster.getName() + " (ID: " + clusterId
                            + ")");
                }
                appendLog.accept("💾 Đã lưu cluster ID vào database để theo dõi");

                // 2. Lấy kubeconfig từ master node
                appendLog.accept("📥 Đang lấy kubeconfig từ master node...");
                kubernetesService.ensureNamespace(namespace, clusterId); // Sẽ trigger getKubeconfig trong service
                appendLog.accept("✅ Đã lấy kubeconfig thành công");

                // 3. Tạo KubernetesClient từ kubeconfig
                appendLog.accept("🔗 Đang tạo kết nối đến Kubernetes cluster...");
                appendLog.accept("✅ Đã tạo KubernetesClient thành công");

                // 4. Ensure namespace exists
                appendLog.accept("📦 Đang tạo namespace: " + namespace);
                kubernetesService.ensureNamespace(namespace, clusterId);
                appendLog.accept("✅ Namespace đã được tạo/kiểm tra: " + namespace);

                // 5. Generate resource names
                String deploymentName = appName.toLowerCase().replaceAll("[^a-z0-9-]", "-") + "-" + application.getId();
                String serviceName = "svc-" + deploymentName;
                String ingressName = "ing-" + deploymentName;
                appendLog.accept("📝 Tên resources: Deployment=" + deploymentName + ", Service=" + serviceName
                        + ", Ingress=" + ingressName);

                // 5.5 Validate docker image exists (basic pre-check for Docker Hub)
                var imageCheck = validateDockerImageInternal(dockerImage);
                if (!imageCheck.valid) {
                    appendLog.accept("❌ Image không hợp lệ: " + dockerImage + ". Lý do: " + imageCheck.message);
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Invalid Image",
                                    "message",
                                    "Docker image không tồn tại hoặc không truy cập được: " + imageCheck.message));
                }

                // 6. Create Deployment
                appendLog.accept("🔨 Đang tạo Deployment: " + deploymentName + " với image: " + dockerImage);

                // Get parameters from request body, application entity, or use defaults
                // Default values: Container Port=80, Replicas=1
                int containerPort = application.getContainerPort() != null ? application.getContainerPort() : 80;
                int replicas = application.getReplicas() != null ? application.getReplicas() : 1;

                // Override with request body values if provided
                if (requestBody != null) {
                    if (requestBody.containsKey("containerPort")) {
                        Object portObj = requestBody.get("containerPort");
                        if (portObj instanceof Number) {
                            containerPort = ((Number) portObj).intValue();
                        } else if (portObj instanceof String) {
                            try {
                                containerPort = Integer.parseInt((String) portObj);
                            } catch (NumberFormatException e) {
                                // Keep existing value
                            }
                        }
                    }
                    if (requestBody.containsKey("replicas")) {
                        Object replicasObj = requestBody.get("replicas");
                        if (replicasObj instanceof Number) {
                            replicas = ((Number) replicasObj).intValue();
                        } else if (replicasObj instanceof String) {
                            try {
                                replicas = Integer.parseInt((String) replicasObj);
                            } catch (NumberFormatException e) {
                                // Keep existing value
                            }
                        }
                    }
                }

                // Get resource limits from request body or application, with defaults
                // Default values: CPU Request=100m, CPU Limit=500m, Memory Request=128Mi,
                // Memory Limit=256Mi
                String cpuRequest = "100m";
                String cpuLimit = "500m";
                String memoryRequest = "128Mi";
                String memoryLimit = "256Mi";

                // Use values from application entity if available (not null/empty)
                if (application.getCpuRequest() != null && !application.getCpuRequest().trim().isEmpty()) {
                    cpuRequest = application.getCpuRequest();
                }
                if (application.getCpuLimit() != null && !application.getCpuLimit().trim().isEmpty()) {
                    cpuLimit = application.getCpuLimit();
                }
                if (application.getMemoryRequest() != null && !application.getMemoryRequest().trim().isEmpty()) {
                    memoryRequest = application.getMemoryRequest();
                }
                if (application.getMemoryLimit() != null && !application.getMemoryLimit().trim().isEmpty()) {
                    memoryLimit = application.getMemoryLimit();
                }

                // Override with request body values if provided (not null/empty)
                if (requestBody != null) {
                    if (requestBody.containsKey("cpuRequest")) {
                        String reqCpuRequest = (String) requestBody.get("cpuRequest");
                        if (reqCpuRequest != null && !reqCpuRequest.trim().isEmpty()) {
                            cpuRequest = reqCpuRequest;
                        }
                    }
                    if (requestBody.containsKey("cpuLimit")) {
                        String reqCpuLimit = (String) requestBody.get("cpuLimit");
                        if (reqCpuLimit != null && !reqCpuLimit.trim().isEmpty()) {
                            cpuLimit = reqCpuLimit;
                        }
                    }
                    if (requestBody.containsKey("memoryRequest")) {
                        String reqMemoryRequest = (String) requestBody.get("memoryRequest");
                        if (reqMemoryRequest != null && !reqMemoryRequest.trim().isEmpty()) {
                            memoryRequest = reqMemoryRequest;
                        }
                    }
                    if (requestBody.containsKey("memoryLimit")) {
                        String reqMemoryLimit = (String) requestBody.get("memoryLimit");
                        if (reqMemoryLimit != null && !reqMemoryLimit.trim().isEmpty()) {
                            memoryLimit = reqMemoryLimit;
                        }
                    }
                }

                // Parse env vars from request body
                Map<String, String> envVars = null;
                if (requestBody != null && requestBody.containsKey("envVars")) {
                    try {
                        String envVarsStr = (String) requestBody.get("envVars");
                        if (envVarsStr != null && !envVarsStr.trim().isEmpty()) {
                            @SuppressWarnings("unchecked")
                            Map<String, String> parsed = new com.fasterxml.jackson.databind.ObjectMapper()
                                    .readValue(envVarsStr, Map.class);
                            envVars = parsed;
                        }
                    } catch (Exception e) {
                        logger.warn("Failed to parse envVars, will continue without them", e);
                    }
                }

                appendLog.accept("💻 Resource limits: CPU=" + cpuRequest + "/" + cpuLimit + ", Memory=" + memoryRequest
                        + "/" + memoryLimit);
                appendLog.accept("🔢 Replicas: " + replicas + ", Container Port: " + containerPort);

                kubernetesService.createDeployment(namespace, deploymentName, dockerImage, containerPort, clusterId,
                        cpuRequest, cpuLimit, memoryRequest, memoryLimit, replicas, envVars);
                appendLog.accept("✅ Deployment đã được tạo: " + deploymentName);
                // Lưu ngay tên deployment để có thể cleanup nếu bước sau lỗi
                application.setK8sDeploymentName(deploymentName);
                applicationService.updateApplication(application);

                // 7. Create Service
                appendLog.accept("🔌 Đang tạo Service: " + serviceName);
                kubernetesService.createService(namespace, serviceName, deploymentName, 80, containerPort, clusterId);
                appendLog.accept("✅ Service đã được tạo: " + serviceName);
                // Lưu ngay tên service
                application.setK8sServiceName(serviceName);
                applicationService.updateApplication(application);

                // 8. Create Ingress
                appendLog.accept("🌐 Đang tạo Ingress: " + ingressName);
                kubernetesService.createIngress(namespace, ingressName, serviceName, 80, clusterId, appName);
                appendLog.accept("✅ Ingress đã được tạo: " + ingressName);
                // Lưu ngay tên ingress
                application.setK8sIngressName(ingressName);
                applicationService.updateApplication(application);

                // 9. Wait for Deployment ready (timeout: 2 minutes)
                appendLog.accept("⏳ Đang chờ Deployment sẵn sàng... (timeout: 2 phút)");
                kubernetesService.waitForDeploymentReady(namespace, deploymentName, 2, clusterId);
                appendLog.accept("✅ Deployment đã sẵn sàng: " + deploymentName);

                // 10. Get Ingress URL from MetalLB
                appendLog.accept("🔍 Đang lấy Ingress URL từ MetalLB...");
                String accessUrl = kubernetesService.getIngressURL(namespace, ingressName, clusterId);
                appendLog.accept("✅ Đã lấy Ingress URL: " + accessUrl);

                // 11. Update Application with K8s metadata
                appendLog.accept("💾 Đang lưu thông tin deployment vào database...");
                application.setStatus("RUNNING");
                application.setK8sDeploymentName(deploymentName);
                application.setK8sServiceName(serviceName);
                application.setK8sIngressName(ingressName);
                application.setAccessUrl(accessUrl);
                // clusterId đã được lưu sớm hơn (sau khi chọn cluster), không cần set lại

                Application savedApplication = applicationService.updateApplication(application);
                appendLog.accept("✅ Đã lưu tất cả thông tin deployment vào database");
                appendLog.accept("🎉 Triển khai hoàn tất thành công!");
                String appNameForLog = savedApplication.getAppName(); // For lambda

                // Log activity
                Object adminUsername = session.getAttribute("USER_USERNAME");
                if (adminUsername != null) {
                    userService.findByUsername(adminUsername.toString()).ifPresent(admin -> {
                        String ip = xff != null ? xff : (xri != null ? xri : null);
                        userService.logActivity(admin, "DEPLOY_PROCESS",
                                "Đã triển khai ứng dụng: " + appNameForLog + " lên K8s", ip);
                    });
                }

                // Return response
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("applicationId", savedApplication.getId());
                response.put("status", savedApplication.getStatus());
                response.put("accessUrl", savedApplication.getAccessUrl());
                response.put("message", "Ứng dụng đã được triển khai thành công lên Kubernetes");

                Map<String, Object> k8sResources = new HashMap<>();
                k8sResources.put("namespace", namespace);
                k8sResources.put("deployment", deploymentName);
                k8sResources.put("service", serviceName);
                k8sResources.put("ingress", ingressName);
                response.put("k8sResources", k8sResources);

                return ResponseEntity.ok(response);

            } catch (Exception k8sException) {
                // If K8s deployment fails, update status to ERROR and log error
                // clusterId đã được lưu sớm hơn, nên có thể cleanup resources nếu cần
                String errorLog = "❌ LỖI: " + k8sException.getMessage();
                if (application.getDeploymentLogs() != null) {
                    String currentLogs = application.getDeploymentLogs();
                    String timestamp = java.time.LocalDateTime.now()
                            .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss"));
                    application.setDeploymentLogs(currentLogs + "[" + timestamp + "] " + errorLog + "\n");
                } else {
                    application
                            .setDeploymentLogs("["
                                    + java.time.LocalDateTime.now()
                                            .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss"))
                                    + "] " + errorLog + "\n");
                }
                application.setStatus("ERROR");
                // Giữ nguyên clusterId đã lưu để có thể cleanup sau (clusterId không bị thay
                // đổi)
                applicationService.updateApplication(application);

                logger.error("Failed to deploy to Kubernetes", k8sException);
                return ResponseEntity.status(500)
                        .body(Map.of(
                                "error", "Kubernetes Deployment Failed",
                                "message", "Không thể triển khai lên Kubernetes: " + k8sException.getMessage()));
            }

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Bad Request", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * Admin: Kiểm tra nhanh image có tồn tại (public Docker Hub) hay không
     */
    @GetMapping("/images/validate")
    public ResponseEntity<?> validateDockerImage(@RequestParam("image") String image,
            jakarta.servlet.http.HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }
            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền thực hiện"));
            }

            var result = validateDockerImageInternal(image);
            return ResponseEntity.ok(Map.of(
                    "image", image,
                    "valid", result.valid,
                    "message", result.message));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    private static class ImageValidation {
        final boolean valid;
        final String message;

        ImageValidation(boolean valid, String message) {
            this.valid = valid;
            this.message = message;
        }
    }

    // Very basic validator focusing on Docker Hub public images
    private ImageValidation validateDockerImageInternal(String image) {
        try {
            if (image == null || image.trim().isEmpty()) {
                return new ImageValidation(false, "Chuỗi image rỗng");
            }
            String ref = image.trim();
            // Extract tag
            String namePart = ref;
            String tag = "latest";
            int idx = ref.lastIndexOf(':');
            if (idx > 0 && ref.indexOf('/') < idx) { // has tag
                namePart = ref.substring(0, idx);
                tag = ref.substring(idx + 1);
            }

            // Detect registry
            String registry = "docker.io";
            String path = namePart;
            int slashIdx = namePart.indexOf('/');
            if (slashIdx > 0
                    && (namePart.contains(".") || namePart.contains(":") || namePart.startsWith("localhost"))) {
                // Explicit registry provided
                int firstSlash = namePart.indexOf('/');
                registry = namePart.substring(0, firstSlash);
                path = namePart.substring(firstSlash + 1);
            }

            if ("docker.io".equals(registry) || "registry-1.docker.io".equals(registry)) {
                // Docker Hub: map to hub API
                // If no namespace, assume library/
                if (!path.contains("/")) {
                    path = "library/" + path;
                }
                String hubUrl = "https://hub.docker.com/v2/repositories/" + urlEncode(path) + "/tags/" + urlEncode(tag);
                int code = httpHeadOrGet(hubUrl);
                if (code == 200)
                    return new ImageValidation(true, "Found on Docker Hub");
                if (code == 404)
                    return new ImageValidation(false, "Tag không tồn tại trên Docker Hub");
                return new ImageValidation(false, "Không xác minh được (HTTP " + code + ")");
            }

            // Generic registry check (unauth HEAD to v2 manifest) - best effort
            String manifestUrl = "https://" + registry + "/v2/" + path + "/manifests/" + tag;
            int code = httpHead(manifestUrl, "application/vnd.docker.distribution.manifest.v2+json");
            if (code == 200)
                return new ImageValidation(true, "Found on registry");
            return new ImageValidation(false, "Không xác minh được trên registry (HTTP " + code + ")");
        } catch (Exception e) {
            return new ImageValidation(false, e.getMessage());
        }
    }

    private int httpHeadOrGet(String url) throws Exception {
        int code = httpHead(url, null);
        if (code == 405 || code == 403) { // fallback GET when HEAD not allowed
            return httpGet(url);
        }
        return code;
    }

    private int httpHead(String url, String accept) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) java.net.URI.create(url).toURL().openConnection();
        conn.setRequestMethod("HEAD");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        if (accept != null)
            conn.setRequestProperty("Accept", accept);
        conn.connect();
        int code = conn.getResponseCode();
        conn.disconnect();
        return code;
    }

    private int httpGet(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) java.net.URI.create(url).toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        conn.connect();
        int code = conn.getResponseCode();
        conn.disconnect();
        return code;
    }

    private String urlEncode(String s) {
        return java.net.URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /**
     * Admin: Xem chi tiết một deployment request
     */
    @GetMapping("/deployment-requests/{id}")
    public ResponseEntity<?> getDeploymentRequestDetail(
            @PathVariable Long id,
            jakarta.servlet.http.HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }
            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền truy cập"));
            }

            return applicationService.getApplicationById(id)
                    .map(app -> {
                        // Get username from userId
                        String username = "Unknown";
                        if (app.getUserId() != null) {
                            username = userService.findById(app.getUserId())
                                    .map(User::getUsername)
                                    .orElse("Unknown");
                        }

                        java.util.Map<String, Object> map = new java.util.HashMap<>();
                        map.put("id", app.getId());
                        map.put("appName", app.getAppName());
                        map.put("dockerImage", app.getDockerImage());
                        map.put("userId", app.getUserId());
                        map.put("username", username);
                        map.put("status", app.getStatus());
                        map.put("k8sNamespace", app.getK8sNamespace());
                        map.put("accessUrl", app.getAccessUrl());
                        map.put("cpuRequest", app.getCpuRequest());
                        map.put("cpuLimit", app.getCpuLimit());
                        map.put("memoryRequest", app.getMemoryRequest());
                        map.put("memoryLimit", app.getMemoryLimit());
                        map.put("replicas", app.getReplicas());
                        map.put("containerPort", app.getContainerPort());
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

    /**
     * Admin: Cập nhật thông tin một deployment request (docker image, resource
     * limits)
     */
    @PutMapping("/deployment-requests/{id}")
    public ResponseEntity<?> updateDeploymentRequest(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            jakarta.servlet.http.HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }
            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền cập nhật"));
            }

            Application app = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            // Chỉ cho phép cập nhật khi chưa chạy hoặc đang lỗi
            if (!"PENDING".equalsIgnoreCase(app.getStatus()) && !"ERROR".equalsIgnoreCase(app.getStatus())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid State",
                                "message", "Chỉ có thể chỉnh sửa khi trạng thái là PENDING hoặc ERROR"));
            }

            String dockerImage = body.getOrDefault("dockerImage", app.getDockerImage());
            String cpuRequest = body.getOrDefault("cpuRequest", app.getCpuRequest());
            String cpuLimit = body.getOrDefault("cpuLimit", app.getCpuLimit());
            String memoryRequest = body.getOrDefault("memoryRequest", app.getMemoryRequest());
            String memoryLimit = body.getOrDefault("memoryLimit", app.getMemoryLimit());

            // Update replicas and containerPort if provided
            if (body.containsKey("replicas")) {
                try {
                    int replicas = Integer.parseInt(body.get("replicas"));
                    app.setReplicas(replicas);
                } catch (NumberFormatException e) {
                    // Invalid number, keep existing value
                }
            }
            if (body.containsKey("containerPort")) {
                try {
                    int containerPort = Integer.parseInt(body.get("containerPort"));
                    app.setContainerPort(containerPort);
                } catch (NumberFormatException e) {
                    // Invalid number, keep existing value
                }
            }

            // Validate docker image format nếu thay đổi
            if (dockerImage == null || dockerImage.trim().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Validation Error", "message", "Docker image không được để trống"));
            }
            String dockerImagePattern = "^[a-zA-Z0-9._\\/-]+(:[a-zA-Z0-9._-]+)?$";
            if (!dockerImage.trim().matches(dockerImagePattern)) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Validation Error",
                                "message", "Định dạng Docker image không hợp lệ"));
            }

            app.setDockerImage(dockerImage.trim());
            app.setCpuRequest(cpuRequest);
            app.setCpuLimit(cpuLimit);
            app.setMemoryRequest(memoryRequest);
            app.setMemoryLimit(memoryLimit);
            applicationService.updateApplication(app);

            return ResponseEntity.ok(Map.of(
                    "id", app.getId(),
                    "dockerImage", app.getDockerImage(),
                    "cpuRequest", app.getCpuRequest(),
                    "cpuLimit", app.getCpuLimit(),
                    "memoryRequest", app.getMemoryRequest(),
                    "memoryLimit", app.getMemoryLimit(),
                    "status", app.getStatus()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Validation Error", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * Admin: Từ chối (reject) một deployment request
     */
    @PostMapping("/deployment-requests/{id}/reject")
    public ResponseEntity<?> rejectDeploymentRequest(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> body,
            jakarta.servlet.http.HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }
            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền từ chối"));
            }

            Application app = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            if (!"PENDING".equalsIgnoreCase(app.getStatus())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid State",
                                "message", "Chỉ có thể từ chối khi trạng thái là PENDING"));
            }

            String reason = body != null ? body.getOrDefault("reason", "No reason provided") : "No reason provided";
            app.setStatus("REJECTED");
            String existingLogs = app.getDeploymentLogs() != null ? app.getDeploymentLogs() : "";
            String logLine = "\n[ADMIN] Request rejected: " + reason;
            app.setDeploymentLogs(existingLogs + logLine);
            applicationService.updateApplication(app);

            return ResponseEntity.ok(Map.of("id", app.getId(), "status", app.getStatus()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Validation Error", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * Admin: Lấy deployment logs của một request
     */
    @GetMapping("/deployment-requests/{id}/logs")
    public ResponseEntity<?> getDeploymentLogs(
            @PathVariable Long id,
            jakarta.servlet.http.HttpServletRequest request) {

        try {
            // Kiểm tra admin role
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền truy cập"));
            }

            // Load Application từ database
            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            // Return logs
            Map<String, Object> response = new HashMap<>();
            response.put("logs", application.getDeploymentLogs() != null ? application.getDeploymentLogs() : "");
            response.put("status", application.getStatus());
            response.put("applicationId", application.getId());

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Bad Request", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * Admin: Xóa hoàn toàn ứng dụng (xóa K8s resources và xóa record trong DB)
     */
    @DeleteMapping("/deployment-requests/{id}")
    public ResponseEntity<?> deleteDeploymentRequest(
            @PathVariable Long id,
            jakarta.servlet.http.HttpServletRequest request) {

        try {
            // Kiểm tra admin role
            var session = request.getSession(false);
            if (session == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Unauthorized", "message", "Vui lòng đăng nhập"));
            }

            String userRole = (String) session.getAttribute("USER_ROLE");
            if (userRole == null || !userRole.equalsIgnoreCase("ADMIN")) {
                return ResponseEntity.status(403)
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền xóa"));
            }

            // Load Application từ database
            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            // Lưu thông tin namespace và clusterId trước khi xóa application record
            String namespace = application.getK8sNamespace();
            Long clusterId = application.getClusterId();

            // Nếu application đã được deploy (có K8s resources), xóa K8s resources trước
            if (clusterId != null &&
                    application.getK8sDeploymentName() != null &&
                    !application.getK8sDeploymentName().isEmpty()) {

                try {
                    // Xóa K8s resources: Deployment, Service, Ingress
                    kubernetesService.deleteApplicationResources(
                            namespace,
                            application.getK8sDeploymentName(),
                            application.getK8sServiceName(),
                            application.getK8sIngressName(),
                            clusterId);
                    logger.info("Deleted K8s resources for application: {}", id);
                } catch (Exception k8sException) {
                    // Log lỗi nhưng vẫn tiếp tục xóa namespace và DB record
                    logger.warn(
                            "Failed to delete K8s resources for application: {}. Will continue to delete namespace.",
                            id,
                            k8sException);
                }
            }

            // KHÔNG xóa namespace khi xóa một ứng dụng đơn lẻ (namespace thuộc user)

            // Xóa record trong database
            applicationService.deleteApplicationCompletely(id);

            // Log activity
            Object adminUsername = session.getAttribute("USER_USERNAME");
            if (adminUsername != null) {
                userService.findByUsername(adminUsername.toString()).ifPresent(admin -> {
                    String ip = request.getHeader("X-Forwarded-For");
                    if (ip == null) {
                        ip = request.getHeader("X-Real-IP");
                    }
                    userService.logActivity(admin, "DELETE_APPLICATION",
                            "Đã xóa hoàn toàn ứng dụng: " + application.getAppName(), ip);
                });
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message",
                    "Đã xóa hoàn toàn ứng dụng và tất cả K8s resources. Namespace của user được giữ lại.");

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Bad Request", "message", e.getMessage()));
        } catch (Exception e) {
            logger.error("Failed to delete deployment request", e);
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * Sanitize username và appname để tạo namespace hợp lệ trong Kubernetes
     * Format: username-appname
     * Helper method cho AdminController
     * K8s namespace chỉ cho phép: chữ thường, số, dấu gạch ngang (-)
     * Tối đa 63 ký tự, không được bắt đầu bằng số
     */
    private String sanitizeUserNamespace(String username) {
        String sanitizedUsername = sanitizeStringForK8s(username);
        if (sanitizedUsername.isEmpty()) {
            sanitizedUsername = "default-user";
        }
        if (sanitizedUsername.length() > 63) {
            sanitizedUsername = sanitizedUsername.substring(0, 63).replaceAll("-$", "");
        }
        return sanitizedUsername;
    }

    /**
     * Sanitize một string để phù hợp với K8s naming conventions
     */
    private String sanitizeStringForK8s(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }

        String sanitized = input.trim()
                .toLowerCase() // Chuyển thành chữ thường
                .replaceAll("[^a-z0-9-]", "-") // Thay thế ký tự không hợp lệ bằng dấu gạch ngang
                .replaceAll("-+", "-") // Loại bỏ nhiều dấu gạch ngang liên tiếp
                .replaceAll("^-|-$", ""); // Loại bỏ dấu gạch ngang ở đầu và cuối

        // Nếu bắt đầu bằng số, thêm prefix
        if (!sanitized.isEmpty() && Character.isDigit(sanitized.charAt(0))) {
            sanitized = "n" + sanitized; // Thêm 'n' prefix
        }

        // Giới hạn độ dài
        if (sanitized.length() > 50) {
            sanitized = sanitized.substring(0, 50);
            sanitized = sanitized.replaceAll("-$", "");
        }

        return sanitized;
    }
}
