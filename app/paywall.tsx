import { View, Text, TouchableOpacity, ScrollView, Animated, Dimensions, Platform, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles, Camera, Zap, Check, X, ShieldCheck, RotateCcw, ExternalLink } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useState, useRef, useEffect } from 'react';
import { useLanguage } from './context/LanguageContext';
import { usePurchases } from './context/PurchasesContext';
import { useCustomAlert } from '../components/CustomAlert';

const { width } = Dimensions.get('window');

type PlanTier = 'Basic' | 'Premium';

export default function PaywallScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { refreshSubscription, setTierManually } = usePurchases();
  const { alert } = useCustomAlert();
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('Premium');
  const [purchasing, setPurchasing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  // ── Stripe Payment Links ────────────────────────────────────────────────────
  const STRIPE_LINKS = {
    Premium:  'https://buy.stripe.com/test_fZu6oH3bxaRA1old7m6Vq01',
  };

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const handleSubscribe = async () => {
    if (selectedPlan === 'Basic') {
      router.back();
      return;
    }
    // Open Stripe payment link in browser
    const url = STRIPE_LINKS[selectedPlan];
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      // After returning from browser, show verify button
      alert(
        'Complete Payment',
        'After paying in your browser, tap "I\'ve Paid" below to activate your subscription.',
        [{ text: 'Got it!' }]
      );
    } else {
      alert('Error', 'Could not open payment page. Please try again.');
    }
  };

  // Called when user returns from Stripe and taps "I've Paid"
  const handleVerify = async () => {
    setVerifying(true);
    try {
      // Save to Supabase — you can later automate this via Stripe webhook
      await setTierManually(selectedPlan as 'Premium');
      await refreshSubscription();
      alert(
        'Subscription Activated! 🎉',
        `Welcome to MindfulBite ${selectedPlan}! Enjoy unlimited access.`,
        [{ text: 'Let\'s Go!', onPress: () => router.back() }]
      );
    } catch (e) {
      alert('Error', 'Could not activate subscription. Please contact support.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRestore = async () => {
    setVerifying(true);
    await refreshSubscription();
    setVerifying(false);
    alert('Checked!', 'Your subscription status has been refreshed.', [{ text: 'OK' }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#09090B' }}>
      <LinearGradient
        colors={['rgba(111, 175, 79, 0.15)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 400 }}
      />
      
      {/* Header Close Button */}
      <View style={{ paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 24, zIndex: 10 }}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' }}
        >
          <X color="#A1A1AA" size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{ backgroundColor: 'rgba(111, 175, 79, 0.1)', padding: 12, borderRadius: 24, marginBottom: 16 }}>
             <Sparkles color="#6FAF4F" size={32} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 }}>
            {t('unlockLimitlessHealth')}
          </Text>
          <Text style={{ fontSize: 15, color: '#A1A1AA', textAlign: 'center', paddingHorizontal: 20 }}>
            {t('paywallDesc')}
          </Text>
        </View>

        {/* --- PREMIUM PLAN ($5.99) --- */}
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => setSelectedPlan('Premium')}
          style={{ marginBottom: 16 }}
        >
          <Animated.View style={{
             position: 'absolute', top: -2, bottom: -2, left: -2, right: -2,
             borderRadius: 26,
             backgroundColor: '#6FAF4F',
             opacity: selectedPlan === 'Premium' ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) : 0
          }} />
          <BlurView intensity={20} tint="dark" style={{ 
            borderRadius: 24, padding: 24, overflow: 'hidden',
            borderWidth: 1, borderColor: selectedPlan === 'Premium' ? 'transparent' : 'rgba(255,255,255,0.08)',
            backgroundColor: selectedPlan === 'Premium' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.02)'
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{t('premiumPlan')}</Text>
                  <View style={{ backgroundColor: '#6FAF4F', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('ultimate')}</Text>
                  </View>
                </View>
                <Text style={{ color: '#A1A1AA', fontSize: 13 }}>{t('includesTrial')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                 <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900' }}>$5.99</Text>
                 <Text style={{ color: '#71717A', fontSize: 12 }}>{t('perMonth')}</Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Feature text="Unlimited Camera AI Logs" icon={<Camera size={14} color="#6FAF4F" />} active={true} />
              <Feature text="Unlimited AI Mood & Normal Chats" icon={<Zap size={14} color="#6FAF4F" />} active={true} />
              <Feature text="Priority Response Generation" icon={<Check size={14} color="#6FAF4F" />} active={true} />
            </View>
          </BlurView>
        </TouchableOpacity>




        {/* --- BASIC PLAN (FREE) --- */}
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => setSelectedPlan('Basic')}
          style={{ marginBottom: 16 }}
        >
          <BlurView intensity={20} tint="dark" style={{ 
            borderRadius: 24, padding: 24, overflow: 'hidden',
             borderWidth: 1, borderColor: selectedPlan === 'Basic' ? '#6FAF4F' : 'rgba(255,255,255,0.08)',
            backgroundColor: selectedPlan === 'Basic' ? 'rgba(111,175,79,0.05)' : 'rgba(255,255,255,0.02)'
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View>
                 <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 }}>{t('basicPlan')}</Text>
                 <Text style={{ color: '#71717A', fontSize: 13 }}>{t('essentialTracking')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                 <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900' }}>{t('free')}</Text>
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Feature text="3 Camera AI Logs / Day" icon={<Check size={14} color="#71717A" />} active={false} />
              <Feature text="8 Normal AI Chats / Day" icon={<Check size={14} color="#71717A" />} active={false} />
              <Feature text="Unlimited Custom Meal Logs" icon={<Check size={14} color="#6FAF4F" />} active={true} />
              <Feature text="Unlimited Contextual Mood Chats" icon={<Check size={14} color="#6FAF4F" />} active={true} />
            </View>
          </BlurView>
        </TouchableOpacity>

      </ScrollView>

      {/* Floating Checkout Button */}
      <View style={{ 
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 16,
        backgroundColor: '#09090B', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)'
      }}>
        {selectedPlan !== 'Basic' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <ShieldCheck size={14} color="#A1A1AA" style={{ marginRight: 6 }} />
            <Text style={{ color: '#A1A1AA', fontSize: 12 }}>{t('cancelAnytime')}</Text>
          </View>
        )}

        {/* Subscribe / Continue Free button */}
        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={verifying}
          style={{
            backgroundColor: '#6FAF4F',
            borderRadius: 100,
            paddingVertical: 18,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8
          }}
        >
          {selectedPlan !== 'Basic' && <ExternalLink color="#FFFFFF" size={18} style={{ marginRight: 8 }} />}
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900' }}>
            {selectedPlan === 'Basic' ? t('continueFree') : 'Pay with Card →'}
          </Text>
        </TouchableOpacity>

        {/* Restore / Refresh */}
        <TouchableOpacity
          onPress={handleRestore}
          style={{ alignItems: 'center', marginTop: 14 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <RotateCcw size={13} color="#71717A" />
            <Text style={{ color: '#71717A', fontSize: 13, marginLeft: 6 }}>Restore / Refresh Status</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Feature({ text, icon, active }: { text: string; icon: React.ReactNode; active: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: active ? 'rgba(111, 175, 79, 0.15)' : 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        {icon}
      </View>
      <Text style={{ color: active ? '#E4E4E7' : '#A1A1AA', fontSize: 14, marginLeft: 12, flex: 1, lineHeight: 20 }}>
        {text}
      </Text>
    </View>
  );
}
