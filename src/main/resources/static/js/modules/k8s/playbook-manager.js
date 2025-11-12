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
	const cid = clusterIdOverride || getClusterId();
	if (!cid) {
	  console.error('No cluster selected');
	  return;
	}
  
	try {
	  // Lưu lại override nếu có
	  if (clusterIdOverride) {
		window.currentClusterId = clusterIdOverride;
	  }
	  const response = await fetch(`/api/ansible-playbook/list/${cid}`);
	  if (!response.ok) {
		throw new Error('Failed to load playbooks');
	  }
  
	  const playbooks = await response.json();
	  const playbookList = document.getElementById('playbook-list');
  
	  if (playbooks.length === 0) {
		playbookList.innerHTML = '<div class="list-group-item text-center text-muted">Chưa có playbook nào</div>';
	  } else {
		playbookList.innerHTML = '';
		playbooks.forEach(pb => {
		  const item = document.createElement('div');
		  item.className = 'list-group-item d-flex justify-content-between align-items-center';
		  item.innerHTML = `
			<div class="playbook-item" data-name="${pb}">
			  <div class="fw-bold">${pb}</div>
			  <div class="small text-muted">Playbook file</div>
			</div>
			<div class="btn-group btn-group-sm">
			  <button class="btn btn-outline-primary btn-sm" onclick="loadPlaybook('${pb}')" title="Xem">
				👁️
			  </button>
			  <button class="btn btn-outline-success btn-sm" onclick="executePlaybook('${pb}')" title="Thực thi">
				▶️
			  </button>
			  <button class="btn btn-outline-danger btn-sm" onclick="deletePlaybook('${pb}')" title="Xóa">
				🗑️
			  </button>
			</div>
		  `;
		  playbookList.appendChild(item);
		});
	  }
	} catch (error) {
	  console.error('Error loading playbooks:', error);
	  // Hiển thị lỗi trong playbook list thay vì dùng showAlert
	  const playbookList = document.getElementById('playbook-list');
	  if (playbookList) {
		playbookList.innerHTML = `
		  <div class="list-group-item text-center text-danger">
			<i class="bi bi-exclamation-triangle me-2"></i>
			Lỗi tải danh sách playbook: ${error.message}
		  </div>
		`;
	  }
	}
  }
  
  // Tải nội dung playbook
  window.loadPlaybook = async function (filename) {
	const cid = getClusterId();
	if (!cid || !filename) return;
  
	try {
	  const response = await fetch(`/api/ansible-playbook/read/${cid}/${filename}`);
	  if (!response.ok) {
		throw new Error('Failed to load playbook');
	  }
  
	  const data = await response.json();
	  document.getElementById('playbook-filename').value = filename.replace('.yml', '');
	  document.getElementById('playbook-editor').value = data.content;
  
	  // Hiển thị view nội dung và ẩn view thực thi
	  showPlaybookContentView();
  
	} catch (error) {
	  console.error('Error loading playbook:', error);
	  showAlert('error', 'Lỗi tải playbook: ' + error.message);
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
	  const response = await fetch(`/api/ansible-playbook/delete/${cid}/${filename}`, {
		method: 'DELETE'
	  });
  
	  if (!response.ok) {
		const errorData = await response.json();
		throw new Error(errorData.error || 'Lỗi xóa playbook');
	  }
  
	  showAlert('success', `Đã xóa playbook "${filename}" thành công `);
	  await loadPlaybooks(); // Cập nhật danh sách
  
	} catch (error) {
	  console.error('Error deleting playbook:', error);
	  showAlert('error', 'Lỗi xóa playbook: ' + error.message);
	}
  };
  
  // Thực thi playbook
  window.executePlaybook = async function (filename, extraVars = '') {
	const cid = getClusterId();
	if (!cid || !filename) return;
  
	try {
	  // Hiển thị thực thi và ẩn nội dung
	  showPlaybookExecutionView();
  
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
	  showAlert('error', 'Lỗi thực thi playbook: ' + error.message);
	  showPlaybookContentView(); // Hiển thị nội dung khi có lỗi
	  throw error;
	}
  };
  
  // Theo dõi thực thi playbook
  async function monitorPlaybookExecution(taskId) {
	const outputElement = document.getElementById('ansible-output');
	const progressElement = document.getElementById('execution-progress');
	const spinnerElement = document.getElementById('execution-spinner');
  
	if (!outputElement || !progressElement || !spinnerElement) {
	  console.error('Execution elements not found');
	  return;
	}
  
	// Xóa output trước
	outputElement.innerHTML = '';
  
	// Hiển thị progress và spinner
	progressElement.style.display = 'block';
	spinnerElement.style.display = 'inline-block';
  
	const checkStatus = async () => {
	  try {
		const response = await fetch(`/api/ansible-playbook/status/${getClusterId()}/${taskId}`);
		if (!response.ok) {
		  throw new Error('Failed to check status');
		}
  
		const status = await response.json();
  
		// Cập nhật progress bar
		const progressBar = progressElement.querySelector('.progress-bar');
		if (progressBar) {
		  progressBar.style.width = `${status.progress || 0}%`;
		  progressBar.setAttribute('aria-valuenow', status.progress || 0);
		}
  
		// Cập nhật output
		if (status.output && status.output.length > 0) {
		  const newOutput = status.output.slice(outputElement.children.length);
		  newOutput.forEach(line => {
			const lineElement = document.createElement('div');
			lineElement.className = 'output-line';
  
			// Mã hóa màu cho các loại output khác nhau
			if (line.includes('TASK') || line.includes('PLAY')) {
			  lineElement.className += ' task-header';
			} else if (line.includes('ok:') || line.includes('changed:')) {
			  lineElement.className += ' success';
			} else if (line.includes('fatal:') || line.includes('failed:')) {
			  lineElement.className += ' error';
			} else if (line.includes('skipping:')) {
			  lineElement.className += ' warning';
			}
  
			lineElement.textContent = line;
			outputElement.appendChild(lineElement);
		  });
  
		  // Cuộn xuống cuối
		  outputElement.scrollTop = outputElement.scrollHeight;
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
  async function generateK8sPlaybookFromTemplate(template) {
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
		# Thêm tất cả node trong inventory vào /etc/hosts
		
	  - name: Set hostname according to inventory
		hostname:
		  name: "{{ hostvars[inventory_hostname].ansible_user }}"
		when: ansible_hostname != hostvars[inventory_hostname].ansible_user
		tags: sethostname
		# Đặt hostname theo inventory
		
	  - name: Verify hostname after update
		command: hostnamectl
		register: host_info
		changed_when: false
		tags: verify
		# Kiểm tra hostname sau khi cập nhật
		
	  - name: Display information after update
		debug:
		  msg:
			- "Hostname hiện tại: {{ ansible_hostname }}"
			- "Kết quả lệnh hostnamectl:"
			- "{{ host_info.stdout_lines }}"
		tags: verify
		# Hiển thị thông tin sau khi cập nhật`,
  
	  '02-kernel-sysctl': `---
  - hosts: all
	become: yes
	environment:
	  DEBIAN_FRONTEND: noninteractive
	tasks:
	  - name: Disable swap
		shell: swapoff -a || true
		ignore_errors: true
		# Tắt swap vì Kubernetes không hỗ trợ
  
	  - name: Comment swap lines in /etc/fstab
		replace:
		  path: /etc/fstab
		  regexp: '(^.*swap.*$)'
		  replace: '# \\1'
		# Comment dòng swap trong /etc/fstab
  
	  - name: Load kernel modules
		copy:
		  dest: /etc/modules-load.d/containerd.conf
		  content: |
			overlay
			br_netfilter
		# Tải module kernel cho containerd
  
	  - name: Load overlay and br_netfilter modules
		shell: |
		  modprobe overlay
		  modprobe br_netfilter
		# Kích hoạt module overlay và br_netfilter
  
	  - name: Configure sysctl for Kubernetes
		copy:
		  dest: /etc/sysctl.d/99-kubernetes-cri.conf
		  content: |
			net.bridge.bridge-nf-call-iptables  = 1
			net.bridge.bridge-nf-call-ip6tables = 1
			net.ipv4.ip_forward                 = 1
		# Cấu hình sysctl cho Kubernetes
  
	  - name: Apply sysctl configuration
		command: sysctl --system
		# Áp dụng cấu hình sysctl`,
  
	  '03-install-containerd': `---
  - hosts: all
	become: yes
	environment:
	  DEBIAN_FRONTEND: noninteractive
	tasks:
	  - name: Update apt cache
		apt:
		  update_cache: yes
		# Cập nhật cache APT
  
	  - name: Install containerd
		apt:
		  name: containerd
		  state: present
		  force_apt_get: yes
		# Cài đặt containerd container runtime
  
	  - name: Create containerd configuration directory
		file:
		  path: /etc/containerd
		  state: directory
		# Tạo thư mục cấu hình containerd
  
	  - name: Generate default containerd configuration
		shell: "containerd config default > /etc/containerd/config.toml"
		# Tạo file cấu hình mặc định cho containerd
  
	  - name: Enable SystemdCgroup
		replace:
		  path: /etc/containerd/config.toml
		  regexp: 'SystemdCgroup = false'
		  replace: 'SystemdCgroup = true'
		# Bật SystemdCgroup trong containerd
  
	  - name: Restart containerd service
		systemd:
		  name: containerd
		  enabled: yes
		  state: restarted
		# Khởi động lại containerd`,
  
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
		# Cài các gói phụ thuộc cần thiết
  
	  - name: Add Kubernetes GPG key
		shell: |
		  if [ ! -f /usr/share/keyrings/kubernetes-archive-keyring.gpg ]; then
			curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \\
			gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
		  else
			echo "GPG key đã tồn tại, bỏ qua bước này."
		  fi
		changed_when: false
		register: gpg_status  
		# Thêm GPG key chính thức của Kubernetes
  
	  - name: Add Kubernetes repository
		copy:
		  dest: /etc/apt/sources.list.d/kubernetes.list
		  content: |
			deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /
		# Thêm repository APT của Kubernetes
  
	  - name: Install kubelet, kubeadm, kubectl
		apt:
		  name:
			- kubelet
			- kubeadm
			- kubectl
		  state: present
		  update_cache: yes
		# Cài đặt các thành phần core của Kubernetes
  
	  - name: Hold package versions
		command: apt-mark hold kubelet kubeadm kubectl
		# Giữ phiên bản các package để tránh cập nhật tự động`,
  
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
		# Lấy địa chỉ IP động của master
  
	  - name: Display master IP being used
		debug:
		  msg: "Sử dụng địa chỉ master: {{ master_ip }}"
		# Hiển thị địa chỉ master đang được sử dụng
  
	  - name: Reset old cluster and clean up data
		shell: |
		  kubeadm reset -f || true
		  rm -rf /etc/kubernetes /var/lib/etcd /var/lib/kubelet /etc/cni/net.d
		  systemctl restart containerd || true
		ignore_errors: yes
		# Reset cụm cũ và dọn sạch dữ liệu
  
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
		# Khởi tạo Control Plane với Calico CNI
  
	  - name: Configure kubeconfig for root user
		shell: |
		  mkdir -p $HOME/.kube
		  cp /etc/kubernetes/admin.conf $HOME/.kube/config
		  chown $(id -u):$(id -g) $HOME/.kube/config
		args:
		  executable: /bin/bash
		# Cấu hình kubeconfig cho root
  
	  - name: Configure kubeconfig for normal user
		when: ansible_user != "root"
		block:
		  - name: Create kubeconfig directory for user
			file:
			  path: "/home/{{ ansible_user }}/.kube"
			  state: directory
			  mode: '0755'
			# Tạo thư mục kubeconfig cho user
  
		  - name: Copy kubeconfig for user
			copy:
			  src: /etc/kubernetes/admin.conf
			  dest: "/home/{{ ansible_user }}/.kube/config"
			  owner: "{{ ansible_user }}"
			  group: "{{ ansible_user }}"
			  mode: '0600'
			  remote_src: yes
			# Sao chép kubeconfig cho user
		# Cấu hình kubeconfig cho user thường (nếu không phải root)
  
	  - name: Generate join command for workers
		shell: kubeadm token create --print-join-command
		register: join_cmd
		changed_when: false
		# Sinh lệnh join cho worker
  
	  - name: Save join command to file
		copy:
		  content: "{{ join_cmd.stdout }}"
		  dest: "{{ join_script }}"
		  mode: '0755'
		# Lưu lệnh join ra file
  
	  - name: Display join command
		debug:
		  msg:
			- "Lệnh join worker:"
			- "{{ join_cmd.stdout }}"
			- "File lưu tại: {{ join_script }}"
		# Hiển thị join command
  
	  - name: Complete master initialization
		debug:
		  msg: "Master {{ inventory_hostname }} đã sẵn sàng cho worker join!"
		# Hoàn tất khởi tạo master`,
  
	  '06-install-cni': `---
  - name: Cài đặt hoặc cập nhật Calico CNI (tự động)
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
	  - name: Kiểm tra Calico CNI có tồn tại không
		command: kubectl get daemonset calico-node -n kube-system
		register: calico_check
		ignore_errors: true
  
	  - name: Hiển thị trạng thái hiện tại
		debug:
		  msg: >
			{% if calico_check.rc == 0 %}
			  Calico đã được cài đặt.
			{% else %}
			  Chưa có Calico, sẽ tiến hành cài đặt mới.
			{% endif %}
  
	  - name: Kiểm tra kernel modules overlay & br_netfilter
		shell: |
		  modprobe overlay || true
		  modprobe br_netfilter || true
		  lsmod | grep -E 'overlay|br_netfilter' || echo "Thiếu module kernel"
		register: kernel_status
		ignore_errors: true
  
	  - name: Kết quả kiểm tra module kernel
		debug:
		  var: kernel_status.stdout_lines
  
	  - name: Kiểm tra cấu hình sysctl
		shell: |
		  echo "net.bridge.bridge-nf-call-iptables = 1" | tee /etc/sysctl.d/k8s.conf >/dev/null
		  echo "net.ipv4.ip_forward = 1" | tee -a /etc/sysctl.d/k8s.conf >/dev/null
		  sysctl --system | grep -E "net.bridge.bridge-nf-call|net.ipv4.ip_forward"
		register: sysctl_status
		ignore_errors: true
  
	  - name: Kết quả sysctl
		debug:
		  var: sysctl_status.stdout_lines
  
	  - name: Áp dụng Calico manifest (cài mới hoặc cập nhật)
		shell: |
		  kubectl apply -f {{ calico_url }}
		args:
		  executable: /bin/bash
		register: calico_apply
		retries: 3
		delay: 10
		until: calico_apply.rc == 0
  
	  - name: Hiển thị kết quả cài đặt
		debug:
		  var: calico_apply.stdout_lines
  
	  - name: Kiểm tra Calico node pod đang khởi động
		shell: |
		  kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
		register: calico_running
  
	  - name: Chờ pod khởi động (tối đa 10 lần)
		until: calico_running.stdout | int > 0
		retries: 10
		delay: 15
		shell: |
		  kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
		register: calico_running
		ignore_errors: true
  
	  - name: Xác nhận Calico pods đang chạy
		when: calico_running.stdout | int > 0
		debug:
		  msg: "Calico đang hoạt động ({{ calico_running.stdout }} pods Running)."
  
	  - name: Log pod Calico nếu lỗi
		when: calico_running.stdout | int == 0
		shell: kubectl logs -n kube-system -l k8s-app=calico-node --tail=50 || true
		register: calico_logs
		ignore_errors: true
  
	  - name: Hiển thị log pod Calico
		when: calico_running.stdout | int == 0
		debug:
		  msg: "{{ calico_logs.stdout_lines | default(['Pod Calico chưa sẵn sàng hoặc không có log.']) }}"
  
	  - name: Kiểm tra trạng thái node
		command: kubectl get nodes -o wide
		register: nodes_status
		ignore_errors: true
  
	  - name: Hiển thị kết quả cluster
		debug:
		  var: nodes_status.stdout_lines`,
  
	  '06-install-flannel': `---
  - name: Cài đặt hoặc cập nhật Flannel CNI (tương thích WSL2)
	hosts: master
	become: yes
	gather_facts: false
	environment:
	  KUBECONFIG: /etc/kubernetes/admin.conf
	  DEBIAN_FRONTEND: noninteractive
  
	vars:
	  flannel_manifest: "https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml"
  
	tasks:
	  - name: Kiểm tra Flannel CNI có tồn tại không
		command: kubectl get daemonset kube-flannel-ds -n kube-flannel
		register: flannel_check
		ignore_errors: true
  
	  - name: Hiển thị trạng thái hiện tại
		debug:
		  msg: >
			{% if flannel_check.rc == 0 %}
			  Flannel đã được cài đặt trước đó.
			{% else %}
			  Chưa có Flannel, sẽ tiến hành cài đặt mới.
			{% endif %}
  
	  - name: Bật IP forwarding
		shell: |
		  echo "net.ipv4.ip_forward = 1" | tee /etc/sysctl.d/k8s.conf >/dev/null
		  sysctl --system | grep net.ipv4.ip_forward
		register: sysctl_status
		ignore_errors: true
  
	  - name: Kết quả sysctl
		debug:
		  var: sysctl_status.stdout_lines
  
	  - name: Áp dụng Flannel manifest (tự động tải bản mới nhất)
		command: kubectl apply -f {{ flannel_manifest }}
		register: flannel_apply
		changed_when: "'created' in flannel_apply.stdout or 'configured' in flannel_apply.stdout"
		failed_when: flannel_apply.rc != 0
  
	  - name: Hiển thị kết quả áp dụng
		debug:
		  var: flannel_apply.stdout_lines
  
	  - name: Kiểm tra số pod Flannel đang chạy
		shell: |
		  kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
		register: flannel_running
  
	  - name: Chờ pod Flannel hoạt động (tối đa 10 lần)
		until: flannel_running.stdout | int > 0
		retries: 10
		delay: 15
		shell: |
		  kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
		register: flannel_running
		ignore_errors: true
  
	  - name: Xác nhận Flannel pod đã hoạt động
		when: flannel_running.stdout | int > 0
		debug:
		  msg: "Flannel đang hoạt động ({{ flannel_running.stdout }} pods Running)."
  
	  - name: Log Flannel nếu pod chưa chạy
		when: flannel_running.stdout | int == 0
		shell: kubectl logs -n kube-flannel -l app=flannel --tail=50 || true
		register: flannel_logs
		ignore_errors: true
  
	  - name: Hiển thị log Flannel
		when: flannel_running.stdout | int == 0
		debug:
		  msg: "{{ flannel_logs.stdout_lines | default(['Pod Flannel chưa sẵn sàng hoặc không có log.']) }}"
  
	  - name: Kiểm tra trạng thái node
		command: kubectl get nodes -o wide
		register: nodes_status
		ignore_errors: true
  
	  - name: Hiển thị kết quả cluster
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
		# Kiểm tra kết nối SSH đến worker node
  
	  - name: Skip offline workers
		set_fact:
		  worker_online: "{{ ping_result is succeeded }}"
		# Đánh dấu worker nào online/offline
  
	  - name: Display worker online status
		debug:
		  msg: "Worker {{ inventory_hostname }} is {{ 'ONLINE' if worker_online else 'OFFLINE' }}"
		# Hiển thị trạng thái online/offline
  
	  - name: Get join command from master
		delegate_to: "{{ groups['master'][0] }}"
		run_once: true
		shell: kubeadm token create --print-join-command
		register: join_cmd
		when: worker_online
		# Lấy lệnh join từ master node (chỉ chạy 1 lần)
  
	  - name: Save join command to file
		copy:
		  content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
		  dest: "{{ join_script }}"
		  mode: '0755'
		when: worker_online
		ignore_errors: yes
		# Ghi lệnh join ra file script
  
	  - name: Reset node if old cluster exists
		shell: |
		  kubeadm reset -f || true
		  rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
		  systemctl restart containerd || true
		ignore_errors: yes
		when: worker_online
		# Reset node cũ (nếu có)
  
	  - name: Join to Kubernetes cluster
		shell: "{{ join_script }}"
		register: join_output
		ignore_errors: yes
		when: worker_online
		# Thực thi lệnh join vào cluster
  
	  - name: Display join result
		debug:
		  msg: "{{ join_output.stdout_lines | default(['Đã join thành công!']) if worker_online else ['Worker offline, skip join'] }}"
		# Hiển thị kết quả join
  
	  - name: Restart kubelet service
		systemd:
		  name: kubelet
		  state: restarted
		  enabled: yes
		ignore_errors: yes
		when: worker_online
		# Khởi động lại kubelet
  
	  - name: Complete join process
		debug:
		  msg: "{{ 'Node ' + inventory_hostname + ' đã tham gia cụm thành công!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Bỏ qua join' }}"
		# Báo cáo kết quả cuối cùng`,
  
	  '09-install-ingress': `---
  - hosts: master
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
  
	tasks:
	  - name: Lấy địa chỉ master động
		set_fact:
		  master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
	  - debug:
		  msg: "Cài đặt Ingress trên master: {{ master_ip }}"
  
	  - name: Cài đặt Ingress Controller (nginx)
		shell: |
		  KUBECONFIG=/etc/kubernetes/admin.conf \
		  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
		args:
		  executable: /bin/bash
		register: ingress_install
		ignore_errors: yes
  
	  - name: Kết quả cài Ingress
		debug:
		  msg: "{{ ingress_install.stdout_lines | default(['Ingress Controller applied']) }}"
  
	  - name: Kiểm tra trạng thái pod ingress-nginx
		shell: |
		  KUBECONFIG=/etc/kubernetes/admin.conf \
		  kubectl get pods -n ingress-nginx -o wide
		register: ingress_pods
  
	  - name: Hiển thị pod ingress-nginx
		debug:
		  msg: "{{ ingress_pods.stdout_lines }}"
  
	  - name: Hoàn tất
		debug:
		  msg: "Ingress Controller (NGINX) đã được cài đặt thành công!"`,
  
	  '11-install-helm': `---
  - hosts: master
	become: yes
	gather_facts: yes
	environment:
	  DEBIAN_FRONTEND: noninteractive
  
	tasks:
	  - name: Cài đặt Helm nếu chưa có
		shell: |
		  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
		args:
		  executable: /bin/bash
		register: helm_install
		ignore_errors: yes
  
	  - name: Kết quả cài đặt Helm
		debug:
		  msg: "{{ helm_install.stdout_lines | default(['Helm installed']) }}"
  
	  - name: Kiểm tra phiên bản Helm
		shell: helm version --short
		register: helm_version
  
	  - name: Hiển thị thông tin Helm
		debug:
		  msg: "Phiên bản Helm hiện tại: {{ helm_version.stdout | default('Không xác định') }}"
  
	  - name: Hoàn tất
		debug:
		  msg: "Helm đã được cài đặt thành công trên master!"`,
  
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
		# Lấy địa chỉ IP động của master node
  
	  - name: Calculate IP range from master IP subnet using shell
		shell: |
		  MASTER_IP="{{ master_ip }}"
		  SUBNET=$(echo "$MASTER_IP" | cut -d'.' -f1-3)
		  echo "\${SUBNET}.240"
		  echo "\${SUBNET}.250"
		register: ip_range_result
		changed_when: false
		# Tự động tính toán IP range từ subnet của master IP (240-250)
  
	  - name: Extract IP range start and end
		set_fact:
		  ip_range_start: "{{ ip_range_result.stdout_lines[0] }}"
		  ip_range_end: "{{ ip_range_result.stdout_lines[1] }}"
		# Trích xuất IP range start và end từ kết quả shell
  
	  - name: Display calculated MetalLB IP range
		debug:
		  msg:
			- "Master IP: {{ master_ip }}"
			- "Auto-detected MetalLB IP Pool: {{ ip_range_start }} - {{ ip_range_end }}"
			- "IP range được tính tự động từ network của master node"
		# Hiển thị IP range đã được tính toán
  
	  - name: Check if MetalLB namespace exists
		command: kubectl get namespace {{ metallb_namespace }}
		register: ns_check
		failed_when: false
		changed_when: false
		# Kiểm tra namespace MetalLB đã tồn tại
  
	  - name: Create MetalLB namespace if missing
		command: kubectl create namespace {{ metallb_namespace }}
		when: ns_check.rc != 0
		changed_when: true
		# Tạo namespace cho MetalLB (nếu chưa có)
  
	  - name: Apply MetalLB official manifest
		command: kubectl apply -f {{ metallb_url }}
		register: metallb_apply
		changed_when: "'created' in metallb_apply.stdout or 'configured' in metallb_apply.stdout"
		# Áp dụng manifest chính thức của MetalLB
  
	  - name: Wait for MetalLB controller pods to start
		shell: |
		  kubectl get pods -n {{ metallb_namespace }} -l component=controller --no-headers | grep -c 'Running' || true
		register: metallb_running
		until: metallb_running.stdout | int > 0
		retries: 10
		delay: 10
		ignore_errors: true
		# Chờ controller pods của MetalLB khởi động
  
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
		# Tạo manifest IPAddressPool với IP range tự động từ master node
  
	  - name: Apply IPAddressPool manifest
		command: kubectl apply -f /tmp/metallb-ip-pool.yaml
		register: ip_pool_apply
		changed_when: "'created' in ip_pool_apply.stdout or 'configured' in ip_pool_apply.stdout"
		# Áp dụng cấu hình IPAddressPool
  
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
		# Tạo manifest L2Advertisement cho MetalLB
  
	  - name: Apply L2Advertisement manifest
		command: kubectl apply -f /tmp/metallb-l2advertisement.yaml
		register: l2_apply
		changed_when: "'created' in l2_apply.stdout or 'configured' in l2_apply.stdout"
		# Áp dụng cấu hình L2Advertisement
  
	  - name: Show MetalLB pods and IP configuration
		shell: |
		  echo "=== MetalLB Pods ==="
		  kubectl get pods -n {{ metallb_namespace }}
		  echo ""
		  echo "=== IPAddressPools ==="
		  kubectl get ipaddresspools -n {{ metallb_namespace }}
		register: metallb_status
		changed_when: false
		# Hiển thị pods và cấu hình IP của MetalLB
  
	  - name: Display summary
		debug:
		  msg:
			- "MetalLB installed successfully."
			- "Namespace: {{ metallb_namespace }}"
			- "Master IP: {{ master_ip }}"
			- "Auto-detected IP Pool: {{ ip_range_start }} - {{ ip_range_end }}"
			- "{{ metallb_status.stdout_lines }}"
		# Hoàn tất cài đặt MetalLB LoadBalancer với IP range tự động`,
  
	  '12-setup-storage': `---
  - hosts: master
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
  
	vars:
	  nfs_manifest_dir: /etc/kubernetes/storage
  
	tasks:
	  - name: Tạo thư mục manifest NFS
		file:
		  path: "{{ nfs_manifest_dir }}"
		  state: directory
		  mode: '0755'
  
	  - name: Tải và áp dụng NFS Provisioner (example)
		shell: |
		  KUBECONFIG=/etc/kubernetes/admin.conf \
		  kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/rbac.yaml
		  KUBECONFIG=/etc/kubernetes/admin.conf \
		  kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/deployment.yaml
		args:
		  executable: /bin/bash
		register: nfs_apply
		ignore_errors: yes
  
	  - name: Kết quả triển khai NFS
		debug:
		  msg: "{{ nfs_apply.stdout_lines | default(['NFS Provisioner applied']) }}"
  
	  - name: Đặt StorageClass mặc định
		shell: |
		  KUBECONFIG=/etc/kubernetes/admin.conf \
		  kubectl patch storageclass nfs-client -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' || true
		args:
		  executable: /bin/bash
  
	  - name: Hoàn tất
		debug:
		  msg: "Cấu hình StorageClass (NFS) mặc định đã hoàn tất!"`,
  
	  '13-prepare-and-join-worker': `---
  # All-in-one: Chuẩn bị node và join vào cụm (02 → 03 → 04 → 07)
  
  # Precheck: Chỉ định nhóm target_workers gồm các worker chưa Ready hoặc chưa có trong kubectl
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
  
  - name: 02 - Cấu hình kernel và sysctl
	hosts: target_workers
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
	tasks:
	  - name: Tắt swap
		shell: swapoff -a || true
		ignore_errors: true
  
	  - name: Comment dòng swap trong /etc/fstab
		replace:
		  path: /etc/fstab
		  regexp: '(^.*swap.*$)'
		  replace: '# \\1'
		ignore_errors: yes
  
	  - name: Tạo file modules-load cho containerd
		copy:
		  dest: /etc/modules-load.d/containerd.conf
		  content: |
			overlay
			br_netfilter
  
	  - name: Kích hoạt module overlay và br_netfilter
		shell: |
		  modprobe overlay || true
		  modprobe br_netfilter || true
  
	  - name: Cấu hình sysctl cho Kubernetes
		copy:
		  dest: /etc/sysctl.d/99-kubernetes-cri.conf
		  content: |
			net.bridge.bridge-nf-call-iptables  = 1
			net.bridge.bridge-nf-call-ip6tables = 1
			net.ipv4.ip_forward                 = 1
  
	  - name: Áp dụng sysctl
		command: sysctl --system
		ignore_errors: yes
  
  - name: 03 - Cài đặt và cấu hình containerd
	hosts: target_workers
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
	tasks:
	  - name: Cập nhật cache APT
		apt:
		  update_cache: yes
  
	  - name: Cài containerd
		apt:
		  name: containerd
		  state: present
		  force_apt_get: yes
  
	  - name: Tạo thư mục cấu hình containerd
		file:
		  path: /etc/containerd
		  state: directory
  
	  - name: Sinh file cấu hình mặc định cho containerd
		shell: "containerd config default > /etc/containerd/config.toml"
  
	  - name: Bật SystemdCgroup
		replace:
		  path: /etc/containerd/config.toml
		  regexp: 'SystemdCgroup = false'
		  replace: 'SystemdCgroup = true'
  
	  - name: Khởi động lại containerd
		systemd:
		  name: containerd
		  enabled: yes
		  state: restarted
  
  - name: 04 - Cài đặt Kubernetes (kubelet, kubeadm, kubectl)
	hosts: target_workers
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
	tasks:
	  - name: Thêm GPG key của Kubernetes (nếu chưa có)
		shell: |
		  if [ ! -f /usr/share/keyrings/kubernetes-archive-keyring.gpg ]; then
			curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
			gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
		  fi
		changed_when: false
		ignore_errors: true
  
	  - name: Thêm repository Kubernetes
		copy:
		  dest: /etc/apt/sources.list.d/kubernetes.list
		  content: |
			deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /
  
	  - name: Cài kubelet, kubeadm, kubectl
		apt:
		  name:
			- kubelet
			- kubeadm
			- kubectl
		  state: present
		  update_cache: yes
  
	  - name: Giữ phiên bản kubelet/kubeadm/kubectl
		command: apt-mark hold kubelet kubeadm kubectl
  
  - name: 07 - Join worker vào cụm
	hosts: target_workers
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
	vars:
	  join_script: /tmp/kube_join.sh
	tasks:
	  - name: Kiểm tra kết nối SSH tới worker
		ping:
		register: ping_result
		ignore_errors: yes
  
	  - name: Đánh dấu trạng thái online
		set_fact:
		  worker_online: "{{ ping_result is succeeded }}"
  
	  - name: Lấy join command từ master
		delegate_to: "{{ groups['master'][0] }}"
		run_once: true
		shell: kubeadm token create --print-join-command
		register: join_cmd
		when: worker_online
  
	  - name: Ghi join command ra file
		copy:
		  content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
		  dest: "{{ join_script }}"
		  mode: '0755'
		when: worker_online
		ignore_errors: yes
  
	  - name: Reset node cũ (nếu có)
		shell: |
		  kubeadm reset -f || true
		  rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
		  systemctl restart containerd || true
		ignore_errors: yes
		when: worker_online
  
	  - name: Thực thi lệnh join
		shell: "{{ join_script }}"
		register: join_output
		ignore_errors: yes
		when: worker_online
  
	  - name: Khởi động lại kubelet
		systemd:
		  name: kubelet
		  state: restarted
		  enabled: yes
		ignore_errors: yes
		when: worker_online
  
	  - name: Tổng kết kết quả
		debug:
		  msg: "{{ 'Node ' + inventory_hostname + ' đã tham gia cụm thành công!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Bỏ qua join' }}"`,
  
  
  
	  '08-verify-cluster': `---
  - name: Kiểm tra trạng thái cụm Kubernetes
	hosts: master
	become: yes
	gather_facts: no
	environment:
	  KUBECONFIG: /etc/kubernetes/admin.conf
	  DEBIAN_FRONTEND: noninteractive
  
	tasks:
	  - name: Kiểm tra kubectl có sẵn không
		command: which kubectl
		register: kubectl_check
		failed_when: kubectl_check.rc != 0
		changed_when: false
  
	  - name: Liệt kê danh sách node
		command: kubectl get nodes
		register: nodes_info
		changed_when: false
  
	  - name: Liệt kê pods hệ thống
		command: kubectl get pods -n kube-system
		register: pods_info
		changed_when: false
  
	  - name: Hiển thị thông tin cụm
		debug:
		  msg:
			- "Danh sách Node:"
			- "{{ nodes_info.stdout_lines }}"
			- "Pods trong namespace kube-system:"
			- "{{ pods_info.stdout_lines }}"
  
	  - name: Kiểm tra trạng thái node
		shell: kubectl get nodes --no-headers | awk '{print $2}' | sort | uniq -c
		register: node_status
		changed_when: false
  
	  - name: Báo cáo tình trạng node
		debug:
		  msg: |
			{% if 'NotReady' in node_status.stdout %}
			Một số node chưa sẵn sàng:
			{{ node_status.stdout }}
			{% else %}
			Tất cả node đã ở trạng thái Ready!
			{% endif %}
  
	  - name: Kiểm tra pod lỗi trong kube-system
		shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
		register: bad_pods
		changed_when: false
  
	  - name: Báo cáo pod lỗi
		debug:
		  msg: |
			{% if bad_pods.stdout %}
			Một số pod chưa ổn định hoặc đang lỗi:
			{{ bad_pods.stdout }}
			{% else %}
			Tất cả pod trong kube-system đều đang Running hoặc Completed!
			{% endif %}
  
	  - name: Hiển thị log của pod lỗi (nếu có)
		when: bad_pods.stdout != ""
		shell: |
		  for pod in $(kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' | awk '{print $1}'); do
			echo "Log của $pod:"; kubectl logs -n kube-system $pod --tail=30 || true; echo "--------------------------------";
		  done
		register: bad_pods_logs
		ignore_errors: yes
  
	  - name: Log chi tiết
		when: bad_pods.stdout != ""
		debug:
		  msg: "{{ bad_pods_logs.stdout_lines | default(['Không có log lỗi']) }}"`,
  
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
		# Gỡ cụm Kubernetes (kubeadm reset -f)
  
	  - name: Display reset results
		debug:
		  msg: "{{ reset_output.stdout_lines | default(['Không có cluster cũ để reset.']) }}"
		# Hiển thị kết quả reset
  
	  - name: Remove Kubernetes configuration directory
		file:
		  path: /etc/kubernetes
		  state: absent
		# Xóa thư mục cấu hình Kubernetes
  
	  - name: Remove CNI network configuration
		file:
		  path: /etc/cni/net.d
		  state: absent
		# Xóa cấu hình mạng CNI
  
	  - name: Remove root kubeconfig
		file:
		  path: /root/.kube
		  state: absent
		# Xóa file kubeconfig của root
  
	  - name: Remove normal user kubeconfig
		file:
		  path: "/home/{{ ansible_user }}/.kube"
		  state: absent
		when: ansible_user != "root"
		# Xóa file kubeconfig của user thường
  
	  - name: Clean up iptables rules
		shell: |
		  iptables -F && iptables -X
		  iptables -t nat -F && iptables -t nat -X
		  iptables -t mangle -F && iptables -t mangle -X
		  iptables -P FORWARD ACCEPT
		ignore_errors: true
		# Dọn iptables
  
	  - name: Restart containerd service
		systemd:
		  name: containerd
		  state: restarted
		  enabled: yes
		# Khởi động lại containerd
  
	  - name: Confirm reset completed
		debug:
		  msg:
			- "Node {{ inventory_hostname }} đã được reset sạch (chỉ xóa dữ liệu)."
		# Xác nhận reset hoàn tất`,
  
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
		# Reset cụm Kubernetes cũ nếu tồn tại
  
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
		# Xóa các thư mục cấu hình Kubernetes cũ
  
	  - name: Restart containerd service
		shell: systemctl restart containerd || true
		ignore_errors: true
		# Khởi động lại containerd để đảm bảo sạch sẽ
  
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
		# Thêm danh sách các node vào /etc/hosts để cluster nhận diện nhau
  
	  - name: Set hostname according to inventory
		hostname:
		  name: "{{ inventory_hostname }}"
		when: ansible_hostname != inventory_hostname
		# Đặt hostname theo tên trong inventory
  
	  - name: Verify hostname
		shell: hostnamectl
		register: host_info
		# Kiểm tra hostname đã được đặt đúng
  
	  - name: Display hostname info
		debug:
		  msg: "{{ host_info.stdout_lines }}"
		# Hiển thị thông tin hostname
  
  - name: Step 2 - Configure kernel and containerd
	hosts: all
	become: yes
	gather_facts: no
	environment:
	  DEBIAN_FRONTEND: noninteractive
	tasks:
	  - name: Disable swap
		shell: swapoff -a && sed -i '/swap/d' /etc/fstab || true
		# Tắt swap vì Kubernetes không hỗ trợ
  
	  - name: Load kernel modules for containerd
		copy:
		  dest: /etc/modules-load.d/containerd.conf
		  content: |
			overlay
			br_netfilter
		# Tải các kernel module cần thiết cho containerd
  
	  - name: Activate kernel modules
		shell: |
		  modprobe overlay || true
		  modprobe br_netfilter || true
		# Kích hoạt module overlay và br_netfilter
  
	  - name: Configure sysctl parameters for Kubernetes
		copy:
		  dest: /etc/sysctl.d/99-kubernetes-cri.conf
		  content: |
			net.bridge.bridge-nf-call-iptables  = 1
			net.bridge.bridge-nf-call-ip6tables = 1
			net.ipv4.ip_forward                 = 1
		# Cấu hình sysctl cho networking Kubernetes
  
	  - name: Apply sysctl configuration
		command: sysctl --system
		# Áp dụng cấu hình sysctl
  
	  - name: Install containerd runtime
		apt:
		  name: containerd
		  state: present
		  update_cache: yes
		# Cài đặt containerd container runtime
  
	  - name: Generate default containerd config
		shell: |
		  mkdir -p /etc/containerd
		  containerd config default > /etc/containerd/config.toml
		# Tạo file cấu hình mặc định cho containerd
  
	  - name: Enable SystemdCgroup
		replace:
		  path: /etc/containerd/config.toml
		  regexp: 'SystemdCgroup = false'
		  replace: 'SystemdCgroup = true'
		# Bật SystemdCgroup trong containerd
  
	  - name: Restart and enable containerd
		systemd:
		  name: containerd
		  state: restarted
		  enabled: yes
		# Khởi động lại và bật containerd để áp dụng cấu hình
  
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
		# Thêm GPG key chính thức của Kubernetes
  
	  - name: Add Kubernetes repository
		copy:
		  dest: /etc/apt/sources.list.d/kubernetes.list
		  content: |
			deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /
		# Thêm repository APT của Kubernetes
  
	  - name: Install kubelet, kubeadm, kubectl
		apt:
		  name:
			- kubelet
			- kubeadm
			- kubectl
		  state: present
		  update_cache: yes
		# Cài đặt các thành phần core của Kubernetes
  
	  - name: Hold package version
		command: apt-mark hold kubelet kubeadm kubectl
		# Giữ phiên bản các package để tránh cập nhật tự động
  
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
		# Lấy địa chỉ IP của master node
  
	  - name: Reset old control plane (if any)
		shell: kubeadm reset -f || true
		# Reset control plane cũ nếu có
  
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
		# Khởi tạo control plane Kubernetes với Calico CNI
  
	  - name: Copy kubeconfig for root
		shell: |
		  mkdir -p /root/.kube
		  cp -i /etc/kubernetes/admin.conf /root/.kube/config
		  chown root:root /root/.kube/config
		args:
		  executable: /bin/bash
		# Sao chép kubeconfig cho user root
  
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
			# Tạo thư mục kubeconfig cho user thường
  
		  - name: Copy kubeconfig file
			copy:
			  src: /etc/kubernetes/admin.conf
			  dest: "/home/{{ ansible_user }}/.kube/config"
			  remote_src: yes
			  owner: "{{ ansible_user }}"
			  group: "{{ ansible_user }}"
			  mode: '0600'
			# Sao chép kubeconfig cho user thường
		# Sao chép kubeconfig cho user thường (nếu không phải root)
  
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
		# Kiểm tra Calico đã được cài đặt trước đó
  
	  - name: Apply Calico manifest (install or update)
		command: kubectl apply -f {{ calico_url }}
		register: calico_apply
		retries: 3
		delay: 10
		until: calico_apply.rc == 0
		# Áp dụng manifest Calico CNI
  
	  - name: Wait for Calico node pods to be Running
		shell: |
		  kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
		register: calico_running
		retries: 10
		delay: 15
		until: calico_running.stdout | int > 0
		# Chờ các pod Calico khởi động và ở trạng thái Running
  
	  - name: Confirm Calico pods are active
		debug:
		  msg: "Calico is running ({{ calico_running.stdout }} pods Running)."
		# Xác nhận Calico đang hoạt động
  
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
		# Kiểm tra kết nối SSH đến worker node
  
	  - name: Mark worker online status
		set_fact:
		  worker_online: "{{ ping_result is succeeded }}"
		# Đánh dấu worker nào online/offline
  
	  - name: Display worker online status
		debug:
		  msg: "Worker {{ inventory_hostname }} is {{ 'ONLINE' if worker_online else 'OFFLINE' }}"
		# Hiển thị trạng thái online/offline
  
	  - name: Retrieve join command from master
		delegate_to: "{{ groups['master'][0] }}"
		run_once: true
		shell: kubeadm token create --print-join-command
		register: join_cmd
		when: worker_online
		# Lấy lệnh join từ master node (chỉ chạy 1 lần)
  
	  - name: Save join command to script file
		copy:
		  content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
		  dest: "{{ join_script }}"
		  mode: '0755'
		when: worker_online
		ignore_errors: yes
		# Lưu lệnh join vào file script
  
	  - name: Reset old worker node
		shell: kubeadm reset -f || true
		ignore_errors: yes
		when: worker_online
		# Reset worker node cũ (nếu có)
  
	  - name: Execute join command
		shell: "{{ join_script }}"
		register: join_output
		ignore_errors: yes
		when: worker_online
		# Thực thi lệnh join để worker tham gia cluster
  
	  - name: Display join result summary
		debug:
		  msg: "{{ 'Node ' + inventory_hostname + ' đã tham gia cụm thành công!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Bỏ qua join' }}"
		# Báo cáo kết quả cuối cùng
  
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
		# Kiểm tra kubectl đã được cài đặt
  
	  - name: List all nodes
		command: kubectl get nodes -o wide
		register: nodes_info
		changed_when: false
		# Liệt kê tất cả các node trong cluster
  
	  - name: List system pods
		command: kubectl get pods -n kube-system -o wide
		register: pods_info
		changed_when: false
		# Liệt kê các pod trong namespace kube-system
  
	  - name: Display cluster info
		debug:
		  msg:
			- "Node list:"
			- "{{ nodes_info.stdout_lines }}"
			- "Pods in kube-system namespace:"
			- "{{ pods_info.stdout_lines }}"
		# Hiển thị thông tin chi tiết về cluster
  
	  - name: Check node readiness
		shell: kubectl get nodes --no-headers | awk '{print $1, $2}' | column -t
		register: node_status
		changed_when: false
		# Kiểm tra trạng thái Ready của các node
  
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
		# Tổng kết trạng thái node
  
	  - name: Detect problematic pods
		shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
		register: bad_pods
		changed_when: false
		# Phát hiện các pod có vấn đề
  
	  - name: Report problematic pods
		debug:
		  msg: |
			{% if bad_pods.stdout %}
			Some pods in kube-system are not stable:
			{{ bad_pods.stdout }}
			{% else %}
			All kube-system pods are Running or Completed!
			{% endif %}
		# Báo cáo các pod có vấn đề
  
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
		# Thu thập log của các pod có vấn đề
  
	  - name: Display detailed logs
		when: bad_pods.stdout != ""
		debug:
		  msg: "{{ bad_pods_logs.stdout_lines | default(['No error logs or pods restarted.']) }}"
		# Hiển thị log chi tiết của các pod có vấn đề`
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
		# Reset cụm Kubernetes cũ nếu tồn tại
  
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
		# Xóa các thư mục cấu hình Kubernetes cũ
  
	  - name: Restart containerd service
		shell: systemctl restart containerd || true
		ignore_errors: true
		# Khởi động lại containerd để đảm bảo sạch sẽ
  
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
		# Thêm danh sách các node vào /etc/hosts để cluster nhận diện nhau
  
	  - name: Set hostname according to inventory
		hostname:
		  name: "{{ inventory_hostname }}"
		when: ansible_hostname != inventory_hostname
		# Đặt hostname theo tên trong inventory
  
	  - name: Verify hostname
		shell: hostnamectl
		register: host_info
		# Kiểm tra hostname đã được đặt đúng
  
	  - name: Display hostname info
		debug:
		  msg: "{{ host_info.stdout_lines }}"
		# Hiển thị thông tin hostname
  
  - name: Step 2 - Configure kernel and containerd
	hosts: all
	become: yes
	gather_facts: no
	tasks:
	  - name: Disable swap
		shell: swapoff -a && sed -i '/swap/d' /etc/fstab || true
		# Tắt swap vì Kubernetes không hỗ trợ
  
	  - name: Load kernel modules for containerd
		copy:
		  dest: /etc/modules-load.d/containerd.conf
		  content: |
			overlay
			br_netfilter
		# Tải các kernel module cần thiết cho containerd
  
	  - name: Activate kernel modules
		shell: |
		  modprobe overlay || true
		  modprobe br_netfilter || true
		# Kích hoạt module overlay và br_netfilter
  
	  - name: Configure sysctl parameters for Kubernetes
		copy:
		  dest: /etc/sysctl.d/99-kubernetes-cri.conf
		  content: |
			net.bridge.bridge-nf-call-iptables  = 1
			net.bridge.bridge-nf-call-ip6tables = 1
			net.ipv4.ip_forward                 = 1
		# Cấu hình sysctl cho networking Kubernetes
  
	  - name: Apply sysctl configuration
		command: sysctl --system
		# Áp dụng cấu hình sysctl
  
	  - name: Install containerd runtime
		apt:
		  name: containerd
		  state: present
		  update_cache: yes
		# Cài đặt containerd container runtime
  
	  - name: Generate default containerd config
		shell: |
		  mkdir -p /etc/containerd
		  containerd config default > /etc/containerd/config.toml
		# Tạo file cấu hình mặc định cho containerd
  
	  - name: Enable SystemdCgroup
		replace:
		  path: /etc/containerd/config.toml
		  regexp: 'SystemdCgroup = false'
		  replace: 'SystemdCgroup = true'
		# Bật SystemdCgroup trong containerd
  
	  - name: Restart and enable containerd
		systemd:
		  name: containerd
		  state: restarted
		  enabled: yes
		# Khởi động lại và bật containerd để áp dụng cấu hình
  
  - name: Step 3 - Install Kubernetes core components
	hosts: all
	become: yes
	gather_facts: no
	tasks:
	  - name: Add Kubernetes GPG key
		shell: |
		  mkdir -p /usr/share/keyrings
		  curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
			gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
		changed_when: false
		ignore_errors: true
		# Thêm GPG key chính thức của Kubernetes
  
	  - name: Add Kubernetes repository
		copy:
		  dest: /etc/apt/sources.list.d/kubernetes.list
		  content: |
			deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /
		# Thêm repository APT của Kubernetes
  
	  - name: Install kubelet, kubeadm, kubectl
		apt:
		  name:
			- kubelet
			- kubeadm
			- kubectl
		  state: present
		  update_cache: yes
		# Cài đặt các thành phần core của Kubernetes
  
	  - name: Hold package version
		command: apt-mark hold kubelet kubeadm kubectl
		# Giữ phiên bản các package để tránh cập nhật tự động
  
  - name: Step 4 - Initialize Master node
	hosts: master
	become: yes
	gather_facts: yes
	tasks:
	  - name: Get master IP address
		set_fact:
		  master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
		# Lấy địa chỉ IP của master node
  
	  - name: Reset old control plane (if any)
		shell: kubeadm reset -f || true
		# Reset control plane cũ nếu có
  
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
		# Khởi tạo control plane Kubernetes với Flannel CNI
  
	  - name: Copy kubeconfig for root
		shell: |
		  mkdir -p /root/.kube
		  cp -i /etc/kubernetes/admin.conf /root/.kube/config
		  chown root:root /root/.kube/config
		args:
		  executable: /bin/bash
		# Sao chép kubeconfig cho user root
  
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
			# Tạo thư mục kubeconfig cho user thường
  
		  - name: Copy kubeconfig file
			copy:
			  src: /etc/kubernetes/admin.conf
			  dest: "/home/{{ ansible_user }}/.kube/config"
			  remote_src: yes
			  owner: "{{ ansible_user }}"
			  group: "{{ ansible_user }}"
			  mode: '0600'
			# Sao chép kubeconfig cho user thường
		# Sao chép kubeconfig cho user thường (nếu không phải root)
  
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
		# Áp dụng manifest Flannel CNI
  
	  - name: Wait for Flannel pods to be Running
		shell: |
		  kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
		register: flannel_running
		retries: 10
		delay: 15
		until: flannel_running.stdout | int > 0
		# Chờ các pod Flannel khởi động và ở trạng thái Running
  
	  - name: Confirm Flannel pods are active
		debug:
		  msg: "Flannel is running ({{ flannel_running.stdout }} pods Running)."
		# Xác nhận Flannel đang hoạt động
  
  - name: Step 6 - Join worker nodes
	hosts: workers
	become: yes
	gather_facts: false
	vars:
	  join_script: /tmp/kube_join.sh
	tasks:
	  - name: Test SSH connectivity to worker node
		ping:
		register: ping_result
		ignore_errors: yes
		# Kiểm tra kết nối SSH đến worker node
  
	  - name: Mark worker online status
		set_fact:
		  worker_online: "{{ ping_result is succeeded }}"
		# Đánh dấu worker nào online/offline
  
	  - name: Display worker online status
		debug:
		  msg: "Worker {{ inventory_hostname }} is {{ 'ONLINE' if worker_online else 'OFFLINE' }}"
		# Hiển thị trạng thái online/offline
  
	  - name: Retrieve join command from master
		delegate_to: "{{ groups['master'][0] }}"
		run_once: true
		shell: kubeadm token create --print-join-command
		register: join_cmd
		when: worker_online
		# Lấy lệnh join từ master node (chỉ chạy 1 lần)
  
	  - name: Save join command to script file
		copy:
		  content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
		  dest: "{{ join_script }}"
		  mode: '0755'
		when: worker_online
		ignore_errors: yes
		# Lưu lệnh join vào file script
  
	  - name: Reset old worker node
		shell: kubeadm reset -f || true
		ignore_errors: yes
		when: worker_online
		# Reset worker node cũ (nếu có)
  
	  - name: Execute join command
		shell: "{{ join_script }}"
		register: join_output
		ignore_errors: yes
		when: worker_online
		# Thực thi lệnh join để worker tham gia cluster
  
	  - name: Display join result summary
		debug:
		  msg: "{{ 'Node ' + inventory_hostname + ' đã tham gia cụm thành công!' if worker_online else 'Worker ' + inventory_hostname + ' OFFLINE - Bỏ qua join' }}"
		# Báo cáo kết quả cuối cùng
  
  - name: Step 7 - Verify Kubernetes cluster status
	hosts: master
	become: yes
	gather_facts: false
	environment:
	  KUBECONFIG: /etc/kubernetes/admin.conf
	tasks:
	  - name: Check kubectl binary
		command: which kubectl
		register: kubectl_check
		failed_when: kubectl_check.rc != 0
		changed_when: false
		# Kiểm tra kubectl đã được cài đặt
  
	  - name: List all nodes
		command: kubectl get nodes -o wide
		register: nodes_info
		changed_when: false
		# Liệt kê tất cả các node trong cluster
  
	  - name: List system pods
		command: kubectl get pods -n kube-system -o wide
		register: pods_info
		changed_when: false
		# Liệt kê các pod trong namespace kube-system
  
	  - name: Display cluster info
		debug:
		  msg:
			- "Node list:"
			- "{{ nodes_info.stdout_lines }}"
			- "Pods in kube-system namespace:"
			- "{{ pods_info.stdout_lines }}"
		# Hiển thị thông tin chi tiết về cluster
  
	  - name: Check node readiness
		shell: kubectl get nodes --no-headers | awk '{print $1, $2}' | column -t
		register: node_status
		changed_when: false
		# Kiểm tra trạng thái Ready của các node
  
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
		# Tổng kết trạng thái node
  
	  - name: Detect problematic pods
		shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
		register: bad_pods
		changed_when: false
		# Phát hiện các pod có vấn đề
  
	  - name: Report problematic pods
		debug:
		  msg: |
			{% if bad_pods.stdout %}
			Some pods in kube-system are not stable:
			{{ bad_pods.stdout }}
			{% else %}
			All kube-system pods are Running or Completed!
			{% endif %}
		# Báo cáo các pod có vấn đề
  
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
		# Thu thập log của các pod có vấn đề
  
	  - name: Display detailed logs
		when: bad_pods.stdout != ""
		debug:
		  msg: "{{ bad_pods_logs.stdout_lines | default(['No error logs or pods restarted.']) }}"
		# Hiển thị log chi tiết của các pod có vấn đề
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
  }
  
  // Hiển thị nội dung playbook
  function showPlaybookContentView() {
	const contentArea = document.getElementById('playbook-content-area');
	const executionArea = document.getElementById('playbook-execution-status');
  
	if (contentArea) contentArea.style.display = 'block';
	if (executionArea) executionArea.style.display = 'none';
  }
  
  // Hiển thị thực thi playbook
  function showPlaybookExecutionView() {
	const contentArea = document.getElementById('playbook-content-area');
	const executionArea = document.getElementById('playbook-execution-status');
  
	if (contentArea) contentArea.style.display = 'none';
	if (executionArea) executionArea.style.display = 'block';
  }
  
  // Tìm kiếm playbook
  function searchPlaybooks(query) {
	const items = document.querySelectorAll('#playbook-list .playbook-item');
	const searchTerm = query.toLowerCase().trim();
  
	items.forEach(item => {
	  const playbookName = item.textContent.toLowerCase();
	  const shouldShow = playbookName.includes(searchTerm);
  
	  const listItem = item.closest('.list-group-item');
	  if (listItem) {
		listItem.style.display = shouldShow ? 'flex' : 'none';
	  }
	});
  }
  
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
  function setCurrentClusterId(clusterId) {
	currentClusterId = clusterId;
  }
  
  // Xuất các hàm cho truy cập toàn cục
  window.loadPlaybook = loadPlaybook;
  window.savePlaybook = savePlaybook;
  window.deletePlaybook = deletePlaybook;
  window.executePlaybook = executePlaybook;
  window.uploadPlaybook = uploadPlaybook;
  window.refreshPlaybooks = refreshPlaybooks;
  window.searchPlaybooks = searchPlaybooks;
  window.showPlaybookContentView = showPlaybookContentView;
  window.showPlaybookExecutionView = showPlaybookExecutionView;
  window.setCurrentClusterId = setCurrentClusterId;
  window.generateK8sPlaybookFromTemplate = generateK8sPlaybookFromTemplate;
  
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
  