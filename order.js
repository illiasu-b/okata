import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  runTransaction,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { startPayment } from "./payment.js";

const orderForm = document.getElementById("orderForm");
const payNowBtn = document.getElementById("payNowBtn");
const cartBadge = document.getElementById("cartBadge");

// ======================
// GET CART (always fresh)
// ======================
function getCart() {
  return JSON.parse(localStorage.getItem("cart")) || [];
}

// ======================
// CUSTOMER INFO
// ======================
function getCustomerInfo() {
  const name    = document.getElementById("name")?.value.trim();
  const phone   = document.getElementById("phone")?.value.trim();
  const address = document.getElementById("address")?.value.trim();
  const email   = document.getElementById("email")?.value.trim();

  if (!name || !phone || !address || !email) {
    alert("Please fill all fields ❌");
    return null;
  }

  return { name, phone, address, email };
}

// ======================
// CART BADGE
// ======================
function updateCartBadge() {
  if (!cartBadge) return;
  const cart = getCart();
  const itemCount = cart.reduce((sum, i) => sum + Number(i.qty), 0);
  cartBadge.textContent = itemCount;
}

// ======================
// CALCULATE TOTAL
// ======================
function getTotal(cart) {
  return cart.reduce((sum, i) => sum + Number(i.price) * Number(i.qty), 0);
}

// ======================
// REDUCE STOCK (SAFE)
// ======================
async function reduceStock(cartItems) {
  for (const item of cartItems) {
    const productRef = doc(db, "products", item.id);
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists()) throw new Error(`Product not found: ${item.name}`);
      const currentStock = productDoc.data().stock ?? 0;
      if (currentStock < item.qty) throw new Error(`Not enough stock for ${item.name}`);
      transaction.update(productRef, { stock: currentStock - item.qty });
    });
  }
}

// ======================
// RESTORE STOCK (rollback)
// ======================
async function restoreStock(cartItems) {
  for (const item of cartItems) {
    const productRef = doc(db, "products", item.id);
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists()) return;
      const currentStock = productDoc.data().stock ?? 0;
      transaction.update(productRef, { stock: currentStock + item.qty });
    });
  }
}

// ======================
// RENDER CART
// ======================
function renderCart() {
  const cart      = getCart();
  const cartTable = document.getElementById("cartTable");
  const cartTotal = document.getElementById("cartTotal");

  if (!cartTable) return;

  if (cart.length === 0) {
    cartTable.innerHTML = `<p style="color:#888; text-align:center; padding:20px;">
      Your cart is empty. <a href="shop.html">Continue shopping</a>
    </p>`;
    if (cartTotal) cartTotal.textContent = "0";
    return;
  }

  cartTable.innerHTML = cart.map(item => `
    <div style="display:flex; justify-content:space-between; align-items:center;
      padding:12px 0; border-bottom:1px solid #eee;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${item.imageURL
          ? `<img src="${item.imageURL}" style="width:50px; height:50px; object-fit:cover; border-radius:8px;">`
          : ""}
        <div>
          <div style="font-weight:600;">${item.name}</div>
          <div style="color:#888; font-size:0.85rem;">
            ${item.currency || "GHS"} ${Number(item.price).toFixed(2)} x ${item.qty}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="font-weight:600;">
          ${item.currency || "GHS"} ${(Number(item.price) * Number(item.qty)).toFixed(2)}
        </div>
        <button onclick="removeFromCart('${item.id}')"
          style="background:none; border:1px solid #ef4444; color:#ef4444;
                 border-radius:6px; padding:4px 10px; font-size:0.8rem;
                 cursor:pointer;">
          Remove
        </button>
      </div>
    </div>
  `).join("");

  if (cartTotal) cartTotal.textContent = getTotal(cart).toFixed(2);
}

// ======================
// REMOVE FROM CART
// ======================
window.removeFromCart = function (productId) {
  let cart = getCart();
  cart = cart.filter(item => item.id !== productId);
  localStorage.setItem("cart", JSON.stringify(cart));
  updateCartBadge();
  renderCart();
};

// ======================
// ACTUAL POPUP BUILDER
// ======================
function _showPrompt(customer) {
  const nameParts = customer.name.trim().split(" ");
  const firstName = nameParts[0] || "";
  const lastName  = nameParts.slice(1).join(" ") || "";

  const overlay = document.createElement("div");
  overlay.id = "postOrderOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.6);
    z-index:99999; display:flex; align-items:center;
    justify-content:center; padding:1rem;
  `;

  overlay.innerHTML = `
    <div style="background:#fff; border-radius:16px; max-width:400px; width:100%;
                padding:2rem; box-shadow:0 24px 64px rgba(0,0,0,0.3); position:relative;">

      <button id="postOrderClose" style="position:absolute; top:1rem; right:1rem;
        background:none; border:none; font-size:1.3rem; cursor:pointer; color:#aaa;">✕</button>

      <div style="text-align:center; margin-bottom:1.5rem;">
        <div style="width:56px; height:56px; border-radius:50%; background:#e8f5e9;
                    display:flex; align-items:center; justify-content:center;
                    font-size:1.6rem; margin:0 auto 0.8rem;">✅</div>
        <h3 style="font-size:1.3rem; margin-bottom:0.3rem;">Order placed!</h3>
        <p style="color:#888; font-size:0.9rem;">
          Save your details to track orders and checkout faster next time.
        </p>
      </div>

      <div id="postOrderForm">
        <div style="margin-bottom:0.9rem;">
          <label style="display:block; font-size:0.78rem; font-weight:600;
                        color:#888; text-transform:uppercase; margin-bottom:0.35rem;">Email</label>
          <input type="email" id="poEmail" value="${customer.email}" readonly
            style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #e0e0e0;
                   border-radius:8px; font-size:0.95rem; background:#f9f9f9;
                   color:#555; box-sizing:border-box; outline:none;">
        </div>
        <div style="margin-bottom:0.9rem;">
          <label style="display:block; font-size:0.78rem; font-weight:600;
                        color:#888; text-transform:uppercase; margin-bottom:0.35rem;">Create password</label>
          <input type="password" id="poPassword" placeholder="At least 6 characters"
            style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #e0e0e0;
                   border-radius:8px; font-size:0.95rem; outline:none; box-sizing:border-box;">
        </div>
        <div style="margin-bottom:1.2rem;">
          <label style="display:block; font-size:0.78rem; font-weight:600;
                        color:#888; text-transform:uppercase; margin-bottom:0.35rem;">Confirm password</label>
          <input type="password" id="poConfirm" placeholder="Repeat password"
            style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #e0e0e0;
                   border-radius:8px; font-size:0.95rem; outline:none; box-sizing:border-box;">
        </div>

        <div id="poMsg" style="display:none; font-size:0.87rem; padding:0.6rem 0.85rem;
             border-radius:7px; margin-bottom:1rem;"></div>

        <button id="poSubmitBtn"
          style="width:100%; padding:0.85rem; background:#2e7d32; color:#fff;
                 border:none; border-radius:8px; font-size:1rem; font-weight:600;
                 cursor:pointer; margin-bottom:0.6rem;">
          Create My Account
        </button>

        <button id="poSkipBtn"
          style="width:100%; padding:0.75rem; background:transparent; color:#999;
                 border:1.5px solid #e8e8e8; border-radius:8px; font-size:0.9rem;
                 cursor:pointer;">
          No thanks, skip
        </button>
      </div>

      <div id="postOrderSuccess" style="display:none; text-align:center; padding:1rem 0;">
        <div style="font-size:2.5rem; margin-bottom:0.8rem;">🎉</div>
        <h3 style="font-size:1.2rem; margin-bottom:0.4rem;">Account created!</h3>
        <p style="color:#888; font-size:0.9rem;">
          You're now signed in as <strong>${customer.email}</strong>
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function closePrompt() { overlay.remove(); }

  document.getElementById("postOrderClose").addEventListener("click", closePrompt);
  document.getElementById("poSkipBtn").addEventListener("click", closePrompt);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closePrompt(); });

  document.getElementById("poSubmitBtn").addEventListener("click", async () => {
    const password  = document.getElementById("poPassword").value;
    const confirm   = document.getElementById("poConfirm").value;
    const msgEl     = document.getElementById("poMsg");
    const submitBtn = document.getElementById("poSubmitBtn");

    function showPoMsg(text, ok) {
      msgEl.textContent      = text;
      msgEl.style.display    = "block";
      msgEl.style.background = ok ? "#e8f5e9" : "#fdecea";
      msgEl.style.color      = ok ? "#2e7d32" : "#c0392b";
      msgEl.style.border     = "1px solid " + (ok ? "#a5d6a7" : "#f1948a");
    }

    if (!password)            return showPoMsg("Please enter a password.", false);
    if (password.length < 6)  return showPoMsg("Password must be at least 6 characters.", false);
    if (password !== confirm)  return showPoMsg("Passwords do not match.", false);

    submitBtn.disabled      = true;
    submitBtn.textContent   = "Creating account…";
    submitBtn.style.opacity = "0.7";

    try {
      const cred = await createUserWithEmailAndPassword(auth, customer.email, password);
      await updateProfile(cred.user, { displayName: customer.name });

      await setDoc(doc(db, "users", cred.user.uid), {
        firstName,
        lastName,
        email:     customer.email,
        phone:     customer.phone,
        address:   customer.address,
        role:      "user",
        createdAt: serverTimestamp(),
      });

      const navLabel = document.getElementById("profileNavLabel");
      if (navLabel) navLabel.textContent = firstName;

      document.getElementById("postOrderForm").style.display    = "none";
      document.getElementById("postOrderSuccess").style.display = "block";
      document.getElementById("postOrderClose").style.display   = "none";

      setTimeout(closePrompt, 2500);

    } catch (err) {
      submitBtn.disabled      = false;
      submitBtn.textContent   = "Create My Account";
      submitBtn.style.opacity = "1";

      const msgs = {
        "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
        "auth/invalid-email":        "Invalid email address.",
        "auth/weak-password":        "Password is too weak.",
      };
      showPoMsg(msgs[err.code] || "Failed to create account. Please try again.", false);
    }
  });
}

// ======================
// POST-ORDER ACCOUNT PROMPT
// ======================
function showAccountPrompt(customer) {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    if (user) return;
    _showPrompt(customer);
  });
}

// ======================
// NOTIFY SELLERS
// ======================
async function notifySellers(cart, customer, orderId) {
  try {
    const sellerItems = {};

    for (const item of cart) {
      if (!item.id) continue;
      const productSnap = await getDoc(doc(db, "products", item.id));
      if (!productSnap.exists()) continue;

      const product   = productSnap.data();
      const sellerUid = product.sellerUid;
      if (!sellerUid) continue;

      if (!sellerItems[sellerUid]) sellerItems[sellerUid] = [];
      sellerItems[sellerUid].push({ ...item, productData: product });
    }

    for (const [sellerUid, items] of Object.entries(sellerItems)) {
      const sellerSnap = await getDoc(doc(db, "users", sellerUid));
      if (!sellerSnap.exists()) continue;

      const seller = sellerSnap.data();
      if (!seller.email) continue;

      for (const item of items) {
        await emailjs.send(
          "service_xdxa7ee",
          "template_qpmhck7",
          {
            seller_name:      seller.firstName || "Seller",
            seller_email:     seller.email,
            product_name:     item.name,
            qty:              item.qty,
            price:            `${item.currency || "GHS"} ${Number(item.price).toFixed(2)}`,
            customer_name:    customer.name,
            customer_phone:   customer.phone,
            customer_address: customer.address,
            order_id:         orderId
          }
        );
        console.log(`✅ Seller notified: ${seller.email} for ${item.name}`);
      }
    }
  } catch (err) {
    console.error("Failed to notify sellers:", err);
  }
}

// ======================
// PAY NOW FLOW
// ======================
if (payNowBtn) {
  payNowBtn.addEventListener("click", (e) => {
    e.preventDefault();

    const cart = getCart();
    if (cart.length === 0) return alert("Cart is empty ❌");

    const customer = getCustomerInfo();
    if (!customer) return;

    startPayment(customer, async (paymentReference) => {
      const cart = getCart();

      try {
        const total    = getTotal(cart);
        const orderRef = await addDoc(collection(db, "orders"), {
          ...customer,
          items:      cart,
          total,
          paymentRef: paymentReference,
          status:     "Paid",
          createdAt:  serverTimestamp()
        });

        const orderId = orderRef.id;
        alert(`Payment successful! ✅\n\nYour Order ID:\n${orderId}\n\nSave this ID to track your order.`);

        await reduceStock(cart);
        await notifySellers(cart, customer, orderRef.id);

        localStorage.removeItem("cart");
        updateCartBadge();
        renderCart();
        orderForm?.reset();
        showAccountPrompt(customer);

      } catch (err) {
        console.error("Checkout failed:", err);
        alert(err.message || "Checkout failed ❌");
      }
    });
  });
}

// ======================
// PLACE ORDER (PAY LATER)
// ======================
if (orderForm) {
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const cart = getCart();
    if (cart.length === 0) return alert("Cart is empty ❌");

    const customer = getCustomerInfo();
    if (!customer) return;

    try {
      const total    = getTotal(cart);
      const orderRef = await addDoc(collection(db, "orders"), {
        ...customer,
        items:      cart,
        total,
        paymentRef: null,
        status:     "Pending Payment",
        createdAt:  serverTimestamp()
      });

      const orderId = orderRef.id;
      alert(`Order placed successfully! ✅\n\nYour Order ID:\n${orderId}\n\nSave this ID to track your order.`);

      await notifySellers(cart, customer, orderId);

      localStorage.removeItem("cart");
      updateCartBadge();
      renderCart();
      orderForm.reset();
      showAccountPrompt(customer);

    } catch (err) {
      console.error("Order failed:", err.code, err.message);
      alert(err.message || "Failed to place order ❌");
    }
  });
}

// ======================
// INIT
// ======================
updateCartBadge();
renderCart();