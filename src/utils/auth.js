const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    name: user.name,
    mobileNumber: user.mobileNumber,
    email: user.email,
    address: user.address || "",
    qualification: user.qualification || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  createSessionToken,
  hashPassword,
  sanitizeUser,
};
