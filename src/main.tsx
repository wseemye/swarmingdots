import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Shell from './Shell.tsx'
import ToRoot from './ToRoot.tsx'
import TextSwarm from './text-swarm/TextSwarm.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<TextSwarm />} />
          <Route path="*" element={<ToRoot />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
