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
// REVENUE MODULE
// Call initRevenue({ role: "seller"|"admin", sellerUid: "..." })
// role = "admin"  → queries ALL orders platform-wide
// role = "seller" → queries only orders where sellerUid matches
// ─────────────────────────────────────────────────────────────────────────────

let revenueRole      = "seller";
let revenueSellerUid = null;
let activeFilter     = "month";
let allRevenueOrders = [];
let chartBars        = [];

export async function initRevenue({ role, sellerUid }) {
  revenueRole      = role;
  revenueSellerUid = sellerUid;
  await loadRevenueOrders();
  renderRevenue();
}

// ── LOAD ORDERS ───────────────────────────────────────────────────────────────
async function loadRevenueOrders() {
  try {
    let q;
    if (revenueRole === "admin") {
      q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    } else {
      q = query(
        collection(db, "orders"),
        where("sellerUid", "==", revenueSellerUid),
        orderBy("createdAt", "desc")
      );
    }
    const snap = await getDocs(q);
    allRevenueOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Fallback without orderBy if index missing
    try {
      let q2 = revenueRole === "admin"
        ? query(collection(db, "orders"))
        : query(collection(db, "orders"), where("sellerUid", "==", revenueSellerUid));
      const snap = await getDocs(q2);
      allRevenueOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    } catch (e) {
      console.error("Revenue load error:", e);
      allRevenueOrders = [];
    }
  }
}

// ── FILTER HELPERS ────────────────────────────────────────────────────────────
function getFilteredOrders(filter) {
  const now   = new Date();
  const start = new Date();

  if (filter === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    start.setDate(1); start.setHours(0, 0, 0, 0);
  } else if (filter === "year") {
    start.setMonth(0); start.setDate(1); start.setHours(0, 0, 0, 0);
  } else {
    return allRevenueOrders; // "all"
  }

  return allRevenueOrders.filter(o => {
    const ts = o.createdAt?.seconds
      ? new Date(o.createdAt.seconds * 1000)
      : o.createdAt instanceof Date ? o.createdAt : null;
    return ts && ts >= start;
  });
}

function toDate(ts) {
  if (!ts) return null;
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return null;
}

// ── MAIN RENDER ───────────────────────────────────────────────────────────────
window.setRevenueFilter = (filter) => {
  activeFilter = filter;
  document.querySelectorAll(".rev-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.filter === filter)
  );
  renderRevenue();
};

function renderRevenue() {
  const orders   = getFilteredOrders(activeFilter);
  const delivered = orders.filter(o => o.status === "delivered");
  const currency  = orders[0]?.currency || "GHS";

  // ── STAT CARDS ─────────────────────────────────────────────────────────────
  const totalRevenue = delivered.reduce((s, o) => s + Number(o.total || o.amount || 0), 0);
  const totalOrders  = orders.length;
  const avgOrder     = totalOrders > 0 ? totalRevenue / (delivered.length || 1) : 0;
  const pendingRev   = orders
    .filter(o => !o.status || o.status === "pending")
    .reduce((s, o) => s + Number(o.total || o.amount || 0), 0);

  setEl("revTotalSales",   `${currency} ${totalRevenue.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  setEl("revOrderCount",   totalOrders);
  setEl("revAvgOrder",     `${currency} ${avgOrder.toFixed(2)}`);
  setEl("revPending",      `${currency} ${pendingRev.toFixed(2)}`);

  renderChart(orders, activeFilter);
  renderTopProducts(orders);
  if (revenueRole === "admin") renderTopSellers(orders);
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── CHART ─────────────────────────────────────────────────────────────────────
function renderChart(orders, filter) {
  const wrap = document.getElementById("revChartWrap");
  if (!wrap) return;

  // Build buckets
  const buckets = {};
  const now = new Date();

  if (filter === "today") {
    for (let h = 0; h < 24; h++) buckets[`${h}:00`] = 0;
    orders.forEach(o => {
      const d = toDate(o.createdAt);
      if (d) { const k = `${d.getHours()}:00`; buckets[k] = (buckets[k] || 0) + Number(o.total || o.amount || 0); }
    });
  } else if (filter === "week") {
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(now.getDate() - i);
      buckets[days[d.getDay()] + ` ${d.getDate()}`] = 0;
    }
    orders.forEach(o => {
      const d = toDate(o.createdAt);
      if (d) { const k = days[d.getDay()] + ` ${d.getDate()}`; if (k in buckets) buckets[k] += Number(o.total || o.amount || 0); }
    });
  } else if (filter === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) buckets[i] = 0;
    orders.forEach(o => {
      const d = toDate(o.createdAt);
      if (d && d.getMonth() === now.getMonth()) buckets[d.getDate()] = (buckets[d.getDate()] || 0) + Number(o.total || o.amount || 0);
    });
  } else if (filter === "year") {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    months.forEach(m => buckets[m] = 0);
    orders.forEach(o => {
      const d = toDate(o.createdAt);
      if (d && d.getFullYear() === now.getFullYear()) { const k = months[d.getMonth()]; buckets[k] += Number(o.total || o.amount || 0); }
    });
  } else {
    // All time — group by month/year
    orders.forEach(o => {
      const d = toDate(o.createdAt);
      if (d) {
        const k = `${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
        buckets[k] = (buckets[k] || 0) + Number(o.total || o.amount || 0);
      }
    });
  }

  const labels = Object.keys(buckets);
  const values = Object.values(buckets);
  const max    = Math.max(...values, 1);

  wrap.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:0 4px;">
      ${labels.map((label, i) => {
        const pct = Math.round((values[i] / max) * 100);
        const val = values[i];
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;" title="${label}: ${val.toFixed(2)}">
            <div style="width:100%;background:var(--accent);border-radius:3px 3px 0 0;height:${Math.max(pct, values[i] > 0 ? 4 : 0)}%;opacity:${values[i] > 0 ? 1 : 0.15};transition:height .3s;"></div>
          </div>`;
      }).join("")}
    </div>
    <div style="display:flex;gap:4px;padding:4px 4px 0;overflow:hidden;">
      ${labels.map((label, i) => `
        <div style="flex:1;font-size:9px;color:var(--muted);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${
          labels.length > 15 && i % 3 !== 0 ? "" : label
        }</div>`).join("")}
    </div>`;
}

// ── TOP PRODUCTS ──────────────────────────────────────────────────────────────
function renderTopProducts(orders) {
  const tbody = document.getElementById("revTopProductsBody");
  if (!tbody) return;

  const map = {};
  orders.forEach(o => {
    if (Array.isArray(o.items)) {
      o.items.forEach(item => {
        const name = item.name || "Unknown";
        if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
        map[name].qty     += Number(item.qty || item.quantity || 1);
        map[name].revenue += Number(item.price || 0) * Number(item.qty || item.quantity || 1);
      });
    } else if (o.productName) {
      const name = o.productName;
      if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
      map[name].qty     += 1;
      map[name].revenue += Number(o.total || o.amount || 0);
    }
  });

  const sorted = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const currency = orders[0]?.currency || "GHS";

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><i class="fas fa-box-open"></i><p>No product data</p></div></td></tr>`;
    return;
  }

  const maxRev = sorted[0].revenue || 1;
  tbody.innerHTML = sorted.map((p, i) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-family:'Syne',sans-serif;font-size:0.75rem;color:var(--muted);width:16px;text-align:right;">${i + 1}</span>
          <div>
            <div style="font-weight:500;font-size:0.85rem;">${p.name}</div>
            <div style="width:${Math.round((p.revenue/maxRev)*100)}%;height:3px;background:var(--accent);border-radius:2px;margin-top:4px;opacity:0.7;"></div>
          </div>
        </div>
      </td>
      <td style="text-align:center;font-size:0.82rem;color:var(--muted);">${p.qty}</td>
      <td style="text-align:right;font-weight:600;font-size:0.85rem;">${currency} ${p.revenue.toFixed(2)}</td>
    </tr>`).join("");
}

// ── TOP SELLERS (admin only) ──────────────────────────────────────────────────
function renderTopSellers(orders) {
  const tbody = document.getElementById("revTopSellersBody");
  if (!tbody) return;

  const map = {};
  orders.forEach(o => {
    const uid  = o.sellerUid  || "unknown";
    const name = o.sellerName || "Unknown Seller";
    if (!map[uid]) map[uid] = { uid, name, orders: 0, revenue: 0 };
    map[uid].orders++;
    map[uid].revenue += Number(o.total || o.amount || 0);
  });

  const sorted   = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const currency = orders[0]?.currency || "GHS";

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><i class="fas fa-users"></i><p>No seller data</p></div></td></tr>`;
    return;
  }

  const maxRev = sorted[0].revenue || 1;
  tbody.innerHTML = sorted.map((s, i) => {
    const initials = s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-family:'Syne',sans-serif;font-size:0.75rem;color:var(--muted);width:16px;text-align:right;">${i + 1}</span>
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#000;flex-shrink:0;">${initials}</div>
          <div>
            <div style="font-weight:500;font-size:0.85rem;">${s.name}</div>
            <div style="width:${Math.round((s.revenue/maxRev)*100)}%;height:3px;background:var(--accent2);border-radius:2px;margin-top:4px;opacity:0.7;"></div>
          </div>
        </div>
      </td>
      <td style="text-align:center;font-size:0.82rem;color:var(--muted);">${s.orders}</td>
      <td style="text-align:right;font-weight:600;font-size:0.85rem;">${currency} ${s.revenue.toFixed(2)}</td>
    </tr>`;
  }).join("");
}