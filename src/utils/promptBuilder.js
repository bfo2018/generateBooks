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

function buildBookPrompt({
  topic,
  description,
  documentType,
  language,
  includeImages,
  colorMode,
}) {
  const blueprint = getDocumentBlueprint(documentType);
  const imageInstruction = includeImages
    ? `Also include short figure suggestions and image captions suitable for a ${colorMode} file.`
    : "Do not include image prompts or figure captions.";

  return `
You are an expert academic writer and publishing assistant.
Create a structured ${blueprint.label} on the topic "${topic}".

Topic description:
${description || "No additional description provided."}

Language:
${getLanguageInstruction(language)}

Formatting rules:
1. Return Markdown only.
2. Start with a short title using "# ".
3. Use the following major structure as guidance: ${blueprint.sections.join(", ")}.
4. ${blueprint.instructions.join(" ")}
5. Keep the writing coherent, useful, and ready for export.
6. ${imageInstruction}
7. Do not include code fences.
`.trim();
}

module.exports = {
  buildBookPrompt,
};
