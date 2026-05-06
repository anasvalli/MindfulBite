import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from './context/AuthContext';
import { supabase } from '../lib/supabase';
import { Check, Edit3, Trash2 } from 'lucide-react-native';

export default function MealCorrectionScreen() {
  const { imageUri, aiResult } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Initialize with AI detection results or mock
  const [items, setItems] = useState<any[]>(() => {
    if (aiResult) {
      try {
        const parsed = JSON.parse(String(aiResult));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Failed to parse aiResult');
      }
    }
    return [
      { id: '1', name: 'Grilled Chicken Breast', quantity: '200g', calories: 330, protein: 62, carbs: 0, fat: 7 },
      { id: '2', name: 'Brown Rice', quantity: '1 cup', calories: 215, protein: 5, carbs: 45, fat: 2 },
      { id: '3', name: 'Steamed Broccoli', quantity: '1 cup', calories: 55, protein: 4, carbs: 11, fat: 0 }
    ];
  });

  const totalCalories = items.reduce((acc, item) => acc + item.calories, 0);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    const macros = {
      protein: items.reduce((acc, i) => acc + i.protein, 0),
      carbs: items.reduce((acc, i) => acc + i.carbs, 0),
      fat: items.reduce((acc, i) => acc + i.fat, 0)
    };

    const { data, error } = await supabase.from('meals').insert({
      user_id: user.id,
      image_url: imageUri ? String(imageUri) : null,
      items_json: items,
      total_calories: totalCalories,
      macros_json: macros
    }).select().single();

    setLoading(false);

    if (error) {
      Alert.alert('Error saving meal', error.message);
      // fallback just push anyway for testing flow
      router.replace({ pathname: '/mood-picker', params: { mealId: 'mock-id', mealName: items[0]?.name || 'a meal' } });
    } else {
      router.replace({ pathname: '/mood-picker', params: { mealId: data.id, mealName: items[0]?.name || 'a meal' } });
    }
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-zinc-900">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header Image */}
        {imageUri ? (
          <Image source={{ uri: String(imageUri) }} className="w-full h-64 bg-gray-200" resizeMode="cover" />
        ) : (
          <View className="w-full h-64 bg-green-900 items-center justify-center">
            <Text className="text-white text-lg font-bold">Image Preview</Text>
          </View>
        )}

        <View className="p-6 -mt-6 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-sm">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-2">AI Estimated Meal</Text>
          <Text className="text-gray-500 dark:text-gray-400 mb-6">Review and correct the detected items.</Text>

          <View className="flex-row justify-between mb-6 bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-900/50">
            <View>
              <Text className="text-sm text-green-700 dark:text-green-400 font-semibold mb-1">Total Calories</Text>
              <Text className="text-3xl font-black text-green-600">{totalCalories}</Text>
            </View>
            <View className="justify-end items-end">
              <Text className="text-gray-500 dark:text-gray-400 text-sm">P: {items.reduce((a,b)=>a+b.protein,0)}g</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-sm">C: {items.reduce((a,b)=>a+b.carbs,0)}g</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-sm">F: {items.reduce((a,b)=>a+b.fat,0)}g</Text>
            </View>
          </View>

          {items.map((item) => (
            <View key={item.id} className="mb-4 bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl flex-row justify-between items-center shadow-sm">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-gray-900 dark:text-white mb-1">{item.name}</Text>
                <Text className="text-gray-500 dark:text-gray-400">{item.quantity} • {item.calories} kcal</Text>
              </View>
              <View className="flex-row">
                <TouchableOpacity className="p-2 mr-2 bg-white dark:bg-zinc-700 rounded-full shadow-sm">
                  <Edit3 color="#6b7280" size={20} />
                </TouchableOpacity>
                <TouchableOpacity className="p-2 bg-red-50 dark:bg-red-900/20 rounded-full" onPress={() => removeItem(item.id)}>
                  <Trash2 color="#ef4444" size={20} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity className="py-4 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-2xl items-center mt-2">
            <Text className="text-gray-500 dark:text-gray-400 font-semibold">+ Add Missing Item</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Save Button */}
      <View className="absolute bottom-6 left-6 right-6">
        <TouchableOpacity 
          className="bg-green-500 p-4 rounded-2xl flex-row items-center justify-center shadow-lg"
          style={{ elevation: 5 }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" className="mr-2" />
          ) : (
            <Check color="white" size={24} className="mr-2" />
          )}
          <Text className="text-white font-bold text-xl">Confirm & Log Meal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
