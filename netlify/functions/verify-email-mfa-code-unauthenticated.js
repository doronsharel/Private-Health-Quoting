const { getFirestore, getAuth } = require("./lib/firebase");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
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
    const body = JSON.parse(event.body || "{}");
    const code = body.code?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!code) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Verification code is required." }),
      };
    }

    if (!email) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Email is required." }),
      };
    }

    // Get user by email using Firebase Admin
    const auth = getAuth();
    let uid;
    try {
      const userRecord = await auth.getUserByEmail(email);
      uid = userRecord.uid;
    } catch (authErr) {
      // If user not found in Auth, try Firestore as fallback
      const db = getFirestore();
      const usersRef = db.collection("users");
      const snapshot = await usersRef.where("email", "==", email).limit(1).get();
      
      if (snapshot.empty) {
        return {
          statusCode: 404,
          headers: { ...CORS_HEADERS },
          body: JSON.stringify({ error: "No account found for this email." }),
        };
      }
      
      uid = snapshot.docs[0].id;
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
      lastMfaVerification: require("./lib/firebase").FieldValue.serverTimestamp(),
      updatedAt: require("./lib/firebase").FieldValue.serverTimestamp(),
    }, { merge: true });

    // Try to remove old Firebase MFA enrollment if it exists
    try {
      const userRecord = await auth.getUser(uid);
      if (userRecord.multiFactor && userRecord.multiFactor.enrolledFactors && userRecord.multiFactor.enrolledFactors.length > 0) {
        // User has MFA enrolled - we can't remove it via Admin SDK directly
        // But we've updated the verification timestamp, so they should be able to log in
        // The frontend will handle showing email MFA instead
        console.log(`[verify-email-mfa-code-unauthenticated] User ${uid} has ${userRecord.multiFactor.enrolledFactors.length} MFA factors enrolled`);
      }
    } catch (mfaErr) {
      console.log("[verify-email-mfa-code-unauthenticated] Could not check MFA status:", mfaErr.message);
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: true,
        message: "Verification successful. You can now log in.",
      }),
    };
  } catch (err) {
    console.error("[verify-email-mfa-code-unauthenticated] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to verify code.",
      }),
    };
  }
};












