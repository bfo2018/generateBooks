function splitMarkdownLines(markdown) {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

function parseMarkdownImageLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("![")) {
    return null;
  }

  const altClose = trimmed.indexOf("](");
  if (altClose === -1) {
    return null;
  }

  const altText = trimmed.slice(2, altClose);
  const remainder = trimmed.slice(altClose + 2);
  const parenClose = remainder.lastIndexOf(")");

  if (parenClose === -1) {
    return null;
  }

  const rawTarget = remainder.slice(0, parenClose).trim();
  const urlToken = rawTarget.split(/\s+/)[0] || "";

  if (!/^https?:\/\//i.test(urlToken)) {
    return null;
  }

  return {
    altText: altText || "Generated image",
    src: urlToken,
  };
}

function extractOutline(markdown) {
  const lines = splitMarkdownLines(markdown);
  const startIndex = lines.findIndex((line) => line.trim() === "## Outline");

  if (startIndex === -1) {
    return "";
  }

  const outlineLines = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("## ") && line.trim() !== "## Outline") {
      break;
    }
    outlineLines.push(line);
  }

  return outlineLines.join("\n").trim();
}

function toStructuredParagraphs(markdown) {
  return splitMarkdownLines(markdown)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line || lines[index - 1])
    .map((line) => {
      const markdownImage = parseMarkdownImageLine(line);
      if (markdownImage) {
        return {
          type: "image",
          text: markdownImage.altText,
          src: markdownImage.src,
        };
      }
      const imagePlaceholderMatch = line.match(/^\[IMAGE:\s*(.+?)\]$/i);
      if (imagePlaceholderMatch) {
        return { type: "image", text: imagePlaceholderMatch[1] };
      }
      if (line.startsWith("# ")) {
        return { type: "title", text: line.replace(/^# /, "") };
      }
      if (line.startsWith("## ")) {
        return { type: "heading", text: line.replace(/^## /, "") };
      }
      if (line.startsWith("### ")) {
        return { type: "subheading", text: line.replace(/^### /, "") };
      }
      if (line.startsWith("- ")) {
        return { type: "bullet", text: line.replace(/^- /, "") };
      }
      return { type: "body", text: line };
    });
}

function countWords(value = "") {
  const normalized = String(value).trim();
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).length;
}

function estimateParagraphWords(item) {
  const base = Math.max(1, countWords(item.text));

  if (item.type === "title") {
    return base + 20;
  }

  if (item.type === "heading") {
    return base + 14;
  }

  if (item.type === "subheading") {
    return base + 8;
  }

  if (item.type === "image") {
    return base + 100;
  }

  return base;
}

function paginateStructuredParagraphs(items, wordsPerPage = 450) {
  const safeWordsPerPage = Math.max(120, Number(wordsPerPage) || 450);
  const pages = [];
  let currentPage = [];
  let currentWeight = 0;

  items.forEach((item) => {
    const itemWeight = estimateParagraphWords(item);

    if (currentPage.length && currentWeight + itemWeight > safeWordsPerPage) {
      pages.push(currentPage);
      currentPage = [];
      currentWeight = 0;
    }

    currentPage.push(item);
    currentWeight += itemWeight;
  });

  if (currentPage.length) {
    pages.push(currentPage);
  }

  return pages;
}

function structuredParagraphToMarkdown(item) {
  if (!item.text) {
    return "";
  }

  if (item.type === "title") {
    return `# ${item.text}`;
  }

  if (item.type === "heading") {
    return `## ${item.text}`;
  }

  if (item.type === "subheading") {
    return `### ${item.text}`;
  }

  if (item.type === "image") {
    if (item.src) {
      return `![${item.text || "Generated image"}](${item.src})`;
    }
    return `[IMAGE: ${item.text}]`;
  }

  if (item.type === "bullet") {
    return `- ${item.text}`;
  }

  return item.text;
}

function finalizeLimitedItems(items, wasTrimmed) {
  const result = [...items];

  // Avoid ending on a dangling heading when page cap trims content.
  while (result.length && ["title", "heading", "subheading"].includes(result[result.length - 1].type)) {
    result.pop();
  }

  if (!result.length) {
    return items;
  }

  if (wasTrimmed) {
    result.push({
      type: "heading",
      text: "Closing Note",
    });
    result.push({
      type: "body",
      text: "This generated draft has been intentionally capped to your requested page count for pricing and export alignment.",
    });
  }

  return result;
}

function limitMarkdownToPageCount(markdown, requestedPages = 10, wordsPerPage = 450) {
  const safePages = Math.max(1, Number(requestedPages) || 10);
  const items = toStructuredParagraphs(markdown);
  const pages = paginateStructuredParagraphs(items, wordsPerPage);
  const limitedItems = pages.slice(0, safePages).flat();
  const wasTrimmed = pages.length > safePages;
  const finalizedItems = finalizeLimitedItems(limitedItems, wasTrimmed);

  return finalizedItems.map(structuredParagraphToMarkdown).join("\n").trim();
}

function buildPreviewMarkdown(markdown, previewPageLimit = 3, wordsPerPage = 450) {
  const items = toStructuredParagraphs(markdown);
  const pages = paginateStructuredParagraphs(items, wordsPerPage);
  const safeLimit = Math.max(1, Number(previewPageLimit) || 3);
  const previewItems = pages.slice(0, safeLimit).flat();

  return previewItems.map(structuredParagraphToMarkdown).join("\n").trim();
}

module.exports = {
  buildPreviewMarkdown,
  countWords,
  extractOutline,
  limitMarkdownToPageCount,
  paginateStructuredParagraphs,
  toStructuredParagraphs,
};
