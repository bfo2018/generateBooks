function splitMarkdownLines(markdown) {
  return markdown.replace(/\r\n/g, "\n").split("\n");
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
      if (line.startsWith("# ")) {
        return { type: "title", text: line.replace(/^# /, "") };
      }
      if (line.startsWith("## ")) {
        return { type: "heading", text: line.replace(/^## /, "") };
      }
      if (line.startsWith("### ")) {
        return { type: "subheading", text: line.replace(/^### /, "") };
      }
      return { type: "body", text: line };
    });
}

module.exports = {
  extractOutline,
  toStructuredParagraphs,
};
