/* 
  ==============================================================
    🧠 ระบบนำเข้าข้อมูล (Import System) 
  ==============================================================
*/

const MAIL_SERVER_URL = 'http://localhost:3001';

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
