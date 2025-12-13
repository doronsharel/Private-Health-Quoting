import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeBMg5WQA33ncHTVHr6aWG1qDqsmiVngo",
  authDomain: "private-health-quoting-tool.firebaseapp.com",
  projectId: "private-health-quoting-tool",
  storageBucket: "private-health-quoting-tool.firebasestorage.app",
  messagingSenderId: "635575199840",
  appId: "1:635575199840:web:c1dd0b2d3c97c5460b7b05",
  measurementId: "G-XSFGTR7J1S",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };
