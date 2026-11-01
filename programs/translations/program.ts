import { text as localizedText } from "/p/the8020/i18n/mod.ts";
import { msg } from "/p/the8020/i18n/i18n/messages.ts";
import { requirePermission } from "/p/the8020/auth/mod.ts";
import {
  BACK_EVENT,
  callScreen,
  describeError,
  field,
  Model,
  presentModal,
  sendMessage,
  z,
} from "/p/the8020/uui/mod.ts";
import { language } from "../../fields.ts";
import { packageId } from "/p/the8020/packages/types/package.ts";
import { messages } from "../../messages.ts";
import { getConfiguration, loadBundle, readCatalog } from "../../store.ts";
import { fallbackChain } from "../../fields.ts";
import { saveTranslation } from "../../admin.ts";
import Translations from "../../tables/translations.ts";
const m = messages("the8020/i18n");
const selection = z.object({
  package: packageId,
  language,
});
const row = z.object({
  key: field(z.string(), { label: m("translations.key") }),
  english: field(z.string(), { label: m("translations.english") }),
  value: field(z.string(), { label: m("translations.effective") }),
});
const edit = z.object({
  value: field(z.string(), {
    label: m("translations.value"),
    semanticType: "long-string",
  }),
});
export default async function translations(): Promise<void> {
  const select = new Model({
    package: "the8020/uui",
    language: (await getConfiguration()).defaultLanguage,
  });
  while (true) {
    const event = await callScreen({
      id: "translations-select",
      title: m("translations.title"),
      schema: selection,
      model: select,
      header: {
        actions: [{ id: "open", label: m("common.open"), kind: "primary" }],
      },
    });
    if (event.action === BACK_EVENT) return;
    if (event.action !== "open") continue;
    try {
      const packageId = select.data.package, code = select.data.language;
      await requirePermission("the8020.i18n.translations.edit", packageId);
      const source = await readCatalog(packageId, "en");
      if (!source) {
        throw new Error(
          localizedText(msg("ui.package_has_no_english_catalog")),
        );
      }
      await presentModal(async () => {
        while (true) {
          const effective = await loadBundle(
            packageId,
            fallbackChain(await getConfiguration(), code),
          );
          const model = new Model({
            texts: Object.entries(source.texts).map(([key, english]) => ({
              key,
              english,
              value: effective.texts[key] ?? "",
            })),
          });
          const event = await callScreen({
            id: "translations",
            title: msg("program.packageid_code", {
              packageId: packageId,
              code: code,
            }),
            schema: z.object({
              texts: field(z.array(row), { label: m("translations.title") }),
            }),
            model,
            controls: [{ bind: "texts", readOnly: true, list: { key: "key" } }],
          });
          if (event.action === BACK_EVENT) return;
          if (event.action !== "select" || typeof event.value !== "string") {
            continue;
          }
          const key = event.value;
          const override = await Translations.selectAll().where(
            Translations.package,
            "=",
            packageId,
          ).where(Translations.language, "=", code).where(
            Translations.key,
            "=",
            key,
          ).executeTakeFirst();
          await presentModal(async () => {
            const draft = new Model({
              value: override?.value ?? effective.texts[key] ?? "",
            });
            while (true) {
              const event = await callScreen({
                id: "translation",
                title: key,
                description: source.texts[key],
                schema: edit,
                model: draft,
                header: {
                  actions: [{
                    id: "save",
                    label: m("common.save"),
                    kind: "primary",
                  }, { id: "reset", label: m("translations.reset") }],
                },
              });
              if (event.action === BACK_EVENT) return;
              try {
                await saveTranslation(
                  packageId,
                  code,
                  key,
                  event.action === "reset" ? null : draft.data.value,
                );
                return;
              } catch (error) {
                sendMessage(describeError(error), "error");
              }
            }
          });
        }
      });
    } catch (error) {
      sendMessage(describeError(error), "error");
    }
  }
}
