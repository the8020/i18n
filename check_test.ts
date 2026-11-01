import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { checkCatalogs, parseCatalogSource } from "./check.ts";
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
