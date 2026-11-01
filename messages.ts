/** Browser-safe message data and formatting. No runtime or database imports. */
export interface Message {
  readonly package: string;
  readonly key: string;
  readonly vars?: Readonly<Record<string, string | number | boolean>>;
  /** English source text keeps shared declarations useful outside a localized invocation. */
  readonly fallback?: string;
}

export type Text = string | Message;
export type Texts = Readonly<Record<string, string>>;
export interface Bundle {
  readonly package: string;
  readonly language: string;
  readonly texts: Texts;
}

export const packagePattern =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const variable = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export function messages(packageId: string, source?: Texts) {
  if (!packagePattern.test(packageId)) {
    throw new TypeError("invalid message package");
  }
  return (key: string, vars?: Message["vars"]): Message => ({
    package: packageId,
    key,
    ...(source?.[key] === undefined ? {} : { fallback: source[key] }),
    ...(vars === undefined ? {} : { vars }),
  });
}

export function isMessage(value: unknown): value is Message {
  return value !== null && typeof value === "object" &&
    "package" in value && typeof value.package === "string" &&
    "key" in value && typeof value.key === "string";
}

export function variables(value: string): string[] {
  return [...new Set([...value.matchAll(variable)].map((match) => match[1]!))]
    .sort();
}

export function format(
  texts: Texts,
  key: string,
  vars?: Message["vars"],
): string {
  const template = Object.hasOwn(texts, key) ? texts[key] : undefined;
  if (template === undefined) return `[!${key}]`;
  if (!template.includes("{")) return template;
  let valid = true;
  const result = template.replace(variable, (_, name: string) => {
    if (!vars || !Object.hasOwn(vars, name)) {
      valid = false;
      return "";
    }
    return String(vars[name]);
  });
  return valid ? result : `[!${key}]`;
}

export function direction(language: string): "ltr" | "rtl" {
  return ["ar", "fa", "he", "ur"].includes(language.split("-")[0]!)
    ? "rtl"
    : "ltr";
}
