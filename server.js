// server.js
// ------------------- Imports -------------------
const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

// ------------------- Debug / sanity checks -------------------
console.log("DEBUG: RAZORPAY_KEY_ID loaded:", process.env.RAZORPAY_KEY_ID || "(missing)");

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
    // Realtime DB URL (optional) - keep if you used it previously
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://ermunai-e-commerce-project.firebaseio.com"
  });

  db = admin.firestore();
  console.log("✅ Firebase admin initialized");
} catch (error) {
  console.error("❌ FATAL ERROR: Failed to decode or parse Firebase Service Account.", error);
  console.log("Raw Base64 string (first 40 chars):", (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").slice(0,40));
  process.exit(1);
}

// ------------------- Razorpay Setup -------------------
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("⚠️ Razorpay keys missing in env. create-order may fail.");
}
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

// ------------------- Express + CORS -------------------
const app = express();

// Add your real frontend origins here (exact origin)
const allowedOrigins = [
  "https://ermunaiorganicfarmfoods.com",
  "https://www.ermunaiorganicfarmfoods.com",
  // Add your Railway / Vercel origin(s) if front-end is hosted elsewhere:
  "https://ermunai-user-project-production.up.railway.app",
  "http://localhost:3000",
  "http://localhost",
  "http://127.0.0.1:5500"
];

const corsOptions = {
  origin: function(origin, callback) {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      const msg = `The CORS policy for this site does not allow access from the origin: ${origin}`;
      return callback(new Error(msg), false);
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// ------------------- Health check -------------------
app.get("/", (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || "dev" }));

// ------------------- Create Razorpay Order -------------------
app.post("/create-order", async (req, res) => {
  try {
    const { amount, userId } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    // Optionally: validate userId present (if you require auth)
    // if (!userId) return res.status(400).json({ error: "userId is required" });

    const options = {
      amount: Math.round(Number(amount) * 100), // paise
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);
    // Return raw Razorpay order response to client
    return res.json({ success: true, order });
  } catch (err) {
    console.error("❌ Razorpay order creation error:", err);
    if (err.statusCode === 401) {
      console.error("🔑 AUTH ERROR: Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    }
    return res.status(500).json({ error: "Error creating order", details: err.error ? err.error.description : err.message || String(err) });
  }
});

// ------------------- Save Order to Firebase (Hardened) -------------------
app.post("/save-order", async (req, res) => {
  try {
    // Debug log request body for troubleshooting
    console.log("DEBUG /save-order payload:", JSON.stringify(req.body, null, 2));

    const { orderData } = req.body;
    if (!orderData || typeof orderData !== "object") {
      return res.status(400).json({ error: "orderData is required" });
    }

    // Basic validation for required fields (adjust as needed)
    if (!orderData.customer || !orderData.customer.name) {
      return res.status(400).json({ error: "Customer information missing (customer.name required)" });
    }

    // Determine a safe document ID:
    // prefer orderData.order_id -> orderData.razorpay_order_id -> auto-id
    const candidateId = (orderData.order_id && String(orderData.order_id).trim())
      || (orderData.razorpay_order_id && String(orderData.razorpay_order_id).trim())
      || null;

    const ordersCol = db.collection("orders");
    const orderDocRef = candidateId ? ordersCol.doc(candidateId) : ordersCol.doc(); // auto-id if none provided
    const finalDocId = candidateId ? candidateId : orderDocRef.id;

    // Format order to save
    const formattedOrder = {
      orderId: finalDocId,
      userId: orderData.userId || null,
      customerName: orderData.customer.name || null,
      phone: orderData.customer.phone || null,
      address: `${orderData.customer.address || ""}, ${orderData.customer.city || ""}, ${orderData.customer.state || ""} - ${orderData.customer.pin || ""}`.replace(/(^[,\s]+|[,\s]+$)/g, ""),
      subtotal: Number(orderData.subtotal) || 0,
      shipping: Number(orderData.shipping) || 0,
      totalAmount: Number(orderData.total) || 0,
      paymentId: orderData.payment_id || null,
      razorpay_order_id: orderData.razorpay_order_id || null,
      razorpay_signature: orderData.razorpay_signature || null,
      paymentStatus: orderData.status || "Unknown",
      items: Array.isArray(orderData.items) ? orderData.items.map(it => ({
        name: it.name,
        quantity: it.qty,
        price: it.price
      })) : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      rawPayload: orderData // optional: store raw payload for debugging (remove if you want lean docs)
    };

    await orderDocRef.set(formattedOrder);

    return res.json({ success: true, id: finalDocId });
  } catch (err) {
    console.error("❌ Firebase save error:", err);
    return res.status(500).json({ error: "Error saving order in Firebase", details: err.message || String(err) });
  }
});

// ------------------- Optional: Verify Firebase ID token (recommended) -------------------
// If you want to verify the client's Firebase ID token before accepting userId,
// uncomment and use this helper. Client would send idToken in Authorization header (Bearer <idToken>).
/*
async function verifyIdTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  const idToken = match[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.warn("Invalid ID token:", err);
    return null;
  }
}
*/

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
