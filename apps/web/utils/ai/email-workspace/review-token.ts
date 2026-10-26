import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { SafeError } from "@/utils/error";

export function sealReview(purpose: string, value: unknown) {
  const body = Buffer.from(
    JSON.stringify({ purpose, expiresAt: Date.now() + 30 * 60 * 1000, value }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", env.EMAIL_ENCRYPT_SECRET).update(body).digest("hex")}`;
}
export function openReview(purpose: string, token: string): unknown {
  const pieces = token.split(".");
  const [body, signature] = pieces;
  if (pieces.length !== 2 || !/^[a-f0-9]{64}$/.test(signature ?? ""))
    throw new SafeError("确认内容无效，请重新准备。");
  const actual = Buffer.from(signature ?? "", "hex");
  const expected = createHmac("sha256", env.EMAIL_ENCRYPT_SECRET)
    .update(body ?? "")
    .digest();
  if (
    !body ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new SafeError("确认内容无效，请重新准备。");
  const decoded = JSON.parse(Buffer.from(body, "base64url").toString());
  if (decoded.purpose !== purpose || decoded.expiresAt < Date.now())
    throw new SafeError("确认内容已过期，请重新准备。");
  return decoded.value;
}
