"""LLM provider credential and model catalogue tables."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, UniqueConstraint
from app.core.database import Base

class TtLlmCredential(Base):
    __tablename__ = "tt_llm_credentials"
    __table_args__ = (UniqueConstraint("provider", name="uq_tt_llm_credential_provider"),)
    id = Column(Integer, primary_key=True); provider = Column(String(40), nullable=False, index=True); encrypted_api_key = Column(Text, nullable=False); last4 = Column(String(8)); status = Column(String(30), default="not_configured", nullable=False); last_tested_at = Column(DateTime); last_error = Column(String(300)); models_available = Column(Integer, default=0, nullable=False); created_by = Column(String(160)); updated_by = Column(String(160)); created_at = Column(DateTime, default=datetime.utcnow, nullable=False); updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TtLlmModel(Base):
    __tablename__ = "tt_llm_models"
    __table_args__ = (UniqueConstraint("provider", "model_id", name="uq_tt_llm_model"),)
    id = Column(Integer, primary_key=True); provider = Column(String(40), nullable=False, index=True); model_id = Column(String(200), nullable=False); display_name = Column(String(200)); context_window = Column(Integer); input_price = Column(Float); output_price = Column(Float); supports_tools = Column(Boolean); supports_vision = Column(Boolean); supports_reasoning = Column(Boolean); enabled = Column(Boolean, default=False, nullable=False, index=True); last_tested_at = Column(DateTime); last_test_ok = Column(Boolean); last_test_ms = Column(Integer); last_test_error = Column(String(300)); created_at = Column(DateTime, default=datetime.utcnow, nullable=False); updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TtLlmSetting(Base):
    __tablename__ = "tt_llm_settings"
    id = Column(Integer, primary_key=True)
    default_provider = Column(String(40)); default_model_id = Column(String(200))
    copilot_rate_limit = Column(Integer, default=20, nullable=False)
    copilot_rate_window_seconds = Column(Integer, default=3600, nullable=False)
    updated_by = Column(String(160)); updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
