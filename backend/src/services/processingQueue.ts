import { prisma } from "../db.js";
import { processImage } from "./imageProcessor.js";
import { decodeRTO } from "./rtoDecoder.js";

const queue: string[] = [];
let isProcessing = false;

export function addToProcessingQueue(imageId: string) {
  queue.push(imageId);
  void processNext();
}

async function processNext() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  const imageId = queue.shift();

  if (!imageId) {
    isProcessing = false;
    return;
  }

  try {
    const image = await prisma.image.findUnique({
      where: {
        id: imageId,
      },
    });

    if (!image) {
      throw new Error(`Image ${imageId} not found`);
    }

    // Mark as processing
    await prisma.image.update({
      where: {
        id: imageId,
      },
      data: {
        status: "PROCESSING",
      },
    });

    // Run image analysis
    const analysis = await processImage(image.storedPath);

    // Check whether the same image already exists
    const duplicate = await prisma.image.findFirst({
      where: {
        checksum: analysis.checksum,
        id: {
          not: imageId,
        },
      },
      select: {
        id: true,
      },
    });

    const isDuplicate = duplicate !== null;

    const confidenceScore = Math.max(
      0,
      Math.min(100, Math.round(analysis.confidenceScore))
    );

    // Decode RTO Information
    const rtoInfo = decodeRTO(analysis.vehicleNumber);

    // Store all analysis results
    await prisma.image.update({
      where: {
        id: imageId,
      },
      data: {
        checksum: analysis.checksum,
        isDuplicate,
        blurScore: analysis.blurScore,
        brightness: analysis.brightness,
        ocrText: analysis.ocrText || null,
        vehicleNumber: analysis.vehicleNumber,
        vehicleNumberValid: analysis.vehicleNumberValid,
        confidenceScore,
        plateX: analysis.plateBoundingBox?.x ?? null,
        plateY: analysis.plateBoundingBox?.y ?? null,
        plateWidth: analysis.plateBoundingBox?.width ?? null,
        plateHeight: analysis.plateBoundingBox?.height ?? null,
        rtoDetails: rtoInfo ? JSON.stringify(rtoInfo) : null,
        status: "COMPLETED",
      },
    });

    console.log(
      `Image ${imageId} processed successfully with confidence ${confidenceScore}%`
    );
  } catch (error) {
    console.error(`Image ${imageId} processing failed:`, error);

    await prisma.image.update({
      where: {
        id: imageId,
      },
      data: {
        status: "FAILED",
        failureReason:
          error instanceof Error
            ? error.message
            : "Unknown processing error",
      },
    });
  } finally {
    isProcessing = false;

    void processNext();
  }
}