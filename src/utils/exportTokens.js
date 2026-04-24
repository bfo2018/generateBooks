const crypto = require("crypto");

function getExportSigningSecret() {
  return String(process.env.EXPORT_SIGNING_SECRET || "").trim();
}

function getExportUrlTtlSeconds() {
  const ttl = Number(process.env.EXPORT_URL_TTL_SECONDS);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return 900;
  }
  return Math.round(ttl);
}

function buildPayload({ projectId, kind, expiresAt }) {
  return `${String(projectId || "").trim()}|${String(kind || "")
    .trim()
    .toLowerCase()}|${Number(expiresAt)}`;
}

function signExportPayload(payload) {
  const secret = getExportSigningSecret();
  if (!secret) {
    throw new Error("Missing EXPORT_SIGNING_SECRET for export link signing.");
  }

  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function createSignedExportPayload({ projectId, kind }) {
  const expiresAt = Date.now() + getExportUrlTtlSeconds() * 1000;
  const payload = buildPayload({ projectId, kind, expiresAt });
  const signature = signExportPayload(payload);

  return {
    expiresAt,
    signature,
  };
}

function verifySignedExportPayload({ projectId, kind, expiresAt, signature }) {
  const safeExpiresAt = Number(expiresAt);
  const safeSignature = String(signature || "").trim();

  if (!safeSignature || !Number.isFinite(safeExpiresAt) || safeExpiresAt <= Date.now()) {
    return false;
  }

  const payload = buildPayload({ projectId, kind, expiresAt: safeExpiresAt });
  const expected = signExportPayload(payload);
  return expected === safeSignature;
}

module.exports = {
  createSignedExportPayload,
  getExportUrlTtlSeconds,
  verifySignedExportPayload,
};
