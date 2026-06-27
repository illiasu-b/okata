import { db } from "./firebase.js";
import { collection, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const promoRef = collection(db, "promotions");
    const q        = query(promoRef, where("active", "==", true));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log("No active promotions found.");
      return;
    }

    const promos    = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const container = document.getElementById("promo-banner-container");

    if (!container) return;

    let index = 0;

    promos.forEach((promo, i) => {
      const banner      = document.createElement("div");
      banner.className  = `promo-banner ${i === 0 ? "promo-show" : "promo-hidden"}`;
      banner.style.position = "relative"; // needed for badge positioning

      // ✅ Discount badge — only shows if discount > 0
      if (promo.discount && Number(promo.discount) > 0) {
        const badge           = document.createElement("span");
        badge.textContent     = `${promo.discount}% OFF`;
        badge.style.cssText   = `
          position: absolute;
          top: 10px;
          left: 10px;
          background: #dc2626;
          color: #fff;
          font-size: 13px;
          font-weight: bold;
          padding: 4px 10px;
          border-radius: 20px;
          z-index: 10;
        `;
        banner.appendChild(badge);
      }

      // Image
      const img     = document.createElement("img");
      img.src       = promo.imageURL || promo.imageUrl || "placeholder.png";
      img.alt       = promo.name || promo.title || "Promotion";
      img.className = "promo-image";

      // Title
      const title         = document.createElement("h2");
      title.textContent   = promo.name || promo.title || "";

      // Price — shows discounted price if discount exists
      const priceEl = document.createElement("p");
      if (promo.price) {
        const currency = promo.currency || "GHS";
        const symbol   =
          currency === "USD" ? "$" :
          currency === "EUR" ? "€" :
          currency === "GBP" ? "£" : "₵";

        if (promo.discount && Number(promo.discount) > 0) {
          const discounted = (promo.price * (1 - promo.discount / 100)).toFixed(2);
          priceEl.innerHTML = `
            <span style="text-decoration:line-through; color:#888; margin-right:6px;">${symbol}${promo.price}</span>
            <span style="color:#dc2626; font-weight:bold;">${symbol}${discounted}</span>
          `;
        } else {
          priceEl.textContent = `${symbol}${promo.price}`;
        }
      }

      // Message
      const message       = document.createElement("p");
      message.textContent = promo.message || "";

      // ✅ Add to Cart button — links to cartLink or defaults to shop.html
      const btn       = document.createElement("a");
      btn.href        = promo.cartLink || promo.buttonLink || "shop.html";
      btn.textContent = promo.buttonText || "Add to Cart";
      btn.style.cssText = `
        display: inline-block;
        margin-top: 8px;
        padding: 8px 18px;
        background: #16a34a;
        color: #fff;
        border-radius: 6px;
        text-decoration: none;
        font-weight: bold;
      `;

      banner.appendChild(img);
      banner.appendChild(title);
      banner.appendChild(priceEl);
      banner.appendChild(message);
      banner.appendChild(btn);

      container.appendChild(banner);
    });

    const banners = container.querySelectorAll("div");

    // Rotate promos every 4s
    setInterval(() => {
      banners[index].classList.remove("promo-show");
      banners[index].classList.add("promo-hidden");
      index = (index + 1) % banners.length;
      banners[index].classList.remove("promo-hidden");
      banners[index].classList.add("promo-show");
    }, 4000);

  } catch (error) {
    console.error("Error loading promotions:", error);
  }
});