// server.js (revised)
// ------------------- Imports -------------------
const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");
require("dotenv").config();

// ------------------- Debug / sanity checks -------------------
console.log("DEBUG: RAZORPAY_KEY_ID loaded:", process.env.RAZORPAY_KEY_ID ? "(present)" : "(missing)");

// ------------------- Firebase Setup (Base64 Service Account) -------------------
if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  console.error("❌ FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_BASE64 is not set!");
  process.exit(1);
}

let db;
try {
  const base64String = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const jsonString = Buffer.from(base64String, 'base64').toString('utf8');
  const serviceAccount = JSON.parse(jsonString);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
  });

  db = admin.firestore();
  console.log("✅ Firebase admin initialized");
} catch (error) {
  console.error("❌ FATAL ERROR: Failed to decode or parse Firebase Service Account.", error);
  process.exit(1);
}

// ------------------- Razorpay Setup -------------------
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("⚠️ Razorpay keys missing in env. create-order or signature verification may fail.");
}
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

// ------------------- Express + CORS -------------------
const app = express();
const allowedOrigins = [
  "https://ermunaiorganicfarmfoods.com",
  "https://www.ermunaiorganicfarmfoods.com",
  "https://ermunai-user-project-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost",
  "http://127.0.0.1:5500"
];

const corsOptions = {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error(`CORS policy does not allow origin: ${origin}`), false);
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// ------------------- Health check -------------------
app.get("/", (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || "dev" }));

// ------------------- Helper: Verify Firebase ID token (optional, recommended) -------------------
async function verifyIdTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  const idToken = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded; // contains uid and token claims
  } catch (err) {
    console.warn("Invalid ID token:", err.message || err);
    return null;
  }
}

// ------------------- Create Razorpay Order -------------------
// Expects request.body: { amount: <integer paise>, userId?: "...", items?: [...] }
// IMPORTANT: `amount` must be in paise (integer). Do NOT multiply again on the server.
app.post("/create-order", async (req, res) => {
  try {
    const { amount, userId, items } = req.body;

    // Validate amount (paise integer)
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount (in paise) is required" });
    }

    // Optional: verify id token if client sent Authorization header
    // const decoded = await verifyIdTokenFromRequest(req);
    // if (decoded && userId && decoded.uid !== userId) {
    //   return res.status(403).json({ error: "User ID mismatch with provided token" });
    // }

    // Create Razorpay order with exactly the paise amount client provided
    const options = {
      amount: Math.round(Number(amount)), // already paise
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);
    return res.json({ success: true, id: order.id, order }); // return order object (or just id)
  } catch (err) {
    console.error("❌ Razorpay order creation error:", err);
    if (err.statusCode === 401) {
      console.error("🔑 AUTH ERROR: Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    }
    return res.status(500).json({ error: "Error creating order", details: err.error ? err.error.description : (err.message || String(err)) });
  }
});

// ------------------- Save Order to Firebase (with signature verification) -------------------
// Expects req.body: { orderData: { userId, items, subtotal, shipping, total, razorpay_payment_id, razorpay_order_id, razorpay_signature, customer: {...} } }
app.post("/save-order", async (req, res) => {
  try {
    console.log("DEBUG /save-order payload:", JSON.stringify(req.body, null, 2));
    const { orderData } = req.body;

    if (!orderData || typeof orderData !== "object") {
      return res.status(400).json({ error: "orderData is required" });
    }

    // Required fields
    const required = ["userId", "total", "razorpay_payment_id", "razorpay_order_id", "razorpay_signature"];
    for (const f of required) {
      if (!orderData[f]) {
        return res.status(400).json({ error: `Missing required field: ${f}` });
      }
    }

    // Optionally verify ID token: ensure requestor has a valid token and matches userId
    const decoded = await verifyIdTokenFromRequest(req);
    if (decoded) {
      if (decoded.uid !== orderData.userId) {
        return res.status(403).json({ error: "Auth token UID does not match order userId" });
      }
    } else {
      // If you require authentication for saving orders, uncomment and enforce:
      // return res.status(401).json({ error: "Missing or invalid Firebase ID token" });
      console.log("Warning: save-order called without a valid ID token (continuing because token verification is optional).");
    }

    // 1) Verify signature (HMAC SHA256)
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${orderData.razorpay_order_id}|${orderData.razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== orderData.razorpay_signature) {
      console.warn("❌ Signature mismatch:", { expectedSignature, provided: orderData.razorpay_signature });
      return res.status(400).json({ error: "Invalid payment signature - verification failed" });
    }

    // 2) (Optional but important) Fetch Razorpay order and confirm the amount matches `orderData.total`
    try {
      const gatewayOrder = await razorpay.orders.fetch(orderData.razorpay_order_id);
      // gatewayOrder.amount is in paise (integer)
      const gatewayAmount = Number(gatewayOrder.amount);
      const clientTotal = Number(orderData.total); // should be paise
      if (gatewayAmount !== clientTotal) {
        console.warn("❌ Amount mismatch between gateway order and client:", { gatewayAmount, clientTotal });
        return res.status(400).json({ error: "Amount mismatch with Razorpay order" });
      }
    } catch (fetchErr) {
      console.warn("⚠️ Could not fetch Razorpay order to verify amount:", fetchErr && fetchErr.message ? fetchErr.message : fetchErr);
      // decide whether to reject here — best to reject, but you may choose to continue
      return res.status(500).json({ error: "Failed to verify Razorpay order", details: fetchErr.message || String(fetchErr) });
    }

    // 3) Compose Firestore doc and save (safe mapping)
    const candidateId = (orderData.order_id && String(orderData.order_id).trim()) || (orderData.razorpay_order_id && String(orderData.razorpay_order_id).trim()) || null;
    const ordersCol = db.collection("orders");
    const orderDocRef = candidateId ? ordersCol.doc(candidateId) : ordersCol.doc();
    const finalDocId = candidateId ? candidateId : orderDocRef.id;

    const formattedOrder = {
      orderId: finalDocId,
      userId: orderData.userId,
      customerName: (orderData.customer && orderData.customer.name) || null,
      phone: (orderData.customer && orderData.customer.phone) || null,
      address: ((orderData.customer && orderData.customer.address) ? `${orderData.customer.address}, ${orderData.customer.city || ""}, ${orderData.customer.state || ""} - ${orderData.customer.pin || ""}` : null),
      subtotal: Number(orderData.subtotal) || 0,
      shipping: Number(orderData.shipping) || 0,
      totalAmount: Number(orderData.total) || 0,
      paymentId: orderData.razorpay_payment_id || null,
      razorpay_order_id: orderData.razorpay_order_id || null,
      razorpay_signature: orderData.razorpay_signature || null,
      paymentStatus: orderData.status || "Paid",
      items: Array.isArray(orderData.items) ? orderData.items.map(it => ({
        name: it.name,
        quantity: it.qty || it.quantity || 1,
        price: it.price || 0
      })) : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      rawPayload: orderData
    };

    await orderDocRef.set(formattedOrder);
    return res.json({ success: true, id: finalDocId });
  } catch (err) {
    console.error("❌ /save-order error:", err);
    return res.status(500).json({ error: "Error saving order", details: err.message || String(err) });
  }
});

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
