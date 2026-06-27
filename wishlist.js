import { db, auth } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================
// TOGGLE WISHLIST
// ==========================
window.toggleWishlist = async function (productId, productName, productPrice, productImage, productCurrency) {
  const user = auth.currentUser;

  if (!user) {
    alert("Please sign in to save items to your wishlist.");
    return;
  }

  const wishlistRef = doc(db, "wishlists", user.uid);
  const snap        = await getDoc(wishlistRef);
  const items       = snap.exists() ? (snap.data().items || []) : [];
  const exists      = items.find(i => i.id === productId);

  if (exists) {
    await updateDoc(wishlistRef, {
      items: arrayRemove(exists)
    });
    updateWishlistBtn(productId, false);
  } else {
    const item = {
      id:       productId,
      name:     productName,
      price:    productPrice,
      imageURL: productImage  || "",
      currency: productCurrency || "GHS",
      addedAt:  new Date().toISOString()
    };

    if (snap.exists()) {
      await updateDoc(wishlistRef, { items: arrayUnion(item) });
    } else {
      await setDoc(wishlistRef, { items: [item] });
    }
    updateWishlistBtn(productId, true);
  }
};

// ==========================
// UPDATE HEART BUTTON
// ==========================
function updateWishlistBtn(productId, saved) {
  const btn = document.getElementById(`wishlist_${productId}`);
  if (!btn) return;
  btn.innerHTML          = saved
    ? `<i class="fas fa-heart"></i>`
    : `<i class="far fa-heart"></i>`;
  btn.title              = saved ? "Remove from wishlist" : "Add to wishlist";
  btn.style.color        = saved ? "#ef4444" : "#1f2937";
  btn.style.fontSize     = "1.1rem";
  btn.style.background   = "rgba(255,255,255,0.85)";
  btn.style.borderRadius = "50%";
  btn.style.padding      = "6px 8px";
}

// ==========================
// CHECK WISHLIST STATE ON LOAD
// ==========================
export async function checkWishlistState(productId) {
  const user = auth.currentUser;
  if (!user) return;

  const snap  = await getDoc(doc(db, "wishlists", user.uid));
  const items = snap.exists() ? (snap.data().items || []) : [];
  const saved = items.some(i => i.id === productId);
  updateWishlistBtn(productId, saved);
}

// ==========================
// SHOW WISHLIST MODAL
// ==========================
window.showWishlist = async function () {
  const user = auth.currentUser;

  if (!user) {
    alert("Please sign in to view your wishlist.");
    return;
  }

  const existing = document.getElementById("wishlistModalOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "wishlistModalOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.55);
    z-index:9999; overflow-y:auto; padding:2rem 1rem;
  `;

  overlay.innerHTML = `
    <div style="background:#fff; border-radius:14px; max-width:420px;
                margin:2rem auto; padding:2rem; position:relative;
                box-shadow:0 20px 60px rgba(0,0,0,0.25);">

      <button onclick="document.getElementById('wishlistModalOverlay').remove()"
        style="position:absolute; top:1rem; right:1rem; background:none;
               border:none; font-size:1.4rem; cursor:pointer; color:#888;">✕</button>

      <h3 style="font-size:1.3rem; margin-bottom:1.2rem;">❤️ My Wishlist</h3>
      <div id="wishlistItems">
        <p style="color:#888; text-align:center;">Loading...</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const snap  = await getDoc(doc(db, "wishlists", user.uid));
  const items = snap.exists() ? (snap.data().items || []) : [];
  const list  = document.getElementById("wishlistItems");

  if (items.length === 0) {
    list.innerHTML = `
      <p style="color:#888; text-align:center; padding:1rem;">
        Your wishlist is empty.<br>
        <a href="shop.html" style="color:#2e7d32;">Browse products</a>
      </p>`;
    return;
  }

  list.innerHTML = items.map(item => `
    <div style="display:flex; align-items:center; gap:12px;
                padding:12px 0; border-bottom:1px solid #eee;">
      ${item.imageURL
        ? `<img src="${item.imageURL}" style="width:56px; height:56px; object-fit:cover; border-radius:8px;">`
        : `<div style="width:56px; height:56px; background:#f0f0f0; border-radius:8px;"></div>`}
      <div style="flex:1;">
        <div style="font-weight:600; font-size:0.95rem;">${item.name}</div>
        <div style="color:#2e7d32; font-size:0.9rem; font-weight:600;">
          ${item.currency || "GHS"} ${Number(item.price).toFixed(2)}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button onclick="addToCartFromWishlist('${item.id}', '${(item.name || '').replace(/'/g, "\\'")}', ${item.price}, '${item.imageURL}', '${item.currency}')"
          style="padding:5px 10px; background:#2e7d32; color:#fff;
                 border:none; border-radius:6px; font-size:0.8rem; cursor:pointer;">
          Add to Cart
        </button>
        <button onclick="removeFromWishlist('${item.id}')"
          style="padding:5px 10px; background:none; color:#ef4444;
                 border:1px solid #ef4444; border-radius:6px; font-size:0.8rem; cursor:pointer;">
          Remove
        </button>
      </div>
    </div>
  `).join("");
};

// ==========================
// ADD TO CART FROM WISHLIST
// ==========================
window.addToCartFromWishlist = function (id, name, price, imageURL, currency) {
  let cart     = JSON.parse(localStorage.getItem("cart")) || [];
  const exists = cart.find(p => p.id === id);
  if (exists) {
    exists.qty += 1;
  } else {
    cart.push({ id, name, price, imageURL, currency, qty: 1 });
  }
  localStorage.setItem("cart", JSON.stringify(cart));
  alert(`${name} added to cart ✅`);
};

// ==========================
// REMOVE FROM WISHLIST
// ==========================
window.removeFromWishlist = async function (productId) {
  const user = auth.currentUser;
  if (!user) return;

  const wishlistRef = doc(db, "wishlists", user.uid);
  const snap        = await getDoc(wishlistRef);
  const items       = snap.exists() ? (snap.data().items || []) : [];
  const item        = items.find(i => i.id === productId);

  if (item) {
    await updateDoc(wishlistRef, { items: arrayRemove(item) });
  }

  showWishlist();
  updateWishlistBtn(productId, false);
};