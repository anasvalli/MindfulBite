import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from './context/AuthContext';
import { usePurchases } from './context/PurchasesContext';
import { supabase } from '../lib/supabase';
import { Check, Edit3, Trash2, Plus, X, ChevronLeft, Zap } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { A6 } from '../lib/theme';
import { Glass, SectionLabel } from '../components/ui/A6';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FoodItem {
  id: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const EMPTY_ITEM: Omit<FoodItem, 'id'> = {
  name: '',
  quantity: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
};

export default function MealCorrectionScreen() {
  const { imageUri, aiResult, cameraLimitKey } = useLocalSearchParams();
  const { user } = useAuth();
  const { tier } = usePurchases();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<FoodItem[]>(() => {
    if (aiResult) {
      try {
        const parsed = JSON.parse(String(aiResult));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [
      { id: '1', name: 'Grilled Chicken Breast', quantity: '200g', calories: 330, protein: 62, carbs: 0, fat: 7 },
      { id: '2', name: 'Brown Rice', quantity: '1 cup', calories: 215, protein: 5, carbs: 45, fat: 2 },
      { id: '3', name: 'Steamed Broccoli', quantity: '1 cup', calories: 55, protein: 4, carbs: 11, fat: 0 },
    ];
  });

  const [editingItem, setEditingItem] = useState<FoodItem | null>(null);
  const [editForm, setEditForm] = useState<Omit<FoodItem, 'id'>>(EMPTY_ITEM);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<Omit<FoodItem, 'id'>>(EMPTY_ITEM);

  const totalCalories = items.reduce((a, i) => a + Number(i.calories), 0);
  const totalProtein = items.reduce((a, i) => a + Number(i.protein), 0);
  const totalCarbs = items.reduce((a, i) => a + Number(i.carbs), 0);
  const totalFat = items.reduce((a, i) => a + Number(i.fat), 0);

  const openEdit = (item: FoodItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      quantity: item.quantity,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });
  };

  const saveEdit = () => {
    if (!editingItem) return;
    setItems((prev) =>
      prev.map((i) => (i.id === editingItem.id ? { ...editForm, id: editingItem.id } : i))
    );
    setEditingItem(null);
  };

  const saveAdd = () => {
    if (!addForm.name.trim()) {
      Alert.alert('Missing Name', 'Please enter a food name.');
      return;
    }
    setItems((prev) => [...prev, { ...addForm, id: String(Date.now()) }]);
    setAddForm(EMPTY_ITEM);
    setAddModalOpen(false);
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    const macros = { protein: totalProtein, carbs: totalCarbs, fat: totalFat };

    const { data, error } = await supabase
      .from('meals')
      .insert({
        user_id: user.id,
        image_url: imageUri ? String(imageUri) : null,
        items_json: items,
        total_calories: totalCalories,
        macros_json: macros,
      })
      .select()
      .single();

    if (!error && tier === 'Basic' && cameraLimitKey) {
      const key = String(cameraLimitKey);
      const val = await SecureStore.getItemAsync(key);
      const current = val ? parseInt(val) : 0;
      await SecureStore.setItemAsync(key, String(current + 1));
    }

    setLoading(false);
    if (error) {
      Alert.alert('Error saving meal', error.message);
      router.replace({
        pathname: '/mood-picker',
        params: { mealId: 'mock-id', mealName: items[0]?.name || 'a meal' },
      });
    } else {
      router.replace({
        pathname: '/mood-picker',
        params: { mealId: data.id, mealName: items[0]?.name || 'a meal' },
      });
    }
  };

  const inputStyle = {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: A6.inputBg,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    color: A6.fg1,
    fontSize: 14,
  } as const;

  const formLabelStyle = {
    fontSize: 11,
    color: A6.fg2,
    fontWeight: '600' as const,
    marginBottom: 6,
    marginLeft: 2,
  };

  const renderForm = (form: Omit<FoodItem, 'id'>, setForm: (f: Omit<FoodItem, 'id'>) => void) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ gap: 10 }}>
        <View>
          <Text style={formLabelStyle}>Food Name</Text>
          <TextInput
            style={inputStyle}
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
            placeholder="e.g. Grilled Salmon"
            placeholderTextColor={A6.fg3}
          />
        </View>
        <View>
          <Text style={formLabelStyle}>Quantity / Serving</Text>
          <TextInput
            style={inputStyle}
            value={form.quantity}
            onChangeText={(v) => setForm({ ...form, quantity: v })}
            placeholder="e.g. 200g or 1 cup"
            placeholderTextColor={A6.fg3}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              ['Cal', 'calories'],
              ['P (g)', 'protein'],
              ['C (g)', 'carbs'],
              ['F (g)', 'fat'],
            ] as [string, keyof Omit<FoodItem, 'id' | 'name' | 'quantity'>][]
          ).map(([label, key]) => (
            <View key={key} style={{ flex: 1 }}>
              <Text style={[formLabelStyle, { fontSize: 10 }]}>{label}</Text>
              <TextInput
                style={{ ...inputStyle, paddingHorizontal: 8, textAlign: 'center' }}
                value={String(form[key] ?? '')}
                onChangeText={(v) => setForm({ ...form, [key]: parseFloat(v) || 0 })}
                keyboardType="numeric"
                placeholderTextColor={A6.fg3}
              />
            </View>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: A6.bgInk }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Top bar */}
        <View
          style={{
            paddingTop: 50 + insets.top * 0.3,
            paddingHorizontal: 20,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: A6.fgFaint,
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ChevronLeft color={A6.fg1} size={18} strokeWidth={1.8} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '600',
                letterSpacing: -0.3,
                color: A6.fg1,
              }}>
              Confirm meal
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <Zap size={10} color={A6.primaryLight} fill={A6.primaryLight} />
              <Text style={{ fontSize: 11, color: A6.fg2 }}>
                AI detected {items.length} item{items.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Snapshot preview */}
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
          <View
            style={{
              height: 200,
              borderRadius: 20,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.1)',
              backgroundColor: '#1a1410',
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 16 },
                  shadowOpacity: 0.4,
                  shadowRadius: 30,
                },
                android: { elevation: 8 },
              }),
            }}>
            {imageUri ? (
              <Image
                source={{ uri: String(imageUri) }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: A6.fg2, fontSize: 14 }}>Image Preview</Text>
              </View>
            )}
          </View>
        </View>

        {/* Total card */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <Glass style={{ padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 2,
                    color: A6.fg2,
                    textTransform: 'uppercase',
                  }}>
                  Total
                </Text>
                <Text
                  style={{
                    fontSize: 32,
                    fontWeight: '400',
                    letterSpacing: -1,
                    color: A6.primaryLight,
                    fontVariant: ['tabular-nums'],
                    marginTop: 4,
                  }}>
                  {totalCalories}
                </Text>
                <Text style={{ fontSize: 11, color: A6.fg2, marginTop: 2 }}>kcal</Text>
              </View>
              <View
                style={{
                  flex: 1,
                  marginLeft: 16,
                  flexDirection: 'row',
                  gap: 6,
                }}>
                {(
                  [
                    { l: 'P', v: totalProtein, c: A6.secondary },
                    { l: 'C', v: totalCarbs, c: A6.primaryLight },
                    { l: 'F', v: totalFat, c: A6.warn },
                  ] as const
                ).map((m) => (
                  <View
                    key={m.l}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: `${m.c}1A`,
                      borderWidth: 0.5,
                      borderColor: `${m.c}44`,
                      alignItems: 'center',
                    }}>
                    <Text style={{ fontSize: 10, color: m.c, fontWeight: '700', letterSpacing: 0.5 }}>
                      {m.l}
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: A6.fg1,
                        marginTop: 3,
                        fontVariant: ['tabular-nums'],
                      }}>
                      {Math.round(m.v)}g
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </Glass>
        </View>

        {/* Items list */}
        <View style={{ paddingHorizontal: 20 }}>
          <SectionLabel
            right={
              <TouchableOpacity
                onPress={() => {
                  setAddForm(EMPTY_ITEM);
                  setAddModalOpen(true);
                }}>
                <Text style={{ fontSize: 11, color: A6.primaryLight, fontWeight: '600' }}>
                  + Add item
                </Text>
              </TouchableOpacity>
            }>
            Detected items
          </SectionLabel>

          {items.map((item) => (
            <Glass key={item.id} style={{ marginBottom: 8 }}>
              <View style={{ padding: 14 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: A6.fg1, marginBottom: 3 }}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: A6.fg2 }}>
                      {item.quantity}  ·  P {item.protein}g  ·  C {item.carbs}g  ·  F {item.fat}g
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: A6.fg1,
                      fontVariant: ['tabular-nums'],
                    }}>
                    {item.calories}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                  }}>
                  <TouchableOpacity
                    onPress={() => openEdit(item)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 9,
                      backgroundColor: A6.fgFaint,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}>
                    <Edit3 color={A6.fg2} size={12} strokeWidth={1.7} />
                    <Text style={{ fontSize: 11, color: A6.fg2, fontWeight: '600' }}>Edit</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    onPress={() => removeItem(item.id)}
                    style={{
                      padding: 7,
                      borderRadius: 9,
                      backgroundColor: `${A6.danger}1A`,
                      borderWidth: 0.5,
                      borderColor: `${A6.danger}33`,
                    }}>
                    <Trash2 color={A6.danger} size={14} strokeWidth={1.7} />
                  </TouchableOpacity>
                </View>
              </View>
            </Glass>
          ))}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 28 + insets.bottom * 0.3,
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(255,255,255,0.08)',
        }}>
        <BlurView
          intensity={30}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(2,16,21,0.8)',
          }}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={{
              flex: 1,
              padding: 16,
              borderRadius: 16,
              backgroundColor: A6.fgFaint,
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
            }}>
            <Text style={{ color: A6.fg2, fontSize: 14, fontWeight: '600' }}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
            style={{
              flex: 2,
              borderRadius: 16,
              overflow: 'hidden',
              ...Platform.select({
                ios: {
                  shadowColor: A6.primary,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.5,
                  shadowRadius: 22,
                },
                android: { elevation: 8 },
              }),
            }}>
            <LinearGradient
              colors={[A6.primary, A6.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                padding: 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
              }}>
              {loading ? (
                <ActivityIndicator color={A6.bgInk} />
              ) : (
                <Check color={A6.bgInk} size={18} strokeWidth={2.2} />
              )}
              <Text style={{ color: A6.bgInk, fontWeight: '800', fontSize: 15 }}>
                Log {totalCalories} kcal
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit modal */}
      <Modal visible={!!editingItem} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View
            style={{
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              overflow: 'hidden',
              borderTopWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.12)',
            }}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ backgroundColor: 'rgba(2,16,21,0.92)', padding: 24, paddingBottom: 36 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: A6.fg1 }}>Edit item</Text>
                <TouchableOpacity onPress={() => setEditingItem(null)}>
                  <X color={A6.fg2} size={22} />
                </TouchableOpacity>
              </View>
              {renderForm(editForm, setEditForm)}
              <TouchableOpacity
                onPress={saveEdit}
                activeOpacity={0.85}
                style={{ marginTop: 18, borderRadius: 14, overflow: 'hidden' }}>
                <LinearGradient
                  colors={[A6.primary, A6.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: A6.bgInk, fontWeight: '800', fontSize: 15 }}>
                    Save Changes
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add modal */}
      <Modal visible={addModalOpen} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View
            style={{
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              overflow: 'hidden',
              borderTopWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.12)',
            }}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ backgroundColor: 'rgba(2,16,21,0.92)', padding: 24, paddingBottom: 36 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: A6.fg1 }}>Add food item</Text>
                <TouchableOpacity onPress={() => setAddModalOpen(false)}>
                  <X color={A6.fg2} size={22} />
                </TouchableOpacity>
              </View>
              {renderForm(addForm, setAddForm)}
              <TouchableOpacity
                onPress={saveAdd}
                activeOpacity={0.85}
                style={{ marginTop: 18, borderRadius: 14, overflow: 'hidden' }}>
                <LinearGradient
                  colors={[A6.primary, A6.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    padding: 14,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                  }}>
                  <Plus color={A6.bgInk} size={16} strokeWidth={2.5} />
                  <Text style={{ color: A6.bgInk, fontWeight: '800', fontSize: 15 }}>
                    Add Item
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
