import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react'
import { toDisplayLength, toMeters } from '../lib/units'
import { useUnits } from '../lib/useUnits'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'min' | 'max' | 'step'> & {
  defaultMeters?: number
  minMeters?: number
  maxMeters?: number
}

/** Uncontrolled form field. Form submissions must convert the displayed value to SI. */
export function LengthInput({ defaultMeters, minMeters, maxMeters, ...props }: Props) {
  const { system } = useUnits()
  const input = useRef<HTMLInputElement>(null)
  const initialValue = useRef(defaultMeters === undefined ? undefined : toDisplayLength(defaultMeters, system))
  const previousSystem = useRef(system)
  useLayoutEffect(() => {
    const field = input.current
    if (field && previousSystem.current !== system && Number.isFinite(field.valueAsNumber)) {
      field.value = String(toDisplayLength(toMeters(field.valueAsNumber, previousSystem.current), system))
    }
    previousSystem.current = system
  }, [system])
  return <input {...props} ref={input} type="number" step="any"
    defaultValue={initialValue.current}
    min={minMeters === undefined ? undefined : toDisplayLength(minMeters, system)}
    max={maxMeters === undefined ? undefined : toDisplayLength(maxMeters, system)} />
}
