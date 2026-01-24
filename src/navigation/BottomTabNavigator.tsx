import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather';

import { Badge } from '@/components/common';
import { COLORS, GRADIENTS, ICON_SIZES, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '@/constants';
import { useTheme } from '@/hooks/useTheme';
import { AnalyticsScreen } from '@/screens/main/AnalyticsScreen';
import { CalendarScreen } from '@/screens/main/CalendarScreen';
import { HomeScreen } from '@/screens/main/HomeScreen';
import { ProfileScreen } from '@/screens/main/ProfileScreen';
import { ScanScreen } from '@/screens/main/ScanScreen';
import type { BottomTabParamList } from '@/navigation/types';

export interface CustomTabBarProps extends BottomTabBarProps {
  homeBadgeCount?: number;
}

const TAB_BAR_HEIGHT = 80 as const;
const SCAN_BUTTON_SIZE = 60 as const;
const SCAN_BUTTON_TOP = -30 as const;

const Tab = createBottomTabNavigator<BottomTabParamList>();

const CustomTabBar = ({ state, descriptors, navigation, homeBadgeCount = 0 }: CustomTabBarProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const primary = COLORS.brand.primary;

  const styles = useMemo(() => createStyles({ colors, primary, bottomInset: insets.bottom }), [colors, primary, insets.bottom]);

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
      <View style={styles.tabBar}>
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
            style={({ pressed }) => [styles.scanButton, pressed && styles.scanPressed]}
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
        component={HomeScreen}
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
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <Feather name="user" size={ICON_SIZES.md} color={focused ? COLORS.brand.primary : color} />
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
}: {
  colors: {
    surface: string;
    border: string;
    textSecondary: string;
  };
  primary: string;
  bottomInset: number;
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
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingTop: SPACING.sm,
      paddingHorizontal: SPACING.md,
      ...SHADOWS.lg,
      ...(Platform.OS === 'android' ? ({ elevation: 8 } as ViewStyle) : null),
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
      alignSelf: 'center',
      width: SCAN_BUTTON_SIZE,
      height: SCAN_BUTTON_SIZE,
      borderRadius: RADIUS.full,
      zIndex: 10,
      ...SHADOWS.xl,
      ...(Platform.OS === 'android' ? ({ elevation: 24 } as ViewStyle) : null),
    },
    scanPressed: {
      transform: [{ scale: 0.95 }],
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
