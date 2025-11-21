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
import com.example.AutoDeployApp.entity.Server;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class KubernetesService {

    private static final Logger logger = LoggerFactory.getLogger(KubernetesService.class);

    private final ClusterService clusterService;
    private final ServerService serverService;

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
     * Kiểm tra nhanh xem kubelet service đã loaded chưa (bằng systemctl status kubelet)
     * Nếu loaded, thử restart service một lần và gọi lại với timeout ngắn hơn
     * Trả về true nếu kubelet service loaded, false nếu chưa
     */
    private boolean isKubeletLoaded(Server master) {
        try {
            String pem = serverService.resolveServerPrivateKeyPem(master.getId());
            int port = master.getPort() != null ? master.getPort() : 22;
            String username = master.getUsername();

            if (pem == null || pem.trim().isEmpty()) {
                return false; // Không có SSH key, không thể kiểm tra
            }

            // Kiểm tra nhanh: systemctl is-enabled kubelet hoặc systemctl status kubelet
            // Thử nhiều cách để đảm bảo hoạt động
            String result = null;
            
            // Cách 1: systemctl is-enabled (đơn giản nhất)
            try {
                String checkCmd1 = "sudo systemctl is-enabled kubelet 2>&1";
                logger.info("[K8s Service] isKubeletLoaded() - Trying method 1: {}", checkCmd1);
                System.out.println("[K8s Service] isKubeletLoaded() - Trying method 1: " + checkCmd1);
                result = serverService.execCommandWithKey(master.getHost(), port, username, pem, checkCmd1, 5000);
                logger.info("[K8s Service] isKubeletLoaded() - Method 1 result: {}", result);
                System.out.println("[K8s Service] isKubeletLoaded() - Method 1 result: " + result);
                
                if (result != null && (result.trim().equals("enabled") || result.trim().equals("static") || result.trim().contains("enabled"))) {
                    logger.info("[K8s Service] isKubeletLoaded() - Kubelet is enabled (method 1)");
                    System.out.println("[K8s Service] isKubeletLoaded() - Kubelet is enabled (method 1)");
                    return true;
                }
            } catch (Exception e1) {
                logger.debug("[K8s Service] isKubeletLoaded() - Method 1 failed: {}", e1.getMessage());
            }
            
            // Cách 2: systemctl status với grep
            try {
                String checkCmd2 = "sudo systemctl status kubelet 2>&1 | grep -c 'Loaded:' || echo '0'";
                logger.info("[K8s Service] isKubeletLoaded() - Trying method 2: {}", checkCmd2);
                System.out.println("[K8s Service] isKubeletLoaded() - Trying method 2: " + checkCmd2);
                result = serverService.execCommandWithKey(master.getHost(), port, username, pem, checkCmd2, 5000);
                logger.info("[K8s Service] isKubeletLoaded() - Method 2 result: {}", result);
                System.out.println("[K8s Service] isKubeletLoaded() - Method 2 result: " + result);
                
                if (result != null && !result.trim().equals("0") && Integer.parseInt(result.trim()) > 0) {
                    logger.info("[K8s Service] isKubeletLoaded() - Kubelet is loaded (method 2)");
                    System.out.println("[K8s Service] isKubeletLoaded() - Kubelet is loaded (method 2)");
                    return true;
                }
            } catch (Exception e2) {
                logger.debug("[K8s Service] isKubeletLoaded() - Method 2 failed: {}", e2.getMessage());
            }
            
            // Cách 3: Kiểm tra file unit tồn tại
            try {
                String checkCmd3 = "test -f /etc/systemd/system/kubelet.service.d/10-kubeadm.conf && echo 'EXISTS' || echo 'NOT_EXISTS'";
                logger.info("[K8s Service] isKubeletLoaded() - Trying method 3: {}", checkCmd3);
                System.out.println("[K8s Service] isKubeletLoaded() - Trying method 3: " + checkCmd3);
                result = serverService.execCommandWithKey(master.getHost(), port, username, pem, checkCmd3, 5000);
                logger.info("[K8s Service] isKubeletLoaded() - Method 3 result: {}", result);
                System.out.println("[K8s Service] isKubeletLoaded() - Method 3 result: " + result);
                
                if (result != null && result.trim().contains("EXISTS")) {
                    logger.info("[K8s Service] isKubeletLoaded() - Kubelet config exists (method 3)");
                    System.out.println("[K8s Service] isKubeletLoaded() - Kubelet config exists (method 3)");
                    return true;
                }
            } catch (Exception e3) {
                logger.debug("[K8s Service] isKubeletLoaded() - Method 3 failed: {}", e3.getMessage());
            }
            
            logger.warn("[K8s Service] isKubeletLoaded() - All methods failed, kubelet may not be installed");
            System.out.println("[K8s Service] isKubeletLoaded() - All methods failed, kubelet may not be installed");
            return false;
        } catch (Exception e) {
            logger.warn("[K8s Service] isKubeletLoaded() - Error checking kubelet status on master {}: {}", master.getHost(), e.getMessage());
            System.out.println("[K8s Service] isKubeletLoaded() - Error checking kubelet status on master " + master.getHost() + ": " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }

    /**
     * Lấy Kubernetes client bằng cách kéo kubeconfig từ MASTER node online đầu tiên (có clusterStatus = "AVAILABLE") qua SSH
     * Với 1 cluster duy nhất, luôn tìm MASTER online đầu tiên trong các server AVAILABLE
     */
    private KubernetesClient getKubernetesClient() {
        try {
            // Tìm MASTER online đầu tiên trong các server AVAILABLE
            Server master = clusterService.getFirstHealthyMaster()
                    .orElseThrow(() -> new RuntimeException(
                            "Không tìm thấy MASTER node online trong cluster. " +
                                    "Vui lòng đảm bảo có ít nhất 1 MASTER node online với clusterStatus = 'AVAILABLE'."));

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
            logger.error("Failed to create Kubernetes client", e);
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
                    "sudo cat /root/.kube/config",
                    "sudo cat $HOME/.kube/config"
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
                        logger.warn("Khong the lay kubeconfig ma khong co password cho master: {}", master.getHost());
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
    public void ensureNamespace(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
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
            String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit) {
        return createDeployment(namespace, deploymentName, dockerImage, containerPort,
                cpuRequest, cpuLimit, memoryRequest, memoryLimit, 1, null);
    }

    /**
     * Tạo Deployment trong Kubernetes với giới hạn tài nguyên, số replicas
     * và biến môi trường có thể cấu hình
     */
    public String createDeployment(String namespace, String deploymentName, String dockerImage, int containerPort,
            String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit,
            int replicas, Map<String, String> envVars) {
        try (KubernetesClient client = getKubernetesClient()) {
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
    public String createService(String namespace, String serviceName, String deploymentName, int port, int targetPort) {
        try (KubernetesClient client = getKubernetesClient()) {
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
            String appName) {
        try (KubernetesClient client = getKubernetesClient()) {
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
    public void waitForDeploymentReady(String namespace, String deploymentName, long timeoutMinutes) {
        try (KubernetesClient client = getKubernetesClient()) {
            logger.info("Dang cho Deployment {}/{} san sang...", namespace, deploymentName);

            client.apps().deployments()
                    .inNamespace(namespace)
                    .withName(deploymentName)
                    .waitUntilReady(timeoutMinutes, TimeUnit.MINUTES);

            logger.info("Deployment {}/{} da san sang", namespace, deploymentName);
        } catch (Exception e) {
            logger.error("Cho Deployment san sang that bai: {}/{}", namespace, deploymentName, e);

            String diagnostics = collectDeploymentDiagnostics(namespace, deploymentName, 50);

            throw new RuntimeException("Deployment chưa sẵn sàng: " + deploymentName + ". " + diagnostics, e);
        }
    }

    /**
     * Thu thập chẩn đoán cho deployment (pods, container state, log tail)
     */
    public String collectDeploymentDiagnostics(String namespace, String deploymentName, int logLines) {
        try (KubernetesClient diagClient = getKubernetesClient()) {
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
    public String getIngressURL(String namespace, String ingressName) {
        try (KubernetesClient client = getKubernetesClient()) {
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
    public void deleteApp(String namespace, String appName) {
        try (KubernetesClient client = getKubernetesClient()) {
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
                    logger.info("Da xoa service: {}/{}", namespace, svcName);
                } catch (Exception e2) {
                    logger.debug("Service {}/{} khong tim thay hoac da bi xoa", namespace, appName);
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
            String ingressName) {
        try (KubernetesClient client = getKubernetesClient()) {
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
    public boolean deploymentExists(String namespace, String deploymentName) {
        try (KubernetesClient client = getKubernetesClient()) {
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
    public void deleteNamespace(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            // Kiểm tra xem namespace có tồn tại không
            Namespace ns = client.namespaces().withName(namespace).get();
            if (ns == null) {
                logger.info("Namespace {} does not exist, skipping deletion", namespace);
                return;
            }

            // Ngăn xóa các namespace hệ thống (tái sử dụng helper method)
            if (isSystemNamespace(namespace)) {
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
     * @return KubernetesClient
     */
    public KubernetesClient getKubernetesClientForCluster() {
        return getKubernetesClient();
    }

    /**
     * Helper method: Kiểm tra namespace có phải là system namespace không
     */
    private boolean isSystemNamespace(String namespace) {
        if (namespace == null) {
            return false;
        }
        String nsLower = namespace.toLowerCase();
        return nsLower.equals("kube-system") || nsLower.equals("kube-public")
                || nsLower.equals("kube-node-lease") || nsLower.equals("default");
    }

    /**
     * Helper method: Convert memory bytes sang human-readable format (cho capacity)
     * Format: "X.XX Gi" hoặc "X.XX Mi" hoặc "X B"
     */
    private String convertMemoryToHumanReadable(String amount) {
        if (amount == null || amount.isEmpty()) {
            return "";
        }
        try {
            long bytes = Long.parseLong(amount);
            if (bytes >= 1024L * 1024L * 1024L) {
                double gb = bytes / (1024.0 * 1024.0 * 1024.0);
                return String.format("%.2f Gi", gb);
            } else if (bytes >= 1024L * 1024L) {
                double mb = bytes / (1024.0 * 1024.0);
                return String.format("%.2f Mi", mb);
            } else {
                return amount + " B";
            }
        } catch (NumberFormatException e) {
            return amount;
        }
    }

    /**
     * Helper method: Convert memory bytes sang Mi format (cho allocatable)
     * Format: "XMi" hoặc "XB"
     */
    private String convertMemoryToMi(String amount) {
        if (amount == null || amount.isEmpty()) {
            return "";
        }
        try {
            long bytes = Long.parseLong(amount);
            if (bytes >= 1024L * 1024L * 1024L) {
                double gb = bytes / (1024.0 * 1024.0 * 1024.0);
                return String.format("%.0fMi", gb * 1024);
            } else if (bytes >= 1024L * 1024L) {
                double mb = bytes / (1024.0 * 1024.0);
                return String.format("%.0fMi", mb);
            } else {
                return amount + "B";
            }
        } catch (NumberFormatException e) {
            return amount;
        }
    }

    /**
     * Lấy tất cả các node trong cluster
     * Trả về null nếu kubelet chưa loaded hoặc không thể kết nối
     */
    public NodeList getNodes() {
        try {
            logger.info("[K8s Service] getNodes() - Tim MASTER online...");
            System.out.println("[K8s Service] getNodes() - Tim MASTER online...");
            // Tìm MASTER online đầu tiên trong các server AVAILABLE
            Server master = clusterService.getFirstHealthyMaster().orElse(null);

            if (master == null) {
                logger.warn("[K8s Service] getNodes() - Khong tim thay MASTER");
                System.out.println("[K8s Service] getNodes() - Khong tim thay MASTER");
                return null;
            }
            if (master.getStatus() != Server.ServerStatus.ONLINE) {
                logger.warn("[K8s Service] getNodes() - MASTER khong ONLINE (status: {})", master.getStatus());
                System.out.println("[K8s Service] getNodes() - MASTER khong ONLINE (status: " + master.getStatus() + ")");
                return null;
            }
            
            logger.info("[K8s Service] getNodes() - Tim thay MASTER: {}", master.getHost());
            System.out.println("[K8s Service] getNodes() - Tim thay MASTER: " + master.getHost());

            // Kiểm tra nhanh xem kubelet đã loaded chưa
            logger.info("[K8s Service] getNodes() - Kiem tra kubelet loaded...");
            System.out.println("[K8s Service] getNodes() - Kiem tra kubelet loaded...");
            if (!isKubeletLoaded(master)) {
                logger.warn("[K8s Service] getNodes() - Kubelet chua loaded tren master node");
                System.out.println("[K8s Service] getNodes() - Kubelet chua loaded tren master node");
                return null; // Kubelet chưa loaded, bỏ qua
            }
            
            logger.info("[K8s Service] getNodes() - Kubelet da loaded, lay nodes tu K8s API...");
            System.out.println("[K8s Service] getNodes() - Kubelet da loaded, lay nodes tu K8s API...");

        try (KubernetesClient client = getKubernetesClient()) {
            NodeList nodeList = client.nodes().list();
            if (nodeList != null && nodeList.getItems() != null) {
                logger.info("[K8s Service] getNodes() - K8s API tra ve {} nodes", nodeList.getItems().size());
                System.out.println("[K8s Service] getNodes() - K8s API tra ve " + nodeList.getItems().size() + " nodes");
            } else {
                logger.warn("[K8s Service] getNodes() - K8s API tra ve null hoac empty");
                System.out.println("[K8s Service] getNodes() - K8s API tra ve null hoac empty");
            }
            return nodeList;
        } catch (KubernetesClientException e) {
                logger.warn("[K8s Service] getNodes() - KubernetesClientException: {}. Kubernetes may not be fully set up.", 
                        e.getMessage());
                System.out.println("[K8s Service] getNodes() - KubernetesClientException: " + e.getMessage());
                e.printStackTrace();
                return null; // Trả về null thay vì throw exception
            } catch (Exception e) {
                logger.warn("[K8s Service] getNodes() - Exception: {}. Kubernetes may not be running yet.", 
                        e.getMessage());
                System.out.println("[K8s Service] getNodes() - Exception: " + e.getMessage());
                e.printStackTrace();
                return null;
            }
        } catch (Exception e) {
            logger.warn("[K8s Service] getNodes() - Error checking kubelet status: {}", e.getMessage());
            System.out.println("[K8s Service] getNodes() - Error checking kubelet status: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    /**
     * Lấy node cụ thể theo tên
     */
    public Node getNode(String nodeName) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.nodes().withName(nodeName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get node {}: {}", nodeName, e.getMessage(), e);
            throw new RuntimeException("Failed to get node: " + e.getMessage(), e);
        }
    }

    /**
     * Get Kubernetes nodes và parse thành Map format (cho API response)
     */
    public List<Map<String, Object>> getKubernetesNodes() {
        try {
            logger.info("[K8s Service] Dang goi getNodes()...");
            System.out.println("[K8s Service] Dang goi getNodes()...");
            NodeList nodeList = getNodes();
            if (nodeList == null) {
                logger.warn("[K8s Service] getNodes() tra ve null");
                System.out.println("[K8s Service] getNodes() tra ve null");
                return new java.util.ArrayList<>();
            }
            if (nodeList.getItems() == null) {
                logger.warn("[K8s Service] NodeList.getItems() la null");
                System.out.println("[K8s Service] NodeList.getItems() la null");
                return new java.util.ArrayList<>();
            }
            int itemsCount = nodeList.getItems().size();
            logger.info("[K8s Service] getNodes() tra ve {} nodes", itemsCount);
            System.out.println("[K8s Service] getNodes() tra ve " + itemsCount + " nodes");
            
            if (itemsCount == 0) {
                logger.warn("[K8s Service] NodeList co 0 items");
                System.out.println("[K8s Service] NodeList co 0 items");
                return new java.util.ArrayList<>();
            }
            
            List<Map<String, Object>> parsedNodes = nodeList.getItems().stream()
                    .map(this::parseNodeToMap)
                    .collect(Collectors.toList());
            logger.info("[K8s Service] Parse thanh cong {} nodes", parsedNodes.size());
            System.out.println("[K8s Service] Parse thanh cong " + parsedNodes.size() + " nodes");
            return parsedNodes;
        } catch (Exception e) {
            logger.error("[K8s Service] Failed to get and parse Kubernetes nodes: {}", e.getMessage(), e);
            System.out.println("[K8s Service] Failed to get and parse Kubernetes nodes: " + e.getMessage());
            e.printStackTrace();
            // Trả về empty list thay vì throw exception để tránh 500 error
            return new java.util.ArrayList<>();
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

        // Trích xuất phiên bản và OS info
        String kubeletVersion = "";
        String osImage = "";
        String containerRuntimeVersion = "";
        String kernelVersion = "";
        String operatingSystem = "";
        if (status != null && status.getNodeInfo() != null) {
            var nodeInfo = status.getNodeInfo();
            kubeletVersion = nodeInfo.getKubeletVersion();
            osImage = nodeInfo.getOsImage();
            containerRuntimeVersion = nodeInfo.getContainerRuntimeVersion();
            kernelVersion = nodeInfo.getKernelVersion();
            operatingSystem = nodeInfo.getOperatingSystem();
        }

        // Trích xuất CPU và RAM từ capacity
        String cpuCapacity = "";
        String memoryCapacity = "";
        String podsCapacity = "";
        if (status != null && status.getCapacity() != null) {
            Map<String, io.fabric8.kubernetes.api.model.Quantity> capacity = status.getCapacity();
            if (capacity != null) {
                io.fabric8.kubernetes.api.model.Quantity cpuQty = capacity.get("cpu");
                io.fabric8.kubernetes.api.model.Quantity memoryQty = capacity.get("memory");
                io.fabric8.kubernetes.api.model.Quantity podsQty = capacity.get("pods");
                
                if (cpuQty != null) {
                    cpuCapacity = cpuQty.getAmount();
                }
                if (memoryQty != null) {
                    // Convert bytes to human readable (tái sử dụng helper method)
                    memoryCapacity = convertMemoryToHumanReadable(memoryQty.getAmount());
                }
                if (podsQty != null) {
                    podsCapacity = podsQty.getAmount();
                }
            }
        }

        // Trích xuất allocatable (CPU, Memory, Pods)
        String allocatableCpu = "";
        String allocatableMemory = "";
        String allocatablePods = "";
        if (status != null && status.getAllocatable() != null) {
            Map<String, io.fabric8.kubernetes.api.model.Quantity> allocatable = status.getAllocatable();
            if (allocatable != null) {
                io.fabric8.kubernetes.api.model.Quantity cpuQty = allocatable.get("cpu");
                io.fabric8.kubernetes.api.model.Quantity memoryQty = allocatable.get("memory");
                io.fabric8.kubernetes.api.model.Quantity podsQty = allocatable.get("pods");
                
                if (cpuQty != null) {
                    allocatableCpu = cpuQty.getAmount();
                }
                if (memoryQty != null) {
                    // Convert bytes to Mi format (tái sử dụng helper method)
                    allocatableMemory = convertMemoryToMi(memoryQty.getAmount());
                }
                if (podsQty != null) {
                    allocatablePods = podsQty.getAmount();
                }
            }
        }

        // Trích xuất hostname từ addresses
        String hostname = "";
        if (status != null && status.getAddresses() != null) {
            for (NodeAddress address : status.getAddresses()) {
                if ("Hostname".equals(address.getType())) {
                    hostname = address.getAddress();
                    break;
                }
            }
        }

        // Trích xuất architecture từ nodeInfo
        String architecture = "";
        if (status != null && status.getNodeInfo() != null) {
            architecture = status.getNodeInfo().getArchitecture();
        }

        // Trích xuất taints từ spec
        List<Map<String, String>> taints = new ArrayList<>();
        NodeSpec spec = node.getSpec();
        if (spec != null && spec.getTaints() != null) {
            for (io.fabric8.kubernetes.api.model.Taint taint : spec.getTaints()) {
                Map<String, String> taintMap = new HashMap<>();
                taintMap.put("key", taint.getKey() != null ? taint.getKey() : "");
                taintMap.put("value", taint.getValue() != null ? taint.getValue() : "");
                taintMap.put("effect", taint.getEffect() != null ? taint.getEffect() : "");
                taints.add(taintMap);
            }
        }

        // Trích xuất vai trò và labels
        List<String> roles = new ArrayList<>();
        Map<String, String> allLabels = new HashMap<>();
        Map<String, String> labels = node.getMetadata().getLabels();
        if (labels != null) {
            allLabels.putAll(labels);
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
        result.put("k8sHostname", hostname);
        result.put("k8sVersion", kubeletVersion);
        result.put("k8sCpu", cpuCapacity);
        result.put("k8sMemory", memoryCapacity);
        result.put("k8sPodsCapacity", podsCapacity);
        result.put("k8sAllocatableCpu", allocatableCpu);
        result.put("k8sAllocatableMemory", allocatableMemory);
        result.put("k8sAllocatablePods", allocatablePods);
        result.put("k8sArchitecture", architecture);
        result.put("k8sRoles", roles);
        result.put("k8sConditions", conditions);
        result.put("k8sLabels", allLabels);
        result.put("k8sTaints", taints);
        result.put("k8sOsImage", osImage);
        result.put("k8sContainerRuntime", containerRuntimeVersion);
        result.put("k8sKernelVersion", kernelVersion);
        result.put("k8sOperatingSystem", operatingSystem);
        if (!reason.isEmpty()) {
            result.put("k8sStatusReason", reason);
        }
        if (!message.isEmpty()) {
            result.put("k8sStatusMessage", message);
        }
        return result;
    }

    /**
     * Lấy node metrics từ Kubernetes Metrics API (metrics-server)
     * Trả về danh sách NodeMetrics hoặc empty list nếu không có hoặc metrics-server chưa cài đặt
     */
    public java.util.List<io.fabric8.kubernetes.api.model.metrics.v1beta1.NodeMetrics> getNodeMetrics() {
        try (KubernetesClient client = getKubernetesClient()) {
            try {
                return client.top().nodes().metrics().getItems();
            } catch (KubernetesClientException e) {
                // Metrics API có thể không available nếu metrics-server chưa cài đặt
                if (e.getCode() == 404 || e.getCode() == 503) {
                    logger.debug("Metrics API khong available (metrics-server co the chua cai dat): {}", e.getMessage());
                    return java.util.List.of();
                }
                throw e;
            }
        } catch (Exception e) {
            logger.debug("Khong the lay node metrics tu Metrics API: {}", e.getMessage());
            return java.util.List.of();
        }
    }

    /**
     * Lấy pod metrics từ Kubernetes Metrics API (metrics-server) cho namespace cụ thể
     * Trả về danh sách PodMetrics hoặc empty list nếu không có hoặc metrics-server chưa cài đặt
     */
    public java.util.List<io.fabric8.kubernetes.api.model.metrics.v1beta1.PodMetrics> getPodMetrics(String namespace) {
        try (KubernetesClient client = getKubernetesClient()) {
            try {
                if (namespace != null && !namespace.trim().isEmpty()) {
                    return client.top().pods().inNamespace(namespace).metrics().getItems();
                } else {
                    // Lấy tất cả pod metrics từ tất cả namespaces
                    // Fabric8 không có inAnyNamespace() cho metrics, cần lấy từng namespace
                    java.util.List<io.fabric8.kubernetes.api.model.metrics.v1beta1.PodMetrics> allMetrics = new java.util.ArrayList<>();
                    var namespaces = getNamespaces();
                    if (namespaces != null && namespaces.getItems() != null) {
                        for (var ns : namespaces.getItems()) {
                            String nsName = ns.getMetadata() != null ? ns.getMetadata().getName() : null;
                            if (nsName != null && !nsName.isEmpty()) {
                                try {
                                    var nsMetrics = client.top().pods().inNamespace(nsName).metrics().getItems();
                                    if (nsMetrics != null) {
                                        allMetrics.addAll(nsMetrics);
                                    }
                                } catch (Exception e) {
                                    logger.debug("Khong the lay pod metrics cho namespace {}: {}", nsName, e.getMessage());
                                }
                            }
                        }
                    }
                    return allMetrics;
                }
            } catch (KubernetesClientException e) {
                // Metrics API có thể không available nếu metrics-server chưa cài đặt
                if (e.getCode() == 404 || e.getCode() == 503) {
                    logger.debug("Metrics API khong available cho namespace {} (metrics-server co the chua cai dat): {}", 
                            namespace, e.getMessage());
                    return java.util.List.of();
                }
                throw e;
            }
        } catch (Exception e) {
            logger.debug("Khong the lay pod metrics tu Metrics API cho namespace {}: {}", namespace, e.getMessage());
            return java.util.List.of();
        }
    }

    /**
     * Tính tổng CPU và RAM usage cho namespace từ pod metrics
     * Trả về Map với keys: "cpu" (cores), "ram" (bytes)
     */
    public Map<String, Double> calculateNamespaceResourceUsageFromMetrics(String namespace) {
        try {
            var podMetricsList = getPodMetrics(namespace);
            if (podMetricsList == null || podMetricsList.isEmpty()) {
                return Map.of("cpu", 0.0, "ram", 0.0);
            }

            double totalCpuNanoCores = 0.0;
            double totalMemoryBytes = 0.0;

            for (var podMetric : podMetricsList) {
                var containers = podMetric.getContainers();
                if (containers != null) {
                    for (var container : containers) {
                        var usage = container.getUsage();
                        if (usage != null) {
                            // CPU usage (nano cores)
                            var cpuUsage = usage.get("cpu");
                            if (cpuUsage != null) {
                                try {
                                    String cpuStr = cpuUsage.getAmount();
                                    totalCpuNanoCores += parseQuantityToNanoCores(cpuStr);
                                } catch (Exception e) {
                                    logger.debug("Khong parse duoc CPU usage cho pod {}: {}", 
                                            podMetric.getMetadata().getName(), e.getMessage());
                                }
                            }

                            // Memory usage (bytes)
                            var memoryUsage = usage.get("memory");
                            if (memoryUsage != null) {
                                try {
                                    String memoryStr = memoryUsage.getAmount();
                                    totalMemoryBytes += parseQuantityToBytes(memoryStr);
                                } catch (Exception e) {
                                    logger.debug("Khong parse duoc Memory usage cho pod {}: {}", 
                                            podMetric.getMetadata().getName(), e.getMessage());
                                }
                            }
                        }
                    }
                }
            }

            // Convert nano cores sang cores
            double totalCpuCores = totalCpuNanoCores / 1_000_000_000.0;

            return Map.of("cpu", totalCpuCores, "ram", totalMemoryBytes);
        } catch (Exception e) {
            logger.debug("Loi tinh resource usage tu Metrics API cho namespace {}: {}", namespace, e.getMessage());
            return Map.of("cpu", 0.0, "ram", 0.0);
        }
    }

    /**
     * Tính tổng resource usage từ node metrics (K8s Metrics API)
     * Trả về Map với keys: "cpu", "ram" (percentages dựa trên capacity từ Node spec)
     */
    public Map<String, Double> calculateClusterResourceUsageFromMetrics() {
        try {
            // Lấy node metrics từ Metrics API
            var nodeMetricsList = getNodeMetrics();
            if (nodeMetricsList == null || nodeMetricsList.isEmpty()) {
                return Map.of("cpu", 0.0, "ram", 0.0, "disk", 0.0);
            }

            // Lấy nodes để có capacity (CPU và Memory)
            var nodes = getNodes();
            if (nodes == null || nodes.getItems().isEmpty()) {
                return Map.of("cpu", 0.0, "ram", 0.0, "disk", 0.0);
            }

            // Tạo map node name -> Node để lookup capacity
            Map<String, Node> nodeMap = nodes.getItems().stream()
                    .collect(java.util.stream.Collectors.toMap(
                            n -> n.getMetadata().getName(),
                            n -> n));

            double totalCpuUsageNanoCores = 0.0;
            double totalCpuCapacityCores = 0.0;
            double totalMemoryUsageBytes = 0.0;
            double totalMemoryCapacityBytes = 0.0;

            for (var nodeMetric : nodeMetricsList) {
                String nodeName = nodeMetric.getMetadata().getName();
                Node node = nodeMap.get(nodeName);
                
                if (node == null || node.getStatus() == null) {
                    continue;
                }

                // Lấy CPU và Memory usage từ metrics
                var usage = nodeMetric.getUsage();
                if (usage == null) continue;

                // CPU usage (nano cores) - usage là Map<String, Quantity>
                var cpuUsage = usage.get("cpu");
                if (cpuUsage != null) {
                    try {
                        // Convert từ Quantity (có thể là "100m", "1", "500m", etc.) sang nano cores
                        String cpuStr = cpuUsage.getAmount();
                        totalCpuUsageNanoCores += parseQuantityToNanoCores(cpuStr);
                    } catch (Exception e) {
                        logger.debug("Khong parse duoc CPU usage cho node {}: {}", nodeName, e.getMessage());
                    }
                }

                // Memory usage (bytes) - usage là Map<String, Quantity>
                var memoryUsage = usage.get("memory");
                if (memoryUsage != null) {
                    try {
                        String memoryStr = memoryUsage.getAmount();
                        totalMemoryUsageBytes += parseQuantityToBytes(memoryStr);
                    } catch (Exception e) {
                        logger.debug("Khong parse duoc Memory usage cho node {}: {}", nodeName, e.getMessage());
                    }
                }

                // Lấy capacity từ Node spec
                var capacity = node.getStatus().getCapacity();
                if (capacity != null) {
                    // CPU capacity
                    var cpuCapacity = capacity.get("cpu");
                    if (cpuCapacity != null) {
                        try {
                            String cpuCapStr = cpuCapacity.getAmount();
                            totalCpuCapacityCores += parseQuantityToCores(cpuCapStr);
                        } catch (Exception e) {
                            logger.debug("Khong parse duoc CPU capacity cho node {}: {}", nodeName, e.getMessage());
                        }
                    }

                    // Memory capacity
                    var memoryCapacity = capacity.get("memory");
                    if (memoryCapacity != null) {
                        try {
                            String memoryCapStr = memoryCapacity.getAmount();
                            totalMemoryCapacityBytes += parseQuantityToBytes(memoryCapStr);
                        } catch (Exception e) {
                            logger.debug("Khong parse duoc Memory capacity cho node {}: {}", nodeName, e.getMessage());
                        }
                    }
                }
            }

            // Tính phần trăm usage
            double cpuUsagePercent = 0.0;
            if (totalCpuCapacityCores > 0) {
                // Convert nano cores sang cores để tính phần trăm
                double totalCpuUsageCores = totalCpuUsageNanoCores / 1_000_000_000.0;
                cpuUsagePercent = (totalCpuUsageCores / totalCpuCapacityCores) * 100.0;
            }

            double ramUsagePercent = 0.0;
            if (totalMemoryCapacityBytes > 0) {
                ramUsagePercent = (totalMemoryUsageBytes / totalMemoryCapacityBytes) * 100.0;
            }

            // Disk usage không có trong Metrics API, giữ nguyên 0.0 hoặc có thể lấy từ SSH fallback
            return Map.of(
                    "cpu", Math.min(100.0, Math.max(0.0, cpuUsagePercent)),
                    "ram", Math.min(100.0, Math.max(0.0, ramUsagePercent)),
                    "disk", 0.0); // Disk không có trong Metrics API
        } catch (Exception e) {
            logger.debug("Loi tinh resource usage tu Metrics API: {}", e.getMessage());
            return Map.of("cpu", 0.0, "ram", 0.0, "disk", 0.0);
        }
    }

    /**
     * Helper method để parse Quantity string sang nano cores
     * Hỗ trợ: "100m" = 100000000 nano cores, "1" = 1000000000 nano cores, "500m" = 500000000 nano cores
     */
    private double parseQuantityToNanoCores(String quantity) {
        if (quantity == null || quantity.isBlank()) return 0.0;
        quantity = quantity.trim();
        try {
            if (quantity.endsWith("m")) {
                // Millicores: "100m" = 0.1 cores = 100000000 nano cores
                double millicores = Double.parseDouble(quantity.substring(0, quantity.length() - 1));
                return millicores * 1_000_000.0; // Convert to nano cores
            } else {
                // Cores: "1" = 1 core = 1000000000 nano cores
                double cores = Double.parseDouble(quantity);
                return cores * 1_000_000_000.0; // Convert to nano cores
            }
        } catch (Exception e) {
            logger.debug("Khong parse duoc quantity sang nano cores: {}", quantity);
            return 0.0;
        }
    }

    /**
     * Helper method để parse Quantity string sang cores (để tính capacity)
     */
    private double parseQuantityToCores(String quantity) {
        if (quantity == null || quantity.isBlank()) return 0.0;
        quantity = quantity.trim();
        try {
            if (quantity.endsWith("m")) {
                // Millicores: "100m" = 0.1 cores
                double millicores = Double.parseDouble(quantity.substring(0, quantity.length() - 1));
                return millicores / 1000.0;
            } else {
                // Cores: "1" = 1 core
                return Double.parseDouble(quantity);
            }
        } catch (Exception e) {
            logger.debug("Khong parse duoc quantity sang cores: {}", quantity);
            return 0.0;
        }
    }

    /**
     * Helper method để parse Quantity string sang bytes
     * Hỗ trợ: "1Gi" = 1073741824 bytes, "512Mi" = 536870912 bytes, "1G" = 1000000000 bytes
     */
    private double parseQuantityToBytes(String quantity) {
        if (quantity == null || quantity.isBlank()) return 0.0;
        quantity = quantity.trim();
        try {
            // Parse số
            double value = 0.0;
            String unit = "";
            
            // Tách số và unit
            int unitStart = -1;
            for (int i = 0; i < quantity.length(); i++) {
                char c = quantity.charAt(i);
                if (Character.isLetter(c)) {
                    unitStart = i;
                    break;
                }
            }
            
            if (unitStart > 0) {
                value = Double.parseDouble(quantity.substring(0, unitStart));
                unit = quantity.substring(unitStart);
            } else {
                // Không có unit, giả sử là bytes
                return Double.parseDouble(quantity);
            }

            // Convert sang bytes
            return switch (unit.toUpperCase()) {
                case "KI", "K" -> value * 1024;
                case "MI", "M" -> value * 1024 * 1024;
                case "GI", "G" -> value * 1024 * 1024 * 1024;
                case "TI", "T" -> value * 1024L * 1024 * 1024 * 1024;
                case "PI", "P" -> value * 1024L * 1024 * 1024 * 1024 * 1024;
                default -> {
                    // Nếu không có unit hoặc unit không nhận dạng được, giả sử là bytes
                    try {
                        yield Double.parseDouble(quantity);
                    } catch (Exception e) {
                        yield 0.0;
                    }
                }
            };
        } catch (Exception e) {
            logger.debug("Khong parse duoc quantity sang bytes: {}", quantity);
            return 0.0;
        }
    }

    /**
     * Lấy phiên bản Kubernetes từ cluster (từ master node hoặc API server)
     * Trả về chuỗi phiên bản (ví dụ: "v1.30.0") hoặc chuỗi rỗng nếu không có hoặc kubelet chưa loaded
     */
    public String getKubernetesVersion() {
        try {
            // Tìm MASTER online đầu tiên trong các server AVAILABLE
            Server master = clusterService.getFirstHealthyMaster().orElse(null);

            if (master == null || master.getStatus() != Server.ServerStatus.ONLINE) {
                return "";
            }

            // Kiểm tra nhanh xem kubelet đã loaded chưa
            if (!isKubeletLoaded(master)) {
                logger.debug("Kubelet not loaded on master node");
                return ""; // Kubelet chưa loaded, bỏ qua
            }

        try (KubernetesClient client = getKubernetesClient()) {
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
            NodeList nodeList = getNodes();
            if (nodeList == null || nodeList.getItems() == null) {
                return "";
            }
            
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
            } catch (KubernetesClientException e) {
                logger.debug("Failed to get Kubernetes version: {}", e.getMessage());
            return "";
        } catch (Exception e) {
                logger.debug("Failed to get Kubernetes version: {}", e.getMessage());
                return "";
            }
        } catch (Exception e) {
            logger.debug("Error getting Kubernetes version: {}", e.getMessage());
            return "";
        }
    }

    /**
     * Lấy tất cả các namespace
     */
    public NamespaceList getNamespaces() {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.namespaces().list();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get namespaces: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to get namespaces: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy namespace cụ thể theo tên
     */
    public Namespace getNamespace(String namespaceName) {
        try (KubernetesClient client = getKubernetesClient()) {
            return client.namespaces().withName(namespaceName).get();
        } catch (KubernetesClientException e) {
            logger.error("Failed to get namespace {}: {}", namespaceName, e.getMessage(), e);
            throw new RuntimeException("Failed to get namespace: " + e.getMessage(), e);
        }
    }

    // deleteNamespace() already exists at line 731


}
