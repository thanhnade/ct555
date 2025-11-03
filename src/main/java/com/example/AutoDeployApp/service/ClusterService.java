package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.repository.ClusterRepository;
import com.example.AutoDeployApp.repository.ServerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ClusterService {

    private final ClusterRepository clusterRepository;
    private final ServerRepository serverRepository;

    public ClusterService(ClusterRepository clusterRepository, ServerRepository serverRepository) {
        this.clusterRepository = clusterRepository;
        this.serverRepository = serverRepository;
    }

    public List<Cluster> findAll() {
        return clusterRepository.findAll();
    }

    @Transactional
    public Cluster create(String name, String description, Long createdBy) {
        if (clusterRepository.existsByName(name)) {
            throw new IllegalArgumentException("Tên cluster '" + name + "' đã tồn tại. Vui lòng chọn tên khác.");
        }
        Cluster c = new Cluster();
        c.setName(name);
        c.setDescription(description != null && !description.trim().isEmpty() ? description.trim() : null);
        c.setCreatedBy(createdBy);
        return clusterRepository.saveAndFlush(c);
    }

    public record ClusterSummary(Long id, String name, String description, String masterNode, int workerCount,
            String status, Long createdBy) {
    }

    public List<ClusterSummary> listSummaries() {
        List<Cluster> clusters = clusterRepository.findAll();
        return clusters.stream().map(c -> {
            var servers = serverRepository.findByCluster_Id(c.getId());
            String master = servers.stream()
                    .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER)
                    .map(s -> s.getHost()).findFirst().orElse("");
            int workerCount = (int) servers.stream()
                    .filter(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.WORKER).count();
            // naive status: if any server OFFLINE -> WARNING, if none servers -> ERROR else
            // HEALTHY
            String status;
            if (servers.isEmpty())
                status = "ERROR";
            else if (servers.stream()
                    .anyMatch(s -> s.getStatus() == com.example.AutoDeployApp.entity.Server.ServerStatus.OFFLINE))
                status = "WARNING";
            else
                status = "HEALTHY";
            return new ClusterSummary(c.getId(), c.getName(), c.getDescription() != null ? c.getDescription() : "",
                    master, workerCount, status,
                    c.getCreatedBy());
        }).toList();
    }

    @Transactional
    public void deleteCluster(Long id) {
        // detach servers then delete cluster
        var servers = serverRepository.findByCluster_Id(id);
        for (var s : servers) {
            s.setCluster(null);
        }
        serverRepository.saveAll(servers);
        clusterRepository.deleteById(id);
    }

    /**
     * Chọn cluster HEALTHY đầu tiên (hoặc cluster đầu tiên nếu không có HEALTHY)
     * 
     * @return Cluster đầu tiên có status HEALTHY, hoặc cluster đầu tiên nếu không
     *         có HEALTHY
     */
    public Optional<Cluster> getFirstHealthyCluster() {
        List<Cluster> clusters = clusterRepository.findAll();
        if (clusters.isEmpty()) {
            return Optional.empty();
        }

        // Tìm cluster HEALTHY đầu tiên
        for (Cluster c : clusters) {
            var servers = serverRepository.findByCluster_Id(c.getId());
            if (servers.isEmpty()) {
                continue;
            }

            // Kiểm tra status: nếu tất cả servers đều ONLINE thì HEALTHY
            boolean allOnline = servers.stream()
                    .allMatch(s -> s.getStatus() == com.example.AutoDeployApp.entity.Server.ServerStatus.ONLINE);
            if (allOnline) {
                // Kiểm tra có MASTER không
                boolean hasMaster = servers.stream()
                        .anyMatch(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER);
                if (hasMaster) {
                    return Optional.of(c);
                }
            }
        }

        // Nếu không có HEALTHY, trả về cluster đầu tiên (nếu có)
        return clusters.stream()
                .filter(c -> {
                    var servers = serverRepository.findByCluster_Id(c.getId());
                    return !servers.isEmpty() && servers.stream()
                            .anyMatch(s -> s.getRole() == com.example.AutoDeployApp.entity.Server.ServerRole.MASTER);
                })
                .findFirst();
    }
}
