package com.example.AutoDeployApp.service;

import io.fabric8.kubernetes.api.model.*;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.DeploymentList;
import io.fabric8.kubernetes.api.model.apps.ReplicaSet;
import io.fabric8.kubernetes.api.model.apps.ReplicaSetList;
import io.fabric8.kubernetes.api.model.apps.StatefulSet;
import io.fabric8.kubernetes.api.model.apps.StatefulSetList;
import io.fabric8.kubernetes.api.model.apps.DaemonSet;
import io.fabric8.kubernetes.api.model.apps.DaemonSetList;
import io.fabric8.kubernetes.api.model.batch.v1.CronJob;
import io.fabric8.kubernetes.api.model.batch.v1.CronJobList;
import io.fabric8.kubernetes.api.model.batch.v1.Job;
import io.fabric8.kubernetes.api.model.batch.v1.JobList;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import io.fabric8.kubernetes.client.dsl.ExecWatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;
import java.io.ByteArrayOutputStream;

/**
 * Service chuyên xử lý các operations liên quan đến Kubernetes Workloads
 * (Deployments, StatefulSets, DaemonSets, CronJobs, Jobs, Pods)
 */
@Service
public class K8sWorkloadsService {

    private static final Logger logger = LoggerFactory.getLogger(K8sWorkloadsService.class);

    private final KubernetesService kubernetesService;

    public K8sWorkloadsService(KubernetesService kubernetesService) {
        this.kubernetesService = kubernetesService;
    }

    /**
     * Lấy Kubernetes client từ KubernetesService
     */
    private KubernetesClient getKubernetesClient() {
        return kubernetesService.getKubernetesClientForCluster();
    }

    /**
     * Helper: Kiểm tra namespace có giá trị không
     */
    private boolean isNamespaceNotEmpty(String namespace) {
        return namespace != null && !namespace.trim().isEmpty();
    }

    // ========== Deployments ==========

    /**
     * Lấy deployments - nếu namespace là null, trả về tất cả deployments trong
     * tất cả namespaces
     */
    public DeploymentList getDeployments(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            if (isNamespaceNotEmpty(namespace)) {
                return client.apps().deployments().inNamespace(namespace).list();
            } else {
                return client.apps().deployments().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get deployments for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get deployments: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy deployment cụ thể theo tên
     */
    public Deployment getDeployment(String namespace, String deploymentName) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.apps().deployments().inNamespace(namespace).withName(deploymentName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get deployment {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to get deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Scale deployment
     */
    public void scaleDeployment(String namespace, String deploymentName, int replicas) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.apps().deployments().inNamespace(namespace).withName(deploymentName).scale(replicas);
            logger.info("Scaled deployment {}/{} to {} replicas", namespace, deploymentName, replicas);
        } catch (KubernetesClientException e) {
            logger.error("Failed to scale deployment {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to scale deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa deployment
     */
    public void deleteDeployment(String namespace, String deploymentName) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.apps().deployments().inNamespace(namespace).withName(deploymentName).delete();
            logger.info("Deleted deployment: {}/{}", namespace, deploymentName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete deployment {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to delete deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Restart deployment (rollout restart) - tạo lại pods bằng cách thay đổi annotation
     */
    public void restartDeployment(String namespace, String deploymentName) {
        try (KubernetesClient client = getKubernetesClient()) {
            Deployment deployment = client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .get();
            
            if (deployment == null) {
                throw new RuntimeException("Deployment not found: " + deploymentName);
            }
            
            // Thêm annotation để trigger restart
            Map<String, String> annotations = deployment.getSpec().getTemplate().getMetadata().getAnnotations();
            if (annotations == null) {
                annotations = new HashMap<>();
            }
            annotations.put("kubectl.kubernetes.io/restartedAt", String.valueOf(System.currentTimeMillis()));
            
            deployment.getSpec().getTemplate().getMetadata().setAnnotations(annotations);
            client.apps().deployments().inNamespace(namespace).withName(deploymentName).edit(d -> deployment);
            
            logger.info("Restarted deployment: {}/{}", namespace, deploymentName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to restart deployment {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to restart deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Rollback deployment (rollout undo) - rollback về revision trước đó hoặc revision cụ thể
     */
    public void rollbackDeployment(String namespace, String deploymentName, Integer toRevision) {
        try (KubernetesClient client = getKubernetesClient()) {
            Deployment deployment = client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .get();
            
            if (deployment == null) {
                throw new RuntimeException("Deployment not found: " + deploymentName);
            }
            
            // Lấy tất cả ReplicaSets của deployment này
            ReplicaSetList replicaSetList = client.apps().replicaSets()
                    .inNamespace(namespace)
                    .list();
            
            List<ReplicaSet> matchingRS = replicaSetList.getItems().stream()
                    .filter(rs -> {
                        if (rs.getMetadata() == null || rs.getMetadata().getOwnerReferences() == null) {
                            return false;
                        }
                        return rs.getMetadata().getOwnerReferences().stream()
                                .anyMatch(owner -> "Deployment".equals(owner.getKind()) 
                                        && deploymentName.equals(owner.getName()));
                    })
                    .collect(Collectors.toList());
            
            if (matchingRS.isEmpty()) {
                throw new RuntimeException("No ReplicaSets found for deployment: " + deploymentName);
            }
            
            // Sắp xếp theo revision (từ annotation deployment.kubernetes.io/revision)
            matchingRS.sort((rs1, rs2) -> {
                String rev1 = rs1.getMetadata().getAnnotations() != null 
                        ? rs1.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision") 
                        : "0";
                String rev2 = rs2.getMetadata().getAnnotations() != null 
                        ? rs2.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision") 
                        : "0";
                return Integer.compare(Integer.parseInt(rev2), Integer.parseInt(rev1)); // Descending
            });
            
            // Nếu không chỉ định revision, rollback về revision trước đó
            ReplicaSet targetRS = null;
            if (toRevision != null && toRevision > 0) {
                // Tìm ReplicaSet với revision cụ thể
                targetRS = matchingRS.stream()
                        .filter(rs -> {
                            String rev = rs.getMetadata().getAnnotations() != null 
                                    ? rs.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision") 
                                    : "0";
                            return String.valueOf(toRevision).equals(rev);
                        })
                        .findFirst()
                        .orElse(null);
            } else {
                // Rollback về revision trước đó (không phải revision hiện tại)
                if (matchingRS.size() > 1) {
                    targetRS = matchingRS.get(1); // Revision thứ 2 (revision trước đó)
                } else {
                    throw new RuntimeException("No previous revision to rollback to");
                }
            }
            
            if (targetRS == null) {
                throw new RuntimeException("Target revision not found");
            }
            
            // Lấy PodTemplateSpec từ ReplicaSet cũ và áp dụng vào Deployment
            if (targetRS.getSpec() != null && targetRS.getSpec().getTemplate() != null) {
                deployment.getSpec().setTemplate(targetRS.getSpec().getTemplate());
                
                // Thêm annotation để trigger rollout
                Map<String, String> annotations = deployment.getSpec().getTemplate().getMetadata().getAnnotations();
                if (annotations == null) {
                    annotations = new HashMap<>();
                }
                annotations.put("kubectl.kubernetes.io/restartedAt", String.valueOf(System.currentTimeMillis()));
                deployment.getSpec().getTemplate().getMetadata().setAnnotations(annotations);
                
                // Cập nhật deployment
                client.apps().deployments()
                        .inNamespace(namespace)
                        .withName(deploymentName)
                        .edit(d -> deployment);
                
                logger.info("Rolled back deployment {}/{} to revision {}", namespace, deploymentName, 
                        targetRS.getMetadata().getAnnotations() != null 
                                ? targetRS.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision") 
                                : "unknown");
            } else {
                throw new RuntimeException("Cannot get PodTemplateSpec from target ReplicaSet");
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to rollback deployment {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to rollback deployment: " + e.getMessage(), e);
        }
    }
    
    /**
     * Lấy rollout history của deployment (danh sách các revision)
     */
    public List<Map<String, Object>> getDeploymentRolloutHistory(String namespace, String deploymentName) {
        List<Map<String, Object>> history = new ArrayList<>();
        
        try (KubernetesClient client = getKubernetesClient()) {
            Deployment deployment = client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .get();
            
            if (deployment == null) {
                return history;
            }
            
            // Lấy tất cả ReplicaSets của deployment này
            ReplicaSetList replicaSetList = client.apps().replicaSets()
                    .inNamespace(namespace)
                    .list();
            
            List<ReplicaSet> matchingRS = replicaSetList.getItems().stream()
                    .filter(rs -> {
                        if (rs.getMetadata() == null || rs.getMetadata().getOwnerReferences() == null) {
                            return false;
                        }
                        return rs.getMetadata().getOwnerReferences().stream()
                                .anyMatch(owner -> "Deployment".equals(owner.getKind()) 
                                        && deploymentName.equals(owner.getName()));
                    })
                    .collect(Collectors.toList());
            
            // Sắp xếp theo revision
            matchingRS.sort((rs1, rs2) -> {
                String rev1 = rs1.getMetadata().getAnnotations() != null 
                        ? rs1.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision") 
                        : "0";
                String rev2 = rs2.getMetadata().getAnnotations() != null 
                        ? rs2.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision") 
                        : "0";
                return Integer.compare(Integer.parseInt(rev2), Integer.parseInt(rev1)); // Descending
            });
            
            // Xác định ReplicaSet hiện tại (active)
            String currentRevision = deployment.getMetadata().getAnnotations() != null
                    ? deployment.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision")
                    : null;
            
            for (ReplicaSet rs : matchingRS) {
                Map<String, Object> revisionInfo = new HashMap<>();
                String revision = rs.getMetadata().getAnnotations() != null
                        ? rs.getMetadata().getAnnotations().get("deployment.kubernetes.io/revision")
                        : "0";
                
                revisionInfo.put("revision", Integer.parseInt(revision));
                revisionInfo.put("replicas", rs.getStatus() != null && rs.getStatus().getReplicas() != null 
                        ? rs.getStatus().getReplicas() 
                        : 0);
                revisionInfo.put("readyReplicas", rs.getStatus() != null && rs.getStatus().getReadyReplicas() != null 
                        ? rs.getStatus().getReadyReplicas() 
                        : 0);
                revisionInfo.put("createdAt", rs.getMetadata().getCreationTimestamp());
                
                // Lấy image từ containers
                if (rs.getSpec() != null && rs.getSpec().getTemplate() != null 
                        && rs.getSpec().getTemplate().getSpec() != null 
                        && rs.getSpec().getTemplate().getSpec().getContainers() != null
                        && !rs.getSpec().getTemplate().getSpec().getContainers().isEmpty()) {
                    List<String> images = rs.getSpec().getTemplate().getSpec().getContainers().stream()
                            .map(Container::getImage)
                            .collect(Collectors.toList());
                    revisionInfo.put("images", images);
                }
                
                // Đánh dấu revision hiện tại
                revisionInfo.put("current", revision.equals(currentRevision));
                
                history.add(revisionInfo);
            }
            
        } catch (KubernetesClientException e) {
            logger.error("Failed to get rollout history for deployment {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to get rollout history: " + e.getMessage(), e);
        }
        
        return history;
    }
    
    /**
     * Rolling update deployment - cập nhật image của container
     */
    public void updateDeploymentImage(String namespace, String deploymentName, String containerName, String newImage) {
        try (KubernetesClient client = getKubernetesClient()) {
            Deployment deployment = client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .get();
            
            if (deployment == null) {
                throw new RuntimeException("Deployment not found: " + deploymentName);
            }
            
            // Cập nhật image của container
            if (deployment.getSpec() != null 
                    && deployment.getSpec().getTemplate() != null
                    && deployment.getSpec().getTemplate().getSpec() != null
                    && deployment.getSpec().getTemplate().getSpec().getContainers() != null) {
                
                boolean containerFound = false;
                for (Container container : deployment.getSpec().getTemplate().getSpec().getContainers()) {
                    if (container.getName().equals(containerName)) {
                        container.setImage(newImage);
                        containerFound = true;
                        break;
                    }
                }
                
                if (!containerFound) {
                    throw new RuntimeException("Container not found: " + containerName);
                }
                
                // Thêm annotation để trigger rollout
                Map<String, String> annotations = deployment.getSpec().getTemplate().getMetadata().getAnnotations();
                if (annotations == null) {
                    annotations = new HashMap<>();
                }
                annotations.put("kubectl.kubernetes.io/restartedAt", String.valueOf(System.currentTimeMillis()));
                deployment.getSpec().getTemplate().getMetadata().setAnnotations(annotations);
                
                // Cập nhật deployment
                client.apps().deployments()
                        .inNamespace(namespace)
                        .withName(deploymentName)
                        .edit(d -> deployment);
                
                logger.info("Updated image for container {} in deployment {}/{} to {}", 
                        containerName, namespace, deploymentName, newImage);
            } else {
                throw new RuntimeException("Invalid deployment spec");
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to update deployment image {}/{}: {}", namespace, deploymentName, e.getMessage(), e);
            throw new RuntimeException("Failed to update deployment image: " + e.getMessage(), e);
        }
    }

    // ========== StatefulSets ==========

    /**
     * Lấy statefulsets - nếu namespace là null, trả về tất cả statefulsets trong
     * tất cả namespaces
     */
    public StatefulSetList getStatefulSets(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            if (isNamespaceNotEmpty(namespace)) {
                return client.apps().statefulSets().inNamespace(namespace).list();
            } else {
                return client.apps().statefulSets().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get statefulsets for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get statefulsets: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy statefulset cụ thể theo tên
     */
    public StatefulSet getStatefulSet(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.apps().statefulSets().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get statefulset {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to get statefulset: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy tên headless service của StatefulSet
     */
    public String getStatefulSetServiceName(StatefulSet statefulSet) {
        if (statefulSet == null || statefulSet.getSpec() == null) {
            return "";
        }
        return Optional.ofNullable(statefulSet.getSpec().getServiceName()).orElse("");
    }

    /**
     * Lấy danh sách volumeClaimTemplate name của StatefulSet
     */
    public List<String> getStatefulSetVolumeTemplates(StatefulSet statefulSet) {
        if (statefulSet == null || statefulSet.getSpec() == null || statefulSet.getSpec().getVolumeClaimTemplates() == null) {
            return Collections.emptyList();
        }
        return statefulSet.getSpec().getVolumeClaimTemplates()
                .stream()
                .map(vct -> vct.getMetadata() != null ? vct.getMetadata().getName() : "")
                .filter(name -> name != null && !name.isBlank())
                .collect(Collectors.toList());
    }

    /**
     * Scale statefulset
     */
    public void scaleStatefulSet(String namespace, String name, int replicas) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.apps().statefulSets().inNamespace(namespace).withName(name).scale(replicas);
            logger.info("Scaled statefulset {}/{} to {} replicas", namespace, name, replicas);
        } catch (KubernetesClientException e) {
            logger.error("Failed to scale statefulset {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to scale statefulset: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa statefulset
     */
    public void deleteStatefulSet(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.apps().statefulSets().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted statefulset: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete statefulset {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete statefulset: " + e.getMessage(), e);
        }
    }
    
    /**
     * Lấy danh sách PersistentVolumeClaims của StatefulSet
     */
    public List<Map<String, Object>> getStatefulSetVolumes(String namespace, String statefulSetName) {
        List<Map<String, Object>> volumes = new ArrayList<>();
        
        try (KubernetesClient client = getKubernetesClient()) {
            StatefulSet statefulSet = client.apps().statefulSets()
                    .inNamespace(namespace)
                    .withName(statefulSetName)
                    .get();
            
            if (statefulSet == null) {
                return volumes;
            }
            
            // Lấy volumeClaimTemplates từ StatefulSet spec
            String volumeClaimTemplateName = null;
            if (statefulSet.getSpec() != null 
                    && statefulSet.getSpec().getVolumeClaimTemplates() != null
                    && !statefulSet.getSpec().getVolumeClaimTemplates().isEmpty()) {
                volumeClaimTemplateName = statefulSet.getSpec().getVolumeClaimTemplates().get(0).getMetadata().getName();
            }
            
            if (volumeClaimTemplateName == null) {
                return volumes;
            }
            
            // Tìm tất cả PVCs có tên pattern: {volumeClaimTemplateName}-{statefulSetName}-{ordinal}
            PersistentVolumeClaimList pvcList = client.persistentVolumeClaims()
                    .inNamespace(namespace)
                    .list();
            
            String pvcPrefix = volumeClaimTemplateName + "-" + statefulSetName + "-";
            
            for (PersistentVolumeClaim pvc : pvcList.getItems()) {
                String pvcName = pvc.getMetadata().getName();
                if (pvcName.startsWith(pvcPrefix)) {
                    Map<String, Object> volumeInfo = new HashMap<>();
                    volumeInfo.put("name", pvcName);
                    volumeInfo.put("status", pvc.getStatus() != null && pvc.getStatus().getPhase() != null 
                            ? pvc.getStatus().getPhase() 
                            : "Unknown");
                    
                    // Lấy storage size
                    if (pvc.getStatus() != null && pvc.getStatus().getCapacity() != null 
                            && pvc.getStatus().getCapacity().containsKey("storage")) {
                        volumeInfo.put("capacity", pvc.getStatus().getCapacity().get("storage").getAmount());
                    } else {
                        volumeInfo.put("capacity", "-");
                    }
                    
                    // Lấy storage class
                    if (pvc.getSpec() != null && pvc.getSpec().getStorageClassName() != null) {
                        volumeInfo.put("storageClass", pvc.getSpec().getStorageClassName());
                    } else {
                        volumeInfo.put("storageClass", "-");
                    }
                    
                    // Lấy access modes
                    if (pvc.getSpec() != null && pvc.getSpec().getAccessModes() != null) {
                        volumeInfo.put("accessModes", pvc.getSpec().getAccessModes());
                    } else {
                        volumeInfo.put("accessModes", new ArrayList<>());
                    }
                    
                    // Lấy pod ordinal từ tên PVC (pvcName = {template}-{stsName}-{ordinal})
                    try {
                        String ordinalStr = pvcName.substring(pvcPrefix.length());
                        volumeInfo.put("podOrdinal", Integer.parseInt(ordinalStr));
                    } catch (Exception e) {
                        volumeInfo.put("podOrdinal", -1);
                    }
                    
                    volumeInfo.put("createdAt", pvc.getMetadata().getCreationTimestamp());
                    
                    volumes.add(volumeInfo);
                }
            }
            
            // Sắp xếp theo pod ordinal
            volumes.sort((v1, v2) -> {
                Integer ord1 = (Integer) v1.get("podOrdinal");
                Integer ord2 = (Integer) v2.get("podOrdinal");
                return Integer.compare(ord1 != null ? ord1 : -1, ord2 != null ? ord2 : -1);
            });
            
        } catch (KubernetesClientException e) {
            logger.error("Failed to get volumes for statefulset {}/{}: {}", namespace, statefulSetName, e.getMessage(), e);
            throw new RuntimeException("Failed to get volumes: " + e.getMessage(), e);
        }
        
        return volumes;
    }
    
    /**
     * Rolling update StatefulSet - cập nhật image của container
     */
    public void updateStatefulSetImage(String namespace, String statefulSetName, String containerName, String newImage) {
        try (KubernetesClient client = getKubernetesClient()) {
            StatefulSet statefulSet = client.apps().statefulSets()
                    .inNamespace(namespace)
                    .withName(statefulSetName)
                    .get();
            
            if (statefulSet == null) {
                throw new RuntimeException("StatefulSet not found: " + statefulSetName);
            }
            
            // Cập nhật image của container
            if (statefulSet.getSpec() != null 
                    && statefulSet.getSpec().getTemplate() != null
                    && statefulSet.getSpec().getTemplate().getSpec() != null
                    && statefulSet.getSpec().getTemplate().getSpec().getContainers() != null) {
                
                boolean containerFound = false;
                for (Container container : statefulSet.getSpec().getTemplate().getSpec().getContainers()) {
                    if (container.getName().equals(containerName)) {
                        container.setImage(newImage);
                        containerFound = true;
                        break;
                    }
                }
                
                if (!containerFound) {
                    throw new RuntimeException("Container not found: " + containerName);
                }
                
                // Thêm annotation để trigger rolling update
                Map<String, String> annotations = statefulSet.getSpec().getTemplate().getMetadata().getAnnotations();
                if (annotations == null) {
                    annotations = new HashMap<>();
                }
                annotations.put("kubectl.kubernetes.io/restartedAt", String.valueOf(System.currentTimeMillis()));
                statefulSet.getSpec().getTemplate().getMetadata().setAnnotations(annotations);
                
                // Cập nhật statefulset
                client.apps().statefulSets()
                        .inNamespace(namespace)
                        .withName(statefulSetName)
                        .edit(s -> statefulSet);
                
                logger.info("Updated image for container {} in statefulset {}/{} to {}", 
                        containerName, namespace, statefulSetName, newImage);
            } else {
                throw new RuntimeException("Invalid statefulset spec");
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to update statefulset image {}/{}: {}", namespace, statefulSetName, e.getMessage(), e);
            throw new RuntimeException("Failed to update statefulset image: " + e.getMessage(), e);
        }
    }

    // ========== DaemonSets ==========

    /**
     * Lấy daemonsets - nếu namespace là null, trả về tất cả daemonsets trong
     * tất cả namespaces
     */
    public DaemonSetList getDaemonSets(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            if (isNamespaceNotEmpty(namespace)) {
                return client.apps().daemonSets().inNamespace(namespace).list();
            } else {
                return client.apps().daemonSets().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get daemonsets for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get daemonsets: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy daemonset cụ thể theo tên
     */
    public DaemonSet getDaemonSet(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.apps().daemonSets().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get daemonset {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to get daemonset: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa daemonset
     * Lưu ý: DaemonSets không thể scale
     */
    public void deleteDaemonSet(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.apps().daemonSets().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted daemonset: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete daemonset {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete daemonset: " + e.getMessage(), e);
        }
    }
    
    /**
     * Rolling update DaemonSet - cập nhật image của container
     */
    public void updateDaemonSetImage(String namespace, String daemonSetName, String containerName, String newImage) {
        try (KubernetesClient client = getKubernetesClient()) {
            DaemonSet daemonSet = client.apps().daemonSets()
                    .inNamespace(namespace)
                    .withName(daemonSetName)
                    .get();
            
            if (daemonSet == null) {
                throw new RuntimeException("DaemonSet not found: " + daemonSetName);
            }
            
            // Cập nhật image của container
            if (daemonSet.getSpec() != null 
                    && daemonSet.getSpec().getTemplate() != null
                    && daemonSet.getSpec().getTemplate().getSpec() != null
                    && daemonSet.getSpec().getTemplate().getSpec().getContainers() != null) {
                
                boolean containerFound = false;
                for (Container container : daemonSet.getSpec().getTemplate().getSpec().getContainers()) {
                    if (container.getName().equals(containerName)) {
                        container.setImage(newImage);
                        containerFound = true;
                        break;
                    }
                }
                
                if (!containerFound) {
                    throw new RuntimeException("Container not found: " + containerName);
                }
                
                // Thêm annotation để trigger rolling update
                Map<String, String> annotations = daemonSet.getSpec().getTemplate().getMetadata().getAnnotations();
                if (annotations == null) {
                    annotations = new HashMap<>();
                }
                annotations.put("kubectl.kubernetes.io/restartedAt", String.valueOf(System.currentTimeMillis()));
                daemonSet.getSpec().getTemplate().getMetadata().setAnnotations(annotations);
                
                // Cập nhật daemonset
                client.apps().daemonSets()
                        .inNamespace(namespace)
                        .withName(daemonSetName)
                        .edit(d -> daemonSet);
                
                logger.info("Updated image for container {} in daemonset {}/{} to {}", 
                        containerName, namespace, daemonSetName, newImage);
            } else {
                throw new RuntimeException("Invalid daemonset spec");
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to update daemonset image {}/{}: {}", namespace, daemonSetName, e.getMessage(), e);
            throw new RuntimeException("Failed to update daemonset image: " + e.getMessage(), e);
        }
    }

    // ========== CronJobs ==========

    /**
     * Lấy cronjobs - nếu namespace là null, trả về tất cả cronjobs trong tất cả namespaces
     */
    public CronJobList getCronJobs(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            if (isNamespaceNotEmpty(namespace)) {
                return client.batch().v1().cronjobs().inNamespace(namespace).list();
            } else {
                return client.batch().v1().cronjobs().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get cronjobs for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get cronjobs: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy cronjob cụ thể theo tên
     */
    public CronJob getCronJob(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.batch().v1().cronjobs().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get cronjob {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to get cronjob: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa cronjob
     */
    public void deleteCronJob(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.batch().v1().cronjobs().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted cronjob: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete cronjob {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete cronjob: " + e.getMessage(), e);
        }
    }

    /**
     * Suspend cronjob (tạm dừng lịch chạy)
     */
    public void suspendCronJob(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            CronJob cronJob = client.batch().v1().cronjobs()
                    .inNamespace(namespace)
                    .withName(name)
                    .get();
            
            if (cronJob == null) {
                throw new RuntimeException("CronJob not found: " + name);
            }
            
            if (cronJob.getSpec() == null) {
                cronJob.setSpec(new io.fabric8.kubernetes.api.model.batch.v1.CronJobSpec());
            }
            
            cronJob.getSpec().setSuspend(true);
            client.batch().v1().cronjobs().inNamespace(namespace).withName(name).edit(cj -> cronJob);
            
            logger.info("Suspended cronjob: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to suspend cronjob {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to suspend cronjob: " + e.getMessage(), e);
        }
    }

    /**
     * Resume cronjob (tiếp tục lịch chạy)
     */
    public void resumeCronJob(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            CronJob cronJob = client.batch().v1().cronjobs()
                    .inNamespace(namespace)
                    .withName(name)
                    .get();
            
            if (cronJob == null) {
                throw new RuntimeException("CronJob not found: " + name);
            }
            
            if (cronJob.getSpec() == null) {
                cronJob.setSpec(new io.fabric8.kubernetes.api.model.batch.v1.CronJobSpec());
            }
            
            cronJob.getSpec().setSuspend(false);
            client.batch().v1().cronjobs().inNamespace(namespace).withName(name).edit(cj -> cronJob);
            
            logger.info("Resumed cronjob: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to resume cronjob {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to resume cronjob: " + e.getMessage(), e);
        }
    }
    
    /**
     * Lấy danh sách Jobs được tạo từ CronJob (lịch sử Jobs)
     */
    public List<Map<String, Object>> getCronJobJobs(String namespace, String cronJobName) {
        List<Map<String, Object>> jobHistory = new ArrayList<>();
        
        try (KubernetesClient client = getKubernetesClient()) {
            CronJob cronJob = client.batch().v1().cronjobs()
                    .inNamespace(namespace)
                    .withName(cronJobName)
                    .get();
            
            if (cronJob == null) {
                return jobHistory;
            }
            
            // Lấy tất cả Jobs trong namespace
            JobList jobList = client.batch().v1().jobs()
                    .inNamespace(namespace)
                    .list();
            
            // Tìm các Jobs được tạo từ CronJob này (kiểm tra ownerReferences)
            for (Job job : jobList.getItems()) {
                if (job.getMetadata() != null && job.getMetadata().getOwnerReferences() != null) {
                    boolean isOwnedByCronJob = job.getMetadata().getOwnerReferences().stream()
                            .anyMatch(owner -> "CronJob".equals(owner.getKind()) 
                                    && cronJobName.equals(owner.getName()));
                    
                    if (isOwnedByCronJob) {
                        Map<String, Object> jobInfo = new HashMap<>();
                        jobInfo.put("name", job.getMetadata().getName());
                        jobInfo.put("createdAt", job.getMetadata().getCreationTimestamp());
                        
                        // Lấy status
                        if (job.getStatus() != null) {
                            Integer succeeded = job.getStatus().getSucceeded() != null 
                                    ? job.getStatus().getSucceeded() 
                                    : 0;
                            Integer failed = job.getStatus().getFailed() != null 
                                    ? job.getStatus().getFailed() 
                                    : 0;
                            Integer active = job.getStatus().getActive() != null 
                                    ? job.getStatus().getActive() 
                                    : 0;
                            
                            jobInfo.put("succeeded", succeeded);
                            jobInfo.put("failed", failed);
                            jobInfo.put("active", active);
                            
                            // Xác định status
                            String status = "Unknown";
                            if (succeeded > 0 && active == 0 && failed == 0) {
                                status = "Succeeded";
                            } else if (failed > 0) {
                                status = "Failed";
                            } else if (active > 0) {
                                status = "Active";
                            } else {
                                status = "Pending";
                            }
                            jobInfo.put("status", status);
                            
                            // Completion time
                            if (job.getStatus().getCompletionTime() != null) {
                                jobInfo.put("completionTime", job.getStatus().getCompletionTime());
                            }
                            
                            // Start time
                            if (job.getStatus().getStartTime() != null) {
                                jobInfo.put("startTime", job.getStatus().getStartTime());
                            }
                        }
                        
                        // Lấy containers và images từ spec
                        if (job.getSpec() != null 
                                && job.getSpec().getTemplate() != null
                                && job.getSpec().getTemplate().getSpec() != null
                                && job.getSpec().getTemplate().getSpec().getContainers() != null
                                && !job.getSpec().getTemplate().getSpec().getContainers().isEmpty()) {
                            List<String> images = job.getSpec().getTemplate().getSpec().getContainers().stream()
                                    .map(Container::getImage)
                                    .collect(Collectors.toList());
                            jobInfo.put("images", images);
                        }
                        
                        jobHistory.add(jobInfo);
                    }
                }
            }
            
            // Sắp xếp theo thời gian tạo (mới nhất trước)
            jobHistory.sort((j1, j2) -> {
                String t1 = j1.get("createdAt") != null ? j1.get("createdAt").toString() : "";
                String t2 = j2.get("createdAt") != null ? j2.get("createdAt").toString() : "";
                return t2.compareTo(t1); // Descending
            });
            
        } catch (KubernetesClientException e) {
            logger.error("Failed to get jobs for cronjob {}/{}: {}", namespace, cronJobName, e.getMessage(), e);
            throw new RuntimeException("Failed to get cronjob jobs: " + e.getMessage(), e);
        }
        
        return jobHistory;
    }

    // ========== Jobs ==========

    /**
     * Lấy jobs - nếu namespace là null, trả về tất cả jobs trong tất cả namespaces
     */
    public JobList getJobs(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            if (isNamespaceNotEmpty(namespace)) {
                return client.batch().v1().jobs().inNamespace(namespace).list();
            } else {
                return client.batch().v1().jobs().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get jobs for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get jobs: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy job cụ thể theo tên
     */
    public Job getJob(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.batch().v1().jobs().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get job {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to get job: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa job
     */
    public void deleteJob(String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.batch().v1().jobs().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted job: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete job {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete job: " + e.getMessage(), e);
        }
    }

    // ========== Pods ==========

    /**
     * Lấy pods - nếu namespace là null, trả về tất cả pods trong tất cả namespaces
     */
    public PodList getPods(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            if (isNamespaceNotEmpty(namespace)) {
                return client.pods().inNamespace(namespace).list();
            } else {
                return client.pods().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get pods for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get pods: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy pod cụ thể theo tên
     */
    public Pod getPod(String namespace, String podName) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.pods().inNamespace(namespace).withName(podName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get pod {}/{}: {}", namespace, podName, e.getMessage(), e);
            throw new RuntimeException("Failed to get pod: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa pod
     */
    public void deletePod(String namespace, String podName) {
        try (KubernetesClient client = getKubernetesClient()) {
            client.pods().inNamespace(namespace).withName(podName).delete();
            logger.info("Deleted pod: {}/{}", namespace, podName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete pod {}/{}: {}", namespace, podName, e.getMessage(), e);
            throw new RuntimeException("Failed to delete pod: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy logs của pod
     */
    public String getPodLogs(String namespace, String podName, String containerName, int tailLines) {
        try (KubernetesClient client = getKubernetesClient()) {
            Pod pod = client.pods().inNamespace(namespace).withName(podName).get();
            if (pod == null) {
                throw new RuntimeException("Pod not found: " + podName);
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            
            if (containerName != null && !containerName.isEmpty()) {
                client.pods().inNamespace(namespace).withName(podName)
                        .inContainer(containerName)
                        .tailingLines(tailLines)
                        .watchLog(outputStream);
            } else {
                client.pods().inNamespace(namespace).withName(podName)
                        .tailingLines(tailLines)
                        .watchLog(outputStream);
            }

            return outputStream.toString();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get pod logs {}/{}: {}", namespace, podName, e.getMessage(), e);
            throw new RuntimeException("Failed to get pod logs: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy danh sách containers trong pod
     */
    public List<String> getPodContainers(String namespace, String podName) {
        try (KubernetesClient client = getKubernetesClient()) {
            Pod pod = client.pods().inNamespace(namespace).withName(podName).get();
            if (pod == null) {
                throw new RuntimeException("Pod not found: " + podName);
            }

            List<String> containers = new ArrayList<>();
            if (pod.getSpec() != null && pod.getSpec().getContainers() != null) {
                for (Container container : pod.getSpec().getContainers()) {
                    containers.add(container.getName());
                }
            }
            return containers;
        } catch (KubernetesClientException e) {
            logger.error("Failed to get pod containers {}/{}: {}", namespace, podName, e.getMessage(), e);
            throw new RuntimeException("Failed to get pod containers: " + e.getMessage(), e);
        }
    }

    /**
     * Exec command trong pod
     */
    public String execPodCommand(String namespace, String podName, String containerName, String command) {
        try (KubernetesClient client = getKubernetesClient()) {
            Pod pod = client.pods().inNamespace(namespace).withName(podName).get();
            if (pod == null) {
                throw new RuntimeException("Pod not found: " + podName);
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            ByteArrayOutputStream errorStream = new ByteArrayOutputStream();

            ExecWatch execWatch = client.pods().inNamespace(namespace).withName(podName)
                    .inContainer(containerName)
                    .writingOutput(outputStream)
                    .writingError(errorStream)
                    .exec(command.split("\\s+"));

            // Đợi một chút để command thực thi
            try {
                Thread.sleep(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            execWatch.close();

            String output = outputStream.toString();
            String error = errorStream.toString();

            if (!error.isEmpty()) {
                return error;
            }
            return output.isEmpty() ? "(Không có output)" : output;
        } catch (KubernetesClientException e) {
            logger.error("Failed to exec command in pod {}/{}: {}", namespace, podName, e.getMessage(), e);
            throw new RuntimeException("Failed to exec command: " + e.getMessage(), e);
        }
    }
}

