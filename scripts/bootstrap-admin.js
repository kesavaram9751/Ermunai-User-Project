const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || "https://svbsrgxqgzuibrrsywix.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ermunaiorganicfarm@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "foods1125$";

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

if (SERVICE_ROLE_KEY === "paste_your_supabase_service_role_key_here") {
  console.error("Replace SUPABASE_SERVICE_ROLE_KEY in .env with your actual Supabase service-role key.");
  process.exit(1);
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: headers(options.headers || {})
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.msg || response.statusText;
    throw new Error(`${options.method || "GET"} ${path} failed: ${message}`);
  }

  return data;
}

async function findUserByEmail(email) {
  const pageSize = 1000;
  let page = 1;

  while (true) {
    const data = await request(`/auth/v1/admin/users?page=${page}&per_page=${pageSize}`);
    const users = Array.isArray(data) ? data : data.users || [];
    const match = users.find(user => String(user.email || "").toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < pageSize) return null;
    page += 1;
  }
}

async function upsertAuthUser() {
  const existing = await findUserByEmail(ADMIN_EMAIL);
  const payload = {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { displayName: "Super Admin", role: "Super Admin" }
  };

  if (existing?.id) {
    return request(`/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }

  return request("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function upsertAdminProfile(user) {
  const body = {
    id: user.id,
    data: {
      email: ADMIN_EMAIL,
      role: "Super Admin",
      displayName: "Super Admin",
      status: "active",
      createdAt: user.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  };

  await request("/rest/v1/users", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body)
  });
}

async function main() {
  const user = await upsertAuthUser();
  await upsertAdminProfile(user);
  console.log(`Admin ready: ${ADMIN_EMAIL}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
