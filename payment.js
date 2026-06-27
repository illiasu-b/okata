export function startPayment(customer, onSuccess) {
  if (typeof PaystackPop === "undefined") {
    alert("Paystack not loaded ❌");
    return;
  }

  // ✅ GET CART FROM LOCALSTORAGE (FIX)
  const cart = JSON.parse(localStorage.getItem("cart")) || [];

  const total = cart.reduce(
    (sum, i) => sum + Number(i.price) * Number(i.qty),
    0
  );

  if (total <= 0) {
    alert("Cart is empty ❌");
    return;
  }

  const handler = PaystackPop.setup({
    key: "pk_test_15c9f4dc6fc7acc13d7981c48c8bba1783f62a21",
    email: customer.email,
    amount: total * 100,
    currency: "GHS",
    ref: "" + Date.now(),

    callback: function (response) {
      console.log("Payment successful:", response.reference);
      if (onSuccess) onSuccess(response.reference);
    },

    onClose: function () {
      alert("Payment cancelled.");
    }
  });

  handler.openIframe();
}