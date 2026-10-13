import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import ColorPicker from './ColorPicker';
import DotSwarmText from './DotSwarmText';
import VariantPicker from './VariantPicker';
import { fontFile, type Variant } from './variants';
import './intro.css';

// Plain ASCII only: the font has no glyph for curly quotes or dashes, and they would be left out.
const INTRO =
  'Swarming Dots is a text component for React. Words arrive as a swarm of dots: ' +
  'each one starts as a block, its dots cross into the letters of Geist Pixel, ' +
  'and real, selectable text takes their place. Set the size, spacing, colours and ' +
  'where the swarm starts in the editor, then add it to your own project with one shadcn command.';

// Matches the phone breakpoint in intro.css.
const PHONE = '(max-width: 760px)';
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isPhone = () => window.matchMedia(PHONE).matches;

/**
 * What Swarming Dots is and who made it. The intro swarms in each time the
 * page opens; the bar at the bottom changes its typeface (which swarms it
 * again) and its colours (which apply at once).
 */
export default function Intro() {
  const fontSize = useSyncExternalStore(subscribe, isPhone) ? 16 : 20;
  const [variant, setVariant] = useState<Variant>('circle');
  const [background, setBackground] = useState('#ffffff');
  const [color, setColor] = useState('#111111');

  return (
    <div className="intro" style={{ background, color }}>
      <Link to="/" className="corner-button" aria-label="Back to the editor">
        ←
      </Link>
      <div className="intro-body">
        <DotSwarmText
          as="h1"
          text={INTRO}
          fontSize={fontSize}
          lineSpacing={8}
          anchor="top-left"
          variant={variant}
          color={color}
          fontUrl={`/fonts/${fontFile(variant)}`}
        />
        <p className="intro-byline">
          by Waseem
          <a href="https://x.com/wseemye" target="_blank" rel="noreferrer">
            Twitter
          </a>
          <a href="https://www.linkedin.com/in/wseem" target="_blank" rel="noreferrer">
            LinkedIn
          </a>
        </p>
      </div>
      <div className="intro-bar" role="group" aria-label="Try it">
        <span className="visually-hidden" id="intro-typeface">
          Typeface
        </span>
        <VariantPicker value={variant} onChange={setVariant} labelledBy="intro-typeface" />
        <span className="intro-bar-rule" aria-hidden="true" />
        <div className="intro-dials">
          <ColorPicker shape="dial" label="Background" value={background} onChange={setBackground} />
          <ColorPicker shape="dial" label="Text color" value={color} onChange={setColor} />
        </div>
      </div>
    </div>
  );
}
