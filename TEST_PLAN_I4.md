# Test Plan - I4: Test từng module với backend thực tế

## I4.1. Users Module - Test CRUD users, reset password, view activities

### Prerequisites
- Đăng nhập với tài khoản ADMIN
- Truy cập `/admin/user`

### Test Cases

#### TC-I4.1.1: Load Users List
**Steps:**
1. Mở trang `/admin/user`
2. Kiểm tra danh sách users được load tự động
3. Kiểm tra console không có lỗi

**Expected:**
- ✅ Danh sách users hiển thị trong bảng
- ✅ Mỗi user có: ID, Username, Role badge, Quota (MB), Đường dẫn, Actions
- ✅ Role badges hiển thị đúng màu (ADMIN=primary, OPERATOR=warning, VIEWER=info, CLIENT=secondary)
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.1.2: Create User
**Steps:**
1. Điền form "Thêm người dùng mới":
   - Username: `testuser1`
   - Password: `testpass123`
   - Role: `CLIENT`
   - Quota (MB): `512`
   - Đường dẫn: `/home/testuser1`
2. Click "Thêm người dùng"
3. Kiểm tra thông báo thành công
4. Kiểm tra user mới xuất hiện trong danh sách

**Expected:**
- ✅ Thông báo "Thêm người dùng thành công!" (màu xanh)
- ✅ Form được reset
- ✅ User mới xuất hiện trong bảng với đúng thông tin
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.1.3: Update User (Save)
**Steps:**
1. Tìm một user trong danh sách (không phải ADMIN)
2. Sửa Role trong dropdown (ví dụ: CLIENT → OPERATOR)
3. Sửa Quota (ví dụ: 512 → 1024)
4. Click "Lưu" trên dòng đó
5. Kiểm tra thông báo và danh sách được refresh

**Expected:**
- ✅ Thông báo "Đã lưu user #X thành công" (màu xanh)
- ✅ Thông tin user được cập nhật trong bảng
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.1.4: Delete User
**Steps:**
1. Tìm một user test (không phải ADMIN)
2. Click "Xoá" trên dòng đó
3. Xác nhận trong dialog
4. Kiểm tra user bị xóa khỏi danh sách

**Expected:**
- ✅ Dialog xác nhận hiển thị
- ✅ Sau khi xác nhận, thông báo "Đã xoá user #X"
- ✅ User bị xóa khỏi danh sách
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.1.5: Reset Password
**Steps:**
1. Tìm một user test
2. Click "Reset Password" trên dòng đó
3. Xác nhận trong dialog
4. Kiểm tra thông báo thành công

**Expected:**
- ✅ Dialog xác nhận hiển thị
- ✅ Sau khi xác nhận, thông báo "Đã reset mật khẩu cho user #X"
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.1.6: View Activities
**Steps:**
1. Tìm một user có activities
2. Click "Lịch sử" trên dòng đó
3. Kiểm tra modal hiển thị danh sách activities

**Expected:**
- ✅ Modal "Activity History" mở ra
- ✅ Danh sách activities hiển thị (nếu có)
- ✅ Mỗi activity có: Timestamp, Action, Details
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.1.7: Error Handling
**Steps:**
1. Thử tạo user với username đã tồn tại
2. Thử xóa user không tồn tại (nếu có)
3. Thử update user với dữ liệu không hợp lệ

**Expected:**
- ✅ Thông báo lỗi hiển thị rõ ràng (tiếng Việt)
- ✅ Lỗi được hiển thị qua `showAlert` hoặc toast
- ✅ Không có lỗi JavaScript trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

## I4.2. Servers Module - Test CRUD servers, check status, terminal connection

### Prerequisites
- Đăng nhập với tài khoản ADMIN
- Truy cập `/admin/server`
- Có ít nhất 1 server SSH để test (hoặc dùng localhost)

### Test Cases

#### TC-I4.2.1: Load Servers List
**Steps:**
1. Mở trang `/admin/server`
2. Kiểm tra danh sách servers được load tự động
3. Kiểm tra servers được chia thành 2 bảng: "Servers đang kết nối" và "Servers lịch sử"

**Expected:**
- ✅ Danh sách servers hiển thị
- ✅ Servers CONNECTED hiển thị trong bảng "Servers đang kết nối"
- ✅ Servers OFFLINE/ONLINE hiển thị trong bảng "Servers lịch sử"
- ✅ Mỗi server có: ID, Host, Port, Username, Status, Last Connected, Actions
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.2: Create Server
**Steps:**
1. Điền form "Thêm máy chủ":
   - Host/IP: `192.168.1.100` (hoặc IP thực tế)
   - Port: `22`
   - Username: `root` (hoặc user thực tế)
   - Password: `password123` (hoặc password thực tế)
2. Click "Thêm máy chủ"
3. Kiểm tra thông báo thành công
4. Kiểm tra server mới xuất hiện trong danh sách

**Expected:**
- ✅ Thông báo "Thêm máy chủ thành công" (màu xanh)
- ✅ Form được reset
- ✅ Server mới xuất hiện trong bảng
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.3: Update Server (Save)
**Steps:**
1. Tìm một server trong danh sách
2. Sửa Host, Port, hoặc Username
3. Click "Lưu" trên dòng đó
4. Kiểm tra thông báo và danh sách được refresh

**Expected:**
- ✅ Thông báo "Đã lưu máy #X: host: ..." (màu xanh)
- ✅ Thông tin server được cập nhật trong bảng
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.4: Delete Server
**Steps:**
1. Tìm một server test
2. Click "Xoá" trên dòng đó
3. Xác nhận trong dialog
4. Kiểm tra server bị xóa khỏi danh sách

**Expected:**
- ✅ Dialog xác nhận hiển thị
- ✅ Sau khi xác nhận, thông báo "Đã xoá máy #X"
- ✅ Server bị xóa khỏi danh sách
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.5: Check Server Status
**Steps:**
1. Click button "Kiểm tra trạng thái"
2. Kiểm tra overlay loading hiển thị
3. Đợi quá trình kiểm tra hoàn tất
4. Kiểm tra danh sách được refresh với status mới

**Expected:**
- ✅ Overlay "Đang kiểm tra trạng thái máy chủ..." hiển thị
- ✅ Button "Kiểm tra trạng thái" bị disable trong lúc kiểm tra
- ✅ Sau khi hoàn tất, danh sách được refresh
- ✅ Status của servers được cập nhật (CONNECTED/OFFLINE/ONLINE)
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.6: Connect Server (Reconnect)
**Steps:**
1. Tìm một server OFFLINE
2. Click "Kết nối lại"
3. Nhập password nếu được yêu cầu
4. Kiểm tra server chuyển sang CONNECTED

**Expected:**
- ✅ Dialog prompt password hiển thị (nếu cần)
- ✅ Sau khi kết nối, thông báo "Đã kết nối lại thành công"
- ✅ Server chuyển sang bảng "Servers đang kết nối"
- ✅ Status badge chuyển thành "CONNECTED" (màu xanh)
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.7: Disconnect Server
**Steps:**
1. Tìm một server CONNECTED
2. Click "Ngắt kết nối"
3. Kiểm tra server chuyển sang OFFLINE

**Expected:**
- ✅ Thông báo "Đã ngắt kết nối máy #X"
- ✅ Server chuyển sang bảng "Servers lịch sử"
- ✅ Status badge chuyển thành dropdown (OFFLINE/ONLINE)
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.8: Terminal Connection (CLI)
**Steps:**
1. Tìm một server CONNECTED
2. Click "CLI" trên dòng đó
3. Kiểm tra modal terminal mở ra
4. Kiểm tra kết nối WebSocket được thiết lập
5. Thử gõ một số lệnh (ví dụ: `ls`, `pwd`)
6. Kiểm tra output hiển thị trong terminal

**Expected:**
- ✅ Modal "Terminal" mở ra
- ✅ Terminal (xterm.js) hiển thị trong modal
- ✅ Thông báo "[client] Connected, opening SSH..." hiển thị
- ✅ Có thể gõ lệnh và nhận output
- ✅ WebSocket kết nối qua `wsClient.js` (kiểm tra trong Network tab)
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.9: Terminal Auto-Connect
**Steps:**
1. Tìm một server CONNECTED
2. Click "CLI" (tự động kết nối với serverId)
3. Kiểm tra terminal tự động kết nối không cần password

**Expected:**
- ✅ Terminal tự động kết nối
- ✅ Thông báo "[client] Connected, opening SSH (auto) ..." hiển thị
- ✅ Không cần nhập password
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.2.10: Error Handling
**Steps:**
1. Thử tạo server với thông tin không hợp lệ (host rỗng, port không hợp lệ)
2. Thử kết nối server với password sai
3. Thử xóa server không tồn tại

**Expected:**
- ✅ Thông báo lỗi hiển thị rõ ràng (tiếng Việt)
- ✅ Lỗi được hiển thị qua `showAlert` hoặc toast
- ✅ Không có lỗi JavaScript trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

## I4.3. K8s Clusters Module - Test CRUD clusters, assign servers, Ansible operations, K8s resources

### Prerequisites
- Đăng nhập với tài khoản ADMIN
- Truy cập `/admin/k8s`
- Có ít nhất 1 server CONNECTED để assign vào cluster

### Test Cases

#### TC-I4.3.1: Load Clusters List
**Steps:**
1. Mở trang `/admin/k8s`
2. Kiểm tra danh sách clusters được load tự động
3. Kiểm tra pagination (nếu có nhiều clusters)

**Expected:**
- ✅ Danh sách clusters hiển thị trong bảng
- ✅ Mỗi cluster có: ID, Name, Description, Status, Servers, Actions
- ✅ Pagination hoạt động (nếu có > 10 clusters)
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.2: Create Cluster
**Steps:**
1. Click "Tạo Cluster" hoặc button tương ứng
2. Nhập tên cluster: `test-cluster-1`
3. Nhập mô tả (optional): `Test cluster for I4.3`
4. Click "Tạo" hoặc "Save"
5. Kiểm tra cluster mới xuất hiện trong danh sách

**Expected:**
- ✅ Thông báo "Đã tạo cluster thành công"
- ✅ Cluster mới xuất hiện trong bảng
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.3: View Cluster Detail
**Steps:**
1. Click "Chi tiết" hoặc "View" trên một cluster
2. Kiểm tra modal hoặc view chi tiết hiển thị
3. Kiểm tra thông tin: servers assigned, roles, status

**Expected:**
- ✅ Modal/view chi tiết hiển thị đầy đủ thông tin cluster
- ✅ Danh sách servers assigned hiển thị
- ✅ Role của mỗi server hiển thị (MASTER/WORKER)
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.4: Assign Servers to Cluster
**Steps:**
1. Chọn một cluster
2. Vào phần "Assign Servers" hoặc "Chi tiết"
3. Chọn một hoặc nhiều servers từ danh sách
4. Chọn role (MASTER hoặc WORKER)
5. Click "Assign" hoặc "Update Role"
6. Kiểm tra servers được assign vào cluster

**Expected:**
- ✅ Servers được assign vào cluster
- ✅ Role được cập nhật đúng
- ✅ Thông báo thành công
- ✅ Danh sách servers trong cluster được refresh
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.5: Remove Server from Cluster
**Steps:**
1. Vào chi tiết một cluster có servers
2. Chọn một server
3. Click "Remove" hoặc "Bỏ khỏi cluster"
4. Xác nhận
5. Kiểm tra server bị xóa khỏi cluster

**Expected:**
- ✅ Dialog xác nhận hiển thị
- ✅ Server bị xóa khỏi cluster
- ✅ Thông báo thành công
- ✅ Danh sách được refresh
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.6: Delete Cluster
**Steps:**
1. Tìm một cluster test
2. Click "Xóa" hoặc "Delete"
3. Xác nhận trong dialog
4. Kiểm tra cluster bị xóa khỏi danh sách

**Expected:**
- ✅ Dialog xác nhận hiển thị
- ✅ Sau khi xác nhận, thông báo "Đã xóa cluster #X"
- ✅ Cluster bị xóa khỏi danh sách
- ✅ Không có lỗi trong console

**Actual:** ✅ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.7: Ansible Operations - Install Ansible
**Steps:**
1. Vào chi tiết một cluster có MASTER server
2. Tìm phần "Ansible Installation" hoặc tương tự
3. Click "Install Ansible" hoặc button tương ứng
4. Nhập sudo password nếu được yêu cầu
5. Kiểm tra WebSocket kết nối và log real-time

**Expected:**
- ✅ WebSocket kết nối đến `/ws/ansible`
- ✅ Log real-time hiển thị trong console/modal
- ✅ Thông báo tiến trình cài đặt
- ✅ Thông báo thành công khi hoàn tất
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.8: Ansible Operations - Init Structure/Config
**Steps:**
1. Vào chi tiết một cluster đã có Ansible installed
2. Tìm phần "Ansible Init" hoặc tương tự
3. Click "Init Structure" hoặc "Init Config"
4. Nhập sudo password
5. Kiểm tra WebSocket log real-time

**Expected:**
- ✅ WebSocket gửi action `init_structure` hoặc `init_config`
- ✅ Log real-time hiển thị
- ✅ Thông báo thành công
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.9: K8s Resources - View Pods
**Steps:**
1. Vào chi tiết một cluster đã có K8s resources
2. Tìm tab/section "Pods" hoặc "K8s Resources"
3. Click "Load Pods" hoặc tương tự
4. Kiểm tra danh sách pods hiển thị

**Expected:**
- ✅ Danh sách pods hiển thị
- ✅ Mỗi pod có: Name, Namespace, Status, Node, Age
- ✅ Status badges hiển thị đúng màu
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.10: K8s Resources - View Namespaces
**Steps:**
1. Vào phần K8s Resources
2. Click "Load Namespaces"
3. Kiểm tra danh sách namespaces hiển thị

**Expected:**
- ✅ Danh sách namespaces hiển thị
- ✅ Mỗi namespace có: Name, Status, Age
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.11: K8s Resources - View Services/Ingress
**Steps:**
1. Vào phần K8s Resources
2. Click "Load Services" hoặc "Load Ingress"
3. Kiểm tra danh sách hiển thị

**Expected:**
- ✅ Danh sách services/ingress hiển thị
- ✅ Thông tin đầy đủ (Name, Namespace, Type, Ports, etc.)
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.12: K8s Resources - Delete Pod
**Steps:**
1. Tìm một pod trong danh sách
2. Click "Delete" hoặc "Xóa"
3. Xác nhận
4. Kiểm tra pod bị xóa

**Expected:**
- ✅ Dialog xác nhận hiển thị
- ✅ Pod bị xóa khỏi cluster
- ✅ Thông báo thành công
- ✅ Danh sách được refresh
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.3.13: Error Handling
**Steps:**
1. Thử tạo cluster với tên trùng
2. Thử assign server không tồn tại
3. Thử xóa cluster đang được sử dụng

**Expected:**
- ✅ Thông báo lỗi hiển thị rõ ràng (tiếng Việt)
- ✅ Lỗi được hiển thị qua `showAlert` hoặc toast
- ✅ Không có lỗi JavaScript trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

## I4.4. Deployment Requests Module - Test list, view logs, scale, diagnostics

### Prerequisites
- Đăng nhập với tài khoản ADMIN
- Truy cập `/admin/deployments`
- Có ít nhất 1 deployment request để test (hoặc tạo mới)

### Test Cases

#### TC-I4.4.1: Load Deployment Requests List
**Steps:**
1. Mở trang `/admin/deployments`
2. Kiểm tra danh sách deployment requests được load tự động
3. Kiểm tra filter theo status hoạt động

**Expected:**
- ✅ Danh sách deployment requests hiển thị trong bảng
- ✅ Mỗi request có: Ứng dụng, Docker Image, Người dùng, Namespace, Trạng thái, Access URL, Ngày tạo, Hành động
- ✅ Status badges hiển thị đúng màu (PENDING=warning, RUNNING=success, ERROR=danger, etc.)
- ✅ Filter dropdown hoạt động (Tất cả, PENDING, RUNNING, ERROR)
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.2: Filter by Status
**Steps:**
1. Chọn filter "PENDING" trong dropdown
2. Kiểm tra danh sách chỉ hiển thị requests có status PENDING
3. Chọn filter "RUNNING"
4. Kiểm tra danh sách chỉ hiển thị requests có status RUNNING

**Expected:**
- ✅ Filter hoạt động đúng
- ✅ URL có query parameter `?status=PENDING` (hoặc tương tự)
- ✅ Chỉ requests với status tương ứng hiển thị
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.3: View Deployment Request Details
**Steps:**
1. Tìm một deployment request có status PENDING
2. Click "Xem" hoặc "View"
3. Kiểm tra modal hiển thị form với thông tin đầy đủ

**Expected:**
- ✅ Modal "App Form" mở ra
- ✅ Form được điền đầy đủ thông tin: App Name, Chart, Image, Namespace, Cluster, etc.
- ✅ Cluster dropdown có danh sách clusters
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.4: Process Deployment Request
**Steps:**
1. Tìm một deployment request có status PENDING
2. Click "Xem" để mở modal
3. Điền đầy đủ thông tin (nếu chưa có)
4. Click "Process" hoặc "Xử lý"
5. Kiểm tra logs real-time hiển thị

**Expected:**
- ✅ Thông báo "Đang xử lý yêu cầu #X..."
- ✅ Logs console/modal tự động mở và hiển thị logs
- ✅ Polling logs bắt đầu (kiểm tra Network tab có requests đến `/admin/deployment-requests/{id}/logs`)
- ✅ Status chuyển sang RUNNING sau khi xử lý thành công
- ✅ Thông báo thành công
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.5: View Deployment Logs
**Steps:**
1. Tìm một deployment request có logs
2. Click "Logs" trên dòng đó
3. Kiểm tra modal/console hiển thị logs

**Expected:**
- ✅ Modal/console logs mở ra
- ✅ Logs được load và hiển thị
- ✅ Có thể scroll và xem logs
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.6: Polling Deployment Logs
**Steps:**
1. Mở logs của một deployment request đang RUNNING
2. Đợi vài giây
3. Kiểm tra logs được tự động refresh

**Expected:**
- ✅ Logs được polling tự động (mỗi vài giây)
- ✅ Logs mới được append vào console
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.7: Scale Deployment Request
**Steps:**
1. Tìm một deployment request có status RUNNING hoặc PAUSED
2. Click "Scale" hoặc "Resume / Scale"
3. Nhập số replicas mới (ví dụ: 3)
4. Xác nhận
5. Kiểm tra replicas được cập nhật

**Expected:**
- ✅ Dialog prompt hiển thị với số replicas hiện tại
- ✅ Sau khi nhập và xác nhận, thông báo "Đang scale ứng dụng #X..."
- ✅ Thông báo thành công "✅ Đã scale ứng dụng #X về 3 replicas"
- ✅ Danh sách được refresh
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.8: Scale to 0 (Pause)
**Steps:**
1. Tìm một deployment request RUNNING
2. Click "Scale"
3. Nhập 0 replicas
4. Xác nhận cảnh báo
5. Kiểm tra deployment tạm dừng

**Expected:**
- ✅ Dialog cảnh báo "Bạn đang scale deployment về 0 replicas (tạm dừng toàn bộ pod). Tiếp tục?"
- ✅ Sau khi xác nhận, deployment được scale về 0
- ✅ Status có thể chuyển sang PAUSED
- ✅ Thông báo "0 replicas (tạm dừng)"
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.9: View Deployment Diagnostics
**Steps:**
1. Tìm một deployment request
2. Click "Diagnostics" trên dòng đó
3. Kiểm tra modal/console hiển thị diagnostics

**Expected:**
- ✅ Modal/console diagnostics mở ra
- ✅ Diagnostics data được load và hiển thị
- ✅ Thông báo "Đã tải diagnostics cho deployment #X"
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.10: Reject Deployment Request
**Steps:**
1. Tìm một deployment request có status PENDING
2. Click "Từ chối" hoặc "Reject"
3. Nhập lý do từ chối (optional)
4. Xác nhận
5. Kiểm tra status chuyển sang REJECTED

**Expected:**
- ✅ Dialog prompt hiển thị để nhập lý do
- ✅ Sau khi xác nhận, thông báo "Yêu cầu đã bị từ chối."
- ✅ Status chuyển sang REJECTED
- ✅ Danh sách được refresh
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.11: Retry Deployment Request
**Steps:**
1. Tìm một deployment request có status ERROR
2. Click "Retry" trên dòng đó
3. Xác nhận
4. Kiểm tra deployment được retry

**Expected:**
- ✅ Dialog xác nhận "Retry triển khai cho yêu cầu #X?"
- ✅ Sau khi xác nhận, thông báo "Đang xử lý yêu cầu #X..."
- ✅ Logs được load và hiển thị
- ✅ Status có thể chuyển sang RUNNING
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.12: Update Deployment Request
**Steps:**
1. Tìm một deployment request có status PENDING hoặc ERROR
2. Gọi function `window.updateDeploymentRequest(id)` từ console (hoặc thêm button nếu có)
3. Điền các thông tin cần update (dockerImage, cpuRequest, memoryRequest, etc.)
4. Xác nhận
5. Kiểm tra deployment được cập nhật

**Expected:**
- ✅ Prompts hiển thị để nhập các thông tin
- ✅ Sau khi cập nhật, thông báo "✅ Đã cập nhật yêu cầu #X thành công"
- ✅ Thông tin được cập nhật trong danh sách
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.13: Delete Deployment Request
**Steps:**
1. Tìm một deployment request test
2. Click "Delete" trên dòng đó
3. Xác nhận trong dialog (cảnh báo về việc xóa namespace)
4. Kiểm tra deployment và namespace bị xóa

**Expected:**
- ✅ Dialog cảnh báo hiển thị: "Bạn có chắc chắn muốn xóa yêu cầu triển khai #X? ... Namespace sẽ bị xóa: ..."
- ✅ Sau khi xác nhận, thông báo "Đang xóa yêu cầu #X và dọn namespace..."
- ✅ Thông báo thành công "Đã xóa yêu cầu và namespace thành công!"
- ✅ Deployment bị xóa khỏi danh sách
- ✅ Không có lỗi trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

#### TC-I4.4.14: Error Handling
**Steps:**
1. Thử process deployment request với thông tin không đầy đủ
2. Thử scale deployment request không tồn tại
3. Thử update deployment request với status không cho phép (RUNNING)

**Expected:**
- ✅ Thông báo lỗi hiển thị rõ ràng (tiếng Việt)
- ✅ Lỗi được hiển thị qua `showAlert` hoặc toast
- ✅ Không có lỗi JavaScript trong console

**Actual:** ☐ Pass ☐ Fail
**Notes:**

---

## Test Summary

### Overall Results
- **I4.1 Users Module:** ✅ **PASS** (7/7 test cases passed)
- **I4.2 Servers Module:** ✅ **PASS** (10/10 test cases passed)
- **I4.3 K8s Clusters Module:** ⚠️ **IN PROGRESS** (5/13 test cases passed)
- **I4.4 Deployment Requests Module:** ☐ Pass ☐ Fail (__/__ test cases passed)

### Issues Found
1. 
2. 
3. 

### Notes
- 

---

**Tested by:** _________________  
**Date:** _________________  
**Environment:** _________________  
**Backend Version:** _________________  
**Frontend Version:** _________________

