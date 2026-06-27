import { auth, db } from "./firebase.js";

import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  getDoc,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── AUTH GUARD ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  const userData = userSnap.data();

  if (userData.role !== "admin") {
    alert("Access denied. Admins only. ❌");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  console.log("Admin verified ✅");

  // ✅ Admin verified — load everything
  await loadOrders();
  await loadSubscribers();
  initStockManager();
  initAnalytics();
  initCategoryManager();
  populateCategoryDropdown();
  await loadPendingSellers();
});

// ================= CLOUDINARY UPLOAD =================
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "product_upload");

  const res = await fetch("https://api.cloudinary.com/v1_1/dw3h0amnh/image/upload", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  return data.secure_url;
}

// ================= CATEGORY MANAGER =================
function initCategoryManager() {
  const catForm = document.getElementById("categoryForm");
  const catList = document.getElementById("categoryList");

  if (!catForm || !catList) return;

  onSnapshot(collection(db, "categories"), (snapshot) => {
    catList.innerHTML = "";

    if (snapshot.empty) {
      catList.innerHTML = `<p style="color:#888;">No categories yet. Add one above.</p>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const cat = { id: docSnap.id, ...docSnap.data() };

      const item = document.createElement("div");
      item.style.cssText = "display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #eee;";
      item.innerHTML = `
        <span style="flex:1;font-weight:500;">${cat.name}</span>
        <span style="color:#888;font-size:13px;">${cat.slug}</span>
        <button onclick="deleteCategory('${cat.id}', '${cat.slug}')" style="color:red;background:none;border:none;cursor:pointer;">🗑 Delete</button>
      `;
      catList.appendChild(item);
    });

    populateCategoryDropdown();
  });

  catForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById("catName");
    const name = nameInput?.value?.trim();

    if (!name) return alert("Enter a category name");

    const slug = name.toLowerCase().replace(/\s+/g, "-");

    try {
      await setDoc(doc(db, "categories", slug), {
        name,
        slug,
        createdAt: new Date()
      });

      alert(`Category "${name}" added ✅`);
      catForm.reset();
    } catch (err) {
      console.error(err);
      alert("Failed to add category ❌");
    }
  });
}

// ================= DELETE CATEGORY =================
window.deleteCategory = async (id, slug) => {
  if (!confirm(`Delete category "${slug}"? Products in this category will NOT be deleted but will have no category.`)) return;

  try {
    await deleteDoc(doc(db, "categories", id));
    alert("Category deleted ✅");
  } catch (err) {
    console.error(err);
    alert("Failed to delete category ❌");
  }
};

// ================= POPULATE CATEGORY DROPDOWN =================
async function populateCategoryDropdown() {
  const select = document.getElementById("category");
  if (!select) return;

  try {
    const snapshot = await getDocs(collection(db, "categories"));

    select.innerHTML = `<option value="" disabled selected>-- Select Category --</option>`;

    if (snapshot.empty) {
      select.innerHTML += `<option disabled>No categories found. Add one first.</option>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const cat = docSnap.data();
      const option = document.createElement("option");
      option.value = cat.slug;
      option.textContent = cat.name;
      select.appendChild(option);
    });

  } catch (err) {
    console.error("Failed to load categories for dropdown:", err);
  }
}

// ================= ADD PRODUCT =================
document.addEventListener("DOMContentLoaded", () => {
  const productForm = document.getElementById("productForm");

  if (productForm) {
    productForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name     = document.getElementById("name")?.value?.trim();
      const price    = document.getElementById("price")?.value;
      const stock    = document.getElementById("stock")?.value;
      const currency = document.getElementById("currency")?.value;
      const category = document.getElementById("category")?.value?.trim().toLowerCase();
      const discount = document.getElementById("discount")?.value || 0;
      const cartLink = document.getElementById("cartLink")?.value?.trim() || "shop.html";

      if (!name || !price || !stock || !category) {
        alert("Please fill all fields including category");
        return;
      }

      const file = document.getElementById("imageFile")?.files[0];
      let imageURL = "images/no-image.png";

      try {
        if (file) {
          imageURL = await uploadToCloudinary(file) || imageURL;
        }
      } catch (err) {
        console.error("Image upload failed:", err);
      }

      try {
        if (category === "promo") {
          await addDoc(collection(db, "promotions"), {
            name,
            price:     Number(price),
            stock:     Number(stock),
            currency:  currency || "GHS",
            category,
            imageURL,
            discount:  Number(discount),
            cartLink,
            active:    true,
            createdAt: new Date()
          });
        } else {
          await addDoc(collection(db, "products"), {
            name,
            price:     Number(price),
            stock:     Number(stock),
            currency:  currency || "GHS",
            category,
            imageURL,
            createdAt: new Date()
          });
        }

        alert("Product added ✅");
        productForm.reset();
        document.getElementById("category").value = "";

      } catch (err) {
        console.error(err);
        alert("Error adding product ❌");
      }
    });
  }
});

// ================= STOCK MANAGER =================
function initStockManager() {
  const lowStockDiv     = document.getElementById("lowStockAlerts");
  const stockManagerDiv = document.getElementById("stockManager");

  if (!lowStockDiv || !stockManagerDiv) return;

  onSnapshot(collection(db, "products"), (snapshot) => {
    lowStockDiv.innerHTML = "";

    stockManagerDiv.innerHTML = `
      <table border="1" style="width:100%;border-collapse:collapse;">
        <tr>
          <th>Product</th>
          <th>Category</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Actions</th>
        </tr>
      </table>`;

    const table = stockManagerDiv.querySelector("table");

    snapshot.forEach((docSnap) => {
      const p = { id: docSnap.id, ...docSnap.data() };

      if (p.stock < 2) {
        const warn = document.createElement("div");
        warn.textContent = `⚠ Low Stock: ${p.name} (${p.stock})`;
        warn.style.color = "red";
        lowStockDiv.appendChild(warn);
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${p.name}</td>
        <td>${p.category || "—"}</td>
        <td>${p.currency || "₵"} ${p.price}</td>
        <td><input type="number" id="stock-${p.id}" value="${p.stock}" min="0"></td>
        <td>
          <button onclick="updateStock('${p.id}')">Update</button>
          <button onclick="editProduct('${p.id}')">Edit</button>
          <button onclick="deleteProduct('${p.id}')">Delete</button>
        </td>
      `;

      table.appendChild(row);
    });
  });
}

// ================= UPDATE STOCK =================
window.updateStock = async (id) => {
  const input = document.getElementById(`stock-${id}`);
  if (!input) return;

  await updateDoc(doc(db, "products", id), {
    stock: Number(input.value)
  });

  alert("Stock updated ✅");
};

// ================= EDIT PRODUCT =================
window.editProduct = async (id) => {
  try {
    const ref  = doc(db, "products", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert("Product not found ❌");

    const data = snap.data();

    const catSnap  = await getDocs(collection(db, "categories"));
    const catSlugs = catSnap.docs.map(d => d.data().slug).join(", ");

    const newName     = prompt("Edit name:", data.name);
    const newPrice    = prompt("Edit price:", data.price);
    const newStock    = prompt("Edit stock:", data.stock);
    const newCurrency = prompt("Currency:", data.currency || "GHS");
    const newCategory = prompt(
      `Category slug (available: ${catSlugs}):`,
      data.category || ""
    )?.trim().toLowerCase();

    if (!newName || !newPrice || !newStock) return;

    await updateDoc(ref, {
      name:     newName,
      price:    Number(newPrice),
      stock:    Number(newStock),
      currency: newCurrency,
      category: newCategory || data.category || "general"
    });

    alert("Product updated ✅");

  } catch (err) {
    console.error(err);
  }
};

// ================= DELETE PRODUCT =================
window.deleteProduct = async (id) => {
  if (!confirm("Delete this product?")) return;
  await deleteDoc(doc(db, "products", id));
  alert("Deleted 🗑️");
};

// ================= PENDING SELLERS =================
async function loadPendingSellers() {
  const q = query(
    collection(db, "users"),
    where("role", "==", "seller"),
    where("approved", "==", false)
  );

  const snapshot = await getDocs(q);
  const list     = document.getElementById("pendingSellersList");

  const btn = document.querySelector('[data-target="pendingSellersSection"] span:first-child');
  if (btn) btn.innerHTML = `<i class="fas fa-user-clock" style="margin-right:8px;"></i>Pending Seller Approvals ${snapshot.size > 0 ? `<span style="background:#ef4444;color:white;border-radius:10px;padding:2px 8px;font-size:0.8rem;margin-left:6px;">${snapshot.size}</span>` : ""}`;

  if (!list) return;

  if (snapshot.empty) {
    list.innerHTML = "<p style='color:#888;'>No pending sellers.</p>";
    return;
  }

  list.innerHTML = snapshot.docs.map(d => {
    const s = d.data();
    return `
      <div style="padding:12px; border:1px solid #eee; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${s.firstName} ${s.lastName}</strong><br>
          <span style="color:#888; font-size:0.85rem;">${s.email}</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button onclick="approveSeller('${d.id}')"
            style="padding:6px 14px; background:#2e7d32; color:white; border:none; border-radius:6px; cursor:pointer;">
            Approve
          </button>
          <button onclick="rejectSeller('${d.id}')"
            style="padding:6px 14px; background:#c0392b; color:white; border:none; border-radius:6px; cursor:pointer;">
            Reject
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// ================= APPROVE / REJECT SELLERS =================
window.approveSeller = async (uid) => {
  if (!confirm("Approve this seller?")) return;
  try {
    const snap   = await getDoc(doc(db, "users", uid));
    const seller = snap.data();

    await updateDoc(doc(db, "users", uid), { approved: true });

    await emailjs.send(
      "service_xdxa7ee",
      "template_fmymhqn",
      {
        to_name:       seller.firstName || "Seller",
        to_email:      seller.email,
        dashboard_url: "https://yoursite.com/seller-dashboard.html"
      }
    );

    alert("Seller approved and notified by email ✅");
    await loadPendingSellers();

  } catch (err) {
    console.error(err);
    alert("Failed to approve seller ❌");
  }
};

window.rejectSeller = async (uid) => {
  if (!confirm("Reject this seller?")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: "user", approved: false });
    alert("Seller rejected.");
    await loadPendingSellers();
  } catch (err) {
    console.error(err);
    alert("Failed to reject seller ❌");
  }
};

// ================= LOAD ORDERS =================
async function loadOrders() {
  const ordersTable = document.getElementById("orders-table");
  if (!ordersTable) return;

  ordersTable.innerHTML = "";

  try {
    const q        = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      ordersTable.innerHTML = `<tr><td colspan="10">No orders yet</td></tr>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const order = docSnap.data();

      const itemsList = Array.isArray(order.items)
        ? order.items.map(i => `${i.name} x${i.qty}`).join("<br>")
        : "No items";

      const date          = order.createdAt?.toDate?.();
      const formattedDate = date ? date.toLocaleString("en-GH") : "N/A";

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><input type="checkbox" class="orderCheckbox" value="${docSnap.id}"></td>
        <td>${order.name || "N/A"}</td>
        <td>${order.phone || "N/A"}</td>
        <td>${order.email || "N/A"}</td>
        <td>${order.address || "N/A"}</td>
        <td>${itemsList}</td>
        <td>₵${order.total || 0}</td>
        <td>${order.status || "Pending Payment"}</td>
        <td>${order.deliveryStatus || "Pending Delivery"}</td>
        <td>${formattedDate}</td>
      `;

      ordersTable.appendChild(row);
    });

  } catch (err) {
    console.error(err);
    ordersTable.innerHTML = `<tr><td colspan="10">Failed to load ❌</td></tr>`;
  }
}

// ================= LOAD SUBSCRIBERS =================
async function loadSubscribers() {
  const subscribersTable = document.getElementById("subscribersTable");
  if (!subscribersTable) return;

  subscribersTable.innerHTML = "";

  try {
    const q        = query(collection(db, "subscribers"), orderBy("subscribedAt", "desc"));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const row  = document.createElement("tr");
      row.innerHTML = `
        <td>${data.name || "—"}</td>
        <td>${data.email || "N/A"}</td>
        <td>${data.subscribedAt?.toDate?.()?.toLocaleString() || "N/A"}</td>
      `;
      subscribersTable.appendChild(row);
    });

  } catch (err) {
    console.error(err);
  }
}

// ================= LOGOUT =================
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "index.html";
    });
  }
});

// ================= SELECT ALL ORDERS =================
document.addEventListener("DOMContentLoaded", () => {
  const selectAll = document.getElementById("selectAll");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      document.querySelectorAll(".orderCheckbox")
        .forEach(cb => cb.checked = selectAll.checked);
    });
  }
});

// ================= DELETE SELECTED ORDERS =================
document.addEventListener("DOMContentLoaded", () => {
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const selected = document.querySelectorAll(".orderCheckbox:checked");
      if (!selected.length) return alert("No orders selected ❌");
      if (!confirm(`Delete ${selected.length} orders?`)) return;

      for (const cb of selected) {
        await deleteDoc(doc(db, "orders", cb.value));
      }

      alert("Deleted successfully ✅");
      loadOrders();
    });
  }
});

// ================= ANALYTICS =================
let revenueChartInstance     = null;
let topProductsChartInstance = null;
let orderStatusChartInstance = null;

function initAnalytics() {
  onSnapshot(collection(db, "orders"), (snapshot) => {
    const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    renderSummaryCards(orders);
    renderRevenueChart(orders);
    renderTopProductsChart(orders);
    renderOrderStatusChart(orders);
  });
}

function renderSummaryCards(orders) {
  const container = document.getElementById("analyticsSummary");
  if (!container) return;

  const totalRevenue  = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders   = orders.length;
  const paidOrders    = orders.filter(o => o.status === "Paid").length;
  const pendingOrders = orders.filter(o => o.status !== "Paid").length;

  const cards = [
    { label: "Total Revenue",  value: `₵${totalRevenue.toFixed(2)}`, icon: "fa-coins",       color: "#2e7d32" },
    { label: "Total Orders",   value: totalOrders,                    icon: "fa-receipt",      color: "#1d4ed8" },
    { label: "Paid Orders",    value: paidOrders,                     icon: "fa-check-circle", color: "#059669" },
    { label: "Pending Orders", value: pendingOrders,                  icon: "fa-clock",        color: "#f59e0b" },
  ];

  container.innerHTML = cards.map(c => `
    <div style="flex:1; min-width:140px; background:#fff; border:1px solid #eee;
                border-radius:10px; padding:14px; text-align:center;">
      <i class="fas ${c.icon}" style="font-size:1.4rem; color:${c.color}; margin-bottom:6px;"></i>
      <div style="font-size:1.4rem; font-weight:700; color:${c.color};">${c.value}</div>
      <div style="font-size:0.78rem; color:#888; margin-top:2px;">${c.label}</div>
    </div>
  `).join("");
}

function renderRevenueChart(orders) {
  const canvas = document.getElementById("revenueChart");
  if (!canvas) return;

  const days   = [];
  const totals = {};

  for (let i = 6; i >= 0; i--) {
    const d     = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-GH", { weekday: "short", day: "numeric" });
    const key   = d.toDateString();
    days.push({ label, key });
    totals[key] = 0;
  }

  orders.forEach(o => {
    const date = o.createdAt?.toDate?.();
    if (!date) return;
    const key = date.toDateString();
    if (totals[key] !== undefined) totals[key] += o.total || 0;
  });

  const labels = days.map(d => d.label);
  const data   = days.map(d => totals[d.key]);

  if (revenueChartInstance) revenueChartInstance.destroy();

  revenueChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:                "Revenue (₵)",
        data,
        borderColor:          "#2e7d32",
        backgroundColor:      "rgba(46,125,50,0.08)",
        borderWidth:          2,
        pointRadius:          4,
        pointBackgroundColor: "#2e7d32",
        fill:                 true,
        tension:              0.4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => `₵${v}` } } }
    }
  });
}

function renderTopProductsChart(orders) {
  const canvas = document.getElementById("topProductsChart");
  if (!canvas) return;

  const productRevenue = {};

  orders.forEach(o => {
    if (!Array.isArray(o.items)) return;
    o.items.forEach(item => {
      const name    = item.name || "Unknown";
      const revenue = (item.price || 0) * (item.qty || 1);
      productRevenue[name] = (productRevenue[name] || 0) + revenue;
    });
  });

  const sorted = Object.entries(productRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const labels = sorted.map(([name]) => name);
  const data   = sorted.map(([, rev]) => rev);

  if (topProductsChartInstance) topProductsChartInstance.destroy();

  topProductsChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label:           "Revenue (₵)",
        data,
        backgroundColor: ["#2e7d32", "#1d4ed8", "#f59e0b", "#7c3aed", "#059669"],
        borderRadius:    6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => `₵${v}` } } }
    }
  });
}

function renderOrderStatusChart(orders) {
  const canvas = document.getElementById("orderStatusChart");
  if (!canvas) return;

  const statusCount = {};
  orders.forEach(o => {
    const s = o.status || "Pending Payment";
    statusCount[s] = (statusCount[s] || 0) + 1;
  });

  const labels = Object.keys(statusCount);
  const data   = Object.values(statusCount);

  if (orderStatusChartInstance) orderStatusChartInstance.destroy();

  orderStatusChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ["#2e7d32", "#f59e0b", "#ef4444", "#1d4ed8", "#059669"],
        borderWidth:     2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { font: { size: 12 } } } }
    }
  });
}

// ================= COLLAPSE PANEL =================
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn    = document.getElementById("toggleAdminPanel");
  const adminContent = document.getElementById("adminContent");

  if (toggleBtn && adminContent) {
    toggleBtn.addEventListener("click", () => {
      adminContent.style.display =
        adminContent.style.display === "none" ? "block" : "none";
    });
  }
});

// ================= LOAD PRODUCTS BY CATEGORY =================
export async function loadProductsByCategory(categorySlug, tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  onSnapshot(collection(db, "products"), (snapshot) => {
    table.innerHTML = "";

    const filtered = snapshot.docs.filter(
      (d) => d.data().category?.trim().toLowerCase() === categorySlug.toLowerCase()
    );

    if (filtered.length === 0) {
      table.innerHTML = `<tr><td colspan="4">No products in "${categorySlug}"</td></tr>`;
      return;
    }

    filtered.forEach((docSnap) => {
      const p   = docSnap.data();
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${p.name}</td>
        <td>${p.currency || "GHS"} ${p.price}</td>
        <td>${p.stock}</td>
        <td>${p.category}</td>
      `;
      table.appendChild(row);
    });
  });
}