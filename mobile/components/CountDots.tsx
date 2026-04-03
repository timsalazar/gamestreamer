import React from 'react';
import { View } from 'react-native';
import { C } from '../lib/colors';

interface Props {
  value: number;
  max: number;
  activeColor: string;
  activeBorder: string;
  size?: number;
}

export function CountDots({ value, max, activeColor, activeBorder, size = 10 }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: i < value ? activeColor : C.surface,
            borderWidth: 1.5,
            borderColor: i < value ? activeBorder : C.border,
          }}
        />
      ))}
    </View>
  );
}
