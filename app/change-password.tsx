import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'expo-router';
import { ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react-native';
import * as Linking from 'expo-linking';

export default function ChangePasswordScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [step, setStep] = useState<'verify' | 'change'>('verify');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wrongAttempt, setWrongAttempt] = useState(false);

  async function verifyCurrentPassword() {
    if (!currentPassword) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: user?.email || '',
      password: currentPassword,
    });
    setLoading(false);

    if (error) {
      setWrongAttempt(true);
      setCurrentPassword('');
      Alert.alert('Incorrect Password', 'The password you entered is wrong. Please try again.');
    } else {
      setWrongAttempt(false);
      setStep('change');
    }
  }

  async function handleUpdatePassword() {
    if (!newPassword || !confirmNew) {
      Alert.alert('Error', 'Please fill in both password fields.');
      return;
    }
    if (newPassword !== confirmNew) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      Alert.alert('Update Failed', error.message);
    } else {
      Alert.alert('Success', 'Your password has been updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }
  }

  async function handleForgotPassword() {
    if (!user?.email) {
      Alert.alert('Error', 'No email found for this account.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: Linking.createURL('/'),
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Email Sent', `A password reset link has been sent to ${user.email}. Check your inbox!`);
    }
  }

  const inputStyle = {
    backgroundColor: isDark ? '#1a1a1a' : '#fff', padding: 18, paddingRight: 54, borderRadius: 16, fontSize: 16,
    color: isDark ? '#fff' : '#1a1a1a', borderWidth: 1, borderColor: isDark ? '#27272a' : '#e5e7eb',
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#f0fdf4', padding: 24 }}>
      {/* Header */}
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 50, marginBottom: 32 }}>
        <ArrowLeft color={isDark ? '#fff' : '#1a1a1a'} size={24} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#1a1a1a', marginLeft: 12 }}>Change Password</Text>
      </TouchableOpacity>

      {/* Icon */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isDark ? '#14532d30' : '#dcfce7', justifyContent: 'center', alignItems: 'center' }}>
          <KeyRound color="#22c55e" size={32} />
        </View>
        <Text style={{ color: isDark ? '#a1a1aa' : '#6b7280', fontSize: 14, marginTop: 12, textAlign: 'center' }}>
          {step === 'verify' ? 'Enter your current password to continue' : 'Create your new password'}
        </Text>
      </View>

      {step === 'verify' ? (
        <>
          {/* Current Password Input */}
          <Text style={{ color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 8, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>Current Password</Text>
          <View style={{ position: 'relative', justifyContent: 'center', marginBottom: 12 }}>
            <TextInput
              style={inputStyle}
              placeholder="••••••••"
              placeholderTextColor={isDark ? '#52525b' : '#9ca3af'}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
              autoFocus
            />
            <TouchableOpacity style={{ position: 'absolute', right: 18 }} onPress={() => setShowCurrent(!showCurrent)}>
              {showCurrent ? <EyeOff color={isDark ? '#a1a1aa' : '#6b7280'} size={20} /> : <Eye color={isDark ? '#a1a1aa' : '#6b7280'} size={20} />}
            </TouchableOpacity>
          </View>

          {/* Forgot Password — only shows after wrong attempt */}
          {wrongAttempt && (
            <TouchableOpacity onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
              <Text style={{ color: '#22c55e', fontWeight: '600', fontSize: 14 }}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          {/* Verify Button */}
          <TouchableOpacity onPress={verifyCurrentPassword} disabled={loading} style={{
            backgroundColor: '#22c55e', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 12,
            shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
          }}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Verify Password</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* New Password */}
          <Text style={{ color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 8, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>New Password</Text>
          <View style={{ position: 'relative', justifyContent: 'center', marginBottom: 16 }}>
            <TextInput
              style={inputStyle}
              placeholder="••••••••"
              placeholderTextColor={isDark ? '#52525b' : '#9ca3af'}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoFocus
            />
            <TouchableOpacity style={{ position: 'absolute', right: 18 }} onPress={() => setShowNew(!showNew)}>
              {showNew ? <EyeOff color={isDark ? '#a1a1aa' : '#6b7280'} size={20} /> : <Eye color={isDark ? '#a1a1aa' : '#6b7280'} size={20} />}
            </TouchableOpacity>
          </View>

          {/* Confirm New Password */}
          <Text style={{ color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 8, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>Confirm New Password</Text>
          <View style={{ position: 'relative', justifyContent: 'center', marginBottom: 24 }}>
            <TextInput
              style={inputStyle}
              placeholder="••••••••"
              placeholderTextColor={isDark ? '#52525b' : '#9ca3af'}
              value={confirmNew}
              onChangeText={setConfirmNew}
              secureTextEntry={!showConfirm}
            />
            <TouchableOpacity style={{ position: 'absolute', right: 18 }} onPress={() => setShowConfirm(!showConfirm)}>
              {showConfirm ? <EyeOff color={isDark ? '#a1a1aa' : '#6b7280'} size={20} /> : <Eye color={isDark ? '#a1a1aa' : '#6b7280'} size={20} />}
            </TouchableOpacity>
          </View>

          {/* Update Button */}
          <TouchableOpacity onPress={handleUpdatePassword} disabled={loading} style={{
            backgroundColor: '#22c55e', padding: 18, borderRadius: 16, alignItems: 'center',
            shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
          }}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Update Password</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
