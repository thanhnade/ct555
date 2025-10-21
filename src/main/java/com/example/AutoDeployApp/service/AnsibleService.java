package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.ChannelExec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import java.util.Arrays;

@Service
public class AnsibleService {

    private final ServerService serverService;
    private final ExecutorService executorService = Executors.newFixedThreadPool(5);

    // Cache để lưu trạng thái thực thi playbook
    private final Map<String, Map<String, Object>> executionStatusCache = new ConcurrentHashMap<>();

    public AnsibleService(ServerService serverService) {
        this.serverService = serverService;
    }

    /**
     * Lấy danh sách servers trong cluster
     */
    public List<Server> getClusterServers(Long clusterId) {
        return serverService.findByClusterId(clusterId);
    }

    /**
     * 📄 Liệt kê tất cả playbook trong thư mục /etc/ansible/playbooks
     */
    @Transactional(readOnly = true)
    public List<String> listPlaybooks(Long clusterId) {
        try {
            var servers = getClusterServers(clusterId);
            if (servers.isEmpty()) {
                throw new RuntimeException("Cluster không có servers nào");
            }

            // Lấy master server
            var master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy MASTER server"));

            // Tạo thư mục playbooks nếu chưa có
            sshExec(master, "sudo mkdir -p /etc/ansible/playbooks");

            // Liệt kê các file .yml trong thư mục playbooks
            String cmd = "sudo ls /etc/ansible/playbooks/*.yml /etc/ansible/playbooks/*.yaml 2>/dev/null || true";
            String output = sshExec(master, cmd);

            return Arrays.stream(output.split("\\s+"))
                    .filter(s -> !s.isBlank())
                    .map(s -> s.substring(s.lastIndexOf('/') + 1))
                    .collect(Collectors.toList());
        } catch (Exception e) {
            throw new RuntimeException("Lỗi liệt kê playbooks: " + e.getMessage());
        }
    }

    /**
     * 📂 Đọc nội dung 1 playbook
     */
    @Transactional(readOnly = true)
    public Map<String, String> readPlaybook(Long clusterId, String filename) {
        try {
            var servers = getClusterServers(clusterId);
            var master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy MASTER server"));

            String filePath = "/etc/ansible/playbooks/" + filename;
            String content = sshExec(master, "sudo cat " + filePath);

            if (content == null) {
                throw new RuntimeException("Không thể đọc file playbook");
            }

            return Map.of(
                    "filename", filename,
                    "content", content,
                    "size", String.valueOf(content.length()));
        } catch (Exception e) {
            throw new RuntimeException("Lỗi đọc playbook: " + e.getMessage());
        }
    }

    /**
     * 💾 Lưu (tạo/sửa) playbook
     */
    @Transactional
    public Map<String, Object> savePlaybook(Long clusterId, String filename, String content, String sudoPassword) {
        try {
            var servers = getClusterServers(clusterId);
            var master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy MASTER server"));

            // Tạo thư mục playbooks nếu chưa có
            sshExec(master, "sudo mkdir -p /etc/ansible/playbooks");

            // Đảm bảo filename có extension .yml hoặc .yaml
            String finalFilename = filename;
            if (!filename.toLowerCase().endsWith(".yml") && !filename.toLowerCase().endsWith(".yaml")) {
                finalFilename = filename + ".yml";
            }

            // Lưu nội dung vào file
            String filePath = "/etc/ansible/playbooks/" + finalFilename;
            String saveCmd = "sudo tee " + filePath + " > /dev/null << 'EOF'\n" + content + "\nEOF";
            sshExec(master, saveCmd);

            return Map.of(
                    "success", true,
                    "filename", finalFilename,
                    "message", "Đã lưu playbook thành công",
                    "size", content.length());
        } catch (Exception e) {
            throw new RuntimeException("Lỗi lưu playbook: " + e.getMessage());
        }
    }

    /**
     * 🗑️ Xóa playbook
     */
    @Transactional
    public Map<String, Object> deletePlaybook(Long clusterId, String filename) {
        try {
            var servers = getClusterServers(clusterId);
            var master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy MASTER server"));

            String filePath = "/etc/ansible/playbooks/" + filename;
            sshExec(master, "sudo rm -f " + filePath);

            return Map.of(
                    "success", true,
                    "filename", filename,
                    "message", "Đã xóa playbook thành công");
        } catch (Exception e) {
            throw new RuntimeException("Lỗi xóa playbook: " + e.getMessage());
        }
    }

    /**
     * 🚀 Thực thi playbook
     */
    @Transactional
    public Map<String, Object> executePlaybook(Long clusterId, String filename, String extraVars, String sudoPassword) {
        try {
            var servers = getClusterServers(clusterId);
            var master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy MASTER server"));

            String taskId = "playbook-" + clusterId + "-" + System.currentTimeMillis();

            // Khởi tạo trạng thái thực thi
            executionStatusCache.put(taskId, Map.of(
                    "status", "running",
                    "progress", 0,
                    "message", "Đang khởi tạo thực thi playbook...",
                    "startTime", System.currentTimeMillis()));

            // Thực thi playbook trong background
            CompletableFuture.runAsync(() -> {
                try {
                    String playbookPath = "/etc/ansible/playbooks/" + filename;
                    String cmd = "cd /etc/ansible && ansible-playbook " + playbookPath;

                    if (extraVars != null && !extraVars.trim().isEmpty()) {
                        cmd += " --extra-vars '" + extraVars + "'";
                    }

                    // Cập nhật trạng thái
                    executionStatusCache.put(taskId, Map.of(
                            "status", "running",
                            "progress", 25,
                            "message", "Đang thực thi playbook...",
                            "startTime", executionStatusCache.get(taskId).get("startTime")));

                    String result = sshExecWithOutput(master, cmd, taskId);

                    // Cập nhật kết quả
                    executionStatusCache.put(taskId, Map.of(
                            "status", "completed",
                            "progress", 100,
                            "message", "Hoàn thành thực thi playbook",
                            "result", result,
                            "endTime", System.currentTimeMillis(),
                            "startTime", executionStatusCache.get(taskId).get("startTime")));

                } catch (Exception e) {
                    executionStatusCache.put(taskId, Map.of(
                            "status", "failed",
                            "progress", 0,
                            "message", "Lỗi thực thi playbook: " + e.getMessage(),
                            "error", e.getMessage(),
                            "endTime", System.currentTimeMillis(),
                            "startTime", executionStatusCache.get(taskId).get("startTime")));
                }
            }, executorService);

            return Map.of(
                    "success", true,
                    "taskId", taskId,
                    "message", "Đã bắt đầu thực thi playbook");
        } catch (Exception e) {
            throw new RuntimeException("Lỗi thực thi playbook: " + e.getMessage());
        }
    }

    /**
     * 📊 Lấy trạng thái thực thi playbook
     */
    public Map<String, Object> getExecutionStatus(Long clusterId, String taskId) {
        Map<String, Object> status = executionStatusCache.get(taskId);
        if (status == null) {
            return Map.of(
                    "status", "not_found",
                    "message", "Không tìm thấy task");
        }

        // Thêm output real-time nếu có
        Map<String, Object> result = new java.util.HashMap<>(status);
        if (status.containsKey("result")) {
            result.put("output", status.get("result"));
        }

        // Thêm timestamp để frontend biết khi nào cập nhật
        result.put("timestamp", System.currentTimeMillis());

        return result;
    }

    /**
     * Dọn dẹp cache cũ (có thể gọi định kỳ)
     */
    public void cleanupOldTasks() {
        long currentTime = System.currentTimeMillis();
        executionStatusCache.entrySet().removeIf(entry -> {
            Map<String, Object> status = entry.getValue();
            Long startTime = (Long) status.get("startTime");
            return startTime != null && (currentTime - startTime) > 3600000; // 1 giờ
        });
    }

    /**
     * Thực thi lệnh SSH trực tiếp với JSch
     */
    private String sshExec(Server server, String command) {
        Session session = null;
        ChannelExec channel = null;
        try {
            JSch jsch = new JSch();
            String privateKey = serverService.resolveServerPrivateKeyPem(server.getId());
            jsch.addIdentity("key", privateKey.getBytes(), null, null);

            session = jsch.getSession(server.getUsername(), server.getHost(), server.getPort());
            session.setConfig("StrictHostKeyChecking", "no");
            session.connect(10000);

            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            channel.setOutputStream(outputStream);
            channel.connect();

            while (channel.isConnected()) {
                Thread.sleep(100);
            }

            return outputStream.toString();
        } catch (Exception e) {
            throw new RuntimeException("SSH execution failed: " + e.getMessage());
        } finally {
            if (channel != null)
                channel.disconnect();
            if (session != null)
                session.disconnect();
        }
    }

    /**
     * SSH execute với real-time output capture
     */
    private String sshExecWithOutput(Server server, String command, String taskId) {
        Session session = null;
        ChannelExec channel = null;
        try {
            JSch jsch = new JSch();
            String privateKey = serverService.resolveServerPrivateKeyPem(server.getId());
            jsch.addIdentity("key", privateKey.getBytes(), null, null);

            session = jsch.getSession(server.getUsername(), server.getHost(), server.getPort());
            session.setConfig("StrictHostKeyChecking", "no");
            session.connect(10000);

            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            channel.setOutputStream(outputStream);
            channel.connect();

            // Monitor output real-time
            StringBuilder realTimeOutput = new StringBuilder();
            while (channel.isConnected()) {
                Thread.sleep(100);

                // Cập nhật output real-time
                String currentOutput = outputStream.toString();
                if (currentOutput.length() > realTimeOutput.length()) {
                    realTimeOutput.setLength(0);
                    realTimeOutput.append(currentOutput);

                    // Cập nhật cache với output mới
                    Map<String, Object> currentStatus = executionStatusCache.get(taskId);
                    if (currentStatus != null) {
                        Map<String, Object> updatedStatus = new java.util.HashMap<>(currentStatus);
                        updatedStatus.put("result", currentOutput);
                        updatedStatus.put("progress", Math.min(25 + (currentOutput.length() / 10), 95)); // Rough
                                                                                                         // progress
                                                                                                         // estimation
                        executionStatusCache.put(taskId, updatedStatus);
                    }
                }
            }

            return outputStream.toString();
        } catch (Exception e) {
            throw new RuntimeException("SSH execution failed: " + e.getMessage());
        } finally {
            if (channel != null)
                channel.disconnect();
            if (session != null)
                session.disconnect();
        }
    }

    /**
     * 📤 Tải lên file playbook từ máy local
     */
    @Transactional
    public Map<String, Object> uploadPlaybook(Long clusterId, MultipartFile file) {
        try {
            var servers = getClusterServers(clusterId);
            var master = servers.stream()
                    .filter(s -> s.getRole() == Server.ServerRole.MASTER)
                    .findFirst()
                    .orElseThrow(() -> new RuntimeException("Không tìm thấy MASTER server"));

            // Validate file
            if (file.isEmpty()) {
                throw new RuntimeException("File không được để trống");
            }

            String originalFilename = file.getOriginalFilename();
            if (originalFilename == null || originalFilename.trim().isEmpty()) {
                throw new RuntimeException("Tên file không hợp lệ");
            }

            // Đảm bảo filename có extension .yml hoặc .yaml
            String finalFilename = originalFilename;
            if (!originalFilename.toLowerCase().endsWith(".yml") && !originalFilename.toLowerCase().endsWith(".yaml")) {
                finalFilename = originalFilename + ".yml";
            }

            // Tạo thư mục playbooks nếu chưa có
            sshExec(master, "sudo mkdir -p /etc/ansible/playbooks");

            // Lưu file lên server MASTER
            String filePath = "/etc/ansible/playbooks/" + finalFilename;
            String content = new String(file.getBytes(), "UTF-8");
            String saveCmd = "sudo tee " + filePath + " > /dev/null << 'EOF'\n" + content + "\nEOF";
            sshExec(master, saveCmd);

            return Map.of(
                    "success", true,
                    "filename", finalFilename,
                    "message", "Đã tải lên playbook thành công",
                    "size", file.getSize(),
                    "originalFilename", originalFilename);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi tải lên playbook: " + e.getMessage());
        }
    }
}
