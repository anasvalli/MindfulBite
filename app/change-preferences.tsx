import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, useColorScheme, Modal, FlatList } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronDown, UtensilsCrossed } from 'lucide-react-native';
import { buildEthnicityMealPlan } from '../lib/ai';
import { useLanguage } from './context/LanguageContext';
import * as SecureStore from 'expo-secure-store';
import { useCustomAlert } from '../components/CustomAlert';

const DIETARY_OPTIONS = ['None', 'Vegetarian', 'Vegan', 'Pescatarian', 'Keto', 'Paleo', 'Halal', 'Kosher', 'Other'];
const ALLERGY_OPTIONS = ['No Allergies', 'Peanuts', 'Tree Nuts', 'Milk/Dairy', 'Eggs', 'Wheat/Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Other'];
const ETHNICITY_OPTIONS = ['American', 'Pakistani', 'Indian', 'Mexican', 'Italian', 'Japanese', 'Chinese', 'Mediterranean', 'Middle Eastern', 'African', 'Caribbean', 'French', 'Brazilian', 'Other'];

function Dropdown({ label, value, options, onSelect, isDark }: { label: string; value: string; options: string[]; onSelect: (v: string) => void; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: '#64748B', marginBottom: 8, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen(true)} style={{
        backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: '#E2E8F0',
      }}>
        <Text style={{ color: value ? '#0F172A' : '#94A3B8', fontSize: 15 }}>{value || 'Select...'}</Text>
        <ChevronDown color="#94A3B8" size={18} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 32 }} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, maxHeight: 380, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { onSelect(item); setOpen(false); }}
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: item === value ? '#F1F5F9' : '#FFFFFF' }}
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

export default function ChangePreferencesScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { language } = useLanguage();
  const { alert } = useCustomAlert();

  const [dietary, setDietary] = useState('None');
  const [customDietary, setCustomDietary] = useState('');
  const [allergy, setAllergy] = useState('No Allergies');
  const [customAllergy, setCustomAllergy] = useState('');
  const [ethnicity, setEthnicity] = useState('American');
  const [customEthnicity, setCustomEthnicity] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) return;
      const { data } = await supabase.from('users').select('dietary_prefs').eq('id', user.id).single();
      if (data?.dietary_prefs) {
        const parts = data.dietary_prefs.split(' | ');
        parts.forEach((p: string) => {
          if (p.startsWith('Allergy:')) {
            const val = p.replace('Allergy:', '').trim();
            if (ALLERGY_OPTIONS.includes(val)) setAllergy(val);
            else { setAllergy('Other'); setCustomAllergy(val); }
          } else if (p.startsWith('Ethnicity:')) {
            const val = p.replace('Ethnicity:', '').trim();
            if (ETHNICITY_OPTIONS.includes(val)) setEthnicity(val);
            else { setEthnicity('Other'); setCustomEthnicity(val); }
          } else {
            if (DIETARY_OPTIONS.includes(p)) setDietary(p);
            else { setDietary('Other'); setCustomDietary(p); }
          }
        });
      }
    }
    load();
  }, [user]);

  async function handleSave() {
    const finalDietary = dietary === 'Other' ? customDietary : dietary;
    const finalAllergy = allergy === 'Other' ? customAllergy : (allergy === 'No Allergies' ? '' : allergy);
    const finalEthnicity = ethnicity === 'Other' ? customEthnicity : ethnicity;
    const fullPrefs = (finalDietary || 'None') + (finalAllergy ? ` | Allergy: ${finalAllergy}` : '') + (finalEthnicity ? ` | Ethnicity: ${finalEthnicity}` : '');

    setSaving(true);
    const { error } = await supabase.from('users').update({
      dietary_prefs: fullPrefs,
      updated_at: new Date().toISOString(),
    }).eq('id', user?.id);

    if (error) {
      setSaving(false);
      alert('Error', error.message);
      return;
    }

    // Instantly wipe old meal plan to trigger refresh next time it's opened
    await SecureStore.deleteItemAsync(`meal_plan_${user!.id}`);

    // Auto-regenerate meal plan in the background without blocking the UI
    buildEthnicityMealPlan(user!.id, language).then(async (result) => {
      if (result && Array.isArray(result) && result.length > 0) {
        await SecureStore.setItemAsync(`meal_plan_${user!.id}`, JSON.stringify(result));
      }
    });

    setSaving(false);
    alert('Updated!', 'Your dietary preferences have been saved and your new meal plan is generating in the background.', [
      { text: 'OK', onPress: () => router.back() }
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 24 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 50, marginBottom: 24 }}>
        <ArrowLeft color="#0F172A" size={24} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F172A', marginLeft: 12 }}>Dietary Preferences</Text>
      </TouchableOpacity>

      <View style={{ alignItems: 'center', marginBottom: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF7ED', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}>
          <UtensilsCrossed color="#F59E0B" size={32} />
        </View>
      </View>

      <Dropdown label="Dietary Preference" value={dietary} options={DIETARY_OPTIONS} onSelect={setDietary} isDark={isDark} />
      {dietary === 'Other' && (
        <TextInput style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16, marginTop: -8 }}
          placeholder="Specify your diet" placeholderTextColor="#94A3B8" value={customDietary} onChangeText={setCustomDietary} />
      )}

      <Dropdown label="Food Allergies" value={allergy} options={ALLERGY_OPTIONS} onSelect={setAllergy} isDark={isDark} />
      {allergy === 'Other' && (
        <TextInput style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16, marginTop: -8 }}
          placeholder="Specify your allergy" placeholderTextColor="#94A3B8" value={customAllergy} onChangeText={setCustomAllergy} />
      )}

      <Dropdown label="Cuisine / Ethnicity" value={ethnicity} options={ETHNICITY_OPTIONS} onSelect={setEthnicity} isDark={isDark} />
      {ethnicity === 'Other' && (
        <TextInput style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16, marginTop: -8 }}
          placeholder="Specify your cuisine" placeholderTextColor="#94A3B8" value={customEthnicity} onChangeText={setCustomEthnicity} />
      )}

      <TouchableOpacity onPress={handleSave} disabled={saving} style={{
        backgroundColor: '#6FAF4F', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 8,
        shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
      }}>
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Save & Regenerate Plan</Text>}
      </TouchableOpacity>
    </View>
  );
}
