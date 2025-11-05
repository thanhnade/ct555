# 🚀 KẾ HOẠCH NÂNG CẤP: Docker Image Deployment

## 📋 TỔNG QUAN

Hệ thống hiện tại chỉ hỗ trợ deploy Docker image cơ bản với:
- ✅ Port 80 mặc định
- ✅ Resources cố định (128Mi/100m CPU)
- ✅ Không có Environment Variables
- ✅ Không có Health Checks
- ✅ Không có Auto-scaling

**Mục tiêu**: Nâng cấp để hỗ trợ đầy đủ các tính năng production-ready.

---

## 🎯 CÁC NÂNG CẤP CẦN THIẾT (Ưu tiên)

### **🔥 ƯU TIÊN CAO (Phase 1)**

#### 1. **Environment Variables Support** ⭐⭐⭐
**Mức độ quan trọng**: Rất cao  
**Lý do**: Hầu hết ứng dụng cần env vars (database URL, API keys, config...)

**Cần thực hiện**:
- [ ] Thêm field `envVars` vào `Application` entity (JSON column)
- [ ] Cập nhật form frontend để nhập env vars (key-value pairs)
- [ ] Cập nhật `createDeployment()` để inject env vars vào container
- [ ] Validate env vars format

**Database Schema**:
```sql
ALTER TABLE applications ADD COLUMN env_vars TEXT; -- JSON: {"KEY1":"value1","KEY2":"value2"}
```

**API Changes**:
```java
POST /api/applications/upload
{
  "appName": "my-app",
  "dockerImage": "nginx:latest",
  "envVars": {
    "DB_HOST": "mysql",
    "API_KEY": "secret123"
  }
}
```

---

#### 2. **Custom Container Port** ⭐⭐⭐
**Mức độ quan trọng**: Rất cao  
**Lý do**: Nhiều ứng dụng không chạy port 80 (Node.js: 3000, Spring Boot: 8080...)

**Cần thực hiện**:
- [ ] Thêm field `containerPort` vào `Application` entity
- [ ] Cập nhật form để user chọn port (default: 80)
- [ ] Cập nhật `createDeployment()`, `createService()`, `createIngress()` để dùng port tùy chỉnh
- [ ] Validate port range (1-65535)

**Database Schema**:
```sql
ALTER TABLE applications ADD COLUMN container_port INT DEFAULT 80;
```

**Frontend Form**:
```html
<label>Container Port *</label>
<input type="number" id="containerPort" value="80" min="1" max="65535" />
<small>Port mà container lắng nghe (ví dụ: 80, 3000, 8080)</small>
```

---

#### 3. **Health Checks (Liveness & Readiness Probes)** ⭐⭐
**Mức độ quan trọng**: Cao  
**Lý do**: K8s cần biết khi nào container ready và khi nào cần restart

**Cần thực hiện**:
- [ ] Thêm fields: `livenessProbePath`, `readinessProbePath` vào `Application`
- [ ] Cập nhật `createDeployment()` để thêm probes
- [ ] Có thể auto-detect health check path (nếu không có → dùng default)

**Database Schema**:
```sql
ALTER TABLE applications 
  ADD COLUMN liveness_probe_path VARCHAR(200) DEFAULT '/health',
  ADD COLUMN readiness_probe_path VARCHAR(200) DEFAULT '/ready';
```

**K8s Probes**:
```java
// Liveness: Restart container nếu fail
.withNewLivenessProbe()
  .withNewHttpGet()
    .withPath("/health")
    .withPort(new IntOrString(containerPort))
  .endHttpGet()
  .withInitialDelaySeconds(30)
  .withPeriodSeconds(10)
.endLivenessProbe()

// Readiness: Chỉ route traffic khi ready
.withNewReadinessProbe()
  .withNewHttpGet()
    .withPath("/ready")
    .withPort(new IntOrString(containerPort))
  .endHttpGet()
  .withInitialDelaySeconds(5)
  .withPeriodSeconds(5)
.endReadinessProbe()
```

---

### **⚡ ƯU TIÊN TRUNG BÌNH (Phase 2)**

#### 4. **Configurable Resource Limits** ⭐⭐
**Mức độ quan trọng**: Trung bình  
**Lý do**: Cho phép user tùy chỉnh CPU/Memory theo nhu cầu

**Cần thực hiện**:
- [ ] Thêm fields: `cpuRequest`, `cpuLimit`, `memoryRequest`, `memoryLimit` vào `Application`
- [ ] Cập nhật form với preset options (Small/Medium/Large)
- [ ] Validate resource limits (không vượt quá namespace quota)

**Database Schema**:
```sql
ALTER TABLE applications 
  ADD COLUMN cpu_request VARCHAR(20) DEFAULT '100m',
  ADD COLUMN cpu_limit VARCHAR(20) DEFAULT '500m',
  ADD COLUMN memory_request VARCHAR(20) DEFAULT '128Mi',
  ADD COLUMN memory_limit VARCHAR(20) DEFAULT '256Mi';
```

**Preset Options**:
- **Small**: 100m CPU / 128Mi RAM (default)
- **Medium**: 500m CPU / 512Mi RAM
- **Large**: 1000m CPU / 1Gi RAM
- **Custom**: User tự nhập

---

#### 5. **Image Pull Secrets** ⭐⭐
**Mức độ quan trọng**: Trung bình  
**Lý do**: Hỗ trợ pull images từ private Docker registries

**Cần thực hiện**:
- [ ] Thêm field `imagePullSecret` vào `Application`
- [ ] Admin có thể tạo K8s Secret cho Docker registry credentials
- [ ] Cập nhật `createDeployment()` để dùng imagePullSecret nếu có

**Database Schema**:
```sql
ALTER TABLE applications ADD COLUMN image_pull_secret VARCHAR(200);
```

**Admin UI**: Quản lý Docker registry secrets (tạo Secret từ username/password)

---

#### 6. **Replica Count Configuration** ⭐
**Mức độ quan trọng**: Trung bình  
**Lý do**: Cho phép scale ứng dụng theo số replicas

**Cần thực hiện**:
- [ ] Thêm field `replicas` vào `Application` (default: 1)
- [ ] Cập nhật form để chọn số replicas
- [ ] Cập nhật `createDeployment()` để set replicas

**Database Schema**:
```sql
ALTER TABLE applications ADD COLUMN replicas INT DEFAULT 1;
```

---

### **🔧 ƯU TIÊN THẤP (Phase 3)**

#### 7. **Volume Mounts & Persistent Storage** ⭐
**Mức độ quan trọng**: Thấp (chỉ cần cho apps có database/file storage)  
**Lý do**: Một số app cần persistent storage (database files, uploads...)

**Cần thực hiện**:
- [ ] Thêm field `volumeMounts` (JSON) vào `Application`
- [ ] Admin có thể tạo PVC (PersistentVolumeClaim) cho user
- [ ] Cập nhật `createDeployment()` để mount volumes

**Database Schema**:
```sql
ALTER TABLE applications ADD COLUMN volume_mounts TEXT; -- JSON array
```

---

#### 8. **Auto-scaling (HPA)** ⭐
**Mức độ quan trọng**: Thấp (cần monitoring trước)  
**Lý do**: Tự động scale dựa trên CPU/Memory usage

**Cần thực hiện**:
- [ ] Thêm field `enableAutoScaling`, `minReplicas`, `maxReplicas`, `targetCPUUtilization` vào `Application`
- [ ] Tạo HPA resource sau khi deploy
- [ ] Cần cài đặt metrics-server trên K8s cluster

**Database Schema**:
```sql
ALTER TABLE applications 
  ADD COLUMN enable_auto_scaling BOOLEAN DEFAULT FALSE,
  ADD COLUMN min_replicas INT DEFAULT 1,
  ADD COLUMN max_replicas INT DEFAULT 3,
  ADD COLUMN target_cpu_utilization INT DEFAULT 70;
```

---

#### 9. **ConfigMaps & Secrets Support** ⭐
**Mức độ quan trọng**: Thấp  
**Lý do**: Quản lý config files và secrets tốt hơn

**Cần thực hiện**:
- [ ] Cho phép upload config files (tạo ConfigMap)
- [ ] Quản lý secrets (tạo K8s Secret)
- [ ] Mount vào container

---

## 📊 DATABASE SCHEMA CHANGES

### Migration SQL Script

```sql
-- Phase 1: High Priority
ALTER TABLE applications 
  ADD COLUMN env_vars TEXT COMMENT 'JSON format: {"KEY":"value"}',
  ADD COLUMN container_port INT DEFAULT 80 COMMENT 'Container port (1-65535)',
  ADD COLUMN liveness_probe_path VARCHAR(200) DEFAULT '/health',
  ADD COLUMN readiness_probe_path VARCHAR(200) DEFAULT '/ready';

-- Phase 2: Medium Priority
ALTER TABLE applications 
  ADD COLUMN cpu_request VARCHAR(20) DEFAULT '100m',
  ADD COLUMN cpu_limit VARCHAR(20) DEFAULT '500m',
  ADD COLUMN memory_request VARCHAR(20) DEFAULT '128Mi',
  ADD COLUMN memory_limit VARCHAR(20) DEFAULT '256Mi',
  ADD COLUMN image_pull_secret VARCHAR(200),
  ADD COLUMN replicas INT DEFAULT 1;

-- Phase 3: Low Priority (Optional)
ALTER TABLE applications 
  ADD COLUMN volume_mounts TEXT COMMENT 'JSON array of volume mounts',
  ADD COLUMN enable_auto_scaling BOOLEAN DEFAULT FALSE,
  ADD COLUMN min_replicas INT DEFAULT 1,
  ADD COLUMN max_replicas INT DEFAULT 3,
  ADD COLUMN target_cpu_utilization INT DEFAULT 70;
```

---

## 🛠️ IMPLEMENTATION PLAN

### **Phase 1: High Priority (1-2 tuần)**

1. **Update Database Schema**
   - Thêm columns: `env_vars`, `container_port`, `liveness_probe_path`, `readiness_probe_path`

2. **Update Application Entity**
   ```java
   @Column(name = "env_vars", columnDefinition = "TEXT")
   private String envVars; // JSON string
   
   @Column(name = "container_port")
   private Integer containerPort = 80;
   
   @Column(name = "liveness_probe_path")
   private String livenessProbePath = "/health";
   
   @Column(name = "readiness_probe_path")
   private String readinessProbePath = "/ready";
   ```

3. **Update Frontend Form** (`home-user.html`)
   - Thêm input cho container port
   - Thêm section cho environment variables (key-value pairs)
   - Thêm input cho health check paths (optional)

4. **Update Backend APIs**
   - `ApplicationController.uploadApplication()`: Accept env vars và port
   - `ApplicationService.createApplication()`: Validate và lưu config
   - `KubernetesService.createDeployment()`: Inject env vars, set port, add probes

5. **Update KubernetesService**
   ```java
   public String createDeployment(
       String namespace, 
       String deploymentName, 
       String dockerImage, 
       int containerPort,
       Map<String, String> envVars,  // ← NEW
       String livenessProbePath,      // ← NEW
       String readinessProbePath,     // ← NEW
       Long clusterId
   )
   ```

---

### **Phase 2: Medium Priority (1 tuần)**

1. **Resource Limits Configuration**
   - Thêm preset options (Small/Medium/Large)
   - Update form và backend

2. **Image Pull Secrets**
   - Admin UI để quản lý registry secrets
   - Update deployment để dùng secret

3. **Replica Count**
   - Thêm input cho số replicas
   - Update deployment spec

---

### **Phase 3: Low Priority (Tùy chọn)**

1. **Volume Mounts**
2. **Auto-scaling (HPA)**
3. **ConfigMaps & Secrets**

---

## 📝 EXAMPLE: Updated Deployment Creation

```java
// Phase 1 Implementation
public String createDeployment(
    String namespace, 
    String deploymentName, 
    String dockerImage, 
    int containerPort,
    Map<String, String> envVars,
    String livenessProbePath,
    String readinessProbePath,
    Long clusterId
) {
    DeploymentBuilder builder = new DeploymentBuilder()
        .withNewMetadata()
        .withName(deploymentName)
        .withNamespace(namespace)
        .endMetadata()
        .withNewSpec()
        .withReplicas(1)
        .withNewSelector()
        .addToMatchLabels("app", deploymentName)
        .endSelector()
        .withNewTemplate()
        .withNewSpec()
        .addNewContainer()
        .withName(deploymentName)
        .withImage(dockerImage)
        .addNewPort()
        .withContainerPort(containerPort) // ← Custom port
        .endPort();
    
    // Add Environment Variables
    if (envVars != null && !envVars.isEmpty()) {
        for (Map.Entry<String, String> entry : envVars.entrySet()) {
            builder.withEnv(new EnvVarBuilder()
                .withName(entry.getKey())
                .withValue(entry.getValue())
                .build());
        }
    }
    
    // Add Health Checks
    if (livenessProbePath != null) {
        builder.withNewLivenessProbe()
            .withNewHttpGet()
                .withPath(livenessProbePath)
                .withPort(new IntOrString(containerPort))
            .endHttpGet()
            .withInitialDelaySeconds(30)
            .withPeriodSeconds(10)
            .endLivenessProbe();
    }
    
    if (readinessProbePath != null) {
        builder.withNewReadinessProbe()
            .withNewHttpGet()
                .withPath(readinessProbePath)
                .withPort(new IntOrString(containerPort))
            .endHttpGet()
            .withInitialDelaySeconds(5)
            .withPeriodSeconds(5)
            .endReadinessProbe();
    }
    
    builder.endContainer()
        .endSpec()
        .endTemplate()
        .endSpec();
    
    Deployment deployment = builder.build();
    client.apps().deployments().inNamespace(namespace).resource(deployment).create();
    return deploymentName;
}
```

---

## ✅ CHECKLIST

### Phase 1 (High Priority)
- [ ] Database migration: Add env_vars, container_port, probes
- [ ] Update Application entity
- [ ] Update frontend form (env vars + port inputs)
- [ ] Update ApplicationController to accept new fields
- [ ] Update KubernetesService.createDeployment() with env vars & probes
- [ ] Update KubernetesService.createService() with custom port
- [ ] Update KubernetesService.createIngress() with custom port
- [ ] Test với nginx:latest (port 80)
- [ ] Test với node:18-alpine (port 3000)
- [ ] Test với env vars

### Phase 2 (Medium Priority)
- [ ] Database migration: Add resource limits, image pull secret, replicas
- [ ] Update entity và form
- [ ] Implement resource limits configuration
- [ ] Implement image pull secrets management
- [ ] Implement replica count

### Phase 3 (Low Priority - Optional)
- [ ] Volume mounts support
- [ ] HPA (Auto-scaling)
- [ ] ConfigMaps & Secrets

---

## 🎯 KẾT LUẬN

**Ưu tiên thực hiện ngay**: Phase 1 (Environment Variables + Custom Port + Health Checks)

Đây là 3 tính năng quan trọng nhất để hệ thống có thể deploy đa dạng các loại ứng dụng production-ready.

