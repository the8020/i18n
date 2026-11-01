import { t, table, type TableDatabase } from "/p/the8020/db/mod.ts";
import { packageId } from "/p/the8020/packages/types/package.ts";

const Translations = table("the8020__i18n__translations", {
  package: t.from(packageId).primaryKey(),
  language: t.text().primaryKey(),
  key: t.text().primaryKey(),
  value: t.text(),
});

declare module "/p/the8020/db/types.ts" {
  interface Database extends TableDatabase<typeof Translations> {}
}
export default Translations;
