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
    usage: {
      promptTokens: {
        type: Number,
        default: 0,
      },
      completionTokens: {
        type: Number,
        default: 0,
      },
      totalTokens: {
        type: Number,
        default: 0,
      },
      source: {
        type: String,
        default: "estimated",
      },
    },
    pricing: {
      currency: {
        type: String,
        default: "INR",
      },
      paymentMode: {
        type: String,
        default: "demo",
      },
      previewPageLimit: {
        type: Number,
        default: 3,
      },
      wordsPerPage: {
        type: Number,
        default: 450,
      },
      platformFeeInr: {
        type: Number,
        default: 50,
      },
      inputCostPer1kTokensInr: {
        type: Number,
        default: 0.4,
      },
      outputCostPer1kTokensInr: {
        type: Number,
        default: 1.2,
      },
      tokenCostInr: {
        type: Number,
        default: 0,
      },
      totalChargeInr: {
        type: Number,
        default: 50,
      },
      wordCount: {
        type: Number,
        default: 0,
      },
      estimatedPages: {
        type: Number,
        default: 1,
      },
      previewContent: {
        type: String,
        default: "",
      },
    },
    payment: {
      status: {
        type: String,
        enum: ["unpaid", "paid"],
        default: "unpaid",
      },
      orderId: {
        type: String,
        default: "",
      },
      paymentId: {
        type: String,
        default: "",
      },
      signature: {
        type: String,
        default: "",
      },
      paidAt: {
        type: Date,
        default: null,
      },
      amountInr: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Project", projectSchema);
