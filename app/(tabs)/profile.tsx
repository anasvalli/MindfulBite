import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Platform,
  StyleSheet,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  KeyRound,
  LogOut,
  AtSign,
  ChevronRight,
  ChevronDown,
  Pencil,
  Moon,
  Sun,
  UtensilsCrossed,
  Monitor,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCustomAlert } from '../../components/CustomAlert';
import { useAppTheme } from '../context/ThemeContext';
import { getCountryNames, getCitiesForCountry } from '../../lib/countries';
import { A6 } from '../../lib/theme';
import { Page, Glass } from '../../components/ui/A6';
import { BlurView } from 'expo-blur';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { themeMode, setThemeMode } = useAppTheme();
  const router = useRouter();
  const { alert } = useCustomAlert();

  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [weight, setWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dietaryPrefs, setDietaryPrefs] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [sleepTime, setSleepTime] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const countryList = getCountryNames();
  const cityList = country ? getCitiesForCountry(country) : [];

  useFocusEffect(
    useCallback(() => {
      if (user) loadProfile();
    }, [user])
  );

  async function loadProfile() {
    const { data } = await supabase.from('users').select('*').eq('id', user?.id).single();
    if (data) {
      setFullName(data.full_name || '');
      setUsername(data.username || '');
      setWeight(data.weight ? String(data.weight) : '');
      setGoalWeight(data.goal_weight ? String(data.goal_weight) : '');
      setAvatarUrl(data.avatar_url || null);
      setDietaryPrefs(data.dietary_prefs || '');
      setWakeTime(data.wake_time || '');
      setSleepTime(data.sleep_time || '');
      setCountry(data.country || '');
      setCity(data.city || '');
    }
  }

  async function updateProfile() {
    const parsedWeight = weight.trim() ? parseFloat(weight) : null;
    const parsedGoalWeight = goalWeight.trim() ? parseFloat(goalWeight) : null;

    if (weight.trim() && (isNaN(parsedWeight!) || parsedWeight! <= 0)) {
      alert('Invalid Weight', 'Please enter a valid positive number for current weight.');
      return;
    }
    if (goalWeight.trim() && (isNaN(parsedGoalWeight!) || parsedGoalWeight! <= 0)) {
      alert('Invalid Goal Weight', 'Please enter a valid positive number for goal weight.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        full_name: fullName.trim(),
        weight: parsedWeight,
        goal_weight: parsedGoalWeight,
        country: country.trim() || null,
        city: city.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user?.id);
    setSaving(false);

    if (error) alert('Update Failed', error.message);
    else alert('Success', 'Profile updated successfully!');
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.1,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatarUrl(b64);
      setSaving(true);
      await supabase.from('users').update({ avatar_url: b64 }).eq('id', user?.id);
      setSaving(false);
    }
  }

  function handleLogout() {
    alert('Sign Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const initials = (fullName || username || user?.email || 'A').slice(0, 1).toUpperCase();

  const inputStyle = {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: A6.inputBg,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    color: A6.fg1,
    fontSize: 14,
  } as const;

  const labelStyle = {
    fontSize: 11,
    color: A6.fg2,
    fontWeight: '600' as const,
    marginBottom: 6,
    marginLeft: 2,
  };

  const ChipBtn = ({ children, onPress }: { children: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: A6.fgFaint,
      }}>
      <Text style={{ fontSize: 11, color: A6.fg2, fontWeight: '600' }}>{children}</Text>
    </TouchableOpacity>
  );

  return (
    <Page padTop={48}>
      {/* Upgrade banner */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/paywall')}
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            ...Platform.select({
              ios: {
                shadowColor: A6.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.45,
                shadowRadius: 18,
              },
              android: { elevation: 6 },
            }),
          }}>
          <LinearGradient
            colors={[A6.primary, A6.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' }}>
            <Text style={{ color: A6.bgInk, fontWeight: '800', fontSize: 14 }}>
              Upgrade for as low as $5.99 / month →
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Avatar */}
      <View style={{ alignItems: 'center', paddingVertical: 12, paddingBottom: 24 }}>
        <TouchableOpacity onPress={pickImage} activeOpacity={0.85}>
          <View
            style={{
              width: 110,
              height: 110,
              borderRadius: 55,
              borderWidth: 3,
              borderColor: A6.bgInk,
              overflow: 'hidden',
              ...Platform.select({
                ios: {
                  shadowColor: A6.primary,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.6,
                  shadowRadius: 22,
                },
                android: { elevation: 12 },
              }),
            }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <LinearGradient
                colors={[A6.primary, A6.primaryLight, A6.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: A6.bgInk, fontSize: 40, fontWeight: '700' }}>{initials}</Text>
              </LinearGradient>
            )}
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 34,
              height: 34,
              borderRadius: 17,
              borderWidth: 3,
              borderColor: A6.bgInk,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <LinearGradient
              colors={[A6.primary, A6.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                ...StyleSheet.absoluteFillObject,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Camera size={14} color={A6.bgInk} strokeWidth={2} />
            </LinearGradient>
          </View>
        </TouchableOpacity>
        <Text
          style={{
            marginTop: 14,
            fontSize: 22,
            fontWeight: '600',
            letterSpacing: -0.5,
            color: A6.fg1,
          }}>
          {fullName || 'Welcome Back'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {/* Username row */}
        <Glass
          style={{
            padding: 14,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: `${A6.primaryLight}1F`,
              borderWidth: 0.5,
              borderColor: `${A6.primaryLight}55`,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
            }}>
            <AtSign color={A6.primaryLight} size={18} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: A6.fg2, fontWeight: '600', letterSpacing: 0.5 }}>
              Username
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: A6.fg1, marginTop: 1 }}>
              {username ? `@${username}` : 'Not set'}
            </Text>
          </View>
          <ChipBtn onPress={() => router.push('/change-username')}>Change</ChipBtn>
        </Glass>

        {/* Dietary profile */}
        <Glass style={{ padding: 14, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: `${A6.warn}1A`,
                borderWidth: 0.5,
                borderColor: `${A6.warn}44`,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <UtensilsCrossed color={A6.warn} size={18} strokeWidth={1.7} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', flex: 1, color: A6.fg1 }}>
              Dietary Profile
            </Text>
            <ChipBtn onPress={() => router.push('/change-preferences')}>Change</ChipBtn>
          </View>
          {(dietaryPrefs || 'None').split(' | ').map((pref, i) => {
            let label = '🍽️ Diet';
            let value = pref;
            if (pref.startsWith('Allergy:')) {
              label = '🚫 Allergy';
              value = pref.replace('Allergy:', '').trim() || 'No Allergies';
            } else if (pref.startsWith('Ethnicity:')) {
              label = '🌍 Ethnicity';
              value = pref.replace('Ethnicity:', '').trim();
            } else {
              value = pref === 'None' ? 'No Dietary Restrictions' : pref;
            }
            return (
              <View
                key={i}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: A6.fgFaint,
                  marginBottom: 6,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}>
                <Text style={{ fontSize: 12, color: A6.fg2, fontWeight: '600' }}>{label}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: A6.fg1 }}>{value}</Text>
              </View>
            );
          })}
        </Glass>

        {/* Location */}
        <Glass style={{ padding: 14, marginBottom: 10 }}>
          <Text style={{ color: A6.fg1, fontSize: 14, fontWeight: '600', marginBottom: 12 }}>
            📍 Location
          </Text>
          <Text style={[labelStyle]}>Country</Text>
          <TouchableOpacity
            onPress={() => setCountryModalOpen(true)}
            style={{
              ...inputStyle,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}>
            <Text style={{ color: country ? A6.fg1 : A6.fg3, fontSize: 14 }}>
              {country || 'Select Country'}
            </Text>
            <ChevronDown color={A6.fg3} size={18} />
          </TouchableOpacity>

          <Text style={[labelStyle]}>City</Text>
          <TouchableOpacity
            onPress={() => {
              if (!country) {
                alert('Select Country', 'Please select a country first.');
                return;
              }
              setCityModalOpen(true);
            }}
            style={{
              ...inputStyle,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: country ? 1 : 0.55,
            }}>
            <Text style={{ color: city ? A6.fg1 : A6.fg3, fontSize: 14 }}>
              {city || (country ? 'Select City' : 'Select Country first')}
            </Text>
            <ChevronDown color={A6.fg3} size={18} />
          </TouchableOpacity>
        </Glass>

        {/* Daily Schedule */}
        <Glass style={{ padding: 14, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', flex: 1, color: A6.fg1 }}>
              Daily Schedule
            </Text>
            <ChipBtn onPress={() => router.push('/meal-schedule')}>Edit</ChipBtn>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                backgroundColor: A6.fgFaint,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
              <Sun color={A6.warn} size={18} />
              <View>
                <Text style={{ fontSize: 10, color: A6.fg2, fontWeight: '600' }}>Wake Up</Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: A6.fg1,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {wakeTime || 'Not set'}
                </Text>
              </View>
            </View>
            <View
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                backgroundColor: A6.fgFaint,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
              <Moon color={A6.tertiary} size={18} />
              <View>
                <Text style={{ fontSize: 10, color: A6.fg2, fontWeight: '600' }}>Bedtime</Text>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: A6.fg1,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {sleepTime || 'Not set'}
                </Text>
              </View>
            </View>
          </View>
        </Glass>

        {/* Theme */}
        <Glass style={{ padding: 14, marginBottom: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 10, color: A6.fg1 }}>
            Theme
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { id: 'light', l: 'Light', Icon: Sun },
              { id: 'dark', l: 'Dark', Icon: Moon },
              { id: 'system', l: 'System', Icon: Monitor },
            ].map((opt) => {
              const on = themeMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={0.85}
                  onPress={() => setThemeMode(opt.id as any)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: on ? `${A6.primary}1F` : A6.fgFaint,
                    borderWidth: 1,
                    borderColor: on ? `${A6.primary}66` : 'transparent',
                    alignItems: 'center',
                  }}>
                  <opt.Icon color={on ? A6.primaryLight : A6.fg2} size={18} strokeWidth={1.8} />
                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      fontWeight: '700',
                      color: on ? A6.primaryLight : A6.fg2,
                    }}>
                    {opt.l}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Glass>

        {/* Editable fields */}
        <Glass style={{ padding: 16, marginBottom: 10 }}>
          <Text style={[labelStyle]}>Full Name</Text>
          <TextInput
            style={{ ...inputStyle, marginBottom: 12 }}
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. John Doe"
            placeholderTextColor={A6.fg3}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[labelStyle]}>Current Weight (kg)</Text>
              <TextInput
                style={inputStyle}
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                placeholder="kg"
                placeholderTextColor={A6.fg3}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[labelStyle]}>Goal Weight (kg)</Text>
              <TextInput
                style={inputStyle}
                value={goalWeight}
                onChangeText={setGoalWeight}
                keyboardType="numeric"
                placeholder="kg"
                placeholderTextColor={A6.fg3}
              />
            </View>
          </View>
          <TouchableOpacity
            onPress={updateProfile}
            disabled={saving}
            activeOpacity={0.85}
            style={{
              borderRadius: 14,
              overflow: 'hidden',
              ...Platform.select({
                ios: {
                  shadowColor: A6.primary,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.45,
                  shadowRadius: 18,
                },
                android: { elevation: 6 },
              }),
            }}>
            <LinearGradient
              colors={[A6.primary, A6.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 14, alignItems: 'center' }}>
              {saving ? (
                <ActivityIndicator color={A6.bgInk} />
              ) : (
                <Text style={{ color: A6.bgInk, fontWeight: '800', fontSize: 15 }}>
                  Save Changes
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Glass>

        {/* Change Password */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push('/change-password')}
          style={{
            padding: 14,
            marginBottom: 8,
            borderRadius: 16,
            backgroundColor: A6.cardBg,
            borderWidth: 0.5,
            borderColor: 'rgba(255,255,255,0.1)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: A6.fgFaint,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <KeyRound color={A6.fg2} size={18} strokeWidth={1.8} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: A6.fg1 }}>
            Change Password
          </Text>
          <ChevronRight color={A6.fg2} size={18} strokeWidth={1.8} />
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleLogout}
          style={{
            padding: 14,
            marginBottom: 8,
            borderRadius: 16,
            backgroundColor: `${A6.danger}0a`,
            borderWidth: 0.5,
            borderColor: `${A6.danger}33`,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: `${A6.danger}1A`,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <LogOut color={A6.danger} size={18} strokeWidth={1.8} />
          </View>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: A6.danger }}>
            Sign Out
          </Text>
          <ChevronRight color={A6.danger} size={18} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {/* Country modal */}
      <Modal visible={countryModalOpen} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setCountryModalOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, justifyContent: 'center' }}>
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
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, justifyContent: 'center' }}>
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
    </Page>
  );
}
