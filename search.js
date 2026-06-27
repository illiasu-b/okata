// search.js
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const searchInput  = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const container    = document.getElementById("productResults");

let debounceTimer;
let allCategories = [];

// ==========================
// INJECT FILTER UI
// ==========================
function injectFilterUI() {
  const searchBar = document.querySelector(".search-bar");
  if (!searchBar || document.getElementById("searchFilters")) return;

  const filters = document.createElement("div");
  filters.id = "searchFilters";
  filters.style.cssText = `
    display:flex; flex-wrap:wrap; gap:10px; padding:10px 0;
    align-items:center;
  `;

  filters.innerHTML = `
    <!-- Category Filter -->
    <select id="filterCategory"
      style="padding:7px 12px; border:1.5px solid #e0e0e0; border-radius:8px;
             font-size:0.88rem; outline:none; background:#fff; cursor:pointer;">
      <option value="">All Categories</option>
    </select>

    <!-- Min Price -->
    <input type="number" id="filterMinPrice" placeholder="Min ₵"
      style="width:80px; padding:7px 10px; border:1.5px solid #e0e0e0;
             border-radius:8px; font-size:0.88rem; outline:none;">

    <!-- Max Price -->
    <input type="number" id="filterMaxPrice" placeholder="Max ₵"
      style="width:80px; padding:7px 10px; border:1.5px solid #e0e0e0;
             border-radius:8px; font-size:0.88rem; outline:none;">

    <!-- Min Rating -->
    <select id="filterRating"
      style="padding:7px 12px; border:1.5px solid #e0e0e0; border-radius:8px;
             font-size:0.88rem; outline:none; background:#fff; cursor:pointer;">
      <option value="">Any Rating</option>
      <option value="4">⭐⭐⭐⭐ 4+ Stars</option>
      <option value="3">⭐⭐⭐ 3+ Stars</option>
      <option value="2">⭐⭐ 2+ Stars</option>
      <option value="1">⭐ 1+ Stars</option>
    </select>

    <!-- Sort -->
    <select id="filterSort"
      style="padding:7px 12px; border:1.5px solid #e0e0e0; border-radius:8px;
             font-size:0.88rem; outline:none; background:#fff; cursor:pointer;">
      <option value="">Sort by</option>
      <option value="price_asc">Price: Low to High</option>
      <option value="price_desc">Price: High to Low</option>
      <option value="name_asc">Name: A to Z</option>
      <option value="rating_desc">Highest Rated</option>
    </select>

    <!-- Clear Filters -->
    <button onclick="clearFilters()"
      style="padding:7px 14px; background:none; border:1.5px solid #e0e0e0;
             border-radius:8px; font-size:0.88rem; cursor:pointer; color:#888;">
      ✕ Clear
    </button>
  `;

  searchBar.insertAdjacentElement("afterend", filters);

  // Load categories into dropdown
  loadCategories();

  // Wire up filter change listeners
  ["filterCategory", "filterMinPrice", "filterMaxPrice", "filterRating", "filterSort"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", searchProducts);
  });
}

// ==========================
// LOAD CATEGORIES
// ==========================
async function loadCategories() {
  try {
    const snap = await getDocs(collection(db, "categories"));
    const select = document.getElementById("filterCategory");
    if (!select) return;

    snap.forEach(d => {
      const cat    = d.data();
      const option = document.createElement("option");
      option.value       = cat.slug;
      option.textContent = cat.name;
      select.appendChild(option);
      allCategories.push(cat.slug);
    });
  } catch (err) {
    console.error("Failed to load categories:", err);
  }
}

// ==========================
// CLEAR FILTERS
// ==========================
window.clearFilters = function () {
  const ids = ["filterCategory", "filterMinPrice", "filterMaxPrice", "filterRating", "filterSort"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  if (searchInput) searchInput.value = "";
  if (container)   container.innerHTML = "";
};

// ==========================
// GET AVERAGE RATING
// ==========================
async function getProductRating(productId) {
  try {
    const snap = await getDocs(
      query(collection(db, "reviews"), where("productId", "==", productId))
    );
    if (snap.empty) return 0;
    const avg = snap.docs.reduce((sum, d) => sum + d.data().rating, 0) / snap.size;
    return avg;
  } catch {
    return 0;
  }
}

// ==========================
// SEARCH + FILTER
// ==========================
async function searchProducts() {
  if (!container) return;
  container.innerHTML = `<p style="color:#888;">Searching...</p>`;

  const queryText   = searchInput?.value.toLowerCase().trim() || "";
  const catFilter   = document.getElementById("filterCategory")?.value  || "";
  const minPrice    = Number(document.getElementById("filterMinPrice")?.value) || 0;
  const maxPrice    = Number(document.getElementById("filterMaxPrice")?.value) || Infinity;
  const minRating   = Number(document.getElementById("filterRating")?.value)   || 0;
  const sortBy      = document.getElementById("filterSort")?.value || "";

  // Only search if there's a query or a filter applied
  const hasFilter = queryText || catFilter || minPrice > 0 || maxPrice < Infinity || minRating > 0 || sortBy;
  if (!hasFilter) {
    container.innerHTML = "";
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, "products"));
    let products   = [];

    for (const doc of snapshot.docs) {
      const data = { id: doc.id, ...doc.data() };

      // Skip promos
      if (data.category?.trim().toLowerCase() === "promo") continue;

      // Text search
      if (queryText) {
        const name = (data.name || "").toLowerCase();
        const desc = (data.description || "").toLowerCase();
        if (!name.includes(queryText) && !desc.includes(queryText)) continue;
      }

      // Category filter
      if (catFilter && data.category?.trim().toLowerCase() !== catFilter) continue;

      // Price filter
      const price = Number(data.price || 0);
      if (price < minPrice) continue;
      if (maxPrice < Infinity && price > maxPrice) continue;

      products.push(data);
    }

    // Rating filter — fetch ratings for filtered products
    if (minRating > 0) {
      const withRatings = await Promise.all(
        products.map(async p => ({
          ...p,
          avgRating: await getProductRating(p.id)
        }))
      );
      products = withRatings.filter(p => p.avgRating >= minRating);
    } else {
      products = await Promise.all(
        products.map(async p => ({
          ...p,
          avgRating: await getProductRating(p.id)
        }))
      );
    }

    // Sort
    if (sortBy === "price_asc")    products.sort((a, b) => a.price - b.price);
    if (sortBy === "price_desc")   products.sort((a, b) => b.price - a.price);
    if (sortBy === "name_asc")     products.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (sortBy === "rating_desc")  products.sort((a, b) => b.avgRating - a.avgRating);

    container.innerHTML = "";

    if (products.length === 0) {
      container.innerHTML = `<p style="color:#888; text-align:center; padding:1rem;">No products found.</p>`;
      return;
    }

    // Render results
    products.forEach(data => {
      const currency = data.currency || "GHS";
      const symbol   =
        currency === "USD" ? "$" :
        currency === "EUR" ? "€" :
        currency === "GBP" ? "£" : "₵";

      const stars = data.avgRating > 0
        ? [1,2,3,4,5].map(i =>
            `<span style="color:${i <= Math.round(data.avgRating) ? "#f59e0b" : "#ddd"};">★</span>`
          ).join("") + ` <span style="font-size:0.8rem; color:#888;">(${data.avgRating.toFixed(1)})</span>`
        : `<span style="font-size:0.8rem; color:#aaa;">No reviews yet</span>`;

      const stock = Number(data.stock ?? 0);
      let stockText = "";
      if (stock <= 0)      stockText = `<p class="sold-out">Sold Out</p>`;
      else if (stock <= 3) stockText = `<p class="low-stock">⚠ Only ${stock} left!</p>`;
      else                 stockText = `<p class="in-stock">In Stock: ${stock}</p>`;

      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <h4>${data.name || "Unnamed Product"}</h4>
        <img src="${data.imageURL || "images/no-image.png"}"
             alt="${data.name || "product"}"
             style="width:100%; height:160px; object-fit:cover; border-radius:8px;">
        <p>${data.description || ""}</p>
        <p style="font-weight:600;">${symbol}${data.price || "0.00"}</p>
        <div style="margin:4px 0;">${stars}</div>
        ${stockText}
        <button class="add-to-cart"
          data-id="${data.id}"
          data-name="${data.name}"
          data-price="${data.price}"
          data-imageurl="${data.imageURL || ""}"
          data-currency="${currency}"
          data-stock="${stock}"
          style="width:100%; margin-top:8px;">
          ${stock <= 0 ? "Sold Out" : "Add to Cart"}
        </button>
      `;

      container.appendChild(card);
    });

    // Attach cart listeners to search results
    container.querySelectorAll(".add-to-cart").forEach(button => {
      button.addEventListener("click", () => {
        const id       = button.dataset.id;
        const name     = button.dataset.name;
        const price    = Number(button.dataset.price);
        const stock    = Number(button.dataset.stock);
        const imageURL = button.dataset.imageurl || "";
        const currency = button.dataset.currency || "GHS";

        if (stock <= 0) { alert("This product is sold out ❌"); return; }

        let cart     = JSON.parse(localStorage.getItem("cart")) || [];
        const exists = cart.find(p => p.id === id);
        if (exists) { exists.qty += 1; }
        else { cart.push({ id, name, price, imageURL, currency, qty: 1 }); }
        localStorage.setItem("cart", JSON.stringify(cart));
        alert(`${name} added to cart ✅`);
      });
    });

  } catch (error) {
    console.error("Search error:", error);
    container.innerHTML = `<p style="color:#c0392b;">Failed to load products.</p>`;
  }
}

// ==========================
// INIT
// ==========================
searchButton?.addEventListener("click", searchProducts);

searchInput?.addEventListener("keyup", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(searchProducts, 300);
});

document.addEventListener("DOMContentLoaded", injectFilterUI);