package com.example.AutoDeployApp.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/admin")
public class AdminPageController {

	private String getUsernameFromSession(HttpServletRequest request) {
		if (request.getSession(false) != null) {
			Object username = request.getSession(false).getAttribute("USER_USERNAME");
			return username != null ? username.toString() : "Admin";
		}
		return "Admin";
	}

	@GetMapping({"", "/"})
	public String index(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Admin Dashboard");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/index";
	}

	@GetMapping("/user")
	public String userPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "User Management");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/user";
	}

	@GetMapping("/server")
	public String serverPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Server Management");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/server-manager";
	}

	@GetMapping("/cluster")
	public String clusterPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Cluster Management");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/cluster";
	}

	@GetMapping("/cluster/assign")
	public String assignServersPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Assign Servers to Cluster");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/assign-servers";
	}

	@GetMapping("/cluster/setup")
	public String clusterSetupPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Cluster Setup");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/cluster-setup";
	}

	@GetMapping({"/k8s", "/kubernetes"})
	public String kubernetesPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Cluster Detail");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/kubernetes";
	}

	@GetMapping({"/k8s/overview", "/kubernetes/overview"})
	public String kubernetesOverviewPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Cluster Overview");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/kubernetes-overview";
	}

	@GetMapping("/deployments")
	public String deploymentsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Deployment Requests");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/deployment-request";
	}
}


