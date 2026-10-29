import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initAudioLoading } from './audio/loading';
import { App } from './ui/App';
import './ui/styles.css';

initAudioLoading();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
