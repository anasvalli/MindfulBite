import { Tabs } from 'expo-router';
import { Home, History, MessageSquare, Calendar, PieChart, User } from 'lucide-react-native';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useLanguage } from '../context/LanguageContext';
import { A6 } from '../../lib/theme';

export default function TabLayout() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const safeBottomPadding = Math.max(insets.bottom, 12);
  const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : 70 + (insets.bottom > 0 ? insets.bottom : 4);

  return (
    <Tabs
      screenOptions={{
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: A6.primaryLight,
        tabBarInactiveTintColor: A6.fg3,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          backgroundColor: 'transparent',
          height: tabBarHeight,
          paddingBottom: safeBottomPadding,
          paddingTop: 12,
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                overflow: 'hidden',
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: 'rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(2,16,21,0.55)',
              },
            ]}>
            <BlurView
              tint="dark"
              intensity={50}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          </View>
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color }) => <Home color={color} size={22} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('logs'),
          tabBarIcon: ({ color }) => <History color={color} size={22} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('coach'),
          tabBarIcon: ({ color }) => <MessageSquare color={color} size={22} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('plans'),
          tabBarIcon: ({ color }) => <Calendar color={color} size={22} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('insights'),
          tabBarIcon: ({ color }) => <PieChart color={color} size={22} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={22} strokeWidth={1.6} />,
        }}
      />
      <Tabs.Screen name="two" options={{ href: null }} />
    </Tabs>
  );
}
