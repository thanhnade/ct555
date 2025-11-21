# Auto Deploy App

Ứng dụng Spring Boot hỗ trợ quản lý triển khai tự động, tích hợp với Ansible và Kubernetes.

## Tính năng chính
- Giao diện quản trị được dựng bằng Thymeleaf và các module JavaScript trong `src/main/resources/static/js`.
- Quản lý máy chủ, key SSH và người dùng thông qua các controller trong gói `com.example.AutoDeployApp.controller`.
- Hỗ trợ WebSocket để truyền log thời gian thực và tương tác với playbook Ansible.
- Kết nối Kubernetes (Fabric8 client) để thao tác workload, namespace và dịch vụ.

## Yêu cầu hệ thống
- Java 21
- Maven (có sẵn wrapper `./mvnw`)
- MySQL đang chạy và cho phép kết nối từ ứng dụng

## Thiết lập nhanh
1. Sao chép cấu hình database và Kubernetes trong `src/main/resources/application.properties` cho phù hợp môi trường của bạn (URL, username/password MySQL, đường dẫn kubeconfig, thông tin ingress).
2. Cài đặt dependencies và chạy ứng dụng:
   ```bash
   ./mvnw spring-boot:run
   ```
3. Ứng dụng mặc định chạy ở cổng `8080`. Truy cập trình duyệt để vào trang đăng nhập hoặc giao diện quản trị.

## Cấu trúc chính
- `src/main/java/com/example/AutoDeployApp`: mã nguồn backend (controller, service, entity, cấu hình).
- `src/main/resources/templates`: giao diện Thymeleaf cho khu vực admin và người dùng.
- `src/main/resources/static`: tài nguyên tĩnh (CSS/JS) và thư viện Bootstrap 5.3.3.
