const { getFirestore, getAuth, FieldValue } = require("./lib/firebase");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

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
    const token = (body.token || "").trim();
    const password = body.password || "";
    const isPreview = body.action === "preview";

    if (!token) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Missing token." }),
      };
    }

    const db = getFirestore();
    const snapshot = await db
      .collection("access_requests")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Invalid or expired signup link." }),
      };
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    if (data.status !== "pending") {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "This signup link has already been used." }),
      };
    }

    if (isPreview) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ email: data.email }),
      };
    }

    if (!password || password.length < 8) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({
          error: "Password must be at least 8 characters.",
        }),
      };
    }

    const auth = getAuth();

    // Create the user in Firebase Auth.
    const userRecord = await auth.createUser({
      email: data.email,
      password,
      emailVerified: false,
    });

    // Mark the request as completed.
    await doc.ref.set(
      {
        status: "completed",
        completedAt: serverTimestamp(),
        uid: userRecord.uid,
      },
      { merge: true }
    );

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({ ok: true, email: data.email }),
    };
  } catch (err) {
    console.error("[complete-signup] error", err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to complete signup.",
      }),
    };
  }
};



