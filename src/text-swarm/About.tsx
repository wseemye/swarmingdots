import { Link } from 'react-router-dom';

/** The "?" in the top left corner, which opens the intro page. */
export default function About() {
  return (
    <Link to="/intro" className="corner-button" aria-label="What is this?">
      ?
    </Link>
  );
}
