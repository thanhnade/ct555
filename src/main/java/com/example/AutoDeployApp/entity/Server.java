package com.example.AutoDeployApp.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "servers", uniqueConstraints = @UniqueConstraint(columnNames = { "ip", "port", "username" }))
public class Server {

    public enum ServerRole {
        MASTER, WORKER, DOCKER, DATABASE, STANDALONE
    }

    public enum ServerStatus {
        RUNNING, STOPPED, BUILDING, ERROR, ONLINE, OFFLINE
    }

    public enum ClusterStatus {
        AVAILABLE, UNAVAILABLE
    }

    public enum AuthType {
        PASSWORD, KEY
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 100)
    private String ip; // Đổi từ host thành ip

    @Column(nullable = false)
    private Integer port = 22;

    @Column(nullable = false, length = 50)
    private String username;

    @Column(nullable = false, length = 255)
    private String password; // store hashed/encoded

    @Column(nullable = false, length = 20)
    private String role = "WORKER"; // MASTER, WORKER, DOCKER, DATABASE

    @Column(name = "server_status", nullable = false, length = 20)
    private String serverStatus = "STOPPED"; // RUNNING, STOPPED, BUILDING, ERROR

    @Column(name = "cluster_status", nullable = false, length = 20)
    private String clusterStatus = "UNAVAILABLE"; // AVAILABLE, UNAVAILABLE

    // Fields tương thích với hệ thống cũ (giữ lại)
    @Enumerated(EnumType.STRING)
    @Column(name = "auth_type", length = 16)
    private AuthType authType = AuthType.PASSWORD;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ssh_key_id")
    private SshKey sshKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cluster_id")
    private Cluster cluster;

    // Legacy status field (giữ lại để tương thích)
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private ServerStatus status = ServerStatus.OFFLINE;

    @CreationTimestamp
    @Column(name = "created_at", columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "added_by")
    private Long addedBy; // user_id of creator

    @Column(name = "last_connected")
    private java.sql.Timestamp lastConnected;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    // Backward compatibility: host -> ip
    public String getHost() {
        return ip; // Trả về ip để tương thích với code cũ
    }

    public void setHost(String host) {
        this.ip = host; // Set vào ip để tương thích với code cũ
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public AuthType getAuthType() {
        return authType;
    }

    public void setAuthType(AuthType authType) {
        this.authType = authType;
    }

    public SshKey getSshKey() {
        return sshKey;
    }

    public void setSshKey(SshKey sshKey) {
        this.sshKey = sshKey;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    // Backward compatibility: ServerRole enum
    public ServerRole getRoleEnum() {
        try {
            return ServerRole.valueOf(role);
        } catch (Exception e) {
            return ServerRole.WORKER; // Default fallback
        }
    }

    public void setRoleEnum(ServerRole roleEnum) {
        this.role = roleEnum != null ? roleEnum.name() : "WORKER";
    }

    public String getServerStatus() {
        return serverStatus;
    }

    public void setServerStatus(String serverStatus) {
        this.serverStatus = serverStatus;
    }

    public String getClusterStatus() {
        return clusterStatus;
    }

    public void setClusterStatus(String clusterStatus) {
        this.clusterStatus = clusterStatus;
    }

    public Cluster getCluster() {
        return cluster;
    }

    public void setCluster(Cluster cluster) {
        this.cluster = cluster;
    }

    // Legacy status field (backward compatibility)
    public ServerStatus getStatus() {
        // Map serverStatus string sang ServerStatus enum
        if (serverStatus == null) {
            return ServerStatus.OFFLINE;
        }
        try {
            return ServerStatus.valueOf(serverStatus.toUpperCase());
        } catch (Exception e) {
            // Fallback mapping
            if ("RUNNING".equalsIgnoreCase(serverStatus)) {
                return ServerStatus.ONLINE;
            }
            return ServerStatus.OFFLINE;
        }
    }

    public void setStatus(ServerStatus status) {
        this.status = status;
        // Đồng bộ sang serverStatus
        if (status == ServerStatus.ONLINE) {
            this.serverStatus = "RUNNING";
        } else if (status == ServerStatus.OFFLINE) {
            this.serverStatus = "STOPPED";
        }
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public Long getAddedBy() {
        return addedBy;
    }

    public void setAddedBy(Long addedBy) {
        this.addedBy = addedBy;
    }

    public java.sql.Timestamp getLastConnected() {
        return lastConnected;
    }

    public void setLastConnected(java.sql.Timestamp lastConnected) {
        this.lastConnected = lastConnected;
    }
}
