const crypto = require("crypto");
const https = require("https");

const { getPricingConfig } = require("./pricing");

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";

      res.on("data", (chunk) => {
        raw += chunk;
      });

      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Payment gateway error ${res.statusCode}: ${raw}`));
        }

        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(new Error(`Invalid JSON from payment gateway: ${error.message}`));
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function getPaymentConfig() {
  const pricing = getPricingConfig();

  return {
    mode: pricing.paymentMode,
    currency: pricing.currency,
    razorpayKeyId: pricing.razorpayKeyId,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  };
}

async function createPaymentOrder({ amountInr, projectId, topic }) {
  const paymentConfig = getPaymentConfig();
  const amountPaise = Math.max(100, Math.round(Number(amountInr || 0) * 100));

  if (paymentConfig.mode !== "razorpay") {
    return {
      id: `demo_order_${Date.now()}`,
      amount: amountPaise,
      currency: paymentConfig.currency,
      receipt: `preview_${projectId}`,
      notes: {
        projectId,
        topic,
      },
      mode: "demo",
    };
  }

  if (!paymentConfig.razorpayKeyId || !paymentConfig.razorpayKeySecret) {
    throw new Error(
      "Razorpay is enabled, but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing."
    );
  }

  const payload = JSON.stringify({
    amount: amountPaise,
    currency: paymentConfig.currency,
    receipt: `book_${projectId}`,
    notes: {
      projectId,
      topic: String(topic || "").slice(0, 120),
    },
  });

  const auth = Buffer.from(
    `${paymentConfig.razorpayKeyId}:${paymentConfig.razorpayKeySecret}`
  ).toString("base64");

  const order = await requestJson(
    {
      hostname: "api.razorpay.com",
      port: 443,
      path: "/v1/orders",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Basic ${auth}`,
      },
    },
    payload
  );

  return {
    ...order,
    mode: "razorpay",
  };
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const paymentConfig = getPaymentConfig();

  if (paymentConfig.mode !== "razorpay") {
    return true;
  }

  if (!paymentConfig.razorpayKeySecret) {
    throw new Error("Missing RAZORPAY_KEY_SECRET for payment verification.");
  }

  const expected = crypto
    .createHmac("sha256", paymentConfig.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return expected === signature;
}

module.exports = {
  createPaymentOrder,
  getPaymentConfig,
  verifyPaymentSignature,
};
