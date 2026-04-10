const state = {
  provider: "loading",
  projects: [],
  selectedProjectId: null,
};

const elements = {
  generatorForm: document.getElementById("generatorForm"),
  generateButton: document.getElementById("generateButton"),
  refreshProjects: document.getElementById("refreshProjects"),
  projectList: document.getElementById("projectList"),
  providerBadge: document.getElementById("providerBadge"),
  contentEditor: document.getElementById("contentEditor"),
  saveButton: document.getElementById("saveButton"),
  downloadDocx: document.getElementById("downloadDocx"),
  downloadPdf: document.getElementById("downloadPdf"),
  editorTitle: document.getElementById("editorTitle"),
  editorMeta: document.getElementById("editorMeta"),
  toast: document.getElementById("toast"),
  topic: document.getElementById("topic"),
  description: document.getElementById("description"),
  bookType: document.getElementById("bookType"),
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

function updateActionButtons() {
  const hasSelection = Boolean(state.selectedProjectId);
  elements.saveButton.disabled = !hasSelection;
  elements.downloadDocx.disabled = !hasSelection;
  elements.downloadPdf.disabled = !hasSelection;
}

function renderProjects() {
  if (!state.projects.length) {
    elements.projectList.innerHTML =
      '<p class="muted">No projects yet. Generate your first draft.</p>';
    return;
  }

  elements.projectList.innerHTML = state.projects
    .map((project) => {
      const isActive = project._id === state.selectedProjectId;
      const updated = new Date(project.updatedAt).toLocaleString();

      return `
        <button class="project-card ${isActive ? "active" : ""}" data-id="${project._id}" type="button">
          <h3>${escapeHtml(project.topic)}</h3>
          <p>${escapeHtml(project.bookType)} • ${escapeHtml(project.provider)}</p>
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

function selectProject(projectId) {
  const project = state.projects.find((item) => item._id === projectId);
  if (!project) return;

  state.selectedProjectId = projectId;
  elements.topic.value = project.topic;
  elements.description.value = project.description;
  elements.bookType.value = project.bookType;
  elements.contentEditor.value = project.content;
  elements.editorTitle.textContent = project.topic;
  elements.editorMeta.textContent = `${project.bookType} draft via ${project.provider}`;
  updateActionButtons();
  renderProjects();
}

async function loadHealth() {
  const data = await api("/api/health");
  state.provider = data.provider;
  elements.providerBadge.textContent = `Provider: ${state.provider}`;
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
    elements.contentEditor.value = "";
  }

  renderProjects();
  updateActionButtons();
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

    state.projects.unshift(project);
    selectProject(project._id);
    renderProjects();
    showToast("Book draft generated.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.generateButton.disabled = false;
    elements.generateButton.textContent = "Generate Book Draft";
  }
}

async function handleSave() {
  if (!state.selectedProjectId) return;

  elements.saveButton.disabled = true;

  try {
    const updated = await api(`/api/projects/${state.selectedProjectId}`, {
      method: "PUT",
      body: JSON.stringify({
        topic: elements.topic.value,
        description: elements.description.value,
        bookType: elements.bookType.value,
        content: elements.contentEditor.value,
      }),
    });

    state.projects = state.projects.map((project) =>
      project._id === updated._id ? updated : project
    );
    selectProject(updated._id);
    showToast("Project saved.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.saveButton.disabled = false;
  }
}

function handleDownload(kind) {
  if (!state.selectedProjectId) return;
  window.location.href = `/api/projects/${state.selectedProjectId}/export/${kind}`;
}

elements.generatorForm.addEventListener("submit", handleGenerate);
elements.saveButton.addEventListener("click", handleSave);
elements.refreshProjects.addEventListener("click", loadProjects);
elements.downloadDocx.addEventListener("click", () => handleDownload("docx"));
elements.downloadPdf.addEventListener("click", () => handleDownload("pdf"));

Promise.all([loadHealth(), loadProjects()]).catch((error) => {
  showToast(error.message);
});
