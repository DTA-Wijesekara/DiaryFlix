import { NavLink, Link } from 'react-router-dom';

export default function DiaryNavigation() {
  return <nav className="diary-views" aria-label="Diary views">
    <div className="view-segments">
      <NavLink to="/diary">By date</NavLink>
      <NavLink to="/library">By title</NavLink>
    </div>
    <Link to="/stats">View statistics</Link>
  </nav>;
}
