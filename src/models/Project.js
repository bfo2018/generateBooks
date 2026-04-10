const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    bookType: {
      type: String,
      enum: ["syllabus", "research", "textbook"],
      required: true,
    },
    provider: {
      type: String,
      default: "mock",
      trim: true,
    },
    outline: {
      type: String,
      default: "",
    },
    content: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Project", projectSchema);
