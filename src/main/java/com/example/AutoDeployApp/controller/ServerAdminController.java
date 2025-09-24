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
        }
        return ResponseEntity.ok(Map.of("id", s.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String host = (String) body.get("host");
        Integer port = body.get("port") != null ? ((Number) body.get("port")).intValue() : null;
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String roleStr = (String) body.get("role");
        String statusStr = (String) body.get("status");
        Server.ServerRole role = roleStr != null ? Server.ServerRole.valueOf(roleStr) : null;
        Server.ServerStatus status = statusStr != null ? Server.ServerStatus.valueOf(statusStr) : null;
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
        var updated = serverService.checkAllStatuses(2000);

        // Update session CONNECTED_SERVERS for current user (ONLINE only)
        Long userId = null;
        var session = request.getSession();
        Object uid = session.getAttribute("USER_ID");
        if (uid instanceof Long l)
            userId = l;
        else if (uid instanceof Number n)
            userId = n.longValue();
        java.util.LinkedHashSet<Long> connected = new java.util.LinkedHashSet<>();
        if (userId != null) {
            for (var s : updated) {
                if (userId.equals(s.getAddedBy()) && s.getStatus() == Server.ServerStatus.ONLINE) {
                    connected.add(s.getId());
                }
            }
        }
        session.setAttribute("CONNECTED_SERVERS", connected);

        return updated.stream().map(s -> Map.<String, Object>of(
                "id", s.getId(),
                "host", s.getHost(),
                "status", s.getStatus().name())).toList();
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
        }
        return ResponseEntity.ok(Map.of("id", s.getId(), "status", s.getStatus().name()));
    }
}
