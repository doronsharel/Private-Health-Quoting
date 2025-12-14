const admin = require("firebase-admin");

let app;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  // Log for debugging (without sensitive data)
  console.log("[firebase] FIREBASE_SERVICE_ACCOUNT exists:", !!raw);
  console.log("[firebase] FIREBASE_SERVICE_ACCOUNT type:", typeof raw);
  console.log("[firebase] FIREBASE_SERVICE_ACCOUNT length:", raw ? raw.length : 0);
  console.log("[firebase] FIREBASE_SERVICE_ACCOUNT starts with:", raw ? raw.substring(0, 50) : "N/A");
  
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT env var is missing. Add the service account JSON."
    );
  }

  if (typeof raw === "object") {
    return raw;
  }

  // Remove surrounding quotes if present (from .env file parsing)
  let cleaned = raw.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    console.log("[firebase] Successfully parsed service account");
    return parsed;
  } catch (err) {
    console.error("[firebase] JSON parse error:", err.message);
    console.error("[firebase] First 200 chars of cleaned value:", cleaned.substring(0, 200));
    try {
      const decoded = Buffer.from(cleaned, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      console.log("[firebase] Successfully parsed base64-encoded service account");
      return parsed;
    } catch (decodeErr) {
      console.error("[firebase] Base64 decode error:", decodeErr.message);
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT must be JSON or base64-encoded JSON. JSON parse error: ${err.message}, Base64 error: ${decodeErr.message}`
      );
    }
  }
}

function initApp() {
  if (app) {
    console.log("[firebase] Using existing app instance");
    return app;
  }

  try {
    console.log("[firebase] Initializing Firebase app...");
    const serviceAccount = parseServiceAccount();
    console.log("[firebase] Service account parsed, initializing app...");
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("[firebase] Firebase app initialized successfully");
  } catch (err) {
    console.error("[firebase] Initialization error:", err);
    console.error("[firebase] Error stack:", err.stack);
    throw new Error(`Firebase initialization failed: ${err.message}`);
  }

  return app;
}

function getFirestore() {
  return initApp().firestore();
}

function getAuth() {
  return initApp().auth();
}

module.exports = {
  getFirestore,
  getAuth,
  FieldValue: admin.firestore.FieldValue,
  Timestamp: admin.firestore.Timestamp,
};
