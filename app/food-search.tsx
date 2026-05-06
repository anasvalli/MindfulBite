import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Plus, ArrowLeft, Drumstick, Wheat, Droplets } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from './context/AuthContext';
import { supabase } from '../lib/supabase';
import { useCustomAlert } from '../components/CustomAlert';
import { useAppTheme } from './context/ThemeContext';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

interface FoodItem {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  emoji: string;
  serving: string;
}

async function searchFoods(query: string, userId?: string): Promise<FoodItem[]> {
  if (!GEMINI_API_KEY) return [];

  let countryContext = '';
  let userCountry = 'the world';
  if (userId) {
    const { data: userProfile } = await supabase.from('users').select('country').eq('id', userId).single();
    if (userProfile?.country) {
      userCountry = userProfile.country;
      countryContext = `The user is located in: ${userCountry}.`;
    }
  }

  const isDefaultList = !query.trim();

  const prompt = isDefaultList 
    ? `You are a comprehensive global food nutrition database.
${countryContext}
Return exactly 50 very common and popular food items from ${userCountry}.
Include a diverse mix of: home-cooked meals, restaurant dishes, fast food menus, and popular snacks.
The list MUST be sorted in STRICT ALPHABETICAL ORDER from A to Z.`
    : `You are a comprehensive global food nutrition database.
The user searched for: "${query}"
${countryContext} Prioritize local regional dishes and fast food menus specific to ${userCountry}.
Return EXACTLY 8 food results that match or are related to this search query.
Include a wide variety: home-cooked dishes, fast food items, snacks, beverages, restaurant items.`;

  const finalPrompt = `${prompt}
You MUST return ONLY a raw JSON array with no markdown, no explanation. Format:
[
  { "name": "Apple", "kcal": 52, "protein": 0, "carbs": 14, "fat": 0, "emoji": "🍎", "serving": "1 medium" }
]

Rules:
- Values must be realistic and accurate.
- Serving size must be clearly labeled.
- Emoji must match the food.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: 'You are a global food nutrition database. Always respond with valid JSON only.' }] },
          contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
          generationConfig: { response_mime_type: 'application/json' },
        }),
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) raw = raw.substring(start, end + 1);

    return JSON.parse(raw) as FoodItem[];
  } catch (e) {
    console.error('Food search error:', e);
    return [];
  }
}

export default function FoodSearchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { alert } = useCustomAlert();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const foods = await searchFoods(text, user?.id);
      setResults(foods);
      setSearching(false);
    }, text.trim() ? 700 : 0); // instantly load default if cleared
  }, [user]);

  // Load default list on mount
  useEffect(() => {
    handleSearch('');
  }, [handleSearch]);

  async function logFood(item: FoodItem) {
    if (!user) return;
    setLoggingId(item.name);

    const { error } = await supabase.from('meals').insert({
      user_id: user.id,
      items_json: [{ id: String(Date.now()), name: item.name, quantity: item.serving, calories: item.kcal, protein: item.protein, carbs: item.carbs, fat: item.fat }],
      total_calories: item.kcal,
      macros_json: { protein: item.protein, carbs: item.carbs, fat: item.fat },
    });

    setLoggingId(null);

    if (error) {
      alert('Error', 'Failed to log this meal.');
    } else {
      alert('Added! 🎉', `${item.name} has been added to your log.`, [
        { text: 'View Log', onPress: () => router.push('/(tabs)/history') },
        { text: 'Keep Adding', style: 'cancel' },
      ]);
    }
  }

  return (
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ paddingTop: Platform.OS === 'ios' ? 60 : 48, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderBottomWidth: 1, borderBottomColor: isDark ? '#334155' : '#F1F5F9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
              <ArrowLeft color={isDark ? '#F8FAFC' : '#0F172A'} size={24} />
            </TouchableOpacity>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>Custom Meal</Text>
              <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B' }}>Search any food from around the world</Text>
            </View>
          </View>

          {/* Search bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderRadius: 16, borderWidth: 1.5, borderColor: query ? '#6FAF4F' : (isDark ? '#334155' : '#E2E8F0'), paddingHorizontal: 14 }}>
            <Search color={query ? '#6FAF4F' : '#94A3B8'} size={18} />
            <TextInput
              style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 16, color: isDark ? '#F8FAFC' : '#0F172A' }}
              placeholder="Search scrambled eggs, Big Mac, Biryani..."
              placeholderTextColor="#94A3B8"
              value={query}
              onChangeText={handleSearch}
              autoFocus
              returnKeyType="search"
            />
            {searching && <ActivityIndicator color="#6FAF4F" size="small" />}
          </View>
        </View>

        {/* Results */}
        {results.length === 0 && !searching ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🔍</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', textAlign: 'center' }}>No results found</Text>
            <Text style={{ fontSize: 13, color: isDark ? '#64748B' : '#94A3B8', textAlign: 'center', marginTop: 4 }}>Try a different search term</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, marginBottom: 12, padding: 16,
                flexDirection: 'row', alignItems: 'center',
                shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: isDark ? 0.2 : 0.06, shadowRadius: 8, elevation: 3
              }}>
                {/* Emoji */}
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(111,175,79,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 2 }} numberOfLines={2}>{item.name}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>{item.serving}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <View style={{ backgroundColor: '#FEF3F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>🔥 {item.kcal} kcal</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(111,175,79,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ color: '#6FAF4F', fontSize: 11, fontWeight: '700' }}>P {item.protein}g</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(47,164,215,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ color: '#2FA4D7', fontSize: 11, fontWeight: '700' }}>C {item.carbs}g</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(251,191,36,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '700' }}>F {item.fat}g</Text>
                    </View>
                  </View>
                </View>

                {/* Add Button */}
                <TouchableOpacity
                  onPress={() => logFood(item)}
                  disabled={loggingId === item.name}
                  style={{
                    backgroundColor: '#6FAF4F', width: 40, height: 40,
                    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                    shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4
                  }}
                >
                  {loggingId === item.name
                    ? <ActivityIndicator color="#FFFFFF" size="small" />
                    : <Plus color="#FFFFFF" size={22} />
                  }
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
