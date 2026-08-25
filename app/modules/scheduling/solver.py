"""Timetable optimisation with Google OR-Tools CP-SAT."""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Callable, Sequence
try:
    from ortools.sat.python import cp_model
    ORTOOLS_AVAILABLE=True
except ImportError:
    cp_model=None
    ORTOOLS_AVAILABLE=False
@dataclass(frozen=True)
class Slot: day:int; period:int
@dataclass
class TeacherSpec:
    id:int; name:str; max_per_day:int=7; max_consecutive:int=4; unavailable:set[tuple[int,int]]=field(default_factory=set)
@dataclass
class RoomSpec:
    id:int; name:str; capacity:int=40; room_type:str="classroom"; unavailable:set[tuple[int,int]]=field(default_factory=set)
@dataclass
class ClassSpec:
    id:int; name:str; student_count:int=40; unavailable:set[tuple[int,int]]=field(default_factory=set)
@dataclass
class SubjectSpec:
    id:int; name:str; spread_across_week:bool=True; required_room_type:str|None=None
@dataclass
class RequirementSpec:
    id:int; class_id:int; subject_id:int; teacher_id:int|None; room_id:int|None; periods_per_week:int; double_periods:int=0
@dataclass
class Weights:
    teacher_gaps:int=20; subject_distribution:int=15; consecutive_lessons:int=30; workload_balance:int=15; room_utilisation:int=5; avoid_slots:int=25
    @classmethod
    def from_mapping(cls,data:dict|None)->"Weights":
        base=cls()
        if data:
            for key,value in data.items():
                if hasattr(base,key) and isinstance(value,(int,float)): setattr(base,key,int(value))
        return base
@dataclass
class AvoidRule:
    scope:str; target_id:int; slots:set[tuple[int,int]]; is_hard:bool=False; weight:int=25; note:str=""
@dataclass
class SolverInput:
    days:list[int]; periods:list[int]; teaching_periods:list[int]; morning_periods:list[int]; teachers:dict[int,TeacherSpec]; rooms:dict[int,RoomSpec]; classes:dict[int,ClassSpec]; subjects:dict[int,SubjectSpec]; requirements:list[RequirementSpec]; weights:Weights=field(default_factory=Weights); avoid_rules:list[AvoidRule]=field(default_factory=list); locked:dict[int,list[tuple[int,int]]]=field(default_factory=dict); max_seconds:float=30.0; workers:int=8
@dataclass
class Placement:
    requirement_id:int; class_id:int; subject_id:int; teacher_id:int|None; room_id:int|None; day:int; period:int; duration:int=1
@dataclass
class SolverOutput:
    status:str; placements:list[Placement]; quality:dict; stats:dict; messages:list[str]
    @property
    def solved(self)->bool:return self.status in {"optimal","feasible"}
class InfeasibleError(RuntimeError): pass
def preflight(data:SolverInput)->list[str]:
    problems=[];capacity=len(data.days)*len(data.teaching_periods)
    if not data.requirements: problems.append("No lesson requirements have been defined yet.")
    if capacity==0: problems.append("The timetable has no teaching periods. Add periods first.");return problems
    hard_class={};hard_teacher={}
    for rule in data.avoid_rules:
        if rule.is_hard:(hard_class if rule.scope=="class" else hard_teacher).setdefault(rule.target_id,set()).update(rule.slots)
    per_class={}
    for req in data.requirements:per_class[req.class_id]=per_class.get(req.class_id,0)+req.periods_per_week
    for cid,total in per_class.items():
        spec=data.classes.get(cid);name=spec.name if spec else f"Class {cid}";blocked=(set(spec.unavailable) if spec else set())|hard_class.get(cid,set());free=capacity-len(blocked)
        if total>free:problems.append(f"{name} needs {total} lessons a week but only has {free} available slots. Reduce its lessons, add periods, or remove blocked slots.")
    per_teacher={}
    for req in data.requirements:
        if req.teacher_id:per_teacher[req.teacher_id]=per_teacher.get(req.teacher_id,0)+req.periods_per_week
    for tid,total in per_teacher.items():
        spec=data.teachers.get(tid)
        if spec:
            blocked=set(spec.unavailable)|hard_teacher.get(tid,set());limit=min(capacity-len(blocked),spec.max_per_day*len(data.days))
            if total>limit:problems.append(f"{spec.name} is assigned {total} lessons a week but can only teach {limit} given availability and daily limits.")
    for req in data.requirements:
        subject=data.subjects.get(req.subject_id)
        if subject and subject.required_room_type and not req.room_id and not any(r.room_type==subject.required_room_type for r in data.rooms.values()):problems.append(f"{subject.name} requires a '{subject.required_room_type}' room but no such room exists.")
    return problems
def solve(data:SolverInput,on_progress:Callable[[int,str],None]|None=None,should_cancel:Callable[[],bool]|None=None)->SolverOutput:
    if not ORTOOLS_AVAILABLE:return SolverOutput("error",[],{}, {},["OR-Tools is not installed on the server."])
    report=on_progress or (lambda pct,stage:None);problems=preflight(data)
    if problems:return SolverOutput("infeasible",[],{}, {},problems)
    report(8,"Building model");model=cp_model.CpModel();slots=[(d,p) for d in data.days for p in data.teaching_periods];x={}
    def allowed(req,day,period):
        klass=data.classes.get(req.class_id)
        if klass and (day,period) in klass.unavailable:return False
        if req.teacher_id:
            teacher=data.teachers.get(req.teacher_id)
            if teacher and (day,period) in teacher.unavailable:return False
        if req.room_id:
            room=data.rooms.get(req.room_id)
            if room and (day,period) in room.unavailable:return False
        for rule in data.avoid_rules:
            if rule.is_hard and ((rule.scope=="class" and rule.target_id==req.class_id) or (rule.scope=="teacher" and req.teacher_id==rule.target_id)) and (day,period) in rule.slots:return False
        return True
    for req in data.requirements:
        for day,period in slots:
            if allowed(req,day,period):x[(req.id,day,period)]=model.NewBoolVar(f"x_{req.id}_{day}_{period}")
    for req in data.requirements:
        vars_for_req=[x[(req.id,d,p)] for d,p in slots if (req.id,d,p) in x]
        if len(vars_for_req)<req.periods_per_week:
            klass=data.classes.get(req.class_id);subject=data.subjects.get(req.subject_id)
            return SolverOutput("infeasible",[],{}, {},[f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} needs {req.periods_per_week} periods but only {len(vars_for_req)} slots are available after availability rules."])
        model.Add(sum(vars_for_req)==req.periods_per_week)
    for cid in data.classes:
        reqs=[r for r in data.requirements if r.class_id==cid]
        for day,period in slots:
            vals=[x[(r.id,day,period)] for r in reqs if (r.id,day,period) in x]
            if len(vals)>1:model.AddAtMostOne(vals)
    for tid in data.teachers:
        reqs=[r for r in data.requirements if r.teacher_id==tid]
        for day,period in slots:
            vals=[x[(r.id,day,period)] for r in reqs if (r.id,day,period) in x]
            if len(vals)>1:model.AddAtMostOne(vals)
    for rid in data.rooms:
        reqs=[r for r in data.requirements if r.room_id==rid]
        for day,period in slots:
            vals=[x[(r.id,day,period)] for r in reqs if (r.id,day,period) in x]
            if len(vals)>1:model.AddAtMostOne(vals)
    for req_id,pinned in data.locked.items():
        for day,period in pinned:
            if (req_id,day,period) in x:model.Add(x[(req_id,day,period)]==1)
    for tid,spec in data.teachers.items():
        reqs=[r for r in data.requirements if r.teacher_id==tid]
        for day in data.days:
            vals=[x[(r.id,day,p)] for r in reqs for p in data.teaching_periods if (r.id,day,p) in x]
            if vals:model.Add(sum(vals)<=spec.max_per_day)
    for req in data.requirements:
        subject=data.subjects.get(req.subject_id)
        if not subject or not subject.spread_across_week or req.periods_per_week>len(data.days):continue
        cap=2 if req.double_periods else 1
        for day in data.days:
            vals=[x[(req.id,day,p)] for p in data.teaching_periods if (req.id,day,p) in x]
            if len(vals)>cap:model.Add(sum(vals)<=cap)
    report(26,"Applying constraints")
    if should_cancel and should_cancel():return SolverOutput("cancelled",[],{}, {},["Generation cancelled."])
    penalties=[];w=data.weights;busy={}
    for tid in data.teachers:
        reqs=[r for r in data.requirements if r.teacher_id==tid]
        for day in data.days:
            for period in data.teaching_periods:
                terms=[x[(r.id,day,period)] for r in reqs if (r.id,day,period) in x];var=model.NewBoolVar(f"busy_{tid}_{day}_{period}")
                if terms:model.AddMaxEquality(var,terms)
                else:model.Add(var==0)
                busy[(tid,day,period)]=var
    if w.teacher_gaps>0:
        for tid in data.teachers:
            for day in data.days:
                row=[busy[(tid,day,p)] for p in data.teaching_periods]
                for i in range(1,len(row)-1):
                    gap=model.NewBoolVar(f"gap_{tid}_{day}_{i}");model.Add(gap<=row[i-1]);model.Add(gap<=row[i+1]);model.Add(gap<=1-row[i]);model.Add(gap>=row[i-1]+row[i+1]-row[i]-1);penalties.append((gap,w.teacher_gaps))
    if w.consecutive_lessons>0:
        for tid,spec in data.teachers.items():
            run=max(1,spec.max_consecutive)
            for day in data.days:
                row=[busy[(tid,day,p)] for p in data.teaching_periods]
                for start in range(max(0,len(row)-run)):
                    window=row[start:start+run+1]
                    if len(window)<=run:continue
                    over=model.NewBoolVar(f"run_{tid}_{day}_{start}");model.Add(sum(window)-run<=over*len(window));model.Add(over<=sum(window));penalties.append((over,w.consecutive_lessons))
    if w.subject_distribution>0:
        for req in data.requirements:
            subject=data.subjects.get(req.subject_id)
            if not subject or not subject.spread_across_week or req.periods_per_week<2:continue
            for day in data.days:
                vals=[x[(req.id,day,p)] for p in data.teaching_periods if (req.id,day,p) in x]
                if len(vals)>1:
                    excess=model.NewIntVar(0,len(vals),f"clump_{req.id}_{day}");model.Add(excess>=sum(vals)-1);penalties.append((excess,w.subject_distribution))
    if w.avoid_slots>0:
        for rule in data.avoid_rules:
            if rule.is_hard:continue
            for req in data.requirements:
                match=(rule.scope=="class" and req.class_id==rule.target_id) or (rule.scope=="teacher" and req.teacher_id==rule.target_id)
                if match:
                    for day,period in rule.slots:
                        if (req.id,day,period) in x:penalties.append((x[(req.id,day,period)],rule.weight or w.avoid_slots))
    if w.workload_balance>0:
        for tid,spec in data.teachers.items():
            reqs=[r for r in data.requirements if r.teacher_id==tid];total=sum(r.periods_per_week for r in reqs)
            if total<2 or not data.days:continue
            fair=math.ceil(total/len(data.days))
            for day in data.days:
                vals=[x[(r.id,day,p)] for r in reqs for p in data.teaching_periods if (r.id,day,p) in x]
                if vals:
                    over=model.NewIntVar(0,len(vals),f"load_{tid}_{day}");model.Add(over>=sum(vals)-fair);penalties.append((over,w.workload_balance))
    if penalties:model.Minimize(sum(var*weight for var,weight in penalties))
    report(38,"Optimising");solver=cp_model.CpSolver();solver.parameters.max_time_in_seconds=float(data.max_seconds);solver.parameters.num_search_workers=int(data.workers);callback=_ProgressCallback(report,should_cancel);status=solver.Solve(model,callback)
    if should_cancel and should_cancel():return SolverOutput("cancelled",[],{}, {},["Generation cancelled."])
    label="optimal" if status==cp_model.OPTIMAL else "feasible" if status==cp_model.FEASIBLE else None
    if not label:return SolverOutput("infeasible",[],{}, {},["No timetable satisfies every hard constraint. Relax an availability rule, reduce weekly lessons, or add rooms/periods."])
    report(84,"Validating");placements=[]
    for req in data.requirements:
        for day,period in slots:
            if (req.id,day,period) in x and solver.Value(x[(req.id,day,period)]):placements.append(Placement(req.id,req.class_id,req.subject_id,req.teacher_id,req.room_id,day,period))
    quality=score(data,placements);stats={"placed":len(placements),"required":sum(r.periods_per_week for r in data.requirements),"conflicts":0,"penalty":int(solver.ObjectiveValue()) if penalties else 0,"wall_time":round(solver.WallTime(),2),"status":label};report(100,"Completed");return SolverOutput(label,placements,quality,stats,[])
class _ProgressCallback(cp_model.CpSolverSolutionCallback if ORTOOLS_AVAILABLE else object):
    def __init__(self,report,should_cancel):
        if ORTOOLS_AVAILABLE:cp_model.CpSolverSolutionCallback.__init__(self)
        self._report=report;self._should_cancel=should_cancel;self._count=0
    def on_solution_callback(self):
        self._count+=1;self._report(min(80,40+self._count*6),f"Improving solution ({self._count})")
        if self._should_cancel and self._should_cancel():self.StopSearch()
def score(data:SolverInput,placements:Sequence[Placement])->dict:
    required=sum(r.periods_per_week for r in data.requirements);placed=len(placements);hard=100.0 if placed==required else round(100.0*placed/max(1,required),1)
    by_teacher_day={}
    for p in placements:
        if p.teacher_id is not None:by_teacher_day.setdefault((p.teacher_id,p.day),[]).append(p.period)
    gaps=spans=0
    for periods in by_teacher_day.values():
        periods.sort()
        if len(periods)>1:span=periods[-1]-periods[0]+1;spans+=span;gaps+=span-len(periods)
    gap_score=100.0 if spans==0 else round(100.0*(1-gaps/spans),1)
    per_class_subject_day={}
    for p in placements:key=(p.class_id,p.subject_id,p.day);per_class_subject_day[key]=per_class_subject_day.get(key,0)+1
    repeats=sum(v-1 for v in per_class_subject_day.values() if v>1);dist_score=100.0 if placed==0 else round(max(0.0,100.0*(1-repeats/placed)),1)
    capacity=len(data.days)*len(data.teaching_periods)*max(1,len(data.rooms));used=sum(1 for p in placements if p.room_id is not None);room_score=round(min(100.0,100.0*used/capacity),1) if data.rooms else 100.0
    loads={}
    for p in placements:
        if p.teacher_id is not None:loads[p.teacher_id]=loads.get(p.teacher_id,0)+1
    if len(loads)>1:
        mean=sum(loads.values())/len(loads);spread=sum(abs(v-mean) for v in loads.values())/len(loads);workload_score=round(max(0.0,100.0-(spread/max(1.0,mean))*100.0),1)
    else:workload_score=100.0
    per_class_day={}
    for p in placements:per_class_day[(p.class_id,p.day)]=per_class_day.get((p.class_id,p.day),0)+1
    if per_class_day:
        mean=sum(per_class_day.values())/len(per_class_day);spread=sum(abs(v-mean) for v in per_class_day.values())/len(per_class_day);class_score=round(max(0.0,100.0-(spread/max(1.0,mean))*100.0),1)
    else:class_score=100.0
    overall=hard*.45+workload_score*.15+dist_score*.15+gap_score*.15+class_score*.06+room_score*.04
    return {"overall":round(overall),"breakdown":{"hard_constraints":hard,"teacher_workload":workload_score,"subject_distribution":dist_score,"room_utilisation":room_score,"teacher_gaps":gap_score,"class_distribution":class_score}}
