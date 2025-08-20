import Headroom from 'react-headroom';
import { TopNav } from '#app/components/nav/top/top-nav';

export const TopBar = () => {
  return (
    <Headroom
      wrapperStyle={{ paddingTop: 'env(safe-area-inset-top)' }}
      style={{
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <header className="container py-4 sm:py-6">
        <TopNav />
      </header>
    </Headroom>
  );
};
