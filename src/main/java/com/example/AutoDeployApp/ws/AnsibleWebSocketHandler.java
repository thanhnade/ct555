package com.example.AutoDeployApp.ws;

import com.example.AutoDeployApp.service.AnsibleInstallationService;
import com.example.AutoDeployApp.service.ServerService;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;
import org.springframework.lang.NonNull;

public class AnsibleWebSocketHandler extends TextWebSocketHandler {

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ServerService serverService;

    public AnsibleWebSocketHandler(AnsibleInstallationService ansibleService, ServerService serverService) {
        this.serverService = serverService;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) throws Exception {
        sessions.put(session.getId(), session);
        sendMessage(session, "{\"type\":\"connected\",\"message\":\"WebSocket connected\"}");
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) throws Exception {
        String payload = message.getPayload();
        Map<String, Object> request = parseJsonObject(payload);

        String action = (String) request.get("action");

        if ("start_ansible_install".equals(action)) {
            Long clusterId = Long.valueOf(request.get("clusterId").toString());
            String targetServer = (String) request.get("targetServer");
            Boolean isReinstall = (Boolean) request.get("isReinstall");
            Boolean isUninstall = (Boolean) request.get("isUninstall");

            // Safe parsing of sudoPasswords
            Map<String, String> sudoPasswords = new java.util.HashMap<>();
            Object sudoPasswordsObj = request.get("sudoPasswords");

            if (sudoPasswordsObj instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> sudoPasswordsMap = (Map<String, Object>) sudoPasswordsObj;
                sudoPasswordsMap.forEach((key, value) -> {
                    if (value instanceof String) {
                        sudoPasswords.put(key, (String) value);
                    } else if (value != null) {
                        sudoPasswords.put(key, value.toString());
                    }
                });
            } else if (sudoPasswordsObj instanceof String) {
                // Handle case where sudoPasswords is a JSON string
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsedMap = new com.fasterxml.jackson.databind.ObjectMapper()
                            .readValue((String) sudoPasswordsObj, Map.class);
                    parsedMap.forEach((key, value) -> {
                        if (value instanceof String) {
                            sudoPasswords.put(key, (String) value);
                        } else if (value != null) {
                            sudoPasswords.put(key, value.toString());
                        }
                    });
                } catch (Exception e) {
                    System.out.println("ERROR: Failed to parse sudoPasswords JSON: " + e.getMessage());
                }
            }

            // Bắt đầu cài đặt/gỡ cài đặt Ansible với real-time output
            startAnsibleInstallationWithOutput(session, clusterId, sudoPasswords, targetServer, isReinstall,
                    isUninstall);
        } else if ("init_structure".equals(action)) {
            Long clusterId = toLongSafe(request.get("clusterId"));
            String host = (String) request.get("host");
            String sudoPassword = (String) request.get("sudoPassword");
            streamInitStructure(session, clusterId, host, sudoPassword);
        } else if ("init_config".equals(action)) {
            Long clusterId = toLongSafe(request.get("clusterId"));
            String host = (String) request.get("host");
            String sudoPassword = (String) request.get("sudoPassword");
            streamInitConfig(session, clusterId, host, sudoPassword);
        } else if ("init_sshkey".equals(action)) {
            Long clusterId = toLongSafe(request.get("clusterId"));
            String host = (String) request.get("host");
            String sudoPassword = (String) request.get("sudoPassword");
            streamInitSshKey(session, clusterId, host, sudoPassword);
        } else if ("init_ping".equals(action)) {
            Long clusterId = toLongSafe(request.get("clusterId"));
            String host = (String) request.get("host");
            String sudoPassword = (String) request.get("sudoPassword");
            streamInitPing(session, clusterId, host, sudoPassword);
        } else if ("read_ansible_config".equals(action)) {
            Long clusterId = toLongSafe(request.get("clusterId"));
            String host = (String) request.get("host");
            String sudoPassword = (String) request.get("sudoPassword");
            streamReadAnsibleConfig(session, clusterId, host, sudoPassword);
        } else if ("save_ansible_config".equals(action)) {
            Long clusterId = toLongSafe(request.get("clusterId"));
            String host = (String) request.get("host");
            String sudoPassword = (String) request.get("sudoPassword");
            String cfg = (String) request.get("cfg");
            String hosts = (String) request.get("hosts");
            String vars = (String) request.get("vars");
            streamSaveAnsibleConfig(session, clusterId, host, sudoPassword, cfg, hosts, vars);
        }
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus closeStatus)
            throws Exception {
        sessions.remove(session.getId());
    }

    /**
     * Bắt đầu cài đặt Ansible với real-time output
     */
    private void startAnsibleInstallationWithOutput(WebSocketSession session, Long clusterId,
            Map<String, String> sudoPasswords, String targetServer, Boolean isReinstall, Boolean isUninstall) {
        CompletableFuture.runAsync(() -> {
            try {
                if (Boolean.TRUE.equals(isUninstall)) {
                    sendMessage(session, "{\"type\":\"start\",\"message\":\"Bắt đầu gỡ cài đặt Ansible...\"}");
                } else {
                    sendMessage(session, "{\"type\":\"start\",\"message\":\"Bắt đầu cài đặt Ansible...\"}");
                }

                // Lấy danh sách servers
                var allClusterServers = serverService.findByClusterId(clusterId);
                java.util.List<com.example.AutoDeployApp.entity.Server> clusterServers;

                // Chỉ cài đặt trên MASTER server
                clusterServers = allClusterServers.stream()
                        .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                        .collect(java.util.stream.Collectors.toList());

                if (clusterServers.isEmpty()) {
                    sendMessage(session,
                            "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER server trong cluster\"}");
                    return;
                }

                // Lấy mật khẩu sudo của MASTER
                com.example.AutoDeployApp.entity.Server masterServer = clusterServers.get(0);
                String masterSudoPassword = sudoPasswords.get(masterServer.getHost());

                // Kiểm tra sudo NOPASSWD trước khi yêu cầu mật khẩu
                boolean needsPassword = true;
                try {
                    String pem = serverService.resolveServerPrivateKeyPem(masterServer.getId());
                    if (pem != null && !pem.isBlank()) {
                        String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                        String sudoCheckResult = serverService.execCommandWithKey(
                                masterServer.getHost(),
                                masterServer.getPort() != null ? masterServer.getPort() : 22,
                                masterServer.getUsername(),
                                pem,
                                checkSudoCmd,
                                5000);
                        if (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD")) {
                            needsPassword = false;
                            masterSudoPassword = null; // Không cần mật khẩu
                        }
                    }
                } catch (Exception e) {
                    // Nếu không kiểm tra được sudo NOPASSWD, tiếp tục với logic cũ
                }

                if (needsPassword && (masterSudoPassword == null || masterSudoPassword.trim().isEmpty())) {
                    sendMessage(session, String.format(
                            "{\"type\":\"error\",\"message\":\"Cần mật khẩu sudo cho MASTER server: %s\"}",
                            masterServer.getHost()));
                    return;
                }

                String action = Boolean.TRUE.equals(isUninstall) ? "gỡ cài đặt" : "cài đặt";
                sendMessage(session, String.format(
                        "{\"type\":\"info\",\"message\":\"Bắt đầu %s Ansible trên MASTER: %s\"}",
                        action, masterServer.getHost()));

                // Cài đặt trên MASTER server
                com.example.AutoDeployApp.entity.Server server = clusterServers.get(0);
                String progress = "(1/1)";

                String serverAction = Boolean.TRUE.equals(isUninstall) ? "gỡ cài đặt" : "cài đặt";
                sendMessage(session, String.format(
                        "{\"type\":\"server_start\",\"server\":\"%s\",\"progress\":\"%s\",\"message\":\"Bắt đầu %s Ansible trên MASTER %s\"}",
                        server.getHost(), progress, serverAction, server.getHost()));

                try {
                    String result;
                    if (Boolean.TRUE.equals(isUninstall)) {
                        result = uninstallAnsibleOnServerWithOutput(session, server, masterSudoPassword);
                    } else {
                        result = installAnsibleOnServerWithOutput(session, server, masterSudoPassword);
                    }

                    // Tạo success message an toàn với Jackson
                    try {
                        java.util.Map<String, Object> successMessage = new java.util.HashMap<>();
                        successMessage.put("type", "server_success");
                        successMessage.put("server", server.getHost());
                        successMessage.put("message", "✅ " + server.getHost() + ": " + result);

                        String jsonMessage = new com.fasterxml.jackson.databind.ObjectMapper()
                                .writeValueAsString(successMessage);
                        sendMessage(session, jsonMessage);
                    } catch (Exception jsonError) {
                        System.err.println("ERROR: Failed to create success JSON: " + jsonError.getMessage());
                        // Fallback với escaped message
                        sendMessage(session,
                                String.format(
                                        "{\"type\":\"server_success\",\"server\":\"%s\",\"message\":\"✅ %s: %s\"}",
                                        server.getHost(), server.getHost(), escapeJsonString(result)));
                    }
                } catch (Exception e) {
                    System.out
                            .println("ERROR: Installation failed for " + server.getHost() + ": " + e.getMessage());
                    e.printStackTrace();
                    sendMessage(session,
                            String.format("{\"type\":\"server_error\",\"server\":\"%s\",\"message\":\"❌ %s: %s\"}",
                                    server.getHost(), server.getHost(), e.getMessage()));
                }

                if (Boolean.TRUE.equals(isUninstall)) {
                    sendMessage(session,
                            "{\"type\":\"complete\",\"message\":\"🎉 Hoàn thành gỡ cài đặt Ansible!\"}");
                } else {
                    sendMessage(session,
                            "{\"type\":\"complete\",\"message\":\"🎉 Hoàn thành cài đặt Ansible!\"}");
                }

            } catch (Exception e) {
                System.out.println("ERROR: Critical error in startAnsibleInstallationWithOutput: " + e.getMessage());
                e.printStackTrace();
                try {
                    sendMessage(session,
                            String.format("{\"type\":\"error\",\"message\":\"❌ Lỗi: %s\"}", e.getMessage()));
                } catch (Exception sendError) {
                    System.out.println("ERROR: Failed to send error message: " + sendError.getMessage());
                }
            }
        });
    }

    // ================= Init Quick Actions (Realtime) =================
    private void streamInitStructure(WebSocketSession session, Long clusterId, String host, String sudoPassword) {
        CompletableFuture.runAsync(() -> {
            try {
                var servers = serverService.findByClusterId(clusterId);
                com.example.AutoDeployApp.entity.Server target = pickTarget(servers, host, true);
                if (target == null) {
                    sendMessage(session, "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER trong cluster\"}");
                    return;
                }
                sendMessage(session, String.format("{\"type\":\"start\",\"message\":\"Khởi tạo cấu trúc trên %s...\"}",
                        target.getHost()));
                executeCommandWithTerminalOutput(session, target,
                        "mkdir -p /etc/ansible/{playbooks,roles,group_vars,host_vars}", sudoPassword, 15000);
                executeCommandWithTerminalOutput(session, target, "mkdir -p ~/.ansible", sudoPassword, 8000);
                executeCommandWithTerminalOutput(session, target, "chmod -R 755 /etc/ansible", sudoPassword, 8000);
                // Verify directories exist
                String verify = executeCommandWithTerminalOutput(session, target,
                        "bash -lc 'for d in /etc/ansible /etc/ansible/group_vars /etc/ansible/host_vars /etc/ansible/playbooks /etc/ansible/roles; do [ -d \"$d\" ] || { echo MISSING:$d; exit 1; }; done; echo OK'",
                        sudoPassword, 8000);
                if (verify != null && verify.contains("OK")) {
                    sendMessage(session,
                            String.format("{\"type\":\"complete\",\"message\":\"Hoàn tất khởi tạo cấu trúc trên %s\"}",
                                    target.getHost()));
                } else {
                    sendMessage(session,
                            String.format("{\"type\":\"error\",\"message\":\"Xác minh cấu trúc thất bại trên %s\"}",
                                    target.getHost()));
                }
            } catch (Exception e) {
                sendMessage(session,
                        String.format("{\"type\":\"error\",\"message\":\"%s\"}", escapeJsonString(e.getMessage())));
            }
        });
    }

    private void streamInitConfig(WebSocketSession session, Long clusterId, String host, String sudoPassword) {
        CompletableFuture.runAsync(() -> {
            try {
                var servers = serverService.findByClusterId(clusterId);
                com.example.AutoDeployApp.entity.Server target = pickTarget(servers, host, true);
                if (target == null) {
                    sendMessage(session, "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER trong cluster\"}");
                    return;
                }
                // Ghi ansible.cfg theo yêu cầu (bao gồm remote_user và timeout)
                String cfg = "[defaults]\n" +
                        "inventory      = /etc/ansible/hosts\n" +
                        "roles_path     = /etc/ansible/roles\n" +
                        "remote_user    = " + (target.getUsername() != null ? target.getUsername() : "root") + "\n" +
                        "host_key_checking = False\n" +
                        "retry_files_enabled = False\n" +
                        "timeout = 45\n" +
                        "nocows = 1\n" +
                        "forks = 10\n" +
                        "interpreter_python = /usr/bin/python3\n" +
                        "\n" +
                        "# Hiển thị log rõ ràng, có thời gian từng task\n" +
                        "stdout_callback = yaml\n" +
                        "callbacks_enabled = timer, profile_tasks\n" +
                        "\n" +
                        "# Tự động kết thúc nếu gặp lỗi nghiêm trọng\n" +
                        "any_errors_fatal = True\n" +
                        "\n" +
                        "# Ẩn cảnh báo \"deprecation\" khi chạy các module builtin\n" +
                        "deprecation_warnings = False\n";
                String cmdCfg = "tee /etc/ansible/ansible.cfg > /dev/null <<'EOF'\n"
                        + cfg + "\nEOF";
                executeCommandWithTerminalOutput(session, target, "mkdir -p /etc/ansible", sudoPassword, 8000);
                executeCommandWithTerminalOutput(session, target, cmdCfg, sudoPassword, 20000);
                // Verify ansible.cfg exists and non-empty
                String verifyCfg = executeCommandWithTerminalOutput(session, target,
                        "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'",
                        sudoPassword, 6000);
                if (verifyCfg == null || !verifyCfg.contains("OK")) {
                    sendMessage(session,
                            String.format(
                                    "{\"type\":\"error\",\"message\":\"Không xác minh được ansible.cfg trên %s\"}",
                                    target.getHost()));
                    return;
                }

                // Sinh nội dung hosts theo CSDL, theo nhóm [master], [worker], và [all:vars]
                StringBuilder hosts = new StringBuilder();
                hosts.append("[master]\n");
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER) {
                        hosts.append(s.getHost())
                                .append(" ansible_user=")
                                .append(s.getUsername() != null ? s.getUsername() : "root");
                        if (s.getPort() != null)
                            hosts.append(" ansible_ssh_port=").append(s.getPort());
                        hosts.append("\n");
                    }
                }
                hosts.append("\n[worker]\n");
                for (var s : servers) {
                    if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.WORKER) {
                        hosts.append(s.getHost())
                                .append(" ansible_user=")
                                .append(s.getUsername() != null ? s.getUsername() : "root");
                        if (s.getPort() != null)
                            hosts.append(" ansible_ssh_port=").append(s.getPort());
                        hosts.append("\n");
                    }
                }
                hosts.append("\n[all:vars]\n")
                        .append("ansible_python_interpreter=/usr/bin/python3\n")
                        .append("ansible_ssh_private_key_file=/home/")
                        .append(target.getUsername() != null ? target.getUsername() : "root")
                        .append("/.ssh/id_rsa\n");

                String cmdHosts = "tee /etc/ansible/hosts > /dev/null <<'EOF'\n" + hosts + "EOF";
                executeCommandWithTerminalOutput(session, target, cmdHosts, sudoPassword, 20000);
                String verifyHosts = executeCommandWithTerminalOutput(session, target,
                        "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", sudoPassword, 6000);
                if (verifyHosts == null || !verifyHosts.contains("OK")) {
                    sendMessage(session,
                            String.format("{\"type\":\"error\",\"message\":\"Không xác minh được hosts trên %s\"}",
                                    target.getHost()));
                    return;
                }

                sendMessage(session, String.format(
                        "{\"type\":\"complete\",\"message\":\"Đã ghi ansible.cfg và hosts trên %s\"}",
                        target.getHost()));
            } catch (Exception e) {
                sendMessage(session,
                        String.format("{\"type\":\"error\",\"message\":\"%s\"}", escapeJsonString(e.getMessage())));
            }
        });
    }

    private void streamInitSshKey(WebSocketSession session, Long clusterId, String host, String sudoPassword) {
        CompletableFuture.runAsync(() -> {
            try {
                var servers = serverService.findByClusterId(clusterId);
                com.example.AutoDeployApp.entity.Server target = pickTarget(servers, host, true);
                if (target == null) {
                    sendMessage(session, "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER trong cluster\"}");
                    return;
                }
                // Luồng mới: luôn đảm bảo MASTER có ~/.ssh/id_rsa (RSA 2048) và dùng public key
                // tại chỗ làm nguồn phân phối
                sendMessage(session, String.format(
                        "{\"type\":\"info\",\"message\":\"Đảm bảo SSH key trên %s (RSA 2048)...\"}", target.getHost()));
                executeCommandWithTerminalOutput(session, target,
                        "bash -lc 'mkdir -p ~/.ssh; chmod 700 ~/.ssh'",
                        sudoPassword,
                        8000);
                executeCommandWithTerminalOutput(session, target,
                        "bash -lc '[ -f ~/.ssh/id_rsa.pub ] || ssh-keygen -t rsa -b 2048 -N \"\" -f ~/.ssh/id_rsa -q'",
                        sudoPassword, 20000);
                String masterPub = executeCommandWithTerminalOutput(session, target,
                        "bash -lc 'cat ~/.ssh/id_rsa.pub'", sudoPassword, 8000);
                if (masterPub == null || masterPub.isBlank()) {
                    sendMessage(session,
                            String.format("{\"type\":\"error\",\"message\":\"Không đọc được public key trên %s\"}",
                                    target.getHost()));
                    return;
                }
                sendMessage(session, String.format(
                        "{\"type\":\"terminal_output\",\"server\":\"%s\",\"output\":\"%s\"}",
                        target.getHost(), escapeJsonString(masterPub)));

                // Ensure master's own authorized_keys contains its public key
                try {
                    String[] partsCore = masterPub.split(" ", 3);
                    String core = (partsCore.length > 1 ? partsCore[1] : masterPub.trim());
                    String matchTokenMaster = escapeShellForSingleQuotes(core);
                    String fullKeyMaster = escapeShellForSingleQuotes(masterPub.trim());
                    String ensureSelfAuth = "bash -lc \"mkdir -p $HOME/.ssh && chmod 700 $HOME/.ssh && touch $HOME/.ssh/authorized_keys && chmod 600 $HOME/.ssh/authorized_keys; "
                            + "if grep -Fq " + matchTokenMaster
                            + " $HOME/.ssh/authorized_keys; then echo EXIST; else printf '%s\\n' " + fullKeyMaster
                            + " | tee -a $HOME/.ssh/authorized_keys >/dev/null; fi\"";
                    executeCommandWithTerminalOutput(session, target, ensureSelfAuth, sudoPassword, 15000);
                    sendMessage(session, String.format(
                            "{\"type\":\"info\",\"message\":\"Đã đảm bảo public key của MASTER có trong authorized_keys trên %s\"}",
                            target.getHost()));
                } catch (Exception ignored) {
                }

                String publicKeyToDistribute = masterPub.trim();

                // 5) Phân phối xuống WORKERs nếu có publicKeyToDistribute
                if (publicKeyToDistribute != null && !publicKeyToDistribute.isBlank()) {
                    // Tính key-core (trường thứ 2) để so khớp bền vững, tránh lệch comment
                    String keyCore = null;
                    try {
                        String[] parts = publicKeyToDistribute.split(" ", 3);
                        if (parts.length > 1)
                            keyCore = parts[1];
                    } catch (Exception ignored) {
                    }
                    // Chuẩn bị danh sách kết nối WORKER và nạp sẵn privateKey PEM để tránh
                    // lazy-load
                    java.util.List<Object[]> workerConns = new java.util.ArrayList<>();
                    for (var s : servers) {
                        if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.WORKER
                                && !s.getId().equals(target.getId())) {
                            String pem = serverService.resolveServerPrivateKeyPem(s.getId());
                            String hostW = s.getHost();
                            Integer portW = (s.getPort() != null ? s.getPort() : 22);
                            String userW = s.getUsername();
                            workerConns.add(new Object[] { hostW, portW, userW, pem });
                        }
                    }

                    sendMessage(session, String.format(
                            "{\"type\":\"info\",\"message\":\"Số WORKER trong cụm: %d\"}", workerConns.size()));

                    int okCount = 0, failCount = 0, skipped = 0;
                    for (Object[] wc : workerConns) {
                        String hostW = (String) wc[0];
                        int portW = (Integer) wc[1];
                        String userW = (String) wc[2];
                        String pemW = (String) wc[3];

                        String matchToken = (keyCore != null ? escapeShellForSingleQuotes(keyCore)
                                : escapeShellForSingleQuotes(publicKeyToDistribute));
                        String fullKeyQuoted = escapeShellForSingleQuotes(publicKeyToDistribute);
                        String appendWorker = "bash -lc \"mkdir -p $HOME/.ssh && chmod 700 $HOME/.ssh && touch $HOME/.ssh/authorized_keys && chmod 600 $HOME/.ssh/authorized_keys; "
                                + "if grep -Fq " + matchToken
                                + " $HOME/.ssh/authorized_keys; then echo EXIST; else printf '%s\\n' " + fullKeyQuoted
                                + " | tee -a $HOME/.ssh/authorized_keys >/dev/null; fi\"";
                        try {
                            sendMessage(session, String.format(
                                    "{\"type\":\"info\",\"message\":\"Phân phối key đến %s...\"}", hostW));

                            String execOut = null;
                            boolean executed = false;
                            if (pemW != null && !pemW.isBlank()) {
                                execOut = serverService.execCommandWithKey(hostW, portW, userW, pemW,
                                        appendWorker, 20000);
                                executed = (execOut != null);
                                sendMessage(session, String.format(
                                        "{\"type\":\"info\",\"message\":\"Đã cập nhật authorized_keys trên %s bằng SSH key (%s)\"}",
                                        hostW, (execOut != null && !execOut.isBlank()) ? "có output" : "không output"));
                            }
                            if (!executed) {
                                if (sudoPassword != null && !sudoPassword.isBlank()) {
                                    String pwOut = serverService.execCommand(hostW, portW, userW, sudoPassword,
                                            appendWorker, 22000);
                                    executed = (pwOut != null);
                                    sendMessage(session, String.format(
                                            "{\"type\":\"info\",\"message\":\"Fallback mật khẩu: cập nhật authorized_keys trên %s (%s)\"}",
                                            hostW, (pwOut != null && !pwOut.isBlank()) ? "có output" : "không output"));
                                } else {
                                    skipped++;
                                    sendMessage(session, String.format(
                                            "{\"type\":\"warning\",\"message\":\"Bỏ qua %s: WORKER không có SSH key trong CSDL và không có mật khẩu để kết nối lần đầu\"}",
                                            hostW));
                                    continue;
                                }
                            }

                            String verify;
                            String verifyCmd = "bash -lc \"if grep -Fq " + matchToken
                                    + " $HOME/.ssh/authorized_keys; then echo OK; else echo FAIL; fi\"";
                            if (pemW != null && !pemW.isBlank()) {
                                verify = serverService.execCommandWithKey(hostW, portW, userW, pemW, verifyCmd, 12000);
                            } else {
                                verify = serverService.execCommand(hostW, portW, userW, sudoPassword, verifyCmd, 12000);
                            }

                            if (verify != null && verify.contains("OK")) {
                                okCount++;
                                sendMessage(session, String.format(
                                        "{\\\"type\\\":\\\"success\\\",\\\"message\\\":\\\"✓ Đã phân phối và xác minh trên %s\\\"}",
                                        hostW));

                            } else {
                                failCount++;
                                sendMessage(session, String.format(
                                        "{\\\"type\\\":\\\"warning\\\",\\\"message\\\":\\\"⚠️ Phân phối xong nhưng không xác minh được trên %s (verify=%s)\\\"}",
                                        hostW, verify == null ? "null" : escapeJsonString(verify)));

                                // Extra diagnostics to show on UI
                                String diagCmd = "bash -lc \"echo USER=$(whoami); ls -ld $HOME/.ssh || echo NO_SSH_DIR; ls -l $HOME/.ssh/authorized_keys || echo NO_AUTH_KEYS; echo -n GREP_CORE=; grep -nF "
                                        + matchToken
                                        + " $HOME/.ssh/authorized_keys || echo NO_MATCH; echo --- AUTH_KEYS_HEAD ---; head -n 5 $HOME/.ssh/authorized_keys 2>/dev/null || true; echo --- AUTH_KEYS_TAIL ---; tail -n 5 $HOME/.ssh/authorized_keys 2>/dev/null || true\"";
                                try {
                                    String diagOut;
                                    if (pemW != null && !pemW.isBlank()) {
                                        diagOut = serverService.execCommandWithKey(hostW, portW, userW, pemW, diagCmd,
                                                12000);
                                    } else if (sudoPassword != null && !sudoPassword.isBlank()) {
                                        diagOut = serverService.execCommand(hostW, portW, userW, sudoPassword, diagCmd,
                                                12000);
                                    } else {
                                        diagOut = "(no creds available for diagnostics)";
                                    }
                                    if (diagOut == null)
                                        diagOut = "(no output)";
                                    sendMessage(session, String.format(
                                            "{\\\"type\\\":\\\"terminal_output\\\",\\\"server\\\":\\\"%s\\\",\\\"output\\\":\\\"%s\\\"}",
                                            hostW, escapeJsonString(diagOut)));
                                } catch (Exception ignored) {
                                }
                            }
                        } catch (Exception e) {
                            failCount++;
                            sendMessage(session, String.format(
                                    "{\"type\":\"error\",\"message\":\"Không thể phân phối key đến %s: %s\"}",
                                    hostW, escapeJsonString(e.getMessage())));
                        }
                    }
                    sendMessage(session, String.format(
                            "{\"type\":\"info\",\"message\":\"Tổng kết phân phối: %d OK, %d FAILED, %d SKIPPED\"}",
                            okCount, failCount, skipped));
                }

                sendMessage(session, String.format(
                        "{\"type\":\"complete\",\"message\":\"Hoàn tất tạo/đồng bộ và phân phối SSH key từ %s\"}",
                        target.getHost()));
            } catch (Exception e) {
                sendMessage(session,
                        String.format("{\"type\":\"error\",\"message\":\"%s\"}", escapeJsonString(e.getMessage())));
            }
        });
    }

    // Escape 1 dòng shell trích dẫn trong single-quotes để an toàn
    private String escapeShellForSingleQuotes(String s) {
        if (s == null)
            return "''";
        return "'" + s.replace("'", "'\\''") + "'";
    }

    private void streamInitPing(WebSocketSession session, Long clusterId, String host, String sudoPassword) {
        CompletableFuture.runAsync(() -> {
            try {
                var servers = serverService.findByClusterId(clusterId);
                com.example.AutoDeployApp.entity.Server target = pickTarget(servers, host, true);
                if (target == null) {
                    sendMessage(session, "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER trong cluster\"}");
                    return;
                }
                String pingCmd = "bash -lc 'ansible all -m ping -i /etc/ansible/hosts || true'";
                // Use sudoPassword as SSH password fallback (no sudo wrapping for this command)
                executeCommandWithTerminalOutput(session, target, pingCmd,
                        sudoPassword, 30000);
                sendMessage(session, String.format("{\"type\":\"complete\",\"message\":\"Ping hoàn tất trên %s\"}",
                        target.getHost()));
            } catch (Exception e) {
                sendMessage(session,
                        String.format("{\"type\":\"error\",\"message\":\"%s\"}", escapeJsonString(e.getMessage())));
            }
        });
    }

    private void streamReadAnsibleConfig(WebSocketSession session, Long clusterId, String host, String sudoPassword) {
        CompletableFuture.runAsync(() -> {
            try {
                var servers = serverService.findByClusterId(clusterId);
                com.example.AutoDeployApp.entity.Server target = pickTarget(servers, host, true);
                if (target == null) {
                    sendMessage(session, "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER trong cluster\"}");
                    return;
                }

                sendMessage(session, String.format(
                        "{\"type\":\"start\",\"message\":\"Đọc cấu hình Ansible từ %s...\"}", target.getHost()));

                // Prefer SSH key from DB to avoid missing-credential issues
                String pem = serverService.resolveServerPrivateKeyPem(target.getId());
                String cfg = "";
                String hosts = "";
                String vars = "";

                if (pem != null && !pem.isBlank()) {
                    // Sử dụng SSH key từ database
                    try {
                        cfg = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, "bash -lc 'cat /etc/ansible/ansible.cfg || true'", 8000);
                    } catch (Exception e) {
                        sendMessage(session,
                                String.format("{\"type\":\"warning\",\"message\":\"Không thể đọc ansible.cfg: %s\"}",
                                        escapeJsonString(e.getMessage())));
                    }

                    try {
                        hosts = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, "bash -lc 'cat /etc/ansible/hosts || true'", 8000);
                    } catch (Exception e) {
                        sendMessage(session,
                                String.format("{\"type\":\"warning\",\"message\":\"Không thể đọc hosts: %s\"}",
                                        escapeJsonString(e.getMessage())));
                    }

                    try {
                        vars = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, "bash -lc 'cat /etc/ansible/group_vars/all.yml || true'",
                                8000);
                    } catch (Exception e) {
                        sendMessage(session,
                                String.format(
                                        "{\"type\":\"warning\",\"message\":\"Không thể đọc group_vars/all.yml: %s\"}",
                                        escapeJsonString(e.getMessage())));
                    }
                } else {
                    // Fallback: sử dụng sudoPassword làm SSH password
                    try {
                        cfg = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, "bash -lc 'cat /etc/ansible/ansible.cfg || true'",
                                8000);
                    } catch (Exception e) {
                        sendMessage(session,
                                String.format("{\"type\":\"warning\",\"message\":\"Không thể đọc ansible.cfg: %s\"}",
                                        escapeJsonString(e.getMessage())));
                    }

                    try {
                        hosts = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, "bash -lc 'cat /etc/ansible/hosts || true'", 8000);
                    } catch (Exception e) {
                        sendMessage(session,
                                String.format("{\"type\":\"warning\",\"message\":\"Không thể đọc hosts: %s\"}",
                                        escapeJsonString(e.getMessage())));
                    }

                    try {
                        vars = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'cat /etc/ansible/group_vars/all.yml || true'", 8000);
                    } catch (Exception e) {
                        sendMessage(session,
                                String.format(
                                        "{\"type\":\"warning\",\"message\":\"Không thể đọc group_vars/all.yml: %s\"}",
                                        escapeJsonString(e.getMessage())));
                    }
                }

                // Trả về kết quả dưới dạng structured message
                java.util.Map<String, Object> payload = new java.util.HashMap<>();
                payload.put("type", "ansible_config");
                payload.put("server", target.getHost());
                payload.put("cfg", cfg != null ? cfg : "");
                payload.put("hosts", hosts != null ? hosts : "");
                payload.put("vars", vars != null ? vars : "");

                String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
                sendMessage(session, json);

                sendMessage(session, String.format(
                        "{\"type\":\"success\",\"message\":\"Đã đọc cấu hình Ansible từ %s\"}", target.getHost()));

            } catch (Exception e) {
                sendMessage(session,
                        String.format("{\"type\":\"error\",\"message\":\"%s\"}", escapeJsonString(e.getMessage())));
            }
        });
    }

    private void streamSaveAnsibleConfig(WebSocketSession session, Long clusterId, String host,
            String sudoPassword, String cfgContent, String hostsContent, String varsContent) {
        CompletableFuture.runAsync(() -> {
            try {
                var servers = serverService.findByClusterId(clusterId);
                com.example.AutoDeployApp.entity.Server target = pickTarget(servers, host, true);
                if (target == null) {
                    sendMessage(session, "{\"type\":\"error\",\"message\":\"Không tìm thấy MASTER trong cluster\"}");
                    return;
                }

                sendMessage(session, String.format(
                        "{\"type\":\"start\",\"message\":\"Ghi cấu hình Ansible trên %s...\"}", target.getHost()));

                // Prefer SSH key from DB
                String pem = serverService.resolveServerPrivateKeyPem(target.getId());
                boolean success = true;

                try {
                    // Ensure dirs
                    if (pem != null && !pem.isBlank()) {
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, "mkdir -p /etc/ansible /var/log/ansible", 10000);
                    } else {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, "mkdir -p /etc/ansible /var/log/ansible", 10000);
                    }

                    // Backups
                    if (pem != null && !pem.isBlank()) {
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem,
                                "bash -lc '[ -f /etc/ansible/ansible.cfg ] && cp -a /etc/ansible/ansible.cfg /etc/ansible/ansible.cfg.bak || true'",
                                10000);
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem,
                                "bash -lc '[ -f /etc/ansible/hosts ] && cp -a /etc/ansible/hosts /etc/ansible/hosts.bak || true'",
                                10000);
                    } else {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -f /etc/ansible/ansible.cfg ] && cp -a /etc/ansible/ansible.cfg /etc/ansible/ansible.cfg.bak || true'",
                                10000);
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -f /etc/ansible/hosts ] && cp -a /etc/ansible/hosts /etc/ansible/hosts.bak || true'",
                                10000);
                    }

                    // Write cfg
                    String cfgSafe = cfgContent == null ? "" : cfgContent;
                    String cmdCfg = "tee /etc/ansible/ansible.cfg > /dev/null <<'EOF'\n" + cfgSafe + "\nEOF";
                    if (pem != null && !pem.isBlank()) {
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, cmdCfg, 30000);
                    } else {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, cmdCfg, 30000);
                    }

                    // Write hosts
                    String hostsSafe = hostsContent == null ? "" : hostsContent;
                    String cmdHosts = "tee /etc/ansible/hosts > /dev/null <<'EOF'\n" + hostsSafe + "\nEOF";
                    if (pem != null && !pem.isBlank()) {
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, cmdHosts, 30000);
                    } else {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, cmdHosts, 30000);
                    }

                    // Write variables (group_vars/all.yml)
                    if (varsContent != null && !varsContent.trim().isEmpty()) {
                        String varsSafe = varsContent;
                        String cmdVars = "tee /etc/ansible/group_vars/all.yml > /dev/null <<'EOF'\n" + varsSafe
                                + "\nEOF";
                        if (pem != null && !pem.isBlank()) {
                            serverService.execCommandWithKey(target.getHost(),
                                    target.getPort() != null ? target.getPort() : 22,
                                    target.getUsername(), pem, cmdVars, 30000);
                        } else {
                            serverService.execCommand(target.getHost(),
                                    target.getPort() != null ? target.getPort() : 22,
                                    target.getUsername(), sudoPassword, cmdVars, 30000);
                        }
                    }

                    // Set permissions
                    if (pem != null && !pem.isBlank()) {
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, "chmod 644 /etc/ansible/ansible.cfg /etc/ansible/hosts",
                                8000);
                        if (varsContent != null && !varsContent.trim().isEmpty()) {
                            serverService.execCommandWithKey(target.getHost(),
                                    target.getPort() != null ? target.getPort() : 22,
                                    target.getUsername(), pem, "chmod 644 /etc/ansible/group_vars/all.yml", 8000);
                        }
                        serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, "chmod -R 755 /etc/ansible", 8000);
                    } else {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "chmod 644 /etc/ansible/ansible.cfg /etc/ansible/hosts", 8000);
                        if (varsContent != null && !varsContent.trim().isEmpty()) {
                            serverService.execCommand(target.getHost(),
                                    target.getPort() != null ? target.getPort() : 22,
                                    target.getUsername(), sudoPassword, "chmod 644 /etc/ansible/group_vars/all.yml",
                                    8000);
                        }
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, "chmod -R 755 /etc/ansible", 8000);
                    }

                    // Verify files exist
                    String verifyCfg = "";
                    String verifyHosts = "";
                    if (pem != null && !pem.isBlank()) {
                        verifyCfg = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem,
                                "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 8000);
                        verifyHosts = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem,
                                "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 8000);
                    } else {
                        verifyCfg = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 8000);
                        verifyHosts = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 8000);
                    }

                    if (verifyCfg == null || !verifyCfg.contains("OK") || verifyHosts == null
                            || !verifyHosts.contains("OK")) {
                        sendMessage(session, String.format(
                                "{\"type\":\"error\",\"message\":\"Không xác minh được tệp cấu hình trên %s\"}",
                                target.getHost()));
                        success = false;
                    }

                    // Validate inventory syntax
                    String invCheck = "";
                    if (pem != null && !pem.isBlank()) {
                        invCheck = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem,
                                "bash -lc 'ansible-inventory -i /etc/ansible/hosts --list >/dev/null 2>&1 && echo OK || echo FAIL'",
                                12000);
                    } else {
                        invCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'ansible-inventory -i /etc/ansible/hosts --list >/dev/null 2>&1 && echo OK || echo FAIL'",
                                12000);
                    }

                    if (invCheck == null || !invCheck.contains("OK")) {
                        sendMessage(session, String.format(
                                "{\"type\":\"warning\",\"message\":\"Cú pháp inventory có thể không hợp lệ trên %s\"}",
                                target.getHost()));
                    }

                    if (success) {
                        sendMessage(session, String.format(
                                "{\"type\":\"success\",\"message\":\"Đã lưu cấu hình Ansible trên %s\"}",
                                target.getHost()));
                    }

                } catch (Exception e) {
                    sendMessage(session, String.format(
                            "{\"type\":\"error\",\"message\":\"Lỗi khi lưu cấu hình: %s\"}",
                            escapeJsonString(e.getMessage())));
                    success = false;
                }

            } catch (Exception e) {
                sendMessage(session,
                        String.format("{\"type\":\"error\",\"message\":\"%s\"}", escapeJsonString(e.getMessage())));
            }
        });
    }

    private com.example.AutoDeployApp.entity.Server pickTarget(
            java.util.List<com.example.AutoDeployApp.entity.Server> servers, String host, boolean preferMaster) {
        if (servers == null || servers.isEmpty())
            return null;
        if (host != null && !host.isBlank()) {
            for (var s : servers) {
                if (host.equals(s.getHost()))
                    return s;
            }
        }
        if (preferMaster) {
            for (var s : servers) {
                if (s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                    return s;
            }
        }
        return servers.get(0);
    }

    private Long toLongSafe(Object o) {
        if (o == null)
            return null;
        if (o instanceof Number n)
            return n.longValue();
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (Exception ignored) {
            return null;
        }
    }

    /**
     * Cài đặt Ansible trên một server với real-time output
     */
    private String installAnsibleOnServerWithOutput(WebSocketSession session,
            com.example.AutoDeployApp.entity.Server server, String sudoPassword) throws Exception {
        String host = server.getHost();

        // Step 1: Update packages
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":1,\"message\":\"Cập nhật package manager...\"}", host));
        executeCommandWithTerminalOutput(session, server, "apt update -y", sudoPassword, 30000);

        // Step 2: Install Python
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":2,\"message\":\"Cài đặt Python và pip...\"}", host));
        executeCommandWithTerminalOutput(session, server, "apt install -y python3 python3-pip python3-venv",
                sudoPassword, 30000);

        // Step 3: Install Ansible
        sendMessage(session, String
                .format("{\"type\":\"step\",\"server\":\"%s\",\"step\":3,\"message\":\"Cài đặt Ansible...\"}", host));
        executeCommandWithTerminalOutput(session, server, "pip3 install ansible", sudoPassword, 60000);

        // Step 4: Verify installation
        sendMessage(session, String
                .format("{\"type\":\"step\",\"server\":\"%s\",\"step\":4,\"message\":\"Kiểm tra cài đặt...\"}", host));
        String checkResult = executeCommandWithTerminalOutput(session, server, "ansible --version", sudoPassword,
                10000);

        return "Ansible installed successfully: " + checkResult;
    }

    /**
     * Gỡ cài đặt Ansible trên một server với real-time output
     */
    private String uninstallAnsibleOnServerWithOutput(WebSocketSession session,
            com.example.AutoDeployApp.entity.Server server, String sudoPassword) throws Exception {
        String host = server.getHost();

        // Step 0: Kiểm tra hiện trạng cài đặt
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":0,\"message\":\"Kiểm tra hiện trạng Ansible...\"}",
                host));
        executeCommandWithTerminalOutput(session, server, "which -a ansible || true", sudoPassword, 8000);
        executeCommandWithTerminalOutput(session, server, "pip3 show ansible || true", sudoPassword, 8000);
        executeCommandWithTerminalOutput(session, server, "pip3 show ansible-core || true", sudoPassword, 8000);
        executeCommandWithTerminalOutput(session, server, "dpkg -s ansible || true", sudoPassword, 8000);
        executeCommandWithTerminalOutput(session, server, "dpkg -s ansible-core || true", sudoPassword, 8000);

        // Step 1: Gỡ bằng pip (bao quát các tên gói phổ biến)
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":1,\"message\":\"Gỡ Ansible bằng pip...\"}",
                host));
        executeCommandWithTerminalOutput(session, server,
                "pip3 uninstall -y ansible ansible-core ansible-base ansible-lint ansible-runner || true",
                sudoPassword, 120000);
        executeCommandWithTerminalOutput(session, server,
                "pip3 uninstall -y community.general community.kubernetes || true", sudoPassword, 60000);

        // Gỡ thêm các collections và modules khác
        executeCommandWithTerminalOutput(session, server,
                "pip3 uninstall -y ansible-collections-community ansible-collections-kubernetes || true",
                sudoPassword, 60000);
        executeCommandWithTerminalOutput(session, server,
                "pip3 uninstall -y ansible-runner-http ansible-runner-kubernetes || true",
                sudoPassword, 60000);

        // Step 2: Nếu cài qua apt thì gỡ thêm bằng apt
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":2,\"message\":\"Gỡ Ansible bằng apt (nếu có)...\"}",
                host));
        executeCommandWithTerminalOutput(session, server,
                "apt-get remove -y ansible ansible-core || true", sudoPassword, 60000);
        executeCommandWithTerminalOutput(session, server,
                "apt-get purge -y ansible ansible-core || true", sudoPassword, 60000);
        executeCommandWithTerminalOutput(session, server, "apt autoremove -y || true", sudoPassword, 60000);
        executeCommandWithTerminalOutput(session, server, "apt autoclean || true", sudoPassword, 60000);

        // Step 3: Dọn dẹp file/binary còn sót
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":3,\"message\":\"Dọn dẹp thư mục cấu hình/collections...\"}",
                host));
        executeCommandWithTerminalOutput(session, server,
                "rm -rf ~/.ansible ~/.local/bin/ansible ~/.local/bin/ansible-playbook /usr/bin/ansible /usr/bin/ansible-playbook /usr/local/bin/ansible /usr/local/bin/ansible-playbook /usr/share/ansible /etc/ansible",
                sudoPassword, 60000);
        executeCommandWithTerminalOutput(session, server,
                "bash -lc 'shopt -s nullglob; rm -rf /usr/local/lib/python3*/dist-packages/ansible* /usr/lib/python3*/dist-packages/ansible*'",
                sudoPassword, 30000);

        // Dọn dẹp thêm các thư mục collections và cache
        executeCommandWithTerminalOutput(session, server,
                "rm -rf ~/.ansible/collections ~/.ansible/cache ~/.ansible/tmp || true",
                sudoPassword, 30000);
        executeCommandWithTerminalOutput(session, server,
                "rm -rf /var/cache/ansible /tmp/ansible* || true",
                sudoPassword, 30000);

        // Dọn dẹp các file cấu hình Ansible
        executeCommandWithTerminalOutput(session, server,
                "rm -rf /etc/ansible/hosts /etc/ansible/ansible.cfg /etc/ansible/group_vars /etc/ansible/host_vars || true",
                sudoPassword, 30000);

        // Step 4: Kiểm tra lại bằng command -v
        sendMessage(session, String.format(
                "{\"type\":\"step\",\"server\":\"%s\",\"step\":4,\"message\":\"Kiểm tra sau khi gỡ...\"}",
                host));
        String pathCheck = executeCommandWithTerminalOutput(session, server,
                "bash -lc 'command -v ansible >/dev/null 2>&1 && { echo FOUND $(command -v ansible); } || echo NOT_FOUND'",
                sudoPassword, 10000);

        // Kiểm tra thêm các binary khác
        executeCommandWithTerminalOutput(session, server,
                "which ansible-playbook ansible-galaxy ansible-vault ansible-console || true",
                sudoPassword, 5000);

        // Kiểm tra pip packages còn lại
        executeCommandWithTerminalOutput(session, server,
                "pip3 list | grep -i ansible || echo 'No ansible packages found'",
                sudoPassword, 5000);

        // Kiểm tra dpkg packages còn lại
        executeCommandWithTerminalOutput(session, server,
                "dpkg -l | grep -i ansible || echo 'No ansible packages found'",
                sudoPassword, 5000);

        if (pathCheck != null && pathCheck.contains("FOUND ")) {
            return "Ansible vẫn còn trên hệ thống: " + pathCheck.trim();
        }
        return "Ansible uninstalled successfully (ansible không còn trong PATH)";
    }

    /**
     * Thực thi lệnh với terminal-like output
     */
    private String executeCommandWithTerminalOutput(WebSocketSession session,
            com.example.AutoDeployApp.entity.Server server,
            String command, String sudoPassword, int timeoutMs) throws Exception {
        String host = server.getHost();
        String username = server.getUsername();
        int port = server.getPort() != null ? server.getPort() : 22;

        // Tạo prompt giống terminal
        String prompt = String.format("%s@%s:~$ ", username, host);

        // Hiển thị prompt và command
        sendMessage(session,
                String.format("{\"type\":\"terminal_prompt\",\"server\":\"%s\",\"prompt\":\"%s\",\"command\":\"%s\"}",
                        host, prompt, command));

        // Tạo lệnh với sudo nếu cần
        String finalCommand = command;
        boolean isAnsibleInvocation = command.startsWith("bash -lc 'ansible ");
        boolean needsSudo = (command.startsWith("apt") || command.startsWith("pip") || command.startsWith("rm ")
                || command.startsWith("bash -lc 'shopt") || command.startsWith("apt-get")
                || command.startsWith("add-apt-repository") || command.startsWith("chmod ")
                || command.startsWith("cat > ") || command.startsWith("mkdir ")
                || command.startsWith("tee ") || command.contains(" /etc/ansible"));

        // Kiểm tra xem server có SSH key với sudo NOPASSWD không
        boolean hasSudoNopasswd = false;
        String pem = serverService.resolveServerPrivateKeyPem(server.getId());

        if (pem != null && !pem.isBlank()) {
            try {
                String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                String sudoCheckResult = serverService.execCommandWithKey(host, port, username, pem, checkSudoCmd,
                        5000);
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

        // Chỉ sử dụng sudo password nếu cần thiết và không có sudo NOPASSWD
        if (sudoPassword != null && !sudoPassword.trim().isEmpty()
                && !isAnsibleInvocation && needsSudo && !hasSudoNopasswd) {
            String escapedPassword = sudoPassword.replace("'", "'\"'\"'");
            String quotedOriginal = "'" + command.replace("'", "'\"'\"'") + "'";
            finalCommand = String.format("echo '%s' | sudo -S bash -lc %s", escapedPassword, quotedOriginal);

            // Hiển thị sudo password prompt
            sendMessage(session,
                    String.format(
                            "{\"type\":\"sudo_prompt\",\"server\":\"%s\",\"message\":\"[sudo] password for %s: \"}",
                            host, username));
        } else if (needsSudo && hasSudoNopasswd) {
            // Có sudo NOPASSWD, chỉ cần thêm sudo vào command
            finalCommand = "sudo " + command;
            sendMessage(session,
                    String.format(
                            "{\"type\":\"info\",\"server\":\"%s\",\"message\":\"Sử dụng sudo NOPASSWD cho %s\"}",
                            host, username));
        }

        // Thực thi lệnh và lấy output
        String output = "";
        // Không sử dụng sudoPassword như SSH password. Thử lấy password đăng nhập từ
        // cache nếu có (không khả dụng tại đây),
        // nếu không thì ưu tiên SSH key; nếu cả hai không có, báo lỗi rõ ràng.

        try {
            // Ưu tiên SSH key từ database; fallback dùng sudoPassword làm mật khẩu SSH
            if (pem != null && !pem.isBlank()) {
                output = serverService.execCommandWithKey(host, port, username, pem, finalCommand, timeoutMs);
            } else if (sudoPassword != null && !sudoPassword.isBlank()) {
                output = serverService.execCommand(host, port, username, sudoPassword, finalCommand, timeoutMs);
            } else {
                throw new RuntimeException("Không có SSH key hoặc mật khẩu SSH để kết nối tới " + host);
            }
        } catch (Exception e) {
            // Fallback password nếu key không truy cập được
            if (sudoPassword != null && !sudoPassword.isBlank()) {
                output = serverService.execCommand(host, port, username, sudoPassword, finalCommand, timeoutMs);
            } else {
                throw new RuntimeException("Không thể truy cập SSH key và không có mật khẩu SSH cho " + host);
            }
        }

        // Hiển thị output
        if (output != null && !output.trim().isEmpty()) {
            try {
                // Sử dụng Jackson để tạo JSON an toàn
                java.util.Map<String, Object> outputMessage = new java.util.HashMap<>();
                outputMessage.put("type", "terminal_output");
                outputMessage.put("server", host);
                outputMessage.put("output", output);

                String jsonMessage = new com.fasterxml.jackson.databind.ObjectMapper()
                        .writeValueAsString(outputMessage);
                sendMessage(session, jsonMessage);
            } catch (Exception e) {
                System.err.println("ERROR: Failed to create JSON for terminal output: " + e.getMessage());
                // Fallback to simple message
                sendMessage(session, String.format("{\"type\":\"terminal_output\",\"server\":\"%s\",\"output\":\"%s\"}",
                        host, escapeJsonString(output)));
            }
        }

        // Hiển thị prompt kết thúc
        sendMessage(session, String.format("{\"type\":\"terminal_prompt_end\",\"server\":\"%s\",\"prompt\":\"%s\"}",
                host, prompt));

        return output;
    }

    /**
     * Escape JSON string để hiển thị an toàn
     */
    private String escapeJsonString(String input) {
        if (input == null)
            return "";

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            switch (c) {
                case '\\':
                    sb.append("\\\\");
                    break;
                case '"':
                    sb.append("\\\"");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                case '\b':
                    sb.append("\\b");
                    break;
                case '\f':
                    sb.append("\\f");
                    break;
                default:
                    // Escape control characters (ASCII 0-31) except for already handled ones
                    if (c < 32) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                    break;
            }
        }
        return sb.toString();
    }

    private void sendMessage(WebSocketSession session, String message) {
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(message));
            }
        } catch (Exception e) {
            System.err.println("Lỗi gửi WebSocket message: " + e.getMessage());
        }
    }

    // JSON parser (tương tự như TerminalWebSocketHandler)
    private static Map<String, Object> parseJsonObject(String json) {
        java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
        if (json == null)
            return map;

        String s = json.trim();
        if (!s.startsWith("{") || !s.endsWith("}"))
            return map;

        s = s.substring(1, s.length() - 1).trim();
        if (s.isEmpty())
            return map;

        String[] parts = s.split(",");
        for (String part : parts) {
            int idx = part.indexOf(':');
            if (idx <= 0)
                continue;

            String k = part.substring(0, idx).trim();
            String v = part.substring(idx + 1).trim();

            if (k.startsWith("\"") && k.endsWith("\"")) {
                k = k.substring(1, k.length() - 1);
            }

            Object val;
            if (v.startsWith("\"") && v.endsWith("\"")) {
                val = v.substring(1, v.length() - 1);
            } else if (v.matches("-?\\d+")) {
                val = Long.parseLong(v);
            } else if ("true".equalsIgnoreCase(v) || "false".equalsIgnoreCase(v)) {
                val = Boolean.parseBoolean(v);
            } else if ("null".equalsIgnoreCase(v)) {
                val = null;
            } else {
                val = v;
            }

            map.put(k, val);
        }
        return map;
    }

}
