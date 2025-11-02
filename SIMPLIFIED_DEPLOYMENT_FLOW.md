# Flow Triển khai Đơn giản: Docker Image Deployment

## 📋 Yêu cầu

Form đơn giản chỉ cần:
1. **Tên dự án** (appName)
2. **Docker Hub Image** (dockerImage)

Backend tự động:
- Tạo namespace theo tên người dùng
- Lưu yêu cầu vào database với status = PENDING
- Admin xử lý tạo Deployment, Service, Ingress

---

## 🔄 Flow Hoạt động

### 1. **User Submit Form** (`/home-user`)

**Frontend gửi:**
```javascript
POST /api/applications/upload
FormData:
  - appName: "my-nginx-app"
  - dockerImage: "nginx:latest"
```

**Validation:**
- ✅ `appName` không được để trống
- ✅ `dockerImage` format hợp lệ: `username/image:tag` hoặc `image:tag`

---

### 2. **Backend Lưu vào Database**

**API Endpoint:** `POST /api/applications/upload`

**Xử lý:**
```java
1. Lấy userId từ session/authentication
2. Lấy username từ User entity
3. Validate appName và dockerImage
4. Tạo Application entity:
   - appName: từ form
   - dockerImage: từ form
   - userId: từ session
   - status: PENDING (chờ admin xử lý)
   - k8sNamespace: username (vd: "john_doe")
   - createdAt: now()
5. Lưu vào database
6. Return: { applicationId, message: "Đã gửi yêu cầu, chờ admin xử lý" }
```

**Response:**
```json
{
  "applicationId": 123,
  "status": "PENDING",
  "message": "Yêu cầu của bạn đã được gửi và đang chờ admin xử lý"
}
```

---

### 3. **Admin Xem Yêu cầu** (`/home-admin`)

**API Endpoint:** `GET /api/admin/deployment-requests`

**Response:**
```json
[
  {
    "id": 123,
    "appName": "my-nginx-app",
    "dockerImage": "nginx:latest",
    "userId": 1,
    "username": "john_doe",
    "status": "PENDING",
    "k8sNamespace": "john_doe",
    "createdAt": "2024-01-15T10:30:00"
  }
]
```

**Admin Dashboard hiển thị:**
- Danh sách yêu cầu đang chờ (PENDING)
- Thông tin: App Name, Docker Image, User, Ngày tạo
- Nút "Xử lý" để triển khai

---

### 4. **Admin Xử lý Yêu cầu**

**API Endpoint:** `POST /api/admin/deployment-requests/{id}/process`

**Xử lý:**
```java
1. Load Application từ database (id)
2. Lấy thông tin:
   - dockerImage
   - k8sNamespace (từ username)
   - appName (dùng để tạo resource names)
3. Tạo K8s resources:
   
   a. Ensure Namespace tồn tại:
      - Namespace name: username (vd: "john_doe")
      - Nếu chưa có → tạo mới
   
   b. Tạo Deployment:
      - name: {appName}-{timestamp} hoặc {appName}-{userId}
      - image: dockerImage
      - replicas: 1
      - containerPort: 80 (default, hoặc detect)
   
   c. Tạo Service:
      - name: svc-{appName}-{userId}
      - type: ClusterIP
      - port: 80
      - targetPort: containerPort
   
   d. Tạo Ingress:
      - name: ing-{appName}-{userId}
      - host: {appName}-{username}.local (hoặc custom domain)
      - path: /
      - backend: Service
      - ingressClassName: nginx
   
4. Wait for Deployment ready (timeout: 5 phút)
5. Lấy Ingress URL từ MetalLB EXTERNAL-IP
6. Update Application:
   - status: RUNNING (hoặc ERROR nếu fail)
   - k8sDeploymentName
   - k8sServiceName
   - k8sIngressName
   - accessUrl: http://{EXTERNAL-IP} hoặc http://{subdomain}.local
7. Return success
```

**Response:**
```json
{
  "success": true,
  "applicationId": 123,
  "status": "RUNNING",
  "accessUrl": "http://192.168.56.200",
  "k8sResources": {
    "namespace": "john_doe",
    "deployment": "my-nginx-app-123",
    "service": "svc-my-nginx-app-123",
    "ingress": "ing-my-nginx-app-123"
  }
}
```

---

### 5. **User Xem Kết quả** (`/home-user`)

**API Endpoint:** `GET /api/applications?userId={userId}`

**Response:**
```json
[
  {
    "id": 123,
    "appName": "my-nginx-app",
    "dockerImage": "nginx:latest",
    "status": "RUNNING",
    "accessUrl": "http://192.168.56.200",
    "k8sNamespace": "john_doe",
    "createdAt": "2024-01-15T10:30:00"
  }
]
```

**Frontend hiển thị:**
- Status badge: RUNNING (màu xanh)
- Access URL: click để mở
- Có thể xóa app (sẽ xóa cả K8s resources)

---

## 📊 Entity Structure

### Application.java
```java
@Entity
@Table(name = "applications")
public class Application {
    @Id
    @GeneratedValue
    private Long id;
    
    @Column(nullable = false)
    private String appName;
    
    @Column(nullable = false)
    private String dockerImage;
    
    @ManyToOne
    @JoinColumn(name = "user_id")
    private User user;
    
    @Enumerated(EnumType.STRING)
    private ApplicationStatus status; // PENDING, DEPLOYING, RUNNING, ERROR
    
    @Column(name = "k8s_namespace")
    private String k8sNamespace; // Tên namespace = username
    
    @Column(name = "k8s_deployment_name")
    private String k8sDeploymentName;
    
    @Column(name = "k8s_service_name")
    private String k8sServiceName;
    
    @Column(name = "k8s_ingress_name")
    private String k8sIngressName;
    
    @Column(name = "access_url")
    private String accessUrl; // URL từ Ingress
    
    @Column(name = "error_message")
    private String errorMessage;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    public enum ApplicationStatus {
        PENDING,      // Chờ admin xử lý
        DEPLOYING,    // Đang triển khai lên K8s
        RUNNING,      // Đã chạy thành công
        ERROR         // Lỗi khi triển khai
    }
}
```

---

## 🔌 API Endpoints Cần Triển khai

### User APIs

#### 1. Submit Deployment Request
```
POST /api/applications/upload
Request: FormData
  - appName: string (required)
  - dockerImage: string (required)
Response: {
  applicationId: number,
  status: "PENDING",
  message: string
}
```

#### 2. Get User Applications
```
GET /api/applications?userId={userId}
Response: Application[]
```

#### 3. Get Application Details
```
GET /api/applications/{id}
Response: Application
```

#### 4. Delete Application
```
DELETE /api/applications/{id}
Response: { success: boolean }
  - Xóa cả K8s resources (Deployment, Service, Ingress)
```

---

### Admin APIs

#### 1. Get Pending Requests
```
GET /api/admin/deployment-requests?status=PENDING
Response: Application[]
```

#### 2. Process Deployment Request
```
POST /api/admin/deployment-requests/{id}/process
Response: {
  success: boolean,
  applicationId: number,
  status: "RUNNING" | "ERROR",
  accessUrl: string,
  k8sResources: {...}
}
```

#### 3. Get All Applications (Admin View)
```
GET /api/admin/applications
Response: Application[]
```

---

## 🗂️ Namespace Strategy

**Namespace = Username**

**Ví dụ:**
- User: `john_doe` → Namespace: `john_doe`
- User: `alice_smith` → Namespace: `alice_smith`

**Lợi ích:**
- Tự động isolation giữa các users
- Dễ quản lý và theo dõi
- Resource quota có thể set theo namespace

**Lưu ý:**
- Username có thể chứa ký tự đặc biệt → sanitize cho K8s namespace
  - K8s namespace chỉ cho phép: `[a-z0-9]([-a-z0-9]*[a-z0-9])?`
  - Convert: `john.doe@email.com` → `john-doe-email-com`

---

## 📝 Implementation Checklist

### Phase 1: Backend Core (Entity & API)

- [ ] Tạo `Application.java` entity
- [ ] Tạo `ApplicationRepository.java`
- [ ] Tạo `ApplicationController.java` (User APIs)
  - [ ] `POST /api/applications/upload` - Submit request
  - [ ] `GET /api/applications` - List user apps
  - [ ] `GET /api/applications/{id}` - Get app details
  - [ ] `DELETE /api/applications/{id}` - Delete app
- [ ] Tạo `AdminController.java` (Admin APIs)
  - [ ] `GET /api/admin/deployment-requests` - List pending requests
  - [ ] `POST /api/admin/deployment-requests/{id}/process` - Process request

### Phase 2: Kubernetes Service

- [ ] Tạo `KubernetesService.java`
  - [ ] `ensureNamespace(username)` - Tạo namespace theo username
  - [ ] `createDeployment(namespace, appName, dockerImage)`
  - [ ] `createService(namespace, appName, port)`
  - [ ] `createIngress(namespace, appName, serviceName)`
  - [ ] `getIngressURL(ingressName, namespace)` - Lấy URL từ MetalLB
  - [ ] `deleteApplicationResources(namespace, deploymentName, serviceName, ingressName)`
  - [ ] `waitForDeploymentReady(namespace, deploymentName)` - Đợi deployment ready

### Phase 3: Admin Processing

- [ ] Implement `POST /api/admin/deployment-requests/{id}/process`
  - [ ] Load Application từ DB
  - [ ] Lấy username để tạo namespace
  - [ ] Gọi KubernetesService để tạo resources
  - [ ] Update Application status và metadata
  - [ ] Return kết quả

### Phase 4: Frontend Integration

- [ ] User form chỉ gửi `appName` + `dockerImage` ✅ (Đã xong)
- [ ] Admin dashboard hiển thị pending requests
- [ ] Admin có thể click "Xử lý" để deploy
- [ ] User có thể xem status và URL

---

## 🎯 Next Steps

1. **Triển khai Backend:**
   - Tạo Entity, Repository, Controller
   - Implement KubernetesService
   - Implement Admin processing

2. **Test với Docker images đơn giản:**
   - `nginx:latest`
   - `httpd:alpine`
   - `node:18-alpine`

3. **Verify:**
   - Namespace được tạo đúng theo username
   - Deployment, Service, Ingress được tạo
   - URL truy cập được từ MetalLB

---

## 📚 Notes

- **Namespace isolation**: Mỗi user có namespace riêng, tự động bảo mật và quản lý
- **Admin approval**: Tất cả deployment cần admin xử lý (có thể thay đổi sau thành auto-deploy)
- **Error handling**: Nếu deployment fail, status = ERROR, lưu errorMessage
- **Cleanup**: Khi delete app, xóa cả K8s resources (tránh resource leak)

