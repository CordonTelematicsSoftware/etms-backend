import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

export const generateOTP = (): string => {
  return String(randomInt(0, 1_000_000)).padStart(4, '0');
};

export const generateHashedOtp = async (otp: string): Promise<string> => {
  const salt = await bcrypt.genSalt();
  return await bcrypt.hash(otp, salt);
};
