package com.example.AutoDeployApp.service;

import com.example.AutoDeployApp.entity.Application;
import com.example.AutoDeployApp.entity.User;
import com.example.AutoDeployApp.repository.ApplicationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ApplicationService {

    private final ApplicationRepository applicationRepository;
    private final UserService userService;

    public ApplicationService(ApplicationRepository applicationRepository, UserService userService) {
        this.applicationRepository = applicationRepository;
        this.userService = userService;
    }

    @Transactional
    public Application createApplication(Long userId, String appName, String dockerImage) {
        // Lấy thông tin user để lấy username
        User user = userService.findAll().stream()
                .filter(u -> u.getId().equals(userId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Validate input
        if (appName == null || appName.trim().isEmpty()) {
            throw new IllegalArgumentException("Tên dự án không được để trống");
        }
        if (dockerImage == null || dockerImage.trim().isEmpty()) {
            throw new IllegalArgumentException("Docker Hub image không được để trống");
        }

        // Validate docker image format
        String dockerImagePattern = "^[a-zA-Z0-9._\\/-]+(:[a-zA-Z0-9._-]+)?$";
        if (!dockerImage.trim().matches(dockerImagePattern)) {
            throw new IllegalArgumentException(
                    "Định dạng Docker Hub image không hợp lệ. Ví dụ: nginx:latest, username/my-app:v1.0");
        }

        // Tạo Application entity
        Application application = new Application();
        String trimmedAppName = appName.trim();
        application.setAppName(trimmedAppName);
        application.setName(trimmedAppName); // Set legacy name field for compatibility
        application.setDockerImage(dockerImage.trim());
        application.setUserId(userId);
        application.setStatus("PENDING");
        // Sanitize username và appname để tạo namespace hợp lệ: username-appname
        String namespace = sanitizeNamespaceName(user.getUsername(), trimmedAppName);
        application.setK8sNamespace(namespace); // Namespace = sanitized username-appname

        return applicationRepository.save(application);
    }

    public List<Application> getUserApplications(Long userId) {
        // Filter out DELETED applications - chỉ hiển thị các app chưa bị xóa
        return applicationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .filter(app -> !"DELETED".equals(app.getStatus()))
                .toList();
    }

    public Optional<Application> getApplicationById(Long id) {
        return applicationRepository.findById(id);
    }

    /**
     * User request delete: Chỉ đánh dấu status = DELETED, không xóa thực sự
     * Admin sẽ xóa hoàn toàn sau
     */
    @Transactional
    public Application markAsDeleted(Long applicationId, Long userId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new IllegalArgumentException("Application not found"));

        // Kiểm tra user có quyền xóa app này không
        if (!application.getUserId().equals(userId)) {
            throw new IllegalArgumentException("Bạn không có quyền xóa ứng dụng này");
        }

        // Kiểm tra app đã bị xóa chưa
        if ("DELETED".equals(application.getStatus())) {
            throw new IllegalArgumentException("Ứng dụng đã được đánh dấu xóa rồi");
        }

        // Đánh dấu status = DELETED (chờ admin xóa hoàn toàn)
        application.setStatus("DELETED");
        return applicationRepository.save(application);
    }

    public List<Application> getPendingApplications() {
        return applicationRepository.findByStatusOrderByCreatedAtDesc("PENDING");
    }

    public List<Application> getAllApplications() {
        // Admin có thể xem tất cả, kể cả DELETED
        return applicationRepository.findAllByOrderByCreatedAtDesc();
    }

    /**
     * Admin delete completely: Xóa K8s resources và xóa record trong DB
     */
    @Transactional
    public void deleteApplicationCompletely(Long applicationId) {
        // Kiểm tra application tồn tại trước khi xóa
        if (!applicationRepository.existsById(applicationId)) {
            throw new IllegalArgumentException("Application not found");
        }

        // Xóa record trong database (sẽ xóa K8s resources ở AdminController)
        applicationRepository.deleteById(applicationId);
    }

    @Transactional
    public Application updateApplication(Application application) {
        return applicationRepository.save(application);
    }

    /**
     * Sanitize username và appname để tạo namespace hợp lệ trong Kubernetes
     * Format: username-appname
     * K8s namespace chỉ cho phép: chữ thường, số, dấu gạch ngang (-)
     * Tối đa 63 ký tự, không được bắt đầu bằng số
     * 
     * @param username Username gốc (có thể là email hoặc tên có ký tự đặc biệt)
     * @param appName  Tên ứng dụng
     * @return Namespace name đã được sanitize: username-appname
     */
    private String sanitizeNamespaceName(String username, String appName) {
        // Sanitize username
        String sanitizedUsername = sanitizeStringForK8s(username);
        if (sanitizedUsername.isEmpty()) {
            sanitizedUsername = "default-user";
        }

        // Sanitize appname
        String sanitizedAppName = sanitizeStringForK8s(appName);
        if (sanitizedAppName.isEmpty()) {
            sanitizedAppName = "app";
        }

        // Kết hợp: username-appname
        String namespace = sanitizedUsername + "-" + sanitizedAppName;

        // Giới hạn độ dài (K8s namespace max 63 chars)
        // Ưu tiên giữ username, cắt appname nếu cần
        if (namespace.length() > 63) {
            int maxAppNameLength = 63 - sanitizedUsername.length() - 1; // -1 cho dấu gạch ngang
            if (maxAppNameLength > 0) {
                namespace = sanitizedUsername + "-" + sanitizedAppName.substring(0, maxAppNameLength);
                // Đảm bảo không kết thúc bằng dấu gạch ngang
                namespace = namespace.replaceAll("-$", "");
            } else {
                // Nếu username quá dài, chỉ dùng username (đã được giới hạn ở
                // sanitizeStringForK8s)
                namespace = sanitizedUsername.substring(0, Math.min(63, sanitizedUsername.length()));
            }
        }

        return namespace;
    }

    /**
     * Sanitize một string để phù hợp với K8s naming conventions
     */
    private String sanitizeStringForK8s(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "";
        }

        String sanitized = input.trim()
                .toLowerCase() // Chuyển thành chữ thường
                .replaceAll("[^a-z0-9-]", "-") // Thay thế ký tự không hợp lệ bằng dấu gạch ngang
                .replaceAll("-+", "-") // Loại bỏ nhiều dấu gạch ngang liên tiếp
                .replaceAll("^-|-$", ""); // Loại bỏ dấu gạch ngang ở đầu và cuối

        // Nếu bắt đầu bằng số, thêm prefix
        if (!sanitized.isEmpty() && Character.isDigit(sanitized.charAt(0))) {
            sanitized = "n" + sanitized; // Thêm 'n' prefix thay vì "user-" để ngắn gọn hơn
        }

        // Giới hạn độ dài (K8s namespace max 63 chars, nhưng string này có thể dùng làm
        // phần của namespace)
        if (sanitized.length() > 50) {
            sanitized = sanitized.substring(0, 50);
            sanitized = sanitized.replaceAll("-$", "");
        }

        return sanitized;
    }
}
