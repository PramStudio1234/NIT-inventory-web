/* 
  ==============================================================
    ส่วนที่ 4 & 5: กระบวนการทำแอคชั่น (USER & ADMIN ACTIONS) (ปรับปรุงสำหรับ Firebase)
  ==============================================================
*/

// ================= USER ACTIONS ================= //

// ฟังก์ชันเพิ่มสินค้าลงในตะกร้า (Local Cart) ก่อนส่งใบเบิก
function addToCart() {
    if (!checkFirebaseSetup()) return;

    const idx = document.getElementById('user-product').value;
    if(idx === "") {
        alert('โปรดเลือกรายการพัสดุที่ต้องการเบิกก่อนครับ');
        return;
    }

    const p = products[idx];
    const qty = parseInt(document.getElementById('user-qty').value) || 0;
    const unitType = document.getElementById('user-unit-type').value;

    if(qty <= 0) {
        alert('โปรดระบุจำนวนที่ต้องการเบิก');
        return;
    }

    // คำนวณจำนวนในหน่วยย่อย (Small Unit) เพื่อใช้ตัดสต็อกจริง
    const actualQty = unitType === 'large' ? qty * (p.ratio || 1) : qty;

    // ตรวจสอบสต็อกคร่าวๆ (ป้องกันการขอเบิกเกินที่มีจริง)
    if(actualQty > p.stock) {
        alert(`ขออภัย! สต็อกมีไม่เพียงพอ (คงเหลือ ${p.stock} ${p.unitSmall})`);
        return;
    }

    // สร้างก้อนข้อมูลเตรียมลงตะกร้า (พร้อมระบบป้องกันค่า undefined)
    const cartItem = {
        productId: p.id || 'N/A',
        productDbId: p.dbId || '',
        productName: p.name || 'Unknown',
        qty: qty,
        unitType: unitType || 'small',
        unitName: (unitType === 'large' ? p.unitLarge : p.unitSmall) || (p.unitSmall || 'หน่วย'),
        qtySmall: actualQty,
        type: p.type || 'consumable' // default เป็นวัสดุสิ้นเปลือง
    };

    // ถ้าเป็นครุภัณฑ์ ให้เก็บข้อมูลเบิกคืนด้วย (ระวังค่าว่างจาก Input)
    if (p.type === 'asset') {
        cartItem.assetNo = (document.getElementById('user-asset-no') ? document.getElementById('user-asset-no').value : '') || '';
        cartItem.borrowDate = (document.getElementById('user-borrow-date') ? document.getElementById('user-borrow-date').value : '') || '';
        cartItem.returnDate = (document.getElementById('user-return-date') ? document.getElementById('user-return-date').value : '') || '';
        cartItem.note = (document.getElementById('user-note') ? document.getElementById('user-note').value : '') || '';
    }

    cart.push(cartItem);
    
    // รีเซ็ตฟอร์มฝั่งซ้าย (ยกเว้นพัสดุ เพราะอาจจะอยากเลือกตัวเดิมแบบอื่น)
    document.getElementById('user-qty').value = 1;
    
    renderCart(); // สั่งวาดตารางตะกร้าใหม่
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

// ส่งใบเบิก (Submit Slip) ขึ้น Firebase
function submitSlip() {
    if (cart.length === 0) return;
    if (!confirm('ยืนยันการส่งใบเบิกนี้เพื่อขออนุมัติ?')) return;

    const slipNo = `REQ-${Date.now().toString().slice(-6)}`;
    const slipData = {
        slipNo: slipNo,
        timestamp: new Date().toISOString(),
        requester: (currentUser && currentUser !== 'undefined') ? currentUser : "Unknown User",
        requesterEmail: currentUserEmail || "",
        items: cart.map(item => {
            // กรองทำความสะอาดข้อมูลใน Array ตะกร้าอีกชั้นก่อนส่งขึ้น Cloud
            const cleanItem = {...item};
            Object.keys(cleanItem).forEach(key => {
                if (cleanItem[key] === undefined) cleanItem[key] = "";
            });
            return cleanItem;
        }),
        status: 'pending' // สถานะตั้งต้นคือ รออนุมัติ
    };

    db.collection('slips').add(slipData).then(() => {
        alert(`ส่งใบเบิกเลขที่ ${slipNo} สำเร็จ! กรุณารอการอนุมัติจาก Admin`);
        
        // ส่งการแจ้งเตือนอีเมลไปยัง Admin & Super Admin ผ่าน API
        fetch(`${MAIL_SERVER_URL}/api/slips/notify-new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slipData)
        }).then(res => res.json())
          .then(data => {
              console.log('📬 ส่งแจ้งเตือนอีเมลเรียบร้อย:', data);
          }).catch(err => {
              console.error('❌ ไม่สามารถส่งแจ้งเตือนทางอีเมลได้:', err);
          });

        cart = []; // ล้างตะกร้า
        renderCart();
        switchTab('logs');
    }).catch(err => {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการส่งใบเบิก');
    });
}

// เอาไว้ให้บรรดา Admin กดรับคืนทรัพยกร
function returnAsset(logDbId) {
    if(!confirm('ยืนยันว่าได้รับของคืนแล้ว? สต็อกจะถูกบวกกลับเข้าไป')) return;
    if (!checkFirebaseSetup()) return;
    
    // หาใบประวัติจาก Array เครื่อง
    const logEntry = logs.find(l => l.dbId === logDbId);
    if(logEntry) {
        // อัปเดตสถานะใน Collection: logs
        db.collection('logs').doc(logDbId).update({
            status: 'returned'
        }).then(() => {
            // หาสินค้าต้นทาง แล้วคืนสต็อกให้
            const p = products.find(prod => prod.id === logEntry.productId);
            if(p && p.dbId) {
                return db.collection('products').doc(p.dbId).update({
                    stock: firebase.firestore.FieldValue.increment(logEntry.qty)
                });
            }
        }).then(() => {
            alert('ทำการรับคืนเรียบร้อยแล้ว กราฟและสต็อกอัปเดตออโต้!');
        }).catch(err => {
            console.error("Return Failed: ", err);
        });
    }
}

// ================= ADMIN ACTIONS ================= //

function deleteLog(logDbId) {
    if (currentRole !== 'superadmin') {
        alert('คุณไม่มีสิทธิ์ลบประวัติ เฉพาะ Super Admin เท่านั้น');
        return;
    }
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบประวัตินี้? ข้อมูลนี้จะถูกลบออกจากรายงานด้วย')) {
        if (!checkFirebaseSetup()) return;
        db.collection('logs').doc(logDbId).delete().then(() => {
            alert('ลบประวัติรายการสำเร็จ');
        }).catch(err => {
            alert('เกิดข้อผิดพลาดในการลบ: ' + err);
        });
    }
}

function deleteAllLogs() {
    if (currentRole !== 'superadmin') {
        alert('คุณไม่มีสิทธิ์ลบประวัติ เฉพาะ Super Admin เท่านั้น');
        return;
    }
    if (confirm('คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการ "ลบประวัติทั้งหมด"?\nข้อมูลรายงานสรุปจะถูกล้างทั้งหมดด้วยและไม่สามารถกู้คืนได้!')) {
        if (!checkFirebaseSetup()) return;
        
        db.collection('logs').get().then(snapshot => {
            if (snapshot.size === 0) {
                alert('ไม่มีประวัติให้ลบ');
                return;
            }
            
            const docs = snapshot.docs;
            const batches = [];
            for (let i = 0; i < docs.length; i += 500) {
                const batch = db.batch();
                docs.slice(i, i + 500).forEach(doc => {
                    batch.delete(doc.ref);
                });
                batches.push(batch.commit());
            }
            return Promise.all(batches);
        }).then(() => {
            alert('ลบประวัติรายการทั้งหมดสำเร็จ');
        }).catch(err => {
            alert('เกิดข้อผิดพลาดในการลบ: ' + err);
        });
    }
}

function updateUnitPreview() {
    const largeInput = document.getElementById('add-unit-large');
    const smallInput = document.getElementById('add-unit-small');
    const ratioInput = document.getElementById('add-unit-ratio');
    const previewText = document.getElementById('unit-preview-text');

    if (!largeInput || !smallInput || !ratioInput || !previewText) return;

    const large = largeInput.value.trim() || 'หน่วยใหญ่';
    const small = smallInput.value.trim() || 'หน่วยย่อย';
    const ratio = ratioInput.value.trim() || '1';

    previewText.innerHTML = `💡 ตัวอย่างความหมาย: สต็อกจะถูกบันทึกและคำนวณว่า <strong>1 ${large}</strong> บรรจุภายใน <strong>${ratio} ${small}</strong>`;
}

function openAddModal() {
    // ตรวจสอบสิทธิ์: เฉพาะ superadmin เท่านั้นที่เพิ่มรายการได้
    if (currentRole !== 'superadmin') {
        alert('คุณไม่มีสิทธิ์เพิ่มรายการ เฉพาะ Super Admin เท่านั้น');
        return;
    }
    document.getElementById('modal-add').classList.remove('hide');
    updateUnitPreview();
}
function closeAddModal() {
    document.getElementById('modal-add').classList.add('hide');
    document.getElementById('form-add-item').reset();
    updateUnitPreview();
}

// --- 📝 ลอจิกการแก้ไขพัสดุ (Edit Product) ---

function openEditModal(dbId) {
    const p = products.find(prod => prod.dbId === dbId);
    if (!p) return;

    document.getElementById('edit-dbid').value = dbId;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-cat').value = p.cat || 'อื่นๆ';
    document.getElementById('edit-stock').value = p.stock;
    document.getElementById('edit-unit-small').value = p.unitSmall;
    document.getElementById('edit-price').value = p.price || 0;

    document.getElementById('modal-edit').classList.remove('hide');
}

function closeEditModal() {
    document.getElementById('modal-edit').classList.add('hide');
}

async function handleUpdateProduct(e) {
    e.preventDefault();
    const dbId = document.getElementById('edit-dbid').value;
    
    const p = products.find(prod => prod.dbId === dbId);
    const oldStock = p ? p.stock : 0;
    const newStock = Number(document.getElementById('edit-stock').value);
    const diff = newStock - oldStock;
    const price = Number(document.getElementById('edit-price').value) || 0;

    const updatedData = {
        name: document.getElementById('edit-name').value,
        cat: document.getElementById('edit-cat').value,
        stock: newStock,
        price: price,
        unitSmall: document.getElementById('edit-unit-small').value,
        unitLarge: document.getElementById('edit-unit-small').value
    };

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/products/${dbId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const data = await res.json();
        if (data.success) {
            // บันทึกประวัติปรับปรุงสต็อกด้วยมือ
            if (diff !== 0 && p) {
                const logData = {
                    timestamp: new Date().toISOString(),
                    user: currentUser || 'Admin',
                    productId: p.id,
                    productName: p.name,
                    qty: Math.abs(diff),
                    unitName: p.unitSmall,
                    type: diff > 0 ? 'receive' : 'withdraw',
                    slipNo: diff > 0 ? 'REC-ADJUST' : 'REQ-ADJUST',
                    status: 'approved'
                };
                db.collection('logs').add(logData).catch(console.error);
            }
            closeEditModal();
            alert('✅ อัปเดตข้อมูลพัสดุสำเร็จ!');
        } else {
            alert('❌ แก้ไขไม่สำเร็จ: ' + data.error);
        }
    } catch (err) {
        alert('❌ ไม่สามารถเชื่อมต่อ Server ได้: ' + err.message);
    }
}

// บันทึกรายการตอนสร้างกล่องพัสดุแอดมิน (เปลี่ยนเป็นเรียก API)
async function handleAddItem(e) {
    e.preventDefault(); 
    if (!checkFirebaseSetup()) return;

    if (currentRole !== 'superadmin') {
        alert('คุณไม่มีสิทธิ์เพิ่มรายการ เฉพาะ Super Admin เท่านั้น');
        return;
    }

    const type = document.querySelector('input[name="add-type"]:checked').value;
    const price = Number(document.getElementById('add-price').value) || 0;
    const newItem = {
        id: document.getElementById('add-id').value,
        name: document.getElementById('add-name').value,
        cat: document.getElementById('add-cat').value,
        type: type, 
        unitLarge: document.getElementById('add-unit-large').value,
        unitSmall: document.getElementById('add-unit-small').value,
        ratio: parseInt(document.getElementById('add-unit-ratio').value) || 1,
        stock: parseInt(document.getElementById('add-stock').value), 
        min: parseInt(document.getElementById('add-min').value),   
        price: price
    };
    
    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem)
        });
        const data = await res.json();
        if (data.success) {
            // บันทึกประวัติการรับยอดตั้งต้น
            if (newItem.stock > 0) {
                const logData = {
                    timestamp: new Date().toISOString(),
                    user: currentUser || 'Admin',
                    productId: newItem.id,
                    productName: newItem.name,
                    qty: newItem.stock,
                    unitName: newItem.unitSmall,
                    type: 'receive',
                    slipNo: 'REC-INIT',
                    status: 'approved'
                };
                db.collection('logs').add(logData).catch(console.error);
            }
            closeAddModal(); 
            alert('เพิ่มรายการใหม่สำเร็จ (จัดการโดย Server)');
        } else {
            alert('เพิ่มข้อมูลล้มเหลว: ' + data.error);
        }
    } catch (err) {
        alert('ไม่สามารถเชื่อมต่อ Server ได้: ' + err.message);
    }
}

// ⚖️ ฟังก์ชันอนุมัติใบเบิก (ADMIN ONLY) - เปลี่ยนเป็นเรียก API รวมศูนย์
async function approveSlip(slipDbId) {
    if (!confirm('ยืนยันการอนุมัติใบเบิกนี้? ระบบจะตัดสต็อกสินค้าทันที')) return;
    
    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/slips/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slipId: slipDbId,
                adminUser: currentUser
            })
        });

        const data = await res.json();

        if (data.success) {
            alert('✅ อนุมัติและหักสต็อกเรียบร้อยแล้ว (จัดการโดย Server)');
        } else {
            alert('❌ อนุมัติไม่สำเร็จ: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Server: ' + err.message);
    }
}

async function rejectSlip(slipDbId) {
    const reason = prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติ:');
    if (reason === null) return;

    try {
        const res = await fetch(`${MAIL_SERVER_URL}/api/slips/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slipId: slipDbId,
                adminUser: currentUser,
                reason: reason
            })
        });

        const data = await res.json();
        if (data.success) {
            alert('ปฏิเสธการเบิกเรียบร้อยแล้ว (แจ้งเตือนผู้เบิกผ่านอีเมลสำเร็จ)');
        } else {
            alert('❌ ปฏิเสธไม่สำเร็จ: ' + data.error);
        }
    } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อ Server: ' + err.message);
    }
}

async function deleteProductById(dbId) {
    if (currentRole !== 'superadmin') {
        alert('คุณไม่มีสิทธิ์ลบรายการ เฉพาะ Super Admin เท่านั้น');
        return;
    }
    if(confirm('ต้องการลบพัสดุนี้ออกจากสต็อกใช่หรือไม่?')) {
        try {
            const res = await fetch(`${MAIL_SERVER_URL}/api/products/${dbId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert('ลบรายการพัสดุสำเร็จ');
            } else {
                alert('ลบไม่สำเร็จ: ' + data.error);
            }
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    }
}

async function clearAllProducts() {
    if (currentRole !== 'superadmin') {
        alert('คุณไม่มีสิทธิ์ลบรายการ เฉพาะ Super Admin เท่านั้น');
        return;
    }
    
    if (confirm('⚠️ คำเตือน: คุณกำลังจะ "ลบพัสดุทั้งหมด" ออกจากระบบ!\nการกระทำนี้ไม่สามารถย้อนกลับได้ คุณต้องการดำเนินการต่อใช่หรือไม่?')) {
        try {
            // ใส่ Loading เบื้องต้น
            const btn = event.target;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังลบ...';
            btn.disabled = true;

            const res = await fetch(`${MAIL_SERVER_URL}/api/products/clear-all`, {
                method: 'DELETE'
            });
            const data = await res.json();
            
            if (data.success) {
                alert('✅ ล้างรายการพัสดุทั้งหมดในคลังเรียบร้อยแล้ว');
                // ระบบจะอัปเดต UI อัตโนมัติผ่าน Real-time listener ของ Firebase
            } else {
                alert('❌ เกิดข้อผิดพลาด: ' + data.error);
            }
        } catch (err) {
            alert('❌ ไม่สามารถเชื่อมต่อ Server ได้: ' + err.message);
        } finally {
            // คืนค่าปุ่ม
            const btn = document.querySelector('[onclick="clearAllProducts()"]');
            if(btn) {
                btn.innerHTML = '<i class="fa-solid fa-trash-arrow-up mr-1"></i> ล้างทั้งหมด';
                btn.disabled = false;
            }
        }
    }
}

// ================= SYSTEM INIT ================= //

// นำมาประกอบร่างกันเมื่อหน้าเว็บโหลดเสร็จทั้งหมด
window.onload = function() {
    // ⚠️ เราจะย้ายคำสั่งเริ่มต้น (เปลี่ยน Role และกาง Data) 
    // ไปไว้ใน assets/js/auth.js เพื่อให้ทำหลังจาก Login สำเร็จเท่านั้น
    // เพื่อป้องกันระบบแอบดึงข้อมูลข้ามสิทธิ์
};
