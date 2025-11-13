package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.service.ClusterService;
import com.example.AutoDeployApp.service.ServerService;
import com.example.AutoDeployApp.service.AnsibleInstallationService;
import com.example.AutoDeployApp.service.KubernetesService;
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
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.ContainerStatus;
import io.fabric8.kubernetes.api.model.networking.v1.Ingress;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.StatefulSet;
import io.fabric8.kubernetes.api.model.apps.DaemonSet;

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
    private final KubernetesService kubernetesService;
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

    public ClusterAdminController(ClusterService clusterService, ServerService serverService,
            AnsibleInstallationService ansibleInstallationService, KubernetesService kubernetesService) {
        this.clusterService = clusterService;
        this.serverService = serverService;
        this.ansibleInstallationService = ansibleInstallationService;
        this.kubernetesService = kubernetesService;
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
     * Lấy danh sách node từ Kubernetes API (sử dụng Fabric8 client)
     * Ready/NotReady, IP nội bộ, version
     */
    @GetMapping("/{id}/k8s/nodes")
    public ResponseEntity<?> getKubernetesNodes(@PathVariable Long id, HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            java.util.List<java.util.Map<String, Object>> nodes = kubernetesService.getKubernetesNodes(id);
            return ResponseEntity.ok(Map.of("nodes", nodes));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            // Handle specific Kubernetes API errors
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable - Master may be NOTREADY",
                        "nodes", java.util.List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get nodes: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Lỗi lấy danh sách node: " + e.getMessage()));
        }
    }

    /**
     * Liệt kê namespaces (sử dụng Fabric8 client)
     */
    @GetMapping("/{id}/k8s/namespaces")
    public ResponseEntity<?> listNamespaces(@PathVariable Long id, HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var namespaceList = kubernetesService.getNamespaces(id);
            java.util.List<java.util.Map<String, Object>> result = namespaceList.getItems().stream()
                    .map(ns -> {
                        java.util.Map<String, Object> map = new java.util.HashMap<>();
                        map.put("name", ns.getMetadata().getName());
                        map.put("status", ns.getStatus() != null ? ns.getStatus().getPhase() : "Unknown");
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

    /**
     * Describe Namespace (sử dụng Fabric8 client)
     */
    @GetMapping("/{id}/k8s/namespaces/{name}")
    public ResponseEntity<?> describeNamespace(@PathVariable Long id,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var namespace = kubernetesService.getNamespace(id, name);
            if (namespace == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Namespace not found: " + name));
            }

            // Convert to JSON (có thể thêm YAML conversion nếu cần)
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
    @DeleteMapping("/{id}/k8s/namespaces/{name}")
    public ResponseEntity<?> deleteNamespace(@PathVariable Long id,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            // Chặn xóa namespace hệ thống
            String nsLower = name == null ? "" : name.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public")
                    || nsLower.equals("kube-node-lease") || nsLower.equals("default")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa namespace hệ thống"));
            }

            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            kubernetesService.deleteNamespace(name, id);
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

    /**
     * Liệt kê pods (sử dụng Fabric8 client)
     * Supports optional namespace query parameter to filter pods
     */
    @GetMapping("/{id}/k8s/pods")
    public ResponseEntity<?> listPods(@PathVariable Long id,
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var podList = kubernetesService.getPods(id, namespace);
            java.util.List<java.util.Map<String, Object>> result = podList.getItems().stream()
                    .map(pod -> parsePodToMap(pod))
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
     * Liệt kê workloads: Deployments/StatefulSets/DaemonSets (sử dụng Fabric8
     * client)
     * Supports optional namespace query parameter to filter workloads
     */
    @GetMapping("/{id}/k8s/workloads")
    public ResponseEntity<?> listWorkloads(@PathVariable Long id,
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var deployments = kubernetesService.getDeployments(id, namespace);
            var statefulSets = kubernetesService.getStatefulSets(id, namespace);
            var daemonSets = kubernetesService.getDaemonSets(id, namespace);

            // Parse Deployments
            java.util.List<java.util.Map<String, Object>> deploymentList = deployments.getItems().stream()
                    .map(dep -> parseWorkloadToMap(dep))
                    .collect(java.util.stream.Collectors.toList());

            // Parse StatefulSets
            java.util.List<java.util.Map<String, Object>> statefulSetList = statefulSets.getItems().stream()
                    .map(sts -> parseWorkloadToMap(sts))
                    .collect(java.util.stream.Collectors.toList());

            // Parse DaemonSets
            java.util.List<java.util.Map<String, Object>> daemonSetList = daemonSets.getItems().stream()
                    .map(ds -> parseWorkloadToMap(ds))
                    .collect(java.util.stream.Collectors.toList());

            return ResponseEntity.ok(Map.of(
                    "deployments", deploymentList,
                    "statefulSets", statefulSetList,
                    "daemonSets", daemonSetList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "deployments", new java.util.ArrayList<>(),
                        "statefulSets", new java.util.ArrayList<>(),
                        "daemonSets", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get workloads: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Liệt kê services (sử dụng Fabric8 client)
     * Supports optional namespace query parameter to filter services
     */
    @GetMapping("/{id}/k8s/services")
    public ResponseEntity<?> listServices(@PathVariable Long id,
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var serviceList = kubernetesService.getServices(id, namespace);
            java.util.List<java.util.Map<String, Object>> result = serviceList.getItems().stream()
                    .map(svc -> parseServiceToMap(svc))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("services", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "services", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get services: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Liệt kê ingress (sử dụng Fabric8 client)
     * Supports optional namespace query parameter to filter ingress
     */
    @GetMapping("/{id}/k8s/ingress")
    public ResponseEntity<?> listIngress(@PathVariable Long id,
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var ingressList = kubernetesService.getIngress(id, namespace);
            java.util.List<java.util.Map<String, Object>> result = ingressList.getItems().stream()
                    .map(ing -> parseIngressToMap(ing))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("ingress", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "ingress", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get ingress: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== K8s Resource Actions
    // (Describe/Delete/Scale)=====================

    @GetMapping("/{id}/k8s/pods/{namespace}/{name}")
    public ResponseEntity<?> describePod(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var pod = kubernetesService.getPod(id, namespace, name);
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
     * Describe Service
     */
    @GetMapping("/{id}/k8s/services/{namespace}/{name}")
    public ResponseEntity<?> describeService(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var service = kubernetesService.getService(id, namespace, name);
            if (service == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Service not found: " + name + " in namespace " + namespace));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(service);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Service not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe service: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Delete Service (cấm namespace hệ thống)
     */
    @DeleteMapping("/{id}/k8s/services/{namespace}/{name}")
    public ResponseEntity<?> deleteService(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa Service trong namespace hệ thống"));
            }

            kubernetesService.deleteService(id, namespace, name);
            String output = String.format("service \"%s\" deleted", name);
            return ResponseEntity.ok(Map.of("success", true, "output", output));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Service not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete service: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Describe Ingress
     */
    @GetMapping("/{id}/k8s/ingress/{namespace}/{name}")
    public ResponseEntity<?> describeIngress(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var ingress = kubernetesService.getIngress(id, namespace, name);
            if (ingress == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Ingress not found: " + name + " in namespace " + namespace));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(ingress);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Ingress not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe ingress: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Delete Ingress (cấm namespace hệ thống)
     */
    @DeleteMapping("/{id}/k8s/ingress/{namespace}/{name}")
    public ResponseEntity<?> deleteIngress(@PathVariable Long id,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa Ingress trong namespace hệ thống"));
            }

            kubernetesService.deleteIngress(id, namespace, name);
            String output = String.format("ingress.networking.k8s.io \"%s\" deleted", name);
            return ResponseEntity.ok(Map.of("success", true, "output", output));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Ingress not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete ingress: " + e.getMessage()));
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

            kubernetesService.deletePod(id, namespace, name);
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

    @GetMapping("/{id}/k8s/{type}/{namespace}/{name}")
    public ResponseEntity<?> describeWorkload(@PathVariable Long id,
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset") || t.equals("daemonset"))) {
                return ResponseEntity.badRequest().body(Map.of("error", "Loại workload không hợp lệ"));
            }

            Object workload = null;
            switch (t) {
                case "deployment":
                    workload = kubernetesService.getDeployment(id, namespace, name);
                    break;
                case "statefulset":
                    workload = kubernetesService.getStatefulSet(id, namespace, name);
                    break;
                case "daemonset":
                    workload = kubernetesService.getDaemonSet(id, namespace, name);
                    break;
                default:
                    return ResponseEntity.badRequest().body(Map.of("error", "Invalid workload type: " + type));
            }

            if (workload == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", type + " not found: " + name + " in namespace " + namespace));
            }

            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(workload);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", type + " not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe workload: " + e.getMessage()));
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

    /**
     * Scale workload (sử dụng Fabric8 client)
     * Supports Deployment and StatefulSet only
     */
    @PostMapping("/{id}/k8s/{type}/{namespace}/{name}/scale")
    public ResponseEntity<?> scaleWorkload(@PathVariable Long id,
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody ScaleRequest body,
            HttpServletRequest request) {
        try {
            String t = type == null ? "" : type.toLowerCase();

            // Validate workload type
            if (!(t.equals("deployment") || t.equals("statefulset"))) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Chỉ hỗ trợ scale Deployment/StatefulSet. DaemonSet không thể scale."));
            }

            // Prevent scaling in system namespaces
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") ||
                    nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép scale trong namespace hệ thống"));
            }

            // Validate replicas
            if (body == null || body.replicas == null || body.replicas < 0) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Giá trị replicas không hợp lệ. Phải >= 0"));
            }

            int replicas = body.replicas;

            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            switch (t) {
                case "deployment":
                    kubernetesService.scaleDeployment(id, namespace, name, replicas);
                    break;
                case "statefulset":
                    kubernetesService.scaleStatefulSet(id, namespace, name, replicas);
                    break;
                default:
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Invalid workload type: " + type));
            }

            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "type", type,
                    "namespace", namespace,
                    "name", name,
                    "replicas", replicas,
                    "message", "Scaled " + type + " " + name + " to " + replicas + " replicas"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error",
                                "Workload not found: " + type + "/" + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503)
                        .body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Failed to scale workload: " + e.getMessage()));
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
            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset") || t.equals("daemonset"))) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Chỉ cho phép xóa Deployment/StatefulSet/DaemonSet"));
            }

            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không cho phép xóa trong namespace hệ thống"));
            }

            String output;
            switch (t) {
                case "deployment":
                    kubernetesService.deleteDeployment(id, namespace, name);
                    output = String.format("deployment.apps \"%s\" deleted", name);
                    break;
                case "statefulset":
                    kubernetesService.deleteStatefulSet(id, namespace, name);
                    output = String.format("statefulset.apps \"%s\" deleted", name);
                    break;
                case "daemonset":
                    kubernetesService.deleteDaemonSet(id, namespace, name);
                    output = String.format("daemonset.apps \"%s\" deleted", name);
                    break;
                default:
                    return ResponseEntity.badRequest()
                            .body(Map.of("error", "Invalid workload type: " + type));
            }

            return ResponseEntity.ok(Map.of("success", true, "output", output));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", type + " not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete workload: " + e.getMessage()));
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
     * Parse Pod object thành Map format cho API response
     */
    private Map<String, Object> parsePodToMap(Pod pod) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", pod.getMetadata().getNamespace());
        map.put("name", pod.getMetadata().getName());
        map.put("node",
                pod.getSpec() != null && pod.getSpec().getNodeName() != null
                        ? pod.getSpec().getNodeName()
                        : "");
        map.put("status", pod.getStatus() != null ? pod.getStatus().getPhase() : "Unknown");

        // Thêm container statuses nếu có
        if (pod.getStatus() != null && pod.getStatus().getContainerStatuses() != null) {
            java.util.List<Map<String, Object>> containerStatuses = new java.util.ArrayList<>();
            for (ContainerStatus cs : pod.getStatus().getContainerStatuses()) {
                java.util.Map<String, Object> csMap = new java.util.HashMap<>();
                csMap.put("name", cs.getName());
                csMap.put("ready", cs.getReady());
                csMap.put("restartCount", cs.getRestartCount());

                // Trích xuất trạng thái container
                String state = extractContainerState(cs);
                csMap.put("state", state);
                containerStatuses.add(csMap);
            }
            map.put("containerStatuses", containerStatuses);
        }

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
     * Parse Service object thành Map format cho API response
     */
    private Map<String, Object> parseServiceToMap(io.fabric8.kubernetes.api.model.Service svc) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", svc.getMetadata().getNamespace());
        map.put("name", svc.getMetadata().getName());

        // Type
        String type = svc.getSpec() != null && svc.getSpec().getType() != null ? svc.getSpec().getType()
                : "ClusterIP";
        map.put("type", type);

        // ClusterIP
        String clusterIP = svc.getSpec() != null && svc.getSpec().getClusterIP() != null
                ? svc.getSpec().getClusterIP()
                : "";
        map.put("clusterIP", clusterIP);

        // Age
        String age = "";
        if (svc.getMetadata() != null && svc.getMetadata().getCreationTimestamp() != null) {
            age = calculateAge(svc.getMetadata().getCreationTimestamp().toString());
        }
        map.put("age", age);

        // External IP
        String externalIP = "";
        if (svc.getStatus() != null && svc.getStatus().getLoadBalancer() != null &&
                svc.getStatus().getLoadBalancer().getIngress() != null &&
                !svc.getStatus().getLoadBalancer().getIngress().isEmpty()) {
            var ingress = svc.getStatus().getLoadBalancer().getIngress().get(0);
            if (ingress.getHostname() != null && !ingress.getHostname().isEmpty()) {
                externalIP = ingress.getHostname();
            } else if (ingress.getIp() != null && !ingress.getIp().isEmpty()) {
                externalIP = ingress.getIp();
            }
        }
        if (externalIP.isEmpty() && "ExternalName".equals(type) &&
                svc.getSpec() != null && svc.getSpec().getExternalName() != null) {
            externalIP = svc.getSpec().getExternalName();
        }
        if (externalIP.isEmpty() && "LoadBalancer".equals(type)) {
            externalIP = "<pending>";
        }
        map.put("externalIP", externalIP);

        // Ports
        java.util.List<String> portStrs = new java.util.ArrayList<>();
        if (svc.getSpec() != null && svc.getSpec().getPorts() != null) {
            for (var port : svc.getSpec().getPorts()) {
                int svcPort = port.getPort() != null ? port.getPort() : 0;
                String protocol = port.getProtocol() != null ? port.getProtocol() : "TCP";

                if (port.getTargetPort() != null) {
                    int targetPort = 0;
                    if (port.getTargetPort().getIntVal() != null) {
                        targetPort = port.getTargetPort().getIntVal();
                    } else if (port.getTargetPort().getStrVal() != null) {
                        try {
                            targetPort = Integer.parseInt(port.getTargetPort().getStrVal());
                        } catch (NumberFormatException ignored) {
                            // Giữ nguyên dạng string nếu không phải số
                            portStrs.add(
                                    svcPort + ":" + port.getTargetPort().getStrVal() + "/" + protocol);
                            continue;
                        }
                    }
                    if (targetPort > 0 && svcPort > 0) {
                        portStrs.add(svcPort + ":" + targetPort + "/" + protocol);
                    } else if (svcPort > 0) {
                        portStrs.add(svcPort + "/" + protocol);
                    }
                } else if (svcPort > 0) {
                    portStrs.add(svcPort + "/" + protocol);
                }
            }
        }
        map.put("ports", String.join(", ", portStrs));

        return map;
    }

    /**
     * Parse Ingress object thành Map format cho API response
     */
    private Map<String, Object> parseIngressToMap(Ingress ing) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", ing.getMetadata().getNamespace());
        map.put("name", ing.getMetadata().getName());

        // Ingress Class
        String ingressClass = ing.getSpec() != null && ing.getSpec().getIngressClassName() != null
                ? ing.getSpec().getIngressClassName()
                : "";
        map.put("class", ingressClass);

        // Age
        String age = "";
        if (ing.getMetadata() != null && ing.getMetadata().getCreationTimestamp() != null) {
            age = calculateAge(ing.getMetadata().getCreationTimestamp().toString());
        }
        map.put("age", age);

        // Collect LoadBalancer addresses (hostname/ip)
        java.util.List<String> addressList = new java.util.ArrayList<>();
        if (ing.getStatus() != null && ing.getStatus().getLoadBalancer() != null &&
                ing.getStatus().getLoadBalancer().getIngress() != null) {
            for (var lbIngress : ing.getStatus().getLoadBalancer().getIngress()) {
                if (lbIngress == null) {
                    continue;
                }
                if (lbIngress.getHostname() != null && !lbIngress.getHostname().isEmpty()) {
                    addressList.add(lbIngress.getHostname());
                } else if (lbIngress.getIp() != null && !lbIngress.getIp().isEmpty()) {
                    addressList.add(lbIngress.getIp());
                }
            }
        }
        map.put("address", addressList.isEmpty() ? "" : addressList.get(0)); // backward compatibility
        map.put("addresses", addressList);

        // Hosts & Ports
        java.util.List<String> hostList = new java.util.ArrayList<>();
        if (ing.getSpec() != null && ing.getSpec().getRules() != null) {
            for (var rule : ing.getSpec().getRules()) {
                if (rule == null) {
                    continue;
                }
                if (rule.getHost() != null && !rule.getHost().isEmpty()) {
                    hostList.add(rule.getHost());
                }
            }
        }

        // Determine exposed ports (best-effort: 443 when TLS present, otherwise 80)
        java.util.List<String> portList = new java.util.ArrayList<>();
        if (ing.getSpec() != null) {
            boolean hasTls = ing.getSpec().getTls() != null && !ing.getSpec().getTls().isEmpty();
            portList.add("80");
            if (hasTls) {
                portList.add("443");
            }
        }

        map.put("host", hostList.isEmpty() ? "*" : hostList.get(0)); // backward compatibility
        map.put("hosts", hostList);
        map.put("ports", portList);

        return map;
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
                    // Nếu node offline (check cả isConnected và status từ DB), trả về ngay thông
                    // tin cơ bản
                    // (không gọi SSH để giảm thời gian load và tránh timeout)
                    if (!serverDataItem.isConnected ||
                            serverDataItem.status == com.example.AutoDeployApp.entity.Server.ServerStatus.OFFLINE) {
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

                    // Chỉ load metrics cho nodes online
                    return getServerMetricsAsync(serverDataItem, pwCache)
                            .thenApply(metrics -> {
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
                                        "version", ""); // Version sẽ được lấy từ cluster level
                            });
                })
                .toList();

        // Chờ tất cả futures hoàn thành và thu thập kết quả
        var nodes = new java.util.ArrayList<java.util.Map<String, Object>>();

        // Lấy Kubernetes version từ cluster (sử dụng Fabric8 client)
        String version = "";
        try {
            version = kubernetesService.getKubernetesVersion(id);
        } catch (Exception e) {
            System.err.println("Lỗi lấy Kubernetes version: " + e.getMessage());
            // Fallback: thử lấy từ SSH nếu API không available
            var masterServer = serverData.stream()
                    .filter(s -> s.role == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER &&
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
                fallbackNode.put("role", serverDataItem.role.name());
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
     * Parse workload (Deployment/StatefulSet/DaemonSet) thành Map chung
     */
    private Map<String, Object> parseWorkloadToMap(Object workload) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        if (workload instanceof Deployment dep) {
            map.put("namespace", dep.getMetadata().getNamespace());
            map.put("name", dep.getMetadata().getName());
            int ready = dep.getStatus() != null && dep.getStatus().getReadyReplicas() != null
                    ? dep.getStatus().getReadyReplicas()
                    : 0;
            int replicas = dep.getSpec() != null && dep.getSpec().getReplicas() != null
                    ? dep.getSpec().getReplicas()
                    : 0;
            map.put("ready", ready);
            map.put("desired", replicas);
            map.put("replicas", replicas);
            return map;
        }
        if (workload instanceof StatefulSet sts) {
            map.put("namespace", sts.getMetadata().getNamespace());
            map.put("name", sts.getMetadata().getName());
            int ready = sts.getStatus() != null && sts.getStatus().getReadyReplicas() != null
                    ? sts.getStatus().getReadyReplicas()
                    : 0;
            int replicas = sts.getSpec() != null && sts.getSpec().getReplicas() != null
                    ? sts.getSpec().getReplicas()
                    : 0;
            map.put("ready", ready);
            map.put("desired", replicas);
            map.put("replicas", replicas);
            return map;
        }
        if (workload instanceof DaemonSet ds) {
            map.put("namespace", ds.getMetadata().getNamespace());
            map.put("name", ds.getMetadata().getName());
            int ready = ds.getStatus() != null && ds.getStatus().getNumberReady() != null
                    ? ds.getStatus().getNumberReady()
                    : 0;
            int desired = ds.getStatus() != null && ds.getStatus().getDesiredNumberScheduled() != null
                    ? ds.getStatus().getDesiredNumberScheduled()
                    : 0;
            map.put("ready", ready);
            map.put("desired", desired);
            return map;
        }
        throw new IllegalArgumentException(
                "Unsupported workload type: " + (workload != null ? workload.getClass() : "null"));
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
