export type AuthUser = {
  sub: string;
  login: string;
  role: 'admin' | 'user';
};

export type TokenClaims = AuthUser & {
  type: 'access' | 'refresh';
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};
