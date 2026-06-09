// =========================================================
// ตั้งค่าการเชื่อมต่อ Firebase (นำข้อมูลมาจากหน้า Project settings)
// =========================================================

const firebaseConfig = {
    apiKey: "AIzaSyAEYgrEUm3kzilEwszLokgXT1XcjZPIECs",
    authDomain: "opd-neuro-inventory.firebaseapp.com",
    projectId: "opd-neuro-inventory",
    storageBucket: "opd-neuro-inventory.firebasestorage.app",
    messagingSenderId: "719608261467",
    appId: "1:719608261467:web:ac6a45837130414b7bc87e",
    measurementId: "G-M2NJB0XDJT"
};

// Initialize Firebase SDK
firebase.initializeApp(firebaseConfig);

// ตัวแปร db เพื่อเรียกใช้งาน Firestore Database
const db = firebase.firestore();
