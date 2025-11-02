# KẾ HOẠCH CHUYỂN ĐỔI: TỪ MANUAL SSH → PAAS TRÊN KUBERNETES

> **📌 Lưu ý**: Hệ thống hiện tại đã hoàn thành các tính năng cơ bản:
> - ✅ Upload fullstack applications (frontend + backend + database)
> - ✅ Auto URL generation và trả về cho user (`{subdomain}.domain.com`)
> - ✅ Admin dashboard: Quản lý users, servers, deployment requests, cluster resources
> - ✅ User dashboard: Xem danh sách apps, status, URL truy cập
> - ✅ Real-time notifications qua WebSocket
> 
> Kế hoạch này tập trung vào việc **nâng cấp lên PaaS platform trên Kubernetes** để tự động hóa hoàn toàn và scale tốt hơn.

---

## 🎯 MỤC TIÊU CHUYỂN ĐỔI

**Từ**: Hệ thống manual deployment qua SSH/SFTP (✅ đã hoàn thành)  
**Sang**: Platform as a Service (PaaS) tự động trên Kubernetes

Hệ thống sẽ chuyển từ việc admin/user phải quản lý server thủ công sang một platform tự động hóa hoàn toàn, nơi:
- User chỉ cần upload code → Hệ thống tự động build, package, và deploy
- Không cần quan tâm đến server infrastructure
- Tự động scaling, monitoring, và recovery
- Multi-tenancy với namespace isolation

---

## 📊 PHÂN TÍCH GAP

### Hiện trạng (Manual SSH Deployment) - ĐÃ HOÀN THÀNH
- ✅ **Fullstack Application Upload**: Upload và detect fullstack apps (frontend + backend + database)
- ✅ **Auto URL Generation**: Trả về đường dẫn truy cập tự động cho người dùng (`{subdomain}.domain.com`)
- ✅ **Monitoring & Management**: 
  - Admin: Quản lý users, servers, deployment requests, cluster resources
  - User: Xem danh sách apps, status, URL truy cập của mình
- ✅ Deployment trực tiếp qua SSH/SFTP
- ✅ Docker container đơn giản (docker run trên server)
- ✅ Pull image từ Docker Hub công khai
- ✅ Subdomain tự động (generated)
- ✅ Admin dashboard để quản lý và giám sát
- ✅ User dashboard để xem applications
- ✅ User phải chờ admin approve deployment requests (CLIENT role)
- ✅ Có khả năng setup K8s cluster (Ansible playbooks)
- ✅ Có ClusterAdminController để quản lý K8s infrastructure
- ⚠️ Chưa deploy ứng dụng lên K8s (vẫn dùng SSH deployment)
- ❌ Không có Docker Registry riêng (dùng Docker Hub)
- ❌ Không có Ingress tự động trên K8s
- ❌ Không có Monitoring/Logging tập trung (có basic status tracking)
- ❌ Không có auto-scaling
- ❌ Resource management thủ công (chưa có metrics collection)

### Mục tiêu (PaaS trên Kubernetes)
- 🎯 **Build Pipeline tự động**: Build Docker image từ source code
- 🎯 **Container Registry riêng**: Lưu trữ và quản lý images
- 🎯 **Kubernetes-native deployment**: Pod, Service, Ingress tự động
- 🎯 **Multi-tenancy**: Namespace isolation theo user
- 🎯 **Auto-scaling**: HPA dựa trên CPU/Memory
- 🎯 **Service Discovery**: Internal service communication tự động
- 🎯 **Ingress Gateway**: Subdomain tự động với SSL/TLS
- 🎯 **Monitoring & Observability**: Prometheus + Grafana
- 🎯 **Logging tập trung**: Centralized log aggregation
- 🎯 **Self-service**: User tự deploy không cần admin can thiệp
- 🎯 **Resource Quota**: Quản lý tài nguyên tự động

---

## 🔄 CHIẾN LƯỢC MIGRATION

### Approach: Phased Migration với Backward Compatibility

1. **Song song 2 hệ thống**: Giữ SSH deployment làm fallback, thêm K8s deployment mới
2. **Feature flag**: Cho phép chọn deployment method (legacy hoặc K8s)
3. **Migration tool**: Chuyển apps hiện tại từ SSH → K8s tự động
4. **Gradual rollout**: Deploy mới lên K8s, apps cũ chạy trên SSH cho đến khi migrate

### Migration Path cho Existing Applications

```
┌─────────────────────────────────────────┐
│   Existing Apps (SSH Deployment)       │
│   - Continue running on SSH servers    │
│   - No disruption                      │
└──────────────┬──────────────────────────┘
               │
               │ Migration Tool
               ▼
┌─────────────────────────────────────────┐
│   New Apps (K8s Deployment)            │
│   - Auto-deployed to Kubernetes        │
│   - Full PaaS features                  │
└─────────────────────────────────────────┘
```

---

## 🗺️ ROADMAP CHUYỂN ĐỔI (4 TUẦN)

### **GIAI ĐOẠN 1: Build Pipeline & Container Registry (1 tuần)**

#### Mục tiêu
- **Tạo build pipeline tự động**: Từ source code → Docker image
- **Setup Container Registry**: Lưu trữ images riêng (thay vì Docker Hub)
- **Tự động hóa packaging**: Không cần user phải tự build image

#### Tasks (Rút gọn cho 1 tuần)
1. **Setup Docker Registry (Đơn giản hóa)**
   - Sử dụng Docker Registry đơn giản (không cần Harbor - quá phức tạp)
   - Deploy bằng docker run hoặc docker-compose
   - Basic authentication (htpasswd)
   - Namespace: `{username}/{app-name}:{version}`

2. **Build Docker Image từ source code (Tối ưu)**
   - Tạo Dockerfile templates cho các loại ứng dụng:
     - `Dockerfile.nodejs` - Node.js/Express
     - `Dockerfile.python` - Python/Django/Flask
     - `Dockerfile.java` - Java/Spring Boot
     - `Dockerfile.react` - React (nginx)
     - `Dockerfile.vue` - Vue.js (nginx)
     - `Dockerfile.fullstack` - Multi-stage build
   - Build image từ source code sau khi extract
   - Tag image: `registry.example.com/{username}/{app-name}:{version}`
   - Push lên registry

3. **Cập nhật ApplicationService**
   - Thêm method `buildDockerImage(Path sourceDir, Application app)`
   - Thêm method `pushImageToRegistry(String imageTag, String registryUrl)`
   - Update `processDeployment()` để build image thay vì upload trực tiếp

4. **Database Entity**
   - Thêm field `dockerImageTag` vào `Application`
   - Thêm field `registryUrl`
   - Thêm field `imageVersion`

#### Công nghệ
- Harbor Registry hoặc Docker Registry
- Docker BuildKit
- Maven/Gradle/NPM để build

---

### **GIAI ĐOẠN 2: Kubernetes Platform Integration (1.5 tuần)**

#### Mục tiêu
- **Thay thế SSH deployment**: Deploy lên K8s cluster (không còn SSH/SFTP)
- **Platform tự động**: Tự động tạo và quản lý K8s resources
- **Self-service**: User deploy trực tiếp, không cần admin approve
- **Namespace isolation**: Mỗi user có namespace riêng

#### Tasks (Rút gọn cho 1.5 tuần)
1. **Kubernetes Client Integration (MVP)**
   - Add dependency: `io.fabric8:kubernetes-client`
   - Tạo `KubernetesService` cơ bản
   - Lưu kubeconfig của cluster chính vào database
   - ⏸️ Support multiple clusters (làm sau)

2. **Tạo Kubernetes Resources (Tối thiểu)**
   - **Namespace**: Tạo namespace riêng cho mỗi user
     - Format: `user-{userId}` hoặc `app-{appId}`
     - RBAC: User chỉ truy cập namespace của mình
   
   - **Deployment**: Tạo Deployment manifest
     ```yaml
     - Replicas: 1 (có thể scale)
     - Image: Từ registry
     - Environment variables: Từ form
     - Resource limits: CPU, Memory theo quota user
     - Health checks: livenessProbe, readinessProbe
     ```
   
   - **Service**: Tạo ClusterIP Service
     - Internal communication
     - Port mapping
   
   - **Ingress**: Tạo Ingress cho external access
     - Subdomain tự động: `{subdomain}.apps.example.com`
     - SSL/TLS certificates (Let's Encrypt)
     - Path-based routing nếu cần

3. **Update ApplicationService**
   - Thay thế `deployToServer()` bằng `deployToKubernetes()`
   - Method `createNamespace(String namespace)`
   - Method `createDeployment(Application app, String namespace)`
   - Method `createService(Application app, String namespace)`
   - Method `createIngress(Application app, String namespace)`

4. **Database Updates**
   - Thêm field `namespace` vào `Application`
   - Thêm field `k8sClusterId` (liên kết với Server có role K8S)
   - Thêm bảng `k8s_resources` để lưu resource names

5. **Rollback và Update (Đơn giản hóa)**
   - Basic rolling update (K8s default)
   - ⏸️ Version control chi tiết (làm sau)

#### Công nghệ
- Kubernetes Java Client
- Nginx Ingress Controller (đơn giản nhất)
- ⏸️ cert-manager (có thể làm sau, dùng manual cert trước)

---

### **GIAI ĐOẠN 3: Service Discovery & Ingress Gateway (0.5 tuần)**

#### Mục tiêu
- **Service Discovery**: Tự động expose ứng dụng qua Ingress
- **Subdomain tự động**: `{subdomain}.apps.example.com` (không cần manual setup)
- **Load Balancing**: Ingress tự động distribute traffic
- **SSL/TLS**: Tự động hoặc manual (có thể dùng cert-manager sau)

#### Tasks
1. **Ingress Auto-creation**
   - Tạo Ingress rule khi deploy app
   - Mapping subdomain → Service
   - Update accessUrl trong database

2. **Subdomain Management**
   - Generate subdomain tự động (đã có)
   - Validate uniqueness
   - DNS record (có thể manual hoặc dùng external-dns sau)

#### Công nghệ
- Nginx Ingress Controller
- Wildcard DNS: `*.apps.example.com`

---

### **GIAI ĐOẠN 4: Observability & Monitoring (1 tuần)**

#### Mục tiêu
- **Metrics Collection**: Thu thập CPU, Memory, Requests từ pods
- **Status Dashboard**: Hiển thị health của applications
- **Basic Alerting**: Thông báo khi pod down hoặc resource issues
- **Visibility**: User và Admin có thể xem metrics/logs

#### Tasks (Tối thiểu)
1. **Prometheus Setup (Cơ bản)**
   - Deploy Prometheus đơn giản
   - Scrape pod metrics mặc định (CPU, Memory)
   - ⏸️ Grafana (có thể setup sau)
   - ⏸️ Custom metrics (làm sau)

2. **Basic Status Display**
   - Pod status trong Application entity
   - CPU/Memory usage từ K8s API
   - Display trong UI dashboard

3. **Simple Alerting**
   - Alert khi pod down (qua WebSocket notification)
   - ⏸️ Advanced alerting rules (làm sau)

#### Công nghệ (Tối thiểu)
- Prometheus (standalone, không cần operator)
- Kubernetes Metrics API
- ⏸️ Grafana, Loki, ELK (làm sau)

---

### **GIAI ĐOẠN 5: Advanced Features (⏸️ TẠM HOÃN)**

#### Mục tiêu
- Auto-scaling
- Health checks và auto-restart
- Blue-Green / Canary deployment
- CI/CD integration

#### Tasks
1. **Horizontal Pod Autoscaler (HPA)**
   - Auto-scale dựa trên CPU/Memory usage
   - Config min/max replicas
   - Custom metrics nếu cần

2. **Health Checks**
   - Liveness probe: Restart nếu app crash
   - Readiness probe: Chỉ route traffic khi ready
   - Startup probe: Cho phép thời gian khởi động lâu

3. **Deployment Strategies**
   - Blue-Green deployment
   - Canary deployment
   - Rolling update (đã có, cải thiện)

4. **CI/CD Integration (Optional)**
   - Webhook để trigger build từ Git
   - Auto-deploy khi push code
   - Build pipeline

5. **Multi-environment**
   - Support staging và production
   - Environment-specific config

#### Công nghệ
- Kubernetes HPA
- Argo Rollouts (cho advanced deployment)
- Git webhooks

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Docker Registry (1 tuần)
- [ ] Setup Docker Registry đơn giản (docker-compose)
- [ ] Configure basic authentication
- [ ] Create Dockerfile templates (5 loại)
- [ ] Implement build image logic
- [ ] Implement push to registry
- [ ] Update database schema (dockerImageTag, registryUrl)
- [ ] Testing build và push

### Phase 2: Kubernetes Deployment (1.5 tuần)
- [ ] Add kubernetes-client dependency
- [ ] Create KubernetesService
- [ ] Implement namespace creation (auto per user)
- [ ] Implement Deployment creation
- [ ] Implement Service creation
- [ ] Replace deployToServer() với deployToKubernetes()
- [ ] Setup Ingress Controller (Nginx)
- [ ] Testing deployment

### Phase 3: Service Discovery & Gateway (0.5 tuần)
- [ ] Implement Ingress creation tự động (service discovery)
- [ ] Generate và validate subdomain (platform-managed)
- [ ] Update accessUrl với subdomain tự động
- [ ] DNS configuration (wildcard hoặc manual)
- [ ] Testing Ingress routing và load balancing

### Phase 4: Observability (1 tuần)
- [ ] Deploy Prometheus đơn giản (platform monitoring)
- [ ] Configure scrape K8s pods (auto-discovery)
- [ ] Get pod status và metrics từ K8s API
- [ ] Display status và metrics trong UI (user dashboard)
- [ ] Basic alerting (pod down, resource issues)
- [ ] **PaaS feature**: Health checks tự động
- [ ] Testing monitoring pipeline

### Phase 5: Advanced PaaS Features (⏸️ Tạm hoãn)
- [ ] Resource Quota management (auto quota enforcement)
- [ ] Grafana dashboards (advanced visualization)
- [ ] Advanced alerting (AlertManager rules)
- [ ] HPA auto-scaling (platform auto-scale)
- [ ] Blue-Green deployment (zero-downtime)
- [ ] CI/CD integration (Git webhooks)
- [ ] Database service provision (MySQL/PostgreSQL as a service)
- [ ] Backup & Restore automation

---

## 🏗️ KIẾN TRÚC PAAS PLATFORM

### Platform Components

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                         │
│  (Upload App → Auto Build → Auto Deploy → Monitor)       │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              PLATFORM API LAYER                          │
│  - ApplicationController (API gateway)                   │
│  - DeploymentManager (orchestration)                    │
└──────────────────┬───────────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
       ▼                       ▼
┌──────────────┐      ┌──────────────────┐
│ BUILD PIPELINE│      │ DEPLOYMENT ENGINE│
│ - Extract     │      │ - Kubernetes     │
│ - Analyze     │      │ - Namespace Mgmt │
│ - Build Image │      │ - Resource Create│
│ - Push Registry│     │ - Service Disc.  │
└──────────────┘      └──────────────────┘
       │                       │
       └───────────┬───────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│            KUBERNETES CLUSTER (Platform)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Namespace:   │  │ Namespace:   │  │ Namespace:   │ │
│  │ user-1       │  │ user-2       │  │ user-3       │ │
│  │ - App 1      │  │ - App 1      │  │ - App 1      │ │
│  │ - App 2      │  │ - App 2      │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  Ingress Controller (Gateway)                           │
│  - *.apps.example.com → Apps                           │
└─────────────────────────────────────────────────────────┘
```

### Service Layer Updates

```java
// Platform Services
- DockerBuildService      // Build pipeline: source → image
- DockerRegistryService   // Container registry operations
- KubernetesService       // Platform deployment engine
- NamespaceService        // Multi-tenancy management
- IngressService         // Service discovery & routing
- MonitoringService      // Metrics collection
- LoggingService         // Log aggregation
```

### Thay đổi Deployment Flow

**CŨ (SSH Manual):**
```
User upload → Admin approve → SFTP to server → 
SSH commands → Manual port management → Manual subdomain
```

**MỚI (PaaS Auto):**
```
User upload → Auto build image → Push registry → 
Auto deploy to K8s → Auto create Service/Ingress → 
Auto assign subdomain → Ready!
```

### Database Schema Updates

```sql
-- New tables
CREATE TABLE docker_images (
    id BIGINT PRIMARY KEY,
    application_id BIGINT,
    image_tag VARCHAR(255),
    registry_url VARCHAR(255),
    version VARCHAR(50),
    built_at TIMESTAMP
);

CREATE TABLE k8s_resources (
    id BIGINT PRIMARY KEY,
    application_id BIGINT,
    namespace VARCHAR(100),
    resource_type VARCHAR(50), -- Deployment, Service, Ingress
    resource_name VARCHAR(255),
    cluster_id BIGINT
);

CREATE TABLE user_quotas (
    id BIGINT PRIMARY KEY,
    user_id BIGINT,
    cpu_limit VARCHAR(50),
    memory_limit VARCHAR(50),
    storage_limit VARCHAR(50),
    pod_limit INT
);

CREATE TABLE resource_metrics (
    id BIGINT PRIMARY KEY,
    application_id BIGINT,
    timestamp TIMESTAMP,
    cpu_usage DECIMAL(10,2),
    memory_usage BIGINT,
    request_count INT
);
```

---

## ⚠️ RISKS & MITIGATION

### Risk 1: Migration từ SSH Deployment sang PaaS K8s
- **Risk**: Ứng dụng đang chạy có thể bị gián đoạn khi migrate
- **Mitigation**: 
  - **Dual mode**: Chạy song song SSH và K8s trong transition period
  - **Feature flag**: Cho phép chọn deployment method (legacy hoặc PaaS)
  - **Migration tool**: Automated tool để migrate apps từ SSH → K8s
  - **Gradual migration**: Migrate từng app một, test thoroughly
  - **Rollback plan**: Có thể rollback về SSH nếu K8s có vấn đề

### Risk 2: Learning curve và complexity
- **Risk**: Team cần học K8s, DevOps practices
- **Mitigation**:
  - Training và documentation đầy đủ
  - Start với simple cases, gradually add complexity
  - Community support và best practices

### Risk 3: Infrastructure costs
- **Risk**: K8s cluster cần nhiều resources hơn
- **Mitigation**:
  - Resource quotas để control costs
  - Start với small cluster, scale when needed
  - Monitor và optimize resource usage

### Risk 2: Complexity tăng cao
- **Risk**: Hệ thống phức tạp hơn, khó maintain
- **Mitigation**:
  - Documentation đầy đủ
  - Unit tests và integration tests
  - Monitoring để phát hiện lỗi sớm

### Risk 3: Performance và Cost
- **Risk**: K8s overhead, resource usage cao hơn
- **Mitigation**:
  - Resource limits và quotas
  - Monitoring để optimize
  - Cost tracking

---

## 📅 TIMELINE TỔNG THỂ (4 TUẦN - RÚT GỌN)

| Giai đoạn | Thời gian | Phụ thuộc | Ưu tiên |
|-----------|-----------|-----------|---------|
| Phase 1: Docker Registry & Build | 1 tuần | - | 🔴 Critical |
| Phase 2: K8s Deployment (Basic) | 1.5 tuần | Phase 1 | 🔴 Critical |
| Phase 3: Ingress & Subdomain Auto | 0.5 tuần | Phase 2 | 🟡 High |
| Phase 4: Monitoring (Basic) | 1 tuần | Phase 2 | 🟢 Medium |
| **Tổng cộng** | **4 tuần** | | |

### ⚠️ PHIÊN BẢN RÚT GỌN (MVP - 4 tuần)

**Core PaaS Features:**
- ✅ Build pipeline tự động (source → Docker image)
- ✅ Container Registry riêng
- ✅ K8s Deployment tự động (Pod, Service, Ingress)
- ✅ Namespace isolation (multi-tenancy)
- ✅ Ingress Gateway với subdomain tự động
- ✅ Basic monitoring (Prometheus + metrics)

**Tạm hoãn (Có thể làm sau):**
- ⏸️ Resource Quota management (vẫn có thể set manual)
- ⏸️ Advanced monitoring (Grafana dashboards)
- ⏸️ Logging stack (Loki/ELK)
- ⏸️ Auto-scaling (HPA)
- ⏸️ Advanced deployment strategies (Blue-Green, Canary)
- ⏸️ CI/CD integration (Git webhooks)

**Legacy Support:**
- 🔄 Hỗ trợ song song: Apps cũ vẫn chạy trên SSH (không gián đoạn)
- 🔄 Migration tool: Chuyển apps từ SSH → K8s khi sẵn sàng

---

## 🚀 QUICK START - Phase 1 (Rút gọn)

### Step 1: Setup Docker Registry (Đơn giản)
```bash
# Option 1: Docker Registry đơn giản
docker run -d -p 5000:5000 \
  --restart=always \
  --name registry \
  -v registry-data:/var/lib/registry \
  registry:2

# Option 2: Với authentication (recommended)
# Tạo htpasswd file
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

### Step 2: Create Dockerfile Templates
```dockerfile
# Dockerfile.nodejs
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Step 3: Update ApplicationService
```java
private void buildAndPushDockerImage(Application app, Path sourceDir) {
    // 1. Generate Dockerfile based on app type
    // 2. Build image: docker build -t {tag} {sourceDir}
    // 3. Push to registry: docker push {tag}
    // 4. Save image tag to database
}
```

---

## 📚 RESOURCES

- [Kubernetes Java Client](https://github.com/fabric8io/kubernetes-client)
- [Docker Registry](https://docs.docker.com/registry/)
- [Prometheus](https://prometheus.io/docs/introduction/overview/)
- [Nginx Ingress Controller](https://kubernetes.github.io/ingress-nginx/)

---

## ✅ HIỆN TRẠNG HỆ THỐNG (ĐÃ HOÀN THÀNH)

### Current Features (SSH-based Deployment):
✅ **Fullstack Application Support**
- Upload fullstack applications (frontend + backend + database)
- Tự động detect application type (Node.js, Python, Java, React, Vue, Fullstack)
- Setup database tự động cho fullstack apps (create DB, execute SQL scripts)

✅ **User Experience**
- User dashboard với form upload và danh sách applications
- Tự động trả về URL truy cập (`{subdomain}.domain.com`)
- Hiển thị trạng thái deployment (UPLOADING, BUILDING, DEPLOYING, RUNNING, ERROR)
- Real-time notifications qua WebSocket

✅ **Admin Management**
- Admin dashboard để quản lý:
  - Users (CRUD, activity logs)
  - Servers (SSH connection, online status)
  - Kubernetes Cluster (nodes, pods, services)
  - Deployment Requests (approve/reject)
  - Monitoring & Logs (basic)

✅ **Deployment Workflow**
- ADMIN: Deploy trực tiếp không cần approve
- CLIENT: Tạo deployment request → Admin approve → Auto deploy
- Auto server selection (prioritize user's servers)
- Port allocation tự động

✅ **Application Types Supported**
- Node.js applications
- Python applications (Django/Flask)
- Java applications (Spring Boot)
- React applications
- Vue.js applications
- Fullstack applications (with database setup)

---

## 📝 NOTES CHO 4 TUẦN PAAS MVP

### Những gì ĐẠT ĐƯỢC (PaaS Platform - Mục tiêu):
✅ **Build Pipeline tự động**: Source code → Docker image → Registry  
✅ **Self-service deployment**: User deploy trực tiếp, không cần admin  
✅ **Kubernetes platform**: Pod, Service, Ingress tự động  
✅ **Multi-tenancy**: Namespace isolation per user  
✅ **Service Discovery**: Ingress Gateway với subdomain tự động  
✅ **Basic Observability**: Prometheus metrics, pod status  
✅ **Platform abstraction**: User không cần biết về K8s, chỉ upload code  

### Những gì TẠM HOÃN (Advanced PaaS Features):
⏸️ Resource Quota enforcement (có thể set manual)  
⏸️ Advanced monitoring (Grafana dashboards)  
⏸️ Logging stack (Loki/ELK)  
⏸️ Auto-scaling (HPA)  
⏸️ Blue-Green/Canary deployment  
⏸️ CI/CD integration (Git webhooks)  
⏸️ Database as a Service  
⏸️ Backup & Restore automation  

### So sánh Hiện tại vs Mục tiêu:

| Tính năng | Hiện tại (SSH Manual) | Mục tiêu (PaaS trên K8s) |
|-----------|----------------------|-------------------------|
| **Upload Fullstack** | ✅ Có - Auto detect và deploy | ✅ Có - Với build pipeline tốt hơn |
| **URL Generation** | ✅ Có - Auto subdomain | ✅ Có - Ingress tự động |
| **Admin Dashboard** | ✅ Có - Quản lý users, servers, requests | ✅ Nâng cấp - K8s cluster, registry |
| **User Dashboard** | ✅ Có - Xem apps, status, URL | ✅ Nâng cấp - Metrics, logs, resources |
| **Deployment** | Admin/Approval workflow | Tự động, self-service |
| **Scaling** | Manual | Auto (HPA) |
| **Resource Management** | Manual tracking | Tự động tracking với metrics |
| **Service Discovery** | Auto port allocation | Tự động qua Service/Ingress |
| **Isolation** | User directories | Namespace isolation |
| **Monitoring** | Basic status tracking | Centralized metrics (Prometheus) |
| **Recovery** | Manual restart | Auto-restart (liveness probe) |
| **Container Registry** | Docker Hub public | Private registry |
| **Build Pipeline** | Basic Docker build | Full CI/CD pipeline |  

### Lý do rút gọn:
- Tập trung vào core functionality trước
- Giảm complexity trong 4 tuần
- Có thể bổ sung features sau khi MVP hoạt động ổn định

---

## 🎨 UI CẦN BỔ SUNG (Tích hợp vào 4 tuần)

### **TRANG USER (`/home-user`)**

#### ✅ Đã có (cần kiểm tra):
- Form upload app (zip/docker image) - ✅ Có trong tab "Tạo mới"
- Danh sách ứng dụng - ✅ Có trong tab "Dự án"
- Hiển thị URL, trạng thái - ✅ Có

#### ❌ Cần bổ sung:

1. **Hiển thị Resource Usage trong danh sách ứng dụng**
   - CPU usage (%)
   - Memory usage (MB/GB)
   - Pod status (Running/Stopped/Error)
   - Replica count
   - **Task**: 
     - [ ] Thêm API endpoint `/api/applications/{id}/resources` để lấy metrics
     - [ ] Update `renderProjectsList()` để hiển thị resource info
     - [ ] Thêm icon/card cho resource usage trong project card

2. **Chi tiết ứng dụng (Modal hoặc trang riêng)**
   - Xem logs của ứng dụng
   - Xem metrics chi tiết (CPU/Memory chart)
   - Resource history
   - Pod events
   - **Task**:
     - [ ] Tạo modal "View Details" cho mỗi project card
     - [ ] API endpoint `/api/applications/{id}/logs`
     - [ ] API endpoint `/api/applications/{id}/metrics`
     - [ ] Tích hợp log viewer (terminal-like hoặc scrollable text)
     - [ ] Simple chart cho metrics (có thể dùng Chart.js hoặc ApexCharts)

3. **Cải thiện form upload**
   - Progress bar khi upload
   - Preview Dockerfile (nếu có)
   - **Task**:
     - [ ] Thêm progress bar cho file upload
     - [ ] Hiển thị estimated time

---

### **TRANG ADMIN (`/home-admin`)**

#### ✅ Đã có:
- User Management - ✅ Có
- Server Management - ✅ Có  
- Kubernetes Cluster view - ✅ Có (trong ClusterAdminController)
- Deployment Requests - ✅ Có

#### ❌ Cần bổ sung:

1. **Docker Registry Management** 🔴 Priority High
   - Danh sách images trong registry
   - Xem chi tiết image (tags, size, created date)
   - Xóa image (với confirmation)
   - Search/filter images
   - **Tasks**:
     - [ ] Tạo section mới trong admin dashboard: "🐳 Docker Registry"
     - [ ] API endpoint `/admin/registry/images` - List images
     - [ ] API endpoint `/admin/registry/images/{image}/tags` - List tags
     - [ ] API endpoint `/admin/registry/images/{image}:{tag}` - Delete image
     - [ ] UI: Table hiển thị images với columns:
       - Image name (namespace/image)
       - Tags (badges)
       - Size
       - Created date
       - Actions (View tags, Delete)
     - [ ] Modal để xem chi tiết tags của image
     - [ ] Confirmation dialog khi xóa

2. **Cluster & Namespace Management** 🟡 Priority Medium
   - Danh sách tất cả clusters
   - Danh sách namespaces trong mỗi cluster
   - Xem apps trong từng namespace
   - **Tasks**:
     - [ ] Cải thiện section "☸️ Kubernetes Cluster" hiện có
     - [ ] Thêm tab "Namespaces" bên cạnh "Nodes", "Pods", "Services"
     - [ ] API endpoint `/admin/k8s/clusters/{id}/namespaces`
     - [ ] UI: Tree view hoặc table:
       ```
       Cluster 1
         ├─ Namespace: user-1
         │   └─ Apps: 3 (running: 2, stopped: 1)
         ├─ Namespace: user-2
         │   └─ Apps: 1 (running: 1)
       ```
     - [ ] Click vào namespace → xem danh sách apps trong namespace đó

3. **User Applications Monitoring** 🔴 Priority High
   - Theo dõi tất cả apps của tất cả users
   - Filter theo user, status, namespace
   - Xem logs, resource usage của từng app
   - **Tasks**:
     - [ ] Tạo section mới: "📊 Applications Monitoring"
     - [ ] API endpoint `/admin/applications/all` - List all apps với filter
     - [ ] API endpoint `/admin/applications/{id}/logs` - Get logs
     - [ ] API endpoint `/admin/applications/{id}/metrics` - Get metrics
     - [ ] UI: Table với columns:
       - User (username)
       - App Name
       - Status (badge)
       - Namespace
       - URL (link)
       - CPU Usage (%)
       - Memory Usage (MB)
       - Pod Status
       - Actions (View Logs, View Metrics, Delete)
     - [ ] Filter bar:
       - Dropdown: Select user (All / User 1 / User 2...)
       - Dropdown: Select status (All / Running / Stopped / Error...)
       - Input: Search by app name
     - [ ] Modal "View Logs": 
       - Scrollable log viewer
       - Auto-scroll checkbox
       - Download logs button
     - [ ] Modal "View Metrics":
       - CPU chart (line chart)
       - Memory chart (line chart)
       - Time range selector (1h, 6h, 24h, 7d)
       - Export data button

4. **Resource Usage Dashboard** 🟢 Priority Medium
   - Tổng quan resource usage của toàn hệ thống
   - Resource usage theo user
   - **Tasks**:
     - [ ] Tạo section "📈 Resource Dashboard"
     - [ ] API endpoint `/admin/resources/overview`
     - [ ] Charts:
       - Total CPU/Memory usage (pie chart hoặc gauge)
       - Usage by user (bar chart)
       - Usage trend (line chart - 24h)
     - [ ] Table: Top users by resource usage

---

## 📋 UI IMPLEMENTATION CHECKLIST

### User Dashboard Enhancements

#### Resource Display
- [ ] Backend: Create `ApplicationMetricsController` với endpoints:
  - `GET /api/applications/{id}/resources` - CPU, Memory, Pod status
  - `GET /api/applications/{id}/logs` - Application logs
  - `GET /api/applications/{id}/metrics?timeRange=1h` - Historical metrics
- [ ] Frontend: Update `renderProjectsList()` để hiển thị:
  - Resource badge (CPU: 45%, Memory: 256MB)
  - Pod status icon
- [ ] Frontend: Create "View Details" modal với:
  - Logs tab (scrollable, auto-refresh)
  - Metrics tab (simple charts)
  - Resources tab (current usage)

#### Form Upload Improvements
- [ ] Add upload progress bar (XMLHttpRequest với onprogress)
- [ ] Show file size và estimated upload time

### Admin Dashboard - Docker Registry

- [ ] Backend: Create `DockerRegistryController`:
  - `GET /admin/registry/images` - List all images
  - `GET /admin/registry/images/{image}/tags` - List tags
  - `DELETE /admin/registry/images/{image}:{tag}` - Delete image
- [ ] Frontend: Add section "🐳 Docker Registry" vào `home-admin.html`
- [ ] Frontend: Create `registry.js` với functions:
  - `loadRegistryImages()`
  - `renderRegistryTable(images)`
  - `showImageTags(imageName)`
  - `deleteImage(imageName, tag)`
- [ ] UI Components:
  - Table với search/filter
  - Modal để view tags
  - Delete confirmation dialog

### Admin Dashboard - Cluster & Namespace

- [ ] Backend: Enhance `ClusterAdminController`:
  - `GET /admin/k8s/clusters/{id}/namespaces` - List namespaces
  - `GET /admin/k8s/namespaces/{namespace}/applications` - Apps in namespace
- [ ] Frontend: Enhance K8s section trong `home-admin.html`:
  - Add "Namespaces" tab
  - Tree view: Cluster → Namespaces → Apps
  - Click namespace → show apps table

### Admin Dashboard - Applications Monitoring

- [ ] Backend: Create `AdminApplicationController`:
  - `GET /admin/applications/all?userId=&status=&search=` - List all apps
  - `GET /admin/applications/{id}/logs?lines=100` - Get logs
  - `GET /admin/applications/{id}/metrics?timeRange=1h` - Get metrics
- [ ] Frontend: Add section "📊 Applications Monitoring"
- [ ] Frontend: Create `admin-applications.js` với:
  - `loadAllApplications(filters)`
  - `renderApplicationsTable(apps)`
  - `showLogsModal(appId)`
  - `showMetricsModal(appId)`
- [ ] UI Components:
  - Filter bar (user dropdown, status dropdown, search)
  - Table với sorting
  - Logs modal (terminal-like hoặc scrollable)
  - Metrics modal (charts)

### Admin Dashboard - Resource Dashboard

- [ ] Backend: Create `ResourceDashboardController`:
  - `GET /admin/resources/overview` - System overview
  - `GET /admin/resources/users` - Usage by user
- [ ] Frontend: Add section "📈 Resource Dashboard"
- [ ] Frontend: Integrate chart library (Chart.js hoặc ApexCharts)
- [ ] UI Components:
  - System overview cards (Total CPU, Memory, Apps)
  - Charts (pie, bar, line)
  - Top users table

---

## 🛠️ TECHNICAL IMPLEMENTATION

### Dependencies cần thêm:
```xml
<!-- For charts -->
<dependency>
    <groupId>com.github.blackfriday</groupId>
    <artifactId>chartjs-spring-boot-starter</artifactId>
    <version>2.4.1</version>
</dependency>
```

Hoặc dùng Chart.js CDN trong frontend:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

### Backend APIs cần tạo:

```java
// ApplicationMetricsController.java
@GetMapping("/applications/{id}/resources")
// Trả về: { cpu: 45.2, memory: 256, podStatus: "Running", replicas: 1 }

@GetMapping("/applications/{id}/logs")
// Trả về: { logs: ["line1", "line2", ...], hasMore: true }

@GetMapping("/applications/{id}/metrics")
// Trả về: { timestamps: [...], cpu: [...], memory: [...] }

// DockerRegistryController.java
@GetMapping("/admin/registry/images")
// Trả về: [{ name: "user1/app1", tags: ["v1", "v2"], size: 125MB }]

@GetMapping("/admin/registry/images/{image}/tags")
// Trả về: [{ tag: "v1", size: "125MB", created: "2024-01-01" }]

// AdminApplicationController.java
@GetMapping("/admin/applications/all")
// Trả về: List<ApplicationDTO> với user info, metrics

@GetMapping("/admin/applications/{id}/logs")
@GetMapping("/admin/applications/{id}/metrics")
```

### Frontend Structure:

```
static/
  ├── user.js (đã có - cần update)
  ├── admin.js (đã có - cần update)
  ├── admin-registry.js (mới)
  ├── admin-applications.js (mới)
  ├── admin-resources.js (mới)
  └── charts.js (utility cho charts)
```

---

## ⏱️ TIMELINE CHO UI (Tích hợp vào 4 tuần)

| Tuần | UI Tasks | Liên quan đến Phase |
|------|----------|---------------------|
| **Tuần 1** | - Form upload (đã có, kiểm tra) | Phase 1 |
| **Tuần 2** | - Resource display trong user dashboard<br>- Applications Monitoring cơ bản | Phase 2 |
| **Tuần 3** | - Cluster & Namespace UI<br>- Docker Registry Management | Phase 3 |
| **Tuần 4** | - Logs viewer<br>- Metrics charts<br>- Resource Dashboard | Phase 4 |

---

## 📝 NOTES

- UI có thể phát triển song song với backend
- Ưu tiên: Applications Monitoring > Docker Registry > Resource Dashboard
- Charts có thể dùng Chart.js (nhẹ, dễ dùng) hoặc ApexCharts (đẹp hơn)
- Logs viewer có thể đơn giản (scrollable div) hoặc dùng xterm.js (terminal-like)

---

## 🎯 TÓM TẮT CHUYỂN ĐỔI

### Từ: Manual SSH Deployment Model
- User upload → Admin approve → SSH/SFTP → Manual commands
- Quản lý thủ công: ports, subdomains, servers
- Khó scale, khó monitor, khó maintain

### Sang: Platform as a Service (PaaS) trên Kubernetes
- User upload → **Platform tự động**: Build → Deploy → Expose → Monitor
- **Zero-touch operations**: Không cần admin can thiệp
- **Self-service**: User tự quản lý applications
- **Auto-scaling, auto-healing, auto-discovery**
- **Enterprise-ready**: Multi-tenancy, resource quotas, observability

### Kết quả:
🚀 **Platform tự động hóa hoàn toàn**  
🎯 **User experience tốt hơn** (chỉ cần upload code)  
📈 **Scalable và maintainable**  
🔒 **Enterprise-grade** với isolation và security

