const stripeLib = require("stripe");
const {
  updateSubscription,
  timestampFromSeconds,
} = require("./lib/users.js");

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = stripeSecret ? stripeLib(stripeSecret) : null;

const okResponse = {
  statusCode: 200,
  body: JSON.stringify({ received: true }),
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204 };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!stripe || !webhookSecret) {
    console.error("Stripe webhook env vars missing");
    return { statusCode: 500, body: "Stripe not configured" };
  }

  const signature = event.headers["stripe-signature"];
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripeEvent.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(stripeEvent.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handling error:", err);
    return { statusCode: 500, body: "Webhook handler error" };
  }

  return okResponse;
};

async function handleCheckoutCompleted(session) {
  if (!session.subscription) return;
  await syncSubscription(session.subscription, session.metadata);
}

async function syncSubscription(subscriptionInput, fallbackMetadata = {}) {
  const subscription =
    typeof subscriptionInput === "string"
      ? await stripe.subscriptions.retrieve(subscriptionInput)
      : subscriptionInput;

  const metadata = subscription.metadata || fallbackMetadata || {};
  const uid = metadata.firebaseUid;

  if (!uid) {
    console.warn("Subscription missing firebaseUid metadata. Skipping.");
    return;
  }

  const currentPeriodEnd = timestampFromSeconds(subscription.current_period_end);

  await updateSubscription(uid, {
    stripeCustomerId: subscription.customer,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    priceId:
      subscription.items?.data?.[0]?.price?.id ||
      subscription.plan?.id ||
      null,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    subscriptionUpdatedAt: new Date().toISOString(),
  });
}
