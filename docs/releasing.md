# Releasing

Publishing is a manual maintainer action. The CI workflow validates changes and does not publish packages.

## Prepare a release

1. Review the API, supported Markdown behavior, and README examples.
2. Select a version in `package.json` and refresh the lockfile with `pnpm install`.
3. Run the complete check:

```sh
pnpm check
```

4. Inspect the npm package contents:

```sh
npm pack --dry-run
```

The `prepack` script rebuilds the library. The package should contain compiled modules/declarations, editor styles, public documentation, both READMEs, and the MIT license. It should exclude tests, playground source, local dependencies, and application-specific files.

5. Create a tarball and install it in a separate React 19 application. Check imports from `vlab-editor`, `vlab-editor/styles.css`, and `vlab-editor/highlight` against the packed package.

```sh
npm pack
```

## Publish

After reviewing the packed artifact, authenticate as an npm account with permission to publish `vlab-editor` and follow npm's current account/authentication requirements.

```sh
npm publish --access public
```

Tag the released commit as `v<version>` and write release notes describing user-visible changes and any compatibility requirements. After the first successful release, update the READMEs' release status.

A tarball check alone does not publish or reserve the npm name.
