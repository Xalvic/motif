import { Controls } from './Controls';
import { Header } from './Header';
import { CONFIG } from '../state/listeningStore';
import { ListeningMelody, ListeningPass } from './ListeningPass';
import { LowerPanels } from './LowerPanels';
import { SavedIdeas } from './SavedIdeas';
import { Stage } from './Stage';
import { Toast } from './Toast';

/** `?listen` opens the owner's listening pass instead of the generator. */
const listening = new URLSearchParams(window.location.search).has('listen');

export function App() {
  if (listening) {
    return (
      <div className="wrap">
        <Header pass={CONFIG} />
        <ListeningPass />
        <Stage blind />
        {CONFIG.kind === 'melody' && <ListeningMelody />}
        <Toast />
      </div>
    );
  }
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
