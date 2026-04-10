const express = require("express");

const { generateWithConfiguredProvider } = require("../services/aiProviders");
const {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
} = require("../store/projectStore");
const { createDocxBuffer, createPdfBuffer } = require("../utils/exporters");
const { extractOutline } = require("../utils/markdown");
const { createPaymentOrder, getPaymentConfig, verifyPaymentSignature } = require("../utils/payments");
const { calculateProjectPricing, getPricingConfig, normalizeUsage } = require("../utils/pricing");

const router = express.Router();

function normalizeInput(body = {}) {
  return {
    topic: String(body.topic || "").trim(),
    description: String(body.description || "").trim(),
    bookType: String(body.bookType || "").trim().toLowerCase(),
  };
}

function serializeProject(project) {
  if (!project) {
    return null;
  }

  const paymentStatus = project.payment?.status || "unpaid";
  const canUnlock = paymentStatus === "paid";
  const pricing = project.pricing || calculateProjectPricing({
    content: project.content || "",
    usage: project.usage || {},
  });
  const previewContent = pricing.previewContent || "";

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
      amountInr: project.payment?.amountInr || pricing.totalChargeInr,
    },
  };
}

async function loadProjectOr404(req, res) {
  const project = await getProjectById(req.params.id);

  if (!project) {
    res.status(404).json({ message: "Project not found." });
    return null;
  }

  return project;
}

router.get("/", async (_req, res) => {
  const projects = await listProjects();
  res.json(projects.map(serializeProject));
});

router.get("/config", async (_req, res) => {
  const pricing = getPricingConfig();
  const payment = getPaymentConfig();

  res.json({
    pricing: {
      currency: pricing.currency,
      platformFeeInr: pricing.platformFeeInr,
      inputCostPer1kTokensInr: pricing.inputCostPer1kTokensInr,
      outputCostPer1kTokensInr: pricing.outputCostPer1kTokensInr,
      previewPageLimit: pricing.previewPageLimit,
      wordsPerPage: pricing.wordsPerPage,
    },
    payment: {
      mode: payment.mode,
      razorpayKeyId: payment.razorpayKeyId,
    },
  });
});

router.post("/generate", async (req, res) => {
  try {
    const input = normalizeInput(req.body);

    if (!input.topic || !input.bookType) {
      return res.status(400).json({
        message: "Topic and book type are required.",
      });
    }

    const generated = await generateWithConfiguredProvider(input);
    const outline = extractOutline(generated.content);
    const usage = normalizeUsage(generated.usage, generated.content);
    const pricing = calculateProjectPricing({
      content: generated.content,
      usage,
    });

    const project = await createProject({
      ...input,
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
        message: "Unlock the book before editing the full content.",
      });
    }

    const content = String(req.body.content || "");
    const pricing = calculateProjectPricing({
      content,
      usage: currentProject.usage || {},
    });

    const updates = {
      topic: String(req.body.topic || "").trim(),
      description: String(req.body.description || "").trim(),
      bookType: String(req.body.bookType || "").trim().toLowerCase(),
      content,
      outline: extractOutline(content),
      usage: currentProject.usage || {},
      pricing: {
        ...pricing,
        tokenCostInr: currentProject.pricing?.tokenCostInr || pricing.tokenCostInr,
        totalChargeInr: currentProject.pricing?.totalChargeInr || pricing.totalChargeInr,
        platformFeeInr: currentProject.pricing?.platformFeeInr || pricing.platformFeeInr,
        inputCostPer1kTokensInr:
          currentProject.pricing?.inputCostPer1kTokensInr || pricing.inputCostPer1kTokensInr,
        outputCostPer1kTokensInr:
          currentProject.pricing?.outputCostPer1kTokensInr || pricing.outputCostPer1kTokensInr,
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
        message: "Pay and unlock the book before downloading exports.",
        pricing: project.pricing,
      });
    }

    const kind = String(req.params.kind || "").toLowerCase();
    const fileName = `${project.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "book"}.${kind}`;

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
      const buffer = await createPdfBuffer(project.content);
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
