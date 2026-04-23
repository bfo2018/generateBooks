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
    platformFeeInr: toMoneyNumber(process.env.PLATFORM_FEE_INR, 9),
    freeTrialDays: Math.max(0, Number(process.env.FREE_TRIAL_DAYS) || 10),
    inputCostPer1kTokensInr: toMoneyNumber(
      process.env.INPUT_COST_PER_1K_TOKENS_INR,
      0.4
    ),
    outputCostPer1kTokensInr: toMoneyNumber(
      process.env.OUTPUT_COST_PER_1K_TOKENS_INR,
      1.2
    ),
    imageChargeInr: toMoneyNumber(process.env.COLOR_IMAGE_CHARGE_INR, 19),
    previewPageLimit: Math.max(1, Number(process.env.PREVIEW_PAGE_LIMIT) || 3),
    wordsPerPage: Math.max(120, Number(process.env.WORDS_PER_PREVIEW_PAGE) || 450),
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  };
}

function getDefaultPaperSize(documentType) {
  if (documentType === "topic-note") {
    return "A5";
  }

  if (documentType === "research-paper") {
    return "Letter";
  }

  return "A4";
}

function isWithinFreeTrial(userCreatedAt) {
  if (!userCreatedAt) {
    return false;
  }

  const config = getPricingConfig();
  const createdAt = new Date(userCreatedAt);
  const diffMs = Date.now() - createdAt.getTime();
  return diffMs <= config.freeTrialDays * 24 * 60 * 60 * 1000;
}

function calculateProjectPricing({
  content = "",
  usage = {},
  userCreatedAt,
  includeImages = false,
  colorMode = "standard",
  requestedPages = 10,
  freeGenerationGranted = false,
  documentType = "book",
}) {
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
  const platformFeeInr = freeGenerationGranted
    ? 0
    : isWithinFreeTrial(userCreatedAt)
      ? 0
      : config.platformFeeInr;
  const imageChargeInr =
    freeGenerationGranted ? 0 : includeImages && colorMode === "color" ? config.imageChargeInr : 0;
  const effectiveTokenCostInr = freeGenerationGranted ? 0 : tokenCostInr;

  return {
    currency: config.currency,
    paymentMode: config.paymentMode,
    previewPageLimit: config.previewPageLimit,
    wordsPerPage: config.wordsPerPage,
    platformFeeInr: Number(platformFeeInr.toFixed(2)),
    inputCostPer1kTokensInr: Number(config.inputCostPer1kTokensInr.toFixed(4)),
    outputCostPer1kTokensInr: Number(config.outputCostPer1kTokensInr.toFixed(4)),
    imageChargeInr: Number(imageChargeInr.toFixed(2)),
    tokenCostInr: Number(effectiveTokenCostInr.toFixed(2)),
    totalChargeInr: Number((effectiveTokenCostInr + platformFeeInr + imageChargeInr).toFixed(2)),
    wordCount: countWords(content),
    estimatedPages: paragraphPages.length || 1,
    requestedPages: Math.max(1, Number(requestedPages) || 10),
    paperSize: getDefaultPaperSize(documentType),
    freeGenerationGranted: Boolean(freeGenerationGranted),
    freeTrialActive: isWithinFreeTrial(userCreatedAt),
    previewContent: buildPreviewMarkdown(
      content,
      config.previewPageLimit,
      config.wordsPerPage
    ),
  };
}

function estimateGenerationPricing({
  requestedPages = 10,
  includeImages = false,
  colorMode = "standard",
  userCreatedAt,
}) {
  const config = getPricingConfig();
  const safePages = Math.max(1, Number(requestedPages) || 10);
  const estimatedOutputTokens = Math.max(300, Math.round(safePages * config.wordsPerPage * 1.35));
  const estimatedPromptTokens = Math.max(180, Math.round(220 + safePages * 12));
  const tokenCostInr =
    (estimatedPromptTokens / 1000) * config.inputCostPer1kTokensInr +
    (estimatedOutputTokens / 1000) * config.outputCostPer1kTokensInr;
  const platformFeeInr = isWithinFreeTrial(userCreatedAt) ? 0 : config.platformFeeInr;
  const imageChargeInr = includeImages && colorMode === "color" ? config.imageChargeInr : 0;

  return {
    requestedPages: safePages,
    estimatedPromptTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedPromptTokens + estimatedOutputTokens,
    tokenCostInr: Number(tokenCostInr.toFixed(2)),
    platformFeeInr: Number(platformFeeInr.toFixed(2)),
    imageChargeInr: Number(imageChargeInr.toFixed(2)),
    totalChargeInr: Number((tokenCostInr + platformFeeInr + imageChargeInr).toFixed(2)),
    wordsPerPage: config.wordsPerPage,
  };
}

module.exports = {
  calculateProjectPricing,
  estimateGenerationPricing,
  estimateTokenCount,
  getDefaultPaperSize,
  getPricingConfig,
  isWithinFreeTrial,
  normalizeUsage,
};
