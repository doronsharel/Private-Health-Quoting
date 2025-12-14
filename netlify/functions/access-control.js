// access-control.js
// Central place to define privileged accounts. Update OWNER_EMAILS with the
// email(s) that should always bypass future subscription/license checks.

const DEFAULT_OWNER_EMAILS = ["shareldoron@gmail.com"];

const userProvidedOwners =
  (typeof window !== "undefined" && window.__PHQ_OWNER_EMAILS) || [];

const OWNER_EMAILS = [...DEFAULT_OWNER_EMAILS, ...userProvidedOwners]
  .filter(Boolean)
  .map((email) => email.toLowerCase());

const isOwnerEmail = (email) => {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.toLowerCase());
};

const getOwnerEmails = () => OWNER_EMAILS.slice();

// CommonJS export for Netlify Functions (Node.js environment)
module.exports = { isOwnerEmail, getOwnerEmails };
