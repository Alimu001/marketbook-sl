import { prisma } from "./prisma.js";

export async function checkDatabaseReadiness(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
