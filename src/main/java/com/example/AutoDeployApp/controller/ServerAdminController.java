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
        return serverService.findAllForUser(userId).stream().map(s -> Map.<String, Object>of(
                "id", s.getId(),
                "host", java.util.Objects.toString(s.getHost(), ""),
                "port", s.getPort() != null ? s.getPort() : 22,
                "username", java.util.Objects.toString(s.getUsername(), ""),
                "role", s.getRole() != null ? s.getRole().name() : "WORKER",
                "status", s.getStatus() != null ? s.getStatus().name() : "OFFLINE"))
                .toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String host = (String) body.get("host");
        Integer port = body.get("port") != null ? ((Number) body.get("port")).intValue() : 22;
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String roleStr = (String) body.getOrDefault("role", "WORKER");
        Server.ServerRole role = Server.ServerRole.valueOf(roleStr);
        Long addedBy = null;
        if (request.getSession(false) != null) {
            Object uid = request.getSession(false).getAttribute("USER_ID");
            if (uid instanceof Long l)
                addedBy = l;
            else if (uid instanceof Number n)
                addedBy = n.longValue();
        }
        Server s = serverService.create(host, port, username, password, role, addedBy);
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
        Server.ServerRole role = roleStr != null ? Server.ServerRole.valueOf(roleStr) : null;
        Server.ServerStatus status = statusStr != null ? Server.ServerStatus.valueOf(statusStr) : null;
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
        Server s = serverService.update(id, host, port, username, password, role, status);
        return ResponseEntity.ok(Map.of("id", s.getId()));
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

        // 2) CONNECTED_SERVERS chỉ gồm server ONLINE và SSH thành công (dùng mật khẩu
        // trong session)
        java.util.LinkedHashSet<Long> connected = new java.util.LinkedHashSet<>();
        for (var s : userServers) {
            if (s.getStatus() == Server.ServerStatus.ONLINE) {
                String pw = pwCache.get(s.getId());
                if (pw != null && !pw.isBlank()) {
                    boolean ok = serverService.testSsh(s.getHost(), s.getPort() != null ? s.getPort() : 22,
                            s.getUsername(), pw, 3000);
                    if (ok)
                        connected.add(s.getId());
                }
            }
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
}
