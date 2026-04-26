const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function getSessionTokenSecret() {
  return (
    String(process.env.SESSION_TOKEN_SECRET || "").trim() ||
    String(process.env.EXPORT_SIGNING_SECRET || "").trim() ||
    "bookforge-dev-insecure-secret"
  );
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function createSessionToken(userId) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const payload = toBase64Url(JSON.stringify({ uid: String(userId || ""), exp: expiresAt }));
  const signature = crypto
    .createHmac("sha256", getSessionTokenSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const rawToken = String(token || "").trim();
  if (!rawToken.includes(".")) {
    return null;
  }

  const [payload, signature] = rawToken.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", getSessionTokenSecret())
    .update(payload)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payload));
    const uid = String(decoded.uid || "").trim();
    const exp = Number(decoded.exp || 0);
    if (!uid || !Number.isFinite(exp) || exp <= Date.now()) {
      return null;
    }
    return { userId: uid, expiresAt: exp };
  } catch (_error) {
    return null;
  }
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    name: user.name,
    mobileNumber: user.mobileNumber,
    email: user.email,
    address: user.address || "",
    qualification: user.qualification || "",
    generatedCount: Math.max(0, Number(user.generatedCount) || 0),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  createSessionToken,
  hashPassword,
  sanitizeUser,
  verifySessionToken,
};
