const admin = require("firebase-admin");

let app;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT env var is missing. Add the service account JSON."
    );
  }

  if (typeof raw === "object") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (decodeErr) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT must be JSON or base64-encoded JSON."
      );
    }
  }
}

function initApp() {
  if (app) return app;

  const serviceAccount = parseServiceAccount();
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

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
