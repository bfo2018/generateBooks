const User = require("../models/User");
const { hashPassword } = require("../utils/auth");

const memoryUsers = [];

function clone(item) {
  return JSON.parse(JSON.stringify(item));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createMemoryUser(input) {
  const now = new Date().toISOString();

  return {
    _id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    mobileNumber: input.mobileNumber,
    email: normalizeEmail(input.email),
    address: input.address || "",
    qualification: input.qualification || "",
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  };
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);

  if (process.env.STORAGE_MODE === "memory") {
    const user = memoryUsers.find((item) => item.email === normalized);
    return user ? clone(user) : null;
  }

  return User.findOne({ email: normalized }).lean();
}

async function findUserById(id) {
  if (process.env.STORAGE_MODE === "memory") {
    const user = memoryUsers.find((item) => item._id === id);
    return user ? clone(user) : null;
  }

  return User.findById(id).lean();
}

async function createUser(input) {
  const payload = {
    name: String(input.name || "").trim(),
    mobileNumber: String(input.mobileNumber || "").trim(),
    email: normalizeEmail(input.email),
    address: String(input.address || "").trim(),
    qualification: String(input.qualification || "").trim(),
    passwordHash: input.passwordHash || hashPassword(input.password),
  };

  if (process.env.STORAGE_MODE === "memory") {
    const user = createMemoryUser(payload);
    memoryUsers.unshift(user);
    return clone(user);
  }

  return User.create(payload);
}

async function updateUser(id, updates) {
  const payload = {
    name: String(updates.name || "").trim(),
    mobileNumber: String(updates.mobileNumber || "").trim(),
    email: normalizeEmail(updates.email),
    address: String(updates.address || "").trim(),
    qualification: String(updates.qualification || "").trim(),
  };

  if (process.env.STORAGE_MODE === "memory") {
    const index = memoryUsers.findIndex((item) => item._id === id);

    if (index === -1) {
      return null;
    }

    memoryUsers[index] = {
      ...memoryUsers[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    return clone(memoryUsers[index]);
  }

  return User.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  }).lean();
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
};
