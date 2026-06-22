import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-6xl">🤷</div>
      <h1 className="text-2xl font-extrabold">Seite nicht gefunden</h1>
      <p className="text-sm text-slate-400">Diese Seite existiert nicht (mehr).</p>
      <Link to="/">
        <Button>Zurück zum Dashboard</Button>
      </Link>
    </div>
  );
}
