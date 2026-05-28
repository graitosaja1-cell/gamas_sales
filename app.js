/* 
  GAJAH MAS SALES REPORT SYSTEM - CORE LOGIC
  Versi Revisional: 2 Role (Owner/Admin), PIN Secure Access, Left Sidebar Layout, Manual Inputs & Sales Order System
*/

document.addEventListener('DOMContentLoaded', () => {
  // --- SUPABASE CONFIG ---
  const supabaseUrl = 'https://xaknjgimtdzjtzfxnmql.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhha25qZ2ltdGR6anR6ZnhubXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDYyMDAsImV4cCI6MjA5NTM4MjIwMH0.Wa8DpFDfumPClsCzujBJpXA3wsZrD6vyKhFeY6pMTAM';
  const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

  // --- STATE ---
  let transactions = [];
  let products = [];
  let currentSeller = 'Jossy';
  let filteredTxList = [];
  let pendingUploadData = null;

  // Auth state
  let activeRole = sessionStorage.getItem('gamas_role') || null;
  let isDashboardUnlocked = sessionStorage.getItem('gamas_dashboard_unlocked') === 'true';

  // New modules states
  let bankAccounts = [];
  let supplierBills = [];
  let stockData = {};
  let salesmen = [];
  let salesOrders = [];
  let activeCart = {}; // product_code -> qty

  lucide.createIcons();

  // --- LOAD / SAVE STATE (SUPABASE) ---
  async function loadAllTransactions() {
    let allTx = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (data && data.length > 0) {
        allTx = allTx.concat(data);
        from += pageSize;
        if (data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }
    return allTx;
  }

  async function loadState() {
    try {
      const [prodRes, stockRes, salesRes, billRes, orderRes] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('stock_data').select('*'),
        supabase.from('salesmen').select('*'),
        supabase.from('supplier_bills').select('*'),
        supabase.from('sales_orders').select('*').order('date', { ascending: false })
      ]);

      if (prodRes.data && prodRes.data.length > 0) products = prodRes.data;
      if (stockRes.data) {
        stockData = {};
        stockRes.data.forEach(item => {
          stockData[item.product_code] = item.qty;
        });
      }
      if (salesRes.data && salesRes.data.length > 0) salesmen = salesRes.data;
      if (billRes.data && billRes.data.length > 0) supplierBills = billRes.data;
      if (orderRes.data && orderRes.data.length > 0) salesOrders = orderRes.data;

      // Load ALL transactions (no limit)
      try {
        const allTx = await loadAllTransactions();
        if (allTx.length > 0) transactions = allTx;
      } catch (txErr) {
        console.error('Gagal memuat semua transaksi, mencoba fallback...', txErr);
        // Fallback: load with larger limit
        const txRes = await supabase.from('transactions').select('*').order('date', { ascending: false }).limit(10000);
        if (txRes.data && txRes.data.length > 0) transactions = txRes.data;
      }

      // Load offline queue if any
      const offlineQueue = localStorage.getItem('gamas_offline_queue');
      if (offlineQueue) {
        const queuedTx = JSON.parse(offlineQueue);
        if (queuedTx.length > 0 && navigator.onLine) {
          await syncOfflineQueue(queuedTx);
        }
      }

      const savedBank = localStorage.getItem('gamas_bank_info');
      if (savedBank) {
        bankAccounts = JSON.parse(savedBank);
      } else {
        bankAccounts = [
          { bank: 'BANK CENTRAL ASIA (BCA)', number: '8290-345-678', holder: 'CV GAJAH MAS DISTRIBUSI' },
          { bank: 'BANK MANDIRI', number: '138-00-9876-543', holder: 'CV GAJAH MAS DISTRIBUSI' }
        ];
        localStorage.setItem('gamas_bank_info', JSON.stringify(bankAccounts));
      }

    } catch (e) {
      console.error("Supabase load error:", e);
      // Try loading from localStorage cache if offline
      const cachedTx = localStorage.getItem('gamas_tx_cache');
      if (cachedTx) {
        transactions = JSON.parse(cachedTx);
        console.log('Loaded transactions from offline cache:', transactions.length);
      }
      if (navigator.onLine) {
        alert("Gagal terhubung ke Supabase. Pastikan koneksi internet stabil.");
      }
    }
  }

  // Offline queue sync
  async function syncOfflineQueue(queuedTx) {
    try {
      for (let i = 0; i < queuedTx.length; i += 500) {
        const chunk = queuedTx.slice(i, i + 500);
        const res = await supabase.from('transactions').upsert(chunk, { onConflict: 'id' });
        if (res.error) {
          console.error('Offline sync error:', res.error);
          return; // Keep queue for next attempt
        }
      }
      localStorage.removeItem('gamas_offline_queue');
      console.log(`Offline queue synced: ${queuedTx.length} transaksi`);
      updateOnlineIndicator();
    } catch (e) {
      console.error('Sync offline queue failed:', e);
    }
  }

  function addToOfflineQueue(txArray) {
    const existing = JSON.parse(localStorage.getItem('gamas_offline_queue') || '[]');
    const combined = [...existing, ...txArray];
    localStorage.setItem('gamas_offline_queue', JSON.stringify(combined));
  }

  // Online/Offline indicator
  function updateOnlineIndicator() {
    const dot = document.getElementById('sidebar-role-dot');
    const statusEl = document.querySelector('.role-status-badge');
    const offlineQueue = JSON.parse(localStorage.getItem('gamas_offline_queue') || '[]');

    if (dot && statusEl) {
      if (navigator.onLine) {
        dot.style.background = 'var(--green, #22c55e)';
        statusEl.innerHTML = `<span class="role-dot" id="sidebar-role-dot" style="background: var(--green, #22c55e);"></span> Online`;
        if (offlineQueue.length > 0) {
          statusEl.innerHTML += ` <span style="font-size:.6rem;color:var(--amber);">(${offlineQueue.length} antri sync)</span>`;
        }
      } else {
        dot.style.background = 'var(--red, #ef4444)';
        statusEl.innerHTML = `<span class="role-dot" id="sidebar-role-dot" style="background: var(--red, #ef4444);"></span> Offline`;
        if (offlineQueue.length > 0) {
          statusEl.innerHTML += ` <span style="font-size:.6rem;color:var(--amber);">(${offlineQueue.length} antri)</span>`;
        }
      }
    }
  }

  window.addEventListener('online', async () => {
    updateOnlineIndicator();
    const offlineQueue = JSON.parse(localStorage.getItem('gamas_offline_queue') || '[]');
    if (offlineQueue.length > 0) {
      await syncOfflineQueue(offlineQueue);
    }
  });
  window.addEventListener('offline', () => updateOnlineIndicator());

  async function saveState() {
    // Cache transactions locally for offline access
    try {
      localStorage.setItem('gamas_tx_cache', JSON.stringify(transactions.slice(0, 5000)));
    } catch (cacheErr) {
      console.warn('Cache transaksi lokal gagal (mungkin penuh):', cacheErr);
    }

    if (!navigator.onLine) {
      // Save to offline queue instead
      localStorage.setItem('gamas_bank_info', JSON.stringify(bankAccounts));
      console.log('Offline mode: Data disimpan secara lokal.');
      updateOnlineIndicator();
      return;
    }

    try {
      const errors = [];
      let savedCount = 0;
      let failedCount = 0;

      if (products.length > 0) {
        const res = await supabase.from('products').upsert(products, { onConflict: 'code' });
        if (res.error) errors.push('products: ' + res.error.message);
      }

      const stockArr = Object.keys(stockData).map(k => ({ product_code: k, qty: stockData[k] }));
      if (stockArr.length > 0) {
        const res = await supabase.from('stock_data').upsert(stockArr, { onConflict: 'product_code' });
        if (res.error) errors.push('stock_data: ' + res.error.message);
      }

      if (salesmen.length > 0) {
        const smPayload = salesmen.map(s => {
          if (!s.id) s.id = crypto.randomUUID();
          return s;
        });
        const res = await supabase.from('salesmen').upsert(smPayload, { onConflict: 'id' });
        if (res.error) errors.push('salesmen: ' + res.error.message);
      }

      if (supplierBills.length > 0) {
        const billsPayload = supplierBills.map(b => {
          if (!b.id) b.id = crypto.randomUUID();
          return b;
        });
        const res = await supabase.from('supplier_bills').upsert(billsPayload, { onConflict: 'id' });
        if (res.error) errors.push('supplier_bills: ' + res.error.message);
      }

      if (salesOrders.length > 0) {
        const res = await supabase.from('sales_orders').upsert(salesOrders, { onConflict: 'id' });
        if (res.error) errors.push('sales_orders: ' + res.error.message);
      }

      // Save all transactions with retry
      if (transactions.length > 0) {
        for (let i = 0; i < transactions.length; i += 500) {
          const chunk = transactions.slice(i, i + 500);
          let res = await supabase.from('transactions').upsert(chunk, { onConflict: 'id' });
          if (res.error) {
            // Retry once
            console.warn(`Chunk ${i}-${i + 500} gagal, retrying...`, res.error.message);
            await new Promise(r => setTimeout(r, 1000));
            res = await supabase.from('transactions').upsert(chunk, { onConflict: 'id' });
            if (res.error) {
              errors.push(`transactions chunk ${i}-${i + chunk.length}: ` + res.error.message);
              failedCount += chunk.length;
            } else {
              savedCount += chunk.length;
            }
          } else {
            savedCount += chunk.length;
          }
        }
      }

      localStorage.setItem('gamas_bank_info', JSON.stringify(bankAccounts));

      if (errors.length > 0) {
        console.error('Supabase save errors:', errors);
        alert(`Peringatan: Beberapa data gagal tersimpan ke database.\nBerhasil: ${savedCount} | Gagal: ${failedCount}\n\n` + errors.join('\n'));
      }
    } catch (e) {
      console.error("Supabase save error", e);
      alert('Gagal menyimpan data ke Supabase: ' + e.message);
    }
  }

  // --- HELPERS ---
  function formatIDR(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value).replace(/,00$/, '');
  }

  function cleanProductCode(name) {
    if (!name) return 'FB800';
    const str = name.toString().toUpperCase();
    if (str.includes('200')) return 'FB200';
    if (str.includes('400')) return 'FB400';
    if (str.includes('800')) return 'FB800';
    return name;
  }

  function getProdMap() {
    const m = {};
    products.forEach(p => { m[p.code] = p; });
    return m;
  }

  // --- DYNAMIC SELECTORS LOADING ---
  function populateSalesmenSelectors() {
    const activeSalesmen = salesmen.filter(s => s.status && s.status.trim().toLowerCase() === 'active');

    // 1. App select salesman control (Data Transaksi)
    const selControl = document.getElementById('seller-select-control');
    if (selControl) {
      const prevVal = (selControl.value || currentSeller || '').toLowerCase();
      selControl.innerHTML = '<option value="all">Semua Sales</option>';
      activeSalesmen.forEach(s => {
        selControl.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      });
      const matched = activeSalesmen.find(s => s.name.toLowerCase() === prevVal);
      if (matched) {
        selControl.value = matched.name;
        currentSeller = matched.name;
      } else if (activeSalesmen.length > 0) {
        selControl.value = activeSalesmen[0].name;
        currentSeller = activeSalesmen[0].name;
      }
    }

    // 2. Input Manual salesman selector
    const manualSalesman = document.getElementById('sale-salesman');
    if (manualSalesman) {
      manualSalesman.innerHTML = '<option value="" disabled selected>Pilih...</option>';
      activeSalesmen.forEach(s => {
        manualSalesman.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      });
    }

    // 3. Sales Order salesman selector
    const orderSalesman = document.getElementById('order-salesman');
    if (orderSalesman) {
      orderSalesman.innerHTML = '<option value="" disabled selected>Pilih...</option>';
      activeSalesmen.forEach(s => {
        orderSalesman.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      });
    }

    // 4. Edit Transaksi modal selector
    const editSalesman = document.getElementById('tx-edit-salesman');
    if (editSalesman) {
      editSalesman.innerHTML = '';
      activeSalesmen.forEach(s => {
        editSalesman.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      });
    }
  }

  // --- ROLE MANAGEMENT & LOGIN ---
  const viewLogin = document.getElementById('view-login');
  const appShell = document.getElementById('app-shell');
  const pinErrorMsg = document.getElementById('pin-error-msg');
  const pinInput = document.getElementById('pin-input');

  let currentPin = '';

  // PIN Key clicks
  document.querySelectorAll('.pin-key[data-val]').forEach(key => {
    key.onclick = () => {
      if (currentPin.length < 6) {
        currentPin += key.getAttribute('data-val');
        pinInput.value = '*'.repeat(currentPin.length);
        pinErrorMsg.style.display = 'none';

        // Auto-check PIN on 6 digits
        if (currentPin.length === 6) {
          checkPINAuth();
        }
      }
    };
  });

  // Clear PIN
  const btnPinClear = document.getElementById('btn-pin-clear');
  if (btnPinClear) {
    btnPinClear.onclick = () => {
      if (currentPin.length > 0) {
        currentPin = currentPin.slice(0, -1);
        pinInput.value = '*'.repeat(currentPin.length);
      }
    };
  }

  // Enter PIN manual trigger
  const btnPinEnter = document.getElementById('btn-pin-enter');
  if (btnPinEnter) {
    btnPinEnter.onclick = () => {
      if (currentPin.length > 0) {
        checkPINAuth();
      }
    };
  }

  // Validate entered PIN
  function checkPINAuth() {
    if (currentPin === '654321') {
      // Login as Owner
      activeRole = 'owner';
      sessionStorage.setItem('gamas_role', 'owner');
      // Keep locked by default on fresh login
      isDashboardUnlocked = false;
      sessionStorage.setItem('gamas_dashboard_unlocked', 'false');
      initApp();
    } else if (currentPin === '123456') {
      // Login as Admin
      activeRole = 'admin';
      sessionStorage.setItem('gamas_role', 'admin');
      initApp();
    } else {
      // Wrong PIN
      pinErrorMsg.style.display = 'flex';
      const loginCard = document.querySelector('.login-card');
      loginCard.style.animation = 'none';
      setTimeout(() => {
        loginCard.style.animation = 'shake 0.3s ease';
      }, 10);

      currentPin = '';
      pinInput.value = '';
    }
  }

  // Keyboard support for typing PIN
  document.addEventListener('keydown', (e) => {
    if (viewLogin.style.display !== 'none') {
      if (e.key >= '0' && e.key <= '9') {
        if (currentPin.length < 6) {
          currentPin += e.key;
          pinInput.value = '*'.repeat(currentPin.length);
          pinErrorMsg.style.display = 'none';
          if (currentPin.length === 6) checkPINAuth();
        }
      } else if (e.key === 'Backspace') {
        if (currentPin.length > 0) {
          currentPin = currentPin.slice(0, -1);
          pinInput.value = '*'.repeat(currentPin.length);
        }
      } else if (e.key === 'Enter') {
        checkPINAuth();
      }
    }
  });

  // Logout/Change role triggers
  const changeRoleBtn = document.getElementById('btn-change-role');
  if (changeRoleBtn) {
    changeRoleBtn.onclick = logout;
  }
  const sidebarLogoutBtn = document.getElementById('sidebar-logout-btn');
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.onclick = logout;
  }

  function logout() {
    sessionStorage.removeItem('gamas_role');
    sessionStorage.removeItem('gamas_dashboard_unlocked');
    activeRole = null;
    currentPin = '';
    window.location.hash = '#/';
    window.location.reload();
  }

  // --- MOBILE SIDEBAR DRAWER TOGGLE ---
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const appSidebar = document.getElementById('app-sidebar');
  let sidebarBackdrop = document.createElement('div');
  sidebarBackdrop.className = 'sidebar-backdrop';
  document.body.appendChild(sidebarBackdrop);

  if (sidebarToggleBtn && appSidebar) {
    sidebarToggleBtn.onclick = () => {
      appSidebar.classList.add('active');
      sidebarBackdrop.classList.add('active');
    };
  }

  sidebarBackdrop.onclick = closeMobileSidebar;
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', closeMobileSidebar);
  });

  function closeMobileSidebar() {
    if (appSidebar) appSidebar.classList.remove('active');
    sidebarBackdrop.classList.remove('active');
  }

  // Apply visual roles elements
  function applyRoleUI() {
    document.querySelectorAll('.owner-only').forEach(el => {
      el.style.display = activeRole === 'owner' ? '' : 'none';
    });
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = activeRole === 'admin' ? '' : 'none';
    });

    const activeRoleText = document.getElementById('active-role-text');
    const activeRoleDot = document.getElementById('active-role-dot');
    const sideRoleAvatar = document.getElementById('sidebar-role-avatar');
    const sideRoleName = document.getElementById('sidebar-role-name');

    if (activeRole === 'owner') {
      if (activeRoleText) activeRoleText.textContent = 'Owner';
      if (activeRoleDot) activeRoleDot.className = 'dot owner';
      if (sideRoleAvatar) {
        sideRoleAvatar.textContent = 'O';
        sideRoleAvatar.style.background = 'linear-gradient(135deg, var(--accent) 0%, #3b82f6 100%)';
      }
      if (sideRoleName) sideRoleName.textContent = 'Owner Gajah Mas';
    } else {
      if (activeRoleText) activeRoleText.textContent = 'Admin';
      if (activeRoleDot) activeRoleDot.className = 'dot admin';
      if (sideRoleAvatar) {
        sideRoleAvatar.textContent = 'A';
        sideRoleAvatar.style.background = 'linear-gradient(135deg, var(--green) 0%, #10b981 100%)';
      }
      if (sideRoleName) sideRoleName.textContent = 'Administrator';
    }
  }

  // --- ROUTER ENGINE ---
  const views = {
    'dashboard': document.getElementById('view-dashboard'),
    'seller-detail': document.getElementById('view-seller-detail'),
    'products': document.getElementById('view-products'),
    'daily-reports': document.getElementById('view-daily-reports'),
    'new-sale': document.getElementById('view-new-sale'),
    'sales-order': document.getElementById('view-sales-order'),
    'hari-ini': document.getElementById('view-hari-ini'),
    'info-rekening': document.getElementById('view-info-rekening'),
    'tagihan-supplier': document.getElementById('view-tagihan-supplier'),
    'harga-produk': document.getElementById('view-harga-produk'),
    'stok': document.getElementById('view-stok'),
    'kelola-sales': document.getElementById('view-kelola-sales')
  };

  const sidebarLinks = document.querySelectorAll('.sidebar-nav .sidebar-link');

  function handleRoute() {
    if (!activeRole) return; // Wait for auth PIN

    let hash = window.location.hash || '#/';

    // Security Routing Checks
    if (activeRole === 'admin' && hash === '#/') {
      hash = '#/sales/seller/Jossy';
      window.location.hash = hash;
      return;
    }
    if (activeRole === 'owner' && (
      hash === '#/products' ||
      hash === '#/daily_reports' ||
      hash === '#/sales/new' ||
      hash === '#/kelola_sales'
    )) {
      hash = '#/';
      window.location.hash = hash;
      return;
    }

    // Hide all view screens
    Object.values(views).forEach(v => {
      if (v) v.classList.remove('active');
    });
    // Reset sidebar link indicators
    sidebarLinks.forEach(l => l.classList.remove('active'));

    if (hash !== '#/daily_reports') cancelExcelUpload();

    // Map Hash to Views
    if (hash === '#/' || hash === '') {
      if (views['dashboard']) views['dashboard'].classList.add('active');
      const sideLink = document.getElementById('side-dashboard');
      if (sideLink) sideLink.classList.add('active');
      renderDashboard();
    } else if (hash.startsWith('#/sales/seller/')) {
      const name = hash.split('/').pop();
      currentSeller = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      if (views['seller-detail']) views['seller-detail'].classList.add('active');
      const sideLink = document.getElementById('side-seller');
      if (sideLink) sideLink.classList.add('active');
      const selCtrl = document.getElementById('seller-select-control');
      if (selCtrl) selCtrl.value = currentSeller;
      renderSellerDetail();
    } else if (hash === '#/products') {
      if (views['products']) views['products'].classList.add('active');
      const sideLink = document.getElementById('side-products');
      if (sideLink) sideLink.classList.add('active');
      renderProductsCatalog();
    } else if (hash === '#/daily_reports') {
      if (views['daily-reports']) views['daily-reports'].classList.add('active');
      const sideLink = document.getElementById('side-reports');
      if (sideLink) sideLink.classList.add('active');
      setupExcelDropZone();
    } else if (hash === '#/sales/new') {
      if (views['new-sale']) views['new-sale'].classList.add('active');
      const sideLink = document.getElementById('side-new-sale');
      if (sideLink) sideLink.classList.add('active');
      setupManualSaleForm();
    } else if (hash === '#/sales/order') {
      if (views['sales-order']) views['sales-order'].classList.add('active');
      const sideLink = document.getElementById('side-sales-order');
      if (sideLink) sideLink.classList.add('active');
      renderSalesOrderModule();
    } else if (hash === '#/hari_ini') {
      if (views['hari-ini']) views['hari-ini'].classList.add('active');
      const sideLink = document.getElementById('side-hari-ini');
      if (sideLink) sideLink.classList.add('active');
      renderLaporanHariIni();
    } else if (hash === '#/info_rekening') {
      if (views['info-rekening']) views['info-rekening'].classList.add('active');
      const sideLink = document.getElementById('side-rekening');
      if (sideLink) sideLink.classList.add('active');
      renderInfoRekening();
    } else if (hash === '#/tagihan_supplier') {
      if (views['tagihan-supplier']) views['tagihan-supplier'].classList.add('active');
      const sideLink = document.getElementById('side-tagihan');
      if (sideLink) sideLink.classList.add('active');
      renderTagihanSupplier();
    } else if (hash === '#/harga_produk') {
      if (views['harga-produk']) views['harga-produk'].classList.add('active');
      const sideLink = document.getElementById('side-harga-produk');
      if (sideLink) sideLink.classList.add('active');
      renderHargaProdukCatalog();
    } else if (hash === '#/stok') {
      if (views['stok']) views['stok'].classList.add('active');
      const sideLink = document.getElementById('side-stok');
      if (sideLink) sideLink.classList.add('active');
      renderStokGudang();
    } else if (hash === '#/kelola_sales') {
      if (views['kelola-sales']) views['kelola-sales'].classList.add('active');
      const sideLink = document.getElementById('side-kelola-sales');
      if (sideLink) sideLink.classList.add('active');
      renderKelolaSalesman();
    }
  }

  window.addEventListener('hashchange', handleRoute);

  const sellerSelCtrl = document.getElementById('seller-select-control');
  if (sellerSelCtrl) {
    sellerSelCtrl.addEventListener('change', (e) => {
      window.location.hash = `#/sales/seller/${e.target.value.toLowerCase()}`;
    });
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VIEW 1: DASHBOARD
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderDashboard() {
    if (activeRole !== 'owner') return;

    // Apply dashboard lock animation overlay
    const overlay = document.getElementById('dashboard-lock-overlay');
    const unlockedContent = document.getElementById('dashboard-unlocked-content');

    if (overlay && unlockedContent) {
      if (isDashboardUnlocked) {
        overlay.style.display = 'none';
        unlockedContent.classList.remove('blurred');
      } else {
        overlay.style.display = 'flex';
        unlockedContent.classList.add('blurred');
      }
    }

    const prodMap = getProdMap();
    let qtyCash = 0, valCash = 0, profitCash = 0;
    let qtyTempo = 0, valTempo = 0, profitTempo = 0;

    // Create counting based on dynamically loaded registry
    const txCounts = {};
    salesmen.forEach(s => {
      txCounts[s.name] = { Cash: 0, Tempo: 0 };
    });

    transactions.forEach(t => {
      const p = prodMap[t.product_code];
      const buyPrice = p ? p.buy_price : 0;
      const profit = t.nominal - (t.qty * buyPrice);

      // Safety mapping
      if (txCounts[t.salesman]) {
        txCounts[t.salesman][t.payment_type === 'Cash' ? 'Cash' : 'Tempo']++;
      } else {
        // Fallback for new salesman records from WA
        txCounts[t.salesman] = { Cash: 0, Tempo: 0 };
        txCounts[t.salesman][t.payment_type === 'Cash' ? 'Cash' : 'Tempo']++;
      }

      if (t.payment_type === 'Cash') {
        qtyCash += t.qty; valCash += t.nominal; profitCash += profit;
      } else {
        qtyTempo += t.qty; valTempo += t.nominal; profitTempo += profit;
      }
    });

    const totalQty = qtyCash + qtyTempo;
    const totalSales = valCash + valTempo;
    const totalProfit = profitCash + profitTempo;

    document.getElementById('dash-qty-cash').textContent = `${qtyCash.toLocaleString('id-ID')}`;
    document.getElementById('dash-pct-qty-cash').textContent = `${totalQty > 0 ? Math.round((qtyCash / totalQty) * 100) : 0}%`;
    document.getElementById('dash-val-cash').textContent = formatIDR(valCash);

    document.getElementById('dash-qty-tempo').textContent = `${qtyTempo.toLocaleString('id-ID')}`;
    document.getElementById('dash-pct-qty-tempo').textContent = `${totalQty > 0 ? Math.round((qtyTempo / totalQty) * 100) : 0}%`;
    document.getElementById('dash-val-tempo').textContent = formatIDR(valTempo);

    document.getElementById('dash-total-profit').textContent = formatIDR(totalProfit);
    const profitQtyEl = document.getElementById('dash-profit-qty');
    if (profitQtyEl) profitQtyEl.textContent = totalQty.toLocaleString('id-ID');
    document.getElementById('dash-sub-profit-cash').textContent = formatIDR(profitCash);
    document.getElementById('dash-sub-profit-tempo').textContent = formatIDR(profitTempo);

    renderSalesmenCards(prodMap);

    const txTbody = document.getElementById('dash-tx-table-body');
    if (txTbody) {
      txTbody.innerHTML = '';
      let grandCash = 0, grandTempo = 0;
      Object.keys(txCounts).forEach(s => {
        const cash = txCounts[s].Cash;
        const tempo = txCounts[s].Tempo;
        grandCash += cash; grandTempo += tempo;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td data-label="Salesman"><b>${s}</b></td>
          <td data-label="Cash">${cash}</td>
          <td data-label="Tempo">${tempo}</td>
          <td data-label="Total"><b>${cash + tempo}</b></td>
        `;
        txTbody.appendChild(tr);
      });
      const trGrand = document.createElement('tr');
      trGrand.className = 'total-row';
      trGrand.innerHTML = `
        <td data-label="Salesman">Total</td>
        <td data-label="Cash">${grandCash}</td>
        <td data-label="Tempo">${grandTempo}</td>
        <td data-label="Total">${grandCash + grandTempo}</td>
      `;
      txTbody.appendChild(trGrand);
    }
  }

  // Dashboard Lock Button triggers
  const btnUnlockDashboard = document.getElementById('btn-unlock-dashboard');
  if (btnUnlockDashboard) {
    btnUnlockDashboard.onclick = () => {
      isDashboardUnlocked = true;
      sessionStorage.setItem('gamas_dashboard_unlocked', 'true');

      const overlay = document.getElementById('dashboard-lock-overlay');
      const unlockedContent = document.getElementById('dashboard-unlocked-content');

      if (overlay && unlockedContent) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(0.95)';
        overlay.style.transition = 'all 0.35s ease';
        setTimeout(() => {
          overlay.style.display = 'none';
          unlockedContent.classList.remove('blurred');
          renderDashboard();
        }, 350);
      }
    };
  }

  function renderSalesmenCards(prodMap) {
    const container = document.getElementById('dash-salesmen-cards');
    if (!container) return;
    container.innerHTML = '';

    // Only display dynamic active salesmen
    salesmen.filter(s => s.status === 'Active').forEach((s, idx) => {
      const salesmanName = s.name;
      let totalSales = 0, cashSales = 0, tempoSales = 0, totalQty = 0, profitCash = 0, profitTempo = 0;

      transactions.forEach(t => {
        if (t.salesman.toLowerCase() === salesmanName.toLowerCase()) {
          const p = prodMap[t.product_code];
          const buyPrice = p ? p.buy_price : 0;
          const profit = t.nominal - (t.qty * buyPrice);
          totalSales += t.nominal; totalQty += t.qty;
          if (t.payment_type === 'Cash') { cashSales += t.nominal; profitCash += profit; }
          else { tempoSales += t.nominal; profitTempo += profit; }
        }
      });
      const totalProfit = profitCash + profitTempo;

      const card = document.createElement('div');
      card.className = 'salesman-card';
      card.innerHTML = `
        <div class="sc-header">
          <div class="sc-avatar idx-${idx % 3}">${salesmanName.charAt(0)}</div>
          <div>
            <div class="sc-name">${salesmanName.toUpperCase()}</div>
            <div class="sc-role-label">Salesman Resmi</div>
          </div>
        </div>
        <div class="sc-body">
          <div class="sc-row"><span>Volume</span><span class="val">${totalQty.toLocaleString('id-ID')} krat</span></div>
          <div class="sc-row"><span>Omset</span><span class="val blue">${formatIDR(totalSales)}</span></div>
          <div class="sc-profit-row">
            <div class="sc-profit-item"><div class="sc-profit-label">PROFIT CASH</div><div class="sc-profit-val blue">${formatIDR(profitCash)}</div></div>
            <div class="sc-profit-item"><div class="sc-profit-label">PROFIT TEMPO</div><div class="sc-profit-val amber">${formatIDR(profitTempo)}</div></div>
          </div>
          <div style="margin-top: .5rem; text-align: right;"><span class="val green" style="font-size: .85rem; font-weight: 700;">Total: ${formatIDR(totalProfit)}</span></div>
        </div>
        <div class="sc-footer">
          <a href="#/sales/seller/${salesmanName.toLowerCase()}" class="sc-detail-btn">Lihat Detail Laporan <i data-lucide="chevron-right"></i></a>
        </div>
      `;
      container.appendChild(card);
    });
    lucide.createIcons();
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VIEW 2: SELLER DETAIL
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderSellerDetail() {
    const prodMap = getProdMap();

    let qtyCash = 0, valCash = 0, profitCash = 0;
    let qtyTempo = 0, valTempo = 0, profitTempo = 0;
    const sellerProdSummary = {
      FB200: { code: 'FB200', cash_qty: 0, cash_rp: 0, tempo_qty: 0, tempo_rp: 0 },
      FB400: { code: 'FB400', cash_qty: 0, cash_rp: 0, tempo_qty: 0, tempo_rp: 0 },
      FB800: { code: 'FB800', cash_qty: 0, cash_rp: 0, tempo_qty: 0, tempo_rp: 0 }
    };
    const sellerTxList = [];

    transactions.forEach(t => {
      if (currentSeller.toLowerCase() !== 'all' && t.salesman.toLowerCase() !== currentSeller.toLowerCase()) return;
      const p = prodMap[t.product_code];
      const buyPrice = p ? p.buy_price : 0;
      const profit = t.nominal - (t.qty * buyPrice);
      sellerTxList.push(t);
      const ps = sellerProdSummary[t.product_code];
      if (ps) {
        if (t.payment_type === 'Cash') { ps.cash_qty += t.qty; ps.cash_rp += t.nominal; }
        else { ps.tempo_qty += t.qty; ps.tempo_rp += t.nominal; }
      }
      if (t.payment_type === 'Cash') { qtyCash += t.qty; valCash += t.nominal; profitCash += profit; }
      else { qtyTempo += t.qty; valTempo += t.nominal; profitTempo += profit; }
    });

    const totalQty = qtyCash + qtyTempo;
    const totalSales = valCash + valTempo;
    const totalProfit = profitCash + profitTempo;

    // Profit cards (Owner only)
    if (activeRole === 'owner') {
      const profitDetailEl = document.getElementById('seller-profit-detail');
      if (profitDetailEl) {
        profitDetailEl.innerHTML = `
          <div class="profit-split-card cash-p">
            <div class="psc-label">Profit Cash</div>
            <div class="psc-amount accent">${formatIDR(profitCash)}</div>
            <div class="psc-desc">${formatIDR(valCash)}</div>
          </div>
          <div class="profit-split-card tempo-p">
            <div class="psc-label">Profit Tempo</div>
            <div class="psc-amount">${formatIDR(profitTempo)}</div>
            <div class="psc-desc">${formatIDR(valTempo)}</div>
          </div>
          <div class="profit-split-card total-p">
            <div class="psc-label">Total Profit - ${currentSeller.toLowerCase() === 'all' ? 'SEMUA SALES' : currentSeller.toUpperCase()}</div>
            <div class="psc-amount" style="color: var(--green);">${formatIDR(totalProfit)}</div>
            <div class="psc-desc">${totalQty.toLocaleString('id-ID')} krat | ${formatIDR(totalSales)} omset</div>
          </div>
        `;
      }

      const prodTbody = document.getElementById('seller-product-table-body');
      if (prodTbody) {
        prodTbody.innerHTML = '';
        Object.values(sellerProdSummary).forEach(ps => {
          const totalQtyRow = ps.cash_qty + ps.tempo_qty;
          const totalRpRow = ps.cash_rp + ps.tempo_rp;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td data-label="Produk"><span class="badge prod">${ps.code}</span></td>
            <td data-label="Cash Qty">${ps.cash_qty}</td>
            <td data-label="Cash Rp">${formatIDR(ps.cash_rp)}</td>
            <td data-label="Tempo Qty">${ps.tempo_qty}</td>
            <td data-label="Tempo Rp">${formatIDR(ps.tempo_rp)}</td>
            <td data-label="Total Qty"><strong>${totalQtyRow}</strong></td>
            <td data-label="Total Nominal"><strong>${formatIDR(totalRpRow)}</strong></td>
          `;
          prodTbody.appendChild(tr);
        });
      }
    }

    setupFiltersAndRenderDaily(sellerTxList);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FILTER & DAILY TABLE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function setupFiltersAndRenderDaily(sellerTxList) {
    const dateStartInput = document.getElementById('filter-date-start');
    const dateEndInput = document.getElementById('filter-date-end');
    const productSelect = document.getElementById('filter-product');
    const paymentSelect = document.getElementById('filter-payment');
    const searchInput = document.getElementById('filter-search-query') || document.getElementById('filter-customer');
    const btnReset = document.getElementById('btn-apply-filter') || document.getElementById('btn-reset-filters');

    if (!dateStartInput) return; // fail safe

    let minDate = '', maxDate = '';
    if (sellerTxList.length > 0) {
      const dates = sellerTxList.map(t => t.date);
      minDate = dates.reduce((a, b) => a < b ? a : b);
      maxDate = dates.reduce((a, b) => a > b ? a : b);
    }

    dateStartInput.value = minDate;
    dateEndInput.value = maxDate;
    if (productSelect) productSelect.value = 'ALL';
    if (paymentSelect) paymentSelect.value = 'ALL';
    if (searchInput) searchInput.value = '';

    function applyFilters() {
      const start = dateStartInput.value;
      const end = dateEndInput.value;
      const selProd = productSelect ? productSelect.value : 'ALL';
      const selPayment = paymentSelect ? paymentSelect.value : 'ALL';
      const querySearch = searchInput ? searchInput.value.toLowerCase().trim() : '';

      filteredTxList = sellerTxList.filter(t => {
        if (start && t.date < start) return false;
        if (end && t.date > end) return false;
        if (selProd !== 'ALL' && t.product_code !== selProd) return false;
        if (selPayment !== 'ALL' && t.payment_type !== selPayment) return false;
        if (querySearch && !t.customer.toLowerCase().includes(querySearch) && !t.product_name.toLowerCase().includes(querySearch)) return false;
        return true;
      });

      filteredTxList.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.customer.localeCompare(b.customer);
      });

      // Pagination
      const limit = 50;
      const totalPages = Math.ceil(filteredTxList.length / limit) || 1;
      let currentPage = window.currentTxPage || 1;
      if (currentPage > totalPages) currentPage = totalPages;
      window.currentTxPage = currentPage;

      const startIndex = (currentPage - 1) * limit;
      const paginatedList = filteredTxList.slice(startIndex, startIndex + limit);

      const btnPrev = document.getElementById('btn-prev-page');
      const btnNext = document.getElementById('btn-next-page');
      const pageInfo = document.getElementById('pagination-info');

      if (btnPrev && btnNext && pageInfo) {
        pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages} (${filteredTxList.length} transaksi)`;
        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;

        btnPrev.onclick = () => { if (currentPage > 1) { window.currentTxPage--; applyFilters(); } };
        btnNext.onclick = () => { if (currentPage < totalPages) { window.currentTxPage++; applyFilters(); } };
      }

      const dailyTbody = document.getElementById('seller-daily-table-body');
      dailyTbody.innerHTML = '';

      if (paginatedList.length === 0) {
        dailyTbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-2);padding:1.5rem">Tidak ada data.</td></tr>';
        return;
      }

      paginatedList.forEach(t => {
        const dateObj = new Date(t.date);
        const formattedDate = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const paymentBadge = t.payment_type.toLowerCase();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td data-label="Tanggal">${formattedDate}</td>
          <td data-label="Salesman">${t.salesman}</td>
          <td data-label="Customer"><b>${t.customer}</b></td>
          <td data-label="Produk"><span class="badge prod">${t.product_code}</span></td>
          <td data-label="QTY">${t.qty}</td>
          <td data-label="Harga">${formatIDR(t.price)}</td>
          <td data-label="Nominal" style="color:var(--accent);font-weight:600">${formatIDR(t.nominal)}</td>
          <td data-label="Pembayaran"><span class="badge ${paymentBadge}">${t.payment_type}</span></td>
          <td data-label="Aksi" class="admin-only" style="text-align: center; display: ${activeRole === 'admin' ? '' : 'none'};">
            <button class="btn-ghost btn-edit-tx" data-id="${t.id}" title="Edit"><i data-lucide="edit-2"></i></button>
            <button class="btn-ghost btn-del-tx" data-id="${t.id}" style="color:var(--red);" title="Hapus"><i data-lucide="trash-2"></i></button>
          </td>
        `;
        dailyTbody.appendChild(tr);
      });

      lucide.createIcons();
    }

    if (dateStartInput) dateStartInput.onchange = () => { window.currentTxPage = 1; applyFilters(); };
    if (dateEndInput) dateEndInput.onchange = () => { window.currentTxPage = 1; applyFilters(); };
    if (productSelect) productSelect.onchange = () => { window.currentTxPage = 1; applyFilters(); };
    if (paymentSelect) paymentSelect.onchange = () => { window.currentTxPage = 1; applyFilters(); };
    if (searchInput) searchInput.oninput = () => { window.currentTxPage = 1; applyFilters(); };

    if (btnReset) btnReset.onclick = () => {
      window.currentTxPage = 1;
      dateStartInput.value = minDate;
      dateEndInput.value = maxDate;
      if (productSelect) productSelect.value = 'ALL';
      if (paymentSelect) paymentSelect.value = 'ALL';
      if (searchInput) searchInput.value = '';
      applyFilters();
    };

    applyFilters();
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXPORT EXCEL (.xlsx) DENGAN FILTER PERIODE
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function showExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) modal.classList.add('active');
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-export-excel')) {
      showExportModal();
    }
    if (e.target.closest('#btn-close-export-modal') || e.target.closest('#btn-cancel-export')) {
      const modal = document.getElementById('export-modal');
      if (modal) modal.classList.remove('active');
    }
    if (e.target.closest('#btn-confirm-export')) {
      doExportExcel();
    }
    if (e.target.closest('#btn-print-pdf')) {
      const printDateEl = document.getElementById('print-date');
      if (printDateEl) printDateEl.textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      window.print();
    }
  });

  function doExportExcel() {
    if (!filteredTxList || filteredTxList.length === 0) {
      alert('Tidak ada data yang dapat diekspor!');
      return;
    }

    const periodeType = document.getElementById('export-periode-type').value;
    const periodeStart = document.getElementById('export-periode-start').value;
    const periodeEnd = document.getElementById('export-periode-end').value;

    let dataToExport = [...filteredTxList];

    if (periodeType !== 'all' && periodeStart && periodeEnd) {
      dataToExport = dataToExport.filter(t => t.date >= periodeStart && t.date <= periodeEnd);
    }

    if (dataToExport.length === 0) {
      alert('Data kosong untuk periode yang dipilih!');
      return;
    }

    const prodMap = getProdMap();

    const rows = dataToExport.map(t => {
      const p = prodMap[t.product_code];
      const buyPrice = p ? p.buy_price : 0;
      const profit = t.nominal - (t.qty * buyPrice);
      return {
        'Salesman': t.salesman,
        'Tanggal': t.date,
        'Customer': t.customer,
        'Produk': t.product_code,
        'Nama Produk': p ? p.name : t.product_code,
        'QTY (krat)': t.qty,
        'Harga Jual (Rp)': t.price,
        'Nominal (Rp)': t.nominal,
        'Jenis Pembayaran': t.payment_type,
        'Harga Beli (Rp)': buyPrice,
        'Profit (Rp)': profit
      };
    });

    const salesSummary = {};
    dataToExport.forEach(t => {
      const p = prodMap[t.product_code];
      const buyPrice = p ? p.buy_price : 0;
      const profit = t.nominal - (t.qty * buyPrice);
      if (!salesSummary[t.salesman]) salesSummary[t.salesman] = { cash_qty: 0, cash_rp: 0, cash_profit: 0, tempo_qty: 0, tempo_rp: 0, tempo_profit: 0 };
      const sm = salesSummary[t.salesman];
      if (t.payment_type === 'Cash') { sm.cash_qty += t.qty; sm.cash_rp += t.nominal; sm.cash_profit += profit; }
      else { sm.tempo_qty += t.qty; sm.tempo_rp += t.nominal; sm.tempo_profit += profit; }
    });

    const summaryRows = Object.entries(salesSummary).map(([name, sm]) => ({
      'Salesman': name,
      'QTY Cash (krat)': sm.cash_qty,
      'Omset Cash (Rp)': sm.cash_rp,
      'Profit Cash (Rp)': sm.cash_profit,
      'QTY Tempo (krat)': sm.tempo_qty,
      'Omset Tempo (Rp)': sm.tempo_rp,
      'Profit Tempo (Rp)': sm.tempo_profit,
      'Total QTY (krat)': sm.cash_qty + sm.tempo_qty,
      'Total Omset (Rp)': sm.cash_rp + sm.tempo_rp,
      'Total Profit (Rp)': sm.cash_profit + sm.tempo_profit
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rows);
    ws1['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detail Transaksi');

    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan Salesman');

    const periodLabel = periodeType === 'all' ? 'Semua' : `${periodeStart}_sd_${periodeEnd}`;
    const filename = `Laporan_Penjualan_${currentSeller}_${periodLabel}.xlsx`;
    XLSX.writeFile(wb, filename);

    const modal = document.getElementById('export-modal');
    if (modal) modal.classList.remove('active');
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VIEW 3: PRODUCTS CATALOG (Admin)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderProductsCatalog() {
    if (activeRole !== 'admin') return;

    const listContainer = document.getElementById('products-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const productSalesQty = {};
    transactions.forEach(t => {
      productSalesQty[t.product_code] = (productSalesQty[t.product_code] || 0) + t.qty;
    });

    products.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div>
          <span class="pc-code">${p.code}</span>
          <div class="pc-name">${p.name}</div>
        </div>
        <div class="pc-price-item">
          <span class="pc-label">Cost</span>
          <span class="pc-val">${formatIDR(p.buy_price)}</span>
        </div>
        <div class="pc-price-item">
          <span class="pc-label">Cash</span>
          <span class="pc-val accent">${formatIDR(p.cash_price)}</span>
        </div>
        <div class="pc-price-item">
          <span class="pc-label">Tempo</span>
          <span class="pc-val amber">${formatIDR(p.tempo_price)}</span>
        </div>
        <div>
          <button class="btn btn-secondary btn-edit-product" data-index="${idx}" style="width:100%">
            <i data-lucide="edit-2"></i> Edit
          </button>
        </div>
      `;
      listContainer.appendChild(card);
    });

    document.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.onclick = (e) => openProductModal(e.currentTarget.getAttribute('data-index'));
    });
    lucide.createIcons();
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PRODUCT MODAL (Admin)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const prodModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');

  function openProductModal(index = null) {
    if (!prodModal) return;
    prodModal.classList.add('active');
    const inputIndex = document.getElementById('prod-edit-index');
    const inputCode = document.getElementById('prod-code');
    const inputName = document.getElementById('prod-name');
    const inputBuy = document.getElementById('prod-buy-price');
    const inputCash = document.getElementById('prod-cash-price');
    const inputTempo = document.getElementById('prod-tempo-price');

    document.getElementById('product-modal-title').textContent =
      index !== null ? `Edit Produk - ${products[index].code}` : 'Tambah Produk Baru';

    if (index !== null) {
      const p = products[index];
      inputIndex.value = index; inputCode.value = p.code; inputCode.disabled = true;
      inputName.value = p.name; inputBuy.value = p.buy_price;
      inputCash.value = p.cash_price; inputTempo.value = p.tempo_price;
    } else {
      inputIndex.value = ''; inputCode.value = ''; inputCode.disabled = false;
      inputName.value = ''; inputBuy.value = ''; inputCash.value = ''; inputTempo.value = '';
    }
  }

  function closeProductModal() {
    if (prodModal) prodModal.classList.remove('active');
    if (productForm) productForm.reset();
  }

  const btnNewProd = document.getElementById('btn-new-product');
  if (btnNewProd) btnNewProd.onclick = () => openProductModal();

  const btnCloseM = document.getElementById('btn-close-modal');
  if (btnCloseM) btnCloseM.onclick = closeProductModal;

  const btnCancelM = document.getElementById('btn-cancel-modal');
  if (btnCancelM) btnCancelM.onclick = closeProductModal;

  if (productForm) {
    productForm.onsubmit = (e) => {
      e.preventDefault();
      const index = document.getElementById('prod-edit-index').value;
      const code = document.getElementById('prod-code').value.toUpperCase().trim();
      const name = document.getElementById('prod-name').value.trim();
      const buy_price = parseFloat(document.getElementById('prod-buy-price').value);
      const cash_price = parseFloat(document.getElementById('prod-cash-price').value);
      const tempo_price = parseFloat(document.getElementById('prod-tempo-price').value);
      const payload = { code, name, buy_price, cash_price, tempo_price };
      if (index !== '') {
        products[index] = payload;
      } else {
        if (products.find(p => p.code === code)) { alert('Kode produk sudah ada!'); return; }
        products.push(payload);
      }
      saveState();
      closeProductModal();
      renderProductsCatalog();
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VIEW 4: EXCEL UPLOAD (Admin)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function setupExcelDropZone() {
    if (activeRole !== 'admin') return;
    const dropZone = document.getElementById('excel-drop-zone');
    const fileInput = document.getElementById('excel-file-input');
    if (!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));
    dropZone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f); }, false);
    fileInput.onchange = (e) => { const f = e.target.files[0]; if (f) handleExcelFile(f); };
  }

  function handleExcelFile(file) {
    if (!file.name.endsWith('.xlsx')) { alert('Tolong unggah file Excel format .xlsx!'); return; }
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      try {
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheets = workbook.SheetNames;
        document.getElementById('chk-sheet').classList.add('valid');

        let parsedRows = [];
        let skippedRows = 0;
        let skippedDetails = [];

        sheets.forEach(sheetName => {
          const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
          let headerRowIdx = -1;
          for (let r = 0; r < Math.min(rawJson.length, 10); r++) {
            const row = rawJson[r];
            if (row && row.some(cell => cell && cell.toString().toLowerCase().includes('sales'))) {
              headerRowIdx = r; break;
            }
          }
          if (headerRowIdx === -1) return; // Skip sheets without Sales header

          const headers = rawJson[headerRowIdx].map(h => h ? h.toString().toLowerCase() : '');
          const colDate = headers.findIndex(h => h.includes('tanggal'));
          const colCust = headers.findIndex(h => h.includes('customer'));
          const colProd = headers.findIndex(h => h.includes('produk'));
          const colQty = headers.findIndex(h => h.includes('qty'));
          const colPrice = headers.findIndex(h => h.includes('harga'));
          const colNom = headers.findIndex(h => h.includes('nominal'));
          const colPay = headers.findIndex(h => h.includes('pembayaran'));

          if ([colDate, colProd, colQty, colPrice, colNom, colPay].some(i => i === -1)) {
            skippedDetails.push(`Sheet "${sheetName}": Kolom wajib tidak ditemukan`);
            return;
          }

          for (let r = headerRowIdx + 1; r < rawJson.length; r++) {
            const row = rawJson[r];
            if (!row) continue;

            // Improved validation: skip truly empty rows but try to capture partial data
            const hasQty = row[colQty] && parseInt(row[colQty]) > 0;
            const hasProd = row[colProd] && row[colProd].toString().trim() !== '';
            const hasNom = row[colNom] && parseFloat(row[colNom]) > 0;

            if (!hasQty && !hasProd && !hasNom) continue; // Truly empty row

            // Warn about partial data but still try to include
            if (!hasQty || !hasNom) {
              const custName = row[colCust] ? row[colCust].toString().trim() : '?';
              skippedRows++;
              skippedDetails.push(`Sheet "${sheetName}" baris ${r + 1}: Customer "${custName}" - Qty atau Nominal kosong/0`);
              continue; // Skip rows with zero qty or nominal
            }

            let dateVal = row[colDate];
            if (dateVal instanceof Date) {
              // Fix timezone issue: use UTC components
              const y = dateVal.getFullYear();
              const m = String(dateVal.getMonth() + 1).padStart(2, '0');
              const d = String(dateVal.getDate()).padStart(2, '0');
              dateVal = `${y}-${m}-${d}`;
            } else if (typeof dateVal === 'number') {
              // Excel serial date - fixed calculation
              const utcDays = Math.floor(dateVal) - 25569; // days since 1970-01-01
              const utcDate = new Date(utcDays * 86400000);
              const y = utcDate.getUTCFullYear();
              const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
              const d = String(utcDate.getUTCDate()).padStart(2, '0');
              dateVal = `${y}-${m}-${d}`;
            } else {
              dateVal = dateVal ? dateVal.toString().trim() : '';
              // Try to parse various date formats
              if (dateVal && !dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const parsed = new Date(dateVal);
                if (!isNaN(parsed.getTime())) {
                  const y = parsed.getFullYear();
                  const m = String(parsed.getMonth() + 1).padStart(2, '0');
                  const d = String(parsed.getDate()).padStart(2, '0');
                  dateVal = `${y}-${m}-${d}`;
                }
              }
            }

            if (!dateVal) {
              skippedRows++;
              skippedDetails.push(`Sheet "${sheetName}" baris ${r + 1}: Tanggal kosong`);
              continue;
            }

            const prodName = row[colProd] ? row[colProd].toString().trim() : '';
            const paymentVal = row[colPay] ? row[colPay].toString().trim() : 'Tempo';
            parsedRows.push({
              id: crypto.randomUUID(),
              salesman: sheetName.charAt(0).toUpperCase() + sheetName.slice(1).toLowerCase(),
              date: dateVal,
              customer: row[colCust] ? row[colCust].toString().trim() : '-',
              product_name: prodName,
              product_code: cleanProductCode(prodName),
              qty: parseInt(row[colQty] || 0),
              price: parseFloat(row[colPrice] || 0),
              nominal: parseFloat(row[colNom] || 0),
              payment_type: paymentVal.toLowerCase().includes('cash') ? 'Cash' : 'Tempo'
            });
          }
        });

        if (parsedRows.length === 0) {
          let msg = 'Tidak ada data transaksi yang valid ditemukan! Periksa format kolom Excel.';
          if (skippedDetails.length > 0) {
            msg += '\n\nBaris yang dilewati:\n' + skippedDetails.slice(0, 10).join('\n');
            if (skippedDetails.length > 10) msg += `\n...dan ${skippedDetails.length - 10} lainnya.`;
          }
          alert(msg);
          return;
        }

        // Show skipped row warnings
        if (skippedRows > 0) {
          console.warn('Baris dilewati saat upload:', skippedDetails);
        }

        document.getElementById('chk-cols').classList.add('valid');
        pendingUploadData = parsedRows;
        pendingUploadData._skippedRows = skippedRows;
        pendingUploadData._skippedDetails = skippedDetails;
        showExcelUploadPreview();
      } catch (err) {
        console.error(err);
        alert('Gagal membaca file Excel! Detail error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function showExcelUploadPreview() {
    const previewArea = document.getElementById('upload-preview-area');
    const previewTbody = document.getElementById('upload-preview-table-body');
    if (!previewArea || !previewTbody) return;

    previewTbody.innerHTML = '';

    // Show skipped rows warning if any
    const skippedRows = pendingUploadData._skippedRows || 0;
    const skippedDetails = pendingUploadData._skippedDetails || [];
    let titleText = `Pratinjau Data (${pendingUploadData.length.toLocaleString('id-ID')} Transaksi)`;
    if (skippedRows > 0) {
      titleText += ` — ${skippedRows} baris dilewati`;
    }
    document.getElementById('preview-data-title').textContent = titleText;

    // Show skipped rows alert
    const alertEl = document.getElementById('upload-skipped-alert');
    if (alertEl) {
      if (skippedRows > 0) {
        alertEl.style.display = 'flex';
        alertEl.innerHTML = `<i data-lucide="alert-triangle" style="width:16px;height:16px;"></i>
          <div><strong>${skippedRows} baris dilewati</strong> karena data tidak lengkap (Qty/Nominal kosong).
          ${skippedDetails.length > 0 ? '<br><small style="color:var(--text-3);">' + skippedDetails.slice(0, 5).join('<br>') + (skippedDetails.length > 5 ? '<br>...dan lainnya' : '') + '</small>' : ''}
          </div>`;
      } else {
        alertEl.style.display = 'none';
      }
    }

    pendingUploadData.slice(0, 30).forEach(t => {
      const tr = document.createElement('tr');
      const paymentBadge = t.payment_type.toLowerCase();
      tr.innerHTML = `
        <td data-label="Salesman">${t.salesman}</td>
        <td data-label="Tanggal">${t.date}</td>
        <td data-label="Customer">${t.customer}</td>
        <td data-label="Produk"><span class="badge prod">${t.product_code}</span></td>
        <td data-label="QTY">${t.qty}</td>
        <td data-label="Harga Jual">${formatIDR(t.price)}</td>
        <td data-label="Nominal"><b>${formatIDR(t.nominal)}</b></td>
        <td data-label="Pembayaran"><span class="badge ${paymentBadge}">${t.payment_type}</span></td>
      `;
      previewTbody.appendChild(tr);
    });
    if (pendingUploadData.length > 30) {
      const trMore = document.createElement('tr');
      trMore.innerHTML = `<td colspan="8" style="text-align:center;color:var(--text-3);padding:1rem">...dan ${(pendingUploadData.length - 30).toLocaleString('id-ID')} baris lainnya.</td>`;
      previewTbody.appendChild(trMore);
    }
    previewArea.style.display = 'block';
    document.getElementById('excel-drop-zone').style.display = 'none';
    lucide.createIcons();
  }

  // Duplicate detection helper
  function getTxFingerprint(t) {
    return `${(t.salesman || '').toLowerCase()}|${t.date}|${(t.customer || '').toLowerCase()}|${t.product_code}|${t.qty}|${t.nominal}`;
  }

  function cancelExcelUpload() {
    pendingUploadData = null;
    const pa = document.getElementById('upload-preview-area');
    const dz = document.getElementById('excel-drop-zone');
    if (pa) pa.style.display = 'none';
    if (dz) dz.style.display = '';
    const cs = document.getElementById('chk-sheet');
    const cc = document.getElementById('chk-cols');
    if (cs) cs.classList.remove('valid');
    if (cc) cc.classList.remove('valid');
    const fi = document.getElementById('excel-file-input');
    if (fi) fi.value = '';
    const alertEl = document.getElementById('upload-skipped-alert');
    if (alertEl) alertEl.style.display = 'none';
  }

  const btnCancelUpload = document.getElementById('btn-cancel-upload');
  if (btnCancelUpload) btnCancelUpload.onclick = cancelExcelUpload;

  const btnCommitUpload = document.getElementById('btn-commit-upload');
  if (btnCommitUpload) {
    btnCommitUpload.onclick = async () => {
      if (!pendingUploadData || pendingUploadData.length === 0) return;

      // Duplicate detection
      const existingFingerprints = new Set(transactions.map(t => getTxFingerprint(t)));
      const newData = [];
      let duplicateCount = 0;

      pendingUploadData.forEach(t => {
        const fp = getTxFingerprint(t);
        if (existingFingerprints.has(fp)) {
          duplicateCount++;
        } else {
          newData.push(t);
          existingFingerprints.add(fp); // Prevent intra-upload duplicates too
        }
      });

      if (newData.length === 0) {
        alert(`Semua ${duplicateCount} transaksi sudah ada di database (duplikat). Tidak ada data baru yang ditambahkan.`);
        cancelExcelUpload();
        return;
      }

      if (duplicateCount > 0) {
        const proceed = confirm(`Ditemukan ${duplicateCount} data duplikat yang akan dilewati.\n\n${newData.length} transaksi baru akan ditambahkan.\n\nLanjutkan?`);
        if (!proceed) return;
      }

      // Add new data
      transactions = [...transactions, ...newData];

      // Save with progress indicator
      const commitBtn = document.getElementById('btn-commit-upload');
      if (commitBtn) {
        commitBtn.disabled = true;
        commitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Menyimpan...';
      }

      if (navigator.onLine) {
        await saveState();
      } else {
        addToOfflineQueue(newData);
        saveState();
      }

      const skippedRows = pendingUploadData._skippedRows || 0;
      let resultMsg = `✅ Berhasil!\n\n`;
      resultMsg += `• ${newData.length.toLocaleString('id-ID')} transaksi baru ditambahkan\n`;
      if (duplicateCount > 0) resultMsg += `• ${duplicateCount} data duplikat dilewati\n`;
      if (skippedRows > 0) resultMsg += `• ${skippedRows} baris Excel dilewati (data tidak lengkap)\n`;
      if (!navigator.onLine) resultMsg += `\n⚠️ Mode Offline: Data disimpan lokal, akan sync saat online.`;

      alert(resultMsg);

      if (commitBtn) {
        commitBtn.disabled = false;
        commitBtn.innerHTML = '<i data-lucide="save"></i> Simpan Data';
      }

      cancelExcelUpload();
      window.location.hash = '#/sales/seller/Jossy';
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // VIEW 5: MANUAL ADD SALE (Admin)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function setupManualSaleForm() {
    if (activeRole !== 'admin') return;

    const form = document.getElementById('manual-sale-form');
    const inputProduct = document.getElementById('sale-product');
    const inputPayment = document.getElementById('sale-payment');
    const inputQty = document.getElementById('sale-qty');
    const inputDate = document.getElementById('sale-date');
    const inputSalesman = document.getElementById('sale-salesman');
    const inputCust = document.getElementById('sale-customer');

    if (!form) return;

    const today = new Date().toISOString().split('T')[0];
    inputDate.value = today;

    function updateCalc() {
      const prodCode = inputProduct.value;
      const paymentType = inputPayment.value;
      const qty = parseInt(inputQty.value || 0);
      if (!prodCode) {
        document.getElementById('sale-price-display').textContent = 'Rp 0';
        document.getElementById('sale-nominal-display').textContent = 'Rp 0';
        return;
      }
      const p = products.find(x => x.code === prodCode);
      if (!p) return;
      const price = paymentType === 'Cash' ? p.cash_price : p.tempo_price;
      const nominal = qty * price;
      document.getElementById('sale-price-display').textContent = formatIDR(price);
      document.getElementById('sale-nominal-display').textContent = formatIDR(nominal);
    }

    inputProduct.onchange = updateCalc;
    inputPayment.onchange = updateCalc;
    inputQty.oninput = updateCalc;

    form.onsubmit = (e) => {
      e.preventDefault();
      const prodCode = inputProduct.value;
      const p = products.find(x => x.code === prodCode);
      if (!p) return;
      const qty = parseInt(inputQty.value);
      const paymentType = inputPayment.value;
      const price = paymentType === 'Cash' ? p.cash_price : p.tempo_price;

      transactions.unshift({
        id: crypto.randomUUID(),
        salesman: inputSalesman.value,
        date: inputDate.value,
        customer: inputCust.value.trim().toUpperCase(),
        product_name: p.name,
        product_code: prodCode,
        qty, price,
        nominal: qty * price,
        payment_type: paymentType
      });
      saveState();
      alert('Transaksi berhasil disimpan!');
      form.reset();
      inputDate.value = today;
      updateCalc();
      window.location.hash = `#/sales/seller/${inputSalesman.value.toLowerCase()}`;
    };

    document.getElementById('btn-reset-form').onclick = () => {
      setTimeout(() => { inputDate.value = today; updateCalc(); }, 0);
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TX EDIT/DELETE (Admin)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const txModal = document.getElementById('tx-modal');
  const txEditForm = document.getElementById('tx-edit-form');

  function openTxModal(txId) {
    const t = transactions.find(x => x.id === txId);
    if (!t || !txModal) return;

    document.getElementById('tx-edit-id').value = t.id;
    document.getElementById('tx-edit-date').value = t.date;
    document.getElementById('tx-edit-customer').value = t.customer;
    document.getElementById('tx-edit-qty').value = t.qty;
    document.getElementById('tx-edit-salesman').value = t.salesman;
    document.getElementById('tx-edit-payment').value = t.payment_type;
    document.getElementById('tx-edit-nominal').value = t.nominal;

    const prodSelect = document.getElementById('tx-edit-product');
    prodSelect.innerHTML = '<option value="" disabled>Pilih Produk</option>';
    products.forEach(p => {
      prodSelect.innerHTML += `<option value="${p.code}" ${p.code === t.product_code ? 'selected' : ''}>${p.code} - ${p.name}</option>`;
    });

    // Auto-calc logic
    function autoCalcNominal() {
      const prodCode = prodSelect.value;
      const p = products.find(x => x.code === prodCode);
      if (!p) return;
      const qty = parseInt(document.getElementById('tx-edit-qty').value) || 0;
      const paymentType = document.getElementById('tx-edit-payment').value;
      const price = paymentType === 'Cash' ? p.cash_price : p.tempo_price;
      document.getElementById('tx-edit-nominal').value = qty * price;
    }

    prodSelect.onchange = autoCalcNominal;
    document.getElementById('tx-edit-qty').oninput = autoCalcNominal;
    document.getElementById('tx-edit-payment').onchange = autoCalcNominal;

    txModal.classList.add('active');
  }

  function closeTxModal() {
    if (txModal) txModal.classList.remove('active');
  }

  const btnCloseTxModal = document.getElementById('btn-close-tx-modal');
  const btnCancelTxModal = document.getElementById('btn-cancel-tx-modal');
  if (btnCloseTxModal) btnCloseTxModal.onclick = closeTxModal;
  if (btnCancelTxModal) btnCancelTxModal.onclick = closeTxModal;

  if (txEditForm) {
    txEditForm.onsubmit = (e) => {
      e.preventDefault();
      const id = document.getElementById('tx-edit-id').value;
      const t = transactions.find(x => x.id === id);
      if (!t) return;

      const prodCode = document.getElementById('tx-edit-product').value;
      const p = products.find(x => x.code === prodCode);
      const qty = parseInt(document.getElementById('tx-edit-qty').value);
      const paymentType = document.getElementById('tx-edit-payment').value;
      const price = paymentType === 'Cash' ? p.cash_price : p.tempo_price;
      const nominal = parseFloat(document.getElementById('tx-edit-nominal').value);

      t.date = document.getElementById('tx-edit-date').value;
      t.customer = document.getElementById('tx-edit-customer').value.toUpperCase();
      t.product_code = prodCode;
      t.product_name = p.name;
      t.qty = qty;
      t.payment_type = paymentType;
      t.salesman = document.getElementById('tx-edit-salesman').value;
      t.price = price;
      t.nominal = nominal;

      saveState();
      closeTxModal();
      renderSellerDetail();
      alert('Transaksi berhasil diupdate!');
    };
  }

  document.addEventListener('click', (e) => {
    if (activeRole !== 'admin') return;
    const btnEdit = e.target.closest('.btn-edit-tx');
    if (btnEdit) {
      openTxModal(btnEdit.getAttribute('data-id'));
    }
    const btnDel = e.target.closest('.btn-del-tx');
    if (btnDel) {
      const txId = btnDel.getAttribute('data-id');
      if (confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) {
        transactions = transactions.filter(t => t.id !== txId);
        saveState();
        renderSellerDetail();
      }
    }
  });


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: INFO REKENING (Manual Input)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderInfoRekening() {
    const container = document.getElementById('bank-cards-container');
    if (!container) return;
    container.innerHTML = '';

    bankAccounts.forEach((ba, idx) => {
      const card = document.createElement('div');
      card.className = 'bank-card';
      card.innerHTML = `
        <div class="bank-card-header">
          <div class="bank-logo-text">${ba.bank}</div>
          <div class="bank-card-chip"></div>
        </div>
        <div class="bank-card-no">${ba.number}</div>
        <div>
          <div class="bank-card-holder-label">Atas Nama</div>
          <div class="bank-card-holder">${ba.holder}</div>
        </div>
        <div class="admin-only no-print" style="position: absolute; top: 1rem; right: 1rem; display: ${activeRole === 'admin' ? '' : 'none'};">
          <button class="btn btn-ghost btn-edit-bank-item" data-index="${idx}" style="color: #fff; padding: 2px;"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
          <button class="btn btn-ghost btn-del-bank-item" data-index="${idx}" style="color: var(--red); padding: 2px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </div>
      `;
      container.appendChild(card);
    });

    lucide.createIcons();
    setupBankEditingHandlers();
  }

  function setupBankEditingHandlers() {
    const editBankBtn = document.getElementById('btn-edit-bank');
    if (editBankBtn) {
      editBankBtn.onclick = () => openBankModal();
    }

    // Grid item edits
    document.querySelectorAll('.btn-edit-bank-item').forEach(btn => {
      btn.onclick = () => {
        const idx = btn.getAttribute('data-index');
        openBankModal(idx);
      };
    });

    // Grid item deletes
    document.querySelectorAll('.btn-del-bank-item').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        if (confirm('Hapus rekening ini?')) {
          bankAccounts.splice(idx, 1);
          saveState();
          renderInfoRekening();
        }
      };
    });
  }

  // Bank Account Modal bindings
  const bankModal = document.getElementById('bank-modal');
  const bankForm = document.getElementById('bank-form');
  let currentEditingBankIdx = null;

  function openBankModal(index = null) {
    if (!bankModal) return;
    bankModal.classList.add('active');

    const bankNameInput = document.getElementById('bank-name-input');
    const bankNumberInput = document.getElementById('bank-number-input');
    const bankHolderInput = document.getElementById('bank-holder-input');

    if (index !== null) {
      currentEditingBankIdx = parseInt(index);
      const ba = bankAccounts[currentEditingBankIdx];
      bankNameInput.value = ba.bank;
      bankNumberInput.value = ba.number;
      bankHolderInput.value = ba.holder;
    } else {
      currentEditingBankIdx = null;
      bankNameInput.value = '';
      bankNumberInput.value = '';
      bankHolderInput.value = '';
    }
  }

  function closeBankModal() {
    if (bankModal) bankModal.classList.remove('active');
  }

  const btnCloseBankM = document.getElementById('btn-close-bank-modal');
  if (btnCloseM || btnCloseBankM) {
    const targetClose = btnCloseBankM || btnCloseM;
    targetClose.onclick = closeBankModal;
  }
  const btnCancelBankM = document.getElementById('btn-cancel-bank-modal');
  if (btnCancelBankM) btnCancelBankM.onclick = closeBankModal;

  if (bankForm) {
    bankForm.onsubmit = (e) => {
      e.preventDefault();
      const bank = document.getElementById('bank-name-input').value.toUpperCase().trim();
      const number = document.getElementById('bank-number-input').value.trim();
      const holder = document.getElementById('bank-holder-input').value.toUpperCase().trim();

      if (currentEditingBankIdx !== null) {
        bankAccounts[currentEditingBankIdx] = { bank, number, holder };
      } else {
        bankAccounts.push({ bank, number, holder });
      }

      saveState();
      closeBankModal();
      renderInfoRekening();
      alert('Info rekening berhasil disimpan!');
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: TAGIHAN SUPPLIER (Manual Input)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderTagihanSupplier() {
    const tbody = document.getElementById('supplier-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (supplierBills.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:1.5rem">Tidak ada tagihan supplier terdaftar.</td></tr>';
      return;
    }

    supplierBills.forEach((sb, idx) => {
      const tr = document.createElement('tr');
      const statusBadgeClass = sb.status === 'Paid' ? 'status-paid' : 'status-unpaid';
      const statusLabel = sb.status === 'Paid' ? 'LUNAS' : 'BELUM LUNAS';

      tr.innerHTML = `
        <td data-label="Supplier"><b>${sb.supplier}</b></td>
        <td data-label="Tanggal Invoice">${new Date(sb.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td data-label="Jatuh Tempo">${new Date(sb.due).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td data-label="Nominal" style="font-weight: 700; color: var(--accent);">${formatIDR(sb.amount)}</td>
        <td data-label="Status"><span class="badge ${statusBadgeClass}">${statusLabel}</span></td>
        <td data-label="Aksi" class="admin-only" style="text-align: center; display: ${activeRole === 'admin' ? '' : 'none'};">
          <button class="btn-ghost btn-edit-supplier" data-index="${idx}" title="Edit"><i data-lucide="edit-2"></i></button>
          <button class="btn-ghost btn-del-supplier" data-index="${idx}" style="color:var(--red);" title="Hapus"><i data-lucide="trash-2"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
    setupSupplierEventHandlers();
  }

  function setupSupplierEventHandlers() {
    const btnNewTagihan = document.getElementById('btn-new-tagihan');
    if (btnNewTagihan) {
      btnNewTagihan.onclick = () => openSupplierModal();
    }

    document.querySelectorAll('.btn-edit-supplier').forEach(btn => {
      btn.onclick = () => {
        openSupplierModal(btn.getAttribute('data-index'));
      };
    });

    document.querySelectorAll('.btn-del-supplier').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        if (confirm('Apakah Anda yakin ingin menghapus tagihan supplier ini?')) {
          supplierBills.splice(idx, 1);
          saveState();
          renderTagihanSupplier();
        }
      };
    });
  }

  // Supplier modal bindings
  const supplierModal = document.getElementById('supplier-modal');
  const supplierForm = document.getElementById('supplier-form');

  function openSupplierModal(index = null) {
    if (!supplierModal) return;
    supplierModal.classList.add('active');

    const inputIdx = document.getElementById('supplier-edit-index');
    const inputName = document.getElementById('supplier-name-input');
    const inputDate = document.getElementById('supplier-date-input');
    const inputDue = document.getElementById('supplier-due-input');
    const inputAmount = document.getElementById('supplier-amount-input');
    const inputStatus = document.getElementById('supplier-status-input');

    document.getElementById('supplier-modal-title').textContent =
      index !== null ? 'Edit Tagihan Supplier' : 'Tambah Tagihan Supplier';

    if (index !== null) {
      const sb = supplierBills[index];
      inputIdx.value = index;
      inputName.value = sb.supplier;
      inputDate.value = sb.date;
      inputDue.value = sb.due;
      inputAmount.value = sb.amount;
      inputStatus.value = sb.status;
    } else {
      inputIdx.value = '';
      inputName.value = '';
      inputDate.value = new Date().toISOString().split('T')[0];
      inputDue.value = new Date().toISOString().split('T')[0];
      inputAmount.value = '';
      inputStatus.value = 'Unpaid';
    }
  }

  function closeSupplierModal() {
    if (supplierModal) supplierModal.classList.remove('active');
  }

  const btnCloseSupplierM = document.getElementById('btn-close-supplier-modal');
  if (btnCloseSupplierM) btnCloseSupplierM.onclick = closeSupplierModal;
  const btnCancelSupplierM = document.getElementById('btn-cancel-supplier-modal');
  if (btnCancelSupplierM) btnCancelSupplierM.onclick = closeSupplierModal;

  if (supplierForm) {
    supplierForm.onsubmit = (e) => {
      e.preventDefault();
      const index = document.getElementById('supplier-edit-index').value;
      const supplier = document.getElementById('supplier-name-input').value.toUpperCase().trim();
      const date = document.getElementById('supplier-date-input').value;
      const due = document.getElementById('supplier-due-input').value;
      const amount = parseFloat(document.getElementById('supplier-amount-input').value);
      const status = document.getElementById('supplier-status-input').value;

      const payload = { supplier, date, due, amount, status };

      if (index !== '') {
        payload.id = supplierBills[index].id; // preserve existing ID for Supabase update
        supplierBills[index] = payload;
      } else {
        payload.id = crypto.randomUUID();
        supplierBills.unshift(payload);
      }

      saveState();
      closeSupplierModal();
      renderTagihanSupplier();
      alert('Data tagihan supplier disimpan!');
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: HARGA PRODUK (Manual Input)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderHargaProdukCatalog() {
    const container = document.getElementById('product-price-container');
    if (!container) return;
    container.innerHTML = '';

    products.forEach(p => {
      const card = document.createElement('div');
      card.className = 'price-catalog-card';
      card.innerHTML = `
        <span class="pcc-code-tag">${p.code}</span>
        <div class="pcc-name">${p.name}</div>
        <div class="pcc-price-row">
          <div class="pcc-price-col">
            <span>Harga Cash</span>
            <strong class="accent">${formatIDR(p.cash_price)}</strong>
          </div>
          <div class="pcc-price-col" style="text-align: right;">
            <span>Harga Tempo</span>
            <strong class="amber">${formatIDR(p.tempo_price)}</strong>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: STOK GUDANG (Manual Input)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderStokGudang() {
    const container = document.getElementById('stok-metrics-container');
    if (!container) return;
    container.innerHTML = '';

    products.forEach(p => {
      const currentStock = stockData[p.code] || 0;
      const isLowStock = currentStock < 50;
      const lowStockTag = isLowStock ? '<span class="stok-mc-label" style="background: var(--red-light); color: var(--red);">STOK MENIPIS</span>' : '<span class="stok-mc-label">STOK AMAN</span>';

      const card = document.createElement('div');
      card.className = 'stok-metric-card';
      card.innerHTML = `
        <div class="stok-mc-info">
          ${lowStockTag}
          <div class="stok-mc-name">${p.name}</div>
        </div>
        <div class="stok-mc-val">
          ${currentStock.toLocaleString('id-ID')}
          <span class="stok-mc-unit">krat</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // Stok Modal bindings (Admin only)
  const stokModal = document.getElementById('stok-modal');
  const stokForm = document.getElementById('stok-form');
  const btnAddStokModal = document.getElementById('btn-add-stok-modal');

  if (btnAddStokModal) {
    btnAddStokModal.onclick = () => {
      if (stokModal) stokModal.classList.add('active');
      const stokProdSel = document.getElementById('stok-product-input');
      if (stokProdSel) {
        stokProdSel.innerHTML = '';
        products.forEach(p => {
          stokProdSel.innerHTML += `<option value="${p.code}">${p.code} - ${p.name}</option>`;
        });
      }
    };
  }

  function closeStokModal() {
    if (stokModal) stokModal.classList.remove('active');
  }

  const btnCloseStokM = document.getElementById('btn-close-stok-modal');
  if (btnCloseStokM) btnCloseStokM.onclick = closeStokModal;
  const btnCancelStokM = document.getElementById('btn-cancel-stok-modal');
  if (btnCancelStokM) btnCancelStokM.onclick = closeStokModal;

  if (stokForm) {
    stokForm.onsubmit = (e) => {
      e.preventDefault();
      const code = document.getElementById('stok-product-input').value;
      const qty = parseInt(document.getElementById('stok-qty-input').value);

      stockData[code] = (stockData[code] || 0) + qty;
      saveState();
      closeStokModal();
      renderStokGudang();
      alert(`Stok ${code} berhasil ditambahkan sebanyak ${qty} krat!`);
      if (stokForm) stokForm.reset();
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: LAPORAN HARI INI
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderLaporanHariIni() {
    const today = new Date().toISOString().split('T')[0];

    // Update subtitle date description
    const formattedToday = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const subtitle = document.getElementById('hari-ini-subtitle');
    if (subtitle) subtitle.textContent = `Laporan transaksi per tanggal ${formattedToday}`;

    const todayTbody = document.getElementById('today-table-body');
    if (!todayTbody) return;

    // Get all transactions for today
    const todayTx = transactions.filter(t => t.date === today);

    // Always calculate totals from ALL today's data (unfiltered) for metric cards
    let totalVolume = 0, totalSalesVal = 0, cashIncomingVal = 0, tempoIncomingVal = 0;
    todayTx.forEach(t => {
      totalVolume += t.qty;
      totalSalesVal += t.nominal;
      if (t.payment_type === 'Cash') cashIncomingVal += t.nominal;
      else tempoIncomingVal += t.nominal;
    });

    document.getElementById('today-val-sales').textContent = formatIDR(totalSalesVal);
    document.getElementById('today-qty-sales').textContent = totalVolume.toLocaleString('id-ID');
    document.getElementById('today-val-cash').textContent = formatIDR(cashIncomingVal);
    document.getElementById('today-val-tempo').textContent = formatIDR(tempoIncomingVal);

    // Populate salesman filter options dynamically
    const salesmanFilter = document.getElementById('today-filter-salesman');
    if (salesmanFilter) {
      const prevVal = salesmanFilter.value;
      salesmanFilter.innerHTML = '<option value="ALL">Semua Salesman</option>';
      const activeSalesmen = salesmen.filter(s => s.status && s.status.trim().toLowerCase() === 'active');
      activeSalesmen.forEach(s => {
        salesmanFilter.innerHTML += `<option value="${s.name}">${s.name}</option>`;
      });
      if (prevVal) salesmanFilter.value = prevVal;
    }

    // Apply filters
    function applyTodayFilters() {
      const searchVal = (document.getElementById('today-filter-search')?.value || '').toLowerCase().trim();
      const salesmanVal = document.getElementById('today-filter-salesman')?.value || 'ALL';
      const productVal = document.getElementById('today-filter-product')?.value || 'ALL';
      const paymentVal = document.getElementById('today-filter-payment')?.value || 'ALL';

      const filtered = todayTx.filter(t => {
        if (searchVal && !t.customer.toLowerCase().includes(searchVal) && !t.salesman.toLowerCase().includes(searchVal)) return false;
        if (salesmanVal !== 'ALL' && t.salesman !== salesmanVal) return false;
        if (productVal !== 'ALL' && t.product_code !== productVal) return false;
        if (paymentVal !== 'ALL' && t.payment_type !== paymentVal) return false;
        return true;
      });

      // Update filtered summary
      const filteredSummary = document.getElementById('today-filtered-summary');
      if (filteredSummary) {
        const isFiltered = searchVal || salesmanVal !== 'ALL' || productVal !== 'ALL' || paymentVal !== 'ALL';
        if (isFiltered) {
          let filteredTotal = 0;
          filtered.forEach(t => filteredTotal += t.nominal);
          filteredSummary.style.display = 'flex';
          filteredSummary.innerHTML = `<i data-lucide="filter" style="width:14px;height:14px;"></i> Menampilkan ${filtered.length} dari ${todayTx.length} transaksi (Total filter: <strong>${formatIDR(filteredTotal)}</strong>)`;
          lucide.createIcons();
        } else {
          filteredSummary.style.display = 'none';
        }
      }

      todayTbody.innerHTML = '';

      if (filtered.length === 0) {
        todayTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Tidak ada transaksi yang sesuai filter.</td></tr>';
        return;
      }

      filtered.forEach(t => {
        const tr = document.createElement('tr');
        const badgeClass = t.payment_type.toLowerCase();
        tr.innerHTML = `
          <td data-label="Salesman"><b>${t.salesman}</b></td>
          <td data-label="Customer">${t.customer}</td>
          <td data-label="Produk"><span class="badge prod">${t.product_code}</span></td>
          <td data-label="Qty">${t.qty}</td>
          <td data-label="Harga">${formatIDR(t.price)}</td>
          <td data-label="Nominal" style="font-weight: 600; color: var(--accent);">${formatIDR(t.nominal)}</td>
          <td data-label="Pembayaran"><span class="badge ${badgeClass}">${t.payment_type}</span></td>
        `;
        todayTbody.appendChild(tr);
      });
    }

    // Wire up filter events
    const todaySearch = document.getElementById('today-filter-search');
    const todaySalesman = document.getElementById('today-filter-salesman');
    const todayProduct = document.getElementById('today-filter-product');
    const todayPayment = document.getElementById('today-filter-payment');
    const todayReset = document.getElementById('today-btn-reset-filter');

    if (todaySearch) todaySearch.oninput = applyTodayFilters;
    if (todaySalesman) todaySalesman.onchange = applyTodayFilters;
    if (todayProduct) todayProduct.onchange = applyTodayFilters;
    if (todayPayment) todayPayment.onchange = applyTodayFilters;
    if (todayReset) todayReset.onclick = () => {
      if (todaySearch) todaySearch.value = '';
      if (todaySalesman) todaySalesman.value = 'ALL';
      if (todayProduct) todayProduct.value = 'ALL';
      if (todayPayment) todayPayment.value = 'ALL';
      applyTodayFilters();
    };

    // Initial render
    applyTodayFilters();

    if (todayTx.length === 0) {
      todayTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Tidak ada transaksi tercatat untuk hari ini.</td></tr>';
    }
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: KELOLA SALESMAN (Admin Only)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderKelolaSalesman() {
    if (activeRole !== 'admin') return;

    const tbody = document.getElementById('salesman-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    salesmen.forEach((s, idx) => {
      const tr = document.createElement('tr');
      const statusBadge = s.status === 'Active' ? 'badge green' : 'badge';
      const statusLabel = s.status === 'Active' ? 'AKTIF' : 'KELUAR';

      tr.innerHTML = `
        <td data-label="Nama Salesman"><b>${s.name}</b></td>
        <td data-label="No WhatsApp">${s.phone}</td>
        <td data-label="Status"><span class="${statusBadge}">${statusLabel}</span></td>
        <td data-label="Aksi" class="admin-only" style="text-align: center;">
          <button class="btn-ghost btn-edit-salesman" data-index="${idx}" title="Edit"><i data-lucide="edit-2"></i></button>
          <button class="btn-ghost btn-del-salesman" data-index="${idx}" style="color:var(--red);" title="Hapus"><i data-lucide="trash-2"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
    setupSalesmenEventHandlers();
  }

  function setupSalesmenEventHandlers() {
    const btnNewSalesman = document.getElementById('btn-new-salesman');
    if (btnNewSalesman) {
      btnNewSalesman.onclick = () => openSalesmanModal();
    }

    document.querySelectorAll('.btn-edit-salesman').forEach(btn => {
      btn.onclick = () => {
        openSalesmanModal(btn.getAttribute('data-index'));
      };
    });

    document.querySelectorAll('.btn-del-salesman').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        if (confirm('Hapus salesman ini? Catatan transaksi historis akan tetap dipertahankan, namun nama akan hilang dari menu input.')) {
          salesmen.splice(idx, 1);
          saveState();
          populateSalesmenSelectors();
          renderKelolaSalesman();
        }
      };
    });
  }

  // Salesman modal triggers
  const salesmanModal = document.getElementById('salesman-modal');
  const salesmanForm = document.getElementById('salesman-form');

  function openSalesmanModal(index = null) {
    if (!salesmanModal) return;
    salesmanModal.classList.add('active');

    const inputIdx = document.getElementById('salesman-edit-index');
    const inputName = document.getElementById('salesman-name-input');
    const inputPhone = document.getElementById('salesman-phone-input');
    const inputStatus = document.getElementById('salesman-status-input');

    document.getElementById('salesman-modal-title').textContent =
      index !== null ? 'Edit Salesman' : 'Tambah Salesman Baru';

    if (index !== null) {
      const s = salesmen[index];
      inputIdx.value = index;
      inputName.value = s.name;
      inputPhone.value = s.phone;
      inputStatus.value = s.status;
    } else {
      inputIdx.value = '';
      inputName.value = '';
      inputPhone.value = '';
      inputStatus.value = 'Active';
    }
  }

  function closeSalesmanModal() {
    if (salesmanModal) salesmanModal.classList.remove('active');
  }

  const btnCloseSalesmanM = document.getElementById('btn-close-salesman-modal');
  if (btnCloseSalesmanM) btnCloseSalesmanM.onclick = closeSalesmanModal;
  const btnCancelSalesmanM = document.getElementById('btn-cancel-salesman-modal');
  if (btnCancelSalesmanM) btnCancelSalesmanM.onclick = closeSalesmanModal;

  if (salesmanForm) {
    salesmanForm.onsubmit = (e) => {
      e.preventDefault();
      const index = document.getElementById('salesman-edit-index').value;
      const name = document.getElementById('salesman-name-input').value.trim();
      let phone = document.getElementById('salesman-phone-input').value.trim();
      const status = document.getElementById('salesman-status-input').value;

      // Clean WhatsApp format
      if (phone.startsWith('0')) {
        phone = '62' + phone.substring(1);
      } else if (phone.startsWith('+')) {
        phone = phone.replace('+', '');
      }

      const payload = { name, phone, status };

      if (index !== '') {
        payload.id = salesmen[index].id; // preserve existing ID for Supabase update
        salesmen[index] = payload;
      } else {
        if (salesmen.find(s => s.name.toLowerCase() === name.toLowerCase())) {
          alert('Nama salesman ini sudah terdaftar!');
          return;
        }
        payload.id = crypto.randomUUID();
        salesmen.push(payload);
      }

      saveState();
      closeSalesmanModal();
      populateSalesmenSelectors();
      renderKelolaSalesman();
      alert('Data salesman berhasil disimpan!');
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: SALES ORDER SYSTEM
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function renderSalesOrderModule() {
    renderOrderCatalog();
    renderShoppingCart();
    renderOrdersListInflow();
  }

  // Stepper quantity selector Catalog
  function renderOrderCatalog() {
    const catalogContainer = document.getElementById('order-product-catalog');
    if (!catalogContainer) return;
    catalogContainer.innerHTML = '';

    products.forEach(p => {
      const currentCartQty = activeCart[p.code] || 0;
      const currentStock = stockData[p.code] || 0;
      const isLowStock = currentStock <= 10;
      const lowStockClass = isLowStock ? 'opc-stock-tag low' : 'opc-stock-tag';

      const card = document.createElement('div');
      card.className = 'order-product-card';
      card.innerHTML = `
        <div class="${lowStockClass}">Stok: ${currentStock}</div>
        <div class="opc-code">${p.code}</div>
        <div class="opc-name">${p.name}</div>
        <div class="opc-prices">
          <div class="opc-price-line"><span>Cash:</span><strong>${formatIDR(p.cash_price)}</strong></div>
          <div class="opc-price-line"><span>Tempo:</span><strong>${formatIDR(p.tempo_price)}</strong></div>
        </div>
        <div class="opc-qty-stepper">
          <button class="stepper-btn btn-stepper-minus" data-code="${p.code}"><i data-lucide="minus" style="width:12px;height:12px;"></i></button>
          <span class="stepper-val" id="stepper-val-${p.code}">${currentCartQty}</span>
          <button class="stepper-btn btn-stepper-plus" data-code="${p.code}"><i data-lucide="plus" style="width:12px;height:12px;"></i></button>
        </div>
      `;
      catalogContainer.appendChild(card);
    });

    lucide.createIcons();
    setupOrderStepperClickHandlers();
  }

  function setupOrderStepperClickHandlers() {
    document.querySelectorAll('.btn-stepper-plus').forEach(btn => {
      btn.onclick = () => {
        const code = btn.getAttribute('data-code');
        const currentStock = stockData[code] || 0;
        const currentCartQty = activeCart[code] || 0;

        if (currentCartQty + 1 > currentStock) {
          alert('Stok gudang tidak mencukupi untuk jumlah ini!');
          return;
        }

        activeCart[code] = currentCartQty + 1;
        document.getElementById(`stepper-val-${code}`).textContent = activeCart[code];
        renderShoppingCart();
      };
    });

    document.querySelectorAll('.btn-stepper-minus').forEach(btn => {
      btn.onclick = () => {
        const code = btn.getAttribute('data-code');
        const currentCartQty = activeCart[code] || 0;

        if (currentCartQty > 0) {
          activeCart[code] = currentCartQty - 1;
          if (activeCart[code] === 0) delete activeCart[code];
          document.getElementById(`stepper-val-${code}`).textContent = activeCart[code] || 0;
          renderShoppingCart();
        }
      };
    });
  }

  // Renders the shopping cart
  function renderShoppingCart() {
    const container = document.getElementById('cart-items-container');
    const paymentSelect = document.getElementById('order-payment-type');
    const isTempo = paymentSelect ? paymentSelect.value === 'Tempo' : false;

    if (!container) return;
    container.innerHTML = '';

    const selectedCodes = Object.keys(activeCart);

    if (selectedCodes.length === 0) {
      container.innerHTML = '<div class="empty-cart-text">Belum ada produk dipilih</div>';
      document.getElementById('cart-total-qty').textContent = '0 krat';
      document.getElementById('cart-total-rp').textContent = 'Rp 0';
      return;
    }

    let totalVolume = 0;
    let totalNominal = 0;

    selectedCodes.forEach(code => {
      const p = products.find(x => x.code === code);
      if (!p) return;

      const qty = activeCart[code];
      const price = isTempo ? p.tempo_price : p.cash_price;
      const subtotal = qty * price;

      totalVolume += qty;
      totalNominal += subtotal;

      const item = document.createElement('div');
      item.className = 'cart-item-row';
      item.innerHTML = `
        <div class="cart-item-info">
          <span class="cart-item-name">${p.code} (${qty} krat)</span>
          <span class="cart-item-price-desc">${qty} x ${formatIDR(price)}</span>
        </div>
        <span class="cart-item-total">${formatIDR(subtotal)}</span>
      `;
      container.appendChild(item);
    });

    document.getElementById('cart-total-qty').textContent = `${totalVolume} krat`;
    document.getElementById('cart-total-rp').textContent = formatIDR(totalNominal);
  }

  const orderPaymentSelect = document.getElementById('order-payment-type');
  if (orderPaymentSelect) {
    orderPaymentSelect.onchange = renderShoppingCart;
  }

  // Reset Shopping Cart
  const btnClearCart = document.getElementById('btn-clear-cart');
  if (btnClearCart) {
    btnClearCart.onclick = () => {
      activeCart = {};
      renderOrderCatalog();
      renderShoppingCart();
    };
  }

  // Checkout order form submit + WA send
  const orderCheckoutForm = document.getElementById('order-checkout-form');
  if (orderCheckoutForm) {
    orderCheckoutForm.onsubmit = (e) => {
      e.preventDefault();

      const selectedCodes = Object.keys(activeCart);
      if (selectedCodes.length === 0) {
        alert('Tolong pilih produk terlebih dahulu!');
        return;
      }

      const salesmanName = document.getElementById('order-salesman').value;
      const shopName = document.getElementById('order-shop-name').value.trim().toUpperCase();
      const shopAddress = document.getElementById('order-shop-address').value.trim();
      const shopPhone = document.getElementById('order-shop-phone').value.trim();
      const paymentType = document.getElementById('order-payment-type').value;

      const sObj = salesmen.find(x => x.name.toLowerCase() === salesmanName.toLowerCase());
      const sellerPhone = sObj ? sObj.phone : '628123456789';

      const items = [];
      let totalVolume = 0;
      let totalNominal = 0;

      selectedCodes.forEach(code => {
        const p = products.find(x => x.code === code);
        const qty = activeCart[code];
        const price = paymentType === 'Tempo' ? p.tempo_price : p.cash_price;
        const nominal = qty * price;

        totalVolume += qty;
        totalNominal += nominal;

        items.push({
          product_code: code,
          product_name: p.name,
          qty,
          price,
          nominal
        });
      });

      const newOrder = {
        id: crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        salesman: salesmanName,
        customer: shopName,
        customer_address: shopAddress,
        customer_phone: shopPhone,
        payment_type: paymentType,
        items,
        total_qty: totalVolume,
        total_nominal: totalNominal,
        status: 'Pending' // Pending -> Confirmed -> Shipped
      };

      salesOrders.unshift(newOrder);
      saveState();

      // BUILD WHATSAPP FORMATTED MESSAGE LINK
      let waMessage = `*GAJAH MAS SALES ORDER*\n`;
      waMessage += `=========================\n`;
      waMessage += `*Sales:* ${salesmanName}\n`;
      waMessage += `*Toko:* ${shopName}\n`;
      waMessage += `*Alamat:* ${shopAddress}\n`;
      waMessage += `*No HP:* ${shopPhone}\n`;
      waMessage += `*Metode Bayar:* ${paymentType}\n`;
      waMessage += `-------------------------\n`;
      items.forEach(item => {
        waMessage += `- ${item.product_code} (${item.qty} krat) x ${formatIDR(item.price)} = ${formatIDR(item.nominal)}\n`;
      });
      waMessage += `-------------------------\n`;
      waMessage += `*TOTAL VOLUME:* ${totalVolume} krat\n`;
      waMessage += `*TOTAL BAYAR:* ${formatIDR(totalNominal)}\n`;
      waMessage += `=========================\n`;
      waMessage += `Order tersimpan lokal di HP. Mohon admin memeriksa faktur komputer.`;

      // Open WhatsApp API
      const waUrl = `https://api.whatsapp.com/send?phone=${sellerPhone}&text=${encodeURIComponent(waMessage)}`;
      window.open(waUrl, '_blank');

      alert('Order berhasil dibuat dan disimpan! Membuka WhatsApp untuk kirim order ke admin...');

      // Reset
      activeCart = {};
      orderCheckoutForm.reset();
      renderSalesOrderModule();
    };
  }

  // Renders the WA order inflow registry
  function renderOrdersListInflow() {
    const tbody = document.getElementById('orders-list-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (salesOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:1.5rem">Belum ada order masuk tercatat.</td></tr>';
      return;
    }

    salesOrders.forEach(o => {
      const tr = document.createElement('tr');

      let statusBadgeClass = 'status-pending';
      let statusLabel = 'ORDER MASUK';
      if (o.status === 'Confirmed') {
        statusBadgeClass = 'status-confirmed';
        statusLabel = 'FAKTUR KONFIRMASI';
      } else if (o.status === 'Shipped') {
        statusBadgeClass = 'status-shipped';
        statusLabel = 'BARANG KELUAR';
      }

      tr.innerHTML = `
        <td data-label="Tanggal Order">${new Date(o.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td data-label="Salesman"><b>${o.salesman}</b></td>
        <td data-label="Nama Toko">${o.customer}</td>
        <td data-label="Total Item">${o.total_qty} krat</td>
        <td data-label="Total Nominal" style="font-weight: 700; color: var(--accent);">${formatIDR(o.total_nominal)}</td>
        <td data-label="Status Alur"><span class="badge ${statusBadgeClass}">${statusLabel}</span></td>
        <td data-label="Aksi" style="text-align: center;">
          <button class="btn btn-secondary btn-order-detail" data-id="${o.id}" style="padding: 0.25rem 0.5rem; min-height: 24px; font-size: .65rem;"><i data-lucide="eye" style="width:12px;height:12px;"></i> Detail</button>
          <button class="btn btn-ghost btn-order-delete admin-only" data-id="${o.id}" style="color: var(--red); padding: 2px; display: ${activeRole === 'admin' ? '' : 'none'};"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
    setupOrderInflowClickHandlers();
  }

  function setupOrderInflowClickHandlers() {
    document.querySelectorAll('.btn-order-detail').forEach(btn => {
      btn.onclick = () => {
        openOrderDetailModal(btn.getAttribute('data-id'));
      };
    });

    document.querySelectorAll('.btn-order-delete').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Hapus rekap data order ini?')) {
          salesOrders = salesOrders.filter(x => x.id !== id);
          saveState();
          renderOrdersListInflow();
        }
      };
    });
  }

  // Invoice modal print bindings
  const orderDetailModal = document.getElementById('order-detail-modal');
  let currentViewingOrderId = null;

  function openOrderDetailModal(orderId) {
    const o = salesOrders.find(x => x.id === orderId);
    if (!o || !orderDetailModal) return;

    currentViewingOrderId = orderId;
    orderDetailModal.classList.add('active');

    document.getElementById('inv-id').textContent = o.id;
    document.getElementById('inv-date').textContent = o.date;
    document.getElementById('inv-sales-name').textContent = o.salesman;
    document.getElementById('inv-shop-name').textContent = o.customer;
    document.getElementById('inv-shop-address').textContent = o.customer_address;
    document.getElementById('inv-shop-phone').textContent = o.customer_phone;

    const itemsTbody = document.getElementById('invoice-items-body');
    itemsTbody.innerHTML = '';

    o.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.product_code} - ${item.product_name}</td>
        <td style="text-align: center;">${item.qty}</td>
        <td style="text-align: right;">${formatIDR(item.price)}</td>
        <td style="text-align: right;"><strong>${formatIDR(item.nominal)}</strong></td>
      `;
      itemsTbody.appendChild(tr);
    });

    document.getElementById('inv-total-qty').textContent = `${o.total_qty} krat`;
    document.getElementById('inv-pay-type').textContent = o.payment_type;
    document.getElementById('inv-total-rp').textContent = formatIDR(o.total_nominal);

    // Apply Admin ship processing visibility button
    const shipBtn = document.getElementById('btn-confirm-barang-keluar');
    if (shipBtn) {
      if (activeRole === 'admin' && o.status !== 'Shipped') {
        shipBtn.style.display = '';
      } else {
        shipBtn.style.display = 'none';
      }
    }
  }

  function closeOrderDetailModal() {
    if (orderDetailModal) orderDetailModal.classList.remove('active');
  }

  const btnCloseOrderM = document.getElementById('btn-close-order-detail-modal');
  if (btnCloseOrderM) btnCloseOrderM.onclick = closeOrderDetailModal;
  const btnCancelOrderM = document.getElementById('btn-cancel-order-detail-modal');
  if (btnCancelOrderM) btnCancelOrderM.onclick = closeOrderDetailModal;

  // Print invoice faktur
  const btnPrintFaktur = document.getElementById('btn-print-order-faktur');
  if (btnPrintFaktur) {
    btnPrintFaktur.onclick = () => {
      // Mark as Confirmed on print
      const o = salesOrders.find(x => x.id === currentViewingOrderId);
      if (o && o.status === 'Pending') {
        o.status = 'Confirmed';
        saveState();
        renderOrdersListInflow();
      }
      // Activate invoice-only print mode
      document.body.classList.add('print-invoice-mode');
      setTimeout(() => {
        window.print();
        // Clean up after print dialog closes
        document.body.classList.remove('print-invoice-mode');
      }, 100);
    };
  }

  // Shipping barang keluar decrement stock
  const btnShipBarangKeluar = document.getElementById('btn-confirm-barang-keluar');
  if (btnShipBarangKeluar) {
    btnShipBarangKeluar.onclick = () => {
      const o = salesOrders.find(x => x.id === currentViewingOrderId);
      if (!o) return;

      if (o.status === 'Shipped') {
        alert('Barang untuk order ini sudah diproses keluar!');
        return;
      }

      // Check stocks availability
      let stockSufficient = true;
      let insufficientItem = '';

      o.items.forEach(item => {
        const currentStock = stockData[item.product_code] || 0;
        if (currentStock < item.qty) {
          stockSufficient = false;
          insufficientItem = item.product_code;
        }
      });

      if (!stockSufficient) {
        alert(`Gagal memproses! Stok produk ${insufficientItem} di gudang tidak mencukupi.`);
        return;
      }

      if (confirm(`Apakah Anda yakin ingin memproses Barang Keluar? Stok produk di gudang akan otomatis berkurang.`)) {
        // Deduct Stocks
        o.items.forEach(item => {
          stockData[item.product_code] -= item.qty;
        });

        // Insert into official Gajah Mas main transaction registry
        o.items.forEach(item => {
          transactions.unshift({
            id: crypto.randomUUID(),
            salesman: o.salesman,
            date: o.date,
            customer: o.customer,
            product_name: item.product_name,
            product_code: item.product_code,
            qty: item.qty,
            price: item.price,
            nominal: item.nominal,
            payment_type: o.payment_type
          });
        });

        o.status = 'Shipped';
        saveState();
        closeOrderDetailModal();
        renderOrdersListInflow();
        alert('Sukses! Barang Keluar berhasil dikirim, stok terpotong, dan transaksi rekap otomatis diinput ke database harian.');
      }
    };
  }


  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NEW VIEW: PENGATURAN & BACKUP
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const btnExportBackup = document.getElementById('btn-export-backup');
  const fileImportBackup = document.getElementById('file-import-backup');
  const btnClearLocalData = document.getElementById('btn-clear-local-data');

  if (btnExportBackup) {
    btnExportBackup.onclick = () => {
      const data = {
        products,
        transactions,
        salesOrders,
        salesmen,
        stockData,
        supplierBills
      };
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamas_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }

  if (fileImportBackup) {
    fileImportBackup.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.products && data.transactions) {
            if (confirm('Peringatan: Tindakan ini akan menimpa data lokal saat ini. Lanjutkan?')) {
              products = data.products || [];
              transactions = data.transactions || [];
              salesOrders = data.salesOrders || [];
              salesmen = data.salesmen || [];
              stockData = data.stockData || {};
              supplierBills = data.supplierBills || [];
              saveState();
              alert('Restore data berhasil!');
              window.location.reload();
            }
          } else {
            alert('Format file JSON tidak valid untuk aplikasi ini.');
          }
        } catch (error) {
          alert('Gagal membaca file JSON.');
        }
      };
      reader.readAsText(file);
      fileImportBackup.value = ''; // Reset input
    };
  }

  if (btnClearLocalData) {
    btnClearLocalData.onclick = () => {
      if (confirm('PERINGATAN KRITIS: Seluruh data transaksi, stok, dan pengaturan di memori browser ini akan dihapus permanen. ANDA YAKIN?')) {
        if (confirm('Ketik OK jika Anda benar-benar yakin sudah mendownload backup.')) {
          localStorage.clear();
          alert('Data lokal berhasil dibersihkan.');
          window.location.reload();
        }
      }
    };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BOOTSTRAP INITIALIZATION
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function initApp() {
    if (activeRole) {
      viewLogin.style.display = 'none';
      appShell.style.display = 'flex';
      applyRoleUI();
      populateSalesmenSelectors();
      updateOnlineIndicator();

      // Ensure role fits active routing path
      const hash = window.location.hash;
      if (activeRole === 'admin' && (hash === '#/' || hash === '')) {
        window.location.hash = '#/sales/seller/Jossy';
      } else if (activeRole === 'owner' && (
        hash === '#/products' ||
        hash === '#/daily_reports' ||
        hash === '#/sales/new' ||
        hash === '#/kelola_sales'
      )) {
        window.location.hash = '#/';
      } else {
        handleRoute();
      }
    } else {
      viewLogin.style.display = 'flex';
      appShell.style.display = 'none';

      // Clear PIN
      currentPin = '';
      pinInput.value = '';
    }
  }

  async function bootApp() {
    await loadState();
    initApp();
  }
  bootApp();
});
