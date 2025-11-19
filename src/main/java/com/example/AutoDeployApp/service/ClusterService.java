package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.repository.ServerRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ClusterService {

    private final ServerRepository serverRepository;

    public ClusterService(ServerRepository serverRepository) {
        this.serverRepository = serverRepository;
    }

    /**
     * Tìm MASTER server online đầu tiên trong cluster (các server có clusterStatus = "AVAILABLE")
     * 
     * @return MASTER server đầu tiên có status ONLINE và clusterStatus = "AVAILABLE", hoặc empty nếu không tìm thấy
     */
    public Optional<Server> getFirstHealthyMaster() {
        List<Server> availableServers = serverRepository.findByClusterStatus("AVAILABLE");
        
        if (availableServers.isEmpty()) {
            return Optional.empty();
        }

        // Tìm MASTER node online đầu tiên
        return availableServers.stream()
                .filter(s -> "MASTER".equals(s.getRole()))
                .filter(s -> s.getStatus() == Server.ServerStatus.ONLINE)
                .findFirst();
    }

    /**
     * Kiểm tra cluster có MASTER online không
     * Cluster được định nghĩa là các server có clusterStatus = "AVAILABLE"
     * Tái sử dụng logic từ getFirstHealthyMaster() để tránh duplicate code
     * 
     * @return true nếu có MASTER và MASTER đang ONLINE trong các server AVAILABLE
     */
    public boolean hasMasterOnline() {
        return getFirstHealthyMaster().isPresent();
    }

    /**
     * ClusterSummary record cho tương thích với API
     */
    public record ClusterSummary(Long id, String name, String description, String masterNode, int workerCount,
            String status, Long createdBy) {
    }

    /**
     * Lấy danh sách summary của cluster (với 1 cluster duy nhất, trả về 1 summary)
     * Để tương thích với API hiện tại
     */
    public List<ClusterSummary> listSummaries() {
        List<Server> availableServers = serverRepository.findByClusterStatus("AVAILABLE");
        
        String master = availableServers.stream()
                .filter(s -> "MASTER".equals(s.getRole()))
                .map(Server::getHost)
                .findFirst()
                .orElse("");
        
        int workerCount = (int) availableServers.stream()
                .filter(s -> "WORKER".equals(s.getRole()))
                .count();
        
        // Đánh giá trạng thái đơn giản: có server OFFLINE => WARNING, không có server nào => ERROR, còn lại HEALTHY
        String status;
        if (availableServers.isEmpty()) {
            status = "ERROR";
        } else if (availableServers.stream()
                .anyMatch(s -> s.getStatus() == Server.ServerStatus.OFFLINE)) {
            status = "WARNING";
        } else {
            status = "HEALTHY";
        }
        
        // Với 1 cluster duy nhất, trả về 1 summary với id = 1 (hardcoded)
        return List.of(new ClusterSummary(
                1L,
                "Default Cluster",
                "Single cluster with all servers having clusterStatus = AVAILABLE",
                master,
                workerCount,
                status,
                null
        ));
    }
}
