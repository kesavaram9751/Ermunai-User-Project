const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");

dotenv.config({ path: path.join(workspaceRoot, ".env"), quiet: true });
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

const url = process.env.SUPABASE_URL || "https://svbsrgxqgzuibrrsywix.supabase.co";
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!anonKey || anonKey === "your_supabase_anon_or_publishable_key_here") {
  console.error("Missing SUPABASE_ANON_KEY in .env. Copy the public anon/publishable key from Supabase Project Settings > API.");
  process.exit(1);
}

if (serviceRoleKey && anonKey === serviceRoleKey) {
  console.error("SUPABASE_ANON_KEY cannot be the service-role key. Use the public anon/publishable key only.");
  process.exit(1);
}

if (/service_role/i.test(decodeJwtPayload(anonKey)?.role || "")) {
  console.error("SUPABASE_ANON_KEY is a service-role JWT. Use the public anon key instead.");
  process.exit(1);
}

const files = [
  path.join(workspaceRoot, "Ermunai-admin-dashboard-project", "supabase-compat.js"),
  path.join(workspaceRoot, "Ermunai-admin-dashboard-project", "control-center.html"),
  path.join(workspaceRoot, "Ermunai-admin-dashboard-project", "dashboard-product-page.html"),
  path.join(workspaceRoot, "Ermunai-admin-dashboard-project", "site-control.html"),
  path.join(projectRoot, "js", "supabase-compat.js")
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  content = content.replace(/(SUPABASE_URL\s*=\s*")[^"]+(")/g, `$1${url}$2`);
  content = content.replace(/(SUPABASE_ANON_KEY\s*=\s*")[^"]+(")/g, `$1${anonKey}$2`);
  content = content.replace(/(SUPABASE_KEY\s*=\s*")[^"]+(")/g, `$1${anonKey}$2`);
  fs.writeFileSync(file, content);
  console.log(`Updated ${path.relative(workspaceRoot, file)}`);
}

function decodeJwtPayload(value) {
  if (!value || value.split(".").length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
