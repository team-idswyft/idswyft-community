import config from '@/config/index.js';
import { logger } from '@/utils/logger.js';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  company: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Build the GitHub OAuth authorization URL.
 * The `state` parameter is a random token the frontend generates
 * and stores in sessionStorage to prevent CSRF.
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.redirectUri,
    scope: 'user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange a temporary OAuth code for an access token.
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };

  if (data.error || !data.access_token) {
    logger.error('GitHub OAuth error', { error: data.error, description: data.error_description });
    throw new Error(data.error_description || 'GitHub authentication failed');
  }

  return data.access_token;
}

/**
 * Fetch the authenticated user's profile and primary verified email.
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const [userResponse, emailsResponse] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }),
  ]);

  if (!userResponse.ok) {
    throw new Error(`GitHub user fetch failed: ${userResponse.status}`);
  }

  const user = await userResponse.json() as GitHubUser;

  // If the profile email is missing or unverified, find the primary verified email
  if (!user.email && emailsResponse.ok) {
    const emails = await emailsResponse.json() as GitHubEmail[];
    const primary = emails.find(e => e.primary && e.verified);
    if (primary) {
      user.email = primary.email;
    } else {
      // Fall back to any verified email
      const anyVerified = emails.find(e => e.verified);
      if (anyVerified) {
        user.email = anyVerified.email;
      }
    }
  }

  if (!user.email) {
    throw new Error('No verified email found on your GitHub account');
  }

  return user;
}
