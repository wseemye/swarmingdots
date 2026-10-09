import { Navigate, useLocation } from 'react-router-dom';

// The site is one page at /. Old links (/text, /icons) and any other path land
// there, keeping their query string so ?size= still works.
export default function ToRoot() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/', search }} replace />;
}
