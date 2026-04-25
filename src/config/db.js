const mongoose = require("mongoose");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToDatabase() {
  const requestedStorageMode = String(process.env.STORAGE_MODE || "").trim().toLowerCase();

  if (requestedStorageMode === "memory") {
    console.log("Storage mode set to memory, skipping MongoDB connection");
    return;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    if (requestedStorageMode === "mongo") {
      throw new Error("MONGODB_URI is required when STORAGE_MODE is set to mongo.");
    }
    process.env.STORAGE_MODE = "memory";
    console.warn("MONGODB_URI missing, falling back to memory storage");
    return;
  }

  const maxRetries = Math.max(
    1,
    Number(process.env.MONGO_CONNECT_RETRIES || (requestedStorageMode === "mongo" ? 12 : 1))
  );
  const retryDelayMs = Math.max(250, Number(process.env.MONGO_RETRY_DELAY_MS || 2000));

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3000,
      });
      console.log("MongoDB connected");
      return;
    } catch (error) {
      const hasRetriesLeft = attempt < maxRetries;

      if (!hasRetriesLeft) {
        if (requestedStorageMode === "mongo") {
          throw error;
        }
        process.env.STORAGE_MODE = "memory";
        console.warn(`MongoDB unavailable, falling back to memory storage: ${error.message}`);
        return;
      }

      console.warn(
        `MongoDB connection attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${retryDelayMs}ms...`
      );
      await sleep(retryDelayMs);
    }
  }
}

module.exports = connectToDatabase;
