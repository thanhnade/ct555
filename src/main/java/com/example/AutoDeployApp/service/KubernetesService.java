package com.example.AutoDeployApp.service;

import io.fabric8.kubernetes.api.model.*;
import io.fabric8.kubernetes.api.model.apps.Deployment;
import io.fabric8.kubernetes.api.model.apps.DeploymentBuilder;
import io.fabric8.kubernetes.api.model.apps.DeploymentList;
import io.fabric8.kubernetes.api.model.apps.StatefulSet;
import io.fabric8.kubernetes.api.model.apps.StatefulSetList;
import io.fabric8.kubernetes.api.model.apps.DaemonSet;
import io.fabric8.kubernetes.api.model.apps.DaemonSetList;
import io.fabric8.kubernetes.api.model.networking.v1.Ingress;
import io.fabric8.kubernetes.api.model.networking.v1.IngressBuilder;
import io.fabric8.kubernetes.api.model.networking.v1.IngressList;
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
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

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
    private String ingressDomainBase; // Tùy chọn: domain cơ sở cho định tuyến theo subdomain

    @Value("${k8s.default.container.port:80}")
    private int defaultContainerPort;

    /**
     * Lấy Kubernetes client dựa trên cluster ID bằng cách kéo kubeconfig từ master node qua SSH
     */
    private KubernetesClient getKubernetesClient(Long clusterId) {
        try {
            if (clusterId == null) {
                // Dự phòng: dùng kubeconfig từ config hoặc mặc định
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
     * Lấy Kubernetes client từ config file (dự phòng)
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
            // Dự phòng: sử dụng vị trí kubeconfig mặc định (~/.kube/config) hoặc service
            // account
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
                        logger.warn("Không thể lấy kubeconfig mà không có password cho master: {}", master.getHost());
                        throw new RuntimeException("Không thể xác thực với master node. Cần SSH key.");
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
     * Đảm bảo namespace tồn tại, tạo mới nếu chưa có
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
     * Tạo Deployment trong Kubernetes với giới hạn tài nguyên có thể cấu hình
     */
    public String createDeployment(String namespace, String deploymentName, String dockerImage, int containerPort,
            Long clusterId, String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit) {
        return createDeployment(namespace, deploymentName, dockerImage, containerPort, clusterId,
                cpuRequest, cpuLimit, memoryRequest, memoryLimit, 1, null);
    }

    /**
     * Tạo Deployment trong Kubernetes với giới hạn tài nguyên, số replicas
     * và biến môi trường có thể cấu hình
     */
    public String createDeployment(String namespace, String deploymentName, String dockerImage, int containerPort,
            Long clusterId, String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit,
            int replicas, Map<String, String> envVars) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Sử dụng giới hạn tài nguyên được cung cấp hoặc mặc định
            String finalCpuRequest = (cpuRequest != null && !cpuRequest.trim().isEmpty()) ? cpuRequest.trim() : "100m";
            String finalCpuLimit = (cpuLimit != null && !cpuLimit.trim().isEmpty()) ? cpuLimit.trim() : "500m";
            String finalMemoryRequest = (memoryRequest != null && !memoryRequest.trim().isEmpty())
                    ? memoryRequest.trim()
                    : "128Mi";
            String finalMemoryLimit = (memoryLimit != null && !memoryLimit.trim().isEmpty()) ? memoryLimit.trim()
                    : "256Mi";

            // Đảm bảo replicas tối thiểu là 1
            int finalReplicas = Math.max(1, replicas);

            // Xây dựng danh sách biến môi trường
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

            // Xây dựng container với biến môi trường
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
     * Tạo Service trong Kubernetes
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
     * Tạo Ingress trong Kubernetes (sử dụng v1 API cho K8s 1.22+)
     * Hỗ trợ hai chế độ:
     * 1. Dựa trên domain (nếu k8s.ingress.domain.base được thiết lập): Sử dụng định
     * tuyến subdomain
     * (ví dụ: namespace.apps.example.com)
     * 2. Dựa trên path (mặc định): Sử dụng path dựa trên namespace (ví dụ:
     * /namespace/) để
     * tránh xung đột
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

            String diagnostics = collectDeploymentDiagnostics(namespace, deploymentName, clusterId, 50);

            throw new RuntimeException("Deployment chưa sẵn sàng: " + deploymentName + ". " + diagnostics, e);
        }
    }

    /**
     * Thu thập chẩn đoán cho deployment (pods, container state, log tail)
     */
    public String collectDeploymentDiagnostics(String namespace, String deploymentName, Long clusterId, int logLines) {
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

            PodList pods = diagClient.pods().inNamespace(namespace)
                    .withLabel("app", deploymentName)
                    .list();
            if (pods != null && pods.getItems() != null && !pods.getItems().isEmpty()) {
                for (int i = 0; i < Math.min(3, pods.getItems().size()); i++) {
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
                    try {
                        if (pod.getSpec() != null && pod.getSpec().getContainers() != null
                                && !pod.getSpec().getContainers().isEmpty()) {
                            String cName = pod.getSpec().getContainers().get(0).getName();
                            String logs = diagClient.pods().inNamespace(namespace)
                                    .withName(pod.getMetadata().getName())
                                    .inContainer(cName)
                                    .tailingLines(Math.max(logLines, 10))
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

            return sb.toString();
        } catch (Exception diagEx) {
            return "(không thể thu thập chẩn đoán: " + diagEx.getMessage() + ")";
        }
    }

    /**
     * Lấy URL Ingress từ MetalLB EXTERNAL-IP hoặc trạng thái Ingress (sử dụng v1
     * API)
     * Hỗ trợ cả định tuyến dựa trên domain và path
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

            // Thử lấy EXTERNAL-IP từ trạng thái Ingress
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
     * Xóa ứng dụng cùng tất cả tài nguyên liên quan (Deployment, Service, Ingress,
     * ConfigMap, Secret)
     * Sử dụng appName làm tên cơ sở cho các tài nguyên
     */
    public void deleteApp(String namespace, String appName, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Xóa Ingress (thử cả ing-{appName} và tên chính xác)
            String ingressName = "ing-" + appName;
            try {
                client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).delete();
                logger.info("Deleted ingress: {}/{}", namespace, ingressName);
            } catch (Exception e) {
                logger.debug("Ingress {}/{} not found or already deleted", namespace, ingressName);
            }

            // Xóa Service (thử cả appName và svc-{appName})
            try {
                client.services().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted service: {}/{}", namespace, appName);
            } catch (Exception e) {
                // Thử prefix svc-
                try {
                    String svcName = "svc-" + appName;
                    client.services().inNamespace(namespace).withName(svcName).delete();
                    logger.info("Đã xóa service: {}/{}", namespace, svcName);
                } catch (Exception e2) {
                    logger.debug("Service {}/{} không tìm thấy hoặc đã bị xóa", namespace, appName);
                }
            }

            // Xóa Deployment
            try {
                client.apps().deployments().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted deployment: {}/{}", namespace, appName);
            } catch (Exception e) {
                logger.warn("Failed to delete deployment: {}/{}", namespace, appName, e);
            }

            // Xóa ConfigMap
            try {
                client.configMaps().inNamespace(namespace).withName(appName).delete();
                logger.info("Deleted configmap: {}/{}", namespace, appName);
            } catch (Exception e) {
                logger.debug("ConfigMap {}/{} not found or already deleted", namespace, appName);
            }

            // Xóa Secret
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
     * Xóa tài nguyên deployment (sử dụng tên tài nguyên cụ thể)
     */
    public void deleteApplicationResources(String namespace, String deploymentName, String serviceName,
            String ingressName, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Xóa Ingress (sử dụng v1 API)
            if (ingressName != null && !ingressName.isEmpty()) {
                try {
                    client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).delete();
                    logger.info("Deleted ingress: {}/{}", namespace, ingressName);
                } catch (Exception e) {
                    logger.warn("Failed to delete ingress: {}/{}", namespace, ingressName, e);
                }
            }

            // Xóa Service
            if (serviceName != null && !serviceName.isEmpty()) {
                try {
                    client.services().inNamespace(namespace).withName(serviceName).delete();
                    logger.info("Deleted service: {}/{}", namespace, serviceName);
                } catch (Exception e) {
                    logger.warn("Failed to delete service: {}/{}", namespace, serviceName, e);
                }
            }

            // Xóa Deployment
            if (deploymentName != null && !deploymentName.isEmpty()) {
                try {
                    client.apps().deployments().inNamespace(namespace).withName(deploymentName).delete();
                    logger.info("Deleted deployment: {}/{}", namespace, deploymentName);
                } catch (Exception e) {
                    logger.warn("Failed to delete deployment: {}/{}", namespace, deploymentName, e);
                }
            }

            // Dọn dẹp tài nguyên liên quan (không xóa namespace ở đây)
            // ConfigMaps theo tên và theo label app=deploymentName
            try {
                client.configMaps().inNamespace(namespace).withName(deploymentName).delete();
            } catch (Exception ignored) {
            }
            try {
                client.configMaps().inNamespace(namespace).withLabel("app", deploymentName).delete();
            } catch (Exception ignored) {
            }

            // Secrets theo tên và theo label app=deploymentName
            try {
                client.secrets().inNamespace(namespace).withName(deploymentName).delete();
            } catch (Exception ignored) {
            }
            try {
                client.secrets().inNamespace(namespace).withLabel("app", deploymentName).delete();
            } catch (Exception ignored) {
            }

            // HorizontalPodAutoscaler theo label (thử v2 rồi v1 APIs; bỏ qua nếu không có)
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

            // PodDisruptionBudget theo label app=deploymentName
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
     * Kiểm tra xem deployment có tồn tại không
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
     * Xóa namespace (an toàn - sẽ xóa tất cả tài nguyên bên trong namespace trước)
     */
    public void deleteNamespace(String namespace, Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Kiểm tra xem namespace có tồn tại không
            Namespace ns = client.namespaces().withName(namespace).get();
            if (ns == null) {
                logger.info("Namespace {} does not exist, skipping deletion", namespace);
                return;
            }

            // Ngăn xóa các namespace hệ thống
            String nsLower = namespace.toLowerCase();
            if (nsLower.equals("kube-system") || nsLower.equals("kube-public")
                    || nsLower.equals("kube-node-lease") || nsLower.equals("default")) {
                throw new IllegalArgumentException("Cannot delete system namespace: " + namespace);
            }

            // Xóa namespace (Kubernetes sẽ tự động xóa tất cả tài nguyên bên trong)
            client.namespaces().withName(namespace).delete();
            logger.info("Deleted namespace: {}", namespace);
        } catch (IllegalArgumentException e) {
            // Ném lại lỗi validation
            throw e;
        } catch (Exception e) {
            logger.error("Failed to delete namespace: {}", namespace, e);
            throw new RuntimeException("Failed to delete namespace: " + namespace + ". Error: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy KubernetesClient cho cluster (method public để tái sử dụng)
     * 
     * @param clusterId ID của cluster
     * @return KubernetesClient
     */
    public KubernetesClient getKubernetesClientForCluster(Long clusterId) {
        return getKubernetesClient(clusterId);
    }

    /**
     * Lấy tất cả các node trong cluster
     */
    public NodeList getNodes(Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.nodes().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get nodes for cluster: {}", clusterId, e);
            throw new RuntimeException("Failed to get nodes: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy node cụ thể theo tên
     */
    public Node getNode(Long clusterId, String nodeName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.nodes().withName(nodeName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get node {} for cluster: {}", nodeName, clusterId, e);
            throw new RuntimeException("Failed to get node: " + e.getMessage(), e);
        }
    }

    /**
     * Get Kubernetes nodes và parse thành Map format (cho API response)
     */
    public List<Map<String, Object>> getKubernetesNodes(Long clusterId) {
        try {
            NodeList nodeList = getNodes(clusterId);
            return nodeList.getItems().stream()
                    .map(this::parseNodeToMap)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            logger.error("Failed to get and parse Kubernetes nodes for cluster: {}", clusterId, e);
            throw new RuntimeException("Failed to get Kubernetes nodes: " + e.getMessage(), e);
        }
    }

    /**
     * Parse Fabric8 Node object thành Map
     */
    private Map<String, Object> parseNodeToMap(Node node) {
        String nodeName = node.getMetadata().getName();
        NodeStatus status = node.getStatus();

        // Trích xuất IP
        String internalIP = "";
        String externalIP = "";
        if (status != null && status.getAddresses() != null) {
            for (NodeAddress address : status.getAddresses()) {
                if ("InternalIP".equals(address.getType())) {
                    internalIP = address.getAddress();
                } else if ("ExternalIP".equals(address.getType())) {
                    externalIP = address.getAddress();
                }
            }
        }

        // Trích xuất trạng thái Ready
        String k8sStatus = "Unknown";
        String reason = "";
        String message = "";
        if (status != null && status.getConditions() != null) {
            for (NodeCondition condition : status.getConditions()) {
                if ("Ready".equals(condition.getType())) {
                    boolean isReady = "True".equals(condition.getStatus());
                    k8sStatus = isReady ? "Ready" : "NotReady";
                    if (!isReady) {
                        reason = condition.getReason() != null ? condition.getReason() : "";
                        message = condition.getMessage() != null ? condition.getMessage() : "";
                    }
                    break;
                }
            }
        }

        // Trích xuất phiên bản
        String kubeletVersion = "";
        if (status != null && status.getNodeInfo() != null) {
            kubeletVersion = status.getNodeInfo().getKubeletVersion();
        }

        // Trích xuất vai trò
        List<String> roles = new ArrayList<>();
        Map<String, String> labels = node.getMetadata().getLabels();
        if (labels != null) {
            if (labels.containsKey("node-role.kubernetes.io/master") ||
                    labels.containsKey("node-role.kubernetes.io/control-plane")) {
                roles.add("master");
                roles.add("control-plane");
            }
            if (labels.containsKey("node-role.kubernetes.io/worker")) {
                roles.add("worker");
            }
        }

        // Trích xuất điều kiện
        Map<String, String> conditions = new HashMap<>();
        if (status != null && status.getConditions() != null) {
            for (NodeCondition condition : status.getConditions()) {
                conditions.put(condition.getType(), condition.getStatus());
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("name", nodeName);
        result.put("k8sStatus", k8sStatus);
        result.put("k8sInternalIP", internalIP);
        result.put("k8sExternalIP", externalIP);
        result.put("k8sVersion", kubeletVersion);
        result.put("k8sRoles", roles);
        result.put("k8sConditions", conditions);
        if (!reason.isEmpty()) {
            result.put("k8sStatusReason", reason);
        }
        if (!message.isEmpty()) {
            result.put("k8sStatusMessage", message);
        }
        return result;
    }

    /**
     * Lấy phiên bản Kubernetes từ cluster (từ master node hoặc API server)
     * Trả về chuỗi phiên bản (ví dụ: "v1.30.0") hoặc chuỗi rỗng nếu không có
     */
    public String getKubernetesVersion(Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            // Thử lấy phiên bản từ API server trước
            try {
                var versionInfo = client.getKubernetesVersion();
                if (versionInfo != null && versionInfo.getGitVersion() != null) {
                    return versionInfo.getGitVersion();
                }
            } catch (Exception e) {
                logger.debug("Failed to get version from API server, trying nodes: {}", e.getMessage());
            }

            // Dự phòng: lấy phiên bản từ kubelet version của master node
            NodeList nodeList = getNodes(clusterId);
            for (Node node : nodeList.getItems()) {
                // Kiểm tra xem đây có phải là master/control-plane node không
                Map<String, String> labels = node.getMetadata().getLabels();
                boolean isMaster = labels != null && (labels.containsKey("node-role.kubernetes.io/master") ||
                        labels.containsKey("node-role.kubernetes.io/control-plane"));

                if (isMaster) {
                    NodeStatus status = node.getStatus();
                    if (status != null && status.getNodeInfo() != null) {
                        String kubeletVersion = status.getNodeInfo().getKubeletVersion();
                        if (kubeletVersion != null && !kubeletVersion.isEmpty()) {
                            return kubeletVersion;
                        }
                    }
                }
            }

            // Nếu không tìm thấy master, thử bất kỳ node nào
            for (Node node : nodeList.getItems()) {
                NodeStatus status = node.getStatus();
                if (status != null && status.getNodeInfo() != null) {
                    String kubeletVersion = status.getNodeInfo().getKubeletVersion();
                    if (kubeletVersion != null && !kubeletVersion.isEmpty()) {
                        return kubeletVersion;
                    }
                }
            }

            return "";
        } catch (Exception e) {
            logger.error("Failed to get Kubernetes version for cluster: {}", clusterId, e);
            return "";
        }
    }

    /**
     * Lấy tất cả các namespace
     */
    public NamespaceList getNamespaces(Long clusterId) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.namespaces().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get namespaces for cluster: {}", clusterId, e);
            throw new RuntimeException("Failed to get namespaces: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy namespace cụ thể theo tên
     */
    public Namespace getNamespace(Long clusterId, String namespaceName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.namespaces().withName(namespaceName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get namespace {} for cluster: {}", namespaceName, clusterId, e);
            throw new RuntimeException("Failed to get namespace: " + e.getMessage(), e);
        }
    }

    // deleteNamespace() already exists at line 731

    /**
     * Lấy pods - nếu namespace là null, trả về tất cả pods trong tất cả namespaces
     */
    public PodList getPods(Long clusterId, String namespace) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            if (namespace != null && !namespace.isEmpty()) {
                return client.pods().inNamespace(namespace).list();
            } else {
                return client.pods().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get pods for cluster: {}, namespace: {}", clusterId, namespace, e);
            throw new RuntimeException("Failed to get pods: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy pod cụ thể theo tên
     */
    public Pod getPod(Long clusterId, String namespace, String podName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.pods().inNamespace(namespace).withName(podName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get pod {}/{} for cluster: {}", namespace, podName, clusterId, e);
            throw new RuntimeException("Failed to get pod: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa pod
     */
    public void deletePod(Long clusterId, String namespace, String podName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.pods().inNamespace(namespace).withName(podName).delete();
            logger.info("Deleted pod: {}/{}", namespace, podName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete pod {}/{} for cluster: {}", namespace, podName, clusterId, e);
            throw new RuntimeException("Failed to delete pod: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy deployments - nếu namespace là null, trả về tất cả deployments trong
     * tất cả namespaces
     */
    public DeploymentList getDeployments(Long clusterId, String namespace) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            if (namespace != null && !namespace.isEmpty()) {
                return client.apps().deployments().inNamespace(namespace).list();
            } else {
                return client.apps().deployments().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get deployments for cluster: {}, namespace: {}", clusterId, namespace, e);
            throw new RuntimeException("Failed to get deployments: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy deployment cụ thể theo tên
     */
    public Deployment getDeployment(Long clusterId, String namespace, String deploymentName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.apps().deployments().inNamespace(namespace).withName(deploymentName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get deployment {}/{} for cluster: {}", namespace, deploymentName, clusterId, e);
            throw new RuntimeException("Failed to get deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Scale deployment
     */
    public void scaleDeployment(Long clusterId, String namespace, String deploymentName, int replicas) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.apps().deployments().inNamespace(namespace).withName(deploymentName).scale(replicas);
            logger.info("Scaled deployment {}/{} to {} replicas", namespace, deploymentName, replicas);
        } catch (KubernetesClientException e) {
            logger.error("Failed to scale deployment {}/{} for cluster: {}", namespace, deploymentName, clusterId, e);
            throw new RuntimeException("Failed to scale deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa deployment
     */
    public void deleteDeployment(Long clusterId, String namespace, String deploymentName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.apps().deployments().inNamespace(namespace).withName(deploymentName).delete();
            logger.info("Deleted deployment: {}/{}", namespace, deploymentName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete deployment {}/{} for cluster: {}", namespace, deploymentName, clusterId, e);
            throw new RuntimeException("Failed to delete deployment: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy statefulsets - nếu namespace là null, trả về tất cả statefulsets trong
     * tất cả namespaces
     */
    public StatefulSetList getStatefulSets(Long clusterId, String namespace) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            if (namespace != null && !namespace.isEmpty()) {
                return client.apps().statefulSets().inNamespace(namespace).list();
            } else {
                return client.apps().statefulSets().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get statefulsets for cluster: {}, namespace: {}", clusterId, namespace, e);
            throw new RuntimeException("Failed to get statefulsets: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy statefulset cụ thể theo tên
     */
    public StatefulSet getStatefulSet(Long clusterId, String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.apps().statefulSets().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get statefulset {}/{} for cluster: {}", namespace, name, clusterId, e);
            throw new RuntimeException("Failed to get statefulset: " + e.getMessage(), e);
        }
    }

    /**
     * Scale statefulset
     */
    public void scaleStatefulSet(Long clusterId, String namespace, String name, int replicas) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.apps().statefulSets().inNamespace(namespace).withName(name).scale(replicas);
            logger.info("Scaled statefulset {}/{} to {} replicas", namespace, name, replicas);
        } catch (KubernetesClientException e) {
            logger.error("Failed to scale statefulset {}/{} for cluster: {}", namespace, name, clusterId, e);
            throw new RuntimeException("Failed to scale statefulset: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa statefulset
     */
    public void deleteStatefulSet(Long clusterId, String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.apps().statefulSets().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted statefulset: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete statefulset {}/{} for cluster: {}", namespace, name, clusterId, e);
            throw new RuntimeException("Failed to delete statefulset: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy daemonsets - nếu namespace là null, trả về tất cả daemonsets trong
     * tất cả namespaces
     */
    public DaemonSetList getDaemonSets(Long clusterId, String namespace) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            if (namespace != null && !namespace.isEmpty()) {
                return client.apps().daemonSets().inNamespace(namespace).list();
            } else {
                return client.apps().daemonSets().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get daemonsets for cluster: {}, namespace: {}", clusterId, namespace, e);
            throw new RuntimeException("Failed to get daemonsets: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy daemonset cụ thể theo tên
     */
    public DaemonSet getDaemonSet(Long clusterId, String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.apps().daemonSets().inNamespace(namespace).withName(name).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get daemonset {}/{} for cluster: {}", namespace, name, clusterId, e);
            throw new RuntimeException("Failed to get daemonset: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa daemonset
     * Lưu ý: DaemonSets không thể scale
     */
    public void deleteDaemonSet(Long clusterId, String namespace, String name) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.apps().daemonSets().inNamespace(namespace).withName(name).delete();
            logger.info("Deleted daemonset: {}/{}", namespace, name);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete daemonset {}/{} for cluster: {}", namespace, name, clusterId, e);
            throw new RuntimeException("Failed to delete daemonset: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy services - nếu namespace là null, trả về tất cả services trong tất cả
     * namespaces
     */
    public ServiceList getServices(Long clusterId, String namespace) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            if (namespace != null && !namespace.isEmpty()) {
                return client.services().inNamespace(namespace).list();
            } else {
                return client.services().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get services for cluster: {}, namespace: {}", clusterId, namespace, e);
            throw new RuntimeException("Failed to get services: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy service cụ thể theo tên
     */
    public io.fabric8.kubernetes.api.model.Service getService(Long clusterId, String namespace, String serviceName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.services().inNamespace(namespace).withName(serviceName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get service {}/{} for cluster: {}", namespace, serviceName, clusterId, e);
            throw new RuntimeException("Failed to get service: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa service
     */
    public void deleteService(Long clusterId, String namespace, String serviceName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.services().inNamespace(namespace).withName(serviceName).delete();
            logger.info("Deleted service: {}/{}", namespace, serviceName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete service {}/{} for cluster: {}", namespace, serviceName, clusterId, e);
            throw new RuntimeException("Failed to delete service: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy ingress - nếu namespace là null, trả về tất cả ingress trong tất cả
     * namespaces
     */
    public IngressList getIngress(Long clusterId, String namespace) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            if (namespace != null && !namespace.isEmpty()) {
                return client.network().v1().ingresses().inNamespace(namespace).list();
            } else {
                return client.network().v1().ingresses().inAnyNamespace().list();
            }
        } catch (KubernetesClientException e) {
            logger.error("Failed to get ingress for cluster: {}, namespace: {}", clusterId, namespace, e);
            throw new RuntimeException("Failed to get ingress: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy ingress cụ thể theo tên
     */
    public Ingress getIngress(Long clusterId, String namespace, String ingressName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            return client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get ingress {}/{} for cluster: {}", namespace, ingressName, clusterId, e);
            throw new RuntimeException("Failed to get ingress: " + e.getMessage(), e);
        }
    }

    /**
     * Xóa ingress
     */
    public void deleteIngress(Long clusterId, String namespace, String ingressName) {
        try (KubernetesClient client = getKubernetesClient(clusterId)) {
            client.network().v1().ingresses().inNamespace(namespace).withName(ingressName).delete();
            logger.info("Deleted ingress: {}/{}", namespace, ingressName);
        } catch (KubernetesClientException e) {
            logger.error("Failed to delete ingress {}/{} for cluster: {}", namespace, ingressName, clusterId, e);
            throw new RuntimeException("Failed to delete ingress: " + e.getMessage(), e);
        }
    }
}
