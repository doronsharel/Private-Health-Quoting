const plans = require("./plans-data.js");
const {
  authenticateRequest,
  userHasPaidAccess,
} = require("./lib/users.js");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

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
    const userRecord = await authenticateRequest(event);
    const hasAccess = userHasPaidAccess(userRecord);

    if (!hasAccess) {
      return {
        statusCode: 402,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
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
      }),
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Unauthorized" }),
    };
  }
};
