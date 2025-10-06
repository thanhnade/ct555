package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.SshKey;
import com.example.AutoDeployApp.repository.SshKeyRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/admin/ssh-keys")
public class SshKeyAdminController {

    private final SshKeyRepository sshKeyRepository;

    public SshKeyAdminController(SshKeyRepository sshKeyRepository) {
        this.sshKeyRepository = sshKeyRepository;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        List<SshKey> keys = sshKeyRepository.findAll();
        return keys.stream().map(k -> {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", k.getId());
            m.put("keyType", k.getKeyType() != null ? k.getKeyType().name() : "RSA");
            m.put("keyLength", k.getKeyLength());
            m.put("status", k.getStatus() != null ? k.getStatus().name() : "ACTIVE");
            m.put("userId", k.getUserId());
            if (k.getServer() != null && k.getServer().getId() != null)
                m.put("serverId", k.getServer().getId());
            return m;
        }).toList();
    }
}
