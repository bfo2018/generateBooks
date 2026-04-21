const express = require("express");

const { requireAuth } = require("./auth");
const { generateWithConfiguredProvider } = require("../services/aiProviders");
const {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
} = require("../store/projectStore");
const { createDocxBuffer, createPdfBuffer } = require("../utils/exporters");
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

router.use(requireAuth);

function normalizeInput(body = {}) {
  const documentType = String(body.documentType || body.bookType || "").trim().toLowerCase();
  const language = String(body.language || "").trim().toLowerCase() || "english";
  const includeImages = Boolean(body.includeImages);
  const colorMode = String(body.colorMode || "").trim().toLowerCase() || "standard";

  return {
    topic: String(body.topic || "").trim(),
    description: String(body.description || "").trim(),
    documentType,
    language: language === "hindi" ? "hindi" : "english",
    includeImages,
    colorMode: includeImages && colorMode === "color" ? "color" : "standard",
    paperSize: String(body.paperSize || "").trim() || getDefaultPaperSize(documentType),
  };
}

function serializeProject(project) {
  if (!project) {
    return null;
  }

  const paymentStatus = project.payment?.status || "unpaid";
  const canUnlock = paymentStatus === "paid";
  const previewContent = project.pricing?.previewContent || "";

  return {
    ...project,
    content: canUnlock ? project.content : previewContent,
    previewContent,
    hasLockedContent: !canUnlock && previewContent !== (project.content || ""),
    canEdit: canUnlock,
    canDownload: canUnlock,
    paymentRequired: true,
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

  return {
    generatedDocuments,
    paidDocuments,
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

router.get("/", async (req, res) => {
  const projects = await listProjects(String(req.user._id));
  const serialized = projects.map(serializeProject);

  res.json({
    projects: serialized,
    summary: createProjectSummary(serialized, req.user),
  });
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

router.post("/generate", async (req, res) => {
  try {
    const input = normalizeInput(req.body);

    if (!input.topic || !input.documentType) {
      return res.status(400).json({
        message: "Topic and document type are required.",
      });
    }

    const generated = await generateWithConfiguredProvider(input);
    const outline = extractOutline(generated.content);
    const usage = normalizeUsage(generated.usage, generated.content);
    const pricing = calculateProjectPricing({
      content: generated.content,
      usage,
      userCreatedAt: req.user.createdAt,
      includeImages: input.includeImages,
      colorMode: input.colorMode,
      documentType: input.documentType,
    });

    const project = await createProject({
      ...input,
      userId: String(req.user._id),
      paperSize: input.paperSize || pricing.paperSize,
      provider: generated.provider,
      outline,
      content: generated.content,
      usage,
      pricing,
      payment: {
        status: "unpaid",
        orderId: "",
        paymentId: "",
        signature: "",
        paidAt: null,
        amountInr: pricing.totalChargeInr,
      },
    });

    return res.status(201).json(serializeProject(project.toObject ? project.toObject() : project));
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
      documentType: input.documentType,
    });

    const updates = {
      topic: input.topic,
      description: input.description,
      documentType: input.documentType,
      language: input.language,
      paperSize: input.paperSize || pricing.paperSize,
      includeImages: input.includeImages,
      colorMode: input.colorMode,
      content,
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

router.get("/:id/export/:kind", async (req, res) => {
  try {
    const project = await loadProjectOr404(req, res);

    if (!project) {
      return undefined;
    }

    if (project.payment?.status !== "paid") {
      return res.status(402).json({
        message: "Pay and unlock the document before downloading exports.",
        pricing: project.pricing,
      });
    }

    const kind = String(req.params.kind || "").toLowerCase();
    const fileBase =
      project.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "document";
    const fileName = `${fileBase}.${kind}`;

    if (kind === "docx") {
      const buffer = await createDocxBuffer(project.content);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    if (kind === "pdf") {
      const buffer = await createPdfBuffer(project.content, {
        paperSize: project.paperSize || "A4",
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    return res.status(400).json({ message: "Unsupported export format." });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to export project.",
    });
  }
});

module.exports = router;
