-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('TASK_REMINDER', 'DUE_SOON', 'DAILY_DIGEST', 'NEW_SIGN_IN');

-- CreateTable
CREATE TABLE "task_reminders" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "offset_minutes" INTEGER,
    "remind_at" TIMESTAMPTZ(3),
    "message" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "task_id" UUID,
    "data" JSONB,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "dedupe_key" VARCHAR(160),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "timezone_auto" BOOLEAN NOT NULL DEFAULT true,
    "task_reminder_in_app" BOOLEAN NOT NULL DEFAULT true,
    "task_reminder_email" BOOLEAN NOT NULL DEFAULT true,
    "due_soon_in_app" BOOLEAN NOT NULL DEFAULT true,
    "due_soon_email" BOOLEAN NOT NULL DEFAULT true,
    "due_soon_lead_minutes" INTEGER NOT NULL DEFAULT 60,
    "daily_digest_in_app" BOOLEAN NOT NULL DEFAULT true,
    "daily_digest_email" BOOLEAN NOT NULL DEFAULT true,
    "daily_digest_time" CHAR(5) NOT NULL DEFAULT '08:00',
    "last_digest_on" CHAR(10),
    "new_sign_in_in_app" BOOLEAN NOT NULL DEFAULT true,
    "new_sign_in_email" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "known_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "last_ip" INET,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "known_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_reminders_task_id_idx" ON "task_reminders"("task_id");

-- CreateIndex
CREATE INDEX "task_reminders_sent_at_remind_at_idx" ON "task_reminders"("sent_at", "remind_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_in_app_id_idx" ON "notifications"("user_id", "in_app", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "known_devices_user_id_token_hash_key" ON "known_devices"("user_id", "token_hash");

-- AddForeignKey
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "known_devices" ADD CONSTRAINT "known_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules Prisma cannot model: an absolute reminder always has a time, and a relative
-- reminder counts back a non-negative number of minutes.
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_timing_check"
  CHECK ("offset_minutes" IS NOT NULL OR "remind_at" IS NOT NULL);
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_offset_check"
  CHECK ("offset_minutes" IS NULL OR "offset_minutes" >= 0);
