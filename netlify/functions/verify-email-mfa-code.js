const { getFirestore, getAuth, FieldValue } = require("./lib/firebase");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...CORS_HEADERS },
    };
  }

  if (event.httpMethod !== "POST") {
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

    const body = JSON.parse(event.body || "{}");
    const code = body.code?.trim();

    if (!code) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Verification code is required." }),
      };
    }

    // Get stored code from Firestore
    const db = getFirestore();
    const codeRef = db.collection("mfaCodes").doc(uid);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "No verification code found. Please request a new code." }),
      };
    }

    const codeData = codeDoc.data();
    const storedCode = codeData.code;
    const expiresAt = codeData.expiresAt?.toDate();

    // Check if code has expired
    if (expiresAt && expiresAt < new Date()) {
      await codeRef.delete(); // Clean up expired code
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Verification code has expired. Please request a new code." }),
      };
    }

    // Verify code
    if (code !== storedCode) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Invalid verification code." }),
      };
    }

    // Code is valid - delete it and update MFA verification
    await codeRef.delete();

    // Update last MFA verification date
    const userRef = db.collection("users").doc(uid);
    await userRef.set({
      lastMfaVerification: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: true,
        message: "Verification successful.",
      }),
    };
  } catch (err) {
    console.error("[verify-email-mfa-code] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to verify code.",
      }),
    };
  }
};













