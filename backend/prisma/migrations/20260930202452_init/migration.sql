-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "token_type" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "activity_action" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'DELETED', 'IMAGE_ADDED', 'IMAGE_REMOVED');

-- CreateEnum
CREATE TYPE "oauth_provider" AS ENUM ('GOOGLE', 'GITHUB');

-- CreateEnum
CREATE TYPE "image_kind" AS ENUM ('AVATAR', 'TASK');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "avatar_image_id" UUID,
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "previous_token_hash" CHAR(64),
    "rotated_at" TIMESTAMPTZ(3),
    "persistent" BOOLEAN NOT NULL DEFAULT false,
    "user_agent" VARCHAR(512),
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "token_type" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "oauth_provider" NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMPTZ(3),
    "has_due_time" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(3),
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "task_id" UUID,
    "kind" "image_kind" NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "thumb_key" VARCHAR(255),
    "original_name" VARCHAR(255),
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_activities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "action" "activity_action" NOT NULL,
    "task_title" VARCHAR(200) NOT NULL,
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_image_id_key" ON "users"("avatar_image_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "verification_tokens_user_id_type_idx" ON "verification_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "oauth_accounts"("user_id", "provider");

-- CreateIndex
CREATE INDEX "tasks_user_id_status_position_idx" ON "tasks"("user_id", "status", "position");

-- CreateIndex
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "images_storage_key_key" ON "images"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "images_thumb_key_key" ON "images"("thumb_key");

-- CreateIndex
CREATE INDEX "images_owner_id_deleted_at_idx" ON "images"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "images_task_id_created_at_idx" ON "images"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "images_deleted_at_idx" ON "images"("deleted_at");

-- CreateIndex
CREATE INDEX "task_activities_user_id_created_at_idx" ON "task_activities"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "task_activities_task_id_created_at_idx" ON "task_activities"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_image_id_fkey" FOREIGN KEY ("avatar_image_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activities" ADD CONSTRAINT "task_activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
