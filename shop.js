import { db } from "./firebase.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { loadProductReviews, renderStars } from "./reviews.js";
import { checkWishlistState } from "./wishlist.js";

const container = document.getElementById("products-container");

const STORE_WHATSAPP = "233240391997";

// ==========================
// ALL PRODUCTS CACHE
// (used by Related Products)
// ==========================
let allProducts = [];

// ==========================
// CART SYSTEM
// ==========================
function addToCart(product) {
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  const existing = cart.find(p => p.id === product.id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }

  localStorage.setItem("cart", JSON.stringify(cart));
}

window.addToCart = addToCart;

// ==========================
// WHATSAPP HELPER
// ==========================
window.buyViaWhatsApp = function(name, price, currency, sellerWhatsapp) {
  const number  = sellerWhatsapp || STORE_WHATSAPP;
  const symbol  =
    currency === "USD" ? "$" :
    currency === "EUR" ? "€" :
    currency === "GBP" ? "£" : "₵";
  const message = encodeURIComponent(
    `Hello RahmanGrow! 👋\n\nI'd like to order:\n• ${name} — ${currency} ${Number(price).toFixed(2)}\n\nPlease confirm my order. Thank you!`
  );
  window.open(`https://wa.me/${number}?text=${message}`, "_blank");
};

// ==========================
// SAFE IMAGE FUNCTION
// ==========================
function getImage(p) {
  if (Array.isArray(p.imageURLs) && p.imageURLs.length > 0) return p.imageURLs[0];
  if (p.imageURL && p.imageURL.trim() !== "") return p.imageURL;
  return "images/no-image.png";
}

// ==========================
// RELATED PRODUCTS DRAWER
// ==========================

/**
 * Opens the related products drawer for a given product.
 * @param {string} productId  - The product whose related items to show
 */
window.openRelatedDrawer = function(productId) {
  const product  = allProducts.find(p => p.id === productId);
  if (!product) return;

  const category = product.category?.trim().toLowerCase();

  const related = allProducts.filter(p =>
    p.id !== productId &&
    p.category?.trim().toLowerCase() === category &&
    p.category?.trim().toLowerCase() !== "promo"
  ).slice(0, 6); // max 6 related items

  const drawer    = document.getElementById("relatedDrawer");
  const titleEl   = document.getElementById("relatedDrawerTitle");
  const listEl    = document.getElementById("relatedDrawerList");

  titleEl.textContent = `More in "${product.category || "this category"}"`;
  listEl.innerHTML    = "";

  if (related.length === 0) {
    listEl.innerHTML = `<p class="related-empty">No related products found.</p>`;
  } else {
    related.forEach(rp => {
      const stock    = Number(rp.stock ?? 0);
      const image    = getImage(rp);
      const currency = rp.currency || "GHS";
      const symbol   =
        currency === "USD" ? "$" :
        currency === "EUR" ? "€" :
        currency === "GBP" ? "£" : "₵";
      const safeRpName   = (rp.name || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const rpWhatsapp   = rp.sellerWhatsapp || "";

      const card = document.createElement("div");
      card.className = "related-card";
      card.innerHTML = `
        <div class="related-card__img-wrap">
          <img src="${image}" alt="${rp.name || "product"}" class="related-card__img">
          ${stock <= 0 ? `<span class="related-card__badge related-card__badge--out">Sold Out</span>` : ""}
          ${stock > 0 && stock <= 3 ? `<span class="related-card__badge related-card__badge--low">Only ${stock} left</span>` : ""}
        </div>
        <div class="related-card__body">
          <p class="related-card__name">${rp.name || "Unnamed"}</p>
          <p class="related-card__price">${symbol}${Number(rp.price || 0).toFixed(2)}</p>
          <div class="related-card__actions">
            <button
              class="related-card__btn related-card__btn--cart ${stock <= 0 ? "disabled" : ""}"
              data-id="${rp.id}"
              data-name="${rp.name}"
              data-price="${rp.price}"
              data-imageurl="${image}"
              data-currency="${currency}"
              data-stock="${stock}"
              ${stock <= 0 ? "disabled" : ""}>
              🛒 ${stock <= 0 ? "Sold Out" : "Add to Cart"}
            </button>
            ${stock > 0 ? `
            <button class="related-card__btn related-card__btn--wa"
              onclick="buyViaWhatsApp('${safeRpName}', ${rp.price}, '${currency}', '${rpWhatsapp}')">
              <i class="fab fa-whatsapp"></i>
            </button>` : ""}
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });

    // Attach cart listeners inside the drawer
    listEl.querySelectorAll(".related-card__btn--cart:not(.disabled)").forEach(btn => {
      btn.addEventListener("click", () => {
        const { id, name, price, imageurl: imageURL, currency, stock } = btn.dataset;
        if (Number(stock) <= 0) { alert("This product is sold out ❌"); return; }
        addToCart({ id, name, price: Number(price), imageURL, currency, qty: 1 });
        btn.textContent = "✅ Added!";
        setTimeout(() => { btn.textContent = "🛒 Add to Cart"; }, 1800);
      });
    });
  }

  drawer.classList.add("open");
  document.body.classList.add("drawer-open");
};

window.closeRelatedDrawer = function() {
  document.getElementById("relatedDrawer").classList.remove("open");
  document.body.classList.remove("drawer-open");
};

// Close drawer when clicking the backdrop
document.addEventListener("click", e => {
  if (e.target.id === "relatedDrawer") {
    window.closeRelatedDrawer();
  }
});

// Close on Escape key
document.addEventListener("keydown", e => {
  if (e.key === "Escape") window.closeRelatedDrawer();
});

// ==========================
// INJECT DRAWER HTML ONCE
// ==========================
function injectDrawer() {
  if (document.getElementById("relatedDrawer")) return; // already injected
  const drawerHTML = `
    <div id="relatedDrawer" role="dialog" aria-modal="true" aria-labelledby="relatedDrawerTitle">
      <div class="related-drawer__panel">
        <div class="related-drawer__header">
          <h2 class="related-drawer__title" id="relatedDrawerTitle">Related Products</h2>
          <button class="related-drawer__close" onclick="closeRelatedDrawer()" aria-label="Close">✕</button>
        </div>
        <div id="relatedDrawerList" class="related-drawer__list"></div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", drawerHTML);
}

// ==========================
// REAL-TIME PRODUCTS
// ==========================
function showProducts() {
  if (!container) {
    console.error("products-container not found in HTML");
    return;
  }

  injectDrawer();

  container.innerHTML = "<p>Loading products...</p>";

  onSnapshot(collection(db, "products"), (snapshot) => {
    container.innerHTML = "";
    allProducts = []; // reset cache

    if (snapshot.empty) {
      container.innerHTML = "<p>No products available.</p>";
      return;
    }

    // Build full cache first (needed for related lookup)
    snapshot.forEach(docSnap => {
      allProducts.push({ id: docSnap.id, ...docSnap.data() });
    });

    let rendered = 0;

    allProducts.forEach(p => {
      // Skip promo products
      const cat = p.category?.trim().toLowerCase();
      if (cat === "promo") return;

      rendered++;

      const stock    = Number(p.stock ?? 0);
      const image    = getImage(p);
      const currency = p.currency || "GHS";
      const symbol   =
        currency === "USD" ? "$" :
        currency === "EUR" ? "€" :
        currency === "GBP" ? "£" :
        "₵";

      let stockText = "";
      if (stock <= 0) {
        stockText = `<p class="sold-out">Sold Out</p>`;
      } else if (stock <= 3) {
        stockText = `<p class="low-stock">⚠ Only ${stock} left!</p>`;
      } else {
        stockText = `<p class="in-stock">In Stock: ${stock}</p>`;
      }

      const safeName       = (p.name || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const sellerWhatsapp = p.sellerWhatsapp || "";

      // Check if there are any related products (same category, not promo)
      const hasRelated = allProducts.some(other =>
        other.id !== p.id &&
        other.category?.trim().toLowerCase() === cat &&
        other.category?.trim().toLowerCase() !== "promo"
      );

      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <!-- Product header with wishlist heart -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <h3 style="margin:0; flex:1;">${p.name || "No name"}</h3>
          <button
            id="wishlist_${p.id}"
            onclick="toggleWishlist('${p.id}', '${safeName}', ${p.price}, '${image}', '${currency}')"
            title="Add to wishlist"
            style="background:none; border:none; font-size:1.4rem;
                   cursor:pointer; padding:0 0 0 8px; line-height:1;">
            🤍
          </button>
        </div>

        <img src="${image}" alt="${p.name || "product"}">
        <p>${p.description || ""}</p>
        <p>Price: ${symbol}${p.price || 0}</p>
        ${stockText}

        <button class="add-to-cart"
          data-id="${p.id}"
          data-name="${p.name}"
          data-price="${p.price}"
          data-imageurl="${image}"
          data-currency="${currency}"
          data-stock="${stock}">
          ${stock <= 0 ? "Sold Out" : "Add to Cart"}
        </button>

        ${stock > 0 ? `
        <!-- WhatsApp Buy Button -->
        <button class="wa-btn"
          onclick="buyViaWhatsApp('${safeName}', ${p.price}, '${currency}', '${sellerWhatsapp}')">
          <i class="fab fa-whatsapp"></i> Buy via WhatsApp
        </button>` : ""}

        <!-- Related Products Button -->
        ${hasRelated ? `
        <button class="related-trigger-btn"
          onclick="openRelatedDrawer('${p.id}')">
          <i class="fas fa-th-large"></i> See Related Products
        </button>` : ""}

        <!-- Review button -->
        <div style="margin-top:8px;">
          <button onclick="openReviewModal('${p.id}', '${safeName}')"
            style="background:none; border:1px solid #2e7d32; color:#2e7d32;
                   padding:4px 10px; border-radius:6px; font-size:0.8rem;
                   cursor:pointer; width:100%;">
            ✍ Write a Review
          </button>
        </div>

        <!-- Reviews display -->
        <div id="reviews_${p.id}" style="margin-top:8px;"></div>
      `;

      container.appendChild(card);

      loadProductReviews(p.id);
      checkWishlistState(p.id);
    });

    if (rendered === 0) {
      container.innerHTML = "<p>No products available.</p>";
    }

    attachCartListeners();
  });

  console.log("Live stock tracking enabled ✅");
}

// ==========================
// CART BUTTONS
// ==========================
function attachCartListeners() {
  document.querySelectorAll(".add-to-cart").forEach(button => {
    button.addEventListener("click", () => {
      const id       = button.dataset.id;
      const name     = button.dataset.name;
      const price    = Number(button.dataset.price);
      const stock    = Number(button.dataset.stock);
      const imageURL = button.dataset.imageurl || "";
      const currency = button.dataset.currency || "GHS";

      if (stock <= 0) {
        alert("This product is sold out ❌");
        return;
      }

      addToCart({ id, name, price, imageURL, currency, qty: 1 });
      alert(`${name} added to cart ✅`);
    });
  });
}

// ==========================
// INIT
// ==========================
document.addEventListener("DOMContentLoaded", showProducts);