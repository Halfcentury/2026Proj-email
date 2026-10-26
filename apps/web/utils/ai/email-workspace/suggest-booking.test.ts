import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount, createTestLogger } from "@/__tests__/helpers";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { suggestBooking } from "./suggest-booking";
const { generate, prepare, resources, message } = vi.hoisted(() => ({
  generate: vi.fn(),
  prepare: vi.fn(),
  resources: vi.fn(),
  message: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./resources", () => ({ getWorkspaceMessage: message }));
vi.mock("./workspace-resources", () => ({ getWorkspaceResources: resources }));
vi.mock("./booking", () => ({ prepareBooking: prepare }));
vi.mock("@/utils/llms", () => ({ createGenerateObject: () => generate }));
vi.mock("@/utils/llms/use-cases", () => ({
  getModelForUseCase: () => ({}),
  LlmUseCase: { Summarise: "summarise" },
}));
vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: async () => getEmailAccount(),
}));
const options = {
  emailAccountId: "a",
  provider: "google",
  logger: createTestLogger(),
};
const proposal = {
  operation: "reschedule",
  bookingId: "owned",
  bookingLinkId: null,
  startTime: "2030-11-01T15:00:00+08:00",
  timezone: "Asia/Hong_Kong",
  guestName: null,
  guestEmail: null,
  reason: "改到周四",
  missingInformation: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  message.mockResolvedValue({
    message: getMockParsedMessage({ id: "m", threadId: "t" }),
  });
  resources.mockResolvedValue({
    links: [],
    bookings: [{ id: "owned" }],
    meetings: [],
  });
});
describe("read-only booking preparation", () => {
  it("asks for missing decisions without preparing or executing a booking", async () => {
    generate.mockResolvedValue({
      object: { ...proposal, missingInformation: ["请确认下午几点"] },
    });
    expect(
      (await suggestBooking(options, "t", "改到周四下午")).missingInformation,
    ).toEqual(["请确认下午几点"]);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("rejects model IDs outside the actual linked bookings", async () => {
    generate.mockResolvedValue({
      object: { ...proposal, bookingId: "unrelated" },
    });
    expect(
      (await suggestBooking(options, "t", "改到周四下午三点")).plan,
    ).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("reuses the shared review service with the verified original message", async () => {
    generate.mockResolvedValue({ object: proposal });
    prepare.mockResolvedValue({ reviewToken: "signed" });
    const result = await suggestBooking(options, "t", "改到周四下午三点");
    expect(result.plan).toEqual({ reviewToken: "signed" });
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "a",
        input: expect.objectContaining({
          threadId: "t",
          messageId: "m",
          bookingId: "owned",
          timezone: "Asia/Hong_Kong",
        }),
      }),
    );
  });
});
