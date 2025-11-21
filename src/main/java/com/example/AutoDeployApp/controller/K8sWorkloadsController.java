package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.K8sWorkloadsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.util.List;
import java.util.Map;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.ContainerStatus;
import io.fabric8.kubernetes.api.model.OwnerReference;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.StatefulSet;
import io.fabric8.kubernetes.api.model.apps.DaemonSet;
import io.fabric8.kubernetes.api.model.batch.v1.CronJob;
import io.fabric8.kubernetes.api.model.batch.v1.Job;

/**
 * Controller chuyên xử lý các operations liên quan đến Kubernetes Workloads
 * (Deployments, StatefulSets, DaemonSets, CronJobs, Jobs, Pods)
 */
@RestController
@RequestMapping("/admin/cluster")
public class K8sWorkloadsController {

    private final K8sWorkloadsService k8sWorkloadsService;

    public K8sWorkloadsController(K8sWorkloadsService k8sWorkloadsService) {
        this.k8sWorkloadsService = k8sWorkloadsService;
    }

    // ===================== List Endpoints =====================

    /**
     * Lấy danh sách Deployments cho cluster duy nhất
     * Supports optional namespace query parameter to filter deployments
     */
    @GetMapping("/k8s/workloads/deployments")
    public ResponseEntity<?> listDeployments(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var deployments = k8sWorkloadsService.getDeployments(namespace);
            java.util.List<java.util.Map<String, Object>> deploymentList = deployments.getItems().stream()
                    .map(dep -> parseWorkloadToMap(dep))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("deployments", deploymentList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "deployments", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to get deployments: " + e.getMessage(),
                    "deployments", new java.util.ArrayList<>()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "error", e.getMessage(),
                    "deployments", new java.util.ArrayList<>()));
        }
    }

    /**
     * Lấy danh sách StatefulSets cho cluster duy nhất
     * Supports optional namespace query parameter to filter statefulsets
     */
    @GetMapping("/k8s/workloads/statefulsets")
    public ResponseEntity<?> listStatefulSets(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var statefulSets = k8sWorkloadsService.getStatefulSets(namespace);
            java.util.List<java.util.Map<String, Object>> statefulSetList = statefulSets.getItems().stream()
                    .map(sts -> parseWorkloadToMap(sts))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("statefulSets", statefulSetList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "statefulSets", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to get statefulsets: " + e.getMessage(),
                    "statefulSets", new java.util.ArrayList<>()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "error", e.getMessage(),
                    "statefulSets", new java.util.ArrayList<>()));
        }
    }

    /**
     * Lấy danh sách DaemonSets cho cluster duy nhất
     * Supports optional namespace query parameter to filter daemonsets
     */
    @GetMapping("/k8s/workloads/daemonsets")
    public ResponseEntity<?> listDaemonSets(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var daemonSets = k8sWorkloadsService.getDaemonSets(namespace);
            java.util.List<java.util.Map<String, Object>> daemonSetList = daemonSets.getItems().stream()
                    .map(ds -> parseWorkloadToMap(ds))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("daemonSets", daemonSetList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "daemonSets", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to get daemonsets: " + e.getMessage(),
                    "daemonSets", new java.util.ArrayList<>()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "error", e.getMessage(),
                    "daemonSets", new java.util.ArrayList<>()));
        }
    }

    /**
     * Lấy danh sách CronJobs cho cluster duy nhất
     * Supports optional namespace query parameter to filter cronjobs
     */
    @GetMapping("/k8s/workloads/cronjobs")
    public ResponseEntity<?> listCronJobs(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var cronJobs = k8sWorkloadsService.getCronJobs(namespace);
            java.util.List<java.util.Map<String, Object>> cronJobList = cronJobs.getItems().stream()
                    .map(cj -> parseCronJobToMap(cj))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("cronJobs", cronJobList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "cronJobs", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to get cronjobs: " + e.getMessage(),
                    "cronJobs", new java.util.ArrayList<>()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "error", e.getMessage(),
                    "cronJobs", new java.util.ArrayList<>()));
        }
    }

    /**
     * Lấy danh sách Jobs cho cluster duy nhất
     * Supports optional namespace query parameter to filter jobs
     */
    @GetMapping("/k8s/workloads/jobs")
    public ResponseEntity<?> listJobs(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var jobs = k8sWorkloadsService.getJobs(namespace);
            java.util.List<java.util.Map<String, Object>> jobList = jobs.getItems().stream()
                    .map(j -> parseJobToMap(j))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("jobs", jobList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "jobs", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to get jobs: " + e.getMessage(),
                    "jobs", new java.util.ArrayList<>()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "error", e.getMessage(),
                    "jobs", new java.util.ArrayList<>()));
        }
    }

    /**
     * Lấy danh sách Pods cho cluster duy nhất
     * Supports optional namespace query parameter to filter pods
     */
    @GetMapping("/k8s/workloads/pods")
    public ResponseEntity<?> listPodsForWorkloads(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var pods = k8sWorkloadsService.getPods(namespace);
            java.util.List<java.util.Map<String, Object>> podList = pods.getItems().stream()
                    .map(pod -> parsePodToMap(pod))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("pods", podList));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "pods", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Failed to get pods: " + e.getMessage(),
                    "pods", new java.util.ArrayList<>()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of(
                    "error", e.getMessage(),
                    "pods", new java.util.ArrayList<>()));
        }
    }

    // ===================== Describe/Get Endpoints =====================

    /**
     * Describe workload cho cluster duy nhất (không cần ID)
     * Supports optional format query parameter: json (default) or yaml
     */
    @GetMapping("/k8s/{type}/{namespace}/{name}")
    public ResponseEntity<?> describeWorkload(
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            @RequestParam(required = false, defaultValue = "json") String format,
            HttpServletRequest request) {
        try {
            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset") || t.equals("daemonset") 
                    || t.equals("cronjob") || t.equals("job") || t.equals("pod"))) {
                return ResponseEntity.badRequest().body(Map.of("error", "Loại workload không hợp lệ"));
            }

            Object workload = null;
            switch (t) {
                case "deployment":
                    workload = k8sWorkloadsService.getDeployment(namespace, name);
                    break;
                case "statefulset":
                    workload = k8sWorkloadsService.getStatefulSet(namespace, name);
                    break;
                case "daemonset":
                    workload = k8sWorkloadsService.getDaemonSet(namespace, name);
                    break;
                case "cronjob":
                    workload = k8sWorkloadsService.getCronJob(namespace, name);
                    break;
                case "job":
                    workload = k8sWorkloadsService.getJob(namespace, name);
                    break;
                case "pod":
                    workload = k8sWorkloadsService.getPod(namespace, name);
                    break;
                default:
                    return ResponseEntity.badRequest().body(Map.of("error", "Invalid workload type: " + type));
            }

            if (workload == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", type + " not found: " + name + " in namespace " + namespace));
            }

            String output;
            String outputFormat = format != null ? format.toLowerCase() : "json";
            
            if ("yaml".equals(outputFormat)) {
                // Convert to YAML using Jackson YAML
                try {
                    var yamlMapper = new com.fasterxml.jackson.dataformat.yaml.YAMLMapper();
                    output = yamlMapper.writeValueAsString(workload);
                } catch (Exception e) {
                    // Fallback to JSON if YAML conversion fails
                    var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    output = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(workload);
                    outputFormat = "json";
                }
            } else {
                // Default to JSON
                var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                output = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(workload);
            }
            
            return ResponseEntity.ok(Map.of("output", output, "format", outputFormat));
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

    // ===================== Scale Endpoint =====================

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
     * Scale workload cho cluster duy nhất (không cần ID)
     * Supports Deployment and StatefulSet only
     */
    @PostMapping("/k8s/{type}/{namespace}/{name}/scale")
    public ResponseEntity<?> scaleWorkload(
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
                    k8sWorkloadsService.scaleDeployment(namespace, name, replicas);
                    break;
                case "statefulset":
                    k8sWorkloadsService.scaleStatefulSet(namespace, name, replicas);
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

    // ===================== Deployment Operations =====================

    /**
     * Restart deployment (rollout restart)
     */
    @PostMapping("/k8s/deployment/{namespace}/{name}/restart")
    public ResponseEntity<?> restartDeployment(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            k8sWorkloadsService.restartDeployment(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Deployment " + namespace + "/" + name + " restarted successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Rollback deployment (rollout undo) - rollback về revision trước đó hoặc revision cụ thể
     */
    @PostMapping("/k8s/deployment/{namespace}/{name}/rollback")
    public ResponseEntity<?> rollbackDeployment(
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest request) {
        try {
            Integer toRevision = null;
            if (body != null && body.containsKey("toRevision")) {
                Object revObj = body.get("toRevision");
                if (revObj instanceof Number) {
                    toRevision = ((Number) revObj).intValue();
                } else if (revObj instanceof String) {
                    try {
                        toRevision = Integer.parseInt((String) revObj);
                    } catch (NumberFormatException e) {
                        // Ignore
                    }
                }
            }
            
            k8sWorkloadsService.rollbackDeployment(namespace, name, toRevision);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Deployment " + namespace + "/" + name + " rolled back successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Lấy rollout history của deployment
     */
    @GetMapping("/k8s/deployment/{namespace}/{name}/history")
    public ResponseEntity<?> getDeploymentHistory(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            List<Map<String, Object>> history = k8sWorkloadsService.getDeploymentRolloutHistory(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "history", history));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Rolling update deployment - cập nhật image của container
     */
    @PostMapping("/k8s/deployment/{namespace}/{name}/update-image")
    public ResponseEntity<?> updateDeploymentImage(
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String containerName = body.get("containerName");
            String newImage = body.get("newImage");
            
            if (containerName == null || containerName.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "containerName is required"));
            }
            if (newImage == null || newImage.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "newImage is required"));
            }
            
            k8sWorkloadsService.updateDeploymentImage(namespace, name, containerName, newImage);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Updated image for container " + containerName + " in deployment " + namespace + "/" + name));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== StatefulSet Operations =====================
    
    /**
     * Lấy danh sách volumes (PVCs) của StatefulSet
     */
    @GetMapping("/k8s/statefulset/{namespace}/{name}/volumes")
    public ResponseEntity<?> getStatefulSetVolumes(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            List<Map<String, Object>> volumes = k8sWorkloadsService.getStatefulSetVolumes(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "volumes", volumes));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Rolling update StatefulSet - cập nhật image của container
     */
    @PostMapping("/k8s/statefulset/{namespace}/{name}/update-image")
    public ResponseEntity<?> updateStatefulSetImage(
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String containerName = body.get("containerName");
            String newImage = body.get("newImage");
            
            if (containerName == null || containerName.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "containerName is required"));
            }
            if (newImage == null || newImage.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "newImage is required"));
            }
            
            k8sWorkloadsService.updateStatefulSetImage(namespace, name, containerName, newImage);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Updated image for container " + containerName + " in statefulset " + namespace + "/" + name));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== DaemonSet Operations =====================
    
    /**
     * Rolling update DaemonSet - cập nhật image của container
     */
    @PostMapping("/k8s/daemonset/{namespace}/{name}/update-image")
    public ResponseEntity<?> updateDaemonSetImage(
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody Map<String, String> body,
            HttpServletRequest request) {
        try {
            String containerName = body.get("containerName");
            String newImage = body.get("newImage");
            
            if (containerName == null || containerName.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "containerName is required"));
            }
            if (newImage == null || newImage.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "newImage is required"));
            }
            
            k8sWorkloadsService.updateDaemonSetImage(namespace, name, containerName, newImage);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Updated image for container " + containerName + " in daemonset " + namespace + "/" + name));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== CronJob Operations =====================
    
    /**
     * Lấy lịch sử Jobs được tạo từ CronJob
     */
    @GetMapping("/k8s/cronjob/{namespace}/{name}/jobs")
    public ResponseEntity<?> getCronJobJobs(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            List<Map<String, Object>> jobs = k8sWorkloadsService.getCronJobJobs(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "jobs", jobs));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Suspend CronJob (tạm dừng lịch chạy)
     */
    @PostMapping("/k8s/cronjob/{namespace}/{name}/suspend")
    public ResponseEntity<?> suspendCronJob(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            k8sWorkloadsService.suspendCronJob(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "CronJob " + namespace + "/" + name + " suspended successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Resume CronJob (tiếp tục lịch chạy)
     */
    @PostMapping("/k8s/cronjob/{namespace}/{name}/resume")
    public ResponseEntity<?> resumeCronJob(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            k8sWorkloadsService.resumeCronJob(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "CronJob " + namespace + "/" + name + " resumed successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== Pod Operations =====================

    /**
     * Lấy logs của pod
     */
    @GetMapping("/k8s/pods/{namespace}/{name}/logs")
    public ResponseEntity<?> getPodLogs(
            @PathVariable String namespace,
            @PathVariable String name,
            @RequestParam(required = false) String container,
            @RequestParam(defaultValue = "100") int tailLines,
            HttpServletRequest request) {
        try {
            String logs = k8sWorkloadsService.getPodLogs(namespace, name, container, tailLines);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "logs", logs,
                    "namespace", namespace,
                    "pod", name,
                    "container", container != null ? container : ""));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Lấy danh sách containers trong pod
     */
    @GetMapping("/k8s/pods/{namespace}/{name}/containers")
    public ResponseEntity<?> getPodContainers(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            java.util.List<String> containers = k8sWorkloadsService.getPodContainers(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "containers", containers));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Exec command trong pod (non-interactive)
     */
    @PostMapping("/k8s/pods/{namespace}/{name}/exec")
    public ResponseEntity<?> execPodCommand(
            @PathVariable String namespace,
            @PathVariable String name,
            @org.springframework.web.bind.annotation.RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try {
            String container = (String) body.getOrDefault("container", null);
            String command = (String) body.get("command");
            
            if (command == null || command.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Command is required"));
            }
            
            String output = k8sWorkloadsService.execPodCommand(namespace, name, container, command);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "output", output,
                    "namespace", namespace,
                    "pod", name,
                    "container", container != null ? container : "",
                    "command", command));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== Delete Endpoint =====================

    /**
     * Delete workload cho cluster duy nhất (không cần ID)
     */
    @DeleteMapping("/k8s/{type}/{namespace}/{name}")
    public ResponseEntity<?> deleteWorkload(
            @PathVariable String type,
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            String t = type == null ? "" : type.toLowerCase();
            if (!(t.equals("deployment") || t.equals("statefulset") || t.equals("daemonset") 
                    || t.equals("cronjob") || t.equals("job") || t.equals("pod"))) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Loại workload không hợp lệ"));
            }

            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            String nameLower = name == null ? "" : name.toLowerCase();
            
            // Cho phép xóa một số workloads đặc biệt ngay cả khi nằm trong namespace hệ thống
            boolean isAllowedSpecialWorkload = 
                (nsLower.equals("kube-system") && nameLower.equals("metrics-server")) ||
                (nsLower.equals("nfs-provisioner") && nameLower.equals("nfs-client-provisioner")) ||
                (nsLower.equals("default") && nameLower.equals("nfs-client-provisioner"));
            
            // Chặn xóa trong namespace hệ thống trừ các workloads đặc biệt được phép
            if ((nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) 
                    && !isAllowedSpecialWorkload) {
                return ResponseEntity.badRequest().body(Map.of("error", "Không cho phép xóa trong namespace hệ thống"));
            }

            String output;
            switch (t) {
                case "deployment":
                    k8sWorkloadsService.deleteDeployment(namespace, name);
                    output = String.format("deployment.apps \"%s\" deleted", name);
                    break;
                case "statefulset":
                    k8sWorkloadsService.deleteStatefulSet(namespace, name);
                    output = String.format("statefulset.apps \"%s\" deleted", name);
                    break;
                case "daemonset":
                    k8sWorkloadsService.deleteDaemonSet(namespace, name);
                    output = String.format("daemonset.apps \"%s\" deleted", name);
                    break;
                case "cronjob":
                    k8sWorkloadsService.deleteCronJob(namespace, name);
                    output = String.format("cronjob.batch \"%s\" deleted", name);
                    break;
                case "job":
                    k8sWorkloadsService.deleteJob(namespace, name);
                    output = String.format("job.batch \"%s\" deleted", name);
                    break;
                case "pod":
                    k8sWorkloadsService.deletePod(namespace, name);
                    output = String.format("pod \"%s\" deleted", name);
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

    // ===================== Helper Methods =====================

    /**
     * Parse workload (Deployment/StatefulSet/DaemonSet) thành Map chung
     */
    private Map<String, Object> parseWorkloadToMap(Object workload) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        
        // Common fields
        String namespace = "";
        String name = "";
        String creationTimestamp = "";
        
        if (workload instanceof Deployment dep) {
            namespace = dep.getMetadata() != null ? dep.getMetadata().getNamespace() : "";
            name = dep.getMetadata() != null ? dep.getMetadata().getName() : "";
            if (dep.getMetadata() != null && dep.getMetadata().getCreationTimestamp() != null) {
                creationTimestamp = dep.getMetadata().getCreationTimestamp().toString();
            }
            
            int ready = dep.getStatus() != null && dep.getStatus().getReadyReplicas() != null
                    ? dep.getStatus().getReadyReplicas()
                    : 0;
            int replicas = dep.getSpec() != null && dep.getSpec().getReplicas() != null
                    ? dep.getSpec().getReplicas()
                    : 0;
            int updated = dep.getStatus() != null && dep.getStatus().getUpdatedReplicas() != null
                    ? dep.getStatus().getUpdatedReplicas()
                    : 0;
            int available = dep.getStatus() != null && dep.getStatus().getAvailableReplicas() != null
                    ? dep.getStatus().getAvailableReplicas()
                    : 0;
            
            // Lấy rollout status từ conditions
            String rolloutStatus = "Unknown";
            if (dep.getStatus() != null && dep.getStatus().getConditions() != null) {
                for (var condition : dep.getStatus().getConditions()) {
                    if (condition != null && condition.getType() != null) {
                        if ("Progressing".equals(condition.getType())) {
                            if ("True".equals(condition.getStatus())) {
                                String reason = condition.getReason() != null ? condition.getReason() : "";
                                if ("NewReplicaSetAvailable".equals(reason)) {
                                    rolloutStatus = "Complete";
                                } else if ("ReplicaSetUpdated".equals(reason)) {
                                    rolloutStatus = "Progressing";
                                } else {
                                    rolloutStatus = "Progressing";
                                }
                            } else {
                                rolloutStatus = "Failed";
                            }
                        } else if ("Available".equals(condition.getType()) && "False".equals(condition.getStatus())) {
                            rolloutStatus = "Degraded";
                        }
                    }
                }
            }
            
            // Lấy image từ containers
            String image = "N/A";
            if (dep.getSpec() != null && dep.getSpec().getTemplate() != null
                    && dep.getSpec().getTemplate().getSpec() != null
                    && dep.getSpec().getTemplate().getSpec().getContainers() != null
                    && !dep.getSpec().getTemplate().getSpec().getContainers().isEmpty()) {
                image = dep.getSpec().getTemplate().getSpec().getContainers().get(0).getImage();
                if (image == null || image.isEmpty()) {
                    image = "N/A";
                }
            }
            
            map.put("namespace", namespace);
            map.put("name", name);
            map.put("ready", ready);
            map.put("desired", replicas);
            map.put("replicas", replicas);
            map.put("updated", updated);
            map.put("available", available);
            map.put("rolloutStatus", rolloutStatus);
            map.put("image", image);
            map.put("age", calculateAge(creationTimestamp));
            return map;
        }
        if (workload instanceof StatefulSet sts) {
            namespace = sts.getMetadata() != null ? sts.getMetadata().getNamespace() : "";
            name = sts.getMetadata() != null ? sts.getMetadata().getName() : "";
            if (sts.getMetadata() != null && sts.getMetadata().getCreationTimestamp() != null) {
                creationTimestamp = sts.getMetadata().getCreationTimestamp().toString();
            }
            
            int ready = sts.getStatus() != null && sts.getStatus().getReadyReplicas() != null
                    ? sts.getStatus().getReadyReplicas()
                    : 0;
            int replicas = sts.getSpec() != null && sts.getSpec().getReplicas() != null
                    ? sts.getSpec().getReplicas()
                    : 0;
            int current = sts.getStatus() != null && sts.getStatus().getCurrentReplicas() != null
                    ? sts.getStatus().getCurrentReplicas()
                    : 0;
            
            // Update status: currentRevision và updateRevision
            String currentRevision = "";
            String updateRevision = "";
            if (sts.getStatus() != null) {
                currentRevision = sts.getStatus().getCurrentRevision() != null 
                        ? sts.getStatus().getCurrentRevision() 
                        : "";
                updateRevision = sts.getStatus() != null && sts.getStatus().getUpdateRevision() != null
                        ? sts.getStatus().getUpdateRevision()
                        : "";
            }
            
            // Lấy danh sách Pods (tên pods)
            java.util.List<String> podNames = new java.util.ArrayList<>();
            try {
                var podList = k8sWorkloadsService.getPods(namespace);
                String stsName = name;
                if (podList != null && podList.getItems() != null) {
                    for (Pod pod : podList.getItems()) {
                        if (pod.getMetadata() != null && pod.getMetadata().getName() != null
                                && pod.getMetadata().getOwnerReferences() != null) {
                            for (OwnerReference owner : pod.getMetadata().getOwnerReferences()) {
                                if (owner.getKind() != null && owner.getKind().equals("StatefulSet")
                                        && owner.getName() != null && owner.getName().equals(stsName)) {
                                    podNames.add(pod.getMetadata().getName());
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (Exception e) {
                // Ignore errors when fetching pods
            }
            
            // Đếm số PVCs
            int pvcCount = 0;
            try {
                var volumes = k8sWorkloadsService.getStatefulSetVolumes(namespace, name);
                pvcCount = volumes != null ? volumes.size() : 0;
            } catch (Exception e) {
                // Ignore errors when fetching PVCs
            }
            
            map.put("namespace", namespace);
            map.put("name", name);
            map.put("ready", ready);
            map.put("desired", replicas);
            map.put("replicas", replicas);
            map.put("current", current);
            map.put("podNames", podNames);
            map.put("pvcCount", pvcCount);
            map.put("currentRevision", currentRevision);
            map.put("updateRevision", updateRevision);
            map.put("age", calculateAge(creationTimestamp));
            map.put("serviceName", k8sWorkloadsService.getStatefulSetServiceName(sts));
            map.put("volumeTemplates", k8sWorkloadsService.getStatefulSetVolumeTemplates(sts));
            return map;
        }
        if (workload instanceof DaemonSet ds) {
            namespace = ds.getMetadata() != null ? ds.getMetadata().getNamespace() : "";
            name = ds.getMetadata() != null ? ds.getMetadata().getName() : "";
            if (ds.getMetadata() != null && ds.getMetadata().getCreationTimestamp() != null) {
                creationTimestamp = ds.getMetadata().getCreationTimestamp().toString();
            }
            
            int ready = ds.getStatus() != null && ds.getStatus().getNumberReady() != null
                    ? ds.getStatus().getNumberReady()
                    : 0;
            int desired = ds.getStatus() != null && ds.getStatus().getDesiredNumberScheduled() != null
                    ? ds.getStatus().getDesiredNumberScheduled()
                    : 0;
            int current = ds.getStatus() != null && ds.getStatus().getCurrentNumberScheduled() != null
                    ? ds.getStatus().getCurrentNumberScheduled()
                    : 0;
            int updated = ds.getStatus() != null && ds.getStatus().getUpdatedNumberScheduled() != null
                    ? ds.getStatus().getUpdatedNumberScheduled()
                    : 0;
            int available = ds.getStatus() != null && ds.getStatus().getNumberAvailable() != null
                    ? ds.getStatus().getNumberAvailable()
                    : 0;
            
            // Lấy image từ containers
            String image = "N/A";
            if (ds.getSpec() != null && ds.getSpec().getTemplate() != null
                    && ds.getSpec().getTemplate().getSpec() != null
                    && ds.getSpec().getTemplate().getSpec().getContainers() != null
                    && !ds.getSpec().getTemplate().getSpec().getContainers().isEmpty()) {
                image = ds.getSpec().getTemplate().getSpec().getContainers().get(0).getImage();
                if (image == null || image.isEmpty()) {
                    image = "N/A";
                }
            }
            
            // Rollout status từ conditions
            String rolloutStatus = "Available";
            if (ds.getStatus() != null && ds.getStatus().getConditions() != null) {
                for (io.fabric8.kubernetes.api.model.apps.DaemonSetCondition condition : ds.getStatus().getConditions()) {
                    if (condition.getType() != null && condition.getStatus() != null) {
                        if ("Progressing".equals(condition.getType())) {
                            if ("True".equals(condition.getStatus())) {
                                rolloutStatus = "Progressing";
                            } else {
                                rolloutStatus = "Failed";
                            }
                        } else if ("Available".equals(condition.getType()) && "False".equals(condition.getStatus())) {
                            rolloutStatus = "Degraded";
                        }
                    }
                }
            }
            
            // Số Pod trên mỗi node (tính trung bình hoặc tổng số pods)
            int podsPerNode = desired > 0 ? (ready / desired) : 0;
            
            map.put("namespace", namespace);
            map.put("name", name);
            map.put("ready", ready);
            map.put("desired", desired);
            map.put("current", current);
            map.put("updated", updated);
            map.put("available", available);
            map.put("image", image);
            map.put("rolloutStatus", rolloutStatus);
            map.put("podsPerNode", podsPerNode);
            map.put("age", calculateAge(creationTimestamp));
            return map;
        }
        throw new IllegalArgumentException(
                "Unsupported workload type: " + (workload != null ? workload.getClass() : "null"));
    }

    /**
     * Parse CronJob object thành Map format cho API response
     */
    private Map<String, Object> parseCronJobToMap(CronJob cronJob) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        String namespace = cronJob.getMetadata() != null ? cronJob.getMetadata().getNamespace() : "";
        String name = cronJob.getMetadata() != null ? cronJob.getMetadata().getName() : "";
        String creationTimestamp = "";
        if (cronJob.getMetadata() != null && cronJob.getMetadata().getCreationTimestamp() != null) {
            creationTimestamp = cronJob.getMetadata().getCreationTimestamp().toString();
        }

        // Active jobs count
        int active = cronJob.getStatus() != null && cronJob.getStatus().getActive() != null
                ? cronJob.getStatus().getActive().size()
                : 0;

        // Last schedule time
        String lastSchedule = "";
        if (cronJob.getStatus() != null && cronJob.getStatus().getLastScheduleTime() != null) {
            lastSchedule = calculateAge(cronJob.getStatus().getLastScheduleTime().toString());
        }

        // Schedule
        String schedule = "";
        if (cronJob.getSpec() != null && cronJob.getSpec().getSchedule() != null) {
            schedule = cronJob.getSpec().getSchedule();
        }

        // Suspend status
        boolean suspended = cronJob.getSpec() != null && cronJob.getSpec().getSuspend() != null
                ? cronJob.getSpec().getSuspend()
                : false;
        
        // Status string
        String status = suspended ? "Suspended" : (active > 0 ? "Active" : "Inactive");

        // Giới hạn lịch sử Job
        int successfulJobsHistoryLimit = 3; // default
        int failedJobsHistoryLimit = 1; // default
        if (cronJob.getSpec() != null) {
            if (cronJob.getSpec().getSuccessfulJobsHistoryLimit() != null) {
                successfulJobsHistoryLimit = cronJob.getSpec().getSuccessfulJobsHistoryLimit();
            }
            if (cronJob.getSpec().getFailedJobsHistoryLimit() != null) {
                failedJobsHistoryLimit = cronJob.getSpec().getFailedJobsHistoryLimit();
            }
        }

        map.put("namespace", namespace);
        map.put("name", name);
        map.put("schedule", schedule);
        map.put("suspend", suspended);
        map.put("status", status);
        map.put("active", active);
        map.put("lastSchedule", lastSchedule);
        map.put("lastRun", cronJob.getStatus() != null && cronJob.getStatus().getLastScheduleTime() != null
                ? cronJob.getStatus().getLastScheduleTime().toString()
                : "");
        map.put("successfulJobsHistoryLimit", successfulJobsHistoryLimit);
        map.put("failedJobsHistoryLimit", failedJobsHistoryLimit);
        map.put("age", calculateAge(creationTimestamp));
        return map;
    }

    /**
     * Parse Job object thành Map format cho API response
     */
    private Map<String, Object> parseJobToMap(Job job) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        String namespace = job.getMetadata() != null ? job.getMetadata().getNamespace() : "";
        String name = job.getMetadata() != null ? job.getMetadata().getName() : "";
        String creationTimestamp = "";
        if (job.getMetadata() != null && job.getMetadata().getCreationTimestamp() != null) {
            creationTimestamp = job.getMetadata().getCreationTimestamp().toString();
        }

        // Completions
        int completions = 0;
        int succeeded = 0;
        int active = 0;
        int failed = 0;

        if (job.getSpec() != null && job.getSpec().getCompletions() != null) {
            completions = job.getSpec().getCompletions();
        }

        if (job.getStatus() != null) {
            if (job.getStatus().getSucceeded() != null) {
                succeeded = job.getStatus().getSucceeded();
            }
            if (job.getStatus().getActive() != null) {
                active = job.getStatus().getActive();
            }
            if (job.getStatus().getFailed() != null) {
                failed = job.getStatus().getFailed();
            }
        }
        
        // Số Pod (tổng số pods của job)
        int podCount = succeeded + active + failed;
        
        // Trạng thái
        String status = "Unknown";
        if (completions > 0 && succeeded >= completions) {
            status = "Complete";
        } else if (failed > 0) {
            status = "Failed";
        } else if (active > 0) {
            status = "Running";
        } else if (succeeded > 0) {
            status = "Succeeded";
        }
        
        // Thời gian (start time và completion time)
        String startTime = "";
        String completionTime = "";
        if (job.getStatus() != null) {
            if (job.getStatus().getStartTime() != null) {
                startTime = calculateAge(job.getStatus().getStartTime().toString());
            }
            if (job.getStatus().getCompletionTime() != null) {
                completionTime = calculateAge(job.getStatus().getCompletionTime().toString());
            }
        }
        String duration = "";
        if (job.getStatus() != null && job.getStatus().getStartTime() != null && job.getStatus().getCompletionTime() != null) {
            try {
                var start = java.time.Instant.parse(job.getStatus().getStartTime().toString());
                var end = java.time.Instant.parse(job.getStatus().getCompletionTime().toString());
                var dur = java.time.Duration.between(start, end);
                long minutes = dur.toMinutes();
                long seconds = dur.getSeconds() % 60;
                duration = (minutes > 0 ? minutes + "m " : "") + seconds + "s";
            } catch (Exception ignored) {}
        }
        
        // Retry config
        int backoffLimit = 6; // default
        Long activeDeadlineSeconds = null;
        if (job.getSpec() != null) {
            if (job.getSpec().getBackoffLimit() != null) {
                backoffLimit = job.getSpec().getBackoffLimit();
            }
            if (job.getSpec().getActiveDeadlineSeconds() != null) {
                activeDeadlineSeconds = job.getSpec().getActiveDeadlineSeconds();
            }
        }
        
        String retryConfig = "BackoffLimit: " + backoffLimit;
        if (activeDeadlineSeconds != null) {
            retryConfig += ", Deadline: " + (activeDeadlineSeconds / 60) + "m";
        }

        map.put("namespace", namespace);
        map.put("name", name);
        map.put("completions", completions);
        map.put("succeeded", succeeded);
        map.put("active", active);
        map.put("failed", failed);
        map.put("podCount", podCount);
        map.put("status", status);
        map.put("startTime", startTime);
        map.put("completionTime", completionTime);
        map.put("duration", duration);
        map.put("succeeded", succeeded);
        map.put("retryConfig", retryConfig);
        map.put("age", calculateAge(creationTimestamp));
        return map;
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
        
        // Add labels for filtering
        java.util.Map<String, String> labels = new java.util.HashMap<>();
        if (pod.getMetadata() != null && pod.getMetadata().getLabels() != null) {
            labels.putAll(pod.getMetadata().getLabels());
        }
        map.put("labels", labels);

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
        
        int restartTotal = 0;
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
                if (cs.getRestartCount() != null) {
                    restartTotal += cs.getRestartCount();
                }

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
        map.put("restarts", restartTotal);
        map.put("hostname", pod.getSpec() != null ? pod.getSpec().getHostname() : "");
        if (pod.getMetadata() != null && pod.getMetadata().getOwnerReferences() != null) {
            java.util.List<Map<String, String>> owners = new java.util.ArrayList<>();
            for (OwnerReference owner : pod.getMetadata().getOwnerReferences()) {
                java.util.Map<String, String> ownerMap = new java.util.HashMap<>();
                ownerMap.put("kind", owner.getKind());
                ownerMap.put("name", owner.getName());
                owners.add(ownerMap);
            }
            map.put("ownerReferences", owners);
        } else {
            map.put("ownerReferences", java.util.Collections.emptyList());
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
}

