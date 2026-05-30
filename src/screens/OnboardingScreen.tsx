import React, { useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Ring } from '../components/ui'
import { calculateMacroTargets } from '../lib/macros'

interface OnboardingScreenProps {
  go: (screen: string) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIETARY_PREFS = [
  'None', 'Vegetarian', 'Vegan', 'Pescatarian',
  'Gluten-Free', 'Dairy-Free', 'Halal', 'Kosher',
  'Keto', 'Paleo', 'Low-carb', 'Low-fat',
]

const ALLERGIES = [
  'None', 'Tree Nuts', 'Peanuts', 'Dairy',
  'Gluten', 'Shellfish', 'Eggs', 'Soy', 'Fish', 'Sesame',
]

const CUISINES = [
  'South Asian', 'East Asian', 'Southeast Asian', 'Middle Eastern',
  'Mediterranean', 'Central Asian', 'African', 'North African',
  'Caribbean', 'European', 'Eastern European', 'Nordic',
  'Latin American', 'North American', 'Pacific Islander',
  'Mixed/Fusion', 'Other',
]

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Pakistan', 'India',
  'Bangladesh', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain',
  'Oman', 'Egypt', 'Turkey', 'Indonesia', 'Malaysia', 'Singapore', 'Philippines',
  'China', 'Japan', 'South Korea', 'Thailand', 'Vietnam', 'Germany', 'France',
  'Italy', 'Spain', 'Netherlands', 'Belgium', 'Sweden', 'Norway', 'Denmark',
  'Poland', 'Russia', 'Brazil', 'Mexico', 'Argentina', 'South Africa', 'Nigeria',
  'Kenya', 'Morocco', 'New Zealand', 'Ireland', 'Switzerland', 'Austria', 'Portugal',
  'Greece', 'Sri Lanka', 'Nepal', 'Other',
]

const ACTIVITY_LEVELS = [
  { key: 'sedentary' as const, emoji: '🪑', label: 'Sedentary', desc: 'Desk job, minimal exercise' },
  { key: 'light' as const, emoji: '🚶', label: 'Light', desc: 'Light exercise 1-3 days/week' },
  { key: 'moderate' as const, emoji: '🏃', label: 'Moderate', desc: 'Exercise 3-5 days/week' },
  { key: 'active' as const, emoji: '💪', label: 'Active', desc: 'Hard exercise 6-7 days/week' },
]

type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'active'
type GenderKey = 'Male' | 'Female' | 'Non-binary' | 'Prefer not to say'
type HeightUnit = 'CM' | 'FT'
type WeightUnit = 'KG' | 'LBS'

const ACTIVITY_MULTIPLIERS: Record<ActivityKey, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
}

function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Overweight'
  return 'Obese'
}

function calcAge(dob: string): number {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function maxDobDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 13)
  return d.toISOString().split('T')[0]
}

function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * 2.54)
}

function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = cm / 2.54
  const ft = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches % 12)
  return { ft, inches }
}

// ─── Shared sub-styles ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  padding: '13px 16px',
  fontFamily: 'var(--sans)',
  fontSize: 15,
  color: 'var(--text)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-dim)',
  marginBottom: 8,
  display: 'block',
}

// ─── Chip component ──────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
  small,
}: {
  label: string
  selected: boolean
  onClick?: () => void
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: small ? '5px 10px' : '8px 14px',
        borderRadius: 24,
        border: selected ? '1px solid var(--accent-line)' : '1px solid var(--line)',
        background: selected ? 'var(--accent-wash)' : 'var(--surface-2)',
        color: selected ? 'var(--accent)' : 'var(--text-muted)',
        fontFamily: 'var(--sans)',
        fontSize: small ? 12 : 13,
        fontWeight: selected ? 600 : 400,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </button>
  )
}

// ─── Segmented control ────────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--surface-2)',
        borderRadius: 12,
        padding: 3,
        border: '1px solid var(--line)',
        width: 'fit-content',
      }}
    >
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '6px 14px',
            borderRadius: 9,
            border: 'none',
            background: value === opt ? 'var(--accent)' : 'transparent',
            color: value === opt ? 'var(--on-accent)' : 'var(--text-dim)',
            fontFamily: 'var(--sans)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ─── Progress dots (module-level — stable reference) ─────────────────────────

function ProgressDots({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 4, paddingBottom: 8 }}>
      {[1, 2, 3, 4].map((s) => (
        <div
          key={s}
          style={{
            width: s === step ? 20 : 7,
            height: 7,
            borderRadius: 4,
            background: s <= step ? 'var(--accent)' : 'var(--surface-2)',
            border: s <= step ? 'none' : '1px solid var(--line)',
            transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  )
}

// ─── Shared button components (module-level — stable references) ──────────────

function ContinueButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        height: 52,
        background: disabled ? 'var(--accent-wash)' : 'var(--accent)',
        color: disabled ? 'var(--text-dim)' : 'var(--on-accent)',
        border: 'none',
        borderRadius: 18,
        fontFamily: 'var(--sans)',
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        fontFamily: 'var(--sans)',
        fontSize: 13,
        cursor: 'pointer',
        padding: '4px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      ← Back
    </button>
  )
}

function StepHeading({ title, subtitle, back }: { title: string; subtitle: string; back?: () => void }) {
  return (
    <div>
      {back && <BackLink onClick={back} />}
      <h1
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--text)',
          letterSpacing: '-0.02em',
          margin: back ? '8px 0 6px' : '0 0 6px',
          lineHeight: 1.15,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 14,
          color: 'var(--text-muted)',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </p>
    </div>
  )
}

// ─── Summary item helper (module-level — stable reference) ────────────────────

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          margin: 0,
          marginBottom: 3,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 14,
          color: 'var(--text)',
          margin: 0,
          fontWeight: 500,
        }}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Step 1 props & component (module-level — stable reference) ───────────────

interface Step1Props {
  firstName: string
  lastName: string
  formUsername: string
  dob: string
  formGender: GenderKey
  calculatedAge: number | null
  setFirstName: (v: string) => void
  setLastName: (v: string) => void
  setFormUsername: (v: string) => void
  setDob: (v: string) => void
  setFormGender: (v: GenderKey) => void
  onContinue: () => void
}

function Step1({
  firstName,
  lastName,
  formUsername,
  dob,
  formGender,
  calculatedAge,
  setFirstName,
  setLastName,
  setFormUsername,
  setDob,
  setFormGender,
  onContinue,
}: Step1Props) {
  const canContinue =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    formUsername.trim().length > 0 &&
    dob.length > 0 &&
    calculatedAge !== null &&
    calculatedAge >= 13

  const genders: { key: GenderKey; emoji: string }[] = [
    { key: 'Male', emoji: '👨' },
    { key: 'Female', emoji: '👩' },
    { key: 'Non-binary', emoji: '✨' },
    { key: 'Prefer not to say', emoji: '—' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StepHeading
        title="Who are you?"
        subtitle="A few quick questions so MindfulBite can personalize your plan"
      />

      {/* First Name */}
      <div>
        <label style={labelStyle}>First Name</label>
        <input
          type="text"
          placeholder="Alex"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      {/* Last Name */}
      <div>
        <label style={labelStyle}>Last Name</label>
        <input
          type="text"
          placeholder="Smith"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          style={inputStyle}
          required
        />
      </div>

      {/* Username */}
      <div>
        <label style={labelStyle}>Username</label>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontFamily: 'var(--sans)',
              fontSize: 15,
              color: 'var(--text-dim)',
              pointerEvents: 'none',
            }}
          >
            @
          </span>
          <input
            type="text"
            placeholder="alexsmith"
            value={formUsername}
            onChange={(e) =>
              setFormUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())
            }
            style={{ ...inputStyle, paddingLeft: 28 }}
            required
          />
        </div>
      </div>

      {/* Date of Birth */}
      <div>
        <label style={labelStyle}>Date of Birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          max={maxDobDate()}
          style={inputStyle}
          required
        />
        {calculatedAge !== null && dob && (
          <p
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 13,
              color: 'var(--accent)',
              marginTop: 6,
              paddingLeft: 2,
            }}
          >
            Age: {calculatedAge} years
          </p>
        )}
      </div>

      {/* Gender */}
      <div>
        <label style={labelStyle}>Gender</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          {genders.map(({ key, emoji }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFormGender(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '11px 8px',
                borderRadius: 16,
                border:
                  formGender === key
                    ? '1px solid var(--accent-line)'
                    : '1px solid var(--line)',
                background:
                  formGender === key ? 'var(--accent-wash)' : 'var(--surface-2)',
                color: formGender === key ? 'var(--accent)' : 'var(--text-muted)',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                fontWeight: formGender === key ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{emoji}</span>
              {key}
            </button>
          ))}
        </div>
      </div>

      <ContinueButton
        label="Continue →"
        onClick={onContinue}
        disabled={!canContinue}
      />
    </div>
  )
}

// ─── Step 2 props & component (module-level — stable reference) ───────────────

interface Step2Props {
  heightUnit: HeightUnit
  heightCmRaw: string
  heightFt: string
  heightIn: string
  weightUnit: WeightUnit
  weightRaw: string
  goalWeightRaw: string
  activityLevel: ActivityKey | ''
  heightCm: number
  weightKg: number
  goalWeightKg: number
  calculatedBmi: number | null
  calorieGoal: number | null
  weightDiff: { label: string; note: string } | null
  setHeightCmRaw: (v: string) => void
  setHeightFt: (v: string) => void
  setHeightIn: (v: string) => void
  setWeightUnit: (v: WeightUnit) => void
  setWeightRaw: (v: string) => void
  setGoalWeightRaw: (v: string) => void
  setActivityLevel: (v: ActivityKey) => void
  handleHeightUnitChange: (v: HeightUnit) => void
  onBack: () => void
  onContinue: () => void
}

function Step2({
  heightUnit,
  heightCmRaw,
  heightFt,
  heightIn,
  weightUnit,
  weightRaw,
  goalWeightRaw,
  activityLevel,
  heightCm,
  weightKg,
  goalWeightKg,
  calculatedBmi,
  calorieGoal,
  weightDiff,
  setHeightCmRaw,
  setHeightFt,
  setHeightIn,
  setWeightUnit,
  setWeightRaw,
  setGoalWeightRaw,
  setActivityLevel,
  handleHeightUnitChange,
  onBack,
  onContinue,
}: Step2Props) {
  const canContinue = heightCm > 0 && weightKg > 0 && goalWeightKg > 0 && activityLevel !== ''

  const weightDisplayUnit = weightUnit === 'KG' ? 'kg' : 'lbs'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StepHeading
        title="Your body"
        subtitle="Used to calculate accurate calorie targets for you"
        back={onBack}
      />

      {/* Height */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <label style={{ ...labelStyle, marginBottom: 0 }}>Height</label>
          <SegmentedControl<HeightUnit>
            options={['CM', 'FT']}
            value={heightUnit}
            onChange={handleHeightUnitChange}
          />
        </div>
        {heightUnit === 'CM' ? (
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              placeholder="178"
              value={heightCmRaw}
              onChange={(e) => setHeightCmRaw(e.target.value)}
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <span
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                color: 'var(--text-dim)',
              }}
            >
              cm
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="number"
                placeholder="5"
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                style={{ ...inputStyle, paddingRight: 36 }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  color: 'var(--text-dim)',
                }}
              >
                ft
              </span>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="number"
                placeholder="10"
                min={0}
                max={11}
                value={heightIn}
                onChange={(e) => setHeightIn(e.target.value)}
                style={{ ...inputStyle, paddingRight: 36 }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  color: 'var(--text-dim)',
                }}
              >
                in
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Current Weight */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <label style={{ ...labelStyle, marginBottom: 0 }}>Current Weight</label>
          <SegmentedControl<WeightUnit>
            options={['KG', 'LBS']}
            value={weightUnit}
            onChange={setWeightUnit}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            placeholder={weightUnit === 'KG' ? '70' : '154'}
            value={weightRaw}
            onChange={(e) => setWeightRaw(e.target.value)}
            style={{ ...inputStyle, paddingRight: 50 }}
          />
          <span
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontFamily: 'var(--sans)',
              fontSize: 13,
              color: 'var(--text-dim)',
            }}
          >
            {weightDisplayUnit}
          </span>
        </div>
        {/* BMI preview */}
        {calculatedBmi !== null && (
          <p
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: 'var(--accent)',
              marginTop: 6,
              paddingLeft: 2,
            }}
          >
            BMI: {calculatedBmi} — {bmiLabel(calculatedBmi)}
          </p>
        )}
      </div>

      {/* Goal Weight */}
      <div>
        <label style={labelStyle}>Goal Weight</label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            placeholder={weightUnit === 'KG' ? '65' : '143'}
            value={goalWeightRaw}
            onChange={(e) => setGoalWeightRaw(e.target.value)}
            style={{ ...inputStyle, paddingRight: 50 }}
          />
          <span
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              fontFamily: 'var(--sans)',
              fontSize: 13,
              color: 'var(--text-dim)',
            }}
          >
            {weightDisplayUnit}
          </span>
        </div>
        {weightDiff && goalWeightRaw && (
          <p
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: 'var(--accent)',
              marginTop: 6,
              paddingLeft: 2,
            }}
          >
            {weightDiff.label}
          </p>
        )}
      </div>

      {/* Activity Level */}
      <div>
        <label style={labelStyle}>Activity Level</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACTIVITY_LEVELS.map(({ key, emoji, label, desc }) => {
            const selected = activityLevel === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActivityLevel(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 16px',
                  borderRadius: 16,
                  border: selected
                    ? '1px solid var(--accent-line)'
                    : '1px solid var(--line)',
                  background: selected ? 'var(--accent-wash)' : 'var(--surface)',
                  color: selected ? 'var(--accent)' : 'var(--text)',
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                  fontWeight: selected ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 20 }}>{emoji}</span>
                <div>
                  <div style={{ fontWeight: selected ? 700 : 600, marginBottom: 1 }}>{label}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: selected ? 'var(--accent)' : 'var(--text-dim)',
                      fontWeight: 400,
                    }}
                  >
                    {desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Calorie goal preview */}
      {calorieGoal !== null && (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 22,
            border: '1px solid var(--line)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Ring size={56} stroke={5} progress={1} color="var(--accent)" track="var(--accent-wash)">
            <span
              style={{
                fontSize: 9,
                fontFamily: 'var(--mono)',
                color: 'var(--accent)',
                fontWeight: 700,
              }}
            >
              ✓
            </span>
          </Ring>
          <div>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '-0.01em',
              }}
            >
              {calorieGoal.toLocaleString()}
            </span>
            <span
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 13,
                color: 'var(--text-dim)',
                marginLeft: 6,
              }}
            >
              kcal/day
            </span>
            <p
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 12,
                color: 'var(--text-dim)',
                margin: '3px 0 0',
              }}
            >
              Estimated daily target
            </p>
          </div>
        </div>
      )}

      <ContinueButton
        label="Continue →"
        onClick={onContinue}
        disabled={!canContinue}
      />
    </div>
  )
}

// ─── Step 3 props & component (module-level — stable reference) ───────────────

interface Step3Props {
  selectedPrefs: string[]
  selectedAllergies: string[]
  cuisine: string
  customCuisine: string
  country: string
  city: string
  togglePref: (pref: string) => void
  toggleAllergy: (allergy: string) => void
  setCuisine: React.Dispatch<React.SetStateAction<string>>
  setCustomCuisine: (v: string) => void
  setCountry: (v: string) => void
  setCity: (v: string) => void
  onBack: () => void
  onContinue: () => void
}

function Step3({
  selectedPrefs,
  selectedAllergies,
  cuisine,
  customCuisine,
  country,
  city,
  togglePref,
  toggleAllergy,
  setCuisine,
  setCustomCuisine,
  setCountry,
  setCity,
  onBack,
  onContinue,
}: Step3Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StepHeading
        title="Your diet"
        subtitle="Help us tailor your meals and recommendations"
        back={onBack}
      />

      {/* Dietary Preferences */}
      <div>
        <label style={labelStyle}>Dietary Preferences</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {DIETARY_PREFS.map((pref) => (
            <Chip
              key={pref}
              label={pref}
              selected={selectedPrefs.includes(pref)}
              onClick={() => togglePref(pref)}
            />
          ))}
        </div>
      </div>

      {/* Allergies */}
      <div>
        <label style={labelStyle}>Allergies</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALLERGIES.map((allergy) => (
            <Chip
              key={allergy}
              label={allergy}
              selected={selectedAllergies.includes(allergy)}
              onClick={() => toggleAllergy(allergy)}
            />
          ))}
        </div>
      </div>

      {/* Cuisine / Ethnicity Preference */}
      <div>
        <label style={labelStyle}>Cuisine Preference</label>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {CUISINES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={cuisine === c}
              onClick={() => setCuisine((prev) => (prev === c ? '' : c))}
            />
          ))}
        </div>
        {cuisine === 'Other' && (
          <input
            type="text"
            placeholder="Type your cuisine (e.g. Sri Lankan, Persian)"
            value={customCuisine}
            onChange={(e) => setCustomCuisine(e.target.value)}
            style={{ ...inputStyle, marginTop: 10 }}
          />
        )}
        <p
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 12,
            color: 'var(--text-dim)',
            marginTop: 8,
            paddingLeft: 2,
          }}
        >
          Affects cultural style of meal suggestions
        </p>
      </div>

      {/* Country */}
      <div>
        <label style={labelStyle}>Country</label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={{
            ...inputStyle,
            appearance: 'none',
            cursor: 'pointer',
            color: country ? 'var(--text)' : 'var(--text-dim)',
          }}
        >
          <option value="">Select your country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* City */}
      <div>
        <label style={labelStyle}>City</label>
        <input
          type="text"
          placeholder="Your city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={inputStyle}
        />
      </div>

      <ContinueButton
        label="Continue →"
        onClick={onContinue}
        disabled={false}
      />
    </div>
  )
}

// ─── Step 4 props & component (module-level — stable reference) ───────────────

interface Step4Props {
  firstName: string
  lastName: string
  formUsername: string
  calculatedAge: number | null
  formGender: GenderKey
  heightCm: number
  weightKg: number
  calculatedBmi: number | null
  goalWeightKg: number
  calorieGoal: number | null
  selectedPrefs: string[]
  selectedAllergies: string[]
  cuisine: string
  saving: boolean
  error: string | null
  onBack: () => void
  onSubmit: () => void
}

function Step4({
  firstName,
  lastName,
  formUsername,
  calculatedAge,
  formGender,
  heightCm,
  weightKg,
  calculatedBmi,
  goalWeightKg,
  calorieGoal,
  selectedPrefs,
  selectedAllergies,
  cuisine,
  saving,
  error,
  onBack,
  onSubmit,
}: Step4Props) {
  const initials =
    (firstName[0] ?? '').toUpperCase() + (lastName[0] ?? '').toUpperCase()

  const activePrefs = selectedPrefs.filter((p) => p !== 'None')
  const activeAllergies = selectedAllergies.filter((a) => a !== 'None')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StepHeading
        title="Almost done"
        subtitle="Review your profile before starting your journey"
        back={onBack}
      />

      {/* Summary card */}
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 22,
          border: '1px solid var(--line)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--sans)',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--on-accent)',
              flexShrink: 0,
            }}
          >
            {initials || '?'}
          </div>
          <div>
            <p
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 17,
                fontWeight: 700,
                color: 'var(--text)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {firstName} {lastName}
            </p>
            {formUsername && (
              <p
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  margin: '3px 0 0',
                }}
              >
                @{formUsername}
              </p>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--line)' }} />

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SummaryItem
            label="Age"
            value={calculatedAge !== null ? `${calculatedAge} yrs` : '—'}
          />
          <SummaryItem label="Gender" value={formGender || '—'} />
          <SummaryItem
            label="Height"
            value={heightCm > 0 ? `${heightCm} cm` : '—'}
          />
          <SummaryItem
            label="Weight"
            value={weightKg > 0 ? `${weightKg.toFixed(1)} kg` : '—'}
          />
          <SummaryItem
            label="BMI"
            value={
              calculatedBmi !== null
                ? `${calculatedBmi} · ${bmiLabel(calculatedBmi)}`
                : '—'
            }
          />
          <SummaryItem
            label="Goal"
            value={goalWeightKg > 0 ? `${goalWeightKg.toFixed(1)} kg` : '—'}
          />
        </div>

        <div style={{ height: 1, background: 'var(--line)' }} />

        {/* Calorie ring */}
        {calorieGoal !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Ring
              size={64}
              stroke={6}
              progress={1}
              color="var(--accent)"
              track="var(--accent-wash)"
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 8,
                  color: 'var(--accent)',
                  fontWeight: 700,
                }}
              >
                ✓
              </span>
            </Ring>
            <div>
              <span
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 30,
                  fontWeight: 500,
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {calorieGoal.toLocaleString()}
              </span>
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  color: 'var(--text-dim)',
                  marginLeft: 6,
                }}
              >
                kcal/day
              </span>
              <p
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  margin: '4px 0 0',
                }}
              >
                Daily calorie goal
              </p>
            </div>
          </div>
        )}

        {/* Diet chips */}
        {(activePrefs.length > 0 || activeAllergies.length > 0 || cuisine) && (
          <>
            <div style={{ height: 1, background: 'var(--line)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activePrefs.length > 0 && (
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      marginRight: 8,
                    }}
                  >
                    Diet
                  </span>
                  <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {activePrefs.map((p) => (
                      <Chip key={p} label={p} selected small />
                    ))}
                  </div>
                </div>
              )}
              {activeAllergies.length > 0 && (
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      marginRight: 8,
                    }}
                  >
                    Allergies
                  </span>
                  <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {activeAllergies.map((a) => (
                      <Chip key={a} label={a} selected small />
                    ))}
                  </div>
                </div>
              )}
              {cuisine && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: 'var(--sans)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                    }}
                  >
                    Cuisine
                  </span>
                  <Chip label={cuisine} selected small />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {error && (
        <div
          style={{
            background: 'oklch(0.65 0.18 25 / 0.12)',
            border: '1px solid oklch(0.65 0.18 25 / 0.3)',
            borderRadius: 14,
            padding: '12px 16px',
            fontFamily: 'var(--sans)',
            fontSize: 13,
            color: 'oklch(0.60 0.20 25)',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        style={{
          width: '100%',
          height: 52,
          background: saving ? 'var(--accent-wash)' : 'var(--accent)',
          color: saving ? 'var(--text-dim)' : 'var(--on-accent)',
          border: 'none',
          borderRadius: 18,
          fontFamily: 'var(--sans)',
          fontSize: 15,
          fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
          letterSpacing: '0.02em',
          flexShrink: 0,
        }}
      >
        {saving ? '…' : 'Start My Journey 🌿'}
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingScreen({ go }: OnboardingScreenProps) {
  const { user, refreshProfile } = useAuth()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Personal Info
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [dob, setDob] = useState('')
  const [formGender, setFormGender] = useState<GenderKey>('Prefer not to say')

  // Step 2 — Physical Stats
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('CM')
  const [heightCmRaw, setHeightCmRaw] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('KG')
  const [weightRaw, setWeightRaw] = useState('')
  const [goalWeightRaw, setGoalWeightRaw] = useState('')
  const [activityLevel, setActivityLevel] = useState<ActivityKey | ''>('')

  // Step 3 — Diet
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>(['None'])
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>(['None'])
  const [cuisine, setCuisine] = useState('')
  const [customCuisine, setCustomCuisine] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')

  // ─── Derived values ───────────────────────────────────────────────────────

  const calculatedAge = useMemo<number | null>(() => {
    if (!dob) return null
    const age = calcAge(dob)
    return age >= 0 ? age : null
  }, [dob])

  const heightCm = useMemo<number>(() => {
    if (heightUnit === 'CM') {
      return parseFloat(heightCmRaw) || 0
    }
    const ft = parseFloat(heightFt) || 0
    const inches = parseFloat(heightIn) || 0
    return ftInToCm(ft, inches)
  }, [heightUnit, heightCmRaw, heightFt, heightIn])

  const weightKg = useMemo<number>(() => {
    const raw = parseFloat(weightRaw) || 0
    return weightUnit === 'KG' ? raw : raw * 0.453592
  }, [weightRaw, weightUnit])

  const goalWeightKg = useMemo<number>(() => {
    const raw = parseFloat(goalWeightRaw) || 0
    return weightUnit === 'KG' ? raw : raw * 0.453592
  }, [goalWeightRaw, weightUnit])

  const calculatedBmi = useMemo<number | null>(() => {
    if (weightKg > 0 && heightCm > 0) {
      return parseFloat((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1))
    }
    return null
  }, [weightKg, heightCm])

  const calorieGoal = useMemo<number | null>(() => {
    if (weightKg > 0 && heightCm > 0 && calculatedAge && activityLevel) {
      const bmr =
        10 * weightKg +
        6.25 * heightCm -
        5 * calculatedAge +
        (formGender === 'Male' ? 5 : -161)
      const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel]
      const goal =
        goalWeightKg > 0 && goalWeightKg < weightKg
          ? tdee * 0.8
          : goalWeightKg > 0 && goalWeightKg > weightKg
          ? tdee * 1.1
          : tdee
      return Math.round(goal / 50) * 50
    }
    return null
  }, [weightKg, heightCm, calculatedAge, activityLevel, formGender, goalWeightKg])

  const weightDiff = useMemo(() => {
    if (!goalWeightKg || !weightKg) return null
    const diff = goalWeightKg - weightKg
    if (Math.abs(diff) < 0.5) return { label: '⚖️ Maintain', note: 'Maintain current weight' }
    if (diff < 0) return { label: `🎯 Lose ${Math.abs(diff).toFixed(1)}kg`, note: 'Weight loss goal' }
    return { label: `💪 Gain ${diff.toFixed(1)}kg`, note: 'Weight gain goal' }
  }, [goalWeightKg, weightKg])

  // ─── Height unit toggle with auto-convert ────────────────────────────────

  function handleHeightUnitChange(newUnit: HeightUnit) {
    if (newUnit === heightUnit) return
    if (newUnit === 'FT' && heightCmRaw) {
      const cm = parseFloat(heightCmRaw)
      if (cm > 0) {
        const { ft, inches } = cmToFtIn(cm)
        setHeightFt(String(ft))
        setHeightIn(String(inches))
      }
    } else if (newUnit === 'CM' && (heightFt || heightIn)) {
      const ft = parseFloat(heightFt) || 0
      const inches = parseFloat(heightIn) || 0
      if (ft > 0 || inches > 0) {
        setHeightCmRaw(String(ftInToCm(ft, inches)))
      }
    }
    setHeightUnit(newUnit)
  }

  // ─── Diet chip toggles ────────────────────────────────────────────────────

  function togglePref(pref: string) {
    setSelectedPrefs((prev) => {
      if (pref === 'None') return ['None']
      const without = prev.filter((p) => p !== 'None')
      return without.includes(pref)
        ? without.filter((p) => p !== pref) || ['None']
        : [...without, pref]
    })
  }

  function toggleAllergy(allergy: string) {
    setSelectedAllergies((prev) => {
      if (allergy === 'None') return ['None']
      const without = prev.filter((a) => a !== 'None')
      return without.includes(allergy)
        ? without.filter((a) => a !== allergy) || ['None']
        : [...without, allergy]
    })
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const fullName = `${firstName} ${lastName}`.trim()

      const macros = (weightKg > 0 && calorieGoal !== null && calorieGoal > 0)
        ? calculateMacroTargets(weightKg, goalWeightKg || null, calorieGoal)
        : { protein: 140, carbs: 210, fat: 70 }

      const { error: err } = await supabase.from('users').upsert(
        {
          id: user.id,
          full_name: fullName || null,
          username: formUsername || null,
          age: calculatedAge ?? null,
          gender: formGender || null,
          weight: weightKg || null,
          height: heightCm || null,
          bmi: calculatedBmi ?? null,
          goal_weight: goalWeightKg || null,
          daily_calorie_goal: calorieGoal,
          dietary_prefs: selectedPrefs.join(','),
          allergies: selectedAllergies.join(',') || null,
          cuisine_pref: (cuisine === 'Other' && customCuisine.trim()) ? customCuisine.trim() : (cuisine || null),
          dob: dob || null,
          country: country || null,
          city: city || null,
          onboarding_complete: true,
          protein_goal: macros.protein,
          carbs_goal: macros.carbs,
          fat_goal: macros.fat,
        },
        { onConflict: 'id' },
      )
      if (err) throw new Error(err.message)
      await refreshProfile()
      setSaving(false)
      go('home')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '16px 24px 8px',
          flexShrink: 0,
        }}
      >
        <ProgressDots step={step} />
      </div>

      <div
        style={{
          overflow: 'auto',
          flex: 1,
          padding: '12px 24px 32px',
        }}
      >
        {step === 1 && (
          <Step1
            firstName={firstName}
            lastName={lastName}
            formUsername={formUsername}
            dob={dob}
            formGender={formGender}
            calculatedAge={calculatedAge}
            setFirstName={setFirstName}
            setLastName={setLastName}
            setFormUsername={setFormUsername}
            setDob={setDob}
            setFormGender={setFormGender}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2
            heightUnit={heightUnit}
            heightCmRaw={heightCmRaw}
            heightFt={heightFt}
            heightIn={heightIn}
            weightUnit={weightUnit}
            weightRaw={weightRaw}
            goalWeightRaw={goalWeightRaw}
            activityLevel={activityLevel}
            heightCm={heightCm}
            weightKg={weightKg}
            goalWeightKg={goalWeightKg}
            calculatedBmi={calculatedBmi}
            calorieGoal={calorieGoal}
            weightDiff={weightDiff}
            setHeightCmRaw={setHeightCmRaw}
            setHeightFt={setHeightFt}
            setHeightIn={setHeightIn}
            setWeightUnit={setWeightUnit}
            setWeightRaw={setWeightRaw}
            setGoalWeightRaw={setGoalWeightRaw}
            setActivityLevel={setActivityLevel}
            handleHeightUnitChange={handleHeightUnitChange}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3
            selectedPrefs={selectedPrefs}
            selectedAllergies={selectedAllergies}
            cuisine={cuisine}
            customCuisine={customCuisine}
            country={country}
            city={city}
            togglePref={togglePref}
            toggleAllergy={toggleAllergy}
            setCuisine={setCuisine}
            setCustomCuisine={setCustomCuisine}
            setCountry={setCountry}
            setCity={setCity}
            onBack={() => setStep(2)}
            onContinue={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <Step4
            firstName={firstName}
            lastName={lastName}
            formUsername={formUsername}
            calculatedAge={calculatedAge}
            formGender={formGender}
            heightCm={heightCm}
            weightKg={weightKg}
            calculatedBmi={calculatedBmi}
            goalWeightKg={goalWeightKg}
            calorieGoal={calorieGoal}
            selectedPrefs={selectedPrefs}
            selectedAllergies={selectedAllergies}
            cuisine={cuisine}
            saving={saving}
            error={error}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  )
}
