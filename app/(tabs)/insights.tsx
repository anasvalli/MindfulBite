import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LogOut, Trash2, Sparkles } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { useCustomAlert } from '../../components/CustomAlert';
import { A6 } from '../../lib/theme';
import { Page, Glass, PageHeader, PillButton } from '../../components/ui/A6';

export default function InsightsScreen() {
  const { signOut } = useAuth();
  const { t } = useLanguage();
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
              const { error } = await supabase.rpc('delete_user_account');
              if (error) {
                alert('Error', 'Failed to delete account. Please try again.');
                return;
              }
              await signOut();
            } catch {
              alert('Error', 'Failed to delete account.');
            }
          },
        },
      ]
    );
  };

  return (
    <Page>
      <PageHeader
        title="Weekly Insights"
        subtitle="Discover your eating patterns"
        right={<PillButton onPress={() => router.push('/paywall')}>Upgrade</PillButton>}
      />

      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        {/* Pro teaser */}
        <Glass style={{ padding: 20, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: A6.fg1 }}>
              MindfulBite Pro
            </Text>
            <Sparkles size={16} color={A6.primaryLight} fill={A6.primaryLight} />
          </View>
          <Text style={{ fontSize: 13, color: A6.fg2, lineHeight: 19, marginBottom: 14 }}>
            Unlock advanced mood-calorie correlation charts and unlimited predictive nudges.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/paywall')}
            style={{
              borderRadius: 14,
              overflow: 'hidden',
              ...Platform.select({
                ios: {
                  shadowColor: A6.primary,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.45,
                  shadowRadius: 18,
                },
                android: { elevation: 6 },
              }),
            }}>
            <LinearGradient
              colors={[A6.primary, A6.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: A6.bgInk, fontWeight: '800', fontSize: 14 }}>
                Upgrade for $5.99/mo
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Glass>

        {/* Sign out */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={signOut}
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            backgroundColor: `${A6.danger}0a`,
            borderWidth: 0.5,
            borderColor: `${A6.danger}33`,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
          <LogOut color={A6.danger} size={18} strokeWidth={1.8} />
          <Text style={{ color: A6.danger, fontWeight: '700', fontSize: 14 }}>
            {t('signOut')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleDeleteAccount}
          style={{
            marginTop: 12,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
          <Trash2 color={A6.fg3} size={16} strokeWidth={1.8} />
          <Text style={{ color: A6.fg2, fontWeight: '600', fontSize: 13 }}>
            {t('deleteAccount')}
          </Text>
        </TouchableOpacity>
      </View>
    </Page>
  );
}
