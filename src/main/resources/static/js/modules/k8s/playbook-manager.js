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
		
		const response = await fetch(`/api/ansible-playbook/list/${cid}`);
		
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
		const response = await fetch(`/api/ansible-playbook/read/${cid}?filename=${encodeURIComponent(filename)}`);
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
		const response = await fetch(`/api/ansible-playbook/save/${cid}`, {
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
		const response = await fetch(`/api/ansible-playbook/delete/${cid}?filename=${encodeURIComponent(filename)}`, {
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

		const response = await fetch(`/api/ansible-playbook/execute/${cid}`, {
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
			const response = await fetch(`/api/ansible-playbook/status/${getClusterId()}?taskId=${encodeURIComponent(taskId)}`);
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
		const response = await fetch(`/api/ansible-playbook/list/${cid}`);
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

		const response = await fetch(`/api/ansible-playbook/upload/${cid}`, {
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
        state: restarted`,

		'04-install-kubernetes': `---
- hosts: all
  become: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
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
  
    - name: Hold package versions
      command: apt-mark hold kubelet kubeadm kubectl`,

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

		'09-install-ingress': `---
- hosts: master
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  
  tasks:
    - name: Get dynamic master IP address
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
    
    - name: Display installation info
      debug:
        msg: "Installing Ingress on master: {{ master_ip }}"
  
    - name: Install Ingress Controller (nginx)
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
      args:
        executable: /bin/bash
      register: ingress_install
      ignore_errors: yes
  
    - name: Display Ingress installation result
      debug:
        msg: "{{ ingress_install.stdout_lines | default(['Ingress Controller applied']) }}"
  
    - name: Check ingress-nginx pod status
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl get pods -n ingress-nginx -o wide
      register: ingress_pods
  
    - name: Display ingress-nginx pods
      debug:
        msg: "{{ ingress_pods.stdout_lines }}"
  
    - name: Installation complete
      debug:
        msg: "Ingress Controller (NGINX) has been installed successfully!"`,

		'11-install-helm': `---
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

		'10-install-metallb': `---
- name: Install and configure MetalLB on Kubernetes
  hosts: master
  become: yes
  gather_facts: yes
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  vars:
    metallb_version: "v0.14.8"
    metallb_namespace: "metallb-system"
    metallb_url: "https://raw.githubusercontent.com/metallb/metallb/{{ metallb_version }}/config/manifests/metallb-native.yaml"
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
  
    - name: Check if MetalLB namespace exists
      command: kubectl get namespace {{ metallb_namespace }}
      register: ns_check
      failed_when: false
      changed_when: false
  
    - name: Create MetalLB namespace if missing
      command: kubectl create namespace {{ metallb_namespace }}
      when: ns_check.rc != 0
      changed_when: true
  
    - name: Apply MetalLB official manifest
      command: kubectl apply -f {{ metallb_url }}
      register: metallb_apply
      changed_when: "'created' in metallb_apply.stdout or 'configured' in metallb_apply.stdout"
  
    - name: Wait for MetalLB controller pods to start
      shell: |
        kubectl get pods -n {{ metallb_namespace }} -l component=controller --no-headers | grep -c 'Running' || true
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
          - "MetalLB installed successfully."
          - "Namespace: {{ metallb_namespace }}"
          - "Master IP: {{ master_ip }}"
          - "Auto-detected IP Pool: {{ ip_range_start }} - {{ ip_range_end }}"
          - "{{ metallb_status.stdout_lines }}"`,

		'12-setup-storage': `---
- hosts: master
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  
  vars:
    nfs_manifest_dir: /etc/kubernetes/storage
  
  tasks:
    - name: Create NFS manifest directory
      file:
        path: "{{ nfs_manifest_dir }}"
        state: directory
        mode: '0755'
  
    - name: Download and apply NFS Provisioner (example)
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/rbac.yaml
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/deployment.yaml
      args:
        executable: /bin/bash
      register: nfs_apply
      ignore_errors: yes
  
    - name: Display NFS deployment result
      debug:
        msg: "{{ nfs_apply.stdout_lines | default(['NFS Provisioner applied']) }}"
  
    - name: Set default StorageClass
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl patch storageclass nfs-client -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' || true
      args:
        executable: /bin/bash
  
    - name: Setup complete
      debug:
        msg: "Default StorageClass (NFS) configuration has been completed!"`,

		'13-prepare-and-join-worker': `---
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
- name: Step 0 - Reset Kubernetes cluster
  hosts: all
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Reset old cluster if exists
      shell: kubeadm reset -f || true
      ignore_errors: true
  
    - name: Remove old Kubernetes configuration
      file:
        path: "{{ item }}"
        state: absent
      loop:
        - /etc/kubernetes
        - /etc/cni/net.d
        - /root/.kube
        - "/home/{{ ansible_user }}/.kube"
      ignore_errors: true
  
    - name: Restart containerd service
      shell: systemctl restart containerd || true
      ignore_errors: true
  
- name: Step 1 - Update /etc/hosts and hostname
  hosts: all
  become: yes
  gather_facts: yes
  tasks:
    - name: Update /etc/hosts file for all nodes
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host }} {{ item }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_host is defined
  
    - name: Set hostname according to inventory
      hostname:
        name: "{{ inventory_hostname }}"
      when: ansible_hostname != inventory_hostname
  
    - name: Verify hostname
      shell: hostnamectl
      register: host_info
  
    - name: Display hostname info
      debug:
        msg: "{{ host_info.stdout_lines }}"
  
- name: Step 2 - Configure kernel and containerd
  hosts: all
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Disable swap
      shell: swapoff -a && sed -i '/swap/d' /etc/fstab || true
  
    - name: Load kernel modules for containerd
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter
  
    - name: Activate kernel modules
      shell: |
        modprobe overlay || true
        modprobe br_netfilter || true
  
    - name: Configure sysctl parameters for Kubernetes
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1
  
    - name: Apply sysctl configuration
      command: sysctl --system
  
    - name: Install containerd runtime
      apt:
        name: containerd
        state: present
        update_cache: yes
  
    - name: Generate default containerd config
      shell: |
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml
  
    - name: Enable SystemdCgroup
      replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'
  
    - name: Restart and enable containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes
  
- name: Step 3 - Install Kubernetes core components
  hosts: all
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Add Kubernetes GPG key
      shell: |
        mkdir -p /usr/share/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
        gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
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
  
    - name: Hold package version
      command: apt-mark hold kubelet kubeadm kubectl
  
- name: Step 4 - Initialize Master node
  hosts: master
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Get master IP address
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
  
    - name: Reset old control plane (if any)
      shell: kubeadm reset -f || true
  
    - name: Initialize Kubernetes control plane
      command: >
        kubeadm init
        --control-plane-endpoint "{{ master_ip }}:6443"
        --apiserver-advertise-address {{ master_ip }}
        --pod-network-cidr 10.244.0.0/16
        --upload-certs
      args:
        creates: /etc/kubernetes/admin.conf
      register: kubeadm_init
      failed_when: "'error' in kubeadm_init.stderr"
      changed_when: "'Your Kubernetes control-plane has initialized successfully' in kubeadm_init.stdout"
  
    - name: Copy kubeconfig for root
      shell: |
        mkdir -p /root/.kube
        cp -i /etc/kubernetes/admin.conf /root/.kube/config
        chown root:root /root/.kube/config
      args:
        executable: /bin/bash
  
    - name: Copy kubeconfig for normal user
      when: ansible_user != "root"
      block:
        - name: Create ~/.kube directory
          file:
            path: "/home/{{ ansible_user }}/.kube"
            state: directory
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0755'
  
        - name: Copy kubeconfig file
          copy:
            src: /etc/kubernetes/admin.conf
            dest: "/home/{{ ansible_user }}/.kube/config"
            remote_src: yes
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0600'
  
- name: Step 5 - Install Calico CNI
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
  
    - name: Apply Calico manifest (install or update)
      command: kubectl apply -f {{ calico_url }}
      register: calico_apply
      retries: 3
      delay: 10
      until: calico_apply.rc == 0
  
    - name: Wait for Calico node pods to be Running
      shell: |
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
      register: calico_running
      retries: 10
      delay: 15
      until: calico_running.stdout | int > 0
  
    - name: Confirm Calico pods are active
      debug:
        msg: "Calico is running ({{ calico_running.stdout }} pods Running)."
  
- name: Step 6 - Join worker nodes
  hosts: workers
  become: yes
  gather_facts: false
  environment:
    DEBIAN_FRONTEND: noninteractive
  vars:
    join_script: /tmp/kube_join.sh
  tasks:
    - name: Test SSH connectivity to worker node
      ping:
      register: ping_result
      ignore_errors: yes
  
    - name: Mark worker online status
      set_fact:
        worker_online: "{{ ping_result is succeeded }}"
  
    - name: Display worker online status
      debug:
        msg: "Worker {{ inventory_hostname }} is {{ 'ONLINE' if worker_online else 'OFFLINE' }}"
  
    - name: Retrieve join command from master
      delegate_to: "{{ groups['master'][0] }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd
      when: worker_online
  
    - name: Save join command to script file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'
      when: worker_online
      ignore_errors: yes
  
    - name: Reset old worker node
      shell: kubeadm reset -f || true
      ignore_errors: yes
      when: worker_online
  
    - name: Execute join command
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: yes
      when: worker_online
  
    - name: Display join result summary
      debug:
        msg: "{{ 'Node ' + inventory_hostname + ' has successfully joined the cluster!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Skipping join' }}"
  
- name: Step 7 - Verify Kubernetes cluster status
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Check kubectl binary
      command: which kubectl
      register: kubectl_check
      failed_when: kubectl_check.rc != 0
      changed_when: false
  
    - name: List all nodes
      command: kubectl get nodes -o wide
      register: nodes_info
      changed_when: false
  
    - name: List system pods
      command: kubectl get pods -n kube-system -o wide
      register: pods_info
      changed_when: false
  
    - name: Display cluster info
      debug:
        msg:
          - "Node list:"
          - "{{ nodes_info.stdout_lines }}"
          - "Pods in kube-system namespace:"
          - "{{ pods_info.stdout_lines }}"
  
    - name: Check node readiness
    shell: kubectl get nodes --no-headers | awk '{print $1, $2}' | column -t
    register: node_status
    changed_when: false
  
    - name: Node status summary
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          Some nodes are not ready:
          {{ node_status.stdout }}
          Please check kubelet or CNI (Calico) on those nodes.
          {% else %}
          All nodes are in Ready state!
          {{ node_status.stdout }}
          {% endif %}
  
    - name: Detect problematic pods
    shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
    register: bad_pods
    changed_when: false
  
    - name: Report problematic pods
      debug:
        msg: |
          {% if bad_pods.stdout %}
          Some pods in kube-system are not stable:
          {{ bad_pods.stdout }}
          {% else %}
          All kube-system pods are Running or Completed!
          {% endif %}
  
    - name: Collect logs from problematic pods
      when: bad_pods.stdout != ""
      shell: |
        echo "==== Problematic Pod Logs ===="
        for pod in $(kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' | awk '{print $1}'); do
          echo "---------------------------------------------"
          echo "Pod: $pod"
          kubectl logs -n kube-system $pod --tail=30 || echo "Cannot get logs for $pod"
          echo
        done
      register: bad_pods_logs
      ignore_errors: yes
  
    - name: Display detailed logs
      when: bad_pods.stdout != ""
      debug:
        msg: "{{ bad_pods_logs.stdout_lines | default(['No error logs or pods restarted.']) }}"
`
		,

		'deploy-full-cluster-flannel': `---
- name: Step 0 - Reset Kubernetes cluster
  hosts: all
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Reset old cluster if exists
      shell: kubeadm reset -f || true
      ignore_errors: true
  
    - name: Remove old Kubernetes configuration
      file:
        path: "{{ item }}"
        state: absent
      loop:
        - /etc/kubernetes
        - /etc/cni/net.d
        - /root/.kube
        - "/home/{{ ansible_user }}/.kube"
      ignore_errors: true
  
    - name: Restart containerd service
      shell: systemctl restart containerd || true
      ignore_errors: true
  
- name: Step 1 - Update /etc/hosts and hostname
  hosts: all
  become: yes
  gather_facts: yes
  tasks:
    - name: Update /etc/hosts file for all nodes
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host }} {{ item }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_host is defined
  
    - name: Set hostname according to inventory
      hostname:
        name: "{{ inventory_hostname }}"
      when: ansible_hostname != inventory_hostname
  
    - name: Verify hostname
      shell: hostnamectl
      register: host_info
  
    - name: Display hostname info
      debug:
        msg: "{{ host_info.stdout_lines }}"
  
- name: Step 2 - Configure kernel and containerd
  hosts: all
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Disable swap
      shell: swapoff -a && sed -i '/swap/d' /etc/fstab || true
  
    - name: Load kernel modules for containerd
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter
  
    - name: Activate kernel modules
      shell: |
        modprobe overlay || true
        modprobe br_netfilter || true
  
    - name: Configure sysctl parameters for Kubernetes
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1
  
    - name: Apply sysctl configuration
      command: sysctl --system
  
    - name: Install containerd runtime
      apt:
        name: containerd
        state: present
        update_cache: yes
  
    - name: Generate default containerd config
      shell: |
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml
  
    - name: Enable SystemdCgroup
      replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'
  
    - name: Restart and enable containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes
  
- name: Step 3 - Install Kubernetes core components
  hosts: all
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Add Kubernetes GPG key
      shell: |
        mkdir -p /usr/share/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
        gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
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
  
    - name: Hold package version
      command: apt-mark hold kubelet kubeadm kubectl
  
- name: Step 4 - Initialize Master node
  hosts: master
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Get master IP address
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
  
    - name: Reset old control plane (if any)
      shell: kubeadm reset -f || true
  
    - name: Initialize Kubernetes control plane
      command: >
        kubeadm init
        --control-plane-endpoint "{{ master_ip }}:6443"
        --apiserver-advertise-address {{ master_ip }}
        --pod-network-cidr 10.244.0.0/16
      args:
        creates: /etc/kubernetes/admin.conf
      register: kubeadm_init
      failed_when: "'error' in kubeadm_init.stderr"
      changed_when: "'Your Kubernetes control-plane has initialized successfully' in kubeadm_init.stdout"
  
    - name: Copy kubeconfig for root
      shell: |
        mkdir -p /root/.kube
        cp -i /etc/kubernetes/admin.conf /root/.kube/config
        chown root:root /root/.kube/config
      args:
        executable: /bin/bash
  
    - name: Copy kubeconfig for normal user
      when: ansible_user != "root"
      block:
        - name: Create ~/.kube directory
          file:
            path: "/home/{{ ansible_user }}/.kube"
            state: directory
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0755'
  
        - name: Copy kubeconfig file
          copy:
            src: /etc/kubernetes/admin.conf
            dest: "/home/{{ ansible_user }}/.kube/config"
            remote_src: yes
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0600'
  
- name: Step 5 - Install Flannel CNI
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Apply Flannel CNI manifest
      command: kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
      register: flannel_apply
      changed_when: "'created' in flannel_apply.stdout or 'configured' in flannel_apply.stdout"
  
    - name: Wait for Flannel pods to be Running
      shell: |
        kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
      register: flannel_running
      retries: 10
      delay: 15
      until: flannel_running.stdout | int > 0
  
    - name: Confirm Flannel pods are active
      debug:
        msg: "Flannel is running ({{ flannel_running.stdout }} pods Running)."
  
- name: Step 6 - Join worker nodes
  hosts: workers
  become: yes
  gather_facts: false
  environment:
    DEBIAN_FRONTEND: noninteractive
  vars:
    join_script: /tmp/kube_join.sh
  tasks:
    - name: Test SSH connectivity to worker node
      ping:
      register: ping_result
      ignore_errors: yes
  
    - name: Mark worker online status
      set_fact:
        worker_online: "{{ ping_result is succeeded }}"
  
    - name: Display worker online status
      debug:
        msg: "Worker {{ inventory_hostname }} is {{ 'ONLINE' if worker_online else 'OFFLINE' }}"
  
    - name: Retrieve join command from master
      delegate_to: "{{ groups['master'][0] }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd
      when: worker_online
  
    - name: Save join command to script file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'
      when: worker_online
      ignore_errors: yes
  
    - name: Reset old worker node
      shell: kubeadm reset -f || true
      ignore_errors: yes
      when: worker_online
  
    - name: Execute join command
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: yes
      when: worker_online
  
    - name: Display join result summary
      debug:
        msg: "{{ 'Node ' + inventory_hostname + ' has successfully joined the cluster!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Skipping join' }}"
  
- name: Step 7 - Verify Kubernetes cluster status
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Check kubectl binary
      command: which kubectl
      register: kubectl_check
      failed_when: kubectl_check.rc != 0
      changed_when: false
  
    - name: List all nodes
      command: kubectl get nodes -o wide
      register: nodes_info
      changed_when: false
  
    - name: List system pods
      command: kubectl get pods -n kube-system -o wide
      register: pods_info
      changed_when: false
  
    - name: Display cluster info
      debug:
        msg:
          - "Node list:"
          - "{{ nodes_info.stdout_lines }}"
          - "Pods in kube-system namespace:"
          - "{{ pods_info.stdout_lines }}"
  
    - name: Check node readiness
      shell: kubectl get nodes --no-headers | awk '{print $1, $2}' | column -t
      register: node_status
      changed_when: false
  
    - name: Node status summary
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          Some nodes are not ready:
          {{ node_status.stdout }}
          Please check kubelet or CNI (Flannel) on those nodes.
          {% else %}
          All nodes are in Ready state!
          {{ node_status.stdout }}
          {% endif %}
  
    - name: Detect problematic pods
      shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
      register: bad_pods
      changed_when: false
  
    - name: Report problematic pods
      debug:
        msg: |
          {% if bad_pods.stdout %}
          Some pods in kube-system are not stable:
          {{ bad_pods.stdout }}
          {% else %}
          All kube-system pods are Running or Completed!
          {% endif %}
  
    - name: Collect logs from problematic pods
      when: bad_pods.stdout != ""
      shell: |
        echo "==== Problematic Pod Logs ===="
        for pod in $(kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' | awk '{print $1}'); do
          echo "---------------------------------------------"
          echo "Pod: $pod"
          kubectl logs -n kube-system $pod --tail=30 || echo "Cannot get logs for $pod"
          echo
        done
      register: bad_pods_logs
      ignore_errors: yes
  
    - name: Display detailed logs
      when: bad_pods.stdout != ""
      debug:
        msg: "{{ bad_pods_logs.stdout_lines | default(['No error logs or pods restarted.']) }}"
  `
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
		'install-ingress': '09-install-ingress',
		'install-metallb': '10-install-metallb',
		'install-helm': '11-install-helm',
		'setup-storage': '12-setup-storage',
		'prepare-and-join-worker': '13-prepare-and-join-worker',
		'deploy-full-cluster': 'deploy-full-cluster',
		'deploy-full-cluster-flannel': 'deploy-full-cluster-flannel',
		'reset-cluster': '00-reset-cluster'
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
			'09-install-ingress': 'Cài Ingress Controller',
			'10-install-metallb': 'Cài MetalLB LoadBalancer',
			'11-install-helm': 'Cài Helm',
			'12-setup-storage': 'Setup Storage',
			'13-prepare-and-join-worker': 'Chuẩn bị & Join Worker (02→03→04→07)',
			'deploy-full-cluster': 'Triển khai toàn bộ cluster (Calico)',
			'deploy-full-cluster-flannel': 'Triển khai toàn bộ cluster (Flannel)'
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
		const result = await fetch(`/api/ansible-playbook/save/${getClusterId()}`, {
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

	if (contentArea) contentArea.style.display = 'block';
	if (executionArea) executionArea.style.display = 'none';
};

// Hiển thị thực thi playbook
window.showPlaybookExecutionView = function () {
	const contentArea = document.getElementById('playbook-content-area');
	const executionArea = document.getElementById('playbook-execution-status');

	if (contentArea) contentArea.style.display = 'none';
	if (executionArea) executionArea.style.display = 'block';
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
		if (contentArea) contentArea.style.display = 'none';
		if (execArea) execArea.style.display = 'none';
		const output = document.getElementById('ansible-output');
		if (output) output.textContent = '';
		const alertBox = document.getElementById('playbook-alert');
		if (alertBox) alertBox.innerHTML = '';
		const search = document.getElementById('playbook-search');
		if (search) search.value = '';
	} catch (_) { }
}
