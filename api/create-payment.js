// api/create-payment.js
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

// Quick lookup map for normalized names
const NORMALIZED_LOOKUP = {};
for (const key of Object.keys(PRICE_LIST)) {
  NORMALIZED_LOOKUP[key.toLowerCase().trim()] = key;
}

const SQUARE_BASE =
  SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

function buildLineItems(cart) {
  return cart.map(entry => {
    const { name, quantity = 1, flavours } = entry;
    const priceObj = PRICE_LIST[name];
    return {
      name,
      quantity: String(quantity),
      base_price_money: {
        amount: priceObj.price,
        currency: "CAD"
      },
      note: flavours ? `Flavours: ${Array.isArray(flavours) ? flavours.join(", ") : flavours}` : ""
    };
  });
}

export default async function handler(req, res) {

  console.log("DEBUG incoming body:", JSON.stringify(req.body, null, 2));

  // ==== CORS ====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    let cart = req.body?.cart;

    // If cart is missing, try to parse body as array
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

    const redirectUrl = req.body?.redirectUrl || null;

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
      if (!priceObj) {
        return res.status(400).json({ error: `Unknown item: ${name}` });
      }
      const flavourCount = Array.isArray(flavours) ? flavours.length : (flavours ? 1 : 0);
      if (flavourCount > priceObj.maxFlavours) return res.status(400).json({ error: `${name} allows up to ${priceObj.maxFlavours} flavour(s)` });
      if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: `Invalid quantity for ${name}` });
    }

    const line_items = buildLineItems(cart);
    const idempotencyKey = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    const body = {
      idempotency_key: idempotencyKey,
      order: { location_id: SQUARE_LOCATION_ID, line_items },
      checkout_options: {}
    };

    if (redirectUrl) body.checkout_options.redirect_url = redirectUrl;

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
