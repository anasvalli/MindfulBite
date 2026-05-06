import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Sparkles, Clock, BellRing, PlusCircle } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { buildEthnicityMealPlan } from '../../lib/ai';
import { useAuth } from '../context/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useCustomAlert } from '../../components/CustomAlert';
import { usePurchases } from '../context/PurchasesContext';
import UpgradeModal from '../../components/UpgradeModal';
import * as Notifications from 'expo-notifications';
import { useAppTheme } from '../context/ThemeContext';

function parseTime12h(timeStr: string): Date | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
}

export default function PlansScreen() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const { alert } = useCustomAlert();
  const { tier } = usePurchases();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';

  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        if (!user) return;
        const { data } = await supabase.from('users').select('wake_time, sleep_time').eq('id', user.id).single();
        setHasSchedule(!!(data?.wake_time && data?.sleep_time));

        const saved = await SecureStore.getItemAsync(`meal_plan_${user.id}`);
        if (saved) {
          try { setMeals(JSON.parse(saved)); } catch {}
        }
      }
      load();
    }, [user])
  );

  async function handleGeneratePlan() {
    if (!user) return;

    if (!hasSchedule) {
      router.push('/meal-schedule');
      return;
    }

    setLoading(true);
    const result = await buildEthnicityMealPlan(user.id, language);
    setLoading(false);

    if (result && Array.isArray(result) && result.length > 0) {
      setMeals(result);
      await SecureStore.setItemAsync(`meal_plan_${user.id}`, JSON.stringify(result));

      // Schedule a local notification for each meal in the plan
      try {
        const { status } = (await Notifications.requestPermissionsAsync()) as any;
        if (status === 'granted') {
          await Notifications.cancelAllScheduledNotificationsAsync();
          for (const meal of result) {
            const mealDate = parseTime12h(meal.time);
            if (mealDate) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `🍽️ Time for ${meal.name}!`,
                  body: `${meal.suggestion} — ${meal.kcal} kcal`,
                  sound: true,
                },
                trigger: { 
                  hour: mealDate.getHours(),
                  minute: mealDate.getMinutes(),
                  repeats: true 
                } as any,
              });
            }
          }
        }
      } catch (e) {
        console.log('Notification scheduling skipped:', e);
      }

      alert('Plan Generated', 'Your personalized meal plan is ready and meal reminders have been set!');
    } else {
      alert('Generation Error', 'Failed to generate your meal plan. Please try again.');
    }
  }

  const [loggingId, setLoggingId] = useState<string | null>(null);

  async function logMeal(meal: any, index: number) {
    if (!user) return;
    setLoggingId(`log-${index}`);
    
    // Estimate generic macros for a meal plan string
    // E.g. Protein: 30%, Carbs: 40%, Fat: 30% loosely
    const protein = Math.round((meal.kcal * 0.3) / 4);
    const carbs = Math.round((meal.kcal * 0.4) / 4);
    const fat = Math.round((meal.kcal * 0.3) / 9);

    const { error } = await supabase.from('meals').insert({
      user_id: user.id,
      items_json: [{ id: String(Date.now()), name: meal.suggestion, quantity: '1 portion', calories: meal.kcal, protein, carbs, fat }],
      total_calories: meal.kcal,
      macros_json: { protein, carbs, fat }
    });

    setLoggingId(null);

    if (error) {
       alert('Error', 'Failed to log meal.');
    } else {
       // Remove this meal from the plan so next meal countdown auto-advances
       const updatedMeals = meals.filter((_, i) => i !== index);
       setMeals(updatedMeals);
       await SecureStore.setItemAsync(`meal_plan_${user.id}`, JSON.stringify(updatedMeals));
       alert('Logged! 🎉', `${meal.name} has been added to your calorie log.`, [{ text: 'Awesome!', onPress: () => router.push('/') }]);
    }
  }

  return (
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, marginTop: 10 }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 4 }}>{t('weeklyPlan')}</Text>
            <Text style={{ fontSize: 15, color: isDark ? '#94A3B8' : '#64748B' }}>{t('weeklyDesc')}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/paywall')} style={{ backgroundColor: '#6FAF4F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' }}>Upgrade</Text>
          </TouchableOpacity>
        </View>

        {/* Generate Button */}
        <View style={{
          borderRadius: 20, marginBottom: 24, overflow: 'hidden',
          shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
          opacity: loading ? 0.7 : 1
        }}>
          <TouchableOpacity 
            onPress={handleGeneratePlan}
            disabled={loading}
            style={{
              padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#6FAF4F',
            }}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Sparkles color="#FFFFFF" size={20} />}
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 17, marginLeft: 10 }}>
              {loading ? 'Crafting Your Menu...' : (meals.length > 0 ? 'Regenerate Meal Plan' : 'Generate Meal Plan')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Custom Meal Button — open to all plans */}
        <TouchableOpacity
          onPress={() => router.push('/food-search')}
          style={{
            borderRadius: 20, marginBottom: 24, padding: 18,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: '#6FAF4F', borderStyle: 'dashed',
            backgroundColor: 'rgba(111, 175, 79, 0.05)',
          }}
        >
          <PlusCircle color="#6FAF4F" size={20} />
          <Text style={{ color: '#6FAF4F', fontWeight: '800', fontSize: 16, marginLeft: 10 }}>+ Custom Meal</Text>
        </TouchableOpacity>

        {/* Meal Cards */}
        {meals.length > 0 ? (
          meals.map((meal, index) => (
            <View key={index} style={{
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 16, borderRadius: 20, marginBottom: 12, overflow: 'hidden',
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 10, elevation: 3
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                <View style={{
                  width: 48, height: 48, borderRadius: 14,
                  backgroundColor: 'rgba(168, 223, 142, 0.15)',
                  alignItems: 'center', justifyContent: 'center', marginRight: 14,
                }}>
                  <Text style={{ fontSize: 24 }}>{meal.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A', marginRight: 8 }}>{t(meal.name.toLowerCase()) || meal.name}</Text>
                    {meal.time && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(47, 164, 215, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Clock color="#2FA4D7" size={10} />
                        <Text style={{ color: '#2FA4D7', fontWeight: '700', fontSize: 10, marginLeft: 4 }}>{meal.time}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, marginBottom: 2 }}>
                    {meal.suggestion}
                  </Text>
                  <Text style={{ color: '#6FAF4F', fontSize: 13, fontWeight: '800' }}>
                    {meal.kcal} kcal
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => logMeal(meal, index)}
                disabled={loggingId === `log-${index}`}
                style={{
                  backgroundColor: '#6FAF4F',
                  padding: 12, borderRadius: 14,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {loggingId === `log-${index}` ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <PlusCircle color="#FFFFFF" size={24} />
                )}
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={{ alignItems: 'center', padding: 40, backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 20, borderWidth: 2, borderColor: isDark ? '#334155' : '#F1F5F9', borderStyle: 'dashed' }}>
            <Sparkles color="#6FAF4F" size={48} />
            <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '700', marginTop: 16 }}>
              No active meal plan
            </Text>
            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
              Tap the button above to generate your personalized AI meal schedule!
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}
