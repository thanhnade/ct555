package com.example.AutoDeployApp.service;

import io.fabric8.kubernetes.api.model.Endpoints;
import io.fabric8.kubernetes.api.model.EndpointsList;
import io.fabric8.kubernetes.api.model.PodList;
import io.fabric8.kubernetes.api.model.ServiceList;
import io.fabric8.kubernetes.api.model.networking.v1.Ingress;
import io.fabric8.kubernetes.api.model.networking.v1.IngressList;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class K8sServiceDiscoveryService {

    private static final Logger logger = LoggerFactory.getLogger(K8sServiceDiscoveryService.class);

    private final KubernetesService kubernetesService;

    public K8sServiceDiscoveryService(KubernetesService kubernetesService) {
        this.kubernetesService = kubernetesService;
    }

    private boolean hasNamespace(String namespace) {
        return namespace != null && !namespace.trim().isEmpty();
    }

    public ServiceList getServices(String namespace) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            if (hasNamespace(namespace)) {
                return client.services().inNamespace(namespace).list();
            }
            return client.services().inAnyNamespace().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get services for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get services: " + e.getMessage(), e);
        }
    }

    public io.fabric8.kubernetes.api.model.Service getService(String namespace, String serviceName) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.services().inNamespace(namespace).withName(serviceName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get service {}/{}: {}", namespace, serviceName, e.getMessage(), e);
            throw new RuntimeException("Failed to get service: " + e.getMessage(), e);
        }
    }

    public void deleteService(String namespace, String serviceName) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            client.services().inNamespace(namespace).withName(serviceName).delete();
            logger.info("Deleted service: {}/{}", namespace, serviceName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete service {}/{}: {}", namespace, serviceName, e.getMessage(), e);
            throw new RuntimeException("Failed to delete service: " + e.getMessage(), e);
        }
    }

    public IngressList getIngress(String namespace) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            if (hasNamespace(namespace)) {
                return client.network().v1().ingresses().inNamespace(namespace).list();
            }
            return client.network().v1().ingresses().inAnyNamespace().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get ingress for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get ingress: " + e.getMessage(), e);
        }
    }

    public Ingress getIngress(String namespace, String ingressName) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get ingress {}/{}: {}", namespace, ingressName, e.getMessage(), e);
            throw new RuntimeException("Failed to get ingress: " + e.getMessage(), e);
        }
    }

    public void deleteIngress(String namespace, String ingressName) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).delete();
            logger.info("Deleted ingress: {}/{}", namespace, ingressName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete ingress {}/{}: {}", namespace, ingressName, e.getMessage(), e);
            throw new RuntimeException("Failed to delete ingress: " + e.getMessage(), e);
        }
    }

    public EndpointsList getEndpoints(String namespace) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            if (hasNamespace(namespace)) {
                return client.endpoints().inNamespace(namespace).list();
            }
            return client.endpoints().inAnyNamespace().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get endpoints for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get endpoints: " + e.getMessage(), e);
        }
    }

    public Endpoints getEndpoint(String namespace, String endpointName) {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.endpoints().inNamespace(namespace).withName(endpointName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get endpoint {}/{}: {}", namespace, endpointName, e.getMessage(), e);
            throw new RuntimeException("Failed to get endpoint: " + e.getMessage(), e);
        }
    }

    public PodList getCoreDNSPods() {
        try (KubernetesClient client = kubernetesService.getKubernetesClientForCluster()) {
            return client.pods().inNamespace("kube-system")
                    .withLabel("k8s-app", "kube-dns")
                    .list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get CoreDNS pods: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to get CoreDNS pods: " + e.getMessage(), e);
        }
    }
}

