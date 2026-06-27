// darkmode.js

const DARK_KEY = "okata-darkmode";

// Apply saved preference immediately on load
(function () {
  if (localStorage.getItem(DARK_KEY) === "true") {
    document.documentElement.classList.add("dark");
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  // Create the toggle button
  const btn = document.createElement("button");
  btn.id = "darkModeToggle";
  btn.setAttribute("aria-label", "Toggle dark mode");
  btn.innerHTML = document.documentElement.classList.contains("dark") ? "☀️" : "🌙";
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 16px;
    z-index: 9999;
    background: #2e7d32;
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 42px;
    height: 42px;
    font-size: 1.2rem;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;

  document.body.appendChild(btn);

  btn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem(DARK_KEY, isDark);
    btn.innerHTML = isDark ? "☀️" : "🌙";
  });
});