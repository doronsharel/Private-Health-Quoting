const { authenticateRequest, userHasPaidAccess } = require("./lib/users");
const plans = require("./plans-data.js");
const sgMail = require("@sendgrid/mail");
const stripeLib = require("stripe");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? stripeLib(stripeSecret) : null;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatMoney(amount) {
  if (!amount || amount === "N/A") return "N/A";
  return `$${parseFloat(amount).toFixed(2)}`;
}

function getPremiumsForPlan(plan, ageBand) {
  // If no age band specified or plan has no age bands, use base premiums
  if (!ageBand || ageBand === "all" || !plan.ageBands || !plan.ageBands.length) {
    return plan.premiums || {};
  }
  
  // Find the matching age band
  const match = plan.ageBands.find((band) => band.age === ageBand);
  if (match && match.premiums) {
    return match.premiums;
  }
  
  // Fallback to base premiums
  return plan.premiums || {};
}

function formatPlanEmail(plans, ageBandMap, agentFirstName, agentLastName, agentPhone, recipientEmail, agentEmail) {
  // Get base URL for PDF links (use environment variable or default)
  const baseUrl = process.env.SITE_URL || "https://aisquoting.netlify.app";
  
  // Format agent name
  const agentName = agentFirstName && agentLastName 
    ? `${agentFirstName} ${agentLastName}` 
    : agentFirstName || agentLastName || "Your Agent";
  
  // Format agent number (phone) if available - HTML version
  const agentNumberHtml = agentPhone ? `<br>${agentPhone}` : "";
  // Format agent number (phone) if available - Text version
  const agentNumberText = agentPhone ? `\n${agentPhone}` : "";
  
  // Build unsubscribe URL
  const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipientEmail || '')}&agent=${encodeURIComponent(agentEmail || '')}`;
  
  // Format each plan
  const planSections = plans.map((plan, index) => {
    const b = plan.benefits;
    // Use the selected age band's premiums if available
    const selectedAgeBand = ageBandMap && ageBandMap[plan.id];
    const premiums = getPremiumsForPlan(plan, selectedAgeBand);
    // Build PDF URL - encode spaces and special characters properly
    let pdfUrl = null;
    if (plan.pdf) {
      if (plan.pdf.startsWith("http")) {
        pdfUrl = plan.pdf;
      } else {
        // Encode the path segments properly (spaces become %20, etc.)
        const encodedPath = plan.pdf.split('/').map(segment => encodeURIComponent(segment)).join('/');
        pdfUrl = `${baseUrl}/${encodedPath}`;
      }
    }
    
    // Build EOC PDF URL (Evidence of Coverage)
    let eocPdfUrl = null;
    if (plan.eocPdf) {
      if (plan.eocPdf.startsWith("http")) {
        eocPdfUrl = plan.eocPdf;
      } else {
        const encodedPath = plan.eocPdf.split('/').map(segment => encodeURIComponent(segment)).join('/');
        eocPdfUrl = `${baseUrl}/${encodedPath}`;
      }
    }
    
    // Doctor search URL (can be full URL or relative)
    const doctorSearchUrl = plan.doctorSearchUrl || null;
    
    // Format premium rows
    const premiumRows = [];
    if (premiums.member) premiumRows.push(`<tr><td><strong>Member:</strong></td><td>${formatMoney(premiums.member)}</td></tr>`);
    if (premiums.memberSpouse) premiumRows.push(`<tr><td><strong>Member & Spouse:</strong></td><td>${formatMoney(premiums.memberSpouse)}</td></tr>`);
    if (premiums.memberChildren) premiumRows.push(`<tr><td><strong>Member & Children:</strong></td><td>${formatMoney(premiums.memberChildren)}</td></tr>`);
    if (premiums.family) premiumRows.push(`<tr><td><strong>Family:</strong></td><td>${formatMoney(premiums.family)}</td></tr>`);
    
    return `
      <div class="plan-section" style="margin-bottom: 40px; padding-bottom: 30px; border-bottom: ${index < plans.length - 1 ? '2px solid #e5e7eb' : 'none'};">
        <h2 class="plan-name" style="font-size: 24px; font-weight: bold; margin: 0 0 10px 0; color: #1f2937;">${plan.name}</h2>
        ${plan.badge ? `<p style="color: #6b7280; margin-top: 0;"><strong>${plan.badge}</strong></p>` : ''}
        
        <div class="section" style="margin: 20px 0;">
          <div class="section-title" style="font-size: 18px; font-weight: bold; color: #2563eb; margin-bottom: 10px;">Monthly Premiums</div>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
            ${premiumRows.join('')}
          </table>
        </div>

        <div class="section" style="margin: 20px 0;">
          <div class="section-title" style="font-size: 18px; font-weight: bold; color: #2563eb; margin-bottom: 10px;">Plan Benefits</div>
          <ul class="benefits-list" style="list-style: none; padding: 0;">
            <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Deductible:</strong> ${b.deductible || 'N/A'}</li>
            <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Max Out-of-Pocket:</strong> ${b.oopMax || 'N/A'}</li>
            <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Primary Care Visit:</strong> ${b.primaryCare || 'N/A'}</li>
            <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Specialist Visit:</strong> ${b.specialist || 'N/A'}</li>
            <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Emergency Room:</strong> ${b.emergencyRoom || 'N/A'}</li>
            <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Hospital Inpatient:</strong> ${b.inpatient || 'N/A'}</li>
          </ul>
        </div>


        ${pdfUrl ? `
        <p style="margin-top: 20px;">
          <a href="${pdfUrl}" style="color: #2563eb; text-decoration: underline;">View Full Summary of Benefits (PDF)</a>
        </p>
        ` : ''}
        ${eocPdfUrl ? `
        <p style="margin-top: 10px;">
          <a href="${eocPdfUrl}" style="color: #2563eb; text-decoration: underline;">List of Covered Services</a>
        </p>
        ` : ''}
        ${doctorSearchUrl ? `
        <p style="margin-top: 10px;">
          <a href="${doctorSearchUrl}" style="color: #2563eb; text-decoration: underline;">Look Up Doctors Network</a>
        </p>
        ` : ''}
      </div>
    `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(90deg, #2563eb, #4f46e5); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .intro-message { margin-bottom: 30px; padding: 15px; background: #ffffff; border-left: 4px solid #2563eb; }
    .plan-name { font-size: 24px; font-weight: bold; margin: 0 0 10px 0; color: #1f2937; }
    .section { margin: 20px 0; }
    .section-title { font-size: 18px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    table td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
    table td:first-child { width: 50%; }
    .benefits-list { list-style: none; padding: 0; }
    .benefits-list li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
    .agent-signature { margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb; }
    .enroll-btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Recommended Private Health Options for 2026</h1>
    </div>
    <div class="content">
      <div class="intro-message">
        <p style="margin: 0 0 15px 0;">Please look over the plans. These are best options available in your area through private health insurance this year. If you have any questions reach out.</p>
      </div>
      ${planSections}
      <div class="agent-signature">
        <p style="margin: 0; font-weight: bold;">${agentName}${agentNumberHtml}</p>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0 0 10px 0;">This plan information was sent to you by your agent.</p>
      <p style="margin: 0; font-size: 11px;">
        <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe from these emails</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  // Format text version
  const textSections = plans.map((plan) => {
    const b = plan.benefits;
    // Use the selected age band's premiums if available
    const selectedAgeBand = ageBandMap && ageBandMap[plan.id];
    const premiums = getPremiumsForPlan(plan, selectedAgeBand);
    const baseUrl = process.env.SITE_URL || "https://aisquoting.netlify.app";
    // Build PDF URL - encode spaces and special characters properly
    let pdfUrl = null;
    if (plan.pdf) {
      if (plan.pdf.startsWith("http")) {
        pdfUrl = plan.pdf;
      } else {
        // Encode the path segments properly (spaces become %20, etc.)
        const encodedPath = plan.pdf.split('/').map(segment => encodeURIComponent(segment)).join('/');
        pdfUrl = `${baseUrl}/${encodedPath}`;
      }
    }
    
    // Build EOC PDF URL (Evidence of Coverage)
    let eocPdfUrl = null;
    if (plan.eocPdf) {
      if (plan.eocPdf.startsWith("http")) {
        eocPdfUrl = plan.eocPdf;
      } else {
        const encodedPath = plan.eocPdf.split('/').map(segment => encodeURIComponent(segment)).join('/');
        eocPdfUrl = `${baseUrl}/${encodedPath}`;
      }
    }
    
    // Doctor search URL (can be full URL or relative)
    const doctorSearchUrl = plan.doctorSearchUrl || null;
    
    return `
Health Plan Details: ${plan.name}
${plan.badge ? `\n${plan.badge}\n` : ''}

Monthly Premiums:
${premiums.member ? `Member: ${formatMoney(premiums.member)}` : ''}
${premiums.memberSpouse ? `Member & Spouse: ${formatMoney(premiums.memberSpouse)}` : ''}
${premiums.memberChildren ? `Member & Children: ${formatMoney(premiums.memberChildren)}` : ''}
${premiums.family ? `Family: ${formatMoney(premiums.family)}` : ''}

Plan Benefits:
- Deductible: ${b.deductible || 'N/A'}
- Max Out-of-Pocket: ${b.oopMax || 'N/A'}
- Primary Care Visit: ${b.primaryCare || 'N/A'}
- Specialist Visit: ${b.specialist || 'N/A'}
- Emergency Room: ${b.emergencyRoom || 'N/A'}
- Hospital Inpatient: ${b.inpatient || 'N/A'}

${pdfUrl ? `\nSummary of Benefits: ${pdfUrl}` : ''}
${eocPdfUrl ? `\nList of Covered Services: ${eocPdfUrl}` : ''}
${doctorSearchUrl ? `\nLook Up Doctors Network: ${doctorSearchUrl}` : ''}
`;
  }).join('\n\n---\n\n');

  const text = `Please look over the plans. These are best options available in your area through private health insurance this year. If you have any questions reach out.

${textSections}

---
${agentName}${agentNumberText}

---
This plan information was sent to you by your agent.

To unsubscribe from these emails, visit: ${unsubscribeUrl}
  `;

  return { html, text };
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
    // Authenticate user and fetch their Firestore data
    const userRecord = await authenticateRequest(event);
    
    // Check if user has paid access
    const hasAccess = userHasPaidAccess(userRecord);
    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Active subscription required to send plan emails." }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { planIds, planId, recipientEmail, ageBands } = body;

    // Support both single planId (backward compat) and multiple planIds
    const planIdArray = planIds || (planId ? [planId] : []);

    if (!planIdArray.length || !recipientEmail) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "planIds (or planId) and recipientEmail are required." }),
      };
    }

    // Limit to 5 plans per email
    if (planIdArray.length > 5) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Maximum 5 plans per email allowed." }),
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Invalid email address format." }),
      };
    }

    // Find all plans
    const selectedPlans = planIdArray.map(id => plans.find((p) => p.id === id)).filter(Boolean);
    
    if (selectedPlans.length !== planIdArray.length) {
      return {
        statusCode: 404,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "One or more plans not found." }),
      };
    }

    // Check SendGrid configuration
    if (!SENDGRID_API_KEY || !SENDGRID_FROM_EMAIL) {
      console.error("[send-plan-email] SendGrid not configured");
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({ error: "Email service not configured." }),
      };
    }

    // Get agent information - fetch directly from Firestore to ensure we have latest data
    const { getFirestore } = require("./lib/firebase");
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userRecord.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    let agentFirstName = userData.firstName || "";
    let agentLastName = userData.lastName || "";
    const agentPhone = userData.phone || userData.phoneNumber || "";
    
    // Fallback 1: If firstName/lastName are missing, try to get from Stripe customer
    if (!agentFirstName && !agentLastName && stripe) {
      try {
        const customerId = userData.stripeCustomerId || userData.customerId;
        if (customerId) {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer && customer.name) {
            // Parse Stripe customer name into first/last name
            const nameParts = customer.name.trim().split(/\s+/);
            if (nameParts.length >= 2) {
              agentFirstName = nameParts[0];
              agentLastName = nameParts.slice(1).join(" ");
              console.log("[send-plan-email] Retrieved name from Stripe:", { agentFirstName, agentLastName });
            } else if (nameParts.length === 1) {
              agentFirstName = nameParts[0];
              console.log("[send-plan-email] Retrieved first name from Stripe:", agentFirstName);
            }
          }
        }
      } catch (stripeErr) {
        console.error("[send-plan-email] Failed to get customer from Stripe:", stripeErr);
      }
    }
    
    // Fallback 2: If still missing, try to get from Firebase Auth displayName
    if (!agentFirstName && !agentLastName) {
      try {
        const { getAuth } = require("./lib/firebase");
        const auth = getAuth();
        const authUser = await auth.getUser(userRecord.uid);
        if (authUser.displayName) {
          // Try to parse displayName into first/last name
          const nameParts = authUser.displayName.trim().split(/\s+/);
          if (nameParts.length >= 2) {
            agentFirstName = nameParts[0];
            agentLastName = nameParts.slice(1).join(" ");
            console.log("[send-plan-email] Retrieved name from Auth displayName:", { agentFirstName, agentLastName });
          } else if (nameParts.length === 1) {
            agentFirstName = nameParts[0];
            console.log("[send-plan-email] Retrieved first name from Auth displayName:", agentFirstName);
          }
        }
      } catch (authErr) {
        console.error("[send-plan-email] Failed to get user from Auth:", authErr);
      }
    }
    
    // Debug logging
    console.log("[send-plan-email] Agent info:", {
      firstName: agentFirstName,
      lastName: agentLastName,
      phone: agentPhone,
      email: userRecord.email,
      uid: userRecord.uid,
      userDataKeys: Object.keys(userData),
      userData: userData
    });
    
    // Format agent name for subject line - ensure we have a name
    let agentName = "Agent";
    if (agentFirstName && agentLastName) {
      agentName = `${agentFirstName} ${agentLastName}`;
    } else if (agentFirstName) {
      agentName = agentFirstName;
    } else if (agentLastName) {
      agentName = agentLastName;
    } else {
      // Last resort: use email username part (capitalize first letter)
      const emailParts = userRecord.email.split("@");
      if (emailParts[0]) {
        const username = emailParts[0];
        // Try to extract name from email like "doronsharel" -> "Doron Sharel"
        // This is a fallback, so it's okay if it's not perfect
        agentName = username.charAt(0).toUpperCase() + username.slice(1);
      }
    }
    
    // Format and send email
    sgMail.setApiKey(SENDGRID_API_KEY);
    const { html, text } = formatPlanEmail(selectedPlans, ageBands || {}, agentFirstName, agentLastName, agentPhone, recipientEmail, userRecord.email);
    
    const subject = `${agentName} - Recommended Private Health Options for 2026`;

    // Build unsubscribe URL (using agent's email as identifier)
    const baseUrl = process.env.SITE_URL || "https://aisquoting.netlify.app";
    const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipientEmail)}&agent=${encodeURIComponent(userRecord.email)}`;

    const msg = {
      to: recipientEmail,
      from: {
        email: SENDGRID_FROM_EMAIL,
        name: agentName || "Private Health Quoting"
      },
      replyTo: userRecord.email,
      subject: subject,
      text,
      html,
      // Add headers to improve deliverability
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Mailer": "Private Health Quoting System",
      },
      // Add categories for better tracking
      categories: ["plan-details", "agent-communication"],
      // Custom args for tracking
      customArgs: {
        agentEmail: userRecord.email,
        planCount: selectedPlans.length.toString(),
      },
    };

    try {
      await sgMail.send(msg);
      console.log(`[send-plan-email] Plan email sent to ${recipientEmail} by ${userRecord.email}`);
      
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          message: "Plan details sent successfully.",
        }),
      };
    } catch (emailErr) {
      console.error("[send-plan-email] Failed to send email", emailErr);
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS },
        body: JSON.stringify({
          error: "Failed to send email. Please try again later.",
        }),
      };
    }
  } catch (err) {
    console.error("[send-plan-email] error", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify({
        error: err.message || "Unable to send plan email.",
      }),
    };
  }
};

