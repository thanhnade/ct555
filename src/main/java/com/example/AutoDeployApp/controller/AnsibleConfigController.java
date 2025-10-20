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

    @GetMapping("/read/{clusterId}")
    public ResponseEntity<Map<String, Object>> readConfig(@PathVariable Long clusterId,
            @RequestParam(required = false) String host) {
        try {
            var servers = serverService.findByClusterId(clusterId);
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
                            target.getUsername(), pem, "bash -lc 'cat /etc/ansible/ansible.cfg || true'", 8000);
                } catch (Exception e) {
                    // Loi doc cfg
                }

                try {
                    hosts = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, "bash -lc 'cat /etc/ansible/hosts || true'", 8000);
                } catch (Exception e) {
                    // Loi doc hosts
                }

                try {
                    vars = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem, "bash -lc 'cat /etc/ansible/group_vars/all.yml || true'", 8000);
                } catch (Exception e) {
                    // Loi doc vars
                }
            } else {
                // Khong co SSH key - tra ve config rong
                return ResponseEntity.ok(Map.of(
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

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi khi doc cau hinh: " + e.getMessage()));
        }
    }

    @PostMapping("/save/{clusterId}")
    public ResponseEntity<Map<String, Object>> saveConfig(@PathVariable Long clusterId,
            @RequestParam(required = false) String host,
            @RequestParam String sudoPassword,
            @RequestParam String cfg,
            @RequestParam String hosts,
            @RequestParam(required = false) String vars) {
        try {
            var servers = serverService.findByClusterId(clusterId);
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

            // Variables for validation results
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
                                target.getUsername(), pem, checkSudoCmd, 5000);
                        useSudoNopasswd = (sudoCheckResult != null && sudoCheckResult.contains("HAS_NOPASSWD"));
                    } catch (Exception e) {
                        // Neu khong kiem tra duoc, su dung sudo password
                    }
                }

                // Tao thu muc can thiet
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target, "mkdir -p /etc/ansible /var/log/ansible", useSudoNopasswd,
                            10000);
                } else {
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, "mkdir -p /etc/ansible /var/log/ansible", 10000);
                }

                // Tao backup
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg ] && cp -a /etc/ansible/ansible.cfg /etc/ansible/ansible.cfg.bak || true'",
                            useSudoNopasswd, 10000);
                    execCommandWithSudoOptimization(target,
                            "bash -lc '[ -f /etc/ansible/hosts ] && cp -a /etc/ansible/hosts /etc/ansible/hosts.bak || true'",
                            useSudoNopasswd, 10000);
                } else {
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg ] && cp -a /etc/ansible/ansible.cfg /etc/ansible/ansible.cfg.bak || true'",
                            10000);
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -f /etc/ansible/hosts ] && cp -a /etc/ansible/hosts /etc/ansible/hosts.bak || true'",
                            10000);
                }

                // Ghi file cfg bang base64 encoding
                String cfgSafe = cfg == null ? "" : cfg;
                String cfgBase64 = java.util.Base64.getEncoder().encodeToString(cfgSafe.getBytes("UTF-8"));
                String cmdCfg = "echo '" + cfgBase64
                        + "' | base64 -d > /tmp/ansible.cfg.tmp && echo 'STEP1_DONE' && cp /tmp/ansible.cfg.tmp /etc/ansible/ansible.cfg && echo 'STEP2_DONE' && rm /tmp/ansible.cfg.tmp && echo 'STEP3_DONE'";
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target, cmdCfg, useSudoNopasswd, 30000);
                } else {
                    // Truyen password cho sudo bang echo
                    String cmdCfgWithPassword = "echo '" + sudoPassword + "' | sudo -S bash -c 'echo \"" + cfgBase64
                            + "\" | base64 -d > /tmp/ansible.cfg.tmp && cp /tmp/ansible.cfg.tmp /etc/ansible/ansible.cfg && rm /tmp/ansible.cfg.tmp'";
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, cmdCfgWithPassword, 30000);
                }

                // Ghi file hosts bang base64 encoding
                String hostsSafe = hosts == null ? "" : hosts;
                String hostsBase64 = java.util.Base64.getEncoder().encodeToString(hostsSafe.getBytes("UTF-8"));
                String cmdHosts = "echo '" + hostsBase64
                        + "' | base64 -d > /tmp/ansible.hosts.tmp && cp /tmp/ansible.hosts.tmp /etc/ansible/hosts && rm /tmp/ansible.hosts.tmp";
                if (pem != null && !pem.isBlank()) {
                    execCommandWithSudoOptimization(target, cmdHosts, useSudoNopasswd, 30000);
                } else {
                    // Truyen password cho sudo bang echo
                    String cmdHostsWithPassword = "echo '" + sudoPassword + "' | sudo -S bash -c 'echo \"" + hostsBase64
                            + "\" | base64 -d > /tmp/ansible.hosts.tmp && cp /tmp/ansible.hosts.tmp /etc/ansible/hosts && rm /tmp/ansible.hosts.tmp'";
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, cmdHostsWithPassword, 30000);
                }

                // Ghi file variables (group_vars/all.yml) bang base64 encoding
                if (vars != null && !vars.trim().isEmpty()) {
                    String varsSafe = vars;
                    String varsBase64 = java.util.Base64.getEncoder().encodeToString(varsSafe.getBytes("UTF-8"));
                    String cmdVars = "echo '" + varsBase64
                            + "' | base64 -d > /tmp/ansible.vars.tmp && cp /tmp/ansible.vars.tmp /etc/ansible/group_vars/all.yml && rm /tmp/ansible.vars.tmp";
                    if (pem != null && !pem.isBlank()) {
                        execCommandWithSudoOptimization(target, cmdVars, useSudoNopasswd, 30000);
                    } else {
                        // Truyen password cho sudo bang echo
                        String cmdVarsWithPassword = "echo '" + sudoPassword + "' | sudo -S bash -c 'echo \""
                                + varsBase64
                                + "\" | base64 -d > /tmp/ansible.vars.tmp && cp /tmp/ansible.vars.tmp /etc/ansible/group_vars/all.yml && rm /tmp/ansible.vars.tmp'";
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, cmdVarsWithPassword, 30000);
                    }
                }

                // Dat quyen cho file va thu muc
                if (pem != null && !pem.isBlank()) {
                    // Quyen cho file cau hinh (644 = rw-r--r--)
                    execCommandWithSudoOptimization(target, "chmod 644 /etc/ansible/ansible.cfg /etc/ansible/hosts",
                            useSudoNopasswd, 8000);
                    if (vars != null && !vars.trim().isEmpty()) {
                        execCommandWithSudoOptimization(target, "chmod 644 /etc/ansible/group_vars/all.yml",
                                useSudoNopasswd, 8000);
                    }
                    // Quyen cho thu muc (755 = rwxr-xr-x)
                    execCommandWithSudoOptimization(target, "chmod 755 /etc/ansible", useSudoNopasswd, 8000);
                    // Quyen cho thu muc con (700 = rwx------)
                    execCommandWithSudoOptimization(target, "chmod 700 /etc/ansible/group_vars /etc/ansible/host_vars",
                            useSudoNopasswd, 8000);
                } else {
                    // Quyen cho file cau hinh (644 = rw-r--r--)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, "chmod 644 /etc/ansible/ansible.cfg /etc/ansible/hosts",
                            8000);
                    if (vars != null && !vars.trim().isEmpty()) {
                        serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword, "chmod 644 /etc/ansible/group_vars/all.yml", 8000);
                    }
                    // Quyen cho thu muc (755 = rwxr-xr-x)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword, "chmod 755 /etc/ansible", 8000);
                    // Quyen cho thu muc con (700 = rwx------)
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "chmod 700 /etc/ansible/group_vars /etc/ansible/host_vars", 8000);
                }

                // Xac minh file da duoc ghi thanh cong
                String verifyCfg = "";
                String verifyHosts = "";
                if (pem != null && !pem.isBlank()) {
                    verifyCfg = execCommandWithSudoOptimization(target,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", useSudoNopasswd,
                            8000);
                    verifyHosts = execCommandWithSudoOptimization(target,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", useSudoNopasswd, 8000);
                } else {
                    verifyCfg = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 8000);
                    verifyHosts = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 8000);
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
                                useSudoNopasswd, 10000);
                    } else {
                        configCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'ansible-config dump --only-changed 2>&1 || echo CONFIG_ERROR'", 10000);
                    }

                    // 2. Kiem tra cu phap inventory
                    if (pem != null && !pem.isBlank()) {
                        inventoryCheck = execCommandWithSudoOptimization(target,
                                "bash -lc 'ansible-inventory --list 2>&1 || echo INVENTORY_ERROR'", useSudoNopasswd,
                                10000);
                    } else {
                        inventoryCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'ansible-inventory --list 2>&1 || echo INVENTORY_ERROR'", 10000);
                    }

                    // 3. Kiem tra ket noi ping
                    if (pem != null && !pem.isBlank()) {
                        pingCheck = execCommandWithSudoOptimization(target,
                                "bash -lc 'ansible all -m ping -i /etc/ansible/hosts 2>&1 || echo PING_ERROR'",
                                useSudoNopasswd, 15000);
                    } else {
                        pingCheck = serverService.execCommand(target.getHost(),
                                target.getPort() != null ? target.getPort() : 22,
                                target.getUsername(), sudoPassword,
                                "bash -lc 'ansible all -m ping -i /etc/ansible/hosts 2>&1 || echo PING_ERROR'", 15000);
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

                // Add validation results if available
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
        if (servers == null || servers.isEmpty())
            return null;

        if (host != null && !host.trim().isEmpty()) {
            return servers.stream()
                    .filter(s -> s.getHost().equals(host))
                    .findFirst()
                    .orElse(null);
        }

        if (preferMaster) {
            return servers.stream()
                    .filter(s -> s.getRole() != null && "MASTER".equalsIgnoreCase(s.getRole().toString()))
                    .findFirst()
                    .orElse(servers.get(0));
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

    @PostMapping("/verify/{clusterId}")
    public ResponseEntity<Map<String, Object>> verifyAnsible(@PathVariable Long clusterId,
            @RequestParam(required = false) String host) {
        try {
            var servers = serverService.findByClusterId(clusterId);
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
                            15000);
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

    @GetMapping("/check-sudo/{clusterId}")
    public ResponseEntity<Map<String, Object>> checkSudoNopasswd(@PathVariable Long clusterId,
            @RequestParam(required = false) String host) {
        try {
            var servers = serverService.findByClusterId(clusterId);
            Server target = pickTarget(servers, host, true);

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong tim thay MASTER trong cluster"));
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
                            target.getUsername(), pem, checkCmd, 5000);
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

    @PostMapping("/rollback/{clusterId}")
    public ResponseEntity<Map<String, Object>> rollbackConfig(@PathVariable Long clusterId,
            @RequestParam(required = false) String host,
            @RequestParam String sudoPassword) {
        try {
            var servers = serverService.findByClusterId(clusterId);
            Server target = pickTarget(servers, host, true);

            if (target == null) {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong tim thay MASTER trong cluster"));
            }

            // Uu tien SSH key tu database
            String pem = serverService.resolveServerPrivateKeyPem(target.getId());
            boolean success = true;

            try {
                // Kiem tra file backup co ton tai khong
                String checkBackup = "";
                if (pem != null && !pem.isBlank()) {
                    checkBackup = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg.bak ] && echo OK || echo FAIL'", 8000);
                } else {
                    checkBackup = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -f /etc/ansible/ansible.cfg.bak ] && echo OK || echo FAIL'", 8000);
                }

                if (!checkBackup.trim().equals("OK")) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "success", false,
                            "message", "Khong tim thay file backup de rollback"));
                }

                // Thuc hien rollback
                if (pem != null && !pem.isBlank()) {
                    // Rollback ansible.cfg
                    serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc 'cp -a /etc/ansible/ansible.cfg.bak /etc/ansible/ansible.cfg'", 10000);

                    // Rollback hosts
                    serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc 'cp -a /etc/ansible/hosts.bak /etc/ansible/hosts'", 10000);
                } else {
                    // Rollback ansible.cfg
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc 'cp -a /etc/ansible/ansible.cfg.bak /etc/ansible/ansible.cfg'", 10000);

                    // Rollback hosts
                    serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc 'cp -a /etc/ansible/hosts.bak /etc/ansible/hosts'", 10000);
                }

                // Xac minh rollback thanh cong
                String verifyCfg = "";
                String verifyHosts = "";
                if (pem != null && !pem.isBlank()) {
                    verifyCfg = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 8000);
                    verifyHosts = serverService.execCommandWithKey(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), pem,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 8000);
                } else {
                    verifyCfg = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -s /etc/ansible/ansible.cfg ] && echo OK || echo FAIL'", 8000);
                    verifyHosts = serverService.execCommand(target.getHost(),
                            target.getPort() != null ? target.getPort() : 22,
                            target.getUsername(), sudoPassword,
                            "bash -lc '[ -s /etc/ansible/hosts ] && echo OK || echo FAIL'", 8000);
                }

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
                return ResponseEntity.ok(Map.of(
                        "success", true,
                        "message", "Da rollback cau hinh thanh cong"));
            } else {
                return ResponseEntity.badRequest().body(Map.of(
                        "success", false,
                        "message", "Khong the rollback cau hinh"));
            }

        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of(
                    "success", false,
                    "message", "Loi: " + e.getMessage()));
        }
    }
}
