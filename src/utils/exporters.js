const fs = require("fs");

const { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = require("docx");
const PDFDocument = require("pdfkit");

const { toStructuredParagraphs } = require("./markdown");
const { parseDataImageUrl, resolveImageToBase64 } = require("./imageData");

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

async function getExportImageBuffer(item) {
  const embeddedImage = parseDataImageUrl(item?.imageDataUrl || "");
  if (embeddedImage?.buffer) return embeddedImage.buffer;

  const inlineSrc = parseDataImageUrl(item?.src || "");
  if (inlineSrc?.buffer) return inlineSrc.buffer;

  const resolved = await resolveImageToBase64({
    src: item?.src || "",
    caption: item?.text || "Generated image",
    timeoutMs: 10000,
  });
  return resolved?.buffer || null;
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

async function createDocxBuffer(markdown, options = {}) {
  const items =
    Array.isArray(options.blocks) && options.blocks.length
      ? options.blocks
      : toStructuredParagraphs(markdown);
  const paragraphGroups = await Promise.all(items.map((item) => paragraphToDocxNodes(item)));
  const paragraphs = paragraphGroups.flat();

  const document = new Document({
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(document);
}

async function createPdfBuffer(markdown, options = {}) {
  const items =
    Array.isArray(options.blocks) && options.blocks.length
      ? options.blocks
      : toStructuredParagraphs(markdown);
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
