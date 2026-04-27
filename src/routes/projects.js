const express = require("express");

const { requireAuth } = require("./auth");
const {
  generateWithConfiguredProvider,
  streamWithConfiguredProvider,
} = require("../services/aiProviders");
const {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
} = require("../store/projectStore");
const { incrementUserGeneratedCount } = require("../store/userStore");
const { createDocxBuffer, createPdfBuffer } = require("../utils/exporters");
const { serializeExportBlocks } = require("../utils/exportBlocks");
const {
  createSignedExportPayload,
  getExportUrlTtlSeconds,
  verifySignedExportPayload,
} = require("../utils/exportTokens");
const { extractOutline } = require("../utils/markdown");
const {
  createPaymentOrder,
  getPaymentConfig,
  verifyPaymentSignature,
} = require("../utils/payments");
const {
  calculateProjectPricing,
  getDefaultPaperSize,
  getPricingConfig,
  isWithinFreeTrial,
  normalizeUsage,
} = require("../utils/pricing");
const { sanitizeUser } = require("../utils/auth");

const router = express.Router();

function normalizeInput(body = {}) {
  const documentType = String(body.documentType || body.bookType || "").trim().toLowerCase();
  const language = String(body.language || "").trim().toLowerCase() || "english";
  const includeImages = Boolean(body.includeImages);
  const colorMode = String(body.colorMode || "").trim().toLowerCase() || "standard";
  const requestedPages = Math.max(1, Math.min(200, Number(body.requestedPages) || 10));

  return {
    topic: String(body.topic || "").trim(),
    description: String(body.description || "").trim(),
    documentType,
    language: language === "hindi" ? "hindi" : "english",
    includeImages,
    colorMode: includeImages && colorMode === "color" ? "color" : "standard",
    paperSize: String(body.paperSize || "").trim() || getDefaultPaperSize(documentType),
    requestedPages,
  };
}

function serializeProject(project) {
  if (!project) {
    return null;
  }

  const paymentStatus = project.payment?.status || "unpaid";
  const isPaid = paymentStatus === "paid";
  const previewContent = project.pricing?.previewContent || "";
  const fullContent = project.content || "";

  return {
    ...project,
    content: isPaid ? fullContent : previewContent,
    previewContent,
    hasLockedContent: !isPaid && previewContent !== fullContent,
    canEdit: isPaid,
    canDownload: isPaid,
    paymentRequired: !isPaid,
    payment: {
      status: paymentStatus,
      orderId: project.payment?.orderId || "",
      paymentId: project.payment?.paymentId || "",
      paidAt: project.payment?.paidAt || null,
      amountInr: project.payment?.amountInr || project.pricing?.totalChargeInr || 0,
    },
  };
}

function createProjectSummary(projects = [], user) {
  const generatedDocuments = projects.length;
  const paidDocuments = projects.filter((project) => project.payment?.status === "paid").length;
  const totalPaidInr = projects.reduce((sum, project) => {
    if (project.payment?.status !== "paid") {
      return sum;
    }
    return sum + Math.max(0, Number(project.payment?.amountInr || project.pricing?.totalChargeInr) || 0);
  }, 0);
  const generatedCount = Math.max(0, Number(user?.generatedCount) || 0);

  return {
    generatedDocuments,
    paidDocuments,
    totalPaidInr,
    generatedCount,
    freeGenerationsRemaining: Math.max(0, 2 - generatedCount),
    freeTrialActive:
      typeof projects[0]?.pricing?.freeTrialActive === "boolean"
        ? projects[0].pricing.freeTrialActive
        : isWithinFreeTrial(user?.createdAt),
    profile: sanitizeUser(user),
  };
}

async function loadProjectOr404(req, res) {
  const project = await getProjectById(req.params.id);

  if (!project || String(project.userId) !== String(req.user._id)) {
    res.status(404).json({ message: "Project not found." });
    return null;
  }

  return project;
}

async function sendProjectExport(res, project, kind) {
  if (project.payment?.status !== "paid") {
    return res.status(402).json({
      message: "Pay and unlock the document before downloading exports.",
      pricing: project.pricing,
    });
  }

  const safeKind = String(kind || "").toLowerCase();
  const fileBase = project.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "document";
  const fileName = `${fileBase}.${safeKind}`;

  if (safeKind === "docx") {
    const buffer = await createDocxBuffer(project.content, {
      blocks: project.exportBlocks || [],
    });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  }

  if (safeKind === "pdf") {
    const buffer = await createPdfBuffer(project.content, {
      paperSize: project.paperSize || "A4",
      blocks: project.exportBlocks || [],
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  }

  return res.status(400).json({ message: "Unsupported export format." });
}

router.get("/signed-export/:id/:kind", async (req, res) => {
  try {
    const projectId = String(req.params.id || "").trim();
    const kind = String(req.params.kind || "").trim().toLowerCase();
    const expiresAt = Number(req.query.expiresAt);
    const signature = String(req.query.signature || "").trim();

    const valid = verifySignedExportPayload({
      projectId,
      kind,
      expiresAt,
      signature,
    });

    if (!valid) {
      return res.status(401).json({ message: "Export link is invalid or expired." });
    }

    const project = await getProjectById(projectId);

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    return sendProjectExport(res, project, kind);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to export project.",
    });
  }
});

router.get("/config", async (req, res) => {
  const pricing = getPricingConfig();
  const payment = getPaymentConfig();

  res.json({
    pricing: {
      currency: pricing.currency,
      platformFeeInr: pricing.platformFeeInr,
      colorImageChargeInr: pricing.imageChargeInr,
      inputCostPer1kTokensInr: pricing.inputCostPer1kTokensInr,
      outputCostPer1kTokensInr: pricing.outputCostPer1kTokensInr,
      previewPageLimit: pricing.previewPageLimit,
      wordsPerPage: pricing.wordsPerPage,
      freeTrialDays: pricing.freeTrialDays,
    },
    payment: {
      mode: payment.mode,
      razorpayKeyId: payment.razorpayKeyId,
    },
    options: {
      languages: [
        { value: "english", label: "English" },
        { value: "hindi", label: "Hindi" },
      ],
      documentTypes: [
        { value: "book", label: "Book", paperSize: getDefaultPaperSize("book") },
        {
          value: "research-paper",
          label: "Research Paper",
          paperSize: getDefaultPaperSize("research-paper"),
        },
        { value: "topic-note", label: "Topic Note", paperSize: getDefaultPaperSize("topic-note") },
      ],
    },
  });
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const projects = await listProjects(String(req.user._id));
    const serialized = projects.map(serializeProject);

    res.json({
      projects: serialized,
      summary: createProjectSummary(serialized, req.user),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to load projects.",
    });
  }
});

router.post("/generate/stream", async (req, res) => {
  const input = normalizeInput(req.body);
  const userId = String(req.user._id);

  if (!input.topic || !input.documentType) {
    return res.status(400).json({
      message: "Topic and document type are required.",
    });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const abortController = new AbortController();
  req.on("close", () => {
    abortController.abort();
  });

  const writeChunk = (payload) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  try {
    const freeGenerationGranted = Math.max(0, Number(req.user.generatedCount) || 0) < 2;
    const generated = await streamWithConfiguredProvider(input, {
      signal: abortController.signal,
      onDelta: (_delta, accumulated) => {
        writeChunk({ type: "delta", content: accumulated });
      },
    });
    const outline = extractOutline(generated.content);
    const usage = normalizeUsage(generated.usage, generated.content);
    const pricing = calculateProjectPricing({
      content: generated.content,
      usage,
      userCreatedAt: req.user.createdAt,
      includeImages: input.includeImages,
      colorMode: input.colorMode,
      requestedPages: input.requestedPages,
      freeGenerationGranted,
      documentType: input.documentType,
    });

    const project = await createProject({
      ...input,
      userId,
      paperSize: input.paperSize || pricing.paperSize,
      requestedPages: input.requestedPages,
      provider: generated.provider,
      outline,
      content: generated.content,
      exportBlocks: await serializeExportBlocks(generated.content),
      usage,
      pricing,
      payment: {
        status: freeGenerationGranted ? "paid" : "unpaid",
        orderId: "",
        paymentId: "",
        signature: "",
        paidAt: freeGenerationGranted ? new Date() : null,
        amountInr: freeGenerationGranted ? 0 : pricing.totalChargeInr,
      },
    });
    const updatedUser = await incrementUserGeneratedCount(userId, 1);
    req.user = updatedUser || req.user;

    writeChunk({
      type: "final",
      project: serializeProject(project.toObject ? project.toObject() : project),
      user: sanitizeUser(req.user),
    });
    return res.end();
  } catch (error) {
    if (error.name === "AbortError") {
      return res.end();
    }

    writeChunk({
      type: "error",
      message: error.message || "Failed to generate project.",
    });
    return res.end();
  }
});

router.post("/generate", async (req, res) => {
  try {
    const input = normalizeInput(req.body);
    const userId = String(req.user._id);

    if (!input.topic || !input.documentType) {
      return res.status(400).json({
        message: "Topic and document type are required.",
      });
    }

    const freeGenerationGranted = Math.max(0, Number(req.user.generatedCount) || 0) < 2;
    const generated = await generateWithConfiguredProvider(input);
    const outline = extractOutline(generated.content);
    const usage = normalizeUsage(generated.usage, generated.content);
    const pricing = calculateProjectPricing({
      content: generated.content,
      usage,
      userCreatedAt: req.user.createdAt,
      includeImages: input.includeImages,
      colorMode: input.colorMode,
      requestedPages: input.requestedPages,
      freeGenerationGranted,
      documentType: input.documentType,
    });

    const project = await createProject({
      ...input,
      userId,
      paperSize: input.paperSize || pricing.paperSize,
      requestedPages: input.requestedPages,
      provider: generated.provider,
      outline,
      content: generated.content,
      exportBlocks: await serializeExportBlocks(generated.content),
      usage,
      pricing,
      payment: {
        status: freeGenerationGranted ? "paid" : "unpaid",
        orderId: "",
        paymentId: "",
        signature: "",
        paidAt: freeGenerationGranted ? new Date() : null,
        amountInr: freeGenerationGranted ? 0 : pricing.totalChargeInr,
      },
    });
    const updatedUser = await incrementUserGeneratedCount(userId, 1);
    req.user = updatedUser || req.user;

    return res.status(201).json({
      project: serializeProject(project.toObject ? project.toObject() : project),
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to generate project.",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const currentProject = await loadProjectOr404(req, res);

    if (!currentProject) {
      return undefined;
    }

    if (currentProject.payment?.status !== "paid") {
      return res.status(403).json({
        message: "Unlock the document before editing the full content.",
      });
    }

    const input = normalizeInput({
      ...currentProject,
      ...req.body,
    });
    const content = String(req.body.content || "");
    const pricing = calculateProjectPricing({
      content,
      usage: currentProject.usage || {},
      userCreatedAt: req.user.createdAt,
      includeImages: input.includeImages,
      colorMode: input.colorMode,
      requestedPages: input.requestedPages,
      documentType: input.documentType,
    });

    const updates = {
      topic: input.topic,
      description: input.description,
      documentType: input.documentType,
      language: input.language,
      paperSize: input.paperSize || pricing.paperSize,
      requestedPages: input.requestedPages,
      includeImages: input.includeImages,
      colorMode: input.colorMode,
      content,
      exportBlocks: await serializeExportBlocks(content),
      outline: extractOutline(content),
      usage: currentProject.usage || {},
      pricing: {
        ...pricing,
        tokenCostInr: currentProject.pricing?.tokenCostInr || pricing.tokenCostInr,
        totalChargeInr: currentProject.pricing?.totalChargeInr || pricing.totalChargeInr,
      },
      payment: currentProject.payment,
    };

    const project = await updateProject(req.params.id, updates);

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.json(serializeProject(project.toObject ? project.toObject() : project));
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to update project.",
    });
  }
});

router.post("/:id/payment/order", async (req, res) => {
  try {
    const project = await loadProjectOr404(req, res);

    if (!project) {
      return undefined;
    }

    if (project.payment?.status === "paid") {
      return res.json({
        alreadyPaid: true,
        project: serializeProject(project),
      });
    }

    const order = await createPaymentOrder({
      amountInr: project.pricing?.totalChargeInr,
      projectId: project._id,
      topic: project.topic,
    });

    const updated = await updateProject(req.params.id, {
      payment: {
        ...(project.payment || {}),
        status: "unpaid",
        orderId: order.id,
        amountInr: project.pricing?.totalChargeInr,
      },
    });

    return res.json({
      order,
      project: serializeProject(updated.toObject ? updated.toObject() : updated),
      payment: {
        mode: getPaymentConfig().mode,
        razorpayKeyId: getPaymentConfig().razorpayKeyId,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to create payment order.",
    });
  }
});

router.post("/:id/payment/verify", async (req, res) => {
  try {
    const project = await loadProjectOr404(req, res);

    if (!project) {
      return undefined;
    }

    const paymentMode = getPaymentConfig().mode;
    const orderId = String(req.body.orderId || project.payment?.orderId || "").trim();
    const paymentId = String(req.body.paymentId || "").trim();
    const signature = String(req.body.signature || "").trim();

    if (!orderId) {
      return res.status(400).json({ message: "Payment order id is required." });
    }

    if (paymentMode === "razorpay") {
      if (!paymentId || !signature) {
        return res.status(400).json({
          message: "Razorpay payment id and signature are required.",
        });
      }

      const valid = verifyPaymentSignature({ orderId, paymentId, signature });

      if (!valid) {
        return res.status(400).json({ message: "Payment verification failed." });
      }
    }

    const updated = await updateProject(req.params.id, {
      payment: {
        ...(project.payment || {}),
        status: "paid",
        orderId,
        paymentId: paymentId || `demo_payment_${Date.now()}`,
        signature,
        paidAt: new Date(),
        amountInr: project.pricing?.totalChargeInr,
      },
    });

    return res.json({
      success: true,
      project: serializeProject(updated.toObject ? updated.toObject() : updated),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to verify payment.",
    });
  }
});

router.get("/:id/export-link/:kind", async (req, res) => {
  try {
    const project = await loadProjectOr404(req, res);

    if (!project) {
      return undefined;
    }

    const kind = String(req.params.kind || "").trim().toLowerCase();

    if (!["pdf", "docx"].includes(kind)) {
      return res.status(400).json({ message: "Unsupported export format." });
    }

    if (project.payment?.status !== "paid") {
      return res.status(402).json({
        message: "Pay and unlock the document before downloading exports.",
        pricing: project.pricing,
      });
    }

    const signed = createSignedExportPayload({
      projectId: project._id,
      kind,
    });

    return res.json({
      url: `/api/projects/signed-export/${project._id}/${kind}?expiresAt=${signed.expiresAt}&signature=${signed.signature}`,
      expiresAt: signed.expiresAt,
      ttlSeconds: getExportUrlTtlSeconds(),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to create export link.",
    });
  }
});

router.get("/:id/export/:kind", async (req, res) => {
  try {
    const project = await loadProjectOr404(req, res);

    if (!project) {
      return undefined;
    }
    return sendProjectExport(res, project, req.params.kind);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to export project.",
    });
  }
});

module.exports = router;
