import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
  Linking,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Sparkles,
  Camera,
  Zap,
  Check,
  X,
  ShieldCheck,
  RotateCcw,
  ExternalLink,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, useRef, useEffect } from 'react';
import { useLanguage } from './context/LanguageContext';
import { usePurchases } from './context/PurchasesContext';
import { useCustomAlert } from '../components/CustomAlert';
import { A6 } from '../lib/theme';
import { AuroraBackdrop, Glass } from '../components/ui/A6';

type PlanTier = 'Basic' | 'Premium';

const STRIPE_LINKS = {
  Premium: 'https://buy.stripe.com/test_fZu6oH3bxaRA1old7m6Vq01',
};

function Feature({ text, on }: { text: string; on: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: on ? `${A6.primary}1F` : A6.fgFaint,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Check
          color={on ? A6.primaryLight : A6.fg2}
          size={13}
          strokeWidth={2}
        />
      </View>
      <Text style={{ fontSize: 13, color: on ? A6.fg1 : A6.fg2, flex: 1 }}>{text}</Text>
    </View>
  );
}

export default function PaywallScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { refreshSubscription, setTierManually } = usePurchases();
  const { alert } = useCustomAlert();
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('Premium');
  const [verifying, setVerifying] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleSubscribe = async () => {
    if (selectedPlan === 'Basic') {
      router.back();
      return;
    }
    const url = STRIPE_LINKS[selectedPlan];
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      alert(
        'Complete Payment',
        'After paying in your browser, tap "I\'ve Paid" below to activate your subscription.',
        [{ text: 'Got it!' }]
      );
    } else {
      alert('Error', 'Could not open payment page. Please try again.');
    }
  };

  const handleRestore = async () => {
    setVerifying(true);
    await refreshSubscription();
    setVerifying(false);
    alert('Checked!', 'Your subscription status has been refreshed.', [{ text: 'OK' }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: A6.bgInk }}>
      <AuroraBackdrop variant="default" />

      {/* Close button */}
      <View
        style={{
          position: 'absolute',
          top: Platform.OS === 'ios' ? 56 : 36,
          left: 20,
          zIndex: 30,
        }}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: A6.fgFaint,
            borderWidth: 0.5,
            borderColor: 'rgba(255,255,255,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <X color={A6.fg2} size={18} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 100, paddingBottom: 200 }}
        showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, paddingBottom: 28 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 22,
              backgroundColor: `${A6.primary}1F`,
              borderWidth: 0.5,
              borderColor: `${A6.primary}55`,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
            <Sparkles color={A6.primaryLight} size={30} fill={A6.primaryLight} />
          </View>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '600',
              letterSpacing: -0.8,
              color: A6.primaryLight,
              textAlign: 'center',
              marginBottom: 8,
            }}>
            {t('unlockLimitlessHealth')}
          </Text>
          <Text style={{ fontSize: 14, color: A6.fg2, lineHeight: 21, textAlign: 'center' }}>
            {t('paywallDesc')}
          </Text>
        </View>

        {/* Premium card */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ marginBottom: 14, position: 'relative' }}>
            {selectedPlan === 'Premium' && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -3,
                  bottom: -3,
                  left: -3,
                  right: -3,
                  borderRadius: 30,
                  opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] }),
                }}>
                <LinearGradient
                  colors={[A6.primary, A6.primaryLight, A6.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ ...StyleSheet.absoluteFillObject, borderRadius: 30 }}
                />
              </Animated.View>
            )}
            <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedPlan('Premium')}>
              <Glass style={{ padding: 22, backgroundColor: 'rgba(2,16,21,0.85)' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 16,
                  }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: A6.fg1 }}>
                        {t('premiumPlan')}
                      </Text>
                      <LinearGradient
                        colors={[A6.primary, A6.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text
                          style={{
                            color: A6.bgInk,
                            fontSize: 9,
                            fontWeight: '900',
                            letterSpacing: 0.6,
                          }}>
                          {t('ultimate')}
                        </Text>
                      </LinearGradient>
                    </View>
                    <Text style={{ fontSize: 12, color: A6.fg2 }}>{t('includesTrial')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={{
                        fontSize: 24,
                        fontWeight: '700',
                        letterSpacing: -0.5,
                        color: A6.fg1,
                        fontVariant: ['tabular-nums'],
                      }}>
                      $5.99
                    </Text>
                    <Text style={{ fontSize: 11, color: A6.fg2 }}>{t('perMonth')}</Text>
                  </View>
                </View>
                <Feature text="Unlimited Camera AI Logs" on />
                <Feature text="Unlimited AI Mood & Normal Chats" on />
                <Feature text="Priority Response Generation" on />
              </Glass>
            </TouchableOpacity>
          </View>

          {/* Basic card */}
          <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedPlan('Basic')}>
            <Glass
              style={{
                padding: 22,
                marginBottom: 12,
                borderColor:
                  selectedPlan === 'Basic'
                    ? `${A6.primary}66`
                    : 'rgba(255,255,255,0.12)',
                borderWidth: selectedPlan === 'Basic' ? 1.5 : 0.5,
              }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 16,
                }}>
                <View>
                  <Text
                    style={{ fontSize: 20, fontWeight: '700', color: A6.fg1, marginBottom: 4 }}>
                    {t('basicPlan')}
                  </Text>
                  <Text style={{ fontSize: 12, color: A6.fg2 }}>{t('essentialTracking')}</Text>
                </View>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: A6.fg1,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {t('free')}
                </Text>
              </View>
              <Feature text="3 Camera AI Logs / Day" on={false} />
              <Feature text="8 Normal AI Chats / Day" on={false} />
              <Feature text="Unlimited Custom Meal Logs" on />
              <Feature text="Unlimited Contextual Mood Chats" on />
            </Glass>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: Platform.OS === 'ios' ? 36 : 24,
          backgroundColor: 'rgba(2,16,21,0.85)',
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(255,255,255,0.08)',
        }}>
        {selectedPlan !== 'Basic' && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 10,
            }}>
            <ShieldCheck size={13} color={A6.fg2} strokeWidth={1.8} />
            <Text style={{ color: A6.fg2, fontSize: 11 }}>{t('cancelAnytime')}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={verifying}
          activeOpacity={0.85}
          style={{
            borderRadius: 100,
            overflow: 'hidden',
            ...Platform.select({
              ios: {
                shadowColor: A6.primary,
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.6,
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
              padding: 16,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}>
            {selectedPlan !== 'Basic' && (
              <ExternalLink color={A6.bgInk} size={16} strokeWidth={2.2} />
            )}
            <Text style={{ color: A6.bgInk, fontSize: 16, fontWeight: '900', letterSpacing: 0.3 }}>
              {selectedPlan === 'Basic' ? t('continueFree') : 'Pay with Card →'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} style={{ alignItems: 'center', marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={12} color={A6.fg3} strokeWidth={1.8} />
            <Text style={{ color: A6.fg3, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 }}>
              Restore / Refresh Status
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
