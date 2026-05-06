import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useRouter } from 'expo-router';
import { UtensilsCrossed, Trash2 } from 'lucide-react-native';
import { useAppTheme } from '../context/ThemeContext';

export default function HistoryScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const [meals, setMeals] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      async function loadHistory() {
        if (!user) return;

        const { data, error } = await supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30);

        if (data) {
          setMeals(data);
        }
      }
      loadHistory();
    }, [user])
  );

  async function deleteMeal(id: string) {
    await supabase.from('meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 0, marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 4 }}>History</Text>
          <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B' }}>Your past meal logs.</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/paywall')} style={{ backgroundColor: '#6FAF4F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' }}>Upgrade</Text>
        </TouchableOpacity>
      </View>

      {meals.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <UtensilsCrossed color={isDark ? '#64748B' : '#94A3B8'} size={48} />
          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', marginTop: 16, fontSize: 16, fontWeight: '600' }}>
            {t('noMeals')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={meals}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              padding: 16,
              borderRadius: 18,
              marginBottom: 12, overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 10, elevation: 3
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 4 }}>
                    {item.items_json ? item.items_json.map((i: any) => i.name).join(', ') : 'Meal'}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>
                    {formatDate(item.created_at)} · {formatTime(item.created_at)}
                  </Text>
                </View>
                <View style={{
                  backgroundColor: '#6FAF4F',
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12
                }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {Math.round(item.total_calories)} kcal
                  </Text>
                </View>
              </View>
              {/* Macros Row + Delete */}
              <View style={{ flexDirection: 'row', marginTop: 10, gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                  <View style={{ backgroundColor: 'rgba(168, 223, 142, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: isDark ? '#A8DF8E' : '#0F172A', fontSize: 11, fontWeight: '600' }}>P: {Math.round(item.macros_json?.protein || 0)}g</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(168, 223, 142, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: isDark ? '#A8DF8E' : '#0F172A', fontSize: 11, fontWeight: '600' }}>C: {Math.round(item.macros_json?.carbs || 0)}g</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(168, 223, 142, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: isDark ? '#A8DF8E' : '#0F172A', fontSize: 11, fontWeight: '600' }}>F: {Math.round(item.macros_json?.fat || 0)}g</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => deleteMeal(item.id)}
                  style={{ backgroundColor: 'rgba(244, 63, 94, 0.08)', padding: 8, borderRadius: 10 }}
                >
                  <Trash2 color="#f43f5e" size={16} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </LinearGradient>
  );
}
