// Port of the website's src/app/shared/pricing.ts (single source of truth for
// prices). The real backend's PricingService mirrors the same tables.
import type { AreaRange, Estimate, EstimateInput, PropertyType, ServiceId } from '../api/types'

export const SERVICE_PRICES: Record<ServiceId, { from: number; bookable: boolean }> = {
  residential: { from: 120, bookable: true },
  commercial: { from: 200, bookable: true },
  deep_cleaning: { from: 280, bookable: true },
  post_construction: { from: 350, bookable: false },
}

export const ADD_ONS = [
  { id: 'windows', labelFr: 'Fenêtres', labelEn: 'Windows', price: 30 },
  { id: 'oven', labelFr: 'Four', labelEn: 'Oven', price: 25 },
  { id: 'fridge', labelFr: 'Réfrigérateur', labelEn: 'Fridge', price: 35 },
  { id: 'basement', labelFr: 'Sous-sol', labelEn: 'Basement', price: 50 },
  { id: 'garage', labelFr: 'Garage', labelEn: 'Garage', price: 40 },
]

export const FREQUENCY_DISCOUNTS: Record<string, number> = {
  'one-time': 0,
  monthly: 0.05,
  'bi-weekly': 0.1,
  weekly: 0.15,
}

export const QC_TAX_RATE = 0.14975

export const AREA_MULTIPLIERS: Record<AreaRange, number | null> = {
  under_800: 1,
  '800_1500': 1.25,
  '1500_2500': 1.5,
  over_2500: null,
}

export const PROPERTY_TYPE_MULTIPLIERS: Record<PropertyType, number> = {
  apartment: 1,
  house: 1.15,
  townhouse: 1.15,
  office: 1,
  retail: 1,
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * (base × area × propertyType + add-ons) × (1 − frequency discount),
 * rounded to the dollar, then QC taxes (rounded to the dollar). Same response
 * shape as the backend's PricingService: null amounts when a quote is required.
 */
export function estimatePrice(input: EstimateInput): Estimate {
  const service = (input.service || 'commercial') as Estimate['service']
  const base = SERVICE_PRICES[service]?.from ?? 0
  const areaValue = input.area ? AREA_MULTIPLIERS[input.area] : 1
  const requiresQuote = areaValue === null
  const areaMultiplier = areaValue ?? null
  const propertyTypeMultiplier = input.propertyType ? PROPERTY_TYPE_MULTIPLIERS[input.propertyType] ?? 1 : 1
  const addOns = ADD_ONS.filter((a) => input.addOnIds.includes(a.id))
  const addOnsTotal = addOns.reduce((sum, a) => sum + a.price, 0)
  const discountRate = FREQUENCY_DISCOUNTS[input.frequency] ?? 0
  const common = {
    service,
    basePrice: base,
    area: input.area || null,
    areaMultiplier,
    propertyType: input.propertyType || null,
    propertyTypeMultiplier,
    frequency: input.frequency,
    discountRate,
    addOns,
    addOnsTotal,
    currency: 'CAD' as const,
    requiresQuote,
  }
  if (requiresQuote) return { ...common, servicePrice: null, discountAmount: null, subtotal: null, taxes: null, total: null }
  const servicePrice = cents(base * (areaMultiplier ?? 1) * propertyTypeMultiplier)
  const beforeDiscount = servicePrice + addOnsTotal
  const subtotal = Math.round(beforeDiscount * (1 - discountRate))
  const taxes = Math.round(subtotal * QC_TAX_RATE)
  return { ...common, servicePrice, discountAmount: Math.round(beforeDiscount * discountRate), subtotal, taxes, total: subtotal + taxes }
}

export function pricingTables() {
  return {
    servicePrices: Object.fromEntries(Object.entries(SERVICE_PRICES).map(([k, v]) => [k, v.from])),
    addOns: ADD_ONS,
    addOnPrices: Object.fromEntries(ADD_ONS.map((a) => [a.id, a.price])),
    frequencyDiscounts: FREQUENCY_DISCOUNTS,
    areaMultipliers: AREA_MULTIPLIERS,
    propertyTypeMultipliers: PROPERTY_TYPE_MULTIPLIERS,
    taxRate: QC_TAX_RATE,
    notBookable: Object.entries(SERVICE_PRICES).filter(([, v]) => !v.bookable).map(([k]) => k),
  }
}
