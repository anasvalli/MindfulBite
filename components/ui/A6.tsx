// A6 Cyan Aurora Glass — RN primitives mirroring design-ref/shared.jsx.
// Components: AuroraBackdrop, Glass, Page, PageHeader, PillButton,
// SectionLabel, FAB, LogoMark, AuroraTabBar.

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  StyleProp,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Camera } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { A6, A6Font } from '../../lib/theme';

// ─────────────────────────────────────────────────────────────
// AuroraBackdrop — cyan blobs + faint noise
// ─────────────────────────────────────────────────────────────
type AuroraVariant = 'default' | 'sparse' | 'dense';

type Blob = { color: string; x?: number; y?: number; r?: number; b?: number; size: number };

const blobsFor = (variant: AuroraVariant): Blob[] => {
  if (variant === 'sparse') {
    return [
      { color: 'rgba(6,182,212,0.55)',  x: -90, y: 80, size: 460 },
      { color: 'rgba(34,211,238,0.4)',  r: -160, b: -80, size: 420 },
    ];
  }
  if (variant === 'dense') {
    return [
      { color: 'rgba(6,182,212,0.65)',  x: -90, y: -120, size: 460 },
      { color: 'rgba(34,211,238,0.55)', r: -160, y: 220, size: 480 },
      { color: 'rgba(52,211,153,0.40)', x: 20, b: -100, size: 420 },
      { color: 'rgba(6,182,212,0.45)',  x: 120, y: 520, size: 260 },
      { color: 'rgba(96,165,250,0.30)', x: 200, y: 320, size: 240 },
    ];
  }
  return [
    { color: 'rgba(6,182,212,0.55)',  x: -90, y: -120, size: 460 },
    { color: 'rgba(34,211,238,0.5)',  r: -160, y: 220, size: 460 },
    { color: 'rgba(52,211,153,0.30)', x: 20, b: -100, size: 420 },
    { color: 'rgba(6,182,212,0.4)',   x: 120, y: 520, size: 240 },
  ];
};

export function AuroraBackdrop({ variant = 'default' }: { variant?: AuroraVariant }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {blobsFor(variant).map((b, i) => {
        const pos: ViewStyle = {
          position: 'absolute',
          width: b.size,
          height: b.size,
          borderRadius: b.size / 2,
        };
        if (b.x !== undefined) pos.left = b.x;
        if (b.r !== undefined) pos.right = b.r;
        if (b.y !== undefined) pos.top = b.y;
        if (b.b !== undefined) pos.bottom = b.b;
        return (
          <View key={i} style={[pos, { opacity: 0.9 }]}>
            <LinearGradient
              colors={[b.color, 'transparent']}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 1, y: 1 }}
              style={{ width: '100%', height: '100%', borderRadius: b.size / 2 }}
            />
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Glass — frosted card
// ─────────────────────────────────────────────────────────────
export function Glass({
  children,
  style,
  intensity = 40,
  radius = 28,
  tint = 'dark',
  hi = 0.04,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  tint?: 'dark' | 'light';
  hi?: number;
}) {
  return (
    <View
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(255,255,255,0.12)',
          backgroundColor: `rgba(255,255,255,${hi})`,
        },
        Platform.OS === 'ios'
          ? {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 24 },
              shadowOpacity: 0.4,
              shadowRadius: 30,
            }
          : { elevation: 8 },
        style,
      ]}>
      <BlurView
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={{ position: 'relative' }}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Page — bg + aurora + safe scroll container
// ─────────────────────────────────────────────────────────────
export function Page({
  children,
  variant = 'default',
  padTop = 64,
  padBottom = 110,
  scroll = true,
  noAurora = false,
}: {
  children?: ReactNode;
  variant?: AuroraVariant;
  padTop?: number;
  padBottom?: number;
  scroll?: boolean;
  noAurora?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const top = (padTop ?? 0) + insets.top;
  const bottom = (padBottom ?? 0) + (insets.bottom > 0 ? insets.bottom * 0.4 : 0);

  const inner = (
    <View style={{ paddingTop: top, paddingBottom: bottom }}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: A6.bgInk }}>
      {!noAurora && <AuroraBackdrop variant={variant} />}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Text utilities
// ─────────────────────────────────────────────────────────────
export const A6Text = StyleSheet.create({
  eyebrow: {
    fontFamily: A6Font.sans,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: A6.fg2,
  } as TextStyle,
  title: {
    fontFamily: A6Font.sans,
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: -0.5,
    lineHeight: 32,
    color: A6.fg1,
  } as TextStyle,
  subtitle: {
    fontFamily: A6Font.sans,
    fontSize: 13,
    color: A6.fg2,
  } as TextStyle,
  body: {
    fontFamily: A6Font.sans,
    fontSize: 14,
    color: A6.fg1,
  } as TextStyle,
  label: {
    fontFamily: A6Font.sans,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: A6.fg2,
  } as TextStyle,
  numTabular: {
    fontFamily: A6Font.sans,
    fontVariant: ['tabular-nums'],
  } as TextStyle,
});

// ─────────────────────────────────────────────────────────────
// PageHeader
// ─────────────────────────────────────────────────────────────
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  style,
}: {
  eyebrow?: string | ReactNode;
  title?: string | ReactNode;
  subtitle?: string | ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-start' },
        style,
      ]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? (
          typeof eyebrow === 'string' ? (
            <Text style={[A6Text.eyebrow, { marginBottom: 8 }]}>{eyebrow}</Text>
          ) : (
            <View style={{ marginBottom: 8 }}>{eyebrow}</View>
          )
        ) : null}
        {typeof title === 'string' ? (
          <Text style={A6Text.title}>{title}</Text>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text style={[A6Text.subtitle, { marginTop: 6 }]}>{subtitle}</Text>
          ) : (
            <View style={{ marginTop: 6 }}>{subtitle}</View>
          )
        ) : null}
      </View>
      {right}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PillButton — small inline action
// ─────────────────────────────────────────────────────────────
export function PillButton({
  children,
  onPress,
  variant = 'cyan',
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  variant?: 'cyan' | 'ghost';
  style?: StyleProp<ViewStyle>;
}) {
  const inner = (
    <Text
      style={{
        fontFamily: A6Font.sans,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: variant === 'cyan' ? A6.bgInk : A6.fg1,
      }}>
      {children}
    </Text>
  );

  if (variant === 'cyan') {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={style}>
        <LinearGradient
          colors={[A6.primary, A6.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            ...Platform.select({
              ios: {
                shadowColor: A6.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 14,
              },
              android: { elevation: 4 },
            }),
          }}>
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[
      {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.15)',
      },
      style,
    ]}>
      {inner}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// SectionLabel
// ─────────────────────────────────────────────────────────────
export function SectionLabel({
  children,
  right,
  style,
}: {
  children: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 4 },
        style,
      ]}>
      <Text style={{ fontFamily: A6Font.sans, fontSize: 16, fontWeight: '500', letterSpacing: -0.3, color: A6.fg1 }}>
        {children}
      </Text>
      {right}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// FAB — floating capture button (cyan→green gradient)
// ─────────────────────────────────────────────────────────────
export function FAB({
  onPress,
  bottom = 110,
  right = 24,
  icon,
}: {
  onPress?: () => void;
  bottom?: number;
  right?: number;
  icon?: ReactNode;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        position: 'absolute',
        bottom,
        right,
        zIndex: 30,
        width: 60,
        height: 60,
        borderRadius: 30,
        ...Platform.select({
          ios: {
            shadowColor: A6.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.6,
            shadowRadius: 18,
          },
          android: { elevation: 12 },
        }),
      }}>
      <LinearGradient
        colors={[A6.primary, A6.primaryLight, A6.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {icon ?? <Camera size={26} color={A6.bgInk} strokeWidth={2} />}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// LogoMark — gradient leaf orb
// ─────────────────────────────────────────────────────────────
export function LogoMark({ size = 64 }: { size?: number }) {
  const leafSize = size * 0.5;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
          ios: {
            shadowColor: A6.primary,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.7,
            shadowRadius: 20,
          },
          android: { elevation: 14 },
        }),
        overflow: 'hidden',
      }}>
      <LinearGradient
        colors={[A6.primary, A6.primaryLight, A6.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: size * 0.3,
        }}
      />
      {/* highlight */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.1,
          left: size * 0.15,
          width: size * 0.35,
          height: size * 0.2,
          borderRadius: size * 0.18,
          backgroundColor: 'rgba(255,255,255,0.35)',
        }}
      />
      <Svg width={leafSize} height={leafSize} viewBox="0 0 24 24" fill="none">
        <Path
          d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1 1.51.5 5.04-1.3 7.04"
          stroke={A6.bgInk}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.5 12 13 14 12"
          stroke={A6.bgInk}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
