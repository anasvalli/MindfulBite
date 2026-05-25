import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState, useRef } from 'react';
import {
  Button,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, Zap, RefreshCcw } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { analyzeFoodImage } from '../lib/gemini';
import * as SecureStore from 'expo-secure-store';
import { usePurchases } from './context/PurchasesContext';
import UpgradeModal from '../components/UpgradeModal';
import { A6 } from '../lib/theme';

const ReticleCorner = ({
  top,
  bottom,
  left,
  right,
}: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}) => (
  <View
    style={{
      position: 'absolute',
      top,
      bottom,
      left,
      right,
      width: 28,
      height: 28,
      borderTopWidth: top !== undefined ? 2 : 0,
      borderBottomWidth: bottom !== undefined ? 2 : 0,
      borderLeftWidth: left !== undefined ? 2 : 0,
      borderRightWidth: right !== undefined ? 2 : 0,
      borderColor: A6.primaryLight,
      borderRadius: 4,
    }}
  />
);

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [processing, setProcessing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const { tier } = usePurchases();

  const CAMERA_LIMIT = 3;
  const _d = new Date();
  const todayKey = `camera_count_${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;

  async function getDailyCameraCount(): Promise<number> {
    const val = await SecureStore.getItemAsync(todayKey);
    return val ? parseInt(val) : 0;
  }

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: A6.bgInk }}>
        <Text
          style={{
            textAlign: 'center',
            fontSize: 18,
            color: A6.fg1,
            marginBottom: 24,
          }}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="Grant Permission" color={A6.primary} />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }

  async function takePicture() {
    if (cameraRef.current && !processing) {
      setProcessing(true);
      try {
        if (tier === 'Basic') {
          const count = await getDailyCameraCount();
          if (count >= CAMERA_LIMIT) {
            setProcessing(false);
            setShowUpgrade(true);
            return;
          }
        }
        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.3 });
        if (photo) {
          analyzeFood(photo.uri, photo.base64);
        } else {
          setProcessing(false);
          alert('Failed to capture photo. Please try again.');
        }
      } catch (err: any) {
        setProcessing(false);
        alert(`Camera Error: ${err.message || 'Unknown error occurred'}`);
      }
    }
  }

  async function analyzeFood(uri: string, base64?: string) {
    if (!base64) {
      setProcessing(false);
      return;
    }
    try {
      const aiItems = await analyzeFoodImage(base64);
      setProcessing(false);
      router.push({
        pathname: '/meal-correction',
        params: {
          imageUri: uri,
          aiResult: JSON.stringify(aiItems),
          cameraLimitKey: todayKey,
        },
      });
    } catch (error) {
      setProcessing(false);
      alert('Failed to analyze food. Please try again.');
    }
  }

  const freeLeft = Math.max(CAMERA_LIMIT - 0, 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={StyleSheet.absoluteFill} facing={facing} ref={cameraRef} />

      {/* Vignette */}
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.25)',
        }}
      />

      {/* Top bar */}
      <View
        style={{
          position: 'absolute',
          top: 56,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
        }}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 0.5,
            borderColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <BlurView
            intensity={30}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', ...StyleSheet.absoluteFillObject }} />
          <X color="white" size={18} strokeWidth={2} />
        </TouchableOpacity>

        <LinearGradient
          colors={[A6.primary, A6.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
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
          <Zap color={A6.bgInk} size={13} fill={A6.bgInk} />
          <Text style={{ fontSize: 12, fontWeight: '800', color: A6.bgInk, letterSpacing: 0.5 }}>
            AI Ready
          </Text>
        </LinearGradient>

        <TouchableOpacity
          onPress={toggleCameraFacing}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 0.5,
            borderColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <BlurView
            intensity={30}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', ...StyleSheet.absoluteFillObject }} />
          <RefreshCcw color="white" size={18} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {/* Reticle */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 260,
          height: 260,
          marginLeft: -130,
          marginTop: -130,
        }}>
        <ReticleCorner top={0} left={0} />
        <ReticleCorner top={0} right={0} />
        <ReticleCorner bottom={0} left={0} />
        <ReticleCorner bottom={0} right={0} />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 2,
            opacity: 0.7,
          }}>
          <LinearGradient
            colors={['transparent', A6.primaryLight, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {/* Bottom controls */}
      <View
        style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          right: 0,
          alignItems: 'center',
          gap: 14,
        }}>
        <TouchableOpacity
          disabled={processing}
          activeOpacity={0.85}
          onPress={takePicture}
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 4,
            borderColor: A6.primaryLight,
            backgroundColor: 'rgba(0,0,0,0.3)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: processing ? 0.6 : 1,
            ...Platform.select({
              ios: {
                shadowColor: A6.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 24,
              },
              android: { elevation: 10 },
            }),
          }}>
          {processing ? (
            <ActivityIndicator size="large" color={A6.primaryLight} />
          ) : (
            <LinearGradient
              colors={[A6.primary, A6.primaryLight, A6.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 66, height: 66, borderRadius: 33 }}
            />
          )}
        </TouchableOpacity>
        <Text
          style={{
            color: 'white',
            fontWeight: '700',
            fontSize: 16,
            letterSpacing: 0.3,
            textShadowColor: 'rgba(0,0,0,0.6)',
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 8,
          }}>
          {processing ? 'Analyzing…' : 'Snap your meal'}
        </Text>
        {tier === 'Basic' && (
          <Text
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: 0.5,
            }}>
            {freeLeft} of {CAMERA_LIMIT} free meals left today
          </Text>
        )}
      </View>

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Unlimited AI Photo Logs"
        requiredPlan="Premium"
        description="You've used your 3 free daily photo logs. Upgrade to Premium for unlimited instant macro scanning!"
      />
    </View>
  );
}
