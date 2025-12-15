const { getFirestore, FieldValue } = require("./lib/firebase");

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
    const email = (body.email || "").trim().toLowerCase();

    if (!email) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Email is required." }),
      };
    }

    const db = getFirestore();
    const ref = db.collection("access_requests").doc();

    await ref.set({
      email,
      status: "pending",
      createdAt: serverTimestamp(),
      userAgent: event.headers["user-agent"] || null,
      ip:
        event.headers["x-forwarded-for"] ||
        event.headers["client-ip"] ||
        event.ip ||
        null,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("[request-access] error", err);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to record access request.",
      }),
    };
  }
};


