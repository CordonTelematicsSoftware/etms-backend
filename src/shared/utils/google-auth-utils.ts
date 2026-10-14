/* eslint-disable no-console */

import { auth } from 'googleapis/build/src/apis/oauth2';
export const accessToken = async () => {
  const oauth2Client = new auth.OAuth2(
    process.env.MAIL_CLIENT_ID,
    process.env.MAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground',
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
  });

  oauth2Client.getAccessToken((err, token) => {
    return token;
  });
};
