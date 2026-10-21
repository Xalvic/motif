import { Controls } from './Controls';
import { Header } from './Header';
import { LowerPanels } from './LowerPanels';
import { SavedIdeas } from './SavedIdeas';
import { Stage } from './Stage';

export function App() {
  return (
    <div className="wrap">
      <Header />
      <Controls />
      <Stage />
      <LowerPanels />
      <SavedIdeas />
    </div>
  );
}
