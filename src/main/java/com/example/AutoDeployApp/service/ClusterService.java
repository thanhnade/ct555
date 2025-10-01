package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Cluster;
import com.example.AutoDeployApp.repository.ClusterRepository;
import com.example.AutoDeployApp.repository.ServerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

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
    public Cluster create(String name, String description) {
        Cluster c = new Cluster();
        c.setName(name);
        c.setDescription(description);
        return clusterRepository.saveAndFlush(c);
    }

    public record ClusterSummary(Long id, String name, String description, String masterNode, int workerCount,
            String status) {
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
            return new ClusterSummary(c.getId(), c.getName(), c.getDescription(), master, workerCount, status);
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
}
