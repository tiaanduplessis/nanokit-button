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
style array still has a hole. Missing Text.propTypes now uses a portable recursive container validator.
The native style validator remains unchanged when present. The fallback checks
objects, historical numeric style references, falsy placeholders and nested
arrays, but does not validate every property inside a TextStyle object.

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

## Automatic JSX and current React hosts

The regression command above also runs this suite. To run it separately:

```sh
node test/modern.js
```

This additional suite transforms the actual entry and callers with classic and
automatic JSX (including development jsxDEV), crosses caller/component modes,
then inspects real React element props and the output of the pure component
function. It is not a native renderer. The existing regression suite continues
to exercise the React 16 test renderer. Both launch separate development and
production processes.

An independently installed React host can be selected without changing this
repository's dependency declarations. In a separate empty directory, install
one exact React version with scripts disabled, for example:

```sh
npm install --prefix /absolute/path/to/react19-host --ignore-scripts --no-audit --no-fund --save-exact react@19.3.0
BUTTON_TEST_REACT=/absolute/path/to/react19-host node test/modern.js
```

The same command supports React 18.3.1; the pinned fixture supplies React 16.14.0.
The modern suite supports BUTTON_TEST_SOURCE and BUTTON_TEST_RUNTIME for packed
consumers in the same way as the regression suite. BUTTON_TEST_REACT selects
the React host independently from the package's prop-types runtime.

Coverage includes missing and empty Text.propTypes, native-validator identity,
recursive valid/invalid styles, defaults under mixed JSX modes, mutation and
replacement of the public defaultProps object (including null/undefined and
additional default keys), frozen caller props, callback/rest-prop identity,
platform capture, and the existing Android disabled styles and array hole.
Defaults are resolved only for undefined values. Public defaultProps metadata
remains available; React 18's existing function-defaultProps renderer warning
is not addressed by this compatibility change.

A passed suite does not establish native device, safe-area, layout, touch-event,
or full current React Native compatibility. React 19 does not automatically
check function propTypes; the suite calls checkPropTypes explicitly when testing
validator behavior. No React Native SDK is needed for these JavaScript checks.
