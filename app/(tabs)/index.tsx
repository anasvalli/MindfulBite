import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { getSecondsLeft } from '../../lib/time';
import { useAuth } from '../context/AuthContext';
import { Camera, Drumstick, Wheat, Droplets, Clock } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import UpgradeModal from '../../components/UpgradeModal';
import { A6 } from '../../lib/theme';
import {
  Page,
  Glass,
  PageHeader,
  PillButton,
  SectionLabel,
  FAB,
  A6Text,
} from '../../components/ui/A6';
import { LinearGradient } from 'expo-linear-gradient';

const CAL_RING = 200;
const CAL_R = 88;
const CAL_C = 2 * Math.PI * CAL_R;
const MEAL_RING = 150;
const MEAL_R = 69;
const MEAL_C = 2 * Math.PI * MEAL_R;

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [calorieGoal, setCalorieGoal] = useState(2000);
  const [macros, setMacros] = useState({ protein: 0, carbs: 0, fat: 0 });
  const [recentMeals, setRecentMeals] = useState<any[]>([]);
  const [savedPlan, setSavedPlan] = useState<any[]>([]);
  const [username, setUsername] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const clockRef = useRef<any>(null);

  const animatedCalories = useRef(new Animated.Value(0)).current;
  const [displayCalories, setDisplayCalories] = useState(0);

  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        if (!user) return;
        const { data: userData } = await supabase
          .from('users')
          .select('daily_calorie_goal, username')
          .eq('id', user.id)
          .single();
        if (userData?.daily_calorie_goal) setCalorieGoal(userData.daily_calorie_goal);
        if (userData?.username) setUsername(userData.username);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: mealsData } = await supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', startOfDay.toISOString())
          .order('created_at', { ascending: false });

        if (mealsData) {
          let totalCal = 0;
          let p = 0, c = 0, f = 0;
          mealsData.forEach((m: any) => {
            totalCal += Number(m.total_calories || 0);
            if (m.macros_json) {
              p += Number(m.macros_json.protein || 0);
              c += Number(m.macros_json.carbs || 0);
              f += Number(m.macros_json.fat || 0);
            }
          });
          setCaloriesConsumed(Math.round(totalCal));
          setMacros({ protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f) });
          setRecentMeals(mealsData);
        } else {
          setRecentMeals([]);
          setCaloriesConsumed(0);
          setMacros({ protein: 0, carbs: 0, fat: 0 });
        }

        try {
          const plan = await SecureStore.getItemAsync(`meal_plan_${user.id}`);
          setSavedPlan(plan ? JSON.parse(plan) : []);
        } catch {
          setSavedPlan([]);
        }
      }
      loadData();
    }, [user])
  );

  useEffect(() => {
    animatedCalories.setValue(0);
    Animated.timing(animatedCalories, {
      toValue: caloriesConsumed,
      duration: 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    const listener = animatedCalories.addListener(({ value }) => {
      setDisplayCalories(Math.round(value));
    });
    return () => animatedCalories.removeListener(listener);
  }, [caloriesConsumed]);

  const nextMeal = savedPlan.length > 0 ? getSecondsLeft(savedPlan) : null;

  useEffect(() => {
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockRef.current);
  }, []);

  const calRatio = Math.min(displayCalories / Math.max(calorieGoal, 1), 1);
  const calOffset = CAL_C * (1 - calRatio);
  const remaining = Math.max(calorieGoal - caloriesConsumed, 0);

  const mealRatio =
    nextMeal && nextMeal.totalSeconds > 0
      ? Math.min(nextMeal.secondsLeft / nextMeal.totalSeconds, 1)
      : 0;
  const mealOffset = MEAL_C * (1 - mealRatio);

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 17) return t('goodAfternoon');
    return t('goodEvening');
  };

  const liveTime = currentTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dayLabel = currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Page variant="dense">
      <PageHeader
        eyebrow={dayLabel}
        title={
          <View>
            <Text style={[A6Text.title]}>{greeting()},</Text>
            <Text
              style={[
                A6Text.title,
                { fontWeight: '600', color: A6.primaryLight, marginTop: 2 },
              ]}>
              {username || user?.email?.split('@')[0] || 'Friend'}
            </Text>
          </View>
        }
        subtitle={
          <Text style={[A6Text.subtitle, { ...A6Text.numTabular, letterSpacing: 0.5 }]}>
            🕐 {liveTime}
          </Text>
        }
        right={<PillButton onPress={() => router.push('/paywall')}>Upgrade</PillButton>}
      />

      {/* Dual ring glass card */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Glass style={{ padding: 24 }}>
          <Text style={[A6Text.label, { textAlign: 'center', marginBottom: 14 }]}>
            {t('dailyProgress')}
          </Text>

          {/* Calories ring */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: CAL_RING, height: CAL_RING, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={CAL_RING} height={CAL_RING} style={{ position: 'absolute' }}>
                <Defs>
                  <SvgGradient id="calG" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor={A6.primary} />
                    <Stop offset="60%" stopColor={A6.primaryLight} />
                    <Stop offset="100%" stopColor={A6.secondary} />
                  </SvgGradient>
                </Defs>
                <Circle
                  cx={CAL_RING / 2}
                  cy={CAL_RING / 2}
                  r={CAL_R}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={12}
                  fill="none"
                />
                <Circle
                  cx={CAL_RING / 2}
                  cy={CAL_RING / 2}
                  r={CAL_R}
                  stroke="url(#calG)"
                  strokeWidth={12}
                  fill="none"
                  strokeDasharray={`${CAL_C}`}
                  strokeDashoffset={calOffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${CAL_RING / 2}, ${CAL_RING / 2}`}
                />
              </Svg>
              <View style={{ alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 40,
                    fontWeight: '300',
                    letterSpacing: -1.5,
                    color: A6.fg1,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {displayCalories}
                </Text>
                <Text style={{ fontSize: 11, color: A6.fg2, marginTop: 4 }}>
                  of {calorieGoal} kcal
                </Text>
              </View>
            </View>
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: `${A6.primary}1F`,
                borderWidth: 0.5,
                borderColor: `${A6.primary}55`,
                marginTop: 12,
              }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: A6.primaryLight,
                  letterSpacing: 0.4,
                }}>
                {remaining > 0 ? `${remaining} remaining` : '🎉 Goal reached!'}
              </Text>
            </View>
          </View>

          <View
            style={{
              width: '80%',
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.06)',
              alignSelf: 'center',
              marginVertical: 20,
            }}
          />

          {/* Next meal ring */}
          <Text style={[A6Text.label, { textAlign: 'center', marginBottom: 12 }]}>Next Meal</Text>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: MEAL_RING, height: MEAL_RING, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={MEAL_RING} height={MEAL_RING} style={{ position: 'absolute' }}>
                <Circle
                  cx={MEAL_RING / 2}
                  cy={MEAL_RING / 2}
                  r={MEAL_R}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={10}
                  fill="none"
                />
                <Circle
                  cx={MEAL_RING / 2}
                  cy={MEAL_RING / 2}
                  r={MEAL_R}
                  stroke={A6.primaryLight}
                  strokeWidth={10}
                  fill="none"
                  strokeDasharray={`${MEAL_C}`}
                  strokeDashoffset={mealOffset}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${MEAL_RING / 2}, ${MEAL_RING / 2}`}
                />
              </Svg>
              <View style={{ alignItems: 'center' }}>
                {nextMeal ? (
                  <>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: '500',
                        letterSpacing: -0.5,
                        color: A6.fg1,
                        fontVariant: ['tabular-nums'],
                      }}>
                      {formatCountdown(nextMeal.secondsLeft)}
                    </Text>
                    <Text style={{ fontSize: 10, color: A6.fg2, marginTop: 2 }}>
                      till {nextMeal.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Clock color={A6.fg3} size={24} />
                    <Text style={{ fontSize: 11, color: A6.fg2, marginTop: 4 }}>No plan set</Text>
                  </>
                )}
              </View>
            </View>
            {nextMeal && (
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: `${A6.primaryLight}1A`,
                  marginTop: 10,
                }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: A6.primaryLight }}>
                  {nextMeal.time}
                </Text>
              </View>
            )}
          </View>

          <View
            style={{
              width: '80%',
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.06)',
              alignSelf: 'center',
              marginVertical: 20,
            }}
          />

          {/* Macros row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {(
              [
                { l: 'Protein', v: macros.protein, c: A6.secondary, Icon: Drumstick },
                { l: 'Carbs', v: macros.carbs, c: A6.primaryLight, Icon: Wheat },
                { l: 'Fat', v: macros.fat, c: A6.warn, Icon: Droplets },
              ] as const
            ).map((m) => (
              <View key={m.l} style={{ flex: 1, alignItems: 'center' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: `${m.c}22`,
                    borderWidth: 0.5,
                    borderColor: `${m.c}55`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                  }}>
                  <m.Icon color={m.c} size={18} strokeWidth={1.7} />
                </View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    letterSpacing: -0.5,
                    color: A6.fg1,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {m.v}g
                </Text>
                <Text style={{ fontSize: 11, color: A6.fg2, marginTop: 2 }}>{m.l}</Text>
              </View>
            ))}
          </View>
        </Glass>
      </View>

      {/* Today's meals */}
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <SectionLabel
          right={
            <Text style={{ fontSize: 12, color: A6.fg2 }}>
              {recentMeals.length} logged
            </Text>
          }>
          Today's meals
        </SectionLabel>

        {recentMeals.length === 0 ? (
          <Glass
            style={{
              padding: 28,
              alignItems: 'center',
              borderStyle: 'dashed',
              borderColor: 'rgba(255,255,255,0.15)',
            }}>
            <Camera color={A6.fg3} size={36} />
            <Text style={{ color: A6.fg1, marginTop: 12, fontSize: 15, fontWeight: '600' }}>
              No meals logged yet
            </Text>
            <Text style={{ color: A6.fg2, marginTop: 4, fontSize: 13 }}>
              Tap the camera below to log one!
            </Text>
          </Glass>
        ) : (
          <Glass>
            {recentMeals.map((meal, idx) => (
              <View
                key={meal.id || idx}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderBottomWidth: idx < recentMeals.length - 1 ? 0.5 : 0,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: A6.fgFaint,
                    borderWidth: 0.5,
                    borderColor: 'rgba(255,255,255,0.08)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 18 }}>🍽️</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: '500',
                      color: A6.fg1,
                      marginBottom: 2,
                    }}>
                    {meal.items_json
                      ? meal.items_json.map((i: any) => i.name).join(', ')
                      : 'Meal'}
                  </Text>
                  <Text style={{ fontSize: 11, color: A6.fg2, letterSpacing: 0.3 }}>
                    {formatTime(meal.created_at)}  ·  P {Math.round(meal.macros_json?.protein || 0)}g  ·  C {Math.round(meal.macros_json?.carbs || 0)}g  ·  F {Math.round(meal.macros_json?.fat || 0)}g
                  </Text>
                </View>
                <LinearGradient
                  colors={[A6.primary, A6.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    paddingHorizontal: 10,
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
                    {Math.round(meal.total_calories)}
                  </Text>
                </LinearGradient>
              </View>
            ))}
          </Glass>
        )}
      </View>

      <FAB onPress={() => router.push('/camera')} bottom={130} />

      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="AI Camera Scan"
        requiredPlan="Premium"
        description="Snap a photo of any meal and our AI instantly detects the calories and macros. Available exclusively on the Premium plan."
      />
    </Page>
  );
}
