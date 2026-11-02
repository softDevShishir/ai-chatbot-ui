import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { HandoffProvider } from './components/HandoffProvider'
import { HandoffsPage } from './pages/HandoffsPage'
import { ChatPage } from './pages/ChatPage'
import { LoginPage } from './pages/LoginPage'

export function AppRoutes() {
  return (
    <HandoffProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/handoffs"
          element={
            <RequireAuth>
              <HandoffsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
      </Routes>
    </HandoffProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
