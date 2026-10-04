import React from 'react'
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  TouchableNativeFeedback,
  Platform
} from 'react-native'
import PropTypes from 'prop-types'

const isAndroid = Platform.OS === 'android'

const Button = props => {
  const resolvedProps = { ...props }
  const defaults = Button.defaultProps
  if (defaults) {
    for (const key in defaults) {
      if (resolvedProps[key] === undefined) resolvedProps[key] = defaults[key]
    }
  }

  let {
    disabled,
    style,
    textStyle,
    disabledStyle,
    disabledTextStyle,
    text,
    width,
    height,
    children,
    background,
    ...otherProps
  } = resolvedProps

  if (disabled) {
    return (
      <View
        style={[
          { backgroundColor: background, width, height },
          styles.button,
          style,
          disabledStyle
        ]}
        {...otherProps}
      >
        <Text style={[styles.text, textStyle, disabledTextStyle]}>
          {text || children}
        </Text>
      </View>
    )
  }

  if (isAndroid) {
    background = background || TouchableNativeFeedback.SelectableBackground()

    return (
      <TouchableNativeFeedback background={background} {...otherProps}>
        <View style={[{ width, height }, styles.button, style, disabledStyle]}>
          <Text style={[styles.text, , textStyle, disabledTextStyle]}>
            {text || children}
          </Text>
        </View>
      </TouchableNativeFeedback>
    )
  }

  return (
    <TouchableOpacity
      style={[
        { width, height },
        { backgroundColor: background },
        styles.button,
        style
      ]}
      {...otherProps}
    >
      <Text style={[styles.text, textStyle]}>{text || children}</Text>
    </TouchableOpacity>
  )
}

const stylePropType = (Text.propTypes && Text.propTypes.style) || PropTypes.oneOfType([
  PropTypes.object,
  PropTypes.number,
  PropTypes.arrayOf((...args) => stylePropType(...args)),
  PropTypes.oneOf([false, ''])
])

Button.propTypes = {
  ...TouchableOpacity.propTypes,
  height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  textStyle: stylePropType,
  disabledTextStyle: stylePropType,
  disabledStyle: stylePropType
}

Button.defaultProps = {
  height: 56,
  activeOpacity: 0.2
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    backgroundColor: '#212121',
    alignItems: 'center',
    borderRadius: 2,
    justifyContent: 'center'
  },
  text: {
    color: '#fff',
    flex: 1,
    fontFamily: 'System',
    fontSize: 18,
    textAlign: 'center',
    backgroundColor: 'transparent'
  }
})

export default Button
