import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;

const isExternalRender = connectionString?.includes("render.com");
const hasSslParam =
  connectionString?.includes("sslmode=") ||
  connectionString?.includes("ssl=true");

const pool = new pg.Pool({
  connectionString,
  ...(isExternalRender || hasSslParam
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });