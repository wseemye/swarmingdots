import DotMatrix from './DotMatrix';
import { iconNames, icons } from './icons';

export default function App() {
  return (
    <main className="gallery">
      <header className="gallery-header">
        <h1>Dot Matrix</h1>
        <p>{iconNames.length} silhouettes on a 40-cell grid</p>
      </header>

      <ul className="gallery-grid">
        {iconNames.map((name) => (
          <li className="gallery-item" key={name}>
            <div className="gallery-art">
              <DotMatrix icon={icons[name]()} />
            </div>
            <span className="gallery-label">{name}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
