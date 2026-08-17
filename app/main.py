from pathlib import Path, PurePosixPath
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.config import settings
from app.modules.academics.router import router as academics_router
from app.modules.attendance.router import router as attendance_router
from app.modules.authentication.router import router as auth_router
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.email.router import router as email_router
from app.modules.examinations.router_v2 import router as exams_router
from app.modules.finance.router import router as finance_router
from app.modules.finance.operations_router import router as finance_operations_router
from app.modules.finance.account_mapping_router import router as finance_account_mapping_router
from app.modules.finance.reports_router import router as finance_reports_router
from app.modules.finance.completion_router import router as finance_completion_router
from app.modules.llm.router import router as llm_router
from app.modules.ocr.router import router as ocr_router
from app.modules.platform.router import router as platform_router
from app.modules.scheduling.router import router as scheduling_router
from app.modules.school.router import router as school_router
from app.modules.students.router_v2 import router as students_router
from app.modules.users.router import router as users_router
FRONTEND_DIST=Path(__file__).resolve().parent.parent/'frontend'/'dist'
class SPAStaticFiles(StaticFiles):
    backend_roots=frozenset({'api','health','ready','docs','redoc','openapi.json'})
    async def get_response(self,path:str,scope:dict):
        try:return await super().get_response(path,scope)
        except StarletteHTTPException as error:
            is_frontend_route=error.status_code==404 and scope['method'] in {'GET','HEAD'} and not PurePosixPath(path).suffix and path.split('/',1)[0] not in self.backend_roots
            if not is_frontend_route:raise
        return await super().get_response('index.html',scope)
def create_app()->FastAPI:
    app=FastAPI(title='Phikila School System API',description='Backend API for Phikila School System - Phased Modular Architecture',version='1.0.0',docs_url='/docs',redoc_url='/redoc')
    if settings.cors_origins or settings.cors_origin_regex:app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins,allow_origin_regex=settings.cors_origin_regex,allow_credentials=True,allow_methods=['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allow_headers=['Authorization','Content-Type','Accept'])
    from app.middleware import SecurityHeadersMiddleware,AccessLogMiddleware
    app.add_middleware(AccessLogMiddleware);app.add_middleware(SecurityHeadersMiddleware)
    @app.get('/health',tags=['Health'])
    def health_check():return {'status':'ok','environment':settings.environment}
    @app.get('/ready',tags=['Health'])
    def readiness_check():
        try:
            from app.core.database import engine
            with engine.connect() as conn:conn.execute(__import__('sqlalchemy').text('SELECT 1'))
            return {'status':'ready','database':'connected'}
        except Exception as exc:
            from fastapi.responses import JSONResponse
            return JSONResponse({'status':'not_ready','error':str(exc)},status_code=503)
    protected=[Depends(get_supabase_claims)]
    app.include_router(auth_router,prefix='/api/v1/auth',tags=['Authentication'])
    app.include_router(users_router,prefix='/api/v1/users',tags=['Users'],dependencies=protected)
    app.include_router(school_router,prefix='/api/v1/school',tags=['School Profile'],dependencies=protected)
    app.include_router(scheduling_router,prefix='/api/v1/scheduling',tags=['Scheduling'])
    app.include_router(students_router,prefix='/api/v1',tags=['Students'])
    app.include_router(attendance_router,prefix='/api/v1',tags=['Attendance'])
    app.include_router(exams_router,prefix='/api/v1',tags=['Examinations'])
    app.include_router(finance_router,prefix='/api/v1',tags=['Finance'])
    app.include_router(finance_operations_router,prefix='/api/v1',tags=['Finance Operations'])
    app.include_router(finance_completion_router,prefix='/api/v1',tags=['Finance Treasury'])
    app.include_router(finance_account_mapping_router,prefix='/api/v1',tags=['Finance Account Mapping'])
    app.include_router(finance_reports_router,prefix='/api/v1',tags=['Finance Reports'])
    app.include_router(ocr_router,prefix='/api/v1/ocr',tags=['Document OCR'])
    app.include_router(platform_router,prefix='/api/v1/platform',tags=['Platform'])
    app.include_router(llm_router,prefix='/api/v1/llm',tags=['LLM Providers'])
    app.include_router(email_router,prefix='/api/v1/email',tags=['Email & Notifications'])
    app.include_router(academics_router,prefix='/api/v1/academics',tags=['Academics'],dependencies=protected)
    if FRONTEND_DIST.is_dir():app.mount('/',SPAStaticFiles(directory=FRONTEND_DIST,html=True),name='frontend')
    elif settings.is_production:raise RuntimeError('frontend/dist is missing; Vercel must run the configured frontend build before packaging the FastAPI application')
    return app
app=create_app()
if __name__=='__main__':
    import uvicorn
    uvicorn.run('main:app',host='0.0.0.0',port=8000,reload=True)
