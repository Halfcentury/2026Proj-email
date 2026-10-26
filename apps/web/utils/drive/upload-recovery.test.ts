import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { reconcileUploadedAttachment } from "./upload-recovery";
import type { DriveProvider } from "./types";
const attempt = {
  folderId: "folder",
  filename: "invoice.pdf",
  contentHash: createHash("sha256").update("actual bytes").digest("hex"),
};
function provider(files: string[], content = "actual bytes") {
  return {
    listFiles: vi
      .fn()
      .mockResolvedValue(files.map((id) => ({ id, name: attempt.filename }))),
    downloadFile: vi.fn().mockResolvedValue({ content: Buffer.from(content) }),
    uploadFile: vi.fn(),
  } as unknown as DriveProvider;
}
describe("upload outcome recovery", () => {
  it("recovers a successful cloud upload by verifying bytes, without uploading again", async () => {
    const drive = provider(["uploaded"]);
    expect(await reconcileUploadedAttachment(drive, attempt)).toBe("uploaded");
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });
  it.each([
    { ids: [] },
    { ids: ["one", "two"] },
  ])("blocks ambiguous or absent cloud results", async ({ ids }) => {
    const drive = provider(ids);
    await expect(reconcileUploadedAttachment(drive, attempt)).rejects.toThrow(
      "暂停重复上传",
    );
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });
  it("does not treat an unrelated same-name file as the uploaded attachment", async () => {
    await expect(
      reconcileUploadedAttachment(provider(["other"], "other bytes"), attempt),
    ).rejects.toThrow("尚未确认");
  });
});
