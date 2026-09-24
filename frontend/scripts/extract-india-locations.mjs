/**
 * Regenerates `src/data/indiaLocations.data.ts` from the installed
 * `country-state-city` package.
 *
 * The upstream package ships a ~8 MB `city.json` for EVERY country, which
 * would dominate the browser bundle if imported directly. This script
 * extracts just the India slice (~36 states/UTs, ~4.2k city names) into a
 * small, tree-shakeable TypeScript module that `@/lib/locations/indiaLocations`
 * builds its indexes from.
 *
 * Run after upgrading `country-state-city`:
 *
 *     npm run data:india
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { State, City } = require('country-state-city')

const INDIA = 'IN'
const __dirname = dirname(fileURLToPath(import.meta.url))

const version = require('country-state-city/package.json').version

const states = (State.getStatesOfCountry(INDIA) ?? [])
  .map((s) => ({ name: s.name.trim(), isoCode: s.isoCode }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))

/** ISO code → deduped, sorted canonical city names. */
const cities = {}
for (const state of states) {
  const seen = new Set()
  const names = []
  for (const city of City.getCitiesOfState(INDIA, state.isoCode) ?? []) {
    const name = city.name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  names.sort((a, b) => a.localeCompare(b, 'en'))
  cities[state.isoCode] = names
}

const totalCities = Object.values(cities).reduce((n, l) => n + l.length, 0)

const output = `// AUTO-GENERATED FILE - do not edit by hand.
// Source: country-state-city@${version} (India slice only).
// Regenerate with: npm run data:india

export interface IndiaStateRecord {
  name: string
  isoCode: string
}

export interface IndiaLocationsData {
  /** Indian states and union territories, sorted by name. */
  states: IndiaStateRecord[]
  /** ISO state code -> canonical city names, sorted, deduped. */
  cities: Record<string, string[]>
}

export const INDIA_LOCATIONS_DATA: IndiaLocationsData = ${JSON.stringify({ states, cities }, null, 2)}
`

const target = resolve(__dirname, '../src/data/indiaLocations.data.ts')
writeFileSync(target, output)
console.log(
  `Wrote ${target}\n  ${states.length} states/UTs, ${totalCities} cities, ${(output.length / 1024).toFixed(1)} KB`,
)
