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
  { id: 'windows', name: 'Fenêtres', price: 30 },
  { id: 'oven', name: 'Four', price: 25 },
  { id: 'fridge', name: 'Réfrigérateur', price: 35 },
  { id: 'basement', name: 'Sous-sol', price: 50 },
  { id: 'garage', name: 'Garage', price: 40 },
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
 * rounded to the dollar, then QC taxes (rounded to the dollar).
 */
export function estimatePrice(input: EstimateInput): Estimate {
  const base = input.service ? SERVICE_PRICES[input.service]?.from ?? 0 : 0
  const areaValue = input.area ? AREA_MULTIPLIERS[input.area] : 1
  const quoteRequired = areaValue === null
  const areaMultiplier = areaValue ?? 1
  const propertyTypeMultiplier = input.propertyType ? PROPERTY_TYPE_MULTIPLIERS[input.propertyType] ?? 1 : 1

  const sized = base * areaMultiplier
  const adjusted = sized * propertyTypeMultiplier
  const addOns = ADD_ONS.filter((a) => input.addOnIds.includes(a.id))
  const addOnsTotal = addOns.reduce((sum, a) => sum + a.price, 0)
  const beforeDiscount = adjusted + addOnsTotal
  const discountRate = FREQUENCY_DISCOUNTS[input.frequency] ?? 0
  const subtotal = Math.round(beforeDiscount * (1 - discountRate))
  const taxes = Math.round(subtotal * QC_TAX_RATE)

  return {
    base,
    areaMultiplier,
    areaAdjustment: cents(sized - base),
    propertyTypeMultiplier,
    propertyTypeAdjustment: cents(adjusted - sized),
    addOns,
    addOnsTotal,
    beforeDiscount: cents(beforeDiscount),
    discountRate,
    discount: cents(beforeDiscount * discountRate),
    subtotal,
    taxes,
    total: subtotal + taxes,
    quoteRequired,
  }
}

export function pricingTables() {
  return {
    services: SERVICE_PRICES,
    addOns: ADD_ONS,
    frequencyDiscounts: FREQUENCY_DISCOUNTS,
    areaMultipliers: AREA_MULTIPLIERS,
    propertyTypeMultipliers: PROPERTY_TYPE_MULTIPLIERS,
    taxRate: QC_TAX_RATE,
  }
}
