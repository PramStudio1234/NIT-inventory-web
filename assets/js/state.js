/* 
  ==============================================================
    ส่วนที่ 1: สถานะและข้อมูลของระบบผ่าน Firebase (STATE & DATA)
  ==============================================================
*/

// ตัวแปรเก็บสิทธิ์การใช้งาน
let currentRole = 'superadmin';
let currentUser = 'เจ้าหน้าที่_1';
let currentUserEmail = '';

// สร้างตัวแปรเก็บ Instance ของกราฟ 
let usageChartInstance = null;

// ข้อมูลหลักจะถูกแทนที่ด้วย Real-time Data จาก Firebase คลาวด์
let products = [];
let logs = [];
let slips = []; // ใบเบิกพัสดุทั้งหมด
let cart = [];  // ตะกร้าสินค้าปัจจุบัน (Local เท่านั้น)

// ตรวจสอบขั้นต้นว่ามีการตั้งค่า API KEY หรือไม่
function checkFirebaseSetup() {
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey.includes('ใส่_API_KEY')) {
        alert('⚠️ ระบบทำงานจำกัด: ยังไม่ได้ใส่ API Key ของ Firebase ในไฟล์ assets/js/firebase-config.js');
        return false;
    }
    return true;
}

// ฟังก์ชันเริ่มสายข่าวฟังข้อมูล Realtime จาก Firestore ฐานข้อมูล
function initFirebaseListeners() {
    if (!checkFirebaseSetup()) return;

    db.collection('products').onSnapshot((snapshot) => {
        let loadedProducts = [];
        snapshot.forEach((doc) => {
            loadedProducts.push({ dbId: doc.id, ...doc.data() });
        });
        loadedProducts.sort((a, b) => {
            const orderA = a.sortOrder !== undefined ? a.sortOrder : 999999;
            const orderB = b.sortOrder !== undefined ? b.sortOrder : 999999;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
        });
        products = loadedProducts;
        if (typeof updateUI === 'function') updateUI();
    }, (error) => {
        console.error("Firebase Error (Products): ", error);
    });

    // 2. ติดตาม Collection: 'logs' 
    db.collection('logs').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        logs = [];
        snapshot.forEach((doc) => {
            logs.push({ dbId: doc.id, ...doc.data() });
        });
        if (typeof updateUI === 'function') updateUI();
    }, (error) => {
        console.warn("ไม่สามารถดึงข้อมูล Log ได้...");
    });

    // 3. ติดตาม Collection: 'slips'
    db.collection('slips').orderBy('timestamp', 'desc').onSnapshot((snapshot) => {
        slips = [];
        snapshot.forEach((doc) => {
            slips.push({ dbId: doc.id, ...doc.data() });
        });

        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified") {
                const data = change.doc.data();
                const slipDbId = change.doc.id;
                if (data.requester === currentUser && data.isNotified === false && (data.status === 'approved' || data.status === 'rejected')) {
                    const msg = data.status === 'approved' ? 'ได้รับการอนุมัติแล้ว!' : 'ถูกปฏิเสธ!';
                    alert(`แจ้งเตือน: ใบเบิกเลขที่ ${data.slipNo} ของคุณ ${msg}`);
                    db.collection('slips').doc(slipDbId).update({ isNotified: true }).catch(err => console.error("Error: ", err));
                }
            }
        });

        if (typeof updateUI === 'function') updateUI();
        if (typeof renderApprovals === 'function') renderApprovals();
    }, (error) => {
        console.error("Firebase Error (Slips): ", error);
    });

    // 4. ติดตาม Collection: 'notification_emails'
    db.collection('notification_emails').onSnapshot((snapshot) => {
        notificationEmails = [];
        snapshot.forEach((doc) => {
            notificationEmails.push({ dbId: doc.id, ...doc.data() });
        });
    }, (error) => {
        console.warn("ไม่สามารถดึงข้อมูล notification_emails ได้");
    });
}
