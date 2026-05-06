import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'expo-router';
import { ArrowLeft, AtSign } from 'lucide-react-native';

export default function ChangeUsernameScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [newUsername, setNewUsername] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!newUsername.trim()) {
      Alert.alert('Error', 'Please enter a new username.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('users').update({
      username: newUsername.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', user?.id);
    setSaving(false);

    if (error) {
      Alert.alert('Update Failed', error.message);
    } else {
      Alert.alert('Success', 'Username updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#f0fdf4', padding: 24 }}>
      {/* Header */}
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 50, marginBottom: 32 }}>
        <ArrowLeft color={isDark ? '#fff' : '#1a1a1a'} size={24} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#1a1a1a', marginLeft: 12 }}>Change Username</Text>
      </TouchableOpacity>

      {/* Icon */}
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isDark ? '#14532d30' : '#dcfce7', justifyContent: 'center', alignItems: 'center' }}>
          <AtSign color="#22c55e" size={32} />
        </View>
      </View>

      {/* Input */}
      <Text style={{ color: isDark ? '#a1a1aa' : '#6b7280', marginBottom: 8, fontWeight: '600', fontSize: 13, marginLeft: 4 }}>New Username</Text>
      <TextInput
        style={{
          backgroundColor: isDark ? '#1a1a1a' : '#fff', padding: 18, borderRadius: 16, fontSize: 16,
          color: isDark ? '#fff' : '#1a1a1a', borderWidth: 1, borderColor: isDark ? '#27272a' : '#e5e7eb', marginBottom: 24,
        }}
        placeholder="@newusername"
        placeholderTextColor={isDark ? '#52525b' : '#9ca3af'}
        value={newUsername}
        onChangeText={setNewUsername}
        autoCapitalize="none"
        autoFocus
      />

      {/* Save Button */}
      <TouchableOpacity onPress={handleSave} disabled={saving} style={{
        backgroundColor: '#22c55e', padding: 18, borderRadius: 16, alignItems: 'center',
        shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
      }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Save Username</Text>}
      </TouchableOpacity>
    </View>
  );
}
