package com.example.AutoDeployApp.service;

import io.fabric8.kubernetes.api.model.PersistentVolume;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaim;
import io.fabric8.kubernetes.api.model.PersistentVolumeClaimList;
import io.fabric8.kubernetes.api.model.PersistentVolumeList;
import io.fabric8.kubernetes.api.model.storage.StorageClass;
import io.fabric8.kubernetes.api.model.storage.StorageClassList;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class K8sStorageService {

    private static final Logger logger = LoggerFactory.getLogger(K8sStorageService.class);

    private final KubernetesService kubernetesService;

    public K8sStorageService(KubernetesService kubernetesService) {
        this.kubernetesService = kubernetesService;
    }

    private boolean hasNamespace(String namespace) {
        return namespace != null && !namespace.trim().isEmpty();
    }

    public PersistentVolumeClaimList getPersistentVolumeClaims(String namespace) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            if (hasNamespace(namespace)) {
                return client.persistentVolumeClaims().inNamespace(namespace).list();
            }
            return client.persistentVolumeClaims().inAnyNamespace().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get PVCs for namespace {}: {}", namespace, e.getMessage(), e);
            throw new RuntimeException("Failed to get PersistentVolumeClaims: " + e.getMessage(), e);
        }
    }

    public PersistentVolumeClaim getPersistentVolumeClaim(String namespace, String name) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.persistentVolumeClaims().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get PVC {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to get PersistentVolumeClaim: " + e.getMessage(), e);
        }
    }

    public void deletePersistentVolumeClaim(String namespace, String name) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            client.persistentVolumeClaims().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted PVC: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete PVC {}/{}: {}", namespace, name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete PersistentVolumeClaim: " + e.getMessage(), e);
        }
    }

    public PersistentVolumeList getPersistentVolumes() {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.persistentVolumes().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get PersistentVolumes: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to get PersistentVolumes: " + e.getMessage(), e);
        }
    }

    public PersistentVolume getPersistentVolume(String name) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.persistentVolumes().withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get PersistentVolume {}: {}", name, e.getMessage(), e);
            throw new RuntimeException("Failed to get PersistentVolume: " + e.getMessage(), e);
        }
    }

    public void deletePersistentVolume(String name) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            client.persistentVolumes().withName(name).delete();
            logger.info("Deleted PersistentVolume: {}", name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete PersistentVolume {}: {}", name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete PersistentVolume: " + e.getMessage(), e);
        }
    }

    public StorageClassList getStorageClasses() {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.storage().v1().storageClasses().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get StorageClasses: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to get StorageClasses: " + e.getMessage(), e);
        }
    }

    public StorageClass getStorageClass(String name) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.storage().v1().storageClasses().withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get StorageClass {}: {}", name, e.getMessage(), e);
            throw new RuntimeException("Failed to get StorageClass: " + e.getMessage(), e);
        }
    }

    public void deleteStorageClass(String name) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            client.storage().v1().storageClasses().withName(name).delete();
            logger.info("Deleted StorageClass: {}", name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete StorageClass {}: {}", name, e.getMessage(), e);
            throw new RuntimeException("Failed to delete StorageClass: " + e.getMessage(), e);
        }
    }
}

