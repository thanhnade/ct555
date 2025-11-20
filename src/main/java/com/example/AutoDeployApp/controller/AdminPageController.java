package com.example.AutoDeployApp.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.view.RedirectView;

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
	public RedirectView kubernetesPage() {
		// Redirect to overview page
		return new RedirectView("/admin/kubernetes/overview");
	}

	@GetMapping({"/k8s/overview", "/kubernetes/overview"})
	public String kubernetesOverviewPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Cluster Overview");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/kubernetes-overview";
	}

	@GetMapping({"/k8s/nodes", "/kubernetes/nodes"})
	public String kubernetesNodesPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Nodes");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/kubernetes-nodes";
	}

	@GetMapping({"/k8s/workloads", "/kubernetes/workloads"})
	public String kubernetesWorkloadsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		// Default tab
		model.addAttribute("defaultTab", "deployments");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/workloads/deployments", "/kubernetes/workloads/deployments"})
	public String kubernetesDeploymentsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "deployments");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/workloads/statefulsets", "/kubernetes/workloads/statefulsets"})
	public String kubernetesStatefulSetsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "statefulsets");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/workloads/daemonsets", "/kubernetes/workloads/daemonsets"})
	public String kubernetesDaemonSetsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "daemonsets");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/workloads/cronjobs", "/kubernetes/workloads/cronjobs"})
	public String kubernetesCronJobsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "cronjobs");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/workloads/jobs", "/kubernetes/workloads/jobs"})
	public String kubernetesJobsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "jobs");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/workloads/pods", "/kubernetes/workloads/pods"})
	public String kubernetesWorkloadsPodsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Workloads");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "pods");
		return "admin/pages/kubernetes-workloads";
	}

	@GetMapping({"/k8s/service-discovery", "/kubernetes/service-discovery"})
	public String kubernetesServiceDiscoveryPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Service Discovery");
		model.addAttribute("username", getUsernameFromSession(request));
		// Default tab
		model.addAttribute("defaultTab", "services");
		return "admin/pages/kubernetes-service-discovery";
	}

	// Redirect old routes to new Service Discovery page with appropriate tab
	// Redirect tất cả các routes cũ đến trang Service Discovery mới
	@GetMapping({"/k8s/services", "/kubernetes/services"})
	public String kubernetesServicesPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Service Discovery");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "services");
		return "admin/pages/kubernetes-service-discovery";
	}

	@GetMapping({"/k8s/ingress", "/kubernetes/ingress"})
	public String kubernetesIngressPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Service Discovery");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "ingress");
		return "admin/pages/kubernetes-service-discovery";
	}

	// Redirect các routes riêng lẻ cũ đến Service Discovery
	@GetMapping("/kubernetes/services")
	public String kubernetesServicesOldPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Service Discovery");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "services");
		return "admin/pages/kubernetes-service-discovery";
	}

	@GetMapping("/kubernetes/ingress")
	public String kubernetesIngressOldPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Service Discovery");
		model.addAttribute("username", getUsernameFromSession(request));
		model.addAttribute("defaultTab", "ingress");
		return "admin/pages/kubernetes-service-discovery";
	}

	@GetMapping({"/k8s/namespaces", "/kubernetes/namespaces"})
	public String kubernetesNamespacesPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Kubernetes Namespaces");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/kubernetes-namespaces";
	}

	@GetMapping("/deployments")
	public String deploymentsPage(Model model, HttpServletRequest request) {
		model.addAttribute("pageTitle", "Deployment Requests");
		model.addAttribute("username", getUsernameFromSession(request));
		return "admin/pages/deployment-request";
	}
}


