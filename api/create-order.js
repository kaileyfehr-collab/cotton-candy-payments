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

    // Fallbacks if cart is missing
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

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart required" });
    }

    let total = 0;
    const items = [];

    // Normalize names
    for (const entry of cart) {
      if (!entry.name) continue;
      const normalized = entry.name.toLowerCase().trim();
      entry.name = NORMALIZED_LOOKUP[normalized] || entry.name;
    }

    // Validate items
    for (const entry of cart) {
      const { name, quantity = 1, flavours } = entry;
      const priceObj = PRICE_LIST[name];
      if (!priceObj) return res.status(400).json({ error: `Unknown item: ${name}` });

      const flavourCount = Array.isArray(flavours) ? flavours.length : (flavours ? 1 : 0);
      if (flavourCount > priceObj.maxFlavours) return res.status(400).json({ error: `${name} allows up to ${priceObj.maxFlavours} flavour(s)` });
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return res.status(400).json({ error: `Invalid quantity for ${name}` });

      const lineTotal = priceObj.price * quantity;
      total += lineTotal;
      items.push({
        name,
        quantity,
        flavours: flavours || [],
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
