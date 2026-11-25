const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const { buildCheckoutQuote, signCheckoutQuote, readCheckoutQuote } = require("../checkout-quote");

const secret = "local-mock-razorpay-secret";
const product = { id: "podi", name: "Idli Podi", price: 100, stock: 5, quantityValue: 250, quantityType: "g" };
const customer = { name: "Test Customer", phone: "9000000000", address: "Test Street", city: "Chennai", state: "Tamil Nadu", pin: "600091" };

test("quotes use catalog prices, variant weights, stock, shipping, and coupon rules", () => {
  const catalog = [{ ...product, variants: [{ name: "Family", price: 200, quantityValue: 1, quantityType: "kg" }] }];
  const quote = buildCheckoutQuote([{ id: product.id, price: 1, qty: 2, variantName: "Family" }], catalog, {
    pin: customer.pin, coupon: "FARM10", deliveryOption: "express"
  });
  assert.equal(quote.subtotal, 400);
  assert.equal(quote.total, 545);
  assert.equal(buildCheckoutQuote([{ id: product.id, qty: 4 }, { id: product.id, qty: 2 }], catalog, customer), null);
  assert.equal(buildCheckoutQuote([{ id: product.id, qty: 1, variantName: "Unknown" }], catalog, customer), null);
});

test("checkout tokens reject edits and expired quotes", () => {
  const quote = { total: 155, expiresAt: Date.now() + 60000 };
  const token = signCheckoutQuote(quote, secret);
  assert.deepEqual(readCheckoutQuote(token, secret), quote);
  assert.equal(readCheckoutQuote("modified." + token.split(".")[1], secret), null);
  assert.equal(readCheckoutQuote(signCheckoutQuote({ expiresAt: 0 }, secret), secret), null);
});

function checkoutHarness() {
  const routes = new Map();
  const records = { products: new Map([[product.id, product]]), orders: new Map(), payments: new Map() };
  const gateway = new Map();
  const application = {
    use() {}, disable() {}, listen() {},
    get(route, ...handlers) { routes.set(route, handlers); },
    post(route, ...handlers) { routes.set(route, handlers); }
  };
  const source = path.resolve(__dirname, "../server.js");
  const load = createRequire(source);
  vm.runInNewContext(fs.readFileSync(source, "utf8"), {
    __dirname: path.dirname(source), Buffer, URL, console,
    setInterval: () => ({ unref() {} }),
    process: { env: { SUPABASE_SERVICE_ROLE_KEY: "fixture", RAZORPAY_KEY_ID: "fixture", RAZORPAY_KEY_SECRET: secret } },
    require(name) {
      if (name === "express") return Object.assign(() => application, { static() {} });
      if (name === "dotenv") return { config() {} };
      if (name === "razorpay") return class {
        orders = { create: async data => {
          const id = "order_" + gateway.size;
          gateway.set(id, data.amount);
          return { id, amount: data.amount };
        } };
        payments = { fetch: async id => {
          const orderId = id.replace("pay_", "order_");
          return { order_id: orderId, status: "captured", currency: "INR", amount: gateway.get(orderId) };
        } };
      };
      return load(name);
    },
    async fetch(input, options) {
      const url = new URL(input);
      if (url.pathname === "/auth/v1/user") {
        return options.headers.Authorization === "Bearer account" ? Response.json({ id: "customer-uid" }) : Response.json({}, { status: 401 });
      }
      const table = records[url.pathname.split("/").pop()];
      if (options.method === "POST") {
        const row = JSON.parse(options.body);
        table.set(row.id, row.data);
        return Response.json([row]);
      }
      const id = url.searchParams.get("id")?.slice(3);
      return Response.json(table.has(id) ? [{ id, data: table.get(id) }] : []);
    }
  }, { filename: source });
  return {
    records,
    async call(route, body, authorization) {
      const handlers = routes.get(route);
      const result = { code: 200 };
      const req = { body, headers: { authorization } };
      const res = { status(code) { result.code = code; return this; }, json(data) { result.data = data; } };
      let pending;
      await handlers[0](req, res, () => { pending = handlers[1](req, res); });
      await pending;
      return result;
    }
  };
}

test("guest and account payments persist with the correct ownership and require payment verification", async () => {
  const { call, records } = checkoutHarness();
  for (const auth of [undefined, "Bearer account"]) {
    const create = await call("/create-order", { customer, cart: [{ id: product.id, qty: 1, price: 1 }] }, auth);
    assert.equal(create.code, 200);
    assert.equal(create.data.amount, 15500);
    const orderId = create.data.id;
    const paymentId = orderId.replace("order_", "pay_");
    const signature = crypto.createHmac("sha256", secret).update(orderId + "|" + paymentId).digest("hex");
    const body = { checkoutToken: create.data.checkoutToken, orderData: { customer, order_id: orderId, payment_id: paymentId, signature } };
    const wrongAuth = auth ? undefined : "Bearer account";
    assert.equal((await call("/save-order", body, wrongAuth)).code, 400);
    assert.equal((await call("/save-order", { ...body, orderData: { ...body.orderData, signature: "bad" } }, auth)).code, 400);
    assert.equal((await call("/save-order", { ...body, orderData: { ...body.orderData, customer: { ...customer, address: "Changed" } } }, auth)).code, 400);
    assert.equal((await call("/save-order", body, auth)).code, 200);
    assert.equal((await call("/save-order", body, auth)).code, 200);
    assert.equal(records.orders.get(orderId).guest, !auth);
    assert.equal(records.orders.get(orderId).userid, auth ? "customer-uid" : null);
    assert.equal(records.orders.get(orderId).items[0].price, 100);
  }
  assert.equal((await call("/create-order", { customer, cart: [] }, "Bearer invalid")).code, 401);
  assert.equal((await call("/my-orders", {})).code, 401);
});
