ALTER TABLE "Business" ADD COLUMN "email" TEXT;

UPDATE "Business" AS business
SET "email" = owner_user."email"
FROM "BusinessMember" AS member
JOIN "User" AS owner_user ON owner_user."id" = member."userId"
WHERE member."businessId" = business."id"
  AND member."role" = 'owner';

UPDATE "Business"
SET "receiptFooter" = 'Thank you for your business.'
WHERE "receiptFooter" IS NULL;
