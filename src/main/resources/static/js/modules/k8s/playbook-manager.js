// Playbook Manager - Quản lý playbook và template K8s

function getClusterId() {
	let cid = window.currentClusterId;
	if (!cid) {
		try {
			const params = new URLSearchParams(window.location.search || '');
			const fromUrl = params.get('clusterId');
			if (fromUrl) {
				window.currentClusterId = fromUrl;
				cid = fromUrl;
			}
		} catch (_) { }
	}
	return cid;
}
// Load playbook cho cluster hiện tại (optional override)
async function loadPlaybooks(clusterIdOverride) {
	let cid = clusterIdOverride || getClusterId();
	if (!cid) {
		console.error('No cluster selected');
		const playbookList = document.getElementById('playbook-list');
		if (playbookList) {
			playbookList.innerHTML = '<div class="list-group-item text-center text-warning">Chưa chọn cluster. Vui lòng chọn cluster trước.</div>';
		}
		return;
	}

	// Validate và parse clusterId thành số
	try {
		cid = typeof cid === 'string' ? parseInt(cid, 10) : Number(cid);
		if (isNaN(cid) || cid <= 0) {
			throw new Error(`Cluster ID không hợp lệ: ${clusterIdOverride || getClusterId()}`);
		}
	} catch (err) {
		console.error('Invalid cluster ID:', err);
		const playbookList = document.getElementById('playbook-list');
		if (playbookList) {
			playbookList.innerHTML = `<div class="list-group-item text-center text-danger">
      <i class="bi bi-exclamation-triangle me-2"></i>
      Cluster ID không hợp lệ: ${clusterIdOverride || getClusterId()}
      </div>`;
		}
		return;
	}

	try {
		// Lưu lại override nếu có
		if (clusterIdOverride) {
			window.currentClusterId = cid;
		}
		
		const response = await fetch(`/api/ansible-playbook/list`);
		
		// Handle error response với message từ server nếu có
		if (!response.ok) {
			let errorMessage = 'Không thể tải danh sách playbook';
			
			// Nếu là 400, hiển thị message rõ ràng hơn về kết nối master
			if (response.status === 400) {
				errorMessage = 'Không thể kết nối đến máy master của cluster. Vui lòng kiểm tra kết nối server hoặc cluster ID.';
			} else {
				// Thử đọc error message từ response cho các status code khác
				try {
					const errorText = await response.text();
					if (errorText) {
						try {
							const errorData = JSON.parse(errorText);
							if (errorData && errorData.error) {
								errorMessage = errorData.error;
							} else if (errorData && errorData.message) {
								errorMessage = errorData.message;
							}
						} catch (_) {
							// Nếu không parse được JSON, sử dụng text trực tiếp nếu có
							if (errorText.trim().length > 0) {
								errorMessage = errorText;
							}
						}
					}
				} catch (_) {
					// Nếu không đọc được response, sử dụng message mặc định
				}
			}
			
			throw new Error(errorMessage);
		}

		const playbooks = await response.json();
		const playbookList = document.getElementById('playbook-list');

		if (!playbookList) {
			console.warn('playbook-list element not found');
			return;
		}

		if (!playbooks || playbooks.length === 0) {
			playbookList.innerHTML = '<div class="list-group-item text-center text-muted">Chưa có playbook nào</div>';
		} else {
			playbookList.innerHTML = '';
			playbooks.forEach(pb => {
				// Escape HTML để tránh XSS
				const escapedPb = pb.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
				const item = document.createElement('div');
				item.className = 'list-group-item d-flex justify-content-between align-items-center';
				item.innerHTML = `
      <div class="playbook-item" data-name="${escapedPb}">
        <div class="fw-bold">${escapedPb}</div>
        <div class="small text-muted">Playbook file</div>
      </div>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-primary btn-sm" onclick="loadPlaybook('${escapedPb}')" title="Xem">
        👁️
        </button>
        <button class="btn btn-outline-success btn-sm" onclick="executePlaybook('${escapedPb}')" title="Thực thi">
        ▶️
        </button>
        <button class="btn btn-outline-danger btn-sm" onclick="deletePlaybook('${escapedPb}')" title="Xóa">
        🗑️
        </button>
      </div>
      `;
				playbookList.appendChild(item);
			});
		}
	} catch (error) {
		console.error('Error loading playbooks:', error);
		// Hiển thị lỗi trong playbook list
		const playbookList = document.getElementById('playbook-list');
		if (playbookList) {
			const errorMsg = error.message || 'Lỗi không xác định';
			playbookList.innerHTML = `
      <div class="list-group-item text-center text-danger">
      <i class="bi bi-exclamation-triangle me-2"></i>
      ${errorMsg}
      </div>
    `;
		}
		// Cũng hiển thị alert nếu có
		if (window.showAlert && typeof window.showAlert === 'function') {
			window.showAlert('error', error.message || 'Không thể tải danh sách playbook');
		}
	}
}

// Tải nội dung playbook
window.loadPlaybook = async function (filename) {
	const cid = getClusterId();
	if (!cid || !filename) return;

	try {
		const response = await fetch(`/api/ansible-playbook/read?filename=${encodeURIComponent(filename)}`);
		if (!response.ok) {
			throw new Error('Failed to load playbook');
		}

		const data = await response.json();
		const filenameInput = document.getElementById('playbook-filename');
		const editor = document.getElementById('playbook-editor');
		const deleteBtn = document.getElementById('delete-playbook-btn');
		const executeBtn = document.getElementById('execute-playbook-btn');

		if (filenameInput) filenameInput.value = filename.replace(/\.(yml|yaml)$/i, '');
		if (editor) editor.value = data.content;

		// Hiển thị delete và execute buttons khi load playbook
		if (deleteBtn) deleteBtn.classList.remove('d-none');
		if (executeBtn) executeBtn.classList.remove('d-none');

		// Hiển thị view nội dung và ẩn view thực thi
		if (window.showPlaybookContentView) {
			window.showPlaybookContentView();
		}

	} catch (error) {
		console.error('Error loading playbook:', error);
		if (window.showAlert) {
			window.showAlert('error', 'Lỗi tải playbook: ' + error.message);
		}
	}
};

// Lưu playbook
window.savePlaybook = async function () {
	const cid = getClusterId();
	if (!cid) return;

	const filename = document.getElementById('playbook-filename')?.value;
	const content = document.getElementById('playbook-editor')?.value;

	if (!filename || !content) {
		showAlert('error', 'Vui lòng nhập tên file và nội dung');
		return;
	}

	try {
		const response = await fetch(`/api/ansible-playbook/save`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: `filename=${encodeURIComponent(filename)}&content=${encodeURIComponent(content)}`
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Lỗi lưu playbook');
		}

		showAlert('success', 'Đã lưu playbook thành công');
		await loadPlaybooks(); // Cập nhật danh sách

	} catch (error) {
		console.error('Error saving playbook:', error);
		showAlert('error', 'Lỗi lưu playbook: ' + error.message);
	}
};

// Xóa playbook
window.deletePlaybook = async function (filename) {
	const cid = getClusterId();
	if (!cid || !filename) return;

	if (!confirm(`Xóa playbook "${filename}"?`)) return;

	try {
		const response = await fetch(`/api/ansible-playbook/delete?filename=${encodeURIComponent(filename)}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || 'Lỗi xóa playbook');
		}

		const result = await response.json().catch(() => ({}));
		if (window.showAlert) {
			window.showAlert('success', `Đã xóa playbook "${filename}" thành công`);
		}
		await loadPlaybooks(); // Cập nhật danh sách

	} catch (error) {
		console.error('Error deleting playbook:', error);
		if (window.showAlert) {
			window.showAlert('error', 'Lỗi xóa playbook: ' + error.message);
		}
	}
};

// Thực thi playbook
window.executePlaybook = async function (filename, extraVars = '') {
	const cid = getClusterId();
	if (!cid || !filename) return;

	try {
		// Hiển thị thực thi và ẩn nội dung
		if (window.showPlaybookExecutionView) {
			window.showPlaybookExecutionView();
		}

		const response = await fetch(`/api/ansible-playbook/execute`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: `filename=${encodeURIComponent(filename)}&extraVars=${encodeURIComponent(extraVars)}`
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Lỗi thực thi playbook');
		}

		const result = await response.json();
		showAlert('success', `Đã bắt đầu thực thi playbook: ${filename}`);

		// Bắt đầu theo dõi trạng thái thực thi
		if (result.taskId) {
			monitorPlaybookExecution(result.taskId);
		}

		return result;
	} catch (error) {
		console.error('Error executing playbook:', error);
		if (window.showAlert) {
			window.showAlert('error', 'Lỗi thực thi playbook: ' + error.message);
		}
		if (window.showPlaybookContentView) {
			window.showPlaybookContentView(); // Hiển thị nội dung khi có lỗi
		}
		throw error;
	}
};

// Theo dõi thực thi playbook
async function monitorPlaybookExecution(taskId) {
	const statusElement = document.getElementById('playbook-execution-status');
	if (!statusElement) {
		console.error('playbook-execution-status element not found');
		return;
	}

	// Tạo terminal-style output container (giống admin.js)
	statusElement.innerHTML = `
    <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h6 class="mb-0"><i class="bi bi-terminal"></i> Ansible Playbook Execution</h6>
      <div class="d-flex align-items-center">
      <div class="spinner-border spinner-border-sm text-primary me-2" role="status" id="execution-spinner">
        <span class="visually-hidden">Loading...</span>
      </div>
      <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('playbook-execution-status').innerHTML = ''">
        <i class="bi bi-x-circle"></i> Clear
      </button>
      </div>
    </div>
    <div class="card-body p-0">
      <div class="progress" style="height: 4px;">
      <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" id="execution-progress" style="width: 0%"></div>
      </div>
      <div id="ansible-output" class="bg-dark text-light p-3" style="font-family: 'Courier New', monospace; font-size: 0.875rem; height: 400px; overflow-y: auto; white-space: pre-wrap;">
      <div class="text-success">🚀 Bắt đầu thực thi playbook...</div>
      </div>
    </div>
    </div>
  `;

	const outputElement = document.getElementById('ansible-output');
	const progressElement = document.getElementById('execution-progress');
	const spinnerElement = document.getElementById('execution-spinner');

	if (!outputElement || !progressElement || !spinnerElement) {
		console.error('Execution elements not found after creation');
		return;
	}

	// Hiển thị execution view
	if (window.showPlaybookExecutionView) {
		window.showPlaybookExecutionView();
	}

	let lastOutputLength = 0;
	let lastProgress = 0;

	const checkStatus = async () => {
		try {
			const response = await fetch(`/api/ansible-playbook/status?taskId=${encodeURIComponent(taskId)}`);
			if (!response.ok) {
				throw new Error('Failed to check status');
			}

			const status = await response.json();

			// Cập nhật progress bar (execution-progress chính là progress bar)
			if (progressElement) {
				const progress = status.progress || 0;
				progressElement.style.width = `${progress}%`;
				progressElement.setAttribute('aria-valuenow', progress);

				// Cập nhật màu progress bar dựa trên status
				if (status.status === 'running') {
					progressElement.className = 'progress-bar progress-bar-striped progress-bar-animated bg-primary';
				} else if (status.status === 'completed') {
					progressElement.className = 'progress-bar bg-success';
				} else if (status.status === 'failed') {
					progressElement.className = 'progress-bar bg-danger';
				}
			}

			// Cập nhật spinner
			if (spinnerElement) {
				if (status.status === 'running') {
					spinnerElement.style.display = 'inline-block';
				} else {
					spinnerElement.style.display = 'none';
				}
			}

			lastProgress = status.progress || 0;

			// Thêm output mới vào terminal (status.output là string, không phải array)
			if (status.output && typeof status.output === 'string' && status.output.length > lastOutputLength) {
				const newOutput = status.output.substring(lastOutputLength);
				lastOutputLength = status.output.length;

				const outputLines = newOutput.split('\n');
				let hasNewContent = false;

				outputLines.forEach(line => {
					if (line.trim()) {
						hasNewContent = true;
						const lineElement = document.createElement('div');
						lineElement.style.marginBottom = '2px';

						// Color coding cho các loại output khác nhau (giống admin.js)
						if (line.includes('PLAY [')) {
							lineElement.className = 'text-primary fw-bold';
							lineElement.innerHTML = line.replace(/PLAY \[(.*?)\]/g, '🎭 PLAY [$1]');
						} else if (line.includes('TASK [')) {
							lineElement.className = 'text-warning fw-bold';
							lineElement.innerHTML = line.replace(/TASK \[(.*?)\]/g, '📋 TASK [$1]');
						} else if (line.includes('PLAY RECAP')) {
							lineElement.className = 'text-info fw-bold';
							lineElement.innerHTML = '📊 PLAY RECAP';
						} else if (line.includes('ok:')) {
							lineElement.className = 'text-success';
							lineElement.innerHTML = '✅ ' + line;
						} else if (line.includes('changed:')) {
							lineElement.className = 'text-warning';
							lineElement.innerHTML = '🔄 ' + line;
						} else if (line.includes('failed:')) {
							lineElement.className = 'text-danger';
							lineElement.innerHTML = '❌ ' + line;
						} else if (line.includes('unreachable:')) {
							lineElement.className = 'text-danger';
							lineElement.innerHTML = '🚫 ' + line;
						} else if (line.includes('skipping:')) {
							lineElement.className = 'text-secondary';
							lineElement.innerHTML = '⏭️ ' + line;
						} else if (line.includes('=>')) {
							lineElement.className = 'text-light';
							lineElement.innerHTML = '📤 ' + line;
						} else {
							lineElement.className = 'text-light';
							lineElement.textContent = line;
						}

						outputElement.appendChild(lineElement);
					}
				});

				if (hasNewContent) {
					// Cuộn xuống cuối
					outputElement.scrollTop = outputElement.scrollHeight;
				}
			}

			if (status.status === 'running') {
				setTimeout(checkStatus, 1000);
			} else {
				// Ẩn spinner
				spinnerElement.style.display = 'none';

				// Hiển thị thông báo hoàn thành
				const summaryElement = document.createElement('div');
				summaryElement.className = 'text-success mt-3 border-top pt-2';

				const titleElement = document.createElement('div');
				titleElement.className = 'fw-bold';
				titleElement.textContent = 'Hoàn thành thực thi playbook!';

				const timeElement = document.createElement('div');
				timeElement.className = 'small text-white';
				timeElement.textContent = `Thời gian thực thi: ${Math.round((status.endTime - status.startTime) / 1000)}s`;

				summaryElement.appendChild(titleElement);
				summaryElement.appendChild(timeElement);
				outputElement.appendChild(summaryElement);
			}

		} catch (error) {
			console.error('Lỗi theo dõi thực thi:', error);
			spinnerElement.style.display = 'none';

			const errorElement = document.createElement('div');
			errorElement.className = 'text-danger mt-3';

			const errorTitle = document.createElement('div');
			errorTitle.className = 'fw-bold';
			errorTitle.textContent = 'Lỗi kiểm tra trạng thái thực thi';

			errorElement.appendChild(errorTitle);
			outputElement.appendChild(errorElement);
		}
	};

	checkStatus();
}

// Kiểm tra xem playbook có tồn tại không
async function checkPlaybookExists(filename) {
	const cid = getClusterId();
	if (!cid) {
		console.log('Không tìm thấy ID cluster');
		return false;
	}

	try {
		const response = await fetch(`/api/ansible-playbook/list`);
		if (!response.ok) {
			console.log('Lỗi tải danh sách playbook:', response.status);
			return false;
		}

		const playbooks = await response.json();
		console.log('Playbook hiện tại:', playbooks);
		console.log('Tìm kiếm:', filename);

		const exists = playbooks.includes(filename);
		console.log('File tồn tại:', exists);
		return exists;
	} catch (error) {
		console.error('Lỗi kiểm tra playbook:', error);
		return false;
	}
}

// Tải lên playbook
window.uploadPlaybook = async function (file) {
	const cid = getClusterId();
	if (!cid || !file) return;

	try {
		// Kiểm tra xem file đã tồn tại chưa
		const originalFilename = file.name;
		const finalFilename = originalFilename.toLowerCase().endsWith('.yml') || originalFilename.toLowerCase().endsWith('.yaml')
			? originalFilename
			: originalFilename + '.yml';

		const exists = await checkPlaybookExists(finalFilename);

		if (exists) {
			const confirmMessage = `Playbook "${finalFilename}" đã tồn tại. Bạn có muốn ghi đè lên file cũ không?`;
			if (!confirm(confirmMessage)) {
				showAlert('info', 'Đã hủy tải lên playbook');
				return;
			}
		}

		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch(`/api/ansible-playbook/upload`, {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Lỗi tải lên playbook');
		}

		const result = await response.json();
		showAlert('success', `Đã tải lên playbook: ${result.filename}`);
		await loadPlaybooks(); // Cập nhật danh sách

		// Tải nội dung playbook đã tải lên
		await loadPlaybook(result.filename);

	} catch (error) {
		console.error('Lỗi tải lên playbook:', error);
		showAlert('error', 'Lỗi tải lên playbook: ' + error.message);
		throw error;
	}
};

// Tạo playbook K8s từ template
window.generateK8sPlaybookFromTemplate = async function (template) {
	if (!getClusterId()) {
		throw new Error('Vui lòng chọn cluster trước');
	}

	const templates = {
		'01-update-hosts-hostname': `---
- name: Update /etc/hosts and hostname for entire cluster
  hosts: all
  become: yes
  gather_facts: yes
  tasks:
    - name: Add all inventory nodes to /etc/hosts
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host | default(item) }} {{ hostvars[item].ansible_user }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_user is defined
      tags: addhosts
    
    - name: Set hostname according to inventory
      hostname:
        name: "{{ hostvars[inventory_hostname].ansible_user }}"
      when: ansible_hostname != hostvars[inventory_hostname].ansible_user
      tags: sethostname
    
    - name: Verify hostname after update
      command: hostnamectl
      register: host_info
      changed_when: false
      tags: verify
    
    - name: Display information after update
      debug:
        msg:
          - "Current hostname: {{ ansible_hostname }}"
          - "hostnamectl command result:"
          - "{{ host_info.stdout_lines }}"
      tags: verify`,

		'02-kernel-sysctl': `---
- hosts: all
  become: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Disable swap
      shell: swapoff -a || true
      ignore_errors: true
  
    - name: Comment swap lines in /etc/fstab
      replace:
        path: /etc/fstab
        regexp: '(^.*swap.*$)'
        replace: '# \\1'
  
    - name: Load kernel modules
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter
  
    - name: Load overlay and br_netfilter modules
      shell: |
        modprobe overlay
        modprobe br_netfilter
  
    - name: Configure sysctl for Kubernetes
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1
  
    - name: Apply sysctl configuration
      command: sysctl --system`,

		'03-install-containerd': `---
- hosts: all
  become: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Check if containerd is already installed
      command: containerd --version
      register: containerd_check
      ignore_errors: true
      changed_when: false
    
    - name: Display current status
      debug:
        msg: >
          {% if containerd_check.rc == 0 %}
          Containerd is already installed ({{ containerd_check.stdout | default('version unknown') }}).
          Will upgrade/reinstall with latest version and reconfigure.
          {% else %}
          Containerd not found, will install new.
          {% endif %}
    
    - name: Update apt cache
      apt:
        update_cache: yes
  
    - name: Install or upgrade containerd
      apt:
        name: containerd
        state: present
        force_apt_get: yes
  
    - name: Create containerd configuration directory
      file:
        path: /etc/containerd
        state: directory
  
    - name: Generate default containerd configuration (will overwrite existing)
      shell: "containerd config default > /etc/containerd/config.toml"
  
    - name: Enable SystemdCgroup
      replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'
  
    - name: Restart containerd service
      systemd:
        name: containerd
        enabled: yes
        state: restarted
    
    - name: Verify containerd installation
      command: containerd --version
      register: containerd_verify
      changed_when: false
    
    - name: Display installation result
      debug:
        msg: "Containerd installation completed: {{ containerd_verify.stdout | default('version check failed') }}"`,

		'04-install-kubernetes': `---
- hosts: all
  become: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Check if Kubernetes packages are already installed
      command: |
        if command -v kubelet >/dev/null 2>&1 && command -v kubeadm >/dev/null 2>&1 && command -v kubectl >/dev/null 2>&1; then
          echo "INSTALLED"
          kubelet --version 2>&1 | head -1 || echo "version unknown"
        else
          echo "NOT_INSTALLED"
        fi
      register: k8s_check
      ignore_errors: true
      changed_when: false
    
    - name: Display current status
      debug:
        msg: >
          {% if 'INSTALLED' in k8s_check.stdout %}
          Kubernetes packages (kubelet, kubeadm, kubectl) are already installed.
          Will upgrade/reinstall with latest version from repository.
          {% else %}
          Kubernetes packages not found, will install new.
          {% endif %}
    
    - name: Install required packages
      apt:
        name:
          - apt-transport-https
          - ca-certificates
          - curl
        state: present
        update_cache: yes
  
    - name: Add Kubernetes GPG key
      shell: |
        if [ ! -f /usr/share/keyrings/kubernetes-archive-keyring.gpg ]; then
          curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \\
          gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
        else
          echo "GPG key already exists, skipping this step."
        fi
      changed_when: false
      register: gpg_status
  
    - name: Add Kubernetes repository (will overwrite existing)
      copy:
        dest: /etc/apt/sources.list.d/kubernetes.list
        content: |
          deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /
  
    - name: Install or upgrade kubelet, kubeadm, kubectl
      apt:
        name:
          - kubelet
          - kubeadm
          - kubectl
        state: present
        update_cache: yes
  
    - name: Hold package versions
      command: apt-mark hold kubelet kubeadm kubectl
    
    - name: Verify Kubernetes packages installation
      command: |
        echo "kubelet: $(kubelet --version 2>&1 | head -1 || echo 'N/A')"
        echo "kubeadm: $(kubeadm version -o short 2>&1 || echo 'N/A')"
        echo "kubectl: $(kubectl version --client --short 2>&1 || echo 'N/A')"
      register: k8s_verify
      changed_when: false
      ignore_errors: true
    
    - name: Display installation result
      debug:
        msg: "{{ k8s_verify.stdout_lines | default(['Kubernetes packages installation completed']) }}"`,

		'05-init-master': `---
- hosts: master
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  
  vars:
    pod_network_cidr: "10.244.0.0/16"
    calico_manifest: "https://raw.githubusercontent.com/projectcalico/calico/v3.27.3/manifests/calico.yaml"
    join_script: "/etc/kubernetes/join-command.sh"
  
  tasks:
    - name: Get dynamic master IP address
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
  
    - name: Display master IP being used
      debug:
        msg: "Using master IP address: {{ master_ip }}"
  
    - name: Reset old cluster and clean up data
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/etcd /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes
  
    - name: Initialize Kubernetes Control Plane
      command: >
        kubeadm init
        --control-plane-endpoint "{{ master_ip }}:6443"
        --apiserver-advertise-address {{ master_ip }}
        --pod-network-cidr {{ pod_network_cidr }}
        --upload-certs
      args:
        creates: /etc/kubernetes/admin.conf
      register: kubeadm_init
      failed_when: "'error' in kubeadm_init.stderr"
      changed_when: "'Your Kubernetes control-plane has initialized successfully' in kubeadm_init.stdout"
  
    - name: Configure kubeconfig for root user
      shell: |
        mkdir -p $HOME/.kube
        cp /etc/kubernetes/admin.conf $HOME/.kube/config
        chown $(id -u):$(id -g) $HOME/.kube/config
      args:
        executable: /bin/bash
  
    - name: Configure kubeconfig for normal user
      when: ansible_user != "root"
      block:
        - name: Create kubeconfig directory for user
          file:
            path: "/home/{{ ansible_user }}/.kube"
            state: directory
            mode: '0755'
  
        - name: Copy kubeconfig for user
          copy:
            src: /etc/kubernetes/admin.conf
            dest: "/home/{{ ansible_user }}/.kube/config"
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0600'
            remote_src: yes
  
    - name: Generate join command for workers
      shell: kubeadm token create --print-join-command
      register: join_cmd
      changed_when: false
  
    - name: Save join command to file
      copy:
        content: "{{ join_cmd.stdout }}"
        dest: "{{ join_script }}"
        mode: '0755'
  
    - name: Display join command
      debug:
        msg:
          - "Worker join command:"
          - "{{ join_cmd.stdout }}"
          - "File saved at: {{ join_script }}"
  
    - name: Complete master initialization
      debug:
        msg: "Master {{ inventory_hostname }} is ready for worker nodes to join!"`,

		'06-install-cni': `---
- name: Install or update Calico CNI (automatic)
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  
  vars:
    calico_version: "v3.27.3"
    calico_url: "https://raw.githubusercontent.com/projectcalico/calico/{{ calico_version }}/manifests/calico.yaml"
  
  tasks:
    - name: Check if Calico CNI exists
      command: kubectl get daemonset calico-node -n kube-system
      register: calico_check
      ignore_errors: true
  
    - name: Display current status
      debug:
        msg: >
          {% if calico_check.rc == 0 %}
          Calico is already installed.
          {% else %}
          Calico not found, will install new.
          {% endif %}
  
    - name: Check kernel modules overlay and br_netfilter
      shell: |
        modprobe overlay || true
        modprobe br_netfilter || true
        lsmod | grep -E 'overlay|br_netfilter' || echo "Missing kernel module"
      register: kernel_status
      ignore_errors: true
  
    - name: Display kernel module check result
      debug:
        var: kernel_status.stdout_lines
  
    - name: Check sysctl configuration
      shell: |
        echo "net.bridge.bridge-nf-call-iptables = 1" | tee /etc/sysctl.d/k8s.conf >/dev/null
        echo "net.ipv4.ip_forward = 1" | tee -a /etc/sysctl.d/k8s.conf >/dev/null
        sysctl --system | grep -E "net.bridge.bridge-nf-call|net.ipv4.ip_forward"
      register: sysctl_status
      ignore_errors: true
  
    - name: Display sysctl result
      debug:
        var: sysctl_status.stdout_lines
  
    - name: Apply Calico manifest (install or update)
      shell: |
        kubectl apply -f {{ calico_url }}
      args:
        executable: /bin/bash
      register: calico_apply
      retries: 3
      delay: 10
      until: calico_apply.rc == 0
  
    - name: Display installation result
      debug:
        var: calico_apply.stdout_lines
  
    - name: Check Calico node pod starting
      shell: |
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
      register: calico_running
  
    - name: Wait for pod to start (max 10 retries)
      until: calico_running.stdout | int > 0
      retries: 10
      delay: 15
      shell: |
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
      register: calico_running
      ignore_errors: true
  
    - name: Confirm Calico pods are running
      when: calico_running.stdout | int > 0
      debug:
        msg: "Calico is running ({{ calico_running.stdout }} pods Running)."
  
    - name: Log Calico pod if error
      when: calico_running.stdout | int == 0
      shell: kubectl logs -n kube-system -l k8s-app=calico-node --tail=50 || true
      register: calico_logs
      ignore_errors: true
  
    - name: Display Calico pod logs
      when: calico_running.stdout | int == 0
      debug:
        msg: "{{ calico_logs.stdout_lines | default(['Calico pod is not ready or has no logs.']) }}"
  
    - name: Check node status
      command: kubectl get nodes -o wide
      register: nodes_status
      ignore_errors: true
  
    - name: Display cluster result
      debug:
        var: nodes_status.stdout_lines`,

		'06-install-flannel': `---
- name: Install or update Flannel CNI (WSL2 compatible)
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  
  vars:
    flannel_manifest: "https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml"
  
  tasks:
    - name: Check if Flannel CNI exists
      command: kubectl get daemonset kube-flannel-ds -n kube-flannel
      register: flannel_check
      ignore_errors: true
  
    - name: Display current status
      debug:
        msg: >
          {% if flannel_check.rc == 0 %}
          Flannel is already installed.
          {% else %}
          Flannel not found, will install new.
          {% endif %}
  
    - name: Enable IP forwarding
      shell: |
        echo "net.ipv4.ip_forward = 1" | tee /etc/sysctl.d/k8s.conf >/dev/null
        sysctl --system | grep net.ipv4.ip_forward
      register: sysctl_status
      ignore_errors: true
  
    - name: Display sysctl result
      debug:
        var: sysctl_status.stdout_lines
  
    - name: Apply Flannel manifest (auto-download latest)
      command: kubectl apply -f {{ flannel_manifest }}
      register: flannel_apply
      changed_when: "'created' in flannel_apply.stdout or 'configured' in flannel_apply.stdout"
      failed_when: flannel_apply.rc != 0
  
    - name: Display apply result
      debug:
        var: flannel_apply.stdout_lines
  
    - name: Check number of running Flannel pods
      shell: |
        kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
      register: flannel_running
  
    - name: Wait for Flannel pod to be active (max 10 retries)
      until: flannel_running.stdout | int > 0
      retries: 10
      delay: 15
      shell: |
        kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
      register: flannel_running
      ignore_errors: true
  
    - name: Confirm Flannel pod is active
      when: flannel_running.stdout | int > 0
      debug:
        msg: "Flannel is running ({{ flannel_running.stdout }} pods Running)."
  
    - name: Log Flannel if pod not running
      when: flannel_running.stdout | int == 0
      shell: kubectl logs -n kube-flannel -l app=flannel --tail=50 || true
      register: flannel_logs
      ignore_errors: true
  
    - name: Display Flannel logs
      when: flannel_running.stdout | int == 0
      debug:
        msg: "{{ flannel_logs.stdout_lines | default(['Flannel pod is not ready or has no logs.']) }}"
  
    - name: Check node status
      command: kubectl get nodes -o wide
      register: nodes_status
      ignore_errors: true
  
    - name: Display cluster result
      debug:
        var: nodes_status.stdout_lines`,

		'07-join-workers': `---
- hosts: workers
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  vars:
    join_script: /tmp/kube_join.sh
  tasks:
    - name: Test SSH connectivity to worker node
      ping:
      register: ping_result
      ignore_errors: yes
  
    - name: Skip offline workers
      set_fact:
        worker_online: "{{ ping_result is succeeded }}"
  
    - name: Display worker online status
      debug:
        msg: "Worker {{ inventory_hostname }} is {{ 'ONLINE' if worker_online else 'OFFLINE' }}"
  
    - name: Get join command from master
      delegate_to: "{{ groups['master'][0] }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd
      when: worker_online
  
    - name: Save join command to file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'
      when: worker_online
      ignore_errors: yes
  
    - name: Reset node if old cluster exists
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes
      when: worker_online
  
    - name: Join to Kubernetes cluster
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: yes
      when: worker_online
  
    - name: Display join result
      debug:
        msg: "{{ join_output.stdout_lines | default(['Successfully joined cluster!']) if worker_online else ['Worker offline, skip join'] }}"
  
    - name: Restart kubelet service
      systemd:
        name: kubelet
        state: restarted
        enabled: yes
      ignore_errors: yes
      when: worker_online
  
    - name: Complete join process
      debug:
        msg: "{{ 'Node ' + inventory_hostname + ' has successfully joined the cluster!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Skipping join' }}"`,

		'09-install-helm': `---
- hosts: master
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  
  tasks:
    - name: Install Helm if not present
      shell: |
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
      args:
        executable: /bin/bash
      register: helm_install
      ignore_errors: yes
  
    - name: Display Helm installation result
      debug:
        msg: "{{ helm_install.stdout_lines | default(['Helm installed']) }}"
  
    - name: Check Helm version
      shell: helm version --short
      register: helm_version
  
    - name: Display Helm information
      debug:
        msg: "Current Helm version: {{ helm_version.stdout | default('Unknown') }}"
  
    - name: Installation complete
      debug:
        msg: "Helm has been installed successfully on master!"`,

		'10-install-metrics-server': `---
- name: Install or Update Metrics Server for Kubernetes
  hosts: master
  become: yes
  gather_facts: no
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
  
  vars:
    metrics_url: "https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
    ms_namespace: "kube-system"
  
  tasks:
    - name: Check if metrics-server is already installed
      shell: kubectl get deployment metrics-server -n {{ ms_namespace }} --no-headers
      register: ms_check
      ignore_errors: true
      changed_when: false
  
    - name: Display current status
      debug:
        msg: >
          {% if ms_check.rc == 0 %}
          Metrics-server đã tồn tại. Sẽ tiến hành cập nhật lại (apply lại manifest).
          {% else %}
          Metrics-server chưa tồn tại. Sẽ tiến hành cài mới.
          {% endif %}
  
    - name: Apply metrics-server manifest from GitHub
      command: kubectl apply -f {{ metrics_url }}
      register: ms_apply
  
    - name: Display apply result
      debug:
        var: ms_apply.stdout_lines
  
    - name: Patch metrics-server to allow insecure TLS
      shell: |
        kubectl patch deployment metrics-server -n kube-system \
        --type='json' \
        -p='[
          {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"},
          {"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-preferred-address-types=InternalIP"}
        ]'
      register: ms_patch
      ignore_errors: true
  
    - name: Display patch result
      debug:
        var: ms_patch.stdout_lines
  
    - name: Wait for metrics-server pod to be Running
      shell: |
        kubectl get pods -n kube-system -l k8s-app=metrics-server \
        --no-headers 2>/dev/null | grep -c Running || true
      register: ms_running
      retries: 10
      delay: 10
      until: ms_running.stdout | int > 0
      ignore_errors: true
  
    - name: Confirm metrics-server pod status
      debug:
        msg: >
          Pod metrics-server Running: {{ ms_running.stdout }} instance(s)
  
    - name: Get metrics-server logs if pod is not running
      when: ms_running.stdout | int == 0
      shell: |
        POD=$(kubectl get pods -n kube-system -l k8s-app=metrics-server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
        if [ -n "$POD" ]; then
          kubectl logs -n kube-system $POD --tail=50
        else
          echo "No metrics-server pod found!"
        fi
      register: ms_logs
      ignore_errors: true
  
    - name: Display metrics-server logs when error
      when: ms_running.stdout | int == 0
      debug:
        var: ms_logs.stdout_lines`,

		'11-install-ingress': `---
- name: Install Nginx Ingress Controller using YAML manifests
  hosts: master
  become: yes
  gather_facts: no
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  
  vars:
    ingress_nginx_version: "v1.11.1"
    ingress_nginx_namespace: "ingress-nginx"
  
  tasks:
    - name: Get dynamic master IP address
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
    
    - name: Display installation info
      debug:
        msg: "Installing Nginx Ingress Controller version {{ ingress_nginx_version }} using YAML manifests on master: {{ master_ip }}"
  
    - name: Check if Ingress Controller already exists
      command: kubectl get deployment ingress-nginx-controller -n {{ ingress_nginx_namespace }}
      register: ingress_check
      ignore_errors: true
      changed_when: false
    
    - name: Display current status
      debug:
        msg: >
          {% if ingress_check.rc == 0 %}
          Ingress Controller is already installed. Will update with new configuration.
          {% else %}
          Ingress Controller not found, will install new.
          {% endif %}
    
    - name: Download Nginx Ingress Controller manifest
      shell: |
        curl -L https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-{{ ingress_nginx_version }}/deploy/static/provider/cloud/deploy.yaml -o /tmp/ingress-nginx.yaml
      register: download_result
      changed_when: download_result.rc == 0
    
    - name: Patch Service to use LoadBalancer type
      shell: |
        sed -i 's/type: NodePort/type: LoadBalancer/' /tmp/ingress-nginx.yaml || true
        sed -i 's/type: ClusterIP/type: LoadBalancer/' /tmp/ingress-nginx.yaml || true
      ignore_errors: true
    
    - name: Apply Nginx Ingress Controller manifest
      command: kubectl apply -f /tmp/ingress-nginx.yaml
      register: apply_result
      changed_when: "'created' in apply_result.stdout or 'configured' in apply_result.stdout or 'unchanged' not in apply_result.stdout"
  
    - name: Display Ingress installation result
      debug:
        msg: "{{ apply_result.stdout_lines | default(['Ingress Controller applied']) }}"
  
    - name: Patch ingress-nginx-controller-admission service to ClusterIP
      command: kubectl patch svc ingress-nginx-controller-admission -n {{ ingress_nginx_namespace }} -p '{"spec":{"type":"ClusterIP"}}'
      register: patch_admission_result
      ignore_errors: true
      changed_when: patch_admission_result.rc == 0
  
    - name: Display admission service patch result
      debug:
        msg: "{{ patch_admission_result.stdout_lines | default(['Admission service patched to ClusterIP']) if patch_admission_result.rc == 0 else ['Admission service patch skipped (may not exist)'] }}"
  
    - name: Wait for ingress-nginx pods to be Running
      shell: |
        kubectl get pods -n {{ ingress_nginx_namespace }} -l app.kubernetes.io/name=ingress-nginx --no-headers 2>/dev/null | grep -c 'Running' || true
      register: ingress_running
      until: ingress_running.stdout | int > 0
      retries: 15
      delay: 10
      ignore_errors: true
  
    - name: Check ingress-nginx pod status
      shell: |
        kubectl get pods -n {{ ingress_nginx_namespace }} -o wide
      register: ingress_pods
      changed_when: false
  
    - name: Display ingress-nginx pods
      debug:
        msg: "{{ ingress_pods.stdout_lines | default(['No ingress-nginx pods found']) }}"
  
    - name: Display ingress-nginx service
      shell: |
        kubectl get svc -n {{ ingress_nginx_namespace }} ingress-nginx-controller
      register: ingress_svc
      changed_when: false
      ignore_errors: true
  
    - name: Display service information
      debug:
        msg: "{{ ingress_svc.stdout_lines | default(['Service information not available']) }}"
  
    - name: Installation complete
      debug:
        msg:
          - "Ingress Controller (NGINX) has been installed successfully using YAML manifests!"
          - "Version: {{ ingress_nginx_version }}"
          - "Namespace: {{ ingress_nginx_namespace }}"
          - "Use 'kubectl get svc -n {{ ingress_nginx_namespace }}' to check the LoadBalancer IP"`,

		'12-install-metallb': `---
- name: Install and configure MetalLB on Kubernetes using YAML manifests
  hosts: master
  become: yes
  gather_facts: yes
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  vars:
    metallb_version: "v0.14.8"
    metallb_namespace: "metallb-system"
  tasks:
    - name: Get master IP address dynamically
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
  
    - name: Calculate IP range from master IP subnet using shell
      shell: |
        MASTER_IP="{{ master_ip }}"
        SUBNET=$(echo "$MASTER_IP" | cut -d'.' -f1-3)
        echo "\${SUBNET}.240"
        echo "\${SUBNET}.250"
      register: ip_range_result
      changed_when: false
  
    - name: Extract IP range start and end
      set_fact:
        ip_range_start: "{{ ip_range_result.stdout_lines[0] }}"
        ip_range_end: "{{ ip_range_result.stdout_lines[1] }}"
  
    - name: Display calculated MetalLB IP range
      debug:
        msg:
          - "Master IP: {{ master_ip }}"
          - "Auto-detected MetalLB IP Pool: {{ ip_range_start }} - {{ ip_range_end }}"
          - "IP range auto-calculated from master node network"
          - "Installing MetalLB version {{ metallb_version }} using YAML manifests"
  
    - name: Check if MetalLB already exists
      command: kubectl get deployment controller -n {{ metallb_namespace }}
      register: metallb_check
      ignore_errors: true
      changed_when: false
  
    - name: Display current status
      debug:
        msg: >
          {% if metallb_check.rc == 0 %}
          MetalLB is already installed. Will update with new configuration.
          {% else %}
          MetalLB not found, will install new.
          {% endif %}
    
    - name: Download MetalLB manifest
      shell: |
        kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/{{ metallb_version }}/config/manifests/metallb-native.yaml
      register: apply_result
      changed_when: "'created' in apply_result.stdout or 'configured' in apply_result.stdout or 'unchanged' not in apply_result.stdout"
  
    - name: Display MetalLB installation result
      debug:
        msg: "{{ apply_result.stdout_lines | default(['MetalLB applied']) }}"
  
    - name: Wait for MetalLB controller pods to start
      shell: |
        kubectl get pods -n {{ metallb_namespace }} -l app.kubernetes.io/name=metallb,app.kubernetes.io/component=controller --no-headers | grep -c 'Running' || true
      register: metallb_running
      until: metallb_running.stdout | int > 0
      retries: 10
      delay: 10
      ignore_errors: true
  
    - name: Create MetalLB IPAddressPool manifest with auto-detected IP range
      copy:
        dest: /tmp/metallb-ip-pool.yaml
        content: |
          apiVersion: metallb.io/v1beta1
          kind: IPAddressPool
          metadata:
            name: default-address-pool
            namespace: {{ metallb_namespace }}
          spec:
            addresses:
              - {{ ip_range_start }}-{{ ip_range_end }}
  
    - name: Apply IPAddressPool manifest
      command: kubectl apply -f /tmp/metallb-ip-pool.yaml
      register: ip_pool_apply
      changed_when: "'created' in ip_pool_apply.stdout or 'configured' in ip_pool_apply.stdout"
  
    - name: Create L2Advertisement manifest
      copy:
        dest: /tmp/metallb-l2advertisement.yaml
        content: |
          apiVersion: metallb.io/v1beta1
          kind: L2Advertisement
          metadata:
            name: default-advertisement
            namespace: {{ metallb_namespace }}
          spec:
            ipAddressPools:
              - default-address-pool
  
    - name: Apply L2Advertisement manifest
      command: kubectl apply -f /tmp/metallb-l2advertisement.yaml
      register: l2_apply
      changed_when: "'created' in l2_apply.stdout or 'configured' in l2_apply.stdout"
  
    - name: Show MetalLB pods and IP configuration
      shell: |
        echo "=== MetalLB Pods ==="
        kubectl get pods -n {{ metallb_namespace }}
        echo ""
        echo "=== IPAddressPools ==="
        kubectl get ipaddresspools -n {{ metallb_namespace }}
      register: metallb_status
      changed_when: false
  
    - name: Display summary
      debug:
        msg:
          - "MetalLB installed successfully using YAML manifests!"
          - "Version: {{ metallb_version }}"
          - "Namespace: {{ metallb_namespace }}"
          - "Master IP: {{ master_ip }}"
          - "Auto-detected IP Pool: {{ ip_range_start }} - {{ ip_range_end }}"
          - "{{ metallb_status.stdout_lines }}"`,

		'13-setup-storage': `---
- name: Install NFS Server on Master Node
  hosts: master
  become: yes
  vars:
    nfs_dir: /srv/nfs/k8s
  
  tasks:
    - name: Install NFS server packages
      apt:
        name:
          - nfs-kernel-server
        state: present
        update_cache: yes
  
    - name: Create NFS export directory
      file:
        path: "{{ nfs_dir }}"
        state: directory
        owner: nobody
        group: nogroup
        mode: "0777"
  
    - name: Configure /etc/exports
      copy:
        dest: /etc/exports
        content: "{{ nfs_dir }} *(rw,sync,no_subtree_check,no_root_squash,no_all_squash)"
        mode: "0644"
  
    - name: Export NFS shares
      command: exportfs -rav
  
    - name: Restart NFS server
      systemd:
        name: nfs-kernel-server
        enabled: yes
        state: restarted

- name: Install NFS Utilities on All Nodes (Master + Workers)
  hosts: all
  become: yes
  tasks:
    - name: Install NFS client utils
      apt:
        name: nfs-common
        state: present
        update_cache: yes

- name: Deploy NFS Client Provisioner to Kubernetes
  hosts: master
  become: yes
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
  
  vars:
    nfs_server_ip: "{{ hostvars[groups['master'][0]].ansible_host }}"
    nfs_path: "/srv/nfs/k8s"
  
  tasks:
    - name: Create nfs-provisioner namespace
      command: kubectl create namespace nfs-provisioner --dry-run=client -o yaml | kubectl apply -f -
      register: ns_result
  
    - name: Create NFS Client Provisioner deployment
      copy:
        dest: /tmp/nfs-provisioner.yaml
        content: |
          apiVersion: v1
          kind: ServiceAccount
          metadata:
            name: nfs-client-provisioner
            namespace: nfs-provisioner
          ---
          kind: Deployment
          apiVersion: apps/v1
          metadata:
            name: nfs-client-provisioner
            namespace: nfs-provisioner
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: nfs-client-provisioner
            template:
              metadata:
                labels:
                  app: nfs-client-provisioner
              spec:
                serviceAccountName: nfs-client-provisioner
                containers:
                  - name: nfs-client-provisioner
                    image: registry.k8s.io/sig-storage/nfs-subdir-external-provisioner:v4.0.2
                    volumeMounts:
                      - name: nfs-client-root
                        mountPath: /persistentvolumes
                    env:
                      - name: PROVISIONER_NAME
                        value: nfs.storage.k8s.io
                      - name: NFS_SERVER
                        value: "{{ nfs_server_ip }}"
                      - name: NFS_PATH
                        value: "{{ nfs_path }}"
                volumes:
                  - name: nfs-client-root
                    nfs:
                      server: "{{ nfs_server_ip }}"
                      path: "{{ nfs_path }}"
          ---
          apiVersion: storage.k8s.io/v1
          kind: StorageClass
          metadata:
            name: nfs-storage
          provisioner: nfs.storage.k8s.io
          reclaimPolicy: Delete
          allowVolumeExpansion: true
          volumeBindingMode: Immediate
      register: deploy_file
  
    - name: Apply NFS Provisioner
      command: kubectl apply -f /tmp/nfs-provisioner.yaml
      register: deploy_apply
  
    - name: Show deploy result
      debug:
        var: deploy_apply.stdout_lines

- name: Verify Storage Setup
  hosts: master
  become: yes
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
  
  tasks:
    - name: Check StorageClass
      command: kubectl get storageclass
      register: sc_check
  
    - name: Display StorageClass
      debug:
        var: sc_check.stdout_lines
  
    - name: Test PVC creation
      command: |
        cat <<EOF | kubectl apply -f -
        apiVersion: v1
        kind: PersistentVolumeClaim
        metadata:
          name: test-pvc
        spec:
          storageClassName: nfs-storage
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 1Gi
        EOF
      register: pvc_test
  
    - name: Wait PVC bound
      shell: kubectl get pvc test-pvc --no-headers | awk '{print $2}'
      register: pvc_status
      retries: 10
      delay: 5
      until: pvc_status.stdout == "Bound"
  
    - name: Show PVC result
      debug:
        msg: "PVC test-pvc status: {{ pvc_status.stdout }}"`,

		'14-prepare-and-join-worker': `---
- name: Precheck not-ready workers
  hosts: master
  gather_facts: no
  tasks:
    - name: Check if kubectl is available
      command: which kubectl
      register: kubectl_check
      failed_when: false
      changed_when: false
  
    - name: Get existing node list
      command: kubectl get nodes --no-headers
      register: nodes_tbl
      changed_when: false
      failed_when: false
      when: kubectl_check.rc == 0
  
    - name: Ensure node_lines fact always exists
      set_fact:
        node_lines: "{{ nodes_tbl.stdout_lines | default([]) if (nodes_tbl is defined and nodes_tbl.stdout_lines is defined) else [] }}"
  
    - name: Parse node information safely
      set_fact:
        node_names: "{{ node_lines | map('split') | map('first') | list | default([]) }}"
        not_ready_names: "{{ node_lines | map('split') | selectattr('1','ne','Ready') | map('first') | list | default([]) }}"
  
    - name: Add unregistered or not-ready workers to target group
      add_host:
        name: "{{ item }}"
        groups: target_workers
      loop: "{{ groups['workers'] | default([]) }}"
      when: kubectl_check.rc != 0 or
          nodes_tbl is not defined or
          item not in (node_names | default([])) or
          item in (not_ready_names | default([]))
  
- name: Step 02 - Configure kernel and sysctl
  hosts: target_workers
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Disable swap
      shell: swapoff -a || true
      ignore_errors: true
  
    - name: Comment swap lines in /etc/fstab
      replace:
        path: /etc/fstab
        regexp: '(^.*swap.*$)'
        replace: '# \\1'
      ignore_errors: yes
  
    - name: Create modules-load file for containerd
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter
  
    - name: Activate overlay and br_netfilter modules
      shell: |
        modprobe overlay || true
        modprobe br_netfilter || true
  
    - name: Configure sysctl for Kubernetes
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1
  
    - name: Apply sysctl configuration
      command: sysctl --system
      ignore_errors: yes
  
- name: Step 03 - Install and configure containerd
  hosts: target_workers
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Update apt cache
      apt:
        update_cache: yes
  
    - name: Install containerd
      apt:
        name: containerd
        state: present
        force_apt_get: yes
  
    - name: Create containerd configuration directory
      file:
        path: /etc/containerd
        state: directory
  
    - name: Generate default containerd configuration
      shell: "containerd config default > /etc/containerd/config.toml"
  
    - name: Enable SystemdCgroup
      replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'
  
    - name: Restart containerd service
      systemd:
        name: containerd
        enabled: yes
        state: restarted
  
- name: Step 04 - Install Kubernetes (kubelet, kubeadm, kubectl)
  hosts: target_workers
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Add Kubernetes GPG key (if not present)
      shell: |
        if [ ! -f /usr/share/keyrings/kubernetes-archive-keyring.gpg ]; then
          curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
          gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
        fi
      changed_when: false
      ignore_errors: true
  
    - name: Add Kubernetes repository
      copy:
        dest: /etc/apt/sources.list.d/kubernetes.list
        content: |
          deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /
  
    - name: Install kubelet, kubeadm, kubectl
      apt:
        name:
          - kubelet
          - kubeadm
          - kubectl
        state: present
        update_cache: yes
  
    - name: Hold kubelet/kubeadm/kubectl versions
      command: apt-mark hold kubelet kubeadm kubectl
  
- name: Step 07 - Join worker to cluster
  hosts: target_workers
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  vars:
    join_script: /tmp/kube_join.sh
  tasks:
    - name: Test SSH connectivity to worker
      ping:
      register: ping_result
      ignore_errors: yes
  
    - name: Mark worker online status
      set_fact:
        worker_online: "{{ ping_result is succeeded }}"
  
    - name: Get join command from master
      delegate_to: "{{ groups['master'][0] }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd
      when: worker_online
  
    - name: Save join command to file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'
      when: worker_online
      ignore_errors: yes
  
    - name: Reset old node (if exists)
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes
      when: worker_online
  
    - name: Execute join command
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: yes
      when: worker_online
  
    - name: Restart kubelet service
      systemd:
        name: kubelet
        state: restarted
        enabled: yes
      ignore_errors: yes
      when: worker_online
  
    - name: Display join result summary
      debug:
        msg: "{{ 'Node ' + inventory_hostname + ' has successfully joined the cluster!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Skipping join' }}"`,



		'08-verify-cluster': `---
- name: Verify Kubernetes cluster status
  hosts: master
  become: yes
  gather_facts: no
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  
  tasks:
    - name: Check if kubectl is available
      command: which kubectl
      register: kubectl_check
      failed_when: kubectl_check.rc != 0
      changed_when: false
  
    - name: List all nodes
      command: kubectl get nodes
      register: nodes_info
      changed_when: false
  
    - name: List system pods
      command: kubectl get pods -n kube-system
      register: pods_info
      changed_when: false
  
    - name: Display cluster information
      debug:
        msg:
          - "Node List:"
          - "{{ nodes_info.stdout_lines }}"
          - "Pods in kube-system namespace:"
          - "{{ pods_info.stdout_lines }}"
  
    - name: Check node status
      shell: kubectl get nodes --no-headers | awk '{print $2}' | sort | uniq -c
      register: node_status
      changed_when: false
  
    - name: Report node status
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          Some nodes are not ready:
          {{ node_status.stdout }}
          {% else %}
          All nodes are Ready!
          {% endif %}
  
    - name: Check for error pods in kube-system
      shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
      register: bad_pods
      changed_when: false
  
    - name: Report error pods
      debug:
        msg: |
          {% if bad_pods.stdout %}
          Some pods are unstable or have errors:
          {{ bad_pods.stdout }}
          {% else %}
          All pods in kube-system are Running or Completed!
          {% endif %}
  
    - name: Display error pod logs (if any)
      when: bad_pods.stdout != ""
      shell: |
        for pod in $(kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' | awk '{print $1}'); do
          echo "Log for $pod:"; kubectl logs -n kube-system $pod --tail=30 || true; echo "--------------------------------";
        done
      register: bad_pods_logs
      ignore_errors: yes
  
    - name: Display detailed logs
      when: bad_pods.stdout != ""
      debug:
        msg: "{{ bad_pods_logs.stdout_lines | default(['No error logs found']) }}"`,

		'00-reset-cluster': `---
- name: Reset entire Kubernetes cluster
  hosts: all
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Reset Kubernetes cluster
      shell: kubeadm reset -f
      ignore_errors: true
      register: reset_output
  
    - name: Display reset results
      debug:
        msg: "{{ reset_output.stdout_lines | default(['No old cluster to reset.']) }}"
  
    - name: Remove Kubernetes configuration directory
      file:
        path: /etc/kubernetes
        state: absent
  
    - name: Remove CNI network configuration
      file:
        path: /etc/cni/net.d
        state: absent
  
    - name: Remove root kubeconfig
      file:
        path: /root/.kube
        state: absent
  
    - name: Remove normal user kubeconfig
      file:
        path: "/home/{{ ansible_user }}/.kube"
        state: absent
      when: ansible_user != "root"
  
    - name: Clean up iptables rules
      shell: |
        iptables -F && iptables -X
        iptables -t nat -F && iptables -t nat -X
        iptables -t mangle -F && iptables -t mangle -X
        iptables -P FORWARD ACCEPT
      ignore_errors: true
  
    - name: Restart containerd service
      systemd:
        name: containerd
        state: restarted
        enabled: yes
  
    - name: Confirm reset completed
      debug:
        msg:
          - "Node {{ inventory_hostname }} has been reset cleanly (data only deleted)."`,

		'deploy-full-cluster': `---
- import_playbook: 00-reset-cluster.yml
- import_playbook: 01-update-hosts-hostname.yml
- import_playbook: 02-kernel-sysctl.yml
- import_playbook: 03-install-containerd.yml
- import_playbook: 04-install-kubernetes.yml
- import_playbook: 05-init-master.yml
- import_playbook: 06-install-cni.yml
- import_playbook: 07-join-workers.yml
- import_playbook: 08-verify-cluster.yml`,

		'deploy-full-cluster-flannel': `---
- import_playbook: 00-reset-cluster.yml
- import_playbook: 01-update-hosts-hostname.yml
- import_playbook: 02-kernel-sysctl.yml
- import_playbook: 03-install-containerd.yml
- import_playbook: 04-install-kubernetes.yml
- import_playbook: 05-init-master.yml
- import_playbook: 06-install-flannel.yml
- import_playbook: 07-join-workers.yml
- import_playbook: 08-verify-cluster.yml`
	};

	// Upload tất cả template playbook lên máy Ansible
	window.uploadAllTemplates = async function() {
		try {
			// Lấy danh sách template cần upload (chỉ các template từ 00-08 và deploy-full-cluster)
			const templateKeys = [
				'00-reset-cluster',
				'01-update-hosts-hostname',
				'02-kernel-sysctl',
				'03-install-containerd',
				'04-install-kubernetes',
				'05-init-master',
				'06-install-cni',
				'06-install-flannel',
				'07-join-workers',
				'08-verify-cluster',
				'deploy-full-cluster',
				'deploy-full-cluster-flannel'
			];

			// Tạo Map<filename, content>
			const templatesMap = {};
			for (const key of templateKeys) {
				if (templates[key]) {
					const filename = key + '.yml';
					templatesMap[filename] = templates[key];
				}
			}

			if (Object.keys(templatesMap).length === 0) {
				throw new Error('Không có template nào để upload');
			}

			// Gọi API upload templates
			const response = await fetch('/api/ansible-playbook/upload-templates', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(templatesMap)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Lỗi upload templates');
			}

			const result = await response.json();
			return result;
		} catch (error) {
			console.error('Error uploading templates:', error);
			throw error;
		}
	};

	// Map template value (without numbers) to template key (with numbers)
	const templateMapping = {
		'update-hosts-hostname': '01-update-hosts-hostname',
		'kernel-sysctl': '02-kernel-sysctl',
		'install-containerd': '03-install-containerd',
		'install-kubernetes': '04-install-kubernetes',
		'init-master': '05-init-master',
		'install-cni': '06-install-cni',
		'install-flannel': '06-install-flannel',
		'join-workers': '07-join-workers',
		'verify-cluster': '08-verify-cluster',
		'install-helm': '09-install-helm',
		'install-metrics-server': '10-install-metrics-server',
		'install-ingress': '11-install-ingress',
		'install-metallb': '12-install-metallb',
		'setup-storage': '13-setup-storage',
		'prepare-and-join-worker': '14-prepare-and-join-worker',
		'reset-cluster': '00-reset-cluster',
		'deploy-full-cluster': 'deploy-full-cluster',
		'deploy-full-cluster-flannel': 'deploy-full-cluster-flannel'
	};

	// Get the actual template key
	const actualTemplate = templateMapping[template] || template;

	const playbookContent = templates[actualTemplate];
	if (!playbookContent) {
		throw new Error('Template không tồn tại');
	}

	const filename = actualTemplate + '.yml';

	// Check if playbook already exists
	const exists = await checkPlaybookExists(filename);
	console.log(`Checking if ${filename} exists:`, exists);

	if (exists) {
		const templateNames = {
			'00-reset-cluster': 'Reset toàn bộ cluster',
			'01-update-hosts-hostname': 'Cập nhật hosts & hostname',
			'02-kernel-sysctl': 'Cấu hình kernel & sysctl',
			'03-install-containerd': 'Cài đặt Containerd',
			'04-install-kubernetes': 'Cài đặt Kubernetes',
			'05-init-master': 'Khởi tạo Master',
			'06-install-cni': 'Cài CNI (Calico)',
			'06-install-flannel': 'Cài CNI (Flannel)',
			'07-join-workers': 'Join Workers',
			'08-verify-cluster': 'Xác minh trạng thái cụm',
			'09-install-helm': 'Cài Helm',
			'10-install-metrics-server': 'Cài đặt Metrics Server',
			'11-install-ingress': 'Cài Ingress Controller',
			'12-install-metallb': 'Cài MetalLB LoadBalancer',
			'13-setup-storage': 'Setup Storage',
			'14-prepare-and-join-worker': 'Chuẩn bị & Join Worker (02→03→04→07)',
			'deploy-full-cluster': 'Triển khai toàn bộ cluster (00→08)',
			'deploy-full-cluster-flannel': 'Triển khai toàn bộ cluster với Flannel (00→08)'
		};

		const templateName = templateNames[actualTemplate] || actualTemplate;
		const confirmMessage = `Playbook "${filename}" (${templateName}) đã tồn tại. Bạn có muốn ghi đè lên file cũ?`;

		console.log('Showing confirm dialog for:', confirmMessage);

		if (!confirm(confirmMessage)) {
			console.log('User cancelled overwrite');
			throw new Error('Đã hủy tạo playbook từ template');
		}

		console.log('User confirmed overwrite');
	}

	// Thay thế cluster_id trong nội dung playbook nếu có
	let finalPlaybookContent = playbookContent;
	if (getClusterId() && playbookContent.includes('{{ cluster_id | default(1) }}')) {
		finalPlaybookContent = playbookContent.replace('{{ cluster_id | default(1) }}', getClusterId());
	}

	try {
		const result = await fetch(`/api/ansible-playbook/save`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: `filename=${encodeURIComponent(filename)}&content=${encodeURIComponent(finalPlaybookContent)}`
		});

		if (!result.ok) {
			const errorData = await result.json();
			throw new Error(errorData.error || 'Lỗi tạo playbook');
		}

		return await result.json();
	} catch (error) {
		console.error('Lỗi tạo playbook K8s:', error);
		throw error;
	}
};

// Hiển thị nội dung playbook
window.showPlaybookContentView = function () {
	const contentArea = document.getElementById('playbook-content-area');
	const executionArea = document.getElementById('playbook-execution-status');

	if (contentArea) {
		contentArea.style.display = 'block';
		contentArea.classList.remove('d-none');
	}
	if (executionArea) {
		executionArea.style.display = 'none';
		executionArea.classList.add('d-none');
	}
};

// Hiển thị thực thi playbook
window.showPlaybookExecutionView = function () {
	const contentArea = document.getElementById('playbook-content-area');
	const executionArea = document.getElementById('playbook-execution-status');

	if (contentArea) {
		contentArea.style.display = 'none';
		contentArea.classList.add('d-none');
	}
	if (executionArea) {
		executionArea.style.display = 'block';
		executionArea.classList.remove('d-none');
	}
};

// Tìm kiếm playbook
window.searchPlaybooks = function (query) {
	const listItems = document.querySelectorAll('#playbook-list .list-group-item');
	const searchTerm = query.toLowerCase().trim();

	if (!searchTerm) {
		// Hiển thị tất cả nếu không có từ khóa tìm kiếm
		listItems.forEach(item => {
			item.style.display = 'flex';
		});
		return;
	}

	listItems.forEach(listItem => {
		const playbookItem = listItem.querySelector('.playbook-item');
		if (playbookItem) {
			const playbookName = playbookItem.textContent.toLowerCase();
			const shouldShow = playbookName.includes(searchTerm);
			listItem.style.display = shouldShow ? 'flex' : 'none';
		} else {
			// Nếu không có playbook-item (ví dụ: "Chưa có playbook nào"), ẩn nó khi tìm kiếm
			listItem.style.display = 'none';
		}
	});
};

// Cập nhật danh sách playbook
window.refreshPlaybooks = async function () {
	const refreshBtn = document.getElementById('refresh-playbooks-btn');
	if (refreshBtn) {
		refreshBtn.disabled = true;
		refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Đang tải...';
	}

	try {
		await loadPlaybooks();
	} catch (error) {
		console.error('Error refreshing playbooks:', error);
		showAlert('error', 'Lỗi làm mới danh sách playbook');
	} finally {
		if (refreshBtn) {
			refreshBtn.disabled = false;
			refreshBtn.innerHTML = 'Làm mới';
		}
	}
};

// Đặt ID cluster hiện tại
window.setCurrentClusterId = function (clusterId) {
	window.currentClusterId = clusterId;
};

// Export loadPlaybooks để có thể gọi từ k8sClusters.js
window.loadPlaybooks = loadPlaybooks;

// Bind các nút trong Playbook Manager Modal
window.bindPlaybookManagerButtons = function () {
	// Create playbook button
	const createBtn = document.getElementById('create-playbook-btn');
	if (createBtn && !createBtn.dataset.bound) {
		createBtn.dataset.bound = '1';
		createBtn.addEventListener('click', () => {
			// Hiển thị khu vực nội dung và ẩn khu vực thực thi khi tạo mới
			if (window.showPlaybookContentView) {
				window.showPlaybookContentView();
			}
			const editor = document.getElementById('playbook-editor');
			if (editor) {
				editor.value = '---\n- name: New playbook\n  hosts: all\n  tasks:\n    - debug:\n        msg: "hello"\n';
			}
			const filenameInput = document.getElementById('playbook-filename');
			if (filenameInput) {
				filenameInput.value = '';
				filenameInput.focus();
			}
			// Ẩn delete và execute buttons khi tạo mới
			const deleteBtn = document.getElementById('delete-playbook-btn');
			const executeBtn = document.getElementById('execute-playbook-btn');
			if (deleteBtn) deleteBtn.classList.add('d-none');
			if (executeBtn) executeBtn.classList.add('d-none');
		});
	}

	// Generate from template button
	const generateBtn = document.getElementById('generate-from-template-btn');
	if (generateBtn && !generateBtn.dataset.bound) {
		generateBtn.dataset.bound = '1';
		generateBtn.addEventListener('click', async () => {
			const templateSelect = document.getElementById('playbook-template-select');
			const filenameInput = document.getElementById('playbook-filename');
			const editor = document.getElementById('playbook-editor');

			if (!templateSelect || !filenameInput || !editor) {
				if (window.showAlert) {
					window.showAlert('error', 'Không tìm thấy các phần tử cần thiết');
				}
				return;
			}

			const template = templateSelect.value;
			if (!template) {
				if (window.showAlert) {
					window.showAlert('warning', 'Vui lòng chọn template');
				}
				return;
			}

			try {
				if (window.generateK8sPlaybookFromTemplate) {
					generateBtn.disabled = true;
					generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang tạo...';

					const result = await window.generateK8sPlaybookFromTemplate(template);

					if (result && result.filename) {
						// Load playbook từ server để có đầy đủ nội dung
						if (window.loadPlaybook) {
							await window.loadPlaybook(result.filename);
						}

						if (window.showAlert) {
							window.showAlert('success', 'Đã tạo playbook từ template');
						}

						// Hiển thị content view
						if (window.showPlaybookContentView) {
							window.showPlaybookContentView();
						}

						// Refresh playbook list
						if (window.loadPlaybooks) {
							await window.loadPlaybooks();
						}
					} else {
						if (window.showAlert) {
							window.showAlert('error', 'Không thể tạo playbook từ template');
						}
					}
				} else {
					if (window.showAlert) {
						window.showAlert('error', 'Function generateK8sPlaybookFromTemplate không khả dụng');
					}
				}
			} catch (error) {
				console.error('Error generating playbook from template:', error);
				if (error.message && error.message.includes('Đã hủy')) {
					// User cancelled - don't show error
					return;
				}
				if (window.showAlert) {
					window.showAlert('error', 'Lỗi tạo playbook từ template: ' + (error.message || 'Lỗi không xác định'));
				}
			} finally {
				generateBtn.disabled = false;
				generateBtn.innerHTML = '<i class="bi bi-magic"></i> Tạo từ template';
			}
		});
	}

	// Upload playbook input
	const uploadInput = document.getElementById('upload-playbook-input');
	if (uploadInput && !uploadInput.dataset.bound) {
		uploadInput.dataset.bound = '1';
		uploadInput.addEventListener('change', async (event) => {
			const file = event.target.files[0];
			if (!file) return;

			try {
				if (window.uploadPlaybook) {
					// Load content into editor
					const text = await file.text();
					const editor = document.getElementById('playbook-editor');
					const filenameInput = document.getElementById('playbook-filename');

					if (editor) editor.value = text;
					if (filenameInput) {
						filenameInput.value = file.name.replace(/\.(yml|yaml)$/i, '');
					}

					// Upload to server
					await window.uploadPlaybook(file);

					// Hiển thị delete và execute buttons
					const deleteBtn = document.getElementById('delete-playbook-btn');
					const executeBtn = document.getElementById('execute-playbook-btn');
					if (deleteBtn) deleteBtn.classList.remove('d-none');
					if (executeBtn) executeBtn.classList.remove('d-none');

					// Reset input
					event.target.value = '';
				} else {
					if (window.showAlert) {
						window.showAlert('error', 'Function uploadPlaybook không khả dụng');
					}
				}
			} catch (error) {
				console.error('Error uploading playbook:', error);
				if (window.showAlert) {
					window.showAlert('error', 'Lỗi tải lên playbook: ' + (error.message || 'Lỗi không xác định'));
				}
			}
		});
	}

	// Refresh playbooks button
	const refreshBtn = document.getElementById('refresh-playbooks-btn');
	if (refreshBtn && !refreshBtn.dataset.bound) {
		refreshBtn.dataset.bound = '1';
		refreshBtn.addEventListener('click', async () => {
			if (window.refreshPlaybooks) {
				await window.refreshPlaybooks();
			} else if (window.loadPlaybooks) {
				await window.loadPlaybooks();
			} else {
				if (window.showAlert) {
					window.showAlert('error', 'Function refreshPlaybooks không khả dụng');
				}
			}
		});
	}

	// Search playbook input
	const searchInput = document.getElementById('search-playbook-input');
	if (searchInput && !searchInput.dataset.bound) {
		searchInput.dataset.bound = '1';
		searchInput.addEventListener('input', (e) => {
			if (window.searchPlaybooks) {
				window.searchPlaybooks(e.target.value);
			}
		});
	}

	// Save playbook button
	const saveBtn = document.getElementById('save-playbook-btn');
	if (saveBtn && !saveBtn.dataset.bound) {
		saveBtn.dataset.bound = '1';
		saveBtn.addEventListener('click', async () => {
			if (window.savePlaybook) {
				saveBtn.disabled = true;
				saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang lưu...';
				try {
					await window.savePlaybook();
				} finally {
					saveBtn.disabled = false;
					saveBtn.innerHTML = '<i class="bi bi-save"></i> Lưu';
				}
			} else {
				if (window.showAlert) {
					window.showAlert('error', 'Function savePlaybook không khả dụng');
				}
			}
		});
	}

	// Execute playbook button
	const executeBtn = document.getElementById('execute-playbook-btn');
	if (executeBtn && !executeBtn.dataset.bound) {
		executeBtn.dataset.bound = '1';
		executeBtn.addEventListener('click', async () => {
			const filenameInput = document.getElementById('playbook-filename');
			if (!filenameInput || !filenameInput.value) {
				if (window.showAlert) {
					window.showAlert('warning', 'Vui lòng chọn hoặc tạo playbook trước khi thực thi');
				}
				return;
			}

			const filename = filenameInput.value.trim();
			if (!filename) {
				if (window.showAlert) {
					window.showAlert('warning', 'Vui lòng nhập tên file playbook');
				}
				return;
			}

			if (window.executePlaybook) {
				executeBtn.disabled = true;
				executeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang thực thi...';
				try {
					await window.executePlaybook(filename + '.yml');
				} finally {
					executeBtn.disabled = false;
					executeBtn.innerHTML = '<i class="bi bi-play-circle"></i> Thực thi';
				}
			} else {
				if (window.showAlert) {
					window.showAlert('error', 'Function executePlaybook không khả dụng');
				}
			}
		});
	}

	// Delete playbook button
	const deleteBtn = document.getElementById('delete-playbook-btn');
	if (deleteBtn && !deleteBtn.dataset.bound) {
		deleteBtn.dataset.bound = '1';
		deleteBtn.addEventListener('click', async () => {
			const filenameInput = document.getElementById('playbook-filename');
			if (!filenameInput || !filenameInput.value) {
				if (window.showAlert) {
					window.showAlert('warning', 'Vui lòng chọn playbook để xóa');
				}
				return;
			}

			const filename = filenameInput.value.trim();
			if (!filename) {
				if (window.showAlert) {
					window.showAlert('warning', 'Vui lòng nhập tên file playbook');
				}
				return;
			}

			if (window.deletePlaybook) {
				await window.deletePlaybook(filename + '.yml');
				// Clear editor after delete
				const editor = document.getElementById('playbook-editor');
				const filenameInputEl = document.getElementById('playbook-filename');
				if (editor) editor.value = '';
				if (filenameInputEl) filenameInputEl.value = '';
				// Hide delete and execute buttons
				deleteBtn.classList.add('d-none');
				if (executeBtn) executeBtn.classList.add('d-none');
			} else {
				if (window.showAlert) {
					window.showAlert('error', 'Function deletePlaybook không khả dụng');
				}
			}
		});
	}
};

// Reset giao diện Playbook Manager khi rời khỏi trang chi tiết cluster
window.resetPlaybookUI = function () {
	try {
		const list = document.getElementById('playbook-list');
		if (list) list.innerHTML = '';
		const fn = document.getElementById('playbook-filename');
		if (fn) fn.value = '';
		const ed = document.getElementById('playbook-editor');
		if (ed) ed.value = '';
		const contentArea = document.getElementById('playbook-content-area');
		const execArea = document.getElementById('playbook-execution-status');
		if (contentArea) {
			contentArea.style.display = 'none';
			contentArea.classList.add('d-none');
		}
		if (execArea) {
			execArea.style.display = 'none';
			execArea.classList.add('d-none');
		}
		const output = document.getElementById('ansible-output');
		if (output) output.textContent = '';
		const alertBox = document.getElementById('playbook-alert');
		if (alertBox) alertBox.innerHTML = '';
		const search = document.getElementById('playbook-search');
		if (search) search.value = '';
	} catch (_) { }
}
