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
import { enabledLanguage } from "../../fields.ts";
import { getConfiguration, messages } from "../../mod.ts";
import { saveConfiguration } from "../../admin.ts";
const m = messages("the8020/i18n");
const row = z.object({
  code: field(z.string(), { label: m("languages.language") }),
  name: field(z.string().trim().max(100), { label: m("languages.name") }),
  fallbacks: field(z.string(), {
    label: m("languages.fallbacks"),
    description: m("languages.fallbackHelp"),
  }),
});
const schema = z.object({
  defaultLanguage: field(enabledLanguage, {
    label: m("languages.defaultLanguage"),
  }),
  defaultLoginLanguage: field(enabledLanguage, {
    label: m("languages.defaultLoginLanguage"),
    description: m("languages.defaultLoginLanguageHelp"),
  }),
  languages: field(z.array(row), { label: m("languages.title") }),
});

export default async function languages(): Promise<void> {
  await requirePermission("the8020.i18n.languages.edit", "");
  const config = await getConfiguration();
  const model = new Model({
    defaultLanguage: config.defaultLanguage,
    defaultLoginLanguage: config.defaultLoginLanguage ?? config.defaultLanguage,
    languages: config.languages.map((item) => ({
      ...item,
      fallbacks: (config.fallbacks[item.code] ?? ["en"]).join(", "),
    })),
  });
  while (true) {
    const event = await callScreen({
      id: "languages",
      title: m("languages.title"),
      schema,
      model,
      controls: [
        { bind: "defaultLanguage" },
        { bind: "defaultLoginLanguage" },
        {
          bind: "languages",
          readOnly: true,
          list: {
            key: "code",
            toolbar: [{ id: "add", label: m("common.add") }],
          },
        },
      ],
      header: {
        actions: [{ id: "save", label: m("common.save"), kind: "primary" }],
      },
    });
    if (event.action === BACK_EVENT) return;
    if (event.action === "add" || event.action === "select") {
      const existing = model.data.languages.find((item) =>
        item.code === event.value
      );
      await presentModal(async () => {
        const draft = new Model(
          existing ? { ...existing } : { code: "", name: "", fallbacks: "en" },
        );
        while (true) {
          const event = await callScreen({
            id: "language",
            title: m("languages.language"),
            schema: row,
            model: draft,
            header: {
              actions: [
                { id: "save", label: m("common.save"), kind: "primary" },
                ...(existing
                  ? [{
                    id: "delete",
                    label: m("common.remove"),
                    kind: "danger" as const,
                  }]
                  : []),
              ],
            },
          });
          if (event.action === BACK_EVENT) return;
          if (event.action === "delete") {
            model.data.languages = model.data.languages.filter((item) =>
              item !== existing
            );
            return;
          }
          if (event.action === "save") {
            model.data.languages = [
              ...model.data.languages.filter((item) => item !== existing),
              draft.data,
            ];
            return;
          }
        }
      });
    }
    if (event.action === "save") {
      try {
        await saveConfiguration({
          defaultLanguage: model.data.defaultLanguage,
          defaultLoginLanguage: model.data.defaultLoginLanguage,
          languages: model.data.languages.map(({ code, name }) => ({
            code,
            name,
          })),
          fallbacks: Object.fromEntries(
            model.data.languages.map(
              (item) => [
                item.code,
                item.fallbacks.split(/[\s,]+/).filter(Boolean),
              ],
            ),
          ),
        });
        return;
      } catch (error) {
        sendMessage(describeError(error), "error");
      }
    }
  }
}
