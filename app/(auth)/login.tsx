import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { ChevronDown, Globe, Eye, EyeOff, Facebook, Mail, Lock } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { useCustomAlert } from '../../components/CustomAlert';
import { getCountryNames, getCitiesForCountry } from '../../lib/countries';
import { A6 } from '../../lib/theme';
import { AuroraBackdrop, Glass, LogoMark } from '../../components/ui/A6';

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

const InputField = ({
  Icon,
  placeholder,
  value,
  onChange,
  secure,
  right,
  ...rest
}: any) => (
  <Glass style={{ padding: 0, marginBottom: 10, borderRadius: 16 }} radius={16}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4 }}>
      <Icon size={18} color={A6.fg2} strokeWidth={1.7} />
      <TextInput
        style={{
          flex: 1,
          color: A6.fg1,
          fontSize: 15,
          paddingHorizontal: 10,
          paddingVertical: 14,
        }}
        placeholder={placeholder}
        placeholderTextColor={A6.fg3}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        {...rest}
      />
      {right}
    </View>
  </Glass>
);

export default function LoginScreen() {
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
      if (!profile || !profile.age || !profile.gender) router.replace('/(auth)/onboarding');
      else router.replace('/(tabs)');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        alert('Sign Up Error', error.message);
      } else {
        if (!data.session) {
          alert(
            'Supabase Dashboard Action Required',
            'To instantly sign in without email confirmation, you must turn OFF "Confirm email" in your Supabase Authentication settings.'
          );
          return;
        }
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

  async function handleOAuth(provider: 'google' | 'facebook') {
    setLoading(true);
    try {
      const redirectUrl = makeRedirectUri({ scheme: 'mindfulbite' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
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
            raw.split('&').forEach((pair) => {
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
              `${provider} returned without authentication tokens. Please ensure the correct Redirect URI is configured in your Supabase Dashboard.`
            );
          }
        }
      }
    } catch (e: any) {
      alert('Sign-In Error', e.message);
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
    if (error) alert('Error', error.message);
    else alert('Success', t('resetInstructionsSent'));
  }

  const Dropdown = ({ value, placeholder, onPress, disabled }: any) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        marginBottom: 10,
        opacity: disabled ? 0.6 : 1,
      }}>
      <Glass style={{ borderRadius: 16 }} radius={16}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text style={{ color: value ? A6.fg1 : A6.fg3, fontSize: 15 }}>
            {value || placeholder}
          </Text>
          <ChevronDown color={A6.fg3} size={18} />
        </View>
      </Glass>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: A6.bgInk }}>
      <AuroraBackdrop variant="sparse" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, paddingTop: 110 }}
          keyboardShouldPersistTaps="handled">
          {/* Language pill */}
          <View style={{ position: 'absolute', top: 60, right: 22, zIndex: 20 }}>
            <Glass style={{ borderRadius: 14 }} radius={14}>
              <TouchableOpacity
                onPress={() => setLangModalOpen(true)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}>
                <Globe size={14} color={A6.fg2} strokeWidth={1.7} />
                <Text style={{ color: A6.fg1, fontSize: 12, fontWeight: '600' }}>{language}</Text>
                <ChevronDown color={A6.fg2} size={11} strokeWidth={2.5} />
              </TouchableOpacity>
            </Glass>
          </View>

          {/* Logo + brand */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <LogoMark size={76} />
            <Text
              style={{
                marginTop: 18,
                fontSize: 32,
                fontWeight: '600',
                letterSpacing: -1,
                color: A6.primaryLight,
              }}>
              MindfulBite
            </Text>
            <Text style={{ fontSize: 14, color: A6.fg2, marginTop: 6, textAlign: 'center' }}>
              {t('yourAICoach')}
            </Text>
          </View>

          <InputField
            Icon={Mail}
            placeholder={t('emailAddress')}
            value={email}
            onChange={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <InputField
            Icon={Lock}
            placeholder={t('password')}
            value={password}
            onChange={setPassword}
            secure={!showPassword}
            right={
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                {showPassword ? (
                  <EyeOff color={A6.primaryLight} size={18} strokeWidth={1.7} />
                ) : (
                  <Eye color={A6.fg2} size={18} strokeWidth={1.7} />
                )}
              </TouchableOpacity>
            }
          />

          {isLogin && (
            <TouchableOpacity
              onPress={handleResetPassword}
              style={{ alignSelf: 'flex-end', marginBottom: 18 }}>
              <Text style={{ color: A6.primaryLight, fontSize: 12, fontWeight: '600' }}>
                {t('forgotPassword')}
              </Text>
            </TouchableOpacity>
          )}

          {!isLogin && (
            <>
              <InputField
                Icon={Lock}
                placeholder={t('confirmPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                secure={!showConfirmPassword}
                right={
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ padding: 4 }}>
                    {showConfirmPassword ? (
                      <EyeOff color={A6.primaryLight} size={18} strokeWidth={1.7} />
                    ) : (
                      <Eye color={A6.fg2} size={18} strokeWidth={1.7} />
                    )}
                  </TouchableOpacity>
                }
              />
              <Dropdown
                value={country}
                placeholder="Select Country"
                onPress={() => setCountryModalOpen(true)}
              />
              <Dropdown
                value={city}
                placeholder={country ? 'Select City' : 'Select Country first'}
                onPress={() => {
                  if (!country) {
                    alert('Select Country', 'Please select a country first.');
                    return;
                  }
                  setCityModalOpen(true);
                }}
                disabled={!country}
              />
            </>
          )}

          {/* Sign In/Up CTA */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleAuth}
            disabled={loading}
            style={{
              marginTop: 8,
              borderRadius: 16,
              overflow: 'hidden',
              ...Platform.select({
                ios: {
                  shadowColor: A6.primary,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.5,
                  shadowRadius: 22,
                },
                android: { elevation: 10 },
              }),
            }}>
            <LinearGradient
              colors={[A6.primary, A6.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}>
              {loading && <ActivityIndicator color={A6.bgInk} />}
              <Text
                style={{
                  color: A6.bgInk,
                  fontSize: 16,
                  fontWeight: '800',
                  letterSpacing: 0.2,
                }}>
                {isLogin ? t('signInBtn') : t('signUpBtn')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Toggle */}
          <TouchableOpacity
            style={{ marginTop: 16, alignItems: 'center' }}
            onPress={() => {
              setIsLogin(!isLogin);
              setPassword('');
              setConfirmPassword('');
            }}
            disabled={loading}>
            <Text style={{ color: A6.fg2, fontSize: 13 }}>
              {isLogin ? t('noAccountLabel') : t('haveAccountLabel')}{' '}
              <Text style={{ color: A6.primaryLight, fontWeight: '700' }}>
                {isLogin ? 'Sign Up' : 'Log In'}
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 22 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <Text style={{ marginHorizontal: 12, color: A6.fg3, fontSize: 11, letterSpacing: 2 }}>
              OR
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          </View>

          {/* Google */}
          <Glass style={{ marginBottom: 10, borderRadius: 18 }} radius={18} hi={0.06}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleOAuth('google')}
              disabled={loading}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}>
              <Text style={{ color: A6.fg1, fontSize: 15, fontWeight: '600' }}>
                {t('contGoogle')}
              </Text>
            </TouchableOpacity>
          </Glass>

          {/* Facebook */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleOAuth('facebook')}
            disabled={loading}
            style={{
              padding: 14,
              borderRadius: 18,
              backgroundColor: '#1877F2',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              ...Platform.select({
                ios: {
                  shadowColor: '#1877F2',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 18,
                },
                android: { elevation: 6 },
              }),
            }}>
            <Facebook color="white" size={18} fill="white" strokeWidth={0} />
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>
              Continue with Facebook
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language modal */}
      <Modal visible={langModalOpen} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setLangModalOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 }}>
          <View
            style={{
              borderRadius: 20,
              maxHeight: 400,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.12)',
            }}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ backgroundColor: 'rgba(2,16,21,0.9)' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: A6.fg1,
                  padding: 16,
                  borderBottomWidth: 0.5,
                  borderBottomColor: 'rgba(255,255,255,0.08)',
                }}>
                {t('selectLanguage')}
              </Text>
              <FlatList
                data={LANGUAGES}
                keyExtractor={(item) => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setLanguage(item.name);
                      setLangModalOpen(false);
                    }}
                    style={{
                      padding: 16,
                      borderBottomWidth: 0.5,
                      borderBottomColor: 'rgba(255,255,255,0.05)',
                      backgroundColor: item.name === language ? `${A6.primary}1A` : 'transparent',
                    }}>
                    <Text
                      style={{
                        color: item.name === language ? A6.primaryLight : A6.fg1,
                        fontSize: 15,
                        fontWeight: item.name === language ? '800' : '500',
                      }}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Country modal */}
      <Modal visible={countryModalOpen} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCountryModalOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              borderRadius: 20,
              maxHeight: 450,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.12)',
            }}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ backgroundColor: 'rgba(2,16,21,0.9)' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: A6.fg1,
                  padding: 16,
                  borderBottomWidth: 0.5,
                  borderBottomColor: 'rgba(255,255,255,0.08)',
                }}>
                Select Country
              </Text>
              <FlatList
                data={countryList}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setCountry(item);
                      setCity('');
                      setCountryModalOpen(false);
                    }}
                    style={{
                      padding: 16,
                      borderBottomWidth: 0.5,
                      borderBottomColor: 'rgba(255,255,255,0.05)',
                      backgroundColor: item === country ? `${A6.primary}1A` : 'transparent',
                    }}>
                    <Text
                      style={{
                        color: item === country ? A6.primaryLight : A6.fg1,
                        fontSize: 15,
                        fontWeight: item === country ? '800' : '500',
                      }}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* City modal */}
      <Modal visible={cityModalOpen} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCityModalOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              borderRadius: 20,
              maxHeight: 450,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.12)',
            }}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ backgroundColor: 'rgba(2,16,21,0.9)' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: A6.fg1,
                  padding: 16,
                  borderBottomWidth: 0.5,
                  borderBottomColor: 'rgba(255,255,255,0.08)',
                }}>
                Select City — {country}
              </Text>
              <FlatList
                data={cityList}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setCity(item);
                      setCityModalOpen(false);
                    }}
                    style={{
                      padding: 16,
                      borderBottomWidth: 0.5,
                      borderBottomColor: 'rgba(255,255,255,0.05)',
                      backgroundColor: item === city ? `${A6.primary}1A` : 'transparent',
                    }}>
                    <Text
                      style={{
                        color: item === city ? A6.primaryLight : A6.fg1,
                        fontSize: 15,
                        fontWeight: item === city ? '800' : '500',
                      }}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
