# ✅ CHECKLIST MIGRATE GIAO DIỆN ADMIN

## Phase 1: Base Setup (3-4 ngày)

### CSS & Styles
- [ ] Tạo `static/css/admin-rancher.css` (copy từ `tmp/style.css`)
- [ ] Adapt color variables cho hệ thống
- [ ] Thêm utility classes (spacing, colors, etc.)
- [ ] Test CSS không conflict với Bootstrap

### Layout Structure
- [ ] Update `templates/admin/layout.html`:
  - [ ] Bỏ/giảm Bootstrap CSS (chỉ giữ cho modals nếu cần)
  - [ ] Thêm `admin-rancher.css`
  - [ ] Thay body structure thành `app-shell` (flex container)
  - [ ] Thêm sidebar + main structure
- [ ] Test layout hiển thị đúng

### Sidebar Component
- [ ] Tạo `templates/admin/fragments/sidebar-rancher.html`:
  - [ ] Sidebar header (logo circle + "AutoDeployApp")
  - [ ] Dropdown group "Hạ tầng (Servers & Clusters)":
    - [ ] 🖥 Servers → `/admin/server`
    - [ ] ➕ Add Server → modal/form
    - [ ] 🧩 Clusters → `/admin/k8s`
    - [ ] ➕ Create Cluster → modal/form
    - [ ] 🔗 Assign Servers → `/admin/server/assign`
    - [ ] ⚙ Cluster Setup → `/admin/k8s/setup`
  - [ ] Dropdown group "Kubernetes (Rancher View)":
    - [ ] 📊 Overview → `/admin/k8s/overview`
    - [ ] 🖥 Nodes → `/admin/k8s/nodes`
    - [ ] 📂 Namespaces → `/admin/k8s/namespaces`
    - [ ] 📦 Workloads → `/admin/k8s/workloads`
    - [ ] 🌐 Services → `/admin/k8s/services`
    - [ ] 🚪 Ingress → `/admin/k8s/ingress`
    - [ ] 💾 Storage → `/admin/k8s/storage`
  - [ ] Dropdown group "Quản lý hệ thống (Admin)":
    - [ ] 👥 Users → `/admin/user`
    - [ ] 🧩 User Apps → `/admin/apps`
    - [ ] 📝 Review Requests → `/admin/deployments`
- [ ] JavaScript cho dropdown toggle
- [ ] Active state management (highlight current page)

---

## Phase 2: Topbar (2 ngày)

### Topbar Component
- [ ] Tạo `templates/admin/fragments/topbar.html`:
  - [ ] Page title (dynamic từ controller)
  - [ ] Topbar right:
    - [ ] Username display
    - [ ] Avatar circle (initials)
    - [ ] Logout button (optional)
- [ ] Style theo mẫu (54px height, dark background, blur)

### Navigation Logic
- [ ] Update `static/js/admin.js`:
  - [ ] Sidebar click handlers
  - [ ] Active state sync với URL
  - [ ] Dropdown toggle logic
- [ ] Thymeleaf integration (highlight active menu)

---

## Phase 3: Page Migration (5-6 ngày)

### Dashboard (`templates/admin/index.html`)
- [ ] Thay Bootstrap cards bằng dark theme cards
- [ ] Update grid layout (4 columns)
- [ ] Add hover effects
- [ ] Update icons styling
- [ ] Links hoạt động đúng

### User Management (`templates/admin/pages/user.html`)
- [ ] Dark theme table
- [ ] Status chips (ADMIN=green, USER=blue)
- [ ] Action buttons styled
- [ ] Add user form (dark theme)
- [ ] Edit user modal/form
- [ ] Delete confirmation

### Server Management (`templates/admin/pages/server-manager.html`)
- [ ] Server list table (dark theme)
- [ ] Status indicators (Online/Offline chips)
- [ ] Add server form (dark theme)
- [ ] Test connection button
- [ ] Edit/Delete actions

### Kubernetes Cluster (`templates/admin/pages/kubernetes-cluster.html`)
- [ ] Cluster list table
- [ ] Cluster setup steps (accordion/cards)
- [ ] Playbook manager integration
- [ ] YAML viewer buttons
- [ ] Status indicators

### Deployment Requests (`templates/admin/pages/deployment-request.html`)
- [ ] Request list table (dark theme)
- [ ] Status chips (Pending=yellow, Approved=green, Rejected=red)
- [ ] Action buttons (Approve/Reject/View)
- [ ] Details modal
- [ ] Filters/Search (nếu có)

---

## Phase 4: Advanced Features (3-4 ngày)

### YAML Popup Viewer
- [ ] Tạo `templates/admin/fragments/yaml-viewer.html`
- [ ] JavaScript function `openYamlPopup(yamlContent)`
- [ ] Style theo mẫu:
  - [ ] Dark backdrop (`rgba(0,0,0,0.55)`)
  - [ ] Popup box (60% width)
  - [ ] YAML area (dark background, monospace font)
  - [ ] Close button
- [ ] Tích hợp vào các trang cần thiết:
  - [ ] Workloads (View YAML button)
  - [ ] Services (nếu cần)
  - [ ] Ingress (nếu cần)
  - [ ] Cluster setup (playbook preview)

### Node Detail Popup
- [ ] Tạo `templates/admin/fragments/node-detail-popup.html`
- [ ] Tabs structure:
  - [ ] Info tab
  - [ ] Resources tab
  - [ ] Pods tab
  - [ ] Labels tab
  - [ ] YAML tab
- [ ] JavaScript `openNodeDetail(nodeData)`
- [ ] Tab switching logic
- [ ] Style theo mẫu (650px width, tabs, dark theme)

### Forms & Inputs
- [ ] Dark theme form styling
- [ ] Input focus states (blue border)
- [ ] Textarea styling
- [ ] Select dropdowns
- [ ] Button variants:
  - [ ] Primary (blue)
  - [ ] Danger (red)
  - [ ] Default (gray)
- [ ] Form validation styling

### Tables
- [ ] Dark theme table styling
- [ ] Hover effects (tr:hover background)
- [ ] Header styling
- [ ] Cell padding/spacing
- [ ] Empty state messages
- [ ] Loading state (skeleton/placeholder)

---

## Phase 5: JavaScript Integration (3-4 ngày)

### Routing System
- [ ] Update page routing (`admin.js`):
  - [ ] Map URLs to page names
  - [ ] Active state sync
  - [ ] Browser back/forward support (nếu SPA)
- [ ] Thymeleaf URL compatibility (`@{/path}`)

### Module Compatibility
- [ ] Test `modules/users.js` với new CSS
- [ ] Test `modules/servers.js` với new CSS
- [ ] Test `modules/k8sClusters.js` với new CSS
- [ ] Test `modules/k8sResources.js` với new CSS
- [ ] Test `modules/deploymentRequests.js` với new CSS
- [ ] Update module code nếu cần (CSS classes)

### WebSocket Integration
- [ ] Terminal/log viewers dark theme
- [ ] Real-time updates styling
- [ ] Progress indicators
- [ ] Connection status indicator

### Toast Notifications
- [ ] Update toast styling (dark theme)
- [ ] Position (top-right)
- [ ] Auto-dismiss
- [ ] Animation

---

## Phase 6: Testing & Refinement (2-3 ngày)

### Browser Testing
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (nếu có)
- [ ] Mobile responsive (optional)

### Feature Testing
- [ ] Navigation flow (tất cả pages)
- [ ] Form submissions (add/edit/delete)
- [ ] Modal/popup interactions
- [ ] YAML viewer
- [ ] Node detail popup
- [ ] WebSocket connections
- [ ] API calls và error handling
- [ ] Loading states
- [ ] Error states

### UI/UX Refinement
- [ ] Consistent spacing
- [ ] Color contrast (WCAG AA)
- [ ] Font sizes readable
- [ ] Button sizes consistent
- [ ] Icon sizes consistent
- [ ] Empty states messages
- [ ] Loading skeletons
- [ ] Error messages styling

### Performance
- [ ] CSS file size reasonable
- [ ] No layout shift on load
- [ ] Smooth animations
- [ ] Fast page transitions

---

## 🎯 MILESTONES

- [ ] **Milestone 1**: Phase 1-2 complete - Base layout working
- [ ] **Milestone 2**: Phase 3 complete - All pages migrated
- [ ] **Milestone 3**: Phase 4 complete - Advanced features working
- [ ] **Milestone 4**: Phase 5-6 complete - Fully functional & tested

---

## 📝 NOTES

- Giữ lại Bootstrap chỉ cho modals phức tạp (nếu cần)
- Đảm bảo Thymeleaf expressions hoạt động đúng
- Test với real data từ backend
- Document breaking changes (nếu có)

---

**Status**: 📋 Ready to start  
**Next**: Begin Phase 1 - Base Setup

