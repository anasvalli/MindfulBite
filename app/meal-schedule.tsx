import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, useColorScheme, ScrollView, Modal, FlatList } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './context/AuthContext';
import { useRouter } from 'expo-router';
import { ArrowLeft, Moon, Sun, ChevronDown } from 'lucide-react-native';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = ['00', '15', '30', '45'];
const PERIODS = ['AM', 'PM'];

type TimePickerProps = {
  label: string;
  icon: React.ReactNode;
  hour: string;
  minute: string;
  period: string;
  onHour: (v: string) => void;
  onMinute: (v: string) => void;
  onPeriod: (v: string) => void;
  isDark: boolean;
};

function TimePicker({ label, icon, hour, minute, period, onHour, onMinute, onPeriod, isDark }: TimePickerProps) {
  const [openModal, setOpenModal] = useState<'hour' | 'minute' | 'period' | null>(null);
  
  const DropdownBtn = ({ value, onPress }: { value: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{
      backgroundColor: isDark ? '#27272a' : '#f9fafb', paddingHorizontal: 18, paddingVertical: 14,
      borderRadius: 14, flexDirection: 'row', alignItems: 'center', minWidth: 65, justifyContent: 'center',
    }}>
      <Text style={{ color: isDark ? '#fff' : '#1a1a1a', fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <ChevronDown color={isDark ? '#71717a' : '#9ca3af'} size={14} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );

  return (
    <View style={{ backgroundColor: isDark ? '#1a1a1a' : '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: isDark ? '#27272a' : '#e5e7eb', marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        {icon}
        <Text style={{ color: isDark ? '#fff' : '#1a1a1a', fontSize: 16, fontWeight: '700', marginLeft: 10 }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <DropdownBtn value={hour || '7'} onPress={() => setOpenModal('hour')} />
        <Text style={{ color: isDark ? '#71717a' : '#9ca3af', fontSize: 24, fontWeight: '800' }}>:</Text>
        <DropdownBtn value={minute || '00'} onPress={() => setOpenModal('minute')} />
        <DropdownBtn value={period || 'AM'} onPress={() => setOpenModal('period')} />
      </View>

      <Modal visible={openModal !== null} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 }} activeOpacity={1} onPress={() => setOpenModal(null)}>
          <View style={{ backgroundColor: isDark ? '#27272a' : '#fff', borderRadius: 20, maxHeight: 300, overflow: 'hidden' }}>
            <FlatList
              data={openModal === 'hour' ? HOURS : openModal === 'minute' ? MINUTES : PERIODS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    if (openModal === 'hour') onHour(item);
                    else if (openModal === 'minute') onMinute(item);
                    else onPeriod(item);
                    setOpenModal(null);
                  }}
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? '#3f3f4620' : '#f3f4f6', alignItems: 'center' }}
                >
                  <Text style={{ color: isDark ? '#fff' : '#1a1a1a', fontSize: 18, fontWeight: '600' }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function MealScheduleScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [wakeHour, setWakeHour] = useState('7');
  const [wakeMinute, setWakeMinute] = useState('00');
  const [wakePeriod, setWakePeriod] = useState('AM');
  const [sleepHour, setSleepHour] = useState('11');
  const [sleepMinute, setSleepMinute] = useState('00');
  const [sleepPeriod, setSleepPeriod] = useState('PM');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const wakeTime = `${wakeHour}:${wakeMinute} ${wakePeriod}`;
    const sleepTime = `${sleepHour}:${sleepMinute} ${sleepPeriod}`;

    setSaving(true);
    const { error } = await supabase.from('users').update({
      wake_time: wakeTime,
      sleep_time: sleepTime,
      updated_at: new Date().toISOString(),
    }).eq('id', user?.id);
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.back();
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: isDark ? '#0f0f0f' : '#f0fdf4' }} contentContainerStyle={{ padding: 24 }}>
      {/* Header */}
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 50, marginBottom: 24 }}>
        <ArrowLeft color={isDark ? '#fff' : '#1a1a1a'} size={24} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: isDark ? '#fff' : '#1a1a1a', marginLeft: 12 }}>Set Your Schedule</Text>
      </TouchableOpacity>

      <Text style={{ color: isDark ? '#a1a1aa' : '#6b7280', fontSize: 14, marginBottom: 24, lineHeight: 20 }}>
        Tell us when you wake up and go to sleep. We'll plan your meals at the perfect times to match your daily routine and weight goals.
      </Text>

      {/* Wake Time */}
      <TimePicker
        label="Wake Up Time"
        icon={<Sun color="#f59e0b" size={22} />}
        hour={wakeHour} minute={wakeMinute} period={wakePeriod}
        onHour={setWakeHour} onMinute={setWakeMinute} onPeriod={setWakePeriod}
        isDark={isDark}
      />

      {/* Sleep Time */}
      <TimePicker
        label="Bedtime"
        icon={<Moon color="#6366f1" size={22} />}
        hour={sleepHour} minute={sleepMinute} period={sleepPeriod}
        onHour={setSleepHour} onMinute={setSleepMinute} onPeriod={setSleepPeriod}
        isDark={isDark}
      />

      {/* Save Button */}
      <TouchableOpacity onPress={handleSave} disabled={saving} style={{
        backgroundColor: '#22c55e', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 12,
        shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
      }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>Save & Generate Plan</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
