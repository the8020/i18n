import type { z } from "/p/the8020/db/fields.ts";
import english from "./i18n/locales/en.json" with { type: "json" };
import { currentLocalization, text } from "./mod.ts";
import { format, isMessage, type Message, messages } from "./messages.ts";

const m = messages("the8020/i18n");

/** A per-parse error map: schema-authored errors keep Zod's normal precedence. */
export const validationError: z.core.$ZodErrorMap = (issue) => {
  if (issue.code === "custom" && isMessage(issue.params?.text)) {
    return text(issue.params.text);
  }
  const vars: NonNullable<Message["vars"]> = {};
  let key = "validation.invalid";
  switch (issue.code) {
    case "invalid_type":
      key = issue.input === undefined || issue.input === null
        ? "validation.required"
        : "validation.type";
      break;
    case "too_small":
      if (issue.origin === "string" && issue.minimum === 1) {
        key = "validation.required";
      } else {
        key = `validation.${
          issue.origin === "string"
            ? "text"
            : issue.origin === "array"
            ? "items"
            : "value"
        }.minimum`;
        Object.assign(vars, { limit: String(issue.minimum) });
      }
      break;
    case "too_big":
      key = `validation.${
        issue.origin === "string"
          ? "text"
          : issue.origin === "array"
          ? "items"
          : "value"
      }.maximum`;
      Object.assign(vars, { limit: String(issue.maximum) });
      break;
    case "invalid_value":
      key = "validation.choice";
      break;
    case "invalid_format":
      key = "validation.format";
      break;
    case "not_multiple_of":
      key = "validation.multiple";
      Object.assign(vars, { limit: String(issue.divisor) });
      break;
  }
  const localized = currentLocalization()?.text(m(key, vars));
  return localized && !localized.startsWith("[!")
    ? localized
    : format(english.texts, key, vars);
};
