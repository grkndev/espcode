-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "github_branch" TEXT,
ADD COLUMN     "github_dir" TEXT,
ADD COLUMN     "github_installation_id" BIGINT,
ADD COLUMN     "github_link_broken" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "github_repo_full_name" TEXT;

-- CreateTable
CREATE TABLE "github_installations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "installation_id" BIGINT NOT NULL,
    "account_login" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_owners" (
    "user_id" TEXT NOT NULL,
    "build_key" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_owners_pkey" PRIMARY KEY ("user_id","build_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_installation_id_key" ON "github_installations"("installation_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_github_installation_id_fkey" FOREIGN KEY ("github_installation_id") REFERENCES "github_installations"("installation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_owners" ADD CONSTRAINT "build_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_owners" ADD CONSTRAINT "build_owners_build_key_fkey" FOREIGN KEY ("build_key") REFERENCES "builds"("build_key") ON DELETE CASCADE ON UPDATE CASCADE;
