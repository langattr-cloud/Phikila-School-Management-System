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
class TeacherSpec: id:int; name:str; max_per_day:int=7; max_consecutive:int=4; unavailable:set[tuple[int,int]]=field(default_factory=set)
@dataclass
class RoomSpec: id:int; name:str; capacity:int=40; room_type:str="classroom"; unavailable:set[tuple[int,int]]=field(default_factory=set)
@dataclass
class ClassSpec: id:int; name:str; student_count:int=40; unavailable:set[tuple[int,int]]=field(default_factory=set)
@dataclass
class SubjectSpec: id:int; name:str; spread_across_week:bool=True; required_room_type:str|None=None; prefers_morning:bool=False
@dataclass
class RequirementSpec: id:int; class_id:int; subject_id:int; teacher_id:int|None; room_id:int|None; periods_per_week:int; double_periods:int=0
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
class AvoidRule: scope:str; target_id:int; slots:set[tuple[int,int]]; is_hard:bool=False; weight:int=25; note:str=""
@dataclass
class SolverInput: days:list[int]; periods:list[int]; teaching_periods:list[int]; morning_periods:list[int]; teachers:dict[int,TeacherSpec]; rooms:dict[int,RoomSpec]; classes:dict[int,ClassSpec]; subjects:dict[int,SubjectSpec]; requirements:list[RequirementSpec]; weights:Weights=field(default_factory=Weights); avoid_rules:list[AvoidRule]=field(default_factory=list); locked:dict[int,list[tuple[int,int]]]=field(default_factory=dict); max_seconds:float=30.0; workers:int=1
@dataclass
class Placement: requirement_id:int; class_id:int; subject_id:int; teacher_id:int|None; room_id:int|None; day:int; period:int; duration:int=1
@dataclass
class SolverOutput:
    status:str; placements:list[Placement]; quality:dict; stats:dict; messages:list[str]
    @property
    def solved(self)->bool:return self.status in {"optimal","feasible"}
class InfeasibleError(RuntimeError): pass
def preflight(data:SolverInput)->list[str]:
    problems=[];capacity=len(data.days)*len(data.teaching_periods)
    # An incomplete lesson load is valid. Generate the currently loaded lessons;
    # the UI can surface the missing lesson data as a warning.
    if capacity==0:problems.append("The timetable has no teaching periods. Add periods first.");return problems
    hc={};ht={}
    for rule in data.avoid_rules:
        if rule.is_hard:(hc if rule.scope=="class" else ht).setdefault(rule.target_id,set()).update(rule.slots)
    pc={}
    for r in data.requirements:pc[r.class_id]=pc.get(r.class_id,0)+r.periods_per_week
    for cid,total in pc.items():
        s=data.classes.get(cid);blocked=(set(s.unavailable) if s else set())|hc.get(cid,set());free=capacity-len(blocked)
        if total>free:problems.append(f"{s.name if s else f'Class {cid}'} needs {total} lessons a week but only has {free} available slots.")
    pt={}
    for r in data.requirements:
        if r.teacher_id:pt[r.teacher_id]=pt.get(r.teacher_id,0)+r.periods_per_week
    for tid,total in pt.items():
        s=data.teachers.get(tid)
        if s:
            limit=min(capacity-len(set(s.unavailable)|ht.get(tid,set())),s.max_per_day*len(data.days))
            if total>limit:problems.append(f"{s.name} is assigned {total} lessons a week but can only teach {limit} given availability and daily limits.")
    for r in data.requirements:
        doubles=max(0,r.double_periods)
        if doubles>r.periods_per_week//2:
            problems.append(f"Requirement {r.id} requests {doubles} double lesson(s), but only {r.periods_per_week} weekly teaching periods are configured. Each double lesson uses two separate consecutive periods.")
    return problems
def solve(data:SolverInput,on_progress:Callable[[int,str],None]|None=None,should_cancel:Callable[[],bool]|None=None)->SolverOutput:
    if not ORTOOLS_AVAILABLE:return SolverOutput("error",[],{}, {},["OR-Tools is not installed on the server."])
    report=on_progress or (lambda pct,stage:None);problems=preflight(data)
    if problems:return SolverOutput("infeasible",[],{}, {},problems)
    warning_messages=[]
    if not data.requirements:
        warning_messages.append("Not all lessons are loaded. The timetable was generated from the lessons currently configured.")
    model=cp_model.CpModel();slots=[(d,p) for d in data.days for p in data.teaching_periods];x={}
    def allowed(r,d,p):
        c=data.classes.get(r.class_id)
        if c and (d,p) in c.unavailable:return False
        if r.teacher_id and data.teachers.get(r.teacher_id) and (d,p) in data.teachers[r.teacher_id].unavailable:return False
        if r.room_id and data.rooms.get(r.room_id) and (d,p) in data.rooms[r.room_id].unavailable:return False
        for rule in data.avoid_rules:
            if rule.is_hard and ((rule.scope=="class" and rule.target_id==r.class_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id)) and (d,p) in rule.slots:return False
        return True
    for r in data.requirements:
        for d,p in slots:
            if allowed(r,d,p):x[(r.id,d,p)]=model.NewBoolVar(f"x_{r.id}_{d}_{p}")
        vals=[x[(r.id,d,p)] for d,p in slots if (r.id,d,p) in x]
        if len(vals)<r.periods_per_week:return SolverOutput("infeasible",[],{}, {},[f"Requirement {r.id} cannot fit its weekly lessons into the available timetable slots."])
        model.Add(sum(vals)==r.periods_per_week)
        required_doubles=max(0,r.double_periods)
        if required_doubles:
            pairs=[]
            for d in data.days:
                for left_index in range(len(data.teaching_periods)-1):
                    left=data.teaching_periods[left_index];right=data.teaching_periods[left_index+1]
                    a=x.get((r.id,d,left));b=x.get((r.id,d,right))
                    if a is None or b is None:continue
                    pair=model.NewBoolVar(f"double_{r.id}_{d}_{left}_{right}")
                    model.Add(pair<=a);model.Add(pair<=b);model.Add(pair>=a+b-1)
                    pairs.append((pair,a,b))
            model.Add(sum(pair for pair,_,_ in pairs)==required_doubles)
            for slot_var in vals:
                touching=[pair for pair,a,b in pairs if a is slot_var or b is slot_var]
                if touching:model.Add(sum(touching)<=1)
    for cid in data.classes:
        rs=[r for r in data.requirements if r.class_id==cid]
        for d,p in slots:
            v=[x[(r.id,d,p)] for r in rs if (r.id,d,p) in x]
            if len(v)>1:model.AddAtMostOne(v)
    for tid in data.teachers:
        rs=[r for r in data.requirements if r.teacher_id==tid]
        for d,p in slots:
            v=[x[(r.id,d,p)] for r in rs if (r.id,d,p) in x]
            if len(v)>1:model.AddAtMostOne(v)
    for rid in data.rooms:
        rs=[r for r in data.requirements if r.room_id==rid]
        for d,p in slots:
            v=[x[(r.id,d,p)] for r in rs if (r.id,d,p) in x]
            if len(v)>1:model.AddAtMostOne(v)
    for tid,spec in data.teachers.items():
        rs=[r for r in data.requirements if r.teacher_id==tid]
        for d in data.days:
            v=[x[(r.id,d,p)] for r in rs for p in data.teaching_periods if (r.id,d,p) in x]
            if v:model.Add(sum(v)<=spec.max_per_day)
    for r in data.requirements:
        subject=data.subjects.get(r.subject_id)
        # Subject appears at most once per day by default. A double lesson may
        # occupy two periods on the same day. Allocations above 5 periods/week
        # are exempt because they cannot be distributed one-per-day.
        if subject and subject.spread_across_week and r.periods_per_week<=5:
            cap=2 if r.double_periods else 1
            for d in data.days:
                v=[x[(r.id,d,p)] for p in data.teaching_periods if (r.id,d,p) in x]
                if len(v)>1:model.Add(sum(v)<=cap)
    report(26,"Applying constraints")
    if should_cancel and should_cancel():return SolverOutput("cancelled",[],{}, {},["Generation cancelled."])
    penalties=[];w=data.weights;busy={}
    for tid in data.teachers:
        rs=[r for r in data.requirements if r.teacher_id==tid]
        for d in data.days:
            for p in data.teaching_periods:
                terms=[x[(r.id,d,p)] for r in rs if (r.id,d,p) in x];v=model.NewBoolVar(f"busy_{tid}_{d}_{p}")
                if terms:model.AddMaxEquality(v,terms)
                else:model.Add(v==0)
                busy[(tid,d,p)]=v
    if w.teacher_gaps>0:
        for tid in data.teachers:
            for d in data.days:
                row=[busy[(tid,d,p)] for p in data.teaching_periods]
                for i in range(1,len(row)-1):
                    gap=model.NewBoolVar(f"gap_{tid}_{d}_{i}");model.Add(gap<=row[i-1]);model.Add(gap<=row[i+1]);model.Add(gap<=1-row[i]);model.Add(gap>=row[i-1]+row[i+1]-row[i]-1);penalties.append((gap,w.teacher_gaps))
    if w.consecutive_lessons>0:
        for tid,spec in data.teachers.items():
            run=max(1,spec.max_consecutive)
            for d in data.days:
                row=[busy[(tid,d,p)] for p in data.teaching_periods]
                for start in range(max(0,len(row)-run)):
                    window=row[start:start+run+1]
                    if len(window)>run:
                        over=model.NewBoolVar(f"run_{tid}_{d}_{start}");model.Add(sum(window)-run<=over*len(window));model.Add(over<=sum(window));penalties.append((over,w.consecutive_lessons))
    if w.subject_distribution>0:
        for r in data.requirements:
            subject=data.subjects.get(r.subject_id)
            if not subject or not subject.spread_across_week or r.periods_per_week<2:continue
            for d in data.days:
                v=[x[(r.id,d,p)] for p in data.teaching_periods if (r.id,d,p) in x]
                if len(v)>1:
                    excess=model.NewIntVar(0,len(v),f"clump_{r.id}_{d}");model.Add(excess>=sum(v)-1);penalties.append((excess,w.subject_distribution))
    if w.avoid_slots>0:
        for rule in data.avoid_rules:
            if rule.is_hard:continue
            for r in data.requirements:
                match=(rule.scope=="class" and r.class_id==rule.target_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id)
                if match:
                    for d,p in rule.slots:
                        if (r.id,d,p) in x:penalties.append((x[(r.id,d,p)],rule.weight or w.avoid_slots))
    if w.workload_balance>0:
        for tid in data.teachers:
            rs=[r for r in data.requirements if r.teacher_id==tid];total=sum(r.periods_per_week for r in rs)
            if total<2:continue
            fair=math.ceil(total/len(data.days))
            for d in data.days:
                v=[x[(r.id,d,p)] for r in rs for p in data.teaching_periods if (r.id,d,p) in x]
                if v:
                    over=model.NewIntVar(0,len(v),f"load_{tid}_{d}");model.Add(over>=sum(v)-fair);penalties.append((over,w.workload_balance))
    if penalties:model.Minimize(sum(v*weight for v,weight in penalties))
    report(38,"Optimising");solver=cp_model.CpSolver();solver.parameters.max_time_in_seconds=float(data.max_seconds);solver.parameters.num_search_workers=max(1,min(int(data.workers),2));callback=_ProgressCallback(report,should_cancel);status=solver.Solve(model,callback)
    if should_cancel and should_cancel():return SolverOutput("cancelled",[],{}, {},["Generation cancelled."])
    label="optimal" if status==cp_model.OPTIMAL else "feasible" if status==cp_model.FEASIBLE else None
    if not label:return SolverOutput("infeasible",[],{}, {},["No timetable satisfies every hard constraint. Relax an availability rule, reduce weekly lessons, or add rooms/periods."])
    placements=[Placement(r.id,r.class_id,r.subject_id,r.teacher_id,r.room_id,d,p) for r in data.requirements for d,p in slots if (r.id,d,p) in x and solver.Value(x[(r.id,d,p)])]
    quality=score(data,placements);stats={"placed":len(placements),"required":sum(r.periods_per_week for r in data.requirements),"conflicts":0,"penalty":int(solver.ObjectiveValue()) if penalties else 0,"wall_time":round(solver.WallTime(),2),"status":label};report(100,"Completed");return SolverOutput(label,placements,quality,stats,warning_messages)
class _ProgressCallback(cp_model.CpSolverSolutionCallback if ORTOOLS_AVAILABLE else object):
    def __init__(self,report,should_cancel):
        if ORTOOLS_AVAILABLE:cp_model.CpSolverSolutionCallback.__init__(self)
        self._report=report;self._should_cancel=should_cancel;self._count=0;self._last_report=0.0
    def on_solution_callback(self):
        import time
        self._count+=1
        now=time.monotonic()
        # Solution callbacks run on the solver hot path. Do not perform a database
        # query/commit for every incumbent; that can dominate solve time.
        if now-self._last_report >= 0.75 or self._count == 1:
            self._last_report=now
            self._report(min(80,40+self._count*6),f"Improving solution ({self._count})")
        if self._should_cancel and (self._count % 10 == 0 or now-self._last_report < 0.01) and self._should_cancel():
            self.StopSearch()
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