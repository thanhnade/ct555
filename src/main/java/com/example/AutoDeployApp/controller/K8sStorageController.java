package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.K8sStorageService;
import io.fabric8.kubernetes.api.model.PersistentVolume;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaim;
import io.fabric8.kubernetes.api.model.Quantity;
import io.fabric8.kubernetes.api.model.storage.StorageClass;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/cluster")
public class K8sStorageController {

    private final K8sStorageService storageService;

    public K8sStorageController(K8sStorageService storageService) {
        this.storageService = storageService;
    }

    // ===================== PVC =====================
    @GetMapping("/k8s/storage/pvcs")
    public ResponseEntity<?> listPvcs(
            @RequestParam(required = false) String namespace,
            HttpServletRequest request) {
        try {
            var pvcList = storageService.getPersistentVolumeClaims(namespace);
            List<Map<String, Object>> result = pvcList.getItems().stream()
                    .map(this::parsePVCToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("pvcs", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "pvcs", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get PVCs: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/storage/pvcs/{namespace}/{name}")
    public ResponseEntity<?> describePvc(
            @PathVariable String namespace,
            @PathVariable String name) {
        try {
            var pvc = storageService.getPersistentVolumeClaim(namespace, name);
            if (pvc == null) {
                return ResponseEntity.status(404).body(Map.of("error", "PVC not found: " + namespace + "/" + name));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(pvc);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "PVC not found: " + namespace + "/" + name));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe PVC: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/k8s/storage/pvcs/{namespace}/{name}")
    public ResponseEntity<?> deletePvc(
            @PathVariable String namespace,
            @PathVariable String name) {
        try {
            storageService.deletePersistentVolumeClaim(namespace, name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "output", String.format("persistentvolumeclaim \"%s\" deleted", name)
            ));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "PVC not found: " + namespace + "/" + name));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete PVC: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== PV =====================
    @GetMapping("/k8s/storage/pvs")
    public ResponseEntity<?> listPvs(HttpServletRequest request) {
        try {
            var pvList = storageService.getPersistentVolumes();
            List<Map<String, Object>> result = pvList.getItems().stream()
                    .map(this::parsePVToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("pvs", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "pvs", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get PVs: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/storage/pvs/{name}")
    public ResponseEntity<?> describePv(@PathVariable String name) {
        try {
            var pv = storageService.getPersistentVolume(name);
            if (pv == null) {
                return ResponseEntity.status(404).body(Map.of("error", "PV not found: " + name));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(pv);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "PV not found: " + name));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe PV: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/k8s/storage/pvs/{name}")
    public ResponseEntity<?> deletePv(@PathVariable String name) {
        try {
            storageService.deletePersistentVolume(name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "output", String.format("persistentvolume \"%s\" deleted", name)
            ));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "PV not found: " + name));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete PV: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== StorageClass =====================
    @GetMapping("/k8s/storage/storageclasses")
    public ResponseEntity<?> listStorageClasses(HttpServletRequest request) {
        try {
            var storageClasses = storageService.getStorageClasses();
            List<Map<String, Object>> result = storageClasses.getItems().stream()
                    .map(this::parseStorageClassToMap)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(Map.of("storageclasses", result));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "storageclasses", List.of()));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get StorageClasses: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/storage/storageclasses/{name}")
    public ResponseEntity<?> describeStorageClass(@PathVariable String name) {
        try {
            var storageClass = storageService.getStorageClass(name);
            if (storageClass == null) {
                return ResponseEntity.status(404).body(Map.of("error", "StorageClass not found: " + name));
            }
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String jsonOutput = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(storageClass);
            return ResponseEntity.ok(Map.of("output", jsonOutput, "format", "json"));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "StorageClass not found: " + name));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to describe StorageClass: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/k8s/storage/storageclasses/{name}")
    public ResponseEntity<?> deleteStorageClass(@PathVariable String name) {
        try {
            storageService.deleteStorageClass(name);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "output", String.format("storageclass.storage.k8s.io \"%s\" deleted", name)
            ));
        } catch (io.fabric8.kubernetes.client.KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "StorageClass not found: " + name));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to delete StorageClass: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ===================== Helpers =====================
    private Map<String, Object> parsePVCToMap(PersistentVolumeClaim pvc) {
        Map<String, Object> map = new HashMap<>();
        var metadata = pvc.getMetadata();
        var spec = pvc.getSpec();
        var status = pvc.getStatus();

        map.put("namespace", metadata != null ? metadata.getNamespace() : "");
        map.put("name", metadata != null ? metadata.getName() : "");
        map.put("storageClass", spec != null ? spec.getStorageClassName() : "");
        map.put("volume", spec != null ? spec.getVolumeName() : "");

        Quantity capacityQty = status != null && status.getCapacity() != null
                ? status.getCapacity().get("storage")
                : null;
        map.put("capacity", formatQuantity(capacityQty));

        List<String> accessModes = spec != null && spec.getAccessModes() != null
                ? spec.getAccessModes()
                : List.of();
        map.put("accessModes", accessModes);
        map.put("accessModesStr", String.join(", ", accessModes));

        map.put("status", status != null ? status.getPhase() : "Unknown");
        map.put("age", metadata != null ? calculateAge(metadata.getCreationTimestamp()) : "");
        map.put("volumeMode", spec != null && spec.getVolumeMode() != null ? spec.getVolumeMode() : "Filesystem");

        if (status != null && status.getConditions() != null) {
            map.put("conditions", status.getConditions());
        }
        return map;
    }

    private Map<String, Object> parsePVToMap(PersistentVolume pv) {
        Map<String, Object> map = new HashMap<>();
        var metadata = pv.getMetadata();
        var spec = pv.getSpec();
        var status = pv.getStatus();

        map.put("name", metadata != null ? metadata.getName() : "");
        map.put("storageClass", spec != null ? spec.getStorageClassName() : "");

        Quantity capacityQty = spec != null && spec.getCapacity() != null
                ? spec.getCapacity().get("storage")
                : null;
        map.put("capacity", formatQuantity(capacityQty));

        List<String> accessModes = spec != null && spec.getAccessModes() != null
                ? spec.getAccessModes()
                : List.of();
        map.put("accessModes", accessModes);
        map.put("accessModesStr", String.join(", ", accessModes));

        map.put("reclaimPolicy", spec != null && spec.getPersistentVolumeReclaimPolicy() != null
                ? spec.getPersistentVolumeReclaimPolicy()
                : "Retain");
        map.put("phase", status != null ? status.getPhase() : "Unknown");

        if (spec != null && spec.getClaimRef() != null) {
            map.put("claimRef", spec.getClaimRef().getNamespace() + "/" + spec.getClaimRef().getName());
        } else {
            map.put("claimRef", "");
        }

        if (spec != null && spec.getNodeAffinity() != null) {
            map.put("nodeAffinity", spec.getNodeAffinity());
        }
        map.put("age", metadata != null ? calculateAge(metadata.getCreationTimestamp()) : "");
        map.put("volumeMode", spec != null && spec.getVolumeMode() != null ? spec.getVolumeMode() : "Filesystem");
        return map;
    }

    private Map<String, Object> parseStorageClassToMap(StorageClass storageClass) {
        Map<String, Object> map = new HashMap<>();
        var metadata = storageClass.getMetadata();

        map.put("name", metadata != null ? metadata.getName() : "");
        map.put("provisioner", storageClass.getProvisioner());
        map.put("reclaimPolicy", storageClass.getReclaimPolicy());
        map.put("volumeBindingMode", storageClass.getVolumeBindingMode());
        map.put("allowVolumeExpansion", storageClass.getAllowVolumeExpansion());
        map.put("parameters", storageClass.getParameters());
        map.put("age", metadata != null ? calculateAge(metadata.getCreationTimestamp()) : "");

        boolean isDefault = false;
        if (metadata != null && metadata.getAnnotations() != null) {
            String defaultAnnotation = metadata.getAnnotations()
                    .getOrDefault("storageclass.kubernetes.io/is-default-class", "false");
            isDefault = "true".equalsIgnoreCase(defaultAnnotation);
        }
        map.put("isDefault", isDefault);
        return map;
    }

    private String formatQuantity(Quantity quantity) {
        if (quantity == null) {
            return "-";
        }
        String amount = quantity.getAmount();
        String format = quantity.getFormat();
        return format != null && !format.isEmpty() ? amount + format : amount;
    }

    private String calculateAge(String creationTimestamp) {
        if (creationTimestamp == null || creationTimestamp.isBlank()) {
            return "";
        }
        try {
            Instant creation = Instant.parse(creationTimestamp);
            Instant now = Instant.now();
            Duration duration = Duration.between(creation, now);

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

