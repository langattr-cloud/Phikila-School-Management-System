import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SchoolProfile from './pages/SchoolProfile'
import Academics from './pages/Academics'
import Departments from './pages/Departments'
import Subjects from './pages/Subjects'
import Teachers from './pages/Teachers'
import Students from './pages/Students'
import ClassRegisters from './pages/ClassRegisters'
import Timetable from './pages/Timetable'
import Examinations from './pages/Examinations'
import Finance from './pages/Finance'
import Reports from './pages/Reports'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="school" element={<SchoolProfile />} />
            <Route path="academics" element={<Academics />} />
            <Route path="departments" element={<Departments />} />
            <Route path="subjects" element={<Subjects />} />
            <Route path="teachers" element={<Teachers />} />
            <Route path="students" element={<Students />} />
            <Route path="classes" element={<ClassRegisters />} />
            <Route path="timetable" element={<Timetable />} />
            <Route path="examinations" element={<Examinations />} />
            <Route path="finance" element={<Finance />} />
            <Route path="reports" element={<Reports />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
