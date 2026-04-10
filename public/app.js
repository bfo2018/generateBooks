const state = {
  provider: "loading",
  paymentMode: "loading",
  paymentKeyId: "",
  pricingConfig: null,
  projects: [],
  selectedProjectId: null,
};

const elements = {
  generatorForm: document.getElementById("generatorForm"),
  generateButton: document.getElementById("generateButton"),
  refreshProjects: document.getElementById("refreshProjects"),
  projectList: document.getElementById("projectList"),
  providerBadge: document.getElementById("providerBadge"),
  paymentBadge: document.getElementById("paymentBadge"),
  contentEditor: document.getElementById("contentEditor"),
  saveButton: document.getElementById("saveButton"),
  unlockButton: document.getElementById("unlockButton"),
  downloadDocx: document.getElementById("downloadDocx"),
  downloadPdf: document.getElementById("downloadPdf"),
  editorTitle: document.getElementById("editorTitle"),
  editorMeta: document.getElementById("editorMeta"),
  toast: document.getElementById("toast"),
  topic: document.getElementById("topic"),
  description: document.getElementById("description"),
  bookType: document.getElementById("bookType"),
  pricingTotal: document.getElementById("pricingTotal"),
  pricingHint: document.getElementById("pricingHint"),
  tokenUsage: document.getElementById("tokenUsage"),
  pageEstimate: document.getElementById("pageEstimate"),
  previewLimit: document.getElementById("previewLimit"),
  accessState: document.getElementById("accessState"),
  previewScroll: document.getElementById("previewScroll"),
  previewContainer: document.getElementById("previewContainer"),
  lockCard: document.getElementById("lockCard"),
  lockMessage: document.getElementById("lockMessage"),
  lockAction: document.getElementById("lockAction"),
  stickyUnlockBar: document.getElementById("stickyUnlockBar"),
  stickyUnlockLabel: document.getElementById("stickyUnlockLabel"),
  stickyUnlockHint: document.getElementById("stickyUnlockHint"),
  stickyUnlockButton: document.getElementById("stickyUnlockButton"),
  editorLockNotice: document.getElementById("editorLockNotice"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2800);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.blob();

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

function getSelectedProject() {
  return state.projects.find((item) => item._id === state.selectedProjectId) || null;
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function splitMarkdownLines(markdown) {
  return String(markdown || "").replace(/\r\n/g, "\n").split("\n");
}

function toStructuredParagraphs(markdown) {
  return splitMarkdownLines(markdown)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line || lines[index - 1])
    .map((line) => {
      if (line.startsWith("# ")) {
        return { type: "title", text: line.replace(/^# /, "") };
      }
      if (line.startsWith("## ")) {
        return { type: "heading", text: line.replace(/^## /, "") };
      }
      if (line.startsWith("### ")) {
        return { type: "subheading", text: line.replace(/^### /, "") };
      }
      return { type: "body", text: line };
    });
}

function countWords(value = "") {
  const normalized = String(value).trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function estimateParagraphWords(item) {
  const base = Math.max(1, countWords(item.text));

  if (item.type === "title") return base + 20;
  if (item.type === "heading") return base + 14;
  if (item.type === "subheading") return base + 8;

  return base;
}

function paginateMarkdown(markdown, wordsPerPage) {
  const items = toStructuredParagraphs(markdown);
  const safeWordsPerPage = Math.max(120, Number(wordsPerPage) || 450);
  const pages = [];
  let currentPage = [];
  let currentWeight = 0;

  items.forEach((item) => {
    const itemWeight = estimateParagraphWords(item);

    if (currentPage.length && currentWeight + itemWeight > safeWordsPerPage) {
      pages.push(currentPage);
      currentPage = [];
      currentWeight = 0;
    }

    currentPage.push(item);
    currentWeight += itemWeight;
  });

  if (currentPage.length) {
    pages.push(currentPage);
  }

  return pages;
}

function renderPageItem(item) {
  if (!item.text) {
    return "<p>&nbsp;</p>";
  }

  if (item.type === "title") {
    return `<h1>${escapeHtml(item.text)}</h1>`;
  }

  if (item.type === "heading") {
    return `<h2>${escapeHtml(item.text)}</h2>`;
  }

  if (item.type === "subheading") {
    return `<h3>${escapeHtml(item.text)}</h3>`;
  }

  return `<p>${escapeHtml(item.text)}</p>`;
}

function updateActionButtons() {
  const project = getSelectedProject();
  const hasSelection = Boolean(project);
  const isPaid = project?.payment?.status === "paid";

  elements.saveButton.disabled = !isPaid;
  elements.unlockButton.disabled = !hasSelection || isPaid;
  elements.downloadDocx.disabled = !isPaid;
  elements.downloadPdf.disabled = !isPaid;
}

function renderProjects() {
  if (!state.projects.length) {
    elements.projectList.innerHTML =
      '<p class="muted">No AI books yet. Generate your first draft.</p>';
    return;
  }

  elements.projectList.innerHTML = state.projects
    .map((project) => {
      const isActive = project._id === state.selectedProjectId;
      const updated = new Date(project.updatedAt).toLocaleString();
      const accessLabel = project.payment?.status === "paid" ? "Unlocked" : "Locked";

      return `
        <button class="project-card ${isActive ? "active" : ""}" data-id="${project._id}" type="button">
          <h3>${escapeHtml(project.topic)}</h3>
          <p>${escapeHtml(project.bookType)} • ${escapeHtml(project.provider)}</p>
          <p>${accessLabel} • ${formatMoney(project.pricing?.totalChargeInr)}</p>
          <p>Updated ${updated}</p>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".project-card").forEach((button) => {
    button.addEventListener("click", () => {
      selectProject(button.dataset.id);
    });
  });
}

function renderPricing(project) {
  const pricing = project?.pricing;
  const usage = project?.usage;
  const isPaid = project?.payment?.status === "paid";

  elements.pricingTotal.textContent = pricing
    ? formatMoney(pricing.totalChargeInr)
    : "Rs 0.00";
  elements.pricingHint.textContent = pricing
    ? `LLM token cost ${formatMoney(pricing.tokenCostInr)} + platform fee ${formatMoney(
        pricing.platformFeeInr
      )}`
    : "Generate a draft to calculate token-based pricing.";
  elements.tokenUsage.textContent = usage?.totalTokens
    ? usage.totalTokens.toLocaleString()
    : "0";
  elements.pageEstimate.textContent = String(pricing?.estimatedPages || 0);
  elements.previewLimit.textContent = `${pricing?.previewPageLimit || 3} pages`;
  elements.accessState.textContent = isPaid ? "Unlocked" : "Locked";
  elements.lockMessage.textContent = isPaid
    ? "Full preview and exports are unlocked."
    : `Only the first ${pricing?.previewPageLimit || 3} pages are visible until payment clears.`;
  elements.stickyUnlockLabel.textContent = isPaid
    ? "Book unlocked"
    : `Unlock full book for ${formatMoney(pricing?.totalChargeInr)}`;
  elements.stickyUnlockHint.textContent = isPaid
    ? "Full preview and downloads are enabled."
    : "Pay with Razorpay to unlock the full preview, editor, DOCX, and PDF exports.";
}

function renderPreview(project) {
  if (!project) {
    elements.previewContainer.innerHTML = "";
    elements.lockCard.hidden = true;
    elements.stickyUnlockBar.hidden = true;
    return;
  }

  const pricing = project.pricing || {};
  const previewLimit = pricing.previewPageLimit || 3;
  const wordsPerPage = pricing.wordsPerPage || 450;
  const isPaid = project.payment?.status === "paid";
  const pages = paginateMarkdown(project.content || project.previewContent || "", wordsPerPage);

  elements.previewContainer.innerHTML = pages
    .map((page, index) => {
      return `
        <article class="preview-page">
          <div class="preview-page-header">
            <span>Preview Page ${index + 1}</span>
            <span>${escapeHtml(project.topic)}</span>
          </div>
          ${page.map(renderPageItem).join("")}
        </article>
      `;
    })
    .join("");

  if (!isPaid && project.hasLockedContent) {
    elements.previewContainer.insertAdjacentHTML(
      "beforeend",
      `
        <article class="preview-page locked-page">
          <div class="preview-page-header">
            <span>Page ${previewLimit + 1} onward</span>
            <span>Locked</span>
          </div>
          <div class="lock-overlay">
            <div>
              <p class="mini-label">Unlock Required</p>
              <h3>Pay and download the complete AI book</h3>
              <p class="muted">The rest of the chapters, full preview, editor, DOCX, and PDF remain locked.</p>
            </div>
          </div>
        </article>
      `
    );
  }

  elements.lockCard.hidden = isPaid || !project.hasLockedContent;
  elements.stickyUnlockBar.hidden = true;
  elements.previewScroll.scrollTop = 0;
  handlePreviewScroll();
}

function renderEditor(project) {
  if (!project) {
    elements.contentEditor.hidden = true;
    elements.contentEditor.disabled = true;
    elements.contentEditor.value = "";
    elements.editorLockNotice.hidden = true;
    return;
  }

  const isPaid = project?.payment?.status === "paid";
  elements.contentEditor.hidden = !isPaid;
  elements.editorLockNotice.hidden = isPaid;
  elements.contentEditor.disabled = !isPaid;
  elements.contentEditor.value = isPaid ? project.content || "" : "";
}

function selectProject(projectId) {
  const project = state.projects.find((item) => item._id === projectId);
  if (!project) return;

  state.selectedProjectId = projectId;
  elements.topic.value = project.topic;
  elements.description.value = project.description;
  elements.bookType.value = project.bookType;
  elements.editorTitle.textContent = project.topic;
  elements.editorMeta.textContent = `${project.bookType} draft via ${project.provider}`;

  renderPricing(project);
  renderPreview(project);
  renderEditor(project);
  updateActionButtons();
  renderProjects();
}

async function loadHealth() {
  const data = await api("/api/health");
  state.provider = data.provider;
  elements.providerBadge.textContent = `Provider: ${state.provider}`;
}

async function loadConfig() {
  const data = await api("/api/projects/config");
  state.pricingConfig = data.pricing;
  state.paymentMode = data.payment.mode;
  state.paymentKeyId = data.payment.razorpayKeyId;
  elements.paymentBadge.textContent = `Payments: ${state.paymentMode}`;
}

async function loadProjects() {
  const projects = await api("/api/projects");
  state.projects = projects;

  if (state.selectedProjectId) {
    const stillExists = projects.some(
      (project) => project._id === state.selectedProjectId
    );
    if (!stillExists) {
      state.selectedProjectId = null;
    }
  }

  if (!state.selectedProjectId && projects.length) {
    selectProject(projects[0]._id);
    return;
  }

  if (!projects.length) {
    elements.editorTitle.textContent = "Generated Content";
    elements.editorMeta.textContent =
      "Select or generate a project to start editing.";
    renderPreview(null);
    renderEditor(null);
    renderPricing(null);
  }

  renderProjects();
  updateActionButtons();
}

function upsertProject(project) {
  const index = state.projects.findIndex((item) => item._id === project._id);

  if (index === -1) {
    state.projects.unshift(project);
  } else {
    state.projects[index] = project;
  }
}

async function handleGenerate(event) {
  event.preventDefault();
  elements.generateButton.disabled = true;
  elements.generateButton.textContent = "Generating...";

  try {
    const project = await api("/api/projects/generate", {
      method: "POST",
      body: JSON.stringify({
        topic: elements.topic.value,
        description: elements.description.value,
        bookType: elements.bookType.value,
      }),
    });

    upsertProject(project);
    selectProject(project._id);
    renderProjects();
    showToast("AI book draft generated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.generateButton.disabled = false;
    elements.generateButton.textContent = "Generate Book Draft";
  }
}

async function handleSave() {
  const project = getSelectedProject();
  if (!project || project.payment?.status !== "paid") return;

  elements.saveButton.disabled = true;

  try {
    const updated = await api(`/api/projects/${project._id}`, {
      method: "PUT",
      body: JSON.stringify({
        topic: elements.topic.value,
        description: elements.description.value,
        bookType: elements.bookType.value,
        content: elements.contentEditor.value,
      }),
    });

    upsertProject(updated);
    selectProject(updated._id);
    showToast("Project saved.");
  } catch (error) {
    showToast(error.message);
  } finally {
    updateActionButtons();
  }
}

function loadRazorpayScript() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (loadRazorpayScript.promise) {
    return loadRazorpayScript.promise;
  }

  loadRazorpayScript.promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout."));
    document.head.appendChild(script);
  });

  return loadRazorpayScript.promise;
}

async function unlockProject(projectId) {
  const orderResponse = await api(`/api/projects/${projectId}/payment/order`, {
    method: "POST",
  });

  if (orderResponse.alreadyPaid) {
    upsertProject(orderResponse.project);
    selectProject(orderResponse.project._id);
    showToast("This book is already unlocked.");
    return;
  }

  if (orderResponse.payment.mode !== "razorpay") {
    const verification = await api(`/api/projects/${projectId}/payment/verify`, {
      method: "POST",
      body: JSON.stringify({
        orderId: orderResponse.order.id,
      }),
    });

    upsertProject(verification.project);
    selectProject(verification.project._id);
    showToast("Demo payment completed and book unlocked.");
    return;
  }

  await loadRazorpayScript();

  await new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay({
      key: orderResponse.payment.razorpayKeyId,
      amount: orderResponse.order.amount,
      currency: orderResponse.order.currency,
      name: "BookForge AI",
      description: `Unlock full book: ${orderResponse.project.topic}`,
      order_id: orderResponse.order.id,
      handler: async (response) => {
        try {
          const verification = await api(`/api/projects/${projectId}/payment/verify`, {
            method: "POST",
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });

          upsertProject(verification.project);
          selectProject(verification.project._id);
          showToast("Payment verified. Full book unlocked.");
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      modal: {
        ondismiss: () => reject(new Error("Payment was cancelled.")),
      },
      prefill: {},
      theme: {
        color: "#b24c2f",
      },
    });

    razorpay.open();
  });
}

async function handleUnlock() {
  const project = getSelectedProject();
  if (!project || project.payment?.status === "paid") return;

  elements.unlockButton.disabled = true;
  elements.lockAction.disabled = true;
  elements.stickyUnlockButton.disabled = true;

  try {
    await unlockProject(project._id);
  } catch (error) {
    showToast(error.message);
  } finally {
    updateActionButtons();
    elements.lockAction.disabled = false;
    elements.stickyUnlockButton.disabled = false;
  }
}

async function handleDownload(kind) {
  const project = getSelectedProject();
  if (!project) return;

  if (project.payment?.status !== "paid") {
    showToast("Pay and unlock the book before downloading.");
    await handleUnlock();
    return;
  }

  window.location.href = `/api/projects/${project._id}/export/${kind}`;
}

function handlePreviewScroll() {
  const project = getSelectedProject();

  if (!project || project.payment?.status === "paid" || !project.hasLockedContent) {
    elements.stickyUnlockBar.hidden = true;
    return;
  }

  const threshold = elements.previewScroll.scrollHeight * 0.35;
  elements.stickyUnlockBar.hidden = elements.previewScroll.scrollTop < threshold;
}

elements.generatorForm.addEventListener("submit", handleGenerate);
elements.saveButton.addEventListener("click", handleSave);
elements.refreshProjects.addEventListener("click", loadProjects);
elements.unlockButton.addEventListener("click", handleUnlock);
elements.lockAction.addEventListener("click", handleUnlock);
elements.stickyUnlockButton.addEventListener("click", handleUnlock);
elements.downloadDocx.addEventListener("click", () => handleDownload("docx"));
elements.downloadPdf.addEventListener("click", () => handleDownload("pdf"));
elements.previewScroll.addEventListener("scroll", handlePreviewScroll);

Promise.all([loadHealth(), loadConfig(), loadProjects()]).catch((error) => {
  showToast(error.message);
});
