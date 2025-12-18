import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

/************************************************************
 *  FULL CLEAN SCRIPT.JS — RESTORED LAYOUT + ALL GROUPS
 ************************************************************/

const PLANS_ENDPOINT = "/.netlify/functions/get-plans";
const AUTH_TIMEOUT_MS = 15000;

// Premium display labels
const premiumLabels = {
  member: "Member",
  memberSpouse: "Member & Spouse",
  memberChildren: "Member & Children",
  family: "Family",
};

const PLAN_TAGS = {
  mm: { label: "MM", title: "Major Medical" },
  vl: { label: "VL", title: "Visit Limits" },
};

const AGE_BANDS = [
  "18-29",
  "30-39",
  "40-49",
  "50-59",
  "60-64",
  "18-45",
  "46-64",
  "30-44",
  "45-54",
  "55-64",
];
const ageSelections = {}; // keyed by subgroupFilter

let subscriptionAccess = {
  status: "unknown",
  needsSubscription: false,
  user: null,
  message: "",
};
let subscriptionBannerOverride = null;

function updateSubscriptionBanner() {
  const banner = document.getElementById("subscriptionBanner");
  if (!banner) return;
  const textEl = document.getElementById("subscriptionBannerText");
  const startBtn = document.getElementById("startSubscriptionBtn");
  const manageBtn = document.getElementById("manageSubscriptionBtn");

  if (subscriptionAccess.needsSubscription) {
    banner.hidden = false;
    banner.dataset.state =
      (subscriptionBannerOverride && subscriptionBannerOverride.type) ||
      "warning";
    textEl.textContent =
      (subscriptionBannerOverride && subscriptionBannerOverride.text) ||
      subscriptionAccess.message ||
      "An active subscription is required to view plan data.";
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.disabled = false;
      startBtn.textContent = "Start Subscription";
    }
    if (manageBtn) manageBtn.hidden = true;
    return;
  }

  // If user has active subscription, show manage button
  if (subscriptionAccess.status === "active" || subscriptionAccess.status === "trialing" || subscriptionAccess.status === "owner") {
    if (!subscriptionBannerOverride) {
      banner.hidden = false;
      banner.dataset.state = "success";
      textEl.textContent = "Your subscription is active.";
      if (startBtn) startBtn.hidden = true;
      if (manageBtn) {
        manageBtn.hidden = false;
        manageBtn.disabled = false;
        manageBtn.style.display = "block"; // Force show
      }
      return;
    }
  }

  if (subscriptionBannerOverride) {
    banner.hidden = false;
    banner.dataset.state = subscriptionBannerOverride.type || "info";
    textEl.textContent = subscriptionBannerOverride.text;
    if (startBtn) startBtn.hidden = true;
    if (manageBtn) manageBtn.hidden = true;
    return;
  }

  banner.hidden = true;
}

function showSubscriptionNotice(text, type = "info", timeoutMs = 6000) {
  subscriptionBannerOverride = text ? { text, type } : null;
  updateSubscriptionBanner();
  if (text && timeoutMs) {
    setTimeout(() => {
      subscriptionBannerOverride = null;
      updateSubscriptionBanner();
    }, timeoutMs);
  }
}

async function startSubscriptionCheckout() {
  const btn = document.getElementById("startSubscriptionBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Redirecting...";
  try {
    const user = auth.currentUser || (await waitForAuthUser());
    const token = await user.getIdToken(/* forceRefresh */ true);
    const response = await fetch(
      "/.netlify/functions/create-checkout-session",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to start checkout.");
    }
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    showSubscriptionNotice(
      payload.message || "Subscription already active.",
      "info"
    );
  } catch (err) {
    subscriptionAccess.message =
      err.message || "Unable to start subscription checkout.";
    updateSubscriptionBanner();
  } finally {
    if (subscriptionAccess.needsSubscription) {
      btn.disabled = false;
      btn.textContent = "Start Subscription";
    }
  }
}

async function openSubscriptionPortal() {
  const btn = document.getElementById("manageSubscriptionBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Loading...";
  try {
    const user = auth.currentUser || (await waitForAuthUser());
    const token = await user.getIdToken(/* forceRefresh */ true);
    const response = await fetch(
      "/.netlify/functions/create-portal-session",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to open subscription portal.");
    }
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    showSubscriptionNotice("Unable to open subscription portal.", "warning");
  } catch (err) {
    showSubscriptionNotice(
      err.message || "Unable to open subscription portal.",
      "warning"
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Manage Subscription";
  }
}

function handleCheckoutQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("checkout");
  if (!status) return;

  if (status === "success") {
    showSubscriptionNotice(
      "🎉 Payment successful! Your subscription is now active. You should receive a confirmation email shortly. If plans aren't visible yet, please refresh the page.",
      "success"
    );
    // Force refresh subscription status
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } else if (status === "cancel") {
    subscriptionAccess.message =
      "Checkout canceled. Your card has not been charged.";
    subscriptionAccess.needsSubscription = true;
    updateSubscriptionBanner();
  }

  params.delete("checkout");
  const query = params.toString();
  const newUrl = `${window.location.pathname}${
    query ? `?${query}` : ""
  }${window.location.hash}`;
  window.history.replaceState({}, "", newUrl);
}

function waitForAuthUser() {
  if (window.__PHQ_USER) return Promise.resolve(window.__PHQ_USER);
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      clearTimeout(timeout);
      resolve(event.detail || window.__PHQ_USER);
    };
    const timeout = setTimeout(() => {
      window.removeEventListener("phq:user-ready", handler);
      reject(new Error("Authentication timed out. Please sign in again."));
    }, AUTH_TIMEOUT_MS);
    window.addEventListener("phq:user-ready", handler, { once: true });
  });
}

async function waitForAuthCurrentUser() {
  // If already available, return immediately
  if (auth.currentUser) return auth.currentUser;
  
  // Wait for the user-ready event first (this ensures window.__PHQ_USER is set)
  await waitForAuthUser();
  
  // Now wait for auth.currentUser to be set (it should be set by onAuthStateChanged)
  if (auth.currentUser) return auth.currentUser;
  
  // If still not set, wait for onAuthStateChanged
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Authentication timed out. Please sign in again."));
    }, AUTH_TIMEOUT_MS);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(user);
      }
    });
  });
}

async function fetchPlansFromApi() {
  const user = await waitForAuthCurrentUser();
  if (!user) {
    throw new Error("Session invalid. Refresh the page and sign in again.");
  }
  const token = await user.getIdToken(/* forceRefresh */ true);
  
  let response;
  try {
    response = await fetch(PLANS_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (fetchErr) {
    console.error("[fetchPlansFromApi] Fetch error:", fetchErr);
    throw new Error(`Network error: ${fetchErr.message || "Failed to connect to server"}`);
  }

  let payload;
  const text = await response.text();
  try {
    payload = JSON.parse(text);
  } catch (parseErr) {
    console.error("[fetchPlansFromApi] Parse error:", parseErr);
    console.error("[fetchPlansFromApi] Response text:", text);
    throw new Error(`Server returned invalid JSON. Status: ${response.status}. Response: ${text.substring(0, 200)}`);
  }
  
  if (!response.ok) {
    const error = new Error(payload?.error || `Server error (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function setPlansContainerMessage(message, isError = false) {
  const container = document.getElementById("plansContainer");
  if (!container) return;
  const classes = ["state-empty"];
  if (isError) classes.push("state-empty-error");
  container.innerHTML = `<div class="${classes.join(
    " "
  )}">${message}</div>`;
}

function showPlansLoading(message = "Loading plans...") {
  setPlansContainerMessage(message);
}

function showPlansError(message) {
  setPlansContainerMessage(message, true);
}

async function initializePlans() {
  if (plansLoaded) return;
  
  // Check cache first to avoid unnecessary function calls
  const cached = getCachedPlans();
  if (cached) {
    plans = cached.plans || [];
    plansLoaded = true;
    plansLoadError = null;
    subscriptionAccess = {
      status: cached.subscriptionStatus || "active",
      needsSubscription: false,
      user: cached.user || null,
      message: "",
    };
    updateSubscriptionBanner();
    return;
  }
  
  showPlansLoading();
  try {
    const payload = await fetchPlansFromApi();
    plans = payload.plans || [];
    plansLoaded = true;
    plansLoadError = null;
    subscriptionAccess = {
      status: payload.subscriptionStatus || "active",
      needsSubscription: false,
      user: payload.user || null,
      message: "",
    };
    updateSubscriptionBanner();
    
    // Cache the response
    setCachedPlans(payload);
  } catch (err) {
    // Show more detailed error for debugging
    const errorMessage = err?.message || err?.toString() || "Unable to load plans.";
    plansLoadError = errorMessage;
    
    // Log the full error for debugging
    console.error("[initializePlans] Error loading plans:", err);
    
    if (err.payload?.needsSubscription) {
      subscriptionAccess = {
        status: err.payload.subscriptionStatus || "none",
        needsSubscription: true,
        user: err.payload.user || null,
        message:
          err.payload.error ||
          "An active subscription is required to view plans.",
      };
      updateSubscriptionBanner();
      plansLoadError = subscriptionAccess.message;
    }
    showPlansError(plansLoadError);
    throw err;
  }
}

// Display order for subgroup grouping
const subgroupOrder = [
  "acusa",
  "afi-phcs", // AFI – Cigna Network
  "afi-phcs-network", // AFI – PHCS Network
  "med-performance",
  "med-access",
  "med-max",
  "med-value",
  "ahw-first-health",
  "bmi-cigna",
  "bmi-mec-phcs",
  "bmi-phcs",
  "lifex-cigna",
  "pop-bcbs",
  "pop-maxguard",
];

// Optional per-subgroup plan order (fallback to name sort)
const subgroupPlanOrder = {
  acusa: [
    "acusa-elite-health",
    "acusa-elite-health-plus",
    "acusa-bronze-2",
    "acusa-silver-2",
  ],
  "med-max": [
    "med-max-dvp-250",
    "med-max-dvp-500",
    "med-max-dvp-750",
    "med-max-dvp-1000",
    "med-max-dvp-1500",
  ],
  "med-value": [
    "med-value-hdvp-2000",
    "med-value-hdvp-4000",
    "med-value-hdvp-6000",
  ],
  "ahw-first-health": [
    "ahw-first-health-1",
    "ahw-first-health-2",
    "ahw-first-health-3",
    "ahw-first-health-4",
    "ahw-first-health-5",
    "ahw-first-health-6",
  ],
  "lifex-cigna": [
    "lifex-cigna-epo-500",
    "lifex-cigna-epo-750",
    "lifex-cigna-epo-1000",
    "lifex-cigna-epo-1500",
  ],
  "pop-bcbs": [
    "pop-bcbs-gigcare-1500",
    "pop-bcbs-gigcare-2500",
    "pop-bcbs-gigcare-5000",
    "pop-bcbs-gigcare-7350",
    "pop-bcbs-gigcare-hsa-5000",
  ],
  "pop-maxguard": [
    "pop-maxguard-epo-300",
    "pop-maxguard-epo-600",
    "pop-maxguard-epo-900",
    "pop-maxguard-epo-1500",
    "pop-maxguard-epo-2000",
    "pop-maxguard-epo-2500",
  ],
  "bmi-phcs": [
    "bmi-dvp-ess-7500",
    "bmi-dvp-ess-5000",
    "bmi-dvs-ess-2500",
    "bmi-mvp-basic-phcs",
    "bmi-mvp-value-phcs",
    "bmi-mvp-adv-phcs",
  ],
  "bmi-cigna": [
    "bmi-ess-2500-cigna",
    "bmi-ess-5000-cigna",
    "bmi-ess-7500-cigna",
    "bmi-mvp-basic-cigna",
    "bmi-mvp-value-cigna",
    "bmi-mvp-adv-cigna",
  ],
};

const STATE_OPTIONS = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const ALL_STATE_CODES = STATE_OPTIONS.map((s) => s.code);

const ENROLL_PRIME_STATES = [
  "AK",
  "AL",
  "AR",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WI",
  "WV",
  "WY",
];

// Defaulting to all states until carrier-specific availability is provided.
// Replace entries with per-subgroup state lists as they are shared.
const subgroupStateAvailability = {
  acusa: ENROLL_PRIME_STATES,
  "afi-phcs": ENROLL_PRIME_STATES,
  "afi-phcs-network": ENROLL_PRIME_STATES,
  "med-performance": ENROLL_PRIME_STATES,
  "med-access": ENROLL_PRIME_STATES,
  "med-max": ENROLL_PRIME_STATES,
  "med-value": ENROLL_PRIME_STATES,
  "bmi-cigna": ENROLL_PRIME_STATES,
  "bmi-phcs": ENROLL_PRIME_STATES,
  "lifex-cigna": [
    "AL",
    "AR",
    "AZ",
    "CA",
    "CO",
    "CT",
    "DC",
    "DE",
    "FL",
    "GA",
    "IA",
    "ID",
    "IL",
    "IN",
    "KS",
    "KY",
    "LA",
    "MA",
    "ME",
    "MI",
    "MO",
    "MS",
    "MT",
    "NC",
    "ND",
    "NE",
    "NJ",
    "NM",
    "NV",
    "NY",
    "OH",
    "OK",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VA",
    "WI",
    "WV",
    "WY",
  ],
  "pop-bcbs": [
    "AK",
    "AL",
    "AR",
    "AZ",
    "CO",
    "DC",
    "DE",
    "FL",
    "GA",
    "IA",
    "ID",
    "IL",
    "IN",
    "KS",
    "KY",
    "LA",
    "MA",
    "ME",
    "MI",
    "MO",
    "MS",
    "MT",
    "NC",
    "ND",
    "NE",
    "NJ",
    "NM",
    "NV",
    "NY",
    "OH",
    "OK",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VA",
    "WV",
    "WY",
  ],
  "pop-maxguard": [
    "AK",
    "AL",
    "AR",
    "AZ",
    "CO",
    "DC",
    "DE",
    "FL",
    "GA",
    "IA",
    "ID",
    "IL",
    "IN",
    "KS",
    "KY",
    "LA",
    "MA",
    "ME",
    "MI",
    "MO",
    "MS",
    "MT",
    "NC",
    "ND",
    "NE",
    "NJ",
    "NM",
    "NV",
    "NY",
    "OH",
    "OK",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VA",
    "WV",
    "WY",
  ],
};


// ALL PLANS ARE LOADED DYNAMICALLY
let plans = [];
let plansLoaded = false;
let plansLoadError = null;

// Cache plans in localStorage to reduce function invocations
const PLANS_CACHE_KEY = "phq_plans_cache";
const PLANS_CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const PLANS_CACHE_VERSION = 2; // Increment this when plan structure changes

function getCachedPlans() {
  try {
    const cached = localStorage.getItem(PLANS_CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    // Check cache version - if it doesn't match, invalidate cache
    if (data.version !== PLANS_CACHE_VERSION) {
      localStorage.removeItem(PLANS_CACHE_KEY);
      return null;
    }
    const now = Date.now();
    if (now - data.timestamp > PLANS_CACHE_DURATION_MS) {
      localStorage.removeItem(PLANS_CACHE_KEY);
      return null;
    }
    return data.payload;
  } catch (e) {
    return null;
  }
}

function setCachedPlans(payload) {
  try {
    localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify({
      version: PLANS_CACHE_VERSION,
      timestamp: Date.now(),
      payload: payload
    }));
  } catch (e) {
    // Ignore localStorage errors (e.g., private browsing)
  }
}

/************************************************************
 *  HELPER FUNCTIONS
 ************************************************************/

function formatMoney(amount) {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATE_STORAGE_KEY = "phq-selected-state";

function getStateName(code) {
  const found = STATE_OPTIONS.find((s) => s.code === code);
  return found ? found.name : code;
}

function getSelectedState() {
  return sessionStorage.getItem(STATE_STORAGE_KEY);
}

function setSelectedState(stateCode) {
  if (!stateCode) {
    sessionStorage.removeItem(STATE_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STATE_STORAGE_KEY, stateCode);
}

function planIsAvailableInState(plan, stateCode) {
  if (!stateCode) return false;
  const allowedStates =
    subgroupStateAvailability[plan.subgroupFilter] || ALL_STATE_CODES;
  return allowedStates.includes(stateCode);
}

function getActiveSubgroups() {
  const boxes = document.querySelectorAll(".filter-subgroup");
  const active = [];
  boxes.forEach((b) => {
    if (b.checked) active.push(b.value);
  });
  return active;
}

function planIsVisible(plan) {
  const tagFilter = document.getElementById("planTagFilter")?.value || "all";
  if (tagFilter !== "all" && plan.planTag !== tagFilter) return false;

  const active = getActiveSubgroups();
  if (active.length === 0) return true;
  if (!active.includes(plan.subgroupFilter)) return false;

  return true;
}

function getAgeSelectionForPlan(plan) {
  const existing = ageSelections[plan.subgroupFilter];
  if (existing) return existing;
  if (plan.ageBands && plan.ageBands.length) {
    return sortedBands(plan.ageBands.map((b) => b.age))[0];
  }
  return "all";
}

function setAgeSelectionForGroup(group, value) {
  ageSelections[group] = value;
}

function sortedBands(bands) {
  const order = AGE_BANDS;
  const known = [];
  const remaining = [];
  bands.forEach((b) => {
    if (order.includes(b)) known.push(b);
    else remaining.push(b);
  });
  const uniq = (arr) => [...new Set(arr)];
  const ordered = uniq(
    [...order.filter((o) => known.includes(o)), ...remaining.sort()]
  );
  return ordered;
}

function getPremiumsForPlan(plan, ageBand) {
  if (ageBand === "all" || !plan.ageBands) {
    return { premiums: plan.premiums, usingBand: false };
  }
  const match = plan.ageBands.find((band) => band.age === ageBand);
  if (match) {
    return { premiums: match.premiums, usingBand: true };
  }
  return { premiums: plan.premiums, usingBand: false };
}

function getNetwork(plan) {
  const badge = plan.badge?.toLowerCase() || "";
  if (badge.includes("phcs")) return "phcs";
  if (badge.includes("cigna")) return "cigna";
  if (badge.includes("first health")) return "firsthealth";
  if (badge.includes("blue cross")) return "bcbs";
  return null;
}

function isGuaranteeIssue(plan) {
  return plan.badge?.toLowerCase().includes("guarantee issue");
}

function getDisplayTexts(plan) {
  const badge = plan.badge || "";
  // For AFI plans, put "AFI" next to the plan name and leave only the network in the badge
  if (badge.startsWith("AFI – ")) {
    const networkText = badge.replace(/^AFI –\s*/, "");
    return { displayName: `AFI ${plan.name}`, displayBadge: networkText };
  }
  // For Med Performance plans, move the label to the name and leave only network in the badge
  if (badge.startsWith("Med Performance – ")) {
    const networkText = badge.replace(/^Med Performance –\s*/, "");
    return {
      displayName: `Med Performance ${plan.name}`,
      displayBadge: networkText,
    };
  }
  // For BMI tiers, show tier in name and leave only network in badge
  if (badge.startsWith("BMI Essentials – ")) {
    const networkText = badge.replace(/^BMI Essentials –\s*/, "");
    const hasEssentialsInName = /essentials/i.test(plan.name);
    return {
      displayName: hasEssentialsInName
        ? `BMI ${plan.name}`
        : `BMI Essentials ${plan.name}`,
      displayBadge: networkText,
    };
  }
  if (badge.startsWith("BMI MVP – ")) {
    const networkText = badge.replace(/^BMI MVP –\s*/, "");
    return {
      displayName: /mvp/i.test(plan.name)
        ? `BMI ${plan.name}`
        : `BMI MVP ${plan.name}`,
      displayBadge: networkText,
    };
  }
  if (badge.startsWith("BMI MEC – ")) {
    const networkText = badge.replace(/^BMI MEC –\s*/, "");
    return {
      displayName: /mec/i.test(plan.name)
        ? `BMI ${plan.name}`
        : `BMI MEC ${plan.name}`,
      displayBadge: networkText,
    };
  }
  return { displayName: plan.name, displayBadge: badge };
}

/************************************************************
 *  STATE GATE / UI
 ************************************************************/

function populateStateSelect() {
  const sel = document.getElementById("stateSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a state</option>';
  STATE_OPTIONS.forEach(({ code, name }) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} — ${name}`;
    sel.appendChild(opt);
  });
}

function updateStateChip(stateCode) {
  const chip = document.getElementById("stateChip");
  if (!chip) return;
  if (!stateCode) {
    chip.textContent = "State required";
    chip.classList.add("state-chip-empty");
    return;
  }
  chip.textContent = `${stateCode} — ${getStateName(stateCode)}`;
  chip.classList.remove("state-chip-empty");
}

function showStateError(message) {
  const err = document.getElementById("stateError");
  if (!err) return;
  err.textContent = message;
  err.style.display = "block";
}

function clearStateError() {
  const err = document.getElementById("stateError");
  if (!err) return;
  err.textContent = "";
  err.style.display = "none";
}

function toggleStateGate(open) {
  const gate = document.getElementById("stateGate");
  if (!gate) return;
  if (open) gate.classList.add("open");
  else gate.classList.remove("open");
}

function handleStateConfirm() {
  clearStateError();
  const sel = document.getElementById("stateSelect");
  if (!sel) return;
  const value = sel.value;
  if (!value) {
    showStateError("Choose a state to load available plans.");
    return;
  }
  setSelectedState(value);
  updateStateChip(value);
  toggleStateGate(false);
  renderPlans();
}

function initStateGate() {
  populateStateSelect();
  const currentState = getSelectedState();
  const sel = document.getElementById("stateSelect");
  if (sel && currentState) {
    sel.value = currentState;
  }

  if (currentState) {
    updateStateChip(currentState);
    toggleStateGate(false);
  } else {
    updateStateChip(null);
    toggleStateGate(true);
  }

  const confirmBtn = document.getElementById("stateConfirm");
  if (confirmBtn) confirmBtn.addEventListener("click", handleStateConfirm);

  const changeBtn = document.getElementById("changeStateBtn");
  if (changeBtn)
    changeBtn.addEventListener("click", () => {
      clearStateError();
      const saved = getSelectedState();
      if (sel) sel.value = saved || "";
      toggleStateGate(true);
    });
}

/************************************************************
 *  RENDER PLANS
 ************************************************************/

function renderPlans() {
  const container = document.getElementById("plansContainer");
  container.innerHTML = "";

  if (!plansLoaded) {
    if (plansLoadError) {
      showPlansError(plansLoadError);
    } else {
      showPlansLoading();
    }
    return;
  }

  const selectedState = getSelectedState();
  if (!selectedState) {
    container.innerHTML =
      '<div class="state-empty">Select a state to view plans.</div>';
    return;
  }

  const plansInState = plans.filter((plan) =>
    planIsAvailableInState(plan, selectedState)
  );
  const visiblePlans = plansInState.filter(planIsVisible);

  if (plansInState.length === 0) {
    container.innerHTML = `<div class="state-empty">No plans available in ${getStateName(
      selectedState
    )}.</div>`;
    return;
  }

  if (visiblePlans.length === 0) {
    container.innerHTML =
      '<div class="state-empty">Please Select a Plan to View Benefits</div>';
    return;
  }

  visiblePlans.sort((a, b) => {
    const aIdx = subgroupOrder.indexOf(a.subgroupFilter);
    const bIdx = subgroupOrder.indexOf(b.subgroupFilter);
    const safeA = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const safeB = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
    if (safeA !== safeB) return safeA - safeB;
    const subgroupOrderList = subgroupPlanOrder[a.subgroupFilter];
    if (subgroupOrderList) {
      const aPos = subgroupOrderList.indexOf(a.id);
      const bPos = subgroupOrderList.indexOf(b.id);
      const safeAPos = aPos === -1 ? Number.MAX_SAFE_INTEGER : aPos;
      const safeBPos = bPos === -1 ? Number.MAX_SAFE_INTEGER : bPos;
      if (safeAPos !== safeBPos) return safeAPos - safeBPos;
    }
    return a.name.localeCompare(b.name);
  });

  visiblePlans.forEach((plan) => {

    const ageBand = getAgeSelectionForPlan(plan);
    const { premiums, usingBand } = getPremiumsForPlan(plan, ageBand);
    const network = getNetwork(plan);
    const guarantee = isGuaranteeIssue(plan);
    const { displayName, displayBadge } = getDisplayTexts(plan);
    const carrier = plan.carrier || "enroll-prime";

    const card = document.createElement("div");
    card.className = "plan-card";
    card.dataset.benefitGroup = plan.benefitGroup;
    card.dataset.carrier = carrier;
    if (network) card.classList.add(`network-${network}`);
    if (guarantee) card.classList.add("guarantee-issue");

    // NAME
    const name = document.createElement("h3");
    name.className = "plan-name";
    name.textContent = displayName;
    card.appendChild(name);

    // BADGE
    const badge = document.createElement("div");
    badge.className = "plan-badge";
    if (network) badge.classList.add(`network-${network}`);
    if (guarantee) badge.classList.add("guarantee-issue");
    badge.textContent = displayBadge;
    card.appendChild(badge);

    if (plan.ageBands && plan.ageBands.length) {
      const ageWrap = document.createElement("div");
      ageWrap.className = "age-group-select";
      const label = document.createElement("label");
      label.textContent = "Age band";
      const sel = document.createElement("select");
      sel.className = "age-select";
      sel.dataset.group = plan.subgroupFilter;

      const addOpt = (value, text) => {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = text;
        sel.appendChild(o);
      };

      sortedBands(plan.ageBands.map((b) => b.age)).forEach((band) =>
        addOpt(band, band)
      );

      sel.value = ageBand;
      ageWrap.appendChild(label);
      ageWrap.appendChild(sel);

      const planTag = PLAN_TAGS[plan.planTag];
      if (planTag) {
        const tagEl = document.createElement("span");
        tagEl.className = `plan-tag plan-tag-inline plan-tag-${plan.planTag}`;
        tagEl.textContent = planTag.label;
        tagEl.title = planTag.title;
        ageWrap.appendChild(tagEl);
      }

      card.appendChild(ageWrap);
    } else {
      // Keep card heights consistent when a plan has no age bands
      const flatWrap = document.createElement("div");
      flatWrap.className = "age-group-select age-group-flat";

      const flatLabel = document.createElement("span");
      flatLabel.className = "flat-label";
      flatLabel.textContent = "Flat Price For All Ages";

      flatWrap.appendChild(flatLabel);

      const planTag = PLAN_TAGS[plan.planTag];
      if (planTag) {
        const tagEl = document.createElement("span");
        tagEl.className = `plan-tag plan-tag-inline plan-tag-${plan.planTag}`;
        tagEl.textContent = planTag.label;
        tagEl.title = planTag.title;
        flatWrap.appendChild(tagEl);
      }

      card.appendChild(flatWrap);
    }

    // PREMIUMS
    const premBox = document.createElement("div");
    premBox.className = "premiums";

    Object.keys(premiumLabels).forEach((key) => {
      const row = document.createElement("div");
      row.className = "premium-row";

      const label = document.createElement("span");
      label.className = "premium-label";
      label.textContent = premiumLabels[key] + ":";

      const value = document.createElement("span");
      value.className = "premium-value";
      value.textContent = formatMoney(premiums[key]);

      row.appendChild(label);
      row.appendChild(value);
      premBox.appendChild(row);
    });

    card.appendChild(premBox);

    // FOOTER
    const footer = document.createElement("div");
    footer.className = "card-footer";

    const link = document.createElement("a");
    link.className = "summary-link";
    link.href = plan.pdf;
    link.target = "_blank";
    link.textContent = "Summary of Benefits (PDF)";
    footer.appendChild(link);

    // Add "List of Covered Services" link if EOC PDF exists
    if (plan.eocPdf) {
      const eocLink = document.createElement("a");
      eocLink.className = "summary-link";
      eocLink.href = plan.eocPdf;
      eocLink.target = "_blank";
      eocLink.textContent = "List of Covered Services";
      footer.appendChild(eocLink);
    }

    // Add "Look Up Doctors Network" link if doctor search URL exists
    if (plan.doctorSearchUrl) {
      const doctorLink = document.createElement("a");
      doctorLink.className = "summary-link";
      doctorLink.href = plan.doctorSearchUrl;
      doctorLink.target = "_blank";
      doctorLink.rel = "noopener noreferrer";
      doctorLink.textContent = "Look Up Doctors Network";
      footer.appendChild(doctorLink);
    }

    const btn = document.createElement("button");
    btn.className = "toggle-benefits";
    btn.dataset.group = plan.benefitGroup;
    btn.textContent = "View Benefits ▼";
    footer.appendChild(btn);

    if (plan.enrollUrl) {
      const enrollBtn = document.createElement("a");
      enrollBtn.className = "enroll-btn";
      enrollBtn.href = plan.enrollUrl;
      enrollBtn.target = "_blank";
      enrollBtn.rel = "noopener noreferrer";
      enrollBtn.textContent = "Enroll";
      footer.appendChild(enrollBtn);
    }

    // Plan selection checkbox for email
    const emailCheckbox = document.createElement("input");
    emailCheckbox.type = "checkbox";
    emailCheckbox.className = "plan-email-checkbox";
    emailCheckbox.dataset.planId = plan.id;
    emailCheckbox.id = `plan-checkbox-${plan.id}`;
    
    const emailLabel = document.createElement("label");
    emailLabel.className = "plan-email-label";
    emailLabel.htmlFor = `plan-checkbox-${plan.id}`;
    emailLabel.textContent = "📧 Select to email";
    
    const emailCheckboxWrap = document.createElement("div");
    emailCheckboxWrap.className = "plan-email-checkbox-wrap";
    emailCheckboxWrap.appendChild(emailCheckbox);
    emailCheckboxWrap.appendChild(emailLabel);
    footer.appendChild(emailCheckboxWrap);

    card.appendChild(footer);

    // Carrier logos
    const logoMap = {
      lifex: {
        src: "assets/lifex-logo.png",
        alt: "LifeX Research Corp",
      },
      "enroll-prime": {
        src: "assets/enrollprime-logo.png",
        alt: "Enroll Prime",
      },
      popscience: {
        src: "assets/populationscience-logo.png",
        alt: "Population Science",
      },
    };

    if (logoMap[carrier]) {
      const logoWrap = document.createElement("div");
      logoWrap.className = "carrier-logo-wrap";
      const logo = document.createElement("img");
      logo.className = "carrier-logo";
      logo.src = logoMap[carrier].src;
      logo.alt = logoMap[carrier].alt;
      logoWrap.appendChild(logo);
      card.appendChild(logoWrap);
    }

    // BENEFITS PANEL
    const panel = document.createElement("div");
    panel.className = "benefits-panel";

    const list = document.createElement("ul");

    const b = plan.benefits;
    const fields = [
      ["Deductible", b.deductible],
      ["Max OOP", b.oopMax],
      ["Primary Care Visit", b.primaryCare],
      ["Specialist Visit", b.specialist],
      ["Emergency Room", b.emergencyRoom],
      ["Hospital Inpatient", b.inpatient],
    ];

    fields.forEach(([label, val]) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${label}:</strong> ${val}`;
      list.appendChild(li);
    });

    panel.appendChild(list);
    card.appendChild(panel);

    container.appendChild(card);
  });
}

/************************************************************
 *  BENEFITS TOGGLE
 ************************************************************/

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-benefits");
  if (!btn) return;

  const group = btn.dataset.group;
  const cards = document.querySelectorAll(
    `.plan-card[data-benefit-group="${group}"]`
  );

  const firstPanel = cards[0].querySelector(".benefits-panel");
  const open = !firstPanel.classList.contains("open");

  cards.forEach((c) => {
    const p = c.querySelector(".benefits-panel");
    if (open) p.classList.add("open");
    else p.classList.remove("open");

    const logos = c.querySelectorAll(".carrier-logo");
    logos.forEach((logo) => {
      if (open) logo.classList.add("hidden");
      else logo.classList.remove("hidden");
    });
  });

  const allButtons = document.querySelectorAll(
    `.toggle-benefits[data-group="${group}"]`
  );
  allButtons.forEach((b) => {
    b.textContent = open ? "Hide Benefits ▲" : "View Benefits ▼";
  });
});

/************************************************************
 *  EMAIL PLAN DETAILS
 ************************************************************/

const MAX_PLANS_PER_EMAIL = 5;
let selectedPlanIds = new Set();

function updateEmailButton() {
  const btn = document.getElementById("emailSelectedPlansBtn");
  const countSpan = document.getElementById("selectedPlansCount");
  
  if (!btn || !countSpan) return;
  
  const count = selectedPlanIds.size;
  countSpan.textContent = count;
  
  if (count > 0) {
    btn.hidden = false;
    btn.disabled = count > MAX_PLANS_PER_EMAIL;
  } else {
    btn.hidden = true;
  }
}

function updateSelectedPlansList() {
  const list = document.getElementById("selectedPlansList");
  if (!list) return;
  
  list.innerHTML = "";
  
  if (selectedPlanIds.size === 0) {
    list.hidden = true;
    return;
  }
  
  list.hidden = false;
  const selectedPlans = plans.filter(p => selectedPlanIds.has(p.id));
  
  const ul = document.createElement("ul");
  selectedPlans.forEach(plan => {
    const li = document.createElement("li");
    li.textContent = plan.name;
    ul.appendChild(li);
  });
  list.appendChild(ul);
}

// Handle plan checkbox changes
document.addEventListener("change", (e) => {
  const checkbox = e.target.closest(".plan-email-checkbox");
  if (!checkbox) return;
  
  const planId = checkbox.dataset.planId;
  
  if (checkbox.checked) {
    if (selectedPlanIds.size >= MAX_PLANS_PER_EMAIL) {
      checkbox.checked = false;
      showSubscriptionNotice(
        `You can only select up to ${MAX_PLANS_PER_EMAIL} plans per email.`,
        "warning",
        3000
      );
      return;
    }
    selectedPlanIds.add(planId);
  } else {
    selectedPlanIds.delete(planId);
  }
  
  updateEmailButton();
  updateSelectedPlansList();
});

// Open modal when clicking "Email Selected Plans" button
document.addEventListener("click", (e) => {
  const emailBtn = e.target.closest("#emailSelectedPlansBtn");
  if (!emailBtn || emailBtn.disabled) return;
  
  if (selectedPlanIds.size === 0) {
    return;
  }
  
  if (selectedPlanIds.size > MAX_PLANS_PER_EMAIL) {
    showSubscriptionNotice(
      `You can only select up to ${MAX_PLANS_PER_EMAIL} plans per email.`,
      "warning",
      3000
    );
    return;
  }
  
  const modal = document.getElementById("emailPlanModal");
  const input = document.getElementById("emailPlanInput");
  const error = document.getElementById("emailPlanError");
  const description = document.getElementById("emailPlanDescription");

  if (modal && input) {
    updateSelectedPlansList();
    const count = selectedPlanIds.size;
    description.textContent = `Enter the customer's email address to send ${count} plan detail${count > 1 ? 's' : ''}:`;
    modal.hidden = false;
    input.value = "";
    error.hidden = true;
    error.textContent = "";
    input.focus();
  }
});

document.addEventListener("click", (e) => {
  const cancelBtn = e.target.closest("#emailPlanCancel");
  const modal = document.getElementById("emailPlanModal");
  if (cancelBtn && modal) {
    modal.hidden = true;
  }

  // Close modal when clicking outside
  if (e.target === modal) {
    modal.hidden = true;
  }
});

document.addEventListener("click", async (e) => {
  const sendBtn = e.target.closest("#emailPlanSend");
  if (!sendBtn || selectedPlanIds.size === 0) return;

  const input = document.getElementById("emailPlanInput");
  const error = document.getElementById("emailPlanError");
  const modal = document.getElementById("emailPlanModal");

  if (!input || !error || !modal) return;

  const recipientEmail = input.value.trim();

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!recipientEmail || !emailRegex.test(recipientEmail)) {
    error.hidden = false;
    error.textContent = "Please enter a valid email address.";
    return;
  }

  // Validate plan count
  if (selectedPlanIds.size === 0) {
    error.hidden = false;
    error.textContent = "Please select at least one plan.";
    return;
  }

  if (selectedPlanIds.size > MAX_PLANS_PER_EMAIL) {
    error.hidden = false;
    error.textContent = `You can only send up to ${MAX_PLANS_PER_EMAIL} plans per email.`;
    return;
  }

  // Disable button and show loading state
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";
  error.hidden = true;

  try {
    const user = window.__PHQ_USER;
    if (!user || !user.uid) {
      throw new Error("User not authenticated");
    }

    // Collect age band selections for each selected plan
    const selectedPlans = plans.filter(p => selectedPlanIds.has(p.id));
    const ageBandMap = {};
    selectedPlans.forEach(plan => {
      const ageBand = getAgeSelectionForPlan(plan);
      if (ageBand && ageBand !== "all") {
        ageBandMap[plan.id] = ageBand;
      }
    });

    const token = await auth.currentUser.getIdToken();
    const response = await fetch("/.netlify/functions/send-plan-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        planIds: Array.from(selectedPlanIds),
        recipientEmail: recipientEmail,
        ageBands: ageBandMap, // Send age band selections
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to send email");
    }

    // Success - show message, close modal, and clear selections
    const count = selectedPlanIds.size;
    showSubscriptionNotice(
      `${count} plan detail${count > 1 ? 's' : ''} sent successfully to ${recipientEmail}!`,
      "success",
      5000
    );
    modal.hidden = true;
    
    // Clear all selections
    selectedPlanIds.clear();
    document.querySelectorAll(".plan-email-checkbox").forEach(cb => {
      cb.checked = false;
    });
    updateEmailButton();
    updateSelectedPlansList();
  } catch (err) {
    console.error("[email-plan] Error:", err);
    error.hidden = false;
    error.textContent = err.message || "Failed to send email. Please try again.";
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Email";
  }
});

// Allow Enter key to submit email form
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "emailPlanInput") {
    const sendBtn = document.getElementById("emailPlanSend");
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    }
  }
});

/************************************************************
 *  UNDERWRITING QUESTIONS
 ************************************************************/

// Underwriting questions data by carrier
const UNDERWRITING_QUESTIONS = {
  "enroll-prime": {
    name: "Enroll Prime",
    questions: [
      {
        number: 1,
        text: "Are any applicants:",
        subQuestions: [
          "A: on COBRA and considered disabled.",
          "B: currently NOT working or missed 10 or more consecutive days of work in the last 12 months due to injury or illness? *"
        ],
        required: true
      },
      {
        number: 2,
        text: "Are any covered persons: Contemplating treatment or hospitalization, been advised to seek treatment, or been scheduled for hospitalization and/or surgery within the past 12 months? (other than for routine childbirth without complications)? *",
        required: true
      },
      {
        number: 3,
        text: "Does any applicant have:",
        subQuestions: [
          "A: any medical or test results pending, or a medical service that has not yet been performed?",
          "B: any applicants currently pregnant or plan to become pregnant in the next 12 months?"
        ],
        required: true
      },
      {
        number: 4,
        text: "Has any applicant ever:",
        subQuestions: [
          "A. been diagnosed with chronic kidney disease, kidney failure, or required dialysis?",
          "B. been diagnosed with Type 1 diabetes?",
          "C. been diagnosed with Type 2 diabetes with complications (such as neuropathy, kidney disease, or retinopathy)?",
          "D. been diagnosed with Lung, Emphysema, Chronic Bronchitis, COPD or Chronic Pneumonia, pulmonary fibrosis, or another chronic lung disease requiring oxygen",
          "E. been diagnosed with liver or blood disorder?",
          "F. been diagnosed with a severe mental health condition (such as schizophrenia, bipolar disorder, or any mental illness requiring hospitalization), or is any applicant currently receiving counseling or therapy for a mental health condition",
          "G. been diagnosed with HIV, AIDS, any other serious immune deficiency disorder, or an autoimmune disease such as Crohn's disease, ulcerative colitis, lupus, multiple sclerosis, or rheumatoid arthritis",
          "H. been diagnosed with a neurological disorder (ALS, Parkinson's disease, multiple sclerosis, muscular dystrophy, or an uncontrolled seizure disorder), or rheumatoid arthritis?",
          "I. been diagnosed with or treated for cancer (other than fully removed basal cell skin cancer)",
          "J. had a heart attack, heart surgery, angioplasty, stent, heart failure, stroke, TIA, or other serious vascular disease?",
          "K. been treated for substance or alcohol dependency in the past?",
          "L. received an organ transplant?"
        ],
        required: true
      },
      {
        number: 5,
        text: "Within the past 12 months, has any covered person had an ongoing condition likely to cost $5,000 or more per year for treatment (including prescription) for a serious continuing claim due to a mental or physical disorder (i.e., chronic) or any other medical condition? ( If you are unsure of a medication please visit GoodRX.com and type in the medication. A member might be paying a copay on a previous plan and may not know the full cost of this drug. ) *",
        required: true
      }
    ]
  },
  "population-science": {
    name: "Population Science Management",
    instructions: "Please answer the following questions for yourself, your spouse, and any dependents included in the application for coverage. NOTE: Dependent children are covered until the end of the month in which they turn 26. Domestic partners are not eligible for coverage—only legal spouses qualify.",
    disclaimer: "If the account holder, their spouse, or any dependents answer 'yes' to any of these questions, they will not be eligible for coverage.",
    questions: [
      {
        number: 1,
        text: "Has the prospective client or any of his/her dependents been under a doctor's care currently or within the past five years for any of the following conditions: cancer, heart disease (including bypass), heart attack, heart surgery, or stroke?",
        required: true
      },
      {
        number: 2,
        text: "Has the prospective client or any of his/her dependents applying for coverage been home-bound, incapacitated, or incapable of self-support due to a medical condition within the past five years?",
        required: true
      },
      {
        number: 3,
        text: "Has the prospective client or any of his/her dependents applying for coverage been under a doctor's care currently or within the past five years for an autoimmune or blood disease (e.g., lupus, MS, anemia, AIDS, HIV, hemophilia, IBS, or Crohn's)?",
        required: true
      },
      {
        number: 4,
        text: "Has the prospective client or any of his/her dependents been under a doctor's care currently or within the past five years for organ failure or an organ transplant involving the kidney, liver, lung, or heart, or for any form of organ support (e.g., dialysis)?",
        required: true
      },
      {
        number: 5,
        text: "Is the prospective client or any of his/her dependents applying for coverage currently pregnant or expecting?",
        required: true
      },
      {
        number: 6,
        text: "Is the prospective client or any of his/her dependents currently receiving treatment for a condition that required hospitalization within the past five years?",
        required: true
      },
      {
        number: 7,
        text: "Has the prospective client or any of his/her dependents been under a doctor's care currently or within the past five years for a respiratory disorder, such as emphysema, chronic bronchitis, COPD, or chronic pneumonia?",
        required: true
      },
      {
        number: 8,
        text: "Has the prospective client or any of his/her dependents seeking coverage been under a doctor's care currently or within the past five years for a musculoskeletal disorder, such as back disorders, muscular dystrophy, cerebral palsy, dermatomyositis, compartment syndrome, sciatica, or osteoporosis?",
        required: true
      },
      {
        number: 9,
        text: "Has the prospective client or any of his/her dependents seeking coverage been under a doctor's care currently or within the past five years for alcohol or substance abuse or dependency?",
        required: true
      },
      {
        number: 10,
        text: "Has the prospective client or any of his/her dependents seeking coverage been under a doctor's care currently or within the past five years for Type 1 diabetes, required insulin on a semi-regular or regular basis, or been under the care of a healthcare professional for any diabetes-related conditions?",
        required: true
      },
      {
        number: 11,
        text: "Has the prospective client or any of his/her dependents seeking coverage been under a doctor's care currently or within the past five years for a previous major surgery, or have an upcoming planned surgery?",
        required: true
      }
    ]
  }
};

function renderUnderwritingQuestions(carrierKey) {
  const content = document.getElementById("underwritingContent");
  if (!content) return;

  const carrier = UNDERWRITING_QUESTIONS[carrierKey];
  if (!carrier) {
    content.innerHTML = '<p class="underwriting-empty">No underwriting questions available for this carrier.</p>';
    return;
  }

  let html = `<div class="underwriting-carrier-name">${carrier.name}</div>`;
  
  // Add instructions if available
  if (carrier.instructions) {
    html += `<div class="underwriting-instructions">${carrier.instructions}</div>`;
  }
  
  carrier.questions.forEach((q) => {
    html += `<div class="underwriting-question">`;
    html += `<div class="underwriting-question-header">`;
    html += `<span class="question-number">${q.number}.</span>`;
    html += `<span class="question-text">${q.text}</span>`;
    if (q.required) {
      html += `<span class="question-required">*</span>`;
    }
    html += `</div>`;
    
    if (q.subQuestions && q.subQuestions.length > 0) {
      html += `<ul class="underwriting-subquestions">`;
      q.subQuestions.forEach((subQ) => {
        html += `<li>${subQ}</li>`;
      });
      html += `</ul>`;
    }
    
    html += `</div>`;
  });

  // Add disclaimer if available
  if (carrier.disclaimer) {
    html += `<div class="underwriting-disclaimer">${carrier.disclaimer}</div>`;
  }

  content.innerHTML = html;
}

function openUnderwritingModal() {
  const modal = document.getElementById("underwritingModal");
  const carrierSelect = document.getElementById("underwritingCarrierSelect");
  
  if (!modal || !carrierSelect) return;

  // Populate carrier dropdown
  carrierSelect.innerHTML = '<option value="">-- Select a carrier --</option>';
  Object.keys(UNDERWRITING_QUESTIONS).forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = UNDERWRITING_QUESTIONS[key].name;
    carrierSelect.appendChild(option);
  });

  // Clear content initially
  const content = document.getElementById("underwritingContent");
  if (content) {
    content.innerHTML = '<p class="underwriting-empty">Please select a carrier to view underwriting questions.</p>';
  }

  modal.hidden = false;
}

function closeUnderwritingModal() {
  const modal = document.getElementById("underwritingModal");
  if (modal) {
    modal.hidden = true;
  }
}

// Initialize underwriting modal event listeners
function initUnderwritingModal() {
  const viewBtn = document.getElementById("viewUnderwritingBtn");
  if (viewBtn) {
    viewBtn.addEventListener("click", openUnderwritingModal);
  }

  const closeBtn = document.getElementById("underwritingClose");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeUnderwritingModal);
  }

  const cancelBtn = document.getElementById("underwritingCancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeUnderwritingModal);
  }

  const carrierSelect = document.getElementById("underwritingCarrierSelect");
  if (carrierSelect) {
    carrierSelect.addEventListener("change", (e) => {
      const carrierKey = e.target.value;
      if (carrierKey) {
        renderUnderwritingQuestions(carrierKey);
      } else {
        const content = document.getElementById("underwritingContent");
        if (content) {
          content.innerHTML = '<p class="underwriting-empty">Please select a carrier to view underwriting questions.</p>';
        }
      }
    });
  }

  // Close modal when clicking outside
  const modal = document.getElementById("underwritingModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeUnderwritingModal();
      }
    });
  }
}

/************************************************************
 *  FILTERS
 ************************************************************/

function attachFilters() {
  const subs = document.querySelectorAll(".filter-subgroup");
  subs.forEach((box) => {
    box.addEventListener("change", renderPlans);
  });

  const tagSelect = document.getElementById("planTagFilter");
  if (tagSelect) {
    tagSelect.addEventListener("change", renderPlans);
  }
}

/************************************************************
 *  INIT
 ************************************************************/

document.addEventListener("DOMContentLoaded", async () => {
  handleCheckoutQueryParams();
  const subscribeBtn = document.getElementById("startSubscriptionBtn");
  if (subscribeBtn)
    subscribeBtn.addEventListener("click", startSubscriptionCheckout);
  
  const manageBtn = document.getElementById("manageSubscriptionBtn");
  if (manageBtn)
    manageBtn.addEventListener("click", openSubscriptionPortal);

  initStateGate();
  attachFilters();
  initUnderwritingModal();
  try {
    await initializePlans();
  } catch (err) {
    // error already shown in UI
    return;
  }
  renderPlans();
});

// Handle per-group age selectors (event delegation)
document.addEventListener("change", (e) => {
  const sel = e.target.closest(".age-select");
  if (!sel) return;
  const group = sel.dataset.group;
  setAgeSelectionForGroup(group, sel.value);
  renderPlans();
});
