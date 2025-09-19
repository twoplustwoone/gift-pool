import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

interface NotificationsStoreValue {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

const NotificationsContext = createContext<NotificationsStoreValue | null>(null);

export const NotificationsProvider = ({ children }: PropsWithChildren) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const value = useMemo(
    () => ({ unreadCount, setUnreadCount }),
    [unreadCount],
  );
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotificationsStore = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsStore must be used within NotificationsProvider');
  }
  return ctx;
};
