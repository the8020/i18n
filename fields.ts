import { text } from "./mod.ts";
import { msg } from "/p/the8020/i18n/i18n/messages.ts";
import { field, z } from "/p/the8020/db/fields.ts";

export const language = field(
  z.string().min(1).max(64).refine((value) => {
    try {
      return Intl.getCanonicalLocales(value)[0] === value;
    } catch {
      return false;
    }
  }, { error: () => text(msg("validation.canonical_language")) }),
  {
    label: msg("languages.language"),
    description: msg("fields.a_language_code_such_as_en_cs"),
  },
);

export const enabledLanguage = field(language, {
  valueHelp: async (request) => {
    const { getConfiguration } = await import("./store.ts");
    const { queryValueHelp } = await import("/p/the8020/uui/lists.ts");
    return queryValueHelp(
      z.object({
        code: language,
        name: field(z.string(), { label: msg("languages.name") }),
      }),
      (await getConfiguration()).languages,
      request,
    );
  },
});

export const configuration = z.object({
  defaultLanguage: language,
  defaultLoginLanguage: language.optional(),
  languages: z.array(z.object({
    code: language,
    name: z.string().trim().min(1).max(100),
  })).min(1).max(64),
  fallbacks: z.record(language, z.array(language).max(8)).default({}),
}).superRefine((value, ctx) => {
  const codes = value.languages.map((item) => item.code);
  if (
    new Set(codes).size !== codes.length ||
    !codes.includes(value.defaultLanguage)
  ) {
    ctx.addIssue({
      code: "custom",
      message: text(msg("validation.unique_languages")),
    });
  }
  if (
    value.defaultLoginLanguage !== undefined &&
    !codes.includes(value.defaultLoginLanguage)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["defaultLoginLanguage"],
      message: text(msg("validation.login_language_enabled")),
    });
  }
});
export type Configuration = z.infer<typeof configuration>;
export const defaultConfiguration: Configuration = {
  defaultLanguage: "en",
  languages: [{ code: "en", name: "English" }, { code: "cs", name: "Čeština" }],
  fallbacks: {},
};

export function fallbackChain(
  config: Configuration,
  selected: string,
): string[] {
  return selected === "en" ? ["en"] : [
    ...new Set(
      [selected, ...(config.fallbacks[selected] ?? [])].filter((code) =>
        code !== "en"
      ),
    ),
    "en",
  ];
}
