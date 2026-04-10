const mongoose = require("mongoose");

async function connectToDatabase() {
  if (process.env.STORAGE_MODE === "memory") {
    console.log("Storage mode set to memory, skipping MongoDB connection");
    return;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    process.env.STORAGE_MODE = "memory";
    console.warn("MONGODB_URI missing, falling back to memory storage");
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log("MongoDB connected");
  } catch (error) {
    process.env.STORAGE_MODE = "memory";
    console.warn(`MongoDB unavailable, falling back to memory storage: ${error.message}`);
  }
}

module.exports = connectToDatabase;
