'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

if (!process.env.BUTTON_MODERN_MODE) {
  const childProcess = require('child_process')
  for (const mode of ['development', 'production']) {
    const result = childProcess.spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { NODE_ENV: mode, BUTTON_MODERN_MODE: mode }),
      stdio: 'inherit'
    })
    if (result.error) throw result.error
    assert.strictEqual(result.status, 0, mode + ' modern contract tests failed')
  }
} else {
  run()
}

function run () {
  const reactBase = path.resolve(process.env.BUTTON_TEST_REACT || __dirname)
  const React = require(require.resolve('react', { paths: [reactBase] }))
  const jsx = require(require.resolve('react/jsx-runtime', { paths: [reactBase] }))
  const jsxDEV = process.env.NODE_ENV === 'development'
    ? require(require.resolve('react/jsx-dev-runtime', { paths: [reactBase] }))
    : null
  const runtime = path.resolve(process.env.BUTTON_TEST_RUNTIME || __dirname)
  const PropTypes = require(require.resolve('prop-types', { paths: [runtime] }))
  const Babel = require('@babel/standalone')
  const filename = path.resolve(process.env.BUTTON_TEST_SOURCE || path.join(__dirname, '..', 'index.js'))
  const source = fs.readFileSync(filename, 'utf8')
  const modes = [{ runtime: 'classic', development: false }, { runtime: 'automatic', development: false }]
  if (process.env.NODE_ENV === 'development') modes.push({ runtime: 'automatic', development: true })
  const compiled = new Map()
  const callers = new Map()
  let passed = 0
  let validationId = 0

  function test (name, check) {
    check()
    passed++
    console.log('ok - ' + process.env.NODE_ENV + ' - React ' + React.version + ' - ' + name)
  }
  function warnings (check) {
    if (PropTypes.resetWarningCache) PropTypes.resetWarningCache()
    const messages = []
    const original = console.error
    console.error = function () { messages.push(Array.from(arguments).join(' ')) }
    try { check() } finally { console.error = original }
    return messages
  }
  function evaluate (code, imports) {
    const exports = {}
    vm.runInThisContext('(function(require, exports) {\n' + code + '\n})', { filename: filename })(function (name) {
      assert(Object.prototype.hasOwnProperty.call(imports, name), 'Unexpected import: ' + name)
      return imports[name]
    }, exports)
    return exports.default
  }
  function transform (text, mode) {
    return Babel.transform(text, { filename: filename, presets: [['react', mode]], plugins: ['transform-modules-commonjs'] }).code
  }
  function load (native, mode) {
    const key = JSON.stringify(mode)
    if (!compiled.has(key)) compiled.set(key, transform(source, mode))
    return evaluate(compiled.get(key), { react: React, 'react/jsx-runtime': jsx, 'react/jsx-dev-runtime': jsxDEV, 'react-native': native, 'prop-types': PropTypes })
  }
  function invoke (Button, props, mode) {
    const key = JSON.stringify(mode)
    if (!callers.has(key)) callers.set(key, evaluate(transform('import React from "react"; export default (Component, props) => <Component {...props} />', mode), { react: React, 'react/jsx-runtime': jsx, 'react/jsx-dev-runtime': jsxDEV }))
    const element = callers.get(key)(Button, props)
    // These components are pure, hook-free functions. This inspects their element
    // output; it does not stand in for a React Native renderer or native device.
    return element.type(element.props)
  }
  function host (platform, textValidators, inherited) {
    function View () {}
    function Text () {}
    function TouchableOpacity () {}
    function TouchableNativeFeedback () {}
    const calls = { styles: 0, backgrounds: 0 }
    const background = { selectable: true }
    if (textValidators === 'legacy') Text.propTypes = { style: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.number]) }
    if (textValidators === 'empty') Text.propTypes = {}
    if (inherited) TouchableOpacity.propTypes = { nativeFlag: PropTypes.bool }
    TouchableNativeFeedback.SelectableBackground = function () { calls.backgrounds++; return background }
    return {
      View: View, Text: Text, TouchableOpacity: TouchableOpacity, TouchableNativeFeedback: TouchableNativeFeedback,
      Platform: { OS: platform }, calls: calls, background: background,
      StyleSheet: { create: function (styles) { calls.styles++; return styles } }
    }
  }
  function inspect (Button, native, platform, input, mode) {
    const expected = Object.assign({}, input)
    if (Button.defaultProps) {
      for (const key in Button.defaultProps) if (expected[key] === undefined) expected[key] = Button.defaultProps[key]
    }
    const before = native.calls.backgrounds
    const outer = invoke(Button, input, mode)
    const android = !expected.disabled && platform === 'android'
    const view = android ? outer.props.children : outer
    const text = view.props.children
    assert.strictEqual(outer.type, expected.disabled ? native.View : android ? native.TouchableNativeFeedback : native.TouchableOpacity)
    assert.strictEqual(text.type, native.Text)
    assert.strictEqual(text.props.children, expected.text || expected.children)
    assert.strictEqual(view.props.style[0].width, expected.width)
    assert.strictEqual(view.props.style[0].height, expected.height)
    assert.strictEqual(view.props.style[expected.disabled || android ? 2 : 3], expected.style)
    assert.strictEqual(text.props.style[android ? 2 : 1], expected.textStyle)
    if (expected.disabled || android) {
      assert.strictEqual(view.props.style[3], expected.disabledStyle)
      assert.strictEqual(text.props.style[android ? 3 : 2], expected.disabledTextStyle)
    }
    if (android) {
      assert.strictEqual(1 in text.props.style, false, 'Retain Android style array hole')
      assert.strictEqual(outer.props.background, expected.background || native.background)
      assert.deepStrictEqual(Object.keys(view.props).sort(), ['children', 'style'])
    }
    assert.strictEqual(native.calls.backgrounds - before, android && !expected.background ? 1 : 0)
    const consumed = ['disabled', 'style', 'textStyle', 'disabledStyle', 'disabledTextStyle', 'text', 'width', 'height', 'children', 'background']
    const rest = Object.keys(expected).filter(function (key) { return !consumed.includes(key) })
    assert.deepStrictEqual(Object.keys(outer.props).sort(), rest.concat(['children', android ? 'background' : 'style']).sort())
    for (const key of rest) assert.strictEqual(outer.props[key], expected[key])
    return outer
  }

  for (const componentMode of modes) {
    for (const callerMode of modes) {
      for (const textValidators of ['legacy', 'missing', 'empty']) {
        test('all branches and mixed JSX modes ' + JSON.stringify({ componentMode: componentMode, callerMode: callerMode, textValidators: textValidators }), function () {
          for (const platform of ['ios', 'android', 'other']) {
            for (const inherited of [false, true]) {
              const native = host(platform, textValidators, inherited)
              const Button = load(native, componentMode)
              assert.strictEqual(native.calls.styles, 1)
              assert.strictEqual(native.calls.backgrounds, 0)
              if (textValidators === 'legacy') {
                for (const key of ['textStyle', 'disabledTextStyle', 'disabledStyle']) assert.strictEqual(Button.propTypes[key], native.Text.propTypes.style)
              }
              if (inherited) assert.strictEqual(Button.propTypes.nativeFlag, native.TouchableOpacity.propTypes.nativeFlag)
              let callbackCalls = 0
              const callback = function () { callbackCalls++ }
              const style = Object.freeze([{ width: 999 }])
              const textStyle = Object.freeze({ color: 'blue' })
              const disabledStyle = Object.freeze({ opacity: 0.4 })
              const disabledTextStyle = Object.freeze({ color: 'grey' })
              for (const disabled of [false, true]) {
                const common = { disabled: disabled, onPress: callback, onLongPress: callback, onLayout: callback, testID: 'button', style: style, textStyle: textStyle, disabledStyle: disabledStyle, disabledTextStyle: disabledTextStyle }
                for (const values of [{}, { height: undefined, activeOpacity: undefined }, { height: null, activeOpacity: null }, { height: 0, activeOpacity: 0 }, { height: 70, activeOpacity: 0.7 }]) {
                  const input = Object.freeze(Object.assign({}, common, values))
                  inspect(Button, native, platform, input, callerMode)
                  assert.deepStrictEqual(input, Object.assign({}, common, values))
                }
                for (const background of [undefined, null, false, 0, '', '#f00', { custom: true }]) inspect(Button, native, platform, Object.freeze(Object.assign({}, common, { background: background })), callerMode)
                for (const text of ['hello', '', 0, false, null, undefined]) inspect(Button, native, platform, Object.freeze(Object.assign({}, common, { text: text, children: 'fallback' })), callerMode)
              }
              native.Platform.OS = platform === 'android' ? 'ios' : 'android'
              inspect(Button, native, platform, Object.freeze({ onPress: callback }), callerMode)
              assert.strictEqual(callbackCalls, 0)
              assert.strictEqual(native.calls.styles, 1)
            }
          }
        })
        test('public defaults remain mutable, replaceable and optional ' + JSON.stringify({ componentMode: componentMode, callerMode: callerMode }), function () {
          const native = host('android', 'missing', false)
          const Button = load(native, componentMode)
          const style = Object.freeze({ opacity: 0.3 })
          let calls = 0
          const callback = function () { calls++ }
          Button.defaultProps.height = 88
          Button.defaultProps.width = 102
          Button.defaultProps.style = style
          Button.defaultProps.onPress = callback
          Button.defaultProps.customFlag = 'default'
          inspect(Button, native, 'android', Object.freeze({}), callerMode)
          assert.strictEqual(Button.defaultProps.style, style)
          for (const defaults of [{ height: 74 }, { activeOpacity: 0 }, {}, null, undefined]) {
            Button.defaultProps = defaults
            inspect(Button, native, 'android', Object.freeze({}), callerMode)
            inspect(Button, native, 'android', Object.freeze({ height: undefined, activeOpacity: undefined }), callerMode)
            inspect(Button, native, 'android', Object.freeze({ height: null, activeOpacity: 0 }), callerMode)
          }
          const defaults = Object.create({ inheritedDefault: 'keep', width: 117 })
          defaults.height = 82
          defaults.customUndefined = undefined
          defaults.onPress = callback
          Button.defaultProps = defaults
          inspect(Button, native, 'android', Object.freeze({}), callerMode)
          inspect(Button, native, 'android', Object.freeze({ inheritedDefault: null, width: 0, customUndefined: 'explicit' }), callerMode)
          assert.strictEqual(calls, 0)
        })
      }
    }
    for (const textValidators of ['missing', 'empty']) {
      test('portable recursive style validator ' + JSON.stringify({ componentMode: componentMode, textValidators: textValidators }), function () {
        const Button = load(host('ios', textValidators, false), componentMode)
        const accepted = [undefined, null, false, '', 0, 17, {}, { fontSize: 18 }, [], [null, undefined, false, '', {}, 17], [[[{ color: 'red' }]], false], new Array(2), [Object.create(null)]]
        const rejected = ['red', true, function () {}, Symbol('style'), BigInt(1), ['red'], [[true]], [{}, [function () {}]], [Symbol('nested')], [[BigInt(2)]]]
        for (const key of ['textStyle', 'disabledStyle', 'disabledTextStyle']) {
          for (const value of accepted) {
            assert.deepStrictEqual(warnings(function () { PropTypes.checkPropTypes(Button.propTypes, { [key]: value }, 'prop', 'ButtonPortable' + (++validationId)) }), [])
          }
          for (const value of rejected) {
            const messages = warnings(function () { PropTypes.checkPropTypes(Button.propTypes, { [key]: value }, 'prop', 'ButtonPortable' + (++validationId)) })
            assert.strictEqual(messages.length, process.env.NODE_ENV === 'development' ? 1 : 0, key + ' rejected sample ' + rejected.indexOf(value))
          }
        }
      })
    }
  }
  console.log(passed + ' modern contract groups passed (' + process.env.NODE_ENV + ', React ' + React.version + ')')
}
