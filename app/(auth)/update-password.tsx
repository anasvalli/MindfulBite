import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, useColorScheme } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';
import { useLanguage } from '../context/LanguageContext';
import { Eye, EyeOff } from 'lucide-react-native';

export default function UpdatePasswordScreen() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  async function handleUpdatePassword() {
    if (!password) {
      Alert.alert('Error', 'Please enter a new password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes('different from the old password') || error.message.toLowerCase().includes('same')) {
        Alert.alert('Invalid Password', 'Your new password cannot be the exact same as your old password. Please choose a different one.');
      } else {
        Alert.alert('Update Error', error.message);
      }
    } else {
      Alert.alert('Success', 'Your password has been successfully updated!');
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#f0fdf4' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: isDark ? '#fff' : '#1a1a1a', marginBottom: 24, textAlign: 'center' }}>
          {t('enterNewPassword')}
        </Text>

        <View style={{ marginBottom: 24, position: 'relative', justifyContent: 'center' }}>
          <TextInput
            style={{
              backgroundColor: isDark ? '#1a1a1a' : '#fff', padding: 16, paddingRight: 50, borderRadius: 14, fontSize: 15,
              color: isDark ? '#fff' : '#1a1a1a', borderWidth: 1, borderColor: isDark ? '#3f3f46' : '#e5e7eb',
            }}
            placeholder={t('password')}
            placeholderTextColor={isDark ? '#52525b' : '#9ca3af'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity 
            style={{ position: 'absolute', right: 16 }}
            onPress={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff color={isDark ? '#a1a1aa' : '#6b7280'} size={20} /> : <Eye color={isDark ? '#a1a1aa' : '#6b7280'} size={20} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: '#22c55e', padding: 16, borderRadius: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          }}
          onPress={handleUpdatePassword}
          disabled={loading}
        >
          {loading && <ActivityIndicator color="white" style={{ marginRight: 8 }} />}
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{t('updatePasswordBtn')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
