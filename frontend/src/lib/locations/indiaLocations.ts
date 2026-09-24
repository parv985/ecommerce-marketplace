import { INDIA_LOCATIONS_DATA } from '@/data/indiaLocations.data'

/**
 * India State/City dataset helpers (frontend half).
 *
 * Backed by the generated `@/data/indiaLocations.data.ts` (the India slice
 * of the `country-state-city` package — regenerate with `npm run data:india`
 * after upgrading it). The backend validates the same pairs server-side
 * via `backend/src/utils/indiaLocations.ts`.
 *
 * Lookup rules (mirrored on the backend):
 *  - Matching is case-insensitive and whitespace-insensitive.
 *  - A "state" may be given as its canonical name ("Gujarat") OR its
 *    ISO code ("GJ") so legacy records stored as codes keep validating.
 *    Display/canonical values are always names.
 *  - Indexes are built once, lazily, on first use.
 */

export interface IndianCityEntry {
  /** Canonical city name. */
  name: string
  /** Canonical state name that owns this (city, state) pair. */
  state: string
}

interface IndexedCity {
  name: string
  norm: string
}

interface IndexedState {
  name: string
  isoCode: string
  normName: string
  normIso: string
  cities: IndexedCity[]
}

interface LocationIndexes {
  states: IndexedState[]
  /** Keyed by normalized state name AND normalized ISO code. */
  stateLookup: Map<string, IndexedState>
  /** Normalized city name → every state that contains it. */
  cityToStates: Map<string, IndexedState[]>
  /** Flat (city, state) pairs sorted by city, then state. */
  entries: IndianCityEntry[]
}

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ')

let cachedIndexes: LocationIndexes | null = null

const buildIndexes = (): LocationIndexes => {
  const states: IndexedState[] = INDIA_LOCATIONS_DATA.states
    .map(({ name, isoCode }) => {
      const seen = new Set<string>()
      const cities: IndexedCity[] = []

      for (const raw of INDIA_LOCATIONS_DATA.cities[isoCode] ?? []) {
        const trimmed = raw.trim()
        const norm = normalize(trimmed)
        if (!norm || seen.has(norm)) continue
        seen.add(norm)
        cities.push({ name: trimmed, norm })
      }

      cities.sort((a, b) => a.norm.localeCompare(b.norm, 'en'))

      return {
        name,
        isoCode,
        normName: normalize(name),
        normIso: normalize(isoCode),
        cities,
      }
    })
    .sort((a, b) => a.normName.localeCompare(b.normName, 'en'))

  const stateLookup = new Map<string, IndexedState>()
  const cityToStates = new Map<string, IndexedState[]>()
  const entries: IndianCityEntry[] = []

  for (const state of states) {
    stateLookup.set(state.normName, state)
    stateLookup.set(state.normIso, state)

    for (const city of state.cities) {
      const owners = cityToStates.get(city.norm) ?? []
      if (!owners.includes(state)) owners.push(state)
      cityToStates.set(city.norm, owners)
      entries.push({ name: city.name, state: state.name })
    }
  }

  entries.sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'en') ||
      a.state.localeCompare(b.state, 'en'),
  )

  return { states, stateLookup, cityToStates, entries }
}

const indexes = (): LocationIndexes => {
  if (!cachedIndexes) cachedIndexes = buildIndexes()
  return cachedIndexes
}

const resolveState = (input: string): IndexedState | null => {
  const norm = normalize(input)
  if (!norm) return null
  return indexes().stateLookup.get(norm) ?? null
}

/** Canonical names of all Indian states and union territories, sorted. */
export const getIndianStates = (): string[] =>
  indexes().states.map((s) => s.name)

/** Canonical state name for a name-or-ISO input, or null when unknown. */
export const getCanonicalIndianState = (input: string): string | null =>
  resolveState(input)?.name ?? null

/** True when the input names an Indian state (canonical name or ISO code). */
export const isValidIndianState = (input: string): boolean =>
  resolveState(input) !== null

/** Canonical city names within a state; empty for an unknown state. */
export const getIndianCitiesForState = (stateInput: string): string[] =>
  resolveState(stateInput)?.cities.map((c) => c.name) ?? []

/** True when the city belongs to the state (name-or-ISO, case-insensitive). */
export const isCityInState = (city: string, stateInput: string): boolean => {
  const state = resolveState(stateInput)
  const normCity = normalize(city)
  if (!state || !normCity) return false
  return state.cities.some((candidate) => candidate.norm === normCity)
}

/**
 * Canonical names of every state containing the city — used to detect
 * ambiguous city names ("Aurangabad" exists in Bihar and Maharashtra).
 */
export const getCityStateCandidates = (city: string): string[] => {
  const normCity = normalize(city)
  if (!normCity) return []
  const owners = indexes().cityToStates.get(normCity) ?? []
  return owners.map((s) => s.name).sort((a, b) => a.localeCompare(b, 'en'))
}

/**
 * Every (city, state) pair, sorted by city then state. Used for the City
 * dropdown when no state is selected yet: ambiguous cities appear once per
 * state with the state shown as the option hint, so picking an option
 * always defines an unambiguous pair.
 */
export const getIndianCityEntries = (): IndianCityEntry[] => indexes().entries
