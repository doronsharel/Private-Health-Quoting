const { getFirestore, getAuth } = require("./lib/firebase");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const MFA_REQUIRED_DAYS = 7; // Require MFA once per week

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...CORS_HEADERS },
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const authHeader = event.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Missing authorization header." }),
      };
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const db = getFirestore();
    const userRef = db.collection("users").doc(uid);
    const snapshot = await userRef.get();
    const userData = snapshot.exists ? snapshot.data() : null;

    const lastMfaVerification = userData?.lastMfaVerification;
    let mfaRequired = true;

    if (lastMfaVerification) {
      const lastVerificationDate = lastMfaVerification.toDate();
      const now = new Date();
      const diffMs = now.getTime() - lastVerificationDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      // Only require MFA if 7 or more days have passed since last verification
      // This means if they verified today (0 days), they won't need to verify again for 7 days
      mfaRequired = diffDays >= MFA_REQUIRED_DAYS;
      
      console.log(`[check-mfa-required] User ${uid}: Last verification: ${lastVerificationDate.toISOString()}, Days since: ${diffDays.toFixed(2)}, MFA required: ${mfaRequired}`);
    } else {
      console.log(`[check-mfa-required] User ${uid}: No previous MFA verification found, requiring MFA`);
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        mfaRequired,
        lastMfaVerification: lastMfaVerification
          ? lastMfaVerification.toDate().toISOString()
          : null,
      }),
    };
  } catch (err) {
    console.error("[check-mfa-required] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to check MFA status.",
      }),
    };
  }
};

