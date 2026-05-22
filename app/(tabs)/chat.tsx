import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Send } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { generateAIResponse, generateMoodAIResponse } from '../../lib/ai';
import { useLanguage } from '../context/LanguageContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { usePurchases } from '../context/PurchasesContext';
import UpgradeModal from '../../components/UpgradeModal';
import * as SecureStore from 'expo-secure-store';
import { useAppTheme } from '../context/ThemeContext';

export default function ChatScreen() {
  const { user } = useAuth();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();
  const { type, mealName, mood } = useLocalSearchParams();
  const { t, language } = useLanguage();
  const { tier } = usePurchases();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const DAILY_LIMIT = 8;
  const _d = new Date();
  const todayKey = `chat_count_${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;

  async function getDailyCount(): Promise<number> {
    const val = await SecureStore.getItemAsync(todayKey);
    return val ? parseInt(val) : 0;
  }

  async function incrementDailyCount() {
    const current = await getDailyCount();
    await SecureStore.setItemAsync(todayKey, String(current + 1));
  }

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [messages, setMessages] = useState([
    { id: '1', role: 'assistant', text: type === 'mood' ? "I'm here for you. Let's talk about what you just ate and how it made you feel." : "Hi there! I'm MindfulBite, your personal AI nutritionist and mood therapist. How can I support your journey today?" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || !user) return;

    // Basic plan daily limit check ONLY if not a mood chat
    if (tier === 'Basic' && type !== 'mood') {
      const count = await getDailyCount();
      if (count >= DAILY_LIMIT) {
        setShowUpgrade(true);
        return;
      }
    }

    const userText = input.trim();
    const newUserMsg = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    if (tier === 'Basic' && type !== 'mood') await incrementDailyCount();

    try {
      let reply;
      if (type === 'mood') {
        reply = await generateMoodAIResponse(user.id, userText, messages, language, String(mealName), String(mood));
      } else {
        reply = await generateAIResponse(user.id, userText, messages, language);
      }
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: String(reply) }]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: "I'm having trouble connecting right now. Please try again later." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <>
    <LinearGradient colors={isDark ? ['#09090B', '#1E293B'] : ['#F8FAFC', '#FFFFFF']} style={{ flex: 1 }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView 
          ref={scrollRef}
          style={{ flex: 1, padding: 16 }} 
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(msg => (
            <View key={msg.id} style={{
              marginBottom: 12, maxWidth: '82%', borderRadius: 20, padding: 14, overflow: 'hidden',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.role === 'user' ? '#6FAF4F' : (isDark ? '#1E293B' : '#FFFFFF'),
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: msg.role === 'user' ? 0.2 : 0.04, shadowRadius: msg.role === 'user' ? 4 : 8, elevation: 2,
            }}>
              <Text style={{
                fontSize: 15, lineHeight: 22,
                color: msg.role === 'user' ? '#FFFFFF' : (isDark ? '#F8FAFC' : '#0F172A'),
              }}>
                {msg.text}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={{
              marginBottom: 12, maxWidth: '82%', borderRadius: 20, padding: 16, overflow: 'hidden',
              alignSelf: 'flex-start', backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
            }}>
               <ActivityIndicator color="#6FAF4F" />
            </View>
          )}
        </ScrollView>

        <View style={{ backgroundColor: isDark ? '#0F172A' : '#FFFFFF', paddingBottom: keyboardOpen ? 20 : (Platform.OS === 'ios' ? 90 : 80) }}>
          <View style={{
            padding: 14, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#F1F5F9',
            flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          }}>
            <TextInput
              style={{
                flex: 1, backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12,
                fontSize: 15, color: isDark ? '#F8FAFC' : '#0F172A', marginRight: 10,
                borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0',
              }}
              placeholder={t('askCoach')}
              placeholderTextColor="#94A3B8"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity 
              style={{ backgroundColor: '#6FAF4F', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 }}
              onPress={sendMessage}
              disabled={loading}
            >
              <Send color="#FFFFFF" size={20} />
            </TouchableOpacity>
          </View>
          <Text style={{ 
            textAlign: 'center', fontSize: 10, color: '#94A3B8', 
            paddingVertical: 6, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' 
          }}>
            {t('chatDisclaimer')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>

    {/* Upgrade modal for Basic users */}
    <UpgradeModal
      visible={showUpgrade}
      onClose={() => setShowUpgrade(false)}
      feature="Unlimited AI Chats"
      requiredPlan="Premium"
      description="You've used your 8 free daily messages. Upgrade to Premium for unlimited AI nutrition coaching, 24/7."
    />
  </>);
}
