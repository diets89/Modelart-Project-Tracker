import { Check, Minus } from '@phosphor-icons/react'
import type { Step, StepMark, StepStamp } from '@shared/types'
import { useStore } from '../store'
import { cx, fmtWhen } from '../ui'

const NEXT: Record<string, StepMark | null> = { none: 'started', started: 'done', done: null, na: null }

/**
 * One progress cell. Click: empty -> started -> done -> empty.
 * Right-click: toggles N/A (step doesn't apply to this item).
 * In templates only N/A can be set.
 */
export function StepCell({
  step,
  stamp,
  template,
  onSet
}: {
  step: Step
  stamp?: StepStamp
  template?: boolean
  onSet: (mark: StepMark | null) => void
}) {
  const people = useStore((s) => s.people)
  const mark = stamp?.s ?? 'none'
  const who = stamp ? people.find((p) => p.id === stamp.by)?.name ?? stamp.by : ''
  const title =
    mark === 'none'
      ? template
        ? `${step.label}: applies. Click to mark not needed.`
        : `${step.label}: not started. Click to start.`
      : mark === 'na'
        ? `${step.label}: not needed for this item. ${template ? 'Click' : 'Right-click'} to include it.`
        : `${step.label}: ${mark}${who && who !== 'import' ? ` by ${who}` : ''}${stamp?.at && stamp.by !== 'import' ? `, ${fmtWhen(stamp.at)}` : ''}`

  const click = (): void => {
    if (template) onSet(mark === 'na' ? null : 'na')
    else if (mark === 'na') return
    else onSet(NEXT[mark])
  }
  return (
    <button
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        click()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSet(mark === 'na' ? null : 'na')
      }}
      className={cx(
        'press flex h-[26px] w-[34px] items-center justify-center rounded-md border',
        mark === 'none' && (template ? 'border-line bg-sunken/60' : 'border-line-strong/70 border-dashed hover:border-done hover:bg-done-soft'),
        mark === 'started' && 'step-started border-done/70',
        mark === 'done' && 'border-done bg-done text-white',
        mark === 'na' && 'border-transparent text-faint'
      )}
    >
      {mark === 'done' && <Check size={14} weight="bold" />}
      {mark === 'na' && <Minus size={14} />}
    </button>
  )
}
