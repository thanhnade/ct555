package com.example.AutoDeployApp.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    @GetMapping({ "/", "/login" })
    public String loginPage() {
        return "login"; // resolves to resources/templates/login.html
    }

    @GetMapping("/home-user")
    public String homeUser(HttpServletRequest request, Model model) {
        Object username = request.getSession(false) != null ? request.getSession(false).getAttribute("USER_USERNAME")
                : null;
        model.addAttribute("username", username != null ? username : "Guest");
        return "home-user";
    }

    @GetMapping("/home-admin")
    public String homeAdmin(HttpServletRequest request, Model model) {
        Object username = request.getSession(false) != null ? request.getSession(false).getAttribute("USER_USERNAME")
                : null;
        model.addAttribute("username", username != null ? username : "Guest");
        return "home-admin";
    }
}
