import { usePath } from './lib/router';
import { Shell } from './pages/app/Shell';

export function App() {
  return <Shell path={usePath()} />;
}
