const crypto = require("node:crypto");

function buildCheckoutQuote(cart, catalog, { pin, coupon, deliveryOption }) {
  if (!/^\d{6}$/.test(pin || "") || !Array.isArray(cart) || !cart.length || cart.length > 50) return null;
  const products = new Map(catalog.map(product => [product.id, product]));
  const quantities = new Map();
  const items = [];
  let weight = 0;
  let subtotal = 0;
  for (const entry of cart) {
    const product = products.get(entry?.id);
    const quantity = Number(entry?.qty ?? entry?.quantity);
    if (!product || product.disabled || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
    const stockUsed = (quantities.get(product.id) || 0) + quantity;
    if (!(stockUsed <= Number(product.stock || 0))) return null;
    quantities.set(product.id, stockUsed);

    const variantName = entry.variantName || "";
    const variant = variantName && Array.isArray(product.variants) &&
      product.variants.find(option => (option?.name || option?.weight) === variantName);
    if (variantName && !variant) return null;
    const price = Number(variant?.price ?? product.price ?? product.amount);
    if (!Number.isFinite(price) || price <= 0) return null;

    const units = Number(variant?.quantityValue ?? product.quantityValue);
    const unit = String(variant?.quantityType ?? product.quantityType ?? "").toLowerCase();
    const multiplier = { g: 1, ml: 1, kg: 1000, l: 1000, lt: 1000 }[unit];
    weight += (units > 0 && multiplier ? units * multiplier : 250) * quantity;
    subtotal += Math.round(price * 100) * quantity;
    items.push({ id: product.id, name: product.name, quantity, price, variantName,
      image: product.images?.[0] || product.image || "", category: product.categoryLabel || product.category || "" });
  }
  subtotal /= 100;
  const discount = coupon === "FARM10" ? Math.min(35, subtotal) : 0;
  const shipping = (/^60/.test(pin) ? 50 : /^[56]/.test(pin) ? 70 : 100) +
    (weight > 2000 ? 100 : weight > 1000 ? 60 : weight > 500 ? 30 : 0) +
    (deliveryOption === "express" ? 50 : 0);
  const tax = Math.round(subtotal * 0.05);
  return { items, subtotal, discount, shipping, tax, total: Math.round((subtotal - discount + shipping + tax) * 100) / 100, pin };
}

function signCheckoutQuote(quote, secret) {
  const payload = Buffer.from(JSON.stringify(quote)).toString("base64url");
  const signature = signCheckoutQuoteSignature(payload, secret).toString();
  return payload + "." + signature;
}

function readCheckoutQuote(token, secret) {
  if (typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = signCheckoutQuoteSignature(payload, secret);
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const quote = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return quote.expiresAt > Date.now() ? quote : null;
  } catch {
    return null;
  }
}

function signCheckoutQuoteSignature(payload, secret) {
  return Buffer.from(crypto.createHmac("sha256", secret).update("checkout:" + payload).digest("base64url"));
}

module.exports = { buildCheckoutQuote, signCheckoutQuote, readCheckoutQuote };
