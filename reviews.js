import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ======================
// RENDER STARS
// ======================
export function renderStars(rating, interactive = false, productId = "") {
  return [1, 2, 3, 4, 5].map(i => `
    <span
      ${interactive ? `onclick="setRating(${i}, '${productId}')" onmouseover="hoverRating(${i}, '${productId}')" onmouseout="resetHover('${productId}')"` : ""}
      class="star ${interactive ? "star-interactive" : ""}"
      data-star="${i}"
      data-product="${productId}"
      style="font-size:1.2rem; cursor:${interactive ? "pointer" : "default"};
             color:${i <= rating ? "#f59e0b" : "#ddd"};">★</span>
  `).join("");
}

// ======================
// OPEN REVIEW MODAL
// ======================
window.openReviewModal = function (productId, productName) {
  if (!auth.currentUser) {
    alert("Please sign in to leave a review.");
    return;
  }

  const existing = document.getElementById("reviewModalOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "reviewModalOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.55);
    z-index:9999; display:flex; align-items:center;
    justify-content:center; padding:1rem;
  `;

  overlay.innerHTML = `
    <div style="background:#fff; border-radius:14px; max-width:420px; width:100%;
                padding:2rem; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.25);">

      <button onclick="document.getElementById('reviewModalOverlay').remove()"
        style="position:absolute; top:1rem; right:1rem; background:none;
               border:none; font-size:1.4rem; cursor:pointer; color:#888;">✕</button>

      <h3 style="font-size:1.2rem; margin-bottom:0.3rem;">Write a Review</h3>
      <p style="color:#888; font-size:0.85rem; margin-bottom:1.2rem;">${productName}</p>

      <!-- Star Rating -->
      <div style="margin-bottom:1rem;">
        <label style="display:block; font-size:0.8rem; font-weight:600;
                      color:#888; text-transform:uppercase; margin-bottom:0.5rem;">
          Your Rating
        </label>
        <div id="reviewStars_${productId}" style="font-size:2rem;">
          ${renderStars(0, true, productId)}
        </div>
        <input type="hidden" id="reviewRating_${productId}" value="0">
      </div>

      <!-- Review Text -->
      <div style="margin-bottom:1.2rem;">
        <label style="display:block; font-size:0.8rem; font-weight:600;
                      color:#888; text-transform:uppercase; margin-bottom:0.5rem;">
          Your Review
        </label>
        <textarea id="reviewText_${productId}" placeholder="Share your experience..."
          style="width:100%; padding:0.7rem 0.9rem; border:1.5px solid #e0e0e0;
                 border-radius:8px; font-size:0.95rem; outline:none;
                 box-sizing:border-box; resize:vertical; min-height:100px;"></textarea>
      </div>

      <div id="reviewMsg_${productId}" style="display:none; margin-bottom:1rem;
           padding:0.6rem 0.9rem; border-radius:8px; font-size:0.88rem;"></div>

      <button onclick="submitReview('${productId}')"
        style="width:100%; padding:0.85rem; background:#2e7d32; color:#fff;
               border:none; border-radius:8px; font-size:1rem;
               font-weight:600; cursor:pointer;">
        Submit Review
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
};

// ======================
// STAR HOVER EFFECTS
// ======================
window.hoverRating = function (value, productId) {
  const stars = document.querySelectorAll(`[data-product="${productId}"]`);
  stars.forEach(s => {
    s.style.color = Number(s.dataset.star) <= value ? "#f59e0b" : "#ddd";
  });
};

window.resetHover = function (productId) {
  const current = Number(document.getElementById(`reviewRating_${productId}`)?.value || 0);
  const stars   = document.querySelectorAll(`[data-product="${productId}"]`);
  stars.forEach(s => {
    s.style.color = Number(s.dataset.star) <= current ? "#f59e0b" : "#ddd";
  });
};

window.setRating = function (value, productId) {
  const input = document.getElementById(`reviewRating_${productId}`);
  if (input) input.value = value;
  const stars = document.querySelectorAll(`[data-product="${productId}"]`);
  stars.forEach(s => {
    s.style.color = Number(s.dataset.star) <= value ? "#f59e0b" : "#ddd";
  });
};

// ======================
// SUBMIT REVIEW
// ======================
window.submitReview = async function (productId) {
  const user    = auth.currentUser;
  const rating  = Number(document.getElementById(`reviewRating_${productId}`)?.value || 0);
  const text    = document.getElementById(`reviewText_${productId}`)?.value.trim();
  const msgEl   = document.getElementById(`reviewMsg_${productId}`);

  function showMsg(msg, ok) {
    msgEl.textContent      = msg;
    msgEl.style.display    = "block";
    msgEl.style.background = ok ? "#e8f5e9" : "#fdecea";
    msgEl.style.color      = ok ? "#2e7d32" : "#c0392b";
    msgEl.style.border     = "1px solid " + (ok ? "#a5d6a7" : "#f1948a");
  }

  if (!user)         return showMsg("Please sign in to leave a review.", false);
  if (rating === 0)  return showMsg("Please select a star rating.", false);
  if (!text)         return showMsg("Please write a review.", false);

  try {
    // Check if user already reviewed this product
    const existing = await getDocs(query(
      collection(db, "reviews"),
      where("productId", "==", productId),
      where("userId",    "==", user.uid)
    ));

    if (!existing.empty) {
      return showMsg("You have already reviewed this product.", false);
    }

    await addDoc(collection(db, "reviews"), {
      productId,
      userId:    user.uid,
      userName:  user.displayName || user.email.split("@")[0],
      rating,
      text,
      createdAt: serverTimestamp()
    });

    showMsg("Review submitted! ✅", true);
    setTimeout(() => {
      document.getElementById("reviewModalOverlay")?.remove();
      // Refresh reviews display if on product page
      loadProductReviews(productId);
    }, 1500);

  } catch (err) {
    console.error("Review error:", err);
    showMsg("Failed to submit review. Try again.", false);
  }
};

// ======================
// LOAD REVIEWS FOR A PRODUCT
// ======================
export function loadProductReviews(productId) {
  const container = document.getElementById(`reviews_${productId}`);
  if (!container) return;

  const q = query(
    collection(db, "reviews"),
    where("productId", "==", productId),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      container.innerHTML = `<p style="color:#888; font-size:0.85rem;">
        No reviews yet. Be the first to review!
      </p>`;
      return;
    }

    const avg = snap.docs.reduce((sum, d) => sum + d.data().rating, 0) / snap.size;

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:1rem;">
        <span style="font-size:1.5rem; font-weight:700; color:#f59e0b;">${avg.toFixed(1)}</span>
        <div>
          ${renderStars(Math.round(avg))}
          <div style="font-size:0.8rem; color:#888;">${snap.size} review${snap.size !== 1 ? "s" : ""}</div>
        </div>
      </div>
      ${snap.docs.map(d => {
        const r    = d.data();
        const date = r.createdAt?.toDate?.()
          ? r.createdAt.toDate().toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })
          : "";
        return `
          <div style="padding:0.8rem 0; border-bottom:1px solid #f0f0f0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:28px; height:28px; border-radius:50%; background:#e8f5e9;
                            display:flex; align-items:center; justify-content:center;
                            font-size:0.75rem; font-weight:700; color:#2e7d32;">
                  ${(r.userName || "U")[0].toUpperCase()}
                </div>
                <span style="font-weight:600; font-size:0.9rem;">${r.userName}</span>
              </div>
              <span style="font-size:0.75rem; color:#aaa;">${date}</span>
            </div>
            <div style="margin-bottom:0.3rem;">${renderStars(r.rating)}</div>
            <p style="font-size:0.88rem; color:#555; margin:0;">${r.text}</p>
          </div>
        `;
      }).join("")}
    `;
  });
}

// ======================
// AVERAGE RATING BADGE
// ======================
export async function getAverageRating(productId) {
  const snap = await getDocs(query(
    collection(db, "reviews"),
    where("productId", "==", productId)
  ));
  if (snap.empty) return null;
  const avg = snap.docs.reduce((sum, d) => sum + d.data().rating, 0) / snap.size;
  return { avg: avg.toFixed(1), count: snap.size };
}