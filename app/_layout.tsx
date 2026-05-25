import '../global.css';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useMemo } from 'react';
import 'react-native-reanimated';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { CustomAlertProvider } from '../components/CustomAlert';
import { ThemeProviderCustom } from './context/ThemeContext';
import { PurchasesProvider } from './context/PurchasesContext';
import * as Notifications from 'expo-notifications';
import { A6 } from '../lib/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    // Notifications.requestPermissionsAsync(); // Disabled for Expo Go
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <ThemeProviderCustom>
      <ThemedApp />
    </ThemeProviderCustom>
  );
}

function ThemedApp() {
  // A6 Cyan Aurora Glass is dark-only — force dark nav theme for stable backgrounds.
  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: A6.bgInk,
        card: A6.bgInk,
        text: A6.fg1,
        border: 'rgba(255,255,255,0.08)',
        primary: A6.primary,
      },
    }),
    []
  );

  return (
    <LanguageProvider>
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <CustomAlertProvider>
            <PurchasesProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="paywall" options={{ headerShown: false }} />
                <Stack.Screen name="food-search" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              </Stack>
            </PurchasesProvider>
          </CustomAlertProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
