import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';

import { Badge } from '@/components/common';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import { AnalyticsScreen } from '@/screens/main/AnalyticsScreen';
import { CalendarScreen } from '@/screens/main/CalendarScreen';
import { ProfileScreen } from '@/screens/main/ProfileScreen';
import { ScanScreen } from '@/screens/main/ScanScreen';
import type { BottomTabParamList } from '@/navigation/types';
import { HomeStackNavigator } from '@/navigation/HomeStackNavigator';

export interface CustomTabBarProps extends BottomTabBarProps {
  homeBadgeCount?: number;
}

const TAB_BAR_HEIGHT = 80 as const;
const SCAN_BUTTON_SIZE = 60 as const;
// Place the button fully inside the tab bar so its top edge sits just below the divider.
const SCAN_BUTTON_TOP = 6 as const;

const Tab = createBottomTabNavigator<BottomTabParamList>();

const CustomTabBar = ({ state, descriptors, navigation, homeBadgeCount = 0 }: CustomTabBarProps) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const primary = COLORS.brand.primary;

  const [tabBarWidth, setTabBarWidth] = useState(0);

  const styles = useMemo(
    () => createStyles({ colors, primary, bottomInset: insets.bottom, isDark }),
    [colors, primary, insets.bottom, isDark],
  );

  const scanRouteIndex = state.routes.findIndex(r => r.name === 'Scan');
  const scanRoute = scanRouteIndex >= 0 ? state.routes[scanRouteIndex] : undefined;
  const scanFocused = scanRouteIndex >= 0 ? state.index === scanRouteIndex : false;

  const onPressFor = (routeKey: string, routeName: string, isFocused: boolean) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName as never);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.tabBar}
        onLayout={(e) => {
          setTabBarWidth(e.nativeEvent.layout.width);
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const isFocused = state.index === index;
          const isScanTab = route.name === 'Scan';

          if (isScanTab) {
            return <View key={route.key} style={styles.scanPlaceholder} />;
          }

          const color = isFocused ? primary : colors.textSecondary;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={typeof label === 'string' ? label : route.name}
              onPress={() => onPressFor(route.key, route.name, isFocused)}
              style={({ pressed }) => [styles.tabItem, pressed && styles.tabPressed]}
            >
              <View style={styles.iconWrap}>
                {options.tabBarIcon
                  ? options.tabBarIcon({ focused: isFocused, color, size: 24 })
                  : null}

                {route.name === 'Home' && homeBadgeCount > 0 ? (
                  <Badge text={`${homeBadgeCount}`} variant="error" style={styles.homeBadge} />
                ) : null}
              </View>

              <Text style={[styles.tabLabel, { color }, isFocused && styles.tabLabelActive]} numberOfLines={1}>
                {typeof label === 'string' ? label : route.name}
              </Text>
            </Pressable>
          );
        })}

        {scanRoute ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan"
            onPress={() => onPressFor(scanRoute.key, scanRoute.name, scanFocused)}
            style={(state) => [
              styles.scanButton,
              tabBarWidth > 0
                ? { left: tabBarWidth / 2 - SCAN_BUTTON_SIZE / 2 }
                : { left: '50%', marginLeft: -(SCAN_BUTTON_SIZE / 2) },
              (state.pressed || Boolean((state as any).hovered)) && styles.scanPressed,
            ]}
          >
            <LinearGradient
              colors={Array.from(GRADIENTS.primary)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.scanGradient}
            >
              <Feather name="camera" size={28} color={COLORS.common.white} />
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export const BottomTabNavigator = () => {
  const { colors } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarShowLabel: false,
      // Keep screens mounted for smoother switching and preserved state.
      unmountOnBlur: false,
      sceneStyle: { backgroundColor: colors.background },
    }),
    [colors.background],
  );

  return (
    <Tab.Navigator tabBar={props => <CustomTabBar {...props} />} screenOptions={screenOptions}>
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <Feather name="home" size={ICON_SIZES.md} color={focused ? COLORS.brand.primary : color} />
          ),
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          tabBarLabel: 'Analytics',
          tabBarIcon: ({ focused, color }) => (
            <Feather name="bar-chart-2" size={ICON_SIZES.md} color={focused ? COLORS.brand.primary : color} />
          ),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => null,
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          tabBarLabel: 'Calendar',
          tabBarIcon: ({ focused, color }) => (
            <Feather name="calendar" size={ICON_SIZES.md} color={focused ? COLORS.brand.primary : color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused, color }) => (
            <Feather name="settings" size={ICON_SIZES.md} color={focused ? COLORS.brand.primary : color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const createStyles = ({
  colors,
  primary,
  bottomInset,
  isDark,
}: {
  colors: {
    background: string;
    surface: string;
    border: string;
    textSecondary: string;
  };
  primary: string;
  bottomInset: number;
  isDark: boolean;
}) => {
  const tabLabel: TextStyle = {
    fontSize: 12,
    fontWeight: '500',
  };

  return StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
    },
    tabBar: {
      height: TAB_BAR_HEIGHT + bottomInset,
      paddingBottom: bottomInset,
      backgroundColor: isDark ? colors.background : colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingTop: SPACING.sm,
      paddingHorizontal: SPACING.md,
      ...(isDark ? null : SHADOWS.lg),
      ...(Platform.OS === 'android' ? ((isDark ? { elevation: 0 } : { elevation: 8 }) as ViewStyle) : null),
    },

    tabItem: {
      flex: 1,
      height: TAB_BAR_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    } as ViewStyle,
    tabPressed: {
      opacity: 0.6,
    },
    iconWrap: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    homeBadge: {
      position: 'absolute',
      top: -8,
      right: -14,
    },
    tabLabel: {
      ...TYPOGRAPHY.caption,
      ...tabLabel,
      color: colors.textSecondary,
      marginTop: 4,
    },
    tabLabelActive: {
      color: primary,
    },

    scanPlaceholder: {
      flex: 1,
      height: TAB_BAR_HEIGHT,
    },

    scanButton: {
      position: 'absolute',
      top: SCAN_BUTTON_TOP,
      width: SCAN_BUTTON_SIZE,
      height: SCAN_BUTTON_SIZE,
      borderRadius: RADIUS.full,
      zIndex: 10,
      // Keep shadow mostly below so it doesn't visually cross the divider.
      ...(Platform.OS === 'ios'
        ? ({
            shadowColor: '#000',
            shadowOpacity: 0.22,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
          } as ViewStyle)
        : ({ elevation: 14 } as ViewStyle)),
    },
    scanPressed: {
      transform: [{ scale: 1.06 }, { translateY: -2 }],
    },
    scanGradient: {
      width: SCAN_BUTTON_SIZE,
      height: SCAN_BUTTON_SIZE,
      borderRadius: SCAN_BUTTON_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
  });
};

export default BottomTabNavigator;
