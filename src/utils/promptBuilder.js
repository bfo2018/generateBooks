function getDocumentBlueprint(documentType) {
  if (documentType === "research-paper") {
    return {
      label: "research paper",
      sections: [
        "Abstract",
        "Introduction",
        "Literature Review",
        "Methodology",
        "Findings and Analysis",
        "Conclusion",
        "References",
      ],
      instructions: [
        'Use formal academic tone and include clear argumentation.',
        'Create sections using "## " headings, not chapter labels.',
        'Add concise evidence-driven paragraphs and mention possible citations where relevant.',
      ],
    };
  }

  if (documentType === "topic-note") {
    return {
      label: "topic note",
      sections: [
        "Overview",
        "Key Definitions",
        "Main Points",
        "Examples",
        "Quick Revision",
      ],
      instructions: [
        'Keep the writing compact, revision-friendly, and easy to skim.',
        'Use short sections and bullet lists where useful.',
        'Include a final recap for quick study.',
      ],
    };
  }

  return {
    label: "book",
    sections: [
      "Preface",
      "Chapter 1",
      "Chapter 2",
      "Chapter 3",
      "Chapter 4",
      "Chapter 5",
      "Summary",
    ],
    instructions: [
      'Use book-style flow with chapter-based progression.',
      'Create "## Outline" first, then write five detailed chapters.',
      'Each chapter must include three "### " subsections.',
    ],
  };
}

function getLanguageInstruction(language) {
  return language === "hindi"
    ? "Write the full document in Hindi using natural, reader-friendly language."
    : "Write the full document in English using natural, reader-friendly language.";
}

function getPageLimitInstruction(description) {
  const text = String(description || "");
  const match = text.match(/\b(?:max(?:imum)?|up to)\s*(\d+)\s*pages?\b/i);

  if (!match) {
    return "Aim for a practical, concise length that matches the topic.";
  }

  const pageCount = Number(match[1]);

  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    return "Aim for a practical, concise length that matches the topic.";
  }

  return `Keep the document concise and target a maximum length of about ${pageCount} pages.`;
}

function buildBookPrompt({
  topic,
  description,
  documentType,
  language,
  paperSize,
  requestedPages,
  includeImages,
  colorMode,
}) {
  const blueprint = getDocumentBlueprint(documentType);
  const normalizedDescription = String(description || "");
  const imageInstruction = includeImages
    ? `Image Mode is ON. Include 3 to 4 relevant images evenly distributed across the document, not all in one place. For each image, add a clear caption, a short explanation of its relevance, and an image placeholder in this exact format: [IMAGE: description of the image]`
    : "Image Mode is OFF. Do not include image placeholders, figure captions, or image explanations.";
  const colorInstruction =
    colorMode === "color"
      ? "Color Mode is ON. Use visually structured formatting with clear headings, emphasized key terms, section labels, and an engaging academic layout."
      : "Color Mode is OFF. Keep the document clean, text-first, and academically structured without extra visual emphasis.";
  const safeRequestedPages = Math.max(1, Number(requestedPages) || 10);
  const pageLimitInstruction = normalizedDescription.match(/\b(?:max(?:imum)?|up to)\s*\d+\s*pages?\b/i)
    ? getPageLimitInstruction(normalizedDescription)
    : `Target about ${safeRequestedPages} pages in the final document.`;

  return `
You are an AI assistant that generates structured academic books and research-style documents.
Create a structured ${blueprint.label} on the topic "${topic}".

Topic description:
${normalizedDescription || "No additional description provided."}

Language:
${getLanguageInstruction(language)}

Layout:
Use a ${paperSize || "A4"} page layout as the intended output format.

Formatting rules:
1. Return Markdown only.
2. Maintain a formal academic tone throughout.
3. Start with a title using "# ".
4. Include an "## Abstract" section near the beginning.
5. Include an "## Table of Contents" section after the abstract.
6. Use the following major structure as guidance: ${blueprint.sections.join(", ")}.
7. ${blueprint.instructions.join(" ")}
8. Keep the writing coherent, clear, deep, and ready for export.
9. ${pageLimitInstruction}
10. ${colorInstruction}
11. ${imageInstruction}
12. If both image mode and color mode are off, produce a clean text-only academic document.
13. Do not mention these instructions in the output.
14. Do not include code fences.
`.trim();
}

module.exports = {
  buildBookPrompt,
};
