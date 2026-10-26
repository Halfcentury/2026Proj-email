import { createHash } from "node:crypto";
import type { DriveProvider } from "./types";

/** Never retry an upload with an unknown outcome. Find and verify existing bytes. */
export async function reconcileUploadedAttachment(
  provider: DriveProvider,
  attempt: {
    folderId: string;
    contentHash: string;
    filename: string;
    fileId?: string;
  },
) {
  if (attempt.fileId) {
    const file = await provider.downloadFile(attempt.fileId);
    if (
      file &&
      createHash("sha256").update(file.content).digest("hex") ===
        attempt.contentHash
    )
      return attempt.fileId;
    throw new Error("已知上传文件无法核对，请检查云盘文件，暂不重复上传。");
  }
  const candidates = (await provider.listFiles(attempt.folderId)).filter(
    (file) => file.name === attempt.filename,
  );
  if (candidates.length > 5)
    throw new Error(
      "目录中有多个同名文件，请在云盘核对上传结果，暂不重复上传。",
    );
  const matches: string[] = [];
  for (const file of candidates) {
    const downloaded = await provider.downloadFile(file.id);
    if (
      downloaded &&
      createHash("sha256").update(downloaded.content).digest("hex") ===
        attempt.contentHash
    )
      matches.push(file.id);
  }
  if (matches.length !== 1)
    throw new Error(
      "上次上传结果尚未确认，已暂停重复上传。请核对云盘原目录后重试查询。",
    );
  return matches[0];
}
