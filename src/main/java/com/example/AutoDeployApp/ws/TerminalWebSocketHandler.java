package com.example.AutoDeployApp.ws;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.service.ServerService;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
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

public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private static class SshBinding {
        Session session;
        ChannelShell channel;
        Thread pumpThread;
        OutputStream stdin;
        InputStream stdout;
    }

    private final Map<String, SshBinding> connectionMap = new ConcurrentHashMap<>();
    private final ServerService serverService;

    public TerminalWebSocketHandler(ServerService serverService) {
        this.serverService = serverService;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) throws Exception {
        // wait for first JSON message to establish SSH; noop here
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession ws, @NonNull TextMessage message) throws Exception {
        String sid = ws.getId();
        SshBinding binding = connectionMap.get(sid);
        if (binding == null) {
            // Expect first message JSON config
            Map<String, Object> cfg = parseJsonObject(message.getPayload());
            String host = asString(cfg.get("host"));
            int port = cfg.get("port") instanceof Number ? ((Number) cfg.get("port")).intValue() : 22;
            String username = asString(cfg.get("username"));
            String password = asString(cfg.get("password"));
            String passwordB64 = asString(cfg.get("passwordB64"));
            Long serverId = null;
            try {
                serverId = cfg.get("serverId") instanceof Number ? ((Number) cfg.get("serverId")).longValue() : null;
            } catch (Exception ignored) {
            }
            if (password == null && passwordB64 != null) {
                try {
                    password = new String(Base64.getDecoder().decode(passwordB64), StandardCharsets.UTF_8);
                } catch (IllegalArgumentException ignored) {
                }
            }

            // If no password provided, try to resolve from HTTP session attributes
            // (propagated by HttpSessionHandshakeInterceptor)
            if ((password == null || password.isBlank()) && serverId != null) {
                Object pwAttr = ws.getAttributes().get("SERVER_PW_CACHE");
                if (pwAttr instanceof Map<?, ?> map) {
                    for (var e : map.entrySet()) {
                        Long key = null;
                        if (e.getKey() instanceof Number n)
                            key = n.longValue();
                        else if (e.getKey() instanceof String sKey) {
                            try {
                                key = Long.parseLong(sKey);
                            } catch (Exception ignored) {
                            }
                        }
                        if (key != null && key.equals(serverId) && e.getValue() instanceof String sv) {
                            password = sv;
                            break;
                        }
                    }
                }
            }

            if (host == null || username == null) {
                ws.sendMessage(new TextMessage("[server] Missing host/username.\n"));
                ws.close(CloseStatus.BAD_DATA);
                return;
            }

            // Prefer KEY first if server has one; fallback to password.
            Session ssh = null;
            boolean connected = false;
            boolean usedKey = false;
            try {
                if (serverId != null) {
                    String pem = null;
                    try {
                        pem = serverService.resolveServerPrivateKeyPem(serverId);
                    } catch (Exception ignored) {
                    }
                    if (pem != null && !pem.isBlank()) {
                        try {
                            JSch jsch = new JSch();
                            byte[] prv = pem.getBytes(StandardCharsets.UTF_8);
                            jsch.addIdentity("inmem-key", prv, null, null);
                            ssh = jsch.getSession(username, host, port);
                            ssh.setConfig("StrictHostKeyChecking", "no");
                            ssh.connect(5000);
                            connected = ssh.isConnected();
                            usedKey = connected;
                        } catch (Exception ignored) {
                            // key attempt failed; will fallback to password
                            if (ssh != null && ssh.isConnected())
                                try {
                                    ssh.disconnect();
                                } catch (Exception ignore) {
                                }
                            ssh = null;
                        }
                    }
                }

                if (!connected) {
                    if (password == null || password.isBlank()) {
                        ws.sendMessage(
                                new TextMessage("[server] Missing password and SSH key not available/failed.\n"));
                        ws.close(CloseStatus.BAD_DATA);
                        return;
                    }
                    JSch jsch = new JSch();
                    ssh = jsch.getSession(username, host, port);
                    ssh.setConfig("StrictHostKeyChecking", "no");
                    ssh.setPassword(password);
                    ssh.connect(5000);
                    connected = ssh.isConnected();
                }
            } catch (Exception ex) {
                try {
                    ws.sendMessage(
                            new TextMessage("[server] SSH connect failed: " + String.valueOf(ex.getMessage()) + "\n"));
                } catch (Exception ignored) {
                }
                try {
                    ws.close(CloseStatus.SERVER_ERROR);
                } catch (Exception ignored) {
                }
                if (ssh != null && ssh.isConnected())
                    try {
                        ssh.disconnect();
                    } catch (Exception ignored) {
                    }
                return;
            }

            ChannelShell channel = (ChannelShell) ssh.openChannel("shell");
            channel.setPty(true);
            InputStream stdout = channel.getInputStream();
            OutputStream stdin = channel.getOutputStream();
            channel.connect(3000);

            SshBinding b = new SshBinding();
            b.session = ssh;
            b.channel = channel;
            b.stdin = stdin;
            b.stdout = stdout;

            Thread pump = new Thread(() -> pumpStdout(ws, b), "ssh-pump-" + sid);
            b.pumpThread = pump;
            pump.setDaemon(true);
            pump.start();

            connectionMap.put(sid, b);
            ws.sendMessage(
                    new TextMessage("[server] SSH connected to " + host + (usedKey ? " (key)" : " (password)") + "\n"));
            return;
        }

        // Subsequent: forward input to shell
        String payload = message.getPayload();
        if (payload != null && !payload.isEmpty()) {
            binding.stdin.write(payload.getBytes(StandardCharsets.UTF_8));
            binding.stdin.flush();
        }
    }

    private void pumpStdout(WebSocketSession ws, SshBinding b) {
        byte[] buf = new byte[4096];
        try {
            while (ws.isOpen() && b.channel.isConnected()) {
                int n = b.stdout.read(buf);
                if (n < 0)
                    break;
                if (n > 0) {
                    String text = new String(buf, 0, n, StandardCharsets.UTF_8);
                    ws.sendMessage(new TextMessage(text));
                }
            }
        } catch (IOException ignored) {
        } finally {
            closeBinding(b);
            try {
                if (ws.isOpen())
                    ws.close(CloseStatus.NORMAL);
            } catch (Exception ignored2) {
            }
        }
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) throws Exception {
        SshBinding b = connectionMap.remove(session.getId());
        closeBinding(b);
    }

    private void closeBinding(SshBinding b) {
        if (b == null)
            return;
        try {
            if (b.channel != null && b.channel.isConnected())
                b.channel.disconnect();
        } catch (Exception ignored) {
        }
        try {
            if (b.session != null && b.session.isConnected())
                b.session.disconnect();
        } catch (Exception ignored) {
        }
        try {
            if (b.stdin != null)
                b.stdin.close();
        } catch (Exception ignored) {
        }
        try {
            if (b.stdout != null)
                b.stdout.close();
        } catch (Exception ignored) {
        }
    }

    private static String asString(Object o) {
        return (o == null) ? null : String.valueOf(o);
    }

    // Minimal JSON object parser (String keys, simple values) to avoid extra deps
    private static Map<String, Object> parseJsonObject(String json) {
        // Very small and permissive parser for simple client payloads. For production,
        // replace with Jackson.
        java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
        if (json == null)
            return map;
        String s = json.trim();
        if (!s.startsWith("{") || !s.endsWith("}"))
            return map;
        s = s.substring(1, s.length() - 1).trim();
        if (s.isEmpty())
            return map;
        int i = 0;
        boolean inStr = false;
        StringBuilder token = new StringBuilder();
        java.util.ArrayList<String> parts = new java.util.ArrayList<>();
        while (i < s.length()) {
            char c = s.charAt(i++);
            if (c == '"') {
                inStr = !inStr;
                token.append(c);
            } else if (c == ',' && !inStr) {
                parts.add(token.toString());
                token.setLength(0);
            } else
                token.append(c);
        }
        if (token.length() > 0)
            parts.add(token.toString());
        for (String kv : parts) {
            int idx = kv.indexOf(':');
            if (idx <= 0)
                continue;
            String k = kv.substring(0, idx).trim();
            String v = kv.substring(idx + 1).trim();
            if (k.startsWith("\"") && k.endsWith("\""))
                k = k.substring(1, k.length() - 1);
            Object val;
            if (v.startsWith("\"") && v.endsWith("\"")) {
                val = v.substring(1, v.length() - 1);
            } else if (v.matches("-?\\d+")) {
                val = Integer.parseInt(v);
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
