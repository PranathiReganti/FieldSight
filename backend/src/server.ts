import "dotenv/config";
import app from "./app.js";
import { prisma } from "./db.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`FieldSight API running on port ${PORT}`);

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Database connection verified successfully.");
  } catch (error) {
    console.error("Database connection failed on startup:", error);
  }
});