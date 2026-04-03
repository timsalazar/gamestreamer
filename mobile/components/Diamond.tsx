import React from 'react';
import { View } from 'react-native';
import { C } from '../lib/colors';

interface Props {
  first?: boolean | null;
  second?: boolean | null;
  third?: boolean | null;
  /** 'sm' = 52 px  'md' = 72 px (default)  'lg' = 88 px */
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { wrap: 52, base: 13 },
  md: { wrap: 72, base: 17 },
  lg: { wrap: 88, base: 21 },
};

export function Diamond({ first, second, third, size = 'md' }: Props) {
  const { wrap, base } = SIZES[size];
  const half = (wrap - base) / 2;

  const emptyBase = {
    width: base,
    height: base,
    borderRadius: 2,
    position: 'absolute' as const,
    borderWidth: 2,
    backgroundColor: C.surface,
    borderColor: C.border,
    transform: [{ rotate: '45deg' }],
  };
  const onBase = { ...emptyBase, backgroundColor: C.amber, borderColor: C.amberLight };
  const homePlate = { ...emptyBase, backgroundColor: C.surface2, borderColor: C.blue };

  return (
    <View style={{ width: wrap, height: wrap }}>
      {/* Second — top center */}
      <View style={[second ? onBase : emptyBase, { top: 0, left: half }]} />
      {/* Third — mid left */}
      <View style={[third ? onBase : emptyBase, { top: half, left: 0 }]} />
      {/* First — mid right */}
      <View style={[first ? onBase : emptyBase, { top: half, right: 0 }]} />
      {/* Home — bottom center */}
      <View style={[homePlate, { bottom: 0, left: half }]} />
    </View>
  );
}
