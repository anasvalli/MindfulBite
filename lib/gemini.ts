export async function analyzeFoodImage(base64Image: string) {
  const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

const prompt = `
You are an expert AI nutritionist with absolute visual precision. I am providing an image of a meal.
1. Identify the food items present in the image with COMPLETE accuracy. You must precisely distinguish exact foods (e.g., if it is Naan vs Pita, differentiate it. If it is grilled salmon vs fried, state it).
2. Recognize and adapt to ANY cuisine from around the world. Identify the exact regional origin or cultural name of the dish (e.g., Palak Paneer, Authentic Tacos al Pastor, Sushi).
3. Estimate the exact portion size/quantity visible.
4. Calculate a HIGHLY ACCURATE estimation of calories, protein (g), carbs (g), and fat (g) for each identified item. Do not give ranges. Give absolute numbers based on the visual portion.
5. Do not guess vaguely; use standard, strict nutritional data for the specific dish you visually identify.

Return ONLY a valid JSON array of objects representing each food item. Do not include markdown formatting like \`\`\`json. 
The JSON array MUST exactly follow this structure:
[
  {
    "id": "unique-string-1",
    "name": "string (e.g., Grilled Salmon)",
    "quantity": "string (e.g., 6 oz)",
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number
  }
]
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          response_mime_type: "application/json",
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Error:', errorData);
      throw new Error('Failed to analyze food image.');
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('No valid response from AI.');
    }

    try {
      const items = JSON.parse(textResponse);
      return items;
    } catch (e) {
      console.error('Failed to parse JSON response:', textResponse);
      throw new Error('AI response was not valid JSON.');
    }
  } catch (error) {
    console.error('Error in analyzeFoodImage:', error);
    throw error;
  }
}
