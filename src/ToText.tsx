import { Navigate, useLocation } from 'react-router-dom';

// The text swarm lives at /text (and its intro at /intro). / and any other path, including the old /icons,
// land there, keeping their query string so ?size= still works.
export default function ToText() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/text', search }} replace />;
}
