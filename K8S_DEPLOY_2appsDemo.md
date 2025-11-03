# 🚀 HƯỚNG DẪN TRIỂN KHAI APP LÊN K8S VỚI METALLB

## 🎯 MỤC TIÊU

Triển khai **2 apps** bằng Docker images lên K8s cluster với **MetalLB** để có EXTERNAL-IP tự động:
- ✅ Deploy Pods từ Docker images
- ✅ Expose qua Service
- ✅ Cài đặt MetalLB cho LoadBalancer
- ✅ Tạo Ingress với URL riêng cho mỗi app
- ✅ Truy cập qua EXTERNAL-IP từ MetalLB

---

## 📋 PHẦN MỀM CẦN CÓ

### **1. Trên Master Node (hoặc máy control):**

#### **a. kubectl** (Kubernetes CLI)
```bash
# Kiểm tra đã có chưa
kubectl version --client

# Nếu chưa có, cài đặt:
# Ubuntu/Debian
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Hoặc dùng package manager
sudo apt-get update
sudo apt-get install -y kubectl
```

#### **b. Kubeconfig**
```bash
# Kiểm tra kubeconfig
export KUBECONFIG=/etc/kubernetes/admin.conf
# hoặc
export KUBECONFIG=~/.kube/config

# Test connection
kubectl cluster-info
kubectl get nodes
```

#### **c. Docker Images**
- Chọn 2 images để test, ví dụ:
  - `nginx:alpine` (web server)
  - `httpd:alpine` (Apache web server)

---

## 🔧 BƯỚC 1: KIỂM TRA CLUSTER

### **1.1. Kiểm tra nodes:**
```bash
kubectl get nodes
```

**Output mong đợi:**
```
NAME           STATUS   ROLES           AGE   VERSION
k8s-master     Ready    control-plane   1d    v1.30.0
k8s-worker1    Ready    <none>         1d    v1.30.0
k8s-worker2    Ready    <none>         1d    v1.30.0
```

### **1.2. Tạo namespace cho apps:**
```bash
kubectl create namespace apps
```

---

## 🔧 BƯỚC 2: CÀI ĐẶT INGRESS CONTROLLER (NGINX)

```bash
# Kiểm tra đã cài chưa
kubectl get pods -n ingress-nginx

# Nếu chưa có, cài đặt:
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Chờ Ingress Controller ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

**Kiểm tra IngressClass:**
```bash
kubectl get ingressclass

# Nếu chưa có IngressClass "nginx", tạo:
kubectl create ingressclass nginx --controller=k8s.io/ingress-nginx
```

---

## ⚡ BƯỚC 3: CÀI ĐẶT METALLB (QUAN TRỌNG)

**MetalLB** cho phép cluster on-premise có EXTERNAL-IP tự động, không cần NodePort.

### **3.1. Cài đặt MetalLB:**

```bash
# Cài đặt MetalLB (phiên bản mới nhất)
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

# Chờ MetalLB ready
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb \
  --timeout=90s
```

**Hoặc dùng Helm (nếu đã cài Helm):**
```bash
helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb -n metallb-system --create-namespace
```

### **3.2. Cấu hình IP Pool cho MetalLB:**

**Chọn dải IP:**
- IP phải nằm trong cùng subnet với worker nodes
- Không trùng với IP của nodes hoặc các service khác
- Ví dụ: Nếu worker nodes là `192.168.56.10-192.168.56.20`, chọn `192.168.56.200-192.168.56.250`

```bash
cat > metallb-ip-pool.yaml <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.56.200-192.168.56.250  # Thay bằng dải IP của bạn
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default-l2adv
  namespace: metallb-system
spec:
  ipAddressPools:
  - default-pool
EOF

kubectl apply -f metallb-ip-pool.yaml
```

### **3.3. Kiểm tra MetalLB hoạt động:**

```bash
# Kiểm tra MetalLB pods
kubectl get pods -n metallb-system

# Kiểm tra IP pool
kubectl get ipaddresspool -n metallb-system

# Kiểm tra L2Advertisement
kubectl get l2advertisement -n metallb-system
```

**Lưu ý:** Nếu network không hỗ trợ L2 (ARP), có thể cần dùng BGP mode. Xem tài liệu MetalLB để cấu hình BGP.

---

## 🚀 BƯỚC 4: TRIỂN KHAI APP 1 - NGINX

### **4.1. Tạo Deployment:**

```bash
cat > app1-nginx.yaml <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-app
  namespace: apps
  labels:
    app: nginx-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-app
  template:
    metadata:
      labels:
        app: nginx-app
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
EOF

kubectl apply -f app1-nginx.yaml
```

### **4.2. Kiểm tra Pod:**
```bash
kubectl get pods -n apps -l app=nginx-app
kubectl wait --for=condition=Ready pod -l app=nginx-app -n apps --timeout=60s
```

### **4.3. Tạo Service:**

```bash
cat > app1-service.yaml <<EOF
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
  namespace: apps
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
  selector:
    app: nginx-app
EOF

kubectl apply -f app1-service.yaml
```

### **4.4. Tạo Ingress:**

```bash
cat > app1-ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx-ingress
  namespace: apps
  annotations:
    # Uncomment nếu có cert-manager:
    # cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  rules:
  - host: nginx-app.local  # Thay bằng domain thực tế nếu có
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: nginx-service
            port:
              number: 80
EOF

kubectl apply -f app1-ingress.yaml
```

---

## 🚀 BƯỚC 5: TRIỂN KHAI APP 2 - APACHE

### **5.1. Tạo Deployment:**

```bash
cat > app2-apache.yaml <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: apache-app
  namespace: apps
  labels:
    app: apache-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: apache-app
  template:
    metadata:
      labels:
        app: apache-app
    spec:
      containers:
      - name: apache
        image: httpd:alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
EOF

kubectl apply -f app2-apache.yaml
```

### **5.2. Tạo Service:**

```bash
cat > app2-service.yaml <<EOF
apiVersion: v1
kind: Service
metadata:
  name: apache-service
  namespace: apps
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
  selector:
    app: apache-app
EOF

kubectl apply -f app2-service.yaml
```

### **5.3. Tạo Ingress:**

```bash
cat > app2-ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: apache-ingress
  namespace: apps
spec:
  ingressClassName: nginx
  rules:
  - host: apache-app.local  # Thay bằng domain thực tế nếu có
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: apache-service
            port:
              number: 80
EOF

kubectl apply -f app2-ingress.yaml
```

---

## 🌐 BƯỚC 6: LẤY EXTERNAL-IP TỪ METALLB

### **6.1. Kiểm tra Ingress Controller Service:**

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

**Output mong đợi (với MetalLB):**
```
NAME                       TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)
ingress-nginx-controller   LoadBalancer   10.96.0.1       192.168.56.200   80/TCP,443/TCP
```

✅ **Ingress IP = `192.168.56.200`** (EXTERNAL-IP từ MetalLB)

**Nếu EXTERNAL-IP vẫn là `<pending>`:**
- Kiểm tra MetalLB đã cài đúng chưa
- Kiểm tra IP pool đã được cấu hình chưa
- Xem phần Troubleshooting

### **6.2. Lấy IP bằng kubectl (Tự động):**

```bash
# Lấy External IP từ MetalLB
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Ingress IP: $INGRESS_IP"

# Hoặc lấy từ Ingress resource
INGRESS_IP=$(kubectl get ingress -n apps -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}')
echo "Ingress IP: $INGRESS_IP"
```

### **6.3. Script tự động:**

```bash
cat > get-ingress-ip.sh <<'EOF'
#!/bin/bash

echo "=== Ingress Controller Service ==="
kubectl get svc -n ingress-nginx ingress-nginx-controller

echo ""
echo "=== External IP từ MetalLB ==="
EXTERNAL_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if [ -z "$EXTERNAL_IP" ]; then
    echo "❌ EXTERNAL-IP: <pending>"
    echo ""
    echo "Kiểm tra MetalLB:"
    kubectl get pods -n metallb-system
    kubectl get ipaddresspool -n metallb-system
    echo ""
    echo "→ Xem phần Troubleshooting để khắc phục"
else
    echo "✅ EXTERNAL-IP: $EXTERNAL_IP"
    echo "→ Truy cập: http://$EXTERNAL_IP"
    echo ""
    echo "=== Ingress Address ==="
    kubectl get ingress -n apps
fi
EOF

chmod +x get-ingress-ip.sh
./get-ingress-ip.sh
```

---

## 🌐 BƯỚC 7: CẤU HÌNH DNS VÀ TRUY CẬP

### **7.1. Dùng /etc/hosts (Local testing):**

**Lấy Ingress IP:**
```bash
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Ingress IP: $INGRESS_IP"
```

**Edit `/etc/hosts`:**
```bash
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: /etc/hosts (cần sudo)

# Thêm:
192.168.56.200  nginx-app.local
192.168.56.200  apache-app.local
```

**Test:**
```bash
# Test DNS resolution
ping nginx-app.local

# Test HTTP
curl http://nginx-app.local
curl http://apache-app.local

# Hoặc truy cập trực tiếp qua IP
curl http://192.168.56.200 -H "Host: nginx-app.local"
curl http://192.168.56.200 -H "Host: apache-app.local"
```

### **7.2. Truy cập trực tiếp qua EXTERNAL-IP:**

```bash
# Lấy IP
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Truy cập với Host header
curl -H "Host: nginx-app.local" http://$INGRESS_IP
curl -H "Host: apache-app.local" http://$INGRESS_IP

# Hoặc mở trình duyệt:
# http://nginx-app.local (nếu đã config /etc/hosts)
# http://192.168.56.200 (nếu dùng IP trực tiếp)
```

---

## ✅ BƯỚC 8: KIỂM TRA

### **8.1. Kiểm tra Pods:**
```bash
kubectl get pods -n apps -o wide
```

### **8.2. Kiểm tra Services:**
```bash
kubectl get svc -n apps
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

### **8.3. Kiểm tra Ingress:**
```bash
kubectl get ingress -n apps
```

**Output mong đợi:**
```
NAME             CLASS   HOSTS              ADDRESS          PORTS     AGE
nginx-ingress    nginx   nginx-app.local    192.168.56.200   80        5m
apache-ingress   nginx   apache-app.local    192.168.56.200   80        5m
```

✅ **ADDRESS = `192.168.56.200`** (từ MetalLB)

### **8.4. Kiểm tra Logs:**
```bash
# App logs
kubectl logs -n apps -l app=nginx-app
kubectl logs -n apps -l app=apache-app

# Ingress Controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

### **8.5. Test truy cập:**
```bash
# Test từ trong cluster
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- curl http://nginx-service.apps.svc.cluster.local

# Test từ ngoài (với /etc/hosts hoặc IP trực tiếp)
curl http://nginx-app.local
curl http://apache-app.local
```

---

## 🎯 TÓM TẮT CÁC LỆNH

```bash
# 1. Tạo namespace
kubectl create namespace apps

# 2. Cài Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# 3. Cài MetalLB
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.5/config/manifests/metallb-native.yaml

# 4. Cấu hình IP Pool
kubectl apply -f metallb-ip-pool.yaml

# 5. Deploy Apps
kubectl apply -f app1-nginx.yaml
kubectl apply -f app1-service.yaml
kubectl apply -f app1-ingress.yaml

kubectl apply -f app2-apache.yaml
kubectl apply -f app2-service.yaml
kubectl apply -f app2-ingress.yaml

# 6. Lấy Ingress IP
kubectl get svc -n ingress-nginx ingress-nginx-controller

# 7. Kiểm tra
kubectl get all -n apps
kubectl get ingress -n apps
```

---

## ⚠️ TROUBLESHOOTING

### **1. MetalLB không cấp IP (EXTERNAL-IP = <pending>):**

```bash
# Kiểm tra MetalLB pods
kubectl get pods -n metallb-system

# Kiểm tra IP pool
kubectl get ipaddresspool -n metallb-system
kubectl describe ipaddresspool default-pool -n metallb-system

# Kiểm tra L2Advertisement
kubectl get l2advertisement -n metallb-system
kubectl describe l2advertisement default-l2adv -n metallb-system

# Xem logs MetalLB
kubectl logs -n metallb-system -l app=metallb,component=controller
kubectl logs -n metallb-system -l app=metallb,component=speaker

# Kiểm tra events
kubectl get events -n metallb-system --sort-by='.lastTimestamp'
```

**Các nguyên nhân thường gặp:**
- **IP pool cạn:** Kiểm tra số IP còn lại trong pool
- **IP conflict:** IP đã được sử dụng bởi node hoặc service khác
- **Network không hỗ trợ L2:** Cần dùng BGP mode thay vì L2Advertisement
- **Firewall block ARP:** Kiểm tra firewall/network policies
- **RBAC issues:** Kiểm tra service account và permissions

**Giải pháp:**
```bash
# Mở rộng IP pool
kubectl edit ipaddresspool default-pool -n metallb-system
# Thêm thêm IP vào addresses

# Hoặc tạo IP pool mới
kubectl apply -f metallb-ip-pool.yaml  # Với dải IP mới

# Kiểm tra IP đã được cấp
kubectl get svc --all-namespaces -o wide | grep LoadBalancer
```

### **2. Pod không start:**
```bash
# Xem events
kubectl describe pod <pod-name> -n apps

# Xem logs
kubectl logs <pod-name> -n apps
```

### **3. Service không connect:**
```bash
# Test từ trong cluster
kubectl run -it --rm test --image=busybox --restart=Never -- wget -O- http://nginx-service.apps.svc.cluster.local
```

### **4. Ingress không hoạt động:**
```bash
# Kiểm tra Ingress Controller
kubectl get pods -n ingress-nginx

# Xem Ingress Controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Kiểm tra Ingress resource
kubectl describe ingress <ingress-name> -n apps
```

### **5. Image pull errors:**
```bash
# Kiểm tra image có tồn tại không
docker pull nginx:alpine  # Test trên worker node

# Nếu private registry, kiểm tra Secret
kubectl get secrets -n apps
```

---

## 📚 TÀI LIỆU THAM KHẢO

- [MetalLB Documentation](https://metallb.universe.tf/)
- [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Nginx Ingress Controller](https://kubernetes.github.io/ingress-nginx/)

---

## 🎯 NEXT STEPS

Sau khi test thành công 2 apps với MetalLB, bạn có thể:
1. ✅ Deploy apps từ registry riêng
2. ✅ Cấu hình SSL/TLS với cert-manager
3. ✅ Scale apps (tăng replicas)
4. ✅ Deploy custom apps từ source code
5. ✅ Setup monitoring và logging
