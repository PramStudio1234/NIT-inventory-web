/* 
  ==============================================================
    ส่วนที่ 3: ระบบเทรนเดอร์วาดโค้ดและการคำนวณ (RENDER LOGIC)
  ==============================================================
*/

// ฟังก์ชันรวมแม่ทัพคอยเรียกอัปเดตทุก Element พร้อมๆ กันรอบเดียว
function updateUI() {
    renderDashboard();     // คอยเติมเลขในแดชบอร์ด
    renderInventory();     // รีโหลดข้อมูลตารางคลังสินค้า
    renderUserForm();      // เติมพัสดุในช่องเบิก ให้ผู้ใช้เบิกอิงจากสต็อกปัจจุบัน
    renderLogs();          // โหลดตารางประวัติ Log ใหม่
    renderUsageChart();    // วาดกราฟและจัดกลุ่มปี/เดือน
    renderReport();        // คำนวณตารางรายงานสรุป
    renderCart();          // วาดตะกร้าพัสดุ
    renderApprovals();     // วาดรายการรออนุมัติ (Admin)
}

// อัปเดตสถิติ Dashboard 3 ตัวใหญ่
function renderDashboard() {
    if(currentRole === 'user') return; 
    
    document.getElementById('stat-total-items').innerText = products.length;
    document.getElementById('stat-lowstock').innerText = products.filter(p => p.stock <= p.min).length;
    
    // นับจำนวนใบเบิกที่ยังไม่ได้อนุมัติ (Pending Slips)
    const pendingSlips = slips.filter(s => s.status === 'pending');
    document.getElementById('stat-pending-return').innerText = pendingSlips.length;
    
    // อัปเดต Badge แจ้งเตือนเมนูอนุมัติ
    const badge = document.getElementById('badge-approval-count');
    if (badge) {
        if (pendingSlips.length > 0) {
            badge.innerText = pendingSlips.length;
            badge.classList.remove('hide');
        } else {
            badge.classList.add('hide');
        }
    }
}

// ==========================================
// ลอจิกการคำนวณและสร้างกราฟ (Chart.js)
// ==========================================
function renderUsageChart() {
    // 1. จัดการตัวเลือก "ปี" (Year Dropdown) ให้ดึงปีที่มีประวัติอยู่มาใส่
    const yearSelect = document.getElementById('chart-year');
    const monthSelect = document.getElementById('chart-month');
    
    // ถ้าไม่มี HTML component นี้ ให้ข้ามการทำกราฟ (เช่น อยู่คนละหน้าเพจที่แยกไฟล์)
    if (!yearSelect) return; 

    // ดึงปีออกมาจาก Log (แบบไม่ซ้ำกัน Set)
    const years = [...new Set(logs.map(l => new Date(l.timestamp).getFullYear()))].sort((a,b) => b-a);
    const currentYear = new Date().getFullYear();
    
    // ถ้าแบล็กงค์ว่างๆ เลย ให้ยัดปีปัจจุบันอย่างน้อย 1 อัน
    if (years.length === 0) years.push(currentYear);
    
    // เติม <option> เข้าไปใน Dropdown ถ้ายังไม่มีเนื้อใน
    if (yearSelect.options.length === 0) {
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.innerText = `ปี ${y + 543}`; // แปลงเป็น พ.ศ.
            yearSelect.appendChild(opt);
        });
    }

    // 2. ดึงค่า Filter ที่ผู้ใช้เลือก
    const selectedYear = parseInt(yearSelect.value) || currentYear;
    const selectedMonth = monthSelect.value; // เป็น 'all' หรือ ตัวเลข 0-11

    // 3. กรอง (Filter) Log เฉพาะปีและเดือนนั้น
    const filteredLogs = logs.filter(l => {
        const d = new Date(l.timestamp);
        const isYearMatch = d.getFullYear() === selectedYear;
        const isMonthMatch = (selectedMonth === 'all') || (d.getMonth().toString() === selectedMonth);
        // นับเฉพาะ Log ที่เป็นการเอาของไปใช้ (withdraw เบิกขาด, borrow ยืม) เท่านั้น
        const isTakeAction = (l.type === 'withdraw' || l.type === 'borrow');
        return isYearMatch && isMonthMatch && isTakeAction;
    });

    // 4. จัดกลุ่มรวมร่างยอด (GroupBy Product) แยกตามสี
    const usageData = {};
    filteredLogs.forEach(l => {
        if (!usageData[l.productName]) {
            usageData[l.productName] = { qty: 0, type: l.type };
        }
        usageData[l.productName].qty += l.qty;
    });

    // 5. แปลง Object เป็น Array เพื่อเตรียมหั่นเอาแค่ Top 10 มาแสดงกราฟ ป้องกันแท่งยืดเป็นร้อย
    let sortedUsage = Object.keys(usageData).map(name => ({
        name: name,
        qty: usageData[name].qty,
        type: usageData[name].type
    })).sort((a,b) => b.qty - a.qty).slice(0, 10); // เรียงจากมากไปน้อย หั่นเอา 10 อันดับ

    // 6. เตรียมข้อมูลเข้ารูปแบบ Chart.js
    const labels = sortedUsage.map(u => u.name);
    // ทำสี: วัสดุ(ฟ้า), ครุภัณฑ์(ม่วง)
    const bgColors = sortedUsage.map(u => u.type === 'withdraw' ? 'rgba(56, 189, 248, 0.8)' : 'rgba(167, 139, 250, 0.8)');
    const borderColors = sortedUsage.map(u => u.type === 'withdraw' ? 'rgb(14, 165, 233)' : 'rgb(139, 92, 246)');
    const dataPoints = sortedUsage.map(u => u.qty);

    // 7. สั่งวาด/อัปเดต กราฟ
    const ctx = document.getElementById('usageChart');
    if(!ctx) return;
    
    // ถ้าเคยมีกราฟเส้นเดิมค้างอยู่ ต้องทำลายทิ้งก่อน ไม่งั้นมันซ้อนกันจนบัค
    if (usageChartInstance) {
        usageChartInstance.destroy();
    }

    usageChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'จำนวนชิ้นที่ใช้งาน (ยืม/เบิก)',
                data: dataPoints,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        // แทรกคำอธิบายเข้าไปในกล่อง Tooltip เวลาเอาเม้าส์ชี้
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const t = sortedUsage[index].type;
                            return t === 'withdraw' ? '(วัสดุสิ้นเปลือง)' : '(ครุภัณฑ์)';
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

// ฟังก์ชันตัวช่วย: ประเมินว่าสต็อกอยู่ในสีระดับไหน (ปกติ ระวัง เดลตพัง) ส่งกลับเป็น Tag HTML พร้อมสี
function getStatusBadge(stock, min) {
    if (stock <= 0) return '<span class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold">หมด!</span>';
    if (stock <= min) return '<span class="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-bold">ต่ำกว่ากำหนด</span>';
    return '<span class="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold">ปกติ</span>';
}

// ตัวแปรเก็บสถานะการแบ่งหน้า
let inventoryPage = 1;
const ITEMS_PER_PAGE = 20;
let currentSearchTerm = '';

// ฟังก์ชันวาดข้อมูลสต็อกในหน้าตารางของ Admin (ปรับปรุง: รองรับ Pagination)
function renderInventory() {
    const tbody = document.getElementById('inventory-table-body');
    const paginationContainer = document.getElementById('inventory-pagination');
    if (!tbody) return;
    
    // กรองข้อมูลตามคำค้นหา
    const filtered = products.filter(p => 
        !currentSearchTerm || 
        (p.name && p.name.toLowerCase().includes(currentSearchTerm.toLowerCase())) || 
        (p.id && p.id.toLowerCase().includes(currentSearchTerm.toLowerCase()))
    );

    // คำนวณขอบเขตการแบ่งหน้า
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
    if (inventoryPage > totalPages) inventoryPage = totalPages;
    if (inventoryPage < 1) inventoryPage = 1;

    const start = (inventoryPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = filtered.slice(start, end);

    tbody.innerHTML = '';
    
    if (pageItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-20 text-center text-slate-400">ไม่พบรายการที่ค้นหา</td></tr>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    pageItems.forEach((p) => {
        const typeIcon = p.type === 'asset' ? '<i class="fa-solid fa-cube text-indigo-500"></i> ครุภัณฑ์' : '<i class="fa-solid fa-box-open text-teal-500"></i> วัสดุสิ้นเปลือง';
        
        const displayStock = (p.ratio && p.ratio > 1) 
            ? `${Math.floor(p.stock / p.ratio)} ${p.unitLarge} (${p.stock % p.ratio} ${p.unitSmall})`
            : `${p.stock} ${p.unitSmall}`;

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-4 text-xs font-bold">${typeIcon}</td>
                <td class="px-6 py-4">
                    <div class="font-bold text-slate-800">${p.name}</div>
                    <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tight">${p.id}</div>
                </td>
                <td class="px-6 py-4"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-bold">${p.cat}</span></td>
                <td class="px-6 py-4 text-right">
                    <div class="font-black text-slate-700 text-sm">${displayStock}</div>
                    ${getStatusBadge(p.stock, p.min)}
                </td>
                <td class="px-6 py-4 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="openStockCard('${p.dbId}')" title="ดู Stock Card" class="p-2 text-indigo-400 hover:text-indigo-600 transition-colors">
                            <i class="fa-solid fa-rectangle-list"></i>
                        </button>
                        ${['admin', 'superadmin'].includes(currentRole) ? `
                        <button onclick="openEditModal('${p.dbId}')" title="แก้ไขข้อมูล" class="p-2 text-blue-400 hover:text-blue-600 transition-colors">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>` : ''}
                        ${currentRole === 'superadmin' ? `
                        <button onclick="deleteProductById('${p.dbId}')" title="ลบรายการ" class="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    });

    // วาดปุ่มเปลี่ยนหน้า
    if (paginationContainer) {
        paginationContainer.innerHTML = `
            <div class="flex items-center justify-between px-6 py-3 bg-slate-50/50 border-t border-slate-100">
                <div class="text-[11px] font-bold text-slate-500">
                    แสดง ${start + 1} - ${Math.min(end, filtered.length)} จากทั้งหมด ${filtered.length} รายการ
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="changeInventoryPage(${inventoryPage - 1})" ${inventoryPage === 1 ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <i class="fa-solid fa-chevron-left text-[10px]"></i>
                    </button>
                    <span class="text-[11px] font-black text-slate-700 px-2">${inventoryPage} / ${totalPages}</span>
                    <button onclick="changeInventoryPage(${inventoryPage + 1})" ${inventoryPage === totalPages ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <i class="fa-solid fa-chevron-right text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;
    }
}

function changeInventoryPage(page) {
    inventoryPage = page;
    renderInventory();
}

// ระบบหน่วงเวลาค้นหา (Debounce Search)
let searchTimeout = null;
function searchInventory(searchTerm) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearchTerm = searchTerm;
        inventoryPage = 1;
        renderInventory();
    }, 300);
}

// 🛒 วาดตารางตะกร้าพัสดุ (Draft Slip)
function renderCart() {
    const tableBody = document.getElementById('cart-table-body');
    const countBadge = document.getElementById('cart-item-count');
    const submitBtn = document.getElementById('btn-submit-slip');
    
    if (!tableBody) return;

    if (cart.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="py-20 text-center text-slate-400"><i class="fa-solid fa-basket-shopping text-4xl mb-3 block opacity-20"></i>ยังไม่มีพัสดุในใบเบิก</td></tr>';
        countBadge.innerText = '0 รายการ';
        submitBtn.disabled = true;
        return;
    }

    countBadge.innerText = `${cart.length} รายการ`;
    submitBtn.disabled = false;

    tableBody.innerHTML = cart.map((item, index) => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-xs">${item.productName}</div>
                <div class="text-[9px] text-slate-400 font-bold uppercase">${item.productId} | ${item.type === 'asset' ? 'ยืมคืน' : 'เบิกขาด'}</div>
            </td>
            <td class="px-6 py-4 text-center font-black text-blue-600">${item.qty}</td>
            <td class="px-6 py-4 text-center text-xs font-bold text-slate-500">${item.unitName}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="removeFromCart(${index})" class="text-red-400 hover:text-red-600 transition-transform active:scale-90">
                    <i class="fa-solid fa-circle-minus text-lg"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// 📬 วาดรายการรออนุมัติ (Approval Inbox)
function renderApprovals() {
    const tbody = document.getElementById('approval-table-body');
    if (!tbody) return;

    const pendingSlips = slips.filter(s => s.status === 'pending');

    if (pendingSlips.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-20 text-center text-slate-400 italic">ไม่มีรายการที่รอการอนุมัติในขณะนี้</td></tr>';
        return;
    }

    tbody.innerHTML = pendingSlips.map(s => {
        const date = new Date(s.timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        const itemsList = s.items.map(i => `<div class="text-[11px]"><i class="fa-solid fa-check text-blue-400 mr-1"></i>${i.productName || 'ไม่ระบุชื่อ'} (${i.qty || 0} ${i.unitName || 'หน่วย'})</div>`).join('');

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="text-[10px] font-bold text-slate-400 mb-1">${date}</div>
                    <div class="font-black text-indigo-600 text-xs">${s.slipNo}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-[10px]">
                            ${s.requester.charAt(0)}
                        </div>
                        <div class="font-bold text-slate-700 text-xs">${s.requester}</div>
                    </div>
                </td>
                <td class="px-6 py-4">${itemsList}</td>
                <td class="px-6 py-4 text-center">
                    <span class="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">รอตรวจ</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="approveSlip('${s.dbId}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-sm">อนุมัติ</button>
                        <button onclick="rejectSlip('${s.dbId}')" class="px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-[11px] font-bold">ไม่ผ่าน</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ตัวแปรเก็บสถานะ Filter ฝั่ง User (ระบบค้นหาและกรองหมวดหมู่)
let borrowTypeFilter = 'all';     // 'all' | 'consumable' | 'asset'
let borrowCategoryFilter = 'all'; // 'all' | ชื่อหมวดหมู่จริง

// ฟังก์ชันสร้าง Dropdown ดึงของมาให้ฝั่ง User กดยืม (ปรับปรุง: รองรับ Filter)
function renderUserForm() {
    const select = document.getElementById('user-product');
    if (!select) return;

    // สร้างปุ่มหมวดหมู่อัตโนมัติจากข้อมูลสินค้าจริง
    renderBorrowCategoryTabs();
    
    // กรองสินค้าตาม Filter ที่เลือก แล้วเติมลง Dropdown
    filterBorrowProducts();

    // ตั้งวันที่ยืมเริ่มต้นเป็นวันนี้
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); 
    if (document.getElementById('user-borrow-date')) {
        document.getElementById('user-borrow-date').value = now.toISOString().slice(0, 16);
    }
}

// ★ ฟังก์ชันหลักสำหรับกรองสินค้าตาม Search + Type + Category แล้วเติม Dropdown
function filterBorrowProducts() {
    const select = document.getElementById('user-product');
    if (!select) return;

    // ดึงคำค้นหาจากช่อง Input
    const searchInput = document.getElementById('borrow-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    // กรองสินค้าตามเงื่อนไขทั้ง 3 ตัว
    const filtered = products.filter((p, idx) => {
        // 1. กรองตามประเภท (เบิกขาด/ยืมคืน)
        if (borrowTypeFilter !== 'all' && p.type !== borrowTypeFilter) return false;
        // 2. กรองตามหมวดหมู่
        if (borrowCategoryFilter !== 'all' && p.cat !== borrowCategoryFilter) return false;
        // 3. กรองตามคำค้นหา (ค้นทั้งชื่อและรหัส)
        if (searchTerm) {
            const nameMatch = (p.name || '').toLowerCase().includes(searchTerm);
            const idMatch = (p.id || '').toLowerCase().includes(searchTerm);
            if (!nameMatch && !idMatch) return false;
        }
        return true;
    });

    // เติม Options ลงใน Dropdown
    select.innerHTML = '<option value="">-- เลือกรายการ --</option>';
    filtered.forEach(p => {
        // หา Index จริงใน Array products (สำคัญ: ต้องใช้ Index ของ products ไม่ใช่ filtered)
        const realIndex = products.indexOf(p);
        const typeLabel = p.type === 'asset' ? 'ยืม' : 'เบิก';
        const typeColor = p.type === 'asset' ? '🟣' : '🟢';
        const stockInfo = p.stock <= p.min ? '⚠️' : '';
        select.innerHTML += `<option value="${realIndex}">${typeColor} ${p.name} [${typeLabel}] ${stockInfo}</option>`;
    });

    // อัปเดตจำนวนผลลัพธ์ที่พบ
    const resultCount = document.getElementById('borrow-result-count');
    if (resultCount) {
        resultCount.innerHTML = `<i class="fa-solid fa-list-check text-blue-400"></i> <span>พบ <strong class="text-blue-600">${filtered.length}</strong> รายการ จากทั้งหมด ${products.length}</span>`;
    }
}

// ★ สร้างปุ่มหมวดหมู่อัตโนมัติจากข้อมูลสินค้า
function renderBorrowCategoryTabs() {
    const container = document.getElementById('borrow-category-tabs');
    if (!container) return;

    // ดึงหมวดหมู่ทั้งหมดแบบไม่ซ้ำกัน (Set) พร้อมนับจำนวน
    const categoryCounts = {};
    products.forEach(p => {
        const cat = p.cat || 'ไม่ระบุ';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const categories = Object.keys(categoryCounts).sort();

    // สร้าง HTML ปุ่มทั้งหมด
    let html = '';
    
    // ปุ่ม "ทั้งหมด" อยู่อันแรกเสมอ
    const allActive = borrowCategoryFilter === 'all';
    html += `<button type="button" onclick="setBorrowCategoryFilter('all')" class="borrow-cat-btn px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${allActive ? 'bg-blue-600 text-white border border-blue-500 shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'}">
        ทั้งหมด <span class="ml-1 opacity-70">(${products.length})</span>
    </button>`;

    // ปุ่มหมวดหมู่ย่อย
    categories.forEach(cat => {
        const isActive = borrowCategoryFilter === cat;
        html += `<button type="button" onclick="setBorrowCategoryFilter('${cat}')" class="borrow-cat-btn px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isActive ? 'bg-indigo-600 text-white border border-indigo-500 shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700'}">
            ${cat} <span class="ml-1 opacity-70">(${categoryCounts[cat]})</span>
        </button>`;
    });

    container.innerHTML = html;
}

// ★ เปลี่ยนตัวกรองประเภท (เบิกขาด/ยืมคืน) พร้อมอัปเดต UI ปุ่มที่กำลัง Active
function setBorrowTypeFilter(type) {
    borrowTypeFilter = type;

    // อัปเดตสไตล์ปุ่มทั้ง 3
    document.querySelectorAll('.borrow-type-btn').forEach(btn => {
        btn.className = 'borrow-type-btn flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-200 bg-white text-slate-600';
    });

    const activeBtn = document.getElementById('borrow-type-' + type);
    if (activeBtn) {
        if (type === 'all') {
            activeBtn.className = 'borrow-type-btn flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-blue-500 bg-blue-600 text-white shadow-sm';
        } else if (type === 'consumable') {
            activeBtn.className = 'borrow-type-btn flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-teal-500 bg-teal-600 text-white shadow-sm';
        } else if (type === 'asset') {
            activeBtn.className = 'borrow-type-btn flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-indigo-500 bg-indigo-600 text-white shadow-sm';
        }
    }

    // กรองสินค้าใหม่ตาม Filter ที่อัปเดต
    filterBorrowProducts();
}

// ★ เปลี่ยนตัวกรองหมวดหมู่ พร้อมอัปเดต UI ปุ่ม Tab 
function setBorrowCategoryFilter(cat) {
    borrowCategoryFilter = cat;
    // สร้างปุ่มใหม่ (เพื่ออัปเดตสถานะ Active)
    renderBorrowCategoryTabs();
    // กรองสินค้าใหม่
    filterBorrowProducts();
}


// ทุกครั้งที่ผู้ใช้เลือกสินค้าจาก Dropdown ในหน้าเบิก จะดักฟังเพื่อดูก่อนว่ามันคือเบิกขาด หรือ ยืม?
function onProductSelect() {
    const idx = document.getElementById('user-product').value;
    const assetFields = document.getElementById('asset-fields');
    const unitSelect = document.getElementById('user-unit-type');
    
    if(idx === "") {
        if (assetFields) assetFields.classList.add('hide');
        return;
    }
    
    const p = products[idx];
    
    // อัปเดตตัวเลือกหน่วยนับ (พร้อมระบบป้องกันค่า undefined)
    if (unitSelect) {
        unitSelect.innerHTML = `<option value="small">${p.unitSmall || 'หน่วยย่อย'}</option>`;
        if (p.ratio && p.ratio > 1) {
            unitSelect.innerHTML += `<option value="large">${p.unitLarge || 'หน่วยใหญ่'} (x${p.ratio})</option>`;
        }
    }

    if (p.type === 'asset') {
        if (assetFields) assetFields.classList.remove('hide');
    } else {
        if (assetFields) assetFields.classList.add('hide');
    }
}

// ฟังก์ชันเจ็นตารางประวัติ (ระบบ Log ที่โคตรสำคัญ)
function renderLogs() {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;
    tbody.innerHTML = ''; // ล้างก่อน
    
    // 1. ดึง Log จากฐานข้อมูลปกติ
    let combinedLogs = currentRole === 'user' 
        ? logs.filter(l => l.user === currentUser) 
        : [...logs];

    // 2. ดึงใบเบิกจาก slips ที่สถานะเป็น pending หรือ rejected
    // ถ้าเป็น user ดึงเฉพาะของตัวเอง ถ้าเป็น admin/superadmin ดึงทั้งหมด
    const targetSlips = currentRole === 'user'
        ? slips.filter(s => s.requester === currentUser && (s.status === 'pending' || s.status === 'rejected'))
        : slips.filter(s => s.status === 'pending' || s.status === 'rejected');

    // 3. แปลงข้อมูลใบเบิกเหล่านั้นให้อยู่ในรูปแบบ Log เพื่อนำมาแสดงในตารางรวมกัน
    targetSlips.forEach(s => {
        if (s.items && Array.isArray(s.items)) {
            s.items.forEach((item, index) => {
                combinedLogs.push({
                    dbId: `${s.dbId}_${index}`,
                    timestamp: s.timestamp,
                    user: s.requester,
                    productId: item.productId,
                    productName: item.productName,
                    qty: item.qty || item.qtySmall || 0,
                    type: item.type === 'asset' ? 'borrow' : 'withdraw',
                    slipNo: s.slipNo,
                    status: s.status, // 'pending' หรือ 'rejected'
                    rejectReason: s.rejectReason || ''
                });
            });
        }
    });
    
    // 4. จับเรียงตามเวลาทำรายการใหม่ล่าสุด (เรียงจากเวลาเยอะมาเวลาน้อย Date Sort)
    const sortedLogs = [...combinedLogs].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // ถ้าประวัติดล่งโจ๋ง ก็โชว์ข้อความว่าไม่มีจ้า
    if (sortedLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">ยังไม่มีประวัติรายการ...</td></tr>';
        return;
    }

    sortedLogs.forEach((l) => {
        const sDate = new Date(l.timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        const isAsset = l.type === 'borrow';
        const isVirtual = l.dbId && l.dbId.includes('_');
        
        let statusHTML = '';
        let actions = [];

        if (l.status === 'pending') {
            if (isVirtual) {
                // คำขอเบิกที่ยังไม่ได้รับการอนุมัติ (รออนุมัติ)
                statusHTML = `<span class="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded border border-amber-100">รออนุมัติ</span>`;
            } else {
                // ได้รับอนุมัติแล้ว และอยู่ระหว่างการยืม (อนุมัติแล้ว - ติดยืม)
                if (isAsset) {
                    statusHTML = `<span class="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded border border-indigo-100">อนุมัติแล้ว (ติดยืม)</span>`;
                    if (currentRole !== 'user') {
                        actions.push(`<button onclick="returnAsset('${l.dbId}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm">คืนของ</button>`);
                    }
                } else {
                    // ป้องกันความผิดพลาดของระบบทั่วไป
                    statusHTML = `<span class="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded border border-amber-100">รออนุมัติ</span>`;
                }
            }
        } else if (l.status === 'rejected') {
            // ปฏิเสธการอนุมัติ (ไม่ผ่านอนุมัติ)
            const reasonTip = l.rejectReason ? ` title="เหตุผล: ${l.rejectReason}"` : '';
            statusHTML = `<span class="px-2 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded border border-red-100 cursor-help"${reasonTip}>ไม่ผ่านอนุมัติ</span>`;
            if (l.rejectReason) {
                statusHTML += `<div class="text-[9px] text-red-400 mt-1 max-w-[150px] mx-auto truncate font-medium" title="${l.rejectReason}">เหตุผล: ${l.rejectReason}</div>`;
            }
        } else if (l.status === 'returned') {
            statusHTML = `<span class="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-100">คืนแล้ว</span>`;
        } else {
            // อนุมัติแล้วผ่าน
            statusHTML = `<span class="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-100">อนุมัติแล้วผ่าน</span>`;
        }

        if (currentRole === 'superadmin') {
            actions.push(`<button onclick="deleteLog('${l.dbId}')" title="ลบประวัติ" class="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><i class="fa-solid fa-trash-can text-sm"></i></button>`);
        }

        let actionHTML = actions.length > 0 ? `<div class="flex items-center justify-center gap-2">${actions.join('')}</div>` : '-';

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="text-[10px] font-bold text-slate-400 mb-1">${sDate}</div>
                    <div class="text-[10px] font-black text-slate-500">${l.slipNo || 'N/A'}</div>
                </td>
                <td class="px-6 py-4 font-bold text-slate-700 text-xs">${l.user}</td>
                <td class="px-6 py-4">
                    <div class="font-bold text-slate-800 text-xs">${l.productName}</div>
                    <div class="text-[9px] font-bold ${isAsset ? 'text-indigo-500' : 'text-blue-500'} uppercase">${isAsset ? 'ครุภัณฑ์' : 'วัสดุ'}</div>
                </td>
                <td class="px-6 py-4 text-center font-black text-slate-700 text-sm">${l.qty}</td>
                <td class="px-6 py-4 text-center">${statusHTML}</td>
                <td class="px-6 py-4 text-center">${actionHTML}</td>
            </tr>
        `;
    });
}
// ฟังก์ชันสำหรับจัดเตรียมตัวเลือกปีในตัวรายงานสรุป
function initReportYearDropdown() {
    const yearSelect = document.getElementById('report-year');
    if (!yearSelect) return;
    
    if (yearSelect.options.length === 0) {
        const years = [...new Set(logs.map(l => new Date(l.timestamp).getFullYear()))].sort((a,b) => b-a);
        const currentYear = new Date().getFullYear();
        if (years.length === 0) years.push(currentYear);
        
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.innerText = `ปี ${y + 543}`;
            yearSelect.appendChild(opt);
        });
        
        // เลือกปีปัจจุบันโดยอัตโนมัติ
        yearSelect.value = currentYear;
    }
}

// อัปเดตข้อความหัวเอกสารสำหรับพิมพ์
function updateReportLabels() {
    const deptInput = document.getElementById('report-department');
    const deptLabel = document.getElementById('print-dept-label');
    if (deptInput && deptLabel) {
        deptLabel.innerText = deptInput.value || 'สถาบันประสาทวิทยา (NIT)';
    }
    
    const monthSelect = document.getElementById('report-month');
    const yearSelect = document.getElementById('report-year');
    const periodLabel = document.getElementById('print-period-label');
    if (monthSelect && yearSelect && periodLabel) {
        const monthText = monthSelect.options[monthSelect.selectedIndex].text;
        const yearVal = parseInt(yearSelect.value);
        if (yearVal) {
            periodLabel.innerText = `${monthText} ${yearVal + 543}`;
        } else {
            periodLabel.innerText = `${monthText} -`;
        }
    }
}

// ฟังก์ชันหลักในการวาดรายงานสรุปตามแบบฟอร์มทางการ (Official Report)
function renderReport() {
    const tbody = document.getElementById('report-official-body');
    if (!tbody) return;

    // 1. จัดการตัวเลือกปี
    initReportYearDropdown();
    
    // 2. อัปเดตหัวเอกสาร
    updateReportLabels();

    const monthSelect = document.getElementById('report-month');
    const yearSelect = document.getElementById('report-year');
    if (!monthSelect || !yearSelect) return;

    const targetMonth = parseInt(monthSelect.value); // 0-11
    const targetYear = parseInt(yearSelect.value);   // ค.ศ.

    // 3. เริ่มลоจิกการคำนวณสำหรับสินค้าทุกตัว
    let totalValue = 0;
    const reportRows = [];
    
    // คัดลอก Logs ปัจจุบันมาวิเคราะห์
    const allLogs = [...logs];

    products.forEach((p, index) => {
        const prodLogs = allLogs.filter(l => l.productId === p.id);

        let B = 0; // รับเข้าเพิ่มในเดือนนั้น
        let C = 0; // ใช้ไปในเดือนนั้น
        let endingStock = p.stock; // สต็อกปลายเดือนที่จะคำนวณย้อนกลับ

        // วนลูปหักล้าง Logs เพื่อคำนวณหาสต็อกปลายเดือนที่เลือก
        prodLogs.forEach(l => {
            const logDate = new Date(l.timestamp);
            const logYear = logDate.getFullYear();
            const logMonth = logDate.getMonth();

            const isTarget = (logYear === targetYear && logMonth === targetMonth);
            const isAfter = (logYear > targetYear) || (logYear === targetYear && logMonth > targetMonth);

            // ถ้า Log อยู่ในเดือนที่เลือก (Target Month)
            if (isTarget) {
                // ยอดใช้ไป (C): เบิก (withdraw) หรือ ยืม (borrow)
                if (l.type === 'withdraw' || l.type === 'borrow') {
                    C += l.qty;
                }
                // ยอดรับเข้า (B): รับเข้า (receive) หรือ ยืมที่คืนแล้ว (returned)
                if (l.type === 'receive' || l.status === 'returned') {
                    B += l.qty;
                }
            }

            // ถ้า Log เกิดขึ้นทีหลังเดือนที่เลือก (After Target Month)
            if (isAfter) {
                // ถ้า Log เป็นประเภทเพิ่มสต็อก (รับเข้า หรือ คืนของ): ในอดีตต้องหักออก
                if (l.type === 'receive' || l.status === 'returned') {
                    endingStock -= l.qty;
                }
                // ถ้า Log เป็นประเภทลดสต็อก (เบิกจ่าย หรือ ยืม): ในอดีตต้องบวกกลับ
                if (l.type === 'withdraw' || l.type === 'borrow') {
                    endingStock += l.qty;
                }
            }
        });

        // ยอดคงเหลือสิ้นเดือนปัดไม่ต่ำกว่า 0
        endingStock = Math.max(0, endingStock);

        // ยอดเหลือจากเดือน (A) = คงเหลือสิ้นเดือน - B + C
        let A = endingStock - B + C;
        A = Math.max(0, A);

        const price = p.price || 0;
        const value = price * endingStock;
        totalValue += value;

        reportRows.push({
            no: index + 1,
            name: p.name,
            id: p.id,
            unit: p.unitSmall,
            price: price,
            A: A,
            B: B,
            C: C,
            balance: endingStock,
            value: value,
            note: p.type === 'asset' ? 'ครุภัณฑ์' : 'วัสดุสิ้นเปลือง'
        });
    });

    // 4. วาดตารางข้อมูลลงใน HTML
    tbody.innerHTML = '';
    if (reportRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="py-10 text-center text-slate-400">ไม่มีข้อมูลพัสดุในระบบ</td></tr>';
        document.getElementById('report-total-value').innerText = '0.00';
    } else {
        tbody.innerHTML = reportRows.map(r => `
            <tr class="hover:bg-slate-50 transition-colors divide-x divide-slate-200">
                <td class="px-1 py-2 text-center">${r.no}</td>
                <td class="px-2 py-2 text-left font-semibold text-slate-800">${r.name}</td>
                <td class="px-1 py-2 text-center text-slate-500 font-mono text-[10px]">${r.id}</td>
                <td class="px-1 py-2 text-center">${r.unit}</td>
                <td class="px-1 py-2 text-right">${r.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-1 py-2 text-center font-medium">${r.A}</td>
                <td class="px-1 py-2 text-center text-emerald-600 font-semibold">${r.B > 0 ? '+' + r.B : 0}</td>
                <td class="px-1 py-2 text-center text-amber-600 font-semibold">${r.C > 0 ? '-' + r.C : 0}</td>
                <td class="px-1 py-2 text-center font-bold text-slate-700">${r.balance}</td>
                <td class="px-2 py-2 text-right font-bold text-slate-800">${r.value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="px-2 py-2 text-center text-slate-400 text-[10px]">${r.note}</td>
            </tr>
        `).join('');

        document.getElementById('report-total-value').innerText = totalValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // 5. คำนวณสรุปภาพรวมด้านล่าง
    // รายการที่ถูกใช้มากที่สุด และน้อยที่สุด
    let mostUsedItem = '-';
    let leastUsedItem = '-';
    let maxUsedQty = 0;
    let minUsedQty = Infinity;

    // รายการที่เบิกต่ำกว่าเกณฑ์สิ้นเดือน (ต้องการซื้อเพิ่มเร่งด่วน)
    const urgentItems = [];

    products.forEach(p => {
        // หาผลรวมใช้ไป (C) ของรายการนี้ในเดือน
        const prodLogs = allLogs.filter(l => l.productId === p.id);
        let usedQty = 0;
        let endingStock = p.stock;

        prodLogs.forEach(l => {
            const logDate = new Date(l.timestamp);
            const isTarget = logDate.getFullYear() === targetYear && logDate.getMonth() === targetMonth;
            const isAfter = (logDate.getFullYear() > targetYear) || (logDate.getFullYear() === targetYear && logDate.getMonth() > targetMonth);

            if (isTarget && (l.type === 'withdraw' || l.type === 'borrow')) {
                usedQty += l.qty;
            }
            if (isAfter) {
                if (l.type === 'receive' || l.status === 'returned') endingStock -= l.qty;
                if (l.type === 'withdraw' || l.type === 'borrow') endingStock += l.qty;
            }
        });

        endingStock = Math.max(0, endingStock);

        if (usedQty > maxUsedQty) {
            maxUsedQty = usedQty;
            mostUsedItem = `${p.name} (ใช้ไป ${usedQty} ${p.unitSmall})`;
        }
        if (usedQty > 0 && usedQty < minUsedQty) {
            minUsedQty = usedQty;
            leastUsedItem = `${p.name} (ใช้ไป ${usedQty} ${p.unitSmall})`;
        }

        // ตรวจสอบว่าคงเหลือต่ำกว่าเกณฑ์แจ้งเตือนหรือไม่
        if (endingStock <= (p.min || 5)) {
            urgentItems.push(`${p.name} (เหลือ ${endingStock} ${p.unitSmall})`);
        }
    });

    document.getElementById('report-most-used').innerText = maxUsedQty > 0 ? mostUsedItem : 'ไม่มีรายการถูกใช้';
    document.getElementById('report-least-used').innerText = minUsedQty !== Infinity ? leastUsedItem : 'ไม่มีรายการถูกใช้';
    document.getElementById('report-urgent-buy').innerText = urgentItems.length > 0 ? urgentItems.slice(0, 3).join(', ') : 'ไม่มีรายการเร่งด่วน';
}

// 📑 ฟังก์ชันวาด Stock Card (ประวัติรายชิ้น)
function openStockCard(productDbId) {
    const p = products.find(prod => prod.dbId === productDbId);
    if (!p) return;

    document.getElementById('card-product-name').innerText = p.name;
    document.getElementById('card-product-id').innerText = `ID: ${p.id}`;
    
    const displayStock = (p.ratio && p.ratio > 1) 
        ? `${Math.floor(p.stock / p.ratio)} ${p.unitLarge} (${p.stock % p.ratio} ${p.unitSmall})`
        : `${p.stock} ${p.unitSmall}`;
    document.getElementById('card-current-stock').innerText = `คงเหลือในคลังปัจจุบัน: ${displayStock}`;

    const tbody = document.getElementById('stock-card-body');
    tbody.innerHTML = '';

    // กรอง Log เฉพาะของสินค้านี้
    const itemLogs = logs.filter(l => l.productId === p.id).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (itemLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-slate-400 italic">ไม่มีข้อมูลความเคลื่อนไหว</td></tr>';
    } else {
        tbody.innerHTML = itemLogs.map(l => {
            const date = new Date(l.timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
            let typeLabel = '';
            let typeColor = '';
            
            if (l.type === 'withdraw') { typeLabel = 'เบิกจ่าย'; typeColor = 'text-blue-600'; }
            else if (l.type === 'borrow') { typeLabel = 'ยืม (ครุภัณฑ์)'; typeColor = 'text-indigo-600'; }
            else if (l.type === 'returned') { typeLabel = 'รับคืน'; typeColor = 'text-emerald-600'; }

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-3 text-slate-500">${date}</td>
                    <td class="px-6 py-3 font-bold text-slate-700">${l.user}</td>
                    <td class="px-6 py-3 font-bold ${typeColor}">${typeLabel}</td>
                    <td class="px-6 py-3 text-right font-black text-slate-700">${l.qty}</td>
                    <td class="px-6 py-3 text-center text-slate-400 font-mono">${l.slipNo || '-'}</td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('modal-stock-card').classList.remove('hide');
}

function closeStockCard() {
    document.getElementById('modal-stock-card').classList.add('hide');
}
