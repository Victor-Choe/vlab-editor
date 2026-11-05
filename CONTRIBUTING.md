# Contributing

Bug reports, documentation improvements, and focused pull requests are welcome.

## Set up

Use Node.js 24 and pnpm 11.3.0. Clone your fork and install dependencies:

```sh
pnpm install
pnpm dev
```

The playground runs at <http://localhost:3005>. Library changes rebuild automatically.

## Repository layout

```text
src/engine/      ProseMirror state, commands, Markdown, and extensions
src/react/       React components and hooks
src/lib/         Shared class-name utility
test/            Unit and integration tests
playground/      Standalone Vite demo
docs/            User and contributor guides
```

## Checks

```sh
pnpm check
```

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Check formatting, imports, and lint rules |
| `pnpm format` | Apply formatting |
| `pnpm typecheck` | Check library and test types |
| `pnpm test` | Run the Node.js/jsdom unit and integration suite |
| `pnpm test:watch` | Watch tests while editing |
| `pnpm build` | Generate ESM JavaScript and TypeScript declarations |
| `pnpm build:playground` | Build the package and type-check/build the demo |

## Pull requests

Open an issue before starting a substantial new feature or API change. For a bug, include a small reproduction, expected behavior, actual behavior, and relevant browser/React versions.

Keep changes focused. When behavior changes, add or update a regression test that demonstrates the user-visible result. Update the relevant guide when changing a public contract.

Use TypeScript and the repository's Biome formatting. Keep source, tests, and configuration free of explanatory comments; put behavioral contracts and design explanations in `docs/` and use descriptive names in code. Preserve executable directives such as `"use client"`.

Your contribution is distributed under the repository's [MIT license](./LICENSE).
