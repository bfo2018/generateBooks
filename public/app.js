const state = {
  token: localStorage.getItem("bookforge-token") || "",
  user: JSON.parse(localStorage.getItem("bookforge-user") || "null"),
  provider: "loading",
  paymentMode: "loading",
  paymentKeyId: "",
  pricingConfig: null,
  projects: [],
  selectedProjectId: localStorage.getItem("bookforge-selected-project-id") || null,
  currentView: localStorage.getItem("bookforge-current-view") || "workspace",
  authMode: "login",
  authReady: false,
  generation: {
    controller: null,
    revealTimer: null,
    active: false,
    stopping: false,
  },
};

const STORAGE_KEYS = {
  token: "bookforge-token",
  user: "bookforge-user",
  draft: "bookforge-draft",
  selectedProjectId: "bookforge-selected-project-id",
  currentView: "bookforge-current-view",
};

const appConfig = window.APP_CONFIG || {};
const apiBaseUrl = String(appConfig.apiBaseUrl || "").trim().replace(/\/+$/, "");

const elements = {
  workspaceView: document.getElementById("workspaceView"),
  accountView: document.getElementById("accountView"),
  navWorkspace: document.getElementById("navWorkspace"),
  navAccount: document.getElementById("navAccount"),
  guestActions: document.getElementById("guestActions"),
  userActions: document.getElementById("userActions"),
  userBadge: document.getElementById("userBadge"),
  openLoginButton: document.getElementById("openLoginButton"),
  topLogoutButton: document.getElementById("topLogoutButton"),
  authModal: document.getElementById("authModal"),
  authBackdrop: document.getElementById("authBackdrop"),
  closeAuthModal: document.getElementById("closeAuthModal"),
  authModalTitle: document.getElementById("authModalTitle"),
  showLoginTab: document.getElementById("showLoginTab"),
  showRegisterTab: document.getElementById("showRegisterTab"),
  openRegisterLink: document.getElementById("openRegisterLink"),
  openLoginLink: document.getElementById("openLoginLink"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  profileForm: document.getElementById("profileForm"),
  generatorForm: document.getElementById("generatorForm"),
  generateButton: document.getElementById("generateButton"),
  regenerateButton: document.getElementById("regenerateButton"),
  stopGenerateButton: document.getElementById("stopGenerateButton"),
  refreshProjects: document.getElementById("refreshProjects"),
  projectList: document.getElementById("projectList"),
  providerBadge: document.getElementById("providerBadge"),
  paymentBadge: document.getElementById("paymentBadge"),
  trialBadge: document.getElementById("trialBadge"),
  unlockButton: document.getElementById("unlockButton"),
  downloadDocx: document.getElementById("downloadDocx"),
  downloadPdf: document.getElementById("downloadPdf"),
  editorTitle: document.getElementById("editorTitle"),
  editorMeta: document.getElementById("editorMeta"),
  generationStatus: document.getElementById("generationStatus"),
  toast: document.getElementById("toast"),
  topic: document.getElementById("topic"),
  description: document.getElementById("description"),
  documentType: document.getElementById("documentType"),
  language: document.getElementById("language"),
  paperSize: document.getElementById("paperSize"),
  requestedPages: document.getElementById("requestedPages"),
  colorMode: document.getElementById("colorMode"),
  includeImages: document.getElementById("includeImages"),
  pricingTotal: document.getElementById("pricingTotal"),
  pricingHint: document.getElementById("pricingHint"),
  tokenUsage: document.getElementById("tokenUsage"),
  pageEstimate: document.getElementById("pageEstimate"),
  paperSizeLabel: document.getElementById("paperSizeLabel"),
  accessState: document.getElementById("accessState"),
  previewContainer: document.getElementById("previewContainer"),
  lockCard: document.getElementById("lockCard"),
  lockMessage: document.getElementById("lockMessage"),
  lockAction: document.getElementById("lockAction"),
  historyGenerated: document.getElementById("historyGenerated"),
  historyUnlocked: document.getElementById("historyUnlocked"),
  profileName: document.getElementById("profileName"),
  profileMobile: document.getElementById("profileMobile"),
  profileEmail: document.getElementById("profileEmail"),
  profileQualification: document.getElementById("profileQualification"),
  profileAddress: document.getElementById("profileAddress"),
  profileSummaryName: document.getElementById("profileSummaryName"),
  profileSummaryEmail: document.getElementById("profileSummaryEmail"),
  profileSummaryMobile: document.getElementById("profileSummaryMobile"),
  profileSummaryQualification: document.getElementById("profileSummaryQualification"),
  profileSummaryAddress: document.getElementById("profileSummaryAddress"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  registerName: document.getElementById("registerName"),
  registerMobile: document.getElementById("registerMobile"),
  registerEmail: document.getElementById("registerEmail"),
  registerAddress: document.getElementById("registerAddress"),
  registerQualification: document.getElementById("registerQualification"),
  registerPassword: document.getElementById("registerPassword"),
  loaderOverlay: document.getElementById("loaderOverlay"),
  loaderTitle: document.getElementById("loaderTitle"),
  loaderText: document.getElementById("loaderText"),
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

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function setLoader(visible, title, text) {
  elements.loaderOverlay.hidden = !visible;
  if (title) elements.loaderTitle.textContent = title;
  if (text) elements.loaderText.textContent = text;
}

function setGenerationStatus(message = "", visible = false) {
  if (!elements.generationStatus) return;
  elements.generationStatus.textContent = message;
  elements.generationStatus.hidden = !visible || !message;
}

function persistDraft() {
  const draft = {
    topic: elements.topic.value,
    description: elements.description.value,
    documentType: elements.documentType.value,
    language: elements.language.value,
    paperSize: elements.paperSize.value,
    requestedPages: getRequestedPagesValue(),
    colorMode: elements.colorMode.value,
    includeImages: elements.includeImages.checked,
  };

  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(draft));
}

function restoreDraft() {
  const raw = localStorage.getItem(STORAGE_KEYS.draft);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    elements.topic.value = draft.topic || "";
    elements.description.value = draft.description || "";
    elements.documentType.value = draft.documentType || "book";
    elements.language.value = draft.language || "english";
    elements.paperSize.value = draft.paperSize || getPaperSizeForType(elements.documentType.value);
    elements.requestedPages.value = String(draft.requestedPages || 10);
    elements.colorMode.value = draft.colorMode || "standard";
    elements.includeImages.checked = Boolean(draft.includeImages);
  } catch (_error) {
    localStorage.removeItem(STORAGE_KEYS.draft);
  }
}

function clearRevealTimer() {
  if (state.generation.revealTimer) {
    clearTimeout(state.generation.revealTimer);
    state.generation.revealTimer = null;
  }
}

function resetGenerationState() {
  clearRevealTimer();
  state.generation.controller = null;
  state.generation.active = false;
  state.generation.stopping = false;
  elements.generateButton.disabled = false;
  elements.regenerateButton.disabled = false;
  elements.stopGenerateButton.hidden = true;
}

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.token && options.auth !== false) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(buildApiUrl(url), {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.blob();

  if (!response.ok) {
    if (response.status === 401 && state.token) {
      clearSession();
      renderShell();
      openAuthModal("login");
    }

    throw new Error(data.message || "Request failed.");
  }

  return data;
}

async function downloadFile(url, filename) {
  const response = await fetch(buildApiUrl(url), {
    headers: {
      Authorization: `Bearer ${state.token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Download failed." }));
    throw new Error(error.message || "Download failed.");
  }

  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.projects = [];
  state.selectedProjectId = null;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.selectedProjectId);
  populateProfile();
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user || null));
  populateProfile();
}

function getSelectedProject() {
  return state.projects.find((item) => item._id === state.selectedProjectId) || null;
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

function getPaperSizeForType(documentType) {
  if (documentType === "topic-note") return "A5";
  if (documentType === "research-paper") return "Letter";
  return "A4";
}

function getRequestedPagesValue() {
  return Math.max(1, Math.min(200, Number(elements.requestedPages.value) || 10));
}

function renderGenerationEstimate() {
  if (!state.pricingConfig) {
    elements.pricingHint.textContent =
      "Token cost, platform fee, and optional image/color charge will be shown here.";
    return;
  }

  const requestedPages = getRequestedPagesValue();
  const wordsPerPage = Number(state.pricingConfig.wordsPerPage) || 450;
  const estimatedOutputTokens = Math.max(300, Math.round(requestedPages * wordsPerPage * 1.35));
  const estimatedPromptTokens = Math.max(180, Math.round(220 + requestedPages * 12));
  const estimatedTotalTokens = estimatedPromptTokens + estimatedOutputTokens;
  const tokenCostInr =
    (estimatedPromptTokens / 1000) * (Number(state.pricingConfig.inputCostPer1kTokensInr) || 0) +
    (estimatedOutputTokens / 1000) * (Number(state.pricingConfig.outputCostPer1kTokensInr) || 0);
  const imageChargeInr =
    elements.includeImages.checked && elements.colorMode.value === "color"
      ? Number(state.pricingConfig.colorImageChargeInr || 0)
      : 0;
  const totalEstimate = tokenCostInr + imageChargeInr;
  const firstDocumentFree = hasSessionToken() && state.projects.length === 0;

  if (!getSelectedProject()) {
    elements.pricingTotal.textContent = formatMoney(firstDocumentFree ? 0 : totalEstimate);
    elements.tokenUsage.textContent = String(estimatedTotalTokens);
    elements.pageEstimate.textContent = String(requestedPages);
    elements.paperSizeLabel.textContent = elements.paperSize.value || "A4";
    elements.accessState.textContent = firstDocumentFree ? "Free" : "Estimate";
  }

  elements.pricingHint.textContent = firstDocumentFree
    ? `Your first generated document is free. Requested ${requestedPages} pages will be unlocked for preview and download.`
    : `Estimated for ${requestedPages} pages: token ${formatMoney(
        tokenCostInr
      )} + image charge ${formatMoney(imageChargeInr)}. More pages increase cost.`;
}

function splitMarkdownLines(markdown) {
  return String(markdown || "").replace(/\r\n/g, "\n").split("\n");
}

function toStructuredParagraphs(markdown) {
  return splitMarkdownLines(markdown)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line || lines[index - 1])
    .map((line) => {
      if (line.startsWith("# ")) return { type: "title", text: line.replace(/^# /, "") };
      if (line.startsWith("## ")) return { type: "heading", text: line.replace(/^## /, "") };
      if (line.startsWith("### ")) return { type: "subheading", text: line.replace(/^### /, "") };
      if (line.startsWith("- ")) return { type: "bullet", text: line.replace(/^- /, "") };
      return { type: "body", text: line };
    });
}

function renderPageItem(item) {
  if (!item.text) return "<p>&nbsp;</p>";
  if (item.type === "title") return `<h1>${escapeHtml(item.text)}</h1>`;
  if (item.type === "heading") return `<h2>${escapeHtml(item.text)}</h2>`;
  if (item.type === "subheading") return `<h3>${escapeHtml(item.text)}</h3>`;
  if (item.type === "image") {
    return `
      <figure class="generated-image-card">
        <div class="generated-image-art ${item.variant || "standard"}">
          <span>${item.variant === "color" ? "Color visual" : "Visual concept"}</span>
        </div>
        <figcaption>${escapeHtml(item.text)}</figcaption>
      </figure>
    `;
  }
  if (item.type === "bullet") return `<p class="bullet-item">• ${escapeHtml(item.text)}</p>`;
  return `<p>${escapeHtml(item.text)}</p>`;
}

function hasSessionToken() {
  return Boolean(state.token);
}

function isLoggedIn() {
  return hasSessionToken();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const loginActive = mode === "login";
  elements.loginForm.hidden = !loginActive;
  elements.registerForm.hidden = loginActive;
  elements.showLoginTab.classList.toggle("active", loginActive);
  elements.showRegisterTab.classList.toggle("active", !loginActive);
  elements.authModalTitle.textContent = loginActive ? "Login to continue" : "Create your account";
}

function openAuthModal(mode = "login") {
  setAuthMode(mode);
  elements.authModal.hidden = false;
}

function closeAuthModal() {
  elements.authModal.hidden = true;
}

function renderShell() {
  const loggedIn = hasSessionToken();
  localStorage.setItem(STORAGE_KEYS.currentView, state.currentView);
  elements.guestActions.hidden = loggedIn;
  elements.userActions.hidden = !loggedIn;
  elements.navAccount.hidden = !loggedIn;
  elements.userBadge.textContent = state.user ? state.user.name || state.user.email : "Logged in";

  if (!loggedIn && state.currentView === "account") {
    state.currentView = "workspace";
  }

  elements.workspaceView.hidden = state.currentView !== "workspace";
  elements.accountView.hidden = state.currentView !== "account";
  elements.navWorkspace.classList.toggle("active", state.currentView === "workspace");
  elements.navAccount.classList.toggle("active", state.currentView === "account");
  updateActionButtons();
}

function populateProfile() {
  const user = state.user;
  if (!user) {
    elements.profileName.value = "";
    elements.profileMobile.value = "";
    elements.profileEmail.value = "";
    elements.profileQualification.value = "";
    elements.profileAddress.value = "";
    elements.profileSummaryName.textContent = "Not available";
    elements.profileSummaryEmail.textContent = "Not available";
    elements.profileSummaryMobile.textContent = "Not available";
    elements.profileSummaryQualification.textContent = "Not available";
    elements.profileSummaryAddress.textContent = "Not available";
    return;
  }

  elements.profileName.value = user.name || "";
  elements.profileMobile.value = user.mobileNumber || "";
  elements.profileEmail.value = user.email || "";
  elements.profileQualification.value = user.qualification || "";
  elements.profileAddress.value = user.address || "";
  elements.profileSummaryName.textContent = user.name || "Not available";
  elements.profileSummaryEmail.textContent = user.email || "Not available";
  elements.profileSummaryMobile.textContent = user.mobileNumber || "Not available";
  elements.profileSummaryQualification.textContent = user.qualification || "Not available";
  elements.profileSummaryAddress.textContent = user.address || "Not available";
}

function updateActionButtons() {
  const project = getSelectedProject();
  const isPaid = project?.payment?.status === "paid";
  const hasProject = Boolean(project);
  const loggedIn = hasSessionToken();

  elements.unlockButton.disabled = !loggedIn || !hasProject || isPaid;
  elements.downloadDocx.disabled = !loggedIn || !isPaid;
  elements.downloadPdf.disabled = !loggedIn || !isPaid;
  elements.lockAction.disabled = !loggedIn || !hasProject || isPaid;
  elements.generateButton.textContent = loggedIn ? "Generate Document" : "Login to Generate";
  elements.regenerateButton.disabled = !loggedIn || state.generation.active;
}

function renderProjects() {
  if (!hasSessionToken()) {
    elements.projectList.innerHTML =
      '<p class="muted">Login to see customer history and generated documents.</p>';
    return;
  }

  if (!state.projects.length) {
    elements.projectList.innerHTML =
      '<p class="muted">No documents generated yet. Create the first one from the workspace.</p>';
    return;
  }

  elements.projectList.innerHTML = state.projects
    .map((project) => {
      const isActive = project._id === state.selectedProjectId;
      const updated = new Date(project.updatedAt).toLocaleString();
      return `
        <button class="project-card ${isActive ? "active" : ""}" data-id="${project._id}" type="button">
          <h3>${escapeHtml(project.topic)}</h3>
          <p>${escapeHtml(project.documentType)} • ${escapeHtml(project.language)}</p>
          <p>${escapeHtml(project.paperSize)} • ${project.includeImages ? "Image-ready" : "Text-only"}</p>
          <p>${project.payment?.status === "paid" ? "Unlocked" : "Locked"} • ${formatMoney(project.pricing?.totalChargeInr)}</p>
          <p>Updated ${updated}</p>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".project-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = "workspace";
      renderShell();
      selectProject(button.dataset.id);
    });
  });
}

function renderSummary(summary) {
  elements.historyGenerated.textContent = String(summary?.generatedDocuments || 0);
  elements.historyUnlocked.textContent = String(summary?.paidDocuments || 0);
  elements.trialBadge.textContent = hasSessionToken()
    ? summary?.freeTrialActive
      ? "Trial active"
      : "Platform fee active"
    : "Login required";
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
  if (item.type === "image") return base + 100;
  return base;
}

function toStructuredPreviewItems(markdown, colorMode = "standard") {
  return splitMarkdownLines(markdown)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line || lines[index - 1])
    .map((line) => {
      const imageMatch = line.match(/^!\[([^\]]+)\]\(([^)]+)\)$/);
      const placeholderMatch = line.match(/^\[IMAGE:\s*(.+?)\]$/i);
      if (imageMatch) {
        return {
          type: "image",
          text: imageMatch[1],
          src: imageMatch[2],
          variant: colorMode === "color" ? "color" : "standard",
        };
      }
      if (placeholderMatch) {
        return {
          type: "image",
          text: placeholderMatch[1],
          src: `generated-image://${placeholderMatch[1]}`,
          variant: colorMode === "color" ? "color" : "standard",
        };
      }
      if (line.startsWith("# ")) return { type: "title", text: line.replace(/^# /, "") };
      if (line.startsWith("## ")) return { type: "heading", text: line.replace(/^## /, "") };
      if (line.startsWith("### ")) return { type: "subheading", text: line.replace(/^### /, "") };
      if (line.startsWith("- ")) return { type: "bullet", text: line.replace(/^- /, "") };
      return { type: "body", text: line };
    });
}

function paginatePreview(markdown, wordsPerPage, colorMode) {
  const items = toStructuredPreviewItems(markdown, colorMode);
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

function renderPricing(project) {
  const pricing = project?.pricing || {};
  const isPaid = project?.payment?.status === "paid";
  const requestedPages = project?.requestedPages || pricing.requestedPages || pricing.estimatedPages || 0;
  const firstFree = Boolean(pricing.freeGenerationGranted);

  elements.pricingTotal.textContent = formatMoney(pricing.totalChargeInr || 0);
  elements.pricingHint.textContent = firstFree
    ? `First generated document is free. Requested ${requestedPages} pages can be previewed and downloaded without payment.`
    : `Token ${formatMoney(pricing.tokenCostInr || 0)} + platform ${formatMoney(
        pricing.platformFeeInr || 0
      )} + image charge ${formatMoney(pricing.imageChargeInr || 0)} for requested ${requestedPages} pages`;
  elements.tokenUsage.textContent = String(project?.usage?.totalTokens || 0);
  elements.pageEstimate.textContent = String(requestedPages || pricing.estimatedPages || 0);
  elements.paperSizeLabel.textContent = project?.paperSize || pricing.paperSize || "A4";
  elements.accessState.textContent = firstFree ? "Free" : isPaid ? "Unlocked" : "Locked";
  elements.lockMessage.textContent = isPaid
    ? "Full document access is enabled."
    : `Only ${pricing.previewPageLimit || 3} preview pages are visible until payment clears.`;
}

function renderPreview(project) {
  if (!project) {
    elements.previewContainer.innerHTML = `
      <article class="preview-page preview-empty">
        <div class="preview-page-header">
          <span>Preview</span>
          <span>Waiting</span>
        </div>
        <h2>Document preview will appear here</h2>
        <p>Generate a document from the workspace form to see a live preview.</p>
      </article>
    `;
    elements.lockCard.hidden = true;
    return;
  }

  const wordsPerPage = project?.pricing?.wordsPerPage || 450;
  const previewLimit = project?.pricing?.previewPageLimit || 3;
  const pages = paginatePreview(
    project.content || project.previewContent || "",
    wordsPerPage,
    project.colorMode
  );
  const visiblePages = project.payment?.status === "paid" ? pages : pages.slice(0, previewLimit);

  elements.previewContainer.innerHTML = visiblePages
    .map(
      (group, index) => `
        <article class="preview-page">
          <div class="preview-page-header">
            <span>Page ${index + 1}</span>
            <span>${escapeHtml(project.paperSize || "A4")}</span>
          </div>
          ${group.map(renderPageItem).join("")}
        </article>
      `
    )
    .join("");

  if (project.payment?.status !== "paid" && project.hasLockedContent) {
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
              <h3>Pay & unlock to continue reading</h3>
              <p class="muted">Only the first ${previewLimit} pages are visible in preview mode.</p>
            </div>
          </div>
        </article>
      `
    );
  }

  elements.lockCard.hidden = project.payment?.status === "paid" || !project.hasLockedContent;
}

function renderGeneratingPreview(topic, partialContent, paperSize, colorMode) {
  const items = toStructuredPreviewItems(partialContent || "", colorMode);
  const body = items.length
    ? items.map(renderPageItem).join("")
    : "<p class=\"muted\">Preparing your draft...</p>";

  elements.previewContainer.innerHTML = `
    <article class="preview-page">
      <div class="preview-page-header">
        <span>${escapeHtml(topic || "Generating")}</span>
        <span>${escapeHtml(paperSize || "A4")}</span>
      </div>
      ${body}
    </article>
  `;
  elements.lockCard.hidden = true;
}

function revealProjectContent(project) {
  return new Promise((resolve) => {
    const source = String(project.content || project.previewContent || "").replace(/\r\n/g, "\n");
    const lines = source.split("\n");
    let index = 0;
    let partial = "";

    function step() {
      if (state.generation.stopping) {
        resetGenerationState();
        setGenerationStatus("Generation stopped.", true);
        return resolve();
      }

      if (index >= lines.length) {
        renderPreview(project);
        setGenerationStatus("Document ready.", true);
        resetGenerationState();
        return resolve();
      }

      partial += `${lines[index]}${index < lines.length - 1 ? "\n" : ""}`;
      renderGeneratingPreview(project.topic, partial, project.paperSize, project.colorMode);
      index += 1;
      state.generation.revealTimer = setTimeout(step, 55);
    }

    step();
  });
}

function renderEditor(project) {
  return project;
}

function selectProject(projectId) {
  const project = state.projects.find((item) => item._id === projectId);
  if (!project) return;

  state.selectedProjectId = projectId;
  localStorage.setItem(STORAGE_KEYS.selectedProjectId, projectId);
  elements.topic.value = project.topic || "";
  elements.description.value = project.description || "";
  elements.documentType.value = project.documentType || "book";
  elements.language.value = project.language || "english";
  elements.paperSize.value = project.paperSize || getPaperSizeForType(project.documentType);
  elements.requestedPages.value = String(project.requestedPages || project.pricing?.requestedPages || 10);
  elements.colorMode.value = project.colorMode || "standard";
  elements.includeImages.checked = Boolean(project.includeImages);
  elements.editorTitle.textContent = project.topic;
  elements.editorMeta.textContent = `${project.documentType} • ${project.language} • ${project.provider}`;
  renderPricing(project);
  renderPreview(project);
  renderEditor(project);
  renderProjects();
  updateActionButtons();
  persistDraft();
}

function upsertProject(project) {
  const index = state.projects.findIndex((item) => item._id === project._id);
  if (index === -1) state.projects.unshift(project);
  else state.projects[index] = project;
}

async function loadHealth() {
  const data = await api("/api/health", {
    auth: false,
    headers: {},
  });
  state.provider = data.provider;
  elements.providerBadge.textContent = `AI: ${data.provider}`;
}

async function loadConfig() {
  const data = await api("/api/projects/config", { auth: false });
  state.pricingConfig = data.pricing;
  state.paymentMode = data.payment.mode;
  state.paymentKeyId = data.payment.razorpayKeyId;
  elements.paymentBadge.textContent = `Pay: ${state.paymentMode}`;
  renderGenerationEstimate();
}

async function loadProfile() {
  const data = await api("/api/auth/me");
  state.user = data.user;
  populateProfile();
}

async function loadProjects() {
  if (!hasSessionToken()) {
    state.projects = [];
    state.selectedProjectId = null;
    localStorage.removeItem(STORAGE_KEYS.selectedProjectId);
    renderSummary({});
    renderProjects();
    renderPreview(null);
    renderPricing(null);
    renderEditor(null);
    updateActionButtons();
    return;
  }

  const data = await api("/api/projects");
  state.projects = data.projects || [];
  renderSummary(data.summary || {});

  if (!state.projects.length) {
    state.selectedProjectId = null;
    localStorage.removeItem(STORAGE_KEYS.selectedProjectId);
    elements.editorTitle.textContent = "Generated Content";
    elements.editorMeta.textContent = "Generate a document to start editing.";
    renderPricing(null);
    renderPreview(null);
    renderEditor(null);
    renderProjects();
    updateActionButtons();
    return;
  }

  if (!state.selectedProjectId || !state.projects.some((item) => item._id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]._id;
  }

  renderProjects();
  selectProject(state.selectedProjectId);
}

async function bootAuthenticatedApp() {
  const [profileResult, healthResult, configResult] = await Promise.allSettled([
    loadProfile(),
    loadHealth(),
    loadConfig(),
  ]);

  if (profileResult.status === "rejected") {
    throw profileResult.reason;
  }

  if (healthResult.status === "rejected") {
    elements.providerBadge.textContent = "AI: unavailable";
  }

  if (configResult.status === "rejected") {
    elements.paymentBadge.textContent = "Pay: unavailable";
  }

  await loadProjects();
  state.authReady = true;
  renderShell();
}

async function handleLogin(event) {
  event.preventDefault();

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      headers: {},
      body: JSON.stringify({
        email: elements.loginEmail.value,
        password: elements.loginPassword.value,
      }),
    });

    saveSession(data.token, data.user);
    renderShell();
    try {
      await bootAuthenticatedApp();
    } catch (error) {
      renderShell();
      closeAuthModal();
      showToast(error.message || "Login succeeded, but we could not load your account fully yet.");
      return;
    }

    closeAuthModal();
    showToast("Login successful. Please click Generate Document to continue.");
    elements.loginForm.reset();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();

  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      headers: {},
      body: JSON.stringify({
        name: elements.registerName.value,
        mobileNumber: elements.registerMobile.value,
        email: elements.registerEmail.value,
        address: elements.registerAddress.value,
        qualification: elements.registerQualification.value,
        password: elements.registerPassword.value,
      }),
    });

    saveSession(data.token, data.user);
    renderShell();
    try {
      await bootAuthenticatedApp();
    } catch (error) {
      renderShell();
      closeAuthModal();
      showToast(error.message || "Account created, but we could not load your profile fully yet.");
      elements.registerForm.reset();
      return;
    }

    closeAuthModal();
    showToast("Account created successfully. You can now generate the document.");
    elements.registerForm.reset();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleProfileSave(event) {
  event.preventDefault();

  try {
    const data = await api("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify({
        name: elements.profileName.value,
        mobileNumber: elements.profileMobile.value,
        email: elements.profileEmail.value,
        qualification: elements.profileQualification.value,
        address: elements.profileAddress.value,
      }),
    });

    state.user = data.user;
    populateProfile();
    renderShell();
    showToast("Profile updated.");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (_error) {
    // Ignore logout API issues and clear local session anyway.
  }

  clearSession();
  state.currentView = "workspace";
  renderShell();
  await loadHealth().catch(() => {
    elements.providerBadge.textContent = "AI: unavailable";
  });
  elements.paymentBadge.textContent = "Pay: login required";
  elements.trialBadge.textContent = "Trial: login required";
  renderProjects();
  renderPreview(null);
  renderPricing(null);
  renderEditor(null);
  updateActionButtons();
  showToast("Logged out.");
}

function requireLoginForAction(message) {
  if (hasSessionToken()) {
    return true;
  }

  if (message) {
    showToast(message);
  }
  openAuthModal("login");
  return false;
}

async function handleGenerate(event) {
  event.preventDefault();

  if (!requireLoginForAction("Please login before generating a document.")) {
    return;
  }

  resetGenerationState();
  persistDraft();
  state.generation.controller = new AbortController();
  state.generation.active = true;
  elements.generateButton.disabled = true;
  elements.regenerateButton.disabled = true;
  elements.stopGenerateButton.hidden = false;
  setGenerationStatus("Generating your document line by line...", true);
  renderGeneratingPreview(elements.topic.value, "", elements.paperSize.value, elements.colorMode.value);

  try {
    const payload = {
      topic: elements.topic.value,
      description: elements.description.value,
      documentType: elements.documentType.value,
      language: elements.language.value,
      paperSize: elements.paperSize.value,
      requestedPages: getRequestedPagesValue(),
      includeImages: elements.includeImages.checked,
      colorMode: elements.colorMode.value,
    };

    const project = await api("/api/projects/generate", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: state.generation.controller.signal,
    });

    upsertProject(project);
    state.selectedProjectId = project._id;
    localStorage.setItem(STORAGE_KEYS.selectedProjectId, project._id);
    await revealProjectContent(project);
    selectProject(project._id);

    try {
      await loadProjects();
      selectProject(project._id);
      showToast("Document generated successfully.");
    } catch (error) {
      renderProjects();
      updateActionButtons();
      showToast(
        error.message || "Document generated, but project history could not be refreshed."
      );
    }
  } catch (error) {
    if (error.name === "AbortError") {
      setGenerationStatus("Generation stopped.", true);
      showToast("Generation stopped.");
    } else {
      showToast(error.message);
    }
  } finally {
    resetGenerationState();
  }
}

function handleRegenerate() {
  if (state.generation.active) {
    return;
  }

  elements.generatorForm.requestSubmit();
}

function handleStopGenerate() {
  state.generation.stopping = true;
  if (state.generation.controller) {
    state.generation.controller.abort();
  }
}

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (loadRazorpayScript.promise) return loadRazorpayScript.promise;

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
    return;
  }

  if (orderResponse.payment.mode !== "razorpay") {
    const verification = await api(`/api/projects/${projectId}/payment/verify`, {
      method: "POST",
      body: JSON.stringify({ orderId: orderResponse.order.id }),
    });

    upsertProject(verification.project);
    await loadProjects();
    selectProject(verification.project._id);
    return;
  }

  await loadRazorpayScript();

  await new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay({
      key: orderResponse.payment.razorpayKeyId,
      amount: orderResponse.order.amount,
      currency: orderResponse.order.currency,
      name: "BookForge AI",
      description: `Unlock ${orderResponse.project.topic}`,
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
          await loadProjects();
          selectProject(verification.project._id);
          resolve();
        } catch (error) {
          reject(error);
        }
      },
      theme: {
        color: "#b24c2f",
      },
    });

    razorpay.on("payment.failed", () => reject(new Error("Payment failed.")));
    razorpay.open();
  });
}

async function handleUnlock() {
  if (!requireLoginForAction("Please login before unlocking.")) {
    return;
  }

  const project = getSelectedProject();
  if (!project) return;

  setLoader(true, "Unlocking document", "Preparing payment and full-access state.");

  try {
    await unlockProject(project._id);
    showToast("Document unlocked.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoader(false);
  }
}

async function handleDownload(kind) {
  if (!requireLoginForAction("Please login before downloading.")) {
    return;
  }

  const project = getSelectedProject();
  if (!project) return;

  try {
    await downloadFile(
      `/api/projects/${project._id}/export/${kind}`,
      `${project.topic.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "document"}.${kind}`
    );
    showToast(`${kind.toUpperCase()} download started.`);
  } catch (error) {
    showToast(error.message);
  }
}

function handleDocumentTypeChange() {
  elements.paperSize.value = getPaperSizeForType(elements.documentType.value);
  persistDraft();
  renderGenerationEstimate();
}

function showWorkspaceView() {
  state.currentView = "workspace";
  renderShell();
}

function showAccountView() {
  if (!requireLoginForAction("Please login to open profile and history.")) {
    return;
  }

  state.currentView = "account";
  renderShell();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.registerForm.addEventListener("submit", handleRegister);
  elements.profileForm.addEventListener("submit", handleProfileSave);
  elements.topLogoutButton.addEventListener("click", handleLogout);
  elements.refreshProjects.addEventListener("click", loadProjects);
  elements.generatorForm.addEventListener("submit", handleGenerate);
  elements.regenerateButton.addEventListener("click", handleRegenerate);
  elements.stopGenerateButton.addEventListener("click", handleStopGenerate);
  elements.unlockButton.addEventListener("click", handleUnlock);
  elements.lockAction.addEventListener("click", handleUnlock);
  elements.downloadDocx.addEventListener("click", () => handleDownload("docx"));
  elements.downloadPdf.addEventListener("click", () => handleDownload("pdf"));
  elements.documentType.addEventListener("change", handleDocumentTypeChange);
  elements.requestedPages.addEventListener("input", renderGenerationEstimate);
  elements.colorMode.addEventListener("change", renderGenerationEstimate);
  elements.includeImages.addEventListener("change", renderGenerationEstimate);
  [
    elements.topic,
    elements.description,
    elements.documentType,
    elements.language,
    elements.requestedPages,
    elements.colorMode,
    elements.includeImages,
  ].forEach((element) => {
    const eventName =
      element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventName, persistDraft);
  });
  elements.navWorkspace.addEventListener("click", showWorkspaceView);
  elements.navAccount.addEventListener("click", showAccountView);
  elements.openLoginButton.addEventListener("click", () => openAuthModal("login"));
  elements.closeAuthModal.addEventListener("click", closeAuthModal);
  elements.authBackdrop.addEventListener("click", closeAuthModal);
  elements.showLoginTab.addEventListener("click", () => setAuthMode("login"));
  elements.showRegisterTab.addEventListener("click", () => setAuthMode("register"));
  elements.openRegisterLink.addEventListener("click", () => setAuthMode("register"));
  elements.openLoginLink.addEventListener("click", () => setAuthMode("login"));
}

async function init() {
  bindEvents();
  populateProfile();
  restoreDraft();
  if (!elements.requestedPages.value) {
    elements.requestedPages.value = "10";
  }
  handleDocumentTypeChange();
  renderShell();
  renderProjects();
  renderPreview(null);
  updateActionButtons();

  try {
    await loadHealth();
  } catch (_error) {
    elements.providerBadge.textContent = "AI: unavailable";
  }

  try {
    await loadConfig();
  } catch (_error) {
    elements.paymentBadge.textContent = "Pay: unavailable";
  }

  if (!state.token) {
    elements.trialBadge.textContent = "Trial: login required";
    renderGenerationEstimate();
    return;
  }

  try {
    await bootAuthenticatedApp();
  } catch (_error) {
    renderShell();
    elements.paymentBadge.textContent = "Pay: unavailable";
  }
}

init();
