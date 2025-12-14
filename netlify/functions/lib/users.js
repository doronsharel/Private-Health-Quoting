const { getFirestore, getAuth, FieldValue, Timestamp } = require("./firebase");
const { isOwnerEmail } = require("../access-control.js");

const USERS_COLLECTION = "users";
const ACCESS_STATUSES = new Set(["active", "trialing"]);

const serverTimestamp = () => FieldValue.serverTimestamp();
const timestampFromSeconds = (seconds) =>
  seconds ? Timestamp.fromMillis(seconds * 1000) : null;

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

async function authenticateRequest(event) {
  const authHeader = event.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    const err = new Error("Missing or invalid authorization header.");
    err.statusCode = 401;
    throw err;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = normalizeEmail(decoded.email);
    const owner = isOwnerEmail(email);
    const uid = decoded.uid;
    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const snapshot = await userRef.get();
    const existing = snapshot.exists ? snapshot.data() : null;

    const baseData = {
      uid,
      email,
      isOwner: owner,
      updatedAt: serverTimestamp(),
    };

    if (!existing) {
      baseData.createdAt = serverTimestamp();
    }

    await userRef.set(baseData, { merge: true });

    return {
      uid,
      email,
      isOwner: owner,
      docRef: userRef,
      docData: { ...(existing || {}), ...baseData },
    };
  } catch (err) {
    if (!err.statusCode) err.statusCode = 401;
    throw err;
  }
}

function userHasPaidAccess(userRecord) {
  if (userRecord.isOwner) return true;
  const status = (userRecord.docData?.subscriptionStatus || "").toLowerCase();
  if (ACCESS_STATUSES.has(status)) return true;
  const manualExpiry = userRecord.docData?.manualAccessExpiresAt;
  if (manualExpiry && manualExpiry.toDate) {
    return manualExpiry.toDate() > new Date();
  }
  return false;
}

async function updateSubscription(uid, updates) {
  const db = getFirestore();
  const ref = db.collection(USERS_COLLECTION).doc(uid);
  const payload = {
    updatedAt: serverTimestamp(),
    ...updates,
  };
  await ref.set(payload, { merge: true });
}

module.exports = {
  authenticateRequest,
  userHasPaidAccess,
  updateSubscription,
  timestampFromSeconds,
  serverTimestamp,
};
