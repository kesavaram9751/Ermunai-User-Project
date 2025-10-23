// ------------------- Imports -------------------
const express = require("express");
const Razorpay = require("razorpay");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config(); // Loads variables from .env file

// ------------------- DEBUGGING STEP (Temporary) -------------------
// !! IMPORTANT: Check your terminal after running the server.
// !! If either value is 'undefined', your .env file is not loading correctly.
console.log("DEBUG: RAZORPAY_KEY_ID loaded:", process.env.RAZORPAY_KEY_ID);
// console.log("DEBUG: RAZORPAY_KEY_SECRET loaded:", process.env.RAZORPAY_KEY_SECRET); // Keep secret hidden!

// ------------------- Firebase Setup -------------------
// NOTE: Make sure serviceAccountKey.json is in the root and databaseURL is correct.
const serviceAccount = require("./serviceAccountKey.json"); 
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://<your-project-id>.firebaseio.com" // 🚨 REPLACE THIS 🚨
});
const db = admin.firestore();

// ------------------- Razorpay Setup -------------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ------------------- Express App -------------------
const app = express();
// Enable CORS for frontend running on a different port (like your HTML file)
app.use(cors({
    origin: ['http://localhost', 'http://127.0.0.1:5500']// or your actual frontend URL if different
}));
app.use(bodyParser.json());

// ------------------- Create Razorpay Order -------------------
// Endpoint: POST http://localhost:5000/create-order
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
    }

    const options = {
      // Razorpay expects amount in the smallest unit (Paise)
      amount: Math.round(amount * 100), 
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);
    res.json(order); // Returns the order ID (e.g., 'order_abc123')
  } catch (err) {
    // This catches the 401 Authentication error and any other API error
    console.error("❌ Razorpay order creation error:", err.error || err.message);
    
    // Check for the specific 401 Authentication failure details
    if (err.statusCode === 401 || (err.error && err.error.code === 'BAD_REQUEST_ERROR')) {
        // Log a specific message for easy diagnosis
        console.error("🔑 AUTHENTICATION FAILED: Check your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file!");
    }
    
    // Send a 500 status back to the frontend
    res.status(500).json({ 
        error: "Error creating order", 
        details: err.error ? err.error.description : err.message // Improved error detail for client-side logging
    });
  }
});

// ------------------- Save Order to Firebase -------------------
// Endpoint: POST http://localhost:5000/save-order
app.post("/save-order", async (req, res) => {
  try {
    const { orderData } = req.body;

    // format order as per your Firebase structure
    const formattedOrder = {
      customerName: orderData.customer.name,
      phone: orderData.customer.phone,
      address: `${orderData.customer.address}, ${orderData.customer.city}, ${orderData.customer.state} - ${orderData.customer.pin}`,
      totalAmount: orderData.total,
      subtotal: orderData.subtotal,
      shipping: orderData.shipping,
      paymentId: orderData.payment_id,
      orderId: orderData.order_id,
      paymentStatus: orderData.status,
      datePlaced: admin.firestore.FieldValue.serverTimestamp(), // Use server timestamp
      items: orderData.items.map(item => ({
        name: item.name,
        quantity: item.qty,
        price: item.price
      })),
    };

    // Use the Razorpay order ID as the document ID for easy lookup
    const docId = orderData.order_id;

    await db.collection("orders").doc(docId).set(formattedOrder);

    res.json({ success: true, id: docId });
  } catch (err) {
    console.error("❌ Firebase save error:", err);
    res.status(500).json({ error: "Error saving order in Firebase", details: err.message });
  }
});

// ------------------- Start Server -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));