package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.entity.User;
import com.example.AutoDeployApp.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.stream.Collectors;
import java.util.List;
import jakarta.servlet.http.HttpServletRequest;

@Controller
@RequestMapping("/auth")
public class AuthController {

        private final UserService userService;

        public AuthController(UserService userService) {
                this.userService = userService;
        }

        @PostMapping("/register")
        @ResponseBody
        public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
                String username = body.get("username");
                String password = body.get("password");
                User created = userService.register(username, password);
                return ResponseEntity.ok(Map.of(
                                "id", created.getId(),
                                "username", created.getUsername(),
                                "role", created.getRole()));
        }

        @PostMapping("/login")
        @ResponseBody
        public ResponseEntity<?> login(@RequestBody Map<String, String> body,
                        @RequestHeader(value = "X-Forwarded-For", required = false) String xff,
                        @RequestHeader(value = "X-Real-IP", required = false) String xri,
                        HttpServletRequest request) {
                String username = body.get("username");
                String password = body.get("password");
                return userService.authenticate(username, password)
                                .map(user -> {
                                        String ip = xff != null ? xff : (xri != null ? xri : null);
                                        userService.logActivity(user, "LOGIN", "Đăng nhập thành công", ip);
                                        var session = request.getSession(true);
                                        session.setAttribute("USER_ID", user.getId());
                                        session.setAttribute("USER_USERNAME", user.getUsername());
                                        session.setAttribute("USER_ROLE", user.getRole());
                                        String redirectPath = user.getRole() != null
                                                        && user.getRole().equalsIgnoreCase("ADMIN")
                                                                        ? "/admin"
                                                                        : "/home-user";
                                        return ResponseEntity.ok(Map.of(
                                                        "redirect", redirectPath,
                                                        "role", user.getRole()));
                                })
                                .orElseGet(() -> ResponseEntity.status(401)
                                                .body(Map.of("message", "Tên đăng nhập hoặc mật khẩu không đúng")));
        }

        @GetMapping("/logout")
        public String logout(
                        @RequestHeader(value = "X-Forwarded-For", required = false) String xff,
                        @RequestHeader(value = "X-Real-IP", required = false) String xri,
                        HttpServletRequest request) {
                var session = request.getSession(false);
                if (session != null) {
                        String username = (String) session.getAttribute("USER_USERNAME");
                        userService.findByUsername(username).ifPresent(u -> {
                                String ip = xff != null ? xff : (xri != null ? xri : null);
                                userService.logActivity(u, "LOGOUT", "Đăng xuất", ip);
                        });
                        session.invalidate();
                }
                return "redirect:/login";
        }

        @GetMapping("/users")
        @ResponseBody
        public ResponseEntity<?> listUsers() {
        // Chỉ trả về id, username và role
                List<Map<String, Object>> users = userService.findAll().stream()
                                .map(u -> Map.<String, Object>of(
                                                "id", u.getId(),
                                                "username", u.getUsername(),
                                                "role", u.getRole()))
                                .collect(Collectors.toList());
                return ResponseEntity.ok(users);
        }
}
