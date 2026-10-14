// /* eslint-disable no-console */

// import { auth } from 'googleapis/build/src/apis/oauth2';
// export const accessToken = async () => {
//   const oauth2Client = new auth.OAuth2(
//     process.env.MAIL_CLIENT_ID,
//     process.env.MAIL_CLIENT_SECRET,
//     'https://developers.google.com/oauthplayground',
//   );

//   oauth2Client.setCredentials({
//     refresh_token: process.env.REFRESH_TOKEN,
//   });

//   oauth2Client.getAccessToken((err, token) => {
//     return token;
//   });
// };
import { google } from 'googleapis';

export const accessToken = async (): Promise<string> => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.MAIL_CLIENT_ID,
    process.env.MAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground',
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.MAIL_REFRESH_TOKEN,
  });

  const { token } = await oauth2Client.getAccessToken();

  if (!token) {
    throw new Error('Failed to retrieve Google OAuth access token');
  }

  return token;
};