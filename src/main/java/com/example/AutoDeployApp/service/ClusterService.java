package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Server;
import com.example.AutoDeployApp.repository.ServerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ClusterService {

    private final ServerRepository serverRepository;

    public ClusterService(ServerRepository serverRepository) {
        this.serverRepository = serverRepository;
    }

    /**
     * Lấy tất cả server có clusterStatus = "AVAILABLE"
     */
    public List<Server> getAvailableClusterServers() {
        return serverRepository.findByClusterStatus("AVAILABLE");
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
     * 
     * @return true nếu có MASTER và MASTER đang ONLINE trong các server AVAILABLE
     */
    public boolean hasMasterOnline() {
        List<Server> availableServers = serverRepository.findByClusterStatus("AVAILABLE");
        if (availableServers.isEmpty()) {
            return false;
        }

        return availableServers.stream()
                .filter(s -> "MASTER".equals(s.getRole()))
                .anyMatch(s -> s.getStatus() == Server.ServerStatus.ONLINE);
    }

    /**
     * Lấy danh sách server MASTER trong cluster (các server có clusterStatus = "AVAILABLE")
     */
    public List<Server> getMasterServers() {
        return serverRepository.findByClusterStatus("AVAILABLE").stream()
                .filter(s -> "MASTER".equals(s.getRole()))
                .toList();
    }

    /**
     * Lấy danh sách server WORKER trong cluster (các server có clusterStatus = "AVAILABLE")
     */
    public List<Server> getWorkerServers() {
        return serverRepository.findByClusterStatus("AVAILABLE").stream()
                .filter(s -> "WORKER".equals(s.getRole()))
                .toList();
    }

    /**
     * Kiểm tra cluster có server nào không
     * 
     * @return true nếu có ít nhất 1 server với clusterStatus = "AVAILABLE"
     */
    public boolean hasServers() {
        List<Server> availableServers = serverRepository.findByClusterStatus("AVAILABLE");
        return !availableServers.isEmpty();
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
