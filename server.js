const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const cors = require("cors");
const crypto = require("crypto");
require("dotenv").config();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://svbsrgxqgzuibrrsywix.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("FATAL ERROR: SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("FATAL ERROR: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set.");
  process.exit(1);
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const app = express();

const allowedOrigins = [
  "https://ermunaiorganicfarmfoods.com",
  "https://www.ermunaiorganicfarmfoods.com",
  "https://ermunai-user-project.onrender.com",
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean)
];

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost", "http://127.0.0.1:5500");
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true
}));

app.use(bodyParser.json({ limit: "250kb" }));
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 120);
const rateLimitStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}, Math.min(rateLimitWindowMs, 60 * 1000)).unref();

app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const key = `${ip}:${req.path}`;
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + rateLimitWindowMs };
  if (entry.resetAt < now) {
    entry.count = 0;
    entry.resetAt = now + rateLimitWindowMs;
  }
  entry.count += 1;
  rateLimitStore.set(key, entry);
  if (entry.count > rateLimitMax) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  next();
});

function supabaseHeaders(prefer = "") {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...supabaseHeaders(options.prefer), ...(options.headers || {}) }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.hint || "Supabase request failed");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function tablePath(table, query = "") {
  return `/rest/v1/${table}${query}`;
}

function unpack(row) {
  if (!row) return null;
  return { id: row.id, ...(row.data || {}) };
}

function pack(id, data) {
  const clean = { ...(data || {}) };
  delete clean.id;
  return { id, data: clean, updated_at: new Date().toISOString() };
}

async function getById(table, id) {
  const rows = await supabaseRequest(tablePath(table, `?id=eq.${encodeURIComponent(id)}&select=*`));
  return unpack(rows[0]);
}

async function upsertById(table, id, data) {
  const rows = await supabaseRequest(tablePath(table), {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(pack(id, data))
  });
  return unpack(rows[0]);
}

async function insertRow(table, data) {
  const id = data.id || crypto.randomUUID();
  const rows = await supabaseRequest(tablePath(table), {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ ...pack(id, data), created_at: new Date().toISOString() })
  });
  return unpack(rows[0]);
}

async function listRows(table, query = "") {
  const rows = await supabaseRequest(tablePath(table, query));
  return (rows || []).map(unpack);
}

async function verifySupabaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    const token = authHeader.split("Bearer ")[1].trim();
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    });
    const user = await response.json();
    if (!response.ok || !user?.id) {
      return res.status(401).json({ error: "Unauthorized: Invalid Supabase token" });
    }
    req.user = { uid: user.id, email: user.email };
    next();
  } catch (error) {
    console.error("Supabase token verification failed:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

function requireRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const user = await getById("users", req.user.uid);
      const role = user?.role;
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: "Forbidden: insufficient role" });
      }
      req.role = role;
      next();
    } catch (error) {
      console.error("Role lookup failed:", error);
      res.status(500).json({ error: "Unable to verify role" });
    }
  };
}

function verifyRazorpaySignature({ order_id, payment_id, signature }) {
  if (![order_id, payment_id, signature].every(value => typeof value === "string" && value.length)) return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${order_id}|${payment_id}`)
    .digest("hex");
  const received = Buffer.from(signature);
  const digest = Buffer.from(expected);
  return received.length === digest.length && crypto.timingSafeEqual(received, digest);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

const { buildCheckoutQuote, signCheckoutQuote, readCheckoutQuote } = require("./checkout-quote");
const checkoutSecret = process.env.RAZORPAY_KEY_SECRET;

function optionalCheckoutAuth(req, res, next) {
  return req.headers.authorization ? verifySupabaseToken(req, res, next) : next();
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ermunai-api", database: "supabase", timestamp: new Date().toISOString() });
});

app.get("/public-config", (req, res) => {
  res.json({ razorpayKeyId: process.env.RAZORPAY_PUBLIC_KEY_ID || process.env.RAZORPAY_KEY_ID });
});

function deliveryDetails(customer) {
  if (!customer || typeof customer !== "object") return null;
  const fields = { name: 120, phone: 30, address: 300, city: 80, state: 80, pin: 6, email: 254 };
  const details = Object.fromEntries(Object.entries(fields).map(([key, length]) => [key, cleanString(customer[key], length)]));
  if (!/^\d{6}$/.test(customer.pin || "") || !["name", "phone", "address", "city", "state"].every(key => details[key])) return null;
  return details;
}

function deliveryFingerprint(details) {
  return crypto.createHmac("sha256", checkoutSecret).update("delivery:" + JSON.stringify(details)).digest("hex");
}

app.post("/create-order", optionalCheckoutAuth, async (req, res) => {
  try {
    const { cart, customer, coupon, deliveryOption } = req.body || {};
    const delivery = deliveryDetails(customer);
    if (!delivery) return res.status(400).json({ error: "Valid delivery details are required." });
    if (!Array.isArray(cart) || !cart.length || cart.length > 50 ||
        !cart.every(item => typeof item?.id === "string" && item.id.length <= 120)) {
      return res.status(400).json({ error: "Your cart is invalid. Please refresh it and try again." });
    }
    const ids = [...new Set(cart.map(item => item.id))];
    const catalog = (await Promise.all(ids.map(id => getById("products", id)))).filter(Boolean);
    const quote = buildCheckoutQuote(cart, catalog, { pin: delivery.pin, coupon, deliveryOption });
    if (!quote) return res.status(400).json({ error: "Check your PIN code and product availability, then try again." });
    const uid = req.user?.uid || null;
    const order = await razorpay.orders.create({
      amount: Math.round(quote.total * 100),
      currency: "INR",
      receipt: `receipt_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`,
      notes: { source: "ermunai-web", uid: uid || "guest", cartItems: String(quote.items.length) }
    });
    const checkoutToken = signCheckoutQuote({
      ...quote, orderId: order.id, uid, deliveryFingerprint: deliveryFingerprint(delivery),
      deliveryOption: deliveryOption === "express" ? "express" : "standard", expiresAt: Date.now() + 86400000
    }, checkoutSecret);
    res.json({ id: order.id, amount: order.amount, discount: quote.discount, shipping: quote.shipping,
      tax: quote.tax, subtotal: quote.subtotal, total: quote.total, checkoutToken });
  } catch (error) {
    console.error("Razorpay order creation error:", error.error || error.message);
    res.status(500).json({ error: "Error creating order. Please try again." });
  }
});

app.post("/save-order", optionalCheckoutAuth, async (req, res) => {
  try {
    const { orderData, checkoutToken } = req.body || {};
    const quote = readCheckoutQuote(checkoutToken, checkoutSecret);
    const { customer = {}, payment_id, order_id, signature } = orderData || {};
    const uid = req.user?.uid || null;
    if (!quote || quote.orderId !== order_id || quote.uid !== uid ||
        !verifyRazorpaySignature({ order_id, payment_id, signature })) {
      return res.status(400).json({ error: "Invalid checkout or payment verification." });
    }
    const delivery = deliveryDetails(customer);
    if (!delivery || deliveryFingerprint(delivery) !== quote.deliveryFingerprint) {
      return res.status(400).json({ error: "Valid delivery details are required." });
    }
    const docId = order_id;
    const existingPayment = await getById("payments", payment_id);
    if (existingPayment?.status === "Paid") {
      if (existingPayment.orderId === docId && existingPayment.userid === uid) {
        return res.json({ success: true, id: docId });
      }
      return res.status(409).json({ error: "Payment has already been recorded." });
    }

    const payment = await razorpay.payments.fetch(payment_id);
    const requestedTotal = quote.total;
    if (payment.order_id !== order_id || payment.status !== "captured" || payment.currency !== "INR" ||
        Number(payment.amount) !== Math.round(requestedTotal * 100)) {
      return res.status(400).json({ error: "Payment verification failed. Please contact support." });
    }

    const formattedOrder = {
      userid: uid,
      guest: uid === null,
      customerEmail: delivery.email,
      customerName: delivery.name,
      phone: delivery.phone,
      address: `${delivery.address}, ${delivery.city}, ${delivery.state} - ${delivery.pin}`,
      deliveryOption: quote.deliveryOption,
      totalAmount: requestedTotal,
      subtotal: quote.subtotal,
      discount: quote.discount,
      shipping: quote.shipping,
      tax: quote.tax,
      paymentId: payment_id,
      orderId: order_id,
      paymentStatus: "Paid",
      status: "Processing",
      datePlaced: new Date().toISOString(),
      items: quote.items,
      razorpaySignature: signature || null
    };

    await upsertById("orders", docId, formattedOrder);
    await upsertById("payments", payment_id, {
      userid: uid,
      orderId: docId,
      razorpayOrderId: order_id,
      razorpayPaymentId: payment_id,
      amount: requestedTotal,
      status: "Paid",
      gatewayStatus: payment.status,
      method: payment.method || null,
      email: payment.email || null,
      contact: payment.contact || null,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id: docId });
  } catch (error) {
    console.error("Supabase order save error:", error);
    res.status(500).json({ error: "Error saving order in Supabase", details: error.message || error });
  }
});

app.get("/my-orders", verifySupabaseToken, async (req, res) => {
  try {
    const orders = await listRows("orders", `?select=*&data->>userid=eq.${encodeURIComponent(req.user.uid)}&order=created_at.desc&limit=50`);
    res.json({ orders });
  } catch (error) {
    console.error("Failed to load user orders:", error);
    res.status(500).json({ error: "Unable to load orders" });
  }
});

app.post("/payment-failed", verifySupabaseToken, async (req, res) => {
  try {
    const { orderId, reason } = req.body || {};
    const id = isNonEmptyString(orderId) ? orderId : crypto.randomUUID();
    await upsertById("payments", id, {
      userid: req.user.uid,
      status: "Failed",
      reason: cleanString(reason || "Payment failed or cancelled", 300),
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Failed payment recovery log error:", error);
    res.status(500).json({ error: "Unable to record failed payment" });
  }
});

app.post("/admin/refund-request", verifySupabaseToken, requireRole(["Super Admin", "Admin", "Support Staff"]), async (req, res) => {
  try {
    const { orderId, paymentId, amount, reason } = req.body || {};
    if (!isNonEmptyString(orderId) || !isNonEmptyString(paymentId)) {
      return res.status(400).json({ error: "orderId and paymentId are required" });
    }
    const ref = await insertRow("refundRequests", {
      orderId: cleanString(orderId, 120),
      paymentId: cleanString(paymentId, 120),
      amount: parseAmount(amount),
      reason: cleanString(reason || "", 500),
      status: "Requested",
      requestedBy: req.user.uid,
      createdAt: new Date().toISOString()
    });
    res.json({ success: true, id: ref.id });
  } catch (error) {
    console.error("Refund request failed:", error);
    res.status(500).json({ error: "Unable to create refund request" });
  }
});

const PORT = process.env.PORT || 5000;
const { createStorefrontSeo } = require("./seo-storefront");
app.use(createStorefrontSeo({
  supabaseUrl: SUPABASE_URL,
  publicKey: process.env.SUPABASE_ANON_KEY || "sb_publishable_SnnCYLyAFpFHb7yUayFsPg_vMI4qXW7"
}));

const storefrontFiles = new Set([
  "robots.txt", "google850a8c5c908f6843.html", "login.html", "signup.html", "cart.html",
  "checkout.html", "purchase.html", "thankyou.html"
]);
app.use((req, res, next) => {
  const file = req.path.slice(1);
  if (!storefrontFiles.has(file)) return next();
  if (!["robots.txt", "google850a8c5c908f6843.html"].includes(file)) {
    res.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res.sendFile(file, { root: __dirname });
});
for (const directory of ["css", "js", "images", "admin"]) {
  app.use("/" + directory, express.static(require("node:path").join(__dirname, directory), {
    maxAge: directory === "images" ? "1d" : 0,
    setHeaders(res) {
      if (directory === "admin") res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
  }));
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
