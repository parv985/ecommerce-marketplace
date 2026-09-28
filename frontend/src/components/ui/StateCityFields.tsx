import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
  type UseFormGetValues,
  type UseFormSetValue,
} from 'react-hook-form'
import { Combobox } from '@/components/ui/Combobox'
import { useStateCityForm } from '@/hooks/useStateCityForm'

/**
 * Shared State + City address fields for registration, profile, checkout,
 * and address management forms. Renders two searchable comboboxes —
 * **State first, then City** — wired to the surrounding `useForm`:
 *
 *  - State filters the City options to that state's cities.
 *  - Picking a City before a State auto-selects the matching State
 *    (ambiguous names are disambiguated by the state hint on the row).
 *  - Changing the State clears a City that is no longer valid.
 *
 * The component renders a fragment: drop it directly into the form's
 * address grid (e.g. `<div className="grid grid-cols-2 gap-3">`).
 */

export interface StateCityFieldsProps<T extends FieldValues> {
  control: Control<T>
  setValue: UseFormSetValue<T>
  getValues: UseFormGetValues<T>
  /** Server values the form was pre-filled with (edit mode). */
  originalState?: string
  originalCity?: string
  statePlaceholder?: string
  cityPlaceholder?: string
}

export function StateCityFields<T extends FieldValues>({
  control,
  setValue,
  getValues,
  originalState,
  originalCity,
  statePlaceholder = 'Search state…',
  cityPlaceholder = 'Search city…',
}: StateCityFieldsProps<T>) {
  const {
    stateOptions,
    cityOptions,
    notice,
    handleStateChange,
    handleCityChange,
    stateRules,
    cityRules,
  } = useStateCityForm({
    control,
    setValue,
    getValues,
    originalState,
    originalCity,
  })

  return (
    <>
      <Controller
        control={control}
        name={'state' as Path<T>}
        rules={stateRules}
        render={({ field, fieldState }) => (
          <Combobox
            label="State"
            value={typeof field.value === 'string' ? field.value : ''}
            options={stateOptions}
            onChange={handleStateChange(field.onChange)}
            placeholder={statePlaceholder}
            error={fieldState.error?.message}
            disabled={field.disabled}
          />
        )}
      />
      <Controller
        control={control}
        name={'city' as Path<T>}
        rules={cityRules}
        render={({ field, fieldState }) => (
          <Combobox
            label="City"
            value={typeof field.value === 'string' ? field.value : ''}
            options={cityOptions}
            onChange={handleCityChange(field.onChange)}
            placeholder={cityPlaceholder}
            error={fieldState.error?.message}
            hint={notice ?? undefined}
            disabled={field.disabled}
          />
        )}
      />
    </>
  )
}
