package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.repository.ServerRepository;
import com.example.AutoDeployApp.repository.ClusterRepository;
import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.entity.SshKey;
import com.example.AutoDeployApp.repository.SshKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.KeyPair;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;

@Service
public class ServerService {

    private final ServerRepository serverRepository;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final ClusterRepository clusterRepository;
    private final SshKeyRepository sshKeyRepository;

    public ServerService(ServerRepository serverRepository, ClusterRepository clusterRepository,
            SshKeyRepository sshKeyRepository) {
        this.serverRepository = serverRepository;
        this.clusterRepository = clusterRepository;
        this.sshKeyRepository = sshKeyRepository;
    }

    public List<Server> findAll() {
        return serverRepository.findAllWithCluster();
    }

    public List<Server> findAllForUser(Long userId) {
        if (userId == null)
            return List.of();
        return serverRepository.findByAddedByWithCluster(userId);
    }

    public List<Server> findByClusterId(Long clusterId) {
        if (clusterId == null)
            return List.of();
        return serverRepository.findByCluster_Id(clusterId);
    }

    public Server findById(Long id) {
        return serverRepository.findById(id).orElseThrow();
    }

    @Transactional(readOnly = true)
    public String resolveServerPrivateKeyPem(Long serverId) {
        return serverRepository.findByIdWithSshKey(serverId)
                .map(s -> (s.getSshKey() != null ? s.getSshKey().getEncryptedPrivateKey() : null))
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public String resolveServerPublicKey(Long serverId) {
        return serverRepository.findByIdWithSshKey(serverId)
                .map(s -> (s.getSshKey() != null ? s.getSshKey().getPublicKey() : null))
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public SshKey resolveServerSshKey(Long serverId) {
        return serverRepository.findByIdWithSshKey(serverId)
                .map(Server::getSshKey)
                .orElse(null);
    }

    @Transactional
    public Server create(String host, Integer port, String username, String rawPassword, Server.ServerRole role,
            Long addedBy, Long clusterId, Server.AuthType authType, Long sshKeyId) {
        int resolvedPort = (port != null ? port : 22);
        boolean canSsh = false;
        if (authType == null || authType == Server.AuthType.PASSWORD) {
            canSsh = testSsh(host, resolvedPort, username, rawPassword, 5000);
            if (!canSsh) {
                throw new IllegalArgumentException(
                        "Không thể kết nối tới server, vui lòng kiểm tra host/port/username/password");
            }
        } else {
            // KEY mode: tạm thời bỏ qua kiểm tra SSH do chưa giải mã private key trên
            // server
            canSsh = false;
        }
        // Reject if duplicate (host, port, username) already exists globally
        if (serverRepository.existsByHostAndPortAndUsername(host, resolvedPort, username)) {
            throw new IllegalArgumentException(
                    "Máy chủ đã tồn tại trong hệ thống. Vui lòng sử dụng máy chủ khác hoặc liên hệ admin để được hỗ trợ.");
        }
        Server s = new Server();
        s.setHost(host);
        s.setPort(resolvedPort);
        s.setUsername(username);
        if (rawPassword != null && !rawPassword.isBlank()) {
            s.setPassword(passwordEncoder.encode(rawPassword));
        }
        if (authType != null)
            s.setAuthType(authType);
        if (sshKeyId != null) {
            SshKey key = sshKeyRepository.findById(sshKeyId).orElse(null);
            s.setSshKey(key);
        }
        if (role != null)
            s.setRole(role);
        if (addedBy != null)
            s.setAddedBy(addedBy);
        if (clusterId != null) {
            Cluster c = clusterRepository.findById(clusterId).orElse(null);
            // Nếu không tìm thấy cluster, để null (bỏ qua)
            if (c != null) {
                s.setCluster(c);
            } else {
                s.setCluster(null);
            }
        }
        if (authType == Server.AuthType.PASSWORD) {
            s.setStatus(Server.ServerStatus.ONLINE);
            s.setLastConnected(new java.sql.Timestamp(System.currentTimeMillis()));
        } else {
            s.setStatus(Server.ServerStatus.OFFLINE);
        }
        // Save first to get ID
        s = serverRepository.saveAndFlush(s);

        // Auto-generate SSH key on first successful password login (no key selected)
        if (authType == Server.AuthType.PASSWORD && (s.getSshKey() == null)) {
            try {
                SshKey created = generateAndInstallSshKey(host, resolvedPort, username, rawPassword);
                if (created != null) {
                    created.setServer(s);
                    created = sshKeyRepository.saveAndFlush(created);
                    s.setSshKey(created);
                    s.setAuthType(Server.AuthType.KEY);
                    s = serverRepository.saveAndFlush(s);
                }
            } catch (Exception ignored) {
                // Ignore key setup failure; password flow still works
            }
        }
        return s;
    }

    @Transactional
    public Server update(Long id, String host, Integer port, String username, String rawPassword,
            Server.ServerRole role, Server.ServerStatus status, Long clusterId, Server.AuthType authType,
            Long sshKeyId) {
        Server s = serverRepository.findById(id).orElseThrow();
        Long addedBy = s.getAddedBy();
        if (host != null && !host.isBlank() && port != null && username != null && !username.isBlank()) {
            // Check if another server (different ID) already uses this host/port/username
            boolean dup = serverRepository.existsByHostAndPortAndUsernameAndAddedByAndIdNot(host, port, username,
                    addedBy, id);
            if (dup) {
                throw new IllegalArgumentException("Máy chủ đã tồn tại (host/port/username trùng)");
            }

            // Also check global uniqueness (across all users)
            Optional<Server> existingServer = serverRepository.findByHostAndUsername(host, username);
            if (existingServer.isPresent() && !existingServer.get().getId().equals(id)) {
                throw new IllegalArgumentException(
                        "Máy chủ đã tồn tại trong hệ thống. Vui lòng sử dụng máy chủ khác hoặc liên hệ admin để được hỗ trợ.");
            }
        }
        // Build effective connection params (new values or existing)
        String effHost = (host != null && !host.isBlank()) ? host : s.getHost();
        Integer effPort = (port != null) ? port : (s.getPort() != null ? s.getPort() : 22);
        String effUser = (username != null && !username.isBlank()) ? username : s.getUsername();
        // Chỉ xác thực SSH nếu có thay đổi thông số kết nối hoặc có cung cấp mật khẩu
        // mới
        boolean connectionFieldChanged = (host != null && !host.isBlank()) || (port != null)
                || (username != null && !username.isBlank());
        boolean suppliedNewPassword = rawPassword != null && !rawPassword.isBlank();

        boolean keyWorked = false;
        boolean usedPassword = false;
        if (connectionFieldChanged || suppliedNewPassword) {
            // Prefer KEY trước nếu đã có key
            if (s.getSshKey() != null && s.getSshKey().getEncryptedPrivateKey() != null
                    && !s.getSshKey().getEncryptedPrivateKey().isBlank()) {
                String pem = s.getSshKey().getEncryptedPrivateKey();
                keyWorked = testSshWithKey(effHost, effPort, effUser, pem, 5000);
            }
            if (!keyWorked) {
                if (rawPassword == null || rawPassword.isBlank()) {
                    throw new IllegalArgumentException(
                            "SSH key không kết nối được. Vui lòng nhập mật khẩu để xác thực");
                }
                boolean ok = testSsh(effHost, effPort, effUser, rawPassword, 5000);
                if (!ok) {
                    throw new IllegalArgumentException(
                            "Không thể kết nối SSH bằng mật khẩu, vui lòng kiểm tra thông tin đăng nhập");
                }
                usedPassword = true;
            }
        }

        // Apply updates only after successful SSH
        if (host != null && !host.isBlank())
            s.setHost(host);
        if (port != null)
            s.setPort(port);
        if (username != null && !username.isBlank())
            s.setUsername(username);
        if (usedPassword && rawPassword != null && !rawPassword.isBlank())
            s.setPassword(passwordEncoder.encode(rawPassword));
        if (keyWorked) {
            s.setAuthType(Server.AuthType.KEY);
        } else if (usedPassword) {
            s.setAuthType(Server.AuthType.PASSWORD);
        } else if (authType != null) {
            s.setAuthType(authType);
        }
        if (sshKeyId != null) {
            if (sshKeyId >= 0) {
                SshKey key = sshKeyRepository.findById(sshKeyId).orElse(null);
                s.setSshKey(key);
            } else {
                s.setSshKey(null);
            }
        }
        if (role != null)
            s.setRole(role);
        // Xử lý clusterId: null để clear cluster, hoặc giá trị cụ thể để gán cluster
        System.out.println("DEBUG: Processing clusterId=" + clusterId + " for server " + s.getId());
        if (clusterId != null) {
            if (clusterId >= 0) {
                // Nếu không tìm thấy cluster, coi như null (xoá liên kết)
                Cluster c = clusterRepository.findById(clusterId).orElse(null);
                s.setCluster(c);
                System.out.println(
                        "DEBUG: Set cluster to " + (c != null ? c.getId() : "null") + " for server " + s.getId());
            } else {
                // sentinel (<0) means clear cluster assignment
                s.setCluster(null);
                System.out.println("DEBUG: Cleared cluster (sentinel) for server " + s.getId());
            }
        } else {
            // clusterId = null từ request body means clear cluster assignment
            s.setCluster(null);
            System.out.println("DEBUG: Cleared cluster (null) for server " + s.getId());
        }
        // Cập nhật trạng thái: nếu vừa xác thực (do có thay đổi kết nối hoặc có mật
        // khẩu mới)
        if (connectionFieldChanged || suppliedNewPassword || keyWorked || usedPassword) {
            s.setStatus(Server.ServerStatus.ONLINE);
            s.setLastConnected(new java.sql.Timestamp(System.currentTimeMillis()));
        } else if (status != null) {
            s.setStatus(status);
        }
        return serverRepository.saveAndFlush(s);
    }

    @Transactional
    public void delete(Long id) {
        serverRepository.findById(id).ifPresent(s -> {
            // 1) Xoá tất cả khoá SSH gắn qua ssh_keys.server_id
            try {
                java.util.List<SshKey> keys = sshKeyRepository.findByServer_Id(id);
                if (keys != null && !keys.isEmpty()) {
                    sshKeyRepository.deleteAll(keys);
                }
            } catch (Exception ignored) {
            }

            // 2) Xoá khoá đang được tham chiếu bởi servers.ssh_key_id (nếu còn)
            if (s.getSshKey() != null && s.getSshKey().getId() != null) {
                try {
                    Long keyId = s.getSshKey().getId();
                    s.setSshKey(null);
                    // cắt liên kết cluster để tránh FK
                    s.setCluster(null);
                    serverRepository.saveAndFlush(s);
                    sshKeyRepository.deleteById(keyId);
                } catch (Exception ignored) {
                }
            } else {
                // đảm bảo cắt liên kết cluster để tránh FK
                try {
                    s.setCluster(null);
                    serverRepository.saveAndFlush(s);
                } catch (Exception ignored) {
                }
            }
        });

        // 3) Xoá server
        serverRepository.deleteById(id);
    }

    public boolean testSsh(String host, int port, String username, String rawPassword, int timeoutMs) {
        try {
            JSch jsch = new JSch();
            Session session = jsch.getSession(username, host, port);
            session.setConfig("StrictHostKeyChecking", "no");
            session.setPassword(rawPassword);
            session.connect(timeoutMs);
            boolean connected = session.isConnected();
            session.disconnect();
            return connected;

        } catch (Exception e) {
            return false;
        }
    }

    public String execCommand(String host, int port, String username, String rawPassword, String command,
            int timeoutMs) {
        Session session = null;
        com.jcraft.jsch.ChannelExec channel = null;
        try {
            JSch jsch = new JSch();
            session = jsch.getSession(username, host, port);
            session.setConfig("StrictHostKeyChecking", "no");
            session.setPassword(rawPassword);
            session.setTimeout(timeoutMs);
            session.connect(timeoutMs);
            channel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            java.io.InputStream in = channel.getInputStream();
            channel.connect(timeoutMs);

            long deadline = System.currentTimeMillis() + timeoutMs;
            java.io.ByteArrayOutputStream outBuf = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            while (true) {
                while (in.available() > 0) {
                    int read = in.read(buffer, 0, buffer.length);
                    if (read < 0)
                        break;
                    outBuf.write(buffer, 0, read);
                }
                if (channel.isClosed())
                    break;
                if (System.currentTimeMillis() > deadline) {
                    // hard timeout
                    break;
                }
                try {
                    Thread.sleep(50);
                } catch (InterruptedException ignored) {
                }
            }
            String out = outBuf.toString(java.nio.charset.StandardCharsets.UTF_8).trim();
            return out;
        } catch (Exception e) {
            return null;
        } finally {
            try {
                if (channel != null && channel.isConnected())
                    channel.disconnect();
            } catch (Exception ignored) {
            }
            try {
                if (session != null && session.isConnected())
                    session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    public String execCommandWithKey(String host, int port, String username, String privateKeyPem, String command,
            int timeoutMs) {
        Session session = null;
        com.jcraft.jsch.ChannelExec channel = null;
        try {
            JSch jsch = new JSch();
            // Load key from PEM string
            byte[] prv = privateKeyPem.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            jsch.addIdentity("inmem-key", prv, null, null);
            session = jsch.getSession(username, host, port);
            session.setConfig("StrictHostKeyChecking", "no");
            session.setTimeout(timeoutMs);
            session.connect(timeoutMs);
            channel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            java.io.InputStream in = channel.getInputStream();
            channel.connect(timeoutMs);

            long deadline = System.currentTimeMillis() + timeoutMs;
            java.io.ByteArrayOutputStream outBuf = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            while (true) {
                while (in.available() > 0) {
                    int read = in.read(buffer, 0, buffer.length);
                    if (read < 0)
                        break;
                    outBuf.write(buffer, 0, read);
                }
                if (channel.isClosed())
                    break;
                if (System.currentTimeMillis() > deadline) {
                    // hard timeout
                    break;
                }
                try {
                    Thread.sleep(50);
                } catch (InterruptedException ignored) {
                }
            }
            String out = outBuf.toString(java.nio.charset.StandardCharsets.UTF_8).trim();
            return out;
        } catch (Exception e) {
            return null;
        } finally {
            try {
                if (channel != null)
                    channel.disconnect();
            } catch (Exception ignored) {
            }
            try {
                if (session != null)
                    session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    @Transactional
    public String enableSshdPublicKey(Long serverId, String sudoPassword, int timeoutMs) {
        Server s = serverRepository.findById(serverId).orElseThrow();
        String host = s.getHost();
        int port = s.getPort() != null ? s.getPort() : 22;
        String username = s.getUsername();
        if (sudoPassword == null || sudoPassword.isBlank()) {
            throw new IllegalArgumentException("Thiếu mật khẩu sudo để bật PublicKey trên máy đích");
        }
        String safePw = sudoPassword.replace("'", "'\"'\"'");
        String cmd = "sh -lc \""
                + "printf '%s\\n' '" + safePw
                + "' | sudo -S sed -i -E 's/^#?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config && "
                + "printf '%s\\n' '" + safePw
                + "' | sudo -S sed -i -E 's/^#?AuthorizedKeysFile.*/AuthorizedKeysFile .ssh\\/authorized_keys/' /etc/ssh/sshd_config && "
                + "( (command -v systemctl >/dev/null 2>&1 && ("
                + " printf '%s\\n' '" + safePw + "' | sudo -S systemctl reload sshd ||"
                + " printf '%s\\n' '" + safePw + "' | sudo -S systemctl restart sshd ||"
                + " printf '%s\\n' '" + safePw + "' | sudo -S systemctl restart ssh )) || ("
                + " printf '%s\\n' '" + safePw + "' | sudo -S service ssh reload ||"
                + " printf '%s\\n' '" + safePw + "' | sudo -S service ssh restart ) )"
                + "\"";
        String out = execCommand(host, port, username, sudoPassword, cmd, timeoutMs);
        if (out == null)
            out = "";
        return out;
    }

    public boolean testSshWithKey(String host, int port, String username, String privateKeyPem, int timeoutMs) {
        Session session = null;
        try {
            JSch jsch = new JSch();
            // Load key from PEM string via in-memory temporary file approach
            // JSch supports in-memory identity with byte[] using addIdentity(name, prvkey,
            // pubkey, passphrase)
            byte[] prv = privateKeyPem.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            jsch.addIdentity("inmem-key", prv, null, null);
            session = jsch.getSession(username, host, port);
            session.setConfig("StrictHostKeyChecking", "no");
            session.connect(timeoutMs);
            boolean ok = session.isConnected();
            return ok;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                if (session != null && session.isConnected())
                    session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    public boolean tryConnectPreferKey(Server s, String fallbackPassword, int timeoutMs) {
        int port = s.getPort() != null ? s.getPort() : 22;
        // 1) Try key if exists
        if (s.getSshKey() != null && s.getSshKey().getEncryptedPrivateKey() != null
                && !s.getSshKey().getEncryptedPrivateKey().isBlank()) {
            String pem = s.getSshKey().getEncryptedPrivateKey(); // currently stored plaintext PEM
            if (testSshWithKey(s.getHost(), port, s.getUsername(), pem, timeoutMs)) {
                return true;
            }
        }
        // 2) Fallback to password if provided
        if (fallbackPassword != null && !fallbackPassword.isBlank()) {
            return testSsh(s.getHost(), port, s.getUsername(), fallbackPassword, timeoutMs);
        }
        return false;
    }

    @Transactional
    public List<Server> checkAllStatuses(int timeoutMs) {
        List<Server> servers = serverRepository.findAll();
        final int POOL_SIZE = Math.min(servers.size(), 16);

        ExecutorService executor = Executors.newFixedThreadPool(POOL_SIZE);
        long start = System.currentTimeMillis();
        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (Server s : servers) {
            futures.add(CompletableFuture.runAsync(() -> {
                boolean online = false;
                try (Socket socket = new Socket()) {
                    InetSocketAddress addr = new InetSocketAddress(
                            s.getHost(), s.getPort() != null ? s.getPort() : 22);
                    socket.connect(addr, timeoutMs);
                    online = true;
                } catch (Exception ignored) {
                } finally {
                    s.setStatus(online ? Server.ServerStatus.ONLINE : Server.ServerStatus.OFFLINE);
                }
            }, executor));
        }
        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        executor.shutdown();
        try {
            executor.awaitTermination(2, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }

        serverRepository.saveAll(servers);

        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[checkAllStatuses] Checked %d servers in %d ms%n", servers.size(), elapsed);

        return servers;
    }

    @Transactional
    public Server reconnect(Long id, String rawPassword) {
        Server s = serverRepository.findById(id).orElseThrow();
        boolean canSsh = testSsh(s.getHost(), s.getPort() != null ? s.getPort() : 22, s.getUsername(), rawPassword,
                5000);
        if (!canSsh) {
            throw new IllegalArgumentException("Không thể kết nối SSH tới server, vui lòng kiểm tra mật khẩu");
        }
        s.setPassword(passwordEncoder.encode(rawPassword));
        s.setStatus(Server.ServerStatus.ONLINE);
        s.setLastConnected(new java.sql.Timestamp(System.currentTimeMillis()));
        s = serverRepository.saveAndFlush(s);
        if (s.getSshKey() == null) {
            try {
                SshKey created = generateAndInstallSshKey(s.getHost(), s.getPort() != null ? s.getPort() : 22,
                        s.getUsername(), rawPassword);
                if (created != null) {
                    created.setServer(s);
                    created = sshKeyRepository.saveAndFlush(created);
                    s.setSshKey(created);
                    s.setAuthType(Server.AuthType.KEY);
                    s = serverRepository.saveAndFlush(s);
                }
            } catch (Exception ignored) {
            }
        }
        return s;
    }

    private SshKey generateAndInstallSshKey(String host, int port, String username, String rawPassword)
            throws Exception {
        JSch jsch = new JSch();
        // 1) Generate RSA 2048 key
        KeyPair kpair = KeyPair.genKeyPair(jsch, KeyPair.RSA, 2048);
        String comment = username + "@" + host;
        ByteArrayOutputStream pubOut = new ByteArrayOutputStream();
        kpair.writePublicKey(pubOut, comment);
        String publicKey = pubOut.toString(StandardCharsets.UTF_8);
        ByteArrayOutputStream prvOut = new ByteArrayOutputStream();
        kpair.writePrivateKey(prvOut);
        String privateKeyPem = prvOut.toString(StandardCharsets.UTF_8);
        kpair.dispose();

        // 2) Install public key into ~/.ssh/authorized_keys
        Session session = jsch.getSession(username, host, port);
        session.setConfig("StrictHostKeyChecking", "no");
        session.setPassword(rawPassword);
        session.connect(5000);
        try {
            String escaped = publicKey.replace("'", "'\"'\"'");
            String cmd = "sh -lc \"mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && printf '%s\\n' '"
                    + escaped + "' >> ~/.ssh/authorized_keys\"";
            com.jcraft.jsch.ChannelExec ch = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
            ch.setCommand(cmd);
            ch.connect(5000);
            while (!ch.isClosed()) {
                try {
                    Thread.sleep(50);
                } catch (InterruptedException ignored) {
                }
            }
            ch.disconnect();

            // 3) Cấu hình sudo NOPASSWD cho user
            configureSudoNopasswd(session, username, rawPassword);

        } finally {
            session.disconnect();
        }

        // 4) Persist key metadata
        SshKey entity = new SshKey();
        entity.setKeyType(SshKey.KeyType.RSA);
        entity.setKeyLength(2048);
        entity.setPublicKey(publicKey);
        entity.setEncryptedPrivateKey(privateKeyPem);
        entity.setAesSalt(null);
        entity.setStatus(SshKey.KeyStatus.ACTIVE);
        return entity;
    }

    private void configureSudoNopasswd(Session session, String username, String sudoPassword) {
        try {
            System.out.println("================================================");
            System.out.println("[SUDO NOPASSWD] Cau hinh cho user: " + username);

            // 1. Ghi de file sudoers
            System.out.println("[ACTION] Ghi de file sudoers...");
            String sudoersEntry = username + " ALL=(ALL) NOPASSWD:ALL";
            System.out.println("[ENTRY] Noi dung: " + sudoersEntry);

            String writeCmd = String.join(" && ",
                    "echo '" + sudoPassword + "' | sudo -S sh -c 'echo \"" + sudoersEntry + "\" > /etc/sudoers.d/"
                            + username + "'",
                    "echo '" + sudoPassword + "' | sudo -S chmod 440 /etc/sudoers.d/" + username,
                    "echo '" + sudoPassword + "' | sudo -S chown root:root /etc/sudoers.d/" + username);

            System.out.println("[WAIT] Dang ghi file sudoers...");
            execSimple(session, writeCmd, 5000);
            System.out.println("[WRITE] Da ghi file sudoers");

            // 2. Dam bao #includedir ton tai
            System.out.println("[CHECK] Dam bao #includedir /etc/sudoers.d ton tai...");
            String ensureIncludeDir = String.join(" && ",
                    "grep -q '^#includedir /etc/sudoers.d' /etc/sudoers || " +
                            "echo '" + sudoPassword
                            + "' | sudo -S sed -i 's/^@includedir/#includedir/' /etc/sudoers || " +
                            "echo '" + sudoPassword
                            + "' | sudo -S sh -c 'echo \"#includedir /etc/sudoers.d\" >> /etc/sudoers'");
            execSimple(session, ensureIncludeDir, 3000);
            System.out.println("[INCLUDEDIR] Da dam bao #includedir ton tai");

            // 3. Kiem tra cu phap
            System.out.println("[CHECK] Kiem tra cu phap file sudoers...");
            String syntaxCmd = "echo '" + sudoPassword + "' | sudo -S visudo -cf /etc/sudoers.d/" + username
                    + " >/dev/null 2>&1 && echo SYNTAX_OK || echo SYNTAX_ERROR";
            String syntaxResult = execSimple(session, syntaxCmd, 3000).trim();
            System.out.println("[SYNTAX] Ket qua: " + syntaxResult);

            // 4. Reload cau hinh sudo
            System.out.println("[RELOAD] Reload cau hinh sudo...");
            String reloadCmd = "echo '" + sudoPassword
                    + "' | sudo -S visudo -cf /etc/sudoers >/dev/null 2>&1 && echo RELOAD_OK || echo RELOAD_FAIL";
            String reloadResult = execSimple(session, reloadCmd, 3000).trim();
            System.out.println("[RELOAD] Ket qua: " + reloadResult);

            // 5. Kiem tra thuc te
            System.out.println("[VERIFY] Kiem tra quyen sudo NOPASSWD...");
            String verifyCmd = "sudo -n true && echo 'NOPASSWD_ACTIVE' || echo 'FAIL'";
            String verifyResult = execSimple(session, verifyCmd, 3000).trim();
            System.out.println("[VERIFY] Ket qua: " + verifyResult);

            // Debug: Kiem tra file sudoers co ton tai khong
            String debugCmd = "ls -la /etc/sudoers.d/" + username + " && cat /etc/sudoers.d/" + username;
            String debugResult = execSimple(session, debugCmd, 3000);
            System.out.println("[DEBUG] File sudoers: " + debugResult);

            // Debug: Kiem tra quyen sudo hien tai
            String sudoCheckCmd = "sudo -l 2>/dev/null | grep -i nopasswd || echo 'NO_NOPASSWD_FOUND'";
            String sudoCheckResult = execSimple(session, sudoCheckCmd, 3000);
            System.out.println("[DEBUG] Quyen sudo hien tai: " + sudoCheckResult);

            // 6. Kiem tra lai cuoi cung
            System.out.println("[FINAL] Kiem tra lai cuoi cung...");
            String finalCheckCmd = "sudo -l 2>/dev/null | grep -i nopasswd && echo FINAL_OK || echo FINAL_FAIL";
            String finalResult = execSimple(session, finalCheckCmd, 3000).trim();
            System.out.println("[FINAL] Ket qua: " + finalResult);

            if (verifyResult.contains("NOPASSWD_ACTIVE") && finalResult.contains("FINAL_OK")) {
                System.out.println("[SUCCESS] Cau hinh sudo NOPASSWD thanh cong cho " + username);
            } else {
                System.err.println("[ERROR] Cau hinh sudo NOPASSWD that bai cho " + username);
                System.err.println("[HINT] Co the can dang nhap lai hoac kiem tra cau hinh sudoers");
            }

            System.out.println("================================================");
        } catch (Exception e) {
            System.err.println("[SUDO NOPASSWD] Loi khi cau hinh sudo NOPASSWD cho " + username);
            System.err.println("Chi tiet loi: " + e.getMessage());
        }
    }

    /**
     * Hàm phụ trợ: thực thi lệnh đơn giản và trả output (để tránh lặp code JSch)
     */
    private String execSimple(Session session, String cmd, int timeoutMs) throws Exception {
        com.jcraft.jsch.ChannelExec ch = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
        ch.setCommand(cmd);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        ch.setOutputStream(out);
        ch.connect(timeoutMs);
        while (!ch.isClosed())
            Thread.sleep(50);
        ch.disconnect();
        return out.toString(StandardCharsets.UTF_8);
    }

    /**
     * Thực thi lệnh với SSH key và mật khẩu sudo
     */
    public String execCommandWithKeyAndSudo(String host, int port, String username, String privateKeyPem,
            String command, String sudoPassword, int timeoutMs) {
        Session session = null;
        com.jcraft.jsch.ChannelExec channel = null;
        try {
            JSch jsch = new JSch();
            // Load key from PEM string
            byte[] prv = privateKeyPem.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            jsch.addIdentity("inmem-key", prv, null, null);

            session = jsch.getSession(username, host, port);
            session.setConfig("StrictHostKeyChecking", "no");
            session.connect(timeoutMs);

            channel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");

            // Kiểm tra sudo NOPASSWD trước khi sử dụng password
            String finalCommand = command;
            try {
                String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                com.jcraft.jsch.ChannelExec checkChannel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
                checkChannel.setCommand(checkSudoCmd);
                checkChannel.connect(3000);

                java.io.InputStream checkIn = checkChannel.getInputStream();
                byte[] checkBuf = checkIn.readAllBytes();
                String checkResult = new String(checkBuf, java.nio.charset.StandardCharsets.UTF_8).trim();
                checkChannel.disconnect();

                if (checkResult.contains("HAS_NOPASSWD")) {
                    // Có sudo NOPASSWD, chỉ cần thêm sudo
                    finalCommand = "sudo " + command;
                } else {
                    // Không có sudo NOPASSWD, sử dụng password
                    finalCommand = createSudoCommand(command, sudoPassword);
                }
            } catch (Exception e) {
                // Nếu không kiểm tra được, sử dụng password
                finalCommand = createSudoCommand(command, sudoPassword);
            }

            channel.setCommand(finalCommand);

            java.io.InputStream in = channel.getInputStream();
            channel.connect(timeoutMs);

            byte[] buf = in.readAllBytes();
            String out = new String(buf, java.nio.charset.StandardCharsets.UTF_8).trim();
            return out;

        } catch (Exception e) {
            System.err.println("Lỗi thực thi lệnh với SSH key và sudo: " + e.getMessage());
            return null;
        } finally {
            try {
                if (channel != null && channel.isConnected())
                    channel.disconnect();
            } catch (Exception ignored) {
            }
            try {
                if (session != null && session.isConnected())
                    session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Thực thi lệnh với password và mật khẩu sudo
     */
    public String execCommandWithSudo(String host, int port, String username, String sshPassword,
            String command, String sudoPassword, int timeoutMs) {
        Session session = null;
        com.jcraft.jsch.ChannelExec channel = null;
        try {
            JSch jsch = new JSch();
            session = jsch.getSession(username, host, port);
            session.setConfig("StrictHostKeyChecking", "no");
            session.setPassword(sshPassword);
            session.connect(timeoutMs);

            channel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");

            // Kiểm tra sudo NOPASSWD trước khi sử dụng password
            String finalCommand = command;
            try {
                String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                com.jcraft.jsch.ChannelExec checkChannel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
                checkChannel.setCommand(checkSudoCmd);
                checkChannel.connect(3000);

                java.io.InputStream checkIn = checkChannel.getInputStream();
                byte[] checkBuf = checkIn.readAllBytes();
                String checkResult = new String(checkBuf, java.nio.charset.StandardCharsets.UTF_8).trim();
                checkChannel.disconnect();

                if (checkResult.contains("HAS_NOPASSWD")) {
                    // Có sudo NOPASSWD, chỉ cần thêm sudo
                    finalCommand = "sudo " + command;
                } else {
                    // Không có sudo NOPASSWD, sử dụng password
                    finalCommand = createSudoCommand(command, sudoPassword);
                }
            } catch (Exception e) {
                // Nếu không kiểm tra được, sử dụng password
                finalCommand = createSudoCommand(command, sudoPassword);
            }

            channel.setCommand(finalCommand);

            java.io.InputStream in = channel.getInputStream();
            channel.connect(timeoutMs);

            byte[] buf = in.readAllBytes();
            String out = new String(buf, java.nio.charset.StandardCharsets.UTF_8).trim();
            return out;

        } catch (Exception e) {
            System.err.println("Lỗi thực thi lệnh với password và sudo: " + e.getMessage());
            return null;
        } finally {
            try {
                if (channel != null && channel.isConnected())
                    channel.disconnect();
            } catch (Exception ignored) {
            }
            try {
                if (session != null && session.isConnected())
                    session.disconnect();
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Tạo lệnh sudo với echo password
     */
    private String createSudoCommand(String command, String sudoPassword) {
        if (sudoPassword == null || sudoPassword.trim().isEmpty()) {
            return command; // Không có sudo password, chạy lệnh bình thường
        }

        // Escape special characters trong password
        String escapedPassword = sudoPassword.replace("'", "'\"'\"'");

        // Tạo lệnh với echo password và sudo -S
        return String.format("echo '%s' | sudo -S %s", escapedPassword, command);
    }

    /**
     * Kiểm tra SSH key với sudo password
     */
    public boolean testSshWithKeyAndSudo(String host, int port, String username, String privateKeyPem,
            String sudoPassword, int timeoutMs) {
        try {
            String testCommand = "sudo whoami";
            String result = execCommandWithKeyAndSudo(host, port, username, privateKeyPem, testCommand, sudoPassword,
                    timeoutMs);
            return result != null && result.trim().equals("root");
        } catch (Exception e) {
            return false;
        }
    }
}
