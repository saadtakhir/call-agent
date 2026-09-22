export const PERMISSIONS = {
  VIEW_CALL: "view_call",
  VIEW_DASHBOARD: "view_dashboard",
  VIEW_CALL_HISTORY: "view_call_history",
  VIEW_COSTS: "view_costs",
  MANAGE_SETTINGS: "manage_settings",
  MANAGE_USERS: "manage_users",
};
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);
export const PERMISSION_LABELS = {
  [PERMISSIONS.VIEW_CALL]: "Suhbat (test qo'ng'iroq)",
  [PERMISSIONS.VIEW_DASHBOARD]: "Faol suhbatlar",
  [PERMISSIONS.VIEW_CALL_HISTORY]: "Qo'ng'iroqlar tarixi",
  [PERMISSIONS.VIEW_COSTS]: "Xarajatlar",
  [PERMISSIONS.MANAGE_SETTINGS]: "Sozlamalar",
  [PERMISSIONS.MANAGE_USERS]: "Foydalanuvchilar",
};

// The one account that always works, straight from env vars (see
// lib/auth.js's verifyCredentials) — avoids a chicken-and-egg problem
// creating the first real user, and a way back in if the users table is
// ever emptied by mistake.
export const ENV_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
