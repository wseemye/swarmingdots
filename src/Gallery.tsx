import DotMatrix from './DotMatrix';
import { iconNames, icons } from './icons';

export default function Gallery() {
  return (
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
  );
}
