import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from './context/AuthContext';
import { supabase } from '../lib/supabase';

const EMOTIONS = [
  { label: 'Happy', emoji: '😊', type: 'positive' },
  { label: 'Normal', emoji: '🙂', type: 'neutral' },
  { label: 'Stressed', emoji: '😫', type: 'negative' },
  { label: 'Bored', emoji: '😐', type: 'neutral' },
  { label: 'Sad', emoji: '😔', type: 'negative' },
  { label: 'Energetic', emoji: '⚡', type: 'positive' },
  { label: 'Anxious', emoji: '😰', type: 'negative' },
  { label: 'Tired', emoji: '😴', type: 'neutral' },
  { label: 'Celebratory', emoji: '🎉', type: 'positive' },
];

export default function MoodPickerScreen() {
  const { mealId, mealName } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();

  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // AI Suggestions feature
  const suggestedMoods = ['Stressed', 'Tired'];

  const handleSave = async () => {
    if (!selectedMood) {
      Alert.alert('Please select a mood', 'Tracking how you feel helps the AI give better advice!');
      return;
    }

    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from('meal_moods').insert({
      user_id: user.id,
      meal_id: mealId && mealId !== 'mock-id' ? mealId : null,
      mood: selectedMood,
      context_notes: notes
    });

    setLoading(false);

    if (error) {
      Alert.alert('Error saving mood', error.message);
    } else {
      setIsSaved(true);
    }
  };

  if (isSaved) {
    return (
      <View className="flex-1 bg-white dark:bg-zinc-900 justify-center p-6">
        <View className="items-center mb-10">
          <Text className="text-6xl mb-4">✨</Text>
          <Text className="text-3xl font-black text-gray-900 dark:text-white text-center mb-2">Meal Logged!</Text>
          <Text className="text-lg text-gray-500 dark:text-gray-400 text-center">Your meal and mood have been successfully recorded.</Text>
        </View>

        <TouchableOpacity 
          className="bg-blue-500 p-4 rounded-xl flex-row items-center justify-center shadow-lg mb-4"
          style={{ elevation: 5 }}
          onPress={() => router.replace({ pathname: '/(tabs)/chat', params: { type: 'mood', mealName: mealName, mood: selectedMood } })}
        >
          <Text className="text-white font-bold text-xl">💬 Start AI Mood Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className="bg-gray-100 dark:bg-zinc-800 p-4 rounded-xl flex-row items-center justify-center"
          onPress={() => router.replace('/(tabs)')}
        >
          <Text className="text-gray-900 dark:text-white font-bold text-lg">Return to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-zinc-900 p-6 pt-12">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="mb-8">
          <Text className="text-3xl font-black text-gray-900 dark:text-white mb-2">How are you feeling right now?</Text>
          <Text className="text-lg text-gray-500 dark:text-gray-400">Context matters. Are you eating because you're hungry, or is it emotional?</Text>
        </View>

        <View className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50">
          <Text className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">✨ AI Observation</Text>
          <Text className="text-blue-900 dark:text-blue-200">Based on your recent sleep data and time of day, you might be feeling <Text className="font-bold">Stressed</Text> or <Text className="font-bold">Tired</Text>. Is this accurate?</Text>
        </View>

        <View className="flex-row flex-wrap justify-between">
          {EMOTIONS.map((emotion) => {
            const isSelected = selectedMood === emotion.label;
            const isSuggested = suggestedMoods.includes(emotion.label);
            return (
              <TouchableOpacity
                key={emotion.label}
                onPress={() => setSelectedMood(emotion.label)}
                className={`w-[48%] bg-gray-50 dark:bg-zinc-800 p-6 rounded-3xl items-center justify-center mb-4 border-2 
                  ${isSelected ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : isSuggested ? 'border-blue-300' : 'border-transparent'}
                `}
                style={isSelected ? { elevation: 2, shadowColor: '#22c55e', shadowRadius: 8, shadowOpacity: 0.2 } : {}}
              >
                <Text className="text-4xl mb-2">{emotion.emoji}</Text>
                <Text className={`font-semibold ${isSelected ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {emotion.label}
                </Text>
                {isSuggested && !isSelected && (
                  <Text className="text-[10px] text-blue-500 uppercase font-bold mt-1">Suggested</Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        <View className="mt-4 mb-32">
          <Text className="text-gray-700 dark:text-gray-300 font-semibold mb-2 ml-1">Optional Notes</Text>
          <TextInput
            className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl text-base text-gray-900 dark:text-white min-h-[100px]"
            placeholder="Why do you feel this way? Or who are you eating with?"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
          />
        </View>
      </ScrollView>

      {/* Floating Save Button */}
      <View className="absolute bottom-6 left-6 right-6">
        <TouchableOpacity 
          className="bg-green-500 p-4 rounded-xl flex-row items-center justify-center shadow-lg"
          style={{ elevation: 5 }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-xl">Finish Logging</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
