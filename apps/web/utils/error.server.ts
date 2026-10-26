import { setUser } from "@sentry/nextjs";
import { auth } from "@/utils/auth";
import type { Logger } from "@/utils/logger";

export async function logErrorToPosthog(
  type: "api" | "action",
  url: string,
  errorType: string,
  emailAccountId: string,
  logger: Logger,
) {
  try {
    const session = await auth();
    if (session?.user.email) {
      setUser({ email: session.user.email });
    }
  } catch (error) {
    logger.error("Error logging to PostHog:", { error });
  }
}
