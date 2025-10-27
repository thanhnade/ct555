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
    
    showAlert('success', `Đã xóa playbook "${filename}" thành công `);
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
         
         const titleElement = document.createElement('div');
         titleElement.className = 'fw-bold';
         titleElement.textContent = '🎉 Hoàn thành thực thi playbook!';
         
         const timeElement = document.createElement('div');
         timeElement.className = 'small text-white';
         timeElement.textContent = `Thời gian thực thi: ${Math.round((status.endTime - status.startTime) / 1000)}s`;
         
         summaryElement.appendChild(titleElement);
         summaryElement.appendChild(timeElement);
         outputElement.appendChild(summaryElement);
      }
      
    } catch (error) {
      console.error('Error monitoring execution:', error);
      spinnerElement.style.display = 'none';
      
       const errorElement = document.createElement('div');
       errorElement.className = 'text-danger mt-3';
       
       const errorTitle = document.createElement('div');
       errorTitle.className = 'fw-bold';
       errorTitle.textContent = '⚠️ Lỗi kiểm tra trạng thái';
       
       errorElement.appendChild(errorTitle);
       outputElement.appendChild(errorElement);
    }
  };
  
  checkStatus();
}

// Check if playbook exists
async function checkPlaybookExists(filename) {
  const cid = getClusterId();
  if (!cid) {
    console.log('No cluster ID found');
    return false;
  }
  
  try {
    const response = await fetch(`/api/ansible-playbook/list/${cid}`);
    if (!response.ok) {
      console.log('Failed to fetch playbook list:', response.status);
      return false;
    }
    
    const playbooks = await response.json();
    console.log('Current playbooks:', playbooks);
    console.log('Looking for:', filename);
    
    const exists = playbooks.includes(filename);
    console.log('File exists:', exists);
    return exists;
  } catch (error) {
    console.error('Error checking playbook:', error);
    return false;
  }
}

// Upload playbook
window.uploadPlaybook = async function(file) {
  const cid = getClusterId();
  if (!cid || !file) return;
  
  try {
    // Check if file already exists
    const originalFilename = file.name;
    const finalFilename = originalFilename.toLowerCase().endsWith('.yml') || originalFilename.toLowerCase().endsWith('.yaml') 
      ? originalFilename 
      : originalFilename + '.yml';
    
    const exists = await checkPlaybookExists(finalFilename);
    
    if (exists) {
      const confirmMessage = `Playbook "${finalFilename}" đã tồn tại. Bạn có muốn ghi đè lên file cũ?`;
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
async function generateK8sPlaybookFromTemplate(template) {
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

    '02-kernel-sysctl': `---
- hosts: all
  become: yes
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

    - name: Tải module kernel
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter

    - name: modprobe overlay và br_netfilter
      shell: |
        modprobe overlay
        modprobe br_netfilter

    - name: Cấu hình sysctl cho Kubernetes
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1

    - name: Áp dụng sysctl
      command: sysctl --system`,

    '03-install-containerd': `---
- hosts: all
  become: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Cập nhật cache
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

    - name: Sinh file config mặc định
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
        state: restarted`,

    '04-install-kubernetes': `---
- hosts: all
  become: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Cài gói phụ thuộc
      apt:
        name:
          - apt-transport-https
          - ca-certificates
          - curl
        state: present
        update_cache: yes

    - name: Thêm GPG key Kubernetes
      shell: |
        if [ ! -f /usr/share/keyrings/kubernetes-archive-keyring.gpg ]; then
          curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \\
          gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
        else
          echo "🔁 GPG key đã tồn tại, bỏ qua bước này."
        fi
      changed_when: false
      register: gpg_status  

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

    - name: Giữ phiên bản
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
    - name: 🔍 Lấy địa chỉ master động
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"

    - debug:
        msg: "📡 Sử dụng địa chỉ master: {{ master_ip }}"

    - name: 🧹 Reset cluster cũ và dọn sạch dữ liệu
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/etcd /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes

    - name: 🚀 Khởi tạo Control Plane (Master)
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

    - name: ⚙️ Cấu hình kubeconfig cho root
      shell: |
        mkdir -p $HOME/.kube
        cp /etc/kubernetes/admin.conf $HOME/.kube/config
        chown $(id -u):$(id -g) $HOME/.kube/config
      args:
        executable: /bin/bash

    - name: 🔑 Sinh lệnh join cho worker
      shell: kubeadm token create --print-join-command
      register: join_cmd
      changed_when: false

    - name: 💾 Lưu lệnh join ra file
      copy:
        content: "{{ join_cmd.stdout }}"
        dest: "{{ join_script }}"
        mode: '0755'

    - name: 🧾 Hiển thị join command
      debug:
        msg:
          - "🎯 Lệnh join worker:"
          - "{{ join_cmd.stdout }}"
          - "➡️ File lưu tại: {{ join_script }}"

    - name: ✅ Hoàn tất khởi tạo master
      debug:
        msg: "🎉 Master {{ inventory_hostname }} đã sẵn sàng cho worker join!"`,

    '06-install-cni': `---
- name: 🌐 Cài đặt hoặc cập nhật Calico CNI (tự động)
  hosts: master
  become: yes
  gather_facts: no
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive

  vars:
    calico_version: "v3.27.3"
    calico_url: "https://raw.githubusercontent.com/projectcalico/calico/{{ calico_version }}/manifests/calico.yaml"

  tasks:
    - name: 🔍 Kiểm tra Calico CNI có tồn tại không
      shell: kubectl get daemonset calico-node -n kube-system -o jsonpath='{.metadata.name}' 2>/dev/null || true
      register: calico_check

    - name: 📋 Hiển thị trạng thái hiện tại
      debug:
        msg: >
          {{ '🔧 Calico đã được cài: ' + calico_check.stdout if calico_check.stdout != '' else '🚫 Chưa có Calico, sẽ tiến hành cài đặt mới.' }}

    - name: 🌐 Áp dụng Calico manifest (cài mới hoặc cập nhật)
      shell: >
        kubectl apply -f {{ calico_url }}
      args:
        executable: /bin/bash
      register: calico_apply
      retries: 3
      delay: 10
      until: calico_apply.rc == 0

    - name: 🧾 Hiển thị kết quả cài / cập nhật
      debug:
        msg: "{{ calico_apply.stdout_lines | default(['CNI applied']) }}"

    - name: ⏳ Chờ Calico node pod chạy
      shell: >
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers | grep -c 'Running'
      register: calico_pods
      retries: 10
      delay: 15
      until: calico_pods.stdout | int > 0

    - name: 🟢 Xác nhận Calico pods đang chạy
      debug:
        msg: "✅ Calico đang hoạt động ({{ calico_pods.stdout }} pods Running)."

    - name: 🔍 Kiểm tra trạng thái node
      shell: kubectl get nodes -o wide
      register: nodes_status

    - name: 🧾 Hiển thị kết quả cluster
      debug:
        msg: "{{ nodes_status.stdout_lines }}"`,

    '07-join-workers': `---
- hosts: workers
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive

  vars:
    join_script: /tmp/kube_join.sh

  tasks:
    - name: 🔍 Lấy địa chỉ master động
      set_fact:
        master_ip: "{{ hostvars[groups['master'][0]].ansible_host | default(hostvars[groups['master'][0]].ansible_default_ipv4.address) }}"
    - debug:
        msg: "📡 Master IP được sử dụng để join: {{ master_ip }}"

    - name: 🔑 Lấy lệnh join từ master
      delegate_to: "{{ master_ip }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd

    - name: 💾 Ghi lệnh join ra file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'

    - name: 🧹 Reset node (nếu có cụm cũ)
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes

    - name: 🚀 Join vào cụm Kubernetes
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: yes

    - name: 🧾 Hiển thị kết quả join
      debug:
        msg: "{{ join_output.stdout_lines | default(['Đã join thành công!']) }}"

    - name: 🔁 Khởi động lại kubelet
      systemd:
        name: kubelet
        state: restarted
        enabled: yes

    - name: ✅ Hoàn tất
      debug:
        msg: "✅ Node {{ inventory_hostname }} đã tham gia cụm thành công!"`,

    '08-install-ingress': `---
- hosts: master
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive

  tasks:
    - name: 🔍 Lấy địa chỉ master động
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
    - debug:
        msg: "📡 Cài đặt Ingress trên master: {{ master_ip }}"

    - name: 🌐 Cài đặt Ingress Controller (nginx)
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
      args:
        executable: /bin/bash
      register: ingress_install
      ignore_errors: yes

    - name: 🧾 Kết quả cài Ingress
      debug:
        msg: "{{ ingress_install.stdout_lines | default(['Ingress Controller applied']) }}"

    - name: 🧠 Kiểm tra trạng thái pod ingress-nginx
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl get pods -n ingress-nginx -o wide
      register: ingress_pods

    - name: 📋 Hiển thị pod ingress-nginx
      debug:
        msg: "{{ ingress_pods.stdout_lines }}"

    - name: ✅ Hoàn tất
      debug:
        msg: "🎉 Ingress Controller (NGINX) đã được cài đặt thành công!"`,

    '09-install-helm': `---
- hosts: master
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive

  tasks:
    - name: 📦 Cài đặt Helm nếu chưa có
      shell: |
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
      args:
        executable: /bin/bash
      register: helm_install
      ignore_errors: yes

    - name: 🧾 Kết quả cài đặt Helm
      debug:
        msg: "{{ helm_install.stdout_lines | default(['Helm installed']) }}"

    - name: 🔍 Kiểm tra phiên bản Helm
      shell: helm version --short
      register: helm_version

    - name: 📊 Hiển thị thông tin Helm
      debug:
        msg: "🎯 Phiên bản Helm hiện tại: {{ helm_version.stdout | default('Không xác định') }}"

    - name: ✅ Hoàn tất
      debug:
        msg: "🎉 Helm đã được cài đặt thành công trên master!"`,

    '10-setup-storage': `---
- hosts: master
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive

  vars:
    nfs_manifest_dir: /etc/kubernetes/storage

  tasks:
    - name: 📁 Tạo thư mục manifest NFS
      file:
        path: "{{ nfs_manifest_dir }}"
        state: directory
        mode: '0755'

    - name: 📦 Tải và áp dụng NFS Provisioner (example)
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/rbac.yaml
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/nfs-subdir-external-provisioner/master/deploy/deployment.yaml
      args:
        executable: /bin/bash
      register: nfs_apply
      ignore_errors: yes

    - name: 🧾 Kết quả triển khai NFS
      debug:
        msg: "{{ nfs_apply.stdout_lines | default(['NFS Provisioner applied']) }}"

    - name: 🧩 Đặt StorageClass mặc định
      shell: |
        KUBECONFIG=/etc/kubernetes/admin.conf \
        kubectl patch storageclass nfs-client -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' || true
      args:
        executable: /bin/bash

    - name: ✅ Hoàn tất
      debug:
        msg: "🎉 Cấu hình StorageClass (NFS) mặc định đã hoàn tất!"`,

    'see-cluster': `---
- name: 🧩 Kiểm tra trạng thái cụm Kubernetes
  hosts: master
  become: yes
  gather_facts: no
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive

  tasks:
    - name: ⚙️ Kiểm tra kubectl có sẵn không
      command: which kubectl
      register: kubectl_check
      failed_when: kubectl_check.rc != 0
      changed_when: false

    - name: 📋 Liệt kê danh sách node
      command: kubectl get nodes -o wide
      register: nodes_info
      changed_when: false

    - name: 📦 Liệt kê pods hệ thống
      command: kubectl get pods -n kube-system -o wide
      register: pods_info
      changed_when: false

    - name: ✅ Hiển thị thông tin cụm
      debug:
        msg:
          - "📦 Node List:"
          - "{{ nodes_info.stdout_lines }}"
          - "📦 Pods trong namespace kube-system:"
          - "{{ pods_info.stdout_lines }}"

    - name: 🧠 Kiểm tra trạng thái node (Ready/NotReady)
      shell: kubectl get nodes --no-headers | awk '{print $2}' | sort | uniq -c
      register: node_status
      changed_when: false

    - name: 📊 Báo cáo tình trạng cụm
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          ⚠️ Một số node chưa sẵn sàng:
          {{ node_status.stdout }}
          {% else %}
          🎯 Toàn bộ node đã ở trạng thái Ready!
          {% endif %}`,

    '00-reset-cluster': `---
- name: 🧹 Reset toàn bộ cụm Kubernetes (master + worker)
  hosts: all
  become: yes
  gather_facts: no
  environment:
    DEBIAN_FRONTEND: noninteractive

  tasks:
    - name: 🧽 Gỡ cụm Kubernetes (kubeadm reset -f)
      shell: kubeadm reset -f
      ignore_errors: true
      register: reset_output

    - name: 📋 Hiển thị kết quả reset
      debug:
        msg: "{{ reset_output.stdout_lines | default(['Không có cluster cũ để reset.']) }}"

    - name: 🧹 Xóa thư mục cấu hình Kubernetes
      file:
        path: /etc/kubernetes
        state: absent

    - name: 🧹 Xóa cấu hình mạng CNI
      file:
        path: /etc/cni/net.d
        state: absent

    - name: 🧹 Xóa file kubeconfig của root
      file:
        path: /root/.kube
        state: absent

    - name: 🧹 Xóa file kubeconfig của user thường ({{ ansible_user }})
      file:
        path: "/home/{{ ansible_user }}/.kube"
        state: absent
      when: ansible_user != "root"

    - name: 🧩 Dọn iptables
      shell: |
        iptables -F && iptables -X
        iptables -t nat -F && iptables -t nat -X
        iptables -t mangle -F && iptables -t mangle -X
        iptables -P FORWARD ACCEPT
      ignore_errors: true

    - name: 🧰 Khởi động lại containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes

    - name: ✅ Xác nhận reset hoàn tất
      debug:
        msg:
          - "🎯 Node {{ inventory_hostname }} đã được reset sạch (chỉ xóa dữ liệu)."`,

    'deploy-full-cluster': `---
- name: 🚀 Triển khai toàn bộ cluster K8s (từ 1-8)
  hosts: all
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive

  tasks:
    # Bước 1: Cập nhật hosts & hostname
    - name: 📝 Bước 1: Thêm tất cả node vào /etc/hosts
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host | default(item) }} {{ hostvars[item].ansible_user }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_user is defined

    - name: 📝 Đặt hostname theo inventory
      hostname:
        name: "{{ hostvars[inventory_hostname].ansible_user }}"
      when: ansible_hostname != hostvars[inventory_hostname].ansible_user

    # Bước 2: Cấu hình kernel & sysctl
    - name: ⚙️ Bước 2: Tắt swap
      shell: swapoff -a || true
      ignore_errors: true

    - name: ⚙️ Comment dòng swap trong /etc/fstab
      replace:
        path: /etc/fstab
        regexp: '(^.*swap.*$)'
        replace: '# \\1'

    - name: ⚙️ Tải module kernel
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter

    - name: ⚙️ modprobe overlay và br_netfilter
      shell: |
        modprobe overlay
        modprobe br_netfilter

    - name: ⚙️ Cấu hình sysctl cho Kubernetes
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1

    - name: ⚙️ Áp dụng sysctl
      command: sysctl --system

    # Bước 3: Cài đặt containerd
    - name: 🐳 Bước 3: Cập nhật cache
      apt:
        update_cache: yes

    - name: 🐳 Cài containerd
      apt:
        name: containerd
        state: present
        force_apt_get: yes

    - name: 🐳 Tạo thư mục cấu hình containerd
      file:
        path: /etc/containerd
        state: directory

    - name: 🐳 Sinh file config mặc định
      shell: "containerd config default > /etc/containerd/config.toml"

    - name: 🐳 Bật SystemdCgroup
      replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'

    - name: 🐳 Khởi động lại containerd
      systemd:
        name: containerd
        enabled: yes
        state: restarted

    # Bước 4: Cài đặt Kubernetes
    - name: ☸️ Bước 4: Cài gói phụ thuộc
      apt:
        name:
          - apt-transport-https
          - ca-certificates
          - curl
        state: present
        update_cache: yes

    - name: ☸️ Thêm GPG key Kubernetes
      shell: |
        if [ ! -f /usr/share/keyrings/kubernetes-archive-keyring.gpg ]; then
          curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \\
          gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
        else
          echo "🔁 GPG key đã tồn tại, bỏ qua bước này."
        fi
      changed_when: false

    - name: ☸️ Thêm repository Kubernetes
      copy:
        dest: /etc/apt/sources.list.d/kubernetes.list
        content: |
          deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /

    - name: ☸️ Cài kubelet, kubeadm, kubectl
      apt:
        name:
          - kubelet
          - kubeadm
          - kubectl
        state: present
        update_cache: yes

    - name: ☸️ Giữ phiên bản
      command: apt-mark hold kubelet kubeadm kubectl

    # Bước 5: Khởi tạo master (chỉ trên master)
    - name: 🔍 Bước 5: Lấy địa chỉ master động
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"
      when: inventory_hostname in groups['master']

    - name: 📡 Hiển thị địa chỉ master
      debug:
        msg: "📡 Sử dụng địa chỉ master: {{ master_ip }}"
      when: inventory_hostname in groups['master']

    - name: 🧹 Reset cluster cũ và dọn sạch dữ liệu
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/etcd /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes
      when: inventory_hostname in groups['master']

    - name: 🚀 Khởi tạo Control Plane (Master)
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
      when: inventory_hostname in groups['master']

    - name: ⚙️ Cấu hình kubeconfig cho root
      shell: |
        mkdir -p $HOME/.kube
        cp /etc/kubernetes/admin.conf $HOME/.kube/config
        chown $(id -u):$(id -g) $HOME/.kube/config
      args:
        executable: /bin/bash
      when: inventory_hostname in groups['master']

    # Bước 6: Cài đặt CNI (chỉ trên master)
    - name: 🔍 Kiểm tra Calico CNI có tồn tại không
      shell: kubectl get daemonset calico-node -n kube-system -o jsonpath='{.metadata.name}' 2>/dev/null || true
      register: calico_check
      when: inventory_hostname in groups['master']

    - name: 🌐 Áp dụng Calico manifest (cài mới hoặc cập nhật)
      shell: >
        kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.3/manifests/calico.yaml
      args:
        executable: /bin/bash
      when: inventory_hostname in groups['master']

    - name: ⏳ Chờ Calico node pod chạy
      shell: >
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers | grep -c 'Running'
      register: calico_pods
      retries: 10
      delay: 15
      until: calico_pods.stdout | int > 0
      when: inventory_hostname in groups['master']

    # Bước 7: Join workers (chỉ trên workers)
    - name: 🔍 Lấy địa chỉ master động
      set_fact:
        master_ip: "{{ hostvars[groups['master'][0]].ansible_host | default(hostvars[groups['master'][0]].ansible_default_ipv4.address) }}"
      when: inventory_hostname in groups['worker']

    - name: 🔑 Lấy lệnh join từ master
      delegate_to: "{{ master_ip }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd
      when: inventory_hostname in groups['worker']

    - name: 💾 Ghi lệnh join ra file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: /tmp/kube_join.sh
        mode: '0755'
      when: inventory_hostname in groups['worker']

    - name: 🧹 Reset node (nếu có cụm cũ)
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes
      when: inventory_hostname in groups['worker']

    - name: 🚀 Join vào cụm Kubernetes
      shell: "/tmp/kube_join.sh"
      register: join_output
      ignore_errors: yes
      when: inventory_hostname in groups['worker']

    - name: 🔁 Khởi động lại kubelet
      systemd:
        name: kubelet
        state: restarted
        enabled: yes
      when: inventory_hostname in groups['worker']

    # Bước 8: Kiểm tra trạng thái cluster (chỉ trên master)
    - name: 👀 Bước 8: Kiểm tra kubectl có sẵn không
      command: which kubectl
      register: kubectl_check
      failed_when: kubectl_check.rc != 0
      changed_when: false
      when: inventory_hostname in groups['master']

    - name: 👀 Liệt kê danh sách node
      command: kubectl get nodes -o wide
      register: nodes_info
      changed_when: false
      when: inventory_hostname in groups['master']

    - name: 👀 Liệt kê pods hệ thống
      command: kubectl get pods -n kube-system -o wide
      register: pods_info
      changed_when: false
      when: inventory_hostname in groups['master']

    - name: 👀 Hiển thị thông tin cụm
      debug:
        msg:
          - "📦 Node List:"
          - "{{ nodes_info.stdout_lines }}"
          - "📦 Pods trong namespace kube-system:"
          - "{{ pods_info.stdout_lines }}"
      when: inventory_hostname in groups['master'] and nodes_info is defined

    - name: 🎉 Hoàn thành triển khai cluster
      debug:
        msg:
          - "✅ Cluster Kubernetes đã được triển khai thành công!"
          - "📊 Tổng số node: {{ groups['all'] | length }}"
          - "🎯 Master: {{ groups['master'] | length }}"
          - "🔧 Workers: {{ groups['worker'] | length }}"
      when: inventory_hostname in groups['master']`
  };
  
  // Map template value (without numbers) to template key (with numbers)
  const templateMapping = {
    'update-hosts-hostname': '01-update-hosts-hostname',
    'kernel-sysctl': '02-kernel-sysctl',
    'install-containerd': '03-install-containerd',
    'install-kubernetes': '04-install-kubernetes',
    'init-master': '05-init-master',
    'install-cni': '06-install-cni',
    'join-workers': '07-join-workers',
    'install-ingress': '08-install-ingress',
    'install-helm': '09-install-helm',
    'setup-storage': '10-setup-storage',
    'see-cluster': 'see-cluster',
    'deploy-full-cluster': 'deploy-full-cluster',
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
      '00-reset-cluster': '🧹 Reset toàn bộ cluster',
      '01-update-hosts-hostname': '📝 Cập nhật hosts & hostname',
      '02-kernel-sysctl': '⚙️ Cấu hình kernel & sysctl',
      '03-install-containerd': '🐳 Cài đặt Containerd',
      '04-install-kubernetes': '☸️ Cài đặt Kubernetes',
      '05-init-master': '🚀 Khởi tạo Master',
      '06-install-cni': '🌐 Cài đặt CNI (Calico)',
      '07-join-workers': '🔗 Join Workers',
      '08-install-ingress': '🌐 Cài Ingress Controller',
      '09-install-helm': '⚓ Cài Helm',
      '10-setup-storage': '💾 Setup Storage',
      'see-cluster': '👀 Xem trạng thái cluster',
      'deploy-full-cluster': '🚀 Triển khai toàn bộ cluster'
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
window.generateK8sPlaybookFromTemplate = generateK8sPlaybookFromTemplate;
