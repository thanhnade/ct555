# 🎯 ACTION PLAN - BẮT ĐẦU CHUYỂN ĐỔI

## 📍 VỊ TRÍ HIỆN TẠI

✅ **Đã hoàn thành:**
- SSH deployment system hoạt động tốt
- Fullstack application upload và auto URL generation
- Admin và User dashboards
- Docker container deployment (pull từ Docker Hub)
- Kubernetes cluster management (ClusterAdminController)
- Ansible playbooks để setup K8s cluster

🎯 **Bước tiếp theo: Phase 1 - Build Pipeline & Container Registry**

> **💡 Lưu ý quan trọng:** 
> Hiện tại hệ thống đang dùng SSH deployment với **port allocation thủ công** và subdomain phải cấu hình thủ công trên DNS.
> 
> **Với K8s + Ingress:** 
> - ✅ **Tự động cấp địa chỉ**: Ingress tự động tạo subdomain và route traffic
> - ✅ **Không cần quản lý ports**: K8s Service tự động expose app
> - ✅ **Load balancing**: Ingress tự động distribute traffic
> - ✅ **URL sạch**: `https://myapp.apps.example.com` (không cần port number)
> - ✅ **SSL/TLS tự động**: Có thể dùng cert-manager để tự động issue certificates
> 
> Đó là lý do tại sao cần chuyển sang K8s deployment!

---

## 🚀 PHASE 1: BUILD PIPELINE & CONTAINER REGISTRY (1 tuần)

### **Mục tiêu:**
- Setup Docker Registry riêng
- Tự động build Docker images từ source code
- Push images lên registry thay vì dùng Docker Hub

### **Thứ tự thực hiện:**

---

### **BƯỚC 1: Setup Docker Registry** (Ngày 1)

#### 1.1. Chọn và setup Docker Registry server
```bash
# Option 1: Docker Registry đơn giản (khuyến nghị cho MVP)
docker run -d -p 5000:5000 \
  --restart=always \
  --name registry \
  -v registry-data:/var/lib/registry \
  registry:2

# Option 2: Với authentication (production)
mkdir -p /auth
htpasswd -Bbn registryuser registrypass > /auth/htpasswd

docker run -d -p 5000:5000 \
  --restart=always \
  --name registry \
  -v registry-data:/var/lib/registry \
  -v /auth:/auth \
  -e "REGISTRY_AUTH=htpasswd" \
  -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
  -e "REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd" \
  registry:2
```

#### 1.2. Cấu hình registry trong `application.properties`
```properties
# Docker Registry Configuration
docker.registry.url=http://localhost:5000
docker.registry.username=registryuser
docker.registry.password=registrypass
docker.registry.insecure=false  # true nếu dùng HTTP không SSL
```

#### 1.3. Test registry
```bash
# Pull một image test
docker pull alpine:latest

# Tag và push lên registry
docker tag alpine:latest localhost:5000/test/alpine:latest
docker push localhost:5000/test/alpine:latest

# Verify
curl http://localhost:5000/v2/_catalog
```

**Checklist:**
- [ ] Docker Registry đã chạy và accessible
- [ ] Có thể push/pull images thành công
- [ ] Registry URL đã config trong application.properties

---

### **BƯỚC 2: Tạo Dockerfile Templates** (Ngày 1-2)

#### 2.1. Tạo thư mục templates
```
src/main/resources/dockerfile-templates/
├── Dockerfile.nodejs
├── Dockerfile.python
├── Dockerfile.java
├── Dockerfile.react
├── Dockerfile.vue
└── Dockerfile.fullstack
```

#### 2.2. Implement các Dockerfile templates

**Dockerfile.nodejs:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# Custom build command nếu có
ARG BUILD_CMD="npm run build"
RUN ${BUILD_CMD} || echo "No build command"

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app .

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Dockerfile.python:**
```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /app .

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

**Dockerfile.react:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG BUILD_CMD="npm run build"
RUN ${BUILD_CMD}

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || true
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Dockerfile.fullstack:** (Multi-stage)
```dockerfile
# Frontend build
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ARG BUILD_CMD="npm run build"
RUN ${BUILD_CMD}

# Backend build
FROM node:18-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
ARG BUILD_CMD="npm run build"
RUN ${BUILD_CMD} || echo "No backend build"

# Final image
FROM node:18-alpine
WORKDIR /app
COPY --from=frontend-builder /app/frontend/build ./frontend/build
COPY --from=backend-builder /app/backend ./backend
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

EXPOSE 3000 8000
CMD ["node", "backend/dist/index.js"]
```

**Checklist:**
- [ ] Tất cả Dockerfile templates đã được tạo
- [ ] Templates hỗ trợ custom build commands
- [ ] Templates xử lý các trường hợp edge cases

---

### **BƯỚC 3: Tạo DockerBuildService** (Ngày 2-3)

#### 3.1. Tạo service mới: `DockerBuildService.java`

**Location:** `src/main/java/com/example/AutoDeployApp/service/DockerBuildService.java`

**Chức năng:**
- Build Docker image từ source code
- Push image lên registry
- Sử dụng Dockerfile templates dựa trên application type

**Methods cần implement:**
```java
@Service
public class DockerBuildService {
    
    /**
     * Build Docker image từ source code
     */
    public String buildDockerImage(Path sourceDir, Application app) {
        // 1. Chọn Dockerfile template dựa trên app type
        // 2. Copy Dockerfile vào sourceDir
        // 3. Execute: docker build -t {tag} {sourceDir}
        // 4. Return image tag
    }
    
    /**
     * Push image lên registry
     */
    public void pushImageToRegistry(String imageTag, String registryUrl) {
        // docker push {registryUrl}/{imageTag}
    }
    
    /**
     * Chọn Dockerfile template
     */
    private Path getDockerfileTemplate(Application.ApplicationType type) {
        // Return path to appropriate template
    }
    
    /**
     * Generate image tag
     */
    private String generateImageTag(Application app) {
        // Format: {registryUrl}/{username}/{appName}:{version}
        // Version: timestamp hoặc git commit nếu có
    }
}
```

**Checklist:**
- [ ] DockerBuildService đã được tạo
- [ ] Method buildDockerImage() hoạt động
- [ ] Method pushImageToRegistry() hoạt động
- [ ] Error handling và logging đầy đủ

---

### **BƯỚC 4: Cập nhật Database Schema** (Ngày 3)

#### 4.1. Thêm fields vào `Application.java`

```java
@Column(name = "docker_image_tag", length = 500)
private String dockerImageTag;  // Full tag: registry.com/user/app:version

@Column(name = "registry_url", length = 255)
private String registryUrl;  // Registry URL: http://localhost:5000

@Column(name = "image_version", length = 50)
private String imageVersion;  // Version tag: latest, v1.0.0, timestamp

@Column(name = "image_built_at")
private LocalDateTime imageBuiltAt;  // Thời gian build image
```

#### 4.2. Tạo migration script (hoặc dùng JPA auto-update)

**Checklist:**
- [ ] Fields đã được thêm vào Application entity
- [ ] Getter/setter methods
- [ ] Database migration đã chạy thành công

---

### **BƯỚC 5: Cập nhật ApplicationService** (Ngày 3-4)

#### 5.1. Inject DockerBuildService

```java
private final DockerBuildService dockerBuildService;

public ApplicationService(..., DockerBuildService dockerBuildService) {
    ...
    this.dockerBuildService = dockerBuildService;
}
```

#### 5.2. Modify `processDeployment()` method

**Flow mới:**
```
Extract zip → Detect type → Build Docker image → Push to registry → 
Save image tag to DB → Continue với deployment (SSH hoặc K8s)
```

**Code changes:**
```java
private void processDeployment(Long appId, Path zipPath, Path tempDir) {
    // ... existing code until after detectApplicationType ...
    
    // NEW: Build Docker image
    app.setStatus(Application.ApplicationStatus.BUILDING);
    applicationRepository.save(app);
    
    try {
        String imageTag = dockerBuildService.buildDockerImage(extractDir, app);
        dockerBuildService.pushImageToRegistry(imageTag, registryUrl);
        
        // Save image info
        app.setDockerImageTag(imageTag);
        app.setRegistryUrl(registryUrl);
        app.setImageVersion(generateVersion());
        app.setImageBuiltAt(LocalDateTime.now());
        applicationRepository.save(app);
        
        // Continue với deployment (SSH hoặc K8s)
        // ...
    } catch (Exception e) {
        app.setStatus(Application.ApplicationStatus.ERROR);
        app.setErrorMessage("Build image failed: " + e.getMessage());
        applicationRepository.save(app);
    }
}
```

**Checklist:**
- [ ] DockerBuildService đã được inject
- [ ] processDeployment() đã được cập nhật
- [ ] Build image được thực hiện trước khi deploy
- [ ] Error handling khi build fail

---

### **BƯỚC 6: Feature Flag cho Deployment Method** (Ngày 4-5)

#### 6.1. Thêm config trong `application.properties`

```properties
# Deployment Method: ssh hoặc k8s
deployment.method=ssh  # Mặc định: ssh (legacy)

# Kubernetes config (sẽ dùng ở Phase 2)
k8s.enabled=false
k8s.kubeconfig.path=/path/to/kubeconfig
```

#### 6.2. Cập nhật ApplicationService để support cả 2 methods

```java
@Value("${deployment.method:ssh}")
private String deploymentMethod;

private void deployApplication(Application app, ...) {
    if ("k8s".equals(deploymentMethod)) {
        // Deploy to Kubernetes (Phase 2)
        deployToKubernetes(app, ...);
    } else {
        // Legacy SSH deployment
        deployToServer(app, ...);
    }
}
```

**Checklist:**
- [ ] Feature flag đã được config
- [ ] Code hỗ trợ cả SSH và K8s (K8s sẽ implement ở Phase 2)
- [ ] Default là SSH để không break existing functionality

---

### **BƯỚC 7: Testing** (Ngày 5-6)

#### 7.1. Test Build Pipeline

**Test cases:**
1. Upload Node.js app → Build image → Push registry → Verify tag in DB
2. Upload Python app → Build image → Push registry
3. Upload React app → Build image → Push registry
4. Upload Fullstack app → Build image (multi-stage) → Push registry
5. Test với custom build commands
6. Test error handling khi build fail

#### 7.2. Verify Registry

```bash
# List all images
curl http://localhost:5000/v2/_catalog

# List tags của một image
curl http://localhost:5000/v2/{username}/{app}/tags/list
```

**Checklist:**
- [ ] Tất cả application types đã được test
- [ ] Images được push thành công lên registry
- [ ] Image tags được lưu đúng trong database
- [ ] Error cases được handle đúng

---

### **BƯỚC 8: Update UI (Optional - nếu có thời gian)** (Ngày 7)

#### 8.1. Hiển thị image tag trong User Dashboard
- Thêm column "Docker Image" trong project list
- Show image tag và build time

#### 8.2. Admin Dashboard - Registry Management (Sẽ làm ở UI phase)
- List all images trong registry
- View tags của mỗi image
- Delete images (với confirmation)

**Checklist:**
- [ ] UI hiển thị image info (nếu có thời gian)
- [ ] Có thể xem image tag trong project details

---

## 📋 CHECKLIST TỔNG QUAN - PHASE 1

- [ ] **Day 1**: Setup Docker Registry
- [ ] **Day 1-2**: Tạo Dockerfile templates
- [ ] **Day 2-3**: Implement DockerBuildService
- [ ] **Day 3**: Update database schema
- [ ] **Day 3-4**: Integrate vào ApplicationService
- [ ] **Day 4-5**: Feature flag cho deployment method
- [ ] **Day 5-6**: Testing và bug fixes
- [ ] **Day 7**: Optional UI updates

---

## 🌐 INGRESS TRONG KUBERNETES - TẠI SAO QUAN TRỌNG?

### **Hiện tại (SSH Deployment):**

**Cách hoạt động:**
1. App chạy trên server với port cụ thể (vd: port 3000)
2. Phải cấu hình DNS thủ công: `myapp.example.com` → `server-ip:3000`
3. Phải quản lý ports thủ công (allocate, track, conflict)
4. URL có port: `http://myapp.example.com:3000` hoặc `http://server-ip:3000`
5. Load balancing phải setup thủ công (Nginx, HAProxy)
6. SSL/TLS phải cấu hình thủ công cho mỗi app

**Vấn đề:**
- ❌ Phải quản lý ports thủ công
- ❌ Phải cấu hình DNS cho mỗi app
- ❌ Phải setup reverse proxy thủ công
- ❌ Khó scale và load balance

---

### **Với K8s + Ingress:**

**Cách hoạt động:**
1. App chạy trong Pod, expose qua **Service** (ClusterIP/NodePort)
2. **Ingress Controller** (Nginx/Traefik) tự động tạo Ingress rule
3. Ingress tự động route: `myapp.apps.example.com` → Service → Pod
4. **Wildcard DNS**: `*.apps.example.com` → Ingress Controller IP
5. **Không cần quản lý ports**: Mọi app đều dùng standard ports (80/443)
6. **SSL/TLS tự động**: cert-manager tự động issue Let's Encrypt certificates

**Lợi ích:**
- ✅ **Tự động cấp địa chỉ**: Chỉ cần tạo Ingress với subdomain
- ✅ **URL sạch**: `https://myapp.apps.example.com` (không cần port)
- ✅ **Load balancing tự động**: K8s Service tự động load balance
- ✅ **Multi-path routing**: Một Ingress có thể route nhiều paths
- ✅ **SSL/TLS tự động**: cert-manager tự động renew certificates
- ✅ **Centralized management**: Quản lý tất cả apps từ một nơi

---

### **Flow So sánh:**

**SSH Deployment (Hiện tại):**
```
User upload → Build → SSH/SFTP to server → 
Run on port 3000 → Manual DNS config → 
URL: http://myapp.example.com:3000
```

**K8s Deployment (Mục tiêu):**
```
User upload → Build image → Push registry → 
Deploy to K8s (Pod + Service) → Create Ingress → 
Auto DNS (wildcard) → Auto SSL → 
URL: https://myapp.apps.example.com ✅
```

---

### **Ingress Configuration Example:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: user-123
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod  # Auto SSL
spec:
  rules:
  - host: myapp.apps.example.com  # Subdomain tự động
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-service
            port:
              number: 80
  tls:
  - hosts:
    - myapp.apps.example.com
    secretName: myapp-tls  # Auto-generated by cert-manager
```

**Kết quả:**
- ✅ App accessible tại `https://myapp.apps.example.com`
- ✅ SSL certificate tự động được issue và renew
- ✅ Load balancing tự động
- ✅ Không cần quản lý ports

---

## 🔄 NEXT STEPS (Sau Phase 1)

Sau khi hoàn thành Phase 1, tiếp tục với:

### **Phase 2: Kubernetes Platform Integration** (1.5 tuần)
- **Mục tiêu chính**: Deploy apps lên K8s thay vì SSH
- **Lợi ích ngay**: Tự động Service Discovery, không cần quản lý ports
- **Output**: Apps chạy trong Pods, expose qua Services

### **Phase 3: Service Discovery & Ingress Gateway** (0.5 tuần) ⭐ **QUAN TRỌNG**
- **Mục tiêu chính**: Tự động tạo Ingress và cấp địa chỉ
- **Lợi ích**: 
  - ✅ Auto subdomain: `{app-name}.apps.example.com`
  - ✅ Auto SSL/TLS
  - ✅ URL sạch không cần port
  - ✅ Load balancing tự động
- **Output**: Apps accessible qua HTTPS với URL đẹp

### **Phase 4**: Observability (1 tuần)

---

## 📝 NOTES

- Giữ SSH deployment làm default để không break existing functionality
- Test kỹ build pipeline với các loại apps khác nhau
- Document registry URL và authentication cho team
- Có thể deploy registry trên server riêng hoặc cùng server với app

