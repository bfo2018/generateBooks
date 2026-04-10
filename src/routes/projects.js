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

const router = express.Router();

function normalizeInput(body = {}) {
  return {
    topic: String(body.topic || "").trim(),
    description: String(body.description || "").trim(),
    bookType: String(body.bookType || "").trim().toLowerCase(),
  };
}

router.get("/", async (_req, res) => {
  const projects = await listProjects();
  res.json(projects);
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

    const project = await createProject({
      ...input,
      provider: generated.provider,
      outline,
      content: generated.content,
    });

    return res.status(201).json(project);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to generate project.",
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updates = {
      topic: String(req.body.topic || "").trim(),
      description: String(req.body.description || "").trim(),
      bookType: String(req.body.bookType || "").trim().toLowerCase(),
      content: String(req.body.content || ""),
    };

    updates.outline = extractOutline(updates.content);

    const project = await updateProject(req.params.id, updates);

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    return res.json(project);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to update project.",
    });
  }
});

router.get("/:id/export/docx", async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const buffer = await createDocxBuffer(project.content);
    const fileName = `${project.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "book"}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to export DOCX.",
    });
  }
});

router.get("/:id/export/pdf", async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    const buffer = await createPdfBuffer(project.content);
    const fileName = `${project.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "book"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to export PDF.",
    });
  }
});

module.exports = router;
