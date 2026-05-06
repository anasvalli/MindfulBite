import { supabase } from './supabase';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();

export async function fetchUserContext(userId: string) {
  // Fetch meals from last 30 days
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
  
  // Format context for the LLM
  const contextText = context.map((m: any) => {
    const macroStr = m.macros_json ? `P:${m.macros_json.protein}g C:${m.macros_json.carbs}g F:${m.macros_json.fat}g` : '';
    const moodStr = m.meal_moods && m.meal_moods.length > 0 ? `User felt: ${m.meal_moods[0].mood}` : '';
    return `Date: ${new Date(m.created_at).toLocaleDateString()}, Calories: ${m.total_calories || 'N/A'} ${macroStr}. ${moodStr}`;
  }).join(' | ');

  const systemPrompt = `You are MindfulBite, an expert virtual AI nutritionist and emotional wellness therapist. 
  You are highly empathetic, non-judgmental, validating, and precise.
  Always start your reply with emotional validation before giving expert dietary advice.
  Act as a mood therapist when the user is upset or vulnerable, but tightly integrate cognitive coping strategies with physical nutrition.
  
  User's recent 30-day logs:
  ${contextText}
  
  Rules:
  - DO NOT provide medical advice for critical illnesses.
  - BE EXTREMELY CONCISE. Your responses must be 2-3 short sentences MAX unless you are generating a structured meal plan. Keep formatting minimal to save generation time.
  - ALWAYS reply entirely in the following language: ${language}
  `;

  if (!GEMINI_API_KEY) {
    // Return mock response if no API key
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`I see you've had ${context.length} logged meals recently. I completely understand how managing nutrition can be tough. I'm here to support you! How can I help today?`);
      }, 1500);
    });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          ...chatHistory.filter((m: any) => m.id !== '1').map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.text }]
          })),
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini API explicitly returned an error:', data.error);
      throw new Error(data.error.message || 'Google API error');
    }

    if (data.candidates && data.candidates[0].content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    
    // Check if it got blocked by safety ratings
    if (data.candidates && data.candidates[0].finishReason === 'SAFETY') {
      return "I apologize, but I am unable to process that request due to my safety guidelines. Could you please rephrase?";
    }

    throw new Error('Invalid or empty Gemini API response structure. Payload: ' + JSON.stringify(data));
  } catch (error) {
    console.error('Gemini error:', error);
    return "I completely understand what you mean. However, I'm having trouble connecting right now. Let's chat more once I'm back online!";
  }
}

export async function generateMoodAIResponse(userId: string, userMessage: string, chatHistory: any[], language: string = 'English', mealName: string, mood: string) {
  const { data: userProfile } = await supabase.from('users').select('country').eq('id', userId).single();
  const country = userProfile?.country || 'their current location';

  const systemPrompt = `You are MindfulBite, an expert AI mood therapist and culinary psychologist.
  The user is currently living in: ${country}.
  They just logged eating: ${mealName}.
  They reported their current mood as: ${mood}.
  
  Your job is to connect their food choice, their geographical location, and their mood to provide a deeply empathetic, psychologically observant response.
  For example, if they are eating Indian food in the US and feeling sad/stressed, gently suggest they might be missing home or seeking nostalgic comfort. 
  If they are eating heavy fast food and feeling stressed, talk empathetically about stress-eating comfort food.
  
  Rules:
  - BE EXTREMELY CONCISE. 2-3 short sentences MAX.
  - Be highly empathetic, observant, and conversational.
  - DO NOT give strict nutritional breakdowns. Focus entirely on the emotional and cultural connection to the food.
  - ALWAYS reply entirely in the following language: ${language}
  `;

  if (!GEMINI_API_KEY) return "I see you just had " + mealName + " and are feeling " + mood + ". I'm here for you!";

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          ...chatHistory.filter((m: any) => m.id !== '1').map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.text }]
          })),
          { role: 'user', parts: [{ text: userMessage }] }
        ]
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0].content?.parts?.[0]?.text) {
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
    ? (goalWeight < currentWeight ? 'User wants to LOSE weight — space meals evenly, lighter dinner, no heavy food 2hrs before sleep.' 
       : goalWeight > currentWeight ? 'User wants to GAIN weight — include calorie-dense meals, a good-sized dinner is fine.'
       : 'User wants to MAINTAIN weight — balanced meal distribution.')
    : '';

  const systemPrompt = `You are a practical, highly empathetic, and budget-friendly AI nutritionist.
Your job is to generate a strictly formatted 1-day TIMED meal plan based on EXTREMELY EASY, realistic, everyday home-cooked food.
Target Calories: ~${cals} kcal.
Cultural Heritage / Dietary Preferences / Allergies: ${prefs}.
User Wake Time: ${wake}
User Sleep Time: ${sleep}
${weightContext}

RULES:
1. The meal recommendations MUST authentically map to the requested cultural ethnicity and strictly obey any listed allergies.
2. The meals MUST BE VERY USER-FRIENDLY. Suggest meals that take less than 20 minutes to make or can be easily bought. Do NOT suggest hardcore diets, raw foods, or extremely difficult recipes.
3. Keep the meals highly ACCESSIBLE, affordable, and common (what a normal middle-class person from that culture eats every day).
4. Provide EXACTLY 4 items in an array: Breakfast, Lunch, Dinner, Snacks.
5. Each meal MUST include a "time" field — a realistic scheduled time (e.g. "8:00 AM") that fits WITHIN the user's waking hours (${wake} to ${sleep}).
6. Schedule Breakfast shortly after wake time, Lunch around midday, Snacks in the afternoon, and Dinner at least 2 hours before sleep time.
7. You must translate the 'suggestion' text natively into: ${language}
8. DO NOT translate the 'name' key properties (leave them strictly as "Breakfast", "Lunch", "Dinner", "Snacks").
9. For the 'suggestion' field, provide ONLY the raw, simple name of the food (e.g. 'Scrambled eggs with toast' or 'Chicken biryani'). Do NOT write descriptions, adjectives, or sentences. Keep it extremely blunt and simple. DO NOT sugarcoat it.

You MUST return ONLY a raw JSON array of objects conforming to this exact shape:
[
  { "name": "Breakfast", "suggestion": "...", "kcal": 400, "emoji": "🥣", "time": "8:00 AM" },
  { "name": "Lunch", "suggestion": "...", "kcal": 600, "emoji": "🥗", "time": "1:00 PM" },
  { "name": "Dinner", "suggestion": "...", "kcal": 700, "emoji": "🍛", "time": "7:00 PM" },
  { "name": "Snacks", "suggestion": "...", "kcal": 300, "emoji": "🥜", "time": "4:30 PM" }
]`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: `Generate my authentic cultural meal plan with scheduled times. Make sure this plan is completely unique and different from previous days. Random seed: ${Date.now()}` }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

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

