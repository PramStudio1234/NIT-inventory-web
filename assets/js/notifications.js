/*
  ================================================================
    ระบบแจ้งเตือนสต็อกต่ำ/หมด ผ่านอีเมล (Notification System)
    - จัดการรายชื่อผู้รับแจ้งเตือนใน Firestore
    - ตรวจจับสต็อกต่ำ/หมดอัตโนมัติ
    - เรียก Backend API เพื่อส่งอีเมล
  ================================================================
*/

// ====== ตั้งค่า URL ของ Backend Server ======
// เปลี่ยนเป็น URL ของ Render.com หลัง Deploy
const MAIL_SERVER_URL = 'https://nit-inventory-api.onrender.com';

// ====== ข้อมูลผู้รับแจ้งเตือน (โหลดจาก Firestore) ======
let notificationEmails = [];

// ====== Cooldown: ป้องกันส่งอีเมลซ้ำ (เก็บใน memory) ======
const alertCooldowns = {};
const COOLDOWN_HOURS = 24; // ส่งซ้ำสินค้าเดิมได้หลัง 24 ชม.

// ================================================================
//  CRUD: จัดการรายชื่ออีเมลผู้รับแจ้งเตือน
// ================================================================

// เพิ่มอีเมลผู้รับใหม่
function addNotificationEmail() {
    const email = document.getElementById('notif-email').value.trim();
    const name = document.getElementById('notif-name').value.trim();

    if (!email || !name) {
        alert('กรุณากรอกชื่อและอีเมลให้ครบ');
        return;
    }

    // ตรวจสอบรูปแบบอีเมล
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('รูปแบบอีเมลไม่ถูกต้อง');
        return;
    }

    // ตรวจสอบซ้ำ
    if (notificationEmails.some(n => n.email === email)) {
        alert('อีเมลนี้มีอยู่ในรายชื่อแล้ว');
        return;
    }

    db.collection('notification_emails').add({
        email: email,
        name: name,
        addedBy: currentUser || 'Unknown',
        addedAt: new Date().toISOString(),
        active: true
    }).then(() => {
        document.getElementById('notif-email').value = '';
        document.getElementById('notif-name').value = '';
        alert('✅ เพิ่มผู้รับแจ้งเตือนสำเร็จ: ' + email);
    }).catch(err => {
        console.error(err);
        alert('เกิดข้อผิดพลาด: ' + err.message);
    });
}

// ลบอีเมลผู้รับ
function removeNotificationEmail(docId) {
    if (!confirm('ต้องการลบอีเมลนี้ออกจากรายชื่อผู้รับแจ้งเตือน?')) return;

    db.collection('notification_emails').doc(docId).delete().then(() => {
        alert('ลบเรียบร้อยแล้ว');
    }).catch(err => {
        console.error(err);
        alert('ลบล้มเหลว: ' + err.message);
    });
}

// สลับเปิด/ปิดการแจ้งเตือนรายคน
function toggleNotificationEmail(docId, currentActive) {
    db.collection('notification_emails').doc(docId).update({
        active: !currentActive
    });
}

// ================================================================
//  ส่งอีเมลทดสอบ
// ================================================================
async function sendTestEmail(email) {
    if (!email) {
        alert('ไม่พบอีเมลปลายทาง');
        return;
    }

    if (!confirm(`ส่งอีเมลทดสอบไปที่ ${email} ?`)) return;

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/notifications/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (data.success) {
            alert(`✅ ส่งอีเมลทดสอบไปที่ ${email} สำเร็จ!`);
        } else {
            alert('❌ ส่งไม่สำเร็จ: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        console.error(err);
        alert('❌ ไม่สามารถเชื่อมต่อ Mail Server ได้\n\nตรวจสอบว่า:\n1. เปิด Server อยู่หรือไม่ (npm start ใน folder server/)\n2. URL ถูกต้องหรือไม่: ' + MAIL_SERVER_URL);
    }
}

// ================================================================
//  ตรวจสอบสต็อกต่ำ/หมด และส่งแจ้งเตือน
// ================================================================
async function checkLowStockAlerts() {
    // หาอีเมลที่เปิดใช้งานอยู่
    const activeEmails = notificationEmails.filter(n => n.active).map(n => n.email);

    if (activeEmails.length === 0) {
        console.log('📧 ไม่มีผู้รับแจ้งเตือนที่เปิดใช้งาน — ข้ามการส่ง');
        return;
    }

    // ค้นหาสินค้าที่สต็อกต่ำหรือหมด
    const outOfStock = products.filter(p => p.stock <= 0);
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.min || 0));

    // กรองสินค้าที่ยังอยู่ใน Cooldown ออก
    const now = Date.now();
    const filterCooldown = (list) => list.filter(p => {
        const lastSent = alertCooldowns[p.id];
        if (lastSent && (now - lastSent) < COOLDOWN_HOURS * 60 * 60 * 1000) {
            return false; // ยังอยู่ใน Cooldown
        }
        return true;
    });

    const alertOutOfStock = filterCooldown(outOfStock);
    const alertLowStock = filterCooldown(lowStock);

    // ส่งแจ้งเตือนสินค้าหมดสต็อก
    if (alertOutOfStock.length > 0) {
        await sendStockAlert(activeEmails, alertOutOfStock, 'out_of_stock');
    }

    // ส่งแจ้งเตือนสินค้าใกล้หมด
    if (alertLowStock.length > 0) {
        await sendStockAlert(activeEmails, alertLowStock, 'low_stock');
    }

    if (alertOutOfStock.length === 0 && alertLowStock.length === 0) {
        console.log('📧 ไม่มีสินค้าที่ต้องแจ้งเตือน (หรืออยู่ใน Cooldown)');
    }
}

// ส่งอีเมลแจ้งเตือนจริงผ่าน Backend
async function sendStockAlert(recipients, productList, alertType) {
    try {
        const payload = {
            recipients: recipients,
            products: productList.map(p => ({
                name: p.name || 'ไม่ระบุ',
                id: p.id || '-',
                stock: p.stock ?? 0,
                min: p.min ?? 0,
                unit: p.unitSmall || 'หน่วย'
            })),
            alertType: alertType,
            systemName: 'NIT Inventory — สถาบันประสาทวิทยา'
        };

        const res = await fetch(`${MAIL_SERVER_URL}/api/send-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            console.log(`📧 ส่งแจ้งเตือน ${alertType} สำเร็จ (${productList.length} รายการ → ${recipients.length} คน)`);

            // บันทึก Cooldown
            productList.forEach(p => {
                alertCooldowns[p.id] = Date.now();
            });

            // บันทึกลง Firestore (ประวัติการแจ้งเตือน)
            db.collection('notification_logs').add({
                alertType: alertType,
                products: productList.map(p => ({ id: p.id, name: p.name, stock: p.stock })),
                sentTo: recipients,
                sentAt: new Date().toISOString(),
                productCount: productList.length
            });
        } else {
            console.error('❌ ส่งแจ้งเตือนล้มเหลว:', data.error);
        }
    } catch (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อ Mail Server:', err.message);
    }
}

// ================================================================
//  Render UI: หน้าจัดการแจ้งเตือน
// ================================================================
function renderNotifications() {
    const tbody = document.getElementById('notif-table-body');
    if (!tbody) return;

    if (notificationEmails.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-16 text-center text-slate-400 italic"><i class="fa-solid fa-bell-slash text-3xl mb-3 block opacity-20"></i>ยังไม่มีผู้รับแจ้งเตือน กดปุ่ม "เพิ่มผู้รับ" เพื่อเริ่มต้น</td></tr>';
        return;
    }

    tbody.innerHTML = notificationEmails.map(n => {
        const statusBadge = n.active
            ? '<span class="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">เปิดใช้งาน</span>'
            : '<span class="px-2 py-1 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold">ปิดอยู่</span>';

        const date = n.addedAt ? new Date(n.addedAt).toLocaleString('th-TH', { dateStyle: 'short' }) : '-';

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="font-bold text-slate-800 text-sm">${n.name || '-'}</div>
                    <div class="text-[11px] text-slate-400">${n.email}</div>
                </td>
                <td class="px-6 py-4 text-center">${statusBadge}</td>
                <td class="px-6 py-4 text-center text-xs text-slate-400">${n.addedBy || '-'}</td>
                <td class="px-6 py-4 text-center text-xs text-slate-400">${date}</td>
                <td class="px-6 py-4 text-center">
                    <div class="flex justify-center gap-1">
                        <button onclick="sendTestEmail('${n.email}')" title="ส่งอีเมลทดสอบ" class="p-2 text-blue-400 hover:text-blue-600 transition-colors">
                            <i class="fa-solid fa-paper-plane text-xs"></i>
                        </button>
                        <button onclick="toggleNotificationEmail('${n.dbId}', ${n.active})" title="${n.active ? 'ปิดการแจ้งเตือน' : 'เปิดการแจ้งเตือน'}" class="p-2 ${n.active ? 'text-amber-400 hover:text-amber-600' : 'text-emerald-400 hover:text-emerald-600'} transition-colors">
                            <i class="fa-solid ${n.active ? 'fa-bell-slash' : 'fa-bell'} text-xs"></i>
                        </button>
                        <button onclick="removeNotificationEmail('${n.dbId}')" title="ลบ" class="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ส่งแจ้งเตือนทั้งหมด (ปุ่มกดมือ)
async function manualCheckStock() {
    if (!confirm('ต้องการให้ระบบตรวจสอบสต็อกและส่งแจ้งเตือนตอนนี้เลย?')) return;
    await checkLowStockAlerts();
    alert('✅ ตรวจสอบสต็อกเสร็จสิ้น! ตรวจสอบ Console Log สำหรับรายละเอียด');
}
