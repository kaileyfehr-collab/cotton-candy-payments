// api/create-payment.js
// Expects POST { cart: [...] , redirectUrl?: "https://..." }
// Returns: { success:true, checkoutUrl: "https://..." }

const SQUARE_ENV = process.env.SQUARE_ENV || "sandbox";
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;

if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
  console.warn("Missing Square env vars. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Vercel.");
}

const PRICE_LIST = {
  "Mini stick": { price: 500, maxFlavours: 1 },
  "2-flavour stick": { price: 800, maxFlavours: 2 },
  "3-flavour stick": { price: 1000, maxFlavours: 3 },
  "Small bag": { price: 1000, maxFlavours: 2 },
  "Large bag": { price: 1500, maxFlavours: 3 }
};

const SQUARE_BASE =
  SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

function buildLineItems(cart) {
  return cart.map((entry, i) => {
    const { name, quantity = 1 } = entry;
    const priceObj = PRICE_LIST[name];
    const itemPrice = priceObj.price;
    return {
      name: name,
      quantity: String(quantity),
      base_price_money: {
        amount: itemPrice,
        currency: "CAD"
      },
      note: entry.flavours ? `Flavours: ${Array.isArray(entry.flavours) ? entry.flavours.join(", ") : entry.flavours}` : ""
    };
  });
}

export default async function handler(req, res) {

  // ==== CORS FIX ====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // ==== END CORS FIX ====


  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const cart = req.body?.cart;
    const redirectUrl = req.body?.redirectUrl || null; // where Square should send user after payment
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart required" });
    }

    // basic validation same as create-order
    let total = 0;
    for (const entry of cart) {
      const { name, quantity = 1, flavours } = entry;
      const p = PRICE_LIST[name];
      if (!p) return res.status(400).json({ error: `Unknown item: ${name}` });
      const flavourCount = Array.isArray(flavours) ? flavours.length : (flavours ? 1 : 0);
      if (flavourCount > p.maxFlavours) return res.status(400).json({ error: `${name} allows up to ${p.maxFlavours} flavour(s)` });
      if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: `Invalid quantity for ${name}` });
      total += p.price * quantity;
    }

    // Build order line items for Square
    const line_items = buildLineItems(cart);

    // idempotency key
    const idempotencyKey = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

    // Create payment link via Square Payment Links API
    const body = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items
      },
      checkout_options: {}
    };

    if (redirectUrl) {
      body.checkout_options.redirect_url = redirectUrl;
    }

    const response = await fetch(`${SQUARE_BASE}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Accept": "application/json"
      },
      body: JSON.stringify(body)
    });

    const json = await response.json();
    if (!response.ok) {
      console.error("Square error:", json);
      return res.status(500).json({ error: "Square API error", details: json });
    }

    const checkoutUrl = json?.payment_link?.url;
    return res.status(200).json({ success: true, checkoutUrl, squareResponse: json });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
