const { getFirestore, FieldValue } = require("./lib/firebase");
const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function serverTimestamp() {
  return FieldValue.serverTimestamp();
}

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

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
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

    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      console.warn(
        "[request-access] SendGrid env vars missing. Will record request without email."
      );
    } else {
      sgMail.setApiKey(SENDGRID_API_KEY);
    }

    const db = getFirestore();
    const ref = db.collection("access_requests").doc();

    const token = generateToken();
    const origin = getOrigin(event);
    const signupUrl = `${origin}/signup.html?token=${encodeURIComponent(
      token
    )}`;

    await ref.set({
      email,
      status: "pending",
      token,
      signupUrl,
      createdAt: serverTimestamp(),
      userAgent: event.headers["user-agent"] || null,
      ip:
        event.headers["x-forwarded-for"] ||
        event.headers["client-ip"] ||
        event.ip ||
        null,
    });

    if (SENDGRID_API_KEY && SENDGRID_FROM_EMAIL) {
      const msg = {
        to: email,
        from: SENDGRID_FROM_EMAIL,
        subject: "Private Health Quoting · Complete your signup",
        text: `You've requested access to the Private Health Quoting portal.\n\nClick the link below to create your account and set your password:\n\n${signupUrl}\n\nIf you did not request this, you can safely ignore this email.`,
        html: `<p>You've requested access to the <strong>Private Health Quoting</strong> agent portal.</p>
<p>Click the button below to create your account and set your password:</p>
<p><a href="${signupUrl}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">Complete signup</a></p>
<p>If the button doesn't work, copy and paste this URL into your browser:</p>
<p><code>${signupUrl}</code></p>
<p>If you did not request this, you can safely ignore this email.</p>`,
      };

      try {
        await sgMail.send(msg);
        console.log(`[request-access] Signup email sent successfully to ${email}`);
      } catch (emailErr) {
        console.error("[request-access] Failed to send signup email", emailErr);
        
        // Provide more detailed error information
        let errorMessage = "Failed to send signup email.";
        if (emailErr.response) {
          const errors = emailErr.response.body?.errors || [];
          if (errors.length > 0) {
            errorMessage = errors.map(e => e.message).join("; ");
          }
          console.error("[request-access] SendGrid error details:", JSON.stringify(emailErr.response.body, null, 2));
        } else {
          errorMessage = emailErr.message || errorMessage;
        }
        
        // Still return success since the request was recorded in DB
        // but log the email error for debugging
        console.error(`[request-access] Email error for ${email}: ${errorMessage}`);
      }
    }

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


