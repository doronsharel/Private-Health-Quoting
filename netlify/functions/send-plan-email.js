const { authenticateRequest, userHasPaidAccess } = require("./lib/users");
const plans = require("./plans-data.js");
const sgMail = require("@sendgrid/mail");

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatMoney(amount) {
  if (!amount || amount === "N/A") return "N/A";
  return `$${parseFloat(amount).toFixed(2)}`;
}

function formatPlanEmail(plans, agentFirstName, agentLastName, agentPhone) {
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
  
  // Format each plan
  const planSections = plans.map((plan, index) => {
    const b = plan.benefits;
    const premiums = plan.premiums || {};
    const pdfUrl = plan.pdf ? (plan.pdf.startsWith("http") ? plan.pdf : `${baseUrl}/${plan.pdf}`) : null;
    
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

        ${plan.enrollUrl ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${plan.enrollUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; font-weight: bold;">Enroll Now</a>
        </div>
        ` : ''}

        ${pdfUrl ? `
        <p style="margin-top: 20px;">
          <a href="${pdfUrl}" style="color: #2563eb; text-decoration: underline;">View Full Summary of Benefits (PDF)</a>
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
      <p>This plan information was sent to you by your agent.</p>
    </div>
  </div>
</body>
</html>
  `;

  // Format text version
  const textSections = plans.map((plan) => {
    const b = plan.benefits;
    const premiums = plan.premiums || {};
    const baseUrl = process.env.SITE_URL || "https://aisquoting.netlify.app";
    const pdfUrl = plan.pdf ? (plan.pdf.startsWith("http") ? plan.pdf : `${baseUrl}/${plan.pdf}`) : null;
    
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

${plan.enrollUrl ? `\nEnroll: ${plan.enrollUrl}` : ''}
${pdfUrl ? `\nSummary of Benefits: ${pdfUrl}` : ''}
`;
  }).join('\n\n---\n\n');

  const text = `Please look over the plans. These are best options available in your area through private health insurance this year. If you have any questions reach out.

${textSections}

---
${agentName}${agentNumberText}

---
This plan information was sent to you by your agent.
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
    const { planIds, planId, recipientEmail } = body;

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

    // Get agent information from user record
    const agentFirstName = userRecord.docData?.firstName || "";
    const agentLastName = userRecord.docData?.lastName || "";
    const agentPhone = userRecord.docData?.phone || userRecord.docData?.phoneNumber || "";
    
    // Format agent name for subject line
    const agentName = agentFirstName && agentLastName 
      ? `${agentFirstName} ${agentLastName}` 
      : agentFirstName || agentLastName || "Agent";
    
    // Format and send email
    sgMail.setApiKey(SENDGRID_API_KEY);
    const { html, text } = formatPlanEmail(selectedPlans, agentFirstName, agentLastName, agentPhone);
    
    const subject = `${agentName} - Recommended Private Health Options for 2026`;

    const msg = {
      to: recipientEmail,
      from: SENDGRID_FROM_EMAIL,
      replyTo: userRecord.email,
      subject: subject,
      text,
      html,
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

