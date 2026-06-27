import { auth, db } from "./firebase.js";
import { initRevenue } from "./revenue.js";
import { initPerformance } from "./performance.js";
import { initBulkProducts } from "./bulk.js";

import {
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  setDoc,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ── STATE ──────────────────────────────────────────────────────────────────────
let currentSeller    = null;
let allProducts      = [];
let allOrders        = [];
let activeOrderFilter = "all";

// Multi-image state — Add Product
let addFormImages    = [];
let addFormActiveIdx = -1;

// Multi-image state — Edit modal
let editImages    = [];
let editActiveIdx = -1;
let editNewFiles  = [];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  el.style.background = ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  el.style.color  = ok ? "#22c55e" : "#ef4444";
  el.style.border = `1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`;
  el.style.borderRadius = "8px";
  el.style.padding = "10px 14px";
  setTimeout(() => { el.style.display = "none"; }, 4000);
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "product_upload");
  const res  = await fetch("https://api.cloudinary.com/v1_1/dw3h0amnh/image/upload", { method: "POST", body: formData });
  const data = await res.json();
  return data.secure_url;
}

async function uploadMultipleToCloudinary(files) {
  const urls = [];
  for (const file of files) {
    try { const url = await uploadToCloudinary(file); if (url) urls.push(url); }
    catch (err) { console.error("Upload failed:", file.name, err); }
  }
  return urls;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const overlay = document.getElementById("loadingOverlay");
  try {
    if (!user) { window.location.href = "index.html"; return; }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) { alert("Account data not found."); await signOut(auth); window.location.href = "index.html"; return; }

    const userData = userSnap.data();
    if (userData.role !== "seller" && userData.role !== "admin") { alert("Access denied. This area is for sellers only. ❌"); await signOut(auth); window.location.href = "index.html"; return; }
    // approval check removed

    currentSeller = { uid: user.uid, ...userData };
window._sellerUid = user.uid; // used by export-orders.js
    initPerformance({ role: "seller", sellerUid: user.uid, sellerData: userData });
    initBulkProducts({ role: "seller", sellerUid: user.uid });

    const firstName = userData.firstName || user.email.split("@")[0];
    const lastName  = userData.lastName  || "";
    const initials  = ((firstName[0] || "") + (lastName[0] || "")).toUpperCase() || "S";

    document.getElementById("sellerName").textContent       = firstName;
    document.getElementById("profileFullName").textContent  = `${firstName} ${lastName}`.trim();
    document.getElementById("profileEmail").textContent     = user.email;
    document.getElementById("profileFirst").value           = firstName;
    document.getElementById("profileLast").value            = lastName;
    document.getElementById("profileStore").value           = userData.storeName || "";
    document.getElementById("profilePhone").value           = userData.phone     || "";
    document.getElementById("profileBio").value             = userData.bio       || "";

    const sidebarAv = document.getElementById("sidebarAvatar");
    const profileAv = document.getElementById("profileAvatarBig");
    if (userData.photoURL) {
      if (sidebarAv) sidebarAv.innerHTML = `<img src="${userData.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      if (profileAv) profileAv.innerHTML = `<img src="${userData.photoURL}">`;
    } else {
      if (sidebarAv) sidebarAv.textContent = initials;
      if (profileAv) profileAv.textContent = initials;
    }

    loadSellerProducts(user.uid);
loadSellerOrders(user.uid);
populateCategoryDropdown();
initRevenue({ role: "seller", sellerUid: user.uid });
document.getElementById("revTopSellersCard").style.display = "none";

  } catch (err) {
    console.error("SELLER AUTH ERROR:", err);
    alert("Failed to verify seller account.");
    window.location.href = "index.html";
  } finally {
    if (overlay) { overlay.style.opacity = "0"; setTimeout(() => { overlay.style.display = "none"; }, 400); }
  }
});

// ── INVENTORY ALERTS ──────────────────────────────────────────────────────────
function checkLowStock(products) {
  const THRESHOLD = 3;
  products.forEach(p => {
    if (p.stock <= THRESHOLD && p.stock > 0) {
      const key = `lowstock_${p.id}_${p.stock}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "true");
        showMsg("sProductMsg", `⚠ Low stock: "${p.name}" only has ${p.stock} left — restock soon!`, false);
      }
    }
    if (p.stock > THRESHOLD) localStorage.removeItem(`lowstock_${p.id}_${p.stock}`);
  });
}

// ── LOAD PRODUCTS ─────────────────────────────────────────────────────────────
function loadSellerProducts(uid) {
  let products = [], promotions = [];
  const merge = () => {
    allProducts = [...products, ...promotions];
    renderProductTable(allProducts);
    renderRecentProducts(allProducts);
    updateStats(allProducts);
    checkLowStock(allProducts);
  };
  onSnapshot(query(collection(db, "products"),   where("sellerUid", "==", uid)), snap => { products   = snap.docs.map(d => ({ id: d.id, _collection: "products",   ...d.data() })); merge(); });
  onSnapshot(query(collection(db, "promotions"), where("sellerUid", "==", uid)), snap => { promotions = snap.docs.map(d => ({ id: d.id, _collection: "promotions", ...d.data() })); merge(); });
}

function getDisplayImage(p) {
  if (Array.isArray(p.imageURLs) && p.imageURLs.length > 0) return p.imageURLs[0];
  if (p.imageURL && p.imageURL !== "images/no-image.png") return p.imageURL;
  return null;
}

function renderProductTable(products) {
  const tbody = document.getElementById("sellerProductTable");
  if (!tbody) return;
  if (products.length === 0) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-box-open"></i><p>No products yet. Add your first product!</p></div></td></tr>`; return; }
  tbody.innerHTML = products.map(p => {
    const img = getDisplayImage(p);
    const imgCount = Array.isArray(p.imageURLs) ? p.imageURLs.length : (img ? 1 : 0);
    return `<tr>
      <td style="position:relative;">
        ${img ? `<img src="${img}" class="product-thumb">` : `<div class="product-thumb-placeholder"><i class="fas fa-image"></i></div>`}
        ${imgCount > 1 ? `<span style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 5px;border-radius:8px;">${imgCount}</span>` : ""}
      </td>
      <td style="font-weight:500;">${p.name}</td>
      <td><span class="badge ${p.category === 'promo' ? 'badge-promo' : ''}" style="${p.category !== 'promo' ? 'background:rgba(255,255,255,0.06);color:var(--muted);' : ''}">${p.category || '—'}</span></td>
      <td>${p.currency || 'GHS'} ${Number(p.price).toFixed(2)}</td>
      <td><span class="badge ${p.stock < 2 ? 'badge-low' : 'badge-stock'}">${p.stock < 2 ? '⚠ ' : ''}${p.stock}</span></td>
      <td><div class="action-btns">
        <button class="btn-icon" title="Edit" onclick="openEditModal('${p.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon del" title="Delete" onclick="confirmDelete('${p.id}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join("");
}

function renderRecentProducts(products) {
  const tbody = document.getElementById("recentProductsTable");
  if (!tbody) return;
  const recent = [...products].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
  if (recent.length === 0) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="fas fa-box-open"></i><p>No products yet</p></div></td></tr>`; return; }
  tbody.innerHTML = recent.map(p => {
    const img = getDisplayImage(p);
    return `<tr>
      <td>${img ? `<img src="${img}" class="product-thumb">` : `<div class="product-thumb-placeholder"><i class="fas fa-image"></i></div>`}</td>
      <td style="font-weight:500;">${p.name}</td>
      <td><span style="color:var(--muted);font-size:0.82rem;">${p.category || '—'}</span></td>
      <td>${p.currency || 'GHS'} ${Number(p.price).toFixed(2)}</td>
      <td><span class="badge ${p.stock < 2 ? 'badge-low' : 'badge-stock'}">${p.stock}</span></td>
    </tr>`;
  }).join("");
}

function updateStats(products) {
  document.getElementById("statTotal").textContent   = products.length;
  document.getElementById("statInStock").textContent = products.filter(p => p.stock > 0).length;
  document.getElementById("statLow").textContent     = products.filter(p => p.stock < 2).length;
  document.getElementById("statPromo").textContent   = products.filter(p => p.category === "promo").length;
}

// ── CATEGORIES ────────────────────────────────────────────────────────────────
async function populateCategoryDropdown() {
  const select = document.getElementById("sCategory");
  if (!select) return;
  try {
    const snapshot = await getDocs(collection(db, "categories"));
    select.innerHTML = `<option value="" disabled selected>-- Select Category --</option>`;
    snapshot.forEach(d => {
      const cat = d.data(), opt = document.createElement("option");
      opt.value = cat.slug; opt.textContent = cat.name;
      select.appendChild(opt);
    });
  } catch (err) { console.error("Failed to load categories:", err); }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────

const ORDER_STATUSES = {
  pending:   { label: "Pending",   color: "#f0b429", bg: "rgba(240,180,41,0.12)", icon: "fa-clock" },
  shipped:   { label: "Shipped",   color: "#4f8ef7", bg: "rgba(79,142,247,0.12)", icon: "fa-truck" },
  delivered: { label: "Delivered", color: "#22c55e", bg: "rgba(34,197,94,0.12)",  icon: "fa-circle-check" },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  icon: "fa-ban" }
};

function statusBadge(status) {
  const s = ORDER_STATUSES[status] || ORDER_STATUSES.pending;
  return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:${s.bg};color:${s.color};border:1px solid ${s.color}33;white-space:nowrap;">
    <i class="fas ${s.icon}" style="font-size:0.65rem;"></i>${s.label}</span>`;
}

function loadSellerOrders(uid) {
  // Primary query with orderBy (requires Firestore composite index)
  const q = query(collection(db, "orders"), where("sellerUid", "==", uid), orderBy("createdAt", "desc"));

  const handleSnap = snap => {
    allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOrdersTable(activeOrderFilter === "all" ? allOrders : allOrders.filter(o => (o.status || "pending") === activeOrderFilter));
    updateOrderStats(allOrders);
  };

  onSnapshot(q, handleSnap, () => {
    // Fallback without orderBy if index missing
    onSnapshot(query(collection(db, "orders"), where("sellerUid", "==", uid)), snap => {
      allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderOrdersTable(activeOrderFilter === "all" ? allOrders : allOrders.filter(o => (o.status || "pending") === activeOrderFilter));
      updateOrderStats(allOrders);
    });
  });
}

function updateOrderStats(orders) {
  const g = id => document.getElementById(id);
  if (g("oStatTotal"))     g("oStatTotal").textContent     = orders.length;
  if (g("oStatPending"))   g("oStatPending").textContent   = orders.filter(o => !o.status || o.status === "pending").length;
  if (g("oStatShipped"))   g("oStatShipped").textContent   = orders.filter(o => o.status === "shipped").length;
  if (g("oStatDelivered")) g("oStatDelivered").textContent = orders.filter(o => o.status === "delivered").length;
  if (g("oStatCancelled")) g("oStatCancelled").textContent = orders.filter(o => o.status === "cancelled").length;

  // Sidebar pending badge
  const badge   = document.getElementById("pendingOrdersBadge");
  const pending = orders.filter(o => !o.status || o.status === "pending").length;
  if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? "inline-flex" : "none"; }
}

window.filterOrders = (status) => {
  activeOrderFilter = status;
  document.querySelectorAll(".order-tab").forEach(t => t.classList.toggle("active", t.dataset.status === status));
  renderOrdersTable(status === "all" ? allOrders : allOrders.filter(o => (o.status || "pending") === status));
};

function renderOrdersTable(orders) {
  const tbody = document.getElementById("ordersTableBody");
  if (!tbody) return;
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-shopping-bag"></i><p>No orders found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const status        = o.status || "pending";
    const customerName  = o.customerName  || o.buyerName  || o.userName  || "Customer";
    const customerEmail = o.customerEmail || o.buyerEmail || o.email     || "";
    const total         = o.total || o.amount || 0;
    const currency      = o.currency || "GHS";
    const itemsSummary  = Array.isArray(o.items)
      ? o.items.map(i => `${i.name} × ${i.qty || i.quantity || 1}`).join(", ")
      : (o.productName || "—");
    const tracking = o.trackingNumber ? `<div style="font-size:0.7rem;color:#4f8ef7;margin-top:2px;"><i class="fas fa-truck" style="font-size:0.65rem;"></i> ${o.trackingNumber}</div>` : "";
    return `<tr>
      <td style="font-family:'Syne',sans-serif;font-size:0.78rem;color:var(--muted);white-space:nowrap;">#${o.id.slice(-6).toUpperCase()}</td>
      <td>
        <div style="font-weight:500;font-size:0.88rem;">${customerName}</div>
        ${customerEmail ? `<div style="font-size:0.75rem;color:var(--muted);">${customerEmail}</div>` : ""}
      </td>
      <td style="max-width:160px;">
        <div style="font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${itemsSummary}">${itemsSummary}</div>
      </td>
      <td style="font-weight:600;white-space:nowrap;">${currency} ${Number(total).toFixed(2)}</td>
      <td>${statusBadge(status)}${tracking}</td>
      <td style="font-size:0.78rem;color:var(--muted);white-space:nowrap;">
        ${formatDate(o.createdAt)}<br>
        <span style="font-size:0.72rem;">${formatTime(o.createdAt)}</span>
      </td>
      <td>
        <button class="btn-icon" title="Manage order" onclick="openOrderModal('${o.id}')">
          <i class="fas fa-ellipsis-h"></i>
        </button>
      </td>
    </tr>`;
  }).join("");
}

// ── ORDER MODAL ───────────────────────────────────────────────────────────────
window.openOrderModal = (id) => {
  const o = allOrders.find(o => o.id === id);
  if (!o) return;

  const status        = o.status || "pending";
  const customerName  = o.customerName  || o.buyerName  || o.userName  || "Customer";
  const customerEmail = o.customerEmail || o.buyerEmail || o.email     || "—";
  const customerPhone = o.customerPhone || o.phone || "—";
  const address       = o.address || o.deliveryAddress || o.shippingAddress || "—";
  const currency      = o.currency || "GHS";
  const total         = o.total || o.amount || 0;
  const tracking      = o.trackingNumber || "";

  const itemsHTML = Array.isArray(o.items)
    ? o.items.map(i => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:0.88rem;">${i.name}</span>
        <span style="font-size:0.82rem;color:var(--muted);">× ${i.qty || i.quantity || 1} &nbsp;<strong style="color:var(--text);">${currency} ${Number((i.price || 0) * (i.qty || i.quantity || 1)).toFixed(2)}</strong></span>
      </div>`).join("")
    : `<div style="padding:8px 0;font-size:0.88rem;">${o.productName || "—"}</div>`;

  // Status timeline
  const timelineHTML = ["pending","shipped","delivered"].map(s => {
    const cfg = ORDER_STATUSES[s];
    const done = s === "delivered" ? status === "delivered" : (s === "shipped" ? ["shipped","delivered"].includes(status) : true);
    const isCurrent = (o.statusHistory?.[s]) || s === status;
    const ts = o.statusHistory?.[s];
    const dateStr = ts ? formatDate(ts) : "";
    return `<div style="display:flex;align-items:flex-start;gap:10px;flex:1;">
      <div style="display:flex;flex-direction:column;align-items:center;gap:0;">
        <div style="width:28px;height:28px;border-radius:50%;border:2px solid ${isCurrent ? cfg.color : 'var(--border)'};background:${isCurrent ? cfg.bg : 'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fas ${cfg.icon}" style="font-size:0.7rem;color:${isCurrent ? cfg.color : 'var(--muted)'};"></i>
        </div>
      </div>
      <div style="padding-top:4px;">
        <div style="font-size:0.78rem;font-weight:600;color:${isCurrent ? cfg.color : 'var(--muted)'};">${cfg.label}</div>
        ${dateStr ? `<div style="font-size:0.7rem;color:var(--muted);">${dateStr}</div>` : ""}
      </div>
    </div>`;
  }).join(`<div style="flex:0 0 1px;background:var(--border);margin:14px 0;align-self:stretch;"></div>`);

  // Status action buttons
  const statusBtns = ["pending","shipped","delivered","cancelled"].map(s => {
    const cfg = ORDER_STATUSES[s];
    const isActive = s === status;
    return `<button onclick="setOrderStatus('${id}','${s}')"
      style="flex:1;padding:9px 4px;border-radius:8px;border:1.5px solid ${isActive ? cfg.color : 'var(--border)'};
             background:${isActive ? cfg.bg : 'transparent'};color:${isActive ? cfg.color : 'var(--muted)'};
             cursor:pointer;font-size:0.72rem;font-weight:600;font-family:'DM Sans',sans-serif;
             text-transform:uppercase;letter-spacing:0.4px;transition:all .2s;
             display:flex;flex-direction:column;align-items:center;gap:5px;">
      <i class="fas ${cfg.icon}" style="font-size:0.85rem;"></i>${cfg.label}
    </button>`;
  }).join("");

  document.getElementById("orderModalContent").innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:10px;">
      <div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:1.05rem;">Order #${id.slice(-6).toUpperCase()}</div>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:3px;">${formatDate(o.createdAt)} at ${formatTime(o.createdAt)}</div>
      </div>
      ${statusBadge(status)}
    </div>

    <!-- Timeline -->
    ${status !== "cancelled" ? `
    <div style="display:flex;gap:0;align-items:flex-start;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;">
      ${timelineHTML}
    </div>` : `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
      <i class="fas fa-ban" style="color:#ef4444;"></i>
      <span style="font-size:0.85rem;color:#ef4444;font-weight:600;">This order has been cancelled</span>
    </div>`}

    <!-- Customer -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px;">
      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;"><i class="fas fa-user" style="margin-right:5px;"></i>Customer</div>
      <div style="font-weight:600;font-size:0.92rem;">${customerName}</div>
      <div style="font-size:0.82rem;color:var(--muted);margin-top:3px;">${customerEmail}</div>
      <div style="font-size:0.82rem;color:var(--muted);margin-top:2px;"><i class="fas fa-phone" style="font-size:0.72rem;margin-right:4px;"></i>${customerPhone}</div>
      <div style="font-size:0.82rem;color:var(--muted);margin-top:6px;display:flex;gap:6px;align-items:flex-start;">
        <i class="fas fa-map-marker-alt" style="margin-top:2px;flex-shrink:0;"></i><span>${address}</span>
      </div>
    </div>

    <!-- Items -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px;">
      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;"><i class="fas fa-box" style="margin-right:5px;"></i>Items</div>
      ${itemsHTML}
      <div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:4px;font-weight:700;">
        <span>Total</span><span style="color:var(--accent);">${currency} ${Number(total).toFixed(2)}</span>
      </div>
    </div>

    <!-- Status buttons -->
    <div style="margin-bottom:16px;">
      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;"><i class="fas fa-tag" style="margin-right:5px;"></i>Update Status</div>
      <div style="display:flex;gap:8px;">${statusBtns}</div>
    </div>

    <!-- Tracking -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;"><i class="fas fa-truck" style="margin-right:5px;"></i>Tracking Number</div>
      <div style="display:flex;gap:8px;">
        <input id="trackingInput" type="text" placeholder="e.g. GH1234567890, DHL-XXXX" value="${tracking}"
          style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:9px 12px;font-family:'DM Sans',sans-serif;font-size:0.88rem;">
        <button onclick="saveTracking('${id}')"
          style="padding:9px 16px;background:var(--accent);color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-family:'DM Sans',sans-serif;font-size:0.85rem;white-space:nowrap;flex-shrink:0;">
          <i class="fas fa-save"></i> Save
        </button>
      </div>
      <div id="trackingMsg" style="font-size:0.8rem;margin-top:6px;display:none;"></div>
    </div>
  `;

  document.getElementById("orderModal").classList.add("open");
};

window.closeOrderModal = () => document.getElementById("orderModal").classList.remove("open");

window.setOrderStatus = async (id, newStatus) => {
  if (!currentSeller) return;
  const order = allOrders.find(o => o.id === id);
  if (!order) return;
  if (newStatus === "cancelled" && order.status !== "cancelled") {
    if (!confirm("Cancel this order? This cannot be undone.")) return;
  }
  try {
    await updateDoc(doc(db, "orders", id), {
      status: newStatus,
      [`statusHistory.${newStatus}`]: new Date()
    });
    // Optimistic update + refresh modal
    const idx = allOrders.findIndex(o => o.id === id);
    if (idx >= 0) {
      allOrders[idx].status = newStatus;
      if (!allOrders[idx].statusHistory) allOrders[idx].statusHistory = {};
      allOrders[idx].statusHistory[newStatus] = { toDate: () => new Date(), seconds: Date.now() / 1000 };
    }
    openOrderModal(id);
  } catch (err) {
    console.error("Status update error:", err);
    alert("Failed to update order status ❌");
  }
};

window.saveTracking = async (id) => {
  const input = document.getElementById("trackingInput");
  const msgEl = document.getElementById("trackingMsg");
  if (!input || !currentSeller) return;
  const tracking = input.value.trim();
  try {
    await updateDoc(doc(db, "orders", id), { trackingNumber: tracking });
    const idx = allOrders.findIndex(o => o.id === id);
    if (idx >= 0) allOrders[idx].trackingNumber = tracking;
    if (msgEl) { msgEl.textContent = tracking ? "Tracking number saved ✅" : "Tracking number cleared"; msgEl.style.color = "#22c55e"; msgEl.style.display = "block"; setTimeout(() => msgEl.style.display = "none", 3000); }
  } catch (err) {
    console.error(err);
    if (msgEl) { msgEl.textContent = "Failed to save ❌"; msgEl.style.color = "#ef4444"; msgEl.style.display = "block"; }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD PRODUCT — MULTI-IMAGE GALLERY
// ─────────────────────────────────────────────────────────────────────────────
window.handleAddImages = (input) => {
  const remaining = 8 - addFormImages.length;
  Array.from(input.files).slice(0, remaining).forEach(file => {
    if (!file.type.startsWith("image/")) return;
    addFormImages.push({ file, previewURL: URL.createObjectURL(file) });
  });
  input.value = "";
  if (addFormActiveIdx === -1 && addFormImages.length > 0) addFormActiveIdx = 0;
  renderAddGallery();
};

window.setAddActive = (idx) => { addFormActiveIdx = idx; renderAddGallery(); };

window.deleteAddImage = (idx) => {
  URL.revokeObjectURL(addFormImages[idx].previewURL);
  addFormImages.splice(idx, 1);
  if (addFormImages.length === 0) addFormActiveIdx = -1;
  else if (addFormActiveIdx >= addFormImages.length) addFormActiveIdx = addFormImages.length - 1;
  renderAddGallery();
};

function renderAddGallery() {
  const mainWrap = document.getElementById("addMainImgWrap");
  const countEl  = document.getElementById("addImgCount");
  if (!mainWrap) return;
  if (addFormImages.length === 0) {
    mainWrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);gap:8px;font-size:0.85rem;"><i class="fas fa-image" style="font-size:2rem;opacity:0.3;"></i><span>No images yet — upload below</span></div>`;
  } else {
    const active = addFormImages[addFormActiveIdx] || addFormImages[0];
    mainWrap.innerHTML = `<img src="${active.previewURL}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"><button onclick="deleteAddImage(${addFormActiveIdx})" class="gallery-del-btn"><i class="fas fa-trash"></i></button>`;
  }
  if (countEl) countEl.textContent = `${addFormImages.length} / 8 images`;
  const thumbsEl = document.getElementById("addThumbsRow");
  if (thumbsEl) thumbsEl.innerHTML = addFormImages.map((img, i) => `<div onclick="setAddActive(${i})" class="gallery-thumb ${i === addFormActiveIdx ? 'active' : ''}"><img src="${img.previewURL}" alt="Thumb ${i+1}"></div>`).join("");
}

document.getElementById("sellerProductForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentSeller) return;
  const btn = document.getElementById("sSubmitBtn");
  const name     = document.getElementById("sName").value.trim();
  const price    = document.getElementById("sPrice").value;
  const stock    = document.getElementById("sStock").value;
  const currency = document.getElementById("sCurrency").value;
  const category = document.getElementById("sCategory").value.trim().toLowerCase();
  const isPromo  = document.getElementById("sIsPromo").checked;
  const discount = document.getElementById("sDiscount").value || 0;
  const cartLink = document.getElementById("sCartLink").value.trim() || "shop.html";
  if (!name || !price || !stock || !category) { showMsg("sProductMsg", "Please fill in all fields including category.", false); return; }
  btn.disabled = true; btn.textContent = "Uploading…";
  let imageURLs = [];
  if (addFormImages.length > 0) { try { imageURLs = await uploadMultipleToCloudinary(addFormImages.map(i => i.file)); } catch {} }
  const imageURL = imageURLs[0] || "images/no-image.png";
  try {
    const col = (category === "promo" || isPromo) ? "promotions" : "products";
    const data = { name, price: Number(price), stock: Number(stock), currency: currency || "GHS", category, imageURL, imageURLs, sellerUid: currentSeller.uid, sellerName: `${currentSeller.firstName || ""} ${currentSeller.lastName || ""}`.trim(), createdAt: new Date() };
    if (isPromo) { data.discount = Number(discount); data.cartLink = cartLink; data.active = true; }
    await addDoc(collection(db, col), data);
    showMsg("sProductMsg", "Product added successfully ✅", true);
    e.target.reset();
    addFormImages.forEach(i => URL.revokeObjectURL(i.previewURL));
    addFormImages = []; addFormActiveIdx = -1;
    renderAddGallery();
    document.getElementById("sImagePreview").style.display = "none";
  } catch (err) { console.error(err); showMsg("sProductMsg", "Failed to add product ❌", false); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Add Product'; }
});

// ─────────────────────────────────────────────────────────────────────────────
// EDIT MODAL — MULTI-IMAGE GALLERY
// ─────────────────────────────────────────────────────────────────────────────
window.openEditModal = (id) => {
  const p = allProducts.find(p => p.id === id);
  if (!p) return;
  document.getElementById("editProductId").value = id;
  document.getElementById("editName").value       = p.name;
  document.getElementById("editPrice").value      = p.price;
  document.getElementById("editStock").value      = p.stock;
  document.getElementById("editCurrency").value   = p.currency || "GHS";
  document.getElementById("editCategory").value   = p.category || "";
  editImages    = Array.isArray(p.imageURLs) && p.imageURLs.length > 0 ? p.imageURLs.map(url => ({ url })) : (p.imageURL && p.imageURL !== "images/no-image.png" ? [{ url: p.imageURL }] : []);
  editNewFiles  = [];
  editActiveIdx = editImages.length > 0 ? 0 : -1;
  renderEditGallery();
  document.getElementById("editModal").classList.add("open");
};

window.closeEditModal = () => {
  editNewFiles.forEach(f => URL.revokeObjectURL(f.previewURL));
  editNewFiles = []; editImages = []; editActiveIdx = -1;
  document.getElementById("editModal").classList.remove("open");
};

window.handleEditAddImages = (input) => {
  const remaining = 8 - editImages.length - editNewFiles.length;
  Array.from(input.files).slice(0, remaining).forEach(file => {
    if (!file.type.startsWith("image/")) return;
    editNewFiles.push({ file, previewURL: URL.createObjectURL(file) });
  });
  input.value = ""; renderEditGallery();
};

window.setEditActive    = (idx) => { editActiveIdx = idx; renderEditGallery(); };
window.deleteEditExistingImage = (idx) => {
  editImages.splice(idx, 1);
  const total = editImages.length + editNewFiles.length;
  editActiveIdx = total === 0 ? -1 : Math.min(editActiveIdx, total - 1);
  renderEditGallery();
};
window.deleteEditNewImage = (idx) => {
  URL.revokeObjectURL(editNewFiles[idx].previewURL);
  editNewFiles.splice(idx, 1);
  const total = editImages.length + editNewFiles.length;
  editActiveIdx = total === 0 ? -1 : Math.min(editActiveIdx, total - 1);
  renderEditGallery();
};

function renderEditGallery() {
  const mainWrap = document.getElementById("editMainImgWrap");
  const countEl  = document.getElementById("editImgCount");
  const thumbsEl = document.getElementById("editThumbsRow");
  if (!mainWrap) return;
  const allItems = [...editImages.map((img, i) => ({ src: img.url, type: "existing", idx: i })), ...editNewFiles.map((f, i) => ({ src: f.previewURL, type: "new", idx: i }))];
  if (countEl) countEl.textContent = `${allItems.length} / 8 images`;
  if (allItems.length === 0) {
    mainWrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);gap:8px;font-size:0.85rem;"><i class="fas fa-image" style="font-size:2rem;opacity:0.3;"></i><span>No images</span></div>`;
  } else {
    const a = allItems[editActiveIdx] || allItems[0];
    const delFn = a.type === "existing" ? `deleteEditExistingImage(${a.idx})` : `deleteEditNewImage(${a.idx})`;
    mainWrap.innerHTML = `<img src="${a.src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"><button onclick="${delFn}" class="gallery-del-btn"><i class="fas fa-trash"></i></button>`;
  }
  if (thumbsEl) thumbsEl.innerHTML = allItems.map((item, i) => `
    <div onclick="setEditActive(${i})" class="gallery-thumb ${i === editActiveIdx ? 'active' : ''}" style="position:relative;">
      <img src="${item.src}" alt="Thumb ${i+1}">
      ${item.type === "new" ? `<span class="new-badge">new</span>` : ""}
    </div>`).join("");
}

window.saveEditProduct = async () => {
  if (!currentSeller) return;
  const id = document.getElementById("editProductId").value;
  const p  = allProducts.find(p => p.id === id);
  if (!p || p.sellerUid !== currentSeller.uid) { showMsg("editMsg", "Access denied ❌", false); return; }
  const newName     = document.getElementById("editName").value.trim();
  const newPrice    = document.getElementById("editPrice").value;
  const newStock    = document.getElementById("editStock").value;
  const newCurrency = document.getElementById("editCurrency").value;
  const newCategory = document.getElementById("editCategory").value.trim().toLowerCase();
  if (!newName || !newPrice || !newStock) { showMsg("editMsg", "Please fill in all fields.", false); return; }
  const saveBtn = document.getElementById("editSaveBtn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
  let newUploadedURLs = [];
  if (editNewFiles.length > 0) { try { newUploadedURLs = await uploadMultipleToCloudinary(editNewFiles.map(f => f.file)); } catch (err) { console.error(err); } }
  const finalImageURLs = [...editImages.map(i => i.url), ...newUploadedURLs];
  const finalImageURL  = finalImageURLs[0] || "images/no-image.png";
  const col = p._collection || (p.category === "promo" ? "promotions" : "products");
  try {
    await updateDoc(doc(db, col, id), { name: newName, price: Number(newPrice), stock: Number(newStock), currency: newCurrency, category: newCategory, imageURL: finalImageURL, imageURLs: finalImageURLs });
    showMsg("editMsg", "Product updated ✅", true);
    editNewFiles.forEach(f => URL.revokeObjectURL(f.previewURL)); editNewFiles = [];
    setTimeout(closeEditModal, 1200);
  } catch (err) { console.error(err); showMsg("editMsg", "Update failed ❌", false); }
  finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Save Changes"; } }
};

// ── DELETE ────────────────────────────────────────────────────────────────────
window.confirmDelete = async (id) => {
  const p = allProducts.find(p => p.id === id);
  if (!p || p.sellerUid !== currentSeller.uid) { alert("Access denied ❌"); return; }
  if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
  const col = p._collection || (p.category === "promo" ? "promotions" : "products");
  try { await deleteDoc(doc(db, col, id)); showMsg("sProductMsg", "Product deleted ✅", true); }
  catch (err) { console.error(err); alert("Delete failed ❌"); }
};

// ── SAVE PROFILE ──────────────────────────────────────────────────────────────
window.saveProfile = async () => {
  if (!currentSeller) return;
  const firstName = document.getElementById("profileFirst").value.trim();
  const lastName  = document.getElementById("profileLast").value.trim();
  const storeName = document.getElementById("profileStore").value.trim();
  const phone     = document.getElementById("profilePhone").value.trim();
  const bio       = document.getElementById("profileBio").value.trim();
  try {
    await setDoc(doc(db, "users", currentSeller.uid), { firstName, lastName, storeName, phone, bio }, { merge: true });
    await updateProfile(auth.currentUser, { displayName: `${firstName} ${lastName}` });
    document.getElementById("profileFullName").textContent = `${firstName} ${lastName}`.trim();
    document.getElementById("sellerName").textContent      = firstName;
    showMsg("profileMsg", "Profile saved ✅", true);
  } catch (err) { console.error(err); showMsg("profileMsg", "Failed to save ❌", false); }
};

// ── AVATAR UPLOAD ─────────────────────────────────────────────────────────────
window.uploadProfileAvatar = async (input) => {
  const file = input.files[0];
  if (!file || !currentSeller) return;
  const bigAv = document.getElementById("profileAvatarBig");
  const sidebarAv = document.getElementById("sidebarAvatar");
  if (bigAv) bigAv.innerHTML = `<div class="spinner" style="width:30px;height:30px;border-width:2px;"></div>`;
  try {
    const photoURL = await uploadToCloudinary(file);
    await setDoc(doc(db, "users", currentSeller.uid), { photoURL }, { merge: true });
    if (bigAv)     bigAv.innerHTML     = `<img src="${photoURL}">`;
    if (sidebarAv) sidebarAv.innerHTML = `<img src="${photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } catch (err) { console.error(err); if (bigAv) bigAv.textContent = "❌"; }
};

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.getElementById("sellerLogoutBtn").addEventListener("click", async () => { await signOut(auth); window.location.href = "index.html"; });

// ── PANEL SWITCHING ───────────────────────────────────────────────────────────
const panelTitles = { overview: "Overview", products: "My Products", add: "Add Product", orders: "Orders",
  revenue: "Revenue", performance: "My performance",
  bulk: "Bulk Products", profile: "My Profile"};

window.showPanel = (name) => {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
  document.getElementById(`panel-${name}`).classList.add("active");
  document.getElementById(`nav-${name}`).classList.add("active");
  document.getElementById("topbarTitle").textContent = panelTitles[name] || name;
  if (window.innerWidth < 900) document.getElementById("sidebar").classList.remove("open");
};

// ── PROMO TOGGLE ──────────────────────────────────────────────────────────────
window.togglePromo = (cb) => { document.querySelectorAll(".promo-extra").forEach(el => el.classList.toggle("show", cb.checked)); };

// ── LEGACY IMAGE PREVIEW ──────────────────────────────────────────────────────
window.previewImage = (input) => {
  const preview = document.getElementById("sImagePreview");
  if (input.files?.[0]) { const r = new FileReader(); r.onload = e => { preview.src = e.target.result; preview.style.display = "block"; }; r.readAsDataURL(input.files[0]); }
};

// ── HAMBURGER ─────────────────────────────────────────────────────────────────
document.getElementById("hamburger").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));

// ── CLOSE MODALS ON BACKDROP ──────────────────────────────────────────────────
document.getElementById("editModal").addEventListener("click",  e => { if (e.target === document.getElementById("editModal"))  closeEditModal(); });
document.getElementById("orderModal").addEventListener("click", e => { if (e.target === document.getElementById("orderModal")) closeOrderModal(); });

// ── CLOSE MODALS ON BACKDROP ──────────────────────────────────────────────────
document.getElementById("editModal").addEventListener("click",  e => { if (e.target === document.getElementById("editModal"))  closeEditModal(); });
document.getElementById("orderModal").addEventListener("click", e => { if (e.target === document.getElementById("orderModal")) closeOrderModal(); });

// ── LAYOUT FIX — offset sidebar & main below fixed top bars ──────────────────
function fixLayout() {
  const wrap = document.querySelector('.top-bar-wrap');
  if (!wrap) return;
  const h = wrap.offsetHeight;
  document.querySelector('.sidebar').style.top     = h + 'px';
  document.querySelector('.sidebar').style.height  = `calc(100vh - ${h}px)`;
  document.querySelector('.main').style.paddingTop = h + 'px';
}

fixLayout();
window.addEventListener('resize', fixLayout);