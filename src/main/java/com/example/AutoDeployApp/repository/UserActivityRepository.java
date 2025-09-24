package com.example.AutoDeployApp.repository;

import com.example.AutoDeployApp.entity.UserActivity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserActivityRepository extends JpaRepository<UserActivity, Long> {
    List<UserActivity> findByUserIdOrderByIdDesc(Long userId);
}
