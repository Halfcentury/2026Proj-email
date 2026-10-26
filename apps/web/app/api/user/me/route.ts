import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { auth } from "@/utils/auth";
import {
  isDecisionModelAvailable,
  isDecisionModelEnabledForUser,
} from "@/utils/decision-model/decision-model";

export type UserResponse = Awaited<ReturnType<typeof getUser>> | null;

async function getUser({
  userId,
  includeImage,
}: {
  userId: string;
  includeImage: boolean;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      decisionModelEnabled: true,
      webhookSecret: true,
      announcementDismissedAt: true,
      dismissedHints: true,
      emailAccounts: {
        select: {
          id: true,
          email: true,
          name: true,
          ...(includeImage && { image: true }),
        },
      },
    },
  });
  if (!user) throw new SafeError("User not found");
  const { aiApiKey, webhookSecret, ...profile } = user;
  return {
    id: user.id,
    createdAt: user.createdAt,
    aiProvider: user.aiProvider,
    aiModel: user.aiModel,
    announcementDismissedAt: user.announcementDismissedAt,
    dismissedHints: user.dismissedHints,
    emailAccounts: user.emailAccounts.map(({ id, email, name, ...rest }) => ({
      id,
      email,
      name,
      ...(includeImage
        ? { image: "image" in rest ? rest.image : undefined }
        : {}),
    })),
    hasAiApiKey: !!aiApiKey,
    hasWebhookSecret: !!webhookSecret,
    isDecisionModelAvailable: isDecisionModelAvailable(),
    decisionModelEnabled: isDecisionModelEnabledForUser(user),
    canManageBilling: false,
    unsubscribeCreditsRemaining: Number.MAX_SAFE_INTEGER,
    premium: null,
    members: [] as {
      organizationId: string;
      role: string;
      organization: { name: string };
      emailAccountId: string;
    }[],
  };
}

// Not using withAuth — unauthenticated requests return 401 with isKnownError
// so the client can distinguish "not logged in" from real errors without Sentry noise
export const GET = withError("user/me", async (request) => {
  const session = await auth(request.headers);
  const userId = session?.user.id;
  if (!userId)
    return NextResponse.json(
      { error: "Not authenticated", isKnownError: true },
      { status: 401 },
    );

  const includeImage =
    request.nextUrl.searchParams.get("includeImage") === "true";

  const user = await getUser({ userId, includeImage });

  return NextResponse.json(user);
});
