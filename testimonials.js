import { db } from "./firebase.js";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let selectedRating = 0;

document.addEventListener("DOMContentLoaded", () => {
  const stars     = document.querySelectorAll("#starRating span");
  const container = document.getElementById("testimonialsContainer");

  // ⭐ Star rating click
  stars.forEach(star => {
    star.addEventListener("click", () => {
      selectedRating = star.getAttribute("data-value");
      stars.forEach(s => s.classList.remove("active"));
      for (let i = 0; i < selectedRating; i++) {
        stars[i].classList.add("active");
      }
    });
  });

  // 🔥 Load testimonials in real time
  const q = query(collection(db, "testimonials"), orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    if (!container) return;
    container.innerHTML = "";
    snapshot.forEach(doc => {
      addReview(doc.data());
    });
  });

  // 💾 Submit review
  document.getElementById("submitReview")?.addEventListener("click", async () => {
    const name = document.getElementById("customerName").value;
    const text = document.getElementById("customerReview").value;

    if (!name || !text || selectedRating == 0) {
      alert("Please complete all fields and select rating.");
      return;
    }

    await addDoc(collection(db, "testimonials"), {
      name:      name,
      text:      text,
      rating:    Number(selectedRating),
      createdAt: serverTimestamp()
    });

    document.getElementById("customerName").value   = "";
    document.getElementById("customerReview").value = "";
    stars.forEach(s => s.classList.remove("active"));
    selectedRating = 0;
  });

  function addReview(review) {
    if (!container) return;
    const card = document.createElement("div");
    card.classList.add("testimonial-card");

    let starIcons = "";
    for (let i = 0; i < review.rating; i++) {
      starIcons += "★";
    }

    card.innerHTML = `
      <div class="stars">${starIcons}</div>
      <h4>${review.name}</h4>
      <p>${review.text}</p>
    `;

    container.appendChild(card);
  }
});