-- Keep a member's last known position when their device stops reporting, and
-- record why (permission blocked vs. device location switched off).
ALTER TABLE "MemberLocation"
  ADD COLUMN "sharing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "offReason" TEXT;
