const axios = require("axios");

function normalizeSourceUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return "";
}

function createDeterministicImageUrl(seedText) {
  const seed = encodeURIComponent(
    String(seedText || "generated-visual")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 72) || "generated-visual"
  );
  return `https://picsum.photos/seed/${seed}/1200/700`;
}

function buildJpegProxyUrl(sourceUrl) {
  const normalized = String(sourceUrl || "").trim().replace(/^https?:\/\//i, "");
  const encoded = encodeURIComponent(normalized);
  return `https://wsrv.nl/?url=${encoded}&output=jpg&maxage=1d`;
}

function parseDataImageUrl(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;

  const format = String(match[1] || "").toLowerCase();
  // Keep only formats reliably supported by pdfkit/docx embedding paths.
  if (!["png", "jpg", "jpeg"].includes(format)) {
    return null;
  }

  try {
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) return null;
    return {
      dataUrl: raw,
      mimeType: `image/${format === "jpg" ? "jpeg" : format}`,
      buffer,
    };
  } catch (_error) {
    return null;
  }
}

function resolveImageCandidates(src, caption) {
  const safeSrc = String(src || "").trim();
  const normalized = normalizeSourceUrl(safeSrc);
  const deterministic = createDeterministicImageUrl(caption);

  if (/^generated-image:\/\//i.test(safeSrc)) {
    return [deterministic, buildJpegProxyUrl(deterministic)];
  }

  if (normalized) {
    return [normalized, buildJpegProxyUrl(normalized), deterministic, buildJpegProxyUrl(deterministic)];
  }

  return [deterministic, buildJpegProxyUrl(deterministic)];
}

async function imageUrlToBase64(url, timeoutMs = 10000) {
  const safeUrl = normalizeSourceUrl(url);
  if (!safeUrl) return null;

  try {
    const response = await axios.get(safeUrl, {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BookForgeExporter/1.0)",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    const definitelyNotImage =
      contentType.includes("text/html") ||
      contentType.includes("application/json") ||
      contentType.includes("text/plain") ||
      contentType.includes("text/xml") ||
      contentType.includes("application/xml");
    if (definitelyNotImage) {
      return null;
    }

    const dataBuffer = Buffer.from(response.data || []);
    if (!dataBuffer.length) {
      return null;
    }

    const mimeType = contentType.startsWith("image/") ? contentType.split(";")[0] : "image/jpeg";
    return {
      dataUrl: `data:${mimeType};base64,${dataBuffer.toString("base64")}`,
      mimeType,
      buffer: dataBuffer,
      source: safeUrl,
    };
  } catch (_error) {
    return null;
  }
}

async function resolveImageToBase64({ src, caption, timeoutMs = 10000 }) {
  const inline = parseDataImageUrl(src);
  if (inline) {
    return {
      dataUrl: inline.dataUrl,
      mimeType: inline.mimeType,
      buffer: inline.buffer,
      source: "data-url",
    };
  }

  const candidates = resolveImageCandidates(src, caption);
  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const resolved = await imageUrlToBase64(candidate, timeoutMs);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

module.exports = {
  parseDataImageUrl,
  resolveImageToBase64,
};
