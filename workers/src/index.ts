import { Hono } from 'hono'
import { createApp } from './lib/http'
import { authMiddleware } from './lib/auth'
import { authRoutes } from './routes/auth'
import { platformRoutes } from './routes/platform'
import { schoolRoutes } from './routes/school'
import { academicsRoutes } from './routes/academics'
import { studentsRoutes } from './routes/students'
import { teachersRoutes } from './routes/teachers'
import { attendanceRoutes } from './routes/attendance'
import { examinationsRoutes } from './routes/examinations'
import { financeRoutes } from './routes/finance'
import { schedulingRoutes } from './routes/scheduling'
import { admissionsRoutes } from './routes/admissions'
import { healthRoutes } from './routes/health'
import { inventoryRoutes } from './routes/inventory'
import { libraryRoutes } from './routes/library'
import { boardRoutes } from './routes/board'
import { principalRoutes } from './routes/principal'

const app = createApp()

app.use('/api/v1/*', authMiddleware)

app.route('/api/v1/auth', authRoutes)
app.route('/api/v1/platform', platformRoutes)
app.route('/api/v1/school', schoolRoutes)
app.route('/api/v1/academics', academicsRoutes)
app.route('/api/v1/students', studentsRoutes)
app.route('/api/v1/teachers', teachersRoutes)
app.route('/api/v1/attendance', attendanceRoutes)
app.route('/api/v1/examinations', examinationsRoutes)
app.route('/api/v1/finance', financeRoutes)
app.route('/api/v1/scheduling', schedulingRoutes)
app.route('/api/v1/admissions', admissionsRoutes)
app.route('/api/v1/health', healthRoutes)
app.route('/api/v1/inventory', inventoryRoutes)
app.route('/api/v1/library', libraryRoutes)
app.route('/api/v1/board', boardRoutes)
app.route('/api/v1/principal', principalRoutes)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.notFound((c) => c.json({ detail: 'Not found' }, 404))

export default app