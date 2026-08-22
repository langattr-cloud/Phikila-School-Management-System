"""Natural-language scheduling commands.

The copilot translates administrator instructions into deterministic scheduling
commands. It does not assign any value to a period because of its time of day.
"""
from __future__ import annotations
import json
import os
import re
import urllib.request
from dataclasses import dataclass, field
from typing import Any

SUPPORTED_ACTIONS = {"avoid_lessons", "set_weight", "explain", "rebalance", "improve", "find_free", "find_room", "find_gaps", "unknown"}
DAY_WORDS = {"monday":0,"mon":0,"tuesday":1,"tue":1,"tues":1,"wednesday":2,"wed":2,"thursday":3,"thu":3,"thur":3,"thurs":3,"friday":4,"fri":4,"saturday":5,"sat":5,"sunday":6,"sun":6}
WEIGHT_WORDS = {"gap":"teacher_gaps","gaps":"teacher_gaps","distribution":"subject_distribution","spread":"subject_distribution","consecutive":"consecutive_lessons","workload":"workload_balance","balance":"workload_balance","room":"room_utilisation"}

@dataclass
class Command:
    action: str
    target: str | None = None
    target_kind: str | None = None
    target_id: int | None = None
    day: int | None = None
    day_name: str | None = None
    periods: list[int] = field(default_factory=list)
    period_names: list[str] = field(default_factory=list)
    priority: str = "soft"
    weight: int | None = None
    weight_key: str | None = None
    confidence: float = 0.0
    explanation: str = ""
    source: str = "rules"
    needs_confirmation: bool = True
    params: dict[str, Any] = field(default_factory=dict)
    def as_dict(self) -> dict[str, Any]:
        return {"action":self.action,"target":self.target,"target_kind":self.target_kind,"target_id":self.target_id,"day":self.day,"day_name":self.day_name,"periods":self.periods,"period_names":self.period_names,"priority":self.priority,"weight":self.weight,"weight_key":self.weight_key,"confidence":round(self.confidence,2),"explanation":self.explanation,"source":self.source,"needs_confirmation":self.needs_confirmation,"params":self.params}

@dataclass
class SchoolVocabulary:
    classes: dict[int,str] = field(default_factory=dict)
    teachers: dict[int,str] = field(default_factory=dict)
    subjects: dict[int,str] = field(default_factory=dict)
    rooms: dict[int,str] = field(default_factory=dict)
    periods: list[dict] = field(default_factory=list)
    days: list[dict] = field(default_factory=list)
    def teaching_periods(self) -> list[dict]: return [p for p in self.periods if p.get("is_teaching",True)]
    def afternoon_periods(self) -> list[dict]:
        result=[]
        for p in self.teaching_periods():
            try: hour=int(str(p.get("start_time","")).split(":")[0])
            except (ValueError,IndexError): continue
            if hour >= 12: result.append(p)
        return result

def _match_name(text: str, options: dict[int,str]) -> tuple[int|None,str|None,float]:
    lowered=text.lower(); best=(None,None,0.0)
    for ident,name in options.items():
        needle=name.lower()
        if needle and needle in lowered:
            confidence=min(0.99,0.6+len(needle)/40)
            if confidence>best[2]: best=(ident,name,confidence)
    if best[0] is not None: return best
    for ident,name in options.items():
        for part in [p for p in re.split(r"[\s.]+",name.lower()) if len(p)>2]:
            if re.search(rf"\b{re.escape(part)}\b",lowered): return ident,name,0.72
    return None,None,0.0

def _day_from_text(lowered: str, vocab: SchoolVocabulary):
    for word,index in DAY_WORDS.items():
        if re.search(rf"\b{word}\b",lowered): return index,next((d["name"] for d in vocab.days if d["index"]==index),word.title())
    return None,None

def _period_number(period: dict) -> int | None:
    digits=re.findall(r"\d+",str(period.get("name",""))); return int(digits[0]) if digits else None

class RuleBasedParser:
    source="rules"
    def parse(self,text:str,vocab:SchoolVocabulary)->Command:
        lowered=text.lower().strip()
        if not lowered: return Command("unknown",explanation="Type a scheduling instruction.")
        if lowered.startswith("why") or " why " in lowered: return Command("explain",confidence=.8,explanation="I will look up what is blocking that change.",needs_confirmation=False,source=self.source)
        if "workload" in lowered and any(w in lowered for w in ("balance","rebalance")):
            return Command("rebalance",weight_key="workload_balance",weight=30,confidence=.85,explanation="Re-run optimisation with teacher workload weighted more heavily.",source=self.source)
        if lowered.startswith("improve") or "improve this timetable" in lowered:
            return Command("improve",confidence=.8,explanation="Re-run optimisation using the current constraint weights.",source=self.source)
        match=re.search(r"(?:prioriti[sz]e|increase|raise|reduce|lower|decrease)\s+(\w+)",lowered)
        if match and (key:=WEIGHT_WORDS.get(match.group(1))):
            lower=match.group(0).split()[0] in {"reduce","lower","decrease"}
            return Command("set_weight",weight_key=key,weight=5 if lower else 35,confidence=.8,explanation=f"{'Lower' if lower else 'Raise'} the weight of {key.replace('_',' ')} and re-optimise.",source=self.source)
        if ("free period" in lowered or "free slot" in lowered or "free time" in lowered) and ("find" in lowered or "for " in lowered or "when is" in lowered):
            class_id,class_name,class_conf=_match_name(lowered,vocab.classes); teacher_id,teacher_name,teacher_conf=_match_name(lowered,vocab.teachers); day,day_name=_day_from_text(lowered,vocab)
            if class_id is None and teacher_id is None: return Command("unknown",confidence=.2,explanation="I could not tell which class or teacher you meant.",source=self.source)
            kind="both" if class_id is not None and teacher_id is not None else ("class" if class_id is not None else "teacher")
            target=f"{class_name} and {teacher_name}" if kind=="both" else (class_name or teacher_name)
            return Command("find_free",target=target,target_kind=kind,target_id=class_id if kind=="class" else teacher_id,day=day,day_name=day_name,confidence=.9,explanation="Looking up free periods in the current timetable…",source=self.source,params={"class_id":class_id,"teacher_id":teacher_id})
        if "room" in lowered and ("available" in lowered or "free" in lowered) and re.search(r"\b\d{1,2}[:.]\d{2}\b",lowered):
            match=re.search(r"\b(\d{1,2})[:.](\d{2})\b",lowered); day,day_name=_day_from_text(lowered,vocab)
            return Command("find_room",day=day,day_name=day_name,confidence=.9,explanation="Looking up room availability…",source=self.source,params={"hour":int(match.group(1)),"minute":int(match.group(2))})
        if ("consecutive free" in lowered or "free periods in a row" in lowered) and ("teacher" in lowered or "staff" in lowered):
            minimum=3; match=re.search(r"more than (\d+)",lowered)
            if match: minimum=int(match.group(1))+1
            return Command("find_gaps",confidence=.9,explanation="Checking consecutive free periods for every teacher…",source=self.source,params={"min_free":minimum})
        if any(p in lowered for p in ("free","no lessons","keep clear","off","avoid","blank")):
            class_id,class_name,class_conf=_match_name(lowered,vocab.classes); teacher_id,teacher_name,teacher_conf=_match_name(lowered,vocab.teachers)
            if teacher_conf>class_conf: kind,ident,name,conf="teacher",teacher_id,teacher_name,teacher_conf
            elif class_id is not None: kind,ident,name,conf="class",class_id,class_name,class_conf
            else: return Command("unknown",confidence=.2,explanation="I could not tell which class or teacher you meant.",source=self.source)
            day,day_name=_day_from_text(lowered,vocab)
            if day is None: return Command("unknown",confidence=.3,explanation="Tell me which day.",source=self.source)
            if "afternoon" in lowered: chosen=vocab.afternoon_periods()
            else:
                explicit={int(n) for n in re.findall(r"\bp(\d+)\b",lowered)}
                chosen=[p for p in vocab.teaching_periods() if _period_number(p) in explicit] if explicit else vocab.teaching_periods()
            if not chosen: return Command("unknown",confidence=.3,explanation="I could not work out which periods you meant.",source=self.source)
            hard=any(w in lowered for w in ("must","never","always","strictly"))
            return Command("avoid_lessons",target=name,target_kind=kind,target_id=ident,day=day,day_name=day_name,periods=[p["index"] for p in chosen],period_names=[p["name"] for p in chosen],priority="hard" if hard else "soft",weight=60 if hard else 25,confidence=min(.95,conf+.15),explanation=f"Keep {len(chosen)} period(s) on {day_name} free for {name}.",source=self.source)
        return Command("unknown",confidence=.1,explanation="I did not understand that instruction.",source=self.source)

class LlmParser:
    source="llm"
    def __init__(self,api_key:str,model:str,base_url:str)->None:
        self._api_key=api_key; self._model=model; self._base_url=base_url.rstrip("/"); self._fallback=RuleBasedParser()
    def parse(self,text:str,vocab:SchoolVocabulary)->Command:
        try:
            payload=self._request(text,vocab); command=self._validate(payload,vocab)
            return command or self._fallback.parse(text,vocab)
        except Exception: return self._fallback.parse(text,vocab)
    def _request(self,text,vocab):
        schema={"action":sorted(SUPPORTED_ACTIONS),"target":"existing class or teacher name or null","target_kind":"class | teacher | null","day":"day name or null","periods":"existing period names or []","priority":"soft | hard","weight_key":"teacher_gaps | subject_distribution | consecutive_lessons | workload_balance | room_utilisation | null","explanation":"short sentence"}
        context={"classes":sorted(vocab.classes.values()),"teachers":sorted(vocab.teachers.values()),"days":[d["name"] for d in vocab.days],"periods":[{"name":p["name"],"start":p.get("start_time")} for p in vocab.teaching_periods()]}
        body=json.dumps({"model":self._model,"temperature":0,"response_format":{"type":"json_object"},"messages":[{"role":"system","content":"Return one JSON scheduling command. Do not create timetables or prefer any period based on time of day. Schema: "+json.dumps(schema)},{"role":"user","content":json.dumps({"instruction":text,"context":context})}]}).encode()
        request=urllib.request.Request(f"{self._base_url}/chat/completions",data=body,headers={"Authorization":f"Bearer {self._api_key}","Content-Type":"application/json"})
        with urllib.request.urlopen(request,timeout=12) as response: data=json.loads(response.read())
        return json.loads(data["choices"][0]["message"]["content"])
    def _validate(self,payload,vocab):
        action=str(payload.get("action","unknown"))
        if action not in SUPPORTED_ACTIONS: return None
        command=Command(action,source=self.source,confidence=.9,explanation=str(payload.get("explanation",""))[:240],priority="hard" if payload.get("priority")=="hard" else "soft")
        target=payload.get("target")
        if target:
            kind=payload.get("target_kind"); pool=vocab.teachers if kind=="teacher" else vocab.classes; ident,name,_=_match_name(str(target),pool)
            if ident is None: return None
            command.target_id,command.target,command.target_kind=ident,name,kind
        if payload.get("day"):
            index=DAY_WORDS.get(str(payload["day"]).lower())
            if index is None: return None
            command.day=index; command.day_name=next((d["name"] for d in vocab.days if d["index"]==index),str(payload["day"]))
        wanted=payload.get("periods") or []
        if wanted:
            names={str(w).lower() for w in wanted}; chosen=[p for p in vocab.teaching_periods() if str(p["name"]).lower() in names]
            if not chosen: return None
            command.periods=[p["index"] for p in chosen]; command.period_names=[p["name"] for p in chosen]
        key=payload.get("weight_key")
        if key in WEIGHT_WORDS.values(): command.weight_key=key; command.weight=35
        if action=="avoid_lessons" and not(command.target_id is not None and command.day is not None and command.periods): return None
        command.weight=command.weight or (60 if command.priority=="hard" else 25)
        return command

def get_parser():
    api_key=os.getenv("OPENAI_API_KEY","").strip()
    if api_key: return LlmParser(api_key,os.getenv("COPILOT_MODEL","gpt-4o-mini"),os.getenv("OPENAI_BASE_URL","https://api.openai.com/v1"))
    return RuleBasedParser()
