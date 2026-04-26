const fs = require("fs");

const { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = require("docx");
const PDFDocument = require("pdfkit");

const { toStructuredParagraphs } = require("./markdown");

const PDF_FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
];

function resolvePdfFont() {
  return PDF_FONT_CANDIDATES.find((fontPath) => fs.existsSync(fontPath)) || null;
}

function normalizePdfPageSize(pageSize) {
  const normalized = String(pageSize || "A4").trim().toUpperCase();

  if (normalized === "A5") {
    return "A5";
  }

  if (normalized === "LETTER") {
    return "LETTER";
  }

  return "A4";
}

function getPdfFont(itemType, customFontPath) {
  if (customFontPath) {
    return customFontPath;
  }

  if (itemType === "title" || itemType === "heading" || itemType === "subheading") {
    return "Helvetica-Bold";
  }

  return "Helvetica";
}

function createFallbackImageUrl(seedText) {
  const safeLabel = encodeURIComponent(
    String(seedText || "Generated visual")
      .trim()
      .slice(0, 72) || "Generated visual"
  );
  return `https://dummyimage.com/1200x700/f3f4f6/1f2937.png&text=${safeLabel}`;
}

function resolveExportImageSource(item) {
  const src = String(item?.src || "").trim();
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  return createFallbackImageUrl(item?.text);
}

async function downloadImageBuffer(url) {
  const safeUrl = String(url || "").trim();
  if (!/^https?:\/\//i.test(safeUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some image CDNs reject requests without a browser-like user-agent/accept.
        "User-Agent": "Mozilla/5.0 (compatible; BookForgeExporter/1.0)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      return null;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const supportedContentType =
      contentType.includes("image/jpeg") ||
      contentType.includes("image/jpg") ||
      contentType.includes("image/png");
    if (contentType && !supportedContentType) {
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    const maxBytes = 8 * 1024 * 1024;
    if (contentLength > maxBytes) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > maxBytes) {
      return null;
    }

    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getExportImageBuffer(item) {
  const primarySource = resolveExportImageSource(item);
  const primaryBuffer = await downloadImageBuffer(primarySource);
  if (primaryBuffer) {
    return primaryBuffer;
  }

  const fallbackSource = createFallbackImageUrl(item?.text || "Generated image");
  return downloadImageBuffer(fallbackSource);
}

async function paragraphToDocxNodes(item) {
  if (item.type === "title") {
    return [
      new Paragraph({
        text: item.text,
        heading: HeadingLevel.TITLE,
        spacing: { after: 300 },
      }),
    ];
  }

  if (item.type === "heading") {
    return [
      new Paragraph({
        text: item.text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 180 },
      }),
    ];
  }

  if (item.type === "subheading") {
    return [
      new Paragraph({
        text: item.text,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 120 },
      }),
    ];
  }

  if (item.type === "image") {
    const imageBuffer = await getExportImageBuffer(item);

    if (!imageBuffer) {
      return [
        new Paragraph({
          children: [new TextRun(`[Image unavailable] ${item.text || "Generated image"}`)],
          spacing: { before: 120, after: 140 },
        }),
      ];
    }

    return [
      new Paragraph({
        children: [
          new ImageRun({
            data: imageBuffer,
            transformation: {
              width: 560,
              height: 320,
            },
          }),
        ],
        spacing: { before: 120, after: 60 },
      }),
      new Paragraph({
        children: [new TextRun(item.text || "Generated image")],
        spacing: { after: 140 },
      }),
    ];
  }

  return [
    new Paragraph({
      children: [new TextRun(item.text || "")],
      spacing: { after: 140 },
    }),
  ];
}

async function createDocxBuffer(markdown) {
  const items = toStructuredParagraphs(markdown);
  const paragraphGroups = await Promise.all(items.map((item) => paragraphToDocxNodes(item)));
  const paragraphs = paragraphGroups.flat();

  const document = new Document({
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(document);
}

async function createPdfBuffer(markdown, options = {}) {
  const items = toStructuredParagraphs(markdown);
  const pageSize = normalizePdfPageSize(options.paperSize);
  const customFontPath = resolvePdfFont();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const pdf = new PDFDocument({ margin: 50, size: pageSize });

    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    (async () => {
      for (const item of items) {
        if (!item.text) {
          pdf.moveDown(0.5);
          continue;
        }

        if (item.type === "title") {
          pdf.fontSize(22).font(getPdfFont(item.type, customFontPath)).text(item.text);
          pdf.moveDown(0.8);
          continue;
        }

        if (item.type === "heading") {
          pdf.fontSize(17).font(getPdfFont(item.type, customFontPath)).text(item.text);
          pdf.moveDown(0.5);
          continue;
        }

        if (item.type === "subheading") {
          pdf.fontSize(13).font(getPdfFont(item.type, customFontPath)).text(item.text);
          pdf.moveDown(0.3);
          continue;
        }

        if (item.type === "image") {
          const imageBuffer = await getExportImageBuffer(item);
          if (imageBuffer) {
            const maxWidth = 500;
            const maxHeight = 280;
            const imageTop = pdf.y;
            const availableWidth =
              pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
            const imageLeft = pdf.page.margins.left + Math.max(0, (availableWidth - maxWidth) / 2);

            pdf.image(imageBuffer, imageLeft, imageTop, {
              fit: [maxWidth, maxHeight],
              align: "center",
              valign: "top",
            });

            // Force the text cursor below the image block to prevent overlap.
            pdf.y = imageTop + maxHeight + 10;
          }
          pdf.fontSize(10).font(getPdfFont("body", customFontPath)).text(item.text || "Generated image");
          pdf.moveDown(0.6);
          continue;
        }

        pdf.fontSize(11).font(getPdfFont(item.type, customFontPath)).text(item.text, {
          align: "left",
        });
        pdf.moveDown(0.5);
      }

      pdf.end();
    })().catch((error) => {
      reject(error);
    });
  });
}

module.exports = {
  createDocxBuffer,
  createPdfBuffer,
};
