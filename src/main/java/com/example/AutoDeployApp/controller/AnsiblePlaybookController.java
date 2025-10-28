package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.AnsibleService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ansible-playbook")
public class AnsiblePlaybookController {

    private final AnsibleService ansibleService;

    public AnsiblePlaybookController(AnsibleService ansibleService) {
        this.ansibleService = ansibleService;
    }

    /**
     * 📄 Liệt kê tất cả playbook trong thư mục /etc/ansible/playbooks của cluster
     */
    @GetMapping("/list/{clusterId}")
    public ResponseEntity<List<String>> listPlaybooks(@PathVariable Long clusterId) {
        try {
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
