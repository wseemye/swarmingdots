import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from './Shell.tsx'
import TextSwarm from './text-swarm/TextSwarm.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/text" element={<TextSwarm />} />
          {/* The site is only the text swarm for now; every other path lands there. */}
          <Route path="*" element={<Navigate to="/text" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
