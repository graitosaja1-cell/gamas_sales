/* 
  GAJAH MAS SALES REPORT SYSTEM - CORE LOGIC
  Versi: 2 Role (Owner/Admin), Tanpa Chart.js, Desain Compact Profesional
*/

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let transactions = [];
  let products = [];
  let currentSeller = 'Jossy';
  let filteredTxList = [];
  let pendingUploadData = null;
  let activeRole = sessionStorage.getItem('gamas_role') || null;

  lucide.createIcons();

  // --- LOAD / SAVE STATE ---
  function loadState() {
    const savedProducts = localStorage.getItem('gamas_products');
    if (savedProducts) {
      products = JSON.parse(savedProducts);
    } else if (typeof INITIAL_DATA !== 'undefined') {
      products = INITIAL_DATA.products;
      localStorage.setItem('gamas_products', JSON.stringify(products));
    } else {
      products = [
        { code: 'FB200', name: 'FITRI BOTOL 200ML', cash_price: 112500, tempo_price: 115800, buy_price: 110500 },
        { code: 'FB400', name: 'FITRI BOTOL 400ML', cash_price: 111100, tempo_price: 113600, buy_price: 107500 },
        { code: 'FB800', name: 'FITRI BOTOL 800ML', cash_price: 212600, tempo_price: 215100, buy_price: 201900 }
      ];
    }

    const savedTx = localStorage.getItem('gamas_transactions');
    if (savedTx) {
      transactions = JSON.parse(savedTx);
    } else if (typeof INITIAL_DATA !== 'undefined') {
      transactions = INITIAL_DATA.transactions;
      localStorage.setItem('gamas_transactions', JSON.stringify(transactions));
    }
    
    // Ensure all transactions have an ID
    transactions.forEach(t => {
      if (!t.id) t.id = 'tx_' + Date.now() + Math.random().toString(36).substr(2, 9);
    });
  }

  function saveState() {
    localStorage.setItem('gamas_products', JSON.stringify(products));
    localStorage.setItem('gamas_transactions', JSON.stringify(transactions));
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

  // --- ROLE MANAGEMENT & LOGIN ---
  const viewLogin = document.getElementById('view-login');
  const appShell = document.getElementById('app-shell');
  const btnRoleOwner = document.getElementById('btn-role-owner');
  const btnRoleAdmin = document.getElementById('btn-role-admin');
  const btnLoginSubmit = document.getElementById('btn-login-submit');
  
  let selectedRole = null;

  function selectRole(role) {
    selectedRole = role;
    btnRoleOwner.classList.toggle('selected', role === 'owner');
    btnRoleAdmin.classList.toggle('selected', role === 'admin');
    btnLoginSubmit.disabled = false;
  }

  btnRoleOwner.onclick = () => selectRole('owner');
  btnRoleAdmin.onclick = () => selectRole('admin');

  btnLoginSubmit.onclick = () => {
    if (selectedRole) {
      activeRole = selectedRole;
      sessionStorage.setItem('gamas_role', activeRole);
      initApp();
    }
  };

  document.getElementById('btn-change-role').onclick = () => {
    sessionStorage.removeItem('gamas_role');
    activeRole = null;
    selectedRole = null;
    window.location.hash = '#/';
    window.location.reload();
  };

  function applyRoleUI() {
    document.querySelectorAll('.owner-only').forEach(el => {
      el.style.display = activeRole === 'owner' ? '' : 'none';
    });
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = activeRole === 'admin' ? '' : 'none';
    });

    const activeRoleText = document.getElementById('active-role-text');
    const activeRoleDot = document.getElementById('active-role-dot');
    
    if (activeRole === 'owner') {
      activeRoleText.textContent = 'Owner';
      activeRoleDot.className = 'dot owner';
    } else {
      activeRoleText.textContent = 'Admin';
      activeRoleDot.className = 'dot admin';
    }
  }

  // --- ROUTER ---
  const views = {
    'dashboard': document.getElementById('view-dashboard'),
    'seller-detail': document.getElementById('view-seller-detail'),
    'products': document.getElementById('view-products'),
    'daily-reports': document.getElementById('view-daily-reports'),
    'new-sale': document.getElementById('view-new-sale')
  };
  const navLinks = document.querySelectorAll('.topbar-nav .tab-link, .bottom-nav .bottom-nav-link');

  function handleRoute() {
    if (!activeRole) return; // Wait for login

    let hash = window.location.hash || '#/';
    
    // Redirect if accessing unauthorized route
    if (activeRole === 'admin' && hash === '#/') {
      hash = '#/sales/seller/Jossy';
      window.location.hash = hash;
      return;
    }
    if (activeRole === 'owner' && (hash === '#/products' || hash === '#/daily_reports' || hash === '#/sales/new')) {
      hash = '#/';
      window.location.hash = hash;
      return;
    }

    Object.values(views).forEach(v => {
      if (v) v.classList.remove('active');
    });
    navLinks.forEach(l => l.classList.remove('active'));

    if (hash !== '#/daily_reports') cancelExcelUpload();

    if (hash === '#/' || hash === '') {
      if(views['dashboard']) views['dashboard'].classList.add('active');
      const navD = document.getElementById('nav-dashboard');
      if (navD) navD.classList.add('active');
      const mobD = document.getElementById('mobnav-dashboard');
      if (mobD) mobD.classList.add('active');
      renderDashboard();
    } else if (hash.startsWith('#/sales/seller/')) {
      const name = hash.split('/').pop();
      currentSeller = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      if(views['seller-detail']) views['seller-detail'].classList.add('active');
      const navS = document.getElementById('nav-seller');
      if (navS) navS.classList.add('active');
      const mobS = document.getElementById('mobnav-seller');
      if (mobS) mobS.classList.add('active');
      const selCtrl = document.getElementById('seller-select-control');
      if (selCtrl) selCtrl.value = currentSeller;
      renderSellerDetail();
    } else if (hash === '#/products') {
      if(views['products']) views['products'].classList.add('active');
      const navP = document.getElementById('nav-products');
      if (navP) navP.classList.add('active');
      const mobP = document.getElementById('mobnav-products');
      if (mobP) mobP.classList.add('active');
      renderProductsCatalog();
    } else if (hash === '#/daily_reports') {
      if(views['daily-reports']) views['daily-reports'].classList.add('active');
      const navR = document.getElementById('nav-reports');
      if (navR) navR.classList.add('active');
      const mobR = document.getElementById('mobnav-reports');
      if (mobR) mobR.classList.add('active');
      setupExcelDropZone();
    } else if (hash === '#/sales/new') {
      if(views['new-sale']) views['new-sale'].classList.add('active');
      const navN = document.getElementById('nav-new-sale');
      if (navN) navN.classList.add('active');
      const mobN = document.getElementById('mobnav-new-sale');
      if (mobN) mobN.classList.add('active');
      setupManualSaleForm();
    }
  }

  window.addEventListener('hashchange', handleRoute);

  const sellerSelCtrl = document.getElementById('seller-select-control');
  if (sellerSelCtrl) {
    sellerSelCtrl.addEventListener('change', (e) => {
      window.location.hash = `#/sales/seller/${e.target.value.toLowerCase()}`;
    });
  }


  // ════════════════════════════════════════
  // VIEW 1: DASHBOARD
  // ════════════════════════════════════════
  function renderDashboard() {
    if (activeRole !== 'owner') return;

    const prodMap = getProdMap();
    let qtyCash = 0, valCash = 0, profitCash = 0;
    let qtyTempo = 0, valTempo = 0, profitTempo = 0;
    const txCounts = { Jossy: { Cash: 0, Tempo: 0 }, Raju: { Cash: 0, Tempo: 0 }, Hafid: { Cash: 0, Tempo: 0 } };

    transactions.forEach(t => {
      const p = prodMap[t.product_code];
      const buyPrice = p ? p.buy_price : 0;
      const profit = t.nominal - (t.qty * buyPrice);
      if (txCounts[t.salesman]) {
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
          <td data-label="Salesman">${s}</td>
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

  function renderSalesmenCards(prodMap) {
    const container = document.getElementById('dash-salesmen-cards');
    if (!container) return;
    container.innerHTML = '';
    ['Jossy', 'Raju', 'Hafid'].forEach((s, idx) => {
      let totalSales = 0, cashSales = 0, tempoSales = 0, totalQty = 0, profitCash = 0, profitTempo = 0;
      transactions.forEach(t => {
        if (t.salesman.toLowerCase() === s.toLowerCase()) {
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
          <div class="sc-avatar idx-${idx}">${s.charAt(0)}</div>
          <div>
            <div class="sc-name">${s.toUpperCase()}</div>
            <div class="sc-role-label">Salesman</div>
          </div>
        </div>
        <div class="sc-body">
          <div class="sc-row"><span>Volume</span><span class="val">${totalQty.toLocaleString('id-ID')} krat</span></div>
          <div class="sc-row"><span>Omset</span><span class="val blue">${formatIDR(totalSales)}</span></div>
          <div class="sc-profit-row">
            <div class="sc-profit-item"><div class="sc-profit-label">Cash</div><div class="sc-profit-val blue">${formatIDR(profitCash)}</div></div>
            <div class="sc-profit-item"><div class="sc-profit-label">Tempo</div><div class="sc-profit-val amber">${formatIDR(profitTempo)}</div></div>
          </div>
          <div style="margin-top: .5rem; text-align: right;"><span class="val green" style="font-size: .85rem;">${formatIDR(totalProfit)}</span></div>
        </div>
        <div class="sc-footer">
          <a href="#/sales/seller/${s.toLowerCase()}" class="sc-detail-btn">Lihat Detail <i data-lucide="chevron-right"></i></a>
        </div>
      `;
      container.appendChild(card);
    });
    lucide.createIcons();
  }


  // ════════════════════════════════════════
  // VIEW 2: SELLER DETAIL
  // ════════════════════════════════════════
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
      if (t.salesman.toLowerCase() !== currentSeller.toLowerCase()) return;
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
            <div class="psc-label">Total Profit – ${currentSeller.toUpperCase()}</div>
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

  // ════════════════════════════════════════
  // FILTER & DAILY TABLE
  // ════════════════════════════════════════
  function setupFiltersAndRenderDaily(sellerTxList) {
    const dateStartInput = document.getElementById('filter-date-start');
    const dateEndInput   = document.getElementById('filter-date-end');
    const productSelect  = document.getElementById('filter-product');
    const paymentSelect  = document.getElementById('filter-payment');
    const customerInput  = document.getElementById('filter-customer');
    const btnReset       = document.getElementById('btn-reset-filters');

    if (!dateStartInput) return; // fail safe

    let minDate = '', maxDate = '';
    if (sellerTxList.length > 0) {
      const dates = sellerTxList.map(t => t.date);
      minDate = dates.reduce((a, b) => a < b ? a : b);
      maxDate = dates.reduce((a, b) => a > b ? a : b);
    }

    dateStartInput.value = minDate;
    dateEndInput.value   = maxDate;
    productSelect.value  = 'ALL';
    paymentSelect.value  = 'ALL';
    customerInput.value  = '';

    function applyFilters() {
      const start       = dateStartInput.value;
      const end         = dateEndInput.value;
      const selProd     = productSelect.value;
      const selPayment  = paymentSelect.value;
      const queryCust   = customerInput.value.toLowerCase().trim();

      filteredTxList = sellerTxList.filter(t => {
        if (start && t.date < start) return false;
        if (end   && t.date > end)   return false;
        if (selProd !== 'ALL' && t.product_code !== selProd) return false;
        if (selPayment !== 'ALL' && t.payment_type !== selPayment) return false;
        if (queryCust && !t.customer.toLowerCase().includes(queryCust)) return false;
        return true;
      });

      filteredTxList.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.customer.localeCompare(b.customer);
      });

      const dailyTbody = document.getElementById('seller-daily-table-body');
      dailyTbody.innerHTML = '';

      if (filteredTxList.length === 0) {
        dailyTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-2);padding:1.5rem">Tidak ada data.</td></tr>';
        return;
      }

      filteredTxList.forEach(t => {
        const dateObj = new Date(t.date);
        const formattedDate = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const paymentBadge = t.payment_type.toLowerCase();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td data-label="Tanggal">${formattedDate}</td>
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
      
      // Render ikon untuk tombol aksi
      lucide.createIcons();
    }

    dateStartInput.onchange = applyFilters;
    dateEndInput.onchange   = applyFilters;
    productSelect.onchange  = applyFilters;
    paymentSelect.onchange  = applyFilters;
    customerInput.oninput   = applyFilters;

    btnReset.onclick = () => {
      dateStartInput.value = minDate;
      dateEndInput.value   = maxDate;
      productSelect.value  = 'ALL';
      paymentSelect.value  = 'ALL';
      customerInput.value  = '';
      applyFilters();
    };

    applyFilters();
  }


  // ════════════════════════════════════════
  // EXPORT EXCEL (.xlsx) DENGAN FILTER PERIODE
  // ════════════════════════════════════════
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
    const periodeEnd   = document.getElementById('export-periode-end').value;

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
        'Salesman':           t.salesman,
        'Tanggal':            t.date,
        'Customer':           t.customer,
        'Produk':             t.product_code,
        'Nama Produk':        p ? p.name : t.product_code,
        'QTY (krat)':         t.qty,
        'Harga Jual (Rp)':    t.price,
        'Nominal (Rp)':       t.nominal,
        'Jenis Pembayaran':   t.payment_type,
        'Harga Beli (Rp)':    buyPrice,
        'Profit (Rp)':        profit
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
      'Salesman':           name,
      'QTY Cash (krat)':    sm.cash_qty,
      'Omset Cash (Rp)':    sm.cash_rp,
      'Profit Cash (Rp)':   sm.cash_profit,
      'QTY Tempo (krat)':   sm.tempo_qty,
      'Omset Tempo (Rp)':   sm.tempo_rp,
      'Profit Tempo (Rp)':  sm.tempo_profit,
      'Total QTY (krat)':   sm.cash_qty + sm.tempo_qty,
      'Total Omset (Rp)':   sm.cash_rp + sm.tempo_rp,
      'Total Profit (Rp)':  sm.cash_profit + sm.tempo_profit
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rows);
    ws1['!cols'] = [{wch:10},{wch:12},{wch:30},{wch:8},{wch:22},{wch:10},{wch:14},{wch:16},{wch:14},{wch:14},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detail Transaksi');

    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    ws2['!cols'] = [{wch:10},{wch:14},{wch:16},{wch:16},{wch:14},{wch:16},{wch:16},{wch:14},{wch:16},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan Salesman');

    const periodLabel = periodeType === 'all' ? 'Semua' : `${periodeStart}_sd_${periodeEnd}`;
    const filename = `Laporan_Penjualan_${currentSeller}_${periodLabel}.xlsx`;
    XLSX.writeFile(wb, filename);

    const modal = document.getElementById('export-modal');
    if (modal) modal.classList.remove('active');
  }


  // ════════════════════════════════════════
  // VIEW 3: PRODUCTS CATALOG (Admin)
  // ════════════════════════════════════════
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
      const totalSales = productSalesQty[p.code] || 0;
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


  // ════════════════════════════════════════
  // PRODUCT MODAL (Admin)
  // ════════════════════════════════════════
  const prodModal    = document.getElementById('product-modal');
  const productForm  = document.getElementById('product-form');

  function openProductModal(index = null) {
    if (!prodModal) return;
    prodModal.classList.add('active');
    const inputIndex = document.getElementById('prod-edit-index');
    const inputCode  = document.getElementById('prod-code');
    const inputName  = document.getElementById('prod-name');
    const inputBuy   = document.getElementById('prod-buy-price');
    const inputCash  = document.getElementById('prod-cash-price');
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
  if (btnCloseM) btnCloseM.onclick  = closeProductModal;
  
  const btnCancelM = document.getElementById('btn-cancel-modal');
  if (btnCancelM) btnCancelM.onclick = closeProductModal;

  if (productForm) {
    productForm.onsubmit = (e) => {
      e.preventDefault();
      const index = document.getElementById('prod-edit-index').value;
      const code  = document.getElementById('prod-code').value.toUpperCase().trim();
      const name  = document.getElementById('prod-name').value.trim();
      const buy_price   = parseFloat(document.getElementById('prod-buy-price').value);
      const cash_price  = parseFloat(document.getElementById('prod-cash-price').value);
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

  // ════════════════════════════════════════
  // VIEW 4: EXCEL UPLOAD (Admin)
  // ════════════════════════════════════════
  function setupExcelDropZone() {
    if (activeRole !== 'admin') return;
    const dropZone  = document.getElementById('excel-drop-zone');
    const fileInput = document.getElementById('excel-file-input');
    if(!dropZone || !fileInput) return;

    dropZone.onclick = () => fileInput.click();
    ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
    ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));
    dropZone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f); }, false);
    fileInput.onchange = (e) => { const f = e.target.files[0]; if (f) handleExcelFile(f); };
  }

  function handleExcelFile(file) {
    if (!file.name.endsWith('.xlsx')) { alert('Tolong unggah file Excel format .xlsx!'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      const data = new Uint8Array(e.target.result);
      try {
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheets = workbook.SheetNames;
        const required = ['JOSSY','RAJU','HAFID'];
        if (!required.every(s => sheets.map(x => x.toUpperCase()).includes(s))) {
          alert('Excel harus berisi sheet JOSSY, RAJU, dan HAFID!');
          return;
        }
        document.getElementById('chk-sheet').classList.add('valid');

        let parsedRows = [];
        let chkColsValid = true;

        required.forEach(sheetName => {
          const actualSheet = sheets.find(s => s.toUpperCase() === sheetName);
          const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[actualSheet], { header: 1 });
          let headerRowIdx = -1;
          for (let r = 0; r < Math.min(rawJson.length, 10); r++) {
            const row = rawJson[r];
            if (row && row.some(cell => cell && cell.toString().toLowerCase().includes('sales'))) {
              headerRowIdx = r; break;
            }
          }
          if (headerRowIdx === -1) { chkColsValid = false; return; }
          const headers = rawJson[headerRowIdx].map(h => h ? h.toString().toLowerCase() : '');
          const colSales = headers.findIndex(h => h.includes('sales'));
          const colDate  = headers.findIndex(h => h.includes('tanggal'));
          const colCust  = headers.findIndex(h => h.includes('customer'));
          const colProd  = headers.findIndex(h => h.includes('produk'));
          const colQty   = headers.findIndex(h => h.includes('qty'));
          const colPrice = headers.findIndex(h => h.includes('harga'));
          const colNom   = headers.findIndex(h => h.includes('nominal'));
          const colPay   = headers.findIndex(h => h.includes('pembayaran'));
          if ([colSales, colDate, colProd, colQty, colPrice, colNom, colPay].some(i => i === -1)) { chkColsValid = false; return; }

          for (let r = headerRowIdx + 1; r < rawJson.length; r++) {
            const row = rawJson[r];
            if (!row || !row[colSales]) continue;
            let dateVal = row[colDate];
            if (dateVal instanceof Date) {
              dateVal = dateVal.toISOString().split('T')[0];
            } else if (typeof dateVal === 'number') {
              const base = new Date(1899, 11, 30);
              dateVal = new Date(base.getTime() + Math.floor(dateVal) * 86400000).toISOString().split('T')[0];
            } else {
              dateVal = dateVal ? dateVal.toString().trim() : '';
            }
            const prodName = row[colProd] ? row[colProd].toString().trim() : '';
            const paymentVal = row[colPay] ? row[colPay].toString().trim() : 'Tempo';
            parsedRows.push({
              id: 'tx_' + Date.now() + Math.random().toString(36).substr(2, 9),
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

        if (!chkColsValid || parsedRows.length === 0) {
          alert('Format kolom tidak cocok! Periksa nama kolom Excel.');
          return;
        }
        document.getElementById('chk-cols').classList.add('valid');
        pendingUploadData = parsedRows;
        showExcelUploadPreview();
      } catch (err) {
        console.error(err);
        alert('Gagal membaca file Excel!');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function showExcelUploadPreview() {
    const previewArea  = document.getElementById('upload-preview-area');
    const previewTbody = document.getElementById('upload-preview-table-body');
    if(!previewArea || !previewTbody) return;
    
    previewTbody.innerHTML = '';
    document.getElementById('preview-data-title').textContent = `Pratinjau Data (${pendingUploadData.length.toLocaleString('id-ID')} Transaksi)`;
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
      trMore.innerHTML = `<td colspan="8" style="text-align:center;color:var(--text-3);padding:1rem">...dan ${(pendingUploadData.length-30).toLocaleString('id-ID')} baris lainnya.</td>`;
      previewTbody.appendChild(trMore);
    }
    previewArea.style.display = 'block';
    document.getElementById('excel-drop-zone').style.display = 'none';
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
  }

  const btnCancelUpload = document.getElementById('btn-cancel-upload');
  if (btnCancelUpload) btnCancelUpload.onclick = cancelExcelUpload;

  const btnCommitUpload = document.getElementById('btn-commit-upload');
  if (btnCommitUpload) {
    btnCommitUpload.onclick = () => {
      if (!pendingUploadData || pendingUploadData.length === 0) return;
      transactions = [...transactions, ...pendingUploadData];
      saveState();
      alert(`Sukses! ${pendingUploadData.length.toLocaleString('id-ID')} transaksi baru berhasil ditambahkan.`);
      cancelExcelUpload();
      window.location.hash = '#/sales/seller/Jossy';
    };
  }


  // ════════════════════════════════════════
  // VIEW 5: MANUAL ADD SALE (Admin)
  // ════════════════════════════════════════
  function setupManualSaleForm() {
    if (activeRole !== 'admin') return;

    const form         = document.getElementById('manual-sale-form');
    const inputProduct = document.getElementById('sale-product');
    const inputPayment = document.getElementById('sale-payment');
    const inputQty     = document.getElementById('sale-qty');
    const inputDate    = document.getElementById('sale-date');
    const inputSalesman= document.getElementById('sale-salesman');
    const inputCust    = document.getElementById('sale-customer');

    if (!form) return;

    const today = new Date().toISOString().split('T')[0];
    inputDate.value = today;

    function updateCalc() {
      const prodCode    = inputProduct.value;
      const paymentType = inputPayment.value;
      const qty         = parseInt(inputQty.value || 0);
      if (!prodCode) {
        document.getElementById('sale-price-display').textContent   = 'Rp 0';
        document.getElementById('sale-nominal-display').textContent = 'Rp 0';
        return;
      }
      const p = products.find(x => x.code === prodCode);
      if (!p) return;
      const price   = paymentType === 'Cash' ? p.cash_price : p.tempo_price;
      const nominal = qty * price;
      document.getElementById('sale-price-display').textContent   = formatIDR(price);
      document.getElementById('sale-nominal-display').textContent = formatIDR(nominal);
    }

    inputProduct.onchange = updateCalc;
    inputPayment.onchange = updateCalc;
    inputQty.oninput      = updateCalc;

    form.onsubmit = (e) => {
      e.preventDefault();
      const prodCode    = inputProduct.value;
      const p           = products.find(x => x.code === prodCode);
      if (!p) return;
      const qty         = parseInt(inputQty.value);
      const paymentType = inputPayment.value;
      const price       = paymentType === 'Cash' ? p.cash_price : p.tempo_price;
      transactions.unshift({
        id: 'tx_' + Date.now() + Math.random().toString(36).substr(2, 9),
        salesman:     inputSalesman.value,
        date:         inputDate.value,
        customer:     inputCust.value.trim().toUpperCase(),
        product_name: p.name,
        product_code: prodCode,
        qty, price,
        nominal:      qty * price,
        payment_type: paymentType
      });
      saveState();
      alert('Transaksi berhasil disimpan!');
      form.reset();
      inputDate.value = today;
      updateCalc();
      window.location.hash = '#/sales/seller/Jossy';
    };

    document.getElementById('btn-reset-form').onclick = () => {
      setTimeout(() => { inputDate.value = today; updateCalc(); }, 0);
    };
  }


  // ════════════════════════════════════════
  // TX EDIT/DELETE (Admin)
  // ════════════════════════════════════════
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
    
    const prodSelect = document.getElementById('tx-edit-product');
    prodSelect.innerHTML = '<option value="" disabled>Pilih Produk</option>';
    products.forEach(p => {
      prodSelect.innerHTML += `<option value="${p.code}" ${p.code === t.product_code ? 'selected' : ''}>${p.code} - ${p.name}</option>`;
    });
    
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
      
      t.date = document.getElementById('tx-edit-date').value;
      t.customer = document.getElementById('tx-edit-customer').value.toUpperCase();
      t.product_code = prodCode;
      t.product_name = p.name;
      t.qty = qty;
      t.payment_type = paymentType;
      t.salesman = document.getElementById('tx-edit-salesman').value;
      t.price = price;
      t.nominal = qty * price;
      
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


  // ════════════════════════════════════════
  // BOOTSTRAP
  // ════════════════════════════════════════
  function initApp() {
    if (activeRole) {
      viewLogin.style.display = 'none';
      appShell.style.display = 'flex';
      applyRoleUI();
      
      // Ensure we navigate to a valid route for the new role if on an invalid one
      const hash = window.location.hash;
      if (activeRole === 'admin' && (hash === '#/' || hash === '')) {
         window.location.hash = '#/sales/seller/Jossy';
      } else if (activeRole === 'owner' && (hash === '#/products' || hash === '#/daily_reports' || hash === '#/sales/new')) {
         window.location.hash = '#/';
      } else {
        handleRoute();
      }
    } else {
      viewLogin.style.display = 'flex';
      appShell.style.display = 'none';
    }
  }

  loadState();
  initApp();
});
