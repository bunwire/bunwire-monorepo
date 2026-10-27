# `@bunwire/cli`

Install `@bunwire/cli` in a Bunwire application and run the `bunwire` executable with Node. Bun is not needed for project artifact generation; Vite is optional unless the application uses its plugin.

```sh
bunwire help
bunwire list
bunwire generate
bunwire generate --root path/to/project
```

`generate` reads exactly one `bunwire.config.*` in the selected root (the current working directory by default), analyzes the configured source and bootstrap without starting the application, and writes physical `.bunwire` artifacts only when their contents change. Run it once per configured root in a multi-root repository. Diagnostics go to stderr and failures return a nonzero exit code.

Standalone watch, compiler inspection, source generation, Bun runtime operations, and project creation are planned for later milestones.
