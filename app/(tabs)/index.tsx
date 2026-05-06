import { View, Text, TouchableOpacity, ScrollView, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '../context/AuthContext';
import { Camera, Flame, Drumstick, Wheat, Droplets, Clock } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { supabase } from '../../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import Svg, { Circle } from 'react-native-svg';
import { usePurchases } from '../context/PurchasesContext';
import UpgradeModal from '../../components/UpgradeModal';
import { useAppTheme } from '../context/ThemeContext';

const CIRCLE_SIZE = 150;
const STROKE_WIDTH = 12;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

function getSecondsLeft(meals: any[]): { name: string; time: string; secondsLeft: number; totalSeconds: number } | null {
  if (!meals || meals.length === 0) return null;
  const now = new Date();
  
  const sorted = meals
    .map(m => ({ ...m, parsed: parseTime12h(m.time) }))
    .filter(m => m.parsed !== null)
    .sort((a, b) => a.parsed!.getTime() - b.parsed!.getTime());

  if (sorted.length === 0) return null;

  for (let i = 0; i < sorted.length; i++) {
    const mealTime = sorted[i].parsed!;
    if (mealTime > now) {
      const secondsLeft = Math.max(0, Math.round((mealTime.getTime() - now.getTime()) / 1000));
      const prevTime = i > 0 ? sorted[i - 1].parsed! : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const totalSeconds = Math.round((mealTime.getTime() - prevTime.getTime()) / 1000);
      return { name: sorted[i].name, time: sorted[i].time, secondsLeft, totalSeconds };
    }
  }
  return null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const { tier } = usePurchases();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleCameraPress = () => {
    router.push('/camera');
  };

  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [calorieGoal, setCalorieGoal] = useState(2000);
  const [macros, setMacros] = useState({ protein: 0, carbs: 0, fat: 0 });
  const [recentMeals, setRecentMeals] = useState<any[]>([]);
  const [nextMealData, setNextMealData] = useState<{ name: string; time: string; secondsLeft: number; totalSeconds: number } | null>(null);
  const [savedPlan, setSavedPlan] = useState<any[]>([]);
  const [username, setUsername] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const intervalRef = useRef<any>(null);
  const clockRef = useRef<any>(null);

  // Animated calorie counter
  const animatedCalories = useRef(new Animated.Value(0)).current;
  const [displayCalories, setDisplayCalories] = useState(0);
  const ringProgress = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      async function loadData() {
        if (!user) return;
        
        const { data: userData } = await supabase
          .from('users')
          .select('daily_calorie_goal, username')
          .eq('id', user.id)
          .single();
          
        if (userData?.daily_calorie_goal) {
          setCalorieGoal(userData.daily_calorie_goal);
        }
        if (userData?.username) {
          setUsername(userData.username);
        }

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
          setMacros({ 
            protein: Math.round(p), 
            carbs: Math.round(c), 
            fat: Math.round(f) 
          });
          setRecentMeals(mealsData);
        } else {
          setRecentMeals([]);
          setCaloriesConsumed(0);
          setMacros({ protein: 0, carbs: 0, fat: 0 });
        }

        // Load saved meal plan for countdown (using SecureStore)
        try {
          const plan = await SecureStore.getItemAsync(`meal_plan_${user.id}`);
          if (plan) {
            const parsed = JSON.parse(plan);
            setSavedPlan(parsed);
          } else {
            setSavedPlan([]);
          }
        } catch {
          setSavedPlan([]);
        }
      }
      
      loadData();
    }, [user])
  );

  // Animate calorie count with smooth easing
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

  // Derive live next meal countdown from currentTime (updates every second via clock)
  const nextMeal = savedPlan.length > 0 ? getSecondsLeft(savedPlan) : null;

  // Live clock — updates every second
  useEffect(() => {
    clockRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockRef.current);
  }, []);

  // Remove the old 60-second interval — live countdown is now driven by the 1s clock above

  const calProgress = calorieGoal > 0 ? Math.min((caloriesConsumed / calorieGoal) * 100, 100) : 0;
  const remaining = Math.max(calorieGoal - caloriesConsumed, 0);

  // Next meal ring progress (defills as time approaches — 100% full = lots of time, 0% = now)
  const mealProgress = nextMeal && nextMeal.totalSeconds > 0
    ? Math.min((nextMeal.secondsLeft / nextMeal.totalSeconds) * 100, 100)
    : 0;
  const mealOffset = CIRCUMFERENCE - (mealProgress / 100) * CIRCUMFERENCE;

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 17) return t('goodAfternoon');
    return t('goodEvening');
  };

  const liveTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <View>
            <Text style={{ fontSize: 16, color: '#2FA4D7', fontWeight: '600', marginBottom: 4 }}>
              {greeting()} 🌟
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              {username || user?.email?.split('@')[0] || 'Friend'}
            </Text>
            <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', marginTop: 4, fontVariant: ['tabular-nums'], letterSpacing: 0.5 }}>
              🕐 {liveTime}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/paywall')} style={{ backgroundColor: '#6FAF4F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' }}>Upgrade</Text>
          </TouchableOpacity>
        </View>

        {/* Dual Ring Card */}
        <View style={{
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderRadius: 28, padding: 24, alignItems: 'center', overflow: 'hidden',
          shadowColor: '#000000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 14, elevation: 3,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
            {t('dailyProgress')}
          </Text>
          
          {/* Calories Ring */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ position: 'relative', width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={200} height={200} style={{ position: 'absolute' }}>
                <Circle cx={100} cy={100} r={88}
                  stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={14} fill="none" />
                <Circle cx={100} cy={100} r={88}
                  stroke={(displayCalories / calorieGoal) >= 1 ? '#f43f5e' : '#6FAF4F'} strokeWidth={14} fill="none"
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={2 * Math.PI * 88 - (Math.min(displayCalories / Math.max(calorieGoal, 1), 1)) * 2 * Math.PI * 88}
                  strokeLinecap="round" rotation="-90" origin="100, 100" />
              </Svg>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 36, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  {displayCalories}
                </Text>
                <Text style={{ fontSize: 13, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                  of {calorieGoal} kcal
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: 'rgba(168, 223, 142, 0.15)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, marginTop: 10 }}>
              <Text style={{ color: '#6FAF4F', fontWeight: '700', fontSize: 13 }}>
                {remaining > 0 ? `${remaining} remaining` : '🎉 Goal Reached!'}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ width: '80%', height: 1, backgroundColor: isDark ? '#334155' : '#F1F5F9', marginVertical: 20 }} />

          {/* Next Meal Countdown Ring */}
          <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
            NEXT MEAL
          </Text>
          <View style={{ alignItems: 'center' }}>
            <View style={{ position: 'relative', width: CIRCLE_SIZE, height: CIRCLE_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={{ position: 'absolute' }}>
                <Circle cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={RADIUS}
                  stroke={isDark ? '#334155' : '#F1F5F9'} strokeWidth={STROKE_WIDTH} fill="none" />
                <Circle cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={RADIUS}
                  stroke="#2FA4D7" strokeWidth={STROKE_WIDTH} fill="none"
                  strokeDasharray={`${CIRCUMFERENCE}`} strokeDashoffset={mealOffset}
                  strokeLinecap="round" rotation="-90" origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`} />
              </Svg>
              <View style={{ alignItems: 'center' }}>
                {nextMeal ? (
                  <>
                    <Text style={{ fontSize: 24, fontWeight: '900', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      {formatCountdown(nextMeal.secondsLeft)}
                    </Text>
                    <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                      till {nextMeal.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Clock color={isDark ? '#64748B' : '#94A3B8'} size={24} />
                    <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', marginTop: 4, textAlign: 'center' }}>
                      No plan set
                    </Text>
                  </>
                )}
              </View>
            </View>
            {nextMeal && (
              <View style={{ backgroundColor: 'rgba(47, 164, 215, 0.1)', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, marginTop: 8 }}>
                <Text style={{ color: '#2FA4D7', fontWeight: '700', fontSize: 13 }}>
                  {nextMeal.time}
                </Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={{ width: '80%', height: 1, backgroundColor: isDark ? '#334155' : '#F1F5F9', marginVertical: 24 }} />

          {/* Macros Row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 4 }}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <View style={{ 
                backgroundColor: 'rgba(168, 223, 142, 0.2)', 
                width: 40, height: 40, borderRadius: 12, 
                alignItems: 'center', justifyContent: 'center', marginBottom: 8
              }}>
                <Drumstick color="#65B741" size={18} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>{macros.protein}g</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>Protein</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <View style={{ 
                backgroundColor: 'rgba(47, 164, 215, 0.15)', 
                width: 40, height: 40, borderRadius: 12, 
                alignItems: 'center', justifyContent: 'center', marginBottom: 8
              }}>
                <Wheat color="#2FA4D7" size={18} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>{macros.carbs}g</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>Carbs</Text>
            </View>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <View style={{ 
                backgroundColor: 'rgba(251, 191, 36, 0.2)', 
                width: 40, height: 40, borderRadius: 12, 
                alignItems: 'center', justifyContent: 'center', marginBottom: 8
              }}>
                <Droplets color="#FBBF24" size={18} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A' }}>{macros.fat}g</Text>
              <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', marginTop: 2 }}>Fat</Text>
            </View>
          </View>
        </View>

        {/* Today's Meals */}
        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 16 }}>
            Today's Meals
          </Text>
          {recentMeals.length === 0 ? (
            <View style={{ 
              padding: 24, borderRadius: 20, alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderWidth: 2, borderColor: isDark ? '#334155' : '#F1F5F9', borderStyle: 'dashed',
              shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 8, elevation: 1
            }}>
              <Camera color={isDark ? '#64748B' : '#94A3B8'} size={36} />
              <Text style={{ color: isDark ? '#94A3B8' : '#64748B', marginTop: 12, fontSize: 15, fontWeight: '600' }}>
                No meals logged yet
              </Text>
              <Text style={{ color: isDark ? '#64748B' : '#94A3B8', marginTop: 4, fontSize: 13 }}>
                Tap the + button below to log!
              </Text>
            </View>
          ) : (
            recentMeals.map((meal, idx) => (
              <View key={meal.id || idx} style={{
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 16, borderRadius: 18, marginBottom: 12,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 10, elevation: 3
              }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 4 }}>
                    {meal.items_json ? meal.items_json.map((i: any) => i.name).join(', ') : 'Meal'}
                  </Text>
                  <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>
                    {formatTime(meal.created_at)} · P: {Math.round(meal.macros_json?.protein || 0)}g · C: {Math.round(meal.macros_json?.carbs || 0)}g · F: {Math.round(meal.macros_json?.fat || 0)}g
                  </Text>
                </View>
                <View style={{ 
                  backgroundColor: '#6FAF4F', 
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
                }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {Math.round(meal.total_calories)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Floating Camera Button — visible to all, gated to Premium */}
      <View style={{
        position: 'absolute', bottom: 130, right: 24,
        shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6
      }}>
        <TouchableOpacity
          style={{
            width: 64, height: 64, borderRadius: 32,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#6FAF4F',
          }}
          onPress={handleCameraPress}
        >
          <Camera color="#FFFFFF" size={28} />
        </TouchableOpacity>
      </View>

      {/* Upgrade Modal for non-Premium users */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="AI Camera Scan"
        requiredPlan="Premium"
        description="Snap a photo of any meal and our AI instantly detects the calories and macros. Available exclusively on the Premium plan."
      />
    </LinearGradient>
  );
}
