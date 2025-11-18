package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.Server;
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
     * Kiểm tra xem controller server (ANSIBLE hoặc MASTER) có online không
     */
    private boolean isMasterOnline(jakarta.servlet.http.HttpSession session) {
        if (session == null)
            return false;

        // Bước 1: Tìm ANSIBLE trong tất cả servers trước (vì máy ANSIBLE không nằm trong cụm)
        Server controller = null;
        try {
            var allServers = serverService.findAll();
            controller = allServers.stream()
                    .filter(s -> "ANSIBLE".equals(s.getRole()))
                    .findFirst()
                    .orElse(null);
        } catch (Exception e) {
            // Nếu không lấy được tất cả servers, tiếp tục với fallback
        }

        // Bước 2: Nếu không có ANSIBLE, tìm MASTER trong AVAILABLE servers
        if (controller == null) {
            var clusterServers = serverService.findByClusterStatus("AVAILABLE");
            if (clusterServers == null || clusterServers.isEmpty())
                return false;
            
            controller = clusterServers.stream()
                    .filter(s -> "MASTER".equals(s.getRole()))
                    .findFirst()
                    .orElse(null);
        }
        
        if (controller == null)
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
        return connectedIds.contains(controller.getId());
    }

    /**
     * 📄 Liệt kê tất cả playbook trong thư mục /etc/ansible/playbooks của cluster duy nhất
     */
    @GetMapping("/list")
    public ResponseEntity<List<String>> listPlaybooks(HttpServletRequest request) {
        try {
            var session = request.getSession(false);

            // Kiểm tra master online trước
            if (!isMasterOnline(session)) {
                // Trả về danh sách rỗng thay vì lỗi
                return ResponseEntity.ok(List.of());
            }

            List<String> playbooks = ansibleService.listPlaybooks();
            return ResponseEntity.ok(playbooks);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * 📂 Đọc nội dung 1 playbook
     */
    @GetMapping("/read")
    public ResponseEntity<Map<String, String>> readPlaybook(@RequestParam String filename) {
        try {
            Map<String, String> result = ansibleService.readPlaybook(filename);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * 💾 Lưu (tạo/sửa) playbook
     */
    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> savePlaybook(
            @RequestParam String filename,
            @RequestParam String content) {
        try {
            // Với SSH key và sudo NOPASSWD, không cần password
            Map<String, Object> result = ansibleService.savePlaybook(filename, content, null);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 🗑️ Xóa playbook
     */
    @DeleteMapping("/delete")
    public ResponseEntity<Map<String, Object>> deletePlaybook(@RequestParam String filename) {
        try {
            Map<String, Object> result = ansibleService.deletePlaybook(filename);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 🚀 Thực thi playbook
     */
    @PostMapping("/execute")
    public ResponseEntity<Map<String, Object>> executePlaybook(
            @RequestParam String filename,
            @RequestParam(required = false) String extraVars) {
        try {
            // Với SSH key và sudo NOPASSWD, không cần password
            Map<String, Object> result = ansibleService.executePlaybook(filename, extraVars, null);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 📊 Lấy trạng thái thực thi playbook
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getExecutionStatus(@RequestParam String taskId) {
        try {
            Map<String, Object> result = ansibleService.getExecutionStatus(taskId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 📤 Tải lên file playbook từ máy local
     */
    @PostMapping("/upload")
    public ResponseEntity<Map<String, Object>> uploadPlaybook(@RequestParam("file") MultipartFile file) {
        try {
            Map<String, Object> result = ansibleService.uploadPlaybook(file);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
