// server.js (drop-in replacement)
// ------------------- Imports -------------------
const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");
require("dotenv").config();

// ------------------- DEBUGGING STEP (Temporary) -------------------
console.log("DEBUG: RAZORPAY_KEY_ID loaded:", process.env.RAZORPAY_KEY_ID);

// ------------------- Firebase Setup (Base64 Decoding Fix) -------------------
if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  console.error("❌ FATAL ERROR: FIREBASE_SERVICE_ACCOUNT_BASE64 is not set!");
  process.exit(1);
}

try {
  const base64String = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const jsonString = Buffer.from(base64String, "base64").toString("utf8");
  const serviceAccount = JSON.parse(jsonString);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://ermunai-e-commerce-project.firebaseio.com"
  });
} catch (error) {
  console.error("❌ FATAL ERROR: Failed to decode or parse Firebase Service Account.", error);
  console.log("Raw Base64 string starts with:", (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").substring(0, 10));
  process.exit(1);
}

const db = admin.firestore();

// ------------------- Razorpay Setup -------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ------------------- Express App and CORS -------------------
const app = express();

const allowedOrigins = [
  'https://ermunaiorganicfarmfoods.com',
  'https://www.ermunaiorganicfarmfoods.com',
  // add your backend domains if needed
  'https://ermunai-user-project.onrender.com',
  'http://localhost',
  'http://127.0.0.1:5500',
];

const corsOptions = {
  origin: allowedOrigins,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// ------------------- Helpers -------------------

// Middleware: verify Firebase ID token from Authorization header
async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    const idToken = authHeader.split("Bearer ")[1].trim();
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}

// Verify Razorpay signature (server-side)
function verifyRazorpaySignature({ order_id, payment_id, signature }) {
  try {
    if (!order_id || !payment_id || !signature) return false;
    const body = order_id + "|" + payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(body.toString())
      .digest("hex");
    return expected === signature;
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

// Optional: safe string check
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

// ------------------- Create Razorpay Order -------------------
// POST /create-order
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const options = {
      // amount in paise
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: "receipt_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    return res.json(order);
  } catch (err) {
    console.error("❌ Razorpay order creation error:", err.error || err.message || err);
    if (err.statusCode === 401 || (err.error && err.error.code === 'BAD_REQUEST_ERROR')) {
      console.error("🔑 AUTHENTICATION FAILED: Check your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET!");
    }
    return res.status(500).json({
      error: "Error creating order",
      details: err.error ? err.error.description : (err.message || err)
    });
  }
});

// ------------------- Save Order to Firebase -------------------
// POST /save-order
// This endpoint requires the client to send a valid Firebase ID token in the Authorization header.
app.post("/save-order", verifyFirebaseToken, async (req, res) => {
  try {
    // Debug log for incoming payload
    console.log("DEBUG /save-order body:", JSON.stringify(req.body, null, 2));

    const { orderData } = req.body;
    if (!orderData) {
      return res.status(400).json({ error: "Missing orderData" });
    }

    // Basic shape checks
    const { items = [], subtotal, shipping, total, customer = {}, payment_id, order_id, signature } = orderData;

    // 1) Verify Razorpay signature server-side
    const sigOk = verifyRazorpaySignature({
      order_id,
      payment_id,
      signature
    });

    if (!sigOk) {
      console.warn("⚠️ Invalid or missing Razorpay signature for order:", order_id, payment_id);
      return res.status(400).json({ error: "Invalid payment signature." });
    }

    // 2) OPTIONAL (recommended): Recompute or validate the amount server-side using product prices.
    // Example placeholder:
    // const expectedTotal = computeTotalFromItems(items); // implement if you store product prices server-side
    // if (expectedTotal !== total) return res.status(400).json({ error: "Amount mismatch" });

    // 3) Determine a safe docId (do not pass undefined/empty string to doc())
    let docId = order_id;
    if (!isNonEmptyString(docId)) {
      console.warn("⚠️ Missing order_id in payload. Falling back to payment_id or generated id.");
      docId = isNonEmptyString(payment_id) ? payment_id : db.collection("orders").doc().id;
    }

    // 4) Format order for Firestore
    const formattedOrder = {
      userid: req.user.uid, // trusted UID from verified token
      customerName: customer.name || "",
      phone: customer.phone || "",
      address: `${customer.address || ""}${customer.city ? ", " + customer.city : ""}${customer.state ? ", " + customer.state : ""}${customer.pin ? " - " + customer.pin : ""}`.trim(),
      totalAmount: total,
      subtotal: subtotal,
      shipping: shipping,
      paymentId: payment_id,
      orderId: order_id,
      paymentStatus: "Paid",
      datePlaced: admin.firestore.FieldValue.serverTimestamp(),
      items: (items || []).map(item => ({
        name: item.name,
        quantity: item.qty,
        price: item.price
      })),
      razorpaySignature: signature || null
    };

    // 5) Save to Firestore
    await db.collection("orders").doc(docId).set(formattedOrder);

    return res.json({ success: true, id: docId });
  } catch (err) {
    console.error("❌ Firebase save error:", err);
    return res.status(500).json({ error: "Error saving order in Firebase", details: err.message || err });
  }
});

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
