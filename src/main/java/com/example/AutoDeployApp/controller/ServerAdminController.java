package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.service.ServerService;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/servers")
public class ServerAdminController {

    private final ServerService serverService;

    public ServerAdminController(ServerService serverService) {
        this.serverService = serverService;
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
            m.put("role", s.getRole() != null ? s.getRole().name() : "WORKER");
            m.put("status", s.getStatus() != null ? s.getStatus().name() : "OFFLINE");
            if (s.getSshKey() != null && s.getSshKey().getId() != null)
                m.put("sshKeyId", s.getSshKey().getId());
            if (s.getCluster() != null && s.getCluster().getId() != null) {
                m.put("clusterId", s.getCluster().getId());
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
        String roleStr = (String) body.getOrDefault("role", "WORKER");
        Server.ServerRole role;
        try {
            role = Server.ServerRole.valueOf(roleStr);
        } catch (Exception ex) {
            role = Server.ServerRole.WORKER; // fallback an toàn nếu client gửi sai
        }
        Long sshKeyId = null;
        if (body.containsKey("sshKeyId") && body.get("sshKeyId") != null) {
            Object v = body.get("sshKeyId");
            if (v instanceof Number n)
                sshKeyId = n.longValue();
        }
        Long clusterId = null;
        if (body.containsKey("clusterId") && body.get("clusterId") != null) {
            Object v = body.get("clusterId");
            if (v instanceof Number n)
                clusterId = n.longValue();
        }
        // Determine authType: use KEY if sshKeyId is provided, otherwise PASSWORD
        Server.AuthType authType = (sshKeyId != null) ? Server.AuthType.KEY : Server.AuthType.PASSWORD;
        Server s = serverService.create(host, port, username, password, role, null, clusterId, authType, sshKeyId);
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
        Long clusterId = null;
        if (body.containsKey("clusterId")) {
            Object v = body.get("clusterId");
            if (v == null) {
                clusterId = null; // clear cluster
            } else if (v instanceof Number n) {
                clusterId = n.longValue();
            }
        }
        Server.ServerRole role = null;
        if (roleStr != null && !roleStr.isBlank()) {
            try {
                role = Server.ServerRole.valueOf(roleStr);
            } catch (Exception e) {
                System.out.println("WARNING: Invalid role value: " + roleStr + " for server " + id);
                role = null;
            }
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
        Server s = serverService.update(id, host, port, username, password, role, status, clusterId, authType,
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
}
