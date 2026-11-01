import { parseCatalog } from "./store.ts";
import { variables } from "./messages.ts";
import { language } from "./fields.ts";

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
): Promise<void> {
  const directory = `${root}/i18n/locales`;
  const english = parseCatalogSource(
    await Deno.readTextFile(`${directory}/en.json`),
  );
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
    }
  }
}
if (import.meta.main) {
  const complete = Deno.args.filter((arg) => arg.startsWith("--complete="))
    .map((arg) => arg.slice("--complete=".length));
  const roots = Deno.args.filter((arg) => !arg.startsWith("--complete="));
  for (const root of roots.length ? roots : ["."]) {
    await checkCatalogs(root, complete);
  }
  console.log("Catalogs checked.");
}
