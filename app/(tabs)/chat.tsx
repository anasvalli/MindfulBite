import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  StyleSheet,
} from 'react-native';
import { Send, Leaf } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { generateAIResponse, generateMoodAIResponse } from '../../lib/ai';
import { useLanguage } from '../context/LanguageContext';
import { useLocalSearchParams } from 'expo-router';
import { usePurchases } from '../context/PurchasesContext';
import UpgradeModal from '../../components/UpgradeModal';
import * as SecureStore from 'expo-secure-store';
import { A6 } from '../../lib/theme';
import { Page, Glass, AuroraBackdrop } from '../../components/ui/A6';

export default function ChatScreen() {
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
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

  const [dailyCount, setDailyCount] = useState(0);
  useEffect(() => {
    getDailyCount().then(setDailyCount);
  }, [tier]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant' as const,
      text:
        type === 'mood'
          ? "I'm here for you. Let's talk about what you just ate and how it made you feel."
          : "Hi there! I'm MindfulBite, your personal AI nutritionist and mood therapist. How can I support your journey today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || !user) return;
    if (tier === 'Basic' && type !== 'mood') {
      const count = await getDailyCount();
      if (count >= DAILY_LIMIT) {
        setShowUpgrade(true);
        return;
      }
    }

    const userText = input.trim();
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setInput('');
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    if (tier === 'Basic' && type !== 'mood') {
      await incrementDailyCount();
      setDailyCount((c) => c + 1);
    }

    try {
      const reply =
        type === 'mood'
          ? await generateMoodAIResponse(user.id, userText, messages, language, String(mealName), String(mood))
          : await generateAIResponse(user.id, userText, messages, language);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'assistant', text: String(reply) },
      ]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          text: "I'm having trouble connecting right now. Please try again later.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: A6.bgInk }}>
      <AuroraBackdrop variant="default" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {/* Header */}
        <View
          style={{
            paddingTop: 60,
            paddingHorizontal: 20,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}>
          <LinearGradient
            colors={[A6.primary, A6.primaryLight, A6.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
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
            <Leaf size={20} color={A6.bgInk} strokeWidth={2} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: A6.fg1 }}>
              MindfulBite Coach
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: A6.primaryLight,
                }}
              />
              <Text style={{ fontSize: 11, color: A6.primaryLight }}>Online</Text>
            </View>
          </View>
          {tier === 'Basic' && type !== 'mood' && (
            <Text style={{ fontSize: 11, color: A6.fg2, letterSpacing: 0.5 }}>
              {Math.min(dailyCount, DAILY_LIMIT)} / {DAILY_LIMIT} today
            </Text>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 20, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            if (isUser) {
              return (
                <View
                  key={msg.id}
                  style={{
                    alignSelf: 'flex-end',
                    maxWidth: '78%',
                    marginBottom: 10,
                  }}>
                  <LinearGradient
                    colors={[A6.primary, A6.primaryLight]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderRadius: 22,
                    }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', lineHeight: 20, color: A6.bgInk }}>
                      {msg.text}
                    </Text>
                  </LinearGradient>
                </View>
              );
            }
            return (
              <Glass
                key={msg.id}
                style={{ alignSelf: 'flex-start', maxWidth: '82%', marginBottom: 10, borderRadius: 22 }}>
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 14, color: A6.fg1, lineHeight: 21 }}>{msg.text}</Text>
                </View>
              </Glass>
            );
          })}
          {loading && (
            <Glass style={{ alignSelf: 'flex-start', maxWidth: '40%', marginBottom: 10, borderRadius: 22 }}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <ActivityIndicator color={A6.primaryLight} />
              </View>
            </Glass>
          )}
        </ScrollView>

        <Text
          style={{
            textAlign: 'center',
            fontSize: 10,
            color: A6.fg3,
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 6,
          }}>
          {t('chatDisclaimer')}
        </Text>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: keyboardOpen ? 12 : Platform.OS === 'ios' ? 90 : 80,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: 'rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(2,16,21,0.7)',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                flex: 1,
                borderRadius: 22,
                overflow: 'hidden',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(255,255,255,0.05)',
              }}>
              <BlurView
                intensity={20}
                tint="dark"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
              <TextInput
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: A6.fg1,
                }}
                placeholder={t('askCoach')}
                placeholderTextColor={A6.fg3}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
              />
            </View>
            <TouchableOpacity onPress={sendMessage} disabled={loading} activeOpacity={0.85}>
              <LinearGradient
                colors={[A6.primary, A6.primaryLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
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
                <Send size={18} color={A6.bgInk} strokeWidth={2} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Unlimited AI Chats"
        requiredPlan="Premium"
        description="You've used your 8 free daily messages. Upgrade to Premium for unlimited AI nutrition coaching, 24/7."
      />
    </View>
  );
}
