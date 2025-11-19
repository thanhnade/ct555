package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Application;
import com.example.AutoDeployApp.entity.UserEntity;
import com.example.AutoDeployApp.entity.UserActivity;
import com.example.AutoDeployApp.service.ApplicationService;
import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.entity.Server;
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
                .map(u -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", u.getId());
                    map.put("fullname", u.getFullname());
                    map.put("username", u.getUsername());
                    map.put("role", Objects.toString(u.getRole(), "USER"));
                    map.put("tier", Objects.toString(u.getTier(), "STANDARD"));
                    map.put("status", Objects.toString(u.getStatus(), "INACTIVE"));
                    map.put("createdAt", u.getCreatedAt());
                    return map;
                })
                .toList();
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestBody Map<String, Object> body) {
        // Validate required fields
        String fullname = (String) body.get("fullname");
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        
        if (username == null || username.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ValidationError", "message", "Tên đăng nhập không được để trống"));
        }
        
        if (password == null || password.trim().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ValidationError", "message", "Mật khẩu không được để trống"));
        }
        
        if (password.length() < 6) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ValidationError", "message", "Mật khẩu phải có ít nhất 6 ký tự"));
        }
        
        // Validate username format
        if (!username.matches("^[a-zA-Z0-9_]{3,20}$")) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ValidationError", "message", "Tên đăng nhập phải có từ 3-20 ký tự, chỉ chứa chữ, số và dấu gạch dưới"));
        }
        
        String role = (String) body.getOrDefault("role", "USER");
        String tier = (String) body.getOrDefault("tier", "STANDARD");
        String status = (String) body.getOrDefault("status", "ACTIVE");
        
        try {
            UserEntity created = userService.createUser(fullname, username, password, role, tier, status);
        return ResponseEntity.ok(Map.of("id", created.getId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ValidationError", "message", e.getMessage()));
        } catch (Exception e) {
            logger.error("Error creating user", e);
            return ResponseEntity.status(500)
                    .body(Map.of("error", "InternalError", "message", "Lỗi khi tạo người dùng: " + e.getMessage()));
        }
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<?> updateUser(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            String fullname = (String) body.get("fullname");
        String role = (String) body.get("role");
            String tier = (String) body.get("tier");
            String status = (String) body.get("status");
            
            // Validate status value if provided
            if (status != null && !status.isEmpty() && !status.equals("ACTIVE") && !status.equals("INACTIVE")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "ValidationError", "message", "Trạng thái phải là ACTIVE hoặc INACTIVE"));
            }
            
            // Validate role value if provided
            if (role != null && !role.isEmpty() && !role.equals("USER") && !role.equals("ADMIN")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "ValidationError", "message", "Vai trò phải là USER hoặc ADMIN"));
            }
            
            // Validate tier value if provided
            if (tier != null && !tier.isEmpty() && !tier.equals("STANDARD") && !tier.equals("PREMIUM")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "ValidationError", "message", "Gói dịch vụ phải là STANDARD hoặc PREMIUM"));
            }
            
            UserEntity updated = userService.updateUser(id, fullname, role, tier, status);
        return ResponseEntity.ok(Map.of("id", updated.getId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "ValidationError", "message", e.getMessage()));
        } catch (Exception e) {
            logger.error("Error updating user {}", id, e);
            return ResponseEntity.status(500)
                    .body(Map.of("error", "InternalError", "message", "Lỗi khi cập nhật người dùng: " + e.getMessage()));
        }
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        // Dọn tất cả ứng dụng và namespace của người dùng này trên mọi cluster rồi mới xóa tài khoản
        UserEntity user = userService.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String username = user.getUsername();
        String userNamespace = sanitizeUserNamespace(username);

        // Lấy danh sách toàn bộ ứng dụng của người dùng
        List<Application> userApps = applicationService.getApplicationsByUserId(id);

        List<String> cleanupErrors = new ArrayList<>();

        // Bước 1: xóa tài nguyên K8s của từng ứng dụng (không xóa namespace)
        for (Application app : userApps) {
            try {
                kubernetesService.deleteApplicationResources(
                        userNamespace,
                        app.getK8sDeploymentName(),
                        app.getK8sServiceName(),
                        app.getK8sIngressName());
            } catch (Exception ex) {
                String message = "Không thể xóa tài nguyên Kubernetes cho ứng dụng #" + app.getId() + ": "
                        + ex.getMessage();
                cleanupErrors.add(message);
                logger.error(message, ex);
            }
        }

        // Bước 2: xóa namespace (chỉ có 1 cluster duy nhất)
        try {
            kubernetesService.deleteNamespace(userNamespace);
        } catch (Exception ex) {
            String message = "Không thể xóa namespace \"" + userNamespace + "\": " + ex.getMessage();
            cleanupErrors.add(message);
            logger.error(message, ex);
        }

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
            // Kiểm tra quyền admin (có thể thêm interceptor sau)
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
                // Lọc theo trạng thái nếu có
                String statusFilter = status.trim();
                if ("PENDING".equalsIgnoreCase(statusFilter)) {
                    applications = applicationService.getPendingApplications();
                } else {
                    // Lọc theo trạng thái khác (RUNNING, ERROR, ...)
                    applications = applicationService.getAllApplications().stream()
                            .filter(app -> statusFilter.equalsIgnoreCase(app.getStatus()))
                            .collect(Collectors.toList());
                }
            } else {
                // Lấy toàn bộ ứng dụng (không lọc) và sắp xếp created_at DESC
                applications = applicationService.getAllApplications();
            }

            Map<Long, UserEntity> userLookup = userService.findAllByIds(
                    applications.stream()
                            .map(Application::getUserId)
                            .filter(Objects::nonNull)
                            .collect(Collectors.toSet()));

            // Chuyển về DTO kèm thông tin username
            List<Map<String, Object>> response = applications.stream()
                    .map(app -> {
                        // Tra cứu username từ userId
                        String username = "Unknown";
                        if (app.getUserId() != null) {
                            UserEntity matchedUser = userLookup.get(app.getUserId());
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
                        // clusterId không được trả về vì chỉ có 1 cluster duy nhất (sử dụng clusterStatus = "AVAILABLE")
                        map.put("accessUrl", app.getAccessUrl());
                        map.put("cpuRequest", app.getCpuRequest());
                        map.put("cpuLimit", app.getCpuLimit());
                        map.put("memoryRequest", app.getMemoryRequest());
                        map.put("memoryLimit", app.getMemoryLimit());
                        map.put("replicas", app.getReplicas());
                        map.put("containerPort", app.getContainerPort());
                        map.put("replicasRequested", app.getReplicasRequested());
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
            // Kiểm tra quyền admin
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

            // Tải Application từ database
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

            // Nếu đang retry từ ERROR, dọn tài nguyên cũ trước
            // clusterId không được sử dụng (luôn null), chỉ kiểm tra deployment name
            boolean isRetry = "ERROR".equals(currentStatus);
            if (isRetry && application.getK8sDeploymentName() != null
                    && !application.getK8sDeploymentName().isEmpty()) {
                try {
                    logger.info("Retry deployment: Cleaning up old K8s resources for application: {}", id);
                    kubernetesService.deleteApplicationResources(
                            application.getK8sNamespace(),
                            application.getK8sDeploymentName(),
                            application.getK8sServiceName(),
                            application.getK8sIngressName());
                    logger.info("Old K8s resources cleaned up successfully");
                } catch (Exception cleanupException) {
                    logger.warn("Failed to cleanup old K8s resources, will continue with new deployment",
                            cleanupException);
                    // Tiếp tục triển khai vì có thể tài nguyên đã không tồn tại hoặc bị xóa trước đó
                }
            }

            // Lấy thông tin user để có username
            UserEntity user = userService.findById(application.getUserId())
                    .orElseThrow(() -> new IllegalArgumentException("User not found"));

            String username = user.getUsername();
            String appName = application.getAppName();
            // Namespace đã được gán khi tạo application (mỗi user một namespace) nên dùng trực tiếp
            String namespace = application.getK8sNamespace();
            if (namespace == null || namespace.trim().isEmpty()) {
                // Phòng hờ: tạo namespace theo username nếu dữ liệu cũ chưa lưu
                namespace = sanitizeUserNamespace(username);
            }

            // Áp đặt quy tắc: mỗi user chỉ có một namespace = sanitized(username)
            String expectedUserNamespace = sanitizeUserNamespace(username);
            if (!expectedUserNamespace.equals(namespace)) {
                namespace = expectedUserNamespace;
                application.setK8sNamespace(namespace);
                applicationService.updateApplication(application);
            }
            String dockerImage = application.getDockerImage();

            // Với 1 cluster duy nhất, luôn tìm MASTER online đầu tiên trong các server AVAILABLE
            Server master = clusterService.getFirstHealthyMaster()
                        .orElseThrow(() -> new RuntimeException(
                            "Không tìm thấy MASTER node online trong cluster. " +
                                    "Vui lòng đảm bảo có ít nhất 1 MASTER node online với clusterStatus = 'AVAILABLE'."));
            
            if (!clusterService.hasMasterOnline()) {
                    throw new RuntimeException(
                        "MASTER node (" + master.getHost() + ") đang offline. "
                                    + "Không thể triển khai ứng dụng. Vui lòng kiểm tra kết nối MASTER node và thử lại.");
                }

            Long clusterId = null; // Với 1 cluster duy nhất, không cần clusterId nữa, nhưng giữ lại để tương thích với Application entity

            logger.info("Using MASTER node for deployment: {} (Host: {}), MASTER is online", 
                    master.getId(), master.getHost());

            // Lưu clusterId = null (vì chỉ có 1 cluster duy nhất, không cần lưu ID)
            application.setClusterId(clusterId);
            applicationService.updateApplication(application);

            // Hàm tiện ích dùng để nối log
            java.util.function.Consumer<String> appendLog = (logMessage) -> {
                String currentLogs = application.getDeploymentLogs() != null ? application.getDeploymentLogs() : "";
                String timestamp = java.time.LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss"));
                String newLog = currentLogs + "[" + timestamp + "] " + logMessage + "\n";
                application.setDeploymentLogs(newLog);
                applicationService.updateApplication(application);
            };

            // Xóa log cũ nếu đang retry
            if (isRetry) {
                application.setDeploymentLogs("");
                applicationService.updateApplication(application);
                appendLog.accept("🔄 Bắt đầu retry quá trình triển khai ứng dụng: " + appName);
                appendLog.accept("🧹 Đã cleanup các K8s resources cũ (nếu có)");
            } else {
                // Khởi tạo log cho lần deploy đầu tiên
                appendLog.accept("🚀 Bắt đầu quá trình triển khai ứng dụng: " + appName);
            }

            try {
                // 1. Sử dụng MASTER node online đầu tiên trong cluster
                appendLog.accept("✅ Đã chọn MASTER node: " + master.getHost() + " (ID: " + master.getId() + ")");
                appendLog.accept("💾 Đã lưu thông tin deployment vào database");

                // 2. Lấy kubeconfig từ master node
                appendLog.accept("📥 Đang lấy kubeconfig từ master node...");
                kubernetesService.ensureNamespace(namespace); // Sẽ trigger getKubeconfig trong service
                appendLog.accept("✅ Đã lấy kubeconfig thành công");

                // 3. Tạo KubernetesClient từ kubeconfig
                appendLog.accept("🔗 Đang tạo kết nối đến Kubernetes cluster...");
                appendLog.accept("✅ Đã tạo KubernetesClient thành công");

                // 4. Đảm bảo namespace tồn tại
                appendLog.accept("📦 Đang tạo namespace: " + namespace);
                kubernetesService.ensureNamespace(namespace);
                appendLog.accept("✅ Namespace đã được tạo/kiểm tra: " + namespace);

                // 5. Sinh tên tài nguyên
                String deploymentName = appName.toLowerCase().replaceAll("[^a-z0-9-]", "-") + "-" + application.getId();
                String serviceName = "svc-" + deploymentName;
                String ingressName = "ing-" + deploymentName;
                appendLog.accept("📝 Tên resources: Deployment=" + deploymentName + ", Service=" + serviceName
                        + ", Ingress=" + ingressName);

                // 5.5 Kiểm tra docker image tồn tại (pre-check đơn giản cho Docker Hub)
                var imageCheck = validateDockerImageInternal(dockerImage);
                if (!imageCheck.valid) {
                    appendLog.accept("❌ Image không hợp lệ: " + dockerImage + ". Lý do: " + imageCheck.message);
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Invalid Image",
                                    "message",
                                    "Docker image không tồn tại hoặc không truy cập được: " + imageCheck.message));
                }

                // 6. Tạo Deployment
                appendLog.accept("🔨 Đang tạo Deployment: " + deploymentName + " với image: " + dockerImage);

                // Lấy tham số từ request body, bản ghi application hoặc dùng mặc định
                // Giá trị mặc định: Container Port=80, Replicas=1
                int containerPort = application.getContainerPort() != null ? application.getContainerPort() : 80;
                int replicas = application.getReplicas() != null ? application.getReplicas() : 1;

                // Ghi đè bằng giá trị từ request body nếu có
                if (requestBody != null) {
                    if (requestBody.containsKey("containerPort")) {
                        Object portObj = requestBody.get("containerPort");
                        if (portObj instanceof Number) {
                            containerPort = ((Number) portObj).intValue();
                        } else if (portObj instanceof String) {
                            try {
                                containerPort = Integer.parseInt((String) portObj);
                            } catch (NumberFormatException e) {
                                // Giữ giá trị hiện tại
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
                                // Giữ giá trị hiện tại
                            }
                        }
                    }
                }

                // Lấy cấu hình resource limit từ request hoặc từ application, có giá trị mặc định
                // Mặc định: CPU Request=100m, CPU Limit=500m, Memory Request=128Mi, Memory Limit=256Mi
                String cpuRequest = "100m";
                String cpuLimit = "500m";
                String memoryRequest = "128Mi";
                String memoryLimit = "256Mi";

                // Dùng giá trị trên entity nếu đã có (khác null/rỗng)
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

                // Ghi đè bằng giá trị từ request body nếu có (khác null/rỗng)
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

                // Phân tích các biến môi trường từ request body
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

                kubernetesService.createDeployment(namespace, deploymentName, dockerImage, containerPort,
                        cpuRequest, cpuLimit, memoryRequest, memoryLimit, replicas, envVars);
                appendLog.accept("✅ Deployment đã được tạo: " + deploymentName);
                // Lưu ngay tên deployment để có thể cleanup nếu bước sau lỗi
                application.setK8sDeploymentName(deploymentName);
                applicationService.updateApplication(application);

                // 7. Tạo Service
                appendLog.accept("🔌 Đang tạo Service: " + serviceName);
                kubernetesService.createService(namespace, serviceName, deploymentName, 80, containerPort);
                appendLog.accept("✅ Service đã được tạo: " + serviceName);
                // Lưu ngay tên service
                application.setK8sServiceName(serviceName);
                applicationService.updateApplication(application);

                // 8. Tạo Ingress
                appendLog.accept("🌐 Đang tạo Ingress: " + ingressName);
                kubernetesService.createIngress(namespace, ingressName, serviceName, 80, appName);
                appendLog.accept("✅ Ingress đã được tạo: " + ingressName);
                // Lưu ngay tên ingress
                application.setK8sIngressName(ingressName);
                applicationService.updateApplication(application);

                // 9. Chờ Deployment sẵn sàng (timeout 2 phút)
                appendLog.accept("⏳ Đang chờ Deployment sẵn sàng... (timeout: 2 phút)");
                kubernetesService.waitForDeploymentReady(namespace, deploymentName, 2);
                appendLog.accept("✅ Deployment đã sẵn sàng: " + deploymentName);

                // 10. Lấy Ingress URL từ MetalLB
                appendLog.accept("🔍 Đang lấy Ingress URL từ MetalLB...");
                String accessUrl = kubernetesService.getIngressURL(namespace, ingressName);
                appendLog.accept("✅ Đã lấy Ingress URL: " + accessUrl);

                // 11. Cập nhật metadata K8s vào Application
                appendLog.accept("💾 Đang lưu thông tin deployment vào database...");
                application.setStatus("RUNNING");
                application.setK8sDeploymentName(deploymentName);
                application.setK8sServiceName(serviceName);
                application.setK8sIngressName(ingressName);
                application.setAccessUrl(accessUrl);
                application.setReplicas(replicas);
                // clusterId đã được lưu sớm hơn (sau khi chọn cluster), không cần set lại

                Application savedApplication = applicationService.updateApplication(application);
                appendLog.accept("✅ Đã lưu tất cả thông tin deployment vào database");
                appendLog.accept("🎉 Triển khai hoàn tất thành công!");
                String appNameForLog = savedApplication.getAppName(); // Biến dùng trong lambda

                // Ghi lại hoạt động
                Object adminUsername = session.getAttribute("USER_USERNAME");
                if (adminUsername != null) {
                    userService.findByUsername(adminUsername.toString()).ifPresent(admin -> {
                        String ip = xff != null ? xff : (xri != null ? xri : null);
                        userService.logActivity(admin, "DEPLOY_PROCESS",
                                "Đã triển khai ứng dụng: " + appNameForLog + " lên K8s", ip);
                    });
                }

                // Trả response
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
                // Nếu triển khai K8s lỗi, cập nhật trạng thái ERROR và ghi log
                // clusterId đã được lưu sẵn, nên có thể dọn tài nguyên nếu cần
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
                // Giữ nguyên clusterId đã lưu để dọn dẹp sau (clusterId không thay đổi)
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
     * Admin: Retry triển khai lại một deployment request (shortcut cho process)
     */
    @PostMapping("/deployment-requests/{id}/retry")
    public ResponseEntity<?> retryDeploymentRequest(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> requestBody,
            @RequestHeader(value = "X-Forwarded-For", required = false) String xff,
            @RequestHeader(value = "X-Real-IP", required = false) String xri,
            jakarta.servlet.http.HttpServletRequest request) {
        return processDeploymentRequest(id, requestBody, xff, xri, request);
    }

    /**
     * Admin: Scale số replicas của Deployment đã chạy
     */
    @PostMapping("/deployment-requests/{id}/scale")
    public ResponseEntity<?> scaleDeploymentRequest(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body,
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
                        .body(Map.of("error", "Forbidden", "message", "Chỉ admin mới có quyền scale ứng dụng"));
            }

            if (body == null || !body.containsKey("replicas")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Validation Error", "message", "Thiếu tham số replicas"));
            }

            int replicas;
            Object replicaObj = body.get("replicas");
            if (replicaObj instanceof Number) {
                replicas = ((Number) replicaObj).intValue();
            } else if (replicaObj instanceof String) {
                try {
                    replicas = Integer.parseInt(((String) replicaObj).trim());
                } catch (NumberFormatException nfe) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Validation Error", "message", "replicas phải là số nguyên"));
                }
            } else {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Validation Error", "message", "replicas không hợp lệ"));
            }

            if (replicas < 0 || replicas > 200) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Validation Error",
                                "message", "replicas phải nằm trong khoảng 0-200"));
            }

            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            boolean canScale = "RUNNING".equalsIgnoreCase(application.getStatus())
                    || "PAUSED".equalsIgnoreCase(application.getStatus());
            if (!canScale) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid State",
                                "message", "Chỉ có thể scale ứng dụng khi đang RUNNING hoặc PAUSED"));
            }

            String namespace = application.getK8sNamespace();
            String deploymentName = application.getK8sDeploymentName();

            if (namespace == null || namespace.isBlank()
                    || deploymentName == null || deploymentName.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid Deployment",
                                "message", "Ứng dụng chưa được triển khai đầy đủ để scale"));
            }

            kubernetesService.scaleDeployment(namespace, deploymentName, replicas);

            application.setReplicas(replicas);
            if (replicas == 0) {
                application.setStatus("PAUSED");
            } else if (!"RUNNING".equalsIgnoreCase(application.getStatus())) {
                application.setStatus("RUNNING");
            }
            application.setReplicasRequested(null);

            String currentLogs = application.getDeploymentLogs() != null ? application.getDeploymentLogs() : "";
            String timestamp = java.time.LocalDateTime.now()
                    .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss"));
            application.setDeploymentLogs(
                    currentLogs + "[" + timestamp + "] 🔁 Scale deployment về " + replicas + " replicas\n");

            applicationService.updateApplication(application);

            Object adminUsername = session.getAttribute("USER_USERNAME");
            if (adminUsername != null) {
                userService.findByUsername(adminUsername.toString()).ifPresent(admin -> {
                    String ip = request.getHeader("X-Forwarded-For");
                    if (ip == null) {
                        ip = request.getHeader("X-Real-IP");
                    }
                    userService.logActivity(admin, "DEPLOY_SCALE",
                            "Scale ứng dụng " + application.getAppName() + " lên " + replicas + " replicas", ip);
                });
            }

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "applicationId", application.getId(),
                    "replicas", replicas));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Validation Error", "message", e.getMessage()));
        } catch (Exception e) {
            logger.error("Failed to scale deployment request {}", id, e);
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Internal Server Error", "message", e.getMessage()));
        }
    }

    /**
     * Admin: xem chẩn đoán deployment (pods/logs) để debug lỗi
     */
    @GetMapping("/deployment-requests/{id}/diagnostics")
    public ResponseEntity<?> getDeploymentDiagnostics(
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

            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            String namespace = application.getK8sNamespace();
            String deploymentName = application.getK8sDeploymentName();
            if (namespace == null || namespace.isBlank()
                    || deploymentName == null || deploymentName.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid Deployment",
                                "message", "Ứng dụng chưa có thông tin triển khai để thu thập diagnostics"));
            }

            String diagnostics = kubernetesService.collectDeploymentDiagnostics(namespace, deploymentName, 80);
            return ResponseEntity.ok(Map.of(
                    "applicationId", application.getId(),
                    "diagnostics", diagnostics));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Validation Error", "message", e.getMessage()));
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

    // Trình kiểm tra cơ bản cho Docker Hub (public image)
    private ImageValidation validateDockerImageInternal(String image) {
        try {
            if (image == null || image.trim().isEmpty()) {
                return new ImageValidation(false, "Chuỗi image rỗng");
            }
            String ref = image.trim();
            // Tách phần tag
            String namePart = ref;
            String tag = "latest";
            int idx = ref.lastIndexOf(':');
            if (idx > 0 && ref.indexOf('/') < idx) { // có tag
                namePart = ref.substring(0, idx);
                tag = ref.substring(idx + 1);
            }

            // Xác định registry
            String registry = "docker.io";
            String path = namePart;
            int slashIdx = namePart.indexOf('/');
            if (slashIdx > 0
                    && (namePart.contains(".") || namePart.contains(":") || namePart.startsWith("localhost"))) {
                // Đã chỉ định registry rõ ràng
                int firstSlash = namePart.indexOf('/');
                registry = namePart.substring(0, firstSlash);
                path = namePart.substring(firstSlash + 1);
            }

            if ("docker.io".equals(registry) || "registry-1.docker.io".equals(registry)) {
                // Docker Hub: chuyển đổi sang API của hub
                // Không có namespace thì mặc định là library/
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

            // Kiểm tra registry bất kỳ (gửi HEAD chưa xác thực tới manifest v2) - best effort
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
        if (code == 405 || code == 403) { // fallback GET khi HEAD không được phép
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
                        // Lấy username từ userId
                        String username = "Unknown";
                        if (app.getUserId() != null) {
                            username = userService.findById(app.getUserId())
                                    .map(UserEntity::getUsername)
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
                        map.put("replicasRequested", app.getReplicasRequested());
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

            // Cập nhật replicas và containerPort nếu client gửi lên
            if (body.containsKey("replicas")) {
                try {
                    int replicas = Integer.parseInt(body.get("replicas"));
                    app.setReplicas(replicas);
                } catch (NumberFormatException e) {
                    // Số không hợp lệ, giữ nguyên giá trị cũ
                }
            }
            if (body.containsKey("containerPort")) {
                try {
                    int containerPort = Integer.parseInt(body.get("containerPort"));
                    app.setContainerPort(containerPort);
                } catch (NumberFormatException e) {
                    // Số không hợp lệ, giữ nguyên giá trị cũ
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

            // Đọc Application từ database
            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            // Trả về log
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

            // Đọc Application từ database
            Application application = applicationService.getApplicationById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Application not found"));

            // Lưu thông tin namespace trước khi xóa application record
            String namespace = application.getK8sNamespace();

            // Nếu application đã được deploy (có K8s resources), xóa K8s resources trước
            if (application.getK8sDeploymentName() != null &&
                    !application.getK8sDeploymentName().isEmpty()) {

                try {
                    // Xóa K8s resources: Deployment, Service, Ingress
                    kubernetesService.deleteApplicationResources(
                            namespace,
                            application.getK8sDeploymentName(),
                            application.getK8sServiceName(),
                            application.getK8sIngressName());
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
