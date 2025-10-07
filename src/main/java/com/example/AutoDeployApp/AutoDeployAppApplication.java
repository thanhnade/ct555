package com.example.AutoDeployApp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AutoDeployAppApplication {

	public static void main(String[] args) {
		SpringApplication.run(AutoDeployAppApplication.class, args);
		System.out.println("AutoDeployAppApplication started: http://localhost:8080");
	}
}
