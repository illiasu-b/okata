import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUTS MODULE (admin only)
//
// A seller's "owed balance" = sum of their DELIVERED orders that have not
// yet been included in a completed payout (order.payoutId is unset/null).
//
// Calling triggerPayout(sellerUid) will:
//   1. Find all unpaid, delivered orders for that seller
//   2. Create a `payouts` record (status: "pending")
//   3. Call your backend's /api/payout endpoint to actually move the money
//   4. On success, flag each covered order with payoutId + mark payout "completed"
//   5. On failure, mark the payout record "failed" — orders stay unflagged
//      so they remain eligible for a retried payout
//
// IMPORTANT: this module does NOT and must NEVER contain your Paystack
// secret key. The actual transfer happens server-side, at the URL below.
// ─────────────────────────────────────────────────────────────────────────────

const PAYOUT_ENDPOINT = "/api/payout"; // ← your backend route

// ── GET ALL SELLERS' OWED BALANCES ────────────────────────────────────────────
// Returns: [{ sellerUid, sellerName, owedAmount, orderIds, orderCount }]
export async function getAllSellerBalances() {
  const q = query(
    collection(db, "orders"),
    where("status", "==", "delivered")
  );
  const snap = await getDocs(q);

  const bySeller = {};

  snap.forEach((docSnap) => {
    const order = docSnap.data();
    if (!order.sellerUid) return;
    if (order.payoutId) return; // already paid out — skip

    if (!bySeller[order.sellerUid]) {
      bySeller[order.sellerUid] = {
        sellerUid:   order.sellerUid,
        sellerName:  order.sellerName || "Unknown Seller",
        owedAmount:  0,
        orderIds:    [],
        orderCount:  0
      };
    }

    bySeller[order.sellerUid].owedAmount += Number(order.total || 0);
    bySeller[order.sellerUid].orderIds.push(docSnap.id);
    bySeller[order.sellerUid].orderCount += 1;
  });

  return Object.values(bySeller).sort((a, b) => b.owedAmount - a.owedAmount);
}

// ── GET ONE SELLER'S OWED BALANCE ─────────────────────────────────────────────
export async function getSellerBalance(sellerUid) {
  const q = query(
    collection(db, "orders"),
    where("sellerUid", "==", sellerUid),
    where("status", "==", "delivered")
  );
  const snap = await getDocs(q);

  let owedAmount = 0;
  const orderIds = [];

  snap.forEach((docSnap) => {
    const order = docSnap.data();
    if (order.payoutId) return; // already paid out
    owedAmount += Number(order.total || 0);
    orderIds.push(docSnap.id);
  });

  return { sellerUid, owedAmount, orderIds, orderCount: orderIds.length };
}

// ── TRIGGER PAYOUT FOR ONE SELLER ─────────────────────────────────────────────
export async function triggerPayout(sellerUid) {
  const { owedAmount, orderIds, orderCount } = await getSellerBalance(sellerUid);

  if (orderCount === 0 || owedAmount <= 0) {
    throw new Error("Nothing owed to this seller right now.");
  }

  const sellerSnap = await getDoc(doc(db, "users", sellerUid));
  if (!sellerSnap.exists()) throw new Error("Seller account not found.");
  const seller = sellerSnap.data();

  // 1. Create the payout record first, status "pending"
  const payoutRef = await addDoc(collection(db, "payouts"), {
    sellerUid,
    sellerName:  `${seller.firstName || ""} ${seller.lastName || ""}`.trim(),
    amount:      owedAmount,
    currency:    "GHS",
    orderIds,
    status:      "pending",
    createdAt:   serverTimestamp()
  });

  try {
    // 2. Call your backend — this is where the real Paystack Transfer happens.
    //    Your backend must use the Paystack SECRET key server-side only.
    const res = await fetch(PAYOUT_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerUid,
        amount:   owedAmount,
        payoutId: payoutRef.id
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Payout request failed (${res.status}): ${errText || "no details"}`);
    }

    const result = await res.json(); // expected: { success: true, transferRef: "..." }

    if (!result.success) {
      throw new Error(result.message || "Backend reported payout failure.");
    }

    // 3. Success — mark payout completed, flag every covered order
    await updateDoc(payoutRef, {
      status:              "completed",
      paystackTransferRef: result.transferRef || null,
      completedAt:         serverTimestamp()
    });

    const batch = writeBatch(db);
    orderIds.forEach((orderId) => {
      batch.update(doc(db, "orders", orderId), { payoutId: payoutRef.id });
    });
    await batch.commit();

    return { success: true, payoutId: payoutRef.id, amount: owedAmount, orderCount };

  } catch (err) {
    // Failure — mark payout failed. Orders stay unflagged, so they're
    // still eligible next time triggerPayout runs for this seller.
    await updateDoc(payoutRef, {
      status:    "failed",
      error:     err.message || String(err),
      failedAt:  serverTimestamp()
    });
    throw err;
  }
}

// ── GET PAYOUT HISTORY FOR ONE SELLER ─────────────────────────────────────────
export async function getPayoutHistory(sellerUid) {
  const q = query(collection(db, "payouts"), where("sellerUid", "==", sellerUid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ── GET ALL PAYOUT HISTORY (admin overview) ───────────────────────────────────
export async function getAllPayoutHistory() {
  const snap = await getDocs(collection(db, "payouts"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}