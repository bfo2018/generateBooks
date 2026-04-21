const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require("docx");
const PDFDocument = require("pdfkit");

const { toStructuredParagraphs } = require("./markdown");

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
  const pageSize = options.paperSize || "A4";

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
        pdf.fontSize(22).font("Helvetica-Bold").text(item.text);
        pdf.moveDown(0.8);
        return;
      }

      if (item.type === "heading") {
        pdf.fontSize(17).font("Helvetica-Bold").text(item.text);
        pdf.moveDown(0.5);
        return;
      }

      if (item.type === "subheading") {
        pdf.fontSize(13).font("Helvetica-Bold").text(item.text);
        pdf.moveDown(0.3);
        return;
      }

      pdf.fontSize(11).font("Helvetica").text(item.text, {
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
