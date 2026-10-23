import { Controls } from './Controls';
import { Header } from './Header';
import { LowerPanels } from './LowerPanels';
import { SavedIdeas } from './SavedIdeas';
import { Stage } from './Stage';
import { Toast } from './Toast';

export function App() {
  return (
    <div className="wrap">
      <Header />
      <Controls />
      <Stage />
      <LowerPanels />
      <SavedIdeas />
      <Toast />
    </div>
  );
}
