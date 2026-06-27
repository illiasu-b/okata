import { db } from "./firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────────────────────
// BULK PRODUCT MANAGEMENT MODULE
// Call initBulkProducts({ role: "seller"|"admin", sellerUid: "..." })
// role = "admin"  → loads ALL products platform-wide, can edit/delete any
// role = "seller" → loads only this seller's products
// ─────────────────────────────────────────────────────────────────────────────

let bulkRole      = "seller";
let bulkSellerUid = null;
let allBulkProducts = [];   // full list loaded from Firestore
let filteredProducts = [];  // after search/filter
let selectedIds   = new Set(); // selected product ids
let bulkSortBy    = "name";
let bulkSortDir   = "asc";
let bulkSearchVal = "";
let bulkCatFilter = "";

export async function initBulkProducts({ role, sellerUid }) {
  bulkRole      = role;
  bulkSellerUid = sellerUid;
  await loadBulkProducts();
  renderBulkTable();
}

// ── LOAD ──────────────────────────────────────────────────────────────────────
async function loadBulkProducts() {
  allBulkProducts = [];
  try {
    // Products collection
    const pQuery = bulkRole === "admin"
      ? query(collection(db, "products"))
      : query(collection(db, "products"), where("sellerUid", "==", bulkSellerUid));
    const pSnap = await getDocs(pQuery);
    const products = pSnap.docs.map(d => ({ id: d.id, _col: "products", ...d.data() }));

    // Promotions collection
    const promoQuery = bulkRole === "admin"
      ? query(collection(db, "promotions"))
      : query(collection(db, "promotions"), where("sellerUid", "==", bulkSellerUid));
    const promoSnap = await getDocs(promoQuery);
    const promos = promoSnap.docs.map(d => ({ id: d.id, _col: "promotions", ...d.data() }));

    allBulkProducts = [...products, ...promos];
  } catch (err) {
    console.error("Bulk load error:", err);
  }
  applyFilters();
}

// ── FILTER + SORT ─────────────────────────────────────────────────────────────
function applyFilters() {
  let list = [...allBulkProducts];

  // Search
  if (bulkSearchVal) {
    const s = bulkSearchVal.toLowerCase();
    list = list.filter(p =>
      (p.name || "").toLowerCase().includes(s) ||
      (p.category || "").toLowerCase().includes(s) ||
      (p.sellerName || "").toLowerCase().includes(s)
    );
  }

  // Category filter
  if (bulkCatFilter) {
    list = list.filter(p => (p.category || "") === bulkCatFilter);
  }

  // Sort
  list.sort((a, b) => {
    let va = a[bulkSortBy] ?? "";
    let vb = b[bulkSortBy] ?? "";
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return bulkSortDir === "asc" ? -1 : 1;
    if (va > vb) return bulkSortDir === "asc" ? 1 : -1;
    return 0;
  });

  filteredProducts = list;
  updateSelectionCount();
}

// ── RENDER TABLE ──────────────────────────────────────────────────────────────
function renderBulkTable() {
  const wrap = document.getElementById("bulkTableWrap");
  if (!wrap) return;

  if (filteredProducts.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No products found</p></div>`;
    return;
  }

  // Collect unique categories for filter dropdown
  const cats = [...new Set(allBulkProducts.map(p => p.category).filter(Boolean))];
  const catSelect = document.getElementById("bulkCatFilter");
  if (catSelect && catSelect.children.length <= 1) {
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      catSelect.appendChild(opt);
    });
  }

  const allSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:36px;">
              <input type="checkbox" id="bulkSelectAll" ${allSelected ? "checked" : ""}
                onchange="bulkToggleAll(this.checked)" style="accent-color:var(--accent,#f0b429);width:auto;">
            </th>
            <th style="cursor:pointer;" onclick="bulkSort('name')">
              Name ${bulkSortBy === 'name' ? (bulkSortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            ${bulkRole === "admin" ? `<th>Seller</th>` : ""}
            <th style="cursor:pointer;" onclick="bulkSort('category')">
              Category ${bulkSortBy === 'category' ? (bulkSortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th style="cursor:pointer;" onclick="bulkSort('price')">
              Price ${bulkSortBy === 'price' ? (bulkSortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th style="cursor:pointer;" onclick="bulkSort('stock')">
              Stock ${bulkSortBy === 'stock' ? (bulkSortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          ${filteredProducts.map(p => {
            const img = (Array.isArray(p.imageURLs) && p.imageURLs[0]) || p.imageURL || null;
            const isSelected = selectedIds.has(p.id);
            return `
            <tr class="${isSelected ? 'bulk-row-selected' : ''}" onclick="bulkToggleRow('${p.id}', event)">
              <td onclick="event.stopPropagation()">
                <input type="checkbox" ${isSelected ? "checked" : ""}
                  onchange="bulkToggleRow('${p.id}', event)"
                  style="accent-color:var(--accent,#f0b429);width:auto;">
              </td>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  ${img
                    ? `<img src="${img}" style="width:38px;height:38px;border-radius:7px;object-fit:cover;flex-shrink:0;">`
                    : `<div style="width:38px;height:38px;border-radius:7px;background:var(--surface,#161920);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-image" style="color:var(--muted,#6b7280);font-size:0.9rem;"></i></div>`
                  }
                  <span style="font-weight:500;font-size:0.88rem;">${p.name || "—"}</span>
                </div>
              </td>
              ${bulkRole === "admin" ? `<td style="font-size:0.8rem;color:var(--muted,#6b7280);">${p.sellerName || "—"}</td>` : ""}
              <td>
                <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:rgba(255,255,255,0.06);color:var(--muted,#6b7280);">
                  ${p.category || "—"}
                </span>
              </td>
              <td style="font-weight:600;font-size:0.88rem;">${p.currency || 'GHS'} ${Number(p.price || 0).toFixed(2)}</td>
              <td>
                <span style="padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;
                  background:${p.stock === 0 ? 'rgba(239,68,68,0.12)' : p.stock <= 3 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)'};
                  color:${p.stock === 0 ? '#ef4444' : p.stock <= 3 ? '#f59e0b' : '#22c55e'};">
                  ${p.stock === 0 ? '⚠ Out' : p.stock <= 3 ? '⚠ ' + p.stock : p.stock}
                </span>
              </td>
              <td>
                <span style="font-size:0.72rem;color:var(--muted,#6b7280);">
                  ${p._col === 'promotions' ? '🏷 Promo' : '📦 Product'}
                </span>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

  updateSelectionCount();
}

function updateSelectionCount() {
  const countEl  = document.getElementById("bulkSelectedCount");
  const actionsEl = document.getElementById("bulkActions");
  const count = selectedIds.size;
  if (countEl) countEl.textContent = count;
  if (actionsEl) actionsEl.style.display = count > 0 ? "flex" : "none";
}

// ── ROW SELECTION ─────────────────────────────────────────────────────────────
window.bulkToggleRow = (id, event) => {
  // If clicking checkbox directly, let it handle itself via onchange
  if (event?.target?.type === "checkbox") {
    if (event.target.checked) selectedIds.add(id);
    else selectedIds.delete(id);
  } else {
    // Row click toggles
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
  }
  renderBulkTable();
};

window.bulkToggleAll = (checked) => {
  if (checked) filteredProducts.forEach(p => selectedIds.add(p.id));
  else selectedIds.clear();
  renderBulkTable();
};

// ── SORT ──────────────────────────────────────────────────────────────────────
window.bulkSort = (col) => {
  if (bulkSortBy === col) bulkSortDir = bulkSortDir === "asc" ? "desc" : "asc";
  else { bulkSortBy = col; bulkSortDir = "asc"; }
  applyFilters();
  renderBulkTable();
};

// ── SEARCH + FILTER ───────────────────────────────────────────────────────────
window.bulkSearch = (val) => {
  bulkSearchVal = val;
  applyFilters();
  renderBulkTable();
};

window.bulkFilterCat = (val) => {
  bulkCatFilter = val;
  applyFilters();
  renderBulkTable();
};

// ── REFRESH ───────────────────────────────────────────────────────────────────
window.bulkRefresh = async () => {
  selectedIds.clear();
  await loadBulkProducts();
  renderBulkTable();
};

// ── BULK DELETE ───────────────────────────────────────────────────────────────
window.bulkDelete = async () => {
  if (selectedIds.size === 0) return;
  if (!confirm(`Delete ${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;

  const btn = document.getElementById("bulkDeleteBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }

  try {
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      const product = allBulkProducts.find(p => p.id === id);
      if (!product) return;
      // Security: seller can only delete own products
      if (bulkRole === "seller" && product.sellerUid !== bulkSellerUid) return;
      batch.delete(doc(db, product._col, id));
    });
    await batch.commit();
    selectedIds.clear();
    await loadBulkProducts();
    renderBulkTable();
    showBulkMsg(`Products deleted successfully ✅`, true);
  } catch (err) {
    console.error("Bulk delete error:", err);
    showBulkMsg("Failed to delete products ❌", false);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete Selected'; }
  }
};

// ── BULK EDIT MODAL ───────────────────────────────────────────────────────────
window.openBulkEditModal = () => {
  if (selectedIds.size === 0) return;
  const modal = document.getElementById("bulkEditModal");
  if (!modal) return;

  // Reset fields
  document.getElementById("bePrice").value    = "";
  document.getElementById("beStock").value    = "";
  document.getElementById("beCategory").value = "";
  document.getElementById("bePriceAction").value = "set";
  document.getElementById("beStockAction").value = "set";

  modal.classList.add("open");
};

window.closeBulkEditModal = () => {
  const modal = document.getElementById("bulkEditModal");
  if (modal) modal.classList.remove("open");
};

window.applyBulkEdit = async () => {
  if (selectedIds.size === 0) return;

  const priceVal    = document.getElementById("bePrice").value;
  const stockVal    = document.getElementById("beStock").value;
  const catVal      = document.getElementById("beCategory").value.trim().toLowerCase();
  const priceAction = document.getElementById("bePriceAction").value;
  const stockAction = document.getElementById("beStockAction").value;

  // Build update object — only include fields that were filled in
  const hasPrice = priceVal !== "";
  const hasStock = stockVal !== "";
  const hasCat   = catVal   !== "";

  if (!hasPrice && !hasStock && !hasCat) {
    showBulkMsg("Fill in at least one field to update.", false);
    return;
  }

  const saveBtn = document.getElementById("beApplyBtn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    const batch = writeBatch(db);
    let updated = 0;

    selectedIds.forEach(id => {
      const product = allBulkProducts.find(p => p.id === id);
      if (!product) return;
      if (bulkRole === "seller" && product.sellerUid !== bulkSellerUid) return;

      const updates = {};

      if (hasPrice) {
        const num = Number(priceVal);
        if (priceAction === "set")       updates.price = num;
        else if (priceAction === "increase") updates.price = Number(product.price || 0) + num;
        else if (priceAction === "decrease") updates.price = Math.max(0, Number(product.price || 0) - num);
        else if (priceAction === "percent")  updates.price = Number(product.price || 0) * (1 + num / 100);
        updates.price = Math.round(updates.price * 100) / 100; // round to 2dp
      }

      if (hasStock) {
        const num = Number(stockVal);
        if (stockAction === "set")       updates.stock = num;
        else if (stockAction === "add")  updates.stock = Number(product.stock || 0) + num;
        else if (stockAction === "subtract") updates.stock = Math.max(0, Number(product.stock || 0) - num);
      }

      if (hasCat) updates.category = catVal;

      if (Object.keys(updates).length > 0) {
        batch.update(doc(db, product._col, id), updates);
        updated++;
      }
    });

    await batch.commit();
    closeBulkEditModal();
    await loadBulkProducts();
    renderBulkTable();
    showBulkMsg(`${updated} product${updated !== 1 ? 's' : ''} updated successfully ✅`, true);
  } catch (err) {
    console.error("Bulk edit error:", err);
    showBulkMsg("Failed to update products ❌", false);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Apply Changes"; }
  }
};

// ── EXPORT CSV ────────────────────────────────────────────────────────────────
window.bulkExport = () => {
  const toExport = selectedIds.size > 0
    ? filteredProducts.filter(p => selectedIds.has(p.id))
    : filteredProducts;

  if (toExport.length === 0) {
    showBulkMsg("No products to export.", false);
    return;
  }

  const adminCols = bulkRole === "admin" ? ["sellerName", "sellerUid"] : [];
  const headers   = ["id", "name", "category", "price", "currency", "stock", "type", ...adminCols];

  const rows = toExport.map(p => [
    p.id,
    `"${(p.name || "").replace(/"/g, '""')}"`,
    p.category || "",
    p.price || 0,
    p.currency || "GHS",
    p.stock || 0,
    p._col === "promotions" ? "promo" : "product",
    ...(bulkRole === "admin" ? [`"${(p.sellerName || "").replace(/"/g, '""')}"`, p.sellerUid || ""] : [])
  ]);

  const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `products_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showBulkMsg(`Exported ${toExport.length} products as CSV ✅`, true);
};

// ── MESSAGE ───────────────────────────────────────────────────────────────────
function showBulkMsg(text, ok) {
  const el = document.getElementById("bulkMsg");
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  el.style.background = ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";
  el.style.color  = ok ? "#22c55e" : "#ef4444";
  el.style.border = `1px solid ${ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`;
  setTimeout(() => { el.style.display = "none"; }, 4000);
}

// ── CLOSE MODAL ON BACKDROP ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("bulkEditModal");
  if (modal) {
    modal.addEventListener("click", e => {
      if (e.target === modal) closeBulkEditModal();
    });
  }
});