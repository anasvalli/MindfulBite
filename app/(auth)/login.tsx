import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, FlatList, useColorScheme, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { ChevronDown, Globe, Leaf, Eye, EyeOff, Facebook } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { useCustomAlert } from '../../components/CustomAlert';
import { getCountryNames, getCitiesForCountry } from '../../lib/countries';

WebBrowser.maybeCompleteAuthSession();

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ur', name: 'اردو' },
  { code: 'ar', name: 'العربية' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'pt', name: 'Português' },
  { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ru', name: 'Русский' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'sv', name: 'Svenska' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'fil', name: 'Filipino' },
];

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const [langModalOpen, setLangModalOpen] = useState(false);
  const router = useRouter();
  const { alert } = useCustomAlert();
  const countryList = getCountryNames();
  const cityList = country ? getCitiesForCountry(country) : [];

  async function handleAuth() {
    if (!email || !password) {
      alert('Error', 'Please enter your email and password.');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      alert('Error', 'Passwords do not match.');
      return;
    }

    setLoading(true);

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert('Sign In Error', error.message);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('age, gender')
        .eq('id', data.user.id)
        .single();
        
      setLoading(false);

      if (!profile || !profile.age || !profile.gender) {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });

      setLoading(false);

      if (error) {
        alert('Sign Up Error', error.message);
      } else {
        if (!data.session) {
          alert(
            'Supabase Dashboard Action Required',
            'To instantly sign in without email confirmation, you must turn OFF "Confirm email" in your Supabase Authentication settings.',
          );
          return;
        }
        // Save country & city right after account creation
        if (data.user && (country.trim() || city.trim())) {
          await supabase.from('users').upsert({
            id: data.user.id,
            country: country.trim() || null,
            city: city.trim() || null,
          });
        }
        router.replace('/(auth)/onboarding');
      }
    }
  }

  async function handleGoogleAuth() {
    setLoading(true);
    try {
      const redirectUrl = makeRedirectUri({ scheme: 'mindfulbite' });
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });

      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        
        if (res.type === 'success') {
          const { url } = res;

          // Parse tokens from BOTH hash fragments (#) and query params (?)
          // Supabase can return tokens in either location depending on the flow
          const extractParams = (raw: string): Record<string, string> => {
            const result: Record<string, string> = {};
            if (!raw) return result;
            raw.split('&').forEach(pair => {
              const [key, ...rest] = pair.split('=');
              if (key) result[key] = decodeURIComponent(rest.join('='));
            });
            return result;
          };

          const hashPart = url.split('#')[1] || '';
          const queryPart = (url.split('?')[1] || '').split('#')[0];

          const params = { ...extractParams(queryPart), ...extractParams(hashPart) };

          if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
          } else {
            // Browser returned but no tokens found — likely a redirect URI mismatch
            alert(
              'Sign-In Incomplete',
              'Google returned without authentication tokens. Please ensure the correct Redirect URI is configured in your Supabase Dashboard under Authentication > Providers > Google.'
            );
          }
        }
      }
    } catch (error: any) {
      alert('Google Sign-In Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFacebookAuth() {
    setLoading(true);
    try {
      const redirectUrl = makeRedirectUri({ scheme: 'mindfulbite' });
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });

      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        
        if (res.type === 'success') {
          const { url } = res;

          const extractParams = (raw: string): Record<string, string> => {
            const result: Record<string, string> = {};
            if (!raw) return result;
            raw.split('&').forEach(pair => {
              const [key, ...rest] = pair.split('=');
              if (key) result[key] = decodeURIComponent(rest.join('='));
            });
            return result;
          };

          const hashPart = url.split('#')[1] || '';
          const queryPart = (url.split('?')[1] || '').split('#')[0];
          const params = { ...extractParams(queryPart), ...extractParams(hashPart) };

          if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
          } else {
            alert(
              'Sign-In Incomplete',
              'Facebook returned without authentication tokens. Please ensure the correct Redirect URI is configured in your Supabase Dashboard under Authentication > Providers > Facebook.'
            );
          }
        }
      }
    } catch (error: any) {
      alert('Facebook Sign-In Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!email) {
      alert('Error', 'Please enter your email address first.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/'),
    });
    setLoading(false);
    if (error) {
      alert('Error', error.message);
    } else {
      alert('Success', t('resetInstructionsSent'));
    }
  }

  return (
    <LinearGradient colors={['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          
          {/* Language Selector */}
          <View
            style={{
              position: 'absolute', top: 50, right: 24,
              backgroundColor: '#FFFFFF', borderRadius: 12,
              borderWidth: 1, borderColor: '#E2E8F0',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
            }}
          >
            <TouchableOpacity onPress={() => setLangModalOpen(true)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}
            >
              <Globe color="#64748B" size={16} />
              <Text style={{ color: '#0F172A', fontSize: 13, fontWeight: '600', marginLeft: 6 }}>{language}</Text>
              <ChevronDown color="#64748B" size={14} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <Modal visible={langModalOpen} transparent animationType="fade">
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 32 }} activeOpacity={1} onPress={() => setLangModalOpen(false)}>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: 400, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                  {t('selectLanguage')}
                </Text>
                <FlatList
                  data={LANGUAGES}
                  keyExtractor={(item) => item.code}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => { setLanguage(item.name); setLangModalOpen(false); }}
                      style={{
                        padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
                        backgroundColor: item.name === language ? '#F1F5F9' : '#FFFFFF',
                      }}
                    >
                      <Text style={{ color: item.name === language ? '#6FAF4F' : '#64748B', fontSize: 15, fontWeight: item.name === language ? '800' : '500' }}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Logo & Branding */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View style={{ 
              width: 72, height: 72, borderRadius: 22, backgroundColor: '#6FAF4F',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 4
            }}>
              <Leaf color="#FFFFFF" size={36} />
            </View>
            <Text style={{ fontSize: 34, fontWeight: '900', color: '#0F172A', marginBottom: 6 }}>MindfulBite</Text>
            <Text style={{ fontSize: 15, color: '#64748B', textAlign: 'center' }}>
              {t('yourAICoach')}
            </Text>
          </View>

          {/* Email Input */}
          <TextInput
            style={{
              backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, fontSize: 15,
              color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12,
            }}
            placeholder={t('emailAddress')}
            placeholderTextColor="#94A3B8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Password Input */}
          <View style={{ marginBottom: 12, position: 'relative', justifyContent: 'center' }}>
            <TextInput
              style={{
                backgroundColor: '#FFFFFF', padding: 16, paddingRight: 50, borderRadius: 14, fontSize: 15,
                color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0',
              }}
              placeholder={t('password')}
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity 
              style={{ position: 'absolute', right: 16 }}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff color="#6FAF4F" size={20} /> : <Eye color="#94A3B8" size={20} />}
            </TouchableOpacity>
          </View>

          {/* Forgot Password Link */}
          {isLogin && (
            <TouchableOpacity onPress={handleResetPassword} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
              <Text style={{ color: '#2FA4D7', fontSize: 13, fontWeight: '600' }}>{t('forgotPassword')}</Text>
            </TouchableOpacity>
          )}

          {/* Confirm Password */}
          {!isLogin && (
            <View style={{ marginBottom: 12, position: 'relative', justifyContent: 'center' }}>
              <TextInput
                style={{
                  backgroundColor: '#FFFFFF', padding: 16, paddingRight: 50, borderRadius: 14, fontSize: 15,
                  color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0',
                }}
                placeholder={t('confirmPassword')}
                placeholderTextColor="#94A3B8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
              />
              <TouchableOpacity 
                style={{ position: 'absolute', right: 16 }}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff color="#6FAF4F" size={20} /> : <Eye color="#94A3B8" size={20} />}
              </TouchableOpacity>
            </View>
          )}

          {/* Country & City dropdowns — shown on Signup only */}
          {!isLogin && (
            <>
              {/* Country Dropdown */}
              <TouchableOpacity
                onPress={() => setCountryModalOpen(true)}
                style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
              >
                <Text style={{ color: country ? '#0F172A' : '#94A3B8', fontSize: 15 }}>{country || 'Select Country'}</Text>
                <ChevronDown color="#94A3B8" size={18} />
              </TouchableOpacity>

              {/* City Dropdown */}
              <TouchableOpacity
                onPress={() => { if (!country) { alert('Select Country', 'Please select a country first.'); return; } setCityModalOpen(true); }}
                style={{ backgroundColor: country ? '#FFFFFF' : '#F8FAFC', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
              >
                <Text style={{ color: city ? '#0F172A' : '#94A3B8', fontSize: 15 }}>{city || (country ? 'Select City' : 'Select Country first')}</Text>
                <ChevronDown color="#94A3B8" size={18} />
              </TouchableOpacity>

              {/* Country Modal */}
              <Modal visible={countryModalOpen} transparent animationType="fade">
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setCountryModalOpen(false)}>
                  <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: 450, overflow: 'hidden' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>Select Country</Text>
                    <FlatList
                      data={countryList}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => { setCountry(item); setCity(''); setCountryModalOpen(false); }}
                          style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: item === country ? '#F1F5F9' : '#FFFFFF' }}
                        >
                          <Text style={{ color: item === country ? '#6FAF4F' : '#0F172A', fontSize: 15, fontWeight: item === country ? '800' : '500' }}>{item}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </TouchableOpacity>
              </Modal>

              {/* City Modal */}
              <Modal visible={cityModalOpen} transparent animationType="fade">
                <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setCityModalOpen(false)}>
                  <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: 450, overflow: 'hidden' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>Select City — {country}</Text>
                    <FlatList
                      data={cityList}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => { setCity(item); setCityModalOpen(false); }}
                          style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: item === city ? '#F1F5F9' : '#FFFFFF' }}
                        >
                          <Text style={{ color: item === city ? '#6FAF4F' : '#0F172A', fontSize: 15, fontWeight: item === city ? '800' : '500' }}>{item}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          )}

          {/* Login / Sign Up Button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#6FAF4F', padding: 16, borderRadius: 16, marginTop: 8,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
            }}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading && <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />}
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>
              {isLogin ? t('signInBtn') : t('signUpBtn')}
            </Text>
          </TouchableOpacity>

          {/* Toggle Login / Signup */}
          <TouchableOpacity
            style={{ marginTop: 18, alignItems: 'center' }}
            onPress={() => { setIsLogin(!isLogin); setPassword(''); setConfirmPassword(''); }}
            disabled={loading}
          >
            <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '600' }}>
              {isLogin ? t('noAccountLabel') : t('haveAccountLabel')} <Text style={{ color: '#2FA4D7', fontWeight: '700' }}>{isLogin ? 'Sign Up' : 'Log In'}</Text>
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 24 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E2E8F0' }} />
            <Text style={{ marginHorizontal: 16, color: '#94A3B8', fontSize: 13 }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E2E8F0' }} />
          </View>

          {/* Google Button */}
          <View style={{
            borderRadius: 16, marginBottom: 12, overflow: 'hidden', backgroundColor: '#FFFFFF',
            borderWidth: 1, borderColor: '#E2E8F0',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
          }}>
            <TouchableOpacity
              style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              onPress={handleGoogleAuth}
              disabled={loading}
            >
              <Text style={{ color: '#0F172A', fontSize: 16, fontWeight: '700' }}>{t('contGoogle')}</Text>
            </TouchableOpacity>
          </View>

          {/* Facebook Button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#1877F2',
              padding: 16, borderRadius: 16,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            }}
            onPress={handleFacebookAuth}
            disabled={loading}
          >
            <Facebook color="#fff" size={20} style={{ marginRight: 10 }} />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Continue with Facebook</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
