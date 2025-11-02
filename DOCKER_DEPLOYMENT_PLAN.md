# Kế hoạch Triển khai Docker Image Deployment

## 📋 Mục tiêu
Triển khai tính năng deploy ứng dụng từ Docker Hub image lên Kubernetes cluster, tự động tạo Deployment, Service, Ingress và trả về URL truy cập cho người dùng.

## 🎯 Scope (Tập trung Docker Image trước)
- ✅ **Frontend**: Đã sẵn sàng (form Docker image, env vars)
- ⏳ **Backend**: Cần triển khai từ đầu
- ❌ **Fullstack Upload**: Tạm thời ẩn, sẽ làm sau

---

## 🏗️ Kiến trúc Backend Cần Triển khai

### 1. **Entity Layer**

#### 1.1. Application.java
```java
@Entity
@Table(name = "applications")
public class Application {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String appName;
    
    @Column(nullable = false)
    private String dockerImage; // Docker Hub image path
    
    @Column(name = "k8s_namespace")
    private String k8sNamespace; // Kubernetes namespace
    
    @Column(name = "k8s_deployment_name")
    private String k8sDeploymentName;
    
    @Column(name = "k8s_service_name")
    private String k8sServiceName;
    
    @Column(name = "k8s_ingress_name")
    private String k8sIngressName;
    
    @Column(name = "k8s_container_port")
    private Integer k8sContainerPort; // Default: 80
    
    @Column(name = "access_url")
    private String accessUrl; // URL từ Ingress
    
    @Column(name = "environment_variables", columnDefinition = "TEXT")
    private String environmentVariables; // JSON string
    
    @Enumerated(EnumType.STRING)
    private ApplicationStatus status; // PENDING, DEPLOYING, RUNNING, ERROR
    
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
    
    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    public enum ApplicationStatus {
        PENDING, DEPLOYING, RUNNING, ERROR
    }
    
    // Getters/Setters
}
```

### 2. **Repository Layer**

#### 2.1. ApplicationRepository.java
```java
@Repository
public interface ApplicationRepository extends JpaRepository<Application, Long> {
    List<Application> findByUserId(Long userId);
    List<Application> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<Application> findByK8sDeploymentNameAndK8sNamespace(String deploymentName, String namespace);
}
```

### 3. **Service Layer**

#### 3.1. KubernetesService.java
**Mục đích**: Tương tác với Kubernetes cluster để tạo Deployment, Service, Ingress.

**Chức năng chính**:
- `deployApplication()` - Deploy app lên K8s
- `createDeployment()` - Tạo K8s Deployment
- `createService()` - Tạo K8s Service
- `createIngress()` - Tạo K8s Ingress với subdomain
- `waitForDeploymentReady()` - Đợi deployment ready
- `getIngressURL()` - Lấy URL từ Ingress
- `deleteApplicationResources()` - Xóa resources khi xóa app

**Dependencies**:
- Fabric8 Kubernetes Client (đã có trong `pom.xml`)
- Kubeconfig file hoặc Service Account
- Ingress Controller (NGINX)
- MetalLB (để có EXTERNAL-IP)

**Configuration** (application.properties):
```properties
# Kubernetes configuration
k8s.kubeconfig.path=
k8s.default.namespace=apps
k8s.ingress.class=nginx
k8s.ingress.external.ip=
```

#### 3.2. ApplicationService.java
**Mục đích**: Xử lý business logic cho application deployment.

**Chức năng chính**:
- `createDockerDeployment()` - Tạo deployment request từ Docker image
- `processDockerDeployment()` - Xử lý async deployment lên K8s
- `getUserApplications()` - Lấy danh sách apps của user
- `getApplicationStatus()` - Lấy status từ K8s
- `deleteApplication()` - Xóa app và K8s resources

**Flow**:
```
1. User submit form với dockerImage
2. ApplicationService.createDockerDeployment()
   - Tạo Application entity với status = PENDING
   - Parse environment variables
3. Async: ApplicationService.processDockerDeployment()
   - Gọi KubernetesService.deployApplication()
   - Update Application entity với K8s metadata và accessUrl
   - Update status = RUNNING hoặc ERROR
```

### 4. **Controller Layer**

#### 4.1. ApplicationController.java
**Endpoints**:
```
POST   /api/applications/upload
      - Request: FormData (dockerImage, appName, frameworkPreset, env[...])
      - Response: { applicationId, status, message }

GET    /api/applications
      - Query: ?userId={userId}
      - Response: List<Application>

GET    /api/applications/{id}
      - Response: Application details

GET    /api/applications/{id}/status
      - Response: { status, k8sStatus, accessUrl }

GET    /api/applications/{id}/logs
      - Response: Pod logs

DELETE /api/applications/{id}
      - Delete app và K8s resources
```

---

## 🔄 Deployment Flow

### Flow triển khai Docker Image:

```
1. User nhập:
   - Docker Image: nginx:latest
   - App Name: my-nginx-app
   - Environment Variables: (optional)
   
2. Frontend gửi POST /api/applications/upload
   - dockerImage: "nginx:latest"
   - appName: "my-nginx-app"
   - env[0][key]: "PORT"
   - env[0][value]: "8080"
   
3. Backend (ApplicationController):
   - Validate input
   - Parse environment variables
   - Gọi ApplicationService.createDockerDeployment()
   
4. ApplicationService:
   - Tạo Application entity (status = DEPLOYING)
   - Async: Gọi KubernetesService.deployApplication()
   
5. KubernetesService.deployApplication():
   a. Ensure namespace exists (default: "apps")
   b. Generate unique names:
      - deploymentName: "my-nginx-app-{userId}-{timestamp}"
      - serviceName: "svc-my-nginx-app-{userId}-{timestamp}"
      - ingressName: "ing-my-nginx-app-{userId}-{timestamp}"
      - subdomain: "my-nginx-app-{userId}" (hoặc random)
   
   c. Create Deployment YAML:
      - Image: nginx:latest
      - Container Port: 80 (default, hoặc detect từ image)
      - Environment Variables: từ form
      - Replicas: 1
   
   d. Create Service YAML:
      - Type: ClusterIP
      - Port: 80
      - Target Port: container port
   
   e. Create Ingress YAML:
      - Host: {subdomain}.local (hoặc custom domain)
      - Path: /
      - Backend: Service
      - Ingress Class: nginx
   
   f. Apply resources lên K8s cluster
   
   g. Wait for Deployment ready (timeout: 5 minutes)
   
   h. Get Ingress IP/URL:
      - Nếu có MetalLB: lấy EXTERNAL-IP
      - URL: http://{EXTERNAL-IP} hoặc http://{subdomain}.local
   
6. Update Application entity:
   - k8sNamespace, k8sDeploymentName, k8sServiceName, k8sIngressName
   - accessUrl: http://{EXTERNAL-IP} hoặc http://{subdomain}.local
   - status: RUNNING
   
7. Response cho user:
   - applicationId
   - status: "DEPLOYING" (hoặc "RUNNING" nếu nhanh)
   - message: "Đang triển khai..."
   
8. Frontend poll status:
   - GET /api/applications/{id}/status
   - Hiển thị URL khi status = RUNNING
```

---

## 📦 Dependencies Cần Có

### Maven (pom.xml) - ✅ Đã có
```xml
<dependency>
    <groupId>io.fabric8</groupId>
    <artifactId>kubernetes-client</artifactId>
    <version>6.12.0</version>
</dependency>
```

### Kubernetes Cluster Requirements:
1. ✅ Kubernetes cluster (1 master + 2 worker nodes)
2. ✅ NGINX Ingress Controller đã cài
3. ✅ MetalLB đã cài và cấu hình IP pool
4. ✅ Kubeconfig có quyền tạo resources trong namespace "apps"

---

## 🛠️ Implementation Steps

### Phase 1: Core Entity & Repository (30 phút)
- [ ] Tạo `Application.java` entity
- [ ] Tạo `ApplicationRepository.java`
- [ ] Test entity mapping với database

### Phase 2: Kubernetes Service (2-3 giờ)
- [ ] Tạo `KubernetesService.java`
- [ ] Implement `getKubernetesClient()` (kubeconfig hoặc service account)
- [ ] Implement `ensureNamespace()`
- [ ] Implement `createDeployment()` với Fabric8 client
- [ ] Implement `createService()`
- [ ] Implement `createIngress()` với subdomain generation
- [ ] Implement `waitForDeploymentReady()`
- [ ] Implement `getIngressURL()` từ MetalLB EXTERNAL-IP
- [ ] Test với một image đơn giản (nginx:latest)

### Phase 3: Application Service (1-2 giờ)
- [ ] Tạo `ApplicationService.java`
- [ ] Inject `ApplicationRepository` và `KubernetesService`
- [ ] Implement `createDockerDeployment()` - sync
- [ ] Implement `processDockerDeployment()` - async với CompletableFuture
- [ ] Implement `getUserApplications()`
- [ ] Implement `getApplicationStatus()` - query từ K8s
- [ ] Implement `deleteApplication()` - xóa cả K8s resources

### Phase 4: REST Controller (1 giờ)
- [ ] Tạo `ApplicationController.java`
- [ ] Implement `POST /api/applications/upload`
  - Parse FormData
  - Validate dockerImage format
  - Parse environment variables
  - Return applicationId
- [ ] Implement `GET /api/applications` (list user apps)
- [ ] Implement `GET /api/applications/{id}` (app details)
- [ ] Implement `GET /api/applications/{id}/status`
- [ ] Implement `DELETE /api/applications/{id}`

### Phase 5: Testing & Error Handling (1-2 giờ)
- [ ] Test với các Docker images khác nhau:
  - nginx:latest
  - httpd:alpine
  - node:18-alpine (nếu có ENV vars)
- [ ] Error handling:
  - Invalid Docker image format
  - Image pull errors
  - K8s API errors
  - Deployment timeout
  - Ingress không có EXTERNAL-IP
- [ ] Logging cho debugging

### Phase 6: Frontend Integration (30 phút)
- [ ] Test form submission
- [ ] Test polling status
- [ ] Test hiển thị URL
- [ ] Test delete application

---

## 🧪 Testing Checklist

### Manual Testing:
1. ✅ Deploy nginx:latest với appName="test-nginx"
2. ✅ Kiểm tra Deployment được tạo trong namespace "apps"
3. ✅ Kiểm tra Service được tạo
4. ✅ Kiểm tra Ingress được tạo với EXTERNAL-IP
5. ✅ Truy cập URL từ browser
6. ✅ Kiểm tra Application entity trong database
7. ✅ Test với environment variables
8. ✅ Test delete application (xóa cả K8s resources)

### Edge Cases:
- [ ] Docker image không tồn tại trên Docker Hub
- [ ] Container port không phải 80
- [ ] Namespace đã tồn tại
- [ ] Deployment name conflict
- [ ] MetalLB chưa cấp IP (pending)
- [ ] K8s cluster không available

---

## 📝 Notes

### Subdomain Generation:
- Có thể dùng pattern: `{appName}-{userId}` hoặc `{appName}-{hash}`
- Đảm bảo unique trong namespace
- Nếu có custom domain, thay `.local` bằng domain thực tế

### Container Port:
- Mặc định: 80
- Có thể detect từ image labels (nếu có)
- Hoặc để user nhập (nhưng UI chưa có, có thể bỏ qua)

### Environment Variables:
- Parse từ form: `env[0][key]`, `env[0][value]`
- Lưu vào Application entity dưới dạng JSON
- Truyền vào K8s Deployment spec

### Error Handling:
- Nếu deployment fail → status = ERROR, lưu errorMessage
- User có thể xem error trong UI
- Có thể retry hoặc delete và tạo lại

---

## 🚀 Next Steps (Sau khi Docker Image hoàn thành)

1. **Fullstack Upload**:
   - Build Docker image từ uploaded files
   - Push lên Docker Registry (local hoặc Docker Hub)
   - Deploy như Docker image

2. **Advanced Features**:
   - Auto-scaling (HPA)
   - Health checks
   - Resource limits
   - Multiple replicas
   - Blue-Green deployment
   - Logs streaming

---

## 📚 Resources

- Fabric8 Kubernetes Client: https://github.com/fabric8io/kubernetes-client
- K8s Deployment API: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- Ingress API: https://kubernetes.io/docs/concepts/services-networking/ingress/
- MetalLB: https://metallb.universe.tf/

