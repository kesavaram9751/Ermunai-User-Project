let analyticsReady;

async function initializeAnalytics() {
  let id = window.storefrontSeo?.analytics;
  if (!window.storefrontSeo?.managed) {
    const { getDoc, doc, supabase } = await import("./supabase-compat.js");
    const settings = await getDoc(doc(supabase, "settings", "seo.global"));
    id = settings.data()?.analytics;
  }
  if (!/^G-[A-Z0-9]+$/.test(id || "")) return null;
  window.dataLayer ||= [];
  function gtag() { window.dataLayer.push(arguments); }
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
  document.head.append(tag);
  gtag("js", new Date());
  // Keep account, order and checkout URL parameters out of analytics.
  gtag("config", id, {
    page_location: location.origin + location.pathname,
    page_referrer: document.referrer.split(/[?#]/)[0]
  });
  return gtag;
}

export function trackStorefront(event, items = [], details = {}) {
  analyticsReady ||= initializeAnalytics().catch(() => null);
  return analyticsReady.then(gtag => {
    if (gtag && event) {
      gtag("event", event, {
        currency: "INR",
        ...details,
        items: items.map(item => ({
          item_id: item.id, item_name: item.name, price: Number(item.price) || 0,
          quantity: Number(item.qty) || 1
        }))
      });
    }
  });
}

trackStorefront();
