-- CreateTable
CREATE TABLE "QqMailMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "receivedAt" TIMESTAMP(3),
    "snippet" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "actionNeeded" BOOLEAN,
    "aiSummary" TEXT,
    "classifiedAt" TIMESTAMP(3),

    CONSTRAINT "QqMailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QqMailMessage_userId_accountEmail_uid_key" ON "QqMailMessage"("userId", "accountEmail", "uid");

-- CreateIndex
CREATE INDEX "QqMailMessage_userId_accountEmail_idx" ON "QqMailMessage"("userId", "accountEmail");

-- AddForeignKey
ALTER TABLE "QqMailMessage" ADD CONSTRAINT "QqMailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
