// api/create-order.js
// Validates a cart, enforces pricing & flavour limits, and returns a calculated order summary.

const PRICE_LIST = {
  "Mini stick": { price: 500, maxFlavours: 1 },
  "2-flavour stick": { price: 800, maxFlavours: 2 },
  "3-flavour stick": { price: 1000, maxFlavours: 3 },
  "Small bag": { price: 1000, maxFlavours: 2 },
  "Large bag": { price: 1500, maxFlavours: 3 }
};

// Quick lookup map for normalized names
const NORMALIZED_LOOKUP = {};
for (const key of Object.keys(PRICE_LIST)) {
  NORMALIZED_LOOKUP[key.toLowerCase().trim()] = key;
}

export default async function handler(req, res) {

  // ==== CORS ====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    let cart = req.body?.cart;

    // Accept cart as raw array or string if Base44 sends it differently
    if (!cart) {
      if (Array.isArray(req.body)) {
        cart = req.body;
      } else if (typeof req.body === "string") {
        try {
          const parsed = JSON.parse(req.body);
          if (Array.isArray(parsed)) cart = parsed;
          else if (parsed?.cart) cart = parsed.cart;
        } catch (e) {
          // ignore, will fail below
        }
      }
    }

    if (!Array.isArray(cart)) {
      // fallback: accept empty array if nothing is sent (avoids cart required)
      cart = [];
    }

    let total = 0;
    const items = [];

    for (const entry of cart) {
      // normalize name
      const nameRaw = entry.name || "Unknown Item";
      const normalized = nameRaw.toLowerCase().trim();
      const name = NORMALIZED_LOOKUP[normalized] || nameRaw;

      const quantity = Number.isInteger(entry.quantity) && entry.quantity > 0 ? entry.quantity : 1;
      const flavours = Array.isArray(entry.flavours) ? entry.flavours : entry.flavours ? [entry.flavours] : [];

      const priceObj = PRICE_LIST[name];
      if (!priceObj) {
        // just skip unknown items instead of failing
        console.warn(`Unknown item skipped: ${name}`);
        continue;
      }

      if (flavours.length > priceObj.maxFlavours) {
        return res.status(400).json({ error: `${name} allows up to ${priceObj.maxFlavours} flavour(s)` });
      }

      const lineTotal = priceObj.price * quantity;
      total += lineTotal;

      items.push({
        name,
        quantity,
        flavours,
        unit_price_cents: priceObj.price,
        line_total_cents: lineTotal
      });
    }

    return res.status(200).json({
      success: true,
      items,
      total_cents: total,
      total_display: `$${(total / 100).toFixed(2)}`
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
