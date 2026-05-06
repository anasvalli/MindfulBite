import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Modal, FlatList, useColorScheme, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { ChevronDown, Leaf } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { useCustomAlert } from '../../components/CustomAlert';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const YEARS = Array.from({ length: 80 }, (_, i) => String(new Date().getFullYear() - i));
const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say', 'Others'];
const DIETARY_OPTIONS = ['None', 'Vegan', 'Vegetarian', 'Keto', 'Gluten-Free', 'Halal', 'Kosher', 'Paleo', 'Other'];
const ALLERGY_OPTIONS = ['No Allergies', 'Peanuts', 'Tree Nuts', 'Milk/Dairy', 'Eggs', 'Wheat/Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Other'];
const ETHNICITY_OPTIONS = ['American', 'Pakistani', 'Indian', 'Mexican', 'Italian', 'Japanese', 'Chinese', 'Mediterranean', 'Middle Eastern', 'African', 'Caribbean', 'French', 'Brazilian', 'Other'];

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (val: string) => void;
  placeholder?: string;
  isDark: boolean;
  compact?: boolean;
};

function Dropdown({ label, value, options, onSelect, placeholder, isDark, compact }: DropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: compact ? 1 : undefined }}>
      {label ? <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>{label}</Text> : null}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          padding: 14, borderRadius: 14,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
        }}
      >
        <Text style={{ color: value ? (isDark ? '#F8FAFC' : '#0F172A') : '#94A3B8', fontSize: 15 }}>
          {value || placeholder || 'Select...'}
        </Text>
        <ChevronDown color="#94A3B8" size={18} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 32 }} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: 380, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              {label || 'Select'}
            </Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item); setOpen(false); }}
                  style={{
                    padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
                    backgroundColor: item === value ? '#F1F5F9' : '#FFFFFF',
                  }}
                >
                  <Text style={{ color: item === value ? '#6FAF4F' : '#64748B', fontSize: 15, fontWeight: item === value ? '800' : '500' }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();
  const { alert } = useCustomAlert();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');
  const [customGender, setCustomGender] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [goalWeight, setGoalWeight] = useState('');
  const [dietaryPrefs, setDietaryPrefs] = useState('None');
  const [customDietary, setCustomDietary] = useState('');
  const [allergyOption, setAllergyOption] = useState('No Allergies');
  const [customAllergy, setCustomAllergy] = useState('');
  const [ethnicityOption, setEthnicityOption] = useState('American');
  const [customEthnicity, setCustomEthnicity] = useState('');
  const [loading, setLoading] = useState(false);

  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);
  const weightRef = useRef<TextInput>(null);
  const goalWeightRef = useRef<TextInput>(null);

  // Auto-fill from Auth Provider Metadata if available
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      const parts = user.user_metadata.full_name.split(' ');
      if (parts[0] && !firstName) setFirstName(parts[0]);
      if (parts.length > 1 && !lastName) setLastName(parts.slice(1).join(' '));
    }
  }, [user]);

  function calculateAge(): number {
    if (!birthMonth || !birthDay || !birthYear) return 0;
    const monthIndex = MONTHS.indexOf(birthMonth);
    const dob = new Date(parseInt(birthYear), monthIndex, parseInt(birthDay));
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  async function saveProfile() {
    if (!user) {
      alert('Session Error', 'No active session found. Please ensure "Confirm Email" is disabled in your Supabase Auth settings, or log in again.');
      return;
    }
    
    const finalGender = gender === 'Others' ? customGender : gender;
    if (!firstName || !lastName || !username || !finalGender || !birthMonth || !birthDay || !birthYear) {
      alert('Missing Info', 'Please fill in all basic profile fields, including your first name, last name and username.');
      return;
    }

    setLoading(true);
    
    const age = calculateAge();
    const w = parseFloat(currentWeight);
    const gw = parseFloat(goalWeight);
    const h = parseFloat(heightCm) / 100;
    const g = finalGender.toLowerCase().trim();

    let bmi = null;
    let dailyGoal = 2000;

    if (w > 0 && h > 0) {
      bmi = parseFloat((w / (h * h)).toFixed(1));
    }

    if (w > 0 && h > 0 && age > 0) {
      let bmr = 10 * w + 6.25 * parseFloat(heightCm) - 5 * age;
      bmr += (g === 'female' || g === 'f') ? -161 : 5;
      let tdee = bmr * 1.2;
      if (gw > 0) {
        if (gw < w) tdee -= 500;
        else if (gw > w) tdee += 500;
      }
      dailyGoal = Math.round(tdee);
      if (dailyGoal < 1200) dailyGoal = 1200;
    }

    const finalDietary = dietaryPrefs === 'Other' ? customDietary : dietaryPrefs;
    const finalAllergy = allergyOption === 'Other' ? customAllergy : (allergyOption === 'No Allergies' ? '' : allergyOption);
    const finalEthnicity = ethnicityOption === 'Other' ? customEthnicity : ethnicityOption;
    const fullDietaryPrefs = (finalDietary || 'None') + (finalAllergy ? ` | Allergy: ${finalAllergy}` : '') + (finalEthnicity ? ` | Ethnicity: ${finalEthnicity}` : '');

    const { error } = await supabase.from('users').upsert({
      id: user.id,
      username: username.trim(),
      full_name: `${firstName.trim()} ${lastName.trim()}`,
      age: age || null,
      gender: finalGender || null,
      weight: w || null,
      height: parseFloat(heightCm) || null,
      bmi,
      goal_weight: parseFloat(goalWeight) || null,
      daily_calorie_goal: dailyGoal,
      dietary_prefs: fullDietaryPrefs,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);

    if (error) {
      alert('Profile Error', error.message);
      console.log('Upsert Error:', error);
      router.replace('/(tabs)');
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
          {/* Header */}
          <View style={{ marginBottom: 28, marginTop: 40, alignItems: 'center' }}>
            <View style={{ 
              width: 64, height: 64, borderRadius: 20, backgroundColor: '#6FAF4F',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 4
            }}>
              <Leaf color="#FFFFFF" size={32} />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6 }}>
              {t('onboardingWelcome')}
            </Text>
            <Text style={{ fontSize: 15, color: '#64748B', textAlign: 'center' }}>
              {t('onboardingDesc')}
            </Text>
          </View>

          {/* Name & Username */}
          <View style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>First Name</Text>
                <TextInput
                  ref={firstNameRef}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                    color: isDark ? '#F8FAFC' : '#0F172A', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
                  }}
                  placeholder="e.g. John"
                  placeholderTextColor="#94A3B8"
                  value={firstName}
                  onChangeText={setFirstName}
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                  returnKeyType="next"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>Last Name</Text>
                <TextInput
                  ref={lastNameRef}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                    color: isDark ? '#F8FAFC' : '#0F172A', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
                  }}
                  placeholder="e.g. Doe"
                  placeholderTextColor="#94A3B8"
                  value={lastName}
                  onChangeText={setLastName}
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  returnKeyType="next"
                />
              </View>
            </View>
            <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>Username</Text>
            <TextInput
              ref={usernameRef}
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                color: isDark ? '#F8FAFC' : '#0F172A', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
              }}
              placeholder="@john"
              placeholderTextColor="#94A3B8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              onSubmitEditing={() => heightRef.current?.focus()}
              returnKeyType="next"
            />
          </View>

          {/* Gender Dropdown */}
          <View style={{ marginBottom: 18 }}>
            <Dropdown label="Gender" value={gender} options={GENDER_OPTIONS} onSelect={setGender} placeholder="Select gender" isDark={isDark} />
            {gender === 'Others' && (
              <TextInput
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                  color: isDark ? '#F8FAFC' : '#0F172A', marginTop: 10, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
                }}
                placeholder="Enter your gender"
                placeholderTextColor="#94A3B8"
                value={customGender}
                onChangeText={setCustomGender}
              />
            )}
          </View>

          {/* Date of Birth */}
          <View style={{ marginBottom: 18 }}>
            <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>Date of Birth</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Dropdown label="" value={birthMonth} options={MONTHS} onSelect={setBirthMonth} placeholder="Month" isDark={isDark} compact />
              <Dropdown label="" value={birthDay} options={DAYS} onSelect={setBirthDay} placeholder="Day" isDark={isDark} compact />
              <Dropdown label="" value={birthYear} options={YEARS} onSelect={setBirthYear} placeholder="Year" isDark={isDark} compact />
            </View>
            {birthMonth && birthDay && birthYear && (
              <Text style={{ color: '#2FA4D7', fontSize: 13, fontWeight: '600', marginTop: 8 }}>
                Age: {calculateAge()} years old
              </Text>
            )}
          </View>

          {/* Height */}
          <View style={{ marginBottom: 18 }}>
            <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>Height (cm)</Text>
            <TextInput
              ref={heightRef}
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                color: isDark ? '#F8FAFC' : '#0F172A', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
              }}
              placeholder="e.g. 175"
              placeholderTextColor="#94A3B8"
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="numeric"
              onSubmitEditing={() => weightRef.current?.focus()}
              returnKeyType="next"
            />
          </View>

          {/* Current Weight */}
          <View style={{ marginBottom: 18 }}>
            <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>Current Weight (kg)</Text>
            <TextInput
              ref={weightRef}
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                color: isDark ? '#F8FAFC' : '#0F172A', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
              }}
              placeholder="e.g. 70"
              placeholderTextColor="#94A3B8"
              value={currentWeight}
              onChangeText={setCurrentWeight}
              keyboardType="numeric"
              onSubmitEditing={() => goalWeightRef.current?.focus()}
              returnKeyType="next"
            />
          </View>

          {/* Goal Weight */}
          <View style={{ marginBottom: 18 }}>
            <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 6, fontWeight: '700', fontSize: 14 }}>Goal Weight (kg)</Text>
            <TextInput
              ref={goalWeightRef}
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                color: isDark ? '#F8FAFC' : '#0F172A', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
              }}
              placeholder="e.g. 65"
              placeholderTextColor="#94A3B8"
              value={goalWeight}
              onChangeText={setGoalWeight}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>

          {/* Dietary Preferences */}
          <View style={{ marginBottom: 18 }}>
            <Dropdown label="Dietary Preference" value={dietaryPrefs} options={DIETARY_OPTIONS} onSelect={setDietaryPrefs} isDark={isDark} />
            {dietaryPrefs === 'Other' && (
              <TextInput
                style={{
                  backgroundColor: '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                  color: '#0F172A', marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0',
                }}
                placeholder="Enter your dietary preference"
                placeholderTextColor="#94A3B8"
                value={customDietary}
                onChangeText={setCustomDietary}
              />
            )}
          </View>

          {/* Allergies */}
          <View style={{ marginBottom: 18 }}>
            <Dropdown label="Any Allergies?" value={allergyOption} options={ALLERGY_OPTIONS} onSelect={setAllergyOption} isDark={isDark} />
            {allergyOption === 'Other' && (
              <TextInput
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                  color: isDark ? '#F8FAFC' : '#0F172A', marginTop: 10, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
                }}
                placeholder="Type your allergy (e.g. Mustard)"
                placeholderTextColor="#94A3B8"
                value={customAllergy}
                onChangeText={setCustomAllergy}
              />
            )}
          </View>

          {/* Ethnicity */}
          <View style={{ marginBottom: 18 }}>
            <Dropdown label="Ethnicity / Cuisine Pref." value={ethnicityOption} options={ETHNICITY_OPTIONS} onSelect={setEthnicityOption} isDark={isDark} />
            {ethnicityOption === 'Other' && (
              <TextInput
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 14, borderRadius: 14, fontSize: 15,
                  color: isDark ? '#F8FAFC' : '#0F172A', marginTop: 10, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
                }}
                placeholder="Enter preferred cuisine (e.g. Thai)"
                placeholderTextColor="#94A3B8"
                value={customEthnicity}
                onChangeText={setCustomEthnicity}
              />
            )}
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#6FAF4F', padding: 16, borderRadius: 16, marginTop: 12,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
            }}
            onPress={saveProfile}
            disabled={loading}
          >
            {loading && <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />}
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>{t('onboardingFinish')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
