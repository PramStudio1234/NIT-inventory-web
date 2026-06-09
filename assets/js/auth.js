/* 
  ==============================================================
    ส่วนที่ 6: ระบบเข้าสู่ระบบและสมัครสมาชิก (Authentication)
  ==============================================================
*/

// สลับหน้าจอระหว่างฟอร์ม Login และ Register
function toggleAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('form-login').classList.add('hide');
        document.getElementById('form-register').classList.remove('hide');
    } else {
        document.getElementById('form-register').classList.add('hide');
        document.getElementById('form-login').classList.remove('hide');
    }
}

// 1. ตอบสนองต่อปุ่ม Login
function handleLogin(e) {
    e.preventDefault();
    if (!checkFirebaseSetup()) return;

    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    firebase.auth().signInWithEmailAndPassword(email, pass)
    .then((userCredential) => {
        // ลงชื่อเข้าใช้สำเร็จ onAuthStateChanged จะทำงานต่ออัตโนมัติ
        document.getElementById('form-login').reset();
    })
    .catch((error) => {
        alert("เข้าสู่ระบบล้มเหลว: " + error.message);
    });
}

// 2. ตอบสนองต่อปุ่ม Register (สร้างสมาชิกใหม่จะเป็นระดับ user เสมอ)
function handleRegister(e) {
    e.preventDefault();
    if (!checkFirebaseSetup()) return;

    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;
    const name = document.getElementById('reg-name').value;

    // สร้างบัญชีใน Authentication
    firebase.auth().createUserWithEmailAndPassword(email, pass)
    .then((userCredential) => {
        const user = userCredential.user;
        // สร้าง Profile ลงใน Firestore Collection 'users'
        return db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            role: 'user', // ค่าตั้งต้น บังคับเป็นแค่คนยืมของ
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    })
    .then(() => {
        document.getElementById('form-register').reset();
        alert('สมัครสมาชิกสำเร็จ! โปรดเข้าสู่ระบบ');
        toggleAuthMode('login'); // เด้งกลับไปหน้าล็อกอิน
    })
    .catch((error) => {
        alert("สมัครสมาชิกไม่สำเร็จ: " + error.message);
    });
}

// 3. ฟังก์ชันออกจากระบบ 
function logoutUser() {
    if(confirm('ต้องการออกจากระบบใช่หรือไม่?')) {
        firebase.auth().signOut().then(() => {
            // สำเร็จ เดี๋ยว onAuthStateChanged จะจัดการปิดหน้าจอเอง
        }).catch((error) => {
            alert('ออกระบบล้มเหลว: ' + error.message);
        });
    }
}

// 4. สายลับดักจับว่าตอนนี้มีคนออนอยู่ไหม (ทำงานตลอดเวลา)
firebase.auth().onAuthStateChanged((user) => {
    const authScreen = document.getElementById('auth-screen');
    const profileUI = document.getElementById('user-profile-section');

    if (user) {
        // 🔥 ถ้ามีคนล็อกอินอยู่: เข้าไปดึงสิทธิ์ใน Firestore 
        db.collection('users').doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const userData = doc.data();
                
                currentUser = userData.name;
                currentUserEmail = userData.email || user.email || '';
                currentRole = userData.role;

                changeRole(currentRole);

                document.getElementById('display-user-name').innerText = userData.name;
                document.getElementById('display-user-role').innerText = userData.role.toUpperCase();
                
                authScreen.classList.add('hide'); // ซ่อนหน้าล็อกอิน
                profileUI.classList.remove('hide'); // โชว์โปรไฟล์มุมขวาบน
                initFirebaseListeners();

                // 🚀 ถ้าเป็น Super Admin ให้เริ่มโหลดรายชื่อพนักงานรอไว้เลย
                if (currentRole === 'superadmin' && typeof loadUsersList === 'function') {
                    loadUsersList();
                }
            } else {
                console.warn('ผู้ใช้นี้ถูกลบ Profile ออกจากระบบแล้ว');
                alert('บัญชีนี้ถูกระงับหรือลบออกจากระบบแล้ว\nไม่สามารถเข้าใช้งานได้!');
                firebase.auth().signOut().then(() => {
                    location.reload();
                });
            }
        }).catch(err => {
            console.error("Firestore Error Fetching User:", err);
            alert("ไม่สามารถดึงข้อมูลพนักงานได้ โปรดติดต่อผู้ดูแลระบบให้ตรวจสอบสิทธิ์ใน Firebase");
        });

    } else {
        // 🔒 ถ้าไม่มีใครล็อกอิน: หรือเพิ่งกด Logout มา
        // เปิดหน้าจอล็อกอินขึ้นมาบังแอปไว้
        if (authScreen) authScreen.classList.remove('hide');
        if (profileUI) profileUI.classList.add('hide');
        
        // เราสามารถล้างตัวแปร products/logs ทิ้งก่อนได้ เพื่อไม่ให้คนอื่นสับจอมาแอบดู
        currentUser = '';
        currentUserEmail = '';
        products = [];
        logs = [];
        if(typeof updateUI === "function") updateUI();
    }
});
