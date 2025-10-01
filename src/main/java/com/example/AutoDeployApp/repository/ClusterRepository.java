package com.example.AutoDeployApp.repository;

import com.example.AutoDeployApp.entity.Cluster;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClusterRepository extends JpaRepository<Cluster, Long> {
}
