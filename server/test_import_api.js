const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Initialize firebase admin to check DB directly
const serviceAccount = require('./serviceAccountKey.js');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function runTest() {
    const PORT = 3002;
    const urlClear = `http://localhost:${PORT}/api/products/clear-all`;
    const urlImport = `http://localhost:${PORT}/api/import`;
    const excelPath = path.join(__dirname, '..', 'รายการเบิกพัสดุ ประเภทเวชภัณฑ์ที่ไม่ใช่ย.xlsx');

    console.log("1. Clearing database products...");
    try {
        const clearRes = await fetch(urlClear, { method: 'DELETE' });
        const clearJson = await clearRes.json();
        console.log("Clear DB Response:", clearJson);
    } catch (e) {
        console.error("Failed to clear DB, server might not be running on 3002:", e.message);
        return;
    }

    console.log("2. Uploading Excel file via API...");
    const fileBuffer = fs.readFileSync(excelPath);
    const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const formData = new FormData();
    formData.append('file', blob, 'รายการเบิกพัสดุ ประเภทเวชภัณฑ์ที่ไม่ใช่ย.xlsx');
    formData.append('category', 'เวชภัณฑ์');

    try {
        const importRes = await fetch(urlImport, {
            method: 'POST',
            body: formData
        });
        const importJson = await importRes.json();
        console.log("Import DB Response:", importJson);
    } catch (e) {
        console.error("Failed to import Excel:", e);
        return;
    }

    console.log("3. Querying Firestore to verify...");
    try {
        const snapshot = await db.collection('products').get();
        const loadedProducts = [];
        snapshot.forEach(doc => {
            loadedProducts.push({ dbId: doc.id, ...doc.data() });
        });

        console.log(`Total products in DB: ${loadedProducts.length}`);

        // Sort them by sortOrder like frontend will
        loadedProducts.sort((a, b) => {
            const orderA = a.sortOrder !== undefined ? a.sortOrder : 999999;
            const orderB = b.sortOrder !== undefined ? b.sortOrder : 999999;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
        });

        // Let's print the first 10
        console.log("\nFirst 10 imported products in sorted order:");
        loadedProducts.slice(0, 10).forEach((p, idx) => {
            console.log(`[#${idx + 1}] ID: "${p.id}", Name: "${p.name.trim()}", Unit: "${p.unitSmall}", Price: ${p.price}, SortOrder: ${p.sortOrder}`);
        });

        // Specific test verification
        const itemFeedTube = loadedProducts.find(p => p.id === '1495');
        if (itemFeedTube) {
            console.log("\nVerification for 'สายให้อาหาร No.6' (ID 1495):");
            console.log(`- Name: "${itemFeedTube.name.trim()}"`);
            console.log(`- Unit: "${itemFeedTube.unitSmall}" (Expected: "เส้น")`);
            console.log(`- Price: ${itemFeedTube.price} (Expected: 11.8)`);
            console.log(`- SortOrder: ${itemFeedTube.sortOrder} (Expected: index of row)`);

            if (itemFeedTube.unitSmall === 'เส้น' && itemFeedTube.price === 11.8) {
                console.log("\n✅ SUCCESS: Unit and Price are correctly parsed!");
            } else {
                console.error("\n❌ FAILURE: Unit or Price mapping is incorrect!");
            }
        } else {
            console.error("❌ FAILURE: 'สายให้อาหาร No.6' (ID 1495) not found in DB!");
        }

    } catch (err) {
        console.error("Verification query failed:", err);
    }
}

runTest();
