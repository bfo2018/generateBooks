const https = require("https");
const { URL } = require("url");

const { buildBookPrompt } = require("../utils/promptBuilder");

function requestJson(urlString, options, body) {
  const url = new URL(urlString);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: options.method || "POST",
        headers: options.headers || {},
      },
      (res) => {
        let raw = "";

        res.on("data", (chunk) => {
          raw += chunk;
        });

        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(`AI provider error ${res.statusCode}: ${raw}`)
            );
          }

          try {
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(new Error(`Invalid JSON from AI provider: ${error.message}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildMockBook({ topic, description, bookType }) {
  const descriptionLine = description
    ? `This project is based on: ${description}`
    : "This project was generated without an extra description.";

  return `# ${topic}: Generated ${bookType}

## Outline
1. Foundations of ${topic}
2. Core Concepts
3. Applied Practice
4. Advanced Themes
5. Assessment and Next Steps

## Chapter 1: Foundations of ${topic}
${descriptionLine}

### Context
Introduce the purpose, audience, and learning goals for this ${bookType}.

### Key Terms
Define the major terms and principles someone needs before moving deeper.

### Learning Path
Explain how the rest of the document will build knowledge step by step.

## Chapter 2: Core Concepts
Present the main ideas, theories, and structures that shape ${topic}.

### Essential Principles
Describe the most important principles in clear language.

### Models and Frameworks
Show how experts organize knowledge in this area.

### Common Misunderstandings
Clarify frequent mistakes and how to avoid them.

## Chapter 3: Applied Practice
Translate theory into real work, exercises, or research patterns.

### Practical Workflow
Lay out a repeatable process for working on ${topic}.

### Tools and Resources
List useful methods, materials, or references.

### Example Scenario
Walk through a realistic example with clear steps.

## Chapter 4: Advanced Themes
Move into deeper analysis and higher-level thinking.

### Emerging Ideas
Summarize current directions and promising developments.

### Critical Evaluation
Compare strengths, limits, and tradeoffs.

### Integration
Show how advanced ideas connect back to core concepts.

## Chapter 5: Assessment and Next Steps
Help the reader review and continue learning.

### Review Questions
Provide prompts someone can use to test understanding.

### Project Ideas
Suggest ways to turn the material into output or research.

### Roadmap
Recommend the next stage of study or implementation.

## Summary
This editable draft gives you a complete starting point that can be refined, expanded, or exported.
`;
}

async function generateWithConfiguredProvider(input) {
  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase();

  if (provider === "mock") {
    return {
      provider,
      content: buildMockBook(input),
    };
  }

  const apiKey = process.env.AI_API_KEY;
  const apiUrl = process.env.AI_API_URL;
  const model = process.env.AI_MODEL;

  if (!apiKey || !apiUrl || !model) {
    throw new Error(
      "AI provider is configured, but AI_API_KEY, AI_API_URL, or AI_MODEL is missing."
    );
  }

  const payload = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: buildBookPrompt(input),
      },
    ],
    temperature: 0.7,
  });

  const data = await requestJson(
    apiUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${apiKey}`,
      },
    },
    payload
  );

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI response did not include message content.");
  }

  return {
    provider,
    content,
  };
}

module.exports = {
  generateWithConfiguredProvider,
};
