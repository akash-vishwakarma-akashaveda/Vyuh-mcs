import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';

// Single-key jumps were removed: a stray keypress must never change screens.
export function useKeyboardShortcuts(_onNavigate?: (path: string) => void) {
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const closeModal = useUIStore((s) => s.closeModal);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K -> Global Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }

      // Escape -> close modal or command palette
      if (e.key === 'Escape') {
        closeModal();
        setCommandPaletteOpen(false);
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, closeModal]);
}
