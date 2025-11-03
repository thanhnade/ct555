# 📋 CHECKLIST TRIỂN KHAI HỆ THỐNG

## ✅ ĐÃ HOÀN THÀNH

1. ✅ Backend Docker Image Deployment:
   - `Application` entity với các field cần thiết
   - `ApplicationService` - tạo và quản lý applications
   - `ApplicationController` - API endpoints cho user
   - `AdminController` - API endpoints cho admin
   - `KubernetesService` - tạo K8s resources (Deployment, Service, Ingress)
   - Auto-select cluster HEALTHY đầu tiên
   - Real-time deployment logs

2. ✅ Frontend:
   - `home-user.html` - Form đơn giản (Project Name + Docker Image)
   - `home-admin.html` - Deployment Requests section với logs viewer
   - `admin.js` - Polling logs mỗi giây, xử lý deployment requests
   - `user.js` - Submit deployment request

3. ✅ Database:
   - Table `applications` với các field:
     - `app_name`, `docker_image`, `user_id`, `status`
     - `k8s_namespace`, `k8s_deployment_name`, `k8s_service_name`, `k8s_ingress_name`
     - `access_url`, `cluster_id`, `deployment_logs`

---

## 🔧 CẦN CHUẨN BỊ

### **1. Kubernetes Cluster Setup**

#### 1.1. Tạo Cluster trong hệ thống
- Vào trang Admin → Section "K8s Clusters"
- Tạo cluster mới (ví dụ: "Production Cluster")
- Thêm Master node và Worker nodes
- Đảm bảo tất cả nodes đều ONLINE

#### 1.2. Cài đặt trên Master Node
```bash
# Trên master node, cần có:
- kubectl đã cài đặt
- kubeconfig tại /etc/kubernetes/admin.conf hoặc ~/.kube/config
- SSH access với SSH key (không dùng password)
```

#### 1.3. Cài đặt NGINX Ingress Controller
```bash
# Trên master node
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Chờ Ingress Controller ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

# Kiểm tra
kubectl get pods -n ingress-nginx
```

#### 1.4. Cài đặt MetalLB
```bash
# Cài đặt MetalLB
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

# Chờ MetalLB ready
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb \
  --timeout=90s

# Tạo IP Pool (ví dụ: 192.168.56.200-192.168.56.250)
cat > metallb-ip-pool.yaml <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.56.200-192.168.56.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
spec:
  ipAddressPools:
  - default-pool
EOF

kubectl apply -f metallb-ip-pool.yaml
```

#### 1.5. Kiểm tra kubeconfig
```bash
# Trên master node, kiểm tra
kubectl get nodes
kubectl cluster-info

# Đảm bảo có quyền tạo resources
kubectl auth can-i create deployments --all-namespaces
kubectl auth can-i create services --all-namespaces
kubectl auth can-i create ingress --all-namespaces
```

---

### **2. Database Migration**

#### 2.1. Kiểm tra database schema
Hệ thống sẽ tự động tạo các field mới khi khởi động (vì dùng `spring.jpa.hibernate.ddl-auto=update`).

Nếu muốn kiểm tra thủ công:
```sql
USE autodeploy;

-- Kiểm tra table applications
DESCRIBE applications;

-- Các field cần có:
-- id, name, app_name, docker_image, user_id, status
-- k8s_namespace, k8s_deployment_name, k8s_service_name, k8s_ingress_name
-- access_url, cluster_id, deployment_logs
-- subdomain, created_at, updated_at
```

#### 2.2. Restart application để apply schema changes
```bash
# Restart Spring Boot app để JPA tạo các field mới
# Hoặc nếu đang chạy, hệ thống sẽ tự động update khi khởi động lại
```

---

### **3. Configuration**

#### 3.1. Kiểm tra `application.properties`
```properties
# Kubernetes configuration (có thể để trống, sẽ lấy từ cluster)
k8s.kubeconfig.path=
k8s.ingress.class=nginx
k8s.ingress.external.ip=
k8s.default.container.port=80
```

#### 3.2. Đảm bảo Master Node có SSH Key
- Master node phải có SSH key được thêm vào hệ thống
- Không dùng password-only authentication
- Kiểm tra: Vào Admin → Servers → Master node phải có SSH key

---

## 🧪 TESTING FLOW

### **Test 1: User tạo deployment request**

1. **Đăng nhập với user account**
2. **Vào trang `/home-user`**
3. **Điền form:**
   - Project Name: `my-nginx-app`
   - Docker Hub Image: `nginx:alpine`
4. **Click "Gửi yêu cầu"**
5. **Kiểm tra:**
   - Thấy message: "Yêu cầu của bạn đã được gửi và đang chờ admin xử lý"
   - Status = PENDING trong database

---

### **Test 2: Admin xử lý deployment request**

1. **Đăng nhập với admin account**
2. **Vào trang `/home-admin`**
3. **Click tab "🚀 Deployment Requests"**
4. **Kiểm tra:**
   - Thấy deployment request với status PENDING
   - Có button "Xử lý" và "Logs"
5. **Click "Xử lý"**
6. **Xem logs real-time:**
   - Logs sẽ tự động hiển thị trong card "📋 Logs triển khai"
   - Polling mỗi giây để cập nhật logs
   - Thấy các bước:
     ```
     [HH:mm:ss] 🚀 Bắt đầu quá trình triển khai ứng dụng: my-nginx-app
     [HH:mm:ss] ✅ Đã chọn cluster: Production Cluster (ID: 1)
     [HH:mm:ss] 📥 Đang lấy kubeconfig từ master node...
     [HH:mm:ss] ✅ Đã lấy kubeconfig thành công
     [HH:mm:ss] 🔗 Đang tạo kết nối đến Kubernetes cluster...
     [HH:mm:ss] ✅ Đã tạo KubernetesClient thành công
     [HH:mm:ss] 📦 Đang tạo namespace: john_doe
     [HH:mm:ss] ✅ Namespace đã được tạo/kiểm tra: john_doe
     [HH:mm:ss] 🔨 Đang tạo Deployment: my-nginx-app-123...
     [HH:mm:ss] ✅ Deployment đã được tạo: my-nginx-app-123
     [HH:mm:ss] 🔌 Đang tạo Service: svc-my-nginx-app-123
     [HH:mm:ss] ✅ Service đã được tạo: svc-my-nginx-app-123
     [HH:mm:ss] 🌐 Đang tạo Ingress: ing-my-nginx-app-123
     [HH:mm:ss] ✅ Ingress đã được tạo: ing-my-nginx-app-123
     [HH:mm:ss] ⏳ Đang chờ Deployment sẵn sàng... (timeout: 5 phút)
     [HH:mm:ss] ✅ Deployment đã sẵn sàng: my-nginx-app-123
     [HH:mm:ss] 🔍 Đang lấy Ingress URL từ MetalLB...
     [HH:mm:ss] ✅ Đã lấy Ingress URL: http://192.168.56.200
     [HH:mm:ss] 💾 Đang lưu thông tin deployment vào database...
     [HH:mm:ss] ✅ Đã lưu cluster ID: 1 vào database
     [HH:mm:ss] 🎉 Triển khai hoàn tất thành công!
     ```

7. **Kiểm tra kết quả:**
   - Status chuyển thành RUNNING
   - Có access URL (ví dụ: http://192.168.56.200)
   - `cluster_id` đã được lưu vào database

---

### **Test 3: Kiểm tra trên Kubernetes**

```bash
# Trên master node hoặc máy có kubectl
kubectl get namespaces | grep <username>

# Kiểm tra Deployment
kubectl get deployments -n <username>

# Kiểm tra Service
kubectl get services -n <username>

# Kiểm tra Ingress
kubectl get ingress -n <username>

# Kiểm tra Pods
kubectl get pods -n <username>

# Lấy Ingress EXTERNAL-IP
kubectl get ingress -n <username> -o wide
```

---

### **Test 4: Truy cập ứng dụng**

1. **Lấy access URL từ admin page hoặc database**
2. **Mở browser và truy cập URL** (ví dụ: `http://192.168.56.200`)
3. **Kiểm tra:**
   - Ứng dụng hiển thị đúng (nginx welcome page nếu dùng `nginx:alpine`)

---

## 🐛 TROUBLESHOOTING

### **Lỗi: "Không tìm thấy cluster K8s nào"**
**Nguyên nhân:** Chưa có cluster HEALTHY trong hệ thống
**Giải pháp:**
1. Vào Admin → K8s Clusters
2. Tạo cluster mới
3. Thêm Master node và Worker nodes
4. Đảm bảo tất cả nodes ONLINE

### **Lỗi: "Cannot authenticate to master node. SSH key required"**
**Nguyên nhân:** Master node chưa có SSH key
**Giải pháp:**
1. Vào Admin → Servers
2. Tìm Master node
3. Thêm SSH key cho master node
4. Hoặc tạo SSH key mới và thêm vào master node

### **Lỗi: "Cannot retrieve kubeconfig from master node"**
**Nguyên nhân:** Không thể lấy kubeconfig từ master
**Giải pháp:**
```bash
# Trên master node, kiểm tra kubeconfig có tồn tại không
sudo cat /etc/kubernetes/admin.conf
# hoặc
cat ~/.kube/config

# Nếu không có, cần tạo lại hoặc copy từ /etc/kubernetes/admin.conf
mkdir -p ~/.kube
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

### **Lỗi: "Master node is offline"**
**Nguyên nhân:** Master node không online
**Giải pháp:**
1. Vào Admin → Servers
2. Kiểm tra status của master node
3. Nếu OFFLINE → Kiểm tra SSH connection, ping master node

### **Lỗi: "Ingress URL không lấy được"**
**Nguyên nhân:** MetalLB chưa cấp IP hoặc chưa cài MetalLB
**Giải pháp:**
1. Kiểm tra MetalLB đã cài chưa:
   ```bash
   kubectl get pods -n metallb-system
   ```
2. Kiểm tra IP Pool đã cấu hình chưa:
   ```bash
   kubectl get ipaddresspool -n metallb-system
   ```
3. Set `k8s.ingress.external.ip` trong `application.properties` nếu MetalLB không hoạt động

### **Lỗi: "Deployment did not become ready"**
**Nguyên nhân:** Image không pull được hoặc Pod crash
**Giải pháp:**
```bash
# Kiểm tra Pod status
kubectl get pods -n <namespace>

# Xem logs của Pod
kubectl logs -n <namespace> <pod-name>

# Kiểm tra events
kubectl describe pod -n <namespace> <pod-name>
```

---

## 📝 NOTES

1. **Namespace naming:** Namespace = username của user (ví dụ: `john_doe`)
2. **Resource naming:**
   - Deployment: `{app-name}-{application-id}` (ví dụ: `my-nginx-app-123`)
   - Service: `svc-{app-name}-{application-id}`
   - Ingress: `ing-{app-name}-{application-id}`

3. **Port mặc định:** Container port = 80 (có thể cấu hình sau)

4. **Polling logs:** Tự động dừng sau 30 giây nếu status = RUNNING

5. **Cluster selection:** Tự động chọn cluster HEALTHY đầu tiên

---

## 🎯 NEXT STEPS (Tùy chọn)

Sau khi test thành công, có thể mở rộng:

1. **Delete Application:** Thêm endpoint DELETE để xóa app và K8s resources
2. **Update Application:** Thêm endpoint để scale replicas, update image
3. **Application Metrics:** Hiển thị CPU/Memory usage của pods
4. **Application Logs:** Xem logs của container trong Pod
5. **Multiple Clusters:** Cho phép admin chọn cluster khi xử lý (thay vì auto-select)
6. **Custom Container Port:** Cho phép user chỉ định port khi tạo request

