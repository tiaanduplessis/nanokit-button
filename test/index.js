'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

// Separate processes load the actual development/production package entrypoints.
if (!process.env.BUTTON_TEST_MODE) {
  const childProcess = require('child_process')
  for (const mode of ['development', 'production']) {
    const result = childProcess.spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { NODE_ENV: mode, BUTTON_TEST_MODE: mode }),
      stdio: 'inherit'
    })
    if (result.error) throw result.error
    assert.strictEqual(result.status, 0, mode + ' tests failed')
  }
  const modern = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'modern.js')], {
    env: process.env,
    stdio: 'inherit'
  })
  if (modern.error) throw modern.error
  assert.strictEqual(modern.status, 0, 'modern JSX contract tests failed')
} else {
  run()
}

function run () {
  const React = require('react')
  const renderer = require('react-test-renderer')
  const runtime = process.env.BUTTON_TEST_RUNTIME
    ? path.resolve(process.env.BUTTON_TEST_RUNTIME)
    : __dirname
  const PropTypes = require(require.resolve('prop-types', { paths: [runtime] }))
  const propTypesVersion = require(require.resolve('prop-types/package.json', { paths: [runtime] })).version
  const filename = path.resolve(process.env.BUTTON_TEST_SOURCE || path.join(__dirname, '..', 'index.js'))
  const compiled = require('@babel/standalone').transform(fs.readFileSync(filename, 'utf8'), {
    filename: filename,
    presets: ['react'],
    plugins: ['transform-modules-commonjs']
  }).code
  const expectedStyles = {
    button: {
      flexDirection: 'row', backgroundColor: '#212121', alignItems: 'center',
      borderRadius: 2, justifyContent: 'center'
    },
    text: {
      color: '#fff', flex: 1, fontFamily: 'System', fontSize: 18,
      textAlign: 'center', backgroundColor: 'transparent'
    }
  }
  let passed = 0
  let validationId = 0
  function warnings (check) {
    const messages = []
    const original = console.error
    console.error = function () { messages.push(Array.from(arguments).join(' ')) }
    try { check() } finally { console.error = original }
    return messages
  }
  function freeze (value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { freeze(value[key]) })
      Object.freeze(value)
    }
    return value
  }
  function load (native) {
    const exports = {}
    const imports = { react: React, 'react-native': native, 'prop-types': PropTypes }
    const wrapper = vm.runInThisContext('(function(require, exports) {\n' + compiled + '\n})', { filename: filename })
    wrapper(function (name) {
      assert(Object.prototype.hasOwnProperty.call(imports, name), 'Unexpected import: ' + name)
      return imports[name]
    }, exports)
    return exports
  }

  for (const platform of ['ios', 'android', 'other']) {
    for (const inherited of [false, true]) {
      const styleCalls = []
      const backgroundCalls = []
      function View (props) { return React.createElement('NativeView', props) }
      function Text (props) { return React.createElement('NativeText', props) }
      function TouchableOpacity (props) { return React.createElement('NativeTouchableOpacity', props) }
      function TouchableNativeFeedback (props) { return React.createElement('NativeTouchableNativeFeedback', props) }
      Text.propTypes = { style: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]) }
      if (inherited) {
        TouchableOpacity.propTypes = {
          nativeFlag: PropTypes.bool, activeOpacity: PropTypes.number, style: PropTypes.any,
          width: PropTypes.bool, height: PropTypes.bool,
          textStyle: PropTypes.bool, disabledTextStyle: PropTypes.bool, disabledStyle: PropTypes.bool
        }
      }
      TouchableNativeFeedback.SelectableBackground = function () {
        const background = freeze({ selectable: backgroundCalls.length + 1 })
        backgroundCalls.push(background)
        return background
      }
      const native = {
        View: View, Text: Text, TouchableOpacity: TouchableOpacity,
        TouchableNativeFeedback: TouchableNativeFeedback, Platform: { OS: platform },
        StyleSheet: { create: function (styles) { styleCalls.push(styles); return freeze(styles) } }
      }
      const exports = load(native)
      const Button = exports.default
      function test (name, check) {
        check()
        passed++
        console.log('ok - ' + process.env.NODE_ENV + ' - ' + platform + ' - inherited=' + inherited + ' - ' + name)
      }
      function validate (props) {
        return warnings(function () {
          // Unique names support 15.6.0's older warning cache without direct validator calls.
          PropTypes.checkPropTypes(Button.propTypes, props, 'prop', 'ButtonFixture' + (++validationId))
        })
      }
      function inspect (tree, input, callCount) {
        const props = Object.assign({}, input)
        for (const key of Object.keys(Button.defaultProps)) {
          if (props[key] === undefined) props[key] = Button.defaultProps[key]
        }
        const android = !props.disabled && platform === 'android'
        const outerType = props.disabled ? 'NativeView' : android ? 'NativeTouchableNativeFeedback' : 'NativeTouchableOpacity'
        const outer = tree.root.findByType(outerType)
        const text = tree.root.findByType('NativeText')
        const view = android ? tree.root.findByType('NativeView') : outer
        const expectedTypes = android ? [outerType, 'NativeView', 'NativeText'] : [outerType, 'NativeText']
        assert.deepStrictEqual(tree.root.findAll(function (node) { return typeof node.type === 'string' && node.type.startsWith('Native') }).map(function (node) { return node.type }), expectedTypes)
        assert.strictEqual(outer.children.length, 1)
        assert.strictEqual(outer.children[0].type, android ? View : Text)
        if (android) assert.strictEqual(view.children[0].type, Text)
        assert.strictEqual(text.props.children, props.text || props.children)
        assert.deepStrictEqual(Object.keys(text.props).sort(), ['children', 'style'])
        const base = styleCalls[0]
        assert.deepStrictEqual(base, expectedStyles)
        if (props.disabled) {
          assert.deepStrictEqual(view.props.style[0], { backgroundColor: props.background, width: props.width, height: props.height })
          assert.strictEqual(view.props.style.length, 4)
          assert.strictEqual(view.props.style[1], base.button)
          assert.strictEqual(view.props.style[2], props.style)
          assert.strictEqual(view.props.style[3], props.disabledStyle)
          assert.deepStrictEqual(text.props.style, [base.text, props.textStyle, props.disabledTextStyle])
        } else if (android) {
          assert.deepStrictEqual(Object.keys(view.props).sort(), ['children', 'style'])
          assert.deepStrictEqual(view.props.style[0], { width: props.width, height: props.height })
          assert.strictEqual(view.props.style.length, 4)
          assert.strictEqual(view.props.style[1], base.button)
          assert.strictEqual(view.props.style[2], props.style)
          assert.strictEqual(view.props.style[3], props.disabledStyle)
          assert.strictEqual(text.props.style.length, 4)
          assert.strictEqual(1 in text.props.style, false, 'Preserve the existing Android array hole')
          assert.strictEqual(text.props.style[0], base.text)
          assert.strictEqual(text.props.style[2], props.textStyle)
          assert.strictEqual(text.props.style[3], props.disabledTextStyle)
          assert.strictEqual(outer.props.background, props.background || backgroundCalls[backgroundCalls.length - 1])
        } else {
          assert.deepStrictEqual(outer.props.style[0], { width: props.width, height: props.height })
          assert.deepStrictEqual(outer.props.style[1], { backgroundColor: props.background })
          assert.strictEqual(outer.props.style.length, 4)
          assert.strictEqual(outer.props.style[2], base.button)
          assert.strictEqual(outer.props.style[3], props.style)
          assert.deepStrictEqual(text.props.style, [base.text, props.textStyle])
        }
        assert.strictEqual(text.props.style[0], base.text)
        assert.strictEqual(text.props.style[android ? 2 : 1], props.textStyle)
        if (props.disabled) assert.strictEqual(text.props.style[2], props.disabledTextStyle)
        const consumed = ['disabled', 'style', 'textStyle', 'disabledStyle', 'disabledTextStyle', 'text', 'width', 'height', 'children', 'background']
        const rest = Object.keys(props).filter(function (key) { return !consumed.includes(key) })
        assert.deepStrictEqual(Object.keys(outer.props).sort(), rest.concat(['children', android ? 'background' : 'style']).sort())
        for (const key of rest) assert.strictEqual(outer.props[key], props[key])
        assert.strictEqual(backgroundCalls.length - callCount, android && !props.background ? 1 : 0)
        assert.strictEqual(styleCalls.length, 1)
      }
      function render (input) {
        const before = JSON.stringify(input)
        freeze(input)
        const calls = backgroundCalls.length
        const messages = warnings(function () {
          const tree = renderer.create(React.createElement(Button, input))
          try { inspect(tree, input, calls) } finally { tree.unmount() }
        })
        assert.deepStrictEqual(messages, [])
        assert.strictEqual(JSON.stringify(input), before)
      }

      test('export, defaults, base styles and import-time side effects', function () {
        assert.deepStrictEqual(Object.keys(exports), ['default'])
        assert.strictEqual(typeof Button, 'function')
        assert.deepStrictEqual(Button.defaultProps, { height: 56, activeOpacity: 0.2 })
        assert.deepStrictEqual(styleCalls, [expectedStyles])
        assert.deepStrictEqual(backgroundCalls, [])
      })
      test('validator inheritance and style identities', function () {
        const keys = ['height', 'width', 'textStyle', 'disabledTextStyle', 'disabledStyle']
        if (inherited) keys.push('nativeFlag', 'activeOpacity', 'style')
        assert.deepStrictEqual(Object.keys(Button.propTypes).sort(), keys.sort())
        for (const key of ['textStyle', 'disabledTextStyle', 'disabledStyle']) assert.strictEqual(Button.propTypes[key], Text.propTypes.style)
        if (inherited) {
          for (const key of ['nativeFlag', 'activeOpacity', 'style']) assert.strictEqual(Button.propTypes[key], TouchableOpacity.propTypes[key])
          // Production validators may all share the same no-op shim.
          if (process.env.NODE_ENV === 'development') {
            for (const key of ['width', 'height']) assert.notStrictEqual(Button.propTypes[key], TouchableOpacity.propTypes[key])
          }
        }
      })
      test('default height and activeOpacity apply only to undefined values', function () {
        for (const disabled of [false, true]) {
          for (const values of [{}, { height: undefined, activeOpacity: undefined }, { height: 0, activeOpacity: 0 }, { height: null, activeOpacity: null }, { height: 40, activeOpacity: 0.8 }]) render(Object.assign({ disabled: disabled }, values))
        }
      })
      test('numeric and string dimensions preserve zero, negatives, null and arbitrary strings', function () {
        for (const disabled of [false, true]) {
          for (const value of [undefined, null, 0, -5, 120, '75%', '', 'anything']) render({ disabled: disabled, width: value, height: value })
        }
      })
      test('exact hierarchy, style order, frozen inputs and outer-only rest props', function () {
        let callbackCalls = 0
        const callback = function () { callbackCalls++ }
        for (const disabled of [false, true]) {
          const props = freeze({ disabled: disabled, width: 140, height: 70, background: '#f00', text: 'Button', children: 'fallback',
            style: [{ width: 999 }, { opacity: 0.7 }], textStyle: { color: '#abc' }, disabledStyle: { opacity: 0.1 }, disabledTextStyle: { color: '#def' },
            onPress: callback, onLongPress: callback, onLayout: callback, testID: 'button', accessibilityLabel: 'Button label', nativeFlag: true, extra: { nested: ['keep'] } })
          render(props)
        }
        assert.strictEqual(callbackCalls, 0)
      })
      test('style values retain references and disabled styles remain on enabled Android', function () {
        for (const disabled of [false, true]) {
          for (const value of [undefined, null, 0, { opacity: 0.8 }, [{ opacity: 0.6 }]]) render({ disabled: disabled, style: value, textStyle: value, disabledStyle: value, disabledTextStyle: value })
        }
      })
      test('text uses truthy text or the original children fallback', function () {
        const child = React.createElement('Child', null, 'element child')
        for (const disabled of [false, true]) {
          for (const text of ['truthy', 7, '', 0, false, null, undefined]) {
            for (const children of ['fallback', child, 0, false, null, undefined]) render({ disabled: disabled, text: text, children: children })
          }
        }
      })
      test('Android selectable background runs once for falsy background and never elsewhere', function () {
        for (const disabled of [false, true]) {
          for (const background of [undefined, null, false, 0, '', '#f00', { custom: true }]) render({ disabled: disabled, background: background })
        }
      })
      test('optional string-or-number validators accept the existing complete value contract', function () {
        for (const key of ['width', 'height']) {
          for (const value of [undefined, null, 0, -8, 2.5, '100%', '', 'arbitrary']) assert.deepStrictEqual(validate({ [key]: value }), [])
        }
      })
      test('invalid dimensions warn in development and are no-ops in production', function () {
        for (const key of ['width', 'height']) {
          for (const value of [true, false, {}, [], function () {}]) {
            const messages = validate({ [key]: value })
            assert.strictEqual(messages.length, process.env.NODE_ENV === 'development' ? 1 : 0, key)
            if (messages.length) assert(messages[0].includes('`' + key + '`'), messages[0])
          }
        }
      })
      test('style and inherited validators are checked through checkPropTypes', function () {
        for (const key of ['textStyle', 'disabledTextStyle', 'disabledStyle']) {
          for (const value of [undefined, null, 0, {}, []]) assert.deepStrictEqual(validate({ [key]: value }), [])
          const messages = validate({ [key]: true })
          assert.strictEqual(messages.length, process.env.NODE_ENV === 'development' ? 1 : 0)
          if (messages.length) assert(messages[0].includes('`' + key + '`'))
        }
        if (inherited) {
          assert.deepStrictEqual(validate({ nativeFlag: true }), [])
          const messages = validate({ nativeFlag: 'invalid' })
          assert.strictEqual(messages.length, process.env.NODE_ENV === 'development' ? 1 : 0)
          if (messages.length) assert(messages[0].includes('`nativeFlag`'))
        }
      })
      test('repeat renders preserve callbacks, style references and the platform captured at import', function () {
        native.Platform.OS = platform === 'android' ? 'ios' : 'android'
        let callbackCalls = 0
        const callback = function () { callbackCalls++ }
        const sharedStyle = freeze({ height: 18 })
        const messages = warnings(function () {
          let count = backgroundCalls.length
          let props = freeze({ onPress: callback, style: sharedStyle })
          const tree = renderer.create(React.createElement(Button, props))
          try {
            inspect(tree, props, count)
            for (const values of [{ text: 'updated' }, { disabled: true }, { disabled: false, width: 0 }, { background: { custom: true } }, { height: null }, {}]) {
              props = freeze(Object.assign({ onPress: callback, style: sharedStyle }, values))
              count = backgroundCalls.length
              tree.update(React.createElement(Button, props))
              inspect(tree, props, count)
            }
          } finally { tree.unmount() }
        })
        assert.deepStrictEqual(messages, [])
        assert.strictEqual(callbackCalls, 0)
      })
      test('missing Text.propTypes uses a portable style validator', function () {
        function MissingText (props) { return React.createElement('NativeText', props) }
        const beforeStyles = styleCalls.length
        const beforeBackgrounds = backgroundCalls.length
        const PortableButton = load(Object.assign({}, native, { Text: MissingText })).default
        for (const key of ['textStyle', 'disabledTextStyle', 'disabledStyle']) {
          assert.strictEqual(typeof PortableButton.propTypes[key], 'function')
        }
        assert.strictEqual(styleCalls.length, beforeStyles + 1)
        assert.strictEqual(backgroundCalls.length, beforeBackgrounds)
      })
    }
  }
  console.log(passed + ' checks passed (' + process.env.NODE_ENV + ', React ' + React.version + ', prop-types ' + propTypesVersion + ')')
}
