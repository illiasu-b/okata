import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const heroContainer = document.querySelector(".hero-container");

// ✅ MUST BE OUTSIDE (GLOBAL SCOPE)
function getImage(p) {
  if (p.imageURL && p.imageURL.trim() !== "") {
    return p.imageURL;
  }
  return "images/no-image.png";
}

async function loadHeroProducts() {
  if (!heroContainer) return;

  try {
    const productsRef = collection(db, "products");
    const snapshot = await getDocs(productsRef);

    snapshot.docs.forEach(doc => {
      const product = doc.data();

      const card = document.createElement("div");
      card.className = "hero-product";

      const img = document.createElement("img");

      // ✅ NOW THIS WORKS
      img.src = getImage(product);

      const title = document.createElement("h4");
      title.textContent = product.name || "Product";

      const price = document.createElement("p");
      price.textContent = `₵${product.price || 0}`;

      card.appendChild(img);
      card.appendChild(title);
      card.appendChild(price);

      card.addEventListener("click", () => {
        window.location.href = `shop.html?id=${doc.id}`;
      });

      heroContainer.appendChild(card);
    });

  } catch (error) {
    console.error("Error loading hero products:", error);
  }
}

document.addEventListener("DOMContentLoaded", loadHeroProducts);