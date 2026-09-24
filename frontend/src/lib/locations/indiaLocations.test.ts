import { describe, expect, it } from 'vitest'

import {
  getCanonicalIndianState,
  getCityStateCandidates,
  getIndianCitiesForState,
  getIndianCityEntries,
  getIndianStates,
  isCityInState,
  isValidIndianState,
} from './indiaLocations'

/*
 * The frontend dataset wrapper mirrors backend/src/utils/indiaLocations.ts:
 * same normalization rules (name-or-ISO, case/whitespace-insensitive) so a
 * pair accepted client-side is accepted server-side and vice versa.
 */

describe('getIndianStates', () => {
  it('lists every Indian state and union territory, sorted', () => {
    const states = getIndianStates()

    expect(states.length).toBeGreaterThanOrEqual(36)
    expect(states).toContain('Gujarat')
    expect(states).toContain('Delhi')
    expect(states).toContain('Odisha')
    expect([...states].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(states)
  })
})

describe('isValidIndianState / getCanonicalIndianState', () => {
  it('accepts canonical names and ISO codes case-insensitively', () => {
    expect(isValidIndianState('Gujarat')).toBe(true)
    expect(isValidIndianState(' gujarat ')).toBe(true)
    expect(isValidIndianState('GJ')).toBe(true)
    expect(isValidIndianState('mh')).toBe(true)
  })

  it('rejects unknown and empty states', () => {
    expect(isValidIndianState('Atlantis')).toBe(false)
    expect(isValidIndianState('')).toBe(false)
    expect(isValidIndianState('   ')).toBe(false)
  })

  it('normalizes ISO codes to canonical names', () => {
    expect(getCanonicalIndianState('GJ')).toBe('Gujarat')
    expect(getCanonicalIndianState('west bengal')).toBe('West Bengal')
    expect(getCanonicalIndianState('zz')).toBeNull()
  })
})

describe('getIndianCitiesForState / isCityInState', () => {
  it("lists a state's cities whether given a name or an ISO code", () => {
    expect(getIndianCitiesForState('Gujarat')).toContain('Ahmedabad')
    expect(getIndianCitiesForState('GJ')).toContain('Ahmedabad')
    expect(getIndianCitiesForState('Atlantis')).toEqual([])
  })

  it('verifies city/state pairs independent of case and spacing', () => {
    expect(isCityInState('Ahmedabad', 'Gujarat')).toBe(true)
    expect(isCityInState('ahmedabad ', 'gj')).toBe(true)
    expect(isCityInState('Ahmedabad', 'Maharashtra')).toBe(false)
    expect(isCityInState('Nowhereville', 'Gujarat')).toBe(false)
    expect(isCityInState('', 'Gujarat')).toBe(false)
  })
})

describe('getCityStateCandidates', () => {
  it('returns every state containing an ambiguous city name', () => {
    expect(getCityStateCandidates('Aurangabad')).toEqual([
      'Bihar',
      'Maharashtra',
    ])
    expect(getCityStateCandidates('AHMEDABAD')).toEqual(['Gujarat'])
    expect(getCityStateCandidates('Nowhereville')).toEqual([])
  })
})

describe('getIndianCityEntries', () => {
  it('emits one (city, state) pair per state, sorted by city name', () => {
    const entries = getIndianCityEntries()

    expect(entries.length).toBeGreaterThan(4000)
    expect(entries).toContainEqual({ name: 'Ahmedabad', state: 'Gujarat' })

    // The ambiguous name appears once per owning state so a dropdown row
    // can always define the full pair.
    const aurangabad = entries.filter((e) => e.name === 'Aurangabad')
    expect(aurangabad.map((e) => e.state).sort()).toEqual([
      'Bihar',
      'Maharashtra',
    ])

    const [first] = entries
    expect(first.name <= entries[entries.length - 1].name).toBe(true)
  })
})
