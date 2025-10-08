package com.example.AutoDeployApp.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "servers", uniqueConstraints = @UniqueConstraint(columnNames = { "host", "port", "username" }))
public class Server {

    public enum ServerRole {
        MASTER, WORKER, STANDALONE
    }

    public enum ServerStatus {
        ONLINE, OFFLINE
    }

    public enum AuthType {
        PASSWORD, KEY
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String host;

    @Column
    private Integer port = 22;

    @Column(nullable = false, length = 50)
    private String username;

    @Column(nullable = false, length = 255)
    private String password; // store hashed/encoded

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_type", nullable = false, length = 16)
    private AuthType authType = AuthType.PASSWORD;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ssh_key_id")
    private SshKey sshKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ServerRole role = ServerRole.WORKER;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cluster_id")
    private Cluster cluster;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
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

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
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

    public ServerRole getRole() {
        return role;
    }

    public void setRole(ServerRole role) {
        this.role = role;
    }

    public Cluster getCluster() {
        return cluster;
    }

    public void setCluster(Cluster cluster) {
        this.cluster = cluster;
    }

    public ServerStatus getStatus() {
        return status;
    }

    public void setStatus(ServerStatus status) {
        this.status = status;
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
