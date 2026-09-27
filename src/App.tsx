import { useMemo } from 'react';
import DotSkeleton from './DotSkeleton';
import { skeletons } from './skeletons';
import './App.css';

function App() {
  const bonsai = useMemo(() => skeletons.bonsai(), []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#fafaf7',
      }}
    >
      <DotSkeleton skeleton={bonsai} />
    </div>
  );
}

export default App;
