import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Shell from './Shell.tsx'
import ToText from './ToText.tsx'
import FlagSwarm from './flags/FlagSwarm.tsx'
import Intro from './text-swarm/Intro.tsx'
import TextSwarm from './text-swarm/TextSwarm.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/text" element={<TextSwarm />} />
          <Route path="/intro" element={<Intro />} />
          <Route path="/flags" element={<FlagSwarm />} />
          <Route path="/flags/:code" element={<FlagSwarm />} />
          <Route path="*" element={<ToText />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
