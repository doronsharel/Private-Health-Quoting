const stripeLib = require("stripe");
const {
  authenticateRequest,
  userHasPaidAccess,
  updateSubscription,
} = require("./lib/users.js");

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const promoEnd =
  process.env.PROMO_FREE_TRIAL_END || "2025-01-01T05:00:00.000Z";

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

function getTrialDays() {
  if (!promoEnd) return 0;
  const endDate = new Date(promoEnd);
  const now = new Date();
  if (Number.isNaN(endDate.getTime()) || now >= endDate) return 0;
  const diff = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
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

  if (!stripe || !priceId) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error:
          "Stripe environment variables are missing. Configure STRIPE_SECRET_KEY and STRIPE_PRICE_ID.",
      }),
    };
  }

  try {
    const userRecord = await authenticateRequest(event);
    if (userRecord.isOwner) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Owner accounts already have full access.",
        }),
      };
    }

    if (userHasPaidAccess(userRecord)) {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Subscription already active.",
          alreadySubscribed: true,
        }),
      };
    }

    const origin = getOrigin(event);
    const successUrl = `${origin}/?checkout=success`;
    const cancelUrl = `${origin}/?checkout=cancel`;

    const trialDays = getTrialDays();

    const customerId =
      userRecord.docData?.stripeCustomerId ||
      userRecord.docData?.customerId ||
      null;

    let ensuredCustomerId = customerId;
    if (!ensuredCustomerId) {
      // Get user name from Firestore
      const db = getFirestore();
      const userDoc = await db.collection("users").doc(userRecord.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const firstName = userData.firstName || "";
      const lastName = userData.lastName || "";
      const name = firstName && lastName ? `${firstName} ${lastName}`.trim() : undefined;

      const customer = await stripe.customers.create({
        email: userRecord.email,
        name: name,
        metadata: { firebaseUid: userRecord.uid },
      });
      ensuredCustomerId = customer.id;
    } else {
      // Update existing customer with name if available
      const db = getFirestore();
      const userDoc = await db.collection("users").doc(userRecord.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const firstName = userData.firstName || "";
      const lastName = userData.lastName || "";
      const name = firstName && lastName ? `${firstName} ${lastName}`.trim() : undefined;
      
      if (name) {
        try {
          await stripe.customers.update(ensuredCustomerId, { name });
        } catch (updateErr) {
          console.error("[create-checkout-session] Failed to update customer name:", updateErr);
        }
      }
    }

    if (ensuredCustomerId !== customerId) {
      await updateSubscription(userRecord.uid, {
        stripeCustomerId: ensuredCustomerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: ensuredCustomerId,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { firebaseUid: userRecord.uid },
        trial_period_days: trialDays > 0 ? trialDays : undefined,
      },
      metadata: { firebaseUid: userRecord.uid },
      success_url: successUrl,
      cancel_url: cancelUrl,
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
      body: JSON.stringify({ error: err.message || "Unable to checkout." }),
    };
  }
};
