'use client';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ChatPanel } from '@/components/ChatPanel';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { TabletLayout } from '@/components/tablet/TabletLayout';

export default function Home() {
  const { isMobile, isTablet } = useBreakpoint();

  if (isMobile) return <MobileLayout />;
  if (isTablet) return <TabletLayout />;
  return <ChatPanel />;
}
