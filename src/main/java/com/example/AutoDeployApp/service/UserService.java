package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.User;
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
    public User register(String username, String rawPassword) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Tên đăng nhập đã tồn tại");
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        // Role mặc định là CLIENT theo cấu hình entity
        User saved = userRepository.saveAndFlush(user);
        return saved;
    }

    public Optional<User> authenticate(String username, String rawPassword) {
        return userRepository.findByUsername(username)
                .filter(u -> passwordEncoder.matches(rawPassword, u.getPassword()));
    }

    public List<User> findAll() {
        return userRepository.findAll();
    }

    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public Map<Long, User> findAllByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        return userRepository.findAllById(ids).stream()
                .collect(Collectors.toUnmodifiableMap(User::getId, u -> u));
    }

    @Transactional
    public User createUser(String username, String rawPassword, String role, Integer dataLimitMb, String pathOnServer) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Tên đăng nhập đã tồn tại");
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(rawPassword));
        if (role != null && !role.isBlank())
            user.setRole(role);
        if (dataLimitMb != null)
            user.setDataLimitMb(dataLimitMb);
        if (pathOnServer != null)
            user.setPathOnServer(pathOnServer);
        return userRepository.saveAndFlush(user);
    }

    @Transactional
    public User updateUser(Long id, String role, Integer dataLimitMb, String pathOnServer) {
        User user = userRepository.findById(id).orElseThrow();
        if (role != null && !role.isBlank())
            user.setRole(role);
        if (dataLimitMb != null)
            user.setDataLimitMb(dataLimitMb);
        if (pathOnServer != null)
            user.setPathOnServer(pathOnServer);
        return userRepository.saveAndFlush(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }

    @Transactional
    public void resetPassword(Long id, String newRawPassword) {
        User user = userRepository.findById(id).orElseThrow();
        user.setPassword(passwordEncoder.encode(newRawPassword));
        userRepository.saveAndFlush(user);
    }

    @Transactional
    public void logActivity(User user, String action, String details, String ip) {
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
