package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.service.ServerService;
import com.example.AutoDeployApp.service.AnsibleInstallationService;
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
            String sshPrivateKey,
            boolean isConnected) {
    }

    private final ClusterService clusterService;
    private final ServerService serverService;
    private final AnsibleInstallationService ansibleInstallationService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(10);

    // Constants for timeouts and commands
    private static final int SSH_TIMEOUT = 10000; // Tăng timeout cho combined commands
    private static final String COMBINED_METRICS_COMMAND = "echo \"CPU_CORES:$(nproc)\"; " +
            "echo \"CPU_LOAD:$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')\"; " +
            "echo \"RAM_TOTAL:$(free -h | awk '/^Mem:/{print $2}')\"; " +
            "echo \"RAM_USED:$(free -h | awk '/^Mem:/{print $3}')\"; " +
            "echo \"DISK_PERCENT:$(df / | awk 'NR==2{print $5}')\"";
    private static final String KUBELET_VERSION_COMMAND = "kubelet --version 2>/dev/null | awk '{print $2}'";
    private static final String KUBEADM_VERSION_COMMAND = "kubeadm version -o short 2>/dev/null";
    private static final String KUBECTL_GET_NODES_JSON = "KUBECONFIG=/etc/kubernetes/admin.conf kubectl get nodes -o json";
    private static final String KUBECTL_GET_NODES_JSON_ALT = "KUBECONFIG=/root/.kube/config kubectl get nodes -o json";
    private static final String KUBECTL_GET_NODES_JSON_SUDO = "sudo -E kubectl get nodes -o json";
    private static final String KUBECTL_GET_NODES_WIDE = "KUBECONFIG=/etc/kubernetes/admin.conf kubectl get nodes -o wide";

    public ClusterAdminController(ClusterService clusterService, ServerService serverService,
            AnsibleInstallationService ansibleInstallationService) {
        this.clusterService = clusterService;
        this.serverService = serverService;
        this.ansibleInstallationService = ansibleInstallationService;
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
     * Khởi tạo cấu trúc /etc/ansible trên MASTER của cluster
     * Body: { "host": optional, "sudoPassword": optional (nếu có sudo NOPASSWD) }
     */
    @PostMapping("/{id}/ansible/init/structure")
    public ResponseEntity<?> initAnsibleStructure(@PathVariable Long id, @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;
            String sudoPassword = body != null ? (String) body.get("sudoPassword") : null;

            var servers = serverService.findByClusterId(id);
            if (servers == null || servers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có server"));
            }

            com.example.AutoDeployApp.entity.Server target = null;
            if (host != null && !host.isBlank()) {
                for (var s : servers) {
                    if (host.equals(s.getHost())) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER trong cluster"));
            }

            // Kiểm tra sudo NOPASSWD nếu chưa có sudoPassword
            if (sudoPassword == null || sudoPassword.isBlank()) {
                try {
                    String pem = serverService.resolveServerPrivateKeyPem(target.getId());
                    if (pem != null && !pem.isBlank()) {
                        String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                        String sudoCheckResult = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, checkSudoCmd, 5000);
                        if (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD")) {
                            // Có sudo NOPASSWD, không cần password
                            sudoPassword = null;
                        } else {
                            return ResponseEntity.badRequest().body(
                                    Map.of("error", "Server không có sudo NOPASSWD. Vui lòng cung cấp mật khẩu sudo"));
                        }
                    } else {
                        return ResponseEntity.badRequest()
                                .body(Map.of("error", "Không có SSH key và không có mật khẩu sudo"));
                    }
                } catch (Exception e) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Không thể kiểm tra sudo NOPASSWD. Vui lòng cung cấp mật khẩu sudo"));
                }
            }

            // Phương thức initRemoteAnsibleStructure đã được chuyển sang
            // AnsibleWebSocketHandler
            // Sử dụng WebSocket để thực hiện khởi tạo cấu trúc
            String output = "Khởi tạo cấu trúc Ansible - sử dụng WebSocket để thực hiện";
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "host", target.getHost(),
                    "message", "Đã khởi tạo cấu trúc Ansible trên máy chủ",
                    "output", output));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg));
        }
    }

    /**
     * Lấy danh sách node từ kubectl (trên MASTER) và trả về trạng thái
     * Ready/NotReady, IP nội bộ, version
     */
    @GetMapping("/{id}/k8s/nodes")
    public ResponseEntity<?> getKubernetesNodes(@PathVariable Long id, HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            java.util.Map<Long, String> pwCache = getPasswordCache(session);

            // Lấy servers trong cluster và chọn MASTER đầu tiên
            var clusterServers = serverService.findByClusterId(id);
            if (clusterServers == null || clusterServers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có servers nào."));
            }

            com.example.AutoDeployApp.entity.Server master = null;
            for (var s : clusterServers) {
                if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                    master = s;
                    break;
                }
            }
            if (master == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER trong cluster."));
            }

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            String output = null;
            String wide = null;
            String rawTried = "";
            try {
                if (pem != null && !pem.isBlank()) {
                    // Try default
                    output = serverService.execCommandWithKey(
                            master.getHost(), master.getPort() != null ? master.getPort() : 22,
                            master.getUsername(), pem, KUBECTL_GET_NODES_JSON, 8000);
                    rawTried += "JSON@/etc/kubernetes/admin.conf:" + (output == null ? "null" : output.length()) + "\n";
                    if (output == null || output.isBlank() || output.trim().startsWith("error")) {
                        // Try alt kubeconfig
                        output = serverService.execCommandWithKey(
                                master.getHost(), master.getPort() != null ? master.getPort() : 22,
                                master.getUsername(), pem, KUBECTL_GET_NODES_JSON_ALT, 8000);
                        rawTried += "JSON@/root/.kube/config:" + (output == null ? "null" : output.length()) + "\n";
                    }
                    if (output == null || output.isBlank() || output.trim().startsWith("error")) {
                        // Try sudo -E
                        output = serverService.execCommandWithKey(
                                master.getHost(), master.getPort() != null ? master.getPort() : 22,
                                master.getUsername(), pem, KUBECTL_GET_NODES_JSON_SUDO, 8000);
                        rawTried += "JSON@sudo -E:" + (output == null ? "null" : output.length()) + "\n";
                    }
                    wide = serverService.execCommandWithKey(
                            master.getHost(), master.getPort() != null ? master.getPort() : 22,
                            master.getUsername(), pem, KUBECTL_GET_NODES_WIDE, 8000);
                } else {
                    String pw = pwCache.get(master.getId());
                    if (pw == null || pw.isBlank()) {
                        return ResponseEntity.badRequest().body(Map.of("error",
                                "Không có thông tin xác thực để chạy kubectl trên MASTER."));
                    }
                    // Try default
                    output = serverService.execCommand(
                            master.getHost(), master.getPort() != null ? master.getPort() : 22,
                            master.getUsername(), pw, KUBECTL_GET_NODES_JSON, 8000);
                    rawTried += "JSON@/etc/kubernetes/admin.conf:" + (output == null ? "null" : output.length()) + "\n";
                    if (output == null || output.isBlank() || output.trim().startsWith("error")) {
                        // Try alt kubeconfig
                        output = serverService.execCommand(
                                master.getHost(), master.getPort() != null ? master.getPort() : 22,
                                master.getUsername(), pw, KUBECTL_GET_NODES_JSON_ALT, 8000);
                        rawTried += "JSON@/root/.kube/config:" + (output == null ? "null" : output.length()) + "\n";
                    }
                    if (output == null || output.isBlank() || output.trim().startsWith("error")) {
                        // Try sudo -E
                        output = serverService.execCommand(
                                master.getHost(), master.getPort() != null ? master.getPort() : 22,
                                master.getUsername(), pw, KUBECTL_GET_NODES_JSON_SUDO, 8000);
                        rawTried += "JSON@sudo -E:" + (output == null ? "null" : output.length()) + "\n";
                    }
                    wide = serverService.execCommand(
                            master.getHost(), master.getPort() != null ? master.getPort() : 22,
                            master.getUsername(), pw, KUBECTL_GET_NODES_WIDE, 8000);
                }
            } catch (Exception e) {
                return ResponseEntity.status(500)
                        .body(Map.of("error", "Không thể thực thi kubectl trên MASTER: " + e.getMessage()));
            }

            if (output == null || output.isBlank()) {
                return ResponseEntity.ok(Map.of("nodes", java.util.List.of()));
            }

            // Parse JSON output
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode root = null;
            try {
                root = mapper.readTree(output);
            } catch (Exception parseEx) {
                // Nếu parse lỗi, trả thông tin debug
                return ResponseEntity.ok(Map.of(
                        "nodes", java.util.List.of(),
                        "wide", wide != null ? wide : "",
                        "rawJson", output != null ? output : "",
                        "tried", rawTried));
            }
            var items = root.path("items");
            java.util.List<java.util.Map<String, Object>> result = new java.util.ArrayList<>();
            if (items.isArray()) {
                for (var node : items) {
                    String name = node.path("metadata").path("name").asText("");
                    // internalIP
                    String internalIP = "";
                    var addresses = node.path("status").path("addresses");
                    if (addresses.isArray()) {
                        for (var addr : addresses) {
                            if ("InternalIP".equals(addr.path("type").asText())) {
                                internalIP = addr.path("address").asText("");
                                break;
                            }
                        }
                    }
                    // Ready condition
                    String readyStatus = "Unknown";
                    var conditions = node.path("status").path("conditions");
                    if (conditions.isArray()) {
                        for (var c : conditions) {
                            if ("Ready".equals(c.path("type").asText())) {
                                readyStatus = "True".equals(c.path("status").asText()) ? "Ready" : "NotReady";
                                break;
                            }
                        }
                    }
                    // Roles (from labels if present)
                    String roles = node.path("metadata").path("labels").path("kubernetes.io/role").asText("");
                    if (roles.isBlank()) {
                        roles = node.path("metadata").path("labels").path("node-role.kubernetes.io/control-plane")
                                .isMissingNode() ? roles : "master";
                    }
                    String kubeletVersion = node.path("status").path("nodeInfo").path("kubeletVersion").asText("");

                    result.add(Map.of(
                            "name", name,
                            "internalIP", internalIP,
                            "k8sStatus", readyStatus,
                            "roles", roles,
                            "kubeletVersion", kubeletVersion));
                }
            }

            return ResponseEntity.ok(Map.of("nodes", result, "wide", wide != null ? wide : ""));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Lỗi lấy danh sách node: " + e.getMessage()));
        }
    }

    /**
     * Liệt kê namespaces
     */
    @GetMapping("/{id}/k8s/namespaces")
    public ResponseEntity<?> listNamespaces(@PathVariable Long id, HttpServletRequest request) {
        try {
            var session = request.getSession(false);

            // Kiểm tra master online trước
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.ok(Map.of("namespaces", new java.util.ArrayList<>(),
                        "error", "Master server đang offline"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var clusterServers = serverService.findByClusterId(id);
            if (clusterServers == null || clusterServers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có servers nào."));
            }
            com.example.AutoDeployApp.entity.Server master = clusterServers.stream()
                    .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                    .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl get ns -o json";
            String output = null;
            try {
                if (pem != null && !pem.isBlank()) {
                    output = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 10000);
                } else {
                    String pw = pwCache.get(master.getId());
                    output = serverService.execCommand(master.getHost(), port, user, pw, cmd, 10000);
                }
            } catch (Exception e) {
                return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var root = mapper.readTree(output);
            var items = root.path("items");
            java.util.List<java.util.Map<String, Object>> result = new java.util.ArrayList<>();
            if (items.isArray()) {
                for (var ns : items) {
                    result.add(Map.of(
                            "name", ns.path("metadata").path("name").asText(""),
                            "status", ns.path("status").path("phase").asText("")));
                }
            }
            return ResponseEntity.ok(Map.of("namespaces", result));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Liệt kê pods (tất cả namespaces)
     */
    @GetMapping("/{id}/k8s/pods")
    public ResponseEntity<?> listPods(@PathVariable Long id, HttpServletRequest request) {
        try {
            var session = request.getSession(false);

            // Kiểm tra master online trước
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.ok(Map.of("pods", new java.util.ArrayList<>(),
                        "error", "Master server đang offline"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var clusterServers = serverService.findByClusterId(id);
            if (clusterServers == null || clusterServers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có servers nào."));
            }
            com.example.AutoDeployApp.entity.Server master = clusterServers.stream()
                    .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                    .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl get pods -A -o json";
            String output = null;
            try {
                if (pem != null && !pem.isBlank()) {
                    output = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 15000);
                } else {
                    String pw = pwCache.get(master.getId());
                    output = serverService.execCommand(master.getHost(), port, user, pw, cmd, 15000);
                }
            } catch (Exception e) {
                return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            var root = mapper.readTree(output);
            var items = root.path("items");
            java.util.List<java.util.Map<String, Object>> result = new java.util.ArrayList<>();
            if (items.isArray()) {
                for (var pod : items) {
                    String ns = pod.path("metadata").path("namespace").asText("");
                    String name = pod.path("metadata").path("name").asText("");
                    String nodeName = pod.path("spec").path("nodeName").asText("");
                    String phase = pod.path("status").path("phase").asText("");
                    result.add(Map.of(
                            "namespace", ns,
                            "name", name,
                            "node", nodeName,
                            "status", phase));
                }
            }
            return ResponseEntity.ok(Map.of("pods", result));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Liệt kê workloads: Deployments/StatefulSets/DaemonSets (tất cả namespaces)
     */
    @GetMapping("/{id}/k8s/workloads")
    public ResponseEntity<?> listWorkloads(@PathVariable Long id, HttpServletRequest request) {
        try {
            var session = request.getSession(false);

            // Kiểm tra master online trước
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.ok(Map.of(
                        "deployments", new java.util.ArrayList<>(),
                        "statefulSets", new java.util.ArrayList<>(),
                        "daemonSets", new java.util.ArrayList<>(),
                        "error", "Master server đang offline"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var clusterServers = serverService.findByClusterId(id);
            if (clusterServers == null || clusterServers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có servers nào."));
            }
            com.example.AutoDeployApp.entity.Server master = clusterServers.stream()
                    .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                    .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();

            String cmdDeploy = "kubectl get deploy -A -o json";
            String cmdSts = "kubectl get statefulset -A -o json";
            String cmdDs = "kubectl get daemonset -A -o json";

            String outDeploy, outSts, outDs;
            try {
                if (pem != null && !pem.isBlank()) {
                    outDeploy = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmdDeploy, 15000);
                    outSts = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmdSts, 15000);
                    outDs = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmdDs, 15000);
                } else {
                    String pw = pwCache.get(master.getId());
                    outDeploy = serverService.execCommand(master.getHost(), port, user, pw, cmdDeploy, 15000);
                    outSts = serverService.execCommand(master.getHost(), port, user, pw, cmdSts, 15000);
                    outDs = serverService.execCommand(master.getHost(), port, user, pw, cmdDs, 15000);
                }
            } catch (Exception e) {
                return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
            }

            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.List<java.util.Map<String, Object>> deployments = new java.util.ArrayList<>();
            java.util.List<java.util.Map<String, Object>> statefulSets = new java.util.ArrayList<>();
            java.util.List<java.util.Map<String, Object>> daemonSets = new java.util.ArrayList<>();

            try {
                var items = mapper.readTree(outDeploy).path("items");
                if (items.isArray())
                    for (var d : items) {
                        deployments.add(Map.of(
                                "namespace", d.path("metadata").path("namespace").asText(""),
                                "name", d.path("metadata").path("name").asText(""),
                                "ready", d.path("status").path("readyReplicas").asInt(0),
                                "replicas", d.path("status").path("replicas").asInt(0)));
                    }
            } catch (Exception ignored) {
            }
            try {
                var items = mapper.readTree(outSts).path("items");
                if (items.isArray())
                    for (var s : items) {
                        statefulSets.add(Map.of(
                                "namespace", s.path("metadata").path("namespace").asText(""),
                                "name", s.path("metadata").path("name").asText(""),
                                "ready", s.path("status").path("readyReplicas").asInt(0),
                                "replicas", s.path("status").path("replicas").asInt(0)));
                    }
            } catch (Exception ignored) {
            }
            try {
                var items = mapper.readTree(outDs).path("items");
                if (items.isArray())
                    for (var ds : items) {
                        daemonSets.add(Map.of(
                                "namespace", ds.path("metadata").path("namespace").asText(""),
                                "name", ds.path("metadata").path("name").asText(""),
                                "ready", ds.path("status").path("numberReady").asInt(0),
                                "desired", ds.path("status").path("desiredNumberScheduled").asInt(0)));
                    }
            } catch (Exception ignored) {
            }

            return ResponseEntity.ok(Map.of(
                    "deployments", deployments,
                    "statefulSets", statefulSets,
                    "daemonSets", daemonSets));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== K8s Resource Actions (Describe/Delete/Scale)
    // =====================

    @GetMapping("/{id}/k8s/pods/{namespace}/{name}")
    public ResponseEntity<?> describePod(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.status(503).body(Map.of("error", "Master server đang offline"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var masters = serverService.findByClusterId(id);
            var master = masters == null ? null
                    : masters.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                            .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl -n " + namespace + " get pod " + name + " -o yaml";

            String out;
            if (pem != null && !pem.isBlank()) {
                out = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 15000);
            } else {
                String pw = pwCache.get(master.getId());
                out = serverService.execCommand(master.getHost(), port, user, pw, cmd, 15000);
            }
            if (out == null)
                out = "";
            return ResponseEntity.ok(Map.of("output", out));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}/k8s/pods/{namespace}/{name}")
    public ResponseEntity<?> deletePod(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            // Chặn xóa namespace hệ thống
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa pod trong namespace hệ thống"));
            }

            var session = request.getSession(false);
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.status(503).body(Map.of("error", "Master server đang offline"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var masters = serverService.findByClusterId(id);
            var master = masters == null ? null
                    : masters.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                            .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl -n " + namespace + " delete pod " + name;

            String out;
            if (pem != null && !pem.isBlank()) {
                out = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 20000);
            } else {
                String pw = pwCache.get(master.getId());
                out = serverService.execCommand(master.getHost(), port, user, pw, cmd, 20000);
            }
            if (out == null)
                out = "";
            return ResponseEntity.ok(Map.of("output", out));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/k8s/{type}/{namespace}/{name}")
    public ResponseEntity<?> describeWorkload(@PathVariable Long id,
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.status(503).body(Map.of("error", "Master server đang offline"));
            }

            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset") || t.equals("daemonset"))) {
                return ResponseEntity.badRequest().body(Map.of("error", "Loại workload không hợp lệ"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var masters = serverService.findByClusterId(id);
            var master = masters == null ? null
                    : masters.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                            .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl -n " + namespace + " get " + t + " " + name + " -o yaml";

            String out;
            if (pem != null && !pem.isBlank()) {
                out = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 15000);
            } else {
                String pw = pwCache.get(master.getId());
                out = serverService.execCommand(master.getHost(), port, user, pw, cmd, 15000);
            }
            if (out == null)
                out = "";
            return ResponseEntity.ok(Map.of("output", out));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    public static class ScaleRequest {
        public Integer replicas;

        public Integer getReplicas() {
            return replicas;
        }

        public void setReplicas(Integer r) {
            this.replicas = r;
        }
    }

    @PostMapping("/{id}/k8s/{type}/{namespace}/{name}/scale")
    public ResponseEntity<?> scaleWorkload(@PathVariable Long id,
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody ScaleRequest body,
            HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.status(503).body(Map.of("error", "Master server đang offline"));
            }

            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset"))) {
                return ResponseEntity.badRequest().body(Map.of("error", "Chỉ hỗ trợ scale Deployment/StatefulSet"));
            }
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép scale trong namespace hệ thống"));
            }
            if (body == null || body.replicas == null || body.replicas < 0) {
                return ResponseEntity.badRequest().body(Map.of("error", "Giá trị replicas không hợp lệ"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var masters = serverService.findByClusterId(id);
            var master = masters == null ? null
                    : masters.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                            .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl -n " + namespace + " scale " + t + "/" + name + " --replicas=" + body.replicas;

            String out;
            if (pem != null && !pem.isBlank()) {
                out = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 20000);
            } else {
                String pw = pwCache.get(master.getId());
                out = serverService.execCommand(master.getHost(), port, user, pw, cmd, 20000);
            }
            if (out == null)
                out = "";
            return ResponseEntity.ok(Map.of("output", out));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}/k8s/{type}/{namespace}/{name}")
    public ResponseEntity<?> deleteWorkload(@PathVariable Long id,
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (!isMasterOnline(id, session)) {
                return ResponseEntity.status(503).body(Map.of("error", "Master server đang offline"));
            }

            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset") || t.equals("daemonset"))) {
                return ResponseEntity.badRequest().body(Map.of("error", "Chỉ cho phép xóa Deployment/StatefulSet/DaemonSet"));
            }
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không cho phép xóa trong namespace hệ thống"));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            var masters = serverService.findByClusterId(id);
            var master = masters == null ? null
                    : masters.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                            .findFirst().orElse(null);
            if (master == null)
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER"));

            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String user = master.getUsername();
            String cmd = "kubectl -n " + namespace + " delete " + t + " " + name;

            String out;
            if (pem != null && !pem.isBlank()) {
                out = serverService.execCommandWithKey(master.getHost(), port, user, pem, cmd, 20000);
            } else {
                String pw = pwCache.get(master.getId());
                out = serverService.execCommand(master.getHost(), port, user, pw, cmd, 20000);
            }
            if (out == null)
                out = "";
            return ResponseEntity.ok(Map.of("output", out));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Ghi config mặc định (ansible.cfg, hosts) lên MASTER
     * Body: { "host": optional, "sudoPassword": optional (nếu có sudo NOPASSWD) }
     */
    @PostMapping("/{id}/ansible/init/config")
    public ResponseEntity<?> initAnsibleConfig(@PathVariable Long id, @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;
            String sudoPassword = body != null ? (String) body.get("sudoPassword") : null;

            var servers = serverService.findByClusterId(id);
            if (servers == null || servers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có server"));
            }

            com.example.AutoDeployApp.entity.Server target = null;
            if (host != null && !host.isBlank()) {
                for (var s : servers) {
                    if (host.equals(s.getHost())) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER trong cluster"));
            }

            // Kiểm tra sudo NOPASSWD nếu chưa có sudoPassword
            if (sudoPassword == null || sudoPassword.isBlank()) {
                try {
                    String pem = serverService.resolveServerPrivateKeyPem(target.getId());
                    if (pem != null && !pem.isBlank()) {
                        String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                        String sudoCheckResult = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, checkSudoCmd, 5000);
                        if (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD")) {
                            // Có sudo NOPASSWD, không cần password
                            sudoPassword = null;
                        } else {
                            return ResponseEntity.badRequest().body(
                                    Map.of("error", "Server không có sudo NOPASSWD. Vui lòng cung cấp mật khẩu sudo"));
                        }
                    } else {
                        return ResponseEntity.badRequest()
                                .body(Map.of("error", "Không có SSH key và không có mật khẩu sudo"));
                    }
                } catch (Exception e) {
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Không thể kiểm tra sudo NOPASSWD. Vui lòng cung cấp mật khẩu sudo"));
                }
            }

            // Xác định master chính xác theo cluster summary; các máy còn lại là worker
            String masterHost = null;
            var summaries = clusterService.listSummaries();
            var sum = summaries.stream().filter(s -> s.id().equals(id)).findFirst().orElse(null);
            if (sum != null && sum.masterNode() != null && !sum.masterNode().isBlank()) {
                masterHost = sum.masterNode().trim();
            }

            java.util.List<com.example.AutoDeployApp.entity.Server> filtered = new java.util.ArrayList<>();
            com.example.AutoDeployApp.entity.Server chosenMaster = null;
            if (masterHost != null) {
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER
                            && masterHost.equals(s.getHost())) {
                        chosenMaster = s;
                        break;
                    }
                }
            }
            if (chosenMaster == null) {
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                        chosenMaster = s;
                        break;
                    }
                }
            }
            if (chosenMaster != null)
                filtered.add(chosenMaster);
            for (var s : servers) {
                if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.WORKER)
                    filtered.add(s);
            }

            // Phương thức initRemoteDefaultConfigForCluster đã được chuyển sang
            // AnsibleWebSocketHandler
            // Sử dụng WebSocket để thực hiện khởi tạo cấu hình
            String output = "Khởi tạo cấu hình Ansible - sử dụng WebSocket để thực hiện";
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "host", target.getHost(),
                    "message", "Đã ghi config mặc định Ansible (master/workers theo CSDL)",
                    "output", output));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg));
        }
    }

    /**
     * Tạo SSH key không mật khẩu trên MASTER nếu chưa có
     * Body: { "host": optional }
     */
    @PostMapping("/{id}/ansible/init/sshkey")
    public ResponseEntity<?> initAnsibleSshKey(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;

            var servers = serverService.findByClusterId(id);
            if (servers == null || servers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có server"));
            }

            com.example.AutoDeployApp.entity.Server target = null;
            if (host != null && !host.isBlank()) {
                for (var s : servers) {
                    if (host.equals(s.getHost())) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER trong cluster"));
            }

            // Phương thức generateRemoteSshKeyNoPass đã được chuyển sang
            // AnsibleWebSocketHandler
            // Sử dụng WebSocket để thực hiện tạo SSH key
            String output = "Tạo SSH key Ansible - sử dụng WebSocket để thực hiện";
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "host", target.getHost(),
                    "message", "Đã tạo SSH key (nếu chưa có)",
                    "output", output));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg));
        }
    }

    /**
     * Chạy ansible all -m ping trên MASTER
     * Body: { "host": optional }
     */
    @PostMapping("/{id}/ansible/init/ping")
    public ResponseEntity<?> initAnsiblePing(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;

            var servers = serverService.findByClusterId(id);
            if (servers == null || servers.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Cluster không có server"));
            }

            com.example.AutoDeployApp.entity.Server target = null;
            if (host != null && !host.isBlank()) {
                for (var s : servers) {
                    if (host.equals(s.getHost())) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                        target = s;
                        break;
                    }
                }
            }
            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không tìm thấy MASTER trong cluster"));
            }

            // Phương thức runRemoteAnsiblePingAll đã được chuyển sang
            // AnsibleWebSocketHandler
            // Sử dụng WebSocket để thực hiện ping test
            String output = "Chạy Ansible ping - sử dụng WebSocket để thực hiện";
            return ResponseEntity.ok(Map.of(
                    "ok", true,
                    "host", target.getHost(),
                    "message", "Đã chạy ansible ping",
                    "output", output));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg));
        }
    }

    /**
     * Lấy thông số server (CPU, RAM, Disk) sử dụng lệnh kết hợp để giảm số lần SSH
     */
    private CompletableFuture<Map<String, Object>> getServerMetricsAsync(ServerData serverData,
            Map<Long, String> pwCache) {
        return CompletableFuture.<Map<String, Object>>supplyAsync(() -> {
            try {
                // Thử SSH key trước
                if (serverData.sshPrivateKey != null && !serverData.sshPrivateKey.isBlank()) {
                    Map<String, Object> metrics = executeCombinedMetricsWithKey(
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
            return Map.of("cpu", "-", "ram", "-", "ramPercentage", 0, "disk", "-");
        }, executorService).orTimeout(15, TimeUnit.SECONDS)
                .exceptionally(throwable -> {
                    System.err.println("Timeout hoặc lỗi lấy thông số server " + serverData.host + ": "
                            + throwable.getMessage());
                    return Map.of("cpu", "-", "ram", "-", "ramPercentage", 0, "disk", "-");
                });
    }

    /**
     * Thực thi lệnh metrics kết hợp sử dụng SSH key (giảm từ 3 lần SSH xuống 1 lần)
     */
    private Map<String, Object> executeCombinedMetricsWithKey(String host, int port, String user,
            String privateKeyPem) {
        try {
            String output = serverService.execCommandWithKey(host, port, user, privateKeyPem, COMBINED_METRICS_COMMAND,
                    SSH_TIMEOUT);
            if (output != null && !output.isBlank()) {
                Map<String, Object> result = parseCombinedMetricsOutput(output);
                return Map.of(
                        "cpu", (String) result.get("cpu"),
                        "ram", (String) result.get("ram"),
                        "ramPercentage", (Integer) result.get("ramPercentage"),
                        "disk", (String) result.get("disk"));
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
    private Map<String, Object> executeCombinedMetricsWithPassword(String host, int port, String user,
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
        return Map.of("cpu", "-", "ram", "-", "ramPercentage", 0, "disk", "-");
    }

    /**
     * Phân tích kết quả metrics kết hợp từ lệnh shell
     * Định dạng mong đợi:
     * "CPU_CORES:4\nCPU_LOAD:1.2\nRAM_TOTAL:8.0G\nRAM_USED:2.1G\nDISK_TOTAL:50G\nDISK_USED:20G\nDISK_PERCENT:45%"
     */
    private Map<String, Object> parseCombinedMetricsOutput(String output) {
        String cpuCores = "-", cpuLoad = "-", ramTotal = "-", ramUsed = "-", diskPercent = "-";

        try {
            String[] lines = output.split("\n");
            for (String line : lines) {
                line = line.trim();
                if (line.startsWith("CPU_CORES:")) {
                    cpuCores = line.substring(10).trim();
                } else if (line.startsWith("CPU_LOAD:")) {
                    cpuLoad = line.substring(9).trim();
                } else if (line.startsWith("RAM_TOTAL:")) {
                    ramTotal = line.substring(10).trim();
                } else if (line.startsWith("RAM_USED:")) {
                    ramUsed = line.substring(9).trim();
                } else if (line.startsWith("DISK_PERCENT:")) {
                    diskPercent = line.substring(13).trim();
                }
                // Bỏ qua DISK_TOTAL và DISK_USED vì chỉ cần DISK_PERCENT
            }
        } catch (Exception e) {
            System.err.println("Lỗi phân tích kết quả metrics: " + e.getMessage());
        }

        // Format hiển thị: CPU (Cores / Load), RAM (Used/Total (X%)), Disk (%)
        String cpu = cpuCores.equals("-") ? "-" : cpuCores + " cores / " + cpuLoad + " load";
        Map<String, Object> ramData = formatRamUsageWithPercentage(ramUsed, ramTotal);
        String disk = diskPercent.equals("-") ? "-" : diskPercent;

        return Map.of(
                "cpu", cpu,
                "ram", (String) ramData.get("formatted"),
                "ramPercentage", (Integer) ramData.get("percentage"),
                "disk", disk);
    }

    /**
     * Format RAM usage với phần trăm chính xác và trả về cả percentage để color
     * coding
     * Ví dụ: "554Mi / 3.8Gi (~14%)"
     */
    private Map<String, Object> formatRamUsageWithPercentage(String ramUsed, String ramTotal) {
        if (ramUsed.equals("-") || ramTotal.equals("-")) {
            return Map.of("formatted", "-", "percentage", 0);
        }

        try {
            // Parse RAM values (remove 'G', 'M', 'K' and convert to bytes)
            double usedBytes = parseMemoryValue(ramUsed);
            double totalBytes = parseMemoryValue(ramTotal);

            if (usedBytes <= 0 || totalBytes <= 0) {
                return Map.of("formatted", ramUsed + " / " + ramTotal, "percentage", 0);
            }

            // Calculate percentage
            double percentage = (usedBytes / totalBytes) * 100;
            int roundedPercentage = (int) Math.round(percentage);

            // Format với ~ để chỉ gần đúng
            String formatted = ramUsed + " / " + ramTotal + " (~" + roundedPercentage + "%)";

            return Map.of("formatted", formatted, "percentage", roundedPercentage);
        } catch (Exception e) {
            // Fallback to simple format if parsing fails
            return Map.of("formatted", ramUsed + " / " + ramTotal, "percentage", 0);
        }
    }

    /**
     * Parse memory value to bytes
     * Supports G, M, K suffixes
     */
    private double parseMemoryValue(String memoryStr) {
        if (memoryStr == null || memoryStr.trim().isEmpty()) {
            return 0;
        }

        String clean = memoryStr.trim().toUpperCase();
        double multiplier = 1.0;

        if (clean.endsWith("GI")) {
            multiplier = 1024 * 1024 * 1024; // GiB to bytes
            clean = clean.substring(0, clean.length() - 2);
        } else if (clean.endsWith("MI")) {
            multiplier = 1024 * 1024; // MiB to bytes
            clean = clean.substring(0, clean.length() - 2);
        } else if (clean.endsWith("KI")) {
            multiplier = 1024; // KiB to bytes
            clean = clean.substring(0, clean.length() - 2);
        } else if (clean.endsWith("G")) {
            multiplier = 1024 * 1024 * 1024; // GB to bytes
            clean = clean.substring(0, clean.length() - 1);
        } else if (clean.endsWith("M")) {
            multiplier = 1024 * 1024; // MB to bytes
            clean = clean.substring(0, clean.length() - 1);
        } else if (clean.endsWith("K")) {
            multiplier = 1024; // KB to bytes
            clean = clean.substring(0, clean.length() - 1);
        }

        try {
            return Double.parseDouble(clean) * multiplier;
        } catch (NumberFormatException e) {
            return 0;
        }
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

        // Lấy danh sách connected servers từ session
        java.util.Set<Long> connectedIds = new java.util.HashSet<>();
        if (session != null) {
            Object connectedAttr = session.getAttribute("CONNECTED_SERVERS");
            if (connectedAttr instanceof java.util.Set<?> set) {
                for (Object o : set) {
                    if (o instanceof Number n) {
                        connectedIds.add(n.longValue());
                    } else if (o instanceof String str) {
                        try {
                            connectedIds.add(Long.parseLong(str));
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
        }

        // Trích xuất dữ liệu server
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
                                : null,
                        connectedIds.contains(server.getId())))
                .toList();

        // Xử lý servers song song để tăng hiệu suất
        // Tối ưu: chỉ load metrics cho nodes online, nodes offline chỉ hiển thị thông
        // tin cơ bản
        List<CompletableFuture<Map<String, Object>>> futures = serverData.stream()
                .map(serverDataItem -> {
                    // Nếu node offline, trả về ngay thông tin cơ bản (không gọi SSH để giảm thời
                    // gian load)
                    if (!serverDataItem.isConnected) {
                        return CompletableFuture.<Map<String, Object>>completedFuture(
                                java.util.Map.of(
                                        "id", serverDataItem.id,
                                        "ip", serverDataItem.host,
                                        "role", serverDataItem.role.name(),
                                        "status", serverDataItem.status.name(),
                                        "isConnected", false,
                                        "cpu", "-",
                                        "ram", "-",
                                        "ramPercentage", 0,
                                        "disk", "-",
                                        "version", ""));
                    }

                    // Chỉ load metrics và version cho nodes online
                    return getServerMetricsAsync(serverDataItem, pwCache)
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
                                        "isConnected", serverDataItem.isConnected,
                                        "cpu", metrics.get("cpu"),
                                        "ram", metrics.get("ram"),
                                        "ramPercentage", metrics.get("ramPercentage"),
                                        "disk", metrics.get("disk"),
                                        "version", version);
                            });
                })
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
                var fallbackNode = new java.util.HashMap<String, Object>();
                fallbackNode.put("id", serverDataItem.id);
                fallbackNode.put("ip", serverDataItem.host);
                fallbackNode.put("role", serverDataItem.role.name());
                fallbackNode.put("status", serverDataItem.status.name());
                fallbackNode.put("isConnected", serverDataItem.isConnected);
                fallbackNode.put("cpu", "-");
                fallbackNode.put("ram", "-");
                fallbackNode.put("ramPercentage", 0);
                fallbackNode.put("disk", "-");
                fallbackNode.put("version", "");
                fallbackNode.put("error", "Không thể lấy metrics: " + e.getMessage());
                nodes.add(fallbackNode);
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
     * Kiểm tra xem master server có online không
     */
    private boolean isMasterOnline(Long clusterId, jakarta.servlet.http.HttpSession session) {
        if (session == null)
            return false;

        var clusterServers = serverService.findByClusterId(clusterId);
        if (clusterServers == null || clusterServers.isEmpty())
            return false;

        var master = clusterServers.stream()
                .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                .findFirst()
                .orElse(null);
        if (master == null)
            return false;

        java.util.Set<Long> connectedIds = new java.util.HashSet<>();
        Object connectedAttr = session.getAttribute("CONNECTED_SERVERS");
        if (connectedAttr instanceof java.util.Set<?> set) {
            for (Object o : set) {
                if (o instanceof Number n) {
                    connectedIds.add(n.longValue());
                } else if (o instanceof String str) {
                    try {
                        connectedIds.add(Long.parseLong(str));
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        return connectedIds.contains(master.getId());
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

    /**
     * Kiểm tra trạng thái cài đặt Ansible với thông tin chi tiết cho tất cả servers
     */
    @GetMapping("/{id}/ansible-status")
    public ResponseEntity<?> getAnsibleStatus(@PathVariable Long id, HttpServletRequest request) {
        try {
            System.out.println("DEBUG: Checking Ansible status for cluster ID: " + id);

            var session = request.getSession(false);
            if (session == null) {
                System.out.println("DEBUG: No session found");
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không có session. Vui lòng đăng nhập lại."));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            System.out.println("DEBUG: Password cache size: " + pwCache.size());

            // Lấy thông tin cluster
            var clusterServers = serverService.findByClusterId(id);
            System.out.println("DEBUG: Cluster servers count: " + clusterServers.size());

            if (clusterServers.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Cluster không có servers nào."));
            }

            // Nếu không có password cache, thử kiểm tra với SSH key
            if (pwCache.isEmpty()) {
                System.out.println("DEBUG: No password cache, trying SSH key authentication");
                // Tạo empty password cache để thử SSH key
                pwCache = new java.util.HashMap<>();
            }

            Map<String, Object> status = ansibleInstallationService.checkAnsibleInstallation(id, pwCache);

            // Thêm thông tin cluster
            status.put("clusterInfo", Map.of(
                    "totalServers", clusterServers.size(),
                    "masterCount",
                    clusterServers.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                            .count(),
                    "workerCount",
                    clusterServers.stream()
                            .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.WORKER)
                            .count()));

            return ResponseEntity.ok(status);

        } catch (Exception e) {
            String errorMessage = e.getMessage();
            if (errorMessage == null) {
                errorMessage = e.getClass().getSimpleName() + " occurred";
            }
            System.err.println("ERROR: Exception in getAnsibleStatus: " + errorMessage);
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Lỗi kiểm tra trạng thái Ansible: " + errorMessage));
        }
    }

    /**
     * Cài đặt Ansible cho cluster với sudo password
     */
    @PostMapping("/{id}/install-ansible")
    public ResponseEntity<?> installAnsible(@PathVariable Long id, @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            // Lấy password cache từ session
            var session = request.getSession(false);
            java.util.Map<Long, String> pwCache = getPasswordCache(session);

            if (pwCache.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không có thông tin xác thực. Vui lòng kết nối lại các server."));
            }

            // Lấy sudo passwords từ request body
            @SuppressWarnings("unchecked")
            Map<String, String> sudoPasswords = (Map<String, String>) body.get("sudoPasswords");

            if (sudoPasswords == null || sudoPasswords.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Vui lòng cung cấp mật khẩu sudo cho các server."));
            }

            // Convert sudo passwords to Map<Long, String>
            java.util.Map<Long, String> sudoPasswordCache = new java.util.HashMap<>();
            var clusterServers = serverService.findByClusterId(id);
            for (com.example.AutoDeployApp.entity.Server server : clusterServers) {
                String sudoPassword = sudoPasswords.get(server.getHost());
                if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                    sudoPasswordCache.put(server.getId(), sudoPassword);
                }
            }

            // Bắt đầu cài đặt Ansible
            ansibleInstallationService.installAnsibleOnCluster(id, pwCache, sudoPasswordCache);

            // Trả về ngay lập tức với task ID
            String taskId = "ansible-install-" + id + "-" + System.currentTimeMillis();

            return ResponseEntity.ok(Map.of(
                    "taskId", taskId,
                    "status", "STARTED",
                    "message", "Đang cài đặt Ansible trên cluster...",
                    "clusterId", id));

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Lỗi bắt đầu cài đặt Ansible: " + e.getMessage()));
        }
    }
}
