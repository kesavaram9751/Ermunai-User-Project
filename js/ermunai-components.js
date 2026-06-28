export const formatCurrency = (value) => `₹${Number(value || 0).toFixed(Number.isInteger(Number(value || 0)) ? 0 : 2)}`;

export function installStorefrontEnhancements() {
  if (document.documentElement.dataset.eoEnhanced === "true") return;
  document.documentElement.dataset.eoEnhanced = "true";

  const style = document.createElement("style");
  style.textContent = `
    .eo-skip-link {
      position: fixed;
      left: 16px;
      top: 12px;
      z-index: 9999;
      transform: translateY(-140%);
      background: #0d631b;
      color: #fff;
      border-radius: 8px;
      padding: 10px 14px;
      font: 800 13px/1.2 "Plus Jakarta Sans", Arial, sans-serif;
      transition: transform .18s ease;
    }
    .eo-skip-link:focus { transform: translateY(0); outline: 3px solid #a3f69c; outline-offset: 2px; }
    :where(a, button, input, select, textarea):focus-visible {
      outline: 3px solid rgba(13, 99, 27, .36);
      outline-offset: 3px;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: .01ms !important;
      }
    }
  `;
  document.head.appendChild(style);

  if (!document.querySelector(".eo-skip-link")) {
    const skip = document.createElement("a");
    skip.className = "eo-skip-link";
    skip.href = "#mainContent";
    skip.textContent = "Skip to content";
    document.body.prepend(skip);
  }

  const ensureMainId = () => {
    const main = document.querySelector("main");
    if (main && !main.id) main.id = "mainContent";
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureMainId, { once: true });
  else ensureMainId();

  document.addEventListener("error", event => {
    const target = event.target;
    if (target?.tagName === "IMG" && !target.dataset.fallbackApplied) {
      target.dataset.fallbackApplied = "true";
      target.src = "./images/logo.jpg";
    }
  }, true);
}

export function renderInto(target, items, component) {
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) return;
  element.innerHTML = (items || []).map(component).join("");
}

export function getProductImages(product) {
  const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
  if (product?.image && !images.includes(product.image)) images.unshift(product.image);
  return images;
}

export function getMainProductImage(product, fallback = "./images/logo.jpg") {
  return getProductImages(product)[0] || fallback;
}

export function mountStorefrontHeader(target = "siteHeader", options = {}) {
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) return;
  installStorefrontEnhancements();

  const active = options.active || "";
  const links = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "shop", label: "Shop", href: "shop.html" },
    { id: "about", label: "Our Story", href: "about.html" },
    { id: "blog", label: "Blog", href: "blog.html" },
    { id: "feedback", label: "Certifications", href: "feedback.html" },
    { id: "contact", label: "Contact", href: "contact.html" }
  ];

  const desktopLink = link => {
    const activeClass = link.id === active
      ? "font-bold text-sm text-primary border-b-2 border-primary pb-1"
      : "font-semibold text-sm text-on-surface-variant hover:text-primary transition-colors";
    return `<a class="${activeClass}" href="${link.href}">${link.label}</a>`;
  };

  const mobileLink = link => {
    const activeClass = link.id === active ? "font-bold text-primary" : "font-semibold text-on-surface-variant";
    return `<a class="${activeClass}" href="${link.href}">${link.label}</a>`;
  };

  element.innerHTML = `
    <style>
      [data-storefront-header] {
        box-sizing: border-box;
        background: rgba(251, 249, 243, 0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        font-family: "Plus Jakarta Sans", Arial, sans-serif;
        line-height: 1.5;
        text-align: left;
      }
      [data-storefront-header] *,
      [data-storefront-header] *::before,
      [data-storefront-header] *::after {
        box-sizing: border-box;
      }
      [data-storefront-header] a {
        text-decoration: none;
      }
      [data-storefront-header] a:hover {
        text-decoration: none;
      }
      [data-storefront-header] img {
        display: block;
        max-width: 100%;
      }
      [data-storefront-header] button {
        appearance: none;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        margin: 0;
      }
      @media (max-width: 640px) {
        [data-storefront-header] .brand-name { display: none; }
      }
    </style>
    <nav class="fixed top-0 w-full z-50 glass-nav border-b border-glass-stroke" data-storefront-header>
      <div class="flex justify-between items-center px-6 py-4 max-w-7xl mx-auto">
        <a class="flex items-center gap-3 cursor-pointer" href="index.html">
          <img class="w-10 h-10 rounded-full object-cover border border-glass-stroke" src="./images/logo.jpg" alt="Ermunai Organic logo"/>
          <span class="brand-name text-xl font-extrabold text-primary tracking-tight">Ermunai Organic Farm & Foods</span>
        </a>
        <div class="hidden md:flex gap-8 items-center">
          ${links.map(desktopLink).join("")}
          <a id="dashboardLink" class="font-semibold text-sm text-on-surface-variant hover:text-primary transition-colors hidden" href="purchase.html">Dashboard</a>
        </div>
        <div class="flex items-center gap-4">
          <a class="relative text-on-surface-variant hover:text-primary p-2 transition-transform active:scale-95 duration-150" href="cart.html" aria-label="Cart">
            <span class="material-symbols-outlined text-[26px]">shopping_cart</span>
            <span id="cartCount" class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">0</span>
          </a>
          <div id="authLinks" class="flex items-center gap-3">
            <a class="hidden sm:inline-block font-semibold text-sm text-on-surface-variant hover:text-primary" href="login.html">Login</a>
            <a class="bg-primary text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:opacity-90 transition-all active:scale-95 shadow-sm" href="signup.html">Sign Up</a>
          </div>
          <div id="userProfile" class="items-center gap-3 hidden">
            <a href="purchase.html" class="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center border border-glass-stroke text-sm" id="userAvatar">EO</a>
            <button id="logoutBtn" class="text-on-surface-variant hover:text-error text-sm font-semibold flex items-center gap-1" type="button" aria-label="Logout">
              <span class="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
          <button id="mobileMenuBtn" class="md:hidden text-on-surface-variant hover:text-primary p-2" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobileMenu">
            <span class="material-symbols-outlined text-[26px]">menu</span>
          </button>
        </div>
      </div>
      <div id="mobileMenu" class="hidden md:hidden bg-surface border-t border-glass-stroke px-6 py-4 flex flex-col gap-4">
        ${links.map(mobileLink).join("")}
        <a id="mobileDashboardLink" class="font-semibold text-on-surface-variant hidden" href="purchase.html">Dashboard</a>
      </div>
    </nav>`;

  const button = element.querySelector("#mobileMenuBtn");
  const menu = element.querySelector("#mobileMenu");
  button?.addEventListener("click", () => {
    const isOpen = !menu.classList.toggle("hidden");
    button.setAttribute("aria-expanded", String(isOpen));
  });

}

export function mountStorefrontFooter(target = "siteFooter", options = {}) {
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) return;

  const year = options.year || new Date().getFullYear();
  const phone = options.phone || "+91 98412 31996 / +91 98407 52833";
  const email = options.email || "info@ermunaiorganicfarmfoods.com";
  const address = options.address || "Manufacturing Unit: Plot No. 5, 1/328, Sabari Salai, Ayyappan Nagar, Madipakkam, Chennai - 600091.";
  const gstin = options.gstin || "33AKAPR8721K1ZZ";
  const fssai = options.fssai || "12425008002307";
  const whatsappNumber = String(options.whatsappNumber || "919841231996").replace(/\D/g, "");
  const whatsappMessage = encodeURIComponent(options.whatsappMessage || "Hello Ermunai Organic, I need help with your products.");

  element.innerHTML = `
    <footer class="bg-surface-container-highest border-t border-glass-stroke mt-16" data-storefront-footer>
      <style>
        [data-storefront-footer] { background: #e4e2dd; border-top: 1px solid rgba(46, 125, 50, 0.12); margin-top: 4rem; color: #1b1c19; font-family: "Plus Jakarta Sans", Arial, sans-serif; font-size: 16px; line-height: 1.5; padding: 0; text-align: left; }
        [data-storefront-footer] *, [data-storefront-footer] *::before, [data-storefront-footer] *::after { box-sizing: border-box; }
        [data-storefront-footer] a { color: inherit; text-decoration: none; }
        [data-storefront-footer] a:hover { color: #0d631b; text-decoration: none; }
        [data-storefront-footer] .footer-shell { max-width: 1280px; margin: 0 auto; padding: 80px 20px; }
        [data-storefront-footer] .footer-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px; margin-bottom: 48px; }
        [data-storefront-footer] h3 { color: #0d631b; font-size: 1.5rem; line-height: 1.2; margin: 0 0 1.5rem; text-align: left; }
        [data-storefront-footer] h4 { color: #0d631b; font-size: .75rem; line-height: 1.2; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 1.5rem; text-align: left; }
        [data-storefront-footer] p, [data-storefront-footer] li { color: #40493d; line-height: 1.7; margin: 0; text-align: left; }
        [data-storefront-footer] ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .75rem; }
        [data-storefront-footer] .footer-bottom { border-top: 1px solid rgba(46, 125, 50, 0.12); padding-top: 2rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
        [data-storefront-footer] .footer-legal { display: flex; flex-wrap: wrap; gap: 1.5rem; }
        [data-storefront-footer] .footer-social { display: grid; gap: .85rem; margin-bottom: 1.5rem; }
        [data-storefront-footer] .footer-social a { color: #40493d; display: inline-flex; align-items: center; gap: .6rem; font-size: .95rem; font-weight: 800; }
        [data-storefront-footer] .footer-social a:hover { color: #0d631b; }
        [data-storefront-footer] .footer-social-icon { width: 20px; color: #0d631b; display: inline-flex; justify-content: center; font-weight: 900; }
        [data-storefront-footer] .footer-license { border: 1px solid rgba(46, 125, 50, 0.12); background: rgba(255,255,255,.5); border-radius: 12px; padding: 1rem; }
        [data-storefront-footer] .whatsapp-float { position: fixed; right: 24px; bottom: 24px; z-index: 1000; width: 64px; height: 64px; border-radius: 999px; background: #25d366; color: #fff; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 18px 40px rgba(0,0,0,.22); transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
        [data-storefront-footer] .whatsapp-float:hover { color: #fff; background: #1ebe5d; transform: translateY(-3px); box-shadow: 0 22px 46px rgba(0,0,0,.26); }
        [data-storefront-footer] .whatsapp-float svg { width: 34px; height: 34px; display: block; }
        [data-storefront-footer] .whatsapp-float-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @media (max-width: 640px) { [data-storefront-footer] .whatsapp-float { right: 16px; bottom: 16px; width: 56px; height: 56px; } [data-storefront-footer] .whatsapp-float svg { width: 30px; height: 30px; } }
        @media (max-width: 860px) { [data-storefront-footer] .footer-grid { grid-template-columns: 1fr; } [data-storefront-footer] .footer-bottom { align-items: flex-start; } }
      </style>
      <a class="whatsapp-float" href="https://wa.me/${whatsappNumber}?text=${whatsappMessage}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
        <span class="whatsapp-float-label">Chat with us on WhatsApp</span>
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M16.04 4.5c-6.32 0-11.46 5.1-11.46 11.37 0 2.15.61 4.24 1.77 6.04L4.5 27.5l5.84-1.82a11.56 11.56 0 0 0 5.7 1.5c6.32 0 11.46-5.1 11.46-11.37S22.36 4.5 16.04 4.5Zm0 20.72c-1.78 0-3.51-.5-5.02-1.44l-.37-.23-3.15.98 1-3.02-.25-.39a9.18 9.18 0 0 1-1.7-5.25c0-5.19 4.25-9.41 9.49-9.41s9.49 4.22 9.49 9.41-4.25 9.35-9.49 9.35Zm5.22-7.01c-.28-.14-1.66-.81-1.92-.9-.26-.1-.45-.14-.64.14-.19.28-.74.9-.91 1.09-.17.19-.34.21-.62.07-.28-.14-1.19-.43-2.26-1.39-.83-.74-1.39-1.65-1.56-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.34.43-.51.14-.17.19-.28.28-.47.09-.19.05-.36-.02-.5-.07-.14-.64-1.53-.88-2.1-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.36-.26.28-1 1-1 2.44 0 1.44 1.05 2.83 1.2 3.02.14.19 2.07 3.13 5.01 4.39.7.3 1.25.48 1.68.61.7.22 1.34.19 1.85.12.56-.08 1.66-.67 1.9-1.32.24-.65.24-1.2.17-1.32-.07-.12-.26-.19-.54-.33Z"/>
        </svg>
      </a>
      <div class="footer-shell px-margin-mobile md:px-margin-desktop py-stack-lg max-w-container-max mx-auto">
        <div class="footer-grid grid grid-cols-1 md:grid-cols-4 gap-gutter mb-12">
          <div>
            <h3 class="text-2xl font-bold text-primary mb-6">Ermunai Organic Farm & Foods</h3>
            <p class="text-sm text-on-surface-variant mb-6 leading-relaxed" id="footerAddress">${escapeHtml(address)}</p>
            <div class="space-y-3 text-sm text-on-surface-variant">
              <p><strong class="text-primary">Phone:</strong> <span id="footerPhone">${escapeHtml(phone)}</span></p>
              <p><strong class="text-primary">Email:</strong> <span id="footerEmail">${escapeHtml(email)}</span></p>
            </div>
          </div>
          <div>
            <h4 class="text-xs font-bold text-primary uppercase tracking-wider mb-6">Company</h4>
            <ul class="space-y-3 text-sm text-on-surface-variant font-semibold">
              <li><a class="hover:text-primary transition-colors" href="about.html">Our Story</a></li>
              <li><a class="hover:text-primary transition-colors" href="blog.html">Farm Blog</a></li>
              <li><a class="hover:text-primary transition-colors" href="feedback.html">Certifications & Feedback</a></li>
              <li><a class="hover:text-primary transition-colors" href="contact.html">Contact Us</a></li>
            </ul>
          </div>
          <div>
            <h4 class="text-xs font-bold text-primary uppercase tracking-wider mb-6">Products</h4>
            <ul class="space-y-3 text-sm text-on-surface-variant font-semibold">
              <li><a class="hover:text-primary transition-colors" href="shop.html?category=readyToCookMixes">Ready-to-cook Instant Mixes</a></li>
              <li><a class="hover:text-primary transition-colors" href="shop.html?category=instantSoup">Instant Soup Mix</a></li>
              <li><a class="hover:text-primary transition-colors" href="shop.html?category=idliPodi">Idli Podi's</a></li>
              <li><a class="hover:text-primary transition-colors" href="shop.html?category=instant">Instant Products</a></li>
              <li><a class="hover:text-primary transition-colors" href="shop.html?category=readytoserve">Ready to Serve</a></li>
              <li><a class="hover:text-primary transition-colors" href="shop.html?category=herbal">Herbal Products</a></li>
            </ul>
          </div>
          <div>
            <h4 class="text-xs font-bold text-primary uppercase tracking-wider mb-6">Follow Us</h4>
            <div class="footer-social flex gap-3 mb-6">
              <a href="https://www.facebook.com/ermunaiorganicfoods" target="_blank" rel="noopener" aria-label="Facebook"><span class="footer-social-icon">f</span>Facebook</a>
              <a href="https://www.instagram.com/ermunaiorganic" target="_blank" rel="noopener" aria-label="Instagram"><span class="footer-social-icon">◎</span>Instagram</a>
              <a href="https://www.linkedin.com/in/ermunai-organic-farm-217035363/" target="_blank" rel="noopener" aria-label="LinkedIn"><span class="footer-social-icon">in</span>LinkedIn</a>
              <a href="https://www.youtube.com/@ermunaiorganicfarm" target="_blank" rel="noopener" aria-label="YouTube"><span class="footer-social-icon">▶</span>YouTube</a>
            </div>
            <div class="footer-license p-4 bg-white/50 rounded-xl border border-glass-stroke">
              <div class="text-[10px] text-on-surface-variant font-bold uppercase">FSSAI License</div>
              <div class="text-xs font-bold text-on-surface mt-1">${escapeHtml(fssai)}</div>
            </div>
          </div>
        </div>
        <div class="footer-bottom pt-8 border-t border-glass-stroke flex flex-col md:flex-row justify-between items-center gap-4">
          <p class="text-xs text-on-surface-variant">© ${escapeHtml(year)} Ermunai Organic Farm Foods. All rights reserved. GSTIN: ${escapeHtml(gstin)}</p>
          <div class="footer-legal flex flex-wrap justify-center gap-6 text-xs text-on-surface-variant font-semibold">
            <a class="hover:text-primary transition-colors" href="privacy-policy.html">Privacy Policy</a>
            <a class="hover:text-primary transition-colors" href="terms-and-conditions.html">Terms of Service</a>
            <a class="hover:text-primary transition-colors" href="shipping-policy.html">Shipping Policy</a>
            <a class="hover:text-primary transition-colors" href="cancellation-and-refund-policy.html">Refund Policy</a>
          </div>
        </div>
      </div>
    </footer>`;

  if (options.loadRemoteFooter !== false) {
    loadStorefrontFooterSettings(element).catch(() => {});
  }
}

async function loadStorefrontFooterSettings(root) {
  const { initializeApp, getSupabase, doc, getDoc } = await import("../admin/supabase-compat.js");
  const db = getSupabase(initializeApp());
  const snap = await getDoc(doc(db, "settings", "homepage"));
  const footer = snap.exists() ? snap.data()?.footer || {} : {};
  const setFooterText = (id, value) => {
    const node = root.querySelector(`#${id}`);
    if (node && value) node.textContent = value;
  };
  setFooterText("footerAddress", footer.address);
  setFooterText("footerPhone", footer.phone);
  setFooterText("footerEmail", footer.email);
}

export function syncStorefrontAuth(user) {
  const authLinks = document.getElementById("authLinks");
  const userProfile = document.getElementById("userProfile");
  const dashboardLink = document.getElementById("dashboardLink");
  const mobileDashboardLink = document.getElementById("mobileDashboardLink");
  if (!authLinks || !userProfile) return;

  if (user) {
    localStorage.removeItem("cart_guest");
    localStorage.removeItem("cart_undefined");
    authLinks.classList.add("hidden");
    userProfile.classList.remove("hidden");
    userProfile.classList.add("flex");
    dashboardLink?.classList.remove("hidden");
    mobileDashboardLink?.classList.remove("hidden");
    const avatar = document.getElementById("userAvatar");
    if (avatar) {
      const name = user.displayName || (user.email ? user.email.split("@")[0] : "User");
      avatar.textContent = name.slice(0, 2).toUpperCase();
    }
  } else {
    authLinks.classList.remove("hidden");
    userProfile.classList.add("hidden");
    userProfile.classList.remove("flex");
    dashboardLink?.classList.add("hidden");
    mobileDashboardLink?.classList.add("hidden");
  }
}

export function getStorefrontUserId(user) {
  return user?.uid || user?.id || "";
}

export function getStorefrontCartKey(user) {
  const userId = getStorefrontUserId(user);
  return userId ? `cart_${userId}` : "";
}

export function readStorefrontCart(user) {
  const key = getStorefrontCartKey(user);
  if (!key) return [];
  try {
    const cart = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

export function writeStorefrontCart(user, cart) {
  const key = getStorefrontCartKey(user);
  if (!key) throw new Error("Login required before using cart.");
  localStorage.setItem(key, JSON.stringify(Array.isArray(cart) ? cart : []));
  return key;
}

export function productCard(product, options = {}) {
  const id = product.id || "";
  const name = product.name || "Product";
  const category = product.categoryLabel || product.category || "Organic";
  const price = product.price ?? product.amount ?? 0;
  const tag = product.tag || (product.featured ? "Featured" : (product.offer ? "Offer" : "Organic"));
  const stock = Number(product.stock ?? 0);
  const rating = product.rating || "4.8";
  const oldPrice = Number(product.oldPrice || product.mrp || 0);
  const discount = oldPrice > price && price > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const image = getMainProductImage(product);
  const addAction = options.addAction || `addToCart('${id}')`;
  const quickAction = options.quickAction || `window.location.href='product.html?id=${encodeURIComponent(id)}'`;
  
  return `
    <div class="glass-card group rounded-xl overflow-hidden shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-glass-stroke bg-white/80 backdrop-blur-md" data-product-id="${id}">
      <div class="relative h-60 overflow-hidden bg-surface-container-highest cursor-pointer" onclick="${quickAction}">
        <img class="w-full h-full object-contain p-6 transition-transform duration-500 group-hover:scale-105" src="${image}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">
        <div class="absolute top-4 left-4 flex flex-col gap-2">
          <span class="bg-primary text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">${escapeHtml(tag)}</span>
          ${discount ? `<span class="bg-[#b3261e] text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">${discount}% Off</span>` : ""}
          ${stock <= 0 ? `<span class="bg-error text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Out of Stock</span>` : ""}
        </div>
        <button class="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-primary shadow-sm flex items-center justify-center transition-transform active:scale-95" type="button" onclick="event.stopPropagation(); ${quickAction}" aria-label="Quick view ${escapeHtml(name)}">
          <span class="material-symbols-outlined text-[18px]">visibility</span>
        </button>
      </div>
      <div class="p-5 flex flex-col gap-3">
        <div>
          <span class="text-xs font-bold text-primary uppercase tracking-widest">${escapeHtml(category)}</span>
          <h3 class="text-headline-md font-bold text-on-surface hover:text-primary transition-colors cursor-pointer line-clamp-1 mt-1" onclick="${quickAction}">${escapeHtml(name)}</h3>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-baseline gap-2">
            <span class="text-xl font-extrabold text-earth-dark">${formatCurrency(price)}</span>
            ${oldPrice > price ? `<span class="text-xs line-through text-on-surface-variant">${formatCurrency(oldPrice)}</span>` : ""}
          </div>
          <div class="flex items-center gap-1 text-[#a66d12] text-sm font-bold">
            <span class="material-symbols-outlined text-sm font-fill" style="font-variation-settings: 'FILL' 1;">star</span>
            <span>${escapeHtml(String(rating))}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[10px] font-extrabold uppercase tracking-wider">
          <span class="rounded-full bg-primary/10 text-primary px-2.5 py-1">${stock > 0 ? "In Stock" : "Sold Out"}</span>
          <span class="rounded-full bg-[#6b4f45]/10 text-earth-dark px-2.5 py-1">Secure Pay</span>
        </div>
        <div class="grid grid-cols-5 gap-2 mt-2">
          <button class="col-span-4 bg-primary text-white font-bold py-2.5 px-4 rounded-lg hover:opacity-90 active:scale-95 transition-all text-sm flex items-center justify-center gap-2" type="button" onclick="${addAction}" ${stock <= 0 ? "disabled" : ""}>
            <span class="material-symbols-outlined text-sm">shopping_cart</span> Add
          </button>
          <button class="col-span-1 border border-outline-variant text-on-surface-variant hover:bg-surface-container-high rounded-lg flex items-center justify-center transition-all active:scale-95" type="button" onclick="${quickAction}" aria-label="Quick view">
            <span class="material-symbols-outlined text-sm">visibility</span>
          </button>
        </div>
      </div>
    </div>`;
}

export function categoryCard(category) {
  const link = category.link || `shop.html?category=${category.category || ""}`;
  return `
    <a href="${link}" class="group relative overflow-hidden rounded-xl h-64 bento-card shadow-md block border border-glass-stroke">
      <img class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="${category.image}" alt="${escapeHtml(category.alt || category.title)}" loading="lazy">
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-6 flex flex-col justify-end">
        <span class="text-white/80 font-semibold text-xs mb-1">${escapeHtml(category.tag || "Organic")}</span>
        <h3 class="text-white text-xl font-bold mb-2">${escapeHtml(category.title)}</h3>
        <span class="text-primary-fixed text-sm font-semibold flex items-center gap-1 group-hover:gap-3 transition-all">
          Explore Category <span class="material-symbols-outlined text-xs">arrow_forward</span>
        </span>
      </div>
    </a>`;
}

export function formatBlogDate(value) {
  if (!value) return "Farm Journal";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function blogPostLink(blog) {
  const key = blog.slug || blog.id;
  return key ? `blog.html?post=${encodeURIComponent(key)}` : "blog.html";
}

export function normalizeBlog(blog) {
  return {
    ...blog,
    title: blog.title || "Untitled Story",
    date: formatBlogDate(blog.publishedAt || blog.updatedAt || blog.date),
    desc: blog.excerpt || blog.description || blog.desc || "",
    category: blog.category || blog.eyebrow || "Farm Stories",
    readTime: blog.readTime || "5 min read",
    author: blog.author || "Ermunai Organic Team",
    authorRole: blog.authorRole || "Farm Foods Journal",
    authorImage: blog.authorImage || "./images/logo.jpg",
    image: blog.image || "./images/logo.jpg",
    link: blogPostLink(blog)
  };
}

export function blogCard(blog) {
  const item = normalizeBlog(blog);
  return `
    <article class="group cursor-pointer">
      <a href="${escapeHtml(item.link)}" class="block">
      <div class="relative aspect-[4/3] rounded-xl overflow-hidden mb-6 shadow-md bg-surface-container-high">
        <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
        <div class="absolute top-4 left-4">
          <span class="px-3 py-1 bg-white/90 backdrop-blur-md text-primary font-bold text-[11px] rounded-full shadow-sm">${escapeHtml(item.category)}</span>
        </div>
      </div>
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-on-surface-variant font-bold text-xs">
          <span class="material-symbols-outlined text-[18px]">schedule</span>
          <span>${escapeHtml(item.readTime)}</span>
          <span>•</span>
          <span>${escapeHtml(item.date)}</span>
        </div>
        <h3 class="font-extrabold text-xl text-on-surface line-clamp-2 group-hover:text-primary transition-colors">
          ${escapeHtml(item.title)}
        </h3>
        <p class="text-sm text-on-surface-variant line-clamp-2 leading-relaxed">${escapeHtml(item.desc)}</p>
        <div class="flex items-center gap-3 pt-3">
          <img class="w-10 h-10 rounded-full object-cover border border-glass-stroke" src="${escapeHtml(item.authorImage)}" alt="${escapeHtml(item.author)}" loading="lazy">
          <span class="font-bold text-sm">${escapeHtml(item.author)}</span>
        </div>
      </div>
      </a>
    </article>`;
}

export function summaryRow(row) {
  return `
    <div class="flex justify-between items-center py-2.5 border-b border-glass-stroke ${row.total ? "border-none text-primary text-xl font-extrabold" : "text-on-surface-variant text-sm"}">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(String(row.value))}</strong>
    </div>`;
}

export function cartItemRow(item) {
  const name = item.name || "Product";
  const qty = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || 0);
  return `
    <div class="glass-card p-4 rounded-xl flex gap-4 items-center border border-glass-stroke bg-white/70 backdrop-blur-md">
      <img class="w-20 h-20 object-contain bg-surface-container rounded-lg border border-glass-stroke p-1" src="${item.image || "./images/logo.jpg"}" alt="${escapeHtml(name)}" loading="lazy">
      <div class="flex-grow min-w-0">
        <h3 class="font-bold text-on-surface line-clamp-1">${escapeHtml(name)}</h3>
        <p class="text-xs text-on-surface-variant mt-0.5">${escapeHtml(item.category || "Product")} • ${formatCurrency(price)} each</p>
      </div>
      <div class="flex items-center gap-1 border border-outline-variant rounded-lg overflow-hidden bg-white">
        <button class="px-2.5 py-1.5 hover:bg-surface-container text-primary font-bold text-xs" type="button" onclick="updateQty('${item.id}', -1)">-</button>
        <span class="px-3 text-xs font-bold text-on-surface">${qty}</span>
        <button class="px-2.5 py-1.5 hover:bg-surface-container text-primary font-bold text-xs" type="button" onclick="updateQty('${item.id}', 1)">+</button>
      </div>
    </div>`;
}

export function statusChip(status) {
  let classes = "bg-primary-container/20 text-primary";
  if (status === "Delivered") classes = "bg-[#d1e7dd] text-[#0f5132]";
  else if (status === "Cancelled") classes = "bg-[#f8d7da] text-[#842029]";
  else if (status === "Shipped") classes = "bg-[#cff4fc] text-[#055160]";
  return `<span class="px-2.5 py-1 rounded-full text-xs font-bold ${classes}">${escapeHtml(status || "Pending")}</span>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
