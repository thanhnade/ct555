## AutoDeployApp – Tài liệu chức năng & kế hoạch triển khai Kubernetes

Tài liệu này mô tả chức năng, kiến trúc và lộ trình vận hành của nền tảng AutoDeployApp – hệ thống self-service giúp developer triển khai ứng dụng container vào các cụm Kubernetes có kiểm soát bởi đội vận hành.

### 1. Mục tiêu & Phạm vi
- **Mục tiêu tổng quát**: Rút ngắn thời gian đưa ứng dụng lên Kubernetes, bảo đảm tiêu chuẩn bảo mật/quan sát, giảm phụ thuộc vào đội DevOps thủ công.
- **Phạm vi chức năng**: Quản lý người dùng, quy trình request/approve deploy, quản trị cluster/server/SSH key, tích hợp Ansible để chuẩn bị hạ tầng, tạo tài nguyên Kubernetes (Namespace, Deployment, Service, Ingress) và cung cấp URL truy cập.
- **Phạm vi triển khai**: Áp dụng cho môi trường Dev/QA/Prod, hỗ trợ nhiều cluster và mô hình multi-tenant (mỗi user một namespace độc lập).

### 2. Personas & Quyền truy cập
- **Client (Developer)**  
  - Đăng nhập, quản lý yêu cầu triển khai ứng dụng của chính mình.  
  - Theo dõi trạng thái, URL truy cập, nhật ký triển khai; gửi yêu cầu xóa.
- **Admin (DevOps/SRE)**  
  - Duyệt hoặc từ chối yêu cầu triển khai, chọn cluster phù hợp.  
  - Quản trị danh sách cluster, máy chủ, SSH key, playbook Ansible.  
  - Theo dõi nhật ký hệ thống, can thiệp chạy lại hoặc gỡ ứng dụng.  
- **System**  
  - Các tác vụ nền: đồng bộ trạng thái Kubernetes, ghi log hoạt động người dùng, đảm bảo chính sách quota/limit.

### 3. Chức năng trọng tâm
1. **Quản lý người dùng & phân quyền**: Role-based (ADMIN/CLIENT), phiên đăng nhập bảo mật (session + CSRF).
2. **Quy trình yêu cầu triển khai**: Client tạo yêu cầu (appName, dockerImage, tài nguyên, env, replicas, cổng); trạng thái `PENDING → (APPROVED|REJECTED) → RUNNING/ERROR`.
3. **Quản trị Kubernetes**: Admin chọn cluster healthy, hệ thống tự tạo Namespace theo username, sinh Deployment/Service/Ingress, đợi pod ready và ghi URL.
4. **Quản lý hạ tầng Ansible**: Lưu cấu hình playbook, chạy Ansible qua SSH để chuẩn bị node hoặc cài đặt phụ trợ.
5. **Theo dõi & audit**: WebSocket realtime log (terminal, Ansible, deployment), bảng UserActivity lưu mọi hành động quan trọng.
6. **Lifecycle ứng dụng**: Retry, update tài nguyên, scale replicas, xóa ứng dụng (dọn tài nguyên Kubernetes + DB).

### 4. Kiến trúc giải pháp
- **Frontend (Thymeleaf + JS)**:  
  - Trang đăng nhập, dashboard người dùng, màn admin phê duyệt, trang quản lý cluster/server/SSH key/playbook, console log realtime.
- **Backend (Spring Boot 3)**:  
  - REST controllers (`ApplicationController`, `AdminController`, `ClusterAdminController`, `ServerAdminController`, `SshKeyAdminController`, `Ansible*Controller`).  
  - WebSocket (`AnsibleWebSocketHandler`, `TerminalWebSocketHandler`) phục vụ log thời gian thực.  
  - Services: `KubernetesService`, `AnsibleService`, `ApplicationService`, `UserService`, `ClusterService`, `ServerService`, `AnsibleInstallationService`.  
  - Bảo mật: `SecurityConfig`, `AdminAccessInterceptor`, `GlobalExceptionHandler`, `WebSocketConfig`.
- **Persistence layer**: JPA + MySQL với các entity `User`, `Application`, `Cluster`, `Server`, `SshKey`, `UserActivity`.
- **Kubernetes integration**: Fabric8 Client 6.12.0, mỗi user một Namespace, mỗi ứng dụng một Deployment + Service + Ingress dùng ingress-nginx và MetalLB.
- **Ansible integration**: Chạy playbook trên node MASTER qua JSch SSH, thư mục chuẩn `/etc/ansible/playbooks`.

### 5. Luồng nghiệp vụ chính
1. **Đăng nhập & xác thực**  
   - Người dùng nhập credential, hệ thống tạo session, áp dụng CSRF/XSS headers; mật khẩu lưu dạng BCrypt.
2. **Client tạo yêu cầu**  
   - Điền thông tin ứng dụng: tên, namespace đề xuất (từ username), Docker image, biến môi trường, giới hạn CPU/memory, replicas, cổng truy cập.  
   - Yêu cầu được ghi DB với trạng thái `PENDING`. WebSocket gửi thông báo cho admin.
3. **Admin xét duyệt**  
   - Kiểm tra cluster, override thông số tài nguyên nếu cần, chọn hoặc để hệ thống auto-pick cluster healthy dựa trên tiêu chí (CPU free, trạng thái API).  
   - `APPROVE`: backend kích hoạt tiến trình triển khai; `REJECT`: ghi lý do và thông báo lại cho người dùng.
4. **Triển khai Kubernetes tự động**  
   - Đảm bảo Namespace tồn tại; tạo ServiceAccount với quyền tối thiểu.  
   - Tạo Deployment (image, env, resource limits, replicas, probes nếu cấu hình).  
   - Tạo Service (ClusterIP/NodePort) và Ingress (ingressClass `nginx`, host theo `username-app.apps.domain`).  
   - Theo dõi trạng thái Deployment tối đa 2 phút; nếu thành công, lấy Ingress URL và cập nhật `RUNNING`. Nếu lỗi, đặt `ERROR`, lưu log và root cause.
5. **Quan sát & nhật ký**  
   - Người dùng xem log thời gian thực qua WebSocket; hệ thống lưu trữ log sự kiện và trạng thái vào DB + file log chuẩn (structured).  
   - Admin có màn hình tổng hợp trạng thái cluster, số lượng pod/namespace, cảnh báo lỗi.
6. **Quản lý vòng đời**  
   - `Retry`: Admin có thể kích hoạt lại pipeline nếu lỗi tạm thời.  
   - `Update`: điều chỉnh replicas/tài nguyên, hệ thống áp dụng rolling update.  
   - `Delete`: yêu cầu xóa sẽ dọn Deployment/Service/Ingress và đánh dấu ứng dụng `DELETED` trong DB.

### 6. Tính năng theo module
| Module | Chức năng chính | Actor |
| --- | --- | --- |
| Quản lý ứng dụng | CRUD yêu cầu Deployment, xem trạng thái, URL, log | Client/Admin |
| Quản lý cluster & server | Thêm/sửa/xóa cluster, validate kubeconfig, kiểm tra health | Admin |
| SSH Key & Playbook | Lưu trữ SSH key an toàn, quản lý playbook Ansible, chạy/gỡ cài đặt | Admin |
| Người dùng & phân quyền | Tạo user, reset mật khẩu, audit hoạt động | Admin |
| Logging & Audit | Realtime log qua WebSocket, UserActivity log, lưu artefact triển khai | Hệ thống |
| Báo cáo & Dashboard | Thống kê số request theo trạng thái, thời gian triển khai trung bình | Admin |

### 7. Hạ tầng & cấu hình
- **MySQL**: CSDL `autodeploy`, dev bật `spring.jpa.hibernate.ddl-auto=update`, prod dùng migration (Flyway/Liquibase).
- **Kubernetes cluster**:  
  - Cài ingress-nginx + MetalLB; mở port 80/443.  
  - Node MASTER cho phép SSH từ AutoDeployApp để lấy kubeconfig và chạy Ansible.
- **DNS/Hosts**: Wildcard `*.apps.local` (dev) hoặc domain chính. Có thể cấu hình `k8s.ingress.domain.base` và `k8s.ingress.external.ip`.
- **application.properties** (ví dụ):  
  ```properties
  k8s.ingress.class=nginx
  k8s.ingress.domain.base=apps.local
  k8s.ingress.external.ip=
  ansible.playbook.dir=/etc/ansible/playbooks
  security.admin.session-timeout=30m
  ```

### 8. Bảo mật & tuân thủ
- **Tài khoản**:  
  - BCrypt password, chính sách đổi mật khẩu định kỳ, khóa tài khoản sau N lần sai.  
  - Session hardening, CSRF token, HTTP security headers (HSTS, CSP, X-Frame-Options).
- **SSH & kubeconfig**:  
  - Không lưu private key dạng plaintext; mã hóa hoặc dùng secret manager.  
  - Chỉ cấp quyền cần thiết trên node MASTER; audit tất cả lệnh SSH.  
  - Kubeconfig chỉ tải về tạm thời, xóa khi xong phiên.
- **Registry & secrets**:  
  - Hỗ trợ imagePullSecrets cho private registry.  
  - Không ghi secrets vào log; mã hóa dữ liệu nhạy cảm tại DB (at-rest) và TLS in-transit.
- **RBAC Kubernetes**:  
  - ServiceAccount tối thiểu per namespace, NetworkPolicy chặn liên namespace.  
  - ResourceQuota & LimitRange đảm bảo không vượt tài nguyên được cấp.

### 9. Vận hành & quan sát
- **Logging**: Log ứng dụng dạng structured JSON; xuất sang ELK/EFK nếu cần.  
- **Metrics**: Sử dụng Micrometer + Prometheus để thu thập JVM, HTTP, deployment latency; dashboard Grafana.  
- **Tracing**: Tùy chọn tích hợp OpenTelemetry để theo dõi luồng request → deploy.  
- **Backup/DR**: Sao lưu MySQL hằng ngày, backup kubeconfig/cluster config; tài liệu quy trình khôi phục.  
- **Khả năng mở rộng**: Backend stateless, scale horizontal; cấu hình cache và connection pool tối ưu.

### 10. Lộ trình phát triển
1. **Sprint 1 – MVP (2-3 tuần)**  
   - Hoàn thiện luồng request → approve → deploy, Ingress URL, realtime log cơ bản.  
   - Auto-chọn cluster healthy đầu tiên, xác thực Docker image đơn giản (HEAD/GET registry).  
2. **Sprint 2 – Hardening (3-4 tuần)**  
   - ResourceQuota/LimitRange theo namespace, cấu hình domain chuẩn, probes mặc định, retry/backoff.  
   - Cải thiện quản lý SSH key (rotate, mask), audit chi tiết hoạt động admin.  
3. **Sprint 3 – Production Ready (4-6 tuần)**  
   - Hỗ trợ private registry, imagePullSecrets, Vault/Secret Manager.  
   - Autoscaling (HPA), chính sách multi-cluster, RBAC nâng cao, alerting + backup/DR hoàn chỉnh.  
4. **Sprint 4 – Mở rộng & Trải nghiệm**  
   - Canary/Rolling/Blue-Green, SSO/SAML/OIDC, observability đầy đủ (Grafana/Prometheus/ELK/Tempo).  
   - Báo cáo KPI, hỗ trợ nhiều vùng địa lý, tối ưu UX.

### 11. KPI mục tiêu
- Tỷ lệ triển khai thành công > 98%.  
- Thời gian triển khai trung bình < 5 phút/app (tính từ APPROVE đến RUNNING).  
- Uptime nền tảng > 99.9%.  
- MTTR (khôi phục sự cố nền tảng) < 30 phút.  
- Độ trễ ghi log/URL < 5 giây sau khi Deployment ready.

### 12. Rủi ro & biện pháp giảm thiểu
- **Độ phức tạp Kubernetes**: Chuẩn hóa baseline cluster (add-on, policy) hoặc dùng managed K8s.  
- **Bảo mật**: Thực hiện security review định kỳ, xoay vòng SSH key/credential, áp dụng secret management.  
- **Vendor lock-in**: Trừu tượng hóa client Kubernetes/Fabric8 để dễ thay thế, hỗ trợ đa registry/cloud.  
- **Thiếu kỹ năng vận hành**: Đào tạo Dev/DevOps, biên soạn runbook, tự động hóa test và checklist.  
- **Hiệu năng**: Áp dụng queue hoặc serialize theo user khi có >100 request đồng thời.

### 13. Kế hoạch kiểm thử
- **Unit/Integration**: Tập trung ApplicationService, KubernetesService, AdminController flows.  
- **E2E**: Kịch bản submit → approve → deploy → ready → delete; bao gồm cả lỗi image và thiếu quota.  
- **Chaos testing nhẹ**: Mô phỏng mất kết nối MASTER, lỗi registry, pod không lên.  
- **Performance**: 100 request song song, đo thời gian xử lý và queue.  
- **Bảo mật**: Kiểm thử CSRF/XSS, fuzz API, xác minh role-based access.

### 14. Phụ lục & tham chiếu
- Mã nguồn chi tiết tại `src/main/java/com/example/AutoDeployApp`.  
- Tài liệu Fabric8 migration: `docs/FABRIC8_MIGRATION_GUIDE.md`.  
- Danh sách playbook Ansible chuẩn lưu ở `/etc/ansible/playbooks`.  
- Khi triển khai thực tế, cập nhật domain/IP, credential, chính sách bảo mật theo môi trường Dev/QA/Prod cụ thể.

### 15. API & UI admin mới cập nhật
- **API Retry Deployment**  
  - Endpoint: `POST /admin/deployment-requests/{id}/retry`  
  - Body: kế thừa `processDeploymentRequest` (tùy chọn `clusterId`, `containerPort`, `replicas`, `cpuRequest`, `envVars`, v.v.)  
  - Chức năng: cho phép admin kích hoạt lại quy trình deploy đối với request đang `ERROR` mà không cần thao tác thủ công khác; tái sử dụng toàn bộ logic log/audit có sẵn.
- **API Scale Deployment**  
  - Endpoint: `POST /admin/deployment-requests/{id}/scale`  
  - Body mẫu:  
    ```json
    {
      "replicas": 3
    }
    ```  
  - Điều kiện: chỉ dùng cho ứng dụng `RUNNING` với đầy đủ metadata (clusterId, namespace, deploymentName). Hệ thống gọi `KubernetesService.scaleDeployment`, cập nhật `Application.replicas` và ghi log hoạt động admin.
- **Cập nhật UI Admin**  
  - Thêm nút **Retry** trên trang chi tiết/ bảng request (hiển thị khi status = `ERROR`). Nút gọi API retry với thông số tùy chọn admin cấu hình trong modal.  
  - Thêm nút **Scale** cho các ứng dụng `RUNNING`: mở dialog nhập số replicas mới, gọi API scale và hiển thị kết quả (kèm log).  
  - Cập nhật bảng log realtime/ lịch sử để phản ánh hành động retry/scale, giúp admin và developer theo dõi dễ dàng.
