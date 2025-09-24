package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.repository.ServerRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.net.InetAddress;

@Service
public class ServerService {

    private final ServerRepository serverRepository;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public ServerService(ServerRepository serverRepository) {
        this.serverRepository = serverRepository;
    }

    public List<Server> findAll() {
        return serverRepository.findAll();
    }

    public List<Server> findAllForUser(Long userId) {
        if (userId == null)
            return List.of();
        return serverRepository.findByAddedBy(userId);
    }

    public Server findById(Long id) {
        return serverRepository.findById(id).orElseThrow();
    }

    @Transactional
    public Server create(String host, Integer port, String username, String rawPassword, Server.ServerRole role,
            Long addedBy) {
        int resolvedPort = (port != null ? port : 22);
        boolean canSsh = testSsh(host, resolvedPort, username, rawPassword, 5000);
        if (!canSsh) {
            throw new IllegalArgumentException(
                    "Không thể kết nối SSH tới server, vui lòng kiểm tra host/port/username/password");
        }
        Server s = (addedBy != null)
                ? serverRepository.findByHostAndUsernameAndAddedBy(host, username, addedBy).orElse(new Server())
                : new Server();
        s.setHost(host);
        s.setPort(resolvedPort);
        s.setUsername(username);
        s.setPassword(passwordEncoder.encode(rawPassword));
        if (role != null)
            s.setRole(role);
        if (addedBy != null)
            s.setAddedBy(addedBy);
        s.setStatus(Server.ServerStatus.ONLINE);
        return serverRepository.saveAndFlush(s);
    }

    @Transactional
    public Server update(Long id, String host, Integer port, String username, String rawPassword,
            Server.ServerRole role, Server.ServerStatus status) {
        Server s = serverRepository.findById(id).orElseThrow();
        if (host != null && !host.isBlank())
            s.setHost(host);
        if (port != null)
            s.setPort(port);
        if (username != null && !username.isBlank())
            s.setUsername(username);
        if (rawPassword != null && !rawPassword.isBlank())
            s.setPassword(passwordEncoder.encode(rawPassword));
        if (role != null)
            s.setRole(role);
        if (status != null)
            s.setStatus(status);
        return serverRepository.saveAndFlush(s);
    }

    @Transactional
    public void delete(Long id) {
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
        return serverRepository.saveAndFlush(s);
    }
}
