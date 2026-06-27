// export-orders.js
// Drop-in module: import in seller.js or add as <script type="module"> in seller-dashboard.html
// Requires SheetJS (loaded from CDN in the HTML)

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ─── Format a Firestore Timestamp or ISO string ───────────────────────────────
function fmtDate(val) {
  if (!val) return "";
  try {
    const d = val.toDate ? val.toDate() : new Date(val);
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return String(val);
  }
}

// ─── Flatten one order into a row object ─────────────────────────────────────
function flattenOrder(id, o) {
  const itemNames  = (o.items || []).map(i => i.name).join(" | ");
  const itemQtys   = (o.items || []).map(i => `${i.name} x${i.qty}`).join(" | ");
  const itemPrices = (o.items || []).map(i =>
    `${i.currency || "GHS"} ${Number(i.price || 0).toFixed(2)}`
  ).join(" | ");

  return {
    "Order ID":       id,
    "Date":           fmtDate(o.createdAt),
    "Status":         o.status || "",
    "Customer Name":  o.name   || "",
    "Email":          o.email  || "",
    "Phone":          o.phone  || "",
    "Address":        o.address || "",
    "Items":          itemNames,
    "Item Details":   itemQtys,
    "Item Prices":    itemPrices,
    "Total (GHS)":    Number(o.total || 0).toFixed(2),
    "Payment Ref":    o.paymentRef || "N/A",
  };
}

// ─── Fetch orders from Firestore ─────────────────────────────────────────────
// Pass sellerUid to filter by seller's products, or null for all orders (admin)
async function fetchOrders({ sellerUid = null, status = null } = {}) {
  let q = collection(db, "orders");
  const constraints = [orderBy("createdAt", "desc")];
  if (status && status !== "all") constraints.push(where("status", "==", status));

  const snap = await getDocs(query(q, ...constraints));
  const rows = [];

  snap.forEach(doc => {
    const o = doc.data();

    // If sellerUid is given, only include orders containing that seller's products
    if (sellerUid) {
      const hasSellerItem = (o.items || []).some(i => i.sellerUid === sellerUid);
      if (!hasSellerItem) return;
    }

    rows.push(flattenOrder(doc.id, o));
  });

  return rows;
}

// ─── Export to CSV ────────────────────────────────────────────────────────────
function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape  = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines   = [headers.map(escape).join(",")];
  rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(",")));
  return lines.join("\r\n");
}

function downloadCsv(rows, filename) {
  const csv  = rowsToCsv(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

// ─── Export to Excel (XLSX via SheetJS) ──────────────────────────────────────
function downloadExcel(rows, filename) {
  if (typeof XLSX === "undefined") {
    alert("Excel library not loaded. Try CSV export instead.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto column widths
  const cols = Object.keys(rows[0] || {});
  ws["!cols"] = cols.map(key => {
    const maxLen = Math.max(key.length, ...rows.map(r => String(r[key] ?? "").length));
    return { wch: Math.min(maxLen + 2, 50) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Orders");

  // Summary sheet
  const total   = rows.reduce((s, r) => s + Number(r["Total (GHS)"] || 0), 0);
  const summary = [
    { Metric: "Total Orders",   Value: rows.length },
    { Metric: "Total Revenue",  Value: `GHS ${total.toFixed(2)}` },
    { Metric: "Exported On",    Value: new Date().toLocaleString() },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  XLSX.writeFile(wb, filename);
}

// ─── Trigger browser download ─────────────────────────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"), {
    href: url, download: filename
  });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ─── Filename helper ──────────────────────────────────────────────────────────
function buildFilename(ext, status) {
  const date   = new Date().toISOString().slice(0, 10);
  const suffix = status && status !== "all" ? `_${status}` : "";
  return `rahmangrow_orders${suffix}_${date}.${ext}`;
}

// ─── Main export entry point (called from UI) ─────────────────────────────────
// format: "xlsx" | "csv"
// sellerUid: string | null
// status: "all" | "Pending Payment" | "Paid" | "Shipped" | "Delivered" | "Cancelled"
window.exportOrders = async function(format = "xlsx", sellerUid = null, status = "all") {
  const btn = document.getElementById("exportOrdersBtn");
  if (btn) {
    btn.disabled     = true;
    btn.innerHTML    = `<i class="fas fa-spinner fa-spin"></i> Exporting…`;
  }

  try {
    const rows = await fetchOrders({ sellerUid, status });

    if (!rows.length) {
      alert("No orders found to export.");
      return;
    }

    const filename = buildFilename(format === "xlsx" ? "xlsx" : "csv", status);
    format === "xlsx" ? downloadExcel(rows, filename) : downloadCsv(rows, filename);

  } catch (err) {
    console.error("Export failed:", err);
    alert("Export failed: " + (err.message || "Unknown error"));
  } finally {
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = `<i class="fas fa-file-export"></i> Export Orders`;
    }
  }
};