package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class AnsibleInstallationService {

    private final ServerService serverService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(5);

    public AnsibleInstallationService(ServerService serverService) {
        this.serverService = serverService;
    }

    private String executeRemoteWithAuth(Server server, String command, String sshPassword, String sudoPassword,
            int timeoutMs) {
        try {
            String host = server.getHost();
            int port = server.getPort() != null ? server.getPort() : 22;
            String username = server.getUsername();

            // Xác định xem command có cần sudo không
            boolean needsSudo = (command.startsWith("apt") || command.startsWith("pip") || command.startsWith("rm ")
                    || command.startsWith("bash -lc 'shopt") || command.startsWith("apt-get")
                    || command.startsWith("add-apt-repository") || command.startsWith("chmod ")
                    || command.startsWith("cat > ") || command.startsWith("mkdir ")
                    || command.startsWith("tee ") || command.contains(" /etc/ansible"));

            // Ưu tiên SSH key từ database
            String pem = serverService.resolveServerPrivateKeyPem(server.getId());
            boolean hasSudoNopasswd = false;

            // Kiểm tra sudo NOPASSWD nếu có SSH key
            if (pem != null && !pem.isBlank()) {
                if (needsSudo) {
                    try {
                        String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                        String sudoCheckResult = serverService.execCommandWithKey(host, port, username, pem,
                                checkSudoCmd, 5000);
                        hasSudoNopasswd = (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD"));
                    } catch (Exception e) {
                        // Nếu không kiểm tra được với SSH key, thử với password
                        try {
                            if (sudoPassword != null && !sudoPassword.isBlank()) {
                                String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                                String sudoCheckResult = serverService.execCommand(host, port, username, sudoPassword,
                                        checkSudoCmd, 5000);
                                hasSudoNopasswd = (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD"));
                            }
                        } catch (Exception e2) {
                            // Nếu không kiểm tra được, giả định cần sudo password
                        }
                    }
                }
            }

            // Tạo lệnh với sudo nếu cần
            String finalCommand = command;
            if (needsSudo && !hasSudoNopasswd && sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                String escapedPassword = sudoPassword.replace("'", "'\"'\"'");
                String quotedOriginal = "'" + command.replace("'", "'\"'\"'") + "'";
                finalCommand = String.format("echo '%s' | sudo -S bash -lc %s", escapedPassword, quotedOriginal);
            } else if (needsSudo && hasSudoNopasswd) {
                finalCommand = "sudo " + command;
            }

            // Thực thi lệnh - ưu tiên SSH key
            if (pem != null && !pem.isBlank()) {
                return serverService.execCommandWithKey(host, port, username, pem, finalCommand, timeoutMs);
            } else if (sshPassword != null && !sshPassword.isBlank()) {
                return serverService.execCommand(host, port, username, sshPassword, finalCommand, timeoutMs);
            } else {
                throw new RuntimeException("Không có SSH key hoặc mật khẩu SSH để kết nối tới " + host);
            }
        } catch (Exception e) {
            throw new RuntimeException("Remote exec failed on " + server.getHost() + ": " + e.getMessage(), e);
        }
    }

    private Map<String, Object> checkServerAuthStatus(Server server, String sudoPassword) {
        Map<String, Object> status = new java.util.HashMap<>();

        // Kiểm tra SSH key
        String pem = serverService.resolveServerPrivateKeyPem(server.getId());
        boolean hasSshKey = (pem != null && !pem.isBlank());
        status.put("hasSshKey", hasSshKey);

        boolean hasSudoNopasswd = false;
        boolean needsPassword = true;
        String authMethod = "password";

        if (hasSshKey) {
            // Có SSH key, kiểm tra sudo NOPASSWD
            try {
                String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                String sudoCheckResult = serverService.execCommandWithKey(
                        server.getHost(),
                        server.getPort() != null ? server.getPort() : 22,
                        server.getUsername(),
                        pem,
                        checkSudoCmd,
                        5000);
                hasSudoNopasswd = (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD"));

                if (hasSudoNopasswd) {
                    needsPassword = false;
                    authMethod = "SSH key + sudo NOPASSWD";
                } else if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                    needsPassword = true;
                    authMethod = "SSH key + sudo password";
                } else {
                    needsPassword = true;
                    authMethod = "SSH key (cần sudo password hoặc fallback password)";
                }
            } catch (Exception e) {
                // Không kiểm tra được NOPASSWD với SSH key
                if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                    needsPassword = true;
                    authMethod = "SSH key + sudo password";
                } else {
                    needsPassword = true;
                    authMethod = "SSH key (cần sudo password hoặc fallback password)";
                }
            }
        } else {
            // Không có SSH key, chỉ có thể dùng password
            needsPassword = true;
            authMethod = "Password";
        }

        status.put("hasSudoNopasswd", hasSudoNopasswd);
        status.put("needsPassword", needsPassword);
        status.put("authMethod", authMethod);

        return status;
    }

    /**
     * Kiểm tra Ansible đã cài đặt trên controller server (ưu tiên ANSIBLE, fallback MASTER)
     */
    public Map<String, Object> checkAnsibleInstallation(Long clusterId, Map<Long, String> passwordCache) {
        // Bước 1: Tìm ANSIBLE trong tất cả servers trước (vì máy ANSIBLE không nằm trong cụm)
        Server controllerServer = null;
        try {
            var allServers = serverService.findAll();
            controllerServer = allServers.stream()
                    .filter(s -> "ANSIBLE".equals(s.getRole()))
                    .findFirst()
                    .orElse(null);
        } catch (Exception e) {
            // Nếu không lấy được tất cả servers, tiếp tục với fallback
        }

        // Bước 2: Nếu không có ANSIBLE, tìm MASTER trong AVAILABLE servers
        if (controllerServer == null) {
            List<Server> allClusterServers = serverService.findByClusterStatus("AVAILABLE");
            controllerServer = allClusterServers.stream()
                    .filter(server -> "MASTER".equals(server.getRole()))
                    .findFirst()
                    .orElse(null);
        }

        if (controllerServer == null) {
            Map<String, Object> result = new java.util.HashMap<>();
            result.put("clusterId", clusterId);
            result.put("allInstalled", false);
            result.put("someInstalled", false);
            result.put("totalServers", 0);
            result.put("installedCount", 0);
            result.put("notInstalledCount", 0);
            result.put("installationPercentage", 0);
            result.put("ansibleStatus", new java.util.HashMap<>());
            result.put("roleSummary", new java.util.HashMap<>());
            result.put("recommendation", "❌ Không tìm thấy ANSIBLE hoặc MASTER server");
            return result;
        }

        // Kiểm tra controller server có online không
        if (controllerServer.getStatus() != Server.ServerStatus.ONLINE) {
            Map<String, Object> result = new java.util.HashMap<>();
            result.put("clusterId", clusterId);
            result.put("allInstalled", false);
            result.put("someInstalled", false);
            result.put("totalServers", 1);
            result.put("installedCount", 0);
            result.put("notInstalledCount", 1);
            result.put("installationPercentage", 0);
            result.put("ansibleStatus", new java.util.HashMap<>());
            result.put("roleSummary", new java.util.HashMap<>());
            result.put("recommendation", "❌ Controller server (" + controllerServer.getHost()
                    + ") đang offline. Vui lòng kiểm tra kết nối máy chủ.");
            result.put("masterOffline", true);
            result.put("masterHost", controllerServer.getHost());
            return result;
        }

        Map<String, Object> detailedResults = new java.util.HashMap<>();
        String serverInfo = String.format("%s (%s)", controllerServer.getHost(), controllerServer.getRole() != null && !controllerServer.getRole().isBlank() ? controllerServer.getRole() : "WORKER");

        try {
            String checkCmd = "ansible --version";
            String result = "";

            // Thử SSH key trước
            if (controllerServer.getSshKey() != null && controllerServer.getSshKey().getEncryptedPrivateKey() != null) {
                try {
                    result = serverService.execCommandWithKey(
                            controllerServer.getHost(), controllerServer.getPort(), controllerServer.getUsername(),
                            controllerServer.getSshKey().getEncryptedPrivateKey(), checkCmd, 10000);
                } catch (Exception e) {
                    result = null;
                }
            }

            // Fallback về password nếu SSH key thất bại hoặc không có
            if (result == null || result.trim().isEmpty()) {
                String password = passwordCache.get(controllerServer.getId());
                if (password != null && !password.trim().isEmpty()) {
                    try {
                        result = serverService.execCommand(
                                controllerServer.getHost(), controllerServer.getPort(), controllerServer.getUsername(),
                                password, checkCmd, 10000);
                    } catch (Exception e) {
                        result = null;
                    }
                }
            }

            // Kiểm tra kết quả
            boolean isInstalled = (result != null && !result.trim().isEmpty()
                    && result.toLowerCase().contains("ansible"));

            Map<String, Object> serverStatus = new java.util.HashMap<>();
            serverStatus.put("installed", isInstalled);
            serverStatus.put("role", controllerServer.getRole() != null && !controllerServer.getRole().isBlank() ? controllerServer.getRole() : "WORKER");
            serverStatus.put("serverInfo", serverInfo);

            if (isInstalled) {
                serverStatus.put("version", extractAnsibleVersion(result));
                serverStatus.put("fullOutput", result);
            } else {
                serverStatus.put("error", "Ansible not found or not accessible");
            }

            detailedResults.put(controllerServer.getHost(), serverStatus);

            // Tạo role summary cho controller (ANSIBLE hoặc MASTER)
            Map<String, Object> roleSummary = new java.util.HashMap<>();
            String controllerRole = controllerServer.getRole() != null && !controllerServer.getRole().isBlank() ? controllerServer.getRole() : "MASTER";
            Map<String, Object> controllerInfo = new java.util.HashMap<>();
            controllerInfo.put("total", 1);
            controllerInfo.put("installed", isInstalled ? 1 : 0);
            controllerInfo.put("notInstalled", isInstalled ? 0 : 1);
            controllerInfo.put("percentage", isInstalled ? 100 : 0);
            roleSummary.put(controllerRole, controllerInfo);

            Map<String, Object> finalResult = new java.util.HashMap<>();
            finalResult.put("clusterId", clusterId);
            finalResult.put("allInstalled", isInstalled);
            finalResult.put("someInstalled", isInstalled);
            finalResult.put("totalServers", 1);
            finalResult.put("installedCount", isInstalled ? 1 : 0);
            finalResult.put("notInstalledCount", isInstalled ? 0 : 1);
            finalResult.put("installationPercentage", isInstalled ? 100 : 0);
            finalResult.put("ansibleStatus", detailedResults);
            finalResult.put("roleSummary", roleSummary);
            finalResult.put("recommendation",
                    getInstallationRecommendation(isInstalled, isInstalled, isInstalled ? 1 : 0, 1));

            return finalResult;

        } catch (Exception e) {
            String errorMessage = e.getMessage();
            if (errorMessage == null) {
                errorMessage = e.getClass().getSimpleName() + " occurred";
            }

            Map<String, Object> serverStatus = new java.util.HashMap<>();
            serverStatus.put("installed", false);
            serverStatus.put("error", errorMessage);
            serverStatus.put("role", controllerServer.getRole() != null && !controllerServer.getRole().isBlank() ? controllerServer.getRole() : "WORKER");
            serverStatus.put("serverInfo", serverInfo);
            detailedResults.put(controllerServer.getHost(), serverStatus);

            Map<String, Object> result = new java.util.HashMap<>();
            result.put("clusterId", clusterId);
            result.put("allInstalled", false);
            result.put("someInstalled", false);
            result.put("totalServers", 1);
            result.put("installedCount", 0);
            result.put("notInstalledCount", 1);
            result.put("installationPercentage", 0);
            result.put("ansibleStatus", detailedResults);
            result.put("roleSummary", new java.util.HashMap<>());
            result.put("recommendation", "❌ Lỗi kiểm tra Ansible trên Controller: " + errorMessage);
            return result;
        }
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
     * Cài đặt Ansible trên controller server (ưu tiên ANSIBLE, fallback MASTER)
     */
    @Transactional
    public CompletableFuture<Map<String, Object>> installAnsibleOnCluster(Long clusterId,
            Map<Long, String> passwordCache,
            Map<Long, String> sudoPasswordCache) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                // Bước 1: Tìm ANSIBLE trong tất cả servers trước (vì máy ANSIBLE không nằm trong cụm)
                Server controllerServer = null;
                try {
                    var allServers = serverService.findAll();
                    controllerServer = allServers.stream()
                            .filter(s -> "ANSIBLE".equals(s.getRole()))
                            .findFirst()
                            .orElse(null);
                } catch (Exception e) {
                    // Nếu không lấy được tất cả servers, tiếp tục với fallback
                }

                // Bước 2: Nếu không có ANSIBLE, tìm MASTER trong AVAILABLE servers
                if (controllerServer == null) {
                    List<Server> allClusterServers = serverService.findByClusterStatus("AVAILABLE");
                    if (allClusterServers.isEmpty()) {
                        throw new RuntimeException("Cluster không có servers nào");
                    }
                    
                    controllerServer = allClusterServers.stream()
                            .filter(server -> "MASTER".equals(server.getRole()))
                            .findFirst()
                            .orElse(null);
                }

                if (controllerServer == null) {
                    throw new RuntimeException("Không tìm thấy ANSIBLE hoặc MASTER server");
                }

                // 3. Cài đặt Ansible trên controller server
                Map<String, Object> results = new java.util.HashMap<>();

                try {
                    String result = installAnsibleOnNodeWithSudo(controllerServer,
                            passwordCache.get(controllerServer.getId()),
                            sudoPasswordCache.get(controllerServer.getId()));
                    Map<String, Object> serverResult = new java.util.HashMap<>();
                    serverResult.put("status", "SUCCESS");
                    serverResult.put("message", result);
                    results.put(controllerServer.getHost(), serverResult);
                } catch (Exception e) {
                    Map<String, Object> serverResult = new java.util.HashMap<>();
                    serverResult.put("status", "FAILED");
                    serverResult.put("error", e.getMessage());
                    results.put(controllerServer.getHost(), serverResult);
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
     * Ưu tiên SSH key + sudo NOPASSWD, fallback về SSH key + sudo password, cuối
     * cùng mới dùng password
     */
    private String installAnsibleOnNodeWithSudo(Server server, String sshPassword, String sudoPassword) {
        try {
            // Kiểm tra trạng thái authentication của server
            Map<String, Object> authStatus = checkServerAuthStatus(server, sudoPassword);

            boolean hasSshKey = (Boolean) authStatus.get("hasSshKey");
            boolean hasSudoNopasswd = (Boolean) authStatus.get("hasSudoNopasswd");
            String authMethod = (String) authStatus.get("authMethod");

            System.out.println("[" + server.getHost() + "] Auth status: " + authMethod);

            // Xác định thông số xác thực theo thứ tự ưu tiên
            String finalSshPassword = null;
            String finalSudoPassword = null;

            if (hasSshKey) {
                // Ưu tiên 1: SSH key + sudo NOPASSWD (không cần password)
                if (hasSudoNopasswd) {
                    finalSshPassword = null;
                    finalSudoPassword = null;
                    authMethod = "SSH key + sudo NOPASSWD";
                }
                // Ưu tiên 2: SSH key + sudo password (nếu có sudo password)
                else if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                    finalSshPassword = null;
                    finalSudoPassword = sudoPassword;
                    authMethod = "SSH key + sudo password";
                }
                // Nếu SSH key không có sudo NOPASSWD và không có sudo password, thử fallback về
                // password
                else {
                    System.out.println("[" + server.getHost()
                            + "] SSH key không có sudo NOPASSWD và không có sudo password, thử fallback về password");
                    if (sshPassword != null && !sshPassword.trim().isEmpty()) {
                        finalSshPassword = sshPassword;
                        finalSudoPassword = sudoPassword;
                        authMethod = "Password fallback";
                    } else {
                        throw new RuntimeException(
                                "Server có SSH key nhưng không có sudo NOPASSWD, không có sudo password và không có mật khẩu SSH");
                    }
                }
            } else {
                // Không có SSH key, sử dụng password
                if (sshPassword == null || sshPassword.trim().isEmpty()) {
                    throw new RuntimeException(
                            "Không có SSH key và không có mật khẩu SSH để kết nối tới " + server.getHost());
                }
                finalSshPassword = sshPassword;
                finalSudoPassword = sudoPassword;
                authMethod = "Password";
            }

            System.out.println("[" + server.getHost() + "] Final auth method: " + authMethod);

            // Thực hiện cài đặt với thông số đã xác định
            return performAnsibleInstallation(server, finalSshPassword, finalSudoPassword, authMethod);

        } catch (Exception e) {
            throw new RuntimeException("Lỗi cài đặt Ansible trên " + server.getHost() + ": " + e.getMessage(), e);
        }
    }

    /**
     * Thực hiện cài đặt Ansible với thông số xác thực đã xác định
     */
    private String performAnsibleInstallation(Server server, String sshPassword, String sudoPassword,
            String authMethod) {
        // 1. Cập nhật package manager
        String updateCmd = "apt update -y";
        executeRemoteWithAuth(server, updateCmd, sshPassword, sudoPassword, 30000);

        // 2. Cài đặt Python và pip
        String pythonCmd = "apt install -y python3 python3-pip python3-venv";
        executeRemoteWithAuth(server, pythonCmd, sshPassword, sudoPassword, 30000);

        // 3. Cài đặt Ansible
        String ansibleCmd = "pip3 install ansible";
        executeRemoteWithAuth(server, ansibleCmd, sshPassword, sudoPassword, 60000);

        // 4. Kiểm tra Ansible đã cài đặt thành công
        String checkCmd = "ansible --version";
        String checkResult = executeRemoteWithAuth(server, checkCmd, sshPassword, null, 10000);

        return "Ansible installed successfully with " + authMethod + ": " + checkResult;
    }

}
