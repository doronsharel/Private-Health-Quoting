// access-control.js
// Shared helper to determine which emails should always bypass subscription
// checks. Keep this file in the root so the frontend can import it, and copy
// updates into netlify/functions/access-control.js for the server bundle.

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

export { isOwnerEmail, getOwnerEmails };

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isOwnerEmail, getOwnerEmails };
}
