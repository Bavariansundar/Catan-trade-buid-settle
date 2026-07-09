import bcrypt from "bcrypt";

export async function hashPassword(password: string, costFactor: number): Promise<string> {
  return bcrypt.hash(password, costFactor);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
