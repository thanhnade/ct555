package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.KubernetesService;
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

    private final KubernetesService kubernetesService;

    public K8sServiceDiscoveryController(KubernetesService kubernetesService) {
        this.kubernetesService = kubernetesService;
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
            var serviceList = kubernetesService.getServices(namespace);
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
            var service = kubernetesService.getService(namespace, name);
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

            kubernetesService.deleteService(namespace, name);
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
            var ingressList = kubernetesService.getIngress(namespace);
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
            var ingress = kubernetesService.getIngress(namespace, name);
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

            kubernetesService.deleteIngress(namespace, name);
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
            var endpoints = kubernetesService.getEndpoint(svc.getMetadata().getNamespace(), svc.getMetadata().getName());
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

    // ===================== Endpoints Endpoints =====================

    /**
     * Liệt kê endpoints cho cluster duy nhất (không cần ID)
     * Supports optional namespace query parameter to filter endpoints
     */
    @GetMapping("/k8s/endpoints")
    public ResponseEntity<?> listEndpoints(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var endpointsList = kubernetesService.getEndpoints(namespace);
            java.util.List<java.util.Map<String, Object>> result = endpointsList.getItems().stream()
                    .map(ep -> parseEndpointToMap(ep))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("endpoints", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "endpoints", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get endpoints: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * Describe Endpoint cho cluster duy nhất (không cần ID)
     */
    @GetMapping("/k8s/endpoints/{namespace}/{name}")
    public ResponseEntity<?> describeEndpoint(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try {
            var endpoint = kubernetesService.getEndpoint(namespace, name);
            if (endpoint == null) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Endpoint not found: " + name + " in namespace " + namespace));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(endpoint);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404)
                        .body(Map.of("error", "Endpoint not found: " + name + " in namespace " + namespace));
            }
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of("error", "Kubernetes API server unavailable"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe endpoint: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== CoreDNS Endpoints =====================

    /**
     * Liệt kê CoreDNS pods cho cluster duy nhất
     */
    @GetMapping("/k8s/coredns")
    public ResponseEntity<?> listCoreDNS(
            HttpServletRequest request) {
        try {
            var corednsPods = kubernetesService.getCoreDNSPods();
            java.util.List<java.util.Map<String, Object>> result = corednsPods.getItems().stream()
                    .map(pod -> parseCoreDNSToMap(pod))
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(Map.of("coredns", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "coredns", new java.util.ArrayList<>()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get CoreDNS pods: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== Helper Methods =====================

    /**
     * Parse Endpoint object thành Map format cho API response
     */
    private Map<String, Object> parseEndpointToMap(io.fabric8.kubernetes.api.model.Endpoints ep) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        map.put("namespace", ep.getMetadata() != null ? ep.getMetadata().getNamespace() : "");
        map.put("name", ep.getMetadata() != null ? ep.getMetadata().getName() : "");

        // Age
        String age = "";
        if (ep.getMetadata() != null && ep.getMetadata().getCreationTimestamp() != null) {
            age = calculateAge(ep.getMetadata().getCreationTimestamp().toString());
        }
        map.put("age", age);

        // Collect endpoints (Pod IP addresses) và trạng thái
        java.util.List<String> endpointList = new java.util.ArrayList<>();
        java.util.List<java.util.Map<String, Object>> endpointDetails = new java.util.ArrayList<>();
        java.util.List<String> portList = new java.util.ArrayList<>();
        int readyCount = 0;
        int notReadyCount = 0;

        if (ep.getSubsets() != null) {
            for (var subset : ep.getSubsets()) {
                // Ready addresses
                if (subset.getAddresses() != null) {
                    for (var address : subset.getAddresses()) {
                        if (address.getIp() != null && !address.getIp().isEmpty()) {
                            endpointList.add(address.getIp());
                            readyCount++;
                            
                            java.util.Map<String, Object> epDetail = new java.util.HashMap<>();
                            epDetail.put("ip", address.getIp());
                            epDetail.put("ready", true);
                            if (address.getTargetRef() != null) {
                                if (address.getTargetRef().getKind() != null) {
                                    epDetail.put("kind", address.getTargetRef().getKind());
                                }
                                if (address.getTargetRef().getName() != null) {
                                    epDetail.put("name", address.getTargetRef().getName());
                                }
                            }
                            endpointDetails.add(epDetail);
                        }
                    }
                }
                
                // Not ready addresses
                if (subset.getNotReadyAddresses() != null) {
                    for (var address : subset.getNotReadyAddresses()) {
                        if (address.getIp() != null && !address.getIp().isEmpty()) {
                            endpointList.add(address.getIp() + " (NotReady)");
                            notReadyCount++;
                            
                            java.util.Map<String, Object> epDetail = new java.util.HashMap<>();
                            epDetail.put("ip", address.getIp());
                            epDetail.put("ready", false);
                            if (address.getTargetRef() != null) {
                                if (address.getTargetRef().getKind() != null) {
                                    epDetail.put("kind", address.getTargetRef().getKind());
                                }
                                if (address.getTargetRef().getName() != null) {
                                    epDetail.put("name", address.getTargetRef().getName());
                                }
                            }
                            endpointDetails.add(epDetail);
                        }
                    }
                }
                
                if (subset.getPorts() != null) {
                    for (var port : subset.getPorts()) {
                        int portNum = port.getPort() != null ? port.getPort() : 0;
                        String protocol = port.getProtocol() != null ? port.getProtocol() : "TCP";
                        String portName = port.getName() != null ? port.getName() : "";
                        if (portNum > 0) {
                            if (!portName.isEmpty()) {
                                portList.add(portName + ":" + portNum + "/" + protocol);
                            } else {
                                portList.add(portNum + "/" + protocol);
                            }
                        }
                    }
                }
            }
        }

        int totalEndpoints = readyCount + notReadyCount;
        map.put("endpoints", endpointList);
        map.put("endpointDetails", endpointDetails);
        map.put("endpointCount", totalEndpoints);
        map.put("readyCount", readyCount);
        map.put("notReadyCount", notReadyCount);
        map.put("ports", portList.isEmpty() ? "-" : String.join(", ", portList));
        
        // Liên kết với Service (Endpoint name thường trùng với Service name)
        map.put("serviceName", ep.getMetadata() != null ? ep.getMetadata().getName() : "");
        map.put("serviceLink", ep.getMetadata() != null && ep.getMetadata().getNamespace() != null
                ? ep.getMetadata().getNamespace() + "/" + ep.getMetadata().getName()
                : "");

        return map;
    }

    /**
     * Parse CoreDNS Pod object thành Map format cho API response
     */
    private Map<String, Object> parseCoreDNSToMap(io.fabric8.kubernetes.api.model.Pod pod) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        String namespace = pod.getMetadata() != null ? pod.getMetadata().getNamespace() : "";
        String name = pod.getMetadata() != null ? pod.getMetadata().getName() : "";
        map.put("namespace", namespace);
        map.put("name", name);

        // Age
        String age = "";
        if (pod.getMetadata() != null && pod.getMetadata().getCreationTimestamp() != null) {
            age = calculateAge(pod.getMetadata().getCreationTimestamp().toString());
        }
        map.put("age", age);

        // Pod IP
        String podIP = "";
        if (pod.getStatus() != null && pod.getStatus().getPodIP() != null) {
            podIP = pod.getStatus().getPodIP();
        }
        map.put("ip", podIP);

        // Status
        String status = pod.getStatus() != null ? pod.getStatus().getPhase() : "Unknown";
        map.put("status", status);

        // Pod name (for display)
        map.put("pods", java.util.List.of(name));

        // Tên miền nội bộ CoreDNS (thường là kube-dns.kube-system.svc.cluster.local)
        String dnsDomain = "kube-dns." + namespace + ".svc.cluster.local";
        map.put("dnsDomain", dnsDomain);

        // Khả năng phân giải DNS (kiểm tra pod có ready không)
        boolean canResolveDNS = "Running".equals(status);
        if (pod.getStatus() != null && pod.getStatus().getContainerStatuses() != null) {
            for (var cs : pod.getStatus().getContainerStatuses()) {
                if (cs.getReady() != null && cs.getReady()) {
                    canResolveDNS = true;
                    break;
                }
            }
        }
        map.put("canResolveDNS", canResolveDNS);
        map.put("dnsStatus", canResolveDNS ? "Ready" : "Not Ready");

        // Mapping DNS ↔ Service IP (lấy từ kube-dns service)
        try {
            var kubeDnsService = kubernetesService.getService("kube-system", "kube-dns");
            if (kubeDnsService != null && kubeDnsService.getSpec() != null) {
                String serviceIP = kubeDnsService.getSpec().getClusterIP();
                if (serviceIP != null && !serviceIP.isEmpty()) {
                    map.put("serviceIP", serviceIP);
                    map.put("dnsMapping", dnsDomain + " → " + serviceIP);
                }
            }
        } catch (Exception e) {
            // Ignore errors when fetching kube-dns service
        }

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

