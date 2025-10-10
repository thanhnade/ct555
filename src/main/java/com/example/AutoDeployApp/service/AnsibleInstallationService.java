package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class AnsibleInstallationService {

    private final ServerService serverService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(5);

    // Paths for Ansible files
    private static final String ANSIBLE_DIR = "ansible-workspace";
    private static final String INVENTORY_FILE = "inventory.ini";
    private static final String ANSIBLE_CFG = "ansible.cfg";

    public AnsibleInstallationService(ServerService serverService) {
        this.serverService = serverService;
    }

    /**
     * Kiểm tra Ansible đã cài đặt trên các MASTER servers trong cluster
     */
    public Map<String, Object> checkAnsibleInstallation(Long clusterId, Map<Long, String> passwordCache) {
        List<Server> allClusterServers = serverService.findByClusterId(clusterId);

        // Chỉ kiểm tra servers có role MASTER
        List<Server> clusterServers = allClusterServers.stream()
                .filter(server -> server.getRole() == Server.ServerRole.MASTER)
                .collect(java.util.stream.Collectors.toList());

        Map<String, Object> detailedResults = new java.util.HashMap<>();

        boolean allInstalled = true;
        boolean someInstalled = false;
        int totalServers = clusterServers.size();
        int installedCount = 0;

        // Kiểm tra từng MASTER server trong cluster
        for (Server server : clusterServers) {
            String serverInfo = String.format("%s (%s)", server.getHost(), server.getRole().name());

            try {
                String checkCmd = "ansible --version";
                String result = "";

                // Thử SSH key trước
                if (server.getSshKey() != null && server.getSshKey().getEncryptedPrivateKey() != null) {
                    try {
                        result = serverService.execCommandWithKey(
                                server.getHost(), server.getPort(), server.getUsername(),
                                server.getSshKey().getEncryptedPrivateKey(), checkCmd, 10000);
                        System.out.println("DEBUG: SSH key result for " + server.getHost() + ": "
                                + (result != null ? "SUCCESS" : "NULL"));
                    } catch (Exception e) {
                        System.out.println("DEBUG: SSH key failed for " + server.getHost() + ": " + e.getMessage());
                        result = null;
                    }
                }

                // Fallback về password nếu SSH key thất bại hoặc không có
                if (result == null || result.trim().isEmpty()) {
                    String password = passwordCache.get(server.getId());
                    if (password != null && !password.trim().isEmpty()) {
                        try {
                            result = serverService.execCommand(
                                    server.getHost(), server.getPort(), server.getUsername(),
                                    password, checkCmd, 10000);
                            System.out.println("DEBUG: Password result for " + server.getHost() + ": "
                                    + (result != null ? "SUCCESS" : "NULL"));
                        } catch (Exception e) {
                            System.out
                                    .println("DEBUG: Password failed for " + server.getHost() + ": " + e.getMessage());
                            result = null;
                        }
                    } else {
                        System.out.println("DEBUG: No password available for " + server.getHost());
                    }
                }

                // Kiểm tra kết quả
                if (result != null && !result.trim().isEmpty() && result.toLowerCase().contains("ansible")) {
                    installedCount++;
                    someInstalled = true;

                    Map<String, Object> serverStatus = new java.util.HashMap<>();
                    serverStatus.put("installed", true);
                    serverStatus.put("version", extractAnsibleVersion(result));
                    serverStatus.put("fullOutput", result);
                    serverStatus.put("role", server.getRole().name());
                    serverStatus.put("serverInfo", serverInfo);
                    detailedResults.put(server.getHost(), serverStatus);
                } else {
                    Map<String, Object> serverStatus = new java.util.HashMap<>();
                    serverStatus.put("installed", false);
                    serverStatus.put("error", "Ansible not found or not accessible");
                    serverStatus.put("role", server.getRole().name());
                    serverStatus.put("serverInfo", serverInfo);
                    detailedResults.put(server.getHost(), serverStatus);
                    allInstalled = false;
                }

            } catch (Exception e) {
                String errorMessage = e.getMessage();
                if (errorMessage == null) {
                    errorMessage = e.getClass().getSimpleName() + " occurred";
                }
                System.out.println("DEBUG: Exception for " + server.getHost() + ": " + errorMessage);
                e.printStackTrace();

                Map<String, Object> serverStatus = new java.util.HashMap<>();
                serverStatus.put("installed", false);
                serverStatus.put("error", errorMessage);
                serverStatus.put("role", server.getRole().name());
                serverStatus.put("serverInfo", serverInfo);
                detailedResults.put(server.getHost(), serverStatus);
                allInstalled = false;
            }
        }

        // Phân loại servers theo role
        Map<String, Object> roleSummary = new java.util.HashMap<>();
        Map<String, Integer> roleInstalledCount = new java.util.HashMap<>();
        Map<String, Integer> roleTotalCount = new java.util.HashMap<>();

        for (Server server : clusterServers) {
            String role = server.getRole().name();
            roleTotalCount.put(role, roleTotalCount.getOrDefault(role, 0) + 1);

            @SuppressWarnings("unchecked")
            Map<String, Object> serverStatus = (Map<String, Object>) detailedResults.get(server.getHost());
            if ((Boolean) serverStatus.get("installed")) {
                roleInstalledCount.put(role, roleInstalledCount.getOrDefault(role, 0) + 1);
            }
        }

        // Tạo summary cho từng role
        for (String role : roleTotalCount.keySet()) {
            int total = roleTotalCount.get(role);
            int installed = roleInstalledCount.getOrDefault(role, 0);

            Map<String, Object> roleInfo = new java.util.HashMap<>();
            roleInfo.put("total", total);
            roleInfo.put("installed", installed);
            roleInfo.put("notInstalled", total - installed);
            roleInfo.put("percentage", total > 0 ? Math.round((installed * 100.0) / total) : 0);
            roleSummary.put(role, roleInfo);
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("clusterId", clusterId);
        result.put("allInstalled", allInstalled);
        result.put("someInstalled", someInstalled);
        result.put("totalServers", totalServers);
        result.put("installedCount", installedCount);
        result.put("notInstalledCount", totalServers - installedCount);
        result.put("installationPercentage",
                totalServers > 0 ? Math.round((installedCount * 100.0) / totalServers) : 0);
        result.put("ansibleStatus", detailedResults);
        result.put("roleSummary", roleSummary);
        result.put("recommendation",
                getInstallationRecommendation(allInstalled, someInstalled, installedCount, totalServers));
        return result;
    }

    /**
     * Trích xuất phiên bản Ansible từ output
     */
    private String extractAnsibleVersion(String output) {
        try {
            // Tìm dòng chứa "ansible" và phiên bản
            String[] lines = output.split("\n");
            for (String line : lines) {
                if (line.toLowerCase().contains("ansible")) {
                    // Tìm pattern version như "ansible 2.9.6" hoặc "ansible [core 2.12.1]"
                    java.util.regex.Pattern pattern = java.util.regex.Pattern
                            .compile("ansible.*?([0-9]+\\.[0-9]+\\.[0-9]+)");
                    java.util.regex.Matcher matcher = pattern.matcher(line.toLowerCase());
                    if (matcher.find()) {
                        return matcher.group(1);
                    }
                }
            }
            return "Unknown version";
        } catch (Exception e) {
            return "Unknown version";
        }
    }

    /**
     * Đưa ra khuyến nghị dựa trên trạng thái cài đặt chi tiết
     */
    private String getInstallationRecommendation(boolean allInstalled, boolean someInstalled, int installedCount,
            int totalServers) {
        if (allInstalled) {
            return String.format(
                    "✅ Tất cả %d servers đã có Ansible cài đặt. Bạn có thể bỏ qua bước cài đặt và tiến hành triển khai Kubernetes.",
                    totalServers);
        } else if (someInstalled) {
            return String.format(
                    "⚠️ %d/%d servers đã có Ansible. Bạn có thể cài đặt cho các servers còn lại hoặc cài đặt lại cho tất cả.",
                    installedCount, totalServers);
        } else {
            return String.format(
                    "❌ Chưa có server nào cài đặt Ansible trong %d servers. Cần cài đặt Ansible trước khi triển khai Kubernetes.",
                    totalServers);
        }
    }

    /**
     * Cài đặt Ansible trên cluster với hỗ trợ sudo password
     */
    @Transactional
    public CompletableFuture<Map<String, Object>> installAnsibleOnCluster(Long clusterId,
            Map<Long, String> passwordCache,
            Map<Long, String> sudoPasswordCache) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // 1. Lấy danh sách servers trong cluster
                List<Server> clusterServers = serverService.findByClusterId(clusterId);

                if (clusterServers.isEmpty()) {
                    throw new RuntimeException("Cluster không có servers nào");
                }

                // 2. Tạo workspace cho Ansible
                createAnsibleWorkspace();

                // 3. Tạo inventory file với sudo password
                createInventoryFileWithSudo(clusterServers, passwordCache, sudoPasswordCache);

                // 4. Tạo ansible.cfg
                createAnsibleConfig();

                // 5. Cài đặt Ansible trên từng node
                Map<String, Object> results = new java.util.HashMap<>();

                for (Server server : clusterServers) {
                    try {
                        String result = installAnsibleOnNodeWithSudo(server,
                                passwordCache.get(server.getId()),
                                sudoPasswordCache.get(server.getId()));
                        Map<String, Object> serverResult = new java.util.HashMap<>();
                        serverResult.put("status", "SUCCESS");
                        serverResult.put("message", result);
                        results.put(server.getHost(), serverResult);
                    } catch (Exception e) {
                        Map<String, Object> serverResult = new java.util.HashMap<>();
                        serverResult.put("status", "FAILED");
                        serverResult.put("error", e.getMessage());
                        results.put(server.getHost(), serverResult);
                    }
                }

                Map<String, Object> finalResult = new java.util.HashMap<>();
                finalResult.put("clusterId", clusterId);
                finalResult.put("installationResults", results);
                finalResult.put("timestamp", System.currentTimeMillis());
                return finalResult;

            } catch (Exception e) {
                throw new RuntimeException("Lỗi cài đặt Ansible: " + e.getMessage(), e);
            }
        }, executorService);
    }

    /**
     * Cài đặt Ansible trên một node với hỗ trợ sudo
     */
    private String installAnsibleOnNodeWithSudo(Server server, String sshPassword, String sudoPassword) {
        try {
            // Ưu tiên sử dụng SSH key nếu có
            if (server.getSshKey() != null && server.getSshKey().getEncryptedPrivateKey() != null) {
                return installAnsibleWithKeyAndSudo(server, sudoPassword);
            } else {
                return installAnsibleWithPassword(server, sshPassword, sudoPassword);
            }
        } catch (Exception e) {
            throw new RuntimeException("Lỗi cài đặt Ansible trên " + server.getHost() + ": " + e.getMessage(), e);
        }
    }

    /**
     * Cài đặt Ansible sử dụng SSH key và sudo password
     */
    private String installAnsibleWithKeyAndSudo(Server server, String sudoPassword) {
        String privateKeyPem = server.getSshKey().getEncryptedPrivateKey();

        // 1. Cập nhật package manager
        String updateCmd = "apt update && apt upgrade -y";
        serverService.execCommandWithKeyAndSudo(
                server.getHost(), server.getPort(), server.getUsername(), privateKeyPem, updateCmd, sudoPassword,
                30000);

        // 2. Cài đặt Python và pip
        String pythonCmd = "apt install -y python3 python3-pip python3-venv";
        serverService.execCommandWithKeyAndSudo(
                server.getHost(), server.getPort(), server.getUsername(), privateKeyPem, pythonCmd, sudoPassword,
                30000);

        // 3. Cài đặt Ansible
        String ansibleCmd = "pip3 install ansible";
        serverService.execCommandWithKeyAndSudo(
                server.getHost(), server.getPort(), server.getUsername(), privateKeyPem, ansibleCmd, sudoPassword,
                60000);

        // 4. Kiểm tra Ansible đã cài đặt thành công
        String checkCmd = "ansible --version";
        String checkResult = serverService.execCommandWithKey(
                server.getHost(), server.getPort(), server.getUsername(), privateKeyPem, checkCmd, 10000);

        return "Ansible installed successfully with SSH key: " + checkResult;
    }

    /**
     * Cài đặt Ansible sử dụng password và sudo password
     */
    private String installAnsibleWithPassword(Server server, String sshPassword, String sudoPassword) {
        // 1. Cập nhật package manager
        String updateCmd = "apt update && apt upgrade -y";
        serverService.execCommandWithSudo(
                server.getHost(), server.getPort(), server.getUsername(), sshPassword, updateCmd, sudoPassword, 30000);

        // 2. Cài đặt Python và pip
        String pythonCmd = "apt install -y python3 python3-pip python3-venv";
        serverService.execCommandWithSudo(
                server.getHost(), server.getPort(), server.getUsername(), sshPassword, pythonCmd, sudoPassword, 30000);

        // 3. Cài đặt Ansible
        String ansibleCmd = "pip3 install ansible";
        serverService.execCommandWithSudo(
                server.getHost(), server.getPort(), server.getUsername(), sshPassword, ansibleCmd, sudoPassword, 60000);

        // 4. Kiểm tra Ansible đã cài đặt thành công
        String checkCmd = "ansible --version";
        String checkResult = serverService.execCommand(
                server.getHost(), server.getPort(), server.getUsername(), sshPassword, checkCmd, 10000);

        return "Ansible installed successfully with password: " + checkResult;
    }

    /**
     * Tạo workspace cho Ansible
     */
    private void createAnsibleWorkspace() throws IOException {
        Path ansiblePath = Paths.get(ANSIBLE_DIR);
        if (!Files.exists(ansiblePath)) {
            Files.createDirectories(ansiblePath);
        }

        // Tạo thư mục playbooks
        Path playbooksPath = ansiblePath.resolve("playbooks");
        if (!Files.exists(playbooksPath)) {
            Files.createDirectories(playbooksPath);
        }
    }

    /**
     * Tạo inventory file với sudo password
     */
    private void createInventoryFileWithSudo(List<Server> servers, Map<Long, String> passwordCache,
            Map<Long, String> sudoPasswordCache) throws IOException {
        StringBuilder inventory = new StringBuilder();

        // Master nodes
        inventory.append("[master]\n");
        servers.stream()
                .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                .forEach(s -> {
                    String password = passwordCache.get(s.getId());
                    String sudoPassword = sudoPasswordCache.get(s.getId());
                    inventory.append(s.getHost())
                            .append(" ansible_user=").append(s.getUsername())
                            .append(" ansible_ssh_pass=").append(password != null ? password : "")
                            .append(" ansible_ssh_port=").append(s.getPort() != null ? s.getPort() : 22)
                            .append(" ansible_become_pass=").append(sudoPassword != null ? sudoPassword : "")
                            .append("\n");
                });

        // Worker nodes
        inventory.append("\n[workers]\n");
        servers.stream()
                .filter(s -> s.getRole() == Server.ServerRole.WORKER)
                .forEach(s -> {
                    String password = passwordCache.get(s.getId());
                    String sudoPassword = sudoPasswordCache.get(s.getId());
                    inventory.append(s.getHost())
                            .append(" ansible_user=").append(s.getUsername())
                            .append(" ansible_ssh_pass=").append(password != null ? password : "")
                            .append(" ansible_ssh_port=").append(s.getPort() != null ? s.getPort() : 22)
                            .append(" ansible_become_pass=").append(sudoPassword != null ? sudoPassword : "")
                            .append("\n");
                });

        // All nodes
        inventory.append("\n[all:vars]\n");
        inventory.append("ansible_python_interpreter=/usr/bin/python3\n");
        inventory.append("ansible_ssh_common_args='-o StrictHostKeyChecking=no'\n");
        inventory.append("ansible_become=yes\n");
        inventory.append("ansible_become_method=sudo\n");

        // Ghi file
        Path inventoryPath = Paths.get(ANSIBLE_DIR, INVENTORY_FILE);
        Files.write(inventoryPath, inventory.toString().getBytes());
    }

    /**
     * Tạo ansible.cfg
     */
    private void createAnsibleConfig() throws IOException {
        String config = """
                [defaults]
                inventory = inventory.ini
                host_key_checking = False
                retry_files_enabled = False
                gathering = smart
                fact_caching = memory
                stdout_callback = yaml
                bin_ansible_callbacks = True
                """;

        Path configPath = Paths.get(ANSIBLE_DIR, ANSIBLE_CFG);
        Files.write(configPath, config.getBytes());
    }
}
