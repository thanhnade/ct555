## Checklist quản lý triển khai ứng dụng lên Kubernetes

Bảng dưới giúp theo dõi các công việc trọng yếu quanh module triển khai ứng dụng. Đánh dấu `✔` khi hoàn tất; cập nhật ghi chú để lưu tiến độ.

### Ưu tiên Cao (High)
- [ ] **Chuẩn hóa luồng yêu cầu & phê duyệt deploy** (`src/main/java/com/example/AutoDeployApp/controller/ApplicationController.java`, `.../controller/AdminController.java`, `.../service/ApplicationService.java`)  
      Xác định thông tin bắt buộc (image, env, resource, replicas) và tiêu chí auto-approve vs. cần admin review; log lý do reject cho client.
- [ ] **Cơ chế chọn cluster & health-check định kỳ** (`src/main/java/com/example/AutoDeployApp/service/ClusterService.java`, `.../controller/AdminController.java`)  
      Thu thập CPU/RAM khả dụng, trạng thái API; xây chiến lược ưu tiên (round-robin theo vùng, failover) trước khi tạo namespace/deployment.
- [ ] **Tự động tạo namespace + RBAC tối thiểu cho mỗi user** (`src/main/java/com/example/AutoDeployApp/service/ApplicationService.java`, `.../service/KubernetesService.java`)  
      Chuẩn hóa tên namespace từ username, kiểm tra tồn tại ResourceQuota/LimitRange, tạo ServiceAccount và RoleBinding phù hợp.
- [ ] **Module tạo Deployment/Service/Ingress bằng Fabric8** (`src/main/java/com/example/AutoDeployApp/service/KubernetesService.java`)  
      Template hóa spec container (image, env, requests/limits, probes), mapping cổng → Service, sinh host `username-app.apps.domain`.

### Ưu tiên Trung bình (Medium)
- [x] **Watcher trạng thái Deployment & thu thập log lỗi** (`src/main/java/com/example/AutoDeployApp/service/KubernetesService.java`, `.../controller/AdminController.java`, `.../static/admin.js`)  
      ✔ Tách phương thức `collectDeploymentDiagnostics` để thu thập pods/logs; thêm API `/admin/deployment-requests/{id}/diagnostics` và nút Diagnostics trên UI admin để xem log lỗi tức thì.
- [ ] **Ghi nhận kết quả deploy vào DB + audit** (`src/main/java/com/example/AutoDeployApp/controller/AdminController.java`, `.../service/ApplicationService.java`, `.../service/UserService.java`)  
      Cập nhật trạng thái RUNNING/ERROR, lưu accessUrl, tên resource K8s, đồng thời tạo bản ghi UserActivity.
- [x] **API lifecycle (retry/update/delete)** (`src/main/java/com/example/AutoDeployApp/controller/ApplicationController.java`, `.../controller/AdminController.java`, `.../service/KubernetesService.java`)  
      ✔ Đã thêm endpoint `/admin/deployment-requests/{id}/retry` và `/admin/deployment-requests/{id}/scale` để admin kích hoạt lại/điều chỉnh replicas; tiếp theo có thể mở rộng phần update/delete phía client nếu cần.
      Cho phép admin/client (có quyền) kích hoạt lại, chỉnh replicas/tài nguyên, hoặc xóa ứng dụng và dọn tài nguyên K8s/DB.

### Ưu tiên Thấp (Low)
- [ ] **Console log realtime trên UI** (`src/main/java/com/example/AutoDeployApp/ws/TerminalWebSocketHandler.java`, `.../ws/AnsibleWebSocketHandler.java`, view ở `src/main/resources/templates/`)  
      Tích hợp WebSocket phát log Fabric8/Ansible cho từng requestId để user theo dõi trong dashboard.
- [ ] **Dashboard chỉ số triển khai** (`src/main/java/com/example/AutoDeployApp/controller/AdminController.java`, `src/main/resources/templates/admin/` + repositories)  
      Thống kê số request theo trạng thái, thời gian deploy trung bình, cluster utilization để hỗ trợ quyết định vận hành.
- [ ] **Tài liệu runbook & checklist vận hành** (`docs/AUTO_DEPLOY_K8S_PLAN.md`, `docs/DEPLOYMENT_PRIORITY_CHECKLIST.md`, tạo mới `docs/RUNBOOK_DEPLOYMENT.md`)  
      Viết hướng dẫn chuẩn bị cluster, xử lý sự cố thường gặp, quy trình rollback khi deploy lỗi.

> Ghi chú: cập nhật file này sau mỗi Sprint để phản ánh tiến độ mới nhất, đồng thời liên kết task tương ứng trong backlog (Jira/YouTrack).
