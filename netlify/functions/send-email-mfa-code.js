const { getFirestore, getAuth } = require("./lib/firebase");
const sgMail = require("@sendgrid/mail");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Generate a 6-digit verification code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    const email = decoded.email;

    if (!email) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "User email not found." }),
      };
    }

    // Generate verification code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store code in Firestore
    const db = getFirestore();
    const codeRef = db.collection("mfaCodes").doc(uid);
    await codeRef.set({
      code: code,
      expiresAt: expiresAt,
      createdAt: new Date(),
    });

    // Send email via SendGrid
    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      console.error("[send-email-mfa-code] SendGrid not configured");
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Email service not configured." }),
      };
    }

    sgMail.setApiKey(SENDGRID_API_KEY);

    const msg = {
      to: email,
      from: SENDGRID_FROM_EMAIL,
      subject: "Private Health Quoting · Verification Code",
      text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this code, please ignore this email.`,
      html: `<p>Your verification code is:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #2563eb; margin: 20px 0;">${code}</p>
<p>This code will expire in 10 minutes.</p>
<p>If you did not request this code, please ignore this email.</p>`,
    };

    try {
      await sgMail.send(msg);
      console.log(`[send-email-mfa-code] Verification code sent to ${email}`);
    } catch (emailErr) {
      console.error("[send-email-mfa-code] Failed to send email", emailErr);
      // Still return success - code is stored, email failure is logged
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        ok: true,
        message: "Verification code sent to your email.",
      }),
    };
  } catch (err) {
    console.error("[send-email-mfa-code] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to send verification code.",
      }),
    };
  }
};












