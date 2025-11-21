package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.service.ServerService;
import com.example.AutoDeployApp.service.AnsibleInstallationService;
import com.example.AutoDeployApp.service.KubernetesService;
import com.example.AutoDeployApp.service.K8sWorkloadsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import jakarta.annotation.PreDestroy;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.ContainerStatus;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.StatefulSet;
import io.fabric8.kubernetes.api.model.apps.DaemonSet;

@RestController
@RequestMapping("/admin/cluster")
public class ClusterAdminController {

    private static final Logger logger = LoggerFactory.getLogger(ClusterAdminController.class);

    private record ServerData(
            Long id,
            String host,
            int port,
            String username,
            String role,
            com.example.AutoDeployApp.entity.Server.ServerStatus status,
            String sshPrivateKey,
            boolean isConnected) {
    }

    private final ClusterService clusterService;
    private final ServerService serverService;
    private final AnsibleInstallationService ansibleInstallationService;
    private final KubernetesService kubernetesService;
    private final K8sWorkloadsService k8sWorkloadsService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(10);

    // Constants for timeouts and commands
    private static final int SSH_TIMEOUT = 10000; // Tăng timeout cho combined commands
    private static final int OVERVIEW_API_TIMEOUT_SECONDS = 30; // Timeout cho overview API calls (tăng từ 10s lên 30s để đủ thời gian cho lần đầu load)
    private static final String COMBINED_METRICS_COMMAND = "echo \"CPU_CORES:$(nproc)\"; " +
            "echo \"CPU_LOAD:$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')\"; " +
            "echo \"RAM_TOTAL:$(free -h | awk '/^Mem:/{print $2}')\"; " +
            "echo \"RAM_USED:$(free -h | awk '/^Mem:/{print $3}')\"; " +
            "echo \"DISK_PERCENT:$(df / | awk 'NR==2{print $5}')\"";
    private static final String KUBELET_VERSION_COMMAND = "kubelet --version 2>/dev/null | awk '{print $2}'";
    private static final String KUBEADM_VERSION_COMMAND = "kubeadm version -o short 2>/dev/null";

    public ClusterAdminController(ClusterService clusterService, ServerService serverService,
            AnsibleInstallationService ansibleInstallationService, KubernetesService kubernetesService,
            K8sWorkloadsService k8sWorkloadsService) {
        this.clusterService = clusterService;
        this.serverService = serverService;
        this.ansibleInstallationService = ansibleInstallationService;
        this.kubernetesService = kubernetesService;
        this.k8sWorkloadsService = k8sWorkloadsService;
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
     * Khởi tạo cấu trúc /etc/ansible trên MASTER của cluster duy nhất (không cần ID)
     * Body: { "host": optional, "sudoPassword": optional (nếu có sudo NOPASSWD) }
     */
    @PostMapping("/ansible/init/structure")
    public ResponseEntity<?> initAnsibleStructure(@RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;
            String sudoPassword = body != null ? (String) body.get("sudoPassword") : null;

            var servers = serverService.findByClusterStatus("AVAILABLE");
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
                    if ("MASTER".equals(s.getRole())) {
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
     * Lấy nodes data cho overview (nhanh - không cần SSH)
     * Trả về: nodesCount, masterCount, workerCount, recentNodes
     */
    @GetMapping("/overview/nodes")
    public ResponseEntity<?> getOverviewNodes() {
        logger.info("[Overview Nodes] Bat dau lay nodes...");
        System.out.println("[Overview Nodes] Bat dau lay nodes...");
        try {
            java.util.List<java.util.Map<String, Object>> k8sNodes = kubernetesService.getKubernetesNodes();
            logger.info("[Overview Nodes] K8s API tra ve {} nodes", k8sNodes != null ? k8sNodes.size() : 0);
            System.out.println("[Overview Nodes] K8s API tra ve " + (k8sNodes != null ? k8sNodes.size() : 0) + " nodes");
            
            if (k8sNodes == null || k8sNodes.isEmpty()) {
                logger.info("[Overview Nodes] Khong co nodes trong K8s cluster");
                System.out.println("[Overview Nodes] Khong co nodes trong K8s cluster");
                return ResponseEntity.ok(Map.of(
                        "nodesCount", 0,
                        "masterCount", 0L,
                        "workerCount", 0L,
                        "recentNodes", java.util.List.of()));
            }
            
            int nodesCount = k8sNodes.size();
            Map<String, Long> roleCounts = countMasterAndWorkerNodes(k8sNodes);
            long masterCount = roleCounts.get("masterCount");
            long workerCount = roleCounts.get("workerCount");
            
            logger.info("[Overview Nodes] Ket qua: nodesCount={}, masterCount={}, workerCount={}", 
                    nodesCount, masterCount, workerCount);
            System.out.println("[Overview Nodes] Ket qua: nodesCount=" + nodesCount + 
                    ", masterCount=" + masterCount + ", workerCount=" + workerCount);

            var recentNodes = k8sNodes.stream()
                    .limit(10)
                    .map(n -> {
                        String roleStr = "WORKER";
                        Object k8sRolesObj = n.get("k8sRoles");
                        if (k8sRolesObj instanceof java.util.List<?> k8sRoles && !k8sRoles.isEmpty()) {
                            String firstRole = String.valueOf(k8sRoles.get(0));
                            if ("master".equalsIgnoreCase(firstRole) || "control-plane".equalsIgnoreCase(firstRole)) {
                                roleStr = "MASTER";
                            } else if ("worker".equalsIgnoreCase(firstRole)) {
                                roleStr = "WORKER";
                            }
                        } else {
                            Object roleObj = n.get("role");
                            if (roleObj instanceof String role && !role.isBlank()) {
                                roleStr = role.toUpperCase();
                            }
                        }
                        
                        return java.util.Map.<String, Object>of(
                                "name", n.getOrDefault("name", n.getOrDefault("ip", "-")),
                                "role", roleStr,
                                "status", n.getOrDefault("k8sStatus", n.getOrDefault("status", "Unknown")));
                    })
                    .collect(java.util.stream.Collectors.toList());

            return ResponseEntity.ok(Map.of(
                    "nodesCount", nodesCount,
                    "masterCount", masterCount,
                    "workerCount", workerCount,
                    "recentNodes", recentNodes));
        } catch (Exception e) {
            logger.error("[Overview Nodes] Loi khi lay nodes tu K8s API: {}", e.getMessage());
            System.out.println("[Overview Nodes] Loi khi lay nodes tu K8s API: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.ok(Map.of(
                    "nodesCount", 0,
                    "masterCount", 0L,
                    "workerCount", 0L,
                    "recentNodes", java.util.List.of()));
        }
    }

    /**
     * Lấy workloads data cho overview (nhanh - từ K8s API)
     * Trả về: workloadsCount, recentWorkloads
     */
    @GetMapping("/overview/workloads")
    public ResponseEntity<?> getOverviewWorkloads() {
        try {
            io.fabric8.kubernetes.api.model.apps.DeploymentList deployments = null;
            io.fabric8.kubernetes.api.model.apps.StatefulSetList statefulSets = null;
            io.fabric8.kubernetes.api.model.apps.DaemonSetList daemonSets = null;
            
            CompletableFuture<io.fabric8.kubernetes.api.model.apps.DeploymentList> deploymentsFuture = null;
            CompletableFuture<io.fabric8.kubernetes.api.model.apps.StatefulSetList> statefulSetsFuture = null;
            CompletableFuture<io.fabric8.kubernetes.api.model.apps.DaemonSetList> daemonSetsFuture = null;
            
            try {
                deploymentsFuture = CompletableFuture.supplyAsync(() -> {
                    try {
                        return k8sWorkloadsService.getDeployments(null);
                    } catch (Exception e) {
                        logger.debug("Không lấy được Deployments: " + e.getMessage());
                        return null;
                    }
                }, executorService);
                
                statefulSetsFuture = CompletableFuture.supplyAsync(() -> {
                    try {
                        return k8sWorkloadsService.getStatefulSets(null);
                    } catch (Exception e) {
                        logger.debug("Không lấy được StatefulSets: " + e.getMessage());
                        return null;
                    }
                }, executorService);
                
                daemonSetsFuture = CompletableFuture.supplyAsync(() -> {
                    try {
                        return k8sWorkloadsService.getDaemonSets(null);
                    } catch (Exception e) {
                        logger.debug("Không lấy được DaemonSets: " + e.getMessage());
                        return null;
                    }
                }, executorService);
                
                CompletableFuture.allOf(deploymentsFuture, statefulSetsFuture, daemonSetsFuture)
                    .get(OVERVIEW_API_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                
                deployments = deploymentsFuture.get();
                statefulSets = statefulSetsFuture.get();
                daemonSets = daemonSetsFuture.get();
            } catch (java.util.concurrent.TimeoutException e) {
                logger.warn("[Overview Workloads] Timeout sau {} giây khi lấy workloads: {}", OVERVIEW_API_TIMEOUT_SECONDS, e.getMessage());
                System.out.println("[Overview Workloads] Timeout sau " + OVERVIEW_API_TIMEOUT_SECONDS + " giây khi lấy workloads: " + e.getMessage());
                // Lấy kết quả đã có (có thể null nếu chưa hoàn thành)
                try {
                    if (deploymentsFuture != null && deploymentsFuture.isDone()) {
                        deployments = deploymentsFuture.get();
                    }
                    if (statefulSetsFuture != null && statefulSetsFuture.isDone()) {
                        statefulSets = statefulSetsFuture.get();
                    }
                    if (daemonSetsFuture != null && daemonSetsFuture.isDone()) {
                        daemonSets = daemonSetsFuture.get();
                    }
                } catch (Exception ex) {
                    logger.debug("Không lấy được kết quả từ futures: " + ex.getMessage());
                }
            } catch (Exception e) {
                logger.warn("[Overview Workloads] Lỗi khi lấy workloads: " + e.getMessage());
                System.out.println("[Overview Workloads] Lỗi khi lấy workloads: " + e.getMessage());
            }
            
            int workloadsCount = 0;
            if (deployments != null) workloadsCount += deployments.getItems().size();
            if (statefulSets != null) workloadsCount += statefulSets.getItems().size();
            if (daemonSets != null) workloadsCount += daemonSets.getItems().size();

            java.util.List<java.util.Map<String, Object>> recentWorkloads = java.util.List.of();
            try {
                var workloadsList = new java.util.ArrayList<java.util.Map<String, Object>>();
                
                if (deployments != null) {
                    deployments.getItems().stream()
                            .forEach(dep -> workloadsList.add(convertWorkloadToOverviewMap(dep)));
                }
                
                if (statefulSets != null) {
                    statefulSets.getItems().stream()
                            .forEach(sts -> workloadsList.add(convertWorkloadToOverviewMap(sts)));
                }
                
                if (daemonSets != null) {
                    daemonSets.getItems().stream()
                            .forEach(ds -> workloadsList.add(convertWorkloadToOverviewMap(ds)));
                }
                
                recentWorkloads = workloadsList.stream().limit(10).collect(java.util.stream.Collectors.toList());
            } catch (Exception e) {
                logger.debug("Không lấy được recent workloads: " + e.getMessage());
            }

            return ResponseEntity.ok(Map.of(
                    "workloadsCount", workloadsCount,
                    "recentWorkloads", recentWorkloads));
        } catch (Exception e) {
            logger.error("Error getting overview workloads: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "workloadsCount", 0,
                    "recentWorkloads", java.util.List.of()));
        }
    }

    /**
     * Lấy pods và namespaces data cho overview (nhanh - từ K8s API)
     * Trả về: podsCount, runningPodsCount, namespacesCount
     */
    @GetMapping("/overview/pods-namespaces")
    public ResponseEntity<?> getOverviewPodsAndNamespaces() {
        try {
            io.fabric8.kubernetes.api.model.PodList pods = null;
            io.fabric8.kubernetes.api.model.NamespaceList namespaces = null;
            
            CompletableFuture<io.fabric8.kubernetes.api.model.PodList> podsFuture = null;
            CompletableFuture<io.fabric8.kubernetes.api.model.NamespaceList> namespacesFuture = null;
            
            try {
                podsFuture = CompletableFuture.supplyAsync(() -> {
                    try {
                        return k8sWorkloadsService.getPods(null);
                    } catch (Exception e) {
                        logger.debug("Không lấy được Pods: " + e.getMessage());
                        return null;
                    }
                }, executorService);
                
                namespacesFuture = CompletableFuture.supplyAsync(() -> {
                    try {
                        return kubernetesService.getNamespaces();
                    } catch (Exception e) {
                        logger.debug("Không lấy được Namespaces: " + e.getMessage());
                        return null;
                    }
                }, executorService);
                
                CompletableFuture.allOf(podsFuture, namespacesFuture)
                    .get(OVERVIEW_API_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                
                pods = podsFuture.get();
                namespaces = namespacesFuture.get();
            } catch (java.util.concurrent.TimeoutException e) {
                logger.warn("[Overview Pods/Namespaces] Timeout sau {} giây khi lấy pods/namespaces: {}", OVERVIEW_API_TIMEOUT_SECONDS, e.getMessage());
                System.out.println("[Overview Pods/Namespaces] Timeout sau " + OVERVIEW_API_TIMEOUT_SECONDS + " giây khi lấy pods/namespaces: " + e.getMessage());
                // Lấy kết quả đã có (có thể null nếu chưa hoàn thành)
                try {
                    if (podsFuture != null && podsFuture.isDone()) {
                        pods = podsFuture.get();
                    }
                    if (namespacesFuture != null && namespacesFuture.isDone()) {
                        namespaces = namespacesFuture.get();
                    }
                } catch (Exception ex) {
                    logger.debug("Không lấy được kết quả từ futures: " + ex.getMessage());
                }
            } catch (Exception e) {
                logger.warn("[Overview Pods/Namespaces] Lỗi khi lấy pods/namespaces: " + e.getMessage());
                System.out.println("[Overview Pods/Namespaces] Lỗi khi lấy pods/namespaces: " + e.getMessage());
            }
            
            int totalPodsCount = 0;
            int runningPodsCount = 0;
            if (pods != null) {
                totalPodsCount = pods.getItems().size();
                runningPodsCount = (int) pods.getItems().stream()
                        .filter(pod -> pod.getStatus() != null && 
                                "Running".equals(pod.getStatus().getPhase()))
                        .count();
            }
            
            int namespacesCount = 0;
            if (namespaces != null) {
                namespacesCount = namespaces.getItems().size();
            }

            return ResponseEntity.ok(Map.of(
                    "podsCount", totalPodsCount,
                    "runningPodsCount", runningPodsCount,
                    "namespacesCount", namespacesCount));
        } catch (Exception e) {
            logger.error("Error getting overview pods/namespaces: {}", e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "podsCount", 0,
                    "runningPodsCount", 0,
                    "namespacesCount", 0));
        }
    }

    /**
     * Lấy resource usage data cho overview từ Kubernetes Metrics API (nhanh - không cần SSH)
     * Fallback về SSH nếu Metrics API không available
     * Chỉ hiển thị Resource Usage khi có nodes trong cluster
     * Trả về: resourceUsage (cpu, ram, disk)
     */
    @GetMapping("/overview/resource-usage")
    public ResponseEntity<?> getOverviewResourceUsage(HttpServletRequest request) {
        Map<String, Double> resourceUsage = Map.of("cpu", 0.0, "ram", 0.0, "disk", 0.0);
        String reason = "";
        
        // Kiểm tra xem có nodes trong K8s cluster không trước khi lấy Resource Usage
        // Chỉ kiểm tra từ K8s API, không fallback về database
        try {
            java.util.List<java.util.Map<String, Object>> k8sNodes = kubernetesService.getKubernetesNodes();
            if (k8sNodes == null || k8sNodes.isEmpty()) {
                reason = "Khong co nodes trong K8s cluster (k8sNodes = " + (k8sNodes == null ? "null" : "empty") + ")";
                logger.info("[Resource Usage] " + reason);
                System.out.println("[Resource Usage] " + reason);
                return ResponseEntity.ok(Map.of("resourceUsage", resourceUsage, "reason", reason));
            }
            logger.info("[Resource Usage] Tim thay {} nodes tu K8s API", k8sNodes.size());
            System.out.println("[Resource Usage] Tim thay " + k8sNodes.size() + " nodes tu K8s API");
        } catch (Exception e) {
            reason = "Khong ket noi duoc K8s API hoac khong co nodes: " + e.getMessage();
            logger.info("[Resource Usage] " + reason);
            System.out.println("[Resource Usage] " + reason);
            e.printStackTrace();
            return ResponseEntity.ok(Map.of("resourceUsage", resourceUsage, "reason", reason));
        }
        
        // Ưu tiên lấy từ Kubernetes Metrics API (nhanh hơn, chính xác hơn)
        try {
            logger.info("[Resource Usage] Dang lay metrics tu K8s Metrics API...");
            System.out.println("[Resource Usage] Dang lay metrics tu K8s Metrics API...");
            resourceUsage = kubernetesService.calculateClusterResourceUsageFromMetrics();
            
            logger.info("[Resource Usage] Metrics API tra ve: CPU={}%, RAM={}%, Disk={}%", 
                    resourceUsage.get("cpu"), resourceUsage.get("ram"), resourceUsage.get("disk"));
            System.out.println("[Resource Usage] Metrics API tra ve: CPU=" + resourceUsage.get("cpu") + 
                    "%, RAM=" + resourceUsage.get("ram") + "%, Disk=" + resourceUsage.get("disk") + "%");
            
            // Nếu Metrics API trả về dữ liệu hợp lệ (không phải tất cả 0), sử dụng nó
            // Disk không có trong Metrics API, cần lấy từ SSH fallback
            if (resourceUsage.get("cpu") > 0.0 || resourceUsage.get("ram") > 0.0) {
                logger.info("[Resource Usage] Metrics API co du lieu hop le, lay disk tu SSH...");
                System.out.println("[Resource Usage] Metrics API co du lieu hop le, lay disk tu SSH...");
                // Lấy disk usage từ SSH fallback nếu cần
                double diskUsage = getDiskUsageFromSSH(request);
                logger.info("[Resource Usage] Disk usage tu SSH: {}%", diskUsage);
                System.out.println("[Resource Usage] Disk usage tu SSH: " + diskUsage + "%");
                if (diskUsage > 0.0) {
                    resourceUsage = Map.of(
                            "cpu", resourceUsage.get("cpu"),
                            "ram", resourceUsage.get("ram"),
                            "disk", diskUsage);
                }
                reason = "Lay tu K8s Metrics API thanh cong";
                return ResponseEntity.ok(Map.of("resourceUsage", resourceUsage, "reason", reason));
            } else {
                reason = "Metrics API tra ve tat ca 0 (CPU=" + resourceUsage.get("cpu") + 
                        "%, RAM=" + resourceUsage.get("ram") + "%), se fallback ve SSH";
                logger.info("[Resource Usage] " + reason);
                System.out.println("[Resource Usage] " + reason);
            }
        } catch (Exception e) {
            reason = "Khong lay duoc metrics tu K8s Metrics API: " + e.getMessage();
            logger.info("[Resource Usage] " + reason);
            System.out.println("[Resource Usage] " + reason);
            e.printStackTrace();
        }
        
        // Fallback về SSH nếu Metrics API không available hoặc không có dữ liệu
        // Chỉ fallback khi đã có nodes trong cluster (đã kiểm tra ở trên)
        try {
            var servers = serverService.findByClusterStatus("AVAILABLE");
            logger.info("[Resource Usage] Fallback SSH: Tim thay {} servers voi clusterStatus=AVAILABLE", 
                    servers != null ? servers.size() : 0);
            System.out.println("[Resource Usage] Fallback SSH: Tim thay " + 
                    (servers != null ? servers.size() : 0) + " servers voi clusterStatus=AVAILABLE");
            
            if (servers != null && !servers.isEmpty()) {
                var session = request.getSession(false);
                java.util.Map<Long, String> pwCache = getPasswordCache(session);
                java.util.Set<Long> connectedIds = getConnectedServerIds(session);
                java.util.List<ServerData> serverDataList = createServerDataList(servers, connectedIds, 5);
                
                logger.info("[Resource Usage] Fallback SSH: Tạo được {} ServerData để lấy metrics", 
                        serverDataList.size());
                System.out.println("[Resource Usage] Fallback SSH: Tạo được " + 
                        serverDataList.size() + " ServerData để lấy metrics");
                
                if (!serverDataList.isEmpty()) {
                    java.util.List<CompletableFuture<Map<String, Object>>> metricsFutures = serverDataList.stream()
                            .map(serverData -> getServerMetricsAsync(serverData, pwCache))
                            .collect(java.util.stream.Collectors.toList());
                    
                    java.util.List<Map<String, Object>> metricsList = new java.util.ArrayList<>();
                    for (var future : metricsFutures) {
                        try {
                            Map<String, Object> metrics = future.get(OVERVIEW_API_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                            metricsList.add(metrics);
                        } catch (java.util.concurrent.TimeoutException e) {
                            logger.warn("[Resource Usage] Timeout lấy metrics cho overview sau {} giây: {}", OVERVIEW_API_TIMEOUT_SECONDS, e.getMessage());
                            System.out.println("[Resource Usage] Timeout lấy metrics cho overview sau " + OVERVIEW_API_TIMEOUT_SECONDS + " giây: " + e.getMessage());
                        } catch (Exception e) {
                            logger.warn("[Resource Usage] Lỗi lấy metrics cho overview: {}", e.getMessage());
                            System.out.println("[Resource Usage] Lỗi lấy metrics cho overview: " + e.getMessage());
                        }
                    }
                    
                    logger.info("[Resource Usage] Fallback SSH: Thu thập được {} metrics", metricsList.size());
                    System.out.println("[Resource Usage] Fallback SSH: Thu thập được " + 
                            metricsList.size() + " metrics");
                    
                    if (!metricsList.isEmpty()) {
                        resourceUsage = calculateAverageResourceUsage(metricsList);
                        reason = "Lấy từ SSH fallback thành công (" + metricsList.size() + " servers)";
                        logger.info("[Resource Usage] SSH fallback trả về: CPU={}%, RAM={}%, Disk={}%", 
                                resourceUsage.get("cpu"), resourceUsage.get("ram"), resourceUsage.get("disk"));
                        System.out.println("[Resource Usage] SSH fallback trả về: CPU=" + resourceUsage.get("cpu") + 
                                "%, RAM=" + resourceUsage.get("ram") + "%, Disk=" + resourceUsage.get("disk") + "%");
                    } else {
                        reason = "SSH fallback không thu thập được metrics nào";
                        logger.warn("[Resource Usage] " + reason);
                        System.out.println("[Resource Usage] " + reason);
                    }
                } else {
                    reason = "Không tạo được ServerData nào (có thể servers không online hoặc không connected)";
                    logger.warn("[Resource Usage] " + reason);
                    System.out.println("[Resource Usage] " + reason);
                }
            } else {
                reason = "Không có servers nào với clusterStatus=AVAILABLE";
                logger.warn("[Resource Usage] " + reason);
                System.out.println("[Resource Usage] " + reason);
            }
        } catch (Exception e) {
            reason = "Lỗi khi fallback về SSH: " + e.getMessage();
            logger.error("[Resource Usage] " + reason, e);
            System.out.println("[Resource Usage] " + reason);
            e.printStackTrace();
        }
        
        logger.info("[Resource Usage] Kết quả cuối cùng: CPU={}%, RAM={}%, Disk={}% | Lý do: {}", 
                resourceUsage.get("cpu"), resourceUsage.get("ram"), resourceUsage.get("disk"), reason);
        System.out.println("[Resource Usage] Kết quả cuối cùng: CPU=" + resourceUsage.get("cpu") + 
                "%, RAM=" + resourceUsage.get("ram") + "%, Disk=" + resourceUsage.get("disk") + 
                "% | Lý do: " + reason);
        
        return ResponseEntity.ok(Map.of("resourceUsage", resourceUsage, "reason", reason));
    }

    /**
     * Helper method để lấy disk usage từ SSH (fallback khi Metrics API không có disk)
     */
    private double getDiskUsageFromSSH(HttpServletRequest request) {
        try {
            var servers = serverService.findByClusterStatus("AVAILABLE");
            if (servers == null || servers.isEmpty()) {
                return 0.0;
            }
            
            var session = request.getSession(false);
            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            java.util.Set<Long> connectedIds = getConnectedServerIds(session);
            java.util.List<ServerData> serverDataList = createServerDataList(servers, connectedIds, 3); // Chỉ lấy 3 servers để nhanh
            
            if (serverDataList.isEmpty()) {
                return 0.0;
            }
            
            java.util.List<CompletableFuture<Map<String, Object>>> metricsFutures = serverDataList.stream()
                    .map(serverData -> getServerMetricsAsync(serverData, pwCache))
                    .collect(java.util.stream.Collectors.toList());
            
            double totalDiskUsage = 0.0;
            int diskNodeCount = 0;
            
            for (var future : metricsFutures) {
                try {
                    Map<String, Object> metrics = future.get(5, TimeUnit.SECONDS);
                    String diskStr = (String) metrics.get("disk");
                    if (diskStr != null && !diskStr.equals("-")) {
                        Double diskPct = parseDiskUsagePercentage(diskStr);
                        if (diskPct != null) {
                            totalDiskUsage += diskPct;
                            diskNodeCount++;
                        }
                    }
                } catch (Exception e) {
                    // Ignore errors
                }
            }
            
            return diskNodeCount > 0 ? totalDiskUsage / diskNodeCount : 0.0;
        } catch (Exception e) {
            logger.debug("Không lấy được disk usage từ SSH: " + e.getMessage());
            return 0.0;
        }
    }

    // ===================== Helper Methods for Common Operations =====================

    /**
     * Đếm master và worker nodes từ danh sách nodes
     * @return Map với keys: "masterCount", "workerCount"
     */
    private Map<String, Long> countMasterAndWorkerNodes(java.util.List<java.util.Map<String, Object>> nodes) {
        long masterCount = nodes.stream()
                .filter(n -> {
                    Object k8sRolesObj = n.get("k8sRoles");
                    if (k8sRolesObj instanceof java.util.List<?> k8sRoles) {
                        return k8sRoles.stream().anyMatch(r -> 
                            "master".equalsIgnoreCase(String.valueOf(r)) || 
                            "control-plane".equalsIgnoreCase(String.valueOf(r)));
                    }
                    String role = (String) n.get("role");
                    return "MASTER".equalsIgnoreCase(role);
                })
                .count();

        long workerCount = nodes.stream()
                .filter(n -> {
                    Object k8sRolesObj = n.get("k8sRoles");
                    if (k8sRolesObj instanceof java.util.List<?> k8sRoles) {
                        boolean isMaster = k8sRoles.stream().anyMatch(r -> 
                            "master".equalsIgnoreCase(String.valueOf(r)) || 
                            "control-plane".equalsIgnoreCase(String.valueOf(r)));
                        if (isMaster) {
                            return false;
                        }
                        boolean hasWorker = k8sRoles.stream().anyMatch(r -> 
                            "worker".equalsIgnoreCase(String.valueOf(r)));
                        return k8sRoles.isEmpty() || hasWorker;
                    }
                    String role = (String) n.get("role");
                    if ("MASTER".equalsIgnoreCase(role)) {
                        return false;
                    }
                    return true;
                })
                .count();

        return Map.of("masterCount", masterCount, "workerCount", workerCount);
    }

    /**
     * Lấy danh sách connected server IDs từ session
     */
    private java.util.Set<Long> getConnectedServerIds(jakarta.servlet.http.HttpSession session) {
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
        return connectedIds;
    }

    /**
     * Tạo danh sách ServerData từ servers, chỉ lấy các server online và connected
     */
    private java.util.List<ServerData> createServerDataList(
            java.util.List<com.example.AutoDeployApp.entity.Server> servers,
            java.util.Set<Long> connectedIds,
            int limit) {
        return servers.stream()
                .filter(s -> connectedIds.contains(s.getId()) && 
                        s.getStatus() == com.example.AutoDeployApp.entity.Server.ServerStatus.ONLINE)
                .map(s -> new ServerData(
                        s.getId(),
                        s.getHost(),
                        s.getPort() != null ? s.getPort() : 22,
                        s.getUsername(),
                        s.getRole(),
                        s.getStatus(),
                        s.getSshKey() != null && s.getSshKey().getEncryptedPrivateKey() != null
                                ? s.getSshKey().getEncryptedPrivateKey()
                                : null,
                        true))
                .limit(limit)
                .collect(java.util.stream.Collectors.toList());
    }

    /**
     * Parse CPU usage percentage từ string "4 cores / 1.2 load"
     * @return percentage (0-100) hoặc null nếu không parse được
     */
    private Double parseCpuUsagePercentage(String cpuStr) {
        if (cpuStr == null || cpuStr.equals("-")) {
            return null;
        }
        try {
            String[] parts = cpuStr.split(" / ");
            if (parts.length == 2) {
                String coresStr = parts[0].replace(" cores", "").trim();
                String loadStr = parts[1].replace(" load", "").trim();
                double cores = Double.parseDouble(coresStr);
                double load = Double.parseDouble(loadStr);
                if (cores > 0) {
                    return Math.min(100, (load / cores) * 100);
                }
            }
        } catch (Exception e) {
            // Ignore parsing errors
        }
        return null;
    }

    /**
     * Parse Disk usage percentage từ string "65%"
     * @return percentage (0-100) hoặc null nếu không parse được
     */
    private Double parseDiskUsagePercentage(String diskStr) {
        if (diskStr == null || diskStr.equals("-")) {
            return null;
        }
        try {
            String diskClean = diskStr.trim();
            if (diskClean.endsWith("%")) {
                return Double.parseDouble(diskClean.replace("%", "").trim());
            }
        } catch (Exception e) {
            // Ignore parsing errors
        }
        return null;
    }

    /**
     * Thêm usage metrics vào node từ metrics Map
     */
    private void addUsageMetricsToNode(java.util.Map<String, Object> node, Map<String, Object> metrics) {
        // CPU usage
        String cpuStr = (String) metrics.get("cpu");
        if (cpuStr != null && !cpuStr.equals("-")) {
            node.put("cpuUsage", cpuStr);
            Double cpuPct = parseCpuUsagePercentage(cpuStr);
            if (cpuPct != null) {
                node.put("cpuUsagePercent", cpuPct);
            }
        }

        // RAM usage
        String ramStr = (String) metrics.get("ram");
        Object ramPctObj = metrics.get("ramPercentage");
        if (ramStr != null && !ramStr.equals("-")) {
            node.put("ramUsage", ramStr);
        }
        if (ramPctObj instanceof Integer ramPct && ramPct >= 0) {
            node.put("ramUsagePercent", ramPct);
        } else if (ramPctObj instanceof Number ramPctNum) {
            node.put("ramUsagePercent", ramPctNum.intValue());
        }

        // Disk usage
        String diskStr = (String) metrics.get("disk");
        if (diskStr != null && !diskStr.equals("-")) {
            node.put("diskUsage", diskStr);
            Double diskPct = parseDiskUsagePercentage(diskStr);
            if (diskPct != null) {
                node.put("diskUsagePercent", diskPct);
            }
        }
    }

    /**
     * Tính resource usage trung bình từ danh sách metrics
     * @return Map với keys: "cpu", "ram", "disk" (percentages)
     */
    private Map<String, Double> calculateAverageResourceUsage(
            java.util.List<Map<String, Object>> metricsList) {
        double totalCpuUsage = 0;
        double totalRamUsage = 0;
        double totalDiskUsage = 0;
        int cpuNodeCount = 0;
        int ramNodeCount = 0;
        int diskNodeCount = 0;

        for (Map<String, Object> metrics : metricsList) {
            // Parse CPU
            String cpuStr = (String) metrics.get("cpu");
            if (cpuStr != null && !cpuStr.equals("-")) {
                Double cpuPct = parseCpuUsagePercentage(cpuStr);
                if (cpuPct != null) {
                    totalCpuUsage += cpuPct;
                    cpuNodeCount++;
                }
            }

            // Parse RAM
            Object ramPctObj = metrics.get("ramPercentage");
            if (ramPctObj instanceof Integer ramPct && ramPct >= 0) {
                totalRamUsage += ramPct;
                ramNodeCount++;
            } else if (ramPctObj instanceof Number ramPctNum) {
                totalRamUsage += ramPctNum.doubleValue();
                ramNodeCount++;
            }

            // Parse Disk
            String diskStr = (String) metrics.get("disk");
            if (diskStr != null && !diskStr.equals("-")) {
                Double diskPct = parseDiskUsagePercentage(diskStr);
                if (diskPct != null) {
                    totalDiskUsage += diskPct;
                    diskNodeCount++;
                }
            }
        }

        double cpuUsagePercent = cpuNodeCount > 0 ? totalCpuUsage / cpuNodeCount : 0;
        double ramUsagePercent = ramNodeCount > 0 ? totalRamUsage / ramNodeCount : 0;
        double diskUsagePercent = diskNodeCount > 0 ? totalDiskUsage / diskNodeCount : 0;

        return Map.of("cpu", cpuUsagePercent, "ram", ramUsagePercent, "disk", diskUsagePercent);
    }

    // ===================== End Helper Methods =====================

    /**
     * Lấy danh sách node từ Kubernetes API cho cluster duy nhất (không cần ID)
     * Ready/NotReady, IP nội bộ, version, và usage metrics từ SSH
     */
    @GetMapping("/k8s/nodes")
    public ResponseEntity<?> getKubernetesNodes(HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            java.util.List<java.util.Map<String, Object>> nodes = kubernetesService.getKubernetesNodes();
            
            // Thêm usage metrics từ SSH cho mỗi node
            try {
                // Lấy servers từ database
                var servers = serverService.findByClusterStatus("AVAILABLE");
                if (servers != null && !servers.isEmpty()) {
                    // Lấy password cache từ session
                    var session = request.getSession(false);
                    java.util.Map<Long, String> pwCache = getPasswordCache(session);
                    
                    // Tạo map để match node theo IP
                    Map<String, com.example.AutoDeployApp.entity.Server> serverByIP = new java.util.HashMap<>();
                    for (var server : servers) {
                        if (server.getHost() != null && !server.getHost().isBlank()) {
                            serverByIP.put(server.getHost(), server);
                        }
                    }
                    
                    // Tối ưu: Lấy metrics cho tất cả nodes song song thay vì tuần tự
                    java.util.List<java.util.Map.Entry<java.util.Map<String, Object>, CompletableFuture<Map<String, Object>>>> nodeMetricsFutures = 
                            new java.util.ArrayList<>();
                    
                    // Tạo futures cho tất cả nodes cần lấy metrics
                    for (var node : nodes) {
                        String nodeIP = (String) node.get("k8sInternalIP");
                        if (nodeIP != null && !nodeIP.isBlank()) {
                            com.example.AutoDeployApp.entity.Server server = serverByIP.get(nodeIP);
                            if (server != null && server.getStatus() == com.example.AutoDeployApp.entity.Server.ServerStatus.ONLINE) {
                                // Tạo ServerData và CompletableFuture
                                ServerData serverData = new ServerData(
                                    server.getId(),
                                    server.getHost(),
                                    server.getPort() != null ? server.getPort() : 22,
                                    server.getUsername(),
                                    server.getRole(),
                                    server.getStatus(),
                                    server.getSshKey() != null && server.getSshKey().getEncryptedPrivateKey() != null
                                            ? server.getSshKey().getEncryptedPrivateKey()
                                            : null,
                                    true
                                );
                                
                                CompletableFuture<Map<String, Object>> metricsFuture = getServerMetricsAsync(serverData, pwCache);
                                nodeMetricsFutures.add(java.util.Map.entry(node, metricsFuture));
                            }
                        }
                    }
                    
                    // Chờ tất cả futures hoàn thành với timeout (tối ưu: timeout ngắn hơn vì đã parallelize)
                    int timeoutSeconds = Math.max(5, Math.min(10, nodeMetricsFutures.size())); // 5-10 giây tùy số lượng nodes
                    try {
                        CompletableFuture.allOf(nodeMetricsFutures.stream()
                                .map(entry -> entry.getValue())
                                .toArray(CompletableFuture[]::new))
                                .get(timeoutSeconds, TimeUnit.SECONDS);
                    } catch (java.util.concurrent.TimeoutException e) {
                        logger.warn("[Nodes] Timeout sau {} giây khi lấy metrics cho {} nodes", timeoutSeconds, nodeMetricsFutures.size());
                    } catch (Exception e) {
                        logger.debug("Lỗi khi chờ metrics futures: " + e.getMessage());
                    }
                    
                    // Lấy kết quả từ các futures đã hoàn thành
                    for (var entry : nodeMetricsFutures) {
                        var node = entry.getKey();
                        var metricsFuture = entry.getValue();
                        try {
                            if (metricsFuture.isDone()) {
                                Map<String, Object> metrics = metricsFuture.get();
                                addUsageMetricsToNode(node, metrics);
                            }
                        } catch (Exception e) {
                            // Bỏ qua nếu future chưa hoàn thành hoặc có lỗi
                            logger.debug("Không lấy được metrics cho node " + node.get("k8sInternalIP") + ": " + e.getMessage());
                        }
                    }
                }
            } catch (Exception e) {
                // Nếu không lấy được metrics, vẫn trả về nodes (chỉ không có usage)
                logger.debug("Không lấy được usage metrics: " + e.getMessage());
            }
            
            return ResponseEntity.ok(Map.of("nodes", nodes));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            // Handle specific Kubernetes API errors
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable - Master may be NOTREADY",
                        "nodes", java.util.List.of()));
            }
            logger.error("KubernetesClientException when getting nodes: {}", e.getMessage(), e);
            // Trả về empty list thay vì 500 error
            return ResponseEntity.ok(Map.of("nodes", java.util.List.of()));
        } catch (Exception e) {
            logger.error("Exception when getting nodes: {}", e.getMessage(), e);
            // Trả về empty list thay vì 500 error để frontend vẫn hoạt động
            return ResponseEntity.ok(Map.of("nodes", java.util.List.of()));
        }
    }

    /**
     * Lấy chi tiết node theo tên (không cần ID - cho cluster duy nhất)
     * Có thể trả về YAML nếu có format=yaml
     */
    @GetMapping("/k8s/nodes/{name}")
    public ResponseEntity<?> describeNode(@PathVariable String name,
            HttpServletRequest request) {
        try {
            var node = kubernetesService.getNode(name);
            if (node == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Node not found: " + name));
            }
            String formatParam = request.getParameter("format");
            if (formatParam != null && formatParam.equalsIgnoreCase("yaml")) {
                String yamlOutput = convertToYaml(node);
                return ResponseEntity.ok(Map.of("output", yamlOutput, "format", "yaml"));
            }
            // Parse node thành Map format (giống như getKubernetesNodes)
            java.util.Map<String, Object> nodeMap = kubernetesService.getKubernetesNodes().stream()
                    .filter(n -> name.equals(n.get("name")))
                    .findFirst()
                    .orElse(null);
            if (nodeMap == null) {
                // Nếu không tìm thấy trong list, parse trực tiếp từ Node object
                var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(node);
                return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
            }
            return ResponseEntity.ok(Map.of("node", nodeMap));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "Node not found: " + name));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe node: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Lấy pods trên node cụ thể (không cần ID - cho cluster duy nhất)
     * Supports optional namespace query parameter to filter pods
     */
    @GetMapping("/k8s/pods")
    public ResponseEntity<?> listPods(
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String node,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var podList = k8sWorkloadsService.getPods(namespace);
            java.util.List<java.util.Map<String, Object>> result = podList.getItems().stream()
                    .map(pod -> parsePodToMap(pod))
                    .filter(pod -> {
                        // Filter theo node nếu có tham số node
                        if (node != null && !node.isBlank()) {
                            String podNode = (String) pod.get("node");
                            return node.equals(podNode);
                        }
                        return true;
                    })
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("pods", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "pods", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get pods: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Liệt kê namespaces cho cluster duy nhất (không cần ID)
     */
	@GetMapping("/k8s/namespaces")
	public ResponseEntity<?> listNamespaces(HttpServletRequest request) {
        try {
            // Tối ưu: Lấy tất cả dữ liệu một lần thay vì gọi API cho từng namespace
            var namespaceList = kubernetesService.getNamespaces();
            var namespaceItems = namespaceList != null && namespaceList.getItems() != null
                    ? namespaceList.getItems()
                    : java.util.Collections.<io.fabric8.kubernetes.api.model.Namespace>emptyList();

            // Lấy tất cả pods một lần (từ tất cả namespaces)
            java.util.Map<String, Integer> podsCountByNamespace = new java.util.HashMap<>();
            try {
                io.fabric8.kubernetes.api.model.PodList allPods = k8sWorkloadsService.getPods(null); // null = lấy tất cả pods
                if (allPods != null && allPods.getItems() != null) {
                    // Group pods theo namespace
                    java.util.Map<String, Integer> tempMap = allPods.getItems().stream()
                            .filter(pod -> pod.getMetadata() != null && pod.getMetadata().getNamespace() != null)
                            .collect(java.util.stream.Collectors.groupingBy(
                                    pod -> pod.getMetadata().getNamespace(),
                                    java.util.stream.Collectors.collectingAndThen(
                                            java.util.stream.Collectors.counting(),
                                            Long::intValue)));
                    podsCountByNamespace.putAll(tempMap);
                }
            } catch (Exception e) {
                logger.debug("Không lấy được pods: " + e.getMessage());
            }

            // Lấy tất cả pod metrics một lần (từ tất cả namespaces)
            java.util.Map<String, Map<String, Double>> metricsByNamespace = new java.util.HashMap<>();
            try {
                var allPodMetrics = kubernetesService.getPodMetrics(null); // null = lấy tất cả metrics
                if (allPodMetrics != null && !allPodMetrics.isEmpty()) {
                    // Group metrics theo namespace và tính tổng CPU/RAM
                    java.util.Map<String, java.util.List<io.fabric8.kubernetes.api.model.metrics.v1beta1.PodMetrics>> metricsGrouped = 
                            allPodMetrics.stream()
                                    .filter(pm -> pm.getMetadata() != null && pm.getMetadata().getNamespace() != null)
                                    .collect(java.util.stream.Collectors.groupingBy(
                                            pm -> pm.getMetadata().getNamespace()));
                    
                    for (var entry : metricsGrouped.entrySet()) {
                        String nsName = entry.getKey();
                        var podMetricsList = entry.getValue();
                        
                        double totalCpuNanoCores = 0.0;
                        double totalMemoryBytes = 0.0;
                        
                        for (var podMetric : podMetricsList) {
                            var containers = podMetric.getContainers();
                            if (containers != null) {
                                for (var container : containers) {
                                    var usage = container.getUsage();
                                    if (usage != null) {
                                        // CPU usage (nano cores)
                                        var cpuUsage = usage.get("cpu");
                                        if (cpuUsage != null) {
                                            try {
                                                String cpuStr = cpuUsage.getAmount();
                                                // Parse quantity: "100m" = 0.1 cores = 100000000 nano cores, "1" = 1000000000 nano cores
                                                if (cpuStr != null && !cpuStr.isBlank()) {
                                                    cpuStr = cpuStr.trim();
                                                    if (cpuStr.endsWith("m")) {
                                                        double millicores = Double.parseDouble(cpuStr.substring(0, cpuStr.length() - 1));
                                                        totalCpuNanoCores += millicores * 1_000_000.0;
                                                    } else {
                                                        double cores = Double.parseDouble(cpuStr);
                                                        totalCpuNanoCores += cores * 1_000_000_000.0;
                                                    }
                                                }
                                            } catch (Exception e) {
                                                logger.debug("Khong parse duoc CPU usage cho pod {}: {}", 
                                                        podMetric.getMetadata().getName(), e.getMessage());
                                            }
                                        }
                                        
                                        // Memory usage (bytes)
                                        var memoryUsage = usage.get("memory");
                                        if (memoryUsage != null) {
                                            try {
                                                String memoryStr = memoryUsage.getAmount();
                                                // Parse quantity: "1Gi" = 1073741824 bytes, "512Mi" = 536870912 bytes, "1K" = 1024 bytes
                                                if (memoryStr != null && !memoryStr.isBlank()) {
                                                    memoryStr = memoryStr.trim();
                                                    double bytes = parseQuantityToBytes(memoryStr);
                                                    totalMemoryBytes += bytes;
                                                }
                                            } catch (Exception e) {
                                                logger.debug("Khong parse duoc Memory usage cho pod {}: {}", 
                                                        podMetric.getMetadata().getName(), e.getMessage());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Convert nano cores sang cores
                        double totalCpuCores = totalCpuNanoCores / 1_000_000_000.0;
                        // Đảm bảo giá trị cores hợp lệ (không phải nano cores)
                        if (totalCpuCores > 1000) {
                            // Nếu giá trị lớn hơn 1000, có thể đã là nano cores, convert lại
                            logger.warn("[Namespaces] CPU value too large for namespace {}: {}, converting from nano cores", nsName, totalCpuCores);
                            totalCpuCores = totalCpuNanoCores / 1_000_000_000.0;
                        }
                        metricsByNamespace.put(nsName, Map.of("cpu", totalCpuCores, "ram", totalMemoryBytes));
                    }
                }
            } catch (Exception e) {
                logger.debug("Khong lay duoc pod metrics: " + e.getMessage());
            }

            // Map namespaces với dữ liệu đã lấy
            java.util.List<java.util.Map<String, Object>> result = namespaceItems.stream()
                    .map(ns -> {
                        String namespaceName = ns.getMetadata() != null ? ns.getMetadata().getName() : "";
                        java.util.Map<String, Object> map = new java.util.HashMap<>();
                        map.put("name", namespaceName);
                        map.put("status", ns.getStatus() != null ? ns.getStatus().getPhase() : "Unknown");
                        
                        // Age calculation
                        String age = "";
                        if (ns.getMetadata() != null && ns.getMetadata().getCreationTimestamp() != null) {
                            age = calculateAge(ns.getMetadata().getCreationTimestamp().toString());
                        }
                        map.put("age", age);
                        
                        // Get pods count từ map đã tính
                        int podsCount = podsCountByNamespace.getOrDefault(namespaceName, 0);
                        map.put("pods", podsCount);
                        
                        // Lấy CPU và RAM usage từ map đã tính
                        var metrics = metricsByNamespace.get(namespaceName);
                        double cpuUsageCores = 0.0;
                        double ramUsageBytes = 0.0;
                        if (metrics != null) {
                            cpuUsageCores = metrics.get("cpu") != null ? metrics.get("cpu") : 0.0;
                            ramUsageBytes = metrics.get("ram") != null ? metrics.get("ram") : 0.0;
                        }
                        
                        // CPU: đã được convert sang cores (từ nano cores)
                        map.put("cpu", cpuUsageCores);
                        // RAM: convert bytes sang Mi (để hiển thị dễ đọc hơn)
                        double ramUsageMi = ramUsageBytes / (1024.0 * 1024.0);
                        map.put("ram", ramUsageMi);
                        return map;
                    })
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("namespaces", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "namespaces", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get namespaces: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/namespaces/{name}")
    public ResponseEntity<?> describeNamespace(HttpServletRequest request,
            @PathVariable String name) {
        return describeNamespaceInternal(name, request);
    }


    private ResponseEntity<?> describeNamespaceInternal(String name, HttpServletRequest request) {
        try {
            var namespace = kubernetesService.getNamespace(name);
            if (namespace == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Namespace not found: " + name));
            }

            String formatParam = request != null ? request.getParameter("format") : null;
            if (formatParam != null && formatParam.equalsIgnoreCase("yaml")) {
                String yamlOutput = convertToYaml(namespace);
                return ResponseEntity.ok(Map.of("output", yamlOutput, "format", "yaml"));
            }

            // Convert to JSON
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(namespace);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "Namespace not found: " + name));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe namespace: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Delete Namespace (sử dụng Fabric8 client, cấm namespace hệ thống)
     */
    @DeleteMapping("/k8s/namespaces/{name}")
    public ResponseEntity<?> deleteNamespace(HttpServletRequest request,
            @PathVariable String name) {
        return deleteNamespaceInternal(name);
    }


    private ResponseEntity<?> deleteNamespaceInternal(String name) {
        try {
            // Chặn xóa namespace hệ thống
            String nsLower = name == null ? "" : name.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public")
                    || nsLower.equals("kube-node-lease") || nsLower.equals("default")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa namespace hệ thống"));
            }

            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            kubernetesService.deleteNamespace(name);
            String output = String.format("namespace \"%s\" deleted", name);
            return ResponseEntity.ok(Map.of("success", true, "output", output));
        } catch (IllegalArgumentException e) {
            // Validation error từ KubernetesService (system namespace protection)
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "Namespace not found: " + name));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete namespace: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }




    // ===================== K8s Resource Actions
    // (Describe/Delete/Scale)=====================


    /**
     * Describe pod cho cluster duy nhất (không cần ID)
     */
    @GetMapping("/k8s/pods/{namespace}/{name}")
    public ResponseEntity<?> describePod(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var pod = k8sWorkloadsService.getPod(namespace, name);
            if (pod == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Pod not found: " + name + " in namespace " + namespace));
            }
            String formatParam = request.getParameter("format");
            if (formatParam != null && formatParam.equalsIgnoreCase("yaml")) {
                String yamlOutput = convertToYaml(pod);
                return ResponseEntity.ok(Map.of("output", yamlOutput, "format", "yaml"));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(pod);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Pod not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe pod: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }


    /**
     * Delete pod cho cluster duy nhất (không cần ID)
     */
    @DeleteMapping("/k8s/pods/{namespace}/{name}")
    public ResponseEntity<?> deletePod(
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

            k8sWorkloadsService.deletePod(namespace, name);
            String output = String.format("pod \"%s\" deleted", name);
            return ResponseEntity.ok(Map.of("success", true, "output", output));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Pod not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete pod: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }


    /**
     * Ghi config mặc định (ansible.cfg, hosts) lên MASTER cho cluster duy nhất (không cần ID)
     * Body: { "host": optional, "sudoPassword": optional (nếu có sudo NOPASSWD) }
     */
    @PostMapping("/ansible/init/config")
    public ResponseEntity<?> initAnsibleConfig(@RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;
            String sudoPassword = body != null ? (String) body.get("sudoPassword") : null;

            var servers = serverService.findByClusterStatus("AVAILABLE");
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
                    if ("MASTER".equals(s.getRole())) {
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

            // Xác định master chính xác trong các server AVAILABLE; các máy còn lại là worker
            String masterHost = null;
            var summaries = clusterService.listSummaries();
            var sum = summaries.stream().findFirst().orElse(null);
            if (sum != null && sum.masterNode() != null && !sum.masterNode().isBlank()) {
                masterHost = sum.masterNode().trim();
            }

            java.util.List<com.example.AutoDeployApp.entity.Server> filtered = new java.util.ArrayList<>();
            com.example.AutoDeployApp.entity.Server chosenMaster = null;
            if (masterHost != null) {
                for (var s : servers) {
                    if ("MASTER".equals(s.getRole())
                            && masterHost.equals(s.getHost())) {
                        chosenMaster = s;
                        break;
                    }
                }
            }
            if (chosenMaster == null) {
                for (var s : servers) {
                    if ("MASTER".equals(s.getRole())) {
                        chosenMaster = s;
                        break;
                    }
                }
            }
            if (chosenMaster != null)
                filtered.add(chosenMaster);
            for (var s : servers) {
                if ("WORKER".equals(s.getRole()))
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
     * Tạo SSH key không mật khẩu trên MASTER nếu chưa có cho cluster duy nhất (không cần ID)
     * Body: { "host": optional }
     */
    @PostMapping("/ansible/init/sshkey")
    public ResponseEntity<?> initAnsibleSshKey(
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;

            var servers = serverService.findByClusterStatus("AVAILABLE");
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
                    if ("MASTER".equals(s.getRole())) {
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
     * Chạy ansible all -m ping trên MASTER cho cluster duy nhất (không cần ID)
     * Body: { "host": optional }
     */
    @PostMapping("/ansible/init/ping")
    public ResponseEntity<?> initAnsiblePing(
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String host = body != null ? (String) body.getOrDefault("host", null) : null;

            var servers = serverService.findByClusterStatus("AVAILABLE");
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
                    if ("MASTER".equals(s.getRole())) {
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
     * Parse Pod object thành Map format cho API response
     */
    private Map<String, Object> parsePodToMap(Pod pod) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", pod.getMetadata() != null ? pod.getMetadata().getNamespace() : "");
        map.put("name", pod.getMetadata() != null ? pod.getMetadata().getName() : "");
        map.put("node",
                pod.getSpec() != null && pod.getSpec().getNodeName() != null
                        ? pod.getSpec().getNodeName()
                        : "");
        map.put("status", pod.getStatus() != null ? pod.getStatus().getPhase() : "Unknown");

        // Age calculation
        String age = "";
        if (pod.getMetadata() != null && pod.getMetadata().getCreationTimestamp() != null) {
            age = calculateAge(pod.getMetadata().getCreationTimestamp().toString());
        }
        map.put("age", age);

        // Tính ready containers (ready/total)
        int readyCount = 0;
        int totalContainers = 0;
        
        // Lấy image từ containers
        String image = "N/A";
        if (pod.getSpec() != null && pod.getSpec().getContainers() != null
                && !pod.getSpec().getContainers().isEmpty()) {
            image = pod.getSpec().getContainers().get(0).getImage();
            if (image == null || image.isEmpty()) {
                image = "N/A";
            }
        }
        
        // Lấy IP
        String podIP = "";
        if (pod.getStatus() != null && pod.getStatus().getPodIP() != null) {
            podIP = pod.getStatus().getPodIP();
        }
        
        // Thêm container statuses nếu có
        if (pod.getStatus() != null && pod.getStatus().getContainerStatuses() != null) {
            java.util.List<Map<String, Object>> containerStatuses = new java.util.ArrayList<>();
            for (ContainerStatus cs : pod.getStatus().getContainerStatuses()) {
                totalContainers++;
                if (cs.getReady() != null && cs.getReady()) {
                    readyCount++;
                }
                
                java.util.Map<String, Object> csMap = new java.util.HashMap<>();
                csMap.put("name", cs.getName());
                csMap.put("ready", cs.getReady());
                csMap.put("restartCount", cs.getRestartCount() != null ? cs.getRestartCount() : 0);

                // Trích xuất trạng thái container
                String state = extractContainerState(cs);
                csMap.put("state", state);
                containerStatuses.add(csMap);
            }
            map.put("containerStatuses", containerStatuses);
        }
        
        // Set ready string format: "ready/total"
        map.put("ready", totalContainers > 0 ? readyCount + "/" + totalContainers : "0/0");
        map.put("image", image);
        map.put("podIP", podIP);

        return map;
    }

    /**
     * Trích xuất trạng thái container từ ContainerStatus
     */
    private String extractContainerState(ContainerStatus cs) {
        if (cs.getState() == null) {
            return "Unknown";
        }
        if (cs.getState().getRunning() != null) {
            return "Running";
        } else if (cs.getState().getWaiting() != null) {
            return "Waiting: " + cs.getState().getWaiting().getReason();
        } else if (cs.getState().getTerminated() != null) {
            return "Terminated: " + cs.getState().getTerminated().getReason();
        }
        return "Unknown";
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
        if (!"MASTER".equals(serverData.role)) {
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


    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, String> body, HttpServletRequest request) {
        // Với 1 cluster duy nhất, không cần create cluster nữa
        // Trả về id = 1 để tương thích với API
        return ResponseEntity.ok(Map.of("id", 1L, "message", "Cluster không cần tạo. Chỉ cần set clusterStatus = 'AVAILABLE' cho servers."));
    }

    /**
     * Lấy chi tiết cluster duy nhất (không cần ID)
     * Trả về object, không phải array
     * Endpoint này dùng /api để tránh xung đột với page route /admin/cluster
     */
    @GetMapping("/api")
    public ResponseEntity<?> getDefaultCluster(HttpServletRequest request) {
        var summaries = clusterService.listSummaries();
        var sum = summaries.stream().findFirst().orElse(null);
        if (sum == null)
            return ResponseEntity.notFound().build();

        // Get servers for this cluster (các server có clusterStatus = "AVAILABLE")
        var clusterServers = serverService.findByClusterStatus("AVAILABLE");
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();

        for (var s : clusterServers) {
            nodes.add(java.util.Map.of(
                    "id", s.getId(),
                    "ip", s.getHost(),
                    "port", s.getPort() != null ? s.getPort() : 22,
                    "username", s.getUsername(),
                    "role", s.getRole() != null && !s.getRole().isBlank() ? s.getRole() : "WORKER",
                    "status", s.getStatus().name()));
        }

        // Lấy createdBy từ cluster summary nếu có
        Long createdBy = sum.createdBy() != null ? sum.createdBy() : null;
        
        // Check isOwner
        Long currentUserId = null;
        var session = request.getSession(false);
        if (session != null) {
            Object uid = session.getAttribute("USER_ID");
            if (uid instanceof Long l)
                currentUserId = l;
            else if (uid instanceof Number n)
                currentUserId = n.longValue();
        }
        boolean isOwner = currentUserId != null && createdBy != null && currentUserId.equals(createdBy);

        var result = new LinkedHashMap<String, Object>();
        result.put("id", sum.id());
        result.put("name", sum.name());
        result.put("description", sum.description() != null ? sum.description() : "");
        result.put("masterNode", sum.masterNode());
        result.put("workerCount", sum.workerCount());
        result.put("status", sum.status());
        result.put("createdBy", createdBy != null ? createdBy : 0L);
        result.put("isOwner", isOwner);
        result.put("nodes", nodes);
        
        return ResponseEntity.ok(result);
    }

    /**
     * Lấy chi tiết cluster với metrics (không cần ID - dùng cluster duy nhất)
     */
    @GetMapping("/detail")
    public ResponseEntity<?> detailWithMetrics(jakarta.servlet.http.HttpServletRequest request) {
        // Sử dụng clusterStatus = "AVAILABLE" để xác định cluster (không cần ID)
        return detailWithMetricsById(null, request);
    }

    /**
     * Internal method để lấy chi tiết cluster với metrics
     * id parameter không được sử dụng, chỉ để backward compatibility
     */
    private ResponseEntity<?> detailWithMetricsById(Long id, jakarta.servlet.http.HttpServletRequest request) {
        // id không được sử dụng, chỉ để backward compatibility
        var summaries = clusterService.listSummaries();
        var sum = summaries.stream().findFirst().orElse(null);
        if (sum == null)
            return ResponseEntity.notFound().build();

        // Lấy password cache từ session
        var session = request.getSession(false);
        java.util.Map<Long, String> pwCache = getPasswordCache(session);

        // Lấy servers cho cluster này (các server có clusterStatus = "AVAILABLE")
        var clusterServers = serverService.findByClusterStatus("AVAILABLE");

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
                    // Nếu node offline (check cả isConnected và status từ DB), trả về ngay thông
                    // tin cơ bản
                    // (không gọi SSH để giảm thời gian load và tránh timeout)
                    if (!serverDataItem.isConnected ||
                            serverDataItem.status == com.example.AutoDeployApp.entity.Server.ServerStatus.OFFLINE) {
                        return CompletableFuture.<Map<String, Object>>completedFuture(
                                java.util.Map.of(
                                        "id", serverDataItem.id,
                                        "ip", serverDataItem.host,
                                        "role", serverDataItem.role != null && !serverDataItem.role.isBlank() ? serverDataItem.role : "WORKER",
                                        "status", serverDataItem.status.name(),
                                        "isConnected", false,
                                        "cpu", "-",
                                        "ram", "-",
                                        "ramPercentage", 0,
                                        "disk", "-",
                                        "version", ""));
                    }

                    // Chỉ load metrics cho nodes online
                    return getServerMetricsAsync(serverDataItem, pwCache)
                            .thenApply(metrics -> {
                                return java.util.Map.<String, Object>of(
                                        "id", serverDataItem.id,
                                        "ip", serverDataItem.host,
                                        "role", serverDataItem.role != null && !serverDataItem.role.isBlank() ? serverDataItem.role : "WORKER",
                                        "status", serverDataItem.status.name(),
                                        "isConnected", serverDataItem.isConnected,
                                        "cpu", metrics.get("cpu"),
                                        "ram", metrics.get("ram"),
                                        "ramPercentage", metrics.get("ramPercentage"),
                                        "disk", metrics.get("disk"),
                                        "version", ""); // Version sẽ được lấy từ cluster level
                            });
                })
                .toList();

        // Chờ tất cả futures hoàn thành và thu thập kết quả
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();

        // Lấy Kubernetes version từ cluster (sử dụng Fabric8 client)
        String version = "";
        try {
            version = kubernetesService.getKubernetesVersion();
        } catch (Exception e) {
            System.err.println("Lỗi lấy Kubernetes version: " + e.getMessage());
            // Fallback: thử lấy từ SSH nếu API không available
            var masterServer = serverData.stream()
                    .filter(s -> "MASTER".equals(s.role) &&
                            s.isConnected &&
                            s.status != com.example.AutoDeployApp.entity.Server.ServerStatus.OFFLINE)
                    .findFirst();
            if (masterServer.isPresent()) {
                version = getKubernetesVersion(masterServer.get(), pwCache);
            }
        }

        // Xử lý futures với cách ly lỗi
        // Tối ưu: xử lý offline nodes trước (đã completed ngay), sau đó xử lý online
        // nodes
        for (int i = 0; i < futures.size(); i++) {
            var future = futures.get(i);
            var serverDataItem = serverData.get(i);

            try {
                // Với offline nodes (đã completed ngay), sẽ return ngay lập tức
                // Với online nodes, đợi tối đa 15 giây (giảm từ 20 để nhanh hơn)
                Map<String, Object> nodeData;
                if (!serverDataItem.isConnected ||
                        serverDataItem.status == com.example.AutoDeployApp.entity.Server.ServerStatus.OFFLINE) {
                    // Offline nodes đã completed ngay, lấy ngay không cần timeout
                    nodeData = future.get();
                } else {
                    // Online nodes: timeout 10 giây để tăng tốc độ phản hồi
                    // (đã có orTimeout 15s trong getServerMetricsAsync, nhưng giảm wait time ở đây)
                    nodeData = future.get(10, TimeUnit.SECONDS);
                }

                nodes.add(nodeData);
            } catch (java.util.concurrent.TimeoutException e) {
                // Timeout riêng cho online nodes - fallback nhanh
                System.err.println("Timeout lấy metrics cho " + serverDataItem.host);
                var fallbackNode = new java.util.HashMap<String, Object>();
                fallbackNode.put("id", serverDataItem.id);
                fallbackNode.put("ip", serverDataItem.host);
                fallbackNode.put("role", serverDataItem.role != null && !serverDataItem.role.isBlank() ? serverDataItem.role : "WORKER");
                fallbackNode.put("status", serverDataItem.status.name());
                fallbackNode.put("isConnected", false);
                fallbackNode.put("cpu", "-");
                fallbackNode.put("ram", "-");
                fallbackNode.put("ramPercentage", 0);
                fallbackNode.put("disk", "-");
                fallbackNode.put("version", "");
                fallbackNode.put("error", "Timeout khi lấy metrics");
                nodes.add(fallbackNode);
            } catch (Exception e) {
                System.err
                        .println("Lỗi xử lý metrics server cho " + serverDataItem.host + ": " + e.getMessage());

                // Thêm dữ liệu fallback cho server thất bại để duy trì cluster view
                var fallbackNode = new java.util.HashMap<String, Object>();
                fallbackNode.put("id", serverDataItem.id);
                fallbackNode.put("ip", serverDataItem.host);
                fallbackNode.put("role", serverDataItem.role != null && !serverDataItem.role.isBlank() ? serverDataItem.role : "WORKER");
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
     * Xóa cluster (không cần ID - dùng cluster duy nhất)
     */
    @DeleteMapping("/")
    public ResponseEntity<?> deleteCluster(jakarta.servlet.http.HttpServletRequest request) {
        // Sử dụng clusterStatus = "AVAILABLE" để xác định cluster (không cần ID)
        return deleteClusterById(null, request);
    }

    /**
     * Internal method để xóa cluster
     * id parameter không được sử dụng, chỉ để backward compatibility
     */
    private ResponseEntity<?> deleteClusterById(Long id, jakarta.servlet.http.HttpServletRequest request) {
        // id không được sử dụng, chỉ để backward compatibility
        // Với hệ thống chỉ có 1 cluster, không cho phép xóa cluster
        // Nếu cần xóa, có thể set tất cả servers về clusterStatus = "UNAVAILABLE"
        return ResponseEntity.badRequest()
                .body(Map.of("error", "Không thể xóa cluster. Với hệ thống chỉ có 1 cluster, vui lòng set servers về clusterStatus = 'UNAVAILABLE' thay vì xóa cluster."));
    }

    /**
     * Lấy Kubernetes version cho cluster duy nhất (không cần ID)
     * @return version string hoặc empty string nếu chưa cài
     */
    @GetMapping("/k8s-version")
    public ResponseEntity<?> getKubernetesVersion() {
        // Sử dụng clusterStatus = "AVAILABLE" để xác định cluster (không cần ID)
        return getKubernetesVersionById(null);
    }

    /**
     * Internal method để lấy Kubernetes version
     * id parameter không được sử dụng, chỉ để backward compatibility
     */
    private ResponseEntity<?> getKubernetesVersionById(Long id) {
        // id không được sử dụng, chỉ để backward compatibility
        try {
            String version = kubernetesService.getKubernetesVersion();
            return ResponseEntity.ok(java.util.Map.of(
                    "version", version != null ? version : "",
                    "installed", version != null && !version.trim().isEmpty()
            ));
        } catch (Exception e) {
            logger.error("Error getting Kubernetes version: {}", e.getMessage());
            return ResponseEntity.ok(java.util.Map.of(
                    "version", "",
                    "installed", false,
                    "error", e.getMessage()
            ));
        }
    }

    /**
     * SECURITY: Không còn đọc password từ session để tránh rủi ro bảo mật.
     * Method này trả về empty map để tương thích với code hiện tại.
     * Các operations sẽ chỉ sử dụng SSH key.
     */
    private java.util.Map<Long, String> getPasswordCache(jakarta.servlet.http.HttpSession session) {
        // SECURITY: Không đọc password từ session
        return new java.util.LinkedHashMap<>();
    }

    /**
     * Kiểm tra trạng thái cài đặt Ansible cho cluster duy nhất (không cần ID)
     * Với thông tin chi tiết cho tất cả servers
     */
    @GetMapping("/ansible-status")
    public ResponseEntity<?> getAnsibleStatus(HttpServletRequest request) {
        try {

            var session = request.getSession(false);
            if (session == null) {
                System.out.println("DEBUG: No session found");
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không có session. Vui lòng đăng nhập lại."));
            }

            java.util.Map<Long, String> pwCache = getPasswordCache(session);
            System.out.println("DEBUG: Password cache size: " + pwCache.size());

            // Lấy thông tin cluster
            var clusterServers = serverService.findByClusterStatus("AVAILABLE");
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

            Map<String, Object> status = ansibleInstallationService.checkAnsibleInstallation(pwCache);

            // Thêm thông tin cluster
            status.put("clusterInfo", Map.of(
                    "totalServers", clusterServers.size(),
                    "masterCount",
                    clusterServers.stream()
                            .filter(s -> "MASTER".equals(s.getRole()))
                            .count(),
                    "workerCount",
                    clusterServers.stream()
                            .filter(s -> "WORKER".equals(s.getRole()))
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
     * Cài đặt Ansible cho cluster duy nhất (không cần ID) với sudo password
     */
    @PostMapping("/install-ansible")
    public ResponseEntity<?> installAnsible(@RequestBody Map<String, Object> body,
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
            var clusterServers = serverService.findByClusterStatus("AVAILABLE");
            for (com.example.AutoDeployApp.entity.Server server : clusterServers) {
                String sudoPassword = sudoPasswords.get(server.getHost());
                if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                    sudoPasswordCache.put(server.getId(), sudoPassword);
                }
            }

            // Bắt đầu cài đặt Ansible
            ansibleInstallationService.installAnsibleOnCluster(pwCache, sudoPasswordCache);

            // Trả về ngay lập tức với task ID
            String taskId = "ansible-install-" + System.currentTimeMillis();

            return ResponseEntity.ok(Map.of(
                    "taskId", taskId,
                    "status", "STARTED",
                    "message", "Đang cài đặt Ansible trên cluster..."));

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Lỗi bắt đầu cài đặt Ansible: " + e.getMessage()));
        }
    }

    /**
     * Convert workload (Deployment/StatefulSet/DaemonSet) thành Map đơn giản cho overview
     * Chỉ trả về: name, type, namespace, status (Ready/NotReady/Unknown)
     */
    private Map<String, Object> convertWorkloadToOverviewMap(Object workload) {
        var w = new java.util.HashMap<String, Object>();
        
        if (workload instanceof Deployment dep) {
            w.put("name", dep.getMetadata() != null ? dep.getMetadata().getName() : "-");
            w.put("type", "Deployment");
            w.put("namespace", dep.getMetadata() != null ? dep.getMetadata().getNamespace() : "");
            if (dep.getStatus() != null && dep.getStatus().getReadyReplicas() != null 
                    && dep.getStatus().getReplicas() != null) {
                w.put("status", dep.getStatus().getReadyReplicas().equals(dep.getStatus().getReplicas()) 
                        ? "Ready" : "NotReady");
            } else {
                w.put("status", "Unknown");
            }
        } else if (workload instanceof StatefulSet sts) {
            w.put("name", sts.getMetadata() != null ? sts.getMetadata().getName() : "-");
            w.put("type", "StatefulSet");
            w.put("namespace", sts.getMetadata() != null ? sts.getMetadata().getNamespace() : "");
            if (sts.getStatus() != null && sts.getStatus().getReadyReplicas() != null 
                    && sts.getStatus().getReplicas() != null) {
                w.put("status", sts.getStatus().getReadyReplicas().equals(sts.getStatus().getReplicas()) 
                        ? "Ready" : "NotReady");
            } else {
                w.put("status", "Unknown");
            }
        } else if (workload instanceof DaemonSet ds) {
            w.put("name", ds.getMetadata() != null ? ds.getMetadata().getName() : "-");
            w.put("type", "DaemonSet");
            w.put("namespace", ds.getMetadata() != null ? ds.getMetadata().getNamespace() : "");
            if (ds.getStatus() != null && ds.getStatus().getNumberReady() != null 
                    && ds.getStatus().getDesiredNumberScheduled() != null) {
                w.put("status", ds.getStatus().getNumberReady().equals(ds.getStatus().getDesiredNumberScheduled()) 
                        ? "Ready" : "NotReady");
            } else {
                w.put("status", "Unknown");
            }
        } else {
            w.put("name", "-");
            w.put("type", "Unknown");
            w.put("namespace", "");
            w.put("status", "Unknown");
        }
        
        return w;
    }

    /**
     * Parse Quantity string sang bytes
     * Hỗ trợ: "1Gi" = 1073741824 bytes, "512Mi" = 536870912 bytes, "1K" = 1024 bytes
     */
    private double parseQuantityToBytes(String quantity) {
        if (quantity == null || quantity.isBlank()) return 0.0;
        quantity = quantity.trim();
        try {
            // Parse số
            double value = 0.0;
            String unit = "";
            
            // Tách số và unit
            int unitStart = -1;
            for (int i = 0; i < quantity.length(); i++) {
                char c = quantity.charAt(i);
                if (Character.isLetter(c)) {
                    unitStart = i;
                    break;
                }
            }
            
            if (unitStart > 0) {
                value = Double.parseDouble(quantity.substring(0, unitStart));
                unit = quantity.substring(unitStart);
            } else {
                // Không có unit, giả sử là bytes
                return Double.parseDouble(quantity);
            }

            // Convert sang bytes
            return switch (unit.toUpperCase()) {
                case "KI", "K" -> value * 1024;
                case "MI", "M" -> value * 1024 * 1024;
                case "GI", "G" -> value * 1024 * 1024 * 1024;
                case "TI", "T" -> value * 1024L * 1024 * 1024 * 1024;
                case "PI", "P" -> value * 1024L * 1024 * 1024 * 1024 * 1024;
                default -> {
                    // Nếu không có unit hoặc unit không nhận dạng được, giả sử là bytes
                    try {
                        yield Double.parseDouble(quantity);
                    } catch (Exception e) {
                        yield 0.0;
                    }
                }
            };
        } catch (Exception e) {
            logger.debug("Khong parse duoc quantity sang bytes: {}", quantity);
            return 0.0;
        }
    }

    /**
     * Calculate age from creation timestamp
     */
    private String calculateAge(String creationTimestamp) {
        if (creationTimestamp == null || creationTimestamp.isBlank()) {
            return "";
        }
        try {
            var instant = java.time.Instant.parse(creationTimestamp);
            var now = java.time.Instant.now();
            var duration = java.time.Duration.between(instant, now);

            long days = duration.toDays();
            long hours = duration.toHours() % 24;
            long minutes = duration.toMinutes() % 60;

            if (days > 0) {
                return days + "d";
            } else if (hours > 0) {
                return hours + "h";
            } else if (minutes > 0) {
                return minutes + "m";
            } else {
                return "<1m";
            }
        } catch (Exception e) {
            return "";
        }
    }



    /**
     * Chuyển đối tượng K8s sang YAML (dùng cho export/describe)
     */
    private String convertToYaml(Object k8sObject) {
        try {
            var yamlMapper = new com.fasterxml.jackson.databind.ObjectMapper(
                    new com.fasterxml.jackson.dataformat.yaml.YAMLFactory());
            return yamlMapper.writeValueAsString(k8sObject);
        } catch (Exception e) {
            return "# Failed to convert to YAML: " + e.getMessage();
        }
    }
}
