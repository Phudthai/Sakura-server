-- AlterTable: denormalized address snapshot at domestic shipment creation (immutable per round)
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_recipient_name" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_phone" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_address_line1" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_address_line2" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_subdistrict" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_district" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_province" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_postal_code" TEXT;
ALTER TABLE "domestic_shipments" ADD COLUMN "snapshot_country" TEXT;
