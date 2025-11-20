package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.service.ServerService;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import jakarta.annotation.PreDestroy;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/admin/servers")
public class ServerAdminController {

    private final ServerService serverService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(10);

    public ServerAdminController(ServerService serverService) {
        this.serverService = serverService;
    }

    @PreDestroy
    public void cleanup() {
        if (executorService != null && !executorService.isShutdown()) {
            executorService.shutdown();
            try {
                if (!executorService.awaitTermination(5, TimeUnit.SECONDS)) {
                    executorService.shutdownNow();
                }
            } catch (InterruptedException e) {
                executorService.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    @GetMapping
    public List<Map<String, Object>> list(HttpServletRequest request) {
        Long userId = null;
        var session = request.getSession(false);
        if (session != null) {
            Object uid = session.getAttribute("USER_ID");
            if (uid instanceof Long l)
                userId = l;
            else if (uid instanceof Number n)
                userId = n.longValue();
        }
        return serverService.findAllForUser(userId).stream().map(s -> {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("host", java.util.Objects.toString(s.getHost(), ""));
            m.put("port", s.getPort() != null ? s.getPort() : 22);
            m.put("username", java.util.Objects.toString(s.getUsername(), ""));
            m.put("role", s.getRole() != null && !s.getRole().isBlank() ? s.getRole() : "WORKER");
            m.put("status", s.getStatus() != null ? s.getStatus().name() : "OFFLINE");
            if (s.getSshKey() != null && s.getSshKey().getId() != null)
                m.put("sshKeyId", s.getSshKey().getId());
            if (s.getClusterStatus() != null && !s.getClusterStatus().isBlank()) {
                m.put("clusterStatus", s.getClusterStatus());
            }
            // Thêm metrics từ database
            if (s.getCpuCores() != null && !s.getCpuCores().isBlank()) {
                m.put("cpuCores", s.getCpuCores());
            }
            if (s.getRamTotal() != null && !s.getRamTotal().isBlank()) {
                m.put("ramTotal", s.getRamTotal());
            }
            if (s.getDiskTotal() != null && !s.getDiskTotal().isBlank()) {
                m.put("diskTotal", s.getDiskTotal());
            }
            return m;
        }).toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String host = (String) body.get("host");
        Integer port = body.get("port") != null ? ((Number) body.get("port")).intValue() : 22;
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String role = (String) body.getOrDefault("role", "WORKER");
        // Validate role - chỉ cho phép các giá trị hợp lệ
        if (role == null || role.isBlank()) {
            role = "WORKER";
        } else {
            String[] validRoles = {"MASTER", "WORKER", "DOCKER", "DATABASE", "ANSIBLE"};
            boolean isValid = false;
            for (String validRole : validRoles) {
                if (validRole.equalsIgnoreCase(role)) {
                    role = validRole; // Normalize to uppercase
                    isValid = true;
                    break;
                }
            }
            if (!isValid) {
                role = "WORKER"; // fallback nếu role không hợp lệ
            }
        }
        Long sshKeyId = null;
        if (body.containsKey("sshKeyId") && body.get("sshKeyId") != null) {
            Object v = body.get("sshKeyId");
            if (v instanceof Number n)
                sshKeyId = n.longValue();
        }
        String clusterStatus = null;
        if (body.containsKey("clusterStatus") && body.get("clusterStatus") != null) {
            Object v = body.get("clusterStatus");
            if (v instanceof String str)
                clusterStatus = str;
        }
        // Determine authType: use KEY if sshKeyId is provided, otherwise PASSWORD
        Server.AuthType authType = (sshKeyId != null) ? Server.AuthType.KEY : Server.AuthType.PASSWORD;
        Server s = serverService.create(host, port, username, password, role, null, clusterStatus, authType, sshKeyId);
        
        // Reload server to get updated SSH key after generation
        Server reloaded = serverService.findById(s.getId());
        if (reloaded != null) {
            s = reloaded;
        }
        
        var session = request.getSession();
        synchronized (session) {
            Object attr = session.getAttribute("CONNECTED_SERVERS");
            java.util.Set<Long> connected = new java.util.LinkedHashSet<>();
            if (attr instanceof java.util.Set<?> set) {
                for (Object o : set) {
                    if (o instanceof Number n)
                        connected.add(n.longValue());
                    else if (o instanceof String str)
                        try {
                            connected.add(Long.parseLong(str));
                        } catch (Exception ignored) {
                        }
                }
            }
            
            // Test connection với SSH key nếu đã có, hoặc password nếu chưa có key
            // Chỉ thêm vào CONNECTED_SERVERS nếu test connection thành công
            boolean canConnect = false;
            if (s.getSshKey() != null) {
                // Nếu đã có SSH key, test với key trước
                String pem = serverService.resolveServerPrivateKeyPem(s.getId());
                if (pem != null && !pem.isBlank()) {
                    canConnect = serverService.testSshWithKey(s.getHost(), s.getPort() != null ? s.getPort() : 22, s.getUsername(), pem, 5000);
                }
            }
            
            // Nếu test với key thất bại hoặc chưa có key, test với password
            if (!canConnect && password != null && !password.isBlank()) {
                canConnect = serverService.testSsh(s.getHost(), s.getPort() != null ? s.getPort() : 22, s.getUsername(), password, 5000);
            }
            
            // Chỉ thêm vào CONNECTED_SERVERS nếu connection thành công
            if (canConnect) {
            connected.add(s.getId());
            session.setAttribute("CONNECTED_SERVERS", connected);
            } else {
                // Nếu không kết nối được, vẫn lưu session nhưng không thêm vào CONNECTED
                session.setAttribute("CONNECTED_SERVERS", connected);
            }
            // SECURITY: Không lưu password trong session để tránh rủi ro bảo mật
            // Password chỉ được sử dụng trong request hiện tại và không được lưu trữ
        }
        return ResponseEntity.ok(Map.of("id", s.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        String host = (String) body.get("host");
        Integer port = body.get("port") != null ? ((Number) body.get("port")).intValue() : null;
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String roleStr = (String) body.get("role");
        String statusStr = (String) body.get("status");
        String clusterStatus = null;
        if (body.containsKey("clusterStatus")) {
            Object v = body.get("clusterStatus");
            if (v == null || (v instanceof String str && str.isBlank())) {
                clusterStatus = null; // clear cluster status
            } else if (v instanceof String str) {
                clusterStatus = str;
            }
        }
        String role = null;
        if (roleStr != null && !roleStr.isBlank()) {
            // Validate role - chỉ cho phép các giá trị hợp lệ
            String[] validRoles = {"MASTER", "WORKER", "DOCKER", "DATABASE", "ANSIBLE"};
            for (String validRole : validRoles) {
                if (validRole.equalsIgnoreCase(roleStr)) {
                    role = validRole; // Normalize to uppercase
                    break;
                }
            }
            // Nếu không hợp lệ, giữ role = null để không thay đổi role hiện tại
        }
        Server.ServerStatus status = statusStr != null ? Server.ServerStatus.valueOf(statusStr) : null;
        Long sshKeyId = null;
        if (body.containsKey("sshKeyId")) {
            Object v = body.get("sshKeyId");
            if (v == null) {
                sshKeyId = -1L; // sentinel clear
            } else if (v instanceof Number n) {
                sshKeyId = n.longValue();
            }
        }
        // Determine authType: use KEY if sshKeyId is provided, otherwise PASSWORD
        Server.AuthType authType = (sshKeyId != null && sshKeyId >= 0) ? Server.AuthType.KEY : Server.AuthType.PASSWORD;
        // SECURITY: Không đọc password từ session. Password phải được cung cấp trong request body nếu cần.
        // Nếu không có password và không có SSH key, sẽ yêu cầu password trong request.
        Server s = serverService.update(id, host, port, username, password, role, status, clusterStatus, authType,
                sshKeyId);

        // Sau khi cập nhật, xử lý CONNECTED_SERVERS dựa trên status
        var session = request.getSession();
        synchronized (session) {
            Object attr = session.getAttribute("CONNECTED_SERVERS");
            java.util.LinkedHashSet<Long> connected = new java.util.LinkedHashSet<>();
            if (attr instanceof java.util.Set<?> set) {
                for (Object o : set) {
                    if (o instanceof Number n)
                        connected.add(n.longValue());
                    else if (o instanceof String str)
                        try {
                            connected.add(Long.parseLong(str));
                        } catch (Exception ignored) {
                        }
                }
            }
            
            // Xử lý DISABLED: ngắt kết nối ngay lập tức
            if (s.getStatus() == Server.ServerStatus.DISABLED) {
                // DISABLED = ngắt kết nối: remove khỏi CONNECTED_SERVERS
                connected.remove(s.getId());
            } else if (s.getStatus() == Server.ServerStatus.ONLINE) {
                // ONLINE: có thể thêm vào CONNECTED_SERVERS nếu đã kết nối thành công
                // (nhưng không tự động add, phải qua SSH connection test)
                // Giữ nguyên connected nếu đã có, không tự động add
            } else {
                // OFFLINE: remove khỏi CONNECTED_SERVERS
                connected.remove(s.getId());
            }
            
            session.setAttribute("CONNECTED_SERVERS", connected);
            // SECURITY: Không lưu password trong session để tránh rủi ro bảo mật
        }

        return ResponseEntity.ok(Map.of("id", s.getId(), "status", s.getStatus().name()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        serverService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/test-ssh")
    public ResponseEntity<?> testSsh(@RequestBody Map<String, Object> body) {
        String host = (String) body.get("host");
        Integer port = body.get("port") != null ? ((Number) body.get("port")).intValue() : 22;
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        boolean ok = serverService.testSsh(host, port, username, password, 5000);
        return ResponseEntity.ok(Map.of("ok", ok));
    }

    @PostMapping("/{id}/enable-publickey")
    public ResponseEntity<?> enablePublicKey(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String sudoPassword = (String) body.get("sudoPassword");
        if (sudoPassword == null || sudoPassword.isBlank()) {
            return ResponseEntity.badRequest().body("Vui lòng nhập mật khẩu sudo");
        }
        try {
            String out = serverService.enableSshdPublicKey(id, sudoPassword, 8000);
            return ResponseEntity.ok(Map.of("ok", true, "output", out));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("ok", false, "message", String.valueOf(e.getMessage())));
        }
    }

    @PostMapping("/check-status")
    public Map<String, Object> checkStatusAll(HttpServletRequest request) {
        var session = request.getSession();

        // 1) Ping tất cả server trong DB để cập nhật ONLINE/OFFLINE
        var allUpdated = serverService.checkAllStatuses(2000);

        // Lọc server theo user hiện tại
        Long userId = null;
        Object uid = session.getAttribute("USER_ID");
        if (uid instanceof Long l)
            userId = l;
        else if (uid instanceof Number n)
            userId = n.longValue();
        var userServers = (userId != null) ? serverService.findAllForUser(userId) : java.util.List.<Server>of();

        // 2) CONNECTED_SERVERS: chỉ thử SSH bằng KEY (không sử dụng password từ session)
        // SECURITY: Không đọc password từ session để tránh rủi ro bảo mật
        
        // Đọc danh sách đã connected từ session trước đó
        Object existingConnectedAttr = session.getAttribute("CONNECTED_SERVERS");
        java.util.LinkedHashSet<Long> existingConnected = new java.util.LinkedHashSet<>();
        if (existingConnectedAttr instanceof java.util.Set<?> set) {
            for (Object o : set) {
                if (o instanceof Number n)
                    existingConnected.add(n.longValue());
                else if (o instanceof String str)
                    try {
                        existingConnected.add(Long.parseLong(str));
                    } catch (Exception ignored) {
                    }
            }
        }
        
        java.util.LinkedHashSet<Long> connected = new java.util.LinkedHashSet<>();
        int connectedCount = 0;
        int onlineCount = 0;
        int offlineCount = 0;
        int skippedCount = 0; // Đếm số máy đã connected và vẫn online (skip SSH test)
        
        for (var s : userServers) {
            // Đếm ONLINE/OFFLINE/DISABLED
            if (s.getStatus() == Server.ServerStatus.ONLINE) {
                onlineCount++;
            } else if (s.getStatus() == Server.ServerStatus.DISABLED) {
                // DISABLED servers: không đếm vào online/offline, không thử SSH connection
                continue; // Skip SSH connection cho DISABLED servers
            } else {
                offlineCount++;
            }
            
            // DISABLED servers: chỉ check status (ping) nhưng không thử SSH connection
            if (s.getStatus() == Server.ServerStatus.DISABLED) {
                continue; // Skip SSH connection
            }
            
            // Tối ưu: Nếu máy đã connected và vẫn online, không cần thử SSH lại
            boolean alreadyConnected = existingConnected.contains(s.getId());
            boolean isOnline = s.getStatus() == Server.ServerStatus.ONLINE;
            
            if (alreadyConnected && isOnline) {
                // Máy đã connected và vẫn online → giữ nguyên trạng thái connected
                connected.add(s.getId());
                connectedCount++;
                skippedCount++;
            } else {
                // Máy chưa connected hoặc đã offline → thử SSH connection
                boolean ok = serverService.tryConnectPreferKey(s, null, 3000);
                if (ok) {
                    connected.add(s.getId());
                    connectedCount++;
                }
                // Nếu máy đã offline, tự động remove khỏi connected (không add vào connected)
            }
        }
        session.setAttribute("CONNECTED_SERVERS", connected);

        // Trả về danh sách trạng thái và thống kê
        var serversList = allUpdated.stream()
                .filter(s -> userServers.stream().anyMatch(us -> us.getId().equals(s.getId())))
                .map(s -> Map.<String, Object>of(
                        "id", s.getId(),
                        "host", s.getHost(),
                        "status", s.getStatus().name()))
                .toList();
        
        return Map.of(
                "servers", serversList,
                "stats", Map.of(
                        "total", userServers.size(),
                        "online", onlineCount,
                        "offline", offlineCount,
                        "connected", connectedCount,
                        "failed", userServers.size() - connectedCount,
                        "skipped", skippedCount // Số máy đã connected và vẫn online (không cần SSH lại)
                )
        );
    }

    @GetMapping("/connected")
    public List<Long> getConnected(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null)
            return java.util.List.of();
        Object attr = session.getAttribute("CONNECTED_SERVERS");
        if (attr == null)
            return java.util.List.of();
        java.util.LinkedHashSet<Long> ids = new java.util.LinkedHashSet<>();
        if (attr instanceof java.util.Set<?> set) {
            for (Object o : set) {
                if (o instanceof Number n)
                    ids.add(n.longValue());
                else if (o instanceof String str)
                    try {
                        ids.add(Long.parseLong(str));
                    } catch (Exception ignored) {
                    }
            }
        }
        return java.util.List.copyOf(ids);
    }

    @PostMapping("/{id}/reconnect")
    public ResponseEntity<?> reconnect(@PathVariable Long id, @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String password = body.get("password"); // Password là optional, chỉ cần nếu không có SSH key
            
            // Get server before reconnect to check if SSH key exists
            Server serverBefore = serverService.findById(id);
            boolean hadSshKeyBefore = serverBefore.getSshKey() != null;
            boolean connectedWithKey = false;
            
            // Ưu tiên thử SSH key trước nếu có
            if (hadSshKeyBefore) {
                String pem = serverService.resolveServerPrivateKeyPem(id);
                if (pem != null && !pem.isBlank()) {
                    boolean canConnect = serverService.testSshWithKey(
                            serverBefore.getHost(), 
                            serverBefore.getPort() != null ? serverBefore.getPort() : 22,
                            serverBefore.getUsername(), 
                            pem, 
                            5000);
                    if (canConnect) {
                        // Kết nối thành công bằng SSH key
                        connectedWithKey = true;
                        // Update status to ONLINE
                        serverBefore.setStatus(Server.ServerStatus.ONLINE);
                        serverService.update(id, null, null, null, null, null, Server.ServerStatus.ONLINE, null, null, null);
                        
                        // Update CONNECTED_SERVERS session
                        var session = request.getSession();
                        synchronized (session) {
                            Object attr = session.getAttribute("CONNECTED_SERVERS");
                            java.util.Set<Long> connected = new java.util.LinkedHashSet<>();
                            if (attr instanceof java.util.Set<?> set) {
                                for (Object o : set) {
                                    if (o instanceof Number n)
                                        connected.add(n.longValue());
                                    else if (o instanceof String str)
                                        try {
                                            connected.add(Long.parseLong(str));
                                        } catch (Exception ignored) {
                                        }
                                }
                            }
                            connected.add(id);
                            session.setAttribute("CONNECTED_SERVERS", connected);
                        }
                        
                        // Build response
                        java.util.Map<String, Object> response = new java.util.LinkedHashMap<>();
                        response.put("id", id);
                        response.put("status", "ONLINE");
                        response.put("sshKeyGenerated", false);
                        response.put("hasSshKey", true);
                        response.put("connectedWithKey", true);
                        response.put("message", "Đã reconnect thành công bằng SSH key. Server đã được kích hoạt lại.");
                        
                        return ResponseEntity.ok(response);
                    }
                }
            }
            
            // Nếu không có SSH key hoặc SSH key không hoạt động, yêu cầu password
            if (password == null || password.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "VALIDATION_ERROR", 
                                "message", hadSshKeyBefore 
                                    ? "SSH key không hoạt động. Vui lòng nhập password để reconnect."
                                    : "Password không được để trống (server chưa có SSH key)"));
            }
            
            // Perform reconnect với password
            Server s = serverService.reconnect(id, password);
            
            // Check if SSH key was generated
            boolean sshKeyGenerated = !hadSshKeyBefore && s.getSshKey() != null;
            
            // Update CONNECTED_SERVERS session
            var session = request.getSession();
            synchronized (session) {
                Object attr = session.getAttribute("CONNECTED_SERVERS");
                java.util.Set<Long> connected = new java.util.LinkedHashSet<>();
                if (attr instanceof java.util.Set<?> set) {
                    for (Object o : set) {
                        if (o instanceof Number n)
                            connected.add(n.longValue());
                        else if (o instanceof String str)
                            try {
                                connected.add(Long.parseLong(str));
                            } catch (Exception ignored) {
                            }
                    }
                }
                connected.add(s.getId());
                session.setAttribute("CONNECTED_SERVERS", connected);
                // SECURITY: Không lưu password trong session để tránh rủi ro bảo mật
            }
            
            // Build response message
            String message;
            if (sshKeyGenerated) {
                message = "Đã reconnect thành công bằng password và tự động generate SSH key. Server giờ có thể sử dụng SSH key cho các operations.";
            } else if (hadSshKeyBefore) {
                message = "Đã reconnect thành công bằng password. Server đã có SSH key từ trước (nhưng SSH key không hoạt động, đã dùng password).";
            } else {
                message = "Đã reconnect thành công bằng password nhưng không thể generate SSH key. Vui lòng thử lại hoặc kiểm tra quyền truy cập.";
            }
            
            java.util.Map<String, Object> response = new java.util.LinkedHashMap<>();
            response.put("id", s.getId());
            response.put("status", s.getStatus().name());
            response.put("sshKeyGenerated", sshKeyGenerated);
            response.put("hasSshKey", s.getSshKey() != null);
            response.put("connectedWithKey", false);
            response.put("message", message);
            
            return ResponseEntity.ok(response);
            
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "CONNECTION_ERROR", "message", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "INTERNAL_ERROR", 
                            "message", "Lỗi khi reconnect server: " + e.getMessage()));
        }
    }

    @PostMapping("/{id}/test-key")
    public ResponseEntity<?> testKey(@PathVariable Long id) {
        try {
            Server s = serverService.findById(id);
            if (s.getSshKey() == null || s.getSshKey().getEncryptedPrivateKey() == null
                    || s.getSshKey().getEncryptedPrivateKey().isBlank()) {
                return ResponseEntity.ok(Map.of(
                        "ok", false,
                        "message", "Chưa có SSH key cho máy này"));
            }
            boolean ok = serverService.testSshWithKey(
                    s.getHost(),
                    s.getPort() != null ? s.getPort() : 22,
                    s.getUsername(),
                    s.getSshKey().getEncryptedPrivateKey(),
                    4000);
            return ResponseEntity.ok(Map.of(
                    "ok", ok,
                    "message", ok ? "SSH key hoạt động" : "SSH key không kết nối được"));
        } catch (Exception ex) {
            return ResponseEntity.ok(Map.of(
                    "ok", false,
                    "message", String.valueOf(ex.getMessage())));
        }
    }

    @GetMapping("/{id}/ssh-key")
    public ResponseEntity<?> getSshKey(@PathVariable Long id) {
        try {
            Server s = serverService.findById(id);
            if (s.getSshKey() == null || s.getSshKey().getPublicKey() == null
                    || s.getSshKey().getPublicKey().isBlank()) {
                return ResponseEntity.ok(Map.of(
                        "ok", false,
                        "message", "Chưa có public key cho máy này"));
            }
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "publicKey", s.getSshKey().getPublicKey()));
        } catch (Exception ex) {
            return ResponseEntity.ok(Map.of(
                    "ok", false,
                    "message", String.valueOf(ex.getMessage())));
        }
    }

    @PostMapping("/{id}/shutdown")
    public ResponseEntity<?> shutdown(@PathVariable Long id, HttpServletRequest request) {
        try {
            Server s = serverService.findById(id);
            if (s == null) {
                return ResponseEntity.notFound().build();
            }
            
            // Kiểm tra server có connected không
            var session = request.getSession(false);
            boolean isConnected = false;
            if (session != null) {
                Object attr = session.getAttribute("CONNECTED_SERVERS");
                if (attr instanceof java.util.Set<?> set) {
                    for (Object o : set) {
                        Long serverId = null;
                        if (o instanceof Number n)
                            serverId = n.longValue();
                        else if (o instanceof String str)
                            try {
                                serverId = Long.parseLong(str);
                            } catch (Exception ignored) {
                            }
                        if (serverId != null && serverId.equals(id)) {
                            isConnected = true;
                            break;
                        }
                    }
                }
            }
            
            if (!isConnected) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "NOT_CONNECTED", 
                                "message", "Server chưa được kết nối. Vui lòng reconnect trước khi shutdown."));
            }
            
            // Thực hiện shutdown command qua SSH
            String pem = serverService.resolveServerPrivateKeyPem(id);
            int port = s.getPort() != null ? s.getPort() : 22;
            String shutdownCommand = "sudo shutdown -h now || sudo poweroff || sudo systemctl poweroff";
            
            String result = null;
            if (pem != null && !pem.isBlank()) {
                // Sử dụng SSH key
                result = serverService.execCommandWithKey(s.getHost(), port, s.getUsername(), pem, shutdownCommand, 10000);
            } else {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "NO_SSH_KEY", 
                                "message", "Server không có SSH key. Không thể shutdown."));
            }
            
            // Sau khi shutdown thành công, set status = OFFLINE và remove khỏi CONNECTED_SERVERS
            s.setStatus(Server.ServerStatus.OFFLINE);
            serverService.update(id, null, null, null, null, null, Server.ServerStatus.OFFLINE, null, null, null);
            
            // Remove khỏi CONNECTED_SERVERS
            if (session != null) {
                synchronized (session) {
                    Object attr = session.getAttribute("CONNECTED_SERVERS");
                    if (attr instanceof java.util.Set<?> set) {
                        java.util.LinkedHashSet<Long> connected = new java.util.LinkedHashSet<>();
                        for (Object o : set) {
                            if (o instanceof Number n)
                                connected.add(n.longValue());
                            else if (o instanceof String str)
                                try {
                                    connected.add(Long.parseLong(str));
                                } catch (Exception ignored) {
                                }
                        }
                        connected.remove(id);
                        session.setAttribute("CONNECTED_SERVERS", connected);
                    }
                }
            }
            
            return ResponseEntity.ok(Map.of(
                    "id", id,
                    "status", "OFFLINE",
                    "message", "Đã gửi lệnh shutdown đến server. Server sẽ tắt sau vài giây.",
                    "output", result != null ? result : ""
            ));
            
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "SHUTDOWN_ERROR", 
                            "message", "Lỗi khi shutdown server: " + e.getMessage()));
        }
    }

    @PostMapping("/{id}/disconnect")
    public ResponseEntity<?> disconnect(@PathVariable Long id, HttpServletRequest request) {
        // Ngắt kết nối = set status thành DISABLED
        try {
            // Set status = DISABLED (ngắt kết nối)
            // Sử dụng update với chỉ status thay đổi
            serverService.update(id, null, null, null, null, null, Server.ServerStatus.DISABLED, null, null, null);
            
            // Remove khỏi CONNECTED_SERVERS
            var session = request.getSession(false);
            if (session != null) {
                synchronized (session) {
                    Object attr = session.getAttribute("CONNECTED_SERVERS");
                    if (attr instanceof java.util.Set<?> set) {
                        java.util.LinkedHashSet<Long> ids = new java.util.LinkedHashSet<>();
                        for (Object o : set) {
                            if (o instanceof Number n)
                                ids.add(n.longValue());
                            else if (o instanceof String str)
                                try {
                                    ids.add(Long.parseLong(str));
                                } catch (Exception ignored) {
                                }
                        }
                        ids.remove(id);
                        session.setAttribute("CONNECTED_SERVERS", ids);
                    }
                    // SECURITY: Không còn lưu password trong session nên không cần xóa cache
                }
            }
            return ResponseEntity.ok(Map.of("id", id, "status", "DISABLED"));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/metrics")
    public Map<Long, Map<String, Object>> getServersMetrics(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null) {
            return java.util.Map.of();
        }

        // Lấy danh sách servers của user
        Long userId = null;
        Object uid = session.getAttribute("USER_ID");
        if (uid instanceof Long l)
            userId = l;
        else if (uid instanceof Number n)
            userId = n.longValue();
        var servers = (userId != null) ? serverService.findAllForUser(userId) : java.util.List.<Server>of();

        // SECURITY: Không đọc password từ session. Chỉ sử dụng SSH key để lấy metrics.
        // Lấy metrics cho tất cả servers song song (parallel processing)
        java.util.List<CompletableFuture<java.util.Map.Entry<Long, Map<String, Object>>>> futures = servers.stream()
                .map(s -> {
                    CompletableFuture<Map<String, Object>> metricsFuture = getServerMetricsAsync(s, null);
                    return metricsFuture.<java.util.Map.Entry<Long, Map<String, Object>>>thenApply(metrics -> {
                        Map<String, Object> result = metrics != null ? metrics
                                : Map.of("cpuCores", "-", "ramTotal", "-", "diskTotal", "-");
                        return java.util.Map.entry(s.getId(), result);
                    });
                })
                .toList();

        // Chờ tất cả futures hoàn thành
        java.util.Map<Long, Map<String, Object>> metricsMap = new java.util.LinkedHashMap<>();
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .orTimeout(30, TimeUnit.SECONDS)
                    .join();

            // Thu thập kết quả
            for (var future : futures) {
                try {
                    var entry = future.getNow(null);
                    if (entry != null) {
                        metricsMap.put(entry.getKey(), entry.getValue());
                    }
                } catch (Exception e) {
                    // Bỏ qua lỗi của từng server
                    System.err.println("Lỗi lấy metrics cho server: " + e.getMessage());
                }
            }
        } catch (Exception e) {
            System.err.println("Lỗi xử lý metrics: " + e.getMessage());
            // Nếu timeout hoặc lỗi, vẫn trả về những gì đã lấy được
        }

        // Đảm bảo tất cả servers đều có trong map (nếu chưa có thì thêm giá trị mặc định)
        for (var s : servers) {
            if (!metricsMap.containsKey(s.getId())) {
                metricsMap.put(s.getId(), Map.of("cpuCores", "-", "ramTotal", "-", "diskTotal", "-"));
            }
        }

        return metricsMap;
    }

    private static final String COMBINED_METRICS_COMMAND = "echo \"CPU_CORES:$(nproc)\"; " +
            "echo \"RAM_TOTAL:$(free -h | awk '/^Mem:/{print $2}')\"; " +
            "echo \"DISK_TOTAL:$(df -h / | awk 'NR==2{print $2}')\"";

    /**
     * Lấy metrics cho một server bất đồng bộ (async) để xử lý song song
     */
    private CompletableFuture<Map<String, Object>> getServerMetricsAsync(Server s, String fallbackPassword) {
        return CompletableFuture.<Map<String, Object>>supplyAsync(() -> {
            int port = s.getPort() != null ? s.getPort() : 22;
            
            // Thử SSH key trước
            if (s.getSshKey() != null && s.getSshKey().getEncryptedPrivateKey() != null
                    && !s.getSshKey().getEncryptedPrivateKey().isBlank()) {
                try {
                    String output = serverService.execCommandWithKey(s.getHost(), port, s.getUsername(),
                            s.getSshKey().getEncryptedPrivateKey(), COMBINED_METRICS_COMMAND, 5000);
                    if (output != null && !output.isBlank()) {
                        return parseCombinedMetricsOutput(output);
                    }
                } catch (Exception e) {
                    // Fallback to password
                    System.err.println("SSH key failed for " + s.getHost() + ": " + e.getMessage());
                }
            }

            // SECURITY: Không sử dụng password fallback. Chỉ sử dụng SSH key.
            // Trả về giá trị mặc định nếu SSH key không hoạt động
            return Map.of("cpuCores", "-", "ramTotal", "-", "diskTotal", "-");
        }, executorService)
                .orTimeout(15, TimeUnit.SECONDS)
                .exceptionally(throwable -> {
                    System.err.println("Timeout hoặc lỗi lấy metrics cho server " + s.getHost() + ": "
                            + throwable.getMessage());
                    return Map.of("cpuCores", "-", "ramTotal", "-", "diskTotal", "-");
                });
    }

    private Map<String, Object> parseCombinedMetricsOutput(String output) {
        String cpuCores = "-", ramTotal = "-", diskTotal = "-";

        try {
            String[] lines = output.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (line.startsWith("CPU_CORES:")) {
                    cpuCores = line.substring(10).trim();
                } else if (line.startsWith("RAM_TOTAL:")) {
                    ramTotal = line.substring(10).trim();
                } else if (line.startsWith("DISK_TOTAL:")) {
                    diskTotal = line.substring(11).trim();
                }
            }
        } catch (Exception e) {
            System.err.println("Lỗi phân tích kết quả metrics: " + e.getMessage());
        }

        // Return hardware specs: CPU cores, RAM total, Disk total
        return Map.of(
                "cpuCores", cpuCores.equals("-") ? "-" : cpuCores,
                "ramTotal", ramTotal,
                "diskTotal", diskTotal);
    }

    @PostMapping("/{id}/metrics")
    public ResponseEntity<?> updateMetrics(@PathVariable Long id, HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null) {
            return ResponseEntity.status(401).body(Map.of("ok", false, "message", "Unauthorized"));
        }

        try {
            Server s = serverService.findById(id);
            
            // SECURITY: Không đọc password từ session. Chỉ sử dụng SSH key để lấy metrics.
            // Lấy metrics mới từ server
            Map<String, Object> metrics = getServerMetricsAsync(s, null).get(20, TimeUnit.SECONDS);
            
            if (metrics == null) {
                return ResponseEntity.ok(Map.of("ok", false, "message", "Không thể lấy metrics từ server"));
            }

            // Cập nhật metrics vào database
            String cpuCores = (String) metrics.get("cpuCores");
            String ramTotal = (String) metrics.get("ramTotal");
            String diskTotal = (String) metrics.get("diskTotal");
            
            // Xử lý giá trị "-" thành null
            cpuCores = (cpuCores != null && !cpuCores.equals("-")) ? cpuCores : null;
            ramTotal = (ramTotal != null && !ramTotal.equals("-")) ? ramTotal : null;
            diskTotal = (diskTotal != null && !diskTotal.equals("-")) ? diskTotal : null;
            
            serverService.updateMetrics(id, cpuCores, ramTotal, diskTotal);

            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "message", "Cập nhật metrics thành công",
                    "metrics", metrics));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "ok", false,
                    "message", "Lỗi cập nhật metrics: " + e.getMessage()));
        }
    }

    @PostMapping("/metrics/refresh-all")
    public ResponseEntity<?> refreshAllMetrics(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null) {
            return ResponseEntity.status(401).body(Map.of("ok", false, "message", "Unauthorized"));
        }

        // Lấy danh sách servers của user
        Long userId = null;
        Object uid = session.getAttribute("USER_ID");
        if (uid instanceof Long l)
            userId = l;
        else if (uid instanceof Number n)
            userId = n.longValue();
        var servers = (userId != null) ? serverService.findAllForUser(userId) : java.util.List.<Server>of();

        // SECURITY: Không đọc password từ session. Chỉ sử dụng SSH key để lấy metrics.
        // Cập nhật metrics cho tất cả servers song song
        java.util.List<CompletableFuture<Map<String, Object>>> futures = servers.stream()
                .map(s -> {
                    CompletableFuture<Map<String, Object>> metricsFuture = getServerMetricsAsync(s, null);
                    return metricsFuture.<Map<String, Object>>thenApply(metrics -> {
                        if (metrics != null) {
                            try {
                                String cpuCores = (String) metrics.get("cpuCores");
                                String ramTotal = (String) metrics.get("ramTotal");
                                String diskTotal = (String) metrics.get("diskTotal");
                                
                                cpuCores = (cpuCores != null && !cpuCores.equals("-")) ? cpuCores : null;
                                ramTotal = (ramTotal != null && !ramTotal.equals("-")) ? ramTotal : null;
                                diskTotal = (diskTotal != null && !diskTotal.equals("-")) ? diskTotal : null;
                                
                                serverService.updateMetrics(s.getId(), cpuCores, ramTotal, diskTotal);
                                java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
                                result.put("serverId", s.getId());
                                result.put("ok", true);
                                result.put("metrics", metrics);
                                return result;
                            } catch (Exception e) {
                                java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
                                result.put("serverId", s.getId());
                                result.put("ok", false);
                                result.put("error", e.getMessage());
                                return result;
                            }
                        }
                        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
                        result.put("serverId", s.getId());
                        result.put("ok", false);
                        result.put("error", "No metrics");
                        return result;
                    });
                })
                .toList();

        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
                    .orTimeout(60, TimeUnit.SECONDS)
                    .join();

            java.util.List<Map<String, Object>> results = futures.stream()
                    .map(f -> f.getNow(null))
                    .filter(r -> r != null)
                    .toList();

            int successCount = (int) results.stream().filter(r -> Boolean.TRUE.equals(r.get("ok"))).count();
            int failCount = results.size() - successCount;

            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "message", String.format("Cập nhật metrics: %d thành công, %d thất bại", successCount, failCount),
                    "results", results));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of(
                    "ok", false,
                    "message", "Lỗi cập nhật metrics: " + e.getMessage()));
        }
    }
}
