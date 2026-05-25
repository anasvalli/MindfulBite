import { useState, useCallback } from 'react';
import { parseTime12h } from '../../lib/time';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Sparkles, Clock, PlusCircle } from 'lucide-react-native';
import { useLanguage } from '../context/LanguageContext';
import { buildEthnicityMealPlan } from '../../lib/ai';
import { useAuth } from '../context/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useCustomAlert } from '../../components/CustomAlert';
import * as Notifications from 'expo-notifications';
import { A6 } from '../../lib/theme';
import { Page, Glass, PageHeader, PillButton } from '../../components/ui/A6';

export default function PlansScreen() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const { alert } = useCustomAlert();

  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        if (!user) return;
        const { data } = await supabase
          .from('users')
          .select('wake_time, sleep_time')
          .eq('id', user.id)
          .single();
        setHasSchedule(!!(data?.wake_time && data?.sleep_time));

        const saved = await SecureStore.getItemAsync(`meal_plan_${user.id}`);
        if (saved) {
          try {
            setMeals(JSON.parse(saved));
          } catch {}
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
                  repeats: true,
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
    const protein = Math.round((meal.kcal * 0.3) / 4);
    const carbs = Math.round((meal.kcal * 0.4) / 4);
    const fat = Math.round((meal.kcal * 0.3) / 9);

    const { error } = await supabase.from('meals').insert({
      user_id: user.id,
      items_json: [
        {
          id: String(Date.now()),
          name: meal.suggestion,
          quantity: '1 portion',
          calories: meal.kcal,
          protein,
          carbs,
          fat,
        },
      ],
      total_calories: meal.kcal,
      macros_json: { protein, carbs, fat },
    });

    setLoggingId(null);

    if (error) {
      alert('Error', 'Failed to log meal.');
    } else {
      const updatedMeals = meals.filter((_, i) => i !== index);
      setMeals(updatedMeals);
      await SecureStore.setItemAsync(`meal_plan_${user.id}`, JSON.stringify(updatedMeals));
      alert('Logged! 🎉', `${meal.name} has been added to your calorie log.`, [
        { text: 'Awesome!', onPress: () => router.push('/') },
      ]);
    }
  }

  return (
    <Page>
      <PageHeader
        title={t('weeklyPlan')}
        subtitle={t('weeklyDesc')}
        right={<PillButton onPress={() => router.push('/paywall')}>Upgrade</PillButton>}
      />

      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        {/* Generate plan CTA */}
        <TouchableOpacity
          onPress={handleGeneratePlan}
          disabled={loading}
          activeOpacity={0.85}
          style={{
            marginBottom: 12,
            borderRadius: 22,
            overflow: 'hidden',
            ...Platform.select({
              ios: {
                shadowColor: A6.primary,
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.5,
                shadowRadius: 22,
              },
              android: { elevation: 8 },
            }),
            opacity: loading ? 0.7 : 1,
          }}>
          <LinearGradient
            colors={[A6.primary, A6.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 18,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}>
            {loading ? (
              <ActivityIndicator color={A6.bgInk} />
            ) : (
              <Sparkles color={A6.bgInk} size={20} strokeWidth={2.2} />
            )}
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: A6.bgInk,
                letterSpacing: -0.2,
              }}>
              {loading
                ? 'Crafting Your Menu…'
                : meals.length > 0
                ? 'Regenerate Meal Plan'
                : 'Generate Meal Plan'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Custom meal */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/food-search')}
          style={{
            padding: 16,
            borderRadius: 22,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: `${A6.primary}66`,
            backgroundColor: `${A6.primary}0a`,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 16,
          }}>
          <PlusCircle color={A6.primaryLight} size={18} strokeWidth={2} />
          <Text style={{ color: A6.primaryLight, fontWeight: '700', fontSize: 14 }}>
            + Custom Meal
          </Text>
        </TouchableOpacity>

        {meals.length > 0 ? (
          meals.map((meal, index) => (
            <Glass key={index} style={{ marginBottom: 10 }}>
              <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: `${A6.primary}1F`,
                    borderWidth: 0.5,
                    borderColor: `${A6.primary}55`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 22 }}>{meal.emoji}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 4,
                      gap: 8,
                    }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: '600', color: A6.fg1 }}>
                      {t(meal.name.toLowerCase()) || meal.name}
                    </Text>
                    {meal.time && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor: `${A6.primaryLight}1F`,
                          gap: 3,
                        }}>
                        <Clock color={A6.primaryLight} size={9} strokeWidth={2.5} />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: A6.primaryLight,
                            letterSpacing: 0.4,
                          }}>
                          {meal.time}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ color: A6.fg2, fontSize: 12, marginBottom: 3 }}>
                    {meal.suggestion}
                  </Text>
                  <Text
                    style={{
                      color: A6.primaryLight,
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 0.3,
                    }}>
                    {meal.kcal} kcal
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => logMeal(meal, index)}
                  disabled={loggingId === `log-${index}`}
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    ...Platform.select({
                      ios: {
                        shadowColor: A6.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.4,
                        shadowRadius: 14,
                      },
                      android: { elevation: 4 },
                    }),
                  }}>
                  <LinearGradient
                    colors={[A6.primary, A6.primaryLight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: 38,
                      height: 38,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {loggingId === `log-${index}` ? (
                      <ActivityIndicator color={A6.bgInk} size="small" />
                    ) : (
                      <PlusCircle color={A6.bgInk} size={20} strokeWidth={2.2} />
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Glass>
          ))
        ) : (
          <Glass
            style={{
              padding: 40,
              alignItems: 'center',
              borderStyle: 'dashed',
              borderColor: 'rgba(255,255,255,0.15)',
            }}>
            <Sparkles color={A6.primaryLight} size={48} strokeWidth={1.6} />
            <Text
              style={{
                color: A6.fg1,
                fontSize: 16,
                fontWeight: '700',
                marginTop: 16,
              }}>
              No active meal plan
            </Text>
            <Text
              style={{
                color: A6.fg2,
                fontSize: 14,
                marginTop: 6,
                textAlign: 'center',
              }}>
              Tap the button above to generate your personalized AI meal schedule!
            </Text>
          </Glass>
        )}
      </View>
    </Page>
  );
}
