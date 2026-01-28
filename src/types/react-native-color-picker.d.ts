declare module 'react-native-color-picker' {
  import * as React from 'react';
  import type { StyleProp, ViewStyle } from 'react-native';

  export type HSV = { h: number; s: number; v: number };

  export interface ColorPickerProps {
    style?: StyleProp<ViewStyle>;
    defaultColor?: string;
    color?: string;
    onColorChange?: (color: HSV) => void;
    onColorSelected?: (color: string) => void;
    oldColor?: string;
    hideSliders?: boolean;
    hideControls?: boolean;
    sliderComponent?: React.ComponentType<any>;
  }

  export const ColorPicker: React.ComponentType<ColorPickerProps>;

  export const fromHsv: (hsv: HSV) => string;
}
