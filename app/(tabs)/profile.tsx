import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Image, Modal, FlatList } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { Camera, KeyRound, LogOut, AtSign, ChevronRight, ChevronDown, Pencil, Moon, Sun, UtensilsCrossed, Monitor } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCustomAlert } from '../../components/CustomAlert';
import { useAppTheme } from '../context/ThemeContext';
import { getCountryNames, getCitiesForCountry } from '../../lib/countries';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { resolvedScheme, themeMode, setThemeMode } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const { alert } = useCustomAlert();

  const [loading, setLoading] = useState(false);
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

  // Reload profile every time the tab comes into focus (catches username changes)
  useFocusEffect(
    useCallback(() => {
      if (user) loadProfile();
    }, [user])
  );

  async function loadProfile() {
    setLoading(true);
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
    setLoading(false);
  }

  async function updateProfile() {
    setSaving(true);
    const { error } = await supabase.from('users').update({
      full_name: fullName.trim(),
      weight: parseFloat(weight) || null,
      goal_weight: parseFloat(goalWeight) || null,
      country: country.trim() || null,
      city: city.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user?.id);
    setSaving(false);

    if (error) {
      alert('Update Failed', error.message);
    } else {
      alert('Success', 'Profile updated successfully!');
    }
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
        }
      }
    ]);
  }

  // ── Dark-aware color helpers ──
  const bg = isDark ? '#09090B' : '#F8FAFC';
  const bgEnd = isDark ? '#1E293B' : '#FFFFFF';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const cardBorder = isDark ? '#334155' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';
  const chipBg = isDark ? '#0F172A' : '#F8FAFC';
  const subtleBg = isDark ? '#0F172A' : '#F1F5F9';
  const shadowColor = isDark ? '#000' : '#000';
  const shadowOp = isDark ? 0.3 : 0.04;
  const modalBg = isDark ? '#1E293B' : '#FFFFFF';
  const modalItemBg = isDark ? '#0F172A' : '#F1F5F9';

  return (
    <LinearGradient colors={[bg, bgEnd]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
        {/* Upgrade Banner for Profile */}
        <TouchableOpacity onPress={() => router.push('/paywall')} style={{ backgroundColor: '#6FAF4F', padding: 16, borderRadius: 20, marginBottom: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Upgrade for as low as $5.99/month</Text>
        </TouchableOpacity>

        {/* Avatar */}
        <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 24 }}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
            <View style={{
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: chipBg,
              borderWidth: 3, borderColor: cardBg,
              overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
              shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: shadowOp, shadowRadius: 10, elevation: 4
            }}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: 120, height: 120 }} />
              ) : (
                <Camera color={textSecondary} size={32} />
              )}
            </View>
            <View style={{
              position: 'absolute', bottom: 0, right: 0, backgroundColor: '#6FAF4F',
              width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
              justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: cardBg,
              shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4
            }}>
              <Camera color="#FFFFFF" size={16} />
            </View>
          </TouchableOpacity>
          <Text style={{ marginTop: 16, fontSize: 22, fontWeight: '800', color: textPrimary }}>
            {fullName || 'Welcome Back'}
          </Text>
        </View>

        {/* Username Display (Read-Only) */}
        <View style={{ backgroundColor: cardBg, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: shadowOp, shadowRadius: 8, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={{ backgroundColor: 'rgba(47, 164, 215, 0.1)', padding: 10, borderRadius: 12, marginRight: 14 }}>
                <AtSign color="#2FA4D7" size={20} />
              </View>
              <View>
                <Text style={{ color: textSecondary, fontSize: 12, fontWeight: '600' }}>Username</Text>
                <Text style={{ color: textPrimary, fontSize: 17, fontWeight: '700' }}>
                  {username ? `@${username}` : 'Not set'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/change-username')}
              style={{ backgroundColor: subtleBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}
            >
              <Pencil color={textSecondary} size={14} />
              <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dietary Preferences Display */}
        <View style={{ backgroundColor: cardBg, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: shadowOp, shadowRadius: 8, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 12, marginRight: 14 }}>
                <UtensilsCrossed color="#FBBF24" size={20} />
              </View>
              <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '700' }}>Dietary Profile</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/change-preferences')}
              style={{ backgroundColor: subtleBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}
            >
              <Pencil color={textSecondary} size={14} />
              <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>Change</Text>
            </TouchableOpacity>
          </View>
          {(dietaryPrefs || 'None').split(' | ').map((pref, i) => {
            let label = '';
            let value = pref;
            if (pref.startsWith('Allergy:')) {
              label = '🚫 Allergy';
              value = pref.replace('Allergy:', '').trim() || 'No Allergies';
            } else if (pref.startsWith('Ethnicity:')) {
              label = '🌍 Ethnicity';
              value = pref.replace('Ethnicity:', '').trim();
            } else {
              label = '🍽️ Diet';
              value = pref === 'None' ? 'No Dietary Restrictions' : pref;
            }
            return (
              <View key={i} style={{ backgroundColor: chipBg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
                <Text style={{ color: textPrimary, fontSize: 14, fontWeight: '700' }}>{value}</Text>
              </View>
            );
          })}
        </View>

        {/* Location Card with cascading dropdowns */}
        <View style={{ backgroundColor: cardBg, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: shadowOp, shadowRadius: 8, elevation: 2 }}>
          <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>📍 Location</Text>

          {/* Country picker */}
          <Text style={{ color: textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>Country</Text>
          <TouchableOpacity
            onPress={() => setCountryModalOpen(true)}
            style={{ backgroundColor: inputBg, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}
          >
            <Text style={{ color: country ? textPrimary : textSecondary, fontSize: 15 }}>{country || 'Select Country'}</Text>
            <ChevronDown color={textSecondary} size={18} />
          </TouchableOpacity>

          {/* City picker */}
          <Text style={{ color: textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>City</Text>
          <TouchableOpacity
            onPress={() => { if (!country) { alert('Select Country', 'Please select a country first.'); return; } setCityModalOpen(true); }}
            style={{ backgroundColor: country ? inputBg : subtleBg, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ color: city ? textPrimary : textSecondary, fontSize: 15 }}>{city || (country ? 'Select City' : 'Select Country first')}</Text>
            <ChevronDown color={textSecondary} size={18} />
          </TouchableOpacity>

          {/* Country Modal */}
          <Modal visible={countryModalOpen} transparent animationType="fade">
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setCountryModalOpen(false)}>
              <View style={{ backgroundColor: modalBg, borderRadius: 20, maxHeight: 450, overflow: 'hidden' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary, padding: 16, borderBottomWidth: 1, borderBottomColor: cardBorder }}>Select Country</Text>
                <FlatList
                  data={countryList}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => { setCountry(item); setCity(''); setCountryModalOpen(false); }}
                      style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: item === country ? modalItemBg : modalBg }}
                    >
                      <Text style={{ color: item === country ? '#6FAF4F' : textPrimary, fontSize: 15, fontWeight: item === country ? '800' : '500' }}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableOpacity>
          </Modal>

          {/* City Modal */}
          <Modal visible={cityModalOpen} transparent animationType="fade">
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setCityModalOpen(false)}>
              <View style={{ backgroundColor: modalBg, borderRadius: 20, maxHeight: 450, overflow: 'hidden' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary, padding: 16, borderBottomWidth: 1, borderBottomColor: cardBorder }}>Select City — {country}</Text>
                <FlatList
                  data={cityList}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => { setCity(item); setCityModalOpen(false); }}
                      style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: cardBorder, backgroundColor: item === city ? modalItemBg : modalBg }}
                    >
                      <Text style={{ color: item === city ? '#6FAF4F' : textPrimary, fontSize: 15, fontWeight: item === city ? '800' : '500' }}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        </View>

        {/* Sleep / Wake Schedule */}
        <View style={{ backgroundColor: cardBg, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: shadowOp, shadowRadius: 8, elevation: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '700' }}>Daily Schedule</Text>
            <TouchableOpacity
              onPress={() => router.push('/meal-schedule')}
              style={{ backgroundColor: subtleBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}
            >
              <Pencil color={textSecondary} size={14} />
              <Text style={{ color: textSecondary, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, backgroundColor: chipBg, padding: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center' }}>
              <Sun color="#FBBF24" size={18} />
              <View style={{ marginLeft: 10 }}>
                <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '600' }}>Wake Up</Text>
                <Text style={{ color: textPrimary, fontSize: 15, fontWeight: '700' }}>{wakeTime || 'Not set'}</Text>
              </View>
            </View>
            <View style={{ flex: 1, backgroundColor: chipBg, padding: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center' }}>
              <Moon color="#818CF8" size={18} />
              <View style={{ marginLeft: 10 }}>
                <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '600' }}>Bedtime</Text>
                <Text style={{ color: textPrimary, fontSize: 15, fontWeight: '700' }}>{sleepTime || 'Not set'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Theme Preferences */}
        <View style={{ backgroundColor: cardBg, borderRadius: 20, padding: 18, marginBottom: 16, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: shadowOp, shadowRadius: 8, elevation: 2 }}>
          <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>Theme Preferences</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => setThemeMode('light')} style={{ flex: 1, backgroundColor: themeMode === 'light' ? 'rgba(111, 175, 79, 0.15)' : chipBg, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderColor: themeMode === 'light' ? '#6FAF4F' : 'transparent' }}>
               <Sun color={themeMode === 'light' ? '#6FAF4F' : textSecondary} size={20} />
               <Text style={{ marginTop: 8, color: themeMode === 'light' ? '#6FAF4F' : textSecondary, fontWeight: '700', fontSize: 13 }}>Light</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setThemeMode('dark')} style={{ flex: 1, backgroundColor: themeMode === 'dark' ? 'rgba(111, 175, 79, 0.15)' : chipBg, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderColor: themeMode === 'dark' ? '#6FAF4F' : 'transparent' }}>
               <Moon color={themeMode === 'dark' ? '#6FAF4F' : textSecondary} size={20} />
               <Text style={{ marginTop: 8, color: themeMode === 'dark' ? '#6FAF4F' : textSecondary, fontWeight: '700', fontSize: 13 }}>Dark</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setThemeMode('system')} style={{ flex: 1, backgroundColor: themeMode === 'system' ? 'rgba(111, 175, 79, 0.15)' : chipBg, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 2, borderColor: themeMode === 'system' ? '#6FAF4F' : 'transparent' }}>
               <Monitor color={themeMode === 'system' ? '#6FAF4F' : textSecondary} size={20} />
               <Text style={{ marginTop: 8, color: themeMode === 'system' ? '#6FAF4F' : textSecondary, fontWeight: '700', fontSize: 13 }}>System</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Editable Fields */}
        <View style={{ backgroundColor: cardBg, borderRadius: 24, padding: 20, marginBottom: 16, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: shadowOp, shadowRadius: 8, elevation: 2 }}>
          
          <Text style={{ color: textSecondary, marginBottom: 6, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>Full Name</Text>
          <TextInput
            style={{ backgroundColor: inputBg, padding: 16, borderRadius: 16, color: textPrimary, marginBottom: 16, borderWidth: 1, borderColor: cardBorder }}
            value={fullName} onChangeText={setFullName} placeholder="e.g. John Doe" placeholderTextColor={textSecondary}
          />

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: textSecondary, marginBottom: 6, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>Current Weight</Text>
              <TextInput
                style={{ backgroundColor: inputBg, padding: 16, borderRadius: 16, color: textPrimary, borderWidth: 1, borderColor: cardBorder }}
                value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="kg" placeholderTextColor={textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: textSecondary, marginBottom: 6, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>Goal Weight</Text>
              <TextInput
                style={{ backgroundColor: inputBg, padding: 16, borderRadius: 16, color: textPrimary, borderWidth: 1, borderColor: cardBorder }}
                value={goalWeight} onChangeText={setGoalWeight} keyboardType="numeric" placeholder="kg" placeholderTextColor={textSecondary}
              />
            </View>
          </View>

          <TouchableOpacity onPress={updateProfile} disabled={saving} style={{ backgroundColor: '#6FAF4F', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 4, shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 4 }}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Save Changes</Text>}
          </TouchableOpacity>
        </View>

        {/* Settings Buttons */}
        <View style={{ gap: 12 }}>
          {/* Change Password */}
          <TouchableOpacity
            onPress={() => router.push('/change-password')}
            style={{ backgroundColor: cardBg, padding: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: cardBorder, shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 6, elevation: 1 }}
          >
            <View style={{ backgroundColor: subtleBg, padding: 10, borderRadius: 12, marginRight: 14 }}>
              <KeyRound color={textSecondary} size={20} />
            </View>
            <Text style={{ flex: 1, color: textPrimary, fontSize: 16, fontWeight: '600' }}>Change Password</Text>
            <ChevronRight color={textSecondary} size={20} />
          </TouchableOpacity>

          {/* Sign Out */}
          <TouchableOpacity
            onPress={handleLogout}
            style={{ backgroundColor: isDark ? '#2D1111' : '#FEF2F2', padding: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#7F1D1D' : '#FCA5A5' }}
          >
            <View style={{ backgroundColor: isDark ? '#450A0A' : '#FEE2E2', padding: 10, borderRadius: 12, marginRight: 14 }}>
              <LogOut color="#EF4444" size={20} />
            </View>
            <Text style={{ flex: 1, color: '#EF4444', fontSize: 16, fontWeight: '600' }}>Sign Out</Text>
            <ChevronRight color="#EF4444" size={20} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}
