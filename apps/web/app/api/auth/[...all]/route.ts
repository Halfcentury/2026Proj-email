import { betterAuthConfig } from "@/utils/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { deduplicateOAuthCallback } from "@/utils/oauth/auth-callback-deduplication";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("auth/oauth-callback");
const handlers = toNextJsHandler(betterAuthConfig);

export const maxDuration = 300;
export const { PUT, PATCH, DELETE } = handlers;

export const POST: typeof handlers.POST = async (...args) => {
  const [request] = args;
  return withMcpOAuthRateLimit(request, () => handlers.POST(...args));
};

export const GET: typeof handlers.GET = async (...args) => {
  const [request] = args;

  return withMcpOAuthRateLimit(request, () =>
    deduplicateOAuthCallback({
      request,
      handleRequest: () => handlers.GET(...args),
      logger,
    }),
  );
};

async function withMcpOAuthRateLimit(
  _request: Request,
  handle: () => ReturnType<typeof handlers.POST>,
) {
  return handle();
}
