# 📋 KẾ HOẠCH CẬP NHẬT GIAO DIỆN ADMIN - RANCHER STYLE

**Mục tiêu**: Migrate giao diện ADMIN từ Bootstrap-based light theme sang Rancher-style dark theme như mẫu trong `tmp/`  
**Ngày bắt đầu**: 2024  
**Thời gian dự kiến**: 2-3 tuần

---

## 🎯 TỔNG QUAN

### Hiện trạng
- ✅ Bootstrap 5.3.3 (light theme, navbar-based navigation)
- ✅ Thymeleaf templates với fragments (header, sidebar, footer, modals)
- ✅ Layout: Header navbar + Content area + Footer
- ✅ Các trang: User, Server, Kubernetes Cluster, Deployment Requests
- ✅ CSS modules: `admin.css`, `home-admin.css`, Bootstrap CSS
- ✅ JavaScript modules: `admin.js`, `modules/*.js`, `core/*.js`

### Mục tiêu
- 🎨 Dark theme Rancher-style (như mẫu `tmp/`)
- 🎨 Sidebar với dropdown groups (thay navbar)
- 🎨 Topbar với page title và user info
- 🎨 Single-page app feel với smooth transitions
- 🎨 YAML popup viewer
- 🎨 Node detail popup với tabs
- 🎨 Modern UI components (cards, tables, chips, forms)

---

## 📊 PHÂN TÍCH MẪU

### Cấu trúc mẫu (`tmp/`)

#### 1. Layout Structure
```
app-shell (flex container)
├── sidebar (235px width)
│   ├── sidebar-header (logo + title)
│   ├── dropdown-group "Hạ tầng"
│   ├── dropdown-group "Kubernetes"
│   └── dropdown-group "Quản lý hệ thống"
└── main (flex: 1)
    ├── topbar (54px height)
    └── content (flex: 1, scrollable)
```

#### 2. Color Scheme (Dark Theme)
- Background: `#0b1724` (main), `#020617` (cards), `#050b12` (sidebar)
- Borders: `#1f2933`, `#374151`
- Text: `#e5e7eb` (primary), `#9ca3af` (secondary), `#6b7280` (muted)
- Primary: `#2563eb`, `#1d4ed8` (blue)
- Status: Green (`#065f46`), Yellow (`#78350f`), Red (`#7f1d1d`)

#### 3. Components
- **Cards**: Dark background, rounded corners (10px), border
- **Tables**: Dark theme, hover effects
- **Chips**: Status badges với colors
- **Forms**: Dark inputs, focus states
- **Buttons**: Dark theme variants (primary, danger, etc.)
- **Popups**: Backdrop + modal box, YAML viewer, Node detail với tabs

#### 4. JavaScript Features
- Page routing: `loadPage(pageName)`
- Sidebar navigation với active states
- Dropdown groups toggle
- YAML popup viewer
- Node detail popup với tabs
- Sample data structure

---

## 🔄 KẾ HOẠCH TRIỂN KHAI

### Phase 1: Chuẩn bị và Base Styles (3-4 ngày)

#### 1.1. Tạo CSS Base mới
- [ ] Tạo `static/css/admin-rancher.css` (copy từ `tmp/style.css`)
- [ ] Adapt color scheme cho hệ thống
- [ ] Thêm utility classes cần thiết
- [ ] Đảm bảo tương thích với Thymeleaf

#### 1.2. Cập nhật Layout Template
- [ ] Sửa `templates/admin/layout.html`:
  - Bỏ Bootstrap CSS (hoặc giữ lại chỉ cho modals nếu cần)
  - Thêm `admin-rancher.css`
  - Thay đổi body structure thành `app-shell`
- [ ] Tạo sidebar structure mới
- [ ] Tạo topbar structure mới
- [ ] Đảm bảo content area scrollable

#### 1.3. Sidebar Component
- [ ] Tạo `templates/admin/fragments/sidebar-rancher.html`:
  - Sidebar header (logo + title)
  - Dropdown group "Hạ tầng" (Servers, Clusters, Setup)
  - Dropdown group "Kubernetes" (Overview, Nodes, Namespaces, Workloads, Services, Ingress, Storage)
  - Dropdown group "Quản lý hệ thống" (Users, Apps, Review Requests)
- [ ] JavaScript cho dropdown toggle
- [ ] Active state management

---

### Phase 2: Topbar và Navigation (2 ngày)

#### 2.1. Topbar Component
- [ ] Tạo `templates/admin/fragments/topbar.html`:
  - Page title (dynamic từ controller)
  - User info (username + avatar)
  - Logout button
- [ ] Style topbar theo mẫu (54px height, dark background)

#### 2.2. Navigation Logic
- [ ] Update `admin.js` để handle sidebar navigation
- [ ] Route mapping từ URL paths sang page names
- [ ] Active state sync với current page
- [ ] Thymeleaf integration (highlight active menu item)

---

### Phase 3: Component Migration (5-6 ngày)

#### 3.1. Dashboard Page (index.html)
- [ ] Migrate `templates/admin/index.html`:
  - Thay Bootstrap cards bằng dark theme cards
  - Update grid layout
  - Hover effects
  - Icons styling

#### 3.2. User Management Page
- [ ] Migrate `templates/admin/pages/user.html`:
  - Dark theme table
  - Status chips (green/blue)
  - Action buttons
  - Forms cho add/edit user

#### 3.3. Server Management Page
- [ ] Migrate `templates/admin/pages/server-manager.html`:
  - Server list table
  - Add server form
  - Status indicators
  - Test connection button

#### 3.4. Kubernetes Cluster Page
- [ ] Migrate `templates/admin/pages/kubernetes-cluster.html`:
  - Cluster list
  - Cluster setup steps (accordion)
  - Playbook manager integration
  - YAML viewer popup

#### 3.5. Deployment Requests Page
- [ ] Migrate `templates/admin/pages/deployment-request.html`:
  - Request list table
  - Status chips
  - Action buttons (Approve/Reject)
  - Details modal

---

### Phase 4: Advanced Features (3-4 ngày)

#### 4.1. YAML Popup Viewer
- [ ] Tạo component `templates/admin/fragments/yaml-viewer.html`
- [ ] JavaScript function `openYamlPopup(yamlContent)`
- [ ] Style theo mẫu (dark theme, monospace font)
- [ ] Tích hợp vào các trang cần thiết

#### 4.2. Node Detail Popup
- [ ] Tạo component `templates/admin/fragments/node-detail-popup.html`
- [ ] Tabs: Info, Resources, Pods, Labels, YAML
- [ ] JavaScript `openNodeDetail(nodeData)`
- [ ] Style theo mẫu

#### 4.3. Forms và Inputs
- [ ] Dark theme form styling
- [ ] Input focus states
- [ ] Textarea styling
- [ ] Select dropdowns
- [ ] Button variants (primary, danger, etc.)

#### 4.4. Tables
- [ ] Dark theme table styling
- [ ] Hover effects
- [ ] Responsive behavior
- [ ] Empty state messages

---

### Phase 5: JavaScript Integration (3-4 ngày)

#### 5.1. Routing System
- [ ] Update page routing để tương thích với Thymeleaf
- [ ] URL-based navigation (không reload page nếu có thể)
- [ ] Browser back/forward support

#### 5.2. Module Integration
- [ ] Đảm bảo các modules hiện tại hoạt động:
  - `modules/users.js`
  - `modules/servers.js`
  - `modules/k8sClusters.js`
  - `modules/k8sResources.js`
  - `modules/deploymentRequests.js`
- [ ] Update các modules để sử dụng new CSS classes
- [ ] Toast notifications tương thích dark theme

#### 5.3. WebSocket Integration
- [ ] Terminal/Log viewers với dark theme
- [ ] Real-time updates styling
- [ ] Progress indicators

---

### Phase 6: Testing và Refinement (2-3 ngày)

#### 6.1. Browser Testing
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (nếu có)
- [ ] Mobile responsive (optional)

#### 6.2. Feature Testing
- [ ] Navigation flow
- [ ] Form submissions
- [ ] Modal/popup interactions
- [ ] WebSocket connections
- [ ] API calls và error handling

#### 6.3. UI/UX Refinement
- [ ] Consistent spacing
- [ ] Color contrast checks
- [ ] Loading states
- [ ] Error states
- [ ] Empty states

---

## 📁 CẤU TRÚC FILE MỚI

```
src/main/resources/
├── static/
│   ├── css/
│   │   ├── admin.css (giữ lại utilities)
│   │   └── admin-rancher.css (NEW - main dark theme)
│   └── js/
│       ├── admin.js (update navigation logic)
│       └── modules/ (giữ nguyên, chỉ update CSS classes)
└── templates/
    └── admin/
        ├── layout.html (update structure)
        ├── index.html (migrate to dark theme)
        ├── fragments/
        │   ├── header.html (deprecate hoặc thay bằng topbar)
        │   ├── sidebar.html (deprecate)
        │   ├── sidebar-rancher.html (NEW)
        │   ├── topbar.html (NEW)
        │   ├── yaml-viewer.html (NEW)
        │   └── node-detail-popup.html (NEW)
        └── pages/
            ├── user.html (migrate)
            ├── server-manager.html (migrate)
            ├── kubernetes-cluster.html (migrate)
            └── deployment-request.html (migrate)
```

---

## 🎨 DESIGN GUIDELINES

### Colors
```css
/* Backgrounds */
--bg-main: #0b1724;
--bg-card: #020617;
--bg-sidebar: #050b12;
--bg-topbar: #020617dd;

/* Borders */
--border-primary: #1f2933;
--border-secondary: #374151;

/* Text */
--text-primary: #e5e7eb;
--text-secondary: #9ca3af;
--text-muted: #6b7280;

/* Primary */
--primary: #2563eb;
--primary-dark: #1d4ed8;

/* Status */
--success: #065f46;
--success-text: #6ee7b7;
--warning: #78350f;
--warning-text: #facc15;
--danger: #7f1d1d;
--danger-text: #fecaca;
```

### Typography
- Font: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Monospace: `"Fira Code", monospace` (cho YAML/code)

### Spacing
- Base unit: 4px
- Card padding: 14px 16px
- Section margin: 16px
- Input padding: 7px 9px

### Border Radius
- Cards: 10px
- Buttons: 6px
- Inputs: 6px
- Chips: 999px (full rounded)

---

## ✅ CHECKLIST THEO DÕI

### Phase 1: Base Setup
- [ ] CSS file mới (`admin-rancher.css`)
- [ ] Layout template updated
- [ ] Sidebar component created
- [ ] Basic navigation working

### Phase 2: Topbar
- [ ] Topbar component created
- [ ] Page title dynamic
- [ ] User info displayed
- [ ] Logout button working

### Phase 3: Pages Migration
- [ ] Dashboard migrated
- [ ] User page migrated
- [ ] Server page migrated
- [ ] K8s cluster page migrated
- [ ] Deployment requests migrated

### Phase 4: Advanced Features
- [ ] YAML viewer working
- [ ] Node detail popup working
- [ ] Forms styled
- [ ] Tables styled

### Phase 5: JavaScript
- [ ] Routing updated
- [ ] Modules compatible
- [ ] WebSocket integration

### Phase 6: Testing
- [ ] All browsers tested
- [ ] All features working
- [ ] UI/UX refined

---

## 🚨 LƯU Ý

1. **Backward Compatibility**: 
   - Giữ lại các JavaScript modules hiện tại
   - Chỉ update CSS classes, không thay đổi logic

2. **Thymeleaf Integration**:
   - Đảm bảo các Thymeleaf expressions vẫn hoạt động
   - URL routing với `@{/path}` syntax

3. **Bootstrap Modals**:
   - Có thể giữ lại Bootstrap cho modals phức tạp
   - Hoặc tạo custom modal system theo mẫu

4. **Responsive Design**:
   - Mẫu chưa có mobile responsive
   - Cần thêm responsive breakpoints nếu cần

5. **Accessibility**:
   - Đảm bảo color contrast đạt WCAG AA
   - Keyboard navigation
   - Screen reader support

---

## 📝 NEXT STEPS

1. **Bắt đầu Phase 1**: Tạo CSS base và layout structure
2. **Review**: Kiểm tra với team/mentor
3. **Iterate**: Làm từng phase, test, refine
4. **Documentation**: Update user guide nếu cần

---

**Người phụ trách**: Development Team  
**Review**: Before each phase completion  
**Status**: 📋 Planning

