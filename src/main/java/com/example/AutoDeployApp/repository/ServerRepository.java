package com.example.AutoDeployApp.repository;

import com.example.AutoDeployApp.entity.Server;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface ServerRepository extends JpaRepository<Server, Long> {
    Optional<Server> findByHostAndUsername(String host, String username);

    List<Server> findByAddedBy(Long addedBy);

    Optional<Server> findByHostAndUsernameAndAddedBy(String host, String username, Long addedBy);
}
