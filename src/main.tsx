import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './icons.css'
import Shell from './Shell.tsx'
import IconsPage from './IconsPage.tsx'
import TextSwarm from './text-swarm/TextSwarm.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/text" element={<TextSwarm />} />
          <Route path="/icons" element={<IconsPage />} />
          {/* The site opens on the text swarm; the old routes land there too. */}
          <Route path="*" element={<Navigate to="/text" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
