import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { StateCityFields } from './StateCityFields'

/*
 * Shared State/City behavior for BOTH seller forms:
 *   - State first, City second; typing filters each dropdown.
 *   - State → City: options are restricted to the state; changing the
 *     state clears a now-invalid city and shows an inline notice.
 *   - City → State: picking a city with no state auto-selects its state;
 *     ambiguous names are resolved by the state hint on the picked row,
 *     never by guessing.
 *   - Validation: both required; an untouched legacy pair (off-dataset)
 *     still submits so old rows remain editable.
 *
 * Timeouts are explicit: driving two comboboxes through userEvent is
 * slow under a parallel full-suite run (default is 5s).
 */

interface LocationForm {
  state: string
  city: string
}

function Harness({
  initial = { state: '', city: '' },
  original,
  onSubmit,
}: {
  initial?: LocationForm
  original?: LocationForm
  onSubmit: (data: LocationForm) => void
}) {
  const { control, setValue, getValues, handleSubmit } = useForm<LocationForm>({
    defaultValues: initial,
  })
  const state = useWatch({ control, name: 'state' })
  const city = useWatch({ control, name: 'city' })
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <StateCityFields
        control={control}
        setValue={setValue}
        getValues={getValues}
        originalState={original?.state}
        originalCity={original?.city}
      />
      <span data-testid="state-value">{state}</span>
      <span data-testid="city-value">{city}</span>
      <button type="submit">Save</button>
    </form>
  )
}

const combobox = (name: 'State' | 'City'): HTMLInputElement =>
  screen.getByRole('combobox', { name }) as HTMLInputElement

/** Row whose label starts with `label` (dataset also holds "Jodhpur (Ahmedabad)"). */
const rowStartingWith = (label: string): HTMLElement | undefined =>
  screen
    .getAllByRole('option')
    .find((el) => (el.textContent ?? '').startsWith(label))

describe('StateCityFields', () => {
  it('filters cities by state, then clears an invalid city when the state changes', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    // State → Gujarat
    await user.click(combobox('State'))
    await user.type(combobox('State'), 'guj')
    await user.click(screen.getByRole('option', { name: 'Gujarat' }))
    expect(screen.getByTestId('state-value')).toHaveTextContent('Gujarat')

    // City options are Gujarat-only: Mumbai cannot be found.
    await user.click(combobox('City'))
    expect(screen.queryByText('Mumbai')).not.toBeInTheDocument()
    await user.type(combobox('City'), 'mum')
    expect(screen.getByText('No matches found')).toBeInTheDocument()

    await user.clear(combobox('City'))
    await user.type(combobox('City'), 'ahmedabad')
    const ahmedabadRow = rowStartingWith('Ahmedabad')
    expect(ahmedabadRow).toBeDefined()
    await user.click(ahmedabadRow!)
    expect(screen.getByTestId('city-value')).toHaveTextContent('Ahmedabad')

    // Change the state → the Gujarat city is cleared with a notice.
    await user.click(combobox('State'))
    await user.clear(combobox('State'))
    await user.type(combobox('State'), 'rajasthan')
    await user.click(screen.getByRole('option', { name: 'Rajasthan' }))

    expect(screen.getByTestId('city-value')).toHaveTextContent('')
    expect(
      screen.getByText(/was cleared because it is not in Rajasthan/),
    ).toBeInTheDocument()

    // Submitting without re-picking a city is blocked.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('City is required')
    expect(onSubmit).not.toHaveBeenCalled()
  }, 20_000)

  it('auto-selects the state when a unique city is picked first', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(combobox('City'))
    const ahmedabadRow = rowStartingWith('Ahmedabad')
    expect(ahmedabadRow).toBeDefined()
    await user.click(ahmedabadRow!)

    expect(screen.getByTestId('state-value')).toHaveTextContent('Gujarat')
    expect(screen.getByTestId('city-value')).toHaveTextContent('Ahmedabad')
    expect(combobox('State')).toHaveValue('Gujarat')
  }, 20_000)

  it('never guesses an ambiguous city — the picked row defines the state', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(combobox('City'))
    await user.type(combobox('City'), 'aurangabad')

    // The duplicate name is listed once per state, each with its hint.
    const rows = screen.getAllByRole('option')
    expect(rows).toHaveLength(2)
    expect(
      rows.map((r) => r.textContent?.replace('Aurangabad', '').trim()).sort(),
    ).toEqual(['Bihar', 'Maharashtra'])

    const maharashtraRow = rows.find((r) =>
      (r.textContent ?? '').includes('Maharashtra'),
    )
    await user.click(maharashtraRow!)

    expect(screen.getByTestId('state-value')).toHaveTextContent('Maharashtra')
    expect(screen.getByTestId('city-value')).toHaveTextContent('Aurangabad')
  }, 20_000)

  it('requires both fields before the form can submit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('State is required')).toBeInTheDocument()
    expect(await screen.findByText('City is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  }, 10_000)

  it('lets an untouched legacy pair (off-dataset) submit as-is', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const initial = { state: 'Orissa', city: 'Cuttack' }
    render(<Harness initial={initial} original={initial} onSubmit={onSubmit} />)

    // Legacy values render even though they are not dropdown options.
    expect(combobox('State')).toHaveValue('Orissa')
    expect(combobox('City')).toHaveValue('Cuttack')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(initial, expect.anything()),
    )
  }, 10_000)
})
