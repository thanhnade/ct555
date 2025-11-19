package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.ServerService;
import com.example.AutoDeployApp.entity.Server;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ansible-config")
public class AnsibleConfigController {

    @Autowired
    private ServerService serverService;

    @GetMapping("/read")
    public ResponseEntity<Map<String, Object>> readConfig(
            @RequestParam(required = false) String host) {
        try {
            // Với 1 cluster duy nhất, luôn sử dụng servers có clusterStatus = "AVAILABLE"
            var servers = serverService.findByClusterStatus("AVAILABLE");
            Server target = pickTarget(servers, host, true);

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Không tìm thấy MASTER trong cluster"));
            }

            // Uu tien SSH key tu database
            String pem = serverService.resolveServerPrivateKeyPem(target.getId());
            String cfg = "";
            String hosts = "";
            String vars = "";

            if (pem != null && !pem.isBlank()) {
                // Su dung SSH key tu database
                try {
                    cfg = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, "bash -lc 'cat /etc/ansible/ansible.cfg || true'", 15000);
                } catch (Exception e) {
                    // Loi doc cfg
                }

                try {
                    hosts = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, "bash -lc 'cat /etc/ansible/hosts || true'", 15000);
                } catch (Exception e) {
                    // Loi doc hosts
                }

                try {
                    vars = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, "bash -lc 'cat /etc/ansible/group_vars/all.yml || true'", 15000);
                } catch (Exception e) {
                    // Loi doc vars
                }
            } else {
                // Khong co SSH key - tra ve config rong
                return ResponseEntity.ok()
                        .header("Cache-Control", "no-cache, no-store, must-revalidate")
                        .header("Pragma", "no-cache")
                        .header("Expires", "0")
                        .body(Map.of(
                                "success", true,
                                "server", target.getHost(),
                                "cfg", "",
                                "hosts", "",
                                "vars", ""));
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("server", target.getHost());
            response.put("cfg", cfg != null ? cfg : "");
            response.put("hosts", hosts != null ? hosts : "");
            response.put("vars", vars != null ? vars : "");

            return ResponseEntity.ok()
                    .header("Cache-Control", "no-cache, no-store, must-revalidate")
                    .header("Pragma", "no-cache")
                    .header("Expires", "0")
                    .body(response);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi khi doc cau hinh: " + e.getMessage()));
        }
    }

    @PostMapping("/save")
    public ResponseEntity<Map<String, Object>> saveConfig(
            @RequestParam(required = false) String host,
            @RequestParam String sudoPassword,
            @RequestParam String cfg,
            @RequestParam String hosts,
            @RequestParam(required = false) String vars) {
        try {
            // Với 1 cluster duy nhất, luôn sử dụng servers có clusterStatus = "AVAILABLE"
            var servers = serverService.findByClusterStatus("AVAILABLE");
            Server target = pickTarget(servers, host, true);

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong tim thay MASTER trong cluster"));
            }

            // Uu tien SSH key tu database
            String pem = serverService.resolveServerPrivateKeyPem(target.getId());
            boolean success = true;
            boolean useSudoNopasswd = false;

            // Biến lưu kết quả xác thực
            String configCheck = "";
            String inventoryCheck = "";
            String pingCheck = "";

            try {
                // Kiem tra sudo NOPASSWD neu co SSH key
                if (pem != null && !pem.isBlank()) {
                    try {
                        String checkSudoCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                        String sudoCheckResult = serverService.execCommandWithKey(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), pem, checkSudoCmd, 10000);
                        useSudoNopasswd = (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD"));
                    } catch (Exception e) {
                        // Neu khong kiem tra duoc, su dung sudo password
                    }
                }

                // Tao thu muc can thiet
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target, "mkdir -p /etc/ansible /var/log/ansible", useSudoNopasswd,
                            15000);
                } else {
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, "mkdir -p /etc/ansible /var/log/ansible", 15000);
                }

                // Tao backup va cleanup backup cu
                if (pem != null && !pem.isBlank()) {
                    // Tạo bản sao lưu cố định (.bak)
                    execCommandWithSudoOptimization(target,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg ] && cp -a /etc/ansible/ansible.cfg /etc/ansible/ansible.cfg.bak || true'",
                            useSudoNopasswd, 15000);
                    execCommandWithSudoOptimization(target,
                            "bash -lc '[ -f /etc/ansible/hosts ] && cp -a /etc/ansible/hosts /etc/ansible/hosts.bak || true'",
                            useSudoNopasswd, 15000);
                } else {
                    // Tạo bản sao lưu cố định (.bak)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg ] && cp -a /etc/ansible/ansible.cfg /etc/ansible/ansible.cfg.bak || true'",
                            15000);
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -f /etc/ansible/hosts ] && cp -a /etc/ansible/hosts /etc/ansible/hosts.bak || true'",
                            15000);
                }

                // Ghi file cfg bang base64 encoding
                String cfgSafe = cfg == null ? "" : cfg;
                String cfgBase64 = java.util.Base64.getEncoder().encodeToString(cfgSafe.getBytes("UTF-8"));
                String cmdCfg = "echo '" + cfgBase64
                        + "' | base64 -d | sudo tee /etc/ansible/ansible.cfg > /dev/null && echo 'CFG_WRITTEN'";
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target, cmdCfg, useSudoNopasswd, 45000);
                } else {
                    // Truyen password cho sudo bang echo
                    String cmdCfgWithPassword = "echo '" + sudoPassword + "' | sudo -S bash -c 'echo \"" + cfgBase64
                            + "\" | base64 -d | sudo tee /etc/ansible/ansible.cfg > /dev/null && echo CFG_WRITTEN'";
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, cmdCfgWithPassword, 45000);
                }

                // Ghi file hosts bang base64 encoding
                String hostsSafe = hosts == null ? "" : hosts;
                String hostsBase64 = java.util.Base64.getEncoder().encodeToString(hostsSafe.getBytes("UTF-8"));
                String cmdHosts = "echo '" + hostsBase64
                        + "' | base64 -d | sudo tee /etc/ansible/hosts > /dev/null && echo 'HOSTS_WRITTEN'";
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target, cmdHosts, useSudoNopasswd, 45000);
                } else {
                    // Truyen password cho sudo bang echo
                    String cmdHostsWithPassword = "echo '" + sudoPassword + "' | sudo -S bash -c 'echo \"" + hostsBase64
                            + "\" | base64 -d | sudo tee /etc/ansible/hosts > /dev/null && echo HOSTS_WRITTEN'";
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, cmdHostsWithPassword, 45000);
                }

                // Ghi file variables (group_vars/all.yml) bang base64 encoding
                if (vars != null && !vars.trim().isEmpty()) {
                    String varsSafe = vars;
                    String varsBase64 = java.util.Base64.getEncoder().encodeToString(varsSafe.getBytes("UTF-8"));
                    String cmdVars = "echo '" + varsBase64
                            + "' | base64 -d > /tmp/ansible.vars.tmp && cp /tmp/ansible.vars.tmp /etc/ansible/group_vars/all.yml && rm /tmp/ansible.vars.tmp";
                    if (pem != null && !pem.isBlank()) {
                        execCommandWithSudoOptimization(target, cmdVars, useSudoNopasswd, 45000);
                    } else {
                        // Truyen password cho sudo bang echo
                        String cmdVarsWithPassword = "echo '" + sudoPassword + "' | sudo -S bash -c 'echo \""
                                + varsBase64
                                + "\" | base64 -d > /tmp/ansible.vars.tmp && cp /tmp/ansible.vars.tmp /etc/ansible/group_vars/all.yml && rm /tmp/ansible.vars.tmp'";
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, cmdVarsWithPassword, 45000);
                    }
                }

                // Dat quyen cho file va thu muc
                if (pem != null && !pem.isBlank()) {
                    // Quyen cho file cau hinh (644 = rw-r--r--)
                    execCommandWithSudoOptimization(target, "chmod 644 /etc/ansible/ansible.cfg /etc/ansible/hosts",
                            useSudoNopasswd, 15000);
                    if (vars != null && !vars.trim().isEmpty()) {
                        execCommandWithSudoOptimization(target, "chmod 644 /etc/ansible/group_vars/all.yml",
                                useSudoNopasswd, 15000);
                    }
                    // Quyen cho thu muc (755 = rwxr-xr-x)
                    execCommandWithSudoOptimization(target, "chmod 755 /etc/ansible", useSudoNopasswd, 15000);
                    // Quyen cho thu muc con (700 = rwx------)
                    execCommandWithSudoOptimization(target, "chmod 700 /etc/ansible/group_vars /etc/ansible/host_vars",
                            useSudoNopasswd, 15000);
                } else {
                    // Quyen cho file cau hinh (644 = rw-r--r--)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, "chmod 644 /etc/ansible/ansible.cfg /etc/ansible/hosts",
                            15000);
                    if (vars != null && !vars.trim().isEmpty()) {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, "chmod 644 /etc/ansible/group_vars/all.yml", 15000);
                    }
                    // Quyen cho thu muc (755 = rwxr-xr-x)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, "chmod 755 /etc/ansible", 15000);
                    // Quyen cho thu muc con (700 = rwx------)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "chmod 700 /etc/ansible/group_vars /etc/ansible/host_vars", 15000);
                }

                // Xac minh file da duoc ghi thanh cong
                String verifyCfg = "";
                String verifyHosts = "";
                if (pem != null && !pem.isBlank()) {
                    verifyCfg = execCommandWithSudoOptimization(target,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", useSudoNopasswd,
                            15000);
                    verifyHosts = execCommandWithSudoOptimization(target,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", useSudoNopasswd, 15000);
                } else {
                    verifyCfg = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 15000);
                    verifyHosts = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 15000);
                }

                if (!verifyCfg.trim().equals("OK") || !verifyHosts.trim().equals("OK")) {
                    success = false;
                    return ResponseEntity.badRequest().body(Map.of(
                            "success", false,
                            "message", "Khong the xac minh file da duoc ghi thanh cong. verifyCfg=" + verifyCfg.trim()
                                    + ", verifyHosts=" + verifyHosts.trim()));
                }

                // Kiem tra cu phap va ket noi Ansible
                String errorDetails = "";

                try {

                    // 1. Kiem tra cu phap ansible-config
                    if (pem != null && !pem.isBlank()) {
                        configCheck = execCommandWithSudoOptimization(target,
                                "bash -lc 'ansible-config dump --only-changed 2>&1 || echo CONFIG_ERROR'",
                                useSudoNopasswd, 15000);
                    } else {
                        configCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'ansible-config dump --only-changed 2>&1 || echo CONFIG_ERROR'", 15000);
                    }

                    // 2. Kiem tra cu phap inventory - su dung file tam thoi
                    String hostsBase64Test = java.util.Base64.getEncoder()
                            .encodeToString((hosts != null ? hosts : "").getBytes("UTF-8"));
                    String inventoryTestCmd = "echo '" + hostsBase64Test
                            + "' | base64 -d > /tmp/test_hosts && ansible-inventory -i /tmp/test_hosts --list 2>&1 && rm /tmp/test_hosts || echo INVENTORY_ERROR";

                    if (pem != null && !pem.isBlank()) {
                        inventoryCheck = execCommandWithSudoOptimization(target,
                                "bash -lc '" + inventoryTestCmd + "'", useSudoNopasswd, 15000);
                    } else {
                        inventoryCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '" + inventoryTestCmd + "'", 15000);
                    }

                    // 3. Kiem tra ket noi ping
                    if (pem != null && !pem.isBlank()) {
                        pingCheck = execCommandWithSudoOptimization(target,
                                "bash -lc 'ansible all -m ping -i /etc/ansible/hosts 2>&1 || echo PING_ERROR'",
                                useSudoNopasswd, 20000);
                    } else {
                        pingCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'ansible all -m ping -i /etc/ansible/hosts 2>&1 || echo PING_ERROR'", 20000);
                    }

                    // Phan tich ket qua
                    if (configCheck.contains("CONFIG_ERROR")) {
                        errorDetails += "Lỗi cú pháp ansible.cfg: " + configCheck.replace("CONFIG_ERROR", "").trim()
                                + "; ";
                    }
                    if (inventoryCheck.contains("INVENTORY_ERROR")) {
                        errorDetails += "Lỗi cú pháp inventory: " + inventoryCheck.replace("INVENTORY_ERROR", "").trim()
                                + "; ";
                    }
                    if (pingCheck.contains("PING_ERROR")) {
                        errorDetails += "Lỗi kết nối ping: " + pingCheck.replace("PING_ERROR", "").trim() + "; ";
                    }

                    // Kiem tra co loi khong
                    if (!errorDetails.isEmpty()) {
                        return ResponseEntity.badRequest().body(Map.of(
                                "success", false,
                                "message", "Cấu hình Ansible không hợp lệ: " + errorDetails,
                                "details", Map.of(
                                        "configCheck", configCheck,
                                        "inventoryCheck", inventoryCheck,
                                        "pingCheck", pingCheck)));
                    }

                } catch (Exception e) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "success", false,
                            "message", "Lỗi khi kiểm tra cấu hình Ansible: " + e.getMessage()));
                }

            } catch (Exception e) {
                success = false;
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Loi khi luu cau hinh: " + e.getMessage()));
            }

            if (success) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("message", "Đã lưu cấu hình Ansible thành công và xác minh hợp lệ");

                // Bổ sung kết quả kiểm tra nếu thu được
                if (configCheck != null && !configCheck.isEmpty()) {
                    Map<String, Object> validation = new HashMap<>();
                    validation.put("configCheck", configCheck);
                    validation.put("inventoryCheck", inventoryCheck);
                    validation.put("pingCheck", pingCheck);
                    response.put("validation", validation);
                }

                return ResponseEntity.ok(response);
            } else {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong the luu cau hinh"));
            }

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi: " + e.getMessage()));
        }
    }

    private Server pickTarget(List<Server> servers, String host, boolean preferMaster) {
        // Lưu ý: Máy ANSIBLE có thể có clusterStatus=NOAVAILABLE vì không phải K8s node
        if (servers == null || servers.isEmpty())
            return null;

        if (host != null && !host.trim().isEmpty()) {
            return servers.stream()
                    .filter(s -> s.getHost().equals(host))
                    .findFirst()
                    .orElse(null);
        }

        if (preferMaster) {
            // Bước 1: Tìm ANSIBLE trong tất cả servers trước (vì máy ANSIBLE không nằm trong cụm)
            try {
                var allServers = serverService.findAll();
                var ansibleServerAll = allServers.stream()
                        .filter(s -> "ANSIBLE".equals(s.getRole()))
                        .findFirst();
                
                if (ansibleServerAll.isPresent()) {
                    return ansibleServerAll.get();
                }
            } catch (Exception e) {
                // Nếu không lấy được tất cả servers, tiếp tục với fallback
            }
            
            // Bước 2: Nếu không có ANSIBLE, tìm trong danh sách hiện tại (AVAILABLE)
            var ansibleServer = servers.stream()
                    .filter(s -> "ANSIBLE".equals(s.getRole()))
                    .findFirst();
            
            if (ansibleServer.isPresent()) {
                return ansibleServer.get();
            }
            
            // Bước 3: Fallback về MASTER trong danh sách hiện tại (AVAILABLE)
            var masterServer = servers.stream()
                    .filter(s -> "MASTER".equals(s.getRole()))
                    .findFirst();
            
            if (masterServer.isPresent()) {
                return masterServer.get();
            }
            
            // Fallback về server đầu tiên nếu không có cả ANSIBLE và MASTER
            return servers.get(0);
        }

        return servers.get(0);
    }

    /**
     * Thuc thi lenh voi SSH key, tu dong su dung sudo NOPASSWD neu co
     */
    private String execCommandWithSudoOptimization(Server target, String command, boolean useSudoNopasswd,
            int timeoutMs) {
        String pem = serverService.resolveServerPrivateKeyPem(target.getId());
        if (pem != null && !pem.isBlank()) {
            if (useSudoNopasswd) {
                // Su dung sudo NOPASSWD
                return serverService.execCommandWithKey(target.getHost(),
                        target.getPort() != null ? target.getPort() : 22,
                        target.getUsername(), pem, "sudo " + command, timeoutMs);
            } else {
                // Su dung SSH key binh thuong
                return serverService.execCommandWithKey(target.getHost(),
                        target.getPort() != null ? target.getPort() : 22,
                        target.getUsername(), pem, command, timeoutMs);
            }
        }
        return null;
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verifyAnsible(
            @RequestParam(required = false) String host) {
        try {
            // Với 1 cluster duy nhất, luôn sử dụng servers có clusterStatus = "AVAILABLE"
            var servers = serverService.findByClusterStatus("AVAILABLE");
            Server target = pickTarget(servers, host, true);

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong tim thay MASTER trong cluster"));
            }

            // Uu tien SSH key tu database
            String pem = serverService.resolveServerPrivateKeyPem(target.getId());
            String pingResult = "";

            try {
                if (pem != null && !pem.isBlank()) {
                    // Su dung SSH key tu database
                    pingResult = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, "bash -lc 'ansible all -m ping -i /etc/ansible/hosts || true'",
                            20000);
                } else {
                    // Khong co SSH key - can password
                    return ResponseEntity.badRequest().body(Map.of(
                            "success", false,
                            "message", "Can SSH key de thuc hien ansible ping"));
                }
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Loi khi thuc hien ansible ping: " + e.getMessage()));
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("server", target.getHost());
            response.put("pingResult", pingResult);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi: " + e.getMessage()));
        }
    }

    @GetMapping("/check-sudo")
    public ResponseEntity<Map<String, Object>> checkSudoNopasswd(
            @RequestParam(required = false) String host) {
        try {
            Server target = null;
            
            // Nếu có host cụ thể, tìm trong tất cả servers (bao gồm ANSIBLE)
            if (host != null && !host.trim().isEmpty()) {
                try {
                    var allServers = serverService.findAll();
                    target = allServers.stream()
                            .filter(s -> host.equals(s.getHost()))
                            .findFirst()
                            .orElse(null);
                } catch (Exception e) {
                    // Nếu không lấy được tất cả servers, tiếp tục với fallback
                }
            }
            
            // Nếu không tìm thấy với host cụ thể, hoặc không có host, dùng logic pickTarget
            if (target == null) {
                // Với 1 cluster duy nhất, luôn sử dụng servers có clusterStatus = "AVAILABLE"
                var servers = serverService.findByClusterStatus("AVAILABLE");
                target = pickTarget(servers, host, true);
            }

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Không tìm thấy server" + (host != null ? " với host: " + host : "")));
            }

            // Uu tien SSH key tu database
            String pem = serverService.resolveServerPrivateKeyPem(target.getId());
            boolean hasNopasswd = false;

            if (pem != null && !pem.isBlank()) {
                try {
                    // Kiem tra sudo NOPASSWD
                    String checkCmd = "sudo -l 2>/dev/null | grep -q 'NOPASSWD' && echo 'HAS_NOPASSWD' || echo 'NO_NOPASSWD'";
                    String result = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, checkCmd, 10000);
                    hasNopasswd = (result != null && result.contains("HAS_NOPASSWD"));
                } catch (Exception e) {
                    // Loi kiem tra sudo
                }
            }

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("server", target.getHost());
            response.put("hasNopasswd", hasNopasswd);
            response.put("hasSshKey", pem != null && !pem.isBlank());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi: " + e.getMessage()));
        }
    }

    @PostMapping("/rollback")
    public ResponseEntity<Map<String, Object>> rollbackConfig(
            @RequestParam(required = false) String host,
            @RequestParam(required = false) String sudoPassword) {
        try {
            // Với 1 cluster duy nhất, luôn sử dụng servers có clusterStatus = "AVAILABLE"
            var servers = serverService.findByClusterStatus("AVAILABLE");
            Server target = pickTarget(servers, host, true);

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong tim thay MASTER trong cluster"));
            }

            // Uu tien SSH key tu database
            String pem = serverService.resolveServerPrivateKeyPem(target.getId());
            boolean success = true;
            boolean useSudoNopasswd = false;

            try {
                // Kiem tra file backup co ton tai khong (fixed .bak file)
                String checkBackup = "";
                if (pem != null && !pem.isBlank()) {
                    checkBackup = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg.bak ] && echo OK || echo FAIL'", 15000);
                } else {
                    // Kiem tra sudo NOPASSWD neu khong co SSH key
                    String sudoCheck = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc 'sudo -n true 2>/dev/null && echo OK || echo FAIL'", 15000);

                    if (sudoCheck.trim().equals("OK")) {
                        useSudoNopasswd = true;
                        checkBackup = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'sudo [ -f /etc/ansible/ansible.cfg.bak ] && echo OK || echo FAIL'", 15000);
                    } else {
                        checkBackup = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -f /etc/ansible/ansible.cfg.bak ] && echo OK || echo FAIL'", 15000);
                    }
                }

                if (!checkBackup.trim().equals("OK")) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "success", false,
                            "message",
                            "Không tìm thấy file backup để rollback. Vui lòng lưu cấu hình trước khi rollback."));
                }

                // Thuc hien rollback - su dung file backup co dinh (.bak)
                if (pem != null && !pem.isBlank()) {
                    // Rollback ansible.cfg - su dung sudo cp
                    String rollbackCfgResult = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc 'sudo cp -a /etc/ansible/ansible.cfg.bak /etc/ansible/ansible.cfg && echo CFG_ROLLBACK_OK || echo CFG_ROLLBACK_FAIL'",
                            15000);

                    // Rollback hosts - su dung sudo cp
                    String rollbackHostsResult = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc 'sudo cp -a /etc/ansible/hosts.bak /etc/ansible/hosts && echo HOSTS_ROLLBACK_OK || echo HOSTS_ROLLBACK_FAIL'",
                            15000);

                    // Log rollback results
                    System.out.println("Rollback CFG Result: " + rollbackCfgResult);
                    System.out.println("Rollback HOSTS Result: " + rollbackHostsResult);
                } else {
                    // Rollback ansible.cfg - su dung file backup co dinh (.bak)
                    if (useSudoNopasswd) {
                        String rollbackCfgResult = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'sudo cp -a /etc/ansible/ansible.cfg.bak /etc/ansible/ansible.cfg && echo CFG_ROLLBACK_OK || echo CFG_ROLLBACK_FAIL'",
                                15000);

                        // Rollback hosts - su dung file backup co dinh (.bak)
                        String rollbackHostsResult = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'sudo cp -a /etc/ansible/hosts.bak /etc/ansible/hosts && echo HOSTS_ROLLBACK_OK || echo HOSTS_ROLLBACK_FAIL'",
                                15000);

                        // Log rollback results
                        System.out.println("Rollback CFG Result: " + rollbackCfgResult);
                        System.out.println("Rollback HOSTS Result: " + rollbackHostsResult);
                    } else {
                        String rollbackCfgResult = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'echo \"" + sudoPassword
                                        + "\" | sudo -S cp -a /etc/ansible/ansible.cfg.bak /etc/ansible/ansible.cfg && echo CFG_ROLLBACK_OK || echo CFG_ROLLBACK_FAIL'",
                                15000);

                        // Rollback hosts - su dung file backup co dinh (.bak)
                        String rollbackHostsResult = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'echo \"" + sudoPassword
                                        + "\" | sudo -S cp -a /etc/ansible/hosts.bak /etc/ansible/hosts && echo HOSTS_ROLLBACK_OK || echo HOSTS_ROLLBACK_FAIL'",
                                15000);

                        // Log rollback results
                        System.out.println("Rollback CFG Result: " + rollbackCfgResult);
                        System.out.println("Rollback HOSTS Result: " + rollbackHostsResult);
                    }
                }

                // Xac minh rollback thanh cong va log chi tiet
                String verifyCfg = "";
                String verifyHosts = "";
                if (pem != null && !pem.isBlank()) {
                    verifyCfg = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 15000);
                    verifyHosts = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 15000);
                } else {
                    if (useSudoNopasswd) {
                        verifyCfg = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'sudo [ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 15000);
                        verifyHosts = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'sudo [ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 15000);
                    } else {
                        verifyCfg = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 15000);
                        verifyHosts = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 15000);
                    }
                }

                // Log verification results
                System.out.println("Rollback Verification - CFG: " + verifyCfg);
                System.out.println("Rollback Verification - HOSTS: " + verifyHosts);

                if (!verifyCfg.trim().equals("OK") || !verifyHosts.trim().equals("OK")) {
                    success = false;
                    return ResponseEntity.badRequest().body(Map.of(
                            "success", false,
                            "message", "Khong the xac minh rollback thanh cong"));
                }

            } catch (Exception e) {
                success = false;
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Loi khi rollback: " + e.getMessage()));
            }

            if (success) {
                // Log successful rollback
                System.out.println("Rollback completed successfully");
                return ResponseEntity.ok(Map.of(
                        "success", true,
                        "message", "Đã rollback cấu hình thành công từ file backup"));
            } else {
                // Log failed rollback
                System.out.println("Rollback failed");
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Không thể rollback cấu hình"));
            }

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi: " + e.getMessage()));
        }
    }
}
