package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.K8sServiceDiscoveryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Map;
import io.fabric8.kubernetes.api.model.networking.v1.Ingress;

/**
 * Controller chuyên xử lý các operations liên quan đến Kubernetes Service Discovery
 * (Services, Ingress)
 */
@RestController
@RequestMapping("/admin/cluster")
public class K8sServiceDiscoveryController {

    private final K8sServiceDiscoveryService serviceDiscoveryService;

    public K8sServiceDiscoveryController(K8sServiceDiscoveryService serviceDiscoveryService) {
        this.serviceDiscoveryService = serviceDiscoveryService;
    }

    // ===================== Services Endpoints =====================

    /**
     * Liệt kê services cho cluster duy nhất (không cần ID)
     * Supports optional namespace query parameter to filter services
     */
    @GetMapping("/k8s/services")
    public ResponseEntity<?> listServices(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var serviceList = serviceDiscoveryService.getServices(namespace);
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
     * Describe Service cho cluster duy nhất (không cần ID)
     */
    @GetMapping("/k8s/services/{namespace}/{name}")
    public ResponseEntity<?> describeService(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var service = serviceDiscoveryService.getService(namespace, name);
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
     * Delete Service cho cluster duy nhất (không cần ID) - cấm namespace hệ thống
     */
    @DeleteMapping("/k8s/services/{namespace}/{name}")
    public ResponseEntity<?> deleteService(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa Service trong namespace hệ thống"));
            }

            serviceDiscoveryService.deleteService(namespace, name);
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

    // ===================== Ingress Endpoints =====================

    /**
     * Liệt kê ingress cho cluster duy nhất (không cần ID)
     * Supports optional namespace query parameter to filter ingress
     */
    @GetMapping("/k8s/ingress")
    public ResponseEntity<?> listIngress(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            // Sử dụng Fabric8 Kubernetes Client thay vì SSH kubectl
            var ingressList = serviceDiscoveryService.getIngress(namespace);
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

    /**
     * Describe Ingress cho cluster duy nhất (không cần ID)
     */
    @GetMapping("/k8s/ingress/{namespace}/{name}")
    public ResponseEntity<?> describeIngress(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var ingress = serviceDiscoveryService.getIngress(namespace, name);
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
     * Delete Ingress cho cluster duy nhất (không cần ID) - cấm namespace hệ thống
     */
    @DeleteMapping("/k8s/ingress/{namespace}/{name}")
    public ResponseEntity<?> deleteIngress(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            String nsLower = namespace == null ? "" : namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public") || nsLower.equals("kube-node-lease")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Không cho phép xóa Ingress trong namespace hệ thống"));
            }

            serviceDiscoveryService.deleteIngress(namespace, name);
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

    // ===================== Helper Methods =====================

    /**
     * Parse Service object thành Map format cho API response
     */
    private Map<String, Object> parseServiceToMap(io.fabric8.kubernetes.api.model.Service svc) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", svc.getMetadata() != null ? svc.getMetadata().getNamespace() : "");
        map.put("name", svc.getMetadata() != null ? svc.getMetadata().getName() : "");

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

        // NodePort (for NodePort and LoadBalancer types)
        java.util.List<String> nodePorts = new java.util.ArrayList<>();
        
        // Port mapping chi tiết (targetPort ↔ port ↔ nodePort)
        java.util.List<java.util.Map<String, Object>> portMappings = new java.util.ArrayList<>();
        java.util.List<String> portStrs = new java.util.ArrayList<>();
        
        if (svc.getSpec() != null && svc.getSpec().getPorts() != null) {
            for (var port : svc.getSpec().getPorts()) {
                int svcPort = port.getPort() != null ? port.getPort() : 0;
                Integer nodePort = port.getNodePort();
                String protocol = port.getProtocol() != null ? port.getProtocol() : "TCP";
                String portName = port.getName() != null ? port.getName() : "";

                // Port mapping chi tiết
                java.util.Map<String, Object> portMap = new java.util.HashMap<>();
                portMap.put("port", svcPort);
                portMap.put("protocol", protocol);
                if (!portName.isEmpty()) {
                    portMap.put("name", portName);
                }
                if (nodePort != null && nodePort > 0) {
                    portMap.put("nodePort", nodePort);
                    nodePorts.add(String.valueOf(nodePort));
                }

                if (port.getTargetPort() != null) {
                    String targetPortStr = "";
                    if (port.getTargetPort().getIntVal() != null) {
                        targetPortStr = String.valueOf(port.getTargetPort().getIntVal());
                        portMap.put("targetPort", port.getTargetPort().getIntVal());
                    } else if (port.getTargetPort().getStrVal() != null) {
                        targetPortStr = port.getTargetPort().getStrVal();
                        portMap.put("targetPort", targetPortStr);
                    }
                    
                    if (svcPort > 0) {
                        if (nodePort != null && nodePort > 0) {
                            portStrs.add(targetPortStr + ":" + svcPort + ":" + nodePort + "/" + protocol);
                        } else {
                            portStrs.add(targetPortStr + ":" + svcPort + "/" + protocol);
                        }
                    }
                } else if (svcPort > 0) {
                    if (nodePort != null && nodePort > 0) {
                        portStrs.add(svcPort + ":" + nodePort + "/" + protocol);
                    } else {
                        portStrs.add(svcPort + "/" + protocol);
                    }
                }
                
                if (!portMap.isEmpty()) {
                    portMappings.add(portMap);
                }
            }
        }
        map.put("ports", String.join(", ", portStrs));
        map.put("portMappings", portMappings);
        map.put("nodePorts", nodePorts.isEmpty() ? "" : String.join(", ", nodePorts));

        // Selectors (label chọn Pod)
        java.util.Map<String, String> selectors = new java.util.HashMap<>();
        if (svc.getSpec() != null && svc.getSpec().getSelector() != null) {
            selectors.putAll(svc.getSpec().getSelector());
        }
        map.put("selectors", selectors);

        // Trạng thái expose (kiểm tra xem có endpoints không)
        boolean isExposed = false;
        try {
            var endpoints = serviceDiscoveryService.getEndpoint(svc.getMetadata().getNamespace(), svc.getMetadata().getName());
            if (endpoints != null && endpoints.getSubsets() != null && !endpoints.getSubsets().isEmpty()) {
                for (var subset : endpoints.getSubsets()) {
                    if (subset.getAddresses() != null && !subset.getAddresses().isEmpty()) {
                        isExposed = true;
                        break;
                    }
                }
            }
        } catch (Exception e) {
            // Ignore errors when checking endpoints
        }
        map.put("isExposed", isExposed);
        map.put("exposeStatus", isExposed ? "Active" : "No Endpoints");

        return map;
    }

    /**
     * Parse Ingress object thành Map format cho API response
     */
    private Map<String, Object> parseIngressToMap(Ingress ing) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", ing.getMetadata() != null ? ing.getMetadata().getNamespace() : "");
        map.put("name", ing.getMetadata() != null ? ing.getMetadata().getName() : "");

        // Ingress Class (Ingress Controller)
        String ingressClass = "";
        if (ing.getSpec() != null && ing.getSpec().getIngressClassName() != null) {
            ingressClass = ing.getSpec().getIngressClassName();
        } else if (ing.getMetadata() != null && ing.getMetadata().getAnnotations() != null) {
            // Fallback to annotation for older Ingress resources
            ingressClass = ing.getMetadata().getAnnotations().getOrDefault("kubernetes.io/ingress.class", "");
        }
        map.put("class", ingressClass);
        map.put("ingressController", ingressClass.isEmpty() ? "Unknown" : ingressClass);

        // Age
        String age = "";
        if (ing.getMetadata() != null && ing.getMetadata().getCreationTimestamp() != null) {
            age = calculateAge(ing.getMetadata().getCreationTimestamp().toString());
        }
        map.put("age", age);

        // Collect LoadBalancer addresses (hostname/ip) - Địa chỉ IP/LoadBalancer expose ra ngoài
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
        map.put("address", addressList.isEmpty() ? "<pending>" : addressList.get(0)); // backward compatibility
        map.put("addresses", addressList);
        map.put("loadBalancerIP", addressList.isEmpty() ? "<pending>" : String.join(", ", addressList));

        // Hostnames và Paths với Service backend tương ứng
        java.util.List<String> hostList = new java.util.ArrayList<>();
        java.util.List<java.util.Map<String, Object>> pathBackends = new java.util.ArrayList<>();
        
        if (ing.getSpec() != null && ing.getSpec().getRules() != null) {
            for (var rule : ing.getSpec().getRules()) {
                if (rule == null) {
                    continue;
                }
                String host = rule.getHost() != null ? rule.getHost() : "*";
                if (!host.equals("*") && !hostList.contains(host)) {
                    hostList.add(host);
                }
                
                // Paths và Service backends
                if (rule.getHttp() != null && rule.getHttp().getPaths() != null) {
                    for (var path : rule.getHttp().getPaths()) {
                        if (path == null) continue;
                        
                        java.util.Map<String, Object> pathBackend = new java.util.HashMap<>();
                        pathBackend.put("host", host);
                        pathBackend.put("path", path.getPath() != null ? path.getPath() : "/");
                        pathBackend.put("pathType", path.getPathType() != null ? path.getPathType() : "Prefix");
                        
                        if (path.getBackend() != null && path.getBackend().getService() != null) {
                            var svc = path.getBackend().getService();
                            pathBackend.put("serviceName", svc.getName() != null ? svc.getName() : "");
                            pathBackend.put("servicePort", svc.getPort() != null && svc.getPort().getNumber() != null 
                                    ? svc.getPort().getNumber() : (svc.getPort() != null && svc.getPort().getName() != null 
                                    ? svc.getPort().getName() : ""));
                        }
                        
                        pathBackends.add(pathBackend);
                    }
                }
            }
        }
        map.put("host", hostList.isEmpty() ? "*" : hostList.get(0)); // backward compatibility
        map.put("hosts", hostList);
        map.put("hostnames", hostList);
        map.put("paths", pathBackends);

        // TLS/SSL configuration
        boolean hasTls = false;
        java.util.List<String> tlsHosts = new java.util.ArrayList<>();
        java.util.List<String> tlsSecrets = new java.util.ArrayList<>();
        
        if (ing.getSpec() != null && ing.getSpec().getTls() != null && !ing.getSpec().getTls().isEmpty()) {
            hasTls = true;
            for (var tls : ing.getSpec().getTls()) {
                if (tls.getHosts() != null) {
                    tlsHosts.addAll(tls.getHosts());
                }
                if (tls.getSecretName() != null && !tls.getSecretName().isEmpty()) {
                    tlsSecrets.add(tls.getSecretName());
                }
            }
        }
        map.put("hasTls", hasTls);
        map.put("tlsHosts", tlsHosts);
        map.put("tlsSecrets", tlsSecrets);
        map.put("tlsConfig", hasTls ? "Yes (" + tlsSecrets.size() + " secret(s))" : "No");

        // Determine exposed ports (best-effort: 443 when TLS present, otherwise 80)
        java.util.List<String> portList = new java.util.ArrayList<>();
        portList.add("80");
        if (hasTls) {
            portList.add("443");
        }
        map.put("ports", portList);

        return map;
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

