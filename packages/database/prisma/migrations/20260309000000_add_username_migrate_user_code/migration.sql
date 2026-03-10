-- Add username column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- Copy user_code to username for existing rows
UPDATE "users" SET "username" = "user_code" WHERE "user_code" IS NOT NULL;

-- Drop unique index on user_code (to allow temp updates)
DROP INDEX IF EXISTS "users_user_code_key";

-- Generate new user_code (m000001, m000002...) for each user ordered by id
WITH numbered AS (
  SELECT "id", 'm' || LPAD(ROW_NUMBER() OVER (ORDER BY "id")::text, 6, '0') AS new_code
  FROM "users"
)
UPDATE "users" u SET "user_code" = n.new_code FROM numbered n WHERE u."id" = n."id";

-- Set user_code NOT NULL (all rows now have values)
ALTER TABLE "users" ALTER COLUMN "user_code" SET NOT NULL;

-- Re-add unique constraint on user_code
CREATE UNIQUE INDEX "users_user_code_key" ON "users"("user_code");

-- Add unique index on username
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Add index on user_code (for @@index([userCode]))
CREATE INDEX "users_user_code_idx" ON "users"("user_code");
