import { language } from "./fields.ts";
import { currentLocalization, Localization } from "./mod.ts";
import { getConfiguration } from "./store.ts";

export const languageHeader = "the8020-language";
export class InvalidLanguage extends Error {}

/** Select once at the service boundary, before validation or handler execution. */
export async function requestLocalization(
  request: Request,
  username: string,
): Promise<Localization> {
  const inherited = currentLocalization();
  const config = inherited?.configuration ?? await getConfiguration();
  const override = request.headers.get(languageHeader);
  if (override !== null) {
    const parsed = language.safeParse(override);
    if (
      !parsed.success ||
      !config.languages.some((item) => item.code === parsed.data)
    ) {
      throw new InvalidLanguage("Choose an enabled language.");
    }
    if (inherited?.language === parsed.data) return inherited;
    return new Localization(parsed.data, config, inherited?.loader);
  }
  if (inherited) return inherited;
  const { preferredLanguage } = await import("/p/the8020/users/language.ts");
  const preferred = await preferredLanguage(username);
  return new Localization(
    config.languages.some((item) => item.code === preferred)
      ? preferred!
      : config.defaultLanguage,
    config,
  );
}
