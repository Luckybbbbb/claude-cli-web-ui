'use client';

import { useState, useEffect } from 'react';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface BreakpointState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const DESKTOP_BREAKPOINT = '(min-width: 1024px)';
const TABLET_BREAKPOINT = '(min-width: 768px)';

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(DESKTOP_BREAKPOINT).matches) return 'desktop';
  if (window.matchMedia(TABLET_BREAKPOINT).matches) return 'tablet';
  return 'mobile';
}

export function useBreakpoint(): BreakpointState {
  const [bp, setBp] = useState<Breakpoint>('desktop');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setBp(getBreakpoint()), 150);
    };

    const mqlDesktop = window.matchMedia(DESKTOP_BREAKPOINT);
    const mqlTablet = window.matchMedia(TABLET_BREAKPOINT);

    mqlDesktop.addEventListener('change', update);
    mqlTablet.addEventListener('change', update);

    setBp(getBreakpoint());

    return () => {
      clearTimeout(timer);
      mqlDesktop.removeEventListener('change', update);
      mqlTablet.removeEventListener('change', update);
    };
  }, []);

  return {
    breakpoint: bp,
    isMobile: bp === 'mobile',
    isTablet: bp === 'tablet',
    isDesktop: bp === 'desktop',
  };
}
