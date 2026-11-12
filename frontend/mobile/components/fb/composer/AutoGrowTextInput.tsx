import { useState, type Ref } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { colors } from '@/lib/theme';

export type AutoGrowTextInputProps = Omit<TextInputProps, 'multiline' | 'style' | 'value'> & {
  value: string;
  /** Typography and padding only: no height or flex, the input sizes itself to its text. */
  style?: StyleProp<TextStyle>;
  /** Smallest height the input may shrink to. */
  minHeight?: number;
  ref?: Ref<TextInput>;
};

/**
 * Multiline input that is always exactly as tall as its text.
 *
 * Native inputs do this on their own once scrolling is off. A web textarea does
 * not, so there an invisible Text with the same typography is measured and its
 * height applied to the textarea (which also lets it shrink again).
 */
export function AutoGrowTextInput({ value, style, minHeight = 0, placeholder, ref, ...rest }: AutoGrowTextInputProps) {
  const [measured, setMeasured] = useState(0);

  if (Platform.OS !== 'web') {
    return (
      <TextInput
        ref={ref}
        multiline
        scrollEnabled={false}
        value={value}
        placeholder={placeholder}
        style={[style, { minHeight }]}
        {...rest}
      />
    );
  }

  // A trailing newline has no height of its own in a Text, so give it something to sit on.
  const mirror = value.length > 0 ? (value.endsWith('\n') ? `${value} ` : value) : placeholder || ' ';

  const onMirrorLayout = (e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.height);
    setMeasured((prev) => (prev === next ? prev : next));
  };

  return (
    <View>
      <Text style={[style, styles.mirror]} onLayout={onMirrorLayout} aria-hidden>
        {mirror}
      </Text>
      <TextInput
        ref={ref}
        multiline
        value={value}
        placeholder={placeholder}
        style={[style, styles.webInput, { height: Math.max(minHeight, measured) }]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mirror: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  // No focus ring and no inner scrollbar: the caret is the focus indicator, and the page scrolls instead.
  // The browser's ring is `outline-style: auto`, which ignores width, so the style has to change too.
  webInput: { outlineStyle: 'solid', outlineWidth: 0, outlineColor: colors.transparent, overflow: 'hidden' },
});

export default AutoGrowTextInput;
