import { db } from "./firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────────────────────
// SELLER PERFORMANCE MODULE
// Call initPerformance({ role: "seller"|"admin", sellerUid: "...", sellerData: {} })
// role = "admin"  → loads ALL sellers + their stats platform-wide
// role = "seller" → loads only current seller's own scorecard
// ─────────────────────────────────────────────────────────────────────────────

let perfRole      = "seller";
let perfSellerUid = null;
let perfSellerData = {};
let allPerfData   = [];
let perfSortBy    = "revenue";

export async function initPerformance({ role, sellerUid, sellerData = {} }) {
  perfRole       = role;
  perfSellerUid  = sellerUid;
  perfSellerData = sellerData;
  await loadPerformanceData();
}

// ── LOAD DATA ─────────────────────────────────────────────────────────────────
async function loadPerformanceData() {
  try {
    if (perfRole === "admin") {
      await loadAllSellersPerformance();
    } else {
      await loadOwnPerformance();
    }
  } catch (err) {
    console.error("Performance load error:", err);
  }
}

// ADMIN: aggregate all sellers from users + orders + products
async function loadAllSellersPerformance() {
  // 1. Get all approved sellers
  const usersSnap = await getDocs(
    query(collection(db, "users"), where("role", "==", "seller"), where("approved", "==", true))
  );
  const sellers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

  // 2. Get all orders
  const ordersSnap = await getDocs(collection(db, "orders"));
  const allOrders  = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 3. Get all products
  const productsSnap = await getDocs(collection(db, "products"));
  const allProducts  = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 4. Get all promotions
  const promosSnap = await getDocs(collection(db, "promotions"));
  const allPromos  = promosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 5. Build stats per seller
  allPerfData = sellers.map(seller => {
    const sOrders   = allOrders.filter(o => o.sellerUid === seller.uid);
    const sProducts = [...allProducts, ...allPromos].filter(p => p.sellerUid === seller.uid);
    const delivered = sOrders.filter(o => o.status === "delivered");
    const revenue   = delivered.reduce((s, o) => s + Number(o.total || o.amount || 0), 0);
    const lowStock  = sProducts.filter(p => p.stock <= 3 && p.stock > 0).length;
    const outStock  = sProducts.filter(p => p.stock === 0).length;

    // Score: weighted performance metric
    const score = Math.round(
      (delivered.length * 3) +
      (revenue / 100) +
      (sProducts.length * 1) -
      (lowStock * 2) -
      (outStock * 5)
    );

    return {
      uid:        seller.uid,
      name:       `${seller.firstName || ""} ${seller.lastName || ""}`.trim() || "Unknown",
      storeName:  seller.storeName || "—",
      email:      seller.email || "—",
      photoURL:   seller.photoURL || null,
      joinDate:   seller.createdAt || null,
      totalOrders:   sOrders.length,
      deliveredOrders: delivered.length,
      cancelledOrders: sOrders.filter(o => o.status === "cancelled").length,
      pendingOrders:   sOrders.filter(o => !o.status || o.status === "pending").length,
      revenue,
      totalProducts: sProducts.length,
      lowStock,
      outStock,
      score: Math.max(0, score),
      currency: sOrders[0]?.currency || "GHS"
    };
  });

  renderAdminPerformance();
}

// SELLER: load own scorecard
async function loadOwnPerformance() {
  const uid = perfSellerUid;

  // Orders
  let orders = [];
  try {
    const snap = await getDocs(query(collection(db, "orders"), where("sellerUid", "==", uid)));
    orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {}

  // Products
  let products = [];
  try {
    const pSnap = await getDocs(query(collection(db, "products"), where("sellerUid", "==", uid)));
    const promoSnap = await getDocs(query(collection(db, "promotions"), where("sellerUid", "==", uid)));
    products = [
      ...pSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      ...promoSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    ];
  } catch {}

  const delivered  = orders.filter(o => o.status === "delivered");
  const cancelled  = orders.filter(o => o.status === "cancelled");
  const pending    = orders.filter(o => !o.status || o.status === "pending");
  const shipped    = orders.filter(o => o.status === "shipped");
  const revenue    = delivered.reduce((s, o) => s + Number(o.total || o.amount || 0), 0);
  const lowStock   = products.filter(p => p.stock <= 3 && p.stock > 0).length;
  const outStock   = products.filter(p => p.stock === 0).length;
  const currency   = orders[0]?.currency || "GHS";

  const score = Math.max(0, Math.round(
    (delivered.length * 3) + (revenue / 100) + (products.length * 1) - (lowStock * 2) - (outStock * 5)
  ));

  const grade = getGrade(score);

  renderSellerScorecard({
    name:       `${perfSellerData.firstName || ""} ${perfSellerData.lastName || ""}`.trim() || "Seller",
    storeName:  perfSellerData.storeName || "My Store",
    photoURL:   perfSellerData.photoURL  || null,
    joinDate:   perfSellerData.createdAt || null,
    totalOrders: orders.length,
    deliveredOrders: delivered.length,
    cancelledOrders: cancelled.length,
    pendingOrders:   pending.length,
    shippedOrders:   shipped.length,
    revenue,
    totalProducts: products.length,
    lowStock,
    outStock,
    score,
    grade,
    currency,
    // Top 5 products by order frequency
    topProducts: getTopProducts(orders).slice(0, 5)
  });
}

// ── GRADE SYSTEM ──────────────────────────────────────────────────────────────
function getGrade(score) {
  if (score >= 200) return { label: "Elite",  color: "#f0b429", bg: "rgba(240,180,41,0.15)", icon: "fa-crown" };
  if (score >= 100) return { label: "Gold",   color: "#22c55e", bg: "rgba(34,197,94,0.15)",  icon: "fa-medal" };
  if (score >= 50)  return { label: "Silver", color: "#4f8ef7", bg: "rgba(79,142,247,0.15)", icon: "fa-star" };
  if (score >= 20)  return { label: "Bronze", color: "#e85d26", bg: "rgba(232,93,38,0.15)",  icon: "fa-star-half" };
  return             { label: "Starter", color: "#6b7280", bg: "rgba(107,114,128,0.15)", icon: "fa-seedling" };
}

function getTopProducts(orders) {
  const map = {};
  orders.forEach(o => {
    if (Array.isArray(o.items)) {
      o.items.forEach(item => {
        const name = item.name || "Unknown";
        map[name] = (map[name] || 0) + Number(item.qty || item.quantity || 1);
      });
    } else if (o.productName) {
      map[o.productName] = (map[o.productName] || 0) + 1;
    }
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, qty]) => ({ name, qty }));
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt(n, currency = "GHS") {
  return `${currency} ${Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELLER SCORECARD RENDER
// ─────────────────────────────────────────────────────────────────────────────
function renderSellerScorecard(data) {
  const wrap = document.getElementById("perfScorecardWrap");
  if (!wrap) return;

  const grade    = data.grade;
  const initials = data.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const deliveryRate = data.totalOrders > 0
    ? Math.round((data.deliveredOrders / data.totalOrders) * 100)
    : 0;
  const cancelRate = data.totalOrders > 0
    ? Math.round((data.cancelledOrders / data.totalOrders) * 100)
    : 0;

  wrap.innerHTML = `
    <!-- Grade banner -->
    <div style="background:${grade.bg};border:1px solid ${grade.color}33;border-radius:var(--radius);padding:20px 24px;margin-bottom:24px;display:flex;align-items:center;gap:16px;">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:700;font-size:1.2rem;color:#000;flex-shrink:0;overflow:hidden;">
        ${data.photoURL ? `<img src="${data.photoURL}" style="width:100%;height:100%;object-fit:cover;">` : initials}
      </div>
      <div style="flex:1;">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:1rem;">${data.name}</div>
        <div style="font-size:0.8rem;color:var(--muted);margin-top:2px;">${data.storeName} · Joined ${formatDate(data.joinDate)}</div>
      </div>
      <div style="text-align:center;flex-shrink:0;">
        <div style="background:${grade.bg};border:1.5px solid ${grade.color};border-radius:10px;padding:8px 16px;display:inline-flex;align-items:center;gap:8px;">
          <i class="fas ${grade.icon}" style="color:${grade.color};font-size:1.1rem;"></i>
          <div>
            <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:${grade.color};">${grade.label}</div>
            <div style="font-size:0.7rem;color:var(--muted);">Score: ${data.score}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="perf-stat-grid" style="margin-bottom:24px;">
      <div class="perf-stat">
        <i class="fas fa-shopping-bag" style="color:var(--accent);"></i>
        <div class="perf-stat-val">${data.totalOrders}</div>
        <div class="perf-stat-lbl">Total Orders</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-circle-check" style="color:var(--success);"></i>
        <div class="perf-stat-val" style="color:var(--success);">${data.deliveredOrders}</div>
        <div class="perf-stat-lbl">Delivered</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-truck" style="color:var(--blue);"></i>
        <div class="perf-stat-val" style="color:var(--blue);">${data.shippedOrders}</div>
        <div class="perf-stat-lbl">Shipped</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-ban" style="color:var(--danger);"></i>
        <div class="perf-stat-val" style="color:var(--danger);">${data.cancelledOrders}</div>
        <div class="perf-stat-lbl">Cancelled</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-coins" style="color:var(--accent);"></i>
        <div class="perf-stat-val">${fmt(data.revenue, data.currency)}</div>
        <div class="perf-stat-lbl">Revenue</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-box" style="color:var(--muted);"></i>
        <div class="perf-stat-val">${data.totalProducts}</div>
        <div class="perf-stat-lbl">Products</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-exclamation-triangle" style="color:#f59e0b;"></i>
        <div class="perf-stat-val" style="color:#f59e0b;">${data.lowStock}</div>
        <div class="perf-stat-lbl">Low Stock</div>
      </div>
      <div class="perf-stat">
        <i class="fas fa-times-circle" style="color:var(--danger);"></i>
        <div class="perf-stat-val" style="color:var(--danger);">${data.outStock}</div>
        <div class="perf-stat-lbl">Out of Stock</div>
      </div>
    </div>

    <!-- Progress bars -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title"><i class="fas fa-chart-bar"></i> Performance Rates</div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.82rem;">
            <span style="color:var(--muted);">Delivery Rate</span>
            <span style="font-weight:600;color:var(--success);">${deliveryRate}%</span>
          </div>
          <div style="background:var(--border);border-radius:99px;height:8px;overflow:hidden;">
            <div style="width:${deliveryRate}%;height:100%;background:var(--success);border-radius:99px;transition:width .6s;"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.82rem;">
            <span style="color:var(--muted);">Cancellation Rate</span>
            <span style="font-weight:600;color:var(--danger);">${cancelRate}%</span>
          </div>
          <div style="background:var(--border);border-radius:99px;height:8px;overflow:hidden;">
            <div style="width:${cancelRate}%;height:100%;background:var(--danger);border-radius:99px;transition:width .6s;"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.82rem;">
            <span style="color:var(--muted);">Stock Health</span>
            <span style="font-weight:600;color:${data.outStock > 0 ? 'var(--danger)' : data.lowStock > 0 ? '#f59e0b' : 'var(--success)'};">${data.outStock > 0 ? 'Needs Attention' : data.lowStock > 0 ? 'Low on Some' : 'Healthy'}</span>
          </div>
          <div style="background:var(--border);border-radius:99px;height:8px;overflow:hidden;">
            <div style="width:${data.totalProducts > 0 ? Math.round(((data.totalProducts - data.outStock - data.lowStock) / data.totalProducts) * 100) : 0}%;height:100%;background:${data.outStock > 0 ? 'var(--danger)' : data.lowStock > 0 ? '#f59e0b' : 'var(--success)'};border-radius:99px;transition:width .6s;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top products -->
    ${data.topProducts.length > 0 ? `
    <div class="card">
      <div class="card-title"><i class="fas fa-fire"></i> Your Top Products</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${data.topProducts.map((p, i) => `
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-family:'Syne',sans-serif;font-size:0.75rem;color:var(--muted);width:18px;text-align:right;">${i + 1}</span>
            <div style="flex:1;">
              <div style="font-size:0.85rem;font-weight:500;margin-bottom:4px;">${p.name}</div>
              <div style="background:var(--border);border-radius:99px;height:6px;overflow:hidden;">
                <div style="width:${Math.round((p.qty / data.topProducts[0].qty) * 100)}%;height:100%;background:var(--accent);border-radius:99px;"></div>
              </div>
            </div>
            <span style="font-size:0.82rem;color:var(--muted);white-space:nowrap;">${p.qty} sold</span>
          </div>`).join("")}
      </div>
    </div>` : ""}

    <!-- Improvement tips -->
    <div class="card" style="margin-top:24px;">
      <div class="card-title"><i class="fas fa-lightbulb"></i> Tips to Improve</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${data.outStock > 0 ? `<div class="perf-tip perf-tip-danger"><i class="fas fa-times-circle"></i> You have <strong>${data.outStock}</strong> out-of-stock product${data.outStock > 1 ? 's' : ''} — restock to avoid losing sales.</div>` : ""}
        ${data.lowStock > 0 ? `<div class="perf-tip perf-tip-warn"><i class="fas fa-exclamation-triangle"></i> <strong>${data.lowStock}</strong> product${data.lowStock > 1 ? 's are' : ' is'} running low — restock soon.</div>` : ""}
        ${cancelRate > 20 ? `<div class="perf-tip perf-tip-danger"><i class="fas fa-ban"></i> Your cancellation rate is <strong>${cancelRate}%</strong> — try to confirm orders faster.</div>` : ""}
        ${deliveryRate >= 80 ? `<div class="perf-tip perf-tip-success"><i class="fas fa-circle-check"></i> Great delivery rate of <strong>${deliveryRate}%</strong> — keep it up!</div>` : ""}
        ${data.totalProducts < 5 ? `<div class="perf-tip perf-tip-info"><i class="fas fa-box"></i> Add more products to increase your visibility in the store.</div>` : ""}
        ${data.outStock === 0 && data.lowStock === 0 && cancelRate <= 20 && deliveryRate >= 80 ? `<div class="perf-tip perf-tip-success"><i class="fas fa-star"></i> Excellent! Your store is performing well across all metrics.</div>` : ""}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: ALL SELLERS TABLE
// ─────────────────────────────────────────────────────────────────────────────
function renderAdminPerformance() {
  const wrap = document.getElementById("perfAdminWrap");
  if (!wrap) return;

  // Sort controls
  const sorted = [...allPerfData].sort((a, b) => {
    if (perfSortBy === "revenue")  return b.revenue - a.revenue;
    if (perfSortBy === "orders")   return b.totalOrders - a.totalOrders;
    if (perfSortBy === "products") return b.totalProducts - a.totalProducts;
    if (perfSortBy === "score")    return b.score - a.score;
    return b.revenue - a.revenue;
  });

  if (sorted.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>No approved sellers found</p></div>`;
    return;
  }

  // Summary strip
  const totalRevenue = allPerfData.reduce((s, s2) => s + s2.revenue, 0);
  const totalOrders  = allPerfData.reduce((s, s2) => s + s2.totalOrders, 0);
  const currency     = allPerfData[0]?.currency || "GHS";

  wrap.innerHTML = `
    <!-- Summary -->
    <div class="perf-admin-summary">
      <div class="perf-admin-sum-card">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;">Total Sellers</div>
        <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:700;">${allPerfData.length}</div>
      </div>
      <div class="perf-admin-sum-card">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;">Platform Revenue</div>
        <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:700;color:var(--accent);">${fmt(totalRevenue, currency)}</div>
      </div>
      <div class="perf-admin-sum-card">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;">Total Orders</div>
        <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:700;">${totalOrders}</div>
      </div>
      <div class="perf-admin-sum-card">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;">Avg Revenue/Seller</div>
        <div style="font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:700;">${fmt(allPerfData.length > 0 ? totalRevenue / allPerfData.length : 0, currency)}</div>
      </div>
    </div>

    <!-- Sort controls -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
      ${["score","revenue","orders","products"].map(s => `
        <button onclick="setPerfSort('${s}')" class="perf-sort-btn ${perfSortBy === s ? 'active' : ''}" data-sort="${s}">
          ${s.charAt(0).toUpperCase() + s.slice(1)}
        </button>`).join("")}
    </div>

    <!-- Sellers table -->
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Seller</th>
              <th>Grade</th>
              <th>Orders</th>
              <th>Delivered</th>
              <th>Revenue</th>
              <th>Products</th>
              <th>Low Stock</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((s, i) => {
              const grade    = getGrade(s.score);
              const initials = s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
              const delivRate = s.totalOrders > 0 ? Math.round((s.deliveredOrders / s.totalOrders) * 100) : 0;
              return `
              <tr>
                <td style="font-family:'Syne',sans-serif;font-size:0.78rem;color:var(--muted);width:32px;">${i + 1}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#000;flex-shrink:0;overflow:hidden;">
                      ${s.photoURL ? `<img src="${s.photoURL}" style="width:100%;height:100%;object-fit:cover;">` : initials}
                    </div>
                    <div>
                      <div style="font-weight:600;font-size:0.88rem;">${s.name}</div>
                      <div style="font-size:0.74rem;color:var(--muted);">${s.storeName}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${grade.bg};color:${grade.color};border:1px solid ${grade.color}33;">
                    <i class="fas ${grade.icon}" style="font-size:0.65rem;"></i>${grade.label}
                  </span>
                </td>
                <td style="text-align:center;">${s.totalOrders}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div style="flex:1;background:var(--border);border-radius:99px;height:5px;overflow:hidden;min-width:40px;">
                      <div style="width:${delivRate}%;height:100%;background:var(--success);border-radius:99px;"></div>
                    </div>
                    <span style="font-size:0.75rem;color:var(--muted);white-space:nowrap;">${delivRate}%</span>
                  </div>
                </td>
                <td style="font-weight:600;font-size:0.85rem;color:var(--accent);">${fmt(s.revenue, s.currency)}</td>
                <td style="text-align:center;">${s.totalProducts}</td>
                <td style="text-align:center;">
                  ${s.lowStock > 0 || s.outStock > 0
                    ? `<span style="color:${s.outStock > 0 ? 'var(--danger)' : '#f59e0b'};font-size:0.82rem;font-weight:600;">
                        ${s.outStock > 0 ? `${s.outStock} out` : `${s.lowStock} low`}
                       </span>`
                    : `<span style="color:var(--success);font-size:0.82rem;">✓</span>`}
                </td>
                <td style="font-size:0.78rem;color:var(--muted);white-space:nowrap;">${formatDate(s.joinDate)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.setPerfSort = (sortBy) => {
  perfSortBy = sortBy;
  document.querySelectorAll(".perf-sort-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.sort === sortBy)
  );
  renderAdminPerformance();
};