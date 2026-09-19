import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';

export function useKeyboardShortcuts(onNavigate?: (path: string) => void) {
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

      // Quick jump shortcuts (if not typing in input)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        if (onNavigate) onNavigate('/constellation');
      }
      if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) {
        if (onNavigate) onNavigate('/commanding');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, closeModal, onNavigate]);
}
