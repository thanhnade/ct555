package com.example.AutoDeployApp.repository;

import com.example.AutoDeployApp.entity.Server;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface ServerRepository extends JpaRepository<Server, Long> {
    Optional<Server> findByHostAndUsername(String host, String username);

    // Global check for duplicate server (across all users)
    boolean existsByHostAndPortAndUsername(String host, Integer port, String username);

    @Query("select s from Server s left join fetch s.cluster")
    List<Server> findAllWithCluster();

    List<Server> findByCluster_Id(Long clusterId);

    @Query("select s from Server s left join fetch s.sshKey where s.id = :id")
    Optional<Server> findByIdWithSshKey(@Param("id") Long id);
    
    // Find server by host, port, and username (for duplicate check)
    Optional<Server> findByHostAndPortAndUsername(String host, Integer port, String username);
}
