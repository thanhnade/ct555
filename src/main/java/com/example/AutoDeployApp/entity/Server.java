package com.example.AutoDeployApp.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "servers", uniqueConstraints = @UniqueConstraint(columnNames = { "host", "port", "username" }))
public class Server {

    public enum ServerStatus {
        ONLINE, OFFLINE, DISABLED
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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ssh_key_id")
    private SshKey sshKey;

    @Column(nullable = false, length = 20)
    private String role = "WORKER"; // MASTER, WORKER, DOCKER, DATABASE, ANSIBLE

    @Column(name = "cluster_status", nullable = false, length = 20)
    private String clusterStatus = "UNAVAILABLE"; // AVAILABLE, UNAVAILABLE

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ServerStatus status = ServerStatus.OFFLINE;

    @Column(name = "cpu_cores", length = 20)
    private String cpuCores; // Số CPU cores, ví dụ: "4"

    @Column(name = "ram_total", length = 20)
    private String ramTotal; // Tổng RAM, ví dụ: "8.0Gi", "16G"

    @Column(name = "disk_total", length = 20)
    private String diskTotal; // Tổng Disk, ví dụ: "50G", "100Gi"

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

    public String getClusterStatus() {
        return clusterStatus;
    }

    public void setClusterStatus(String clusterStatus) {
        this.clusterStatus = clusterStatus;
    }

    public ServerStatus getStatus() {
        return status;
    }

    public void setStatus(ServerStatus status) {
        this.status = status;
    }

    public String getCpuCores() {
        return cpuCores;
    }

    public void setCpuCores(String cpuCores) {
        this.cpuCores = cpuCores;
    }

    public String getRamTotal() {
        return ramTotal;
    }

    public void setRamTotal(String ramTotal) {
        this.ramTotal = ramTotal;
    }

    public String getDiskTotal() {
        return diskTotal;
    }

    public void setDiskTotal(String diskTotal) {
        this.diskTotal = diskTotal;
    }
}
