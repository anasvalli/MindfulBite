import { supabase } from './supabase';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

const FAST_CONFIG = {
  thinkingConfig: { thinkingBudget: 0 },
};

export async function fetchUserContext(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: meals } = await supabase
    .from('meals')
    .select('*, meal_moods(*)')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  return meals || [];
}

export async function generateAIResponse(userId: string, userMessage: string, chatHistory: any[], language: string = 'English') {
  const context = await fetchUserContext(userId);

  const contextText = context.map((m: any) => {
    const macroStr = m.macros_json ? `P:${m.macros_json.protein}g C:${m.macros_json.carbs}g F:${m.macros_json.fat}g` : '';
    const moodStr = m.meal_moods && m.meal_moods.length > 0 ? `Mood: ${m.meal_moods[0].mood}` : '';
    return `${new Date(m.created_at).toLocaleDateString()}: ${m.total_calories || '?'} kcal ${macroStr} ${moodStr}`;
  }).join(' | ');

  const systemPrompt = `You are MindfulBite, an expert AI nutritionist and emotional wellness coach. Be empathetic, non-judgmental, and concise.
Start with emotional validation before giving dietary advice. Act as a mood therapist when the user is upset.

User's recent 30-day logs: ${contextText}

Rules:
- No medical advice for critical illnesses.
- BE EXTREMELY CONCISE: 2-3 short sentences MAX unless generating a structured meal plan.
- Reply entirely in: ${language}`;

  if (!GEMINI_API_KEY) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`I see you've had ${context.length} logged meals recently. I'm here to support you! How can I help today?`);
      }, 1500);
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...chatHistory.filter((m: any) => m.id !== '1').map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.text }],
            })),
            { role: 'user', parts: [{ text: userMessage }] },
          ],
          generationConfig: { ...FAST_CONFIG, maxOutputTokens: 300 },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API error:', data.error);
      throw new Error(data.error.message || 'Google API error');
    }

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }

    if (data.candidates?.[0]?.finishReason === 'SAFETY') {
      return "I apologize, but I'm unable to process that request due to safety guidelines. Could you rephrase?";
    }

    throw new Error('Invalid Gemini response: ' + JSON.stringify(data));
  } catch (error) {
    console.error('Gemini error:', error);
    return "I'm having trouble connecting right now. Let's chat more once I'm back online!";
  }
}

export async function generateMoodAIResponse(userId: string, userMessage: string, chatHistory: any[], language: string = 'English', mealName: string, mood: string) {
  const { data: userProfile } = await supabase.from('users').select('country').eq('id', userId).single();
  const country = userProfile?.country || 'their current location';

  const systemPrompt = `You are MindfulBite, an AI mood therapist and culinary psychologist.
User location: ${country}. Just ate: ${mealName}. Current mood: ${mood}.
Connect their food, location, and mood empathetically. E.g. if eating Indian food in US while sad, suggest homesickness.
Rules: 2-3 sentences MAX. Empathetic and conversational. No nutritional breakdowns. Reply in: ${language}`;

  if (!GEMINI_API_KEY) return `I see you just had ${mealName} and are feeling ${mood}. I'm here for you!`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...chatHistory.filter((m: any) => m.id !== '1').map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.text }],
            })),
            { role: 'user', parts: [{ text: userMessage }] },
          ],
          generationConfig: { ...FAST_CONFIG, maxOutputTokens: 200 },
        }),
      }
    );

    const data = await response.json();
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    return "I hear you. Let's talk more about how that meal made you feel.";
  } catch (error) {
    console.error('Gemini error:', error);
    return "I'm having trouble connecting right now, but I want to hear more about how you're feeling soon.";
  }
}

export async function buildEthnicityMealPlan(userId: string, language: string = 'English', wakeTime?: string, sleepTime?: string) {
  if (!GEMINI_API_KEY) return null;

  const { data: userProfile } = await supabase.from('users').select('*').eq('id', userId).single();
  const cals = userProfile?.daily_calorie_goal || 2000;
  const prefs = userProfile?.dietary_prefs || 'None';
  const wake = wakeTime || userProfile?.wake_time || '7:00 AM';
  const sleep = sleepTime || userProfile?.sleep_time || '11:00 PM';
  const goalWeight = userProfile?.goal_weight || null;
  const currentWeight = userProfile?.weight || null;
  const weightContext = (goalWeight && currentWeight)
    ? (goalWeight < currentWeight ? 'Goal: LOSE weight — lighter dinner, no heavy food 2hrs before sleep.'
      : goalWeight > currentWeight ? 'Goal: GAIN weight — calorie-dense meals, good dinner ok.'
      : 'Goal: MAINTAIN weight.')
    : '';

  const systemPrompt = `You are a practical AI nutritionist. Generate a 1-day timed meal plan.
Calories: ~${cals} kcal. Preferences/Allergies/Ethnicity: ${prefs}.
Wake: ${wake}. Sleep: ${sleep}. ${weightContext}

Rules:
1. Meals must match the cultural ethnicity and respect allergies.
2. Easy meals only — under 20 min or easily bought. No hardcore diets.
3. Exactly 4 items: Breakfast, Lunch, Dinner, Snacks.
4. Each meal needs a "time" field within waking hours.
5. Schedule: Breakfast after wake, Lunch midday, Snacks afternoon, Dinner 2+ hrs before sleep.
6. Translate "suggestion" text to: ${language}. Keep "name" keys in English.
7. "suggestion" = plain food name only (e.g. "Scrambled eggs with toast"). No descriptions.

Return ONLY a raw JSON array:
[
  {"name":"Breakfast","suggestion":"...","kcal":400,"emoji":"🥣","time":"8:00 AM"},
  {"name":"Lunch","suggestion":"...","kcal":600,"emoji":"🥗","time":"1:00 PM"},
  {"name":"Dinner","suggestion":"...","kcal":700,"emoji":"🍛","time":"7:00 PM"},
  {"name":"Snacks","suggestion":"...","kcal":300,"emoji":"🥜","time":"4:30 PM"}
]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: `Generate meal plan. Seed: ${Date.now()}` }] }],
          generationConfig: {
            ...FAST_CONFIG,
            response_mime_type: 'application/json',
            maxOutputTokens: 500,
          },
        }),
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const startIndex = rawJson.indexOf('[');
    const endIndex = rawJson.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      rawJson = rawJson.substring(startIndex, endIndex + 1);
    }

    return JSON.parse(rawJson);
  } catch (error) {
    console.error('Meal Gen Error:', error);
    return null;
  }
}
