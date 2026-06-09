const xlsx = require('xlsx');
const path = require('path');

const files = [
    'รายการเบิกพัสดุ ประเภทเวชภัณฑ์ที่ไม่ใช่ย.xlsx',
    'รายการเบิกวัสดุ ประเภทแบบฟอร์ม ส.ป.xlsx'
];

files.forEach(fileName => {
    const filePath = path.join('d:\\Antigravity_Work\\University_Projects\\MMI340 project', fileName);
    try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        console.log(`\n=== Simulating File: ${fileName} ===`);
        // Find header row index
        let headerRowIndex = -1;
        let headers = [];
        const keywords = ['รหัส', 'id', 'code', 'รายการ', 'ชื่อ', 'name', 'หน่วย', 'ราคา', 'price', 'สต็อก', 'คงเหลือ', 'จำนวน', 'stock', 'qty'];

        for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
            const row = rawRows[r];
            if (!row || !Array.isArray(row)) continue;
            const nonEntries = row.filter(val => val !== null && val !== undefined && String(val).trim() !== '');
            if (nonEntries.length < 2) continue;

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

        console.log(`Header Row Index: ${headerRowIndex}`);
        console.log(`Headers found:`, headers);

        const dataRows = rawRows.slice(headerRowIndex + 1);
        let parsedCount = 0;

        for (let dataRowIndex = 0; dataRowIndex < dataRows.length; dataRowIndex++) {
            const row = dataRows[dataRowIndex];
            if (!row || row.length === 0) continue;

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

            // 1. Exact matches
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

            // 2. Fuzzy matches fallback
            keys.forEach(key => {
                const val = String(rowObj[key] ?? '').trim();
                const cleanKey = key.trim();
                const cleanVal = val.replace(/,/g, '');

                if (!id) {
                    if (cleanKey.includes('รหัส') || cleanKey.toLowerCase().includes('id') || cleanKey.toLowerCase().includes('code')) {
                        id = val;
                    } else if (/^\d{4,6}$/.test(val)) {
                        id = val;
                    }
                }
                if (!name) {
                    if (cleanKey.includes('รายการ') || cleanKey.includes('ชื่อ') || cleanKey.toLowerCase().includes('name')) {
                        name = val;
                    }
                }
                if (unit === 'ชิ้น' || unit === '') {
                    if (cleanKey.includes('หน่วย') && !cleanKey.includes('ราคา')) {
                        unit = val;
                    }
                }
                if (stock === 0) {
                    if (cleanKey.includes('สต็อก') || cleanKey.includes('คงเหลือ') || cleanKey.includes('จำนวน')) {
                        stock = Number(val) || 0;
                    }
                }
                if (price === 0) {
                    if ((cleanKey.includes('ราคา') || cleanKey.toLowerCase().includes('price')) && !cleanKey.includes('ปรับ')) {
                        price = Number(cleanVal) || 0;
                    }
                }
            });

            if (id && name && name !== 'รายการ' && name !== 'ชื่อรายการ') {
                parsedCount++;
                if (parsedCount <= 10) {
                    console.log(`Parsed Row #${parsedCount}: Index=${dataRowIndex}, ID="${id}", Name="${name.trim()}", Unit="${unit}", Price=${price}, Stock=${stock}`);
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
});


