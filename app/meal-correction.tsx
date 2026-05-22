import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from './context/AuthContext';
import { usePurchases } from './context/PurchasesContext';
import { useAppTheme } from './context/ThemeContext';
import { supabase } from '../lib/supabase';
import { Check, Edit3, Trash2, Plus, X } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';

interface FoodItem {
  id: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const EMPTY_ITEM: Omit<FoodItem, 'id'> = { name: '', quantity: '', calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function MealCorrectionScreen() {
  const { imageUri, aiResult, cameraLimitKey } = useLocalSearchParams();
  const { user } = useAuth();
  const { tier } = usePurchases();
  const { resolvedScheme } = useAppTheme();
  const isDark = resolvedScheme === 'dark';
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<FoodItem[]>(() => {
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
      { id: '3', name: 'Steamed Broccoli', quantity: '1 cup', calories: 55, protein: 4, carbs: 11, fat: 0 },
    ];
  });

  // Edit modal state
  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [editForm, setEditForm] = useState<Omit<FoodItem, 'id'>>(EMPTY_ITEM);

  // Add modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<Omit<FoodItem, 'id'>>(EMPTY_ITEM);

  const totalCalories = items.reduce((acc, item) => acc + Number(item.calories), 0);
  const totalProtein = items.reduce((acc, i) => acc + Number(i.protein), 0);
  const totalCarbs = items.reduce((acc, i) => acc + Number(i.carbs), 0);
  const totalFat = items.reduce((acc, i) => acc + Number(i.fat), 0);

  // ── Colors ──────────────────────────────────────────────────────────────────
  const bg = isDark ? '#09090B' : '#F8FAFC';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const itemBg = isDark ? '#0F172A' : '#F8FAFC';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const inputBg = isDark ? '#1E293B' : '#FFFFFF';

  // ── Handlers ────────────────────────────────────────────────────────────────
  const openEdit = (item: FoodItem) => {
    setEditingItem(item);
    setEditForm({ name: item.name, quantity: item.quantity, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat });
  };

  const saveEdit = () => {
    if (!editingItem) return;
    setItems(prev => prev.map(i => i.id === editingItem.id ? { ...editForm, id: editingItem.id } : i));
    setEditingItem(null);
  };

  const saveAdd = () => {
    if (!addForm.name.trim()) {
      Alert.alert('Missing Name', 'Please enter a food name.');
      return;
    }
    setItems(prev => [...prev, { ...addForm, id: String(Date.now()) }]);
    setAddForm(EMPTY_ITEM);
    setAddModalOpen(false);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    const macros = { protein: totalProtein, carbs: totalCarbs, fat: totalFat };

    const { data, error } = await supabase.from('meals').insert({
      user_id: user.id,
      image_url: imageUri ? String(imageUri) : null,
      items_json: items,
      total_calories: totalCalories,
      macros_json: macros,
    }).select().single();

    if (!error && tier === 'Basic' && cameraLimitKey) {
      const key = String(cameraLimitKey);
      const val = await SecureStore.getItemAsync(key);
      const current = val ? parseInt(val) : 0;
      await SecureStore.setItemAsync(key, String(current + 1));
    }

    setLoading(false);

    if (error) {
      Alert.alert('Error saving meal', error.message);
      router.replace({ pathname: '/mood-picker', params: { mealId: 'mock-id', mealName: items[0]?.name || 'a meal' } });
    } else {
      router.replace({ pathname: '/mood-picker', params: { mealId: data.id, mealName: items[0]?.name || 'a meal' } });
    }
  };

  // ── Item Form (shared by edit + add modals) ──────────────────────────────────
  const ItemForm = ({ form, setForm }: { form: Omit<FoodItem, 'id'>; setForm: (f: Omit<FoodItem, 'id'>) => void }) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ gap: 10 }}>
        <View>
          <Text style={[styles.label, { color: textSecondary }]}>Food Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
            value={form.name}
            onChangeText={v => setForm({ ...form, name: v })}
            placeholder="e.g. Grilled Salmon"
            placeholderTextColor="#94A3B8"
          />
        </View>
        <View>
          <Text style={[styles.label, { color: textSecondary }]}>Quantity / Serving</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
            value={form.quantity}
            onChangeText={v => setForm({ ...form, quantity: v })}
            placeholder="e.g. 200g or 1 cup"
            placeholderTextColor="#94A3B8"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([['Calories', 'calories'], ['Protein (g)', 'protein'], ['Carbs (g)', 'carbs'], ['Fat (g)', 'fat']] as [string, keyof Omit<FoodItem, 'id' | 'name' | 'quantity'>][]).map(([label, key]) => (
            <View key={key} style={{ flex: 1 }}>
              <Text style={[styles.label, { color: textSecondary, fontSize: 10 }]}>{label}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBg, color: textPrimary, borderColor, paddingHorizontal: 8 }]}
                value={String(form[key] ?? '')}
                onChangeText={v => setForm({ ...form, [key]: parseFloat(v) || 0 })}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
            </View>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {imageUri ? (
          <Image source={{ uri: String(imageUri) }} style={{ width: '100%', height: 256, backgroundColor: '#1E293B' }} resizeMode="cover" />
        ) : (
          <View style={{ width: '100%', height: 256, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Image Preview</Text>
          </View>
        )}

        <View style={{ padding: 24, marginTop: -24, backgroundColor: cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: textPrimary, marginBottom: 4 }}>AI Estimated Meal</Text>
          <Text style={{ color: textSecondary, marginBottom: 20 }}>Review and correct the detected items.</Text>

          {/* Totals */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20,
            backgroundColor: 'rgba(111,175,79,0.1)', padding: 16, borderRadius: 16,
            borderWidth: 1, borderColor: 'rgba(111,175,79,0.2)'
          }}>
            <View>
              <Text style={{ fontSize: 12, color: '#6FAF4F', fontWeight: '700', marginBottom: 4 }}>Total Calories</Text>
              <Text style={{ fontSize: 30, fontWeight: '900', color: '#6FAF4F' }}>{totalCalories}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              <Text style={{ color: textSecondary, fontSize: 12 }}>P: {totalProtein}g</Text>
              <Text style={{ color: textSecondary, fontSize: 12 }}>C: {totalCarbs}g</Text>
              <Text style={{ color: textSecondary, fontSize: 12 }}>F: {totalFat}g</Text>
            </View>
          </View>

          {/* Food Items */}
          {items.map((item) => (
            <View key={item.id} style={{
              marginBottom: 12, backgroundColor: itemBg, padding: 16,
              borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary, marginBottom: 2 }}>{item.name}</Text>
                <Text style={{ color: textSecondary, fontSize: 13 }}>{item.quantity} • {item.calories} kcal</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => openEdit(item)}
                  style={{ padding: 8, backgroundColor: isDark ? '#334155' : '#FFFFFF', borderRadius: 20 }}
                >
                  <Edit3 color={textSecondary} size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeItem(item.id)}
                  style={{ padding: 8, backgroundColor: 'rgba(244,63,94,0.08)', borderRadius: 20 }}
                >
                  <Trash2 color="#f43f5e" size={18} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Add Missing Item */}
          <TouchableOpacity
            onPress={() => { setAddForm(EMPTY_ITEM); setAddModalOpen(true); }}
            style={{
              borderWidth: 2, borderStyle: 'dashed', borderColor: isDark ? '#334155' : '#CBD5E1',
              borderRadius: 18, paddingVertical: 16, alignItems: 'center', marginTop: 4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Plus color="#6FAF4F" size={18} />
              <Text style={{ color: '#6FAF4F', fontWeight: '700', fontSize: 15 }}>Add Missing Item</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
        <TouchableOpacity
          style={{
            backgroundColor: '#6FAF4F', padding: 18, borderRadius: 18,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#6FAF4F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
          }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="white" style={{ marginRight: 8 }} /> : <Check color="white" size={22} style={{ marginRight: 8 }} />}
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 18 }}>Confirm & Log Meal</Text>
        </TouchableOpacity>
      </View>

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      <Modal visible={!!editingItem} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: textPrimary }}>Edit Food Item</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)}>
                <X color={textSecondary} size={24} />
              </TouchableOpacity>
            </View>
            <ItemForm form={editForm} setForm={setEditForm} />
            <TouchableOpacity
              onPress={saveEdit}
              style={{ backgroundColor: '#6FAF4F', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 20 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Add Modal ──────────────────────────────────────────────────────────── */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: cardBg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: textPrimary }}>Add Food Item</Text>
              <TouchableOpacity onPress={() => setAddModalOpen(false)}>
                <X color={textSecondary} size={24} />
              </TouchableOpacity>
            </View>
            <ItemForm form={addForm} setForm={setAddForm} />
            <TouchableOpacity
              onPress={saveAdd}
              style={{ backgroundColor: '#6FAF4F', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 20 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
});
