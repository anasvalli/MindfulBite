import { Tabs } from 'expo-router';
import { Home, History, MessageSquare, Calendar, PieChart, User } from 'lucide-react-native';
import { Platform, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../context/LanguageContext';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../context/ThemeContext';

export default function TabLayout() {
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const safeBottomPadding = Math.max(insets.bottom, 12);
  const tabBarHeight = Platform.OS === 'ios' ? 60 + insets.bottom : 70 + (insets.bottom > 0 ? insets.bottom : 4);

  return (
    <Tabs
      screenOptions={{
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#2FA4D7',
        tabBarInactiveTintColor: isDark ? '#64748B' : '#94a3b8',
        headerShown: true,
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
          <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}>
            <BlurView tint={isDark ? 'dark' : 'light'} intensity={80} style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(9, 9, 11, 0.92)' : 'rgba(255, 255, 255, 0.9)' }]} />
          </View>
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        headerStyle: {
          backgroundColor: isDark ? '#09090B' : '#ffffff',
          shadowOpacity: 0,
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
        },
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '800',
          color: isDark ? '#F8FAFC' : '#0f172a',
        },
        headerTintColor: isDark ? '#F8FAFC' : '#0f172a',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ color }) => <Home color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('logs'),
          tabBarIcon: ({ color }) => <History color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('coach'),
          tabBarIcon: ({ color }) => <MessageSquare color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('plans'),
          tabBarIcon: ({ color }) => <Calendar color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('insights'),
          tabBarIcon: ({ color }) => <PieChart color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={22} />
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
