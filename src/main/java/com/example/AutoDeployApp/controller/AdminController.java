package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.User;
import com.example.AutoDeployApp.entity.UserActivity;
import com.example.AutoDeployApp.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/admin")
public class AdminController {

    private final UserService userService;

    public AdminController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        return userService.findAll().stream()
                .map(u -> Map.<String, Object>of(
                        "id", u.getId(),
                        "username", u.getUsername(),
                        "role", Objects.toString(u.getRole(), "CLIENT"),
                        "dataLimitMb", u.getDataLimitMb(),
                        "pathOnServer", Objects.toString(u.getPathOnServer(), "")))
                .toList();
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestBody Map<String, Object> body) {
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String role = (String) body.getOrDefault("role", "CLIENT");
        Integer dataLimitMb = body.get("dataLimitMb") != null ? ((Number) body.get("dataLimitMb")).intValue() : null;
        String pathOnServer = (String) body.get("pathOnServer");
        User created = userService.createUser(username, password, role, dataLimitMb, pathOnServer);
        return ResponseEntity.ok(Map.of("id", created.getId()));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<?> updateUser(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String role = (String) body.get("role");
        Integer dataLimitMb = body.get("dataLimitMb") != null ? ((Number) body.get("dataLimitMb")).intValue() : null;
        String pathOnServer = (String) body.get("pathOnServer");
        User updated = userService.updateUser(id, role, dataLimitMb, pathOnServer);
        return ResponseEntity.ok(Map.of("id", updated.getId()));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String newPassword = body.get("password");
        userService.resetPassword(id, newPassword);
        return ResponseEntity.ok(Map.of("id", id));
    }

    @GetMapping("/users/{id}/activities")
    public List<UserActivity> activities(@PathVariable Long id) {
        return userService.getActivitiesForUser(id);
    }
}
