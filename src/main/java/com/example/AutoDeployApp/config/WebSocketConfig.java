package com.example.AutoDeployApp.config;

import com.example.AutoDeployApp.service.ServerService;
import com.example.AutoDeployApp.service.AnsibleInstallationService;
import com.example.AutoDeployApp.ws.TerminalWebSocketHandler;
import com.example.AutoDeployApp.ws.AnsibleWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ServerService serverService;
    private final AnsibleInstallationService ansibleInstallationService;

    public WebSocketConfig(ServerService serverService, AnsibleInstallationService ansibleInstallationService) {
        this.serverService = serverService;
        this.ansibleInstallationService = ansibleInstallationService;
    }

    @Bean
    public TerminalWebSocketHandler terminalWebSocketHandler() {
        return new TerminalWebSocketHandler(serverService);
    }

    @Bean
    public AnsibleWebSocketHandler ansibleWebSocketHandler() {
        return new AnsibleWebSocketHandler(ansibleInstallationService, serverService);
    }

    @Override
    public void registerWebSocketHandlers(@NonNull WebSocketHandlerRegistry registry) {
        HttpSessionHandshakeInterceptor httpSessionInterceptor = new HttpSessionHandshakeInterceptor();
        try { // copy all HTTP session attributes into WS attributes so handler can read
              // SERVER_PW_CACHE
            java.lang.reflect.Method m = HttpSessionHandshakeInterceptor.class.getMethod("setCopyAllAttributes",
                    boolean.class);
            m.invoke(httpSessionInterceptor, true);
        } catch (Throwable ignored) {
        }
        registry.addHandler(terminalWebSocketHandler(), "/ws/terminal")
                .addInterceptors(httpSessionInterceptor)
                .setAllowedOrigins("*");

        registry.addHandler(ansibleWebSocketHandler(), "/ws/ansible")
                .addInterceptors(httpSessionInterceptor)
                .setAllowedOrigins("*");
    }
}
