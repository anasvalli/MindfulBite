import React, { useRef, useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { analyzeFoodImage, searchFood } from '../lib/foodAI'
import type { FoodItem } from '../types'
import { Card, Spinner, Eyebrow, glassBtn } from '../components/ui'
import { IconClose, IconRetake, IconCheck, IconChevL, IconSearch } from '../components/icons'

interface CaptureScreenProps {
  go: (screen: string) => void
}

// 1024px long edge — enough detail for accurate dish recognition (curries,
// sauces, mixed plates) while keeping Claude image tokens reasonable.
async function compressImage(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

type Step = 'upload' | 'analyzing' | 'result' | 'manual' | 'barcode' | 'mood-check'

function CornerBrackets() {
  const style = (t?: number, r?: number, b?: number, l?: number): React.CSSProperties => ({
    position: 'absolute',
    width: 32,
    height: 32,
    top: t,
    right: r,
    bottom: b,
    left: l,
    borderColor: 'rgba(255,255,255,0.5)',
    borderStyle: 'solid',
    borderTopWidth: t !== undefined ? 2 : 0,
    borderRightWidth: r !== undefined ? 2 : 0,
    borderBottomWidth: b !== undefined ? 2 : 0,
    borderLeftWidth: l !== undefined ? 2 : 0,
    borderRadius: 4,
  })
  return (
    <>
      <div style={style(16, undefined, undefined, 16)} />
      <div style={style(16, 16, undefined, undefined)} />
      <div style={style(undefined, undefined, 16, 16)} />
      <div style={style(undefined, 16, 16, undefined)} />
    </>
  )
}

const inputSm: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '8px 10px',
  color: 'var(--text)',
  fontFamily: 'var(--sans)',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

function generateMoodObservation(items: FoodItem[], calories: number): string {
  const totalProtein = items.reduce((s, i) => s + i.protein, 0)
  const totalCarbs = items.reduce((s, i) => s + i.carbs, 0)
  const totalFat = items.reduce((s, i) => s + i.fat, 0)

  if (totalCarbs > totalProtein * 3 && calories > 400) {
    return "High-carb meal — you might feel an energy spike followed by a dip in about 90 minutes. How are you feeling right now?"
  } else if (totalProtein > 30) {
    return "Good protein content — this should keep you full and focused. Your muscles will appreciate it. How's your energy?"
  } else if (calories < 200) {
    return "Light snack logged. You might still be a little hungry. How are you feeling?"
  } else if (totalFat > 20 && calories > 500) {
    return "Rich, satisfying meal. You might feel pleasantly full or perhaps a bit heavy. What's your mood?"
  } else {
    return "Meal logged! How are you feeling after eating? Your mood and food choices are connected — let's track it."
  }
}

const POST_MOODS = [
  { key: 'Happy', emoji: '😊', hue: 85 },
  { key: 'Energetic', emoji: '⚡', hue: 60 },
  { key: 'Normal', emoji: '😐', hue: 200 },
  { key: 'Tired', emoji: '😴', hue: 250 },
  { key: 'Stressed', emoji: '😤', hue: 30 },
  { key: 'Sad', emoji: '😞', hue: 260 },
]

export function CaptureScreen({ go }: CaptureScreenProps) {
  const { user, profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [base64, setBase64] = useState<string | null>(null)
  const [items, setItems] = useState<FoodItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Post-capture mood state
  const [savedMealId, setSavedMealId] = useState<string | null>(null)
  const [savedMealName, setSavedMealName] = useState<string>('')
  const [savedMealCalories, setSavedMealCalories] = useState<number>(0)
  const [selectedPostMood, setSelectedPostMood] = useState<string | null>(null)
  const [savingMood, setSavingMood] = useState(false)

  // Manual search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FoodItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Local foods state
  const [localFoods, setLocalFoods] = useState<FoodItem[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [localLoaded, setLocalLoaded] = useState(false)

  // Edit state (result step)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<FoodItem>>({})
  // Original AI-detected item captured when editing begins — used to detect
  // user corrections and feed them back into future analyses.
  const editOriginalRef = useRef<FoodItem | null>(null)

  // Portion adjuster (result step): per-item base macros + current multiplier so
  // ½×/1×/1½×/2× always scale from the original detection (no compounding).
  const portionBaseRef = useRef<Record<string, { cal: number; p: number; c: number; f: number }>>({})
  const [portionFactor, setPortionFactor] = useState<Record<string, number>>({})

  function setPortion(item: FoodItem, factor: number) {
    if (!portionBaseRef.current[item.id]) {
      portionBaseRef.current[item.id] = { cal: item.calories, p: item.protein, c: item.carbs, f: item.fat }
    }
    const b = portionBaseRef.current[item.id]
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, calories: Math.round(b.cal * factor), protein: Math.round(b.p * factor), carbs: Math.round(b.c * factor), fat: Math.round(b.f * factor) }
          : it,
      ),
    )
    setPortionFactor((prev) => ({ ...prev, [item.id]: factor }))
  }

  function switchAlternative(item: FoodItem, alt: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, name: alt, confidence: 0.9, alternatives: [item.name, ...(it.alternatives ?? []).filter((a) => a !== alt)].slice(0, 2) }
          : it,
      ),
    )
  }

  // Sage healthier-swap suggestion (result step)
  const [swapText, setSwapText] = useState<string | null>(null)
  const [swapLoading, setSwapLoading] = useState(false)

  // Barcode scanner state
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanFrameRef = useRef<number>(0)
  const [scanning, setScanning] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [manualBarcode, setManualBarcode] = useState('')
  const barcodeSupported = 'BarcodeDetector' in window

  // Live photo camera state (Scan mode)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  async function startPhotoCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      cameraStreamRef.current = stream
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream
        await cameraVideoRef.current.play()
      }
    } catch {
      setCameraError('Camera access denied. Use the gallery button to pick a photo instead.')
    }
  }

  function stopPhotoCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop())
      cameraStreamRef.current = null
    }
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
  }

  function capturePhoto() {
    const video = cameraVideoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    const maxDim = 1024
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    stopPhotoCamera()
    setError(null)
    setPreviewUrl(dataUrl)
    setBase64(dataUrl)
    setStep('analyzing')
    analyzeFoodImage(dataUrl, { cuisine: profile?.cuisine_pref, dietary: profile?.dietary_prefs })
      .then((detected) => {
        setItems(detected)
        setStep('result')
      })
      .catch(() => {
        setError('Could not analyze the image. Please try again.')
        setStep('upload')
      })
  }

  function stopCamera() {
    cancelAnimationFrame(scanFrameRef.current)
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  // Stop camera whenever we leave the barcode step
  useEffect(() => {
    if (step !== 'barcode') {
      stopCamera()
    }
  }, [step])

  // Always stop camera when component unmounts
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // Start/stop the live photo camera based on being in Scan mode (the 'upload' step)
  useEffect(() => {
    if (step === 'upload') {
      // slight delay so the <video> element is mounted before we attach the stream
      const t = setTimeout(() => startPhotoCamera(), 80)
      return () => clearTimeout(t)
    } else {
      stopPhotoCamera()
    }
  }, [step])

  // Always stop the photo camera when component unmounts
  useEffect(() => () => stopPhotoCamera(), [])

  // Fetch a healthier-swap suggestion when entering the result step with items
  useEffect(() => {
    if (step !== 'result' || items.length === 0) {
      setSwapText(null)
      setSwapLoading(false)
      return
    }
    let cancelled = false
    const itemNames = items.map((i) => i.name).join(', ')
    setSwapText(null)
    setSwapLoading(true)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            message: `Suggest ONE specific healthier swap for this meal in 1 short sentence (e.g. "Swap white rice for cauliflower rice to save ~180 kcal"). Meal: ${itemNames}. Reply with just the suggestion.`,
            history: [],
          }),
        })
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const data = await res.json() as { reply: string }
        if (!cancelled && data.reply?.trim()) {
          setSwapText(data.reply.trim())
        }
      } catch {
        if (!cancelled) setSwapText(null)
      } finally {
        if (!cancelled) setSwapLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [step, items])

  async function startCamera() {
    setBarcodeError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setScanning(true)

      const detector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      })

      const scan = async () => {
        if (!videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) {
            handleBarcode(codes[0].rawValue)
            return
          }
        } catch {
          // detection error — keep looping
        }
        scanFrameRef.current = requestAnimationFrame(scan)
      }
      scanFrameRef.current = requestAnimationFrame(scan)
    } catch {
      setBarcodeError('Could not access camera. Please check permissions and try again.')
    }
  }

  async function handleBarcode(code: string) {
    stopCamera()
    setLookingUp(true)
    setBarcodeError(null)
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
      const data = await res.json()

      if (data.status !== 1 || !data.product) {
        setBarcodeError(`Product not found for barcode ${code}. Try manual entry.`)
        setLookingUp(false)
        return
      }

      const p = data.product
      const nutriments = p.nutriments ?? {}
      const servingG = p.serving_quantity ? parseFloat(p.serving_quantity) : 100
      const scale = servingG / 100

      const item: FoodItem = {
        id: `barcode-${code}`,
        name: p.product_name || p.product_name_en || `Product ${code}`,
        quantity: p.serving_size || `${servingG}g`,
        calories: Math.round((nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0) * scale),
        protein: Math.round((nutriments['proteins_100g'] ?? 0) * scale * 10) / 10,
        carbs: Math.round((nutriments['carbohydrates_100g'] ?? 0) * scale * 10) / 10,
        fat: Math.round((nutriments['fat_100g'] ?? 0) * scale * 10) / 10,
      }

      setItems([item])
      setPreviewUrl(null)
      setBase64(null)
      setLookingUp(false)
      setStep('result')
    } catch {
      setBarcodeError('Could not look up this barcode. Check your connection or try manual entry.')
      setLookingUp(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input value so the same file can be re-selected after an error
    e.target.value = ''
    setError(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string
      const dataUrl = await compressImage(raw)
      setPreviewUrl(dataUrl)
      setBase64(dataUrl)
      setStep('analyzing')
      try {
        const detected = await analyzeFoodImage(dataUrl, { cuisine: profile?.cuisine_pref, dietary: profile?.dietary_prefs })
        setItems(detected)
        setStep('result')
      } catch {
        setError('Could not analyze the image. Please try again.')
        setStep('upload')
      }
    }
    reader.readAsDataURL(file)
  }

  function handleRetake() {
    setStep('upload')
    setPreviewUrl(null)
    setBase64(null)
    setItems([])
    setError(null)
    setEditingId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  async function handleSave() {
    if (!user || items.length === 0) return
    setSaving(true)
    setError(null)

    try {
      let imageUrl: string | null = null

      if (base64) {
        try {
          const blob = await (await fetch(base64)).blob()
          const ext = blob.type.split('/')[1] ?? 'jpg'
          const fileName = `${user.id}/${Date.now()}.${ext}`
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('meal-images')
            .upload(fileName, blob, { contentType: blob.type })

          if (uploadError) {
            console.warn('Image upload failed:', uploadError.message)
          } else if (uploadData) {
            const { data: urlData } = supabase.storage.from('meal-images').getPublicUrl(fileName)
            imageUrl = urlData.publicUrl
          }
        } catch (uploadErr) {
          console.warn('Image upload error:', uploadErr)
        }
      }

      const totalCalories = items.reduce((s, i) => s + i.calories, 0)
      const macros = {
        protein: items.reduce((s, i) => s + i.protein, 0),
        carbs: items.reduce((s, i) => s + i.carbs, 0),
        fat: items.reduce((s, i) => s + i.fat, 0),
      }

      const { data: insertData, error: insertError } = await supabase.from('meals').insert({
        user_id: user.id,
        image_url: imageUrl,
        items_json: items,
        total_calories: totalCalories,
        macros_json: macros,
        created_at: new Date().toISOString(),
      }).select().single()

      if (insertError) throw new Error(insertError.message)

      const mealName = items.map(i => i.name).join(', ')
      setSavedMealId(insertData.id)
      setSavedMealName(mealName)
      setSavedMealCalories(totalCalories)
      setSelectedPostMood(null)
      setStep('mood-check')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinishLogging() {
    if (!user || !savedMealId || !selectedPostMood) return
    setSavingMood(true)
    try {
      await supabase.from('meal_moods').insert({
        meal_id: savedMealId,
        user_id: user.id,
        mood: selectedPostMood,
        context_notes: savedMealName,
      })

      localStorage.setItem('mealMoodContext', JSON.stringify({
        mealName: savedMealName,
        calories: savedMealCalories,
        mood: selectedPostMood,
        protein: items.reduce((s, i) => s + i.protein, 0),
        carbs: items.reduce((s, i) => s + i.carbs, 0),
        fat: items.reduce((s, i) => s + i.fat, 0),
        timestamp: Date.now(),
      }))

      localStorage.setItem('coachMode', 'mood')
      go('coach')
    } catch (err) {
      console.warn('Failed to save mood:', err)
      // Still navigate even if mood save fails
      localStorage.setItem('coachMode', 'mood')
      go('coach')
    } finally {
      setSavingMood(false)
    }
  }

  async function loadLocalFoods() {
    setLoadingLocal(true)
    const location = [profile?.city, profile?.country].filter(Boolean).join(', ') || 'international'
    const dietary = profile?.dietary_prefs || 'none'

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          message: `List 12 popular local foods and dishes available in ${location} that suit a ${dietary} diet.
Return ONLY a JSON array, no text:
[{"id":"1","name":"Food/Dish Name","quantity":"1 serving (Xg)","calories":N,"protein":N,"carbs":N,"fat":N}]
Include a mix of: street food, home cooking staples, restaurant dishes, and snacks from ${location}.
Accurate nutritional estimates for typical local portion sizes.`,
          history: [],
          userContext: `User is in ${location}. Dietary: ${dietary}.`,
        }),
      })
      const data = await res.json() as { reply: string }
      const match = data.reply.match(/\[[\s\S]*\]/)
      if (match) {
        const foods = JSON.parse(match[0]) as FoodItem[]
        setLocalFoods(foods.map((f, i) => ({ ...f, id: f.id || `local-${i}` })))
      }
    } catch (err) {
      console.warn('Local foods error:', err)
    } finally {
      setLoadingLocal(false)
      setLocalLoaded(true)
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults([])
    setSelectedIds(new Set())
    try {
      const results = await searchFood(searchQuery.trim())
      setSearchResults(results)
    } catch {
      setSearchError('Search failed. Please try again.')
    } finally {
      setSearchLoading(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleAddSelected() {
    const allItems = [...searchResults, ...localFoods]
    const selected = allItems.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) return
    setItems(selected)
    setPreviewUrl(null)
    setBase64(null)
    setEditingId(null)
    setStep('result')
  }

  // Edit helpers
  function startEdit(item: FoodItem) {
    setEditingId(item.id)
    setEditDraft({ ...item })
    // Snapshot the original detected values so we can detect a real correction.
    editOriginalRef.current = { ...item }
  }

  // Fire-and-forget: log a correction when the user meaningfully changes an
  // AI-detected item (different name, or calories off by >5%). These feed back
  // into future analyses as the user's preferences. Never blocks the UI.
  function recordCorrection(original: FoodItem, edited: FoodItem) {
    if (!user) return
    const nameChanged =
      original.name.trim().toLowerCase() !== edited.name.trim().toLowerCase()
    const base = original.calories || 0
    const calChanged =
      base > 0
        ? Math.abs(edited.calories - base) / base > 0.05
        : edited.calories !== base
    if (!nameChanged && !calChanged) return
    ;(async () => {
      try {
        await supabase.from('food_corrections').insert({
          user_id: user.id,
          original_name: original.name,
          corrected_name: edited.name,
          original_calories: original.calories,
          corrected_calories: edited.calories,
        })
      } catch {
        // ignore — correction logging is best-effort
      }
    })()
  }

  function commitEdit() {
    if (!editingId) return
    const original = editOriginalRef.current
    const edited: FoodItem | null = (() => {
      const item = items.find((it) => it.id === editingId)
      if (!item) return null
      return {
        ...item,
        name: String(editDraft.name ?? item.name),
        calories: Number(editDraft.calories ?? item.calories),
        protein: Number(editDraft.protein ?? item.protein),
        carbs: Number(editDraft.carbs ?? item.carbs),
        fat: Number(editDraft.fat ?? item.fat),
      }
    })()
    setItems((prev) =>
      prev.map((item) => (item.id === editingId && edited ? edited : item))
    )
    if (original && edited) recordCorrection(original, edited)
    setEditingId(null)
    setEditDraft({})
    editOriginalRef.current = null
  }

  const viewfinderBg = {
    background: `
      repeating-linear-gradient(
        45deg,
        rgba(255,255,255,0.02) 0px,
        rgba(255,255,255,0.02) 1px,
        transparent 1px,
        transparent 12px
      )
    `,
  }

  return (
    <div
      className="mb-screen"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        position: 'relative',
      }}
    >
      {/* Camera input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {/* Gallery input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Close button (only on upload/analyzing steps) */}
      {(step === 'upload' || step === 'analyzing') && (
        <button
          onClick={() => go('home')}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 20,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <IconClose size={18} />
        </button>
      )}

      {/* ── STEP: Upload (live camera viewfinder / Scan mode) ── */}
      {step === 'upload' && (
        <>
          {/* Viewfinder */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              background: '#000',
              ...(cameraError ? viewfinderBg : {}),
            }}
          >
            {/* Live camera feed */}
            <video
              ref={cameraVideoRef}
              playsInline
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: cameraError ? 'none' : 'block',
              }}
            />

            <CornerBrackets />

            {/* Center pill */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                textAlign: 'center',
                width: '100%',
                pointerEvents: 'none',
              }}
            >
              {cameraError ? (
                <>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
                  <p
                    style={{
                      color: 'rgba(255,255,255,0.55)',
                      fontSize: 13,
                      padding: '0 40px',
                      lineHeight: 1.5,
                    }}
                  >
                    {cameraError}
                  </p>
                </>
              ) : (
                <div
                  style={{
                    display: 'inline-block',
                    background: 'rgba(0,0,0,0.35)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 100,
                    padding: '8px 20px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.16em',
                      color: 'rgba(255,255,255,0.85)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Center Your Plate
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 20,
                  left: 20,
                  right: 20,
                  background: 'oklch(0.65 0.18 25 / 0.15)',
                  border: '1px solid oklch(0.65 0.18 25 / 0.4)',
                  borderRadius: 14,
                  padding: '12px 16px',
                  color: 'var(--danger)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div
            style={{
              padding: '20px 24px 36px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
              background: 'linear-gradient(to bottom, transparent, var(--bg))',
            }}
          >
            {/* Mode pills */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 100,
                padding: '4px 4px',
              }}
            >
              {(['Scan', 'Barcode', 'Manual'] as const).map((label, idx) => {
                const active = idx === 0
                return (
                  <button
                    key={label}
                    onClick={() => {
                      if (idx === 0) {
                        // Already in Scan mode; ensure camera is running
                        if (!cameraStreamRef.current && !cameraError) startPhotoCamera()
                      } else if (idx === 1) {
                        stopPhotoCamera()
                        setBarcodeError(null)
                        setManualBarcode('')
                        setLookingUp(false)
                        setStep('barcode')
                        if (barcodeSupported) {
                          // slight delay so DOM is ready
                          setTimeout(() => startCamera(), 80)
                        }
                      } else {
                        stopPhotoCamera()
                        setStep('manual')
                      }
                    }}
                    style={{
                      padding: '7px 18px',
                      borderRadius: 100,
                      border: 'none',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--on-accent)' : 'rgba(255,255,255,0.55)',
                      fontFamily: 'var(--sans)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {cameraError ? (
              /* Fallback: gallery prominent when camera unavailable */
              <button
                onClick={() => galleryInputRef.current?.click()}
                style={{
                  width: '100%',
                  height: 56,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 28,
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                🖼️ Choose from Gallery
              </button>
            ) : (
              /* Shutter row: gallery thumbnail + 76px shutter */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 28,
                  width: '100%',
                }}
              >
                {/* Gallery thumbnail button (46px) */}
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  aria-label="Open gallery"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    fontSize: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  🖼️
                </button>

                {/* Shutter button (76px) */}
                <button
                  onClick={capturePhoto}
                  aria-label="Capture photo"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: '50%',
                    background: 'transparent',
                    border: '4px solid #fff',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      display: 'block',
                    }}
                  />
                </button>

                {/* Spacer to keep shutter centered (mirrors gallery button) */}
                <div style={{ width: 46, height: 46, flexShrink: 0 }} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── STEP: Analyzing ── */}
      {step === 'analyzing' && (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Food"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
            }}
          >
            {/* Scan line */}
            <div
              className="mb-scan"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
                opacity: 0.8,
              }}
            />

            <div
              style={{
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 20,
                padding: '24px 36px',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#fff',
                  marginBottom: 8,
                }}
              >
                Reading your plate…
              </p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="mb-dot"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: Manual Search ── */}
      {step === 'manual' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            style={{
              padding: '20px 20px 0',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setStep('upload')}
              style={{
                ...glassBtn,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 14,
                color: 'var(--text-muted)',
                padding: '8px 14px',
                flexShrink: 0,
                backdropFilter: 'none',
              }}
            >
              <IconChevL size={16} />
            </button>
            <div>
              <Eyebrow style={{ display: 'block', marginBottom: 4 }}>MANUAL ENTRY</Eyebrow>
              <h2
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 24,
                  fontWeight: 500,
                  color: 'var(--text)',
                  letterSpacing: '-0.01em',
                }}
              >
                Search Foods
              </h2>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                placeholder="e.g. 'grilled chicken breast'"
                style={{
                  ...inputSm,
                  fontSize: 14,
                  padding: '12px 14px',
                  borderRadius: 14,
                  flex: 1,
                }}
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading || !searchQuery.trim()}
                style={{
                  height: 46,
                  width: 46,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 14,
                  cursor: searchLoading || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                  opacity: searchLoading || !searchQuery.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IconSearch size={18} />
              </button>
            </div>
          </div>

          {/* Results area */}
          <div style={{ flex: 1, padding: '16px 20px 0', overflow: 'auto' }}>

            {/* Local foods section — shown above search results */}
            {!localLoaded ? (
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={loadLocalFoods}
                  disabled={loadingLocal}
                  style={{
                    width: '100%',
                    height: 48,
                    background: 'var(--surface)',
                    border: '1px solid var(--accent-line)',
                    borderRadius: 14,
                    color: 'var(--accent)',
                    fontFamily: 'var(--sans)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: loadingLocal ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {loadingLocal ? (
                    <>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: '2px solid var(--accent-line)',
                          borderTopColor: 'var(--accent)',
                          animation: 'mb-spin 0.8s linear infinite',
                        }}
                      />
                      Loading local foods…
                    </>
                  ) : (
                    <>📍 Show foods near me ({profile?.city ?? profile?.country ?? 'my area'})</>
                  )}
                </button>
              </div>
            ) : localFoods.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    color: 'var(--text-dim)',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  📍 Popular in {profile?.city ?? profile?.country ?? 'your area'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {localFoods.map((food) => {
                    const isSelected = selectedIds.has(food.id)
                    return (
                      <div
                        key={food.id}
                        onClick={() => toggleSelect(food.id)}
                        style={{
                          background: isSelected ? 'var(--accent-wash)' : 'var(--surface)',
                          border: isSelected ? '1px solid var(--accent-line)' : '1px solid var(--line)',
                          borderRadius: 14,
                          padding: '12px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: 'var(--text)',
                              marginBottom: 2,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {food.name}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{food.quantity}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isSelected ? 'var(--accent)' : 'var(--text)',
                              fontFamily: 'var(--mono)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {food.calories} kcal
                          </span>
                          {isSelected && <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {/* Divider between local foods and search results */}
            {localFoods.length > 0 && searchResults.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 4, marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--mono)',
                    letterSpacing: '0.12em',
                    marginBottom: 10,
                  }}
                >
                  SEARCH RESULTS
                </div>
              </div>
            )}

            {searchLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                <Spinner size={36} />
              </div>
            )}

            {searchError && !searchLoading && (
              <div
                style={{
                  background: 'oklch(0.65 0.18 25 / 0.12)',
                  border: '1px solid oklch(0.65 0.18 25 / 0.3)',
                  borderRadius: 14,
                  padding: '12px 16px',
                  color: 'var(--danger)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                {searchError}
              </div>
            )}

            {!searchLoading && !searchError && searchResults.length === 0 && searchQuery.trim() && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
                  Search for a food to see results
                </p>
              </div>
            )}

            {!searchLoading && searchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 100 }}>
                {searchResults.map((item) => {
                  const selected = selectedIds.has(item.id)
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSelect(item.id)}
                      style={{
                        background: selected ? 'var(--accent-wash)' : 'var(--surface)',
                        borderRadius: 16,
                        border: selected ? '1px solid var(--accent-line)' : '1px solid var(--line)',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                    >
                      {/* Check circle */}
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: selected ? 'var(--accent)' : 'var(--surface-2)',
                          border: selected ? 'none' : '1px solid var(--line)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: selected ? 'var(--on-accent)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <IconCheck size={13} />
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: 'var(--text)',
                            marginBottom: 2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.name}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.quantity}</p>
                      </div>

                      {/* Calories */}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--accent)',
                          fontFamily: 'var(--mono)',
                          flexShrink: 0,
                        }}
                      >
                        {item.calories}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Add Selected button — shown whenever there are selectable items */}
          {(searchResults.length > 0 || localFoods.length > 0) && (
            <div
              style={{
                position: 'sticky',
                bottom: 0,
                padding: '16px 20px 40px',
                background: 'linear-gradient(to bottom, transparent, var(--bg) 40%)',
              }}
            >
              <button
                onClick={handleAddSelected}
                disabled={selectedIds.size === 0}
                style={{
                  width: '100%',
                  height: 52,
                  background: selectedIds.size > 0 ? 'var(--accent)' : 'var(--surface-2)',
                  color: selectedIds.size > 0 ? 'var(--on-accent)' : 'var(--text-dim)',
                  border: 'none',
                  borderRadius: 18,
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s',
                }}
              >
                {selectedIds.size > 0
                  ? `Add ${selectedIds.size} Item${selectedIds.size !== 1 ? 's' : ''} to Log`
                  : 'Select items above'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP: Barcode Scanner ── */}
      {step === 'barcode' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#000',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Close button */}
          <button
            onClick={() => {
              stopCamera()
              setStep('upload')
            }}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 40,
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <IconClose size={18} />
          </button>

          {barcodeSupported ? (
            <>
              {/* Live camera feed */}
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />

              {/* Reticle + scan line — centred vertically */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 260,
                  height: 160,
                }}
              >
                <CornerBrackets />
                {/* Gold scan line */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px 2px var(--accent)',
                    transform: 'translateY(-50%)',
                  }}
                />
              </div>
            </>
          ) : (
            /* Fallback: manual barcode entry */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 32px',
                gap: 16,
              }}
            >
              <p
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontFamily: 'var(--sans)',
                  fontSize: 13,
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                Barcode scanning isn't supported in this browser.{'\n'}Enter the barcode number below.
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualBarcode.trim()) handleBarcode(manualBarcode.trim())
                }}
                placeholder="e.g. 3017620422003"
                style={{
                  ...inputSm,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff',
                  fontSize: 16,
                  letterSpacing: '0.05em',
                  textAlign: 'center',
                  borderRadius: 14,
                  padding: '14px 16px',
                }}
              />
              <button
                onClick={() => {
                  if (manualBarcode.trim()) handleBarcode(manualBarcode.trim())
                }}
                disabled={!manualBarcode.trim() || lookingUp}
                style={{
                  height: 50,
                  paddingLeft: 28,
                  paddingRight: 28,
                  background: !manualBarcode.trim() || lookingUp ? 'rgba(255,255,255,0.12)' : 'var(--accent)',
                  color: !manualBarcode.trim() || lookingUp ? 'rgba(255,255,255,0.35)' : 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 25,
                  fontFamily: 'var(--sans)',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: !manualBarcode.trim() || lookingUp ? 'not-allowed' : 'pointer',
                }}
              >
                Look Up
              </button>
            </div>
          )}

          {/* Bottom status overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '32px 24px 52px',
              background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.82))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {lookingUp ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Spinner size={22} />
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 16,
                    color: 'rgba(255,255,255,0.85)',
                  }}
                >
                  Looking up product…
                </span>
              </div>
            ) : barcodeError ? (
              <>
                <p
                  style={{
                    color: 'var(--danger)',
                    fontFamily: 'var(--sans)',
                    fontSize: 13,
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}
                >
                  {barcodeError}
                </p>
                {barcodeSupported && (
                  <button
                    onClick={() => {
                      setBarcodeError(null)
                      startCamera()
                    }}
                    style={{
                      padding: '8px 22px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.22)',
                      borderRadius: 20,
                      color: '#fff',
                      fontFamily: 'var(--sans)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Try Again
                  </button>
                )}
              </>
            ) : (
              barcodeSupported && scanning && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: 'rgba(255,255,255,0.6)',
                    textTransform: 'uppercase',
                    animation: 'mb-pulse 2s ease-in-out infinite',
                  }}
                >
                  Point at a barcode
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* ── STEP: Result ── */}
      {step === 'result' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Preview thumbnail (only if image was used) */}
          {previewUrl && (
            <div style={{ height: 220, position: 'relative', flexShrink: 0 }}>
              <img
                src={previewUrl}
                alt="Food"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, transparent 50%, var(--bg) 100%)',
                }}
              />
            </div>
          )}

          <div style={{ padding: '0 20px 120px', marginTop: previewUrl ? -32 : 80 }}>
            <h2
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 26,
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 4,
              }}
            >
              Meal Analysis
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
              {items.length} item{items.length !== 1 ? 's' : ''} detected
            </p>

            {/* Totals */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                {[
                  { label: 'CALORIES', val: items.reduce((s, i) => s + i.calories, 0).toString() },
                  { label: 'PROTEIN', val: `${Math.round(items.reduce((s, i) => s + i.protein, 0))}g` },
                  { label: 'CARBS', val: `${Math.round(items.reduce((s, i) => s + i.carbs, 0))}g` },
                  { label: 'FAT', val: `${Math.round(items.reduce((s, i) => s + i.fat, 0))}g` },
                ].map(({ label, val }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontFamily: 'var(--serif)',
                        fontSize: 22,
                        fontWeight: 500,
                        color: 'var(--text)',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {val}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--text-dim)',
                        fontFamily: 'var(--mono)',
                        letterSpacing: '0.1em',
                        marginTop: 2,
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {items.map((item) =>
                editingId === item.id ? (
                  /* ── Edit form ── */
                  <Card key={item.id} pad="14px 16px">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Name */}
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--mono)',
                            letterSpacing: '0.08em',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          NAME
                        </label>
                        <input
                          type="text"
                          value={String(editDraft.name ?? '')}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          style={inputSm}
                        />
                      </div>

                      {/* Calories */}
                      <div>
                        <label
                          style={{
                            fontSize: 11,
                            color: 'var(--text-dim)',
                            fontFamily: 'var(--mono)',
                            letterSpacing: '0.08em',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          CALORIES
                        </label>
                        <input
                          type="number"
                          value={editDraft.calories ?? ''}
                          onChange={(e) =>
                            setEditDraft((d) => ({ ...d, calories: Number(e.target.value) }))
                          }
                          style={inputSm}
                        />
                      </div>

                      {/* Macros row */}
                      <div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: 8,
                          }}
                        >
                          {(['protein', 'carbs', 'fat'] as const).map((macro) => (
                            <div key={macro}>
                              <label
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-dim)',
                                  fontFamily: 'var(--mono)',
                                  letterSpacing: '0.08em',
                                  display: 'block',
                                  marginBottom: 4,
                                  textAlign: 'center',
                                }}
                              >
                                {macro === 'protein' ? 'P' : macro === 'carbs' ? 'C' : 'F'}
                              </label>
                              <input
                                type="number"
                                value={editDraft[macro] ?? ''}
                                onChange={(e) =>
                                  setEditDraft((d) => ({ ...d, [macro]: Number(e.target.value) }))
                                }
                                style={{ ...inputSm, textAlign: 'center' }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Done button */}
                      <button
                        onClick={commitEdit}
                        style={{
                          height: 40,
                          background: 'var(--accent)',
                          color: 'var(--on-accent)',
                          border: 'none',
                          borderRadius: 12,
                          fontFamily: 'var(--sans)',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        <IconCheck size={15} /> Done
                      </button>
                    </div>
                  </Card>
                ) : (
                  /* ── Row view ── */
                  <Card key={item.id} pad="14px 16px">
                    <div
                      onClick={() => startEdit(item)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{item.name}</span>
                          {item.source === 'usda' && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: 'oklch(0.74 0.14 150)', background: 'oklch(0.74 0.14 150 / 0.14)', borderRadius: 6, padding: '2px 6px' }}>
                              ✓ VERIFIED
                            </span>
                          )}
                          {typeof item.confidence === 'number' && item.confidence < 0.7 && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--warn, oklch(0.78 0.12 70))', background: 'oklch(0.78 0.12 70 / 0.14)', borderRadius: 6, padding: '2px 6px' }}>
                              {Math.round(item.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{item.quantity}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--sans)' }}>
                          {item.calories} kcal
                        </span>
                        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                          P{Math.round(item.protein)} · C{Math.round(item.carbs)} · F{Math.round(item.fat)}
                        </p>
                      </div>
                    </div>

                    {/* Alternatives — only when the model wasn't confident */}
                    {item.alternatives && item.alternatives.length > 0 && (item.confidence ?? 1) < 0.75 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Not right?</span>
                        {item.alternatives.map((alt) => (
                          <button
                            key={alt}
                            onClick={() => switchAlternative(item, alt)}
                            style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--sans)' }}
                          >
                            {alt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Portion adjuster */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 2 }}>Portion</span>
                      {[0.5, 1, 1.5, 2].map((f) => {
                        const active = (portionFactor[item.id] ?? 1) === f
                        return (
                          <button
                            key={f}
                            onClick={() => setPortion(item, f)}
                            style={{
                              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8,
                              border: active ? '1px solid var(--accent-line)' : '1px solid var(--line)',
                              background: active ? 'var(--accent-wash)' : 'transparent',
                              color: active ? 'var(--accent)' : 'var(--text-muted)',
                              cursor: 'pointer', fontFamily: 'var(--sans)',
                            }}
                          >
                            {f === 0.5 ? '½×' : f === 1 ? '1×' : f === 1.5 ? '1½×' : '2×'}
                          </button>
                        )
                      })}
                    </div>
                  </Card>
                )
              )}
            </div>

            {/* ── Sage healthier-swap suggestion ── */}
            {(swapLoading || swapText) && (
              <div
                style={{
                  background: 'var(--accent-wash)',
                  border: '1px solid var(--accent-line)',
                  borderRadius: 16,
                  padding: '14px 16px',
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--mono)',
                    letterSpacing: '0.1em',
                    color: 'var(--text-dim)',
                    marginBottom: swapLoading ? 0 : 6,
                  }}
                >
                  ✦ SAGE SUGGESTS
                </div>
                {swapLoading ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="mb-dot"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          animationDelay: `${i * 0.18}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>{swapText}</p>
                )}
              </div>
            )}

            {error && (
              <div
                style={{
                  background: 'oklch(0.65 0.18 25 / 0.12)',
                  border: '1px solid oklch(0.65 0.18 25 / 0.3)',
                  borderRadius: 14,
                  padding: '12px 16px',
                  color: 'var(--danger)',
                  fontSize: 13,
                  marginBottom: 16,
                  textAlign: 'center',
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Sticky bottom buttons */}
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              padding: '16px 20px 40px',
              background: 'linear-gradient(to bottom, transparent, var(--bg) 40%)',
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              onClick={handleRetake}
              style={{
                flex: 1,
                height: 52,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 18,
                color: 'var(--text-muted)',
                fontFamily: 'var(--sans)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <IconRetake size={16} />
              Reselect
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 2,
                height: 52,
                background: saving ? 'var(--accent-wash)' : 'var(--accent)',
                color: saving ? 'var(--text-dim)' : 'var(--on-accent)',
                border: 'none',
                borderRadius: 18,
                fontFamily: 'var(--sans)',
                fontSize: 15,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {saving ? '…' : <><IconCheck size={16} /> Add to Log</>}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: Mood Check ── */}
      {step === 'mood-check' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Header section */}
          <div style={{ padding: '56px 20px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✨</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
              Meal logged!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {savedMealName} · {savedMealCalories} kcal
            </div>
          </div>

          {/* AI Observation card */}
          <Card style={{ margin: '0 20px 20px', background: 'var(--accent-wash)', border: '1px solid var(--accent-line)' }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '0.12em', marginBottom: 8 }}>
              ✦ SAGE OBSERVATION
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>
              {generateMoodObservation(items, savedMealCalories)}
            </div>
          </Card>

          {/* Mood prompt label */}
          <div style={{ padding: '0 20px 12px' }}>
            <span style={{ fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              HOW ARE YOU FEELING?
            </span>
          </div>

          {/* Mood grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 20px' }}>
            {POST_MOODS.map(m => {
              const on = selectedPostMood === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => setSelectedPostMood(m.key)}
                  style={{
                    background: on ? `oklch(0.78 0.09 ${m.hue} / 0.15)` : 'var(--surface)',
                    border: on ? `1.5px solid oklch(0.78 0.09 ${m.hue})` : '1px solid var(--line)',
                    borderRadius: 18,
                    padding: '18px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 32 }}>{m.emoji}</span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: on ? `oklch(0.82 0.08 ${m.hue})` : 'var(--text-muted)',
                    fontFamily: 'var(--sans)',
                  }}>
                    {m.key}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Finish Logging button + Skip link */}
          <div style={{ padding: '24px 20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <button
              onClick={handleFinishLogging}
              disabled={!selectedPostMood || savingMood}
              style={{
                width: '100%',
                height: 56,
                background: selectedPostMood && !savingMood ? 'var(--accent)' : 'var(--surface-2)',
                color: selectedPostMood && !savingMood ? 'var(--on-accent)' : 'var(--text-dim)',
                border: 'none',
                borderRadius: 28,
                fontFamily: 'var(--sans)',
                fontSize: 15,
                fontWeight: 700,
                cursor: selectedPostMood && !savingMood ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {savingMood ? '…' : 'Finish Logging'}
            </button>
            <button
              onClick={() => go('home')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontFamily: 'var(--sans)',
                fontSize: 13,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              Skip to home
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
