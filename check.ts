import { type Catalog, parseCatalog } from "./store.ts";
import { variables } from "./messages.ts";
import { language } from "./fields.ts";
import { builtinLanguages } from "./languages.ts";

/** JSON.parse accepts duplicate keys; catalogs must not silently lose a message. */
export function parseCatalogSource(source: string) {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ??
    [];
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "{") stack.push(new Set());
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ":") {
      const key = JSON.parse(token);
      const keys = stack.at(-1);
      if (keys?.has(key)) throw new TypeError(`Duplicate catalog key: ${key}`);
      keys?.add(key);
    }
  }
  return parseCatalog(JSON.parse(source));
}

export async function checkCatalogs(
  root: string,
  complete: string[] = [],
) {
  const directory = `${root}/i18n/locales`;
  const english = parseCatalogSource(
    await Deno.readTextFile(`${directory}/en.json`),
  );
  const catalogs: Record<string, Catalog> = { en: english };
  for (const code of complete) {
    language.parse(code);
    const catalog = parseCatalogSource(
      await Deno.readTextFile(`${directory}/${code}.json`),
    );
    for (const key of Object.keys(english.texts)) {
      if (!Object.hasOwn(catalog.texts, key)) {
        throw new TypeError(`${code}.json: missing key ${key}`);
      }
    }
  }
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    language.parse(entry.name.slice(0, -5));
    const catalog = parseCatalogSource(
      await Deno.readTextFile(`${directory}/${entry.name}`),
    );
    catalogs[entry.name.slice(0, -5)] = catalog;
    for (const [key, value] of Object.entries(catalog.texts)) {
      if (!Object.hasOwn(english.texts, key)) {
        throw new TypeError(`${entry.name}: unknown key ${key}`);
      }
      if (
        JSON.stringify(variables(value)) !==
          JSON.stringify(variables(english.texts[key]!))
      ) {
        throw new TypeError(`${entry.name}: variables differ for ${key}`);
      }
      const icons = (text: string) =>
        JSON.stringify((text.match(/\[\[icon=[^\]]+\]\]/g) ?? []).sort());
      if (icons(value) !== icons(english.texts[key]!)) {
        throw new TypeError(`${entry.name}: icons differ for ${key}`);
      }
    }
  }
  return lengthWarnings(catalogs);
}

export function lengthWarnings(
  catalogs: Record<string, Pick<Catalog, "texts">>,
) {
  const segments = new Intl.Segmenter("en", { granularity: "grapheme" });
  // Variables and icons occupy one position regardless of their source spelling.
  const length = (text: string) =>
    [...segments.segment(
      text.replace(/\{[A-Za-z][A-Za-z0-9_]*\}|\[\[icon=[^\]]+\]\]/g, "◊")
        .normalize("NFC"),
    )].length;
  const warnings = [];
  for (const [key, english] of Object.entries(catalogs.en?.texts ?? {})) {
    const sourceLength = length(english);
    if (!sourceLength) continue;
    for (const [language, catalog] of Object.entries(catalogs)) {
      const translated = catalog.texts[key];
      if (language === "en" || translated === undefined) continue;
      const translatedLength = length(translated);
      const ratio = translatedLength / sourceLength;
      if (
        ratio < (sourceLength <= 30 ? 1.75 : 2) ||
        translatedLength - sourceLength < (sourceLength <= 30 ? 8 : 20)
      ) continue;
      warnings.push({
        language,
        key,
        english,
        translated,
        sourceLength,
        translatedLength,
        increasePercent: Math.round((ratio - 1) * 100),
      });
    }
  }
  return warnings.sort((a, b) =>
    b.increasePercent - a.increasePercent ||
    a.language.localeCompare(b.language) || a.key.localeCompare(b.key)
  );
}

if (import.meta.main) {
  const complete = Deno.args.filter((arg) => arg.startsWith("--complete="))
    .flatMap((arg) =>
      arg === "--complete=builtin"
        ? builtinLanguages.map(({ code }) => code)
        : [arg.slice("--complete=".length)]
    );
  const report = Deno.args.find((arg) => arg.startsWith("--length-report="))
    ?.slice("--length-report=".length);
  const roots = Deno.args.filter((arg) =>
    !arg.startsWith("--complete=") && !arg.startsWith("--length-report=")
  );
  const warnings = [];
  for (const root of roots.length ? roots : ["."]) {
    warnings.push(...(await checkCatalogs(root, complete)).map((warning) => ({
      package: root,
      ...warning,
    })));
  }
  warnings.sort((a, b) => b.increasePercent - a.increasePercent);
  if (report) {
    await Deno.writeTextFile(report, JSON.stringify(warnings, null, 2) + "\n");
  }
  console.log("Catalogs checked.");
  if (warnings.length) {
    console.warn(
      `Translation length: ${warnings.length} advisory warnings. Largest increases:`,
    );
    for (const warning of warnings.slice(0, 10)) {
      console.warn(
        `  ${warning.package} ${warning.language} ${warning.key}: +${warning.increasePercent}% (${warning.sourceLength} → ${warning.translatedLength}) ${
          JSON.stringify(warning.english)
        } → ${JSON.stringify(warning.translated)}`,
      );
    }
  }
  if (report) console.log(`Full length report: ${report}`);
}
