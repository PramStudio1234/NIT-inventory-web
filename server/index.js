/*
  ================================================================
    🧠 NIT Inventory — Centralized API Server (v2.0)
    "Single Point of Truth" — Logic รวมศูนย์ที่เดียว
  ================================================================
*/

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

// 1. Initial Firebase Admin (ใช้สิทธิ์ Master)
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
        console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env variable:", err);
        process.exit(1);
    }
} else {
    try {
        if (fs.existsSync('./serviceAccountKey.json')) {
            serviceAccount = require('./serviceAccountKey.json');
        } else if (fs.existsSync('./serviceAccountKey.js')) {
            serviceAccount = require('./serviceAccountKey.js');
        } else {
            // Try to find any json file containing 'firebase-adminsdk' in the current server directory
            const files = fs.readdirSync(__dirname);
            const sdkFile = files.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
            if (sdkFile) {
                console.log(`🤖 Found Firebase Admin SDK key file: ${sdkFile}`);
                serviceAccount = require(`./${sdkFile}`);
            } else {
                throw new Error("Key file not found");
            }
        }
    } catch (err) {
        console.error("Firebase Service Account key file not found. Please place serviceAccountKey.json in the server directory.");
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(cors()); // อนุญาตทุก Origin สำหรับการทดสอบ Local
app.use(express.json());

// 📥 7. นำเข้าข้อมูลจากไฟล์ (Excel / CSV)
app.post('/api/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const { category: globalCat } = req.body;
    let products = [];

    try {
        const fileExt = req.file.originalname.split('.').pop().toLowerCase();

        if (['xlsx', 'xls', 'csv'].includes(fileExt)) {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

            // ค้นหาแถวที่เป็นหัวตารางจริง (Header Row)
            let headerRowIndex = -1;
            let headers = [];
            const keywords = ['รหัส', 'id', 'code', 'รายการ', 'ชื่อ', 'name', 'หน่วย', 'ราคา', 'price', 'สต็อก', 'คงเหลือ', 'จำนวน', 'stock', 'qty'];

            for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
                const row = rawRows[r];
                if (!row || !Array.isArray(row)) continue;
                
                // แถวที่น่าจะเป็นหัวตารางควรมีข้อมูลอย่างน้อย 2 คอลัมน์ขึ้นไป เพื่อข้ามแถวหัวเรื่องที่มี 1 เซลล์
                const nonEntries = row.filter(val => val !== null && val !== undefined && String(val).trim() !== '');
                if (nonEntries.length < 2) continue;

                // ตรวจหาคำสำคัญในแถว
                const hasKeyword = row.some(cell => {
                    const cellStr = String(cell || '').toLowerCase();
                    return keywords.some(kw => cellStr.includes(kw));
                });

                if (hasKeyword) {
                    headerRowIndex = r;
                    headers = row.map(h => String(h || '').trim());
                    break;
                }
            }

            // ถ้าหาหัวตารางไม่เจอจริง ๆ ให้ใช้แถวแรกที่มีข้อมูลอย่างน้อย 2 ช่องเป็นค่าเริ่มต้น
            if (headerRowIndex === -1) {
                for (let r = 0; r < rawRows.length; r++) {
                    const row = rawRows[r];
                    if (row && row.filter(val => val !== null && val !== undefined && String(val).trim() !== '').length >= 2) {
                        headerRowIndex = r;
                        headers = row.map(h => String(h || '').trim());
                        break;
                    }
                }
            }

            console.log(`📊 ค้นพบแถวหัวตารางที่บรรทัดดัชนี: ${headerRowIndex}`);
            if (headerRowIndex !== -1) {
                console.log(`🔑 ชื่อคอลัมน์ที่ตรวจพบ:`, headers);
                
                const dataRows = rawRows.slice(headerRowIndex + 1);
                console.log(`📊 จำนวนแถวข้อมูลทั้งหมดที่เตรียมประมวลผล: ${dataRows.length} แถว`);

                dataRows.forEach((row, dataRowIndex) => {
                    if (!row || row.length === 0) return;

                    // แปลงแถวข้อมูลเป็นออบเจ็กต์ตามชื่อคอลัมน์
                    const rowObj = {};
                    headers.forEach((header, idx) => {
                        if (header) {
                            rowObj[header] = row[idx];
                        }
                    });

                    const keys = Object.keys(rowObj);
                    let id = '';
                    let name = '';
                    let unit = 'ชิ้น';
                    let stock = 0;
                    let price = 0;

                    // 1. ค้นหาแบบตรงตัวก่อน (Exact matches)
                    keys.forEach(key => {
                        const val = String(rowObj[key] ?? '').trim();
                        const cleanKey = key.trim();
                        const cleanVal = val.replace(/,/g, '');

                        if (cleanKey === 'รหัส' || cleanKey === 'รหัสสินค้า' || cleanKey.toLowerCase() === 'id' || cleanKey.toLowerCase() === 'code') {
                            id = val;
                        }
                        if (cleanKey === 'รายการ' || cleanKey === 'ชื่อรายการ' || cleanKey === 'ชื่อสินค้า' || cleanKey.toLowerCase() === 'name' || cleanKey.toLowerCase() === 'title') {
                            name = val;
                        }
                        if (cleanKey === 'หน่วย' || cleanKey === 'หน่วยนับ' || cleanKey.toLowerCase() === 'unit' || cleanKey.toLowerCase() === 'units') {
                            unit = val;
                        }
                        if (cleanKey === 'สต็อก' || cleanKey === 'คงเหลือ' || cleanKey === 'จำนวน' || cleanKey === 'จำนวนคงเหลือ' || cleanKey.toLowerCase() === 'stock' || cleanKey.toLowerCase() === 'qty' || cleanKey.toLowerCase() === 'quantity') {
                            stock = Number(val) || 0;
                        }
                        if (cleanKey === 'ราคา' || cleanKey === 'ราคา/หน่วย' || cleanKey === 'ราคาต่อหน่วย' || cleanKey.toLowerCase() === 'price' || cleanKey.toLowerCase() === 'rate') {
                            price = Number(cleanVal) || 0;
                        }
                    });

                    // 2. ค้นหาแบบรวมคำ (Fuzzy/Substring fallback) สำหรับฟิลด์ที่ยังไม่ได้ค่า
                    keys.forEach(key => {
                        const val = String(rowObj[key] ?? '').trim();
                        const cleanKey = key.trim();
                        const cleanVal = val.replace(/,/g, '');

                        // ID fallback
                        if (!id) {
                            if (cleanKey.includes('รหัส') || cleanKey.toLowerCase().includes('id') || cleanKey.toLowerCase().includes('code')) {
                                id = val;
                            } else if (/^\d{4,6}$/.test(val)) {
                                id = val;
                            }
                        }
                        // Name fallback
                        if (!name) {
                            if (cleanKey.includes('รายการ') || cleanKey.includes('ชื่อ') || cleanKey.toLowerCase().includes('name')) {
                                name = val;
                            }
                        }
                        // Unit fallback (ต้องข้าม 'ราคา/หน่วย')
                        if (unit === 'ชิ้น' || unit === '') {
                            if (cleanKey.includes('หน่วย') && !cleanKey.includes('ราคา')) {
                                unit = val;
                            }
                        }
                        // Stock fallback
                        if (stock === 0) {
                            if (cleanKey.includes('สต็อก') || cleanKey.includes('คงเหลือ') || cleanKey.includes('จำนวน')) {
                                stock = Number(val) || 0;
                            }
                        }
                        // Price fallback (ต้องข้าม 'ปรับราคา')
                        if (price === 0) {
                            if ((cleanKey.includes('ราคา') || cleanKey.toLowerCase().includes('price')) && !cleanKey.includes('ปรับ')) {
                                price = Number(cleanVal) || 0;
                            }
                        }
                    });

                    // ตรวจเช็คว่ามีรหัสและชื่อพัสดุ จึงค่อยบันทึก
                    if (id && name && name !== 'รายการ' && name !== 'ชื่อรายการ') {
                        products.push({
                            id: id,
                            name: name,
                            unitSmall: unit,
                            cat: globalCat || 'ทั่วไป',
                            stock: stock,
                            min: 5,
                            type: 'consumable',
                            ratio: 1,
                            unitLarge: unit,
                            price: price,
                            sortOrder: dataRowIndex,
                            createdAt: admin.firestore.Timestamp.now().toDate().toISOString()
                        });
                    }
                });
            }
            console.log(`✅ กรองและเตรียมข้อมูลได้สำเร็จ ${products.length} รายการ`);
        } else {
            return res.status(400).json({ error: 'รูปแบบไฟล์ไม่รองรับ (กรุณาใช้ Excel หรือ CSV)' });
        }

        // บันทึกลง Firestore (แบ่งเป็นชุดๆ ชุดละ 400 รายการ เพื่อป้องกัน Batch Limit 500)
        if (products.length > 0) {
            console.log(`📦 เริ่มบันทึกข้อมูลลงฐานข้อมูล (ทั้งหมด ${products.length} รายการ)...`);
            
            const CHUNK_SIZE = 400;
            for (let i = 0; i < products.length; i += CHUNK_SIZE) {
                const chunk = products.slice(i, i + CHUNK_SIZE);
                const batch = db.batch();
                
                chunk.forEach(p => {
                    const ref = db.collection('products').doc();
                    batch.set(ref, p);
                });
                
                await batch.commit();
                console.log(`✅ บันทึกสำเร็จแล้ว ${Math.min(i + CHUNK_SIZE, products.length)} / ${products.length} รายการ`);
            }
        }

        // ลบไฟล์ชั่วคราว
        fs.unlinkSync(filePath);

        res.json({ success: true, count: products.length });

    } catch (err) {
        console.error('Import Error:', err);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: 'ไม่สามารถประมวลผลไฟล์ได้: ' + err.message });
    }
});

const PORT = process.env.PORT || 3001;

// ====== sendEmailViaBrevo Helper ======
async function sendEmailViaBrevo(toEmails, subject, htmlContent) {
    const brevoApiKey = process.env.BREVO_API_KEY || process.env.GMAIL_PASS; 
    const senderEmail = process.env.GMAIL_USER || 'nit-inventory@example.com'; 

    if (!brevoApiKey) {
        throw new Error("BREVO_API_KEY or GMAIL_PASS environment variable is missing.");
    }

    const recipients = Array.isArray(toEmails) 
        ? toEmails.map(email => ({ email }))
        : [{ email: toEmails }];

    const payload = {
        sender: {
            name: "NIT Inventory 🧠",
            email: senderEmail
        },
        to: recipients,
        subject: subject,
        htmlContent: htmlContent
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data));
    }
    return data;
}

// ฟังก์ชันตรวจสอบสต็อกและส่งแจ้งเตือนอัตโนมัติ
async function processStockAlerts(systemName) {
    try {
        const adminSnapshot = await db.collection('users').where('role', 'in', ['admin', 'superadmin']).get();
        const adminEmails = adminSnapshot.docs.map(doc => doc.data().email).filter(email => !!email);
        if (adminEmails.length === 0) return;

        const productsSnapshot = await db.collection('products').get();
        const allProducts = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const outOfStock = allProducts.filter(p => p.stock <= 0);
        const lowStock = allProducts.filter(p => p.stock > 0 && p.stock < 5);

        if (outOfStock.length > 0) await sendFormattedEmail(adminEmails, outOfStock, 'out_of_stock', systemName);
        if (lowStock.length > 0) await sendFormattedEmail(adminEmails, lowStock, 'low_stock', systemName);
    } catch (err) {
        console.error('Auto Alert Error:', err);
    }
}

async function sendFormattedEmail(recipients, productList, alertType, systemName) {
    const productHtml = productList.map(p => `
        <li style="margin-bottom: 10px; padding: 10px; border-left: 4px solid ${alertType === 'out_of_stock' ? '#ef4444' : '#f59e0b'}; background: #f8fafc;">
            <strong>${p.name}</strong> (ID: ${p.id})<br>
            คงเหลือ: <span style="color: ${alertType === 'out_of_stock' ? '#ef4444' : '#f59e0b'}; font-weight: bold;">${p.stock} ${p.unitSmall || 'หน่วย'}</span> 
        </li>
    `).join('');

    const subject = `${alertType === 'out_of_stock' ? '⚠️ [ด่วน] สินค้าหมดสต็อก' : '🔔 [แจ้งเตือน] สินค้าใกล้หมด'} - ${systemName}`;
    const htmlContent = `<div style="font-family: sans-serif; padding: 20px;"><h2>แจ้งเตือนสินค้า</h2><ul>${productHtml}</ul></div>`;

    return sendEmailViaBrevo(recipients, subject, htmlContent);
}

// API Endpoints
app.get('/', (req, res) => res.json({ status: 'NIT API v2.0 Online' }));

// 🔔 ส่งอีเมลทดสอบระบบแจ้งเตือน
app.post('/api/notifications/test', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const htmlContent = `
            <div style="font-family: sans-serif; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h2 style="color: #4f46e5;">ระบบแจ้งเตือน NIT Inventory ทำงานปกติ</h2>
                <p>นี่คืออีเมลทดสอบที่ส่งจากเซิร์ฟเวอร์จำลองเพื่อทดสอบระบบส่งเมล</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="font-size: 12px; color: #64748b;">ส่งเมื่อ: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
        `;

        await sendEmailViaBrevo(email, '🔔 ทดสอบระบบแจ้งเตือน - NIT Inventory', htmlContent);
        res.json({ success: true });
    } catch (err) {
        console.error('Test Email Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 🔔 ส่งแจ้งเตือนสต็อกต่ำ/หมดสต็อก
app.post('/api/send-alert', async (req, res) => {
    const { recipients, products, alertType, systemName } = req.body;
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Recipients array is required' });
    }
    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'Products array is required' });
    }

    try {
        const productHtml = products.map(p => `
            <li style="margin-bottom: 10px; padding: 10px; border-left: 4px solid ${alertType === 'out_of_stock' ? '#ef4444' : '#f59e0b'}; background: #f8fafc; list-style-type: none;">
                <strong style="font-size: 15px; color: #1e293b;">${p.name}</strong> (รหัสพัสดุ: ${p.id})<br>
                คงเหลือ: <span style="color: ${alertType === 'out_of_stock' ? '#ef4444' : '#f59e0b'}; font-weight: bold;">${p.stock} ${p.unit || 'หน่วย'}</span> 
                ${alertType === 'low_stock' ? `<span style="color: #64748b; font-size: 13px;">(เกณฑ์ขั้นต่ำ: ${p.min} ${p.unit || 'หน่วย'})</span>` : ''}
            </li>
        `).join('');

        const isOutOfStock = alertType === 'out_of_stock';
        const title = isOutOfStock ? '⚠️ [ด่วน] พัสดุหมดสต็อก' : '🔔 [แจ้งเตือน] พัสดุใกล้หมด/เกณฑ์ต่ำ';
        const bannerColor = isOutOfStock ? '#ef4444' : '#f59e0b';

        const htmlContent = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 10px; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <div style="background-color: ${bannerColor}; padding: 32px 24px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">${title}</h1>
                        <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">${systemName || 'ระบบบริหารจัดการคลังพัสดุ'}</p>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 32px 24px;">
                        <p style="font-size: 14px; margin-bottom: 20px; color: #475569;">พบพัสดุในคลังมีปริมาณต่ำกว่าเกณฑ์หรือหมดลง กรุณาตรวจสอบและดำเนินสั่งซื้อเพิ่มเติม:</p>
                        <ul style="padding: 0; margin: 0;">
                            ${productHtml}
                        </ul>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; font-size: 11px; color: #94a3b8;">ระบบแจ้งเตือนอัตโนมัติจาก NIT Inventory</p>
                    </div>
                </div>
            </div>
        `;

        await sendEmailViaBrevo(recipients, `${title} - ${systemName || 'NIT Inventory'}`, htmlContent);
        res.json({ success: true });
    } catch (err) {
        console.error('Send Alert Email Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/slips/notify-new', async (req, res) => {
    const { slipNo, requester, items, timestamp } = req.body;
    try {
        const adminSnapshot = await db.collection('users').where('role', 'in', ['admin', 'superadmin']).get();
        const adminEmails = adminSnapshot.docs.map(doc => doc.data().email).filter(email => !!email);
        
        if (adminEmails.length === 0) {
            return res.json({ success: true, message: 'No admin/superadmin emails found to notify.' });
        }
        
        const itemsHtml = items.map(item => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px; font-size: 14px; color: #334155;">${item.productId || '-'}</td>
                <td style="padding: 12px; font-size: 14px; color: #1e293b; font-weight: 500;">${item.productName || 'ไม่ระบุ'}</td>
                <td style="padding: 12px; font-size: 14px; color: #334155; text-align: center;">${item.qty}</td>
                <td style="padding: 12px; font-size: 14px; color: #334155; text-align: center;">${item.unitName || 'หน่วย'}</td>
                <td style="padding: 12px; font-size: 14px; color: #334155; text-align: center;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; 
                                 background-color: ${item.type === 'asset' ? '#f3e8ff' : '#e0f2fe'}; 
                                 color: ${item.type === 'asset' ? '#6b21a8' : '#0369a1'};">
                        ${item.type === 'asset' ? 'ครุภัณฑ์' : 'วัสดุสิ้นเปลือง'}
                    </span>
                </td>
            </tr>
        `).join('');

        const formattedDate = new Date(timestamp).toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        const htmlContent = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 10px; color: #1e293b;">
                <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02); border: 1px solid #e2e8f0;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 32px 24px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">ใบเบิกพัสดุใหม่รออนุมัติ</h1>
                        <p style="color: #e0e7ff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">มีรายการคำขอเบิกพัสดุใหม่ในระบบที่รอการตรวจสอบและอนุมัติ</p>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 32px 24px;">
                        <!-- Details Card -->
                        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 28px; border: 1px solid #f1f5f9; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.01);">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 6px 0; font-size: 14px; color: #64748b; width: 30%; font-weight: 500;">เลขที่ใบเบิก:</td>
                                    <td style="padding: 6px 0; font-size: 14px; color: #4f46e5; font-weight: 700;">${slipNo}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">ผู้ขอเบิก:</td>
                                    <td style="padding: 6px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${requester}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">วันเวลาที่ส่ง:</td>
                                    <td style="padding: 6px 0; font-size: 14px; color: #334155;">${formattedDate} น.</td>
                                </tr>
                            </table>
                        </div>
                        
                        <!-- Table Title -->
                        <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #0f172a; font-weight: 700; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">
                            <span style="border-bottom: 2px solid #4f46e5; padding-bottom: 8px; display: inline-block;">รายการพัสดุที่ขอเบิก</span>
                        </h3>
                        
                        <!-- Items Table -->
                        <div style="overflow-x: auto; margin-bottom: 32px;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                                        <th style="padding: 12px; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600;">รหัส</th>
                                        <th style="padding: 12px; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600;">ชื่อรายการ</th>
                                        <th style="padding: 12px; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; text-align: center;">จำนวน</th>
                                        <th style="padding: 12px; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; text-align: center;">หน่วย</th>
                                        <th style="padding: 12px; font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; text-align: center;">ประเภท</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Action Button -->
                        <div style="text-align: center; margin-top: 32px; margin-bottom: 8px;">
                            <a href="http://localhost:3000" style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; padding: 14px 36px; font-size: 15px; font-weight: 700; border-radius: 8px; display: inline-block; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); transition: all 0.2s;">
                                เข้าสู่ระบบเพื่ออนุมัติใบเบิก
                            </a>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8; font-weight: 500;">ระบบแจ้งเตือนอัตโนมัติจาก NIT Inventory</p>
                        <p style="margin: 6px 0 0 0; font-size: 11px; color: #cbd5e1;">สถาบันประสาทวิทยา (Neurological Institute of Thailand)</p>
                    </div>
                </div>
            </div>
        `;

        await sendEmailViaBrevo(adminEmails, `🔔 [ขออนุมัติ] ใบเบิกใหม่เลขที่ ${slipNo} - โดยคุณ ${requester}`, htmlContent);
        res.json({ success: true, message: `Notified ${adminEmails.length} admin(s)/superadmin(s).` });
    } catch (err) {
        console.error('Notify New Slip Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 🔔 ส่งอีเมลแจ้งผลการเบิกพัสดุ (อนุมัติ / ปฏิเสธ) ไปหา User
async function sendSlipStatusEmail(recipientEmail, requesterName, slipNo, status, reason, adminUser) {
    const isApproved = status === 'approved';
    const statusText = isApproved ? 'อนุมัติเรียบร้อยแล้ว' : 'ถูกปฏิเสธ';
    const statusColor = isApproved ? '#10b981' : '#ef4444';
    const title = `🔔 [ผลการเบิกพัสดุ] ใบเบิกเลขที่ ${slipNo} ${statusText}`;

    const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 10px; color: #1e293b;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
                <!-- Header -->
                <div style="background-color: ${statusColor}; padding: 32px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800;">ใบเบิกพัสดุ${statusText}</h1>
                    <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">สถาบันประสาทวิทยา (NIT Inventory)</p>
                </div>
                
                <!-- Content -->
                <div style="padding: 32px 24px;">
                    <p style="font-size: 16px; color: #0f172a; font-weight: bold; margin-bottom: 20px;">เรียน คุณ ${requesterName},</p>
                    <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                        คำขอเบิกพัสดุของคุณ เลขที่ <strong>${slipNo}</strong> ได้รับการพิจารณาโดยผู้ดูแลระบบแล้ว
                    </p>
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #f1f5f9; margin: 24px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 6px 0; font-size: 14px; color: #64748b; width: 40%; font-weight: 500;">ผลการพิจารณา:</td>
                                <td style="padding: 6px 0; font-size: 14px; color: ${statusColor}; font-weight: bold;">${statusText}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">ผู้พิจารณา:</td>
                                <td style="padding: 6px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${adminUser}</td>
                            </tr>
                            ${!isApproved && reason ? `
                            <tr>
                                <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500; vertical-align: top;">เหตุผลที่ไม่พิจารณา:</td>
                                <td style="padding: 6px 0; font-size: 14px; color: #ef4444; font-weight: 600;">${reason}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #f1f5f9;">
                    <p style="margin: 0; font-size: 12px; color: #94a3b8; font-weight: 500;">ระบบแจ้งเตือนอัตโนมัติจาก NIT Inventory</p>
                </div>
            </div>
        </div>
    `;

    return sendEmailViaBrevo(recipientEmail, title, htmlContent);
}

app.post('/api/slips/approve', async (req, res) => {
    const { slipId, adminUser } = req.body;
    try {
        const slipRef = db.collection('slips').doc(slipId);
        const slipDoc = await slipRef.get();
        if (!slipDoc.exists) return res.status(404).json({ error: 'ไม่พบใบเบิก' });
        const slipData = slipDoc.data();
        if (slipData.status !== 'pending') return res.status(400).json({ error: 'ประมวลผลไปแล้ว' });

        const batch = db.batch();
        for (const item of slipData.items) {
            const prodRef = db.collection('products').doc(item.productDbId);
            batch.update(prodRef, { stock: admin.firestore.FieldValue.increment(-item.qtySmall) });
            const logRef = db.collection('logs').doc();
            const isAsset = item.type === 'asset';
            batch.set(logRef, {
                timestamp: new Date().toISOString(),
                user: slipData.requester,
                productId: item.productId,
                productName: item.productName,
                qty: item.qtySmall,
                unitName: item.unitName,
                type: isAsset ? 'borrow' : 'withdraw',
                slipNo: slipData.slipNo,
                status: isAsset ? 'pending' : 'approved'
            });
        }
        batch.update(slipRef, { status: 'approved', approvedBy: adminUser, approvedAt: new Date().toISOString() });
        await batch.commit();
        processStockAlerts('NIT Inventory — สถาบันประสาทวิทยา');

        // ส่งเมลแจ้งผู้ใช้งานหากมีอีเมลระบุอยู่
        if (slipData.requesterEmail) {
            try {
                await sendSlipStatusEmail(slipData.requesterEmail, slipData.requester, slipData.slipNo, 'approved', null, adminUser);
            } catch (mailErr) {
                console.error('Failed to send approval email:', mailErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/slips/reject', async (req, res) => {
    const { slipId, adminUser, reason } = req.body;
    try {
        const slipRef = db.collection('slips').doc(slipId);
        const slipDoc = await slipRef.get();
        if (!slipDoc.exists) return res.status(404).json({ error: 'ไม่พบใบเบิก' });
        const slipData = slipDoc.data();
        if (slipData.status !== 'pending') return res.status(400).json({ error: 'ประมวลผลไปแล้ว' });

        await slipRef.update({
            status: 'rejected',
            rejectReason: reason || 'ไม่ระบุเหตุผล',
            rejectedBy: adminUser,
            rejectedAt: new Date().toISOString()
        });

        // ส่งเมลแจ้งผู้ใช้งานหากมีอีเมลระบุอยู่
        if (slipData.requesterEmail) {
            try {
                await sendSlipStatusEmail(slipData.requesterEmail, slipData.requester, slipData.slipNo, 'rejected', reason, adminUser);
            } catch (mailErr) {
                console.error('Failed to send rejection email:', mailErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Reject Slip Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const docRef = await db.collection('products').add({ ...req.body, createdAt: new Date().toISOString() });
        res.json({ success: true, id: docRef.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const productRef = db.collection('products').doc(req.params.id);
        await productRef.update({
            ...req.body,
            updatedAt: new Date().toISOString()
        });
        
        // 🔔 เรียกใช้งานระบบแจ้งเตือนทันทีหลังแก้ไขข้อมูลสำเร็จ
        processStockAlerts('NIT Inventory — สถาบันประสาทวิทยา');
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/clear-all', async (req, res) => {
    try {
        const snapshot = await db.collection('products').get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await db.collection('products').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: email,
                password: password,
                displayName: name
            });
        } catch (authError) {
            if (authError.code === 'auth/email-already-in-use' || authError.code === 'auth/email-already-exists') {
                userRecord = await admin.auth().getUserByEmail(email);
                await admin.auth().updateUser(userRecord.uid, {
                    password: password,
                    displayName: name
                });
            } else {
                throw authError;
            }
        }

        const userDocRef = db.collection('users').doc(userRecord.uid);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
            await userDocRef.update({
                name: name,
                role: role,
                updatedAt: new Date().toISOString()
            });
            res.json({ success: true, message: `✅ อัปเดตข้อมูลผู้ใช้งานและรหัสผ่านของคุณ ${name} สำเร็จ` });
        } else {
            await userDocRef.set({
                name: name,
                email: email,
                role: role,
                createdAt: new Date().toISOString()
            });
            res.json({ success: true, message: `✅ สร้างบัญชีและเชื่อมโยงโปรไฟล์คุณ ${name} สำเร็จ` });
        }
    } catch (err) {
        console.error('Create User Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:uid', async (req, res) => {
    try {
        try { await admin.auth().deleteUser(req.params.uid); } catch (e) {}
        await db.collection('users').doc(req.params.uid).delete();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`🚀 NIT API Online on port ${PORT}`));
