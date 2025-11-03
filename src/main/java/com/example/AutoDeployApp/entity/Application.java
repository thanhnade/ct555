package com.example.AutoDeployApp.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "applications")
public class Application {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = true, length = 200)
    private String name; // Legacy field - kept for compatibility

    @Column(name = "app_name", nullable = false, length = 200)
    private String appName;

    @Column(name = "docker_image", nullable = false, length = 500)
    private String dockerImage;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 50)
    private String status = "PENDING"; // PENDING, RUNNING, ERROR, DELETED

    @Column(name = "k8s_namespace", length = 200)
    private String k8sNamespace;

    @Column(name = "k8s_deployment_name", length = 200)
    private String k8sDeploymentName;

    @Column(name = "k8s_service_name", length = 200)
    private String k8sServiceName;

    @Column(name = "k8s_ingress_name", length = 200)
    private String k8sIngressName;

    @Column(name = "access_url", length = 500)
    private String accessUrl;

    @Column(name = "cluster_id")
    private Long clusterId; // Cluster K8s đã deploy ứng dụng

    @Column(name = "deployment_logs", columnDefinition = "TEXT")
    private String deploymentLogs; // Logs của quá trình deployment (real-time)

    @Column(name = "subdomain", length = 200)
    private String subdomain; // Legacy field - kept for compatibility

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt; // populated by DB default CURRENT_TIMESTAMP

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt; // populated by DB default CURRENT_TIMESTAMP ON UPDATE

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAppName() {
        return appName;
    }

    public void setAppName(String appName) {
        this.appName = appName;
        // Sync with legacy name field for compatibility
        if (this.name == null) {
            this.name = appName;
        }
    }

    public String getName() {
        return name != null ? name : appName;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDockerImage() {
        return dockerImage;
    }

    public void setDockerImage(String dockerImage) {
        this.dockerImage = dockerImage;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getK8sNamespace() {
        return k8sNamespace;
    }

    public void setK8sNamespace(String k8sNamespace) {
        this.k8sNamespace = k8sNamespace;
    }

    public String getK8sDeploymentName() {
        return k8sDeploymentName;
    }

    public void setK8sDeploymentName(String k8sDeploymentName) {
        this.k8sDeploymentName = k8sDeploymentName;
    }

    public String getK8sServiceName() {
        return k8sServiceName;
    }

    public void setK8sServiceName(String k8sServiceName) {
        this.k8sServiceName = k8sServiceName;
    }

    public String getK8sIngressName() {
        return k8sIngressName;
    }

    public void setK8sIngressName(String k8sIngressName) {
        this.k8sIngressName = k8sIngressName;
    }

    public String getAccessUrl() {
        return accessUrl;
    }

    public void setAccessUrl(String accessUrl) {
        this.accessUrl = accessUrl;
    }

    public Long getClusterId() {
        return clusterId;
    }

    public void setClusterId(Long clusterId) {
        this.clusterId = clusterId;
    }

    public String getDeploymentLogs() {
        return deploymentLogs;
    }

    public void setDeploymentLogs(String deploymentLogs) {
        this.deploymentLogs = deploymentLogs;
    }

    public String getSubdomain() {
        return subdomain;
    }

    public void setSubdomain(String subdomain) {
        this.subdomain = subdomain;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
