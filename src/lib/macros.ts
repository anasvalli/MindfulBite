export interface MacroTargets {
  protein: number  // grams
  carbs: number    // grams
  fat: number      // grams
}

export function calculateMacroTargets(
  weightKg: number,
  goalWeightKg: number | null,
  calorieGoal: number
): MacroTargets {
  // Determine goal direction
  const isLosing = goalWeightKg !== null && goalWeightKg < weightKg
  const isGaining = goalWeightKg !== null && goalWeightKg > weightKg

  // Protein: higher for muscle gain, moderate for loss, standard for maintenance
  const proteinPerKg = isGaining ? 2.2 : isLosing ? 2.0 : 1.6
  const protein = Math.round(weightKg * proteinPerKg)

  // Fat: 28% of calories for loss, 30% for maintenance/gain
  const fatPct = isLosing ? 0.25 : 0.30
  const fat = Math.round((calorieGoal * fatPct) / 9)

  // Carbs: remaining calories
  const carbs = Math.round((calorieGoal - protein * 4 - fat * 9) / 4)

  return { protein: Math.max(protein, 50), carbs: Math.max(carbs, 50), fat: Math.max(fat, 30) }
}
