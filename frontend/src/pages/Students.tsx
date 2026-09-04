import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Badge, EmptyState, LoadingBlock } from '../components/States'
import { api, friendlyApiError } from '../lib/api'
import { scheduling, type SchoolClass } from '../lib/scheduling'
import { students, type GuardianCreate, type Student, type StudentListResponse } from '../lib/students'

// ... existing page implementation ...
