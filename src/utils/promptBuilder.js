function buildBookPrompt({ topic, description, bookType }) {
  return `
You are an expert academic writer.
Create a structured ${bookType} on the topic "${topic}".

Topic description:
${description || "No additional description provided."}

Rules:
1. Return Markdown only.
2. Start with a short title using "# ".
3. Add a "## Outline" section with 5 chapters.
4. Then write 5 full chapters.
5. Each chapter must use "## Chapter X: ..." as the heading.
6. Each chapter must include exactly 3 subsections using "### ".
7. Keep the writing practical, coherent, and ready for editing.
8. End with a "## Summary" section.

Do not include code fences.
`.trim();
}

module.exports = {
  buildBookPrompt,
};
