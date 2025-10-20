package com.example.AutoDeployApp.ws;

import com.example.AutoDeployApp.service.ServerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(TerminalWebSocketHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final ExecutorService executorService = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "terminal-ws-");
        t.setDaemon(true);
        return t;
    });

    private static class SshBinding {
        Session session;
        ChannelShell channel;
        OutputStream stdin;
        InputStream stdout;
        volatile boolean isActive = true;
    }

    private final Map<String, SshBinding> connectionMap = new ConcurrentHashMap<>();
    private final ServerService serverService;

    public TerminalWebSocketHandler(ServerService serverService) {
        this.serverService = serverService;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) throws Exception {
        logger.info("WebSocket connection established: {}", session.getId());
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession ws, @NonNull TextMessage message) throws Exception {
        String sid = ws.getId();
        SshBinding binding = connectionMap.get(sid);

        if (binding == null) {
            handleInitialConnection(ws, message);
        } else {
            handleTerminalInput(ws, binding, message);
        }
    }

    private void handleInitialConnection(WebSocketSession ws, TextMessage message) throws Exception {
        try {
            // Parse JSON configuration
            @SuppressWarnings("unchecked")
            Map<String, Object> cfg = objectMapper.readValue(message.getPayload(), Map.class);
            String host = getStringValue(cfg, "host");
            int port = getIntValue(cfg, "port", 22);
            String username = getStringValue(cfg, "username");
            String password = getStringValue(cfg, "password");
            String passwordB64 = getStringValue(cfg, "passwordB64");
            Long serverId = getLongValue(cfg, "serverId");

            // Decode base64 password if provided
            if (password == null && passwordB64 != null) {
                try {
                    password = new String(Base64.getDecoder().decode(passwordB64), StandardCharsets.UTF_8);
                } catch (IllegalArgumentException e) {
                    logger.warn("Failed to decode base64 password for session: {}", ws.getId());
                }
            }

            // Try to get password from session cache
            if ((password == null || password.isBlank()) && serverId != null) {
                password = getPasswordFromSessionCache(ws, serverId);
            }

            // Validate required parameters
            if (host == null || username == null) {
                sendErrorMessage(ws, "Missing host or username");
                return;
            }

            // Establish SSH connection
            SshBinding binding = establishSshConnection(ws, host, port, username, password, serverId);
            if (binding != null) {
                connectionMap.put(ws.getId(), binding);
                startOutputPump(ws, binding);
                sendSuccessMessage(ws, host, binding.session.getUserInfo() != null);
            }

        } catch (Exception e) {
            logger.error("Failed to establish SSH connection for session: {}", ws.getId(), e);
            sendErrorMessage(ws, "Connection failed: " + e.getMessage());
        }
    }

    private void handleTerminalInput(WebSocketSession ws, SshBinding binding, TextMessage message) {
        if (!binding.isActive || binding.stdin == null) {
            return;
        }

        try {
            String payload = message.getPayload();
            if (payload != null && !payload.isEmpty()) {
                binding.stdin.write(payload.getBytes(StandardCharsets.UTF_8));
                binding.stdin.flush();
            }
        } catch (IOException e) {
            logger.warn("Failed to send input to SSH channel for session: {}", ws.getId(), e);
            binding.isActive = false;
        }
    }

    private SshBinding establishSshConnection(WebSocketSession ws, String host, int port,
            String username, String password, Long serverId) {
        Session ssh = null;
        boolean connected = false;

        try {
            // Try SSH key authentication first
            if (serverId != null) {
                String pem = getServerPrivateKey(serverId);
                if (pem != null && !pem.isBlank()) {
                    ssh = createSshSessionWithKey(username, host, port, pem);
                    if (ssh != null && ssh.isConnected()) {
                        connected = true;
                    }
                }
            }

            // Fallback to password authentication
            if (!connected) {
                if (password == null || password.isBlank()) {
                    sendErrorMessage(ws, "Missing password and SSH key not available");
                    return null;
                }
                ssh = createSshSessionWithPassword(username, host, port, password);
                connected = ssh != null && ssh.isConnected();
            }

            if (!connected || ssh == null) {
                sendErrorMessage(ws, "SSH connection failed");
                return null;
            }

            // Create shell channel
            ChannelShell channel = (ChannelShell) ssh.openChannel("shell");
            channel.setPty(true);
            channel.connect(3000);

            SshBinding binding = new SshBinding();
            binding.session = ssh;
            binding.channel = channel;
            binding.stdin = channel.getOutputStream();
            binding.stdout = channel.getInputStream();

            return binding;

        } catch (Exception e) {
            logger.error("SSH connection error for {}@{}:{}", username, host, port, e);
            cleanupSshSession(ssh);
            sendErrorMessage(ws, "SSH connection failed: " + e.getMessage());
            return null;
        }
    }

    private Session createSshSessionWithKey(String username, String host, int port, String pem) {
        try {
            JSch jsch = new JSch();
            byte[] privateKey = pem.getBytes(StandardCharsets.UTF_8);
            jsch.addIdentity("inmem-key", privateKey, null, null);

            Session session = jsch.getSession(username, host, port);
            configureSshSession(session);
            session.connect(5000);
            return session;
        } catch (Exception e) {
            logger.warn("SSH key authentication failed for {}@{}", username, host, e);
            return null;
        }
    }

    private Session createSshSessionWithPassword(String username, String host, int port, String password) {
        try {
            JSch jsch = new JSch();
            Session session = jsch.getSession(username, host, port);
            configureSshSession(session);
            session.setPassword(password);
            session.connect(5000);
            return session;
        } catch (Exception e) {
            logger.error("SSH password authentication failed for {}@{}", username, host, e);
            throw new RuntimeException("SSH connection failed", e);
        }
    }

    private void configureSshSession(Session session) throws JSchException {
        // TODO: Implement proper host key verification for production
        // For now, keeping the original behavior but with better logging
        session.setConfig("StrictHostKeyChecking", "no");
        session.setConfig("UserKnownHostsFile", "/dev/null");

        // Add timeout configurations
        session.setConfig("ServerAliveInterval", "60");
        session.setConfig("ServerAliveCountMax", "3");
    }

    private void startOutputPump(WebSocketSession ws, SshBinding binding) {
        executorService.submit(() -> {
            byte[] buffer = new byte[4096];
            try {
                while (ws.isOpen() && binding.isActive && binding.channel.isConnected()) {
                    int bytesRead = binding.stdout.read(buffer);
                    if (bytesRead < 0) {
                        break;
                    }
                    if (bytesRead > 0) {
                        String output = new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);
                        ws.sendMessage(new TextMessage(output));
                    }
                }
            } catch (IOException e) {
                logger.warn("SSH output pump error for session: {}", ws.getId(), e);
            } finally {
                binding.isActive = false;
                cleanupSshBinding(binding);
                try {
                    if (ws.isOpen()) {
                        ws.close(CloseStatus.NORMAL);
                    }
                } catch (Exception e) {
                    logger.warn("Error closing WebSocket session: {}", ws.getId(), e);
                }
            }
        });
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) throws Exception {
        logger.info("WebSocket connection closed: {} with status: {}", session.getId(), status);
        SshBinding binding = connectionMap.remove(session.getId());
        if (binding != null) {
            binding.isActive = false;
            cleanupSshBinding(binding);
        }
    }

    private void cleanupSshBinding(SshBinding binding) {
        if (binding == null)
            return;

        try {
            if (binding.channel != null && binding.channel.isConnected()) {
                binding.channel.disconnect();
            }
        } catch (Exception e) {
            logger.debug("Error disconnecting SSH channel", e);
        }

        try {
            if (binding.session != null && binding.session.isConnected()) {
                binding.session.disconnect();
            }
        } catch (Exception e) {
            logger.debug("Error disconnecting SSH session", e);
        }

        try {
            if (binding.stdin != null) {
                binding.stdin.close();
            }
        } catch (Exception e) {
            logger.debug("Error closing SSH input stream", e);
        }

        try {
            if (binding.stdout != null) {
                binding.stdout.close();
            }
        } catch (Exception e) {
            logger.debug("Error closing SSH output stream", e);
        }
    }

    private void cleanupSshSession(Session session) {
        if (session != null && session.isConnected()) {
            try {
                session.disconnect();
            } catch (Exception e) {
                logger.debug("Error disconnecting SSH session", e);
            }
        }
    }

    // Helper methods for JSON parsing
    private String getStringValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value != null ? String.valueOf(value) : null;
    }

    private int getIntValue(Map<String, Object> map, String key, int defaultValue) {
        Object value = map.get(key);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        return defaultValue;
    }

    private Long getLongValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        return null;
    }

    private String getPasswordFromSessionCache(WebSocketSession ws, Long serverId) {
        Object pwAttr = ws.getAttributes().get("SERVER_PW_CACHE");
        if (pwAttr instanceof Map<?, ?> map) {
            for (var entry : map.entrySet()) {
                Long key = null;
                if (entry.getKey() instanceof Number n) {
                    key = n.longValue();
                } else if (entry.getKey() instanceof String sKey) {
                    try {
                        key = Long.parseLong(sKey);
                    } catch (NumberFormatException ignored) {
                        // Continue to next entry
                    }
                }
                if (key != null && key.equals(serverId) && entry.getValue() instanceof String password) {
                    return password;
                }
            }
        }
        return null;
    }

    private String getServerPrivateKey(Long serverId) {
        try {
            return serverService.resolveServerPrivateKeyPem(serverId);
        } catch (Exception e) {
            logger.warn("Failed to get server private key for serverId: {}", serverId, e);
            return null;
        }
    }

    private void sendErrorMessage(WebSocketSession ws, String message) {
        try {
            ws.sendMessage(new TextMessage("[server] " + message + "\n"));
            ws.close(CloseStatus.BAD_DATA);
        } catch (Exception e) {
            logger.warn("Failed to send error message to WebSocket", e);
        }
    }

    private void sendSuccessMessage(WebSocketSession ws, String host, boolean usedKey) {
        try {
            String authMethod = usedKey ? " (SSH key)" : " (password)";
            ws.sendMessage(new TextMessage("[server] SSH connected to " + host + authMethod + "\n"));
        } catch (Exception e) {
            logger.warn("Failed to send success message to WebSocket", e);
        }
    }

    // Shutdown hook for graceful cleanup
    public static void shutdown() {
        logger.info("Shutting down TerminalWebSocketHandler executor service");
        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(30, TimeUnit.SECONDS)) {
                executorService.shutdownNow();
            }
        } catch (InterruptedException e) {
            executorService.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}