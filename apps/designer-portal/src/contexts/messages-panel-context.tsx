'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface MessagesPanelContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const MessagesPanelContext = createContext<MessagesPanelContextValue | null>(null);

export function MessagesPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <MessagesPanelContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </MessagesPanelContext.Provider>
  );
}

export function useMessagesPanel(): MessagesPanelContextValue {
  const ctx = useContext(MessagesPanelContext);
  if (!ctx) {
    throw new Error('useMessagesPanel must be used within MessagesPanelProvider');
  }
  return ctx;
}
