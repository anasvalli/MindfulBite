import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Activity, LogOut, TrendingUp, AlertTriangle, Trash2 } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useCustomAlert } from '../../components/CustomAlert';
import { useAppTheme } from '../context/ThemeContext';

export default function InsightsScreen() {
  const { signOut, user } = useAuth();
  const { t } = useLanguage();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const { alert } = useCustomAlert();

  const handleDeleteAccount = () => {
    alert(
      'Delete Account',
      'Are you absolutely sure? This will permanently delete your profile, meal logs, and account. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Forever', 
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Call RPC to delete auth user and data
              const { error } = await supabase.rpc('delete_user_account');
              
              if (error) {
                console.error('Delete Error:', error);
                alert('Error', 'Failed to delete account. Please try again.');
                return;
              }

              // 2. Sign out to clear local session
              await signOut();
            } catch (err) {
              alert('Error', 'Failed to delete account.');
            }
          }
        },
      ]
    );
  };
  
  return (
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, marginTop: 10 }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: 4 }}>Weekly Insights</Text>
            <Text style={{ fontSize: 14, color: isDark ? '#94A3B8' : '#64748B' }}>Discover your eating patterns.</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/paywall')} style={{ backgroundColor: '#6FAF4F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' }}>Upgrade</Text>
          </TouchableOpacity>
        </View>

        {/* Pro features teaser */}
        <View style={{
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF', padding: 24, borderRadius: 24, marginTop: 8, overflow: 'hidden',
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 8, elevation: 2
        }}>
          <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: '800', fontSize: 18, marginBottom: 8 }}>MindfulBite Pro ✨</Text>
          <Text style={{ color: isDark ? '#94A3B8' : '#64748B', marginBottom: 16, lineHeight: 20, fontSize: 14 }}>
            Unlock advanced mood-calorie correlation charts and unlimited predictive nudges.
          </Text>
          <TouchableOpacity style={{ backgroundColor: '#6FAF4F', paddingVertical: 14, borderRadius: 16, alignItems: 'center', shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 4 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Upgrade for $7.99/mo</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity 
          style={{
            marginTop: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            padding: 16, backgroundColor: '#FEF2F2',
            borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 18,
          }}
          onPress={signOut}
        >
          <LogOut color="#EF4444" size={20} />
          <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 16, marginLeft: 8 }}>{t('signOut')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={{
            marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onPress={handleDeleteAccount}
        >
          <Trash2 color="#94A3B8" size={18} />
          <Text style={{ color: '#94A3B8', fontWeight: '600', fontSize: 14, marginLeft: 8 }}>{t('deleteAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}
