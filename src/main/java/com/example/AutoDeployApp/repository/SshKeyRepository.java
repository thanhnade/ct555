package com.example.AutoDeployApp.repository;

import com.example.AutoDeployApp.entity.SshKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SshKeyRepository extends JpaRepository<SshKey, Long> {
    List<SshKey> findByUserId(Long userId);

    List<SshKey> findByServer_Id(Long serverId);
}
