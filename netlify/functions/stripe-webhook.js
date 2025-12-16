const stripeLib = require("stripe");
const {
  updateSubscription,
  timestampFromSeconds,
} = require("./lib/users.js");
const sgMail = require("@sendgrid/mail");
const { getFirestore } = require("./lib/firebase");

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
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
        await syncSubscription(stripeEvent.data.object);
        // Send confirmation email for new subscriptions
        if (stripeEvent.data.object.status === "active" || stripeEvent.data.object.status === "trialing") {
          await sendSubscriptionConfirmationEmail(metadata?.firebaseUid || stripeEvent.data.object.metadata?.firebaseUid, stripeEvent.data.object);
        }
        break;
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
  console.log("[stripe-webhook] Checkout session completed:", session.id);
  
  // If subscription is a string ID, retrieve it
  const subscriptionId = typeof session.subscription === "string" 
    ? session.subscription 
    : session.subscription?.id;
  
  if (!subscriptionId) {
    console.warn("[stripe-webhook] No subscription in checkout session");
    return;
  }
  
  await syncSubscription(subscriptionId, session.metadata);
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

  // Send confirmation email when subscription is created (only once)
  // Check if this is a new subscription by looking at the event type
  // We'll send email on customer.subscription.created event, not here
}

async function sendSubscriptionConfirmationEmail(uid, subscription) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
    console.log("[stripe-webhook] SendGrid not configured, skipping confirmation email");
    return;
  }

  if (!uid) {
    console.warn("[stripe-webhook] No UID provided, skipping confirmation email");
    return;
  }

  try {
    // Get user data from Firestore
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      console.warn(`[stripe-webhook] User ${uid} not found in Firestore, skipping email`);
      return;
    }

    const userData = userDoc.data();
    const email = userData.email;
    const firstName = userData.firstName || "";

    // Get customer data from Stripe
    const customerId = typeof subscription.customer === "string" 
      ? subscription.customer 
      : subscription.customer?.id || subscription.customer;
    const customer = await stripe.customers.retrieve(customerId);
    const customerEmail = customer.email || email;

    sgMail.setApiKey(SENDGRID_API_KEY);

    const isTrial = subscription.status === "trialing";
    const trialEndDate = subscription.trial_end 
      ? new Date(subscription.trial_end * 1000).toLocaleDateString()
      : null;

    const msg = {
      to: customerEmail,
      from: SENDGRID_FROM_EMAIL,
      subject: "Private Health Quoting · Subscription Confirmed",
      text: `Welcome to Private Health Quoting!${firstName ? ` ${firstName},` : ""}\n\nYour subscription is now ${isTrial ? "in trial" : "active"}.\n${isTrial && trialEndDate ? `Your trial period ends on ${trialEndDate}.\n` : ""}\nYou can now access the agent portal and start quoting health plans for your clients.\n\nLog in at: https://aisquoting.netlify.app/login.html\n\nIf you have any questions, please contact us at shareldoron@gmail.com.\n\nThank you for subscribing!`,
      html: `<p>Welcome to <strong>Private Health Quoting</strong>!${firstName ? ` ${firstName},` : ""}</p>
<p>Your subscription is now <strong>${isTrial ? "in trial" : "active"}</strong>.</p>
${isTrial && trialEndDate ? `<p>Your trial period ends on <strong>${trialEndDate}</strong>.</p>` : ""}
<p>You can now access the agent portal and start quoting health plans for your clients.</p>
<p><a href="https://aisquoting.netlify.app/login.html" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">Log in to your account</a></p>
<p>If you have any questions, please contact us at <a href="mailto:shareldoron@gmail.com">shareldoron@gmail.com</a>.</p>
<p>Thank you for subscribing!</p>`,
    };

    await sgMail.send(msg);
    console.log(`[stripe-webhook] Subscription confirmation email sent to ${customerEmail}`);
  } catch (emailErr) {
    console.error("[stripe-webhook] Failed to send confirmation email:", emailErr);
    // Don't fail the webhook if email fails
  }
}
