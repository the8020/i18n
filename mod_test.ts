import { assertEquals, assertRejects } from "@std/assert";
import { context } from "@the8020/context";
import {
  fallbackChain,
  Localization,
  messages,
  prepareTexts,
  text,
  withLocalization,
} from "./mod.ts";
import { format, variables } from "./messages.ts";
import { mergeCatalogs, readCatalog } from "./store.ts";
import { configuration, defaultConfiguration } from "./fields.ts";
import { builtinLanguages } from "./languages.ts";

Deno.test("fresh configuration enables all curated languages without changing saved settings", () => {
  const defaults = configuration.parse(defaultConfiguration);
  assertEquals(defaults.defaultLanguage, "en");
  assertEquals(defaults.languages, builtinLanguages);
  assertEquals(defaults.languages.length, 43);
  for (const { code } of defaults.languages) {
    assertEquals(
      fallbackChain(defaults, code),
      code === "en" ? ["en"] : [code, "en"],
    );
  }
  assertEquals(configuration.parse(config).languages, config.languages);
});

const config = {
  defaultLanguage: "en",
  languages: ["en", "sk", "cs", "pt", "es"].map((code) => ({
    code,
    name: code,
  })),
  fallbacks: { sk: ["cs", "en"], pt: ["es", "en"] },
};

Deno.test("login default is independent, optional for existing settings, and enabled", () => {
  assertEquals(configuration.parse(config).defaultLoginLanguage, undefined);
  assertEquals(
    configuration.parse({ ...config, defaultLoginLanguage: "cs" })
      .defaultLoginLanguage,
    "cs",
  );
  assertEquals(
    configuration.safeParse({ ...config, defaultLoginLanguage: "de" }).success,
    false,
  );
});

Deno.test("each language has its own direct fallback chain", () => {
  assertEquals(fallbackChain(config, "sk"), ["sk", "cs", "en"]);
  assertEquals(fallbackChain(config, "pt"), ["pt", "es", "en"]);
  assertEquals(fallbackChain(config, "de"), ["de", "en"]);
  assertEquals(fallbackChain(config, "en"), ["en"]);
  assertEquals(
    fallbackChain(
      { ...config, fallbacks: { sk: ["sk", "en", "cs", "cs"] } },
      "sk",
    ),
    ["sk", "cs", "en"],
  );
});

Deno.test("overrides win within a language, never over a more specific language", () => {
  const texts = mergeCatalogs([
    { label: "English", help: "English help", onlyEnglish: "English" },
    { label: "Customer English" },
    { label: "Czech", help: "Czech help" },
    { label: "Customer Czech" },
    { label: "Slovak" },
    { help: "Customer Slovak help" },
  ]);
  assertEquals(texts.label, "Slovak");
  assertEquals(texts.help, "Customer Slovak help");
  assertEquals(texts.onlyEnglish, "English");
});

Deno.test("shared references resolve independently and repeated screen work does no loading", async () => {
  const m = messages("example/accounts");
  const label = m("account.name");
  let loads = 0;
  const loader = async (packageId: string, chain: readonly string[]) => {
    loads++;
    await Promise.resolve();
    return {
      package: packageId,
      language: chain[0]!,
      texts: { "account.name": chain[0]! },
    };
  };
  await Promise.all(
    ["sk", "pt"].map((language) =>
      withLocalization(new Localization(language, config, loader), async () => {
        await Promise.all([prepareTexts(label), prepareTexts(label)]);
        for (let i = 0; i < 10_000; i++) assertEquals(text(label), language);
        assertEquals(context.language, language);
        await prepareTexts(label);
      })
    ),
  );
  assertEquals(loads, 2);
  assertEquals(label, { package: "example/accounts", key: "account.name" });
  assertEquals(context.language, undefined);
});

Deno.test("formatting is plain, single-pass and exposes missing keys or variables", () => {
  const texts = { notice: "Hello {name}", static: "Save" };
  assertEquals(
    format(texts, "notice", { name: "{name}<script>" }),
    "Hello {name}<script>",
  );
  assertEquals(format(texts, "notice"), "[!notice]");
  assertEquals(format(texts, "missing"), "[!missing]");
  assertEquals(format(texts, "static"), "Save");
  assertEquals(variables("{count} {name} {count}"), ["count", "name"]);
});

Deno.test("English source references remain usable outside a localized invocation", async () => {
  const m = messages("example/accounts", { greeting: "Hello {name}" });
  const greeting = m("greeting", { name: "Ada" });
  assertEquals(text(greeting), "Hello Ada");
  await withLocalization(
    new Localization("cs", config, (packageId) =>
      Promise.resolve({
        package: packageId,
        language: "cs",
        texts: { greeting: "Ahoj {name}" },
      })),
    async () => {
      await prepareTexts(greeting);
      assertEquals(text(greeting), "Ahoj Ada");
    },
  );
  assertEquals(text(greeting), "Hello Ada");
});

Deno.test("catalog files stay inside the owning package", async () => {
  const root = await Deno.makeTempDir();
  try {
    const path = `${root}/example/accounts/i18n/locales`;
    await Deno.mkdir(path, { recursive: true });
    await Deno.writeTextFile(
      `${path}/en.json`,
      JSON.stringify({ name: "English", texts: { title: "Accounts" } }),
    );
    assertEquals(
      (await readCatalog("example/accounts", "en", root))?.texts.title,
      "Accounts",
    );
    assertEquals(await readCatalog("example/accounts", "sk", root), undefined);
    await assertRejects(
      () => readCatalog("../accounts", "en", root),
      TypeError,
    );
    await Deno.writeTextFile(`${root}/outside.json`, "{}");
    await Deno.symlink(`${root}/outside.json`, `${path}/cs.json`);
    await assertRejects(
      () => readCatalog("example/accounts", "cs", root),
      TypeError,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
