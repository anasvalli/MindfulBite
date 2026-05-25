import { View, Text, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UtensilsCrossed, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { A6 } from '../../lib/theme';
import { Page, Glass, PageHeader, PillButton, A6Text } from '../../components/ui/A6';

export default function HistoryScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [meals, setMeals] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      async function loadHistory() {
        if (!user) return;
        const { data } = await supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30);
        if (data) setMeals(data);
      }
      loadHistory();
    }, [user])
  );

  async function deleteMeal(id: string) {
    await supabase.from('meals').delete().eq('id', id);
    setMeals((prev) => prev.filter((m) => m.id !== id));
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

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let lastDate = '';

  return (
    <Page>
      <PageHeader
        title="History"
        subtitle="Your past meal logs"
        right={<PillButton onPress={() => router.push('/paywall')}>Upgrade</PillButton>}
      />

      {meals.length === 0 ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', padding: 48, marginTop: 60 }}>
          <UtensilsCrossed color={A6.fg3} size={48} />
          <Text style={{ color: A6.fg2, marginTop: 16, fontSize: 16, fontWeight: '600' }}>
            {t('noMeals')}
          </Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          {meals.map((item) => {
            const dateLabel = formatDate(item.created_at);
            const showHeader = dateLabel !== lastDate;
            lastDate = dateLabel;
            return (
              <View key={item.id}>
                {showHeader && (
                  <Text
                    style={[
                      A6Text.label,
                      { paddingHorizontal: 4, paddingTop: 14, paddingBottom: 8 },
                    ]}>
                    {dateLabel}
                  </Text>
                )}
                <Glass style={{ marginBottom: 10 }}>
                  <View style={{ padding: 16 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                      }}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontSize: 15,
                            fontWeight: '600',
                            color: A6.fg1,
                            marginBottom: 3,
                          }}>
                          {item.items_json
                            ? item.items_json.map((i: any) => i.name).join(', ')
                            : 'Meal'}
                        </Text>
                        <Text style={{ fontSize: 11, color: A6.fg2, letterSpacing: 0.3 }}>
                          {dateLabel} · {formatTime(item.created_at)}
                        </Text>
                      </View>
                      <LinearGradient
                        colors={[A6.primary, A6.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 10,
                        }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '800',
                            color: A6.bgInk,
                            fontVariant: ['tabular-nums'],
                          }}>
                          {Math.round(item.total_calories)} kcal
                        </Text>
                      </LinearGradient>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                      {(
                        [
                          { l: 'P', v: item.macros_json?.protein || 0, c: A6.secondary },
                          { l: 'C', v: item.macros_json?.carbs || 0, c: A6.primaryLight },
                          { l: 'F', v: item.macros_json?.fat || 0, c: A6.warn },
                        ] as const
                      ).map((b) => (
                        <View
                          key={b.l}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 8,
                            backgroundColor: `${b.c}1A`,
                            borderWidth: 0.5,
                            borderColor: `${b.c}33`,
                          }}>
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '600',
                              color: b.c,
                              letterSpacing: 0.3,
                            }}>
                            {b.l}: {Math.round(b.v)}g
                          </Text>
                        </View>
                      ))}
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity
                        onPress={() => deleteMeal(item.id)}
                        style={{
                          padding: 7,
                          borderRadius: 9,
                          backgroundColor: `${A6.danger}1A`,
                          borderWidth: 0.5,
                          borderColor: `${A6.danger}33`,
                        }}>
                        <Trash2 color={A6.danger} size={14} strokeWidth={1.7} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Glass>
              </View>
            );
          })}
        </View>
      )}
    </Page>
  );
}
