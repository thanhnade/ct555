package com.example.AutoDeployApp.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.lang.NonNull;

import java.io.IOException;

public class AdminAccessInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
            @NonNull Object handler)
            throws Exception {
        String path = request.getRequestURI();
        HttpSession session = request.getSession(false);
        String role = session != null ? (String) session.getAttribute("USER_ROLE") : null;

        boolean isAdminArea = path.startsWith("/admin");
        boolean isAdminPage = "/home-admin".equals(path);

        // Not logged in
        if (session == null || role == null) {
            if (isAdminArea) {
                writeJson(response, HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized");
            } else if (isAdminPage) {
                response.sendRedirect("/login");
            }
            return false;
        }

        // Logged in but not ADMIN
        if (!"ADMIN".equalsIgnoreCase(role)) {
            if (isAdminArea) {
                writeJson(response, HttpServletResponse.SC_FORBIDDEN, "Forbidden");
            } else if (isAdminPage) {
                response.sendRedirect("/home-user");
            }
            return false;
        }

        return true;
    }

    private void writeJson(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
