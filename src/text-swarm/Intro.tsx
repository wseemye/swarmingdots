import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import DotSwarmText from './DotSwarmText';
import './intro.css';

// Plain ASCII only: the font has no glyph for curly quotes or dashes, and they would be left out.
const INTRO =
  'Swarming Dots is a text component for React. Words arrive as a swarm of dots: ' +
  'each one starts as a block, its dots cross into the letters of Geist Pixel Circle, ' +
  'and real, selectable text settles over them. Set the size, spacing, colours and ' +
  'where the swarm starts in the editor, then add it to your own project with one shadcn command.';

/** What Swarming Dots is and who made it. The intro swarms in each time the page opens. */
export default function Intro() {
  useEffect(() => {
    document.title = 'Dot Swarm: intro';
    return () => {
      document.title = 'Dot Swarm';
    };
  }, []);

  return (
    <div className="intro">
      <Link to="/" className="corner-button" aria-label="Back to the editor">
        ←
      </Link>
      <div className="intro-body">
        <DotSwarmText
          as="h1"
          text={INTRO}
          fontSize={13}
          lineSpacing={8}
          anchor="top-left"
          fontUrl="/fonts/GeistPixel-Circle.woff2"
        />
        <p className="intro-byline">
          by Waseem
          <a href="https://x.com/wseemye" target="_blank" rel="noreferrer">
            @wseemye
          </a>
          <a href="https://www.linkedin.com/in/wseem" target="_blank" rel="noreferrer">
            /in/wseem
          </a>
        </p>
      </div>
    </div>
  );
}
