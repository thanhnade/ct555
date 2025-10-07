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
import java.net.InetAddress;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

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

    public Server findById(Long id) {
        return serverRepository.findById(id).orElseThrow();
    }

    @Transactional(readOnly = true)
    public String resolveServerPrivateKeyPem(Long serverId) {
        return serverRepository.findByIdWithSshKey(serverId)
                .map(s -> (s.getSshKey() != null ? s.getSshKey().getEncryptedPrivateKey() : null))
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
                        "Không thể kết nối SSH tới server, vui lòng kiểm tra host/port/username/password");
            }
        } else {
            // KEY mode: tạm thời bỏ qua kiểm tra SSH do chưa giải mã private key trên
            // server
            canSsh = false;
        }
        // Reject if duplicate (host, port, username) already exists for this user
        if (serverRepository.existsByHostAndPortAndUsernameAndAddedBy(host, resolvedPort, username, addedBy)) {
            throw new IllegalArgumentException("Máy chủ đã tồn tại (trùng host/port/username)");
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
            boolean dup = serverRepository.existsByHostAndPortAndUsernameAndAddedByAndIdNot(host, port, username,
                    addedBy, id);
            if (dup) {
                throw new IllegalArgumentException("Máy chủ đã tồn tại (host/port/username trùng)");
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
        if (clusterId != null) {
            if (clusterId >= 0) {
                // Nếu không tìm thấy cluster, coi như null (xoá liên kết)
                Cluster c = clusterRepository.findById(clusterId).orElse(null);
                s.setCluster(c);
            } else {
                // sentinel (<0) means clear cluster assignment
                s.setCluster(null);
            }
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
            session.connect(timeoutMs);
            channel = (com.jcraft.jsch.ChannelExec) session.openChannel("exec");
            channel.setCommand(command);
            java.io.InputStream in = channel.getInputStream();
            channel.connect(timeoutMs);
            byte[] buf = in.readAllBytes();
            String out = new String(buf, java.nio.charset.StandardCharsets.UTF_8).trim();
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
        for (Server s : servers) {
            boolean online = false;
            try {
                InetAddress addr = InetAddress.getByName(s.getHost());
                online = addr.isReachable(timeoutMs);
            } catch (Exception ignored) {
            }
            s.setStatus(online ? Server.ServerStatus.ONLINE : Server.ServerStatus.OFFLINE);
        }
        return serverRepository.saveAll(servers);
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
        } finally {
            session.disconnect();
        }

        // 3) Persist key metadata
        SshKey entity = new SshKey();
        entity.setKeyType(SshKey.KeyType.RSA);
        entity.setKeyLength(2048);
        entity.setPublicKey(publicKey);
        entity.setEncryptedPrivateKey(privateKeyPem); // NOTE: not encrypted in this demo
        entity.setAesSalt(null);
        entity.setStatus(SshKey.KeyStatus.ACTIVE);
        return entity;
    }
}
