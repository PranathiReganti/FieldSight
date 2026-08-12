import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "./db.js";
import { addToProcessingQueue } from "./services/processingQueue.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// Multer configuration
const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG and PNG images are allowed"));
    }

    cb(null, true);
  },
});

// Health check
app.get("/health", async (_req, res) => {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    dbStatus = err instanceof Error ? err.message : "disconnected";
  }

  res.status(200).json({
    status: "ok",
    service: "fieldsight-api",
    database: dbStatus,
  });
});

// Image upload
app.post(
  "/api/images/upload",
  (req, res, next) => {
    upload.single("image")(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: "Image size must not exceed 10 MB",
          });
        }

        return res.status(400).json({
          error: error.message,
        });
      }

      if (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No image uploaded",
        });
      }

      // Save image metadata
      const image = await prisma.image.create({
        data: {
          originalName: req.file.originalname,
          storedPath: req.file.path,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          status: "PENDING",
        },
      });

      // Add image to background processing queue
      addToProcessingQueue(image.id);

      // Return immediately without waiting for processing
      return res.status(202).json({
        message: "Image uploaded and queued for processing",
        processingId: image.id,
        status: image.status,
      });
    } catch (error) {
      console.error("Image upload error:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Failed to upload image";

      return res.status(500).json({
        error: errorMessage,
      });
    }
  }
);

// Image processing status
app.get("/api/images/:id/status", async (req, res) => {
  try {
    const image = await prisma.image.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        status: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!image) {
      return res.status(404).json({
        error: "Image not found",
      });
    }

    return res.status(200).json({
      processingId: image.id,
      status: image.status,
      failureReason: image.failureReason,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    });
  } catch (error) {
    console.error("Status check error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to retrieve processing status";

    return res.status(500).json({
      error: errorMessage,
    });
  }
});

// Image processing results
app.get("/api/images/:id/results", async (req, res) => {
  try {
    const image = await prisma.image.findUnique({
      where: {
        id: req.params.id,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        blurScore: true,
        brightness: true,
        ocrText: true,
        vehicleNumber: true,
        vehicleNumberValid: true,
        isDuplicate: true,
        confidenceScore: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!image) {
      return res.status(404).json({
        error: "Image not found",
      });
    }

    if (image.status === "PENDING" || image.status === "PROCESSING") {
      return res.status(202).json({
        processingId: image.id,
        status: image.status,
        message: "Image processing is still in progress",
      });
    }

    if (image.status === "FAILED") {
      return res.status(500).json({
        processingId: image.id,
        status: image.status,
        failureReason: image.failureReason,
      });
    }

    return res.status(200).json({
      processingId: image.id,
      status: image.status,

      results: {
        blurScore: image.blurScore,
        brightness: image.brightness,
        ocrText: image.ocrText,
        vehicleNumber: image.vehicleNumber,
        vehicleNumberValid: image.vehicleNumberValid,
        isDuplicate: image.isDuplicate,
        confidenceScore: image.confidenceScore,
      },

      metadata: {
        originalName: image.originalName,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
      },

      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    });
  } catch (error) {
    console.error("Results retrieval error:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to retrieve image results";

    return res.status(500).json({
      error: errorMessage,
    });
  }
});

export default app; 