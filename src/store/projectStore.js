const Project = require("../models/Project");

const memoryProjects = [];

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function sortByUpdatedAtDescending(items) {
  return [...items].sort(
    (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt)
  );
}

function createMemoryProject(input) {
  const now = new Date().toISOString();

  return {
    _id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    topic: input.topic,
    description: input.description || "",
    bookType: input.bookType,
    provider: input.provider || "mock",
    outline: input.outline || "",
    content: input.content || "",
    createdAt: now,
    updatedAt: now,
  };
}

async function listProjects() {
  if (process.env.STORAGE_MODE === "memory") {
    return sortByUpdatedAtDescending(memoryProjects).map(cloneProject);
  }

  return Project.find().sort({ updatedAt: -1 }).lean();
}

async function createProject(data) {
  if (process.env.STORAGE_MODE === "memory") {
    const project = createMemoryProject(data);
    memoryProjects.unshift(project);
    return cloneProject(project);
  }

  return Project.create(data);
}

async function updateProject(id, updates) {
  if (process.env.STORAGE_MODE === "memory") {
    const index = memoryProjects.findIndex((project) => project._id === id);

    if (index === -1) {
      return null;
    }

    memoryProjects[index] = {
      ...memoryProjects[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    return cloneProject(memoryProjects[index]);
  }

  return Project.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
}

async function getProjectById(id) {
  if (process.env.STORAGE_MODE === "memory") {
    const project = memoryProjects.find((item) => item._id === id);
    return project ? cloneProject(project) : null;
  }

  return Project.findById(id).lean();
}

module.exports = {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
};
