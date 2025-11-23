// api/create-order.js
// Validates a cart, enforces pricing & flavour limits, and returns a calculated order summary.

const PRICE_LIST = {
  "Mini stick": { price: 500, maxFlavours: 1 },
  "2-flavour stick": { price: 800, maxFlavours: 2 },
  "3-flavour stick": { price: 1000, maxFlavours: 3 },
  "Small bag": { price: 1000, maxFlavours: 2 },
  "Large bag": { price: 1500, maxFlavours: 3 }
};

export default async function handler(req, res) {

  // ==== CORS FIX ====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // ==== END CORS FIX ====


  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cart = req.body?.cart;
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart must be a non-empty array" });
    }

    let total = 0;
    const items = [];

    for (const entry of cart) {
      const { name, quantity = 1, flavours } = entry;
      if (!PRICE_LIST[name]) {
        return res.status(400).json({ error: `Unknown item: ${name}` });
      }
      const { price, maxFlavours } = PRICE_LIST[name];
      const flavourCount = Array.isArray(flavours) ? flavours.length : (flavours ? 1 : 0);
      if (flavourCount > maxFlavours) {
        return res.status(400).json({ error: `${name} allows up to ${maxFlavours} flavour(s)` });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return res.status(400).json({ error: `Invalid quantity for ${name}` });
      }

      const lineTotal = price * quantity;
      total += lineTotal;
      items.push({
        name,
        quantity,
        flavours: flavours || [],
        unit_price_cents: price,
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
