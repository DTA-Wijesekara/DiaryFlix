import { BookOpen } from 'lucide-react';
import SampleJournal from './SampleJournal';

export default function AuthAside({ headline, caption }) {
  return <aside className="auth-aside" aria-hidden="true">
    <div className="auth-aside-brand"><BookOpen size={24} /><span className="auth-aside-brand-name">DiaryFLIX</span></div>
    <div className="auth-aside-center"><span className="eyebrow">A LIFE IN FILMS</span><h1 className="auth-aside-headline">{headline}</h1><SampleJournal compact /><p className="auth-journal-caption">The titles. The people. The way it felt.</p></div>
    <div className="auth-aside-meta">{caption}</div>
  </aside>;
}
