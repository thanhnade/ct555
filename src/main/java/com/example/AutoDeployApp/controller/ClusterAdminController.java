package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.service.ServerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import jakarta.annotation.PreDestroy;

@RestController
@RequestMapping("/admin/clusters")
public class ClusterAdminController {

    private record ServerData(
            Long id,
            String host,
            int port,
            String username,
            com.example.AutoDeployApp.entity.Server.ServerRole role,
            com.example.AutoDeployApp.entity.Server.ServerStatus status,
            String sshPrivateKey) {
    }

    private final ClusterService clusterService;
    private final ServerService serverService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(10);

    // Constants for timeouts and commands
    private static final int SSH_TIMEOUT = 10000; // Tăng timeout cho combined commands
    private static final String COMBINED_METRICS_COMMAND = "echo \"CPU:$(nproc)\"; echo \"RAM:$(free -h | awk '/^Mem:/{print $2}')\"; echo \"DISK:$(df -h / | awk 'NR==2{print $2}')\"";
    private static final String KUBELET_VERSION_COMMAND = "kubelet --version 2>/dev/null | awk '{print $2}'";
    private static final String KUBEADM_VERSION_COMMAND = "kubeadm version -o short 2>/dev/null";

    public ClusterAdminController(ClusterService clusterService, ServerService serverService) {
        this.clusterService = clusterService;
        this.serverService = serverService;
    }

    @PreDestroy
    public void cleanup() {
        if (executorService != null && !executorService.isShutdown()) {
            executorService.shutdown();
            try {
                if (!executorService.awaitTermination(30, TimeUnit.SECONDS)) {
                    executorService.shutdownNow();
                }
            } catch (InterruptedException e) {
                executorService.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    /**
     * Lấy thông số server (CPU, RAM, Disk) sử dụng lệnh kết hợp để giảm số lần SSH
     */
    private CompletableFuture<Map<String, String>> getServerMetricsAsync(ServerData serverData,
            Map<Long, String> pwCache) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // Thử SSH key trước
                if (serverData.sshPrivateKey != null && !serverData.sshPrivateKey.isBlank()) {
                    Map<String, String> metrics = executeCombinedMetricsWithKey(
                            serverData.host, serverData.port, serverData.username, serverData.sshPrivateKey);
                    if (metrics != null) {
                        return metrics;
                    }
                }

                // Fallback về password nếu SSH key không hoạt động
                String pw = pwCache.get(serverData.id);
                if (pw != null && !pw.isBlank()) {
                    return executeCombinedMetricsWithPassword(serverData.host, serverData.port, serverData.username,
                            pw);
                }
            } catch (Exception e) {
                // Ghi log lỗi nhưng vẫn tiếp tục với giá trị mặc định
                System.err.println("Lỗi lấy thông số server " + serverData.host + ": " + e.getMessage());
            }

            // Trả về giá trị mặc định nếu tất cả phương thức đều thất bại
            return Map.of("cpu", "-", "ram", "-", "disk", "-");
        }, executorService).orTimeout(15, TimeUnit.SECONDS)
                .exceptionally(throwable -> {
                    System.err.println("Timeout hoặc lỗi lấy thông số server " + serverData.host + ": "
                            + throwable.getMessage());
                    return Map.of("cpu", "-", "ram", "-", "disk", "-");
                });
    }

    /**
     * Thực thi lệnh metrics kết hợp sử dụng SSH key (giảm từ 3 lần SSH xuống 1 lần)
     */
    private Map<String, String> executeCombinedMetricsWithKey(String host, int port, String user,
            String privateKeyPem) {
        try {
            String output = serverService.execCommandWithKey(host, port, user, privateKeyPem, COMBINED_METRICS_COMMAND,
                    SSH_TIMEOUT);
            if (output != null && !output.isBlank()) {
                return parseCombinedMetricsOutput(output);
            }
        } catch (Exception e) {
            System.err.println("Xác thực SSH key thất bại cho " + host + ": " + e.getMessage());
        }
        return null;
    }

    /**
     * Thực thi lệnh metrics kết hợp sử dụng password (giảm từ 3 lần SSH xuống 1
     * lần)
     */
    private Map<String, String> executeCombinedMetricsWithPassword(String host, int port, String user,
            String password) {
        try {
            String output = serverService.execCommand(host, port, user, password, COMBINED_METRICS_COMMAND,
                    SSH_TIMEOUT);
            if (output != null && !output.isBlank()) {
                return parseCombinedMetricsOutput(output);
            }
        } catch (Exception e) {
            System.err.println("Xác thực password thất bại cho " + host + ": " + e.getMessage());
        }
        return Map.of("cpu", "-", "ram", "-", "disk", "-");
    }

    /**
     * Phân tích kết quả metrics kết hợp từ lệnh shell
     * Định dạng mong đợi: "CPU:4\nRAM:8.0G\nDISK:50G"
     */
    private Map<String, String> parseCombinedMetricsOutput(String output) {
        String cpu = "-", ram = "-", disk = "-";

        try {
            String[] lines = output.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (line.startsWith("CPU:")) {
                    cpu = line.substring(4).trim();
                } else if (line.startsWith("RAM:")) {
                    ram = line.substring(4).trim();
                } else if (line.startsWith("DISK:")) {
                    disk = line.substring(5).trim();
                }
            }
        } catch (Exception e) {
            System.err.println("Lỗi phân tích kết quả metrics: " + e.getMessage());
        }

        return Map.of("cpu", cpu, "ram", ram, "disk", disk);
    }

    /**
     * Lấy phiên bản Kubernetes từ master node
     */
    private String getKubernetesVersion(ServerData serverData, Map<Long, String> pwCache) {
        if (serverData.role != com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
            return "";
        }

        try {
            // Thử SSH key trước
            if (serverData.sshPrivateKey != null && !serverData.sshPrivateKey.isBlank()) {
                String version = getVersionWithKey(serverData.host, serverData.port, serverData.username,
                        serverData.sshPrivateKey);
                if (version != null && !version.isBlank()) {
                    return version;
                }
            }

            // Fallback về password
            String pw = pwCache.get(serverData.id);
            if (pw != null && !pw.isBlank()) {
                return getVersionWithPassword(serverData.host, serverData.port, serverData.username, pw);
            }
        } catch (Exception e) {
            System.err.println("Lỗi lấy phiên bản Kubernetes từ " + serverData.host + ": " + e.getMessage());
        }

        return "";
    }

    private String getVersionWithKey(String host, int port, String user, String privateKeyPem) {
        try {
            String v = serverService.execCommandWithKey(host, port, user, privateKeyPem, KUBELET_VERSION_COMMAND,
                    SSH_TIMEOUT);
            if (v == null || v.isBlank()) {
                v = serverService.execCommandWithKey(host, port, user, privateKeyPem, KUBEADM_VERSION_COMMAND,
                        SSH_TIMEOUT);
            }
            return (v != null && !v.isBlank()) ? v.trim() : "";
        } catch (Exception e) {
            return "";
        }
    }

    private String getVersionWithPassword(String host, int port, String user, String password) {
        try {
            String v = serverService.execCommand(host, port, user, password, KUBELET_VERSION_COMMAND, SSH_TIMEOUT);
            if (v == null || v.isBlank()) {
                v = serverService.execCommand(host, port, user, password, KUBEADM_VERSION_COMMAND, SSH_TIMEOUT);
            }
            return (v != null && !v.isBlank()) ? v.trim() : "";
        } catch (Exception e) {
            return "";
        }
    }

    @GetMapping
    public List<Map<String, Object>> list(HttpServletRequest request) {
        Long currentUserId = null;
        var session = request.getSession(false);
        if (session != null) {
            Object uid = session.getAttribute("USER_ID");
            if (uid instanceof Long l)
                currentUserId = l;
            else if (uid instanceof Number n)
                currentUserId = n.longValue();
        }

        final Long userId = currentUserId;
        return clusterService.listSummaries().stream().map(s -> Map.<String, Object>of(
                "id", s.id(),
                "name", s.name(),
                "description", s.description(),
                "masterNode", s.masterNode(),
                "workerCount", s.workerCount(),
                "status", s.status(),
                "createdBy", s.createdBy(),
                "isOwner", userId != null && userId.equals(s.createdBy()))).toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String name = body.get("name");
        String description = body.get("description");

        Long createdBy = null;
        var session = request.getSession(false);
        if (session != null) {
            Object uid = session.getAttribute("USER_ID");
            if (uid instanceof Long l)
                createdBy = l;
            else if (uid instanceof Number n)
                createdBy = n.longValue();
        }

        Cluster c = clusterService.create(name, description, createdBy);
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

        // Get servers for this cluster (optimized query)
        var clusterServers = serverService.findByClusterId(id);
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();

        for (var s : clusterServers) {
            nodes.add(java.util.Map.of(
                    "id", s.getId(),
                    "ip", s.getHost(),
                    "port", s.getPort() != null ? s.getPort() : 22,
                    "username", s.getUsername(),
                    "role", s.getRole().name(),
                    "status", s.getStatus().name()));
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

        // Lấy password cache từ session
        var session = request.getSession(false);
        java.util.Map<Long, String> pwCache = getPasswordCache(session);

        // Lấy servers cho cluster này (query tối ưu)
        var clusterServers = serverService.findByClusterId(id);

        // Trích xuất dữ liệu server trong main thread để tránh vấn đề JPA session trong
        // các luồng song song
        var serverData = clusterServers.stream()
                .map(server -> new ServerData(
                        server.getId(),
                        server.getHost(),
                        server.getPort() != null ? server.getPort() : 22,
                        server.getUsername(),
                        server.getRole(),
                        server.getStatus(),
                        server.getSshKey() != null && server.getSshKey().getEncryptedPrivateKey() != null
                                ? server.getSshKey().getEncryptedPrivateKey()
                                : null))
                .toList();

        // Xử lý servers song song để tăng hiệu suất
        List<CompletableFuture<Map<String, Object>>> futures = serverData.stream()
                .map(serverDataItem -> getServerMetricsAsync(serverDataItem, pwCache)
                        .thenApply(metrics -> {
                            // Lấy phiên bản Kubernetes từ master node (chỉ một lần)
                            String version = "";
                            if (serverDataItem.role == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                                version = getKubernetesVersion(serverDataItem, pwCache);
                            }

                            return java.util.Map.<String, Object>of(
                                    "id", serverDataItem.id,
                                    "ip", serverDataItem.host,
                                    "role", serverDataItem.role.name(),
                                    "status", serverDataItem.status.name(),
                                    "cpu", metrics.get("cpu"),
                                    "ram", metrics.get("ram"),
                                    "disk", metrics.get("disk"),
                                    "version", version);
                        }))
                .toList();

        // Chờ tất cả futures hoàn thành và thu thập kết quả
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();
        String version = "";

        // Xử lý futures với cách ly lỗi
        for (int i = 0; i < futures.size(); i++) {
            var future = futures.get(i);
            var serverDataItem = serverData.get(i);

            try {
                Map<String, Object> nodeData = future.get(20, TimeUnit.SECONDS);
                nodes.add(nodeData);

                // Thu thập phiên bản từ master node
                String nodeVersion = (String) nodeData.get("version");
                if (version.isBlank() && nodeVersion != null && !nodeVersion.isBlank()) {
                    version = nodeVersion;
                }
            } catch (Exception e) {
                System.err
                        .println("Lỗi xử lý metrics server cho " + serverDataItem.host + ": " + e.getMessage());

                // Thêm dữ liệu fallback cho server thất bại để duy trì cluster view
                nodes.add(java.util.Map.of(
                        "id", serverDataItem.id,
                        "ip", serverDataItem.host,
                        "role", serverDataItem.role.name(),
                        "status", "ERROR", // Đánh dấu là trạng thái lỗi
                        "cpu", "-",
                        "ram", "-",
                        "disk", "-",
                        "version", "",
                        "error", "Không thể lấy metrics: " + e.getMessage()));
            }
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

    /**
     * Trích xuất password cache từ session
     */
    private java.util.Map<Long, String> getPasswordCache(jakarta.servlet.http.HttpSession session) {
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
                            // Bỏ qua các key không hợp lệ
                        }
                    }
                    if (key != null && e.getValue() instanceof String sv)
                        pwCache.put(key, sv);
                }
            }
        }
        return pwCache;
    }
}
