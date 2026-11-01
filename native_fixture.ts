/** Run only against a fresh numbered test instance: deno run -A native_fixture.ts ROOT URL. */
import { assert, assertEquals } from "@std/assert";
const [root = "", base = "http://localhost:8080"] = Deno.args;
if (!root || !/\/test\d+$/.test(root)) {
  throw new Error("A disposable numbered test instance is required.");
}
async function admin(...args: string[]) {
  const result = await new Deno.Command(`${root}/node/kernel/bin/admin`, {
    args: ["--root", root, "--json", ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const response = JSON.parse(new TextDecoder().decode(result.stdout));
  if (!result.success || !response.success) {
    throw new Error(`Test command failed: ${args[0]}`);
  }
  return response.result;
}
async function sql(statement: string, parameters: unknown[]) {
  return await admin(
    "db.sql",
    statement,
    "--parameters",
    JSON.stringify(parameters),
    "--execute",
  );
}
const config = {
  defaultLanguage: "en",
  defaultLoginLanguage: "sk",
  languages: [{ code: "en", name: "English" }, {
    code: "sk",
    name: "Slovenčina",
  }, { code: "pt", name: "Português" }],
  fallbacks: { sk: ["cs", "en"], pt: ["es", "en"] },
};
await sql(
  "INSERT INTO the8020__system__settings (key,value,definitionHash,updatedAt) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  [
    "i18n.configuration",
    JSON.stringify(config),
    "the8020/i18n",
    new Date().toISOString(),
  ],
);
for (
  const [packageId, language, key, value] of [
    ["the8020/uui", "sk", "login.signIn", "Customer SK"],
    ["the8020/uui", "es", "login.signIn", "Customer ES"],
    ["the8020/uui", "pt", "login.password", "Senha personalizada"],
    ["the8020/uui", "cs", "shell.takenOver", "Customer CS"],
    ["the8020/uui", "en", "shell.connected", "Customer EN"],
    ["the8020/i18n", "sk", "languages.title", "Jazyky zákazníka"],
  ]
) {
  await sql(
    "INSERT INTO the8020__i18n__translations (package,language,key,value) VALUES (?,?,?,?) ON CONFLICT(package,language,key) DO UPDATE SET value=excluded.value",
    [packageId, language, key, value],
  );
}
await sql("UPDATE the8020__users__users SET language=? WHERE username=?", [
  "pt",
  "admin",
]);
await sql("UPDATE the8020__users__users SET language=? WHERE username=?", [
  "sk",
  "system",
]);
await new Promise((resolve) => setTimeout(resolve, 5500));
const auth = `Basic ${btoa("admin:admin")}`;
async function request(path: string, options: RequestInit = {}) {
  return await fetch(`${base}${path}`, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
}
for (
  const [code, expected] of [["sk", "Customer SK"], [
    "pt",
    "Customer ES",
  ]] as const
) {
  const response = await request(`/the8020/uui/login/?language=${code}`);
  assertEquals(response.status, 200);
  const html = await response.text();
  assert(html.includes(expected));
  assert(!html.includes("{{"));
  if (code === "pt") assert(html.includes("Senha personalizada"));
}
const publicDefault = await request("/the8020/uui/login/");
assert((await publicDefault.text()).includes('lang="sk"'));
async function boot(headers: Record<string, string>) {
  const response = await request("/the8020/uui/shell/", { headers });
  assertEquals(response.status, 200);
  const html = await response.text();
  return JSON.parse(
    /<script[^>]+id="the8020-boot"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]!,
  );
}
assertEquals((await boot({ authorization: auth })).localization.language, "pt");
const sk = await boot({ authorization: auth, "the8020-language": "sk" });
assertEquals(sk.localization.language, "sk");
assertEquals(sk.localization.texts["shell.takenOver"], "Customer CS");
assertEquals(sk.localization.texts["shell.connected"], "Pripojené");
const invalid = await request("/the8020/uui/shell/", {
  headers: { authorization: auth, "the8020-language": "de" },
});
assertEquals(invalid.status, 400);
await invalid.body?.cancel();
const login = await request("/the8020/uui/login/", {
  method: "POST",
  body: new URLSearchParams({
    username: "admin",
    password: "admin",
    language: "sk",
  }),
});
assertEquals(login.status, 303);
const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0])
  .join("; ");
assertEquals((await boot({ cookie })).localization.language, "sk");
const remembered = await request("/the8020/uui/login/", {
  headers: { cookie },
});
assert((await remembered.text()).includes('<option value="sk" selected>'));
const accountDefault = await request("/the8020/uui/login/?language=", {
  headers: { cookie },
});
assert(
  (await accountDefault.text()).includes(
    '<option value="" data-i18n="login.accountLanguage">',
  ),
);
assert(accountDefault.headers.get("set-cookie")?.includes("Max-Age=0"));
const established = await request("/the8020/uui/session/connect", {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ program: "the8020/i18n/languages" }),
});
assertEquals(established.status, 204);
const sessionId = established.headers.get("the8020-session");
assert(sessionId);
const clientId = crypto.randomUUID();
async function json(
  path: string,
  value: unknown,
  headers: Record<string, string> = {},
) {
  const response = await request(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
  const result = await response.json();
  assertEquals(response.status, 200, JSON.stringify(result));
  return result;
}
const control = await json("/the8020/uui/shell/control", {
  sessionId,
  clientId,
  operation: "claim",
  takeover: true,
});
const screen = await json("/the8020/uui/session/command", {
  clientId,
  control: control.control,
  command: { op: "screen" },
}, { "the8020-route": control.route, "the8020-language": "pt" });
assert(screen.transcript.includes("Jazyky zákazníka"));
await json("/the8020/uui/shell/control", {
  sessionId,
  clientId,
  operation: "release",
});
const accountSession = await request("/the8020/uui/session/connect", {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ program: "the8020/users/my-account" }),
});
assertEquals(accountSession.status, 204);
const accountId = accountSession.headers.get("the8020-session");
assert(accountId);
let accountScreen;
for (
  const command of [
    { op: "screen" },
    { op: "click", id: "edit" },
    { op: "set", id: "language", value: "" },
    { op: "click", id: "save" },
  ]
) {
  if (command.op === "set") {
    const field = /field: "([^"]+)"\n\s+label: "Language"/.exec(
      accountScreen.transcript,
    );
    assert(field);
    command.id = field[1]!;
  }
  const control = await json("/the8020/uui/shell/control", {
    sessionId: accountId,
    clientId,
    operation: "claim",
    takeover: true,
  });
  accountScreen = await json("/the8020/uui/session/command", {
    clientId,
    control: control.control,
    expected: accountScreen?.expected,
    command,
  }, { "the8020-route": control.route });
  assertEquals(accountScreen.error, undefined);
}
assertEquals((await boot({ authorization: auth })).localization.language, "en");
await json("/the8020/uui/shell/control", {
  sessionId: accountId,
  clientId,
  operation: "release",
});
console.log(
  "Installed checks passed: file/DB precedence, per-language fallback, account/header/login selection, account reset, and retained session language.",
);
