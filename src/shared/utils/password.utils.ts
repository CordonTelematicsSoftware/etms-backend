import * as bcrypt from 'bcryptjs';

export async function generateHashedPassword(
  password: string,
): Promise<string> {
  const salt = await bcrypt.genSalt();
  return await bcrypt.hash(password, salt);
}
