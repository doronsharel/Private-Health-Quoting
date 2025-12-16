const stripeLib = require("stripe");
const {
  authenticateRequest,
} = require("./lib/users.js");

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? stripeLib(stripeSecret) : null;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getOrigin(event) {
  if (event.headers.origin) return event.headers.origin;
  const host =
    event.headers["x-forwarded-host"] ||
    event.headers.host ||
    "localhost:8888";
  const protocol =
    event.headers["x-forwarded-proto"] ||
    (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...CORS_HEADERS } };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Stripe environment variables are missing.",
      }),
    };
  }

  try {
    const userRecord = await authenticateRequest(event);
    
    const customerId =
      userRecord.docData?.stripeCustomerId ||
      userRecord.docData?.customerId ||
      null;

    if (!customerId) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "No subscription found. Please start a subscription first.",
        }),
      };
    }

    const origin = getOrigin(event);
    const returnUrl = `${origin}/`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Unable to create portal session." }),
    };
  }
};

