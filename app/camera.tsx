import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState, useRef } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Zap, RefreshCcw } from 'lucide-react-native';
import { analyzeFoodImage } from '../lib/gemini';
import * as SecureStore from 'expo-secure-store';
import { usePurchases } from './context/PurchasesContext';
import UpgradeModal from '../components/UpgradeModal';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [processing, setProcessing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const { tier } = usePurchases();

  const CAMERA_LIMIT = 3;
  const todayKey = `camera_count_${new Date().toISOString().split('T')[0]}`;

  async function getDailyCameraCount(): Promise<number> {
    const val = await SecureStore.getItemAsync(todayKey);
    return val ? parseInt(val) : 0;
  }

  async function incrementDailyCount() {
    const current = await getDailyCameraCount();
    await SecureStore.setItemAsync(todayKey, String(current + 1));
  }

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FFFFFF' }}>
        <Text style={{ textAlign: 'center', fontSize: 18, color: '#1F2937', marginBottom: 24 }}>We need your permission to show the camera</Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
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
          if (tier === 'Basic') await incrementDailyCount();
          analyzeFood(photo.uri, photo.base64);
        } else {
          setProcessing(false);
          alert('Failed to capture photo. Please try again.');
        }
      } catch (err: any) {
        setProcessing(false);
        console.error(err);
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
        params: { imageUri: uri, aiResult: JSON.stringify(aiItems) }
      });
    } catch (error) {
      console.error(error);
      setProcessing(false);
      alert('Failed to analyze food. Please try again.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: 24 }}>
          
          {/* Top Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 }}>
              <X color="white" size={28} />
            </TouchableOpacity>
            
            <View style={{ backgroundColor: 'rgba(34, 197, 94, 0.8)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center' }}>
              <Zap color="white" size={16} fill="white" />
              <Text style={{ color: 'white', fontWeight: 'bold', marginLeft: 8 }}>AI Ready</Text>
            </View>

            <TouchableOpacity onPress={toggleCameraFacing} style={{ padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 }}>
              <RefreshCcw color="white" size={28} />
            </TouchableOpacity>
          </View>

          {/* Bottom Bar Controls */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <TouchableOpacity 
              disabled={processing}
              onPress={takePicture}
              style={[{ width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }, processing && { opacity: 0.5 }]}
            >
              {processing ? (
                <ActivityIndicator size="large" color="white" />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'white', opacity: 0.9 }} />
              )}
            </TouchableOpacity>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18, marginTop: 16 }}>
              {processing ? 'Analyzing...' : 'Snap your meal'}
            </Text>
          </View>

        </View>
      </CameraView>

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

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
});
