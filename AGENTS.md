Parent DOX: [8020 workspace](../AGENTS.md).

Framework source:
[agent0ai/dox/AGENTS.md](https://github.com/agent0ai/dox/blob/765ae4ac02cc884eefcd41a3d0f71941721adb89/AGENTS.md).

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable
  docs must stay understandable from the nearest applicable AGENTS.md plus every
  parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path,
   read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide
   rules
7. If docs conflict, the closer doc controls local work details, but no child
   doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session
before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or
  quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child
index changes. Update child docs when parent changes alter local rules. Remove
stale or contradictory text immediately. Small edits that do not change behavior
or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences,
  durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX
  Index
- Each parent explains what its direct children cover and what stays owned by
  the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own
  purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user
  instructions; if there are no specific standards or instructions yet, leave it
  empty
- Verification must reflect an existing check; if no verification framework
  exists yet, leave it empty and update it when one exists

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local
  version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for
  risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

- Keep lookup synchronous and inexpensive after catalog preparation. English is
  the complete source catalog; customers can add languages and override keys.

## Child DOX Index

- [tables/AGENTS.md](tables/AGENTS.md): Customer translation overrides.
- [programs/AGENTS.md](programs/AGENTS.md): Language and translation
  administration.
- [i18n/AGENTS.md](i18n/AGENTS.md): This package's own message catalogs.

# Purpose

- Own package message references, catalogs, fallback resolution, application
  language configuration, and customer overrides for `the8020/i18n`.

# Ownership

- Root modules own the shared API and checker. UUI owns screen rendering and
  login selection; users owns account language; services owns request selection.

# Local Contracts

- Configuration is one `i18n.configuration` row in system settings. Complete
  per-language fallback arrays are deduplicated with English last, not expanded
  recursively. All 43 built-in languages in `languages.ts` are enabled
  initially; saved language configurations remain unchanged. English is the
  system default. `defaultLoginLanguage` independently selects the initial
  login-screen language; absent settings inherit the system default. Both
  defaults must be enabled languages.
- Configuration and merged package dictionaries refresh on use after five
  seconds. No poller or invalidation service exists. A retained Localization
  keeps its loaded dictionaries. Customer edits clear the current Worker cache.
- `translations(packageId)` prepares once and returns a synchronous formatter.
  `messages(packageId, englishTexts?)` creates deferred references for shared
  field metadata and screen declarations. Named `{variables}` use plain
  single-pass formatting; missing keys/variables remain visible as `[!key]`.
  English source text keeps unscoped tools and tests usable without loading
  catalogs.
- `check.ts <package-root>...` rejects duplicate/blank keys, invalid catalog
  language names, unknown translated keys, and variable/icon mismatches. English
  is complete; `--complete=builtin` requires every language in `languages.ts` to
  cover all English keys in first-party packages. Custom catalogs may be
  partial. It does not statically analyze code.
- The checker also reports advisory length increases using Tuxee's thresholds:
  at least 75% and 8 extra graphemes for English texts up to 30 graphemes, or
  100% and 20 extra graphemes for longer texts. Named variables and icon markup
  each count as one grapheme. The console shows the ten largest increases;
  `--length-report=/tmp/i18n-length-report.json` writes all warnings when run
  with write permission for that file. Warnings do not fail catalog checks.
  Review short labels in context; keep natural wording, meaning, destructive
  distinctions, and accessibility. Grapheme counts are not pixel measurements.

- `languages.ts` owns the first-party supported set, matching Tuxee: `ar`, `bg`,
  `ca`, `cs`, `da`, `de`, `el`, `en`, `es`, `et`, `fa`, `fi`, `fil`, `fr`, `he`,
  `hi`, `hr`, `hu`, `id`, `is`, `it`, `ja`, `ko`, `lt`, `lv`, `ms`, `nb`, `nl`,
  `pl`, `pt-BR`, `pt-PT`, `ro`, `ru`, `sk`, `sl`, `sr-Latn`, `sv`, `th`, `tr`,
  `uk`, `vi`, `zh-CN`, `zh-TW`. Keep the Portuguese and Chinese variants
  distinct, Serbian in Latin script, and language display names native. Each
  package ships ordinary JSON files; only the selected fallback chain is loaded
  at runtime.

- Catalogs use `i18n/locales/<language>.json` with `name` and flat `texts`.
- Message identity is full package ID plus key. Only explicit references are
  translated; ordinary strings and application data remain unchanged.
- Each selected language has a complete ordered fallback chain, defaulting to
  English. At each language, customer database text overrides the package file.
- Catalog preparation does I/O; formatting never does. Session dictionaries
  remain fixed once loaded. Shared Zod schemas contain language-neutral refs.
- System settings store application language configuration. Customer overrides
  are stored only in this package's table and survive package updates.

# Work Guidance

- Use ordinary JSON, named variables, Zod, and UUI programs. Keep catalog and
  request caches bounded; avoid background work and new dependencies.
- Preserve the visual order of mixed-direction names such as `80|20` in
  right-to-left catalogs with Unicode directional isolates.

# Verification

- Run `deno task check`, `deno task test` and `deno task check:i18n`.
- UUI and services tests cover shared-schema isolation and request boundaries.
- `deno run -A native_fixture.ts ROOT URL` checks a disposable numbered test
  instance with an `admin/admin` account: catalogs, customer fallback/overrides,
  account/header/login selection, clearing the account preference through My
  account, and retained UUI sessions. It changes only that test instance's
  language settings, preferences and translation rows.

## Authoring

```ts
import { field, z } from "/p/the8020/db/fields.ts";
import { messages } from "/p/the8020/i18n/messages.ts";
const m = messages("customer/orders");
export const reference = field(z.string(), { label: m("fields.reference") });
```

Put `{"name":"English","texts":{"fields.reference":"Reference"}}` in the owning
package's `i18n/locales/en.json`. UUI loads references automatically. For
program/service messages, prepare `await translations("customer/orders")` once
and call the returned formatter. `context.language` is available within
UUI/service scopes; ordinary unscoped scripts can create a Localization and use
`withLocalization` explicitly. Custom Zod issues can set `params.text` to a
prepared message reference; schema-authored literal errors retain Zod
precedence.
