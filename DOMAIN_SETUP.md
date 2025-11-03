# 🌐 CẤU HÌNH DOMAIN-BASED ROUTING CHO INGRESS

## 📋 Tổng quan

Hệ thống hỗ trợ **domain-based routing** để truy cập ứng dụng qua subdomain thay vì path:
- **Path-based** (mặc định): `http://192.168.56.200/user1-nginx/`
- **Domain-based**: `http://user1-nginx.apps.local`

## ⚙️ Cấu hình

### Bước 1: Cấu hình Base Domain

Trong file `application.properties`, đã set:
```properties
k8s.ingress.domain.base=apps.local
```

Nếu muốn đổi domain khác (ví dụ: `apps.example.com`), sửa dòng trên.

### Bước 2: Lấy EXTERNAL-IP của Ingress Controller

Lấy IP từ MetalLB hoặc Ingress Controller:
```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

Ví dụ: `192.168.56.200`

### Bước 3: Cấu hình DNS hoặc File Hosts

#### **Cách 1: Cấu hình DNS (Production)**

Thêm wildcard A record vào DNS server:
```
*.apps.local  A  192.168.56.200
```

#### **Cách 2: Thêm vào File Hosts (Development/Testing)**

**Windows:**
1. Mở file: `C:\Windows\System32\drivers\etc\hosts` (Run as Administrator)
2. Thêm dòng:
   ```
   192.168.56.200  *.apps.local
   ```
   **Lưu ý:** Windows có thể không hỗ trợ wildcard trong hosts file. Thay vào đó, thêm từng subdomain:
   ```
   192.168.56.200  user1-nginx.apps.local
   192.168.56.200  user1-gmail-com-car-serv.apps.local
   ```

**Linux/Mac:**
1. Mở file: `/etc/hosts` (cần sudo)
2. Thêm dòng:
   ```
   192.168.56.200  *.apps.local
   ```
   **Lưu ý:** Linux/Mac có thể không hỗ trợ wildcard trong hosts file. Thay vào đó, dùng script hoặc thêm từng subdomain:
   ```
   192.168.56.200  user1-nginx.apps.local
   192.168.56.200  user1-gmail-com-car-serv.apps.local
   ```

## 🔄 Hoạt động

### Khi tạo Ingress:

1. Hệ thống kiểm tra `k8s.ingress.domain.base` trong `application.properties`
2. Nếu có giá trị → Tạo Ingress với host: `{namespace}.{domain.base}`
   - Ví dụ: `user1-nginx.apps.local`
3. Nếu không có → Dùng path-based: `/{namespace}/`

### Format URL:

- **Domain-based**: `http://{namespace}.{domain.base}`
  - Ví dụ: `http://user1-nginx.apps.local`
- **Path-based**: `http://{EXTERNAL-IP}/{namespace}/`
  - Ví dụ: `http://192.168.56.200/user1-nginx/`

## 🧪 Kiểm tra

### Test DNS/Hosts:

```bash
# Test trên Windows
nslookup user1-nginx.apps.local

# Test trên Linux/Mac
dig user1-nginx.apps.local
# hoặc
ping user1-nginx.apps.local
```

### Test từ Browser:

Truy cập URL được hiển thị trong Deployment Requests:
- `http://user1-nginx.apps.local`

## ⚠️ Lưu ý

1. **Windows hosts file không hỗ trợ wildcard**: Phải thêm từng subdomain hoặc dùng tool tự động
2. **DNS Server**: Nếu dùng DNS server thật, chỉ cần 1 wildcard A record
3. **Namespace format**: Namespace được sanitize (ví dụ: `user1@gmail.com` → `user1-gmail-com`), nên subdomain sẽ là `user1-gmail-com.apps.local`
4. **Restart ứng dụng**: Sau khi đổi `k8s.ingress.domain.base`, cần restart Spring Boot app

## 🔧 Troubleshooting

### URL không truy cập được:

1. **Kiểm tra hosts file đã thêm đúng chưa**
   ```bash
   # Windows PowerShell (run as admin)
   Get-Content C:\Windows\System32\drivers\etc\hosts
   
   # Linux/Mac
   cat /etc/hosts
   ```

2. **Kiểm tra Ingress đã tạo với host chưa**
   ```bash
   kubectl get ingress -n {namespace} -o yaml
   ```

3. **Kiểm tra EXTERNAL-IP của Ingress Controller**
   ```bash
   kubectl get svc -n ingress-nginx ingress-nginx-controller
   ```

4. **Test kết nối trực tiếp bằng IP**
   ```bash
   curl http://192.168.56.200
   ```

## 📝 Ví dụ

### Namespace → Subdomain mapping:

| Namespace | Subdomain | URL |
|-----------|-----------|-----|
| `user1-nginx` | `user1-nginx.apps.local` | `http://user1-nginx.apps.local` |
| `user1-gmail-com-car-serv` | `user1-gmail-com-car-serv.apps.local` | `http://user1-gmail-com-car-serv.apps.local` |

### File hosts mẫu (Windows):

```
# Kubernetes Ingress Apps
192.168.56.200  user1-nginx.apps.local
192.168.56.200  user1-gmail-com-car-serv.apps.local
```

### File hosts mẫu (Linux/Mac):

```
# Kubernetes Ingress Apps
192.168.56.200  user1-nginx.apps.local
192.168.56.200  user1-gmail-com-car-serv.apps.local
```

