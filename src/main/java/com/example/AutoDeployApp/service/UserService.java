package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.UserEntity;
import com.example.AutoDeployApp.repository.UserRepository;
import com.example.AutoDeployApp.repository.UserActivityRepository;
import com.example.AutoDeployApp.entity.UserActivity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final UserActivityRepository userActivityRepository;

    public UserService(UserRepository userRepository, UserActivityRepository userActivityRepository) {
        this.userRepository = userRepository;
        this.userActivityRepository = userActivityRepository;
    }

    @Transactional
    public UserEntity register(String username, String rawPassword) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Tên đăng nhập đã tồn tại");
        }
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        user.setFullname(username); // Default fullname = username
        user.setRole("USER"); // Default role = USER
        user.setTier("STANDARD"); // Default tier = STANDARD
        user.setStatus("ACTIVE"); // Default status = ACTIVE
        UserEntity saved = userRepository.saveAndFlush(user);
        return saved;
    }

    public Optional<UserEntity> authenticate(String username, String rawPassword) {
        return userRepository.findByUsername(username)
                .filter(u -> passwordEncoder.matches(rawPassword, u.getPassword()))
                .filter(u -> "ACTIVE".equals(u.getStatus())); // Chỉ cho phép user ACTIVE
    }

    public List<UserEntity> findAll() {
        return userRepository.findAll();
    }

    public Optional<UserEntity> findById(Long id) {
        return userRepository.findById(id);
    }

    public Optional<UserEntity> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public Map<Long, UserEntity> findAllByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(ids).stream()
                .collect(Collectors.toUnmodifiableMap(UserEntity::getId, u -> u));
    }

    @Transactional
    public UserEntity createUser(String fullname, String username, String rawPassword, String role, String tier, String status) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Tên đăng nhập đã tồn tại");
        }
        UserEntity user = new UserEntity();
        user.setFullname(fullname != null && !fullname.isBlank() ? fullname : username);
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        user.setRole(role != null && !role.isBlank() ? role : "USER");
        user.setTier(tier != null && !tier.isBlank() ? tier : "STANDARD");
        user.setStatus(status != null && !status.isBlank() ? status : "ACTIVE");
        return userRepository.saveAndFlush(user);
    }

    @Transactional
    public UserEntity updateUser(Long id, String fullname, String role, String tier, String status) {
        UserEntity user = userRepository.findById(id).orElseThrow();
        if (fullname != null && !fullname.isBlank())
            user.setFullname(fullname);
        if (role != null && !role.isBlank())
            user.setRole(role);
        if (tier != null && !tier.isBlank())
            user.setTier(tier);
        if (status != null && !status.isBlank())
            user.setStatus(status);
        return userRepository.saveAndFlush(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }

    @Transactional
    public void resetPassword(Long id, String newRawPassword) {
        UserEntity user = userRepository.findById(id).orElseThrow();
        user.setPassword(passwordEncoder.encode(newRawPassword));
        userRepository.saveAndFlush(user);
    }

    @Transactional
    public void logActivity(UserEntity user, String action, String details, String ip) {
        UserActivity a = new UserActivity();
        a.setUserId(user != null ? user.getId() : null);
        a.setUsername(user != null ? user.getUsername() : null);
        a.setAction(action);
        a.setDetails(details);
        a.setIp(ip);
        userActivityRepository.save(a);
    }

    public List<UserActivity> getActivitiesForUser(Long userId) {
        return userActivityRepository.findByUserIdOrderByIdDesc(userId);
    }
}
