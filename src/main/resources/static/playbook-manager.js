// Playbook Manager - Quản lý playbook và template K8s
// =====================================================

// Use the global cluster id managed by admin.js
// Access via window.currentClusterId to avoid duplicate declarations

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
    } catch (_) {}
  }
  return cid;
}

// Load playbooks for current cluster (optional override)
async function loadPlaybooks(clusterIdOverride) {
  const cid = clusterIdOverride || getClusterId();
  if (!cid) {
    console.error('No cluster selected');
    return;
  }
  
  try {
    // Persist override to global if provided
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
    showAlert('error', 'Lỗi tải danh sách playbook: ' + error.message);
  }
}

// Load playbook content
window.loadPlaybook = async function(filename) {
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
    
    // Show content view and hide execution view
    showPlaybookContentView();
    
  } catch (error) {
    console.error('Error loading playbook:', error);
    showAlert('error', 'Lỗi tải playbook: ' + error.message);
  }
};

// Save playbook
window.savePlaybook = async function() {
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
    await loadPlaybooks(); // Refresh list
    
  } catch (error) {
    console.error('Error saving playbook:', error);
    showAlert('error', 'Lỗi lưu playbook: ' + error.message);
  }
};

// Delete playbook
window.deletePlaybook = async function(filename) {
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
    
    showAlert('success', 'Đã xóa playbook thành công');
    await loadPlaybooks(); // Refresh list
    
  } catch (error) {
    console.error('Error deleting playbook:', error);
    showAlert('error', 'Lỗi xóa playbook: ' + error.message);
  }
};

// Execute playbook
window.executePlaybook = async function(filename, extraVars = '') {
  const cid = getClusterId();
  if (!cid || !filename) return;
  
  try {
    // Show execution view and hide content view
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
    
    // Start monitoring execution status
    if (result.taskId) {
      monitorPlaybookExecution(result.taskId);
    }
    
    return result;
  } catch (error) {
    console.error('Error executing playbook:', error);
    showAlert('error', 'Lỗi thực thi playbook: ' + error.message);
    showPlaybookContentView(); // Show content view on error
    throw error;
  }
};

// Monitor playbook execution
async function monitorPlaybookExecution(taskId) {
  const outputElement = document.getElementById('ansible-output');
  const progressElement = document.getElementById('execution-progress');
  const spinnerElement = document.getElementById('execution-spinner');
  
  if (!outputElement || !progressElement || !spinnerElement) {
    console.error('Execution elements not found');
    return;
  }
  
  // Clear previous output
  outputElement.innerHTML = '';
  
  // Show progress and spinner
  progressElement.style.display = 'block';
  spinnerElement.style.display = 'inline-block';
  
  const checkStatus = async () => {
    try {
      const response = await fetch(`/api/ansible-playbook/status/${getClusterId()}/${taskId}`);
      if (!response.ok) {
        throw new Error('Failed to check status');
      }
      
      const status = await response.json();
      
      // Update progress bar
      const progressBar = progressElement.querySelector('.progress-bar');
      if (progressBar) {
        progressBar.style.width = `${status.progress || 0}%`;
        progressBar.setAttribute('aria-valuenow', status.progress || 0);
      }
      
      // Update output
      if (status.output && status.output.length > 0) {
        const newOutput = status.output.slice(outputElement.children.length);
        newOutput.forEach(line => {
          const lineElement = document.createElement('div');
          lineElement.className = 'output-line';
          
          // Color coding for different types of output
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
        
        // Scroll to bottom
        outputElement.scrollTop = outputElement.scrollHeight;
      }
      
      if (status.status === 'running') {
        setTimeout(checkStatus, 1000);
      } else {
        // Hide spinner
        spinnerElement.style.display = 'none';
        
        // Show completion message
        const summaryElement = document.createElement('div');
        summaryElement.className = 'text-success mt-3 border-top pt-2';
        summaryElement.innerHTML = `
          <div class="fw-bold">🎉 Hoàn thành thực thi playbook!</div>
          <div class="small text-white">Thời gian thực thi: ${Math.round((status.endTime - status.startTime) / 1000)}s</div>
        `;
        outputElement.appendChild(summaryElement);
      }
      
    } catch (error) {
      console.error('Error monitoring execution:', error);
      spinnerElement.style.display = 'none';
      
      const errorElement = document.createElement('div');
      errorElement.className = 'text-danger mt-3';
      errorElement.innerHTML = '<div class="fw-bold">⚠️ Lỗi kiểm tra trạng thái</div>';
      outputElement.appendChild(errorElement);
    }
  };
  
  checkStatus();
}

// Upload playbook
window.uploadPlaybook = async function(file) {
  const cid = getClusterId();
  if (!cid || !file) return;
  
  try {
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
    await loadPlaybooks(); // Refresh list
    
    // Load the uploaded playbook content
    await loadPlaybook(result.filename);
    
  } catch (error) {
    console.error('Error uploading playbook:', error);
    showAlert('error', 'Lỗi tải lên playbook: ' + error.message);
    throw error;
  }
};

// Generate K8s playbook from template
async function generateK8sPlaybook(template) {
  if (!getClusterId()) {
    throw new Error('Vui lòng chọn cluster trước');
  }
  
  const templates = {
    '01-update-hosts-hostname': `---
- name: Cập nhật /etc/hosts và hostname cho toàn bộ cluster
  hosts: all
  become: yes
  gather_facts: yes
  tasks:
    - name: Thêm tất cả node trong inventory vào /etc/hosts (chỉ khi chưa có)
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host | default(item) }} {{ hostvars[item].ansible_user }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_user is defined
      tags: addhosts
      
    - name: Đặt hostname theo inventory (nếu khác)
      hostname:
        name: "{{ hostvars[inventory_hostname].ansible_user }}"
      when: ansible_hostname != hostvars[inventory_hostname].ansible_user
      tags: sethostname
      
    - name: Kiểm tra hostname sau khi cập nhật
      command: hostnamectl
      register: host_info
      changed_when: false
      tags: verify
      
    - name: Hiển thị thông tin sau khi cập nhật
      debug:
        msg:
          - "Hostname hiện tại: {{ ansible_hostname }}"
          - "Kết quả lệnh hostnamectl:"
          - "{{ host_info.stdout_lines }}"
      tags: verify`,

    '03-prepare-k8s-and-containerd': `---
- name: ⚙️ Chuẩn bị môi trường Kubernetes: tắt swap, cấu hình sysctl, cài containerd, kubelet/kubeadm/kubectl
  hosts: all
  become: yes
  tasks:
    - name: Tắt swap ngay
      command: swapoff -a
      ignore_errors: yes

    - name: Comment dòng swap trong /etc/fstab (nếu có)
      replace:
        path: /etc/fstab
        regexp: "^(?!#)(.*\\sswap\\s+\\w+.*)$"
        replace: "# \\1"
      register: fstab_swap_edit
      changed_when: fstab_swap_edit is changed

    - name: Ghi /etc/modules-load.d/containerd.conf
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter
        owner: root
        group: root
        mode: '0644'

    - name: Tải kernel modules overlay, br_netfilter
      modprobe:
        name: "{{ item }}"
      loop:
        - overlay
        - br_netfilter

    - name: Tạo /etc/sysctl.d/kubernetes.conf
      copy:
        dest: /etc/sysctl.d/kubernetes.conf
        content: |
          net.bridge.bridge-nf-call-ip6tables = 1
          net.bridge.bridge-nf-call-iptables = 1
          net.ipv4.ip_forward = 1
        owner: root
        group: root
        mode: '0644'

    - name: Áp dụng sysctl
      command: sysctl --system

    - name: Cài đặt các gói cần thiết
      apt:
        name:
          - curl
          - gnupg2
          - software-properties-common
          - apt-transport-https
          - ca-certificates
          - lsb-release
        state: present
        update_cache: yes

    - name: Tạo thư mục keyrings nếu chưa có
      file:
        path: /etc/apt/keyrings
        state: directory
        mode: '0755'

    - name: Tải Docker GPG key
      get_url:
        url: https://download.docker.com/linux/ubuntu/gpg
        dest: /tmp/docker.gpg
        mode: '0644'

    - name: Cài Docker GPG key (dearmor)
      command: gpg --dearmor -o /etc/apt/keyrings/docker.gpg /tmp/docker.gpg
      args:
        creates: /etc/apt/keyrings/docker.gpg

    - name: Thêm Docker repository
      apt_repository:
        repo: "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu {{ ansible_distribution_release }} stable"
        state: present

    - name: Cài đặt containerd.io
      apt:
        name: containerd.io
        state: present
        update_cache: yes

    - name: Đảm bảo thư mục /etc/containerd tồn tại
      file:
        path: /etc/containerd
        state: directory

    - name: Sinh config mặc định cho containerd
      shell: containerd config default | tee /etc/containerd/config.toml >/dev/null
      args:
        creates: /etc/containerd/config.toml

    - name: Bật SystemdCgroup trong config containerd
      replace:
        path: /etc/containerd/config.toml
        regexp: '^\s*SystemdCgroup\s*=\s*false'
        replace: '            SystemdCgroup = true'

    - name: Restart + enable containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes

    - name: Tải Kubernetes GPG key
      get_url:
        url: https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key
        dest: /tmp/k8s.gpg
        mode: '0644'

    - name: Cài Kubernetes GPG key (dearmor)
      command: gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg /tmp/k8s.gpg
      args:
        creates: /etc/apt/keyrings/kubernetes-apt-keyring.gpg

    - name: Thêm Kubernetes repository
      apt_repository:
        repo: "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /"
        state: present

    - name: Cài đặt kubeadm, kubelet, kubectl
      apt:
        name:
          - kubeadm={{ kube_version | default('1.30.0-1.1') }}
          - kubelet={{ kube_version | default('1.30.0-1.1') }}
          - kubectl={{ kube_version | default('1.30.0-1.1') }}
        state: present
        update_cache: yes

    - name: Giữ phiên bản để tránh auto-update
      dpkg_selections:
        name: "{{ item }}"
        selection: hold
      loop:
        - kubeadm
        - kubelet
        - kubectl`,

    '04-init-master-calico': `---
- name: 🚀 Khởi tạo master và cài Calico CNI
  hosts: master
  become: yes
  tasks:
    - name: Khởi tạo cluster với kubeadm (CIDR Calico 192.168.0.0/16)
      shell: kubeadm init --pod-network-cidr=192.168.0.0/16
      register: kubeadm_init

    - name: Tạo thư mục .kube cho root
      file:
        path: /root/.kube
        state: directory
        mode: '0755'

    - name: Copy kubeconfig cho root
      copy:
        src: /etc/kubernetes/admin.conf
        dest: /root/.kube/config
        remote_src: yes
        owner: root
        group: root
        mode: '0600'

    - name: Xuất join command
      shell: kubeadm token create --print-join-command
      register: join_cmd
      changed_when: false

    - name: Lưu join command ra file /root/join.sh
      copy:
        dest: /root/join.sh
        content: "#!/bin/bash\n{{ join_cmd.stdout }}\n"
        mode: '0755'

    - name: Tải Calico operator manifest
      get_url:
        url: https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/tigera-operator.yaml
        dest: /tmp/tigera-operator.yaml

    - name: Cài Calico operator
      kubernetes.core.k8s:
        state: present
        src: /tmp/tigera-operator.yaml

    - name: Tải Calico custom resources
      get_url:
        url: https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/custom-resources.yaml
        dest: /tmp/custom-resources.yaml

    - name: Apply Calico custom resources
      kubernetes.core.k8s:
        state: present
        src: /tmp/custom-resources.yaml

    - name: Chờ Calico pods sẵn sàng
      kubernetes.core.k8s_info:
        api_version: v1
        kind: Pod
        namespace: tigera-operator
        wait: true
        wait_condition:
          type: Ready
          status: "True"
        wait_timeout: 300`,

    '05-join-worker': `---
- name: 🔗 Lấy join command từ master
  hosts: master
  become: yes
  gather_facts: no
  tasks:
    - name: Tạo join command
      shell: kubeadm token create --print-join-command
      register: join_cmd
    - name: Gán join command cho hostvars master
      set_fact:
        cluster_join_cmd: "{{ join_cmd.stdout }}"

- name: 🔗 Join worker vào cluster
  hosts: workers
  become: yes
  gather_facts: no
  tasks:
    - name: Thực thi join command
      shell: "{{ hostvars[groups['master'][0]].cluster_join_cmd }}"
      args:
        warn: false
      register: join_out
    - name: Kết quả
      debug:
        var: join_out.stdout
      when: join_out.stdout is defined`,

    '06-install-flannel': `---
- name: 🌐 Cài Flannel CNI
  hosts: master
  become: yes
  tasks:
    - name: Tải Flannel manifest
      get_url:
        url: https://raw.githubusercontent.com/flannel-io/flannel/v0.25.5/Documentation/kube-flannel.yml
        dest: /tmp/kube-flannel.yml
    - name: Apply Flannel manifest
      kubernetes.core.k8s:
        state: present
        src: /tmp/kube-flannel.yml`,

    '07-verify-cluster': `---
- name: ✅ Kiểm tra trạng thái cụm
  hosts: master
  become: yes
  tasks:
    - name: Kubectl get nodes
      shell: kubectl get nodes -o wide
      register: nodes
      changed_when: false
    - name: Kubectl get pods all namespaces
      shell: kubectl get pods -A -o wide
      register: pods
      changed_when: false
    - name: Hiển thị kết quả
      debug:
        msg:
          - "Nodes:\n{{ nodes.stdout }}"
          - "Pods:\n{{ pods.stdout }}"`,

    '08-reset-cluster': `---
- name: 🧹 Reset cluster K8s
  hosts: all
  become: yes
  tasks:
    - name: kubeadm reset
      shell: kubeadm reset --force
      ignore_errors: yes
    - name: Xóa /etc/kubernetes
      file:
        path: /etc/kubernetes
        state: absent
    - name: Restart containerd & kubelet nếu tồn tại
      systemd:
        name: "{{ item }}"
        state: restarted
      loop:
        - containerd
        - kubelet`,

    '10-reboot-all': `---
- name: 🔄 Reboot tất cả node
  hosts: all
  become: yes
  tasks:
    - name: Reboot
      reboot:
        reboot_timeout: 600`,

    '11-check-containerd': `---
- name: Kiểm tra service containerd
  hosts: all
  become: yes
  tasks:
    - name: Trạng thái containerd
      shell: systemctl is-active containerd || true
      register: st
      changed_when: false
    - debug:
        msg: "containerd: {{ st.stdout }}"`,

    '12-check-kubelet': `---
- name: Kiểm tra service kubelet
  hosts: all
  become: yes
  tasks:
    - name: Trạng thái kubelet
      shell: systemctl is-active kubelet || true
      register: st
      changed_when: false
    - debug:
        msg: "kubelet: {{ st.stdout }}"`,
    '02-install-containerd': `---
- name: Cài đặt containerd
  hosts: all
  become: yes
  tasks:
    - name: Cài đặt các package cần thiết
      apt:
        name:
          - apt-transport-https
          - ca-certificates
          - curl
          - gnupg
          - lsb-release
        state: present
        update_cache: yes
        
    - name: Tải Docker GPG key
      get_url:
        url: https://download.docker.com/linux/ubuntu/gpg
        dest: /tmp/docker.gpg
        mode: '0644'
        
    - name: Thêm Docker GPG key
      shell: gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg /tmp/docker.gpg
      
    - name: Thêm Docker repository
      apt_repository:
        repo: "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu {{ ansible_distribution_release }} stable"
        state: present
        update_cache: yes
        
    - name: Cài đặt containerd
      apt:
        name: containerd.io
        state: present
        
    - name: Tạo thư mục config cho containerd
      file:
        path: /etc/containerd
        state: directory
        
    - name: Tạo config cho containerd
      copy:
        content: |
          version = 2
          [plugins."io.containerd.grpc.v1.cri"]
            [plugins."io.containerd.grpc.v1.cri".containerd]
              [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]
                [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
                  runtime_type = "io.containerd.runc.v2"
                  [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
                    SystemdCgroup = true
        dest: /etc/containerd/config.toml
        
    - name: Restart containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes`,

    '03-prepare-k8s-environment': `---
- name: Chuẩn bị môi trường K8s
  hosts: all
  become: yes
  tasks:
    - name: Tắt swap
      shell: swapoff -a
      
    - name: Comment out swap trong /etc/fstab
      lineinfile:
        path: /etc/fstab
        regexp: '^([^#].*\\sswap\\s+sw\\s+.*)$'
        line: '#\\1'
        backup: yes
        
    - name: Load kernel modules
      modprobe:
        name: "{{ item }}"
      loop:
        - br_netfilter
        - overlay
        
    - name: Enable kernel modules
      lineinfile:
        path: /etc/modules-load.d/k8s.conf
        line: "{{ item }}"
        create: yes
      loop:
        - br_netfilter
        - overlay
        
    - name: Configure sysctl
      sysctl:
        name: "{{ item.key }}"
        value: "{{ item.value }}"
        state: present
        reload: yes
      loop:
        - { key: 'net.bridge.bridge-nf-call-ip6tables', value: '1' }
        - { key: 'net.bridge.bridge-nf-call-iptables', value: '1' }
        - { key: 'net.ipv4.ip_forward', value: '1' }`,

    '04-install-kubeadm': `---
- name: Cài đặt kubeadm, kubelet và kubectl
  hosts: all
  become: yes
  tasks:
    - name: Tải Kubernetes GPG key
      get_url:
        url: https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key
        dest: /tmp/k8s.gpg
        mode: '0644'
        
    - name: Thêm Kubernetes GPG key
      shell: gpg --dearmor -o /usr/share/keyrings/kubernetes-archive-keyring.gpg /tmp/k8s.gpg
      
    - name: Thêm Kubernetes repository
      apt_repository:
        repo: "deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /"
        state: present
        update_cache: yes
        
    - name: Cài đặt kubeadm, kubelet, kubectl
      apt:
        name:
          - kubeadm={{ kube_version | default('1.30.0-1.1') }}
          - kubelet={{ kube_version | default('1.30.0-1.1') }}
          - kubectl={{ kube_version | default('1.30.0-1.1') }}
        state: present
        
    - name: Hold kubeadm, kubelet, kubectl để tránh auto-update
      dpkg_selections:
        name: "{{ item }}"
        selection: hold
      loop:
        - kubeadm
        - kubelet
        - kubectl
        
    - name: Enable kubelet service
      systemd:
        name: kubelet
        enabled: yes`,

    '05-init-master': `---
- name: Khởi tạo master node
  hosts: master
  become: yes
  tasks:
    - name: Khởi tạo cluster với kubeadm
      shell: kubeadm init --pod-network-cidr=10.244.0.0/16
      register: kubeadm_init
      
    - name: Tạo thư mục .kube cho root
      file:
        path: /root/.kube
        state: directory
        mode: '0755'
        
    - name: Copy kubeconfig
      copy:
        src: /etc/kubernetes/admin.conf
        dest: /root/.kube/config
        remote_src: yes
        owner: root
        group: root
        mode: '0600'
        
    - name: Hiển thị join command
      debug:
        msg: "{{ kubeadm_init.stdout_lines[-1] }}"`,

    '06-install-cni': `---
- name: Cài đặt CNI (Calico)
  hosts: master
  become: yes
  tasks:
    - name: Tải Calico manifest
      get_url:
        url: https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/tigera-operator.yaml
        dest: /tmp/tigera-operator.yaml
        
    - name: Apply Calico operator
      kubernetes.core.k8s:
        state: present
        src: /tmp/tigera-operator.yaml
        
    - name: Tải Calico custom resources
      get_url:
        url: https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/custom-resources.yaml
        dest: /tmp/calico-custom-resources.yaml
        
    - name: Apply Calico custom resources
      kubernetes.core.k8s:
        state: present
        src: /tmp/calico-custom-resources.yaml
        
    - name: Chờ Calico pods ready
      kubernetes.core.k8s_info:
        api_version: v1
        kind: Pod
        namespace: tigera-operator
        wait: true
        wait_condition:
          type: Ready
          status: "True"
        wait_timeout: 300`,

    '07-join-workers': `---
- name: Thêm worker nodes
  hosts: workers
  become: yes
  tasks:
    - name: Join worker node vào cluster
      shell: "{{ hostvars[groups['master'][0]]['kubeadm_init']['stdout_lines'][-1] }}"
      register: join_result
      
    - name: Hiển thị thông báo join thành công
      debug:
        msg: "Worker node {{ inventory_hostname }} đã join thành công"`,

    '08-install-ingress': `---
- name: Cài đặt NGINX Ingress Controller
  hosts: master
  become: yes
  tasks:
    - name: Tải NGINX Ingress Controller manifest
      get_url:
        url: https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
        dest: /tmp/nginx-ingress.yaml
        
    - name: Apply NGINX Ingress Controller
      kubernetes.core.k8s:
        state: present
        src: /tmp/nginx-ingress.yaml
        
    - name: Chờ Ingress Controller ready
      kubernetes.core.k8s_info:
        api_version: v1
        kind: Pod
        namespace: ingress-nginx
        wait: true
        wait_condition:
          type: Ready
          status: "True"
        wait_timeout: 300`,

    '09-install-helm': `---
- name: Cài đặt Helm
  hosts: master
  become: yes
  tasks:
    - name: Tải Helm script
      get_url:
        url: https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
        dest: /tmp/get_helm.sh
        mode: '0755'
        
    - name: Chạy Helm installation script
      shell: /tmp/get_helm.sh
      
    - name: Verify Helm installation
      shell: helm version
      register: helm_version
      
    - name: Hiển thị Helm version
      debug:
        msg: "{{ helm_version.stdout }}"`,

    '10-setup-storage': `---
- name: Thiết lập storage cho K8s
  hosts: master
  become: yes
  tasks:
    - name: Tạo storage class
      kubernetes.core.k8s:
        definition:
          apiVersion: storage.k8s.io/v1
          kind: StorageClass
          metadata:
            name: local-storage
          provisioner: kubernetes.io/no-provisioner
          volumeBindingMode: WaitForFirstConsumer`,

    '11-deploy-nginx': `---
- name: Deploy Nginx application
  hosts: master
  become: yes
  tasks:
    - name: Tạo nginx deployment
      kubernetes.core.k8s:
        definition:
          apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: nginx-deployment
            labels:
              app: nginx
          spec:
            replicas: 3
            selector:
              matchLabels:
                app: nginx
            template:
              metadata:
                labels:
                  app: nginx
              spec:
                containers:
                - name: nginx
                  image: nginx:1.14.2
                  ports:
                  - containerPort: 80
                  
    - name: Tạo nginx service
      kubernetes.core.k8s:
        definition:
          apiVersion: v1
          kind: Service
          metadata:
            name: nginx-service
          spec:
            selector:
              app: nginx
            ports:
            - protocol: TCP
              port: 80
              targetPort: 80
            type: LoadBalancer`,

    '12-reset-cluster': `---
- name: Reset cluster K8s
  hosts: all
  become: yes
  tasks:
    - name: Reset kubeadm
      shell: kubeadm reset --force
      ignore_errors: yes
      
    - name: Xóa thư mục .kube
      file:
        path: /root/.kube
        state: absent
        
    - name: Xóa thư mục /etc/kubernetes
      file:
        path: /etc/kubernetes
        state: absent
        
    - name: Restart containerd
      systemd:
        name: containerd
        state: restarted
        
    - name: Restart kubelet
      systemd:
        name: kubelet
        state: restarted
        
    - name: Restart systemd-resolved
      systemd:
        name: systemd-resolved
        state: restarted`
  };
  
  const playbookContent = templates[template];
  if (!playbookContent) {
    throw new Error('Template không tồn tại');
  }
  
  const filename = template + '.yml';
  
  // Thay thế cluster_id trong playbook content nếu có
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
    console.error('Error generating K8s playbook:', error);
    throw error;
  }
}

// Show playbook content view
function showPlaybookContentView() {
  const contentArea = document.getElementById('playbook-content-area');
  const executionArea = document.getElementById('playbook-execution-status');
  
  if (contentArea) contentArea.style.display = 'block';
  if (executionArea) executionArea.style.display = 'none';
}

// Show playbook execution view
function showPlaybookExecutionView() {
  const contentArea = document.getElementById('playbook-content-area');
  const executionArea = document.getElementById('playbook-execution-status');
  
  if (contentArea) contentArea.style.display = 'none';
  if (executionArea) executionArea.style.display = 'block';
}

// Search playbooks
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

// Refresh playbooks
window.refreshPlaybooks = async function() {
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
      refreshBtn.innerHTML = '🔄 Làm mới';
    }
  }
};

// Set current cluster ID
function setCurrentClusterId(clusterId) {
  currentClusterId = clusterId;
}

// Export functions for global access
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
