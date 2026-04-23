const fs = require("fs");

const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require("docx");
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

function paragraphToDocxNode(item) {
  if (item.type === "title") {
    return new Paragraph({
      text: item.text,
      heading: HeadingLevel.TITLE,
      spacing: { after: 300 },
    });
  }

  if (item.type === "heading") {
    return new Paragraph({
      text: item.text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 180 },
    });
  }

  if (item.type === "subheading") {
    return new Paragraph({
      text: item.text,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 120, after: 120 },
    });
  }

  return new Paragraph({
    children: [new TextRun(item.text || "")],
    spacing: { after: 140 },
  });
}

async function createDocxBuffer(markdown) {
  const paragraphs = toStructuredParagraphs(markdown).map(paragraphToDocxNode);

  const document = new Document({
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(document);
}

function createPdfBuffer(markdown, options = {}) {
  const items = toStructuredParagraphs(markdown);
  const pageSize = normalizePdfPageSize(options.paperSize);
  const customFontPath = resolvePdfFont();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const pdf = new PDFDocument({ margin: 50, size: pageSize });

    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    items.forEach((item) => {
      if (!item.text) {
        pdf.moveDown(0.5);
        return;
      }

      if (item.type === "title") {
        pdf.fontSize(22).font(getPdfFont(item.type, customFontPath)).text(item.text);
        pdf.moveDown(0.8);
        return;
      }

      if (item.type === "heading") {
        pdf.fontSize(17).font(getPdfFont(item.type, customFontPath)).text(item.text);
        pdf.moveDown(0.5);
        return;
      }

      if (item.type === "subheading") {
        pdf.fontSize(13).font(getPdfFont(item.type, customFontPath)).text(item.text);
        pdf.moveDown(0.3);
        return;
      }

      pdf.fontSize(11).font(getPdfFont(item.type, customFontPath)).text(item.text, {
        align: "left",
      });
      pdf.moveDown(0.5);
    });

    pdf.end();
  });
}

module.exports = {
  createDocxBuffer,
  createPdfBuffer,
};
