import { localizedText as resolveMessage } from "/p/the8020/i18n/mod.ts";
import { msg as messageSymbol } from "/p/the8020/i18n/i18n/messages.ts";
import { db } from "/p/the8020/db/mod.ts";
import { requirePermission } from "/p/the8020/auth/mod.ts";
import Settings from "/p/the8020/system/tables/settings.ts";
import { configuration, language } from "./fields.ts";
import { packagePattern, variables } from "./messages.ts";
import { clearCache, configurationKey, readCatalog } from "./store.ts";
import Translations from "./tables/translations.ts";

export async function saveConfiguration(input: unknown): Promise<void> {
  await requirePermission("the8020.i18n.languages.edit", "");
  const value = configuration.parse(input);
  await db.insertInto(Settings.table).values({
    key: configurationKey,
    value,
    definitionHash: "the8020/i18n",
    updatedAt: new Date(),
  }).onConflict((conflict) =>
    conflict.column("key").doUpdateSet({ value, updatedAt: new Date() })
  ).execute();
  clearCache();
}

export async function saveTranslation(
  packageId: string,
  code: string,
  key: string,
  value: string | null,
): Promise<void> {
  await requirePermission("the8020.i18n.translations.edit", packageId);
  if (!packagePattern.test(packageId)) {
    throw new TypeError(
      await resolveMessage(messageSymbol("errors.invalid_package_id")),
    );
  }
  code = language.parse(code);
  const source = (await readCatalog(packageId, "en"))?.texts;
  if (!source || !Object.hasOwn(source, key)) {
    throw new TypeError(
      await resolveMessage(messageSymbol("errors.unknown_english_text_key")),
    );
  }
  if (value === null) {
    await Translations.delete().where(Translations.package, "=", packageId)
      .where(Translations.language, "=", code).where(Translations.key, "=", key)
      .execute();
  } else {
    if (
      !value.trim() || value.length > 16_384 ||
      JSON.stringify(variables(value)) !==
        JSON.stringify(variables(source[key]!))
    ) {
      throw new TypeError(
        await resolveMessage(
          messageSymbol(
            "errors.translation_must_contain_text_and_the_same_variables_as_english",
          ),
        ),
      );
    }
    await Translations.insert({
      package: packageId,
      language: code,
      key,
      value,
    }).onConflict((conflict) =>
      conflict.columns(["package", "language", "key"]).doUpdateSet({ value })
    ).execute();
  }
  clearCache();
}
