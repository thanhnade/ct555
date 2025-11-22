package com.example.AutoDeployApp.controller;

import com.example.AutoDeployApp.service.KubernetesService;
import io.fabric8.kubernetes.api.model.Event;
import io.fabric8.kubernetes.api.model.EventList;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/admin/cluster")
public class K8sEventsController {

    private final KubernetesService kubernetesService;

    public K8sEventsController(KubernetesService kubernetesService) {
        this.kubernetesService = kubernetesService;
    }

    private KubernetesClient getKubernetesClient() {
        return kubernetesService.getKubernetesClientForCluster();
    }

    @GetMapping("/k8s/events")
    public ResponseEntity<?> listEvents(
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String involvedObjectKind,
            @RequestParam(required = false) String involvedObjectName,
            @RequestParam(required = false, defaultValue = "100") int limit,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            EventList eventList;
            if (namespace != null && !namespace.trim().isEmpty()) {
                eventList = client.v1().events().inNamespace(namespace).list();
            } else {
                eventList = client.v1().events().inAnyNamespace().list();
            }

            List<Event> filteredEvents = eventList.getItems().stream()
                    .filter(event -> {
                        if (involvedObjectKind != null && !involvedObjectKind.trim().isEmpty()) {
                            if (event.getInvolvedObject() == null ||
                                    !involvedObjectKind.equals(event.getInvolvedObject().getKind())) {
                                return false;
                            }
                        }
                        if (involvedObjectName != null && !involvedObjectName.trim().isEmpty()) {
                            if (event.getInvolvedObject() == null ||
                                    !involvedObjectName.equals(event.getInvolvedObject().getName())) {
                                return false;
                            }
                        }
                        return true;
                    })
                    .sorted((e1, e2) -> {
                        // Sort by lastTimestamp descending (newest first)
                        if (e1.getLastTimestamp() != null && e2.getLastTimestamp() != null) {
                            return e2.getLastTimestamp().compareTo(e1.getLastTimestamp());
                        }
                        return 0;
                    })
                    .limit(limit)
                    .collect(Collectors.toList());

            List<Map<String, Object>> result = filteredEvents.stream()
                    .map(this::parseEventToMap)
                    .collect(Collectors.toList());

            return ResponseEntity.ok(Map.of("events", result, "total", result.size()));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 503 || e.getCode() == 0) {
                return ResponseEntity.status(503).body(Map.of(
                        "error", "Kubernetes API server unavailable",
                        "events", List.of(), "total", 0));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get Events: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/k8s/events/{namespace}/{name}")
    public ResponseEntity<?> getEvent(
            @PathVariable String namespace,
            @PathVariable String name,
            HttpServletRequest request) {
        try (KubernetesClient client = getKubernetesClient()) {
            Event event = client.v1().events().inNamespace(namespace).withName(name).get();
            if (event == null) {
                return ResponseEntity.status(404).body(Map.of("error", "Event not found"));
            }

            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            String output = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(event);
            return ResponseEntity.ok(Map.of("output", output, "format", "json"));
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) {
                return ResponseEntity.status(404).body(Map.of("error", "Event not found"));
            }
            return ResponseEntity.status(500).body(Map.of("error", "Failed to get Event: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> parseEventToMap(Event event) {
        Map<String, Object> map = new HashMap<>();
        map.put("namespace", event.getMetadata() != null ? event.getMetadata().getNamespace() : "");
        map.put("name", event.getMetadata() != null ? event.getMetadata().getName() : "");
        map.put("type", event.getType() != null ? event.getType() : "");
        map.put("reason", event.getReason() != null ? event.getReason() : "");
        map.put("message", event.getMessage() != null ? event.getMessage() : "");
        
        if (event.getInvolvedObject() != null) {
            map.put("involvedObjectKind", event.getInvolvedObject().getKind());
            map.put("involvedObjectName", event.getInvolvedObject().getName());
            map.put("involvedObjectNamespace", event.getInvolvedObject().getNamespace());
        }
        
        map.put("count", event.getCount() != null ? event.getCount() : 0);
        map.put("firstTimestamp", event.getFirstTimestamp() != null ? event.getFirstTimestamp().toString() : "");
        map.put("lastTimestamp", event.getLastTimestamp() != null ? event.getLastTimestamp().toString() : "");
        map.put("age", calculateAge(event.getLastTimestamp() != null ? event.getLastTimestamp().toString() : 
                (event.getFirstTimestamp() != null ? event.getFirstTimestamp().toString() : "")));
        
        return map;
    }

    private String calculateAge(String timestamp) {
        if (timestamp == null || timestamp.isBlank()) {
            return "";
        }
        try {
            var instant = java.time.Instant.parse(timestamp);
            var now = java.time.Instant.now();
            var duration = java.time.Duration.between(instant, now);

            long days = duration.toDays();
            long hours = duration.toHours() % 24;
            long minutes = duration.toMinutes() % 60;

            if (days > 0) {
                return days + "d";
            } else if (hours > 0) {
                return hours + "h";
            } else if (minutes > 0) {
                return minutes + "m";
            } else {
                return "<1m";
            }
        } catch (Exception e) {
            return "";
        }
    }
}

