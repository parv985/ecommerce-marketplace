import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormGetValues,
  type UseFormSetValue,
} from 'react-hook-form'
import type { ComboboxOption } from '@/components/ui/Combobox'
import {
  getCanonicalIndianState,
  getCityStateCandidates,
  getIndianCitiesForState,
  getIndianCityEntries,
  getIndianStates,
  isCityInState,
  isValidIndianState,
} from '@/lib/locations/indiaLocations'

/**
 * All bidirectional State/City form logic, shared by the seller
 * registration and seller profile forms so neither reimplements it:
 *
 *  - **State → City**: the City options are restricted to the selected
 *    state; changing the state clears a city that is no longer valid and
 *    surfaces an inline notice explaining why.
 *  - **City → State**: with no state selected, city options carry their
 *    owning state ("Aurangabad" appears once for Bihar and once for
 *    Maharashtra), so picking one resolves the state — unambiguous names
 *    auto-select silently, ambiguous ones are disambiguated by the state
 *    hint the seller sees and picks, never by guessing.
 *  - **Validation rules**: state must be a real Indian state; city must
 *    belong to it. Values that exactly match the original server data
 *    pass as-is, so legacy off-dataset rows stay editable (the backend
 *    re-checks any pair the payload actually touches).
 *
 * Used through `<StateCityFields>` — pages pass their `useForm` accessors.
 */

interface UseStateCityFormOptions<T extends FieldValues> {
  control: Control<T>
  setValue: UseFormSetValue<T>
  getValues: UseFormGetValues<T>
  /** Server value the form started with — untouched legacy values pass validation. */
  originalState?: string
  originalCity?: string
}

const trimmed = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export function useStateCityForm<T extends FieldValues>({
  control,
  setValue,
  getValues,
  originalState = '',
  originalCity = '',
}: UseStateCityFormOptions<T>) {
  // Both seller forms declare string `state` / `city` fields; the Path
  // casts keep this shared helper usable from any of those form types.
  const stateValue = trimmed(useWatch({ control, name: 'state' as Path<T> }))
  const [notice, setNotice] = useState<string | null>(null)

  // Only a seller-driven state change may clear the city — prefilling the
  // form (or a programmatic state write from city auto-selection) must not.
  const stateTouchedByUserRef = useRef(false)

  const stateOptions = useMemo<ComboboxOption[]>(
    () => getIndianStates().map((name) => ({ value: name, label: name })),
    [],
  )

  const cityOptions = useMemo<ComboboxOption[]>(() => {
    const state = stateValue

    if (state) {
      const canonical = getCanonicalIndianState(state) ?? state
      return getIndianCitiesForState(state).map((name) => ({
        value: name,
        label: name,
        state: canonical,
      }))
    }

    // No state yet: one row per (city, state) pair so ambiguous city names
    // show their state as a hint and picking one defines the full pair.
    return getIndianCityEntries().map(({ name, state: owner }) => ({
      value: name,
      label: name,
      hint: owner,
      state: owner,
    }))
  }, [stateValue])

  /* ── State → City: drop a city that no longer fits the new state ── */
  useEffect(() => {
    if (!stateTouchedByUserRef.current) return
    stateTouchedByUserRef.current = false

    const city = trimmed(getValues('city' as Path<T>))
    const state = stateValue

    if (city && state && !isCityInState(city, state)) {
      setValue('city' as Path<T>, '' as never, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setNotice(
        `City "${city}" was cleared because it is not in ${state}. Please select a new city.`,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateValue, getValues, setValue])

  /** Called from the State combobox's onChange with the picked option. */
  const handleStateChange =
    (fieldOnChange: (value: string) => void) =>
    (option: ComboboxOption | null) => {
      const next = option?.value ?? ''
      if (next !== trimmed(getValues('state' as Path<T>))) {
        stateTouchedByUserRef.current = true
        setNotice(null)
      }
      fieldOnChange(next)
    }

  /**
   * Called from the City combobox's onChange. When no state is selected
   * (or the stored state is an ISO code the dataset knows a name for),
   * the picked option's state is written back — this is the
   * City → State auto-selection ("Ahmedabad" → "Gujarat") and the
   * ambiguity-safe disambiguation (the seller picked the row labelled
   * "Aurangabad · Maharashtra", so Maharashtra — not Bihar — is stored).
   */
  const handleCityChange =
    (fieldOnChange: (value: string) => void) =>
    (option: ComboboxOption | null) => {
      setNotice(null)
      fieldOnChange(option?.value ?? '')

      if (option?.state) {
        const current = trimmed(getValues('state' as Path<T>))
        if (current !== option.state) {
          // The pair (city, state) comes from one option, so never mark
          // this as a user state edit — it must not clear the city.
          setValue('state' as Path<T>, option.state as never, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      }
    }

  /* ── Validation rules attached to the two Controller fields ── */

  const stateRules = {
    validate: (value: string): true | string => {
      const next = trimmed(value)
      if (!next) return 'State is required'
      // Untouched legacy value — keep it editable even if off-dataset.
      if (next === trimmed(originalState)) return true
      if (!isValidIndianState(next)) return 'Not a valid Indian state'
      return true
    },
  }

  const cityRules = {
    validate: (value: string): true | string => {
      const next = trimmed(value)
      if (!next) return 'City is required'

      const state = trimmed(getValues('state' as Path<T>))
      const legacyPairUntouched =
        next === trimmed(originalCity) && state === trimmed(originalState)

      if (legacyPairUntouched) return true

      if (state) {
        return (
          isCityInState(next, state) || `"${next}" is not a city in ${state}`
        )
      }
      return (
        getCityStateCandidates(next).length > 0 ||
        `"${next}" is not a valid Indian city`
      )
    },
  }

  return {
    stateOptions,
    cityOptions,
    /** Inline notice shown under the City combobox (e.g. city cleared). */
    notice,
    handleStateChange,
    handleCityChange,
    stateRules,
    cityRules,
  }
}
