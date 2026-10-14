import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

export async function verifyRecaptcha(token: string): Promise<void> {
  if (!token) {
    throw new BadRequestException('reCAPTCHA token is missing');
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  const { data } = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify`,
    null,
    {
      params: { secret, response: token },
    },
  );

  if (!data.success) {
    throw new BadRequestException('reCAPTCHA verification failed');
  }
}
