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
    public Application createApplication(Long userId, String appName, String dockerImage,
            String cpuRequest, String cpuLimit, String memoryRequest, String memoryLimit) {
        // Lấy thông tin user để lấy username
        User user = userService.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Kiểm tra dữ liệu đầu vào
        if (appName == null || appName.trim().isEmpty()) {
            throw new IllegalArgumentException("Tên dự án không được để trống");
        }
        if (dockerImage == null || dockerImage.trim().isEmpty()) {
            throw new IllegalArgumentException("Docker Hub image không được để trống");
        }

        // Kiểm tra định dạng docker image
        String dockerImagePattern = "^[a-zA-Z0-9._\\/-]+(:[a-zA-Z0-9._-]+)?$";
        if (!dockerImage.trim().matches(dockerImagePattern)) {
            throw new IllegalArgumentException(
                    "Định dạng Docker Hub image không hợp lệ. Ví dụ: nginx:latest, username/my-app:v1.0");
        }

        // Tạo entity Application
        Application application = new Application();
        String trimmedAppName = appName.trim();
        application.setAppName(trimmedAppName);
        application.setName(trimmedAppName); // Đồng bộ trường legacy để tương thích
        application.setDockerImage(dockerImage.trim());
        application.setUserId(userId);
        application.setStatus("PENDING");
        // Mỗi user chỉ có 1 namespace: dựa theo username đã sanitize
        String namespace = sanitizeUserNamespace(user.getUsername());
        application.setK8sNamespace(namespace);

        // Thiết lập resource limit (nếu null thì dùng mặc định trên entity)
        if (cpuRequest != null && !cpuRequest.trim().isEmpty()) {
            application.setCpuRequest(cpuRequest.trim());
        }
        if (cpuLimit != null && !cpuLimit.trim().isEmpty()) {
            application.setCpuLimit(cpuLimit.trim());
        }
        if (memoryRequest != null && !memoryRequest.trim().isEmpty()) {
            application.setMemoryRequest(memoryRequest.trim());
        }
        if (memoryLimit != null && !memoryLimit.trim().isEmpty()) {
            application.setMemoryLimit(memoryLimit.trim());
        }

        return applicationRepository.save(application);
    }

    public List<Application> getUserApplications(Long userId) {
        // Bỏ qua các application có trạng thái DELETED để chỉ hiển thị app còn hoạt động
        return applicationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .filter(app -> !"DELETED".equals(app.getStatus()))
                .toList();
    }

    public Optional<Application> getApplicationById(Long id) {
        return applicationRepository.findById(id);
    }

    /**
     * Người dùng yêu cầu xóa: chỉ đánh dấu trạng thái DELETED, phần xóa hoàn toàn do admin thực hiện
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

        // Đánh dấu trạng thái DELETED (đợi admin xóa hẳn)
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

    public List<Application> getApplicationsByUserId(Long userId) {
        return applicationRepository.findByUserIdOrderByCreatedAtDesc(userId);
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

    @Transactional
    public Application requestScaleAction(Long applicationId, Long userId, int replicas) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(() -> new IllegalArgumentException("Application not found"));

        if (!application.getUserId().equals(userId)) {
            throw new IllegalArgumentException("Bạn không có quyền thay đổi ứng dụng này");
        }

        if ("DELETED".equalsIgnoreCase(application.getStatus())) {
            throw new IllegalStateException("Ứng dụng đã bị xóa");
        }

        if (replicas < 0 || replicas > 200) {
            throw new IllegalArgumentException("Giá trị replicas phải nằm trong khoảng 0-200");
        }

        application.setReplicasRequested(replicas);
        return applicationRepository.save(application);
    }

    /**
     * Tạo namespace cho user: chỉ dựa vào username (mỗi user 1 namespace)
     */
    private String sanitizeUserNamespace(String username) {
        String sanitizedUsername = sanitizeStringForK8s(username);
        if (sanitizedUsername.isEmpty()) {
            sanitizedUsername = "default-user";
        }
        if (sanitizedUsername.length() > 63) {
            sanitizedUsername = sanitizedUsername.substring(0, 63).replaceAll("-$", "");
        }
        return sanitizedUsername;
    }

    /**
     * Làm sạch chuỗi để phù hợp chuẩn đặt tên của K8s
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
