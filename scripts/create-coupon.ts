/**
 * Create a Pro coupon.
 *
 * Usage:
 *   npx tsx scripts/create-coupon.ts WELCOME2026 --days=30 --max=100
 *   npx tsx scripts/create-coupon.ts LIFETIME --days=0
 *
 * --days=0 (or omit duration) = Pro with no expiry
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const code = process.argv[2]?.trim().toUpperCase();
  if (!code) {
    console.error(
      "Usage: npx tsx scripts/create-coupon.ts CODE [--days=30] [--max=100]"
    );
    process.exit(1);
  }

  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const maxArg = process.argv.find((a) => a.startsWith("--max="));

  const daysRaw = daysArg ? Number(daysArg.split("=")[1]) : null;
  const durationDays =
    daysRaw == null || Number.isNaN(daysRaw)
      ? null
      : daysRaw === 0
        ? null
        : daysRaw;

  const maxUses = maxArg ? Number(maxArg.split("=")[1]) : null;

  const coupon = await prisma.coupon.upsert({
    where: { code },
    create: {
      code,
      durationDays,
      maxUses: maxUses && !Number.isNaN(maxUses) ? maxUses : null,
      isActive: true,
    },
    update: {
      durationDays,
      maxUses: maxUses && !Number.isNaN(maxUses) ? maxUses : null,
      isActive: true,
    },
  });

  console.log("Coupon ready:", coupon);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
