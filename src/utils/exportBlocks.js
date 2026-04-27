const { toStructuredParagraphs } = require("./markdown");
const { resolveImageToBase64 } = require("./imageData");

async function resolveImageBlock(item) {
  const resolved = await resolveImageToBase64({
    src: item?.src || "",
    caption: item?.text || "Generated image",
    timeoutMs: 10000,
  });
  if (resolved) {
    return {
      ...item,
      imageDataUrl: resolved.dataUrl,
      imageMimeType: resolved.mimeType,
      imageBytes: resolved.buffer?.length || 0,
      imageSource: resolved.source || "",
    };
  }

  return {
    ...item,
    imageDataUrl: "",
    imageMimeType: "",
    imageBytes: 0,
    imageSource: "",
  };
}

async function serializeExportBlocks(markdown, options = {}) {
  const maxImages = Math.max(1, Number(options.maxImages) || 8);
  const items = toStructuredParagraphs(String(markdown || ""));
  let resolvedImageCount = 0;

  const blocks = [];
  for (const item of items) {
    if (item.type !== "image") {
      blocks.push(item);
      continue;
    }

    if (resolvedImageCount >= maxImages) {
      blocks.push({
        ...item,
        imageDataUrl: "",
        imageMimeType: "",
        imageBytes: 0,
        imageSource: "",
      });
      continue;
    }

    const resolved = await resolveImageBlock(item);
    blocks.push(resolved);
    resolvedImageCount += 1;
  }

  return blocks;
}

module.exports = {
  serializeExportBlocks,
};
