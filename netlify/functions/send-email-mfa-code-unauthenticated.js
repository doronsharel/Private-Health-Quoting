const { getFirestore, getAuth } = require("./lib/firebase");
const sgMail = require("@sendgrid/mail");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
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
    const body = JSON.parse(event.body || "{}");
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Email is required." }),
      };
    }

    // Use Firebase Admin to get user by email (this works even if user has MFA)
    const auth = getAuth();
    let uid;
    try {
      const userRecord = await auth.getUserByEmail(email);
      uid = userRecord.uid;
    } catch (authErr) {
      // If user not found in Auth, try Firestore as fallback
      const db = getFirestore();
      const usersRef = db.collection("users");
      const snapshot = await usersRef.where("email", "==", email).limit(1).get();
      
      if (snapshot.empty) {
        return {
          statusCode: 404,
          headers: { ...CORS_HEADERS },
          body: JSON.stringify({ error: "No account found for this email." }),
        };
      }
      
      uid = snapshot.docs[0].id;
    }

    // Generate verification code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Store code in Firestore
    const codeRef = db.collection("mfaCodes").doc(uid);
    await codeRef.set({
      code: code,
      expiresAt: expiresAt,
      createdAt: new Date(),
    });

    // Send email via SendGrid
    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      console.error("[send-email-mfa-code-unauthenticated] SendGrid not configured");
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
      console.log(`[send-email-mfa-code-unauthenticated] Verification code sent to ${email}`);
    } catch (emailErr) {
      console.error("[send-email-mfa-code-unauthenticated] Failed to send email", emailErr);
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
    console.error("[send-email-mfa-code-unauthenticated] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to send verification code.",
      }),
    };
  }
};

