# `@bunwire/cli`

Install `@bunwire/cli` in a Bunwire application and run the `bunwire` executable with Node. Bun is not needed for project artifact generation; Vite is optional unless the application uses its plugin.

```sh
bunwire help
bunwire list
bunwire generate
bunwire generate --root path/to/project
bunwire watch
bunwire watch --root path/to/project
bunwire routes:list --json
bunwire providers:list --root path/to/project
```

`generate` reads exactly one `bunwire.config.*` in the selected root (the current working directory by default), analyzes the configured source and bootstrap without starting the application, and writes physical `.bunwire` artifacts only when their contents change. Run it once per configured root in a multi-root repository. Diagnostics go to stderr and failures return a nonzero exit code.

`watch` runs the same generation immediately, then refreshes when the selected project's config, bootstrap, managed sources, pages, or consumed project-local dependencies change. It also recovers when a missing imported helper is created. Analysis errors go to stderr while watch remains active; the last successful artifacts stay in place. Stop with Ctrl+C. A clean shutdown after a successful analysis returns zero; stopping while the latest analysis is failing returns nonzero. Multi-root projects run one watcher per root. Generated output edits do not trigger refreshes.

Read-only inspection commands are `routes:list`, `events:list`, `listeners:list`, `jobs:list`, `schedule:list`, `providers:list`, `controllers:list`, `services:list`, `middleware:list`, and `commands:list`. They analyze current source without starting the Application or writing artifacts. The default output is a tab-separated table with `NAME`, `KIND`, `DETAILS`, `RELATED`, and `SOURCE` columns. Empty results show the header only. `commands:list` reports managed commands; `list` remains the CLI command catalog. Provider listings show discovered classes and statically resolvable `withProviders()` references, never runtime container bindings. Schedule listings show compiled cadence, not live next-run or lock state.

Each inspection command accepts `--json`, which emits one object with stable keys: `{ "schemaVersion": 1, "command": "routes:list", "root": "...", "items": [...] }`. Items are sorted by canonical identity and contain `identity`, `kindId`, `name`, `location` (`{file,line,column}` relative to the root, or `null` for adapter-owned definitions), `details` (sorted scalar fields), and `related` (canonical identities). Empty results use `items: []`. Diagnostics remain on stderr and failures return nonzero without a success envelope. `--json` is not accepted by generation, watch, or command-catalog commands.

Source generation, Bun runtime operation dispatch, and project creation are planned for later milestones.
