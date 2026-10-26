import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createEmulator } from "emulate";
import { localizeMicrosoftDemoMail } from "./localize-mail.mjs";

// Reuse emulate's own YAML parser for the same JSON/YAML seed formats.
const YAML = createRequire(import.meta.resolve("emulate"))("yaml");

const [service, port, third, fourth] = process.argv.slice(2);
const controlPort = fourth ? third : undefined;
const filename = fourth ?? third;
if (!["google", "microsoft"].includes(service))
  throw new Error("Provider fixture provider must be Gmail or Graph");
const seed = YAML.parse(readFileSync(filename, "utf8"));
const mailboxes =
  service === "microsoft"
    ? [
        ...new Set([
          ...(seed.microsoft?.users ?? []).map((user) => user.email),
          "testuser@outlook.com",
        ]),
      ].map((email) => ({ email }))
    : [];
for (const [index, user] of mailboxes.entries()) {
  seed.tokens ??= {};
  seed.tokens[`localized_microsoft_demo_${index}`] = { login: user.email };
}
const emulator = await createEmulator({
  service,
  port: Number(port),
  hostname: "127.0.0.1",
  baseUrl: `http://127.0.0.1:${port}`,
  seed,
});
async function localize() {
  for (const [index, user] of mailboxes.entries())
    await localizeMicrosoftDemoMail(
      emulator.url,
      user.email,
      `localized_microsoft_demo_${index}`,
    );
}
await localize();
const control = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/reset") {
    response.writeHead(404).end();
    return;
  }
  try {
    await emulator.reset();
    await localize();
    response.writeHead(200).end();
  } catch (error) {
    console.error("Provider fixture reset failed", error);
    response.writeHead(500).end();
  }
});
if (controlPort) control.listen(Number(controlPort), "127.0.0.1");
console.log(`Localized ${service} emulator ready at ${emulator.url}`);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await emulator.close();
    if (controlPort) control.close(() => process.exit(0));
    else process.exit(0);
  });
}
