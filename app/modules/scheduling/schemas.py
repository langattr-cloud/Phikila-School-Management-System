"""Pydantic contracts for the scheduling API."""
from __future__ import annotations
from datetime import time
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
Slots = dict[str, list[int]]
class ORMModel(BaseModel): model_config = ConfigDict(from_attributes=True)
class PeriodIn(BaseModel): index:int=Field(ge=0,le=30); name:str=Field(min_length=1,max_length=40); start_time:str=Field(pattern=r'^\d{2}:\d{2}$'); end_time:str=Field(pattern=r'^\d{2}:\d{2}$'); is_teaching:bool=True
class PeriodOut(ORMModel,PeriodIn):
    id:int
    @field_validator('start_time','end_time',mode='before')
    @classmethod
    def serialize_time(cls,value): return value.strftime('%H:%M') if isinstance(value,time) else value
class DayIn(BaseModel): index:int=Field(ge=0,le=6); name:str=Field(min_length=1,max_length=20); is_active:bool=True
class DayOut(ORMModel,DayIn): id:int
class CalendarIn(BaseModel): days:list[DayIn]; periods:list[PeriodIn]
class TeacherIn(BaseModel):
    name:str=Field(min_length=1,max_length=120); code:str=Field(min_length=1,max_length=30); phone:str|None=None; email:str|None=None; department:str|None=None; role:str=Field(default='Teacher',max_length=80); role_assignment:dict[str,Any]=Field(default_factory=dict); max_lessons_per_day:int=Field(default=7,ge=1,le=20); max_consecutive:int=Field(default=4,ge=1,le=20); workload_target:int|None=Field(default=None,ge=0,le=80); unavailable:Slots=Field(default_factory=dict); is_active:bool=True
class TeacherOut(ORMModel,TeacherIn): id:int
class SubjectIn(BaseModel):
    name:str=Field(min_length=1,max_length=120); code:str=Field(min_length=1,max_length=30); colour:str=Field(default='#0F2A47',max_length=9); prefers_morning:bool=False; prefers_double:bool=False; spread_across_week:bool=True; required_room_type:str|None=None
class SubjectOut(ORMModel,SubjectIn): id:int
class RoomIn(BaseModel):
    name:str=Field(min_length=1,max_length=120); code:str=Field(min_length=1,max_length=30); building:str|None=None; capacity:int=Field(default=40,ge=1,le=2000); room_type:str=Field(default='classroom',max_length=40); is_accessible:bool=True; unavailable:Slots=Field(default_factory=dict)
class RoomOut(ORMModel,RoomIn): id:int
class ClassIn(BaseModel): name:str=Field(min_length=1,max_length=120); code:str=Field(min_length=1,max_length=30); grade:str|None=None; stream:str|None=None; student_count:int=Field(default=40,ge=1,le=500); home_room_id:int|None=None; class_teacher_id:int|None=None; unavailable:Slots=Field(default_factory=dict)
class ClassUpdateIn(BaseModel):
    name:str|None=Field(default=None,min_length=1,max_length=120); code:str|None=Field(default=None,min_length=1,max_length=30); grade:str|None=None; stream:str|None=None; student_count:int|None=Field(default=None,ge=1,le=500); home_room_id:int|None=None; class_teacher_id:int|None=None; unavailable:Slots|None=None
class ClassOut(ORMModel,ClassIn): id:int; academic_stream:str|None=None; academic_stream:str|None=None
class TtLessonRequirementIn(BaseModel): pass
class RequirementIn(BaseModel): class_id:int; subject_id:int; teacher_id:int|None=None; room_id:int|None=None; periods_per_week:int=Field(default=1,ge=1,le=40); double_periods:int=Field(default=0,ge=0,le=10)
class RequirementOut(ORMModel,RequirementIn): id:int; class_name:str|None=None; subject_name:str|None=None; teacher_name:str|None=None; room_name:str|None=None
class TeacherAssignmentIn(BaseModel): class_id:int; subject_id:int; periods_per_week:int=Field(ge=1,le=40); double_periods:int=Field(default=0,ge=0,le=10); role:str|None=None
class TeacherAssignmentSaveIn(BaseModel): teacher_id:int; assignments:list[TeacherAssignmentIn]=Field(max_length=100); class_teacher_class_ids:list[int]=Field(default_factory=list,max_length=100)
class TeacherAssignmentOut(BaseModel): teacher_id:int; assignments:list[TeacherAssignmentIn]; class_teacher_class_ids:list[int]
class ConstraintIn(BaseModel): kind:str=Field(min_length=1,max_length=60); scope:Literal['school','teacher','class','subject','room']='school'; target_id:int|None=None; is_hard:bool=False; weight:int=Field(default=10,ge=0,le=100); params:dict[str,Any]=Field(default_factory=dict); enabled:bool=True; note:str|None=None
class ConstraintOut(ORMModel,ConstraintIn): id:int
class GenerateIn(BaseModel): max_seconds:float=Field(default=30.0,ge=1.0,le=180.0)
class GenerateProfileIn(BaseModel): max_seconds:float=Field(default=30.0,ge=1.0,le=180.0); label:str=Field(default='New timetable',min_length=1,max_length=120); day_indexes:list[int]=Field(min_length=1,max_length=7)
class JobOut(ORMModel): id:int; status:str; progress:int; stage:str|None; checks:list[dict[str,Any]]=Field(default_factory=list); result_version_id:int|None; quality:dict[str,Any]=Field(default_factory=dict); message:str|None
class LessonOut(ORMModel): id:int; version_id:int; requirement_id:int|None; class_id:int; subject_id:int; teacher_id:int|None; room_id:int|None; day_index:int; period_index:int; duration:int; is_locked:bool
class LessonMoveIn(BaseModel): day_index:int=Field(ge=0,le=6); period_index:int=Field(ge=0,le=30); room_id:int|None=None
class LessonPatch(BaseModel): day_index:int|None=Field(default=None,ge=0,le=6); period_index:int|None=Field(default=None,ge=0,le=30); duration:int|None=Field(default=None,ge=1,le=10); teacher_id:int|None=None; class_id:int|None=None; subject_id:int|None=None; room_id:int|None=None; is_locked:bool|None=None
class LessonCreate(BaseModel): requirement_id:int; day_index:int=Field(ge=0,le=6); period_index:int=Field(ge=0,le=30); duration:int=Field(default=1,ge=1,le=10); room_id:int|None=None
class UnassignedOut(BaseModel): requirement_id:int; subject_id:int; subject_name:str; subject_colour:str; class_id:int; class_name:str; teacher_id:int|None; teacher_name:str|None; room_id:int|None; room_name:str|None; periods_per_week:int; placed:int; remaining:int; requires_double:bool
class VersionOut(ORMModel):
    id:int; number:int; label:str|None; status:str; quality:dict[str,Any]=Field(default_factory=dict); stats:dict[str,Any]=Field(default_factory=dict); created_by:str|None=None; created_at:Any=None; published_at:Any=None; day_indexes:list[int]=Field(default_factory=list); day_names:list[str]=Field(default_factory=list)
    @field_validator('created_by', mode='before')
    @classmethod
    def serialize_created_by(cls, value): return None if value is None else str(value)
class ConflictOut(BaseModel): severity:str; kind:str; message:str; lesson_ids:list[int]; day:int|None=None; period:int|None=None
class EventIn(BaseModel): name:str=Field(min_length=1,max_length=80); start_time:str=Field(pattern=r'^\d{2}:\d{2}$'); end_time:str=Field(pattern=r'^\d{2}:\d{2}$'); day_indexes:list[int]=Field(min_length=1,max_length=7); event_type:str=Field(default='break',min_length=1,max_length=40); note:str|None=None
class EventOut(ORMModel,EventIn): id:int
class ExplainIn(BaseModel): day_index:int=Field(ge=0,le=6); period_index:int=Field(ge=0,le=30)
class CopilotIn(BaseModel): text:str=Field(min_length=1,max_length=400)
class CopilotApplyIn(BaseModel): command:dict[str,Any]
class ImportRow(BaseModel): teacher:str|None=None; subject:str|None=None; klass:str|None=Field(default=None,alias='class'); room:str|None=None; periods_per_week:int|None=None; model_config=ConfigDict(populate_by_name=True)
class ImportIn(BaseModel): rows:list[dict[str,Any]]=Field(max_length=5000); mapping:dict[str,str]; commit:bool=False
