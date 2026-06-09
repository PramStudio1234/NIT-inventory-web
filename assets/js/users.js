/* 
  ==============================================================
    ส่วนที่ 7: ระบบจัดการผู้ใช้งานสำหรับ Super Admin (USER MANAGEMENT)
  ==============================================================
*/

let usersList = [];

// 1. ฟังก์ชันเปิด/ปิด Modal
function openUserModal() {
    document.getElementById('modal-user').classList.remove('hide');
}

function closeUserModal() {
    document.getElementById('modal-user').classList.add('hide');
    document.getElementById('form-add-user').reset();
}

// 2. ฟังก์ชันโหลดรายชื่อพนักงานทั้งหมด (เรียงตามวันที่สมัคร)
function loadUsersList() {
    if (currentRole !== 'superadmin') return;

    db.collection('users').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        usersList = [];
        snapshot.forEach((doc) => {
            usersList.push({ uid: doc.id, ...doc.data() });
        });
        renderUsersTable();
    }, (error) => {
        console.error("Error loading users: ", error);
        document.getElementById('users-table-body').innerHTML = `<tr><td colspan="5" class="py-10 text-center text-red-500">ไม่สามารถโหลดข้อมูลได้: ${error.message}</td></tr>`;
    });
}

// 3. วาดตารางพนักงาน
function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (usersList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-10 text-center">ไม่มีข้อมูลพนักงานในระบบ</td></tr>';
        return;
    }

    tbody.innerHTML = usersList.map(u => {
        const date = u.createdAt ? new Date(u.createdAt.seconds * 1000).toLocaleDateString('th-TH') : '-';
        const roleColor = u.role === 'superadmin' ? 'bg-purple-100 text-purple-600' : (u.role === 'admin' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500');
        
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-bold text-slate-700">${u.name}</td>
                <td class="px-6 py-4 text-slate-500">${u.email}</td>
                <td class="px-6 py-4 text-center">
                    <select onchange="updateUserRole('${u.uid}', this.value)" class="text-[10px] font-bold uppercase ${roleColor} px-2 py-1 rounded-full border-none focus:ring-0 cursor-pointer">
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>USER</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>ADMIN</option>
                        <option value="superadmin" ${u.role === 'superadmin' ? 'selected' : ''}>SUPERADMIN</option>
                    </select>
                </td>
                <td class="px-6 py-4 text-slate-400 text-xs">${date}</td>
                <td class="px-6 py-4 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="resetUserPassword('${u.email}')" title="ส่งอีเมลรีเซ็ตรหัสผ่าน" class="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-yellow-100 flex items-center justify-center transition-colors">
                            <i class="fa-solid fa-key text-xs"></i>
                        </button>
                        <button onclick="deleteUserAccount('${u.uid}', '${u.name}')" title="ลบพนักงาน" class="w-8 h-8 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 4. สร้างบัญชีพนักงานใหม่ (ผ่าน Backend API เพื่อรองรับบัญชีที่ซ้ำซ้อนใน Firebase Auth อย่างยืดหยุ่น)
async function handleCreateUser(e) {
    e.preventDefault();
    
    const name = document.getElementById('new-user-name').value;
    const email = document.getElementById('new-user-email').value;
    const pass = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;

    if (!confirm(`ยืนยันการสร้างบัญชีให้คุณ ${name} สิทธิ์ ${role.toUpperCase()}?`)) return;

    // แสดงสถานะ Loading
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn ? submitBtn.innerHTML : 'สร้างบัญชี';
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังบันทึก...';
        submitBtn.disabled = true;
    }

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password: pass, role })
        });
        const data = await res.json();
        
        if (data.success) {
            alert(data.message || 'สร้างบัญชีพนักงานสำเร็จ!');
            closeUserModal();
        } else {
            alert('เกิดข้อผิดพลาด: ' + (data.error || 'ไม่ทราบสาเหตุ'));
        }
    } catch (error) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Server: ' + error.message);
        console.error(error);
    } finally {
        if (submitBtn) {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
}

// 5. เปลี่ยนสิทธิ์พนักงาน
async function updateUserRole(uid, newRole) {
    if (!confirm(`คุณต้องการเปลี่ยนสิทธิ์พนักงานท่านนี้เป็น ${newRole.toUpperCase()} ใช่หรือไม่?`)) {
        renderUsersTable(); // วาดใหม่เพื่อรีเซ็ตค่าใน Select
        return;
    }

    try {
        await db.collection('users').doc(uid).update({ role: newRole });
        alert('อัปเดตสิทธิ์สำเร็จ');
    } catch (error) {
        alert('ไม่สามารถอัปเดตสิทธิ์ได้: ' + error.message);
    }
}

// 6. ส่งอีเมลรีเซ็ตรหัสผ่าน
async function resetUserPassword(email) {
    if (!confirm(`ส่งอีเมลรีเซ็ตรหัสผ่านไปที่ ${email} ใช่หรือไม่?`)) return;

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/users/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        
        if (data.success) {
            alert('✅ ส่งอีเมลรีเซ็ตรหัสผ่านเรียบร้อยแล้ว! โปรดแจ้งพนักงานให้ตรวจสอบกล่องจดหมาย');
        } else {
            alert('❌ ส่งไม่สำเร็จ: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
}

// 7. ลบพนักงาน (แบบถอนรากถอนโคนผ่าน Server)
async function deleteUserAccount(uid, name) {
    if (!confirm(`⚠️ คำเตือน: คุณกำลังจะลบบัญชีคุณ ${name} ออกจากระบบ "อย่างถาวร"\n(รวมถึงบัญชีล็อกอินและสิทธิ์ทั้งหมดจะไม่สามารถใช้งานได้อีก)`)) return;

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/users/${uid}`, {
            method: 'DELETE'
        });
        const data = await res.json();

        if (data.success) {
            alert('✅ ลบข้อมูลพนักงานและบัญชีล็อกอินสำเร็จ!');
        } else {
            alert('❌ ไม่สามารถลบได้: ' + data.error);
        }
    } catch (error) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Server: ' + error.message);
    }
}
