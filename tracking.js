import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function showMsg(text, ok) {
  const el = document.getElementById("trackMsg");
  el.textContent = text;
  el.style.display = "block";
  el.style.padding = "0.6rem 0.9rem";
  el.style.borderRadius = "8px";
  el.style.fontSize = "0.9rem";
  el.style.background = ok ? "#e8f5e9" : "#fdecea";
  el.style.color      = ok ? "#2e7d32" : "#c0392b";
  el.style.border     = "1px solid " + (ok ? "#a5d6a7" : "#f1948a");
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("paid") || s.includes("delivered")) return "#2e7d32";
  if (s.includes("pending"))  return "#f59e0b";
  if (s.includes("cancel"))   return "#ef4444";
  if (s.includes("shipped"))  return "#1d4ed8";
  return "#888";
}

function renderOrders(orders) {
  const container = document.getElementById("trackResults");

  if (orders.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:2rem; color:#888;">
        <i class="fas fa-box-open" style="font-size:2rem; margin-bottom:0.8rem;"></i>
        <p>No orders found.</p>
      </div>`;
    return;
  }

  container.innerHTML = orders.map(order => {
    const date = order.createdAt?.toDate?.()
      ? order.createdAt.toDate().toLocaleDateString("en-GH", {
          day: "numeric", month: "short", year: "numeric"
        })
      : "N/A";

    const items = Array.isArray(order.items)
      ? order.items.map(i => `${i.name} x${i.qty}`).join(", ")
      : "—";

    const payStatus      = order.status          || "Pending Payment";
    const deliveryStatus = order.deliveryStatus  || "Pending Delivery";

    return `
      <div style="background:#fff; border-radius:12px; padding:1.5rem;
                  box-shadow:0 4px 20px rgba(0,0,0,0.08); margin-bottom:1rem;">

        <div style="display:flex; justify-content:space-between; align-items:center;
                    margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-size:0.75rem; color:#aaa; text-transform:uppercase;">Order ID</div>
            <div style="font-weight:600; font-size:0.9rem; color:#555;">${order.id}</div>
          </div>
          <div style="font-size:0.85rem; color:#888;">${date}</div>
        </div>

        <div style="margin-bottom:0.8rem;">
          <div style="font-size:0.78rem; color:#aaa; text-transform:uppercase; margin-bottom:0.3rem;">Items</div>
          <div style="font-size:0.9rem;">${items}</div>
        </div>

        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:0.8rem;">
          <div>
            <div style="font-size:0.78rem; color:#aaa; text-transform:uppercase; margin-bottom:0.3rem;">Payment</div>
            <span style="background:${statusColor(payStatus)}22; color:${statusColor(payStatus)};
                         padding:3px 10px; border-radius:20px; font-size:0.82rem; font-weight:600;">
              ${payStatus}
            </span>
          </div>
          <div>
            <div style="font-size:0.78rem; color:#aaa; text-transform:uppercase; margin-bottom:0.3rem;">Delivery</div>
            <span style="background:${statusColor(deliveryStatus)}22; color:${statusColor(deliveryStatus)};
                         padding:3px 10px; border-radius:20px; font-size:0.82rem; font-weight:600;">
              ${deliveryStatus}
            </span>
          </div>
        </div>

        <div style="border-top:1px solid #f0f0f0; padding-top:0.8rem; margin-top:0.8rem;
                    display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#888; font-size:0.85rem;">Total</span>
          <span style="font-weight:700; font-size:1rem; color:#2e7d32;">
            ₵${Number(order.total || 0).toFixed(2)}
          </span>
        </div>
      </div>
    `;
  }).join("");
}

window.trackOrder = async function () {
  const email   = document.getElementById("trackEmail").value.trim();
  const orderId = document.getElementById("trackOrderId").value.trim();
  const btn     = document.getElementById("trackBtn");
  const results = document.getElementById("trackResults");

  results.innerHTML = "";
  document.getElementById("trackMsg").style.display = "none";

  if (!email && !orderId) {
    showMsg("Please enter your email or order ID.", false);
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Searching…";

  try {
    let orders = [];

    if (orderId) {
      // Search by order ID
      const snap = await getDoc(doc(db, "orders", orderId));
      if (snap.exists()) {
        orders = [{ id: snap.id, ...snap.data() }];
      }
    } else if (email) {
      // Search by email
      const q    = query(collection(db, "orders"), where("email", "==", email));
      const snap = await getDocs(q);
      orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (orders.length === 0) {
      showMsg("No orders found. Please check your email or order ID.", false);
    } else {
      showMsg(`Found ${orders.length} order${orders.length > 1 ? "s" : ""}. ✅`, true);
    }

    renderOrders(orders);

  } catch (err) {
    console.error("Track order error:", err);
    showMsg("Something went wrong. Please try again.", false);
  } finally {
    btn.disabled    = false;
    btn.innerHTML   = '<i class="fas fa-search"></i> Track Order';
  }
};