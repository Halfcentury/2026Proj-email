import { test } from "vitest";
import assert from "node:assert/strict";
import { createEmulator } from "emulate";
import { localizeMicrosoftDemoMail } from "./localize-mail.mjs";

test("localizes Microsoft's four built-in demo messages, including after reset", async () => {
  const email = "localization@outlook.test";
  const token = "localization_fixture_token";
  const emulator = await createEmulator({
    service: "microsoft",
    port: 0,
    hostname: "127.0.0.1",
    seed: {
      tokens: { [token]: { login: email } },
      microsoft: { users: [{ email, name: "测试用户" }] },
    },
  });
  try {
    for (const reset of [false, true]) {
      if (reset) await emulator.reset();
      await localizeMicrosoftDemoMail(emulator.url, email, token);
      const response = await fetch(`${emulator.url}/v1.0/me/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200);
      const { value } = await response.json();
      assert.equal(value.length, 4);
      for (const message of value) {
        assert.match(message.subject, /\p{Script=Han}/u);
        assert.match(message.body.content, /\p{Script=Han}/u);
        assert.match(message.from.emailAddress.name, /\p{Script=Han}/u);
        assert.ok(
          message.categories.every((category) => category !== "Follow Up"),
        );
      }
    }
  } finally {
    await emulator.close();
  }
});
