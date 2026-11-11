import jwt from 'jsonwebtoken';

export function issueToken(userId: string): string {
  // A07: the token is signed with the "none" algorithm, so anybody can
  // forge a valid session by hand.
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { algorithm: 'none' });
}
