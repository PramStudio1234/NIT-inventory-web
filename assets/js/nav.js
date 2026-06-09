/* 
  ==============================================================
    ส่วนที่ 2: การเปลี่ยนสิทธิ์ผู้ใช้และนำทางเมนู (ROLE & NAVIGATION)
  ==============================================================
*/

// ฟังก์ชันสำหรับเปลี่ยนสิทธิ์ของแอป (พ่วงกับตัว Dropdown ตรงด้านขวาบนหน้าเว็บ)
function changeRole(role) {
    // ระบุ currentRole ให้เป็นบทบาทที่ส่งเข้ามา
    currentRole = role;
    
    // ★ หัวใจสำคัญ: ยัดคลาส `role-is-xxxxx` ลงใน tag <body> 
    // เพื่อให้ไฟล์ CSS จัดการซ่อน/ปิดเมนูตามสิทธิ์การเข้าถึงทันที
    document.body.className = `bg-slate-50 flex h-screen overflow-hidden text-slate-800 role-is-${role}`;
    
    // กำหนดหน้าจอตั้งต้นให้ผู้ใช้
    if (role === 'user') {
        // ฝั่งคนทำเรื่องเบิกของ/พยาบาล ให้ไปเริ่มที่หน้าจอ Borrow ทันที
        switchTab('borrow');
    } else {
        // ฝั่งเจ้านาย/คนเฝ้าคลัง ให้เด้งไปเริ่มที่หน้าจอ Dashboard ทันที
        switchTab('dashboard');
    }
    
    // เรียกคำสั่งวาดกราฟและตารางให้ข้อมูลหน้าตาเชื่อมกันหมด
    if (typeof updateUI === 'function') {
        updateUI();
    }
}

// ฟังก์ชันสำหรับสับเปลี่ยนหน้าต่าง (Tab)
function switchTab(tabId) {
    // 1. วนหาส่วนที่เป็น .view-section ทุกจุดบนจอ แล้วอัดคลาส 'hide' เพื่อซ่อนทั้งหมด
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hide'));
    // 2. ลบคลาส 'hide' ออกจากตัวที่ตรงกับชื่อ tabId ทำให้เรามองเห็นหน้านั้น
    document.getElementById('view-' + tabId).classList.remove('hide');

    // 3. จัดการปุ่มเมนูทางซ้าย (Sidebar Button) ถอดสีน้ำเงินออกทั้งหมด
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-200');
        if(!el.classList.contains('text-slate-500')) el.classList.add('text-slate-500'); // ปรับกลับเป็นสีเทา
    });
    
    // 4. เอาสีน้ำเงินไปพ่นใส่ในปุ่มที่ผู้ใช้งานกำลังเปิดค้างอยู่ เพื่อแสดงลีลา UX (User Experience)
    const activeBtn = document.getElementById('nav-' + tabId);
    if(activeBtn) {
        activeBtn.classList.remove('text-slate-500');
        activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-200'); // ใส่สีเข้มสวยงาม
    }

    // สร้าง Dictionary เปลี่ยนชื่อหน้าเพจด้านบนตาม Tab
    const titles = { 
        'dashboard': 'ภาพรวมระบบ (NIT)', 
        'inventory': 'ตู้เก็บเครื่องมือแพทย์ และ พัสดุ', 
        'borrow': 'ระบบเบิกจ่ายอุปกรณ์ OPD', 
        'logs': 'ประวัติการใช้งานและเคลื่อนไหว',
        'report': 'รายงานสรุปผลการเบิก-ยืม พัสดุ',
        'approvals': 'พิจารณาอนุมัติใบเบิกพัสดุ',
        'users': 'ควบคุมและจัดการบัญชีผู้ใช้งาน'
    };
    // ดึงชื่อขึ้นไปแสดงในแถบ header id=page-title
    document.getElementById('page-title').innerText = titles[tabId] || 'ระบบพัสดุ OPD';

    // ออโต้ปิด Sidebar บนมือถือเวลาเปลี่ยนหน้า
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && !sidebar.classList.contains('-translate-x-full') && window.innerWidth < 768) {
        toggleSidebar();
    }
}

// ฟังก์ชันเปิด/ปิด Sidebar สำหรับหน้าจอมือถือ
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar.classList.contains('-translate-x-full')) {
        // เปิด Sidebar
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        // ปิด Sidebar
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}
