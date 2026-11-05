# vLab Editor playground

A Vite/React demo of the public editor API, including toolbar presets, Markdown conversion, tables, custom code-block views, highlighting, block dragging, and application-owned media forms.

From the repository root:

```sh
pnpm install
pnpm dev
```

Open <http://localhost:3005>. The root command watches both library output and the demo.

```sh
pnpm build:playground
pnpm preview
```

The production output is `playground/dist/`.

## GitHub Pages

Enable **Settings → Pages → Build and deployment → Source → GitHub Actions** in the repository. After a push to `main`, the `CI and Pages` workflow runs all checks and deploys `playground/dist/` to:

<https://victor-choe.github.io/vlab-editor/>

Pull requests run checks without deploying. The workflow can also be started manually from the Actions tab.

The workflow sets `PAGES_BASE_PATH=/vlab-editor/`. Vite uses that base for built assets, the home link, sample images, and the demo upload result. Local development defaults to `/`. To preview the Pages build locally:

```sh
PAGES_BASE_PATH=/vlab-editor/ pnpm build:playground
pnpm preview
```

Open <http://localhost:3005/vlab-editor/>. If you change the repository name or configure a custom domain, update `PAGES_BASE_PATH` in the workflow to match the deployed path.

The demo uses Tailwind CSS and a local Radix UI dialog wrapper; these are playground dependencies, not requirements of the editor library. Example upload behavior is implemented in [demo-upload.ts](./src/demo-upload.ts) and is not a production upload service.

Start with [main.tsx](./src/main.tsx), [ShowcaseToolbar.tsx](./src/components/ShowcaseToolbar.tsx), and [editor-extensions.ts](./src/editor-extensions.ts). UI text and sample content currently use Korean. See the root [English README](../README.md) or [Korean README](../README.ko.md) for library usage.
