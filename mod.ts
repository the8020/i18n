import { AsyncLocalStorage } from "node:async_hooks";
import { withLanguage } from "@the8020/context";
import { type Configuration, fallbackChain, language } from "./fields.ts";
import { type Bundle, format, isMessage, type Text } from "./messages.ts";
import { getConfiguration, loadBundle } from "./store.ts";

export * from "./messages.ts";
export { getConfiguration } from "./store.ts";
export {
  type Configuration,
  defaultConfiguration,
  fallbackChain,
} from "./fields.ts";

const scope = new AsyncLocalStorage<Localization>();

/** Owned by one request or retained UUI session. Prepared dictionaries never mutate. */
export class Localization {
  used = false;
  readonly #bundles = new Map<string, Bundle>();
  readonly #pending = new Map<string, Promise<Bundle>>();
  readonly chain: readonly string[];

  constructor(
    readonly language: string,
    readonly configuration: Configuration,
    readonly loader: typeof loadBundle = loadBundle,
  ) {
    this.chain = fallbackChain(configuration, language);
  }

  hasBundle(packageId: string): boolean {
    return this.#bundles.has(packageId);
  }

  async bundle(packageId: string): Promise<Bundle> {
    const existing = this.#bundles.get(packageId);
    if (existing) return existing;
    let pending = this.#pending.get(packageId);
    if (!pending) {
      pending = this.loader(packageId, this.chain);
      this.#pending.set(packageId, pending);
    }
    try {
      const bundle = await pending;
      this.#bundles.set(packageId, bundle);
      return bundle;
    } finally {
      this.#pending.delete(packageId);
    }
  }

  text(value: Text): string {
    if (typeof value === "string") return value;
    this.used = true;
    const bundle = this.#bundles.get(value.package);
    return bundle
      ? format(bundle.texts, value.key, value.vars)
      : sourceText(value);
  }
}

export function currentLocalization(): Localization | undefined {
  return scope.getStore();
}

export function withLocalization<T>(
  localization: Localization,
  run: () => T,
): T {
  return withLanguage(
    localization.language,
    () => scope.run(localization, run),
  );
}

export async function createLocalization(
  selected?: string,
): Promise<Localization> {
  const config = await getConfiguration();
  const code = selected === undefined
    ? config.defaultLanguage
    : language.parse(selected);
  if (!config.languages.some((item) => item.code === code)) {
    throw new TypeError(`Language ${code} is not enabled.`);
  }
  return new Localization(code, config);
}

/** Load only explicit message references in presentation declarations, never model data. */
export function prepareTexts(...values: unknown[]): Promise<void> | undefined {
  const localization = currentLocalization();
  if (!localization) return;
  const packages = new Set<string>();
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (isMessage(value)) {
      if (!localization.hasBundle(value.package)) packages.add(value.package);
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const item of Object.values(value)) visit(item);
  };
  values.forEach(visit);
  if (packages.size) {
    return Promise.all(
      [...packages].map((packageId) => localization.bundle(packageId)),
    ).then(() => {});
  }
}

export function text(value: Text): string;
export function text(value: Text | undefined): string | undefined;
export function text(value: Text | undefined): string | undefined {
  return value === undefined || typeof value === "string"
    ? value
    : currentLocalization()?.text(value) ?? sourceText(value);
}

function sourceText(value: import("./messages.ts").Message): string {
  return value.fallback === undefined
    ? `[!${value.package}:${value.key}]`
    : format({ [value.key]: value.fallback }, value.key, value.vars);
}

/** Prepare once, then use the returned formatter synchronously in program code. */
export async function translations(packageId: string) {
  const localization = currentLocalization() ?? await createLocalization();
  const bundle = await localization.bundle(packageId);
  return (key: string, vars?: import("./messages.ts").Message["vars"]) => {
    localization.used = true;
    return format(bundle.texts, key, vars);
  };
}

/** Resolve a fresh presentation declaration, never a model or a shared schema. */
export type Resolved<T> = T extends import("./messages.ts").Message ? string
  : T extends readonly (infer V)[] ? Resolved<V>[]
  : T extends Record<string, unknown> ? { [K in keyof T]: Resolved<T[K]> }
  : T;

export function resolveTexts<T>(value: T): Resolved<T> {
  if (isMessage(value)) return text(value) as Resolved<T>;
  if (Array.isArray(value)) return value.map(resolveTexts) as Resolved<T>;
  if (
    value && typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveTexts(item)]),
    ) as Resolved<T>;
  }
  return value as Resolved<T>;
}
