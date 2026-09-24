import { City, State } from "country-state-city";

/**
 * India State/City dataset helpers.
 *
 * Thin, dependency-light wrapper around `country-state-city` that both
 * seller schemas (registration / profile update) and the seller service
 * use to verify that a submitted state/city pair is a real Indian pair.
 *
 * Lookup rules:
 *  - Matching is case-insensitive and whitespace-insensitive.
 *  - A "state" may be given as its canonical name ("Gujarat") OR its
 *    ISO code ("GJ") so older records and API clients that store codes
 *    keep validating. Display/canonical values are always names.
 *  - The dataset is loaded once and indexed lazily; nothing is stored
 *    in MongoDB.
 */

const INDIA_COUNTRY_CODE = "IN";

interface IndexedCity {
  readonly name: string;
  readonly norm: string;
}

interface IndexedState {
  readonly name: string;
  readonly isoCode: string;
  readonly normName: string;
  readonly normIso: string;
  readonly cities: readonly IndexedCity[];
}

interface LocationIndexes {
  readonly states: readonly IndexedState[];
  /** Keyed by normalized state name AND normalized ISO code. */
  readonly stateLookup: Map<string, IndexedState>;
  /** Normalized city name → every state that contains it. */
  readonly cityToStates: Map<string, IndexedState[]>;
}

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

let cachedIndexes: LocationIndexes | null = null;

const buildIndexes = (): LocationIndexes => {
  const states: IndexedState[] = (
    State.getStatesOfCountry(INDIA_COUNTRY_CODE) ?? []
  )
    .map((state) => {
      const seen = new Set<string>();
      const cities: IndexedCity[] = [];

      for (const city of City.getCitiesOfState(
        INDIA_COUNTRY_CODE,
        state.isoCode,
      ) ?? []) {
        const name = city.name.trim();
        const norm = normalize(name);

        if (!norm || seen.has(norm)) continue;

        seen.add(norm);
        cities.push({ name, norm });
      }

      cities.sort((a, b) => a.norm.localeCompare(b.norm, "en"));

      const name = state.name.trim();

      return {
        name,
        isoCode: state.isoCode,
        normName: normalize(name),
        normIso: normalize(state.isoCode),
        cities,
      };
    })
    .sort((a, b) => a.normName.localeCompare(b.normName, "en"));

  const stateLookup = new Map<string, IndexedState>();
  const cityToStates = new Map<string, IndexedState[]>();

  for (const state of states) {
    stateLookup.set(state.normName, state);
    stateLookup.set(state.normIso, state);

    for (const city of state.cities) {
      const owners = cityToStates.get(city.norm) ?? [];

      if (!owners.includes(state)) {
        owners.push(state);
      }

      cityToStates.set(city.norm, owners);
    }
  }

  return { states, stateLookup, cityToStates };
};

const indexes = (): LocationIndexes => {
  if (!cachedIndexes) {
    cachedIndexes = buildIndexes();
  }

  return cachedIndexes;
};

const resolveState = (input: string): IndexedState | null => {
  const norm = normalize(input);

  if (!norm) return null;

  return indexes().stateLookup.get(norm) ?? null;
};

/** Canonical names of all Indian states and union territories, sorted. */
export const getIndianStates = (): string[] => {
  return indexes().states.map((state) => state.name);
};

/** Canonical state name for a name-or-ISO input, or null when unknown. */
export const getCanonicalIndianState = (input: string): string | null => {
  return resolveState(input)?.name ?? null;
};

/** True when the input names an Indian state (canonical name or ISO code). */
export const isValidIndianState = (input: string): boolean => {
  return resolveState(input) !== null;
};

/** Canonical city names within a state; empty for an unknown state. */
export const getIndianCitiesForState = (stateInput: string): string[] => {
  return resolveState(stateInput)?.cities.map((city) => city.name) ?? [];
};

/** True when the city belongs to the state (name-or-ISO, case-insensitive). */
export const isCityInState = (city: string, stateInput: string): boolean => {
  const state = resolveState(stateInput);
  const normCity = normalize(city);

  if (!state || !normCity) return false;

  return state.cities.some((candidate) => candidate.norm === normCity);
};

/**
 * Canonical names of every state containing the city — used to detect
 * ambiguous city names ("Aurangabad" exists in Bihar and Maharashtra).
 */
export const getCityStateCandidates = (city: string): string[] => {
  const normCity = normalize(city);

  if (!normCity) return [];

  const owners = indexes().cityToStates.get(normCity) ?? [];

  return owners
    .map((state) => state.name)
    .sort((a, b) => a.localeCompare(b, "en"));
};
