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

            // Bắt đầu cài đặt Ansible với real-time output
            startAnsibleInstallationWithOutput(session, clusterId, sudoPasswords, targetServer, isReinstall);
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
            Map<String, String> sudoPasswords, String targetServer, Boolean isReinstall) {
        CompletableFuture.runAsync(() -> {
            try {
                sendMessage(session, "{\"type\":\"start\",\"message\":\"Bắt đầu cài đặt Ansible...\"}");

                // Lấy danh sách servers
                var allClusterServers = serverService.findByClusterId(clusterId);
                java.util.List<com.example.AutoDeployApp.entity.Server> clusterServers;

                if (targetServer != null) {
                    // Cài đặt cho một server cụ thể
                    clusterServers = allClusterServers.stream()
                            .filter(s -> s.getHost().equals(targetServer))
                            .collect(java.util.stream.Collectors.toList());

                    if (clusterServers.isEmpty()) {
                        System.out.println("ERROR: No server found with host: " + targetServer);
                        sendMessage(session, String.format(
                                "{\"type\":\"error\",\"message\":\"Không tìm thấy server: %s\"}", targetServer));
                        return;
                    }

                    String action = isReinstall != null && isReinstall ? "cài đặt lại" : "cài đặt";
                    sendMessage(session,
                            String.format("{\"type\":\"info\",\"message\":\"Bắt đầu %s Ansible trên server: %s\"}",
                                    action, targetServer));
                } else {
                    // Cài đặt cho tất cả servers
                    clusterServers = allClusterServers;
                    sendMessage(session,
                            String.format("{\"type\":\"info\",\"message\":\"Tìm thấy %d servers trong cluster\"}",
                                    clusterServers.size()));
                }

                // Cài đặt trên từng server
                for (int i = 0; i < clusterServers.size(); i++) {
                    com.example.AutoDeployApp.entity.Server server = clusterServers.get(i);
                    String progress = String.format("(%d/%d)", i + 1, clusterServers.size());

                    sendMessage(session, String.format(
                            "{\"type\":\"server_start\",\"server\":\"%s\",\"progress\":\"%s\",\"message\":\"Bắt đầu cài đặt Ansible trên %s\"}",
                            server.getHost(), progress, server.getHost()));

                    try {
                        String sudoPassword = sudoPasswords.get(server.getHost());

                        String result = installAnsibleOnServerWithOutput(session, server, sudoPassword);

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
                }

                sendMessage(session,
                        "{\"type\":\"complete\",\"message\":\"🎉 Hoàn thành cài đặt Ansible trên tất cả servers!\"}");

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
        if (sudoPassword != null && !sudoPassword.trim().isEmpty()
                && (command.startsWith("apt") || command.startsWith("pip"))) {
            String escapedPassword = sudoPassword.replace("'", "'\"'\"'");
            finalCommand = String.format("echo '%s' | sudo -S %s", escapedPassword, command);

            // Hiển thị sudo password prompt
            sendMessage(session,
                    String.format(
                            "{\"type\":\"sudo_prompt\",\"server\":\"%s\",\"message\":\"[sudo] password for %s: \"}",
                            host, username));
        }

        // Thực thi lệnh và lấy output
        String output = "";
        boolean usePasswordAuth = false;

        // Kiểm tra xem có nên dùng password authentication không
        if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
            usePasswordAuth = true;
        }

        try {
            if (usePasswordAuth) {
                // Dùng password authentication trực tiếp
                output = serverService.execCommand(host, port, username, sudoPassword, finalCommand, timeoutMs);
            } else {
                // Thử SSH key trước
                if (server.getSshKey() != null && server.getSshKey().getEncryptedPrivateKey() != null) {
                    output = serverService.execCommandWithKey(host, port, username,
                            server.getSshKey().getEncryptedPrivateKey(), finalCommand, timeoutMs);
                } else {
                    throw new RuntimeException("No SSH key available and no password provided for " + host);
                }
            }
        } catch (org.hibernate.LazyInitializationException e) {
            // Fallback to password authentication khi SSH key không accessible
            if (sudoPassword != null && !sudoPassword.trim().isEmpty()) {
                output = serverService.execCommand(host, port, username, sudoPassword, finalCommand, timeoutMs);
            } else {
                throw new RuntimeException("No SSH key accessible and no password available for " + host);
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
