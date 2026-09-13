import { useEffect, useMemo, useState, type ReactNode } from 'react'

export type PrintPosition = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export type PrintTargetType = 'title' | 'day' | 'period' | 'lesson'

type TitleSettings = { prefix: boolean; prefixText: string; format: 'first_last' | 'last_first' | 'short'; centered: boolean; header: string }
type DaySettings = { format: 'short' | 'full' | 'number'; position: PrintPosition; vertical: boolean; overflow: 'rows' | 'smaller' | 'cut' }
type PeriodSettings = { showInterval: boolean; timePosition: PrintPosition; lessonPosition: PrintPosition; twoLines: boolean; showBell: boolean }
type FieldSettings = { show: boolean; position: PrintPosition }
type LessonSettings = { subject: FieldSettings; teacher: FieldSettings; class: FieldSettings; group: FieldSettings; room: FieldSettings; count: FieldSettings }
export type PrintConfig = { version: 1; title: Record<string, TitleSettings>; days: Record<string, DaySettings>; periods: Record<string, PeriodSettings>; lessons: Record<string, LessonSettings> }

const STORAGE_KEY = 'phikila:timetable-print-config:v1'
const DEFAULT_POSITION: PrintPosition = 4
const field = (show = true, position: PrintPosition = DEFAULT_POSITION): FieldSettings => ({ show, position })
const defaultLesson = (): LessonSettings => ({ subject: field(true, 4), teacher: field(true, 7), class: field(true, 1), group: field(false, 6), room: field(false, 8), count: field(false, 2) })
const defaults = (): PrintConfig => ({ version: 1, title: {}, days: {}, periods: {}, lessons: {} })

function safeLoad(): PrintConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Partial<PrintConfig>
    return { ...defaults(), ...parsed, version: 1, title: parsed.title ?? {}, days: parsed.days ?? {}, periods: parsed.periods ?? {}, lessons: parsed.lessons ?? {} }
  } catch { return defaults() }
}

export function usePrintStore() {
  const [state, setState] = useState<PrintConfig>(() => safeLoad())
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {} }, [state])
  const get = <T extends PrintTargetType>(type: T, id: string): T extends 'title' ? TitleSettings : T extends 'day' ? DaySettings : T extends 'period' ? PeriodSettings : LessonSettings => {
    if (type === 'title') return ({ prefix: false, prefixText: '', format: 'first_last', centered: true, header: '', ...(state.title[id] ?? {}) } as unknown) as ReturnType<typeof get>
    if (type === 'day') return ({ format: 'full', position: DEFAULT_POSITION, vertical: false, overflow: 'smaller', ...(state.days[id] ?? {}) } as unknown) as ReturnType<typeof get>
    if (type === 'period') return ({ showInterval: true, timePosition: 1, lessonPosition: 7, twoLines: false, showBell: false, ...(state.periods[id] ?? {}) } as unknown) as ReturnType<typeof get>
    return ({ ...defaultLesson(), ...(state.lessons[id] ?? {}) } as unknown) as ReturnType<typeof get>
  }
  const set = <T extends PrintTargetType>(type: T, id: string, value: Partial<T extends 'title' ? TitleSettings : T extends 'day' ? DaySettings : T extends 'period' ? PeriodSettings : LessonSettings>) => {
    setState((previous) => {
      const bucket = type === 'title' ? 'title' : type === 'day' ? 'days' : type === 'period' ? 'periods' : 'lessons'
      return { ...previous, [bucket]: { ...previous[bucket], [id]: { ...(previous[bucket][id] ?? {}), ...value } } } as PrintConfig
    })
  }
  const reset = (type: PrintTargetType, id: string) => setState((previous) => { const bucket = type === 'title' ? 'title' : type === 'day' ? 'days' : type === 'period' ? 'periods' : 'lessons'; const next = { ...previous[bucket] }; delete next[id]; return { ...previous, [bucket]: next } as PrintConfig })
  return { get, set, reset, state }
}

export function Pos({ value, onChange }: { value: PrintPosition; onChange: (value: PrintPosition) => void }) {
  return <div className="grid grid-cols-3 gap-1.5 w-[92px]" aria-label="Print position">
    {Array.from({ length: 9 }, (_, index) => <button key={index} type="button" aria-label={`Position ${index + 1}`} aria-pressed={value === index} onClick={() => onChange(index as PrintPosition)} className={`h-6 rounded border text-[10px] transition ${value === index ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>{index + 1}</button>)}
  </div>
}

function Wrap({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [onClose])
  return <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><h2 className="font-semibold text-slate-900">{title}</h2><button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900" aria-label="Close">×</button></div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  </div>
}

function Row({ label, children }: { label: string; children: ReactNode }) { return <div className="flex items-center justify-between gap-4"><label className="text-sm text-slate-700">{label}</label>{children}</div> }
function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800">{children}</select> }

export function TitlePopup({ id, get, set, onClose }: { id: string; get: ReturnType<typeof usePrintStore>['get']; set: ReturnType<typeof usePrintStore>['set']; onClose: () => void }) {
  const value = get('title', id); const update = (patch: Partial<TitleSettings>) => set('title', id, patch)
  return <Wrap title="Print title" onClose={onClose}><Row label="Show prefix"><input type="checkbox" checked={value.prefix} onChange={(e) => update({ prefix: e.target.checked })} /></Row><Row label="Prefix text"><input value={value.prefixText} onChange={(e) => update({ prefixText: e.target.value })} className="w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></Row><Row label="Name format"><Select value={value.format} onChange={(v) => update({ format: v as TitleSettings['format'] })}><option value="first_last">First Last</option><option value="last_first">Last, First</option><option value="short">Short</option></Select></Row><Row label="Centered"><input type="checkbox" checked={value.centered} onChange={(e) => update({ centered: e.target.checked })} /></Row><Row label="Header"><input value={value.header} onChange={(e) => update({ header: e.target.value })} className="w-52 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></Row><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Done</button></div></Wrap>
}

export function DayPopup({ id, get, set, onClose }: { id: string; get: ReturnType<typeof usePrintStore>['get']; set: ReturnType<typeof usePrintStore>['set']; onClose: () => void }) {
  const value = get('day', id); const update = (patch: Partial<DaySettings>) => set('day', id, patch)
  return <Wrap title="Print day" onClose={onClose}><Row label="Day format"><Select value={value.format} onChange={(v) => update({ format: v as DaySettings['format'] })}><option value="short">Short</option><option value="full">Full name</option><option value="number">Number</option></Select></Row><Row label="Position"><Pos value={value.position} onChange={(position) => update({ position })} /></Row><Row label="Vertical text"><input type="checkbox" checked={value.vertical} onChange={(e) => update({ vertical: e.target.checked })} /></Row><Row label="Overflow"><Select value={value.overflow} onChange={(v) => update({ overflow: v as DaySettings['overflow'] })}><option value="rows">Additional rows</option><option value="smaller">Smaller text</option><option value="cut">Cut text</option></Select></Row><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Done</button></div></Wrap>
}

export function PeriodPopup({ id, get, set, onClose }: { id: string; get: ReturnType<typeof usePrintStore>['get']; set: ReturnType<typeof usePrintStore>['set']; onClose: () => void }) {
  const value = get('period', id); const update = (patch: Partial<PeriodSettings>) => set('period', id, patch)
  return <Wrap title="Print period" onClose={onClose}><Row label="Show interval"><input type="checkbox" checked={value.showInterval} onChange={(e) => update({ showInterval: e.target.checked })} /></Row><Row label="Time position"><Pos value={value.timePosition} onChange={(position) => update({ timePosition: position })} /></Row><Row label="Lesson number position"><Pos value={value.lessonPosition} onChange={(position) => update({ lessonPosition: position })} /></Row><Row label="Two-line time"><input type="checkbox" checked={value.twoLines} onChange={(e) => update({ twoLines: e.target.checked })} /></Row><Row label="Show bell"><input type="checkbox" checked={value.showBell} onChange={(e) => update({ showBell: e.target.checked })} /></Row><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Done</button></div></Wrap>
}

const LESSON_FIELDS: Array<[keyof LessonSettings, string]> = [['subject', 'Subject'], ['teacher', 'Teacher'], ['class', 'Class'], ['group', 'Group'], ['room', 'Room'], ['count', 'Count']]
export function LessonPopup({ id, get, set, onClose }: { id: string; get: ReturnType<typeof usePrintStore>['get']; set: ReturnType<typeof usePrintStore>['set']; onClose: () => void }) {
  const value = get('lesson', id); const updateField = (fieldName: keyof LessonSettings, patch: Partial<FieldSettings>) => set('lesson', id, { [fieldName]: { ...value[fieldName], ...patch } } as Partial<LessonSettings>)
  return <Wrap title="Print lesson" onClose={onClose}><div className="space-y-2">{LESSON_FIELDS.map(([fieldName, label]) => <div key={fieldName} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={value[fieldName].show} onChange={(e) => updateField(fieldName, { show: e.target.checked })} />{label}</label><Pos value={value[fieldName].position} onChange={(position) => updateField(fieldName, { position })} /></div>)}</div><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Done</button></div></Wrap>
}

type PopupState = { type: PrintTargetType; id: string } | null
export function PrintSetup4({ initial, onClose }: { initial?: PopupState; onClose?: () => void }) {
  const store = usePrintStore(); const [popup, setPopup] = useState<PopupState>(initial ?? null)
  useEffect(() => setPopup(initial ?? null), [initial])
  const close = () => { setPopup(null); onClose?.() }
  const targetLabel = useMemo(() => popup ? `${popup.type[0].toUpperCase()}${popup.type.slice(1)} · ${popup.id}` : '', [popup])
  if (!popup) return null
  const props = { id: popup.id, get: store.get, set: store.set, onClose: close }
  return <>{popup.type === 'title' && <TitlePopup {...props} />}{popup.type === 'day' && <DayPopup {...props} />}{popup.type === 'period' && <PeriodPopup {...props} />}{popup.type === 'lesson' && <LessonPopup {...props} />}{targetLabel ? null : null}</>
}

export function PrintSetupProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<PopupState>(null)
  useEffect(() => {
    const onSelected = (event: Event) => {
      const detail = (event as CustomEvent<{ targetType?: PrintTargetType; type?: PrintTargetType; title?: string; dayId?: number | string; periodId?: number | string; lessonId?: number | string }>).detail
      const type = detail.targetType ?? detail.type
      if (!type) return
      const id = type === 'title' ? 'global' : type === 'day' ? String(detail.dayId ?? '') : type === 'period' ? String(detail.periodId ?? '') : String(detail.lessonId ?? '')
      if (id) setPopup({ type, id })
    }
    window.addEventListener('phikila:timetable-print-cell-selected', onSelected)
    return () => window.removeEventListener('phikila:timetable-print-cell-selected', onSelected)
  }, [])
  return <>{children}<PrintSetup4 initial={popup} onClose={() => setPopup(null)} /></>
}
