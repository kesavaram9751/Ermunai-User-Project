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
  if (!order_id || !payment_id || !signature) return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${order_id}|${payment_id}`)
    .digest("hex");
  return expected === signature;
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

function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map(item => ({
    id: cleanString(item.id || "", 120),
    name: cleanString(item.name || "Product", 180),
    quantity: Math.max(1, Math.min(99, Number(item.qty || item.quantity || 1))),
    price: parseAmount(item.price) || 0,
    image: cleanString(item.image || "", 500),
    category: cleanString(item.category || "", 120)
  })).filter(item => item.name && item.price >= 0);
}

function computeTotalFromItems(items, shipping = 0, tax = 0, discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const safeShipping = parseAmount(shipping) || 0;
  const safeTax = parseAmount(tax) || 0;
  const safeDiscount = Math.min(parseAmount(discount) || 0, subtotal);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: safeDiscount,
    shipping: safeShipping,
    tax: safeTax,
    total: Math.round((subtotal - safeDiscount + safeShipping + safeTax) * 100) / 100
  };
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ermunai-api", database: "supabase", timestamp: new Date().toISOString() });
});

app.get("/public-config", (req, res) => {
  res.json({ razorpayKeyId: process.env.RAZORPAY_PUBLIC_KEY_ID || process.env.RAZORPAY_KEY_ID });
});

app.post("/create-order", verifySupabaseToken, async (req, res) => {
  try {
    const { amount, cart = [] } = req.body;
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) return res.status(400).json({ error: "Valid amount is required" });
    const normalizedItems = normalizeCartItems(cart);
    if (!normalizedItems.length) return res.status(400).json({ error: "Cart items are required" });

    const order = await razorpay.orders.create({
      amount: Math.round(parsedAmount * 100),
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: { source: "ermunai-web", uid: req.user.uid, cartItems: String(normalizedItems.length) }
    });
    res.json(order);
  } catch (error) {
    console.error("Razorpay order creation error:", error.error || error.message || error);
    res.status(500).json({ error: "Error creating order", details: error.error?.description || error.message || error });
  }
});

app.post("/save-order", verifySupabaseToken, async (req, res) => {
  try {
    const { orderData } = req.body;
    if (!orderData) return res.status(400).json({ error: "Missing orderData" });

    const { items = [], shipping, total, tax, discount, customer = {}, payment_id, order_id, signature } = orderData;
    if (!verifyRazorpaySignature({ order_id, payment_id, signature })) {
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    const normalizedItems = normalizeCartItems(items);
    if (!normalizedItems.length) return res.status(400).json({ error: "Order must include at least one item." });

    const computed = computeTotalFromItems(normalizedItems, shipping, tax, discount);
    const requestedTotal = parseAmount(total);
    if (!requestedTotal || Math.abs(computed.total - requestedTotal) > 2) {
      return res.status(400).json({ error: "Amount mismatch. Please refresh your cart and try again." });
    }

    const docId = isNonEmptyString(order_id) ? order_id : (isNonEmptyString(payment_id) ? payment_id : crypto.randomUUID());
    const existingPayment = await getById("payments", payment_id);
    if (existingPayment?.status === "Paid") {
      return res.status(409).json({ error: "Payment has already been recorded." });
    }

    const payment = await razorpay.payments.fetch(payment_id);
    const paidAmount = Number(payment.amount || 0) / 100;
    if (payment.order_id !== order_id || payment.status !== "captured" || Math.abs(paidAmount - requestedTotal) > 2) {
      return res.status(400).json({ error: "Payment verification failed. Please contact support." });
    }

    const formattedOrder = {
      userid: req.user.uid,
      customerName: cleanString(customer.name, 120),
      phone: cleanString(customer.phone, 30),
      address: `${cleanString(customer.address, 300)}${customer.city ? ", " + cleanString(customer.city, 80) : ""}${customer.state ? ", " + cleanString(customer.state, 80) : ""}${customer.pin ? " - " + cleanString(customer.pin, 12) : ""}`.trim(),
      totalAmount: requestedTotal,
      subtotal: computed.subtotal,
      discount: computed.discount,
      shipping: computed.shipping,
      tax: computed.tax,
      paymentId: payment_id,
      orderId: order_id,
      paymentStatus: "Paid",
      status: "Processing",
      datePlaced: new Date().toISOString(),
      items: normalizedItems,
      razorpaySignature: signature || null
    };

    await upsertById("orders", docId, formattedOrder);
    await upsertById("payments", payment_id, {
      userid: req.user.uid,
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
