import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Alert } from '../components/Alert'
import { Field } from '../components/Field'
import { friendlyApiError } from '../lib/api'
import { scheduling, type Room, type RoomInput, type SchoolClass, type SchoolClassInput, type Subject, type SubjectInput, type Teacher, type TeacherInput } from '../lib/scheduling'
import { useToast } from '../components/Toast'

// The previous implementation cast the generic form record directly to
// SchoolClassInput. TypeScript correctly rejects that conversion because the
// record is not structurally compatible with the required class fields.
// Keep the form generic and only narrow at the API boundary after validation.

