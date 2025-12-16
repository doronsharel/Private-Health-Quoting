const { getAuth } = require("./lib/firebase");

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

    const auth = getAuth();
    
    // Update user to mark email as verified
    await auth.updateUser(uid, {
      emailVerified: true,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, message: "Email verified successfully." }),
    };
  } catch (err) {
    console.error("[verify-user-email] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to verify email.",
      }),
    };
  }
};

