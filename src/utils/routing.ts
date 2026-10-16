import { ScreenId } from '../types';

export interface RouteState {
  screen: ScreenId;
  inviteId?: string;
  certRef?: string;
}

export const getRouteState = (pathname?: string): RouteState => {
  if (typeof window === 'undefined' && !pathname) return { screen: 'auth' };
  const path = pathname !== undefined ? pathname : window.location.pathname;
  if (path === '/' || path === '') return { screen: 'auth' };
  const inviteAuthMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)\/auth$/);
  if (inviteAuthMatch && inviteAuthMatch[1] !== 'current') return { screen: 'p2_auth', inviteId: inviteAuthMatch[1] };
  const inviteDetailsMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)\/(?:details|complete)$/);
  if (inviteDetailsMatch && inviteDetailsMatch[1] !== 'current') return { screen: 'p2_details', inviteId: inviteDetailsMatch[1] };
  const inviteLandingMatch = path.match(/^\/invite\/([a-zA-Z0-9_-]+)$/);
  if (inviteLandingMatch && inviteLandingMatch[1] !== 'current') return { screen: 'p2_landing', inviteId: inviteLandingMatch[1] };
  const certMatch = path.match(/^\/(?:certificate|cert)(?:\/([a-zA-Z0-9_-]+))?$/);
  if (certMatch) return { screen: 'official_certificate', certRef: certMatch[1] };
  const verifyMatch = path.match(/^\/verify(?:\/([a-zA-Z0-9_-]+))?$/);
  if (verifyMatch) return { screen: 'verify_portal', certRef: verifyMatch[1] };
  if (path === '/review') return { screen: 'review_controls' };
  if (path === '/waiting') return { screen: 'p1_waiting' };
  if (path === '/p2') return { screen: 'p2_details' };
  if (path === '/about') return { screen: 'about' };
  if (path === '/privacy') return { screen: 'privacy' };
  if (path === '/terms') return { screen: 'terms' };
  return { screen: 'not_found' };
};
