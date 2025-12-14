// Wrap requires in try-catch to handle initialization errors
let plans, authenticateRequest, userHasPaidAccess;

try {
  plans = require("./plans-data.js");
  const usersModule = require("./lib/users.js");
  authenticateRequest = usersModule.authenticateRequest;
  userHasPaidAccess = usersModule.userHasPaidAccess;
} catch (requireErr) {
  console.error("[get-plans] Failed to load dependencies:", requireErr);
  // Export a handler that shows the error
  exports.handler = async () => ({
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      error: `Function initialization failed: ${requireErr.message}` 
    }),
  });
  throw requireErr;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function handler(event) {
  // Ensure all responses are JSON
  const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...CORS_HEADERS },
    };
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const userRecord = await authenticateRequest(event);
    const hasAccess = userHasPaidAccess(userRecord);

    if (!hasAccess) {
      return jsonResponse(402, {
          error:
            "An active subscription is required to load plans. Start your subscription to continue.",
          needsSubscription: true,
          user: {
            uid: userRecord.uid,
            email: userRecord.email,
            isOwner: userRecord.isOwner,
          },
          subscriptionStatus:
            userRecord.docData?.subscriptionStatus || "none",
      });
    }

    return jsonResponse(
      200,
      {
        plans,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          isOwner: userRecord.isOwner,
        },
        subscriptionStatus:
          userRecord.docData?.subscriptionStatus || (userRecord.isOwner
            ? "owner"
            : "active"),
      },
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    console.error("[get-plans] error", err);
    const errorMessage = err.message || err.toString() || "Internal server error";
    return jsonResponse(err.statusCode || 500, {
      error: errorMessage,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
}

exports.handler = handler;
