import { useStore } from '../state/store';

export function Toast() {
  const toast = useStore((state) => state.toast);
  return (
    <div className={toast ? 'toast on' : 'toast'} role="status">
      {toast}
    </div>
  );
}
