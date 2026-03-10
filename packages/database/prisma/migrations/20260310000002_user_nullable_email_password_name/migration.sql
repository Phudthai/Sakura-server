-- AlterTable: Allow NULL for placeholder users (first-time customers)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;
