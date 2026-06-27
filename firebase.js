// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCSEOygUs5P44f28hEKqGHhGhTKfVfN-3k",
  authDomain: "okata-3686.firebaseapp.com",
  projectId: "okata-3686",
  storageBucket: "okata-3686.firebasestorage.app",
  messagingSenderId: "429845808309",
  appId: "1:429845808309:web:b1c49d364ac7a167896afc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };