import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, type AcademicYear, type Grade, type Level, type StudentListItem, type Stream } from '../lib/api'
import { examinations, type ExamEntry, type ExamSubject, type Examination } from '../lib/examinations'
import { scheduling, type Subject } from '../lib/scheduling'
import { friendlyApiError } from '../lib/api'

type RankedStudent = { student: StudentListItem; score: number; percentage: number; grade: string | null; streamRank: number; allStreamRank: number }
const nameOf = (student: StudentListItem) => [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
const genderOf = (student: StudentListItem) => (student.gender || '').trim().toUpperCase()
const rankRows = (rows: Omit<RankedStudent, 'streamRank' | 'allStreamRank'>[]) => {
  const sorted = [...rows].sort((a, b) => b.score - a.score || b.percentage - a.percentage || nameOf(a.student).localeCompare(nameOf(b.student)))
  let previous: number | null = null
  return sorted.map((row, index) => { const rank = row.score === previous ? index : index + 1; previous = row.score; return { ...row, rank } })
}

export default function ClassResultsPage() {
  const [exams, setExams] = useState<Examination[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [grades, setGrades] = useState<Grade[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [students, setStudents] = useState<StudentListItem[]>([])
  const [assignments, setAssignments] = useState<ExamSubject[]>([])
  const [entries, setEntries] = useState<ExamEntry[]>([])
  const [examId, setExamId] = useState(''); const [yearId, setYearId] = useState(''); const [levelId, setLevelId] = useState(''); const [gradeId, setGradeId] = useState(''); const [streamId, setStreamId] = useState(''); const [subjectId, setSubjectId] = useState(''); const [gender, setGender] = useState('ALL')
  const [membershipByStream, setMembershipByStream] = useState<Record<number, Set<number>>>({})
  const [loading, setLoading] = useState(true); const [loadingResults, setLoadingResults] = useState(false); const [loadingClasses, setLoadingClasses] = useState(false); const [error, setError] = useState<string | null>(null)

  useEffect(() => { void Promise.all([examinations.list(), api.academicYears(), api.levels(), scheduling.subjects(), api.students()]).then(([nextExams,nextYears,nextLevels,nextSubjects,nextStudents])=>{setExams(nextExams);setYears(nextYears);setLevels(nextLevels);setSubjects(nextSubjects);setStudents(nextStudents.items);const currentYear=nextYears.find(y=>y.is_current)??nextYears[0];if(currentYear)setYearId(String(currentYear.id));if(nextExams[0])setExamId(String(nextExams[0].id))}).catch(err=>setError(friendlyApiError(err,'load class results'))).finally(()=>setLoading(false)) }, [])
  useEffect(()=>{if(!levelId){setGrades([]);setGradeId('');return}void api.grades(Number(levelId)).then(setGrades).catch(()=>setGrades([]))},[levelId])
  useEffect(()=>{if(!yearId||!gradeId){setStreams([]);setStreamId('');setMembershipByStream({});return}void api.streams(Number(yearId),Number(gradeId)).then(setStreams).catch(()=>setStreams([]))},[yearId,gradeId])
  useEffect(()=>{if(!examId)return;void examinations.listSubjects(Number(examId)).then(setAssignments).catch(err=>setError(friendlyApiError(err,'load exam subjects')))},[examId])
  useEffect(()=>{if(!examId||!subjectId){setEntries([]);return}setLoadingResults(true);void examinations.listEntries(Number(examId),Number(subjectId)).then(setEntries).catch(err=>setError(friendlyApiError(err,'load subject results'))).finally(()=>setLoadingResults(false))},[examId,subjectId])

  useEffect(() => {
    if (!streams.length) { setMembershipByStream({}); return }
    setLoadingClasses(true)
    void Promise.all(streams.map(async stream => [stream.id, await api.streamStudents(stream.id)] as const))
      .then(results => setMembershipByStream(Object.fromEntries(results.map(([id, rows]) => [id, new Set(rows.map(row => row.id))]))))
      .catch(err => setError(friendlyApiError(err, 'load grade streams')))
      .finally(() => setLoadingClasses(false))
  }, [streams])

  const classAssignments=useMemo(()=>assignments.filter(a=>(!yearId||a.academic_year_id===Number(yearId))&&(!levelId||a.level_id===Number(levelId))&&(!gradeId||a.grade_id===Number(gradeId))&&(!streamId||a.stream_id===Number(streamId))),[assignments,yearId,levelId,gradeId,streamId])
  useEffect(()=>{if(!subjectId&&classAssignments.length)setSubjectId(String(classAssignments[0].subject_id))},[classAssignments,subjectId])
  const selectedAssignment=classAssignments.find(a=>a.subject_id===Number(subjectId)); const selectedSubject=subjects.find(s=>s.id===Number(subjectId))
  const selectedStreamMembers = useMemo(() => streamId ? (membershipByStream[Number(streamId)] || new Set<number>()) : new Set<number>(), [membershipByStream, streamId])
  const gradeMemberIds = useMemo(() => { const ids = new Set<number>(); Object.values(membershipByStream).forEach(set => set.forEach(id => ids.add(id))); return ids }, [membershipByStream])

  const ranked = useMemo<RankedStudent[]>(() => {
    if (!selectedAssignment || !subjectId || !selectedStreamMembers.size || !gradeMemberIds.size) return []
    const entryMap = new Map(entries.map(entry => [entry.student_id, entry]))
    const eligible = students.filter(student => selectedStreamMembers.has(student.id) && (gender === 'ALL' || genderOf(student) === gender))
    const gradeEligible = students.filter(student => gradeMemberIds.has(student.id) && (gender === 'ALL' || genderOf(student) === gender))
    const scoreRows = (pool: StudentListItem[]) => pool.map(student => { const entry=entryMap.get(student.id); const score=entry?.score; return score==null?null:{student,score,percentage:entry.percentage??(score/selectedAssignment.total_marks)*100,grade:entry.grade??null} }).filter(Boolean) as Omit<RankedStudent,'streamRank'|'allStreamRank'>[]
    const streamRanked = rankRows(scoreRows(eligible))
    const allRanked = rankRows(scoreRows(gradeEligible))
    const streamMap = new Map(streamRanked.map(row => [row.student.id, row.rank]))
    const allMap = new Map(allRanked.map(row => [row.student.id, row.rank]))
    return streamRanked.map(row => ({ ...row, streamRank: streamMap.get(row.student.id) || 0, allStreamRank: allMap.get(row.student.id) || 0 }))
  }, [selectedAssignment,subjectId,selectedStreamMembers,gradeMemberIds,students,entries,gender])

  const genderOptions=useMemo(()=>['ALL',...Array.from(new Set(students.filter(s=>selectedStreamMembers.has(s.id)).map(genderOf).filter(Boolean)))],[students,selectedStreamMembers])
  const streamSize = useMemo(() => Array.from(selectedStreamMembers).filter(id => { const student=students.find(s=>s.id===id); return gender==='ALL'||(student && genderOf(student)===gender) }).length, [selectedStreamMembers,students,gender])
  const gradeSize = useMemo(() => Array.from(gradeMemberIds).filter(id => { const student=students.find(s=>s.id===id); return gender==='ALL'||(student && genderOf(student)===gender) }).length, [gradeMemberIds,students,gender])
  const mean=ranked.length?ranked.reduce((sum,row)=>sum+row.percentage,0)/ranked.length:0; const top=ranked[0]

  return <div>
    <PageHeader title="Class Results & Rankings" description="View every class and rank learners by subject, stream and all streams, with gender filtering." breadcrumbs={[{label:'Dashboard',to:'/'},{label:'Examinations',to:'/examinations'},{label:'Class Results'}]} actions={<button className="button button--secondary" disabled={!ranked.length} onClick={()=>window.print()}>Print ranking</button>} />
    {error&&<Alert tone="error"/>}
    {loading?<LoadingBlock label="Loading class results" rows={6}/>:<>
      <section className="card section no-print"><h2 className="section__title">Class selection</h2><div className="form form--grid"><Select label="Examination" value={examId} options={exams.map(e=>[e.id,e.name])} onChange={setExamId}/><Select label="Academic year" value={yearId} options={years.map(y=>[y.id,y.name])} onChange={v=>{setYearId(v);setGradeId('');setStreamId('')}}/><Select label="Level" value={levelId} options={levels.map(l=>[l.id,l.name])} onChange={v=>{setLevelId(v);setGradeId('');setStreamId('')}}/><Select label="Grade" value={gradeId} options={grades.map(g=>[g.id,g.name])} onChange={v=>{setGradeId(v);setStreamId('')}}/></div>
        {!gradeId?<p style={{color:'var(--color-ink-muted)'}}>Select a grade to display all its classes. Each class has its own <strong>View</strong> action.</p>:!streams.length?<EmptyState title="No classes found" description="No streams/classes are configured for this grade and academic year."/>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'var(--space-2)',marginTop:'var(--space-3)'}}>{streams.map(stream=><div className="card" key={stream.id} style={{padding:'var(--space-3)'}}><div style={{display:'flex',justifyContent:'space-between',gap:'.75rem',alignItems:'center'}}><div><strong>{stream.name}</strong><div style={{fontSize:'.8rem',color:'var(--color-ink-muted)'}}>{stream.code||'Class'} · {membershipByStream[stream.id]?.size??'—'} learners</div></div><button className={`button button--sm ${streamId===String(stream.id)?'button--primary':'button--secondary'}`} onClick={()=>setStreamId(String(stream.id))}>View</button></div></div>)}</div>}
      </section>

      {streamId&&<section className="card section no-print"><h2 className="section__title">Result filters</h2><div className="form form--grid"><Select label="Subject / Learning area" value={subjectId} options={classAssignments.map(a=>[a.subject_id,subjects.find(s=>s.id===a.subject_id)?.name||`Subject ${a.subject_id}`])} onChange={setSubjectId}/><Select label="Gender" value={gender} options={genderOptions.map(value=>[value,value==='ALL'?'All genders':value.charAt(0)+value.slice(1).toLowerCase()])} onChange={setGender}/></div><p style={{color:'var(--color-ink-muted)',fontSize:'.85rem',marginBottom:0}}>Positions show <strong>stream position / stream population</strong> and <strong>all-stream position / grade population</strong>. Example: <strong>2/49</strong> means 2nd in 49 learners in the selected stream; <strong>12/168</strong> means 12th across all Grade 8 streams.</p></section>}

      {!streamId?<EmptyState title="Select View on a class" description="Choose View on any class above to open its subject ranking."/>:loadingClasses||loadingResults?<LoadingBlock label="Calculating class and all-stream rankings" rows={8}/>:!selectedAssignment?<EmptyState title="Subject not assigned to this class" description="Assign the selected learning area to this class for this examination first."/>:!ranked.length?<EmptyState title="No ranked marks" description="There are no entered marks matching the selected class, subject and gender filter."/>:<section className="section class-ranking-print"><div className="card" style={{padding:'var(--space-4)',marginBottom:'var(--space-3)'}}><div style={{display:'flex',justifyContent:'space-between',gap:'1rem',flexWrap:'wrap'}}><div><div style={{fontSize:'.75rem',color:'var(--color-ink-muted)',fontWeight:700}}>CLASS PERFORMANCE</div><h2 style={{margin:'.2rem 0'}}>{streams.find(s=>s.id===Number(streamId))?.name||'Selected class'} · {selectedSubject?.name||'Subject'}</h2><div style={{color:'var(--color-ink-muted)'}}>{exams.find(e=>e.id===Number(examId))?.name} · {gender==='ALL'?'All genders':gender}</div></div><div style={{display:'flex',gap:'1.5rem'}}><div><small>LEARNERS</small><strong style={{display:'block',fontSize:'1.4rem'}}>{streamSize}</strong></div><div><small>GRADE</small><strong style={{display:'block',fontSize:'1.4rem'}}>{gradeSize}</strong></div><div><small>MEAN</small><strong style={{display:'block',fontSize:'1.4rem'}}>{mean.toFixed(1)}%</strong></div><div><small>TOP SCORE</small><strong style={{display:'block',fontSize:'1.4rem'}}>{top.score}/{selectedAssignment.total_marks}</strong></div></div></div></div><div className="card" style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr><th>POSITION</th><th>ADMISSION NO.</th><th>LEARNER</th><th>GENDER</th><th>SCORE</th><th>%</th><th>OUTCOME</th></tr></thead><tbody>{ranked.map(row=><tr key={row.student.id}><td><strong>{row.streamRank}/{streamSize}</strong><div style={{fontSize:'.72rem',color:'var(--color-ink-muted)'}}>{row.allStreamRank}/{gradeSize} all streams</div></td><td>{row.student.admission_number}</td><td>{nameOf(row.student)}</td><td>{row.student.gender||'—'}</td><td><strong>{row.score}</strong> / {selectedAssignment.total_marks}</td><td>{row.percentage.toFixed(1)}%</td><td><Badge tone={row.grade?.startsWith('EE')?'success':row.grade?.startsWith('AE')?'warning':'info'}>{row.grade||'—'}</Badge></td></tr>)}</tbody></table></div></section>}
    </>}
    <style>{`@media print{.no-print,.sidebar,.topbar,.bottom-nav,.print-footer{display:none!important}.class-ranking-print{margin:0!important}.class-ranking-print .card{box-shadow:none!important;border:0!important}.app-shell,.app-shell__main,.app-shell__content{display:block!important;margin:0!important;padding:0!important}}`}</style>
  </div>
}
function Select({label,value,options,onChange}:{label:string;value:string;options:Array<[number|string,string]>;onChange:(value:string)=>void}){return <div className="field"><label className="field__label">{label}</label><select className="input" value={value} onChange={e=>onChange(e.target.value)}><option value="">Select {label.toLowerCase()}</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>}
