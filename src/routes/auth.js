const express = require("express");

const { createUser, findUserByEmail, findUserById, updateUser } = require("../store/userStore");
const { createSessionToken, hashPassword, sanitizeUser } = require("../utils/auth");

const router = express.Router();
const sessions = new Map();

function normalizeCredentials(body = {}) {
  return {
    name: String(body.name || "").trim(),
    mobileNumber: String(body.mobileNumber || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    address: String(body.address || "").trim(),
    qualification: String(body.qualification || "").trim(),
    password: String(body.password || ""),
  };
}

async function requireAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: "Please login to continue." });
  }

  const userId = sessions.get(token);
  const user = await findUserById(userId);

  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ message: "Session expired. Please login again." });
  }

  req.authToken = token;
  req.user = user;
  return next();
}

router.post("/register", async (req, res) => {
  try {
    const input = normalizeCredentials(req.body);

    if (!input.name || !input.mobileNumber || !input.email || !input.address || !input.password) {
      return res.status(400).json({
        message: "Name, mobile number, email, address, and password are required.",
      });
    }

    const existing = await findUserByEmail(input.email);

    if (existing) {
      return res.status(409).json({ message: "An account already exists for this email." });
    }

    const user = await createUser({
      ...input,
      passwordHash: hashPassword(input.password),
    });
    const sessionToken = createSessionToken();
    sessions.set(sessionToken, user._id.toString());

    return res.status(201).json({
      token: sessionToken,
      user: sanitizeUser(user.toObject ? user.toObject() : user),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to register user.",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await findUserByEmail(email);

    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const sessionToken = createSessionToken();
    sessions.set(sessionToken, user._id.toString());

    return res.json({
      token: sessionToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to login.",
    });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  sessions.delete(req.authToken);
  res.json({ success: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: sanitizeUser(req.user),
  });
});

router.put("/me", requireAuth, async (req, res) => {
  try {
    const input = normalizeCredentials(req.body);

    if (!input.name || !input.mobileNumber || !input.email || !input.address) {
      return res.status(400).json({
        message: "Name, mobile number, email, and address are required.",
      });
    }

    const existing = await findUserByEmail(input.email);

    if (existing && String(existing._id) !== String(req.user._id)) {
      return res.status(409).json({ message: "This email is already used by another account." });
    }

    const user = await updateUser(req.user._id, input);

    return res.json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Failed to update profile.",
    });
  }
});

module.exports = {
  authRouter: router,
  requireAuth,
};
