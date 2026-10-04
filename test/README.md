# JavaScript regression tests

This opt-in fixture uses Node.js 16 or newer, React and react-test-renderer
16.14.0, prop-types 15.8.1, and Babel standalone 7.29.9. Exact dependency
versions and integrity hashes are recorded in the fixture's package lock.
It avoids installing the legacy root development tools or wildcard React
Native peer.

From the repository root:

```sh
npm ci --prefix test --ignore-scripts --no-audit --no-fund
npm run test:regression
```

Separate development and production processes transform the actual JSX source
and render with real React, using in-memory React Native host doubles. Each
process loads fresh iOS, Android and other-platform module instances, with and
without inherited TouchableOpacity.propTypes. The tests cover:

- Exact host hierarchy, base styles, style array order and caller references
- Default height 56 and activeOpacity 0.2, dimensions, zero/null and frozen inputs
- Truthy text versus children fallback, including empty string, zero and false
- Outer-only rest props and unchanged callbacks, without invoking callbacks
- SelectableBackground call counts, repeated updates and import-captured platform
- Inherited validators and Text.propTypes.style identities, using checkPropTypes
- Development warnings and production validation no-ops

Existing behavior is deliberately characterized rather than changed: enabled
Android renders still apply disabledStyle and disabledTextStyle, and its Text
style array still has a hole. Missing Text.propTypes still causes an import-time
TypeError. These tests do not establish compatibility with React Native versions
that removed Text.propTypes.

For a package installed in a separate consumer, use that package's source and
resolved runtime (point inside the package to handle nested dependencies):

```sh
BUTTON_TEST_SOURCE=/absolute/path/to/consumer/node_modules/nanokit-button/index.js \
BUTTON_TEST_RUNTIME=/absolute/path/to/consumer/node_modules/nanokit-button \
npm run test:regression
```

The same runtime override supports a separately audited installation of the
previously locked prop-types 15.6.0. The runner uses unique check names for its
older warning-cache API; exact warning text is intentionally not pinned.

These are JavaScript contract tests, not native Android/iOS device tests or a
guarantee for every wildcard peer version. The published entry still contains
JSX/ES modules and requires a compatible React Native bundler. The test directory
is excluded by the unchanged published files whitelist.

The root npm test remains a legacy mutating formatter and is separate from this
suite. Its existing prettier-standard ^8.0.0 manifest declaration does not match
the root yarn.lock's ^7.0.3 selector/version 7.0.3. That unrelated discrepancy
and the legacy development dependency graph are intentionally unchanged; do not
treat this isolated fixture as validation of a full root development install.
