import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const minBottomPadding = Platform.select({ ios: 16, android: 14, web: 30, default: 18 }) ?? 16;
  const tabBarBottomPadding = Math.max(insets.bottom, minBottomPadding);
  const baseTabBarHeight = Platform.select({ ios: 72, android: 70, web: 110, default: 74 }) ?? 72;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelPosition: Platform.OS === 'web' ? 'beside-icon' : 'below-icon',
        tabBarStyle: {
          height: Platform.OS === 'web' ? 76 : baseTabBarHeight + tabBarBottomPadding,
          minHeight: Platform.OS === 'web' ? 76 : baseTabBarHeight + tabBarBottomPadding,
          bottom: Platform.OS === 'web' ? 12 : 0,
          paddingTop: Platform.OS === 'web' ? 8 : 4,
          paddingBottom: tabBarBottomPadding,
        },
        tabBarItemStyle: {
          paddingTop: Platform.OS === 'web' ? 4 : 0,
          paddingBottom: Platform.OS === 'web' ? 4 : 0,
        },
        tabBarLabelStyle: {
          fontSize: Platform.OS === 'web' ? 12 : 12,
          lineHeight: Platform.OS === 'web' ? 14 : 12,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="paperplane.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="impact"
        options={{
          title: 'Impact',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="chart.line.uptrend.xyaxis" color={color} />,
        }}
      />
    </Tabs>
  );
}
