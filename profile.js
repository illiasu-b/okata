// profile.js
import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail    // ← ADD THIS
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,    // ← ADD
  query,         // ← ADD
  where,         // ← ADD
  getDocs,       // ← ADD
  orderBy        // ← ADD
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// ─── HELPERS ──────────────────────────────────────────────────────
function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  el.style.padding = "0.6rem 0.8rem";
  el.style.borderRadius = "6px";
  el.style.marginTop = "0.8rem";
  el.style.fontSize = "0.88rem";
  el.style.background = ok ? "#e8f5e9" : "#fdecea";
  el.style.color = ok ? "#2e7d32" : "#c0392b";
  el.style.border = "1px solid " + (ok ? "#a5d6a7" : "#f1948a");
}

function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.style.display = "none"; }
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? "0.7" : "1";
  btn.textContent = loading ? "Please wait…" : btn.dataset.label;
}

// ─── NAVBAR HELPERS ───────────────────────────────────────────────
function setNavName(firstName) {
  const label = document.getElementById("profileNavLabel");
  if (label) label.textContent = firstName || "Account";
}

function setNavPhoto(photoURL) {
  const navBtn = document.querySelector("#profileNavBtn");
  if (!navBtn || !photoURL) return;
  const existingIcon = navBtn.querySelector("i");
  const existingImg  = navBtn.querySelector("img");
  const imgTag = `<img src="${photoURL}"
    style="width:28px; height:28px; border-radius:50%; object-fit:cover; vertical-align:middle;"
    onerror="this.outerHTML='<i class=\\'fas fa-user-circle\\'></i>'">`;
  if (existingIcon) {
    existingIcon.outerHTML = imgTag;
  } else if (existingImg) {
    existingImg.src = photoURL;
  }
}

function resetNavPhoto() {
  const navBtn = document.querySelector("#profileNavBtn");
  if (!navBtn) return;
  const existingImg = navBtn.querySelector("img");
  if (existingImg) existingImg.outerHTML = `<i class="fas fa-user-circle"></i>`;
}

// ─── MODAL OPEN / CLOSE ───────────────────────────────────────────
window.closeProfileModal = function () {
  const overlay = document.getElementById("profileModalOverlay");
  if (overlay) overlay.style.display = "none";
};

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("profileModalOverlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeProfileModal();
    });
  }

  ["pLoginBtn", "pRegBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.dataset.label = btn.textContent;
  });

  const sellerRegBtn = document.getElementById("sellerRegBtn");
  if (sellerRegBtn) sellerRegBtn.addEventListener("click", handleSellerRegister);
});

// ─── TAB SWITCHING ────────────────────────────────────────────────
window.switchProfileTab = function (tab) {
  const isLogin = tab === "login";
  document.getElementById("profileLoginForm").style.display = isLogin ? "" : "none";
  document.getElementById("profileRegisterForm").style.display = isLogin ? "none" : "";
  document.getElementById("profileLoggedIn").style.display = "none";
  document.getElementById("authTabs").style.display = "";

  const tLogin = document.getElementById("tabLogin");
  const tReg   = document.getElementById("tabRegister");
  tLogin.style.background  = isLogin ? "#fff" : "transparent";
  tLogin.style.fontWeight  = isLogin ? "600" : "500";
  tLogin.style.color       = isLogin ? "#000" : "#888";
  tReg.style.background    = isLogin ? "transparent" : "#fff";
  tReg.style.fontWeight    = isLogin ? "500" : "600";
  tReg.style.color         = isLogin ? "#888" : "#000";

  clearMsg("pLoginMsg");
  clearMsg("pRegMsg");
};

// ─── SHOW LOGGED-IN PROFILE ───────────────────────────────────────
function showLoggedIn(user, userData) {
  const loginForm    = document.getElementById("profileLoginForm");
  const registerForm = document.getElementById("profileRegisterForm");
  const authTabs     = document.getElementById("authTabs");
  const loggedInDiv  = document.getElementById("profileLoggedIn");

  if (loginForm)    loginForm.style.display    = "none";
  if (registerForm) registerForm.style.display = "none";
  if (authTabs)     authTabs.style.display     = "none";
  if (loggedInDiv)  loggedInDiv.style.display  = "";

  const firstName = userData?.firstName
    || user.displayName?.split(" ")[0]
    || user.email.split("@")[0]
    || "User";
  const lastName  = userData?.lastName || user.displayName?.split(" ")[1] || "";
  const initials  = (firstName[0] + (lastName[0] || "")).toUpperCase();

  let joined = "";
  try {
    joined = userData?.createdAt?.toDate
      ? userData.createdAt.toDate().toLocaleDateString("en-GB", { month: "short", year: "numeric" })
      : new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  } catch {
    joined = "";
  }

  const avatarEl = document.getElementById("pAvatar");
  if (avatarEl) {
    if (userData?.photoURL) {
      avatarEl.innerHTML = `<img src="${userData.photoURL}"
        style="width:100%; height:100%; object-fit:cover; border-radius:50%;"
        onerror="this.parentElement.textContent='${initials}'">`;
    } else {
      avatarEl.textContent = initials;
    }
  }

  const pFullName   = document.getElementById("pFullName");
  const pEmail      = document.getElementById("pEmail");
  const pInfoEmail  = document.getElementById("pInfoEmail");
  const pInfoJoined = document.getElementById("pInfoJoined");

  if (pFullName)   pFullName.textContent   = `${firstName} ${lastName}`.trim();
  if (pEmail)      pEmail.textContent      = user.email;
  if (pInfoEmail)  pInfoEmail.textContent  = user.email;
  if (pInfoJoined) pInfoJoined.textContent = joined;

  setNavName(firstName);
  if (userData?.photoURL) setNavPhoto(userData.photoURL);

  initAvatarUpload();
}

// ─── SHARED USER-DOC CACHE (imported by seller.js to avoid double fetch) ───
let _resolveUserDoc;
export const userDocPromise = new Promise(res => { _resolveUserDoc = res; });

// ─── UNIFIED AUTH STATE LISTENER ─────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  const adminLink  = document.querySelector('a[href="dashboard.html"]')?.closest("li");
  const sellerLink = document.getElementById("sellerNavItem");

  if (adminLink)  adminLink.style.display  = "none";
  if (sellerLink) sellerLink.style.display = "none";

  if (user) {
    try {
      const snap     = await getDoc(doc(db, "users", user.uid));
      const userData = snap.exists() ? snap.data() : {};
      // Share the result so seller.js never needs its own getDoc
      _resolveUserDoc({ user, snap, userData });

      // ── SELLER: show navbar link, but still treat as a regular user ──
      if (userData?.role === "seller" && sellerLink) {
        sellerLink.style.display = "flex";
      }

      // ── ADMIN: show admin link ─────────────────────────────────
      if (adminLink && userData?.isAdmin === true) {
        adminLink.style.display = "";
      }

      // ── Restore navbar name & photo ────────────────────────────
      const firstName = userData?.firstName
        || user.displayName?.split(" ")[0]
        || user.email.split("@")[0]
        || "Account";
      setNavName(firstName);
      if (userData?.photoURL) setNavPhoto(userData.photoURL);

      // ── If profile modal is open, show logged-in view ──────────
      const overlay = document.getElementById("profileModalOverlay");
      if (overlay && overlay.style.display === "block") {
        showLoggedIn(user, userData);
      }

    } catch (err) {
      console.error("Auth state error:", err);
      setNavName(user.displayName?.split(" ")[0] || "Account");
    }

  } else {
    _resolveUserDoc(null); // no user — let seller.js redirect
    setNavName("Account");
    resetNavPhoto();
    if (adminLink)  adminLink.style.display  = "none";
    if (sellerLink) sellerLink.style.display = "none";
  }
});

// ─── OPEN PROFILE MODAL ───────────────────────────────────────────
window.openProfileModal = function () {
  const overlay = document.getElementById("profileModalOverlay");
  if (!overlay) return;
  overlay.style.display = "block";

  const user = auth.currentUser;
  if (user) {
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      showLoggedIn(user, snap.exists() ? snap.data() : {});
    });
  } else {
    switchProfileTab("login");
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────
window.handleProfileLogin = async function () {
  clearMsg("pLoginMsg");
  const email = document.getElementById("pLoginEmail").value.trim();
  const pass  = document.getElementById("pLoginPassword").value;

  if (!email || !pass) return showMsg("pLoginMsg", "Please fill in all fields.", false);

  setLoading("pLoginBtn", true);
  try {
    const cred     = await signInWithEmailAndPassword(auth, email, pass);
    const snap     = await getDoc(doc(db, "users", cred.user.uid));
    const userData = snap.exists() ? snap.data() : {};

    showLoggedIn(cred.user, userData);
  } catch (err) {
    const msgs = {
      "auth/user-not-found":     "No account found with this email.",
      "auth/wrong-password":     "Incorrect password.",
      "auth/invalid-email":      "Invalid email address.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/too-many-requests":  "Too many attempts. Please try again later.",
    };
    showMsg("pLoginMsg", msgs[err.code] || "Sign in failed. Please try again.", false);
  } finally {
    setLoading("pLoginBtn", false);
  }
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────
window.handleForgotPassword = async function () {
  const email = document.getElementById("pLoginEmail")?.value.trim();

  if (!email) {
    showMsg("pLoginMsg", "Please enter your email address first.", false);
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showMsg("pLoginMsg", "Password reset email sent! Check your inbox. ✅", true);
  } catch (err) {
    const msgs = {
      "auth/user-not-found": "No account found with this email.",
      "auth/invalid-email":  "Invalid email address.",
    };
    showMsg("pLoginMsg", msgs[err.code] || "Failed to send reset email. Try again.", false);
  }
};

// ─── ORDER HISTORY ────────────────────────────────────────────────
window.showOrderHistory = async function () {
  const section = document.getElementById("orderHistorySection");
  const list    = document.getElementById("orderHistoryList");
  const user    = auth.currentUser;

  if (!user || !section || !list) return;

  section.style.display = "";
  list.innerHTML = `<p style="color:#888; text-align:center;">Loading...</p>`;

  try {
    const q    = query(
      collection(db, "orders"),
      where("email", "==", user.email),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `<p style="color:#888; text-align:center; padding:1rem;">
        No orders yet. <a href="shop.html">Start shopping</a>
      </p>`;
      return;
    }

    list.innerHTML = snap.docs.map(d => {
      const o    = d.data();
      const date = o.createdAt?.toDate?.()
        ? o.createdAt.toDate().toLocaleDateString("en-GH", {
            day: "numeric", month: "short", year: "numeric"
          })
        : "N/A";

      const items = Array.isArray(o.items)
        ? o.items.map(i => `${i.name} x${i.qty}`).join(", ")
        : "—";

      const payColor      = o.status?.includes("Paid") ? "#2e7d32" : "#f59e0b";
      const deliveryColor = o.deliveryStatus?.includes("Delivered") ? "#2e7d32" : "#f59e0b";

      return `
        <div style="background:#f9f9f9; border-radius:10px; padding:1rem;
                    margin-bottom:0.8rem; border:1px solid #eee;">
          <div style="display:flex; justify-content:space-between;
                      align-items:center; margin-bottom:0.5rem;">
            <span style="font-size:0.75rem; color:#aaa;">ID: ${d.id.slice(0,8)}...</span>
            <span style="font-size:0.8rem; color:#888;">${date}</span>
          </div>
          <div style="font-size:0.85rem; margin-bottom:0.5rem; color:#555;">${items}</div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <span style="background:${payColor}22; color:${payColor};
                           padding:2px 8px; border-radius:20px; font-size:0.78rem; font-weight:600;">
                ${o.status || "Pending"}
              </span>
              <span style="background:${deliveryColor}22; color:${deliveryColor};
                           padding:2px 8px; border-radius:20px; font-size:0.78rem; font-weight:600;">
                ${o.deliveryStatus || "Pending Delivery"}
              </span>
            </div>
            <strong style="color:#2e7d32;">₵${Number(o.total || 0).toFixed(2)}</strong>
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    console.error("Order history error:", err);
    list.innerHTML = `<p style="color:#c0392b;">Failed to load orders.</p>`;
  }
};

window.hideOrderHistory = function () {
  const section = document.getElementById("orderHistorySection");
  if (section) section.style.display = "none";
};

// ─── REGISTER (regular user) ──────────────────────────────────────
window.handleProfileRegister = async function () {
  clearMsg("pRegMsg");
  const first   = document.getElementById("pRegFirst").value.trim();
  const last    = document.getElementById("pRegLast").value.trim();
  const email   = document.getElementById("pRegEmail").value.trim();
  const pass    = document.getElementById("pRegPassword").value;
  const confirm = document.getElementById("pRegConfirm").value;

  if (!first || !last || !email || !pass) return showMsg("pRegMsg", "Please fill in all fields.", false);
  if (pass.length < 6) return showMsg("pRegMsg", "Password must be at least 6 characters.", false);
  if (pass !== confirm) return showMsg("pRegMsg", "Passwords do not match.", false);

  setLoading("pRegBtn", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: `${first} ${last}` });
    await setDoc(doc(db, "users", cred.user.uid), {
      firstName: first,
      lastName:  last,
      email:     email,
      role:      "user",
      createdAt: serverTimestamp(),
    });
    showLoggedIn(cred.user, { firstName: first, lastName: last, email });
  } catch (err) {
    const msgs = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/invalid-email":        "Invalid email address.",
      "auth/weak-password":        "Password is too weak.",
    };
    showMsg("pRegMsg", msgs[err.code] || "Registration failed. Please try again.", false);
  } finally {
    setLoading("pRegBtn", false);
  }
};

// ─── REGISTER AS SELLER ───────────────────────────────────────────
async function handleSellerRegister() {
  clearMsg("pRegMsg");

  const first   = document.getElementById("pRegFirst").value.trim();
  const last    = document.getElementById("pRegLast").value.trim();
  const email   = document.getElementById("pRegEmail").value.trim();
  const pass    = document.getElementById("pRegPassword").value;
  const confirm = document.getElementById("pRegConfirm").value;

  if (!first || !last || !email || !pass) return showMsg("pRegMsg", "Please fill in all fields.", false);
  if (pass.length < 6) return showMsg("pRegMsg", "Password must be at least 6 characters.", false);
  if (pass !== confirm) return showMsg("pRegMsg", "Passwords do not match.", false);

  const btn = document.getElementById("sellerRegBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Please wait…"; }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: `${first} ${last}` });

    // Save user doc with role: "seller"
    await setDoc(doc(db, "users", cred.user.uid), {
      firstName: first,
      lastName:  last,
      email:     email,
      role:      "seller",
      approved:  false,
      createdAt: serverTimestamp(),
    });
    console.log("✅ User doc saved");

    // Save sellers collection doc (once only)
    await setDoc(doc(db, "sellers", cred.user.uid), {
      uid:       cred.user.uid,
      shopName:  "",
      email:     email,
      createdAt: serverTimestamp(),
    });
    console.log("✅ Seller doc saved");

    // Redirect straight to seller dashboard
    window.location.href = "seller-dashboard.html";

  } catch (err) {
    console.error("❌ Seller registration error:", err.code, err.message);
    const msgs = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/invalid-email":        "Invalid email address.",
      "auth/weak-password":        "Password is too weak.",
    };
    showMsg("pRegMsg", msgs[err.code] || "Registration failed. Please try again.", false);
    if (btn) { btn.disabled = false; btn.textContent = "Register as Seller"; }
  }
}

// ─── LOGOUT ───────────────────────────────────────────────────────
window.handleProfileLogout = async function () {
  try {
    await signOut(auth);
    closeProfileModal();
    setNavName("Account");
    resetNavPhoto();
  } catch (err) {
    console.error("Logout error:", err);
  }
};

// ─── AVATAR UPLOAD ────────────────────────────────────────────────
function initAvatarUpload() {
  const avatarInput = document.getElementById("avatarFileInput");
  const avatarEl    = document.getElementById("pAvatar");

  if (!avatarInput || !avatarEl) return;
  if (avatarInput._bound) return;
  avatarInput._bound = true;

  avatarEl.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) return;

    avatarEl.innerHTML = `<span style="font-size:11px; color:#888;">Uploading...</span>`;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", "product_upload");

      const res  = await fetch("https://api.cloudinary.com/v1_1/dw3h0amnh/image/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      const photoURL = data.secure_url;

      if (!photoURL) throw new Error("No URL returned from Cloudinary");

      await setDoc(doc(db, "users", user.uid), { photoURL }, { merge: true });

      avatarEl.innerHTML = `<img src="${photoURL}"
        style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;

      setNavPhoto(photoURL);

    } catch (err) {
      console.error("Avatar upload failed:", err);
      avatarEl.innerHTML = `<span style="font-size:11px; color:red;">Failed ❌</span>`;
    }
  });
}