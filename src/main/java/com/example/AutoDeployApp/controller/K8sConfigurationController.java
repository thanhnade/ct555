package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.KubernetesService;
import io.fabric8.kubernetes.api.model.ConfigMap;
import io.fabric8.kubernetes.api.model.ConfigMapBuilder;
import io.fabric8.kubernetes.api.model.ConfigMapList;
import io.fabric8.kubernetes.api.model.Secret;
import io.fabric8.kubernetes.api.model.SecretBuilder;
import io.fabric8.kubernetes.api.model.SecretList;
import io.fabric8.kubernetes.api.model.networking.v1.NetworkPolicy;
import io.fabric8.kubernetes.api.model.networking.v1.NetworkPolicyList;
import io.fabric8.kubernetes.api.model.rbac.*;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/cluster")
public class K8sConfigurationController {

    private final KubernetesService kubernetesService;

    public K8sConfigurationController(KubernetesService kubernetesService) {
        this.kubernetesService = kubernetesService;
    }

    private KubernetesClient getKubernetesClient() {
        return kubernetesService.getKubernetesClientForCluster();
    }

    // ===================== ConfigMaps =====================

    @GetMapping("/k8s/configmaps")
    public ResponseEntity<?> listConfigMaps(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            ConfigMapList configMapList;
            if (namespace != null && !namespace.trim().isEmpty()) {
                configMapList = client.configMaps().inNamespace(namespace).list();
            } else {
                configMapList = client.configMaps().inAnyNamespace().list();
            }
            List<Map<String, Object>> result = configMapList.getItems().stream()
                    .map(this::parseConfigMapToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("configmaps", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "configmaps", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get ConfigMaps: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/configmaps/{namespace}/{name}")
    public ResponseEntity<?> getConfigMap(
            @PathVariable String namespace,
            @PathVariable String name,
            @RequestParam(required = false, defaultValue = "json") String format,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            ConfigMap configMap = client.configMaps().inNamespace(namespace).withName(name).get();
            if (configMap == null) {
                return ResponseEntity.status(404).body(Map.of("error", "ConfigMap not found"));
            }

            String output;
            if ("yaml".equals(format.toLowerCase())) {
                var yamlMapper = new com.fasterxml.jackson.dataformat.yaml.YAMLMapper();
                output = yamlMapper.writeValueAsString(configMap);
            } else {
                var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                output = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(configMap);
            }
            return ResponseEntity.ok(Map.of("output", output, "format", format));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "ConfigMap not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get ConfigMap: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/k8s/configmaps")
    public ResponseEntity<?> createConfigMap(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            String namespace = (String) body.get("namespace");
            String name = (String) body.get("name");
            @SuppressWarnings("unchecked")
            Map<String, String> data = (Map<String, String>) body.get("data");

            if (namespace == null || name == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "namespace and name are required"));
            }

            ConfigMapBuilder builder = new ConfigMapBuilder()
                    .withNewMetadata()
                    .withName(name)
                    .withNamespace(namespace)
                    .endMetadata();

            if (data != null && !data.isEmpty()) {
                builder.withData(data);
            }

            ConfigMap configMap = builder.build();
            client.configMaps().inNamespace(namespace).resource(configMap).create();
            return ResponseEntity.ok(Map.of("success", true, "message", "ConfigMap created successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/k8s/configmaps/{namespace}/{name}")
    public ResponseEntity<?> deleteConfigMap(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.configMaps().inNamespace(namespace).withName(name).delete();
            return ResponseEntity.ok(Map.of("success", true, "output", "configmap \"" + name + "\" deleted"));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "ConfigMap not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete ConfigMap: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> parseConfigMapToMap(ConfigMap cm) {
        Map<String, Object> map = new HashMap<>();
        map.put("namespace", cm.getMetadata() != null ? cm.getMetadata().getNamespace() : "");
        map.put("name", cm.getMetadata() != null ? cm.getMetadata().getName() : "");
        map.put("dataKeys", cm.getData() != null ? cm.getData().keySet().size() : 0);
        map.put("age", calculateAge(cm.getMetadata() != null && cm.getMetadata().getCreationTimestamp() != null
                ? cm.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    // ===================== Secrets =====================

    @GetMapping("/k8s/secrets")
    public ResponseEntity<?> listSecrets(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            SecretList secretList;
            if (namespace != null && !namespace.trim().isEmpty()) {
                secretList = client.secrets().inNamespace(namespace).list();
            } else {
                secretList = client.secrets().inAnyNamespace().list();
            }
            List<Map<String, Object>> result = secretList.getItems().stream()
                    .map(this::parseSecretToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("secrets", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "secrets", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get Secrets: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/secrets/{namespace}/{name}")
    public ResponseEntity<?> getSecret(
            @PathVariable String namespace,
            @PathVariable String name,
            @RequestParam(required = false, defaultValue = "json") String format,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            Secret secret = client.secrets().inNamespace(namespace).withName(name).get();
            if (secret == null) {
                return ResponseEntity.status(404).body(Map.of("error", "Secret not found"));
            }

            String output;
            if ("yaml".equals(format.toLowerCase())) {
                var yamlMapper = new com.fasterxml.jackson.dataformat.yaml.YAMLMapper();
                output = yamlMapper.writeValueAsString(secret);
            } else {
                var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                output = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(secret);
            }
            return ResponseEntity.ok(Map.of("output", output, "format", format));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "Secret not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get Secret: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/k8s/secrets")
    public ResponseEntity<?> createSecret(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            String namespace = (String) body.get("namespace");
            String name = (String) body.get("name");
            String type = (String) body.getOrDefault("type", "Opaque");
            @SuppressWarnings("unchecked")
            Map<String, String> data = (Map<String, String>) body.get("data");

            if (namespace == null || name == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "namespace and name are required"));
            }

            SecretBuilder builder = new SecretBuilder()
                    .withNewMetadata()
                    .withName(name)
                    .withNamespace(namespace)
                    .endMetadata()
                    .withType(type);

            if (data != null && !data.isEmpty()) {
                Map<String, String> encodedData = new HashMap<>();
                for (Map.Entry<String, String> entry : data.entrySet()) {
                    String encoded = Base64.getEncoder().encodeToString(entry.getValue().getBytes());
                    encodedData.put(entry.getKey(), encoded);
                }
                builder.withData(encodedData);
            }

            Secret secret = builder.build();
            client.secrets().inNamespace(namespace).resource(secret).create();
            return ResponseEntity.ok(Map.of("success", true, "message", "Secret created successfully"));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/k8s/secrets/{namespace}/{name}")
    public ResponseEntity<?> deleteSecret(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.secrets().inNamespace(namespace).withName(name).delete();
            return ResponseEntity.ok(Map.of("success", true, "output", "secret \"" + name + "\" deleted"));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "Secret not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete Secret: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> parseSecretToMap(Secret secret) {
        Map<String, Object> map = new HashMap<>();
        map.put("namespace", secret.getMetadata() != null ? secret.getMetadata().getNamespace() : "");
        map.put("name", secret.getMetadata() != null ? secret.getMetadata().getName() : "");
        map.put("type", secret.getType() != null ? secret.getType() : "Opaque");
        map.put("dataKeys", secret.getData() != null ? secret.getData().keySet().size() : 0);
        map.put("age", calculateAge(secret.getMetadata() != null && secret.getMetadata().getCreationTimestamp() != null
                ? secret.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    // ===================== Network Policies =====================

    @GetMapping("/k8s/networkpolicies")
    public ResponseEntity<?> listNetworkPolicies(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            NetworkPolicyList networkPolicyList;
            if (namespace != null && !namespace.trim().isEmpty()) {
                networkPolicyList = client.network().v1().networkPolicies().inNamespace(namespace).list();
            } else {
                networkPolicyList = client.network().v1().networkPolicies().inAnyNamespace().list();
            }
            List<Map<String, Object>> result = networkPolicyList.getItems().stream()
                    .map(this::parseNetworkPolicyToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("networkPolicies", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "networkPolicies", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get NetworkPolicies: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/networkpolicies/{namespace}/{name}")
    public ResponseEntity<?> getNetworkPolicy(
            @PathVariable String namespace,
            @PathVariable String name,
            @RequestParam(required = false, defaultValue = "json") String format,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            NetworkPolicy networkPolicy = client.network().v1().networkPolicies()
                    .inNamespace(namespace).withName(name).get();
            if (networkPolicy == null) {
                return ResponseEntity.status(404).body(Map.of("error", "NetworkPolicy not found"));
            }

            String output;
            if ("yaml".equals(format.toLowerCase())) {
                var yamlMapper = new com.fasterxml.jackson.dataformat.yaml.YAMLMapper();
                output = yamlMapper.writeValueAsString(networkPolicy);
            } else {
                var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                output = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(networkPolicy);
            }
            return ResponseEntity.ok(Map.of("output", output, "format", format));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "NetworkPolicy not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get NetworkPolicy: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/k8s/networkpolicies/{namespace}/{name}")
    public ResponseEntity<?> deleteNetworkPolicy(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.network().v1().networkPolicies().inNamespace(namespace).withName(name).delete();
            return ResponseEntity.ok(Map.of("success", true, "output", "networkpolicy \"" + name + "\" deleted"));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "NetworkPolicy not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete NetworkPolicy: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> parseNetworkPolicyToMap(NetworkPolicy np) {
        Map<String, Object> map = new HashMap<>();
        map.put("namespace", np.getMetadata() != null ? np.getMetadata().getNamespace() : "");
        map.put("name", np.getMetadata() != null ? np.getMetadata().getName() : "");
        map.put("age", calculateAge(np.getMetadata() != null && np.getMetadata().getCreationTimestamp() != null
                ? np.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    // ===================== RBAC =====================

    @GetMapping("/k8s/rbac/roles")
    public ResponseEntity<?> listRoles(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            RoleList roleList;
            if (namespace != null && !namespace.trim().isEmpty()) {
                roleList = client.rbac().roles().inNamespace(namespace).list();
            } else {
                roleList = client.rbac().roles().inAnyNamespace().list();
            }
            List<Map<String, Object>> result = roleList.getItems().stream()
                    .map(this::parseRoleToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("roles", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "roles", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get Roles: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/rbac/clusterroles")
    public ResponseEntity<?> listClusterRoles(HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            ClusterRoleList clusterRoleList = client.rbac().clusterRoles().list();
            List<Map<String, Object>> result = clusterRoleList.getItems().stream()
                    .map(this::parseClusterRoleToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("clusterRoles", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "clusterRoles", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get ClusterRoles: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/rbac/rolebindings")
    public ResponseEntity<?> listRoleBindings(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            RoleBindingList roleBindingList;
            if (namespace != null && !namespace.trim().isEmpty()) {
                roleBindingList = client.rbac().roleBindings().inNamespace(namespace).list();
            } else {
                roleBindingList = client.rbac().roleBindings().inAnyNamespace().list();
            }
            List<Map<String, Object>> result = roleBindingList.getItems().stream()
                    .map(this::parseRoleBindingToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("roleBindings", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "roleBindings", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get RoleBindings: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/rbac/clusterrolebindings")
    public ResponseEntity<?> listClusterRoleBindings(HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            ClusterRoleBindingList clusterRoleBindingList = client.rbac().clusterRoleBindings().list();
            List<Map<String, Object>> result = clusterRoleBindingList.getItems().stream()
                    .map(this::parseClusterRoleBindingToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("clusterRoleBindings", result));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "clusterRoleBindings", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get ClusterRoleBindings: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> parseRoleToMap(Role role) {
        Map<String, Object> map = new HashMap<>();
        map.put("namespace", role.getMetadata() != null ? role.getMetadata().getNamespace() : "");
        map.put("name", role.getMetadata() != null ? role.getMetadata().getName() : "");
        map.put("rules", role.getRules() != null ? role.getRules().size() : 0);
        map.put("age", calculateAge(role.getMetadata() != null && role.getMetadata().getCreationTimestamp() != null
                ? role.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    private Map<String, Object> parseClusterRoleToMap(ClusterRole clusterRole) {
        Map<String, Object> map = new HashMap<>();
        map.put("name", clusterRole.getMetadata() != null ? clusterRole.getMetadata().getName() : "");
        map.put("rules", clusterRole.getRules() != null ? clusterRole.getRules().size() : 0);
        map.put("age", calculateAge(clusterRole.getMetadata() != null && clusterRole.getMetadata().getCreationTimestamp() != null
                ? clusterRole.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    private Map<String, Object> parseRoleBindingToMap(RoleBinding roleBinding) {
        Map<String, Object> map = new HashMap<>();
        map.put("namespace", roleBinding.getMetadata() != null ? roleBinding.getMetadata().getNamespace() : "");
        map.put("name", roleBinding.getMetadata() != null ? roleBinding.getMetadata().getName() : "");
        map.put("roleRef", roleBinding.getRoleRef() != null ? roleBinding.getRoleRef().getName() : "");
        map.put("subjects", roleBinding.getSubjects() != null ? roleBinding.getSubjects().size() : 0);
        map.put("age", calculateAge(roleBinding.getMetadata() != null && roleBinding.getMetadata().getCreationTimestamp() != null
                ? roleBinding.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    private Map<String, Object> parseClusterRoleBindingToMap(ClusterRoleBinding clusterRoleBinding) {
        Map<String, Object> map = new HashMap<>();
        map.put("name", clusterRoleBinding.getMetadata() != null ? clusterRoleBinding.getMetadata().getName() : "");
        map.put("roleRef", clusterRoleBinding.getRoleRef() != null ? clusterRoleBinding.getRoleRef().getName() : "");
        map.put("subjects", clusterRoleBinding.getSubjects() != null ? clusterRoleBinding.getSubjects().size() : 0);
        map.put("age", calculateAge(clusterRoleBinding.getMetadata() != null && clusterRoleBinding.getMetadata().getCreationTimestamp() != null
                ? clusterRoleBinding.getMetadata().getCreationTimestamp().toString() : ""));
        return map;
    }

    // Helper method
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

