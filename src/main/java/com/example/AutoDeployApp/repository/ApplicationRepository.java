package com.example.AutoDeployApp.repository;

import com.example.AutoDeployApp.entity.Application;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ApplicationRepository extends JpaRepository<Application, Long> {
    List<Application> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Application> findByStatusOrderByCreatedAtDesc(String status);

    List<Application> findAllByOrderByCreatedAtDesc();
}
