const { buildPreviewMarkdown, countWords, paginateStructuredParagraphs, toStructuredParagraphs } = require("./markdown");

function toMoneyNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function estimateTokenCount(value = "") {
  const normalized = String(value).trim();
  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

function normalizeUsage(usage = {}, content = "") {
  const promptTokens = Math.max(0, Number(usage.promptTokens) || 0);
  const completionTokens =
    Math.max(0, Number(usage.completionTokens) || 0) ||
    estimateTokenCount(content);
  const totalTokens =
    Math.max(0, Number(usage.totalTokens) || 0) ||
    promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    source: usage.source || "estimated",
  };
}

function getPricingConfig() {
  return {
    currency: "INR",
    paymentMode: (process.env.PAYMENT_MODE || "demo").toLowerCase(),
    platformFeeInr: toMoneyNumber(process.env.PLATFORM_FEE_INR, 50),
    inputCostPer1kTokensInr: toMoneyNumber(
      process.env.INPUT_COST_PER_1K_TOKENS_INR,
      0.4
    ),
    outputCostPer1kTokensInr: toMoneyNumber(
      process.env.OUTPUT_COST_PER_1K_TOKENS_INR,
      1.2
    ),
    previewPageLimit: Math.max(1, Number(process.env.PREVIEW_PAGE_LIMIT) || 3),
    wordsPerPage: Math.max(120, Number(process.env.WORDS_PER_PREVIEW_PAGE) || 450),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  };
}

function calculateProjectPricing({ content = "", usage = {} }) {
  const config = getPricingConfig();
  const normalizedUsage = normalizeUsage(usage, content);
  const promptCostInr =
    (normalizedUsage.promptTokens / 1000) * config.inputCostPer1kTokensInr;
  const completionCostInr =
    (normalizedUsage.completionTokens / 1000) *
    config.outputCostPer1kTokensInr;
  const tokenCostInr = promptCostInr + completionCostInr;
  const paragraphPages = paginateStructuredParagraphs(
    toStructuredParagraphs(content),
    config.wordsPerPage
  );

  return {
    currency: config.currency,
    paymentMode: config.paymentMode,
    previewPageLimit: config.previewPageLimit,
    wordsPerPage: config.wordsPerPage,
    platformFeeInr: Number(config.platformFeeInr.toFixed(2)),
    inputCostPer1kTokensInr: Number(config.inputCostPer1kTokensInr.toFixed(4)),
    outputCostPer1kTokensInr: Number(config.outputCostPer1kTokensInr.toFixed(4)),
    tokenCostInr: Number(tokenCostInr.toFixed(2)),
    totalChargeInr: Number((tokenCostInr + config.platformFeeInr).toFixed(2)),
    wordCount: countWords(content),
    estimatedPages: paragraphPages.length || 1,
    previewContent: buildPreviewMarkdown(
      content,
      config.previewPageLimit,
      config.wordsPerPage
    ),
  };
}

module.exports = {
  calculateProjectPricing,
  estimateTokenCount,
  getPricingConfig,
  normalizeUsage,
};
