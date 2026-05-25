import { useState, useRef, useEffect } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { useCustomAlert } from '../../components/CustomAlert';
import { A6 } from '../../lib/theme';
import { AuroraBackdrop, Glass, LogoMark } from '../../components/ui/A6';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const YEARS = Array.from({ length: 80 }, (_, i) => String(new Date().getFullYear() - i));
const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say', 'Others'];
const DIETARY_OPTIONS = ['None', 'Vegan', 'Vegetarian', 'Keto', 'Gluten-Free', 'Halal', 'Kosher', 'Paleo', 'Other'];
const ALLERGY_OPTIONS = ['No Allergies', 'Peanuts', 'Tree Nuts', 'Milk/Dairy', 'Eggs', 'Wheat/Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Other'];
const ETHNICITY_OPTIONS = ['American', 'Pakistani', 'Indian', 'Mexican', 'Italian', 'Japanese', 'Chinese', 'Mediterranean', 'Middle Eastern', 'African', 'Caribbean', 'French', 'Brazilian', 'Other'];

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        color: A6.fg2,
        fontWeight: '600',
        marginBottom: 6,
        marginLeft: 2,
      }}>
      {children}
    </Text>
  );
}

function GlassInput(props: any) {
  return (
    <Glass style={{ marginBottom: 0, borderRadius: 14 }} radius={14}>
      <TextInput
        {...props}
        placeholderTextColor={A6.fg3}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 14,
          fontSize: 14,
          color: A6.fg1,
        }}
      />
    </Glass>
  );
}

function GlassDropdown({
  value,
  options,
  onSelect,
  placeholder,
  title,
}: {
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  placeholder?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Glass style={{ borderRadius: 14 }} radius={14}>
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <Text style={{ color: value ? A6.fg1 : A6.fg3, fontSize: 14 }}>
              {value || placeholder || 'Select…'}
            </Text>
            <ChevronDown color={A6.fg3} size={14} strokeWidth={2} />
          </View>
        </Glass>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: 32,
          }}>
          <View
            style={{
              borderRadius: 20,
              maxHeight: 380,
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
                {title || 'Select'}
              </Text>
              <FlatList
                data={options}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    style={{
                      padding: 16,
                      borderBottomWidth: 0.5,
                      borderBottomColor: 'rgba(255,255,255,0.05)',
                      backgroundColor: item === value ? `${A6.primary}1A` : 'transparent',
                    }}>
                    <Text
                      style={{
                        color: item === value ? A6.primaryLight : A6.fg1,
                        fontSize: 15,
                        fontWeight: item === value ? '800' : '500',
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
    </>
  );
}

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();
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

  const lastNameRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);
  const weightRef = useRef<TextInput>(null);
  const goalWeightRef = useRef<TextInput>(null);

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      const parts = user.user_metadata.full_name.split(' ');
      if (parts[0] && !firstName) setFirstName(parts[0]);
      if (parts.length > 1 && !lastName) setLastName(parts.slice(1).join(' '));
    }
  }, [user]);

  function calculateAge(): number {
    if (!birthMonth || !birthDay || !birthYear) return 0;
    const dob = new Date(parseInt(birthYear), MONTHS.indexOf(birthMonth), parseInt(birthDay));
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  async function saveProfile() {
    if (!user) {
      alert('Session Error', 'No active session found. Please log in again.');
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

    let bmi: number | null = null;
    let dailyGoal = 2000;
    if (w > 0 && h > 0) bmi = parseFloat((w / (h * h)).toFixed(1));

    if (w > 0 && h > 0 && age > 0) {
      let bmr = 10 * w + 6.25 * parseFloat(heightCm) - 5 * age;
      bmr += g === 'female' || g === 'f' ? -161 : 5;
      let tdee = bmr * 1.2;
      if (gw > 0) {
        if (gw < w) tdee -= 500;
        else if (gw > w) tdee += 500;
      }
      dailyGoal = Math.round(tdee);
      if (dailyGoal < 1200) dailyGoal = 1200;
    }

    const finalDietary = dietaryPrefs === 'Other' ? customDietary : dietaryPrefs;
    const finalAllergy =
      allergyOption === 'Other'
        ? customAllergy
        : allergyOption === 'No Allergies'
        ? ''
        : allergyOption;
    const finalEthnicity = ethnicityOption === 'Other' ? customEthnicity : ethnicityOption;
    const fullDietaryPrefs =
      (finalDietary || 'None') +
      (finalAllergy ? ` | Allergy: ${finalAllergy}` : '') +
      (finalEthnicity ? ` | Ethnicity: ${finalEthnicity}` : '');

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
    if (error) alert('Profile Error', error.message);
    router.replace('/(tabs)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: A6.bgInk }}>
      <AuroraBackdrop variant="sparse" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 80, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <LogoMark size={64} />
            <Text
              style={{
                marginTop: 14,
                fontSize: 26,
                fontWeight: '600',
                letterSpacing: -0.5,
                color: A6.fg1,
              }}>
              {t('onboardingWelcome')}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: A6.fg2,
                marginTop: 6,
                textAlign: 'center',
              }}>
              {t('onboardingDesc')}
            </Text>
          </View>

          {/* Name row */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>First Name</FieldLabel>
              <GlassInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="e.g. John"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                returnKeyType="next"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Last Name</FieldLabel>
              <GlassInput
                ref={lastNameRef}
                value={lastName}
                onChangeText={setLastName}
                placeholder="e.g. Doe"
                onSubmitEditing={() => usernameRef.current?.focus()}
                returnKeyType="next"
              />
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <FieldLabel>Username</FieldLabel>
            <GlassInput
              ref={usernameRef}
              value={username}
              onChangeText={setUsername}
              placeholder="@john"
              autoCapitalize="none"
              onSubmitEditing={() => heightRef.current?.focus()}
              returnKeyType="next"
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <FieldLabel>Gender</FieldLabel>
            <GlassDropdown
              value={gender}
              options={GENDER_OPTIONS}
              onSelect={setGender}
              placeholder="Select gender"
              title="Gender"
            />
            {gender === 'Others' && (
              <View style={{ marginTop: 8 }}>
                <GlassInput
                  value={customGender}
                  onChangeText={setCustomGender}
                  placeholder="Enter your gender"
                />
              </View>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <FieldLabel>Date of Birth</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <GlassDropdown
                  value={birthMonth}
                  options={MONTHS}
                  onSelect={setBirthMonth}
                  placeholder="Month"
                  title="Month"
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassDropdown
                  value={birthDay}
                  options={DAYS}
                  onSelect={setBirthDay}
                  placeholder="Day"
                  title="Day"
                />
              </View>
              <View style={{ flex: 1 }}>
                <GlassDropdown
                  value={birthYear}
                  options={YEARS}
                  onSelect={setBirthYear}
                  placeholder="Year"
                  title="Year"
                />
              </View>
            </View>
            {birthMonth && birthDay && birthYear && (
              <Text
                style={{
                  color: A6.primaryLight,
                  fontSize: 11,
                  fontWeight: '600',
                  marginTop: 6,
                  marginLeft: 2,
                }}>
                Age: {calculateAge()} years old
              </Text>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <FieldLabel>Height (cm)</FieldLabel>
            <GlassInput
              ref={heightRef}
              value={heightCm}
              onChangeText={setHeightCm}
              placeholder="e.g. 175"
              keyboardType="numeric"
              onSubmitEditing={() => weightRef.current?.focus()}
              returnKeyType="next"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Current Weight (kg)</FieldLabel>
              <GlassInput
                ref={weightRef}
                value={currentWeight}
                onChangeText={setCurrentWeight}
                placeholder="e.g. 70"
                keyboardType="numeric"
                onSubmitEditing={() => goalWeightRef.current?.focus()}
                returnKeyType="next"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Goal Weight (kg)</FieldLabel>
              <GlassInput
                ref={goalWeightRef}
                value={goalWeight}
                onChangeText={setGoalWeight}
                placeholder="e.g. 65"
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={{ marginBottom: 12 }}>
            <FieldLabel>Dietary Preference</FieldLabel>
            <GlassDropdown
              value={dietaryPrefs}
              options={DIETARY_OPTIONS}
              onSelect={setDietaryPrefs}
              title="Dietary Preference"
            />
            {dietaryPrefs === 'Other' && (
              <View style={{ marginTop: 8 }}>
                <GlassInput
                  value={customDietary}
                  onChangeText={setCustomDietary}
                  placeholder="Enter your dietary preference"
                />
              </View>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <FieldLabel>Any Allergies?</FieldLabel>
            <GlassDropdown
              value={allergyOption}
              options={ALLERGY_OPTIONS}
              onSelect={setAllergyOption}
              title="Allergies"
            />
            {allergyOption === 'Other' && (
              <View style={{ marginTop: 8 }}>
                <GlassInput
                  value={customAllergy}
                  onChangeText={setCustomAllergy}
                  placeholder="Type your allergy (e.g. Mustard)"
                />
              </View>
            )}
          </View>

          <View style={{ marginBottom: 18 }}>
            <FieldLabel>Ethnicity / Cuisine Pref.</FieldLabel>
            <GlassDropdown
              value={ethnicityOption}
              options={ETHNICITY_OPTIONS}
              onSelect={setEthnicityOption}
              title="Ethnicity"
            />
            {ethnicityOption === 'Other' && (
              <View style={{ marginTop: 8 }}>
                <GlassInput
                  value={customEthnicity}
                  onChangeText={setCustomEthnicity}
                  placeholder="Enter preferred cuisine (e.g. Thai)"
                />
              </View>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={saveProfile}
            disabled={loading}
            style={{
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
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
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
                {t('onboardingFinish')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
