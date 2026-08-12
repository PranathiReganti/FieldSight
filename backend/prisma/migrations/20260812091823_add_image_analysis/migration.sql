-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "blurScore" DOUBLE PRECISION,
ADD COLUMN     "brightness" DOUBLE PRECISION,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ocrText" TEXT,
ADD COLUMN     "vehicleNumber" TEXT,
ADD COLUMN     "vehicleNumberValid" BOOLEAN;
