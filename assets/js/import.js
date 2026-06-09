/* 
  ==============================================================
    🧠 ระบบนำเข้าข้อมูล (Import System) 
  ==============================================================
*/

const MAIL_SERVER_URL = 'https://nit-inventory-api.onrender.com';

function openImportModal() {
    if (currentRole !== 'superadmin') {
        alert('เฉพาะ Super Admin เท่านั้นที่สามารถนำเข้าข้อมูลได้');
        return;
    }
    document.getElementById('modal-import').classList.remove('hide');
}

function closeImportModal() {
    document.getElementById('modal-import').classList.add('hide');
    document.getElementById('import-file').value = '';
    document.getElementById('import-status').innerHTML = '';
}

async function handleImport() {
    const fileInput = document.getElementById('import-file');
    const statusDiv = document.getElementById('import-status');
    const globalCat = document.getElementById('import-cat').value;

    if (!fileInput.files[0]) {
        alert('กรุณาเลือกไฟล์ก่อนครับ');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', globalCat);

    statusDiv.innerHTML = '<div class="text-indigo-600 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังประมวลผลไฟล์และนำเข้าข้อมูล...</div>';

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/import`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (data.success) {
            statusDiv.innerHTML = `
                <div class="p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
                    <i class="fa-solid fa-circle-check mr-2"></i> 
                    นำเข้าสำเร็จ ${data.count} รายการ! ข้อมูลกำลังปรากฏในตาราง Real-time
                </div>
            `;
            setTimeout(closeImportModal, 3000);
        } else {
            statusDiv.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">❌ ล้มเหลว: ${data.error}</div>`;
        }
    } catch (err) {
        statusDiv.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">❌ เกิดข้อผิดพลาด: ${err.message}</div>`;
    }
}

// ฟังก์ชันดาวน์โหลดเทมเพลตไฟล์นำเข้าพัสดุ (.csv UTF-8 BOM เพื่อรองรับภาษาไทยใน Excel)
function downloadImportTemplate() {
    const headers = "ลำดับที่,รหัสพัสดุ,รายการ,จำนวนคงเหลือในคลัง,หน่วยนับ,ราคาต่อหน่วย(บาท)\n" +
                    "1,1490,ใบมีดผ่าตัดพร้อมด้ามเบอร์ 11,13,อัน,10.7\n" +
                    "2,1491,ด้ามมีดผ่าตัดเบอร์ 3,10,อัน,256.8\n" +
                    "3,1502,สายยางรัดห้ามเลือด,15,เส้น,35.0\n";
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), headers], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "เทมเพลตนำเข้าพัสดุ.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
