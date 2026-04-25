const https = require("https");
const { URL } = require("url");

const { buildBookPrompt } = require("../utils/promptBuilder");
const { estimateTokenCount } = require("../utils/pricing");
const { limitMarkdownToPageCount } = require("../utils/markdown");

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
              new Error(
                `AI provider error ${res.statusCode} from ${url.origin}${url.pathname}: ${raw}`
              )
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

function requestSseStream(urlString, options, body, handlers = {}) {
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
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let raw = "";
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            reject(
              new Error(`AI provider error ${res.statusCode} from ${url.origin}${url.pathname}: ${raw}`)
            );
          });
          return;
        }

        let buffer = "";

        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) {
              return;
            }

            const payload = trimmed.slice(5).trim();

            if (!payload || payload === "[DONE]") {
              return;
            }

            try {
              handlers.onData?.(JSON.parse(payload));
            } catch (_error) {
              // Ignore malformed stream chunks.
            }
          });
        });

        res.on("end", resolve);
      }
    );

    req.on("error", reject);

    if (handlers.signal) {
      const abortListener = () => {
        const error = new Error("Generation aborted.");
        error.name = "AbortError";
        req.destroy(error);
      };

      if (handlers.signal.aborted) {
        abortListener();
        return;
      }

      handlers.signal.addEventListener("abort", abortListener, { once: true });
    }

    req.write(body);
    req.end();
  });
}

function resolveApiUrl(provider, apiUrl) {
  if (!apiUrl) {
    return apiUrl;
  }

  try {
    const url = new URL(apiUrl);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (pathname.endsWith("/chat/completions")) {
      return url.toString();
    }

    if (provider === "deepseek") {
      const normalizedPathname = pathname.replace(/\/chat\/completion$/, "/chat/completions");

      if (!normalizedPathname || normalizedPathname === "/") {
        url.pathname = "/chat/completions";
      } else if (normalizedPathname === "/v1") {
        url.pathname = "/v1/chat/completions";
      } else if (!normalizedPathname.endsWith("/chat/completions")) {
        url.pathname = `${normalizedPathname}/chat/completions`.replace(/\/+/g, "/");
      } else {
        url.pathname = normalizedPathname;
      }
    }

    return url.toString();
  } catch (_error) {
    return apiUrl;
  }
}

function buildMockBook({ topic, description, documentType, language, includeImages, colorMode }) {
  const isHindi = language === "hindi";
  const descriptionLine = description
    ? isHindi
      ? `यह प्रोजेक्ट इस विवरण पर आधारित है: ${description}`
      : `This project is based on: ${description}`
    : isHindi
      ? "यह प्रोजेक्ट बिना अतिरिक्त विवरण के तैयार किया गया है।"
      : "This project was generated without an extra description.";

  const imageBlock = includeImages
    ? isHindi
      ? `## चित्र सुझाव\n### चित्र 1\n${topic} के लिए एक ${colorMode === "color" ? "रंगीन" : "सरल"} व्याख्यात्मक चित्र का सुझाव।\n![चित्र 1: ${topic} का ${colorMode === "color" ? "रंगीन" : "मानक"} विज़ुअल](generated-image://figure-1)`
      : `## Figure Suggestions\n### Figure 1\nSuggested ${colorMode === "color" ? "color" : "standard"} explanatory visual for ${topic}.\n![Figure 1: ${topic} visual concept](generated-image://figure-1)`
    : "";

  const fallbackImagePlaceholder = includeImages
    ? isHindi
      ? `\n\n## चित्र प्लेसहोल्डर\n![चित्र 1: ${topic} के लिए विवरणात्मक चित्र](generated-image://figure-1)`
      : `\n\n## Image Placeholder\n![Figure 1: descriptive visual for ${topic}](generated-image://figure-1)`
    : "";

  if (documentType === "research-paper") {
    return isHindi
      ? `# ${topic}: शोध पत्र मसौदा

## Abstract
${descriptionLine}

## Introduction
${topic} के महत्व, दायरे और संदर्भ का संक्षिप्त परिचय दें।

## Literature Review
उपलब्ध विचारों, दृष्टिकोणों और प्रमुख बहसों का सार प्रस्तुत करें।

## Methodology
संभावित शोध पद्धति, डेटा स्रोत और विश्लेषण फ्रेमवर्क बताएं।

## Findings and Analysis
मुख्य निष्कर्ष, पैटर्न, तर्क और सीमाओं का विश्लेषण दें।

## Conclusion
मुख्य निष्कर्षों और आगे की दिशा का सार दें।

## References
- संदर्भ 1
- संदर्भ 2

${imageBlock || fallbackImagePlaceholder}`.trim()
      : `# ${topic}: Research Paper Draft

## Abstract
${descriptionLine}

## Introduction
Introduce the context, purpose, and academic relevance of ${topic}.

## Literature Review
Summarize major viewpoints, debates, and prior work related to ${topic}.

## Methodology
Explain an appropriate research method, data approach, and evaluation strategy.

## Findings and Analysis
Present analytical observations, implications, and limitations.

## Conclusion
Summarize the key outcome and suggest future work.

## References
- Reference 1
- Reference 2

${imageBlock || fallbackImagePlaceholder}`.trim();
  }

  if (documentType === "topic-note") {
    return isHindi
      ? `# ${topic}: टॉपिक नोट्स

## Overview
${descriptionLine}

## Key Definitions
- महत्वपूर्ण शब्द 1
- महत्वपूर्ण शब्द 2

## Main Points
- बिंदु 1
- बिंदु 2
- बिंदु 3

## Examples
संक्षिप्त उदाहरण और उपयोग।

## Quick Revision
- दोहराने योग्य सारांश
- परीक्षा/इंटरव्यू के लिए मुख्य बातें

${imageBlock || fallbackImagePlaceholder}`.trim()
      : `# ${topic}: Topic Notes

## Overview
${descriptionLine}

## Key Definitions
- Important term 1
- Important term 2

## Main Points
- Key point 1
- Key point 2
- Key point 3

## Examples
Short examples and practical cues.

## Quick Revision
- Fast recap
- Interview/exam ready pointers

${imageBlock || fallbackImagePlaceholder}`.trim();
  }

  return isHindi
    ? `# ${topic}: पुस्तक मसौदा

## Outline
1. ${topic} की आधारभूत समझ
2. मुख्य अवधारणाएँ
3. व्यावहारिक उपयोग
4. उन्नत विश्लेषण
5. पुनरावृत्ति और आगे की दिशा

## Chapter 1: ${topic} की आधारभूत समझ
${descriptionLine}

### Context
इस पुस्तक का उद्देश्य, पाठक वर्ग और उपयोग बताएं।

### Key Terms
महत्वपूर्ण शब्द और मूल अवधारणाएँ समझाएँ।

### Learning Path
आगे के अध्याय कैसे ज्ञान को विकसित करेंगे, यह बताएँ।

## Chapter 2: मुख्य अवधारणाएँ
विषय की मूल संरचना और प्रमुख सिद्धांत समझाएँ।

### Essential Principles
मुख्य सिद्धांत सरल भाषा में लिखें।

### Models and Frameworks
उपयोगी मॉडल और फ्रेमवर्क बताएँ।

### Common Misunderstandings
आम गलतफहमियों को स्पष्ट करें।

## Chapter 3: व्यावहारिक उपयोग
वास्तविक उपयोग, प्रक्रिया और उदाहरण दें।

### Practical Workflow
काम करने की चरणबद्ध प्रक्रिया बताएँ।

### Tools and Resources
सहायक साधन और स्रोत बताएँ।

### Example Scenario
एक व्यावहारिक उदाहरण समझाएँ।

## Chapter 4: उन्नत विश्लेषण
उन्नत विचार, सीमाएँ और तुलना दें।

### Emerging Ideas
नए रुझानों का उल्लेख करें।

### Critical Evaluation
ताकत और सीमाओं का विश्लेषण करें।

### Integration
उन्नत विचारों को मूल अवधारणाओं से जोड़ें।

## Chapter 5: पुनरावृत्ति और आगे की दिशा
सीख को पक्का करने और आगे बढ़ने के लिए मार्गदर्शन दें।

### Review Questions
पुनरावृत्ति प्रश्न दें।

### Project Ideas
उपयोगी प्रोजेक्ट या असाइनमेंट सुझाव दें।

### Roadmap
आगे की पढ़ाई या कार्ययोजना बताएँ।

## Summary
यह मसौदा आगे संपादन, विस्तार और निर्यात के लिए तैयार है।

${imageBlock || fallbackImagePlaceholder}`.trim()
    : `# ${topic}: Generated Book

## Outline
1. Foundations of ${topic}
2. Core Concepts
3. Applied Practice
4. Advanced Themes
5. Assessment and Next Steps

## Chapter 1: Foundations of ${topic}
${descriptionLine}

### Context
Introduce the purpose, audience, and learning goals for this book.

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

${imageBlock || fallbackImagePlaceholder}`.trim();
}

function ensureImagePlaceholders(content, input) {
  if (!input.includeImages) {
    return content;
  }

  const lines = String(content || "").split("\n");
  const imageLines = lines.filter(
    (line) =>
      /^\[IMAGE:\s*(.+?)\]$/i.test(line.trim()) ||
      /^!\[[^\]]+\]\((generated-image:\/\/|https?:\/\/)/i.test(line.trim())
  );

  if (imageLines.length >= 3) {
    return content;
  }

  const sectionHeadings = lines
    .filter((line) => line.startsWith("## ") && !/^##\s*(abstract|table of contents|conclusion)\b/i.test(line))
    .map((line) => line.replace(/^##\s*/, "").trim());
  const fallbackDescriptions =
    sectionHeadings.length > 0
      ? sectionHeadings.slice(0, 4).map((heading) => `${input.topic} visual for ${heading}`)
      : [
          `${input.topic} overview diagram`,
          `${input.topic} conceptual framework`,
          `${input.topic} process flow`,
          `${input.topic} analytical comparison`,
        ];

  let added = imageLines.length;
  const result = [...lines];

  const buildImageUrl = (description) => {
    const topic = String(input.topic || "").trim();
    const seed = encodeURIComponent(
      `${topic || "book"}-${description || "visual"}-${input.documentType || "document"}`
        .toLowerCase()
        .replace(/\s+/g, "-")
    );
    return `https://picsum.photos/seed/${seed}/1200/700`;
  };

  for (let index = 0; index < result.length && added < 3; index += 1) {
    if (!result[index].startsWith("## ")) {
      continue;
    }

    const description = fallbackDescriptions[added] || `${input.topic} supporting visual ${added + 1}`;
    result.splice(
      index + 1,
      0,
      `![${description}](${buildImageUrl(description)})`,
      `Caption: ${description}.`,
      "Relevance: This image supports the discussion in this section.",
      ""
    );
    added += 1;
    index += 4;
  }

  while (added < 3) {
    const description = fallbackDescriptions[added] || `${input.topic} supporting visual ${added + 1}`;
    result.push(
      "",
      `![${description}](${buildImageUrl(description)})`,
      `Caption: ${description}.`,
      "Relevance: This image supports the topic."
    );
    added += 1;
  }

  if (added < 4 && input.colorMode === "color") {
    const description = fallbackDescriptions[added] || `${input.topic} summary visual`;
    result.push(
      "",
      `![${description}](${buildImageUrl(description)})`,
      `Caption: ${description}.`,
      "Relevance: This image provides an additional visual summary."
    );
  }

  return result.join("\n");
}

function finalizeGeneratedContent(content, input) {
  const withImages = ensureImagePlaceholders(content, input);
  return limitMarkdownToPageCount(withImages, input.requestedPages, 450);
}

async function generateWithConfiguredProvider(input) {
  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase();
  const prompt = buildBookPrompt(input);

  if (provider === "mock") {
    const content = finalizeGeneratedContent(buildMockBook(input), input);

    return {
      provider,
      content,
      usage: {
        promptTokens: estimateTokenCount(prompt),
        completionTokens: estimateTokenCount(content),
        totalTokens: estimateTokenCount(prompt) + estimateTokenCount(content),
        source: "estimated",
      },
    };
  }

  const apiKey = process.env.AI_API_KEY;
  const apiUrl = resolveApiUrl(provider, process.env.AI_API_URL);
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
        content: prompt,
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

  const normalizedContent = finalizeGeneratedContent(content, input);

  return {
    provider,
    content: normalizedContent,
    usage: {
      promptTokens: Number(data?.usage?.prompt_tokens) || estimateTokenCount(prompt),
      completionTokens:
        Number(data?.usage?.completion_tokens) || estimateTokenCount(normalizedContent),
      totalTokens:
        Number(data?.usage?.total_tokens) ||
        estimateTokenCount(prompt) + estimateTokenCount(normalizedContent),
      source: data?.usage ? "provider" : "estimated",
    },
  };
}

async function streamWithConfiguredProvider(input, handlers = {}) {
  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase();
  const prompt = buildBookPrompt(input);

  if (provider === "mock") {
    const content = finalizeGeneratedContent(buildMockBook(input), input);
    handlers.onDelta?.(content, content);
    return {
      provider,
      content,
      usage: {
        promptTokens: estimateTokenCount(prompt),
        completionTokens: estimateTokenCount(content),
        totalTokens: estimateTokenCount(prompt) + estimateTokenCount(content),
        source: "estimated",
      },
    };
  }

  const apiKey = process.env.AI_API_KEY;
  const apiUrl = resolveApiUrl(provider, process.env.AI_API_URL);
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
        content: prompt,
      },
    ],
    temperature: 0.7,
    stream: true,
  });

  let accumulated = "";

  await requestSseStream(
    apiUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Authorization: `Bearer ${apiKey}`,
      },
    },
    payload,
    {
      signal: handlers.signal,
      onData: (frame) => {
        const delta = frame?.choices?.[0]?.delta?.content || "";
        if (!delta) {
          return;
        }

        accumulated += delta;
        handlers.onDelta?.(delta, accumulated);
      },
    }
  );

  const normalizedContent = finalizeGeneratedContent(accumulated, input);

  return {
    provider,
    content: normalizedContent,
    usage: {
      promptTokens: estimateTokenCount(prompt),
      completionTokens: estimateTokenCount(normalizedContent),
      totalTokens: estimateTokenCount(prompt) + estimateTokenCount(normalizedContent),
      source: "estimated",
    },
  };
}

module.exports = {
  generateWithConfiguredProvider,
  streamWithConfiguredProvider,
};
