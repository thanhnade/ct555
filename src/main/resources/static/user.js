// State management
let selectedFramework = 'other';
let isFrameworkDropdownOpen = false;
let deploymentType = 'docker'; // Default to docker like React component
let activeTab = 'projects';
let envVariables = [{ key: '', value: '' }];
let buildSettingsExpanded = true;
let envVarsExpanded = false;

// Framework presets
const frameworkPresets = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue.js' },
  { value: 'angular', label: 'Angular' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'nuxt', label: 'Nuxt.js' },
  { value: 'gatsby', label: 'Gatsby' },
  { value: 'vite', label: 'Vite' },
  { value: 'vanilla', label: 'Vanilla JS' },
  { value: 'other', label: 'Other / Custom' },
];

// Tab switching
function switchTab(tab) {
  activeTab = tab;
  
  // Update tab buttons
  document.getElementById('tabProjects').classList.toggle('active', tab === 'projects');
  document.getElementById('tabNew').classList.toggle('active', tab === 'new');
  
  // Show/hide sections
  document.getElementById('projectsSection').style.display = tab === 'projects' ? 'block' : 'none';
  document.getElementById('newSection').style.display = tab === 'new' ? 'block' : 'none';
  
  // Load projects when switching to projects tab
  if (tab === 'projects') {
    loadProjects();
  }
}

// Initialize framework dropdown
function initFrameworkDropdown() {
  const optionsDiv = document.getElementById('frameworkOptions');
  if (!optionsDiv) return;
  
  optionsDiv.innerHTML = '';
  frameworkPresets.forEach(preset => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `framework-option ${selectedFramework === preset.value ? 'selected' : ''}`;
    option.innerHTML = `
      <span>${preset.label}</span>
      ${selectedFramework === preset.value ? `
        <svg class="check-icon" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      ` : ''}
    `;
    option.onclick = () => selectFramework(preset.value);
    optionsDiv.appendChild(option);
  });
}

// Select framework
function selectFramework(value) {
  selectedFramework = value;
  const selected = frameworkPresets.find(p => p.value === value);
  const label = document.getElementById('frameworkLabel');
  if (label) label.textContent = selected.label;
  toggleFrameworkDropdown();
  updateFrameworkOptions();
}

// Toggle framework dropdown
function toggleFrameworkDropdown() {
  const button = document.getElementById('frameworkSelectButton');
  if (button && button.disabled) return;
  
  isFrameworkDropdownOpen = !isFrameworkDropdownOpen;
  const dropdown = document.getElementById('frameworkDropdown');
  if (dropdown) {
    dropdown.style.display = isFrameworkDropdownOpen ? 'block' : 'none';
  }
  if (button) {
    button.classList.toggle('open', isFrameworkDropdownOpen);
  }
}

// Update framework options UI
function updateFrameworkOptions() {
  const options = document.querySelectorAll('.framework-option');
  options.forEach((option, index) => {
    const preset = frameworkPresets[index];
    if (!preset) return;
    option.classList.toggle('selected', selectedFramework === preset.value);
    if (selectedFramework === preset.value) {
      option.innerHTML = `
        <span>${preset.label}</span>
        <svg class="check-icon" viewBox="0 0 24 24" fill="none">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
    } else {
      option.innerHTML = `<span>${preset.label}</span>`;
    }
  });
}

// Toggle settings sections
function toggleSettings(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  
  const isExpanded = section.style.display !== 'none';
  section.style.display = isExpanded ? 'none' : 'flex';
  
  const toggleIcon = section.previousElementSibling?.querySelector('.toggle-icon');
  if (toggleIcon) {
    toggleIcon.classList.toggle('expanded', !isExpanded);
  }
  
  if (sectionId === 'buildSettings') {
    buildSettingsExpanded = !isExpanded;
  } else if (sectionId === 'envVars') {
    envVarsExpanded = !isExpanded;
  }
}

// Environment Variables Management
function addEnvVariable() {
  envVariables.push({ key: '', value: '' });
  renderEnvVariables();
}

function removeEnvVariable(index) {
  if (envVariables.length > 1) {
    envVariables.splice(index, 1);
    renderEnvVariables();
  }
}

function handleEnvVariableChange(index, field, value) {
  if (envVariables[index]) {
    envVariables[index][field] = value;
  }
}

function handleImportEnv(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const envContent = e.target.result;
    const lines = envContent.split('\n');
    const vars = lines
      .filter(line => line.trim() && !line.startsWith('#'))
      .map(line => {
        const [key, ...valueParts] = line.split('=');
        return {
          key: key?.trim() || '',
          value: valueParts.join('=').trim().replace(/^["']|["']$/g, '') || ''
        };
      })
      .filter(v => v.key);
    
    if (vars.length > 0) {
      envVariables = vars;
      renderEnvVariables();
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function renderEnvVariables() {
  const listDiv = document.getElementById('envVariablesList');
  if (!listDiv) return;
  
  listDiv.innerHTML = envVariables.map((env, index) => `
    <div class="env-table-row">
      <div class="env-col-key">
        <input 
          type="text" 
          value="${escapeHtml(env.key)}"
          onchange="handleEnvVariableChange(${index}, 'key', this.value)"
          placeholder="KEY_NAME" 
        />
      </div>
      <div class="env-col-value">
        <input 
          type="text" 
          value="${escapeHtml(env.value)}"
          onchange="handleEnvVariableChange(${index}, 'value', this.value)"
          placeholder="value" 
        />
      </div>
      <div class="env-col-action">
        <button 
          type="button" 
          class="remove-env-btn" 
          onclick="removeEnvVariable(${index})"
          ${envVariables.length === 1 ? 'disabled' : ''}
          title="Remove"
        >
          <svg viewBox="0 0 24 24" fill="none">
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

// File upload handling
let fileUpload, fileUploadDisplay, filePlaceholder, fileSelected, fileNameDisplay, fileSizeDisplay;

function initializeFileUpload() {
  fileUpload = document.getElementById('fileUpload');
  fileUploadDisplay = document.getElementById('fileUploadDisplay');
  filePlaceholder = document.getElementById('filePlaceholder');
  fileSelected = document.getElementById('fileSelected');
  fileNameDisplay = document.getElementById('fileNameDisplay');
  fileSizeDisplay = document.getElementById('fileSizeDisplay');

  if (fileUpload && fileUploadDisplay) {
    fileUpload.addEventListener('change', handleFileSelect);
    fileUploadDisplay.addEventListener('click', () => fileUpload.click());
    fileUploadDisplay.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUploadDisplay.style.borderColor = '#2563eb';
      fileUploadDisplay.style.background = 'rgba(37, 99, 235, 0.02)';
    });
    fileUploadDisplay.addEventListener('dragleave', () => {
      fileUploadDisplay.style.borderColor = '#cbd5e1';
      fileUploadDisplay.style.background = '#f8fafc';
    });
    fileUploadDisplay.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUploadDisplay.style.borderColor = '#cbd5e1';
      fileUploadDisplay.style.background = '#f8fafc';
      const files = e.dataTransfer.files;
      if (files.length > 0 && (files[0].name.endsWith('.zip') || files[0].name.endsWith('.tar') || files[0].name.endsWith('.gz'))) {
        fileUpload.files = files;
        handleFileSelect();
      }
    });
  }
}

function handleFileSelect() {
  const file = fileUpload?.files[0];
  if (file) {
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;
    if (fileSizeDisplay) fileSizeDisplay.textContent = formatFileSize(file.size);
    if (filePlaceholder) filePlaceholder.style.display = 'none';
    if (fileSelected) fileSelected.style.display = 'flex';
    const uploadBtn = document.getElementById('uploadBtn');
    const projectName = document.getElementById('projectName');
    if (uploadBtn) uploadBtn.disabled = false;
    if (projectName) projectName.disabled = false;
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Deployment type change - DISABLED: Only Docker image deployment
function initializeDeploymentTypeChange() {
  // Deployment type selection đã bị ẩn trong HTML, luôn dùng Docker
  deploymentType = 'docker';
  
  // Đảm bảo Docker group hiển thị và File group ẩn
  const dockerGroup = document.getElementById('dockerGroup');
  const fileGroup = document.getElementById('fileGroup');
  const dockerImage = document.getElementById('dockerImage');
  
  if (dockerGroup) dockerGroup.style.display = 'flex';
  if (fileGroup) fileGroup.style.display = 'none';
  if (dockerImage) dockerImage.disabled = false;
  
  // Nếu có radio buttons (đã ẩn), set docker checked
  const dockerRadio = document.getElementById('deploymentDocker');
  if (dockerRadio) {
    dockerRadio.checked = true;
  }
}

// Click outside to close framework dropdown
function initializeClickOutside() {
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('frameworkWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      isFrameworkDropdownOpen = false;
      const dropdown = document.getElementById('frameworkDropdown');
      const button = document.getElementById('frameworkSelectButton');
      if (dropdown) dropdown.style.display = 'none';
      if (button) button.classList.remove('open');
    }
  });
}

// Upload form submit
function initializeUploadForm() {
  const uploadForm = document.getElementById('uploadForm');
  if (!uploadForm) return;

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uploadBtn = document.getElementById('uploadBtn');
    const projectNameInput = document.getElementById('projectName');
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');

    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';

    // Validate project name
    if (!projectNameInput || !projectNameInput.value.trim()) {
      if (errorDiv) {
        errorDiv.textContent = 'Vui lòng nhập tên dự án';
        errorDiv.style.display = 'block';
      }
      return;
    }

    // Chỉ validate Docker image (file upload đã bị ẩn)
    const dockerImage = document.getElementById('dockerImage');
    const imageValue = dockerImage?.value.trim();
    if (!imageValue) {
      if (errorDiv) {
        errorDiv.textContent = 'Vui lòng nhập đường dẫn Docker Hub image';
        errorDiv.style.display = 'block';
      }
      return;
    }
    // Validate docker image format
    const dockerImagePattern = /^[a-zA-Z0-9._\/-]+(:[a-zA-Z0-9._-]+)?$/;
    if (!dockerImagePattern.test(imageValue)) {
      if (errorDiv) {
        errorDiv.textContent = 'Định dạng Docker Hub image không hợp lệ. Ví dụ: nginx:latest, username/my-app:v1.0';
        errorDiv.style.display = 'block';
      }
      return;
    }

    const formData = new FormData();
    // Chỉ gửi 2 field: appName và dockerImage
    const appName = projectNameInput.value.trim();
    
    formData.append('appName', appName);
    formData.append('dockerImage', imageValue); // imageValue đã được khai báo ở trên
    
    // Namespace sẽ được backend tự động tạo theo tên người dùng
    // Admin sẽ xử lý tạo Deployment, Service, Ingress với namespace đó

    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<span class="spinner"></span> Đang triển khai...';
    }

    try {
      const response = await fetch('/api/applications/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        if (successDiv) {
          const p = successDiv.querySelector('p');
          if (p) {
            // Yêu cầu đã được gửi, chờ admin xử lý
            p.textContent = 'Yêu cầu của bạn đã được gửi và đang chờ admin xử lý. Bạn sẽ nhận được thông báo khi hoàn tất.';
          }
        }
        if (successDiv) successDiv.style.display = 'flex';
        
        // Reset form
        if (uploadForm) uploadForm.reset();
        if (projectNameInput) projectNameInput.disabled = false;
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = 'Triển khai ngay';
        }
        
        // Reset framework selection (nếu có)
        selectedFramework = 'other';
        const frameworkLabel = document.getElementById('frameworkLabel');
        if (frameworkLabel) frameworkLabel.textContent = 'Other / Custom';
        
        // Reset env variables (nếu có)
        envVariables = [{ key: '', value: '' }];
        renderEnvVariables();
        
        // Switch to projects tab để xem danh sách
        switchTab('projects');
        loadProjects();
        
        // Ẩn success message sau 5 giây
        setTimeout(() => {
          if (successDiv) successDiv.style.display = 'none';
        }, 5000);
      } else {
        // Error response from server
        const errorMessage = data.message || data.error || 'Upload thất bại';
        if (errorDiv) {
          errorDiv.textContent = '❌ Lỗi: ' + errorMessage;
          errorDiv.style.display = 'block';
        }
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = 'Triển khai ngay';
        }
        showNotification('❌ ' + errorMessage, 'danger');
      }
    } catch (error) {
      if (errorDiv) {
        errorDiv.textContent = '❌ Lỗi: ' + error.message;
        errorDiv.style.display = 'block';
      }
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = 'Triển khai ngay';
      }
    }
  });
}

// Load projects with search and pagination
let projectsSearchTerm = '';
let projectsCurrentPage = 1;
const projectsItemsPerPage = 6;

function loadProjects() {
  const projectsSection = document.getElementById('projectsSection');
  if (!projectsSection) return;
  
  projectsSection.innerHTML = '<div class="projects-loading"><span class="spinner"></span><p>Đang tải danh sách dự án...</p></div>';

  // TODO: Gọi API mới khi backend được triển khai
  // Hiện tại API /api/applications chưa tồn tại
  fetch('/api/applications')
    .then(r => r.ok ? r.json() : [])
    .then(applications => {
      let allProjects = [];
      
      // Add applications
      if (applications && Array.isArray(applications)) {
        allProjects = applications.map(app => ({
          id: app.id,
          name: app.appName || app.name || 'Unnamed',
          status: mapStatus(app.status),
          url: app.accessUrl || '',
          dockerImage: app.dockerImage || '',
          framework: 'Docker Image', // Vì form chỉ hỗ trợ Docker image
          createdAt: app.createdAt || new Date().toISOString(),
          updatedAt: app.updatedAt || app.createdAt || new Date().toISOString(),
          type: 'application'
        }));
      }
      
      renderProjectsList(allProjects);
    })
    .catch(err => {
      console.error('Error loading projects:', err);
      // Hiển thị empty state thay vì error nếu API chưa có
      projectsSection.innerHTML = `
        <div class="projects-empty">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
            <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <h3>Chưa có dự án nào</h3>
          <p>Bắt đầu bằng cách tạo triển khai mới</p>
        </div>
      `;
    });
}

function mapStatus(status) {
  const statusMap = {
    'UPLOADING': 'building',
    'EXTRACTING': 'building',
    'ANALYZING': 'building',
    'BUILDING': 'building',
    'DEPLOYING': 'building',
    'RUNNING': 'running',
    'STOPPED': 'stopped',
    'ERROR': 'error',
    'PENDING': 'pending'
  };
  return statusMap[status] || status.toLowerCase();
}

function renderProjectsList(projects) {
  const projectsSection = document.getElementById('projectsSection');
  if (!projectsSection) return;
  
  // Filter by search term
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(projectsSearchTerm.toLowerCase())
  );
  
  // Pagination
  const totalPages = Math.ceil(filteredProjects.length / projectsItemsPerPage);
  const startIndex = (projectsCurrentPage - 1) * projectsItemsPerPage;
  const endIndex = startIndex + projectsItemsPerPage;
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);
  
  if (filteredProjects.length === 0) {
    projectsSection.innerHTML = `
      <div class="projects-empty">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
          <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h3>${projectsSearchTerm ? 'Không tìm thấy dự án' : 'Chưa có dự án nào'}</h3>
        <p>${projectsSearchTerm ? `Không có dự án nào khớp với từ khóa "${projectsSearchTerm}"` : 'Bắt đầu bằng cách tạo triển khai mới'}</p>
      </div>
    `;
    return;
  }
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#10b981';
      case 'stopped': return '#64748b';
      case 'building': return '#2563eb';
      case 'pending': return '#f59e0b';
      case 'error': return '#dc2626';
      default: return '#64748b';
    }
  };
  
  const getStatusLabel = (status) => {
    switch (status) {
      case 'running': return 'Đang chạy';
      case 'stopped': return 'Đã dừng';
      case 'building': return 'Đang xây dựng';
      case 'pending': return 'Chờ phê duyệt';
      case 'error': return 'Lỗi';
      default: return status;
    }
  };
  
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  let html = `
    <div class="projects-list">
      <div class="projects-header">
        <h2>Dự án của bạn (${filteredProjects.length})</h2>
        <div class="projects-header-actions">
          <div class="search-wrapper">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
              <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <input
              type="text"
              class="search-input"
              placeholder="Tìm kiếm theo tên dự án..."
              value="${escapeHtml(projectsSearchTerm)}"
              oninput="projectsSearchTerm = this.value; projectsCurrentPage = 1; loadProjects();"
            />
            ${projectsSearchTerm ? `
              <button class="search-clear" onclick="projectsSearchTerm = ''; document.querySelector('.search-input').value = ''; projectsCurrentPage = 1; loadProjects();" aria-label="Clear search">
                <svg viewBox="0 0 24 24" fill="none">
                  <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            ` : ''}
          </div>
          <button class="refresh-btn" onclick="loadProjects()">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Làm mới
          </button>
        </div>
      </div>

      <div class="projects-grid">
        ${paginatedProjects.map(project => `
          <div class="project-card">
            <div class="project-header">
              <div class="project-title">
                <h3>${escapeHtml(project.name)}</h3>
                <span 
                  class="project-status"
                  style="background-color: ${getStatusColor(project.status)}20; color: ${getStatusColor(project.status)}"
                >
                  <span class="status-dot" style="background-color: ${getStatusColor(project.status)}"></span>
                  ${getStatusLabel(project.status)}
                </span>
              </div>
            </div>

            <div class="project-info">
              <div class="project-meta">
                <div class="meta-item">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M13.984 6.016v12.469c0 .563-.281.984-.656 1.219-.375.281-.75.375-1.219.375-.516 0-.891-.188-1.266-.516l-2.484-2.156c-.188-.141-.469-.141-.656 0l-2.484 2.156c-.375.328-.75.516-1.266.516-.469 0-.844-.094-1.219-.375C2.298 19.469 2 19.048 2 18.516V5.531c0-.563.298-.984.656-1.219C3.031 4.031 3.406 3.938 3.875 3.938c.516 0 .891.188 1.266.516l2.484 2.156c.188.141.469.141.656 0L10.75 4.453c.375-.328.75-.516 1.266-.516.469 0 .844.094 1.219.375C13.594 4.547 13.984 4.969 13.984 5.531v.485z" fill="currentColor"/>
                  </svg>
                  <span>${escapeHtml(project.dockerImage || project.framework)}</span>
                </div>
                <div class="meta-item">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
                    <polyline points="12 6 12 12 16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <span>${formatDate(project.updatedAt)}</span>
                </div>
              </div>

              ${project.url ? `
                <div class="project-url">
                  <a href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(project.url)}">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      <polyline points="15 3 21 3 21 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                      <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <code>${escapeHtml(project.url)}</code>
                  </a>
                </div>
              ` : ''}
            </div>

            <div class="project-actions">
              ${project.status === 'running' ? `
                <button class="action-btn stop-btn" onclick="handleStopProject('${project.id}')">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
                  </svg>
                  Dừng
                </button>
              ` : project.status === 'stopped' ? `
                <button class="action-btn start-btn" onclick="handleStartProject('${project.id}')">
                  <svg viewBox="0 0 24 24" fill="none">
                    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>
                  </svg>
                  Khởi động
                </button>
              ` : ''}
              
              ${project.type !== 'request' ? `
                <button class="action-btn delete-btn" onclick="handleDeleteProject('${project.id}')">
                  <svg viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  Xóa
                </button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      ${totalPages > 1 ? renderPagination(totalPages, projectsCurrentPage) : ''}
    </div>
  `;
  
  projectsSection.innerHTML = html;
}

function renderPagination(totalPages, currentPage) {
  const handlePageChange = (page) => {
    projectsCurrentPage = page;
    loadProjects();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  let pagesHtml = '';
  if (totalPages <= 7) {
    // Show all pages
    for (let i = 1; i <= totalPages; i++) {
      pagesHtml += `
        <button class="pagination-page ${currentPage === i ? 'active' : ''}" onclick="projectsCurrentPage = ${i}; loadProjects();">
          ${i}
        </button>
      `;
    }
  } else {
    // Show with ellipsis
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pagesHtml += `
          <button class="pagination-page ${currentPage === i ? 'active' : ''}" onclick="projectsCurrentPage = ${i}; loadProjects();">
            ${i}
          </button>
        `;
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        pagesHtml += '<span class="pagination-ellipsis">...</span>';
      }
    }
  }
  
  return `
    <div class="pagination">
      <button class="pagination-btn" onclick="if (projectsCurrentPage > 1) { projectsCurrentPage--; loadProjects(); }" ${currentPage === 1 ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Trước
      </button>
      
      <div class="pagination-pages">
        ${pagesHtml}
      </div>
      
      <button class="pagination-btn" onclick="if (projectsCurrentPage < ${totalPages}) { projectsCurrentPage++; loadProjects(); }" ${currentPage === totalPages ? 'disabled' : ''}>
        Sau
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;
}

// Project actions
async function handleStopProject(projectId) {
  console.log('Stop project:', projectId);
  loadProjects();
}

async function handleStartProject(projectId) {
  console.log('Start project:', projectId);
  loadProjects();
}

async function handleDeleteProject(projectId) {
  if (!confirm('Bạn có chắc chắn muốn xóa ứng dụng này không?\n\nTài nguyên của ứng dụng sẽ được xóa, KHÔNG xóa namespace của bạn.')) return;
  
  try {
    const response = await fetch(`/api/applications/${projectId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data.message || 'Đã xóa tài nguyên của ứng dụng, không xóa namespace.';
      showNotification(message, 'success');
      loadProjects(); // Reload để ẩn ứng dụng đã xóa khỏi danh sách
    } else {
      const data = await response.json().catch(() => ({}));
      showNotification('❌ Lỗi: ' + (data.message || data.error || 'Xóa thất bại'), 'danger');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showNotification('❌ Lỗi kết nối: ' + error.message, 'danger');
  }
}

 

// Legacy loadApplications function for compatibility
async function loadApplications() {
  loadProjects();
}

 

function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px; padding: 16px 20px; border-radius: 8px; color: white; background: ${type === 'success' ? '#10b981' : '#dc2626'}; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 5000);
}

// Poll application status - TODO: Triển khai lại khi có backend mới
async function pollApplicationStatus(appId) {
  try {
    const response = await fetch(`/api/applications/${appId}/status`);
    if (!response.ok) return;
    const data = await response.json();
    loadProjects();
    
    if (data.status !== 'RUNNING' && data.status !== 'ERROR' && data.status !== 'STOPPED') {
      setTimeout(() => pollApplicationStatus(appId), 3000);
    }
  } catch (error) {
    console.error('Error polling status:', error);
    // API chưa tồn tại, không cần retry
  }
}

// Legacy deleteApplication function for compatibility
async function deleteApplication(appId) {
  await handleDeleteProject(appId);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load servers list (không cần thiết vì server tự động chọn)
async function loadServers() {
  // Server selection đã được ẩn, server sẽ tự động chọn
  // Không cần load danh sách server
}

// Initialize all components
function initializeComponents() {
  initFrameworkDropdown();
  const frameworkButton = document.getElementById('frameworkSelectButton');
  if (frameworkButton) {
    frameworkButton.onclick = toggleFrameworkDropdown;
  }
  // File upload initialization (giữ lại để tương thích, nhưng không dùng)
  initializeFileUpload();
  
  // Deployment type luôn là Docker (selection đã bị ẩn)
  initializeDeploymentTypeChange();
  
  initializeClickOutside();
  initializeUploadForm();
  renderEnvVariables();
  
  // Framework preset mặc định
  const frameworkLabel = document.getElementById('frameworkLabel');
  if (frameworkLabel && selectedFramework === 'other') {
    frameworkLabel.textContent = 'Other / Custom';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  initializeComponents();
  // connectNotificationWebSocket(); // REMOVED: WebSocket handler đã bị xóa
  loadProjects();
  // loadServers(); // Không cần load servers vì đã ẩn server selection
});
