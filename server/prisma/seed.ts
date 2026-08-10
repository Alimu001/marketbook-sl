import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/config/env.js";

async function main() {
  if (env.NODE_ENV === "production") {
    console.log("Skipping seed in production.");
    return;
  }

  const existingBusiness = await prisma.business.findFirst({
    where: { name: "Dev Demo Business" },
  });

  if (existingBusiness) {
    console.log("Development seed data already exists. Skipping.");
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: "dev@marketbook.local",
      passwordHash: "placeholder-not-for-login",
      name: "Dev User",
    },
  });

  const business = await prisma.business.create({
    data: {
      name: "Dev Demo Business",
    },
  });

  await prisma.businessMember.create({
    data: {
      userId: user.id,
      businessId: business.id,
      role: "owner",
    },
  });

  console.log("Development seed data created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
