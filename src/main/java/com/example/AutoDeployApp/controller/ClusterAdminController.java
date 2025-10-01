package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.service.ServerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/clusters")
public class ClusterAdminController {

    private final ClusterService clusterService;
    private final ServerService serverService;

    public ClusterAdminController(ClusterService clusterService, ServerService serverService) {
        this.clusterService = clusterService;
        this.serverService = serverService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return clusterService.listSummaries().stream().map(s -> Map.<String, Object>of(
                "id", s.id(),
                "name", s.name(),
                "description", s.description(),
                "masterNode", s.masterNode(),
                "workerCount", s.workerCount(),
                "status", s.status())).toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body) {
        String name = body.get("name");
        String description = body.get("description");
        Cluster c = clusterService.create(name, description);
        return ResponseEntity.ok(Map.of("id", c.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        clusterService.deleteCluster(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id) {
        var summaries = clusterService.listSummaries();
        var sum = summaries.stream().filter(s -> s.id().equals(id)).findFirst().orElse(null);
        if (sum == null)
            return ResponseEntity.notFound().build();
        // list nodes = servers in this cluster
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();
        for (var s : serverService.findAll()) {
            if (s.getCluster() != null && id.equals(s.getCluster().getId())) {
                nodes.add(java.util.Map.of(
                        "id", s.getId(),
                        "ip", s.getHost(),
                        "port", s.getPort() != null ? s.getPort() : 22,
                        "username", s.getUsername(),
                        "role", s.getRole().name(),
                        "status", s.getStatus().name()));
            }
        }
        return ResponseEntity.ok(java.util.Map.of(
                "id", sum.id(),
                "name", sum.name(),
                "masterNode", sum.masterNode(),
                "workerCount", sum.workerCount(),
                "status", sum.status(),
                "nodes", nodes));
    }

    @GetMapping("/{id}/detail")
    public ResponseEntity<?> detailWithMetrics(@PathVariable Long id, jakarta.servlet.http.HttpServletRequest request) {
        var summaries = clusterService.listSummaries();
        var sum = summaries.stream().filter(s -> s.id().equals(id)).findFirst().orElse(null);
        if (sum == null)
            return ResponseEntity.notFound().build();
        var session = request.getSession(false);
        java.util.Map<Long, String> pwCache = new java.util.LinkedHashMap<>();
        if (session != null) {
            Object pwAttr = session.getAttribute("SERVER_PW_CACHE");
            if (pwAttr instanceof java.util.Map<?, ?> map) {
                for (var e : map.entrySet()) {
                    Long key = null;
                    if (e.getKey() instanceof Number n)
                        key = n.longValue();
                    else if (e.getKey() instanceof String str) {
                        try {
                            key = Long.parseLong(str);
                        } catch (Exception ignored) {
                        }
                    }
                    if (key != null && e.getValue() instanceof String sv)
                        pwCache.put(key, sv);
                }
            }
        }
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();
        String version = "";
        for (var s : serverService.findAll()) {
            if (s.getCluster() == null || !id.equals(s.getCluster().getId()))
                continue;
            String cpu = "-", ram = "-", disk = "-";
            String pw = pwCache.get(s.getId());
            if (pw != null && !pw.isBlank()) {
                String host = s.getHost();
                int port = (s.getPort() != null ? s.getPort() : 22);
                String user = s.getUsername();
                String outCpu = serverService.execCommand(host, port, user, pw, "nproc", 4000);
                if (outCpu != null && !outCpu.isBlank())
                    cpu = outCpu.trim();
                String outRam = serverService.execCommand(host, port, user, pw, "free -h | awk '/^Mem:/{print $2}'",
                        5000);
                if (outRam != null && !outRam.isBlank())
                    ram = outRam.trim();
                String outDisk = serverService.execCommand(host, port, user, pw, "df -h / | awk 'NR==2{print $2}'",
                        5000);
                if (outDisk != null && !outDisk.isBlank())
                    disk = outDisk.trim();
                if (version.isBlank() && s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                    String v = serverService.execCommand(host, port, user, pw,
                            "kubelet --version 2>/dev/null | awk '{print $2}'", 4000);
                    if (v == null || v.isBlank())
                        v = serverService.execCommand(host, port, user, pw, "kubeadm version -o short 2>/dev/null",
                                4000);
                    if (v != null && !v.isBlank())
                        version = v.trim();
                }
            }
            nodes.add(java.util.Map.of(
                    "id", s.getId(),
                    "ip", s.getHost(),
                    "role", s.getRole().name(),
                    "status", s.getStatus().name(),
                    "cpu", cpu,
                    "ram", ram,
                    "disk", disk));
        }
        return ResponseEntity.ok(java.util.Map.of(
                "id", sum.id(),
                "name", sum.name(),
                "masterNode", sum.masterNode(),
                "workerCount", sum.workerCount(),
                "status", sum.status(),
                "version", version,
                "nodes", nodes));
    }
}
