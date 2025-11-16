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

            // Lưu mật khẩu plaintext vào session cache để dùng cho SSH tự động
            Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
            java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
            if (pwAttr instanceof java.util.Map<?, ?> map) {
                for (var e : map.entrySet()) {
                    Long key = null;
                    if (e.getKey() instanceof Number n)
                        key = n.longValue();
                    else if (e.getKey() instanceof String str)
                        try {
                            key = Long.parseLong(str);
                        } catch (Exception ignored) {
                        }
                    if (key != null && e.getValue() instanceof String sv)
                        pwCache.put(key, sv);
                }
            }
            pwCache.put(s.getId(), password != null ? password : "");
            session.setAttribute("SERVER_PW_CACHE", pwCache);
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
        // Fallback: nếu không truyền mật khẩu, lấy từ session cache để cho phép sửa
        // nhanh ở "Servers đang kết nối"
        if (password == null || password.isBlank()) {
            var session = request.getSession(false);
            if (session != null) {
                Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
                if (pwAttr instanceof java.util.Map<?, ?> map) {
                    for (var e : map.entrySet()) {
                        Long key = null;
                        if (e.getKey() instanceof Number n)
                            key = n.longValue();
                        else if (e.getKey() instanceof String str)
                            try {
                                key = Long.parseLong(str);
                            } catch (Exception ignored) {
                            }
                        if (key != null && key.equals(id) && e.getValue() instanceof String sv) {
                            password = sv;
                            break;
                        }
                    }
                }
            }
        }
        Server s = serverService.update(id, host, port, username, password, role, status, clusterStatus, authType,
                sshKeyId);

        // Sau khi cập nhật và xác thực thành công, đưa máy vào CONNECTED_SERVERS để UI
        // hiển thị ở danh sách đang kết nối
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
            if (s.getStatus() == Server.ServerStatus.ONLINE) {
                connected.add(s.getId());
            }
            session.setAttribute("CONNECTED_SERVERS", connected);

            // Nếu có mật khẩu gửi lên (để fallback sau này), lưu vào SERVER_PW_CACHE
            if (password != null && !password.isBlank()) {
                Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
                java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
                if (pwAttr instanceof java.util.Map<?, ?> map) {
                    for (var e : map.entrySet()) {
                        Long key = null;
                        if (e.getKey() instanceof Number n)
                            key = n.longValue();
                        else if (e.getKey() instanceof String str)
                            try {
                                key = Long.parseLong(str);
                            } catch (Exception ignored) {
                            }
                        if (key != null && e.getValue() instanceof String sv)
                            pwCache.put(key, sv);
                    }
                }
                pwCache.put(s.getId(), password);
                session.setAttribute("SERVER_PW_CACHE", pwCache);
            }
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
    public List<Map<String, Object>> checkStatusAll(HttpServletRequest request) {
        var session = request.getSession();

        // 1) Ping tất cả server trong DB để cập nhật ONLINE/OFFLINE
        var allUpdated = serverService.checkAllStatuses(2000);

        // Xây map mật khẩu từ session cache
        java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
        Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
        if (pwAttr instanceof java.util.Map<?, ?> map) {
            for (var e : map.entrySet()) {
                Long key = null;
                if (e.getKey() instanceof Number n)
                    key = n.longValue();
                else if (e.getKey() instanceof String str)
                    try {
                        key = Long.parseLong(str);
                    } catch (Exception ignored) {
                    }
                if (key != null && e.getValue() instanceof String sv)
                    pwCache.put(key, sv);
            }
        }

        // Lọc server theo user hiện tại
        Long userId = null;
        Object uid = session.getAttribute("USER_ID");
        if (uid instanceof Long l)
            userId = l;
        else if (uid instanceof Number n)
            userId = n.longValue();
        var userServers = (userId != null) ? serverService.findAllForUser(userId) : java.util.List.<Server>of();

        // 2) CONNECTED_SERVERS: ưu tiên thử SSH bằng KEY; nếu thất bại thì fallback mật
        // khẩu. Thử cho tất cả server của user (không phụ thuộc ping ONLINE/OFFLINE)
        java.util.LinkedHashSet<Long> connected = new java.util.LinkedHashSet<>();
        for (var s : userServers) {
            String pw = pwCache.get(s.getId());
            boolean ok = serverService.tryConnectPreferKey(s, pw, 3000);
            if (ok)
                connected.add(s.getId());
        }
        session.setAttribute("CONNECTED_SERVERS", connected);

        // Trả về danh sách trạng thái (có thể dùng UI để tham khảo)
        return allUpdated.stream().map(s -> Map.<String, Object>of(
                "id", s.getId(),
                "host", s.getHost(),
                "status", s.getStatus().name()))
                .toList();
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
        String password = body.get("password");
        Server s = serverService.reconnect(id, password);
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

            // Lưu mật khẩu vào session cache khi đã SSH thành công
            Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
            java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
            if (pwAttr instanceof java.util.Map<?, ?> map) {
                for (var e : map.entrySet()) {
                    Long key = null;
                    if (e.getKey() instanceof Number n)
                        key = n.longValue();
                    else if (e.getKey() instanceof String str)
                        try {
                            key = Long.parseLong(str);
                        } catch (Exception ignored) {
                        }
                    if (key != null && e.getValue() instanceof String sv)
                        pwCache.put(key, sv);
                }
            }
            pwCache.put(s.getId(), password != null ? password : "");
            session.setAttribute("SERVER_PW_CACHE", pwCache);
        }
        return ResponseEntity.ok(Map.of("id", s.getId(), "status", s.getStatus().name()));
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

    @PostMapping("/{id}/disconnect")
    public ResponseEntity<?> disconnect(@PathVariable Long id, HttpServletRequest request) {
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
                // Optional: xoá mật khẩu cache cho server này
                Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
                if (pwAttr instanceof java.util.Map<?, ?> map) {
                    java.util.LinkedHashMap<Long, String> pwCache = new java.util.LinkedHashMap<>();
                    for (var e : map.entrySet()) {
                        Long key = null;
                        if (e.getKey() instanceof Number n)
                            key = n.longValue();
                        else if (e.getKey() instanceof String str)
                            try {
                                key = Long.parseLong(str);
                            } catch (Exception ignored) {
                            }
                        if (key != null && !key.equals(id) && e.getValue() instanceof String sv)
                            pwCache.put(key, sv);
                    }
                    session.setAttribute("SERVER_PW_CACHE", pwCache);
                }
            }
        }
        return ResponseEntity.ok(Map.of("id", id));
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

        // Lấy password cache
        java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
        Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
        if (pwAttr instanceof java.util.Map<?, ?> map) {
            for (var e : map.entrySet()) {
                Long key = null;
                if (e.getKey() instanceof Number n)
                    key = n.longValue();
                else if (e.getKey() instanceof String str)
                    try {
                        key = Long.parseLong(str);
                    } catch (Exception ignored) {
                    }
                if (key != null && e.getValue() instanceof String sv)
                    pwCache.put(key, sv);
            }
        }

        // Lấy metrics cho tất cả servers song song (parallel processing)
        java.util.List<CompletableFuture<java.util.Map.Entry<Long, Map<String, Object>>>> futures = servers.stream()
                .map(s -> {
                    CompletableFuture<Map<String, Object>> metricsFuture = getServerMetricsAsync(s, pwCache.get(s.getId()));
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

            // Fallback về password
            if (fallbackPassword != null && !fallbackPassword.isBlank()) {
                try {
                    String output = serverService.execCommand(s.getHost(), port, s.getUsername(), fallbackPassword,
                            COMBINED_METRICS_COMMAND, 5000);
                    if (output != null && !output.isBlank()) {
                        return parseCombinedMetricsOutput(output);
                    }
                } catch (Exception e) {
                    System.err.println("Password auth failed for " + s.getHost() + ": " + e.getMessage());
                }
            }

            // Trả về giá trị mặc định nếu tất cả phương thức đều thất bại
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
            
            // Lấy password cache để kết nối server
            String fallbackPassword = null;
            Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
            if (pwAttr instanceof java.util.Map<?, ?> map) {
                Object pw = map.get(id);
                if (pw instanceof String str) {
                    fallbackPassword = str;
                }
            }

            // Lấy metrics mới từ server
            Map<String, Object> metrics = getServerMetricsAsync(s, fallbackPassword).get(20, TimeUnit.SECONDS);
            
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

        // Lấy password cache
        java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
        Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
        if (pwAttr instanceof java.util.Map<?, ?> map) {
            for (var e : map.entrySet()) {
                Long key = null;
                if (e.getKey() instanceof Number n)
                    key = n.longValue();
                else if (e.getKey() instanceof String str)
                    try {
                        key = Long.parseLong(str);
                    } catch (Exception ignored) {
                    }
                if (key != null && e.getValue() instanceof String sv)
                    pwCache.put(key, sv);
            }
        }

        // Cập nhật metrics cho tất cả servers song song
        java.util.List<CompletableFuture<Map<String, Object>>> futures = servers.stream()
                .map(s -> {
                    CompletableFuture<Map<String, Object>> metricsFuture = getServerMetricsAsync(s, pwCache.get(s.getId()));
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
