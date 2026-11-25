const fs = require("node:fs/promises");
const path = require("node:path");

const origin = "https://ermunaiorganicfarmfoods.com";
const brand = "Ermunai Organic Farm Foods";
const pages = {
  "/": ["index.html", "Traditional South Indian Food Online", "Shop millet mixes, idli podis and instant soups from Ermunai Organic Farm Foods in Chennai."],
  "/shop": ["shop.html", "Shop Millet Mixes & Traditional Foods", "Browse ready-to-cook millet mixes, traditional idli podis, instant soups and ready-to-serve foods."],
  "/about-us": ["about.html", "About Ermunai Organic Farm Foods in Chennai", "Learn how Ermunai brings native grains and traditional recipes to everyday kitchens."],
  "/contact-us": ["contact.html", "Contact Ermunai Organic Farm Foods in Chennai", "Contact our team in Madipakkam, Chennai, for product enquiries, orders and customer support."],
  "/blog": ["blog.html", "Millet Recipes & Traditional Food Blog", "Explore recipes, ingredient guides and food stories from Ermunai Organic Farm Foods."],
  "/certifications": ["feedback.html", "Certifications & Customer Feedback", "View Ermunai Organic Farm Foods business credentials and customer feedback."],
  "/privacy-policy.html": ["privacy-policy.html", "Privacy Policy", "Learn how Ermunai Organic Farm Foods handles personal information and online orders."],
  "/terms-and-conditions.html": ["terms-and-conditions.html", "Terms and Conditions", "Read the terms for using the Ermunai Organic Farm Foods store and placing orders."],
  "/shipping-policy.html": ["shipping-policy.html", "Shipping Policy", "Find delivery times, shipping charges and order tracking information."],
  "/cancellation-and-refund-policy.html": ["cancellation-and-refund-policy.html", "Cancellation and Refund Policy", "Read the cancellation, return and refund terms for Ermunai orders."]
};
const categories = {
  readyToCookMixes: ["ready-to-cook-mixes", "Ready-to-Cook Millet & Instant Mixes", "Discover South Indian ready-to-cook mixes for pongal, dosa, upma and more."],
  instantSoup: ["instant-soup-mixes", "Instant Soup Mixes", "Browse instant South Indian soup mixes for convenient preparation at home."],
  idliPodi: ["idli-podi", "Traditional Idli Podi", "Shop South Indian podis to serve with idli, dosa and rice."],
  instant: ["instant-foods", "Instant Food Products", "Explore instant products inspired by traditional South Indian recipes."],
  combo: ["combo-offers", "Combo Offers", "Explore product bundles from Ermunai Organic Farm Foods."],
  readytoserve: ["ready-to-serve", "Ready-to-Serve Foods", "Browse ready-to-serve snacks and foods inspired by Tamil recipes."],
  herbal: ["herbal-products", "Traditional Herbal Products", "Explore traditional herbal products and check each listing for its intended use."]
};

const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[ch]);
const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const absolute = value => {
  try {
    const url = new URL(value || "/images/logo.jpg", origin);
    return url.protocol === "https:" ? url.href : origin + "/images/logo.jpg";
  } catch {
    return origin + "/images/logo.jpg";
  }
};
const productPath = item => "/product/" + (slug(item.name) || "item") + "--" + encodeURIComponent(item.id);
const blogPath = item => "/blog/" + encodeURIComponent(item.slug || item.id);
const schema = data => '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, "\\u003c") + "</script>";
const text = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const list = (items, link) => "<ul>" + items.map(item =>
  '<li><a class="underline" href="' + escape(link(item)) + '">' + escape(item.name || item.title) + "</a>" +
  (Number.isFinite(item.price) ? " · ₹" + escape(item.price) : "") + "</li>"
).join("") + "</ul>";

function createStorefrontSeo({ supabaseUrl, publicKey, fetchData = fetch, loadTemplate = file => fs.readFile(path.join(__dirname, file), "utf8") }) {
  async function rows(table, filter = "") {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const response = await fetchData(
        supabaseUrl + "/rest/v1/" + table + "?select=id,data&order=id&limit=500&offset=" + offset + filter,
        { headers: { apikey: publicKey }, signal: AbortSignal.timeout(5000) }
      );
      if (!response.ok) throw new Error("Catalog returned " + response.status);
      const batch = await response.json();
      result.push(...batch.map(row => ({ ...row.data, id: row.id })));
      if (batch.length < 500) return result;
    }
  }

  return async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    const url = new URL(req.originalUrl || req.url, origin);
    const route = url.pathname.replace(/\/$/, "") || "/";
    const alias = {
      "/index.html": "/", "/about": "/about-us", "/about.html": "/about-us",
      "/contact": "/contact-us", "/contact.html": "/contact-us", "/feedback": "/certifications",
      "/feedback.html": "/certifications", "/privacy.html": "/privacy-policy.html",
      "/shipping.html": "/shipping-policy.html", "/terms.html": "/terms-and-conditions.html",
      "/privacy-policy": "/privacy-policy.html", "/shipping-policy": "/shipping-policy.html",
      "/terms-and-conditions": "/terms-and-conditions.html",
      "/cancellation-and-refund-policy": "/cancellation-and-refund-policy.html"
    };
    const redirect = destination => res.redirect(301, destination);
    if (Object.hasOwn(alias, route)) return redirect(alias[route] + url.search);
    if (route === "/shop.html" && !url.searchParams.has("category")) return redirect("/shop" + url.search);
    if (route === "/blog.html" && !url.searchParams.has("post")) return redirect("/blog" + url.search);
    const category = Object.entries(categories).find(([key, value]) =>
      route === "/category/" + value[0] ||
      (["/shop", "/shop.html"].includes(route) && url.searchParams.get("category") === key && !url.searchParams.has("search"))
    );
    if (route === "/shop.html" && !category) return redirect("/shop" + url.search);
    if (category && !route.startsWith("/category/")) {
      url.searchParams.delete("category");
      return redirect("/category/" + category[1][0] + url.search);
    }
    const productRoute = route === "/product.html" || route.startsWith("/product/");
    const articleRoute = route === "/blog.html" || route.startsWith("/blog/");
    const sitemap = route === "/sitemap.xml";
    const page = Object.hasOwn(pages, route) ? pages[route] : null;
    const unknown = !page && !category && !productRoute && !articleRoute && !sitemap;
    if (unknown && (!/^\/[a-z0-9][a-z0-9./_-]*$/i.test(route) ||
      /^\/(?:admin|js|css|images)(?:\/|$)/.test(route) ||
      /\.(?!html$)[a-z0-9]+$/i.test(route) ||
      ["/health", "/public-config", "/robots.txt", "/google850a8c5c908f6843.html", "/login.html",
        "/signup.html", "/cart.html", "/checkout.html", "/purchase.html", "/thankyou.html"].includes(route))) return next();

    try {
      const [productRows, blogRows, settings] = await Promise.all([
        (sitemap || productRoute || category || ["/", "/shop"].includes(route)) ? rows("products") : [],
        (sitemap || articleRoute || route === "/blog") ? rows("blogs") : [],
        rows("settings", "&id=like.seo.*")
      ]);
      const seo = Object.fromEntries(settings.map(row => [row.id.slice(4), row]));
      const products = productRows.filter(item => !item.disabled);
      const blogs = blogRows.filter(item => (item.status || "published") === "published");
      const config = key => Object.hasOwn(seo, key) ? seo[key] || {} : {};
      const productUrl = item => productPath({ ...item, name: config("product:" + item.id).slug || item.name });
      const articleUrl = item => blogPath({ ...item, slug: slug(config("blog:" + item.id).slug) || item.slug });
      if (unknown) {
        const target = config("redirects")[route];
        if (typeof target === "string" && /^\/(?:[a-z0-9][a-z0-9./_-]*)?$/i.test(target) &&
          !Object.hasOwn(config("redirects"), target) && !target.split("/").includes("..")) return redirect(target);
        return res.status(404).send("Page not found.");
      }
      const indexable = (key, canonical = key) => config(key).index !== false &&
        (!config(key).canonical || absolute(config(key).canonical) === origin + canonical);
      if (sitemap) {
        const urls = [
          ...Object.keys(pages).filter(key => indexable(key)),
          ...Object.values(categories).map(([key]) => "/category/" + key)
            .filter(key => indexable(key) && products.some(item => "/category/" + categories[item.category]?.[0] === key)),
          ...products.filter(item => indexable("product:" + item.id, productUrl(item))).map(productUrl),
          ...blogs.filter(item => indexable("blog:" + item.id, articleUrl(item))).map(articleUrl)
        ];
        return res.type("application/xml").send('<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          urls.map(url => "<url><loc>" + escape(origin + url) + "</loc></url>").join("") + "</urlset>");
      }

      let canonical = route;
      let key = route;
      let [file, title, description] = page || [];
      let image;
      let structured = [];
      let content = "";
      let routeState = {};
      let noindex = url.searchParams.has("search");
      if (productRoute) {
        const id = url.searchParams.get("id");
        const item = products.find(item => route === "/product.html" ? item.id === id : productUrl(item) === route ||
          route.endsWith("--" + encodeURIComponent(item.id)));
        if (!item) return res.status(404).send("Product not found.");
        canonical = productUrl(item);
        if (route !== canonical) return redirect(canonical);
        key = "product:" + item.id;
        file = "product.html";
        title = "Buy " + item.name + " Online";
        const pack = item.quantityValue && item.quantityType ? item.quantityValue + " " + item.quantityType : "";
        description = (item.descriptionReviewed && text(item.description).slice(0, 155)) ||
          ("Shop " + item.name + (pack ? " (" + pack + ")" : "") + ". Find price, pack details and delivery information.").slice(0, 160);
        image = absolute(item.images?.[0] || item.image);
        routeState.productId = item.id;
        const stock = Number(item.stock || 0) > 0;
        const variant = Array.isArray(item.variants) && item.variants.find(option => option.name || option.weight || option.price);
        const price = Number(variant?.price ?? item.price ?? item.amount);
        structured.push({
          "@context": "https://schema.org", "@type": "Product", name: item.name, image, description,
          sku: item.id, brand: { "@type": "Brand", name: brand },
          ...(Number.isFinite(price) && price >= 0 ? { offers: {
            "@type": "Offer", url: origin + canonical, priceCurrency: "INR", price,
            availability: "https://schema.org/" + (stock ? "InStock" : "OutOfStock")
          } } : {})
        });
        content = '<h1 class="text-3xl font-bold">' + escape(item.name) + "</h1><p>" +
          (Number.isFinite(price) ? "₹" + escape(price) + " · " : "") + (stock ? "In stock" : "Out of stock") +
          "</p><p>" + escape(description) + "</p>" +
          '<img width="280" height="280" class="object-contain" src="' + escape(image) + '" alt="' +
          escape(config(key).alt || [item.name, pack].filter(Boolean).join(" ")) + '">' +
          Object.entries({ "Pack size": pack, Ingredients: item.ingredients, Preparation: item.preparation,
            Allergens: item.allergens, Storage: item.storage, "Shelf life": item.shelfLife })
            .filter(([, value]) => value).map(([label, value]) => "<p><strong>" + escape(label) + "</strong> " + escape(value) + "</p>").join("") +
          "<h2>Related products</h2>" + list(products.filter(other => other.id !== item.id && other.category === item.category).slice(0, 4), productUrl);
      } else if (category) {
        const [categoryKey, [categorySlug, label, summary]] = category;
        canonical = "/category/" + categorySlug;
        key = canonical;
        file = "shop.html";
        title = label;
        description = summary;
        routeState.category = categoryKey;
        const items = products.filter(item => item.category === categoryKey);
        noindex ||= !items.length;
        content = "<h2>Products</h2>" + list(items, productUrl);
      } else if (articleRoute) {
        const post = route === "/blog.html" ? url.searchParams.get("post") : route.split("/")[2];
        if (!post || (route !== "/blog.html" && route.split("/").length !== 3)) {
          return res.status(404).send("Article not found.");
        }
        const item = blogs.find(item => item.slug === post || item.id === post || slug(config("blog:" + item.id).slug) === post || config("blog:" + item.id).oldSlugs?.includes(post));
        if (!item) return res.status(404).send("Article not found.");
        canonical = articleUrl(item);
        if (route !== canonical) return redirect(canonical);
        key = "blog:" + item.id;
        routeState.blogId = item.id;
        file = "blog.html";
        title = item.title;
        description = text(item.seoDescription || item.desc || item.description || item.excerpt || item.content).slice(0, 160);
        image = absolute(item.image || item.coverImage);
        content = "<article><h1>" + escape(title) + "</h1><p>" + escape(text(item.content || description)) + "</p></article>";
        structured.push({
          "@context": "https://schema.org", "@type": "Article", headline: title, description, image,
          mainEntityOfPage: origin + canonical, publisher: { "@type": "Organization", name: brand },
          ...(item.publishedAt ? { datePublished: item.publishedAt } : {})
        });
      } else if (route === "/" || route === "/shop") {
        content = "<h2>Traditional Food Categories</h2>" +
          list(Object.values(categories).map(([slug, name]) => ({ slug, name })), item => "/category/" + item.slug) +
          "<h2>Shop the Catalog</h2>" + list(route === "/" ? products.slice(0, 8) : products, productUrl);
      } else if (route === "/blog") {
        content = "<h1>Millet Recipes &amp; Traditional Food Guides</h1>" + list(blogs, articleUrl);
      }
      const cfg = config(key);
      const fullTitle = cfg.title || title + " | " + brand;
      const summary = cfg.description || description;
      const canonicalUrl = cfg.canonical ? absolute(cfg.canonical) : origin + canonical;
      if (url.pathname !== route) return redirect(route + url.search);
      const robots = noindex || cfg.index === false ? "noindex, follow" : "index, follow";
      const meta = (name, value, attr = "name") => "<meta " + attr + '="' + name + '" content="' + escape(value) + '">';
      const global = config("global");
      let tags = "<title>" + escape(fullTitle) + "</title>" +
        '<link rel="canonical" href="' + escape(canonicalUrl) + '">' +
        meta("description", summary) + meta("robots", robots) +
        meta("og:title", cfg.ogTitle || fullTitle, "property") +
        meta("og:description", cfg.ogDescription || summary, "property") +
        meta("og:image", absolute(cfg.image || image || global.image), "property") +
        meta("og:url", canonicalUrl, "property") +
        meta("og:type", productRoute ? "product" : articleRoute ? "article" : "website", "property") +
        meta("twitter:card", "summary_large_image");
      if (global.verification) tags += meta("google-site-verification", global.verification);
      if (canonical !== "/") structured.push({
        "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
          { "@type": "ListItem", position: 2, name: title, item: canonicalUrl }
        ]
      });
      if (route === "/contact-us") structured.push({
        "@context": "https://schema.org", "@type": "LocalBusiness", name: brand, url: origin + "/",
        telephone: "+919841231996",
        address: { "@type": "PostalAddress", streetAddress: "Plot No. 5, 1/328, Sabari Salai, Ayyappan Nagar, Madipakkam",
          postalCode: "600091", addressLocality: "Chennai", addressRegion: "Tamil Nadu", addressCountry: "IN" }
      });
      tags += structured.map(schema).join("");
      const state = { ...routeState, managed: true, alt: cfg.alt, analytics: global.analytics };
      tags += "<script>window.storefrontSeo=" + JSON.stringify(state).replace(/</g, "\\u003c") + "</script>";
      let html = (await loadTemplate(file))
        .replace(/<title>[\s\S]*?<\/title>|<link\s+rel="canonical"[^>]*>|<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/gi, "")
        .replace(/<head>/i, () => '<head><base href="/">' + tags);
      html = html.replace(/href="(?:\.\/)?([^"#?]+\.html)"/g, (link, file) => {
        const match = Object.entries(pages).find(([, page]) => page[0] === file);
        return match ? 'href="' + match[0] + '"' : link;
      });
      if (category) html = html.replace(/(<h1[^>]*>)[\s\S]*?<\/h1>/i, (_, start) => start + escape(title) + "</h1>")
        .replace(/(<h1[^>]*>[\s\S]*?<\/h1>)[\s\S]*?<p[^>]*>[\s\S]*?<\/p>/i, (_, heading) => heading + "<p>" + escape(description) + "</p>");
      if (content) html = html.replace("</main>", () => '<section id="crawlableStorefront" class="max-w-7xl mx-auto px-5 py-10">' + content + "</section></main>");
      res.set("X-Robots-Tag", robots);
      return res.type("html").send(html);
    } catch (error) {
      console.error("Storefront SEO rendering failed:", error.message);
      return res.status(503).set("Retry-After", "60").send("This page is temporarily unavailable. Please try again shortly.");
    }
  };
}

module.exports = { createStorefrontSeo, pages, categories };
