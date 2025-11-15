package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.AnsibleService;
import com.example.AutoDeployApp.service.ServerService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ansible-playbook")
public class AnsiblePlaybookController {

    private final AnsibleService ansibleService;
    private final ServerService serverService;

    public AnsiblePlaybookController(AnsibleService ansibleService, ServerService serverService) {
        this.ansibleService = ansibleService;
        this.serverService = serverService;
    }

    /**
     * Kiểm tra xem master server có online không
     */
    private boolean isMasterOnline(Long clusterId, jakarta.servlet.http.HttpSession session) {
        if (session == null)
            return false;

        // Với 1 cluster duy nhất, luôn sử dụng servers có clusterStatus = "AVAILABLE"
        var clusterServers = serverService.findByClusterStatus("AVAILABLE");
        if (clusterServers == null || clusterServers.isEmpty())
            return false;

        var master = clusterServers.stream()
                .filter(s -> "MASTER".equals(s.getRole()))
                .findFirst()
                .orElse(null);
        if (master == null)
            return false;

        java.util.Set<Long> connectedIds = new java.util.HashSet<>();
        Object connectedAttr = session.getAttribute("CONNECTED_SERVERS");
        if (connectedAttr instanceof java.util.Set<?> set) {
            for (Object o : set) {
                if (o instanceof Number n) {
                    connectedIds.add(n.longValue());
                } else if (o instanceof String str) {
                    try {
                        connectedIds.add(Long.parseLong(str));
                    } catch (Exception ignored) {
                    }
                }
            }
        }
        return connectedIds.contains(master.getId());
    }

    /**
     * 📄 Liệt kê tất cả playbook trong thư mục /etc/ansible/playbooks của cluster
     */
    @GetMapping("/list/{clusterId}")
    public ResponseEntity<List<String>> listPlaybooks(@PathVariable Long clusterId, HttpServletRequest request) {
        try {
            var session = request.getSession(false);

            // Kiểm tra master online trước
            if (!isMasterOnline(clusterId, session)) {
                // Trả về danh sách rỗng thay vì lỗi
                return ResponseEntity.ok(List.of());
            }

            List<String> playbooks = ansibleService.listPlaybooks(clusterId);
            return ResponseEntity.ok(playbooks);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * 📂 Đọc nội dung 1 playbook
     */
    @GetMapping("/read/{clusterId}")
    public ResponseEntity<Map<String, String>> readPlaybook(
            @PathVariable Long clusterId,
            @RequestParam String filename) {
        try {
            Map<String, String> result = ansibleService.readPlaybook(clusterId, filename);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * 💾 Lưu (tạo/sửa) playbook
     */
    @PostMapping("/save/{clusterId}")
    public ResponseEntity<Map<String, Object>> savePlaybook(
            @PathVariable Long clusterId,
            @RequestParam String filename,
            @RequestParam String content) {
        try {
            // Với SSH key và sudo NOPASSWD, không cần password
            Map<String, Object> result = ansibleService.savePlaybook(clusterId, filename, content, null);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 🗑️ Xóa playbook
     */
    @DeleteMapping("/delete/{clusterId}")
    public ResponseEntity<Map<String, Object>> deletePlaybook(
            @PathVariable Long clusterId,
            @RequestParam String filename) {
        try {
            Map<String, Object> result = ansibleService.deletePlaybook(clusterId, filename);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 🚀 Thực thi playbook
     */
    @PostMapping("/execute/{clusterId}")
    public ResponseEntity<Map<String, Object>> executePlaybook(
            @PathVariable Long clusterId,
            @RequestParam String filename,
            @RequestParam(required = false) String extraVars) {
        try {
            // Với SSH key và sudo NOPASSWD, không cần password
            Map<String, Object> result = ansibleService.executePlaybook(clusterId, filename, extraVars, null);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 📊 Lấy trạng thái thực thi playbook
     */
    @GetMapping("/status/{clusterId}")
    public ResponseEntity<Map<String, Object>> getExecutionStatus(
            @PathVariable Long clusterId,
            @RequestParam String taskId) {
        try {
            Map<String, Object> result = ansibleService.getExecutionStatus(clusterId, taskId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 📤 Tải lên file playbook từ máy local
     */
    @PostMapping("/upload/{clusterId}")
    public ResponseEntity<Map<String, Object>> uploadPlaybook(
            @PathVariable Long clusterId,
            @RequestParam("file") MultipartFile file) {
        try {
            Map<String, Object> result = ansibleService.uploadPlaybook(clusterId, file);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
