import {
  type Configuration,
  configuration,
  defaultConfiguration,
  language as languageCode,
} from "./fields.ts";
import { type Bundle, packagePattern, type Texts } from "./messages.ts";

export const configurationKey = "i18n.configuration";
const refreshMilliseconds = 5_000;
const maximumBytes = 2 * 1024 * 1024;
const cache = new Map<
  string,
  { expires: number; bundle: Promise<Bundle>; bytes: number }
>();
let cachedConfiguration:
  | { expires: number; value: Promise<Configuration> }
  | undefined;

export function clearCache(): void {
  cachedConfiguration = undefined;
  cache.clear();
}

export function getConfiguration(): Promise<Configuration> {
  if (cachedConfiguration && cachedConfiguration.expires > Date.now()) {
    return cachedConfiguration.value;
  }
  const value = (async () => {
    const { default: Settings } = await import(
      "/p/the8020/system/tables/settings.ts"
    );
    const row = await Settings.select([Settings.value]).where(
      Settings.key,
      "=",
      configurationKey,
    ).executeTakeFirst();
    return configuration.parse(row?.value ?? defaultConfiguration);
  })();
  cachedConfiguration = { expires: Date.now() + refreshMilliseconds, value };
  value.catch(() => {
    if (cachedConfiguration?.value === value) cachedConfiguration = undefined;
  });
  return value;
}

export interface Catalog {
  name: string;
  texts: Record<string, string>;
}

export function parseCatalog(value: unknown): Catalog {
  const item = value as Partial<Catalog> | null;
  if (
    !item || typeof item.name !== "string" || !item.name.trim() ||
    !item.texts || Array.isArray(item.texts) || typeof item.texts !== "object"
  ) {
    throw new TypeError("A catalog needs a language name and texts object.");
  }
  for (const [key, text] of Object.entries(item.texts)) {
    if (
      !key.length || key.length > 200 || typeof text !== "string" ||
      !text.trim() || text.length > 16_384
    ) {
      throw new TypeError(`Invalid catalog text: ${key}`);
    }
  }
  return item as Catalog;
}

export async function readCatalog(
  packageId: string,
  language: string,
  root = "/workspace/packages",
): Promise<Catalog | undefined> {
  if (
    !packagePattern.test(packageId) ||
    !languageCode.safeParse(language).success
  ) throw new TypeError("Invalid catalog identity.");
  try {
    const packageRoot = await Deno.realPath(`${root}/${packageId}`);
    const path = await Deno.realPath(
      `${packageRoot}/i18n/locales/${language}.json`,
    );
    if (!path.startsWith(`${packageRoot}/`)) {
      throw new TypeError("Catalog escapes its package.");
    }
    using file = await Deno.open(path);
    const info = await file.stat();
    if (!info.isFile || info.size > maximumBytes) {
      throw new TypeError("Catalog must be a file of at most 2 MiB.");
    }
    const bytes = new Uint8Array(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const size = await file.read(bytes.subarray(length));
      if (size === null) break;
      length += size;
    }
    if (length > maximumBytes) throw new TypeError("Catalog exceeds 2 MiB.");
    return parseCatalog(
      JSON.parse(new TextDecoder().decode(bytes.subarray(0, length))),
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

/** One prepared dictionary; later layers win. Formatting never walks the chain. */
export function mergeCatalogs(layers: readonly Texts[]): Texts {
  return Object.freeze(Object.assign(Object.create(null), ...layers));
}

export function loadBundle(
  packageId: string,
  chain: readonly string[],
): Promise<Bundle> {
  if (!packagePattern.test(packageId)) {
    throw new TypeError("Invalid catalog package.");
  }
  const key = `${packageId}:${chain.join(",")}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.bundle;
  const entry = {
    expires: Date.now() + refreshMilliseconds,
    bytes: 0,
    bundle: Promise.resolve({} as Bundle),
  };
  entry.bundle = (async () => {
    const { default: Translations } = await import("./tables/translations.ts");
    const rows = await Translations.selectAll().where(
      Translations.package,
      "=",
      packageId,
    )
      .where(Translations.language, "in", [...chain]).limit(10_001).execute();
    if (rows.length > 10_000) {
      throw new TypeError("A package language chain exceeds 10000 overrides.");
    }
    const layers: Texts[] = [];
    for (const code of [...chain].reverse()) {
      layers.push((await readCatalog(packageId, code))?.texts ?? {});
      layers.push(
        Object.fromEntries(
          rows.filter((row) => row.language === code).map((
            row,
          ) => [row.key, row.value]),
        ),
      );
    }
    const texts = mergeCatalogs(layers);
    entry.bytes = JSON.stringify(texts).length * 2;
    if (entry.bytes > 4 * maximumBytes) {
      throw new TypeError("Effective catalog exceeds 8 MiB.");
    }
    let bytes = [...cache.values()].reduce((sum, item) => sum + item.bytes, 0);
    while (cache.size > 128 || bytes > 16 * 1024 * 1024) {
      const oldest = cache.keys().next().value!;
      bytes -= cache.get(oldest)!.bytes;
      cache.delete(oldest);
    }
    return Object.freeze({ package: packageId, language: chain[0]!, texts });
  })();
  cache.set(key, entry);
  entry.bundle.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return entry.bundle;
}
