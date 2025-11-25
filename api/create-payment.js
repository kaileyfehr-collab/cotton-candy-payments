// api/create-payment.js
// Expects POST { cart: [...] , redirectUrl?: "https://..." }
// Returns: { success:true, checkoutUrl: "https://..." }

import fetch from 'node-fetch'; // or use native fetch in Next.js 13+
import createOrder from './create-order'; // import if modularized

const SQUARE_ENV = process.env.SQUARE_ENV || "sandbox";
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;

export default async function handler(req, res) {
  // ==== CORS ====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  try {
    let cart = req.body?.cart;
    const redirectUrl = req.body?.redirectUrl || `${req.headers.origin || ""}/success`;

    // fallback if Base44 sends raw JSON string
    if (!cart) {
      if (Array.isArray(req.body)) {
        cart = req.body;
      } else if (typeof req.body === "string") {
        try {
          const parsed = JSON.parse(req.body);
          if (Array.isArray(parsed)) cart = parsed;
          else if (parsed?.cart) cart = parsed.cart;
        } catch (e) {
          return res.status(400).json({ error: "Invalid cart data" });
        }
      }
    }

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart required" });
    }

    // Validate cart with createOrder logic
    const orderResult = await createOrder({ body: { cart }, method: "POST" });
    const orderJson = typeof orderResult.json === "function" ? await orderResult.json() : orderResult;

    if (!orderJson.success) {
      return res.status(400).json({ error: orderJson.error || "Invalid order" });
    }

    // Build line items for Square
    const line_items = orderJson.items.map(item => ({
      name: item.name,
      quantity: item.quantity.toString(),
      base_price_money: {
        amount: item.unit_price_cents,
        currency: "CAD"
      }
    }));

    // Call Square Checkout API
    const response = await fetch(`https://connect.squareup.com/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SQUARE_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        idempotency_key: `${Date.now()}-${Math.random()}`,
        order: {
          location_id: SQUARE_LOCATION_ID,
          line_items
        },
        ask_for_shipping_address: false,
        redirect_url: redirectUrl
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      return res.status(400).json({ error: data?.errors?.[0]?.detail || "Payment creation failed" });
    }

    return res.status(200).json({
      success: true,
      checkoutUrl: data.checkout?.checkout_page_url
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
