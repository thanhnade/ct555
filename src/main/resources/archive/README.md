# Archive - Old Admin Files

Thư mục này chứa các file cũ đã được thay thế bởi cấu trúc module mới.

## Files Archived

### Templates
- `templates/home-admin.html` - File template cũ (đã được tách thành `admin/layout.html` + `admin/fragments/*` + `admin/pages/*`)

### Static Files
- `static/admin.js` - File JavaScript cũ (~6782 dòng, đã được tách thành các modules trong `js/modules/`)
- `static/playbook-manager.js` - File playbook manager cũ (đã được di chuyển sang `js/modules/k8s/playbook-manager.js`)

## Migration Status

✅ **Completed**: Tất cả chức năng đã được migrate sang cấu trúc mới:
- Users module → `js/modules/users.js`
- Servers module → `js/modules/servers.js`
- K8s Clusters module → `js/modules/k8sClusters.js`
- Deployment Requests module → `js/modules/deploymentRequests.js`
- Playbook Manager → `js/modules/k8s/playbook-manager.js`
- Core utilities → `js/core/` (apiClient, eventBus, wsClient, i18n)
- UI components → `js/ui/` (modal, table, pagination, toast)

## Route Changes

- `/home-admin` → Redirects to `/admin` (backward compatibility)
- `/admin` → New admin dashboard (`admin/index.html`)
- `/admin/user` → User management (`admin/pages/user.html`)
- `/admin/server` → Server management (`admin/pages/server-manager.html`)
- `/admin/k8s` → Kubernetes cluster (`admin/pages/kubernetes-cluster.html`)
- `/admin/deployments` → Deployment requests (`admin/pages/deployment-request.html`)

## Notes

- Các file trong archive được giữ lại để tham khảo hoặc rollback nếu cần
- Không nên xóa các file này cho đến khi đã verify hoàn toàn hệ thống mới hoạt động ổn định
- Có thể xóa sau khi đã test đầy đủ và không còn cần thiết

