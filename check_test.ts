import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { checkCatalogs, lengthWarnings, parseCatalogSource } from "./check.ts";
Deno.test("catalog checks reject duplicates and blank texts without confusing escaped values", () => {
  assertThrows(
    () =>
      parseCatalogSource('{"name":"English","texts":{"a":"first","a":"last"}}'),
    TypeError,
    "Duplicate",
  );
  assertThrows(
    () => parseCatalogSource('{"name":"English","texts":{"a":" "}}'),
    TypeError,
  );
  assertEquals(
    parseCatalogSource(
      JSON.stringify({ name: "English", texts: { a: 'A "key": {value}' } }),
    ).texts.a,
    'A "key": {value}',
  );
});

Deno.test("required languages must cover every English key", async () => {
  const root = await Deno.makeTempDir();
  try {
    const path = `${root}/i18n/locales`;
    await Deno.mkdir(path, { recursive: true });
    await Deno.writeTextFile(
      `${path}/en.json`,
      JSON.stringify({ name: "English", texts: { save: "Save" } }),
    );
    await Deno.writeTextFile(
      `${path}/cs.json`,
      JSON.stringify({ name: "Čeština", texts: {} }),
    );
    await assertRejects(
      () => checkCatalogs(root, ["cs"]),
      TypeError,
      "missing key save",
    );
    await checkCatalogs(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("translations preserve icon markup and named variables", async () => {
  const root = await Deno.makeTempDir();
  try {
    const path = `${root}/i18n/locales`;
    await Deno.mkdir(path, { recursive: true });
    const write = (code: string, value: string) =>
      Deno.writeTextFile(
        `${path}/${code}.json`,
        JSON.stringify({ name: code, texts: { action: value } }),
      );
    await write("en", "[[icon=delete]] Delete {name}");
    await write("cs", "[[icon=remove]] Smazat {name}");
    await assertRejects(() => checkCatalogs(root), TypeError, "icons differ");
    await write("cs", "[[icon=delete]] Smazat {nazev}");
    await assertRejects(
      () => checkCatalogs(root),
      TypeError,
      "variables differ",
    );
    await write("cs", "Smazat {name} [[icon=delete]]");
    await checkCatalogs(root, ["cs"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("length warnings count graphemes, substitutions and icons and remain advisory", async () => {
  const warnings = (english: string, translated: string) =>
    lengthWarnings({
      en: { texts: { label: english } },
      cs: { texts: { label: translated } },
    });
  const source = "Workspace {longVariableName}";
  assertEquals(warnings(source, "Plocha {longVariableName}"), []);
  assertEquals(warnings(source, "Pracovní plocha {longVariableName}"), []);
  const expanded = "Velmi dlouhá pracovní plocha {longVariableName}";
  assertEquals(warnings(source, expanded)[0]?.sourceLength, 11);
  assertEquals(warnings(source, expanded)[0]?.increasePercent, 173);
  assertEquals(
    warnings(source, expanded.normalize("NFD"))[0]?.translatedLength,
    30,
  );
  assertEquals(
    warnings("[[icon=save]] Save", "[[icon=save]] Velmi dlouhé uložení")[0]
      ?.sourceLength,
    6,
  );
  assertEquals(warnings("a".repeat(8), "b".repeat(15)), []);
  assertEquals(warnings("a".repeat(8), "b".repeat(16)).length, 1);
  assertEquals(warnings("a".repeat(20), "b".repeat(34)), []);
  assertEquals(warnings("a".repeat(20), "b".repeat(35)).length, 1);
  assertEquals(warnings("a".repeat(40), "b".repeat(79)), []);
  assertEquals(
    warnings("a".repeat(40), "b".repeat(80))[0]?.increasePercent,
    100,
  );
  assertEquals(warnings("", "Dlouhý text"), []);
  assertEquals(lengthWarnings({ cs: { texts: { label: "Text" } } }), []);

  const root = await Deno.makeTempDir();
  try {
    const path = `${root}/i18n/locales`;
    await Deno.mkdir(path, { recursive: true });
    for (
      const [code, label] of [["en", "Save"], ["cs", "Uložit všechny změny"]]
    ) {
      await Deno.writeTextFile(
        `${path}/${code}.json`,
        JSON.stringify({ name: code, texts: { label } }),
      );
    }
    assertEquals((await checkCatalogs(root, ["cs"])).length, 1);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
