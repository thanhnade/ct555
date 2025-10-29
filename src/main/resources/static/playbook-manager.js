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

    - name: 👤 Cấu hình kubeconfig cho người dùng thường ({{ ansible_user }})
      when: ansible_user != "root"
      block:
        - name: 📁 Tạo thư mục kubeconfig cho user
          file:
            path: "/home/{{ ansible_user }}/.kube"
            state: directory
            mode: '0755'

        - name: 📦 Sao chép kubeconfig cho user
          copy:
            src: /etc/kubernetes/admin.conf
            dest: "/home/{{ ansible_user }}/.kube/config"
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0600'
            remote_src: yes

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
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive

  vars:
    calico_version: "v3.27.3"
    calico_url: "https://raw.githubusercontent.com/projectcalico/calico/{{ calico_version }}/manifests/calico.yaml"

  tasks:
    - name: 🔍 Kiểm tra Calico CNI có tồn tại không
      command: kubectl get daemonset calico-node -n kube-system
      register: calico_check
      ignore_errors: true

    - name: 📋 Hiển thị trạng thái hiện tại
      debug:
        msg: >
          {% if calico_check.rc == 0 %}
            🔧 Calico đã được cài đặt.
          {% else %}
            🚫 Chưa có Calico, sẽ tiến hành cài đặt mới.
          {% endif %}

    - name: 🧩 Kiểm tra kernel modules overlay & br_netfilter
      shell: |
        modprobe overlay || true
        modprobe br_netfilter || true
        lsmod | grep -E 'overlay|br_netfilter' || echo "⚠️  Thiếu module kernel"
      register: kernel_status
      ignore_errors: true

    - name: 📋 Kết quả kiểm tra module kernel
      debug:
        var: kernel_status.stdout_lines

    - name: ⚙️ Kiểm tra cấu hình sysctl
      shell: |
        echo "net.bridge.bridge-nf-call-iptables = 1" | tee /etc/sysctl.d/k8s.conf >/dev/null
        echo "net.ipv4.ip_forward = 1" | tee -a /etc/sysctl.d/k8s.conf >/dev/null
        sysctl --system | grep -E "net.bridge.bridge-nf-call|net.ipv4.ip_forward"
      register: sysctl_status
      ignore_errors: true

    - name: 📋 Kết quả sysctl
      debug:
        var: sysctl_status.stdout_lines

    - name: 🌐 Áp dụng Calico manifest (cài mới hoặc cập nhật)
      shell: |
        kubectl apply -f {{ calico_url }}
      args:
        executable: /bin/bash
      register: calico_apply
      retries: 3
      delay: 10
      until: calico_apply.rc == 0

    - name: 🧾 Hiển thị kết quả cài đặt
      debug:
        var: calico_apply.stdout_lines

    - name: ⏳ Kiểm tra Calico node pod đang khởi động
      shell: |
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
      register: calico_running

    - name: 🕒 Chờ pod khởi động (tối đa 10 lần)
      until: calico_running.stdout | int > 0
      retries: 10
      delay: 15
      shell: |
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
      register: calico_running
      ignore_errors: true

    - name: 🟢 Xác nhận Calico pods đang chạy
      when: calico_running.stdout | int > 0
      debug:
        msg: "✅ Calico đang hoạt động ({{ calico_running.stdout }} pods Running)."

    - name: 🧾 Log pod Calico nếu lỗi
      when: calico_running.stdout | int == 0
      shell: kubectl logs -n kube-system -l k8s-app=calico-node --tail=50 || true
      register: calico_logs
      ignore_errors: true

    - name: 📋 Hiển thị log pod Calico
      when: calico_running.stdout | int == 0
      debug:
        msg: "{{ calico_logs.stdout_lines | default(['⚠️ Pod Calico chưa sẵn sàng hoặc không có log.']) }}"

    - name: 🔍 Kiểm tra trạng thái node
      command: kubectl get nodes -o wide
      register: nodes_status
      ignore_errors: true

    - name: 🧾 Hiển thị kết quả cluster
      debug:
        var: nodes_status.stdout_lines`,

    '06-install-flannel': `---
- name: 🌐 Cài đặt hoặc cập nhật Flannel CNI (tương thích WSL2)
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
    DEBIAN_FRONTEND: noninteractive

  vars:
    flannel_manifest: "https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml"

  tasks:
    - name: 🔍 Kiểm tra Flannel CNI có tồn tại không
      command: kubectl get daemonset kube-flannel-ds -n kube-flannel
      register: flannel_check
      ignore_errors: true

    - name: 📋 Hiển thị trạng thái hiện tại
      debug:
        msg: >
          {% if flannel_check.rc == 0 %}
            🔧 Flannel đã được cài đặt trước đó.
          {% else %}
            🚀 Chưa có Flannel, sẽ tiến hành cài đặt mới.
          {% endif %}

    - name: ⚙️ Bật IP forwarding
      shell: |
        echo "net.ipv4.ip_forward = 1" | tee /etc/sysctl.d/k8s.conf >/dev/null
        sysctl --system | grep net.ipv4.ip_forward
      register: sysctl_status
      ignore_errors: true

    - name: 📋 Kết quả sysctl
      debug:
        var: sysctl_status.stdout_lines

    - name: 🌐 Áp dụng Flannel manifest (tự động tải bản mới nhất)
      command: kubectl apply -f {{ flannel_manifest }}
      register: flannel_apply
      changed_when: "'created' in flannel_apply.stdout or 'configured' in flannel_apply.stdout"
      failed_when: flannel_apply.rc != 0

    - name: 🧾 Hiển thị kết quả áp dụng
      debug:
        var: flannel_apply.stdout_lines

    - name: ⏳ Kiểm tra số pod Flannel đang chạy
      shell: |
        kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
      register: flannel_running

    - name: 🕒 Chờ pod Flannel hoạt động (tối đa 10 lần)
      until: flannel_running.stdout | int > 0
      retries: 10
      delay: 15
      shell: |
        kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
      register: flannel_running
      ignore_errors: true

    - name: 🟢 Xác nhận Flannel pod đã hoạt động
      when: flannel_running.stdout | int > 0
      debug:
        msg: "✅ Flannel đang hoạt động ({{ flannel_running.stdout }} pods Running)."

    - name: 🧾 Log Flannel nếu pod chưa chạy
      when: flannel_running.stdout | int == 0
      shell: kubectl logs -n kube-flannel -l app=flannel --tail=50 || true
      register: flannel_logs
      ignore_errors: true

    - name: 📋 Hiển thị log Flannel
      when: flannel_running.stdout | int == 0
      debug:
        msg: "{{ flannel_logs.stdout_lines | default(['⚠️ Pod Flannel chưa sẵn sàng hoặc không có log.']) }}"

    - name: 🔍 Kiểm tra trạng thái node
      command: kubectl get nodes -o wide
      register: nodes_status
      ignore_errors: true

    - name: 🧾 Hiển thị kết quả cluster
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

    '09-install-ingress': `---
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

    '10-install-helm': `---
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

    '11-setup-storage': `---
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

    

    '08-verify-cluster': `---
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
          - "📦 Danh sách Node:"
          - "{{ nodes_info.stdout_lines }}"
          - "📦 Pods trong namespace kube-system:"
          - "{{ pods_info.stdout_lines }}"

    - name: 🧠 Kiểm tra trạng thái node
      shell: kubectl get nodes --no-headers | awk '{print $2}' | sort | uniq -c
      register: node_status
      changed_when: false

    - name: 📊 Báo cáo tình trạng node
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          ⚠️ Một số node chưa sẵn sàng:
          {{ node_status.stdout }}
          {% else %}
          🎯 Tất cả node đã ở trạng thái Ready!
          {% endif %}

    - name: 🔍 Kiểm tra pod lỗi trong kube-system
      shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
      register: bad_pods
      changed_when: false

    - name: 📋 Báo cáo pod lỗi
      debug:
        msg: |
          {% if bad_pods.stdout %}
          ⚠️ Một số pod chưa ổn định hoặc đang lỗi:
          {{ bad_pods.stdout }}
          {% else %}
          ✅ Tất cả pod trong kube-system đều đang Running hoặc Completed!
          {% endif %}

    - name: 🧾 Hiển thị log của pod lỗi (nếu có)
      when: bad_pods.stdout != ""
      shell: |
        for pod in $(kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' | awk '{print $1}'); do
          echo "📄 Log của $pod:"; kubectl logs -n kube-system $pod --tail=30 || true; echo "--------------------------------";
        done
      register: bad_pods_logs
      ignore_errors: yes

    - name: 🧠 Log chi tiết
      when: bad_pods.stdout != ""
      debug:
        msg: "{{ bad_pods_logs.stdout_lines | default(['Không có log lỗi']) }}"`,

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
- name: 🧹 Bước 0: Reset cụm (tất cả node)
  hosts: all
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: 🧽 Gỡ cụm Kubernetes (kubeadm reset -f)
      shell: kubeadm reset -f
      ignore_errors: true
      register: reset_output

    - name: 📋 Kết quả reset cụm
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

    - name: 🧹 Xóa kubeconfig của root
      file:
        path: /root/.kube
        state: absent

    - name: 🧹 Xóa kubeconfig của user thường ({{ ansible_user }})
      file:
        path: "/home/{{ ansible_user }}/.kube"
        state: absent
      when: ansible_user != "root"

    - name: 🧰 Khởi động lại containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes

---
- name: 📝 Bước 1: Cập nhật hosts & hostname
  hosts: all
  become: yes
  gather_facts: yes
  tasks:
    - name: 🧠 Thêm tất cả node vào /etc/hosts
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host }} {{ item }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_host is defined

    - name: 🖥️ Đặt hostname theo inventory
      hostname:
        name: "{{ inventory_hostname }}"
      when: ansible_hostname != inventory_hostname

    - name: 📋 Kiểm tra hostname
      shell: hostnamectl
      register: host_info

    - name: 🧾 Hiển thị thông tin hostname
      debug:
        msg: "{{ host_info.stdout_lines }}"

---
- name: ⚙️ Bước 2-3: Kernel, sysctl, containerd
  hosts: all
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
      command: sysctl --system

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
        state: restarted

---
- name: ☸️ Bước 4: Cài đặt Kubernetes
  hosts: all
  become: yes
  gather_facts: no
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
      command: apt-mark hold kubelet kubeadm kubectl

---
- name: 🚀 Bước 5: Khởi tạo master
  hosts: master
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: Lấy địa chỉ master động
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"

    - name: Hiển thị địa chỉ master
      debug:
        msg: "📡 Sử dụng địa chỉ master: {{ master_ip }}"

    - name: Reset cluster cũ và dọn sạch dữ liệu
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/etcd /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes

    - name: Khởi tạo Control Plane (Master)
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

    - name: Cấu hình kubeconfig cho root
      shell: |
        mkdir -p $HOME/.kube
        cp /etc/kubernetes/admin.conf $HOME/.kube/config
        chown $(id -u):$(id -g) $HOME/.kube/config
      args:
        executable: /bin/bash

    - name: Cấu hình kubeconfig cho người dùng thường ({{ ansible_user }})
      when: ansible_user != "root"
      block:
        - name: Tạo thư mục kubeconfig cho user
          file:
            path: "/home/{{ ansible_user }}/.kube"
            state: directory
            mode: '0755'

        - name: Sao chép kubeconfig cho user
          copy:
            src: /etc/kubernetes/admin.conf
            dest: "/home/{{ ansible_user }}/.kube/config"
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0600'
            remote_src: yes

---
- name: 🌐 Bước 6: Cài đặt CNI (Calico)
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

    - name: Áp dụng Calico manifest (cài mới hoặc cập nhật)
      shell: |
        kubectl apply -f {{ calico_url }}
      args:
        executable: /bin/bash
      register: calico_apply
      retries: 3
      delay: 10
      until: calico_apply.rc == 0

    - name: Chờ Calico node pod chạy
      shell: |
        kubectl get pods -n kube-system -l k8s-app=calico-node --no-headers 2>/dev/null | grep -c 'Running' || true
      register: calico_running
      retries: 10
      delay: 15
      until: calico_running.stdout | int > 0

---
- name: 🔗 Bước 7: Join workers
  hosts: worker
  become: yes
  gather_facts: false
  environment:
    DEBIAN_FRONTEND: noninteractive
  vars:
    join_script: /tmp/kube_join.sh
  tasks:
    - name: Lấy lệnh join từ master
      delegate_to: "{{ groups['master'][0] }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd

    - name: Ghi lệnh join ra file
      copy:
        content: "{{ hostvars[groups['master'][0]].join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'

    - name: Reset node (nếu có cụm cũ)
      shell: |
        kubeadm reset -f || true
        rm -rf /etc/kubernetes /var/lib/kubelet /etc/cni/net.d
        systemctl restart containerd || true
      ignore_errors: yes

    - name: Join vào cụm Kubernetes
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: yes

    - name: Khởi động lại kubelet
      systemd:
        name: kubelet
        state: restarted
        enabled: yes

---
- name: 🧩 Bước 8: Xác minh trạng thái cụm
  hosts: master
  become: yes
  gather_facts: false
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
      command: kubectl get nodes -o wide
      register: nodes_info
      changed_when: false

    - name: Liệt kê pods hệ thống
      command: kubectl get pods -n kube-system -o wide
      register: pods_info
      changed_when: false

    - name: Hiển thị thông tin cụm
      debug:
        msg:
          - "📦 Node List:"
          - "{{ nodes_info.stdout_lines }}"
          - "📦 Pods trong namespace kube-system:"
          - "{{ pods_info.stdout_lines }}"

    - name: Kiểm tra trạng thái node
      shell: kubectl get nodes --no-headers | awk '{print $2}' | sort | uniq -c
      register: node_status
      changed_when: false

    - name: Báo cáo tình trạng node
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          ⚠️ Một số node chưa sẵn sàng:
          {{ node_status.stdout }}
          {% else %}
          🎯 Tất cả node đã ở trạng thái Ready!
          {% endif %}

    - name: Kiểm tra pod lỗi trong kube-system
      shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
      register: bad_pods
      changed_when: false

    - name: Báo cáo pod lỗi
      debug:
        msg: |
          {% if bad_pods.stdout %}
          ⚠️ Một số pod chưa ổn định hoặc đang lỗi:
          {{ bad_pods.stdout }}
          {% else %}
          ✅ Tất cả pod trong kube-system đều đang Running hoặc Completed!
          {% endif %}`
  ,

    'deploy-full-cluster-flannel': `---
- name: 🧹 Bước 0 – Reset cụm Kubernetes
  hosts: all
  become: yes
  gather_facts: yes
  environment:
    DEBIAN_FRONTEND: noninteractive
  tasks:
    - name: 🧽 Gỡ cụm Kubernetes
      shell: kubeadm reset -f || true
      ignore_errors: true

    - name: 🧹 Xóa cấu hình Kubernetes
      file:
        path: "{{ item }}"
        state: absent
      loop:
        - /etc/kubernetes
        - /etc/cni/net.d
        - /root/.kube
        - "/home/{{ ansible_user }}/.kube"
      ignore_errors: true

    - name: 🔄 Khởi động lại containerd
      shell: systemctl restart containerd || true
      ignore_errors: true


# ------------------------------------------------------------------------------

- name: 📝 Bước 1 – Cập nhật hosts & hostname
  hosts: all
  become: yes
  gather_facts: yes
  tasks:
    - name: Thêm tất cả node vào /etc/hosts
      lineinfile:
        path: /etc/hosts
        line: "{{ hostvars[item].ansible_host | default(item) }} {{ hostvars[item].ansible_user }}"
        state: present
        create: yes
        insertafter: EOF
      loop: "{{ groups['all'] }}"
      when: hostvars[item].ansible_user is defined

    - name: Đặt hostname theo inventory
      hostname:
        name: "{{ hostvars[inventory_hostname].ansible_user }}"
      when: ansible_hostname != hostvars[inventory_hostname].ansible_user

---
- name: ⚙️ Bước 2 – Cấu hình kernel & containerd
  hosts: all
  become: yes
  gather_facts: no
  tasks:
    - name: 🚫 Tắt swap
      shell: swapoff -a && sed -i '/swap/d' /etc/fstab || true

    - name: 🧩 Tải module kernel
      copy:
        dest: /etc/modules-load.d/containerd.conf
        content: |
          overlay
          br_netfilter

    - name: 📡 Kích hoạt module
      shell: |
        modprobe overlay || true
        modprobe br_netfilter || true

    - name: 🧠 Thiết lập sysctl
      copy:
        dest: /etc/sysctl.d/99-kubernetes-cri.conf
        content: |
          net.bridge.bridge-nf-call-iptables  = 1
          net.bridge.bridge-nf-call-ip6tables = 1
          net.ipv4.ip_forward                 = 1

    - name: 🧾 Áp dụng sysctl
      command: sysctl --system

    - name: 📦 Cài containerd
      apt:
        name: containerd
        state: present
        update_cache: yes

    - name: ⚙️ Sinh file config containerd
      shell: |
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml

    - name: 🔧 Bật SystemdCgroup
      replace:
        path: /etc/containerd/config.toml
        regexp: 'SystemdCgroup = false'
        replace: 'SystemdCgroup = true'

    - name: 🔁 Khởi động containerd
      systemd:
        name: containerd
        state: restarted
        enabled: yes


# ------------------------------------------------------------------------------

- name: ☸️ Bước 3 – Cài đặt Kubernetes core
  hosts: all
  become: yes
  gather_facts: no
  tasks:
    - name: 🔑 Thêm GPG key Kubernetes
      shell: |
        mkdir -p /usr/share/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
        gpg --dearmor --yes -o /usr/share/keyrings/kubernetes-archive-keyring.gpg
      changed_when: false
      ignore_errors: true

    - name: 📦 Thêm repo Kubernetes
      copy:
        dest: /etc/apt/sources.list.d/kubernetes.list
        content: |
          deb [signed-by=/usr/share/keyrings/kubernetes-archive-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /

    - name: ⚙️ Cài gói Kubernetes
      apt:
        name:
          - kubelet
          - kubeadm
          - kubectl
        state: present
        update_cache: yes

    - name: 🔒 Giữ phiên bản
      command: apt-mark hold kubelet kubeadm kubectl


# ------------------------------------------------------------------------------

- name: 🚀 Bước 4 – Khởi tạo Master node
  hosts: master
  become: yes
  gather_facts: yes
  tasks:
    - name: 📡 Xác định IP Master
      set_fact:
        master_ip: "{{ hostvars[inventory_hostname].ansible_host | default(ansible_default_ipv4.address) }}"

    - name: 🧹 Reset trước khi init
      shell: kubeadm reset -f || true

    - name: ☸️ Khởi tạo Control Plane
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

    - name: ⚙️ Sao chép kubeconfig cho root
      shell: |
        mkdir -p /root/.kube
        cp -i /etc/kubernetes/admin.conf /root/.kube/config
        chown root:root /root/.kube/config
      args:
        executable: /bin/bash

    - name: 👤 Sao chép kubeconfig cho người dùng thường
      when: ansible_user != "root"
      block:
        - name: 📁 Tạo thư mục ~/.kube cho user thường
          file:
            path: "/home/{{ ansible_user }}/.kube"
            state: directory
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0755'

        - name: 📄 Sao chép file kubeconfig
          copy:
            src: /etc/kubernetes/admin.conf
            dest: "/home/{{ ansible_user }}/.kube/config"
            remote_src: yes
            owner: "{{ ansible_user }}"
            group: "{{ ansible_user }}"
            mode: '0600'

        - name: 🔁 Kiểm tra quyền truy cập kubectl
          shell: runuser -l {{ ansible_user }} -c 'kubectl get nodes || true'
          register: user_kubectl_check
          ignore_errors: yes

        - name: 📋 Kết quả kiểm tra user
          debug:
            msg: "{{ user_kubectl_check.stdout_lines | default(['⚠️ Không thể xác thực bằng user thường.']) }}"


# ------------------------------------------------------------------------------

- name: 🌐 Bước 5 – Cài đặt Flannel CNI
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
  tasks:
    - name: 🌐 Áp dụng Flannel
      command: kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
      register: flannel_apply
      changed_when: "'created' in flannel_apply.stdout or 'configured' in flannel_apply.stdout"

    - name: ⏳ Chờ Flannel pod Running
      shell: |
        kubectl get pods -n kube-flannel --no-headers 2>/dev/null | grep -c 'Running' || true
      register: flannel_running
      retries: 10
      delay: 15
      until: flannel_running.stdout | int > 0


# ------------------------------------------------------------------------------

- name: 🔗 Bước 6 – Join Worker nodes
  hosts: worker
  become: yes
  gather_facts: false
  vars:
    join_script: /tmp/kube_join.sh
  tasks:
    - name: 🔁 Lấy token join từ master
      delegate_to: "{{ groups['master'][0] }}"
      run_once: true
      shell: kubeadm token create --print-join-command
      register: join_cmd

    - name: 💾 Ghi lệnh join ra file
      copy:
        content: "{{ join_cmd.stdout }} --ignore-preflight-errors=all"
        dest: "{{ join_script }}"
        mode: '0755'

    - name: 🧹 Reset node cũ
      shell: kubeadm reset -f || true
      ignore_errors: true

    - name: 🔗 Thực thi join
      shell: "{{ join_script }}"
      register: join_output
      ignore_errors: true


# ------------------------------------------------------------------------------

- name: ✅ Bước 7 – Xác minh cụm Kubernetes
  hosts: master
  become: yes
  gather_facts: false
  environment:
    KUBECONFIG: /etc/kubernetes/admin.conf
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
          - "📦 Danh sách Node:"
          - "{{ nodes_info.stdout_lines }}"
          - "📦 Pods trong namespace kube-system:"
          - "{{ pods_info.stdout_lines }}"

    - name: 🧠 Kiểm tra trạng thái node
      shell: kubectl get nodes --no-headers | awk '{print $1, $2}' | column -t
      register: node_status
      changed_when: false

    - name: 📊 Báo cáo tình trạng node
      debug:
        msg: |
          {% if 'NotReady' in node_status.stdout %}
          ⚠️ Một số node chưa sẵn sàng:
          {{ node_status.stdout }}
          ➡️ Hãy kiểm tra lại kubelet hoặc CNI (Flannel/Calico) trên các node này.
          {% else %}
          ✅ 🎯 Tất cả node đều ở trạng thái Ready!
          {{ node_status.stdout }}
          {% endif %}

    - name: 🔍 Kiểm tra pod lỗi trong kube-system
      shell: kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' || true
      register: bad_pods
      changed_when: false

    - name: 📋 Báo cáo pod lỗi
      debug:
        msg: |
          {% if bad_pods.stdout %}
          ⚠️ Một số pod trong kube-system chưa ổn định hoặc đang lỗi:
          {{ bad_pods.stdout }}
          ➡️ Hãy kiểm tra log pod để xác định nguyên nhân.
          {% else %}
          ✅ 🟢 Tất cả pod trong kube-system đều Running hoặc Completed!
          {% endif %}

    - name: 🧾 Lấy log của pod lỗi (nếu có)
      when: bad_pods.stdout != ""
      shell: |
        echo "====== 🧠 LOG POD LỖI ======"
        for pod in $(kubectl get pods -n kube-system --no-headers | grep -vE 'Running|Completed' | awk '{print $1}'); do
          echo "---------------------------------------------"
          echo "📄 Pod: $pod"
          kubectl logs -n kube-system $pod --tail=30 || echo "❌ Không thể lấy log cho $pod"
          echo
        done
      register: bad_pods_logs
      ignore_errors: yes

    - name: 🧠 Log chi tiết pod lỗi
      when: bad_pods.stdout != ""
      debug:
        msg: "{{ bad_pods_logs.stdout_lines | default(['⚠️ Không có log lỗi hoặc pod đã khởi động lại.']) }}"
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
    'install-helm': '10-install-helm',
    'setup-storage': '11-setup-storage',
    'deploy-full-cluster': 'deploy-full-cluster',
    'deploy-full-cluster-flannel': 'deploy-full-cluster-flannel',
    'reset-cluster': '00-reset-cluster'
  };
  
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
      '06-install-cni': '🌐 Cài CNI (Calico)',
      '06-install-flannel': '🌐 Cài CNI (Flannel)',
      '07-join-workers': '🔗 Join Workers',
      '08-verify-cluster': '🧩 Xác minh trạng thái cụm',
      '09-install-ingress': '🌐 Cài Ingress Controller',
      '10-install-helm': '⚓ Cài Helm',
      '11-setup-storage': '💾 Setup Storage',
      'deploy-full-cluster': '🚀 Triển khai toàn bộ cluster (Calico)',
      'deploy-full-cluster-flannel': '🚀 Triển khai toàn bộ cluster (Flannel)'
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

// Reset Playbook Manager UI when leaving cluster detail
window.resetPlaybookUI = function() {
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
  } catch (_) {}
}
