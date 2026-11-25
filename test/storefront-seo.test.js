const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createStorefrontSeo, pages, categories } = require("../seo-storefront");

const origin = "https://ermunaiorganicfarmfoods.com";
const fixtures = {
  products: [
    { id: "adai", data: { name: "Millet Adai", category: "readyToCookMixes", price: 150, stock: 2, quantityValue: 500, quantityType: "g", description: "Unapproved claim" } },
    { id: "combo-pack", data: { name: "Combo Pack", category: "combo", price: 1200, stock: 2 } },
    { id: "disabled", data: { name: "Hidden", disabled: true } },
    { id: "unlisted", data: { name: "Unlisted", category: "instantSoup", price: 75, stock: 0 } }
  ],
  blogs: [
    { id: "post", data: { title: "Millet Guide", slug: "millet-guide", content: "<p>Read about millet.</p>", status: "published" } },
    { id: "draft", data: { title: "Draft", status: "draft" } }
  ],
  settings: [
    { id: "seo.global", data: { verification: "fixture-verification" } },
    { id: "seo.product:unlisted", data: { index: false } },
    { id: "seo.product:adai", data: { title: "Millet Adai Mix", slug: "adai-mix" } },
    { id: "seo.redirects", data: { "/redirect/old": "/shop", "/redirect/invalid": "//example.com" } }
  ]
};

function createHandler(fetchData) {
  return createStorefrontSeo({
    supabaseUrl: "https://database.invalid",
    publicKey: "fixture-key",
    fetchData: fetchData || (async url => {
      const table = new URL(url).pathname.split("/").pop();
      return Response.json(fixtures[table]);
    })
  });
}

async function request(handler, url) {
  const result = { code: 200, headers: {} };
  const res = {
    redirect(code, location) { result.code = code; result.location = location; },
    status(code) { result.code = code; return this; },
    send(body) { result.body = body; return this; },
    type(type) { result.type = type; return this; },
    set(key, value) { result.headers[key] = value; return this; }
  };
  await handler({ method: "GET", url }, res, () => { result.code = 404; });
  return result;
}

test("public pages emit a single canonical, title and description", async () => {
  const handler = createHandler();
  for (const path of Object.keys(pages)) {
    const response = await request(handler, path);
    assert.equal(response.code, 200, path);
    assert.ok(response.body.includes('rel="canonical" href="' + origin + path + '"'));
    assert.equal([...response.body.matchAll(/<title>/g)].length, 1);
    assert.equal([...response.body.matchAll(/<meta name="description"/g)].length, 1);
    assert.match(response.body, /name="twitter:card"/);
    assert.match(response.body, /name="google-site-verification"/);
  }
});

test("category and product pages include crawlable information and schema", async () => {
  const handler = createHandler();
  for (const [slug] of Object.values(categories)) {
    const response = await request(handler, "/category/" + slug);
    assert.equal(response.code, 200);
    assert.match(response.body, /<h1/);
  }
  const combos = await request(handler, "/category/combo-offers");
  assert.match(combos.body, /Combo Pack/);
  const category = await request(handler, "/category/ready-to-cook-mixes");
  assert.match(category.body, /href="\/product\/adai-mix--adai"/);
  const product = await request(handler, "/product/adai-mix--adai");
  assert.match(product.body, /<h1[^>]*>Millet Adai<\/h1>/);
  assert.match(product.body, /500 g/);
  assert.doesNotMatch(product.body, /Unapproved claim|AggregateRating/);
  const data = [...product.body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)]
    .map(([, json]) => JSON.parse(json));
  assert.equal(data.find(item => item["@type"] === "Product").offers.price, 150);
  assert.equal(data.find(item => item["@type"] === "Product").offers.availability, "https://schema.org/InStock");
});

test("legacy URLs redirect and missing products and articles return 404", async () => {
  const handler = createHandler();
  const scenarios = {
    "/shop.html?category=combo": "/category/combo-offers",
    "/shop.html?category=idliPodi": "/category/idli-podi",
    "/shop.html?search=millet": "/shop?search=millet",
    "/product.html?id=adai": "/product/adai-mix--adai",
    "/product/old-name--adai": "/product/adai-mix--adai",
    "/blog.html?post=millet-guide": "/blog/millet-guide",
    "/redirect/old": "/shop"
  };
  for (const [from, to] of Object.entries(scenarios)) {
    const response = await request(handler, from);
    assert.equal(response.code, 301);
    assert.equal(response.location, to);
  }
  for (const path of ["/product.html?id=disabled", "/blog/draft", "/category/unknown", "/redirect/invalid"]) {
    assert.equal((await request(handler, path)).code, 404);
  }
});

test("sitemap excludes drafts, empty categories and noindex entries", async () => {
  const handler = createHandler();
  const sitemap = await request(handler, "/sitemap.xml");
  assert.equal(sitemap.type, "application/xml");
  assert.match(sitemap.body, /\/blog\/millet-guide/);
  assert.match(sitemap.body, /\/category\/combo-offers/);
  assert.match(sitemap.body, /\/product\/adai-mix--adai/);
  assert.doesNotMatch(sitemap.body, /draft|unlisted|disabled|herbal-products|checkout/);
  for (const [, url] of sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const response = await request(handler, url);
    assert.equal(response.code, 200, url);
    assert.equal(response.headers["X-Robots-Tag"], "index, follow", url);
  }
  const article = await request(handler, "/blog/millet-guide");
  assert.match(article.body, /"@type":"Article"/);
  assert.match(article.body, /Read about millet/);
  const search = await request(handler, "/shop?search=millet");
  assert.equal(search.headers["X-Robots-Tag"], "noindex, follow");
});

test("catalog failures return a retryable HTTP response", async () => {
  const handler = createHandler(async () => new Response("", { status: 503 }));
  const response = await request(handler, "/sitemap.xml");
  assert.equal(response.code, 503);
  assert.equal(response.headers["Retry-After"], "60");
});
