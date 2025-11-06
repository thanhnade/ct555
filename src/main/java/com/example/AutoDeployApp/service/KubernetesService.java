package com.example.AutoDeployApp.service;

import io.fabric8.kubernetes.api.model.*;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.DeploymentBuilder;
import io.fabric8.kubernetes.api.model.networking.v1.Ingress;
import io.fabric8.kubernetes.api.model.networking.v1.IngressBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import io.fabric8.kubernetes.client.KubernetesClientException;
import io.fabric8.kubernetes.client.Config;
import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.entity.Server;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class KubernetesService {

    private static final Logger logger = LoggerFactory.getLogger(KubernetesService.class);

    private final ClusterService clusterService;
    private final ServerService serverService;

    @Value("${k8s.kubeconfig.path:}")
    private String kubeconfigPath;

    public KubernetesService(ClusterService clusterService, ServerService serverService) {
        this.clusterService = clusterService;
        this.serverService = serverService;
    }

    // Không cần default namespace vì namespace được lấy từ username của user
    // @Value("${k8s.default.namespace:apps}")
    // private String defaultNamespace;

    @Value("${k8s.ingress.class:nginx}")
    private String ingressClassName;

    @Value("${k8s.ingress.external.ip:}")
    private String ingressExternalIp;

    @Value("${k8s.ingress.domain.base:}")
    private String ingressDomainBase; // Optional: base domain for subdomain-based routing

    @Value("${k8s.default.container.port:80}")
    private int defaultContainerPort;

    /**
     * Get Kubernetes client từ cluster ID - lấy kubeconfig từ master node qua SSH
     */
    private KubernetesClient getKubernetesClient(Long clusterId) {
        try {
            if (clusterId == null) {
                // Fallback: dùng kubeconfig từ config hoặc default
                return getKubernetesClientFromConfig();
            }

            // Lấy cluster
            Cluster cluster = clusterService.findAll().stream()
                    .filter(c -> c.getId().equals(clusterId))
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Cluster not found: " + clusterId));

            // Lấy master node
            var servers = serverService.findByClusterId(clusterId);
            Server master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException(
                            "Không tìm thấy MASTER node trong cluster: " + cluster.getName() +
                                    ". Vui lòng thêm MASTER node vào cluster trước."));

            // Kiểm tra master online - quan trọng vì cần SSH để lấy kubeconfig
            if (master.getStatus() != Server.ServerStatus.ONLINE) {
                throw new RuntimeException(
                        "MASTER node (" + master.getHost() + ") đang offline. " +
                                "Không thể kết nối đến Kubernetes cluster. " +
                                "Vui lòng kiểm tra kết nối máy chủ và đảm bảo MASTER node đang hoạt động.");
            }

            // Lấy kubeconfig từ master node qua SSH
            String kubeconfigContent = getKubeconfigFromMaster(master);

            // Tạo KubernetesClient từ kubeconfig
            Config config = Config.fromKubeconfig(null, kubeconfigContent, null);
            return new KubernetesClientBuilder().withConfig(config).build();

        } catch (Exception e) {
            logger.error("Failed to create Kubernetes client for cluster: {}", clusterId, e);
            throw new RuntimeException("Cannot connect to Kubernetes cluster: " + e.getMessage(), e);
        }
    }

    /**
     * Get Kubernetes client từ config file (fallback)
     */
    private KubernetesClient getKubernetesClientFromConfig() {
        try {
            if (kubeconfigPath != null && !kubeconfigPath.trim().isEmpty()) {
                File kubeconfigFile = new File(kubeconfigPath);
                if (kubeconfigFile.exists()) {
                    Config config = Config.fromKubeconfig(null, Files.readString(kubeconfigFile.toPath()), null);
                    return new KubernetesClientBuilder().withConfig(config).build();
                }
            }
            // Fallback: use default kubeconfig location (~/.kube/config) or service account
            return new KubernetesClientBuilder().build();
        } catch (Exception e) {
            logger.error("Failed to create Kubernetes client from config", e);
            throw new RuntimeException("Cannot connect to Kubernetes cluster: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy kubeconfig từ master node qua SSH
     */
    private String getKubeconfigFromMaster(Server master) {
        try {
            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String username = master.getUsername();

            // Thử lấy từ /etc/kubernetes/admin.conf trước
            String[] kubeconfigPaths = {
                    "sudo cat /etc/kubernetes/admin.conf",
                    "cat /root/.kube/config",
                    "cat $HOME/.kube/config"
            };

            String kubeconfig = null;
            for (String cmd : kubeconfigPaths) {
                try {
                    if (pem != null && !pem.trim().isEmpty()) {
                        kubeconfig = serverService.execCommandWithKey(master.getHost(), port, username, pem, cmd,
                                10000);
                    } else {
                        // Nếu không có key, cần password - nhưng không có trong context này
                        // Có thể throw exception hoặc log warning
                        logger.warn("Cannot get kubeconfig without password for master: {}", master.getHost());
                        throw new RuntimeException("Cannot authenticate to master node. SSH key required.");
                    }

                    if (kubeconfig != null && !kubeconfig.trim().isEmpty() && !kubeconfig.trim().startsWith("error")) {
                        logger.info("Successfully retrieved kubeconfig from master: {} using command: {}",
                                master.getHost(), cmd);
                        return kubeconfig;
                    }
                } catch (Exception e) {
                    logger.debug("Failed to get kubeconfig using command: {}", cmd, e);
                }
            }

            throw new RuntimeException("Cannot retrieve kubeconfig from master node: " + master.getHost());

        } catch (Exception e) {
            logger.error("Failed to get kubeconfig from master: {}", master.getHost(), e);
            throw new RuntimeException("Failed to get kubeconfig from master node: " + e.getMessage(), e);
        }
    }

    /**
     * Ensure namespace exists, create if not
     */
    public void ensureNamespace(String namespace, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            Namespace existingNamespace = client.namespaces().withName(namespace).get();
            if (existingNamespace == null) {
                Namespace namespaceObj = new NamespaceBuilder()
                        .withNewMetadata()
                        .withName(namespace)
                        .endMetadata()
                        .build();
                client.namespaces().resource(namespaceObj).create();
                logger.info("Created namespace: {}", namespace);
            } else {
                logger.debug("Namespace {} already exists", namespace);
            }
        } catch (Exception e) {
            logger.error("Failed to ensure namespace: {}", namespace, e);
            throw new RuntimeException("Failed to create namespace: " + namespace, e);
        }
    }

    /**
     * Create Deployment in Kubernetes with configurable resource limits
     */
    public String createDeployment(String namespace, String deploymentName, String dockerImage, int containerPort,
            Long clusterId, String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit) {
        return createDeployment(namespace, deploymentName, dockerImage, containerPort, clusterId,
                cpuRequest, cpuLimit, memoryRequest, memoryLimit, 1, null);
    }

    /**
     * Create Deployment in Kubernetes with configurable resource limits, replicas
     * and env vars
     */
    public String createDeployment(String namespace, String deploymentName, String dockerImage, int containerPort,
            Long clusterId, String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit,
            int replicas, Map<String, String> envVars) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Use provided resource limits or defaults
            String finalCpuRequest = (cpuRequest != null && !cpuRequest.trim().isEmpty()) ? cpuRequest.trim() : "100m";
            String finalCpuLimit = (cpuLimit != null && !cpuLimit.trim().isEmpty()) ? cpuLimit.trim() : "500m";
            String finalMemoryRequest = (memoryRequest != null && !memoryRequest.trim().isEmpty())
                    ? memoryRequest.trim()
                    : "128Mi";
            String finalMemoryLimit = (memoryLimit != null && !memoryLimit.trim().isEmpty()) ? memoryLimit.trim()
                    : "256Mi";

            // Ensure replicas is at least 1
            int finalReplicas = Math.max(1, replicas);

            // Build environment variables list
            java.util.List<EnvVar> envVarList = new java.util.ArrayList<>();
            if (envVars != null && !envVars.isEmpty()) {
                for (Map.Entry<String, String> entry : envVars.entrySet()) {
                    if (entry.getKey() != null && !entry.getKey().trim().isEmpty()) {
                        EnvVar envVar = new EnvVarBuilder()
                                .withName(entry.getKey().trim())
                                .withValue(entry.getValue() != null ? entry.getValue() : "")
                                .build();
                        envVarList.add(envVar);
                    }
                }
            }

            // Build container with environment variables
            ContainerBuilder containerBuilder = new ContainerBuilder()
                    .withName(deploymentName)
                    .withImage(dockerImage)
                    .addNewPort()
                    .withContainerPort(containerPort)
                    .withProtocol("TCP")
                    .endPort()
                    .withNewResources()
                    .addToRequests("memory", new Quantity(finalMemoryRequest))
                    .addToRequests("cpu", new Quantity(finalCpuRequest))
                    .addToLimits("memory", new Quantity(finalMemoryLimit))
                    .addToLimits("cpu", new Quantity(finalCpuLimit))
                    .endResources();

            if (!envVarList.isEmpty()) {
                containerBuilder.withEnv(envVarList);
            }

            Deployment deployment = new DeploymentBuilder()
                    .withNewMetadata()
                    .withName(deploymentName)
                    .withNamespace(namespace)
                    .addToLabels("app", deploymentName)
                    .endMetadata()
                    .withNewSpec()
                    .withReplicas(finalReplicas)
                    .withNewSelector()
                    .addToMatchLabels("app", deploymentName)
                    .endSelector()
                    .withNewTemplate()
                    .withNewMetadata()
                    .addToLabels("app", deploymentName)
                    .endMetadata()
                    .withNewSpec()
                    .addToContainers(containerBuilder.build())
                    .endSpec()
                    .endTemplate()
                    .endSpec()
                    .build();

            client.apps().deployments().inNamespace(namespace).resource(deployment).create();
            logger.info("Created deployment: {}/{} with replicas={}, port={}, resources: CPU={}/{}, Memory={}/{}",
                    namespace, deploymentName, finalReplicas, containerPort,
                    finalCpuRequest, finalCpuLimit, finalMemoryRequest, finalMemoryLimit);
            return deploymentName;
        } catch (Exception e) {
            logger.error("Failed to create deployment: {}/{}", namespace, deploymentName, e);
            throw new RuntimeException("Failed to create deployment: " + deploymentName, e);
        }
    }

    /**
     * Create Service in Kubernetes
     */
    public String createService(String namespace, String serviceName, String deploymentName, int port, int targetPort,
            Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            io.fabric8.kubernetes.api.model.Service service = new ServiceBuilder()
                    .withNewMetadata()
                    .withName(serviceName)
                    .withNamespace(namespace)
                    .addToLabels("app", deploymentName)
                    .endMetadata()
                    .withNewSpec()
                    .withType("ClusterIP")
                    .addToSelector("app", deploymentName)
                    .addNewPort()
                    .withPort(port)
                    .withTargetPort(new IntOrString(targetPort))
                    .withProtocol("TCP")
                    .endPort()
                    .endSpec()
                    .build();

            client.services().inNamespace(namespace).resource(service).create();
            logger.info("Created service: {}/{}", namespace, serviceName);
            return serviceName;
        } catch (Exception e) {
            logger.error("Failed to create service: {}/{}", namespace, serviceName, e);
            throw new RuntimeException("Failed to create service: " + serviceName, e);
        }
    }

    /**
     * Create Ingress in Kubernetes (using v1 API for K8s 1.22+)
     * Supports two modes:
     * 1. Domain-based (if k8s.ingress.domain.base is set): Uses subdomain routing
     * (e.g., namespace.apps.example.com)
     * 2. Path-based (default): Uses namespace-based path (e.g., /namespace/) to
     * avoid conflicts
     */
    public String createIngress(String namespace, String ingressName, String serviceName, int servicePort,
            Long clusterId, String appName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            Ingress ingress;

            if (ingressDomainBase != null && !ingressDomainBase.trim().isEmpty()) {
                String appLabel = sanitizeDnsLabel(appName != null ? appName : "app");
                String host = namespace + "-" + appLabel + "." + ingressDomainBase.trim();
                ingress = new IngressBuilder()
                        .withNewMetadata()
                        .withName(ingressName)
                        .withNamespace(namespace)
                        .addToAnnotations("kubernetes.io/ingress.class", ingressClassName)
                        .endMetadata()
                        .withNewSpec()
                        .withIngressClassName(ingressClassName)
                        .addNewRule()
                        .withHost(host)
                        .withNewHttp()
                        .addNewPath()
                        .withPath("/")
                        .withPathType("Prefix")
                        .withNewBackend()
                        .withNewService()
                        .withName(serviceName)
                        .withNewPort()
                        .withNumber(servicePort)
                        .endPort()
                        .endService()
                        .endBackend()
                        .endPath()
                        .endHttp()
                        .endRule()
                        .endSpec()
                        .build();
                logger.info("Created ingress with domain-based routing: host={} namespace={}", host, namespace);
            } else {
                String ingressPath = "/" + namespace + "/";
                ingress = new IngressBuilder()
                        .withNewMetadata()
                        .withName(ingressName)
                        .withNamespace(namespace)
                        .addToAnnotations("kubernetes.io/ingress.class", ingressClassName)
                        .addToAnnotations("nginx.ingress.kubernetes.io/rewrite-target", "/")
                        .endMetadata()
                        .withNewSpec()
                        .withIngressClassName(ingressClassName)
                        .addNewRule()
                        .withNewHttp()
                        .addNewPath()
                        .withPath(ingressPath)
                        .withPathType("Prefix")
                        .withNewBackend()
                        .withNewService()
                        .withName(serviceName)
                        .withNewPort()
                        .withNumber(servicePort)
                        .endPort()
                        .endService()
                        .endBackend()
                        .endPath()
                        .endHttp()
                        .endRule()
                        .endSpec()
                        .build();
                logger.info("Created ingress with path-based routing: path={}", ingressPath);
            }
            client.network().v1().ingresses().inNamespace(namespace).resource(ingress).create();
            logger.info("Created ingress: {}/{} with ingressClassName: {}", namespace, ingressName, ingressClassName);
            return ingressName;
        } catch (Exception e) {
            logger.error("Failed to create ingress: {}/{}", namespace, ingressName, e);
            if (e.getMessage() != null) {
                logger.error("Ingress creation error details: {}", e.getMessage());
            }
            throw new RuntimeException("Failed to create ingress: " + ingressName + ". Error: " + e.getMessage(), e);
        }
    }

    private String sanitizeDnsLabel(String input) {
        if (input == null)
            return "app";
        String s = input.toLowerCase().replaceAll("[^a-z0-9-]", "-");
        s = s.replaceAll("-+", "-");
        s = s.replaceAll("(^-+|-+$)", "");
        if (s.isEmpty())
            s = "app";
        if (!Character.isLetterOrDigit(s.charAt(0)))
            s = "a" + s;
        if (!Character.isLetterOrDigit(s.charAt(s.length() - 1)))
            s = s + "0";
        return s;
    }

    /**
     * Chờ Deployment sẵn sàng (timeout tính bằng phút). Khi thất bại, thu thập
     * chẩn đoán chi tiết để hỗ trợ xác định nguyên nhân.
     */
    public void waitForDeploymentReady(String namespace, String deploymentName, long timeoutMinutes, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            logger.info("Đang chờ Deployment {}/{} sẵn sàng...", namespace, deploymentName);

            client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .waitUntilReady(timeoutMinutes, TimeUnit.MINUTES);

            logger.info("Deployment {}/{} đã sẵn sàng", namespace, deploymentName);
        } catch (Exception e) {
            logger.error("Chờ Deployment sẵn sàng thất bại: {}/{}", namespace, deploymentName, e);

            // Thu thập chẩn đoán để làm rõ nguyên nhân (ImagePullBackOff,
            // CrashLoopBackOff, v.v.)
            String diagnostics;
            try (KubernetesClient diagClient = getKubernetesClient(clusterId)) {
                StringBuilder sb = new StringBuilder();
                sb.append("Chẩn đoán cho ")
                        .append(namespace).append("/").append(deploymentName).append(": ");

                Deployment dep = diagClient.apps().deployments().inNamespace(namespace).withName(deploymentName).get();
                if (dep != null && dep.getStatus() != null) {
                    Integer desired = dep.getSpec() != null ? dep.getSpec().getReplicas() : null;
                    Integer ready = dep.getStatus().getReadyReplicas();
                    Integer unavailable = dep.getStatus().getUnavailableReplicas();
                    sb.append("bản sao (mong muốn=").append(desired)
                            .append(", sẵn sàng=").append(ready)
                            .append(", không sẵn sàng=").append(unavailable).append("). ");
                }

                // Find Pods by label app=deploymentName
                PodList pods = diagClient.pods().inNamespace(namespace)
                        .withLabel("app", deploymentName)
                        .list();
                if (pods != null && pods.getItems() != null && !pods.getItems().isEmpty()) {
                    for (int i = 0; i < Math.min(3, pods.getItems().size()); i++) { // limit detail to first 3 pods
                        Pod pod = pods.getItems().get(i);
                        sb.append("\nPod ").append(pod.getMetadata().getName()).append(" trạng thái=")
                                .append(pod.getStatus() != null ? pod.getStatus().getPhase() : "?");
                        if (pod.getStatus() != null && pod.getStatus().getContainerStatuses() != null) {
                            for (ContainerStatus cs : pod.getStatus().getContainerStatuses()) {
                                sb.append("\n  container ").append(cs.getName());
                                if (cs.getState() != null && cs.getState().getWaiting() != null) {
                                    sb.append(" đang chờ - lý do=")
                                            .append(cs.getState().getWaiting().getReason())
                                            .append(", thông điệp=")
                                            .append(cs.getState().getWaiting().getMessage());
                                }
                                if (cs.getState() != null && cs.getState().getTerminated() != null) {
                                    sb.append(" kết thúc - lý do=")
                                            .append(cs.getState().getTerminated().getReason())
                                            .append(", thông điệp=")
                                            .append(cs.getState().getTerminated().getMessage());
                                }
                            }
                        }
                        // Try to include last 50 log lines of the first container
                        try {
                            if (pod.getSpec() != null && pod.getSpec().getContainers() != null
                                    && !pod.getSpec().getContainers().isEmpty()) {
                                String cName = pod.getSpec().getContainers().get(0).getName();
                                String logs = diagClient.pods().inNamespace(namespace)
                                        .withName(pod.getMetadata().getName())
                                        .inContainer(cName)
                                        .tailingLines(50)
                                        .getLog();
                                if (logs != null && !logs.isEmpty()) {
                                    sb.append("\n  log gần nhất (" + cName + "):\n").append(logs);
                                }
                            }
                        } catch (Exception logEx) {
                            sb.append("\n  (không thể lấy log: ").append(logEx.getMessage()).append(")");
                        }
                    }
                } else {
                    sb.append("Không tìm thấy Pod với nhãn app=").append(deploymentName);
                }

                diagnostics = sb.toString();
            } catch (Exception diagEx) {
                diagnostics = "(không thể thu thập chẩn đoán: " + diagEx.getMessage() + ")";
            }

            throw new RuntimeException("Deployment chưa sẵn sàng: " + deploymentName + ". " + diagnostics, e);
        }
    }

    /**
     * Get Ingress URL from MetalLB EXTERNAL-IP or Ingress status (using v1 API)
     * Supports both domain-based and path-based routing
     */
    public String getIngressURL(String namespace, String ingressName, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            Ingress ingress = client.network().v1().ingresses()
                    .inNamespace(namespace)
                    .withName(ingressName)
                    .get();

            if (ingress == null) {
                throw new RuntimeException("Ingress not found: " + ingressName);
            }

            boolean isDomainBased = ingress.getSpec() != null &&
                    ingress.getSpec().getRules() != null &&
                    !ingress.getSpec().getRules().isEmpty() &&
                    ingress.getSpec().getRules().get(0).getHost() != null &&
                    !ingress.getSpec().getRules().get(0).getHost().isEmpty();

            if (isDomainBased) {
                String host = ingress.getSpec().getRules().get(0).getHost();
                return "http://" + host;
            }

            // Try to get EXTERNAL-IP from Ingress status
            if (ingress.getStatus() != null && ingress.getStatus().getLoadBalancer() != null) {
                io.fabric8.kubernetes.api.model.networking.v1.IngressLoadBalancerStatus lbStatus = ingress
                        .getStatus().getLoadBalancer();
                if (lbStatus.getIngress() != null && !lbStatus.getIngress().isEmpty()) {
                    io.fabric8.kubernetes.api.model.networking.v1.IngressLoadBalancerIngress lbIngress = lbStatus
                            .getIngress().get(0);
                    String ip = lbIngress.getIp();
                    if (ip != null && !ip.isEmpty()) {
                        return "http://" + ip + "/" + namespace + "/";
                    }
                    String hostname = lbIngress.getHostname();
                    if (hostname != null && !hostname.isEmpty()) {
                        return "http://" + hostname + "/" + namespace + "/";
                    }
                }
            }

            if (ingressExternalIp != null && !ingressExternalIp.trim().isEmpty()) {
                return "http://" + ingressExternalIp + "/" + namespace + "/";
            }

            throw new RuntimeException(
                    "Cannot determine Ingress URL. Please check MetalLB configuration or set k8s.ingress.external.ip");
        } catch (KubernetesClientException e) {
            logger.error("Failed to get Ingress URL: {}/{}", namespace, ingressName, e);
            throw new RuntimeException("Failed to get Ingress URL: " + e.getMessage(), e);
        }
    }

    /**
     * Delete app with all related resources (Deployment, Service, Ingress,
     * ConfigMap, Secret)
     * Uses appName as base name for resources
     */
    public void deleteApp(String namespace, String appName, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Delete Ingress (try both ing-{appName} and exact name)
            String ingressName = "ing-" + appName;
            try {
                client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).delete();
                logger.info("Deleted ingress: {}/{}", namespace, ingressName);
            } catch (Exception e) {
                logger.debug("Ingress {}/{} not found or already deleted", namespace, ingressName);
            }

            // Delete Service (try both appName and svc-{appName})
            try {
                client.services().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted service: {}/{}", namespace, appName);
            } catch (Exception e) {
                // Try svc- prefix
                try {
                    String svcName = "svc-" + appName;
                    client.services().inNamespace(namespace).withName(svcName).delete();
                    logger.info("Deleted service: {}/{}", namespace, svcName);
                } catch (Exception e2) {
                    logger.debug("Service {}/{} not found or already deleted", namespace, appName);
                }
            }

            // Delete Deployment
            try {
                client.apps().deployments().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted deployment: {}/{}", namespace, appName);
            } catch (Exception e) {
                logger.warn("Failed to delete deployment: {}/{}", namespace, appName, e);
            }

            // Delete ConfigMap
            try {
                client.configMaps().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted configmap: {}/{}", namespace, appName);
            } catch (Exception e) {
                logger.debug("ConfigMap {}/{} not found or already deleted", namespace, appName);
            }

            // Delete Secret
            try {
                client.secrets().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted secret: {}/{}", namespace, appName);
            } catch (Exception e) {
                logger.debug("Secret {}/{} not found or already deleted", namespace, appName);
            }

            logger.info("🧹 Deleted all resources for app: {}/{}", namespace, appName);
        } catch (Exception e) {
            logger.error("Failed to delete app {}/{}", namespace, appName, e);
            throw new RuntimeException("Failed to delete app: " + appName, e);
        }
    }

    /**
     * Delete deployment resources (using specific resource names)
     */
    public void deleteApplicationResources(String namespace, String deploymentName, String serviceName,
            String ingressName, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Delete Ingress (using v1 API)
            if (ingressName != null && !ingressName.isEmpty()) {
                try {
                    client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).delete();
                    logger.info("Deleted ingress: {}/{}", namespace, ingressName);
                } catch (Exception e) {
                    logger.warn("Failed to delete ingress: {}/{}", namespace, ingressName, e);
                }
            }

            // Delete Service
            if (serviceName != null && !serviceName.isEmpty()) {
                try {
                    client.services().inNamespace(namespace).withName(serviceName).delete();
                    logger.info("Deleted service: {}/{}", namespace, serviceName);
                } catch (Exception e) {
                    logger.warn("Failed to delete service: {}/{}", namespace, serviceName, e);
                }
            }

            // Delete Deployment
            if (deploymentName != null && !deploymentName.isEmpty()) {
                try {
                    client.apps().deployments().inNamespace(namespace).withName(deploymentName).delete();
                    logger.info("Deleted deployment: {}/{}", namespace, deploymentName);
                } catch (Exception e) {
                    logger.warn("Failed to delete deployment: {}/{}", namespace, deploymentName, e);
                }
            }

            // Best-effort cleanup of related resources (no namespace deletion here)
            // ConfigMaps by name and by label app=deploymentName
            try {
                client.configMaps().inNamespace(namespace).withName(deploymentName).delete();
            } catch (Exception ignored) {
            }
            try {
                client.configMaps().inNamespace(namespace).withLabel("app", deploymentName).delete();
            } catch (Exception ignored) {
            }

            // Secrets by name and by label app=deploymentName
            try {
                client.secrets().inNamespace(namespace).withName(deploymentName).delete();
            } catch (Exception ignored) {
            }
            try {
                client.secrets().inNamespace(namespace).withLabel("app", deploymentName).delete();
            } catch (Exception ignored) {
            }

            // HorizontalPodAutoscaler by label (try v2 then v1 APIs; ignore if not present)
            try {
                client.autoscaling().v2().horizontalPodAutoscalers().inNamespace(namespace)
                        .withLabel("app", deploymentName).delete();
            } catch (Throwable ignored) {
                try {
                    client.autoscaling().v1().horizontalPodAutoscalers().inNamespace(namespace)
                            .withLabel("app", deploymentName).delete();
                } catch (Throwable ignored2) {
                }
            }

            // PodDisruptionBudget by label app=deploymentName
            try {
                client.policy().v1().podDisruptionBudget().inNamespace(namespace)
                        .withLabel("app", deploymentName).delete();
            } catch (Throwable ignored) {
            }
        } catch (Exception e) {
            logger.error("Failed to delete resources", e);
            throw new RuntimeException("Failed to delete Kubernetes resources", e);
        }
    }

    /**
     * Check if deployment exists
     */
    public boolean deploymentExists(String namespace, String deploymentName, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            Deployment deployment = client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .get();
            return deployment != null;
        } catch (Exception e) {
            logger.error("Failed to check deployment existence: {}/{}", namespace, deploymentName, e);
            return false;
        }
    }

    /**
     * Delete namespace (safely - will delete all resources inside namespace first)
     */
    public void deleteNamespace(String namespace, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Check if namespace exists
            Namespace ns = client.namespaces().withName(namespace).get();
            if (ns == null) {
                logger.info("Namespace {} does not exist, skipping deletion", namespace);
                return;
            }

            // Prevent deletion of system namespaces
            String nsLower = namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public")
                    || nsLower.equals("kube-node-lease") || nsLower.equals("default")) {
                throw new IllegalArgumentException("Cannot delete system namespace: " + namespace);
            }

            // Delete namespace (Kubernetes will delete all resources inside automatically)
            client.namespaces().withName(namespace).delete();
            logger.info("Deleted namespace: {}", namespace);
        } catch (IllegalArgumentException e) {
            // Re-throw validation errors
            throw e;
        } catch (Exception e) {
            logger.error("Failed to delete namespace: {}", namespace, e);
            throw new RuntimeException("Failed to delete namespace: " + namespace + ". Error: " + e.getMessage(), e);
        }
    }
}
