import jwt from 'jsonwebtoken';

export function issueToken(userId: string): string {
  // Signed with a real algorithm and an expiry.
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
  });
}
