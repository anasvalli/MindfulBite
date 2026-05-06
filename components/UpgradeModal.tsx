import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Lock, Sparkles, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

type UpgradeModalProps = {
  visible: boolean;
  onClose: () => void;
  feature: string;       // e.g. "AI Camera Scan"
  requiredPlan: 'Premium';
  description: string;   // e.g. "Snap a photo of your meal and AI will detect calories instantly."
};

export default function UpgradeModal({ visible, onClose, feature, requiredPlan, description }: UpgradeModalProps) {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 200 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 150, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
      scaleAnim.setValue(0.85);
    }
  }, [visible]);

  const handleUpgrade = () => {
    onClose();
    router.push('/paywall');
  };

  const isPremium = true;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Blurred dark backdrop */}
      <BlurView intensity={30} tint="dark" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Animated.View style={{
            width: '100%',
            maxWidth: 360,
            borderRadius: 28,
            overflow: 'hidden',
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }],
            shadowColor: isPremium ? '#6FAF4F' : '#2FA4D7',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.5,
            shadowRadius: 30,
            elevation: 24,
          }}>
            {/* Card */}
            <View style={{ backgroundColor: '#0F172A', borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              
              {/* Gradient Header */}
              <LinearGradient
                colors={isPremium ? ['rgba(111,175,79,0.25)', 'rgba(111,175,79,0.05)'] : ['rgba(47,164,215,0.25)', 'rgba(47,164,215,0.05)']}
                style={{ padding: 32, alignItems: 'center' }}
              >
                {/* Close button */}
                <TouchableOpacity
                  onPress={onClose}
                  style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X color="#94A3B8" size={16} />
                </TouchableOpacity>

                {/* Icon */}
                <View style={{
                  width: 72, height: 72, borderRadius: 24,
                  backgroundColor: isPremium ? 'rgba(111,175,79,0.15)' : 'rgba(47,164,215,0.15)',
                  alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                  borderWidth: 1, borderColor: isPremium ? 'rgba(111,175,79,0.3)' : 'rgba(47,164,215,0.3)',
                }}>
                  <Lock color={isPremium ? '#6FAF4F' : '#2FA4D7'} size={32} />
                </View>

                {/* Badge */}
                <View style={{
                  backgroundColor: isPremium ? 'rgba(111,175,79,0.15)' : 'rgba(47,164,215,0.15)',
                  paddingHorizontal: 14, paddingVertical: 5, borderRadius: 100, marginBottom: 12,
                  borderWidth: 1, borderColor: isPremium ? 'rgba(111,175,79,0.3)' : 'rgba(47,164,215,0.3)',
                }}>
                  <Text style={{ color: isPremium ? '#6FAF4F' : '#2FA4D7', fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                    {requiredPlan} Feature
                  </Text>
                </View>

                <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', marginBottom: 8 }}>
                  {feature}
                </Text>
                <Text style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 }}>
                  {description}
                </Text>
              </LinearGradient>

              {/* Buttons */}
              <View style={{ padding: 20 }}>
                <TouchableOpacity
                  onPress={handleUpgrade}
                  style={{
                    backgroundColor: isPremium ? '#6FAF4F' : '#2FA4D7',
                    borderRadius: 100, paddingVertical: 16,
                    alignItems: 'center', marginBottom: 12,
                    flexDirection: 'row', justifyContent: 'center',
                    shadowColor: isPremium ? '#6FAF4F' : '#2FA4D7',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
                  }}
                >
                  <Sparkles color="#FFFFFF" size={16} style={{ marginRight: 8 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>
                    Upgrade to {requiredPlan}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '600' }}>Maybe Later</Text>
                </TouchableOpacity>
              </View>

            </View>
          </Animated.View>
        </View>
      </BlurView>
    </Modal>
  );
}
