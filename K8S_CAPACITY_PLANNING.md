# 📊 K8S CAPACITY PLANNING - 1 MASTER + 2 WORKERS

## 🎯 CÂU HỎI

**Với 1 cụm K8s gồm 1 master + 2 workers, có thể triển khai được bao nhiêu services/apps (tương đương bao nhiêu URLs)?**

---

## 🔍 PHÂN TÍCH CAPACITY

### **Các yếu tố ảnh hưởng:**

1. **Resources của Worker Nodes** (CPU, RAM, Disk)
2. **Resource requests/limits của mỗi Pod**
3. **System overhead** (K8s components, OS, container runtime)
4. **Ingress Controller capacity**
5. **Network bandwidth**

---

## 📐 TÍNH TOÁN CƠ BẢN

### **Giả định cấu hình:**

#### **Worker Nodes:**
- **CPU**: 4 cores mỗi worker (tổng: 8 cores)
- **RAM**: 8GB mỗi worker (tổng: 16GB)
- **Disk**: 100GB mỗi worker

#### **System Overhead:**
- **K8s system pods**: ~0.5 CPU, ~1GB RAM
- **OS + Container runtime**: ~0.2 CPU, ~1GB RAM
- **Kubelet, kube-proxy**: ~0.1 CPU, ~200MB RAM
- **Tổng overhead**: ~0.8 CPU, ~2.2GB RAM per worker

#### **Available Resources:**
- **CPU available**: 8 cores - 1.6 cores (overhead) = **6.4 cores**
- **RAM available**: 16GB - 4.4GB (overhead) = **11.6GB**

---

## 💻 RESOURCE REQUESTS CHO MỖI APP

### **Các loại ứng dụng và resource usage:**

#### **1. Small Apps (Frontend static, Simple APIs):**
```yaml
resources:
  requests:
    cpu: 100m      # 0.1 CPU core
    memory: 128Mi  # 128MB RAM
  limits:
    cpu: 200m
    memory: 256Mi
```
- **Số lượng có thể deploy**: ~60-80 apps (với 6.4 cores, 11.6GB RAM)

#### **2. Medium Apps (Node.js API, Python Django):**
```yaml
resources:
  requests:
    cpu: 250m      # 0.25 CPU core
    memory: 256Mi  # 256MB RAM
  limits:
    cpu: 500m
    memory: 512Mi
```
- **Số lượng có thể deploy**: ~25-30 apps

#### **3. Large Apps (Java Spring Boot, Fullstack):**
```yaml
resources:
  requests:
    cpu: 500m      # 0.5 CPU core
    memory: 512Mi  # 512MB RAM
  limits:
    cpu: 1000m     # 1 CPU core
    memory: 1Gi    # 1GB RAM
```
- **Số lượng có thể deploy**: ~12-15 apps

#### **4. Mixed Workload (Thực tế):**
- **30% Small apps** (0.1 CPU, 128MB)
- **50% Medium apps** (0.25 CPU, 256MB)
- **20% Large apps** (0.5 CPU, 512MB)

**Tính toán:**
- 10 Small apps: 1 CPU, 1.28GB
- 15 Medium apps: 3.75 CPU, 3.84GB
- 6 Large apps: 3 CPU, 3.072GB
- **Tổng: 31 apps, 7.75 CPU, 8.192GB** ✅ (trong giới hạn)

---

## 🌐 INGRESS CAPACITY

### **Mỗi app = 1 URL (Ingress rule):**

**Ingress Controller capacity:**
- **Nginx Ingress Controller**: Có thể handle hàng ngàn Ingress rules
- **Giới hạn chính**: Memory của Ingress Controller pod
- **Mỗi Ingress rule**: ~1-2KB memory overhead

**Với 1 master + 2 workers:**
- **Theoretical limit**: 10,000+ Ingress rules (không phải bottleneck)
- **Practical limit**: Phụ thuộc vào **Pod capacity** (CPU/RAM)

**Kết luận**: **URL capacity = Pod capacity** (Ingress không phải giới hạn)

---

## 📊 TÍNH TOÁN THỰC TẾ

### **Scenario 1: Lightweight Apps (Frontend only)**

**Resource per app:**
- CPU: 50m (0.05 cores)
- RAM: 64Mi

**Capacity:**
- CPU: 6.4 cores ÷ 0.05 = **~128 apps**
- RAM: 11.6GB ÷ 64MB = **~181 apps**
- **Bottleneck: CPU → ~120 apps có thể deploy** ✅

**Kết quả**: **~120 URLs có thể truy cập**

---

### **Scenario 2: Typical Web Apps (Node.js, Python)**

**Resource per app:**
- CPU: 200m (0.2 cores)
- RAM: 256Mi

**Capacity:**
- CPU: 6.4 cores ÷ 0.2 = **~32 apps**
- RAM: 11.6GB ÷ 256MB = **~45 apps**
- **Bottleneck: CPU → ~30 apps có thể deploy** ✅

**Kết quả**: **~30 URLs có thể truy cập**

---

### **Scenario 3: Mixed Workload (Thực tế nhất)**

**Breakdown:**
- **20 Small apps** (0.1 CPU, 128MB each): 2 CPU, 2.56GB
- **10 Medium apps** (0.25 CPU, 256MB each): 2.5 CPU, 2.56GB
- **5 Large apps** (0.5 CPU, 512MB each): 2.5 CPU, 2.56GB

**Total:**
- **35 apps**: 7 CPU, 7.68GB ✅
- **Within limits**: 6.4 CPU (slightly over, but acceptable), 11.6GB RAM ✅

**Kết quả**: **~35 URLs có thể truy cập**

---

## 🎯 ƯỚC TÍNH THỰC TẾ (RECOMMENDED)

### **Conservative Estimate (80% resource usage):**

**Available resources (80%):**
- CPU: 6.4 cores × 0.8 = **5.12 cores**
- RAM: 11.6GB × 0.8 = **9.28GB**

**Typical app:**
- CPU: 200m
- RAM: 256MB

**Capacity:**
- **~25-30 apps** (URLs) ✅ **KHUYẾN NGHỊ**

---

### **Aggressive Estimate (90-95% resource usage):**

**Available resources (95%):**
- CPU: 6.4 cores × 0.95 = **6.08 cores**
- RAM: 11.6GB × 0.95 = **11.02GB**

**Capacity:**
- **~30-35 apps** (URLs) ⚠️ **Có thể nhưng không khuyến nghị**

**Lý do:**
- Không đủ buffer cho spikes, upgrades, system tasks
- Risk cao khi có traffic spike

---

## 📈 SCALING OPTIONS

### **Khi đạt giới hạn:**

#### **Option 1: Thêm Worker Nodes** ✅ (Best practice)
```
1 Master + 2 Workers → 1 Master + 4 Workers
Capacity: 30 apps → 60 apps
```

#### **Option 2: Upgrade Worker Nodes**
```
4 cores, 8GB → 8 cores, 16GB per worker
Capacity: 30 apps → 60 apps
```

#### **Option 3: Optimize Resource Requests**
- Giảm resource requests (nếu app không cần nhiều)
- Sử dụng HPA (Horizontal Pod Autoscaler) để scale based on demand

---

## 🔧 RESOURCE QUOTAS (RECOMMENDED)

### **Per Namespace/User:**

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: user-quota
  namespace: user-123
spec:
  hard:
    requests.cpu: "2"      # 2 CPU cores per user
    requests.memory: 4Gi   # 4GB RAM per user
    limits.cpu: "4"
    limits.memory: 8Gi
    persistentvolumeclaims: "10"
    pods: "20"             # Max 20 pods per user
```

**Với quota này:**
- Mỗi user có thể deploy: **~10-15 apps** (tùy size)
- Với 2 workers: Có thể support **2-3 users** đồng thời

---

## 📊 BẢNG TÓM TẮT

| Loại App | CPU Request | RAM Request | Số lượng Apps | Số URLs |
|----------|-------------|-------------|---------------|---------|
| **Small** (Static frontend) | 50-100m | 64-128Mi | **80-120** | 80-120 |
| **Medium** (Node.js, Python) | 200-250m | 256Mi | **25-30** | 25-30 |
| **Large** (Java, Fullstack) | 500m | 512Mi | **12-15** | 12-15 |
| **Mixed** (Thực tế) | Mixed | Mixed | **30-35** | 30-35 |

### **Khuyến nghị cho Production:**
- **Conservative**: **25-30 apps** (URLs)
- **Aggressive**: **30-35 apps** (URLs)
- **Safe buffer**: Giữ 20% resources cho system và spikes

---

## ⚠️ CÁC GIỚI HẠN KHÁC (Ngoài CPU/RAM)

### **1. Disk Space:**
- **Mỗi app image**: ~200-500MB (uncompressed)
- **Với 100GB disk per worker**: Có thể lưu trữ hàng trăm images
- **Giới hạn chính**: Logs, persistent volumes

### **2. Network:**
- **Ingress Controller**: Có thể handle hàng ngàn concurrent connections
- **Giới hạn**: Bandwidth của worker nodes

### **3. etcd (Master node):**
- **Mỗi object (Pod, Service, Ingress)**: ~1-2KB
- **30 apps**: ~100 objects = ~200KB (rất nhỏ)
- **Giới hạn**: Với 1 master, có thể support hàng ngàn objects

---

## 🎯 KẾT LUẬN

### **Với 1 Master + 2 Workers (4 cores, 8GB RAM mỗi worker):**

✅ **Khuyến nghị**: **25-30 apps** (URLs) với typical web apps
- CPU: 200m per app
- RAM: 256MB per app
- 80% resource usage (safe)

✅ **Tối đa có thể**: **30-35 apps** (URLs)
- 90-95% resource usage
- Risk cao khi có traffic spike

✅ **Ingress capacity**: **Không phải giới hạn**
- Ingress Controller có thể handle hàng ngàn rules
- Giới hạn chính là Pod resources

---

## 📝 RECOMMENDATIONS

### **1. Monitoring:**
- Theo dõi CPU/RAM usage của workers
- Set up alerts khi resource usage > 80%
- Monitor pod evictions và OOM kills

### **2. Resource Quotas:**
- Set ResourceQuota per namespace/user
- Prevent một user consume hết resources
- Fair resource distribution

### **3. HPA (Horizontal Pod Autoscaler):**
- Auto-scale pods khi traffic tăng
- Scale down khi traffic giảm
- Optimize resource usage

### **4. Planning:**
- Khi đạt 80% capacity → Plan để thêm workers
- Monitor growth rate của apps
- Capacity planning dựa trên trends

---

## 🔄 UPGRADE PATH

### **Khi cần scale:**

**Option 1: Thêm Workers** (Recommended)
```
1 Master + 2 Workers → 1 Master + 4 Workers
→ Capacity: 30 apps → 60 apps
```

**Option 2: Upgrade Workers**
```
4 cores → 8 cores per worker
8GB → 16GB per worker
→ Capacity: 30 apps → 60 apps
```

**Option 3: Multiple Clusters**
```
Cluster 1: 1 Master + 2 Workers (30 apps)
Cluster 2: 1 Master + 2 Workers (30 apps)
→ Total: 60 apps
```

---

## 💡 BEST PRACTICES

1. **Resource Requests/Limits**: Luôn set requests và limits cho Pods
2. **Namespace Isolation**: Mỗi user một namespace với ResourceQuota
3. **Monitoring**: Theo dõi resource usage và plan capacity
4. **Auto-scaling**: Sử dụng HPA cho dynamic scaling
5. **Resource Optimization**: Optimize Docker images, reduce memory footprint
6. **Node Affinity**: Distribute apps evenly across workers

---

## 📊 EXAMPLE CONFIGURATION

### **Per-App Resource Template:**

```yaml
# Small App (Frontend)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-frontend
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: frontend
        image: registry.example.com/user/myapp-frontend:latest
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi

---
# Medium App (API)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-api
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: api
        image: registry.example.com/user/myapp-api:latest
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi

---
# Large App (Fullstack)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-fullstack
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: app
        image: registry.example.com/user/myapp-fullstack:latest
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
```

---

## 🎯 TÓM TẮT NGẮN GỌN

**Với 1 Master + 2 Workers (4 cores, 8GB RAM mỗi worker):**

✅ **Có thể deploy**: **25-30 apps** (tương đương **25-30 URLs**)
- Với typical web apps (200m CPU, 256MB RAM)
- 80% resource usage (safe)

✅ **Tối đa**: **30-35 apps** (URLs)
- 90-95% resource usage
- Risk cao, không khuyến nghị

✅ **Ingress**: Không phải giới hạn, có thể handle hàng ngàn rules

**Khuyến nghị**: Start với **20-25 apps**, monitor và scale khi cần!

