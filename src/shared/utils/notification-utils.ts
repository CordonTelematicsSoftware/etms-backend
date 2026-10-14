/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
import * as admin from 'firebase-admin';

// Function to initialize Firebase Admin SDK from environment variables
const initializeFirebase = () => {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Replace escaped newlines
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('Firebase initialized successfully.');
};

// Function to send a message to a single device
export const sendMessageToSingleDevice = async (
  deviceToken: string,
  message: any,
) => {
  try {
    const message = {
      token: deviceToken, // Device registration token
      notification: {
        title: 'Hello!',
        body: 'This is a test notification sent to a single device via FCM.',
      },
    };

    const response = await admin.messaging().send(message);
    console.log('Message sent successfully to single device:', response);
  } catch (error) {
    console.error('Error sending message to single device:', error);
  }
};

// Function to send a message to multiple devices (Multicast)
export const sendMessageToMultipleDevices = async (
  deviceTokens: string[],
  message: any,
) => {
  try {
    const message = {
      tokens: deviceTokens, // Array of device registration tokens
      notification: {
        title: 'Hello!',
        body: 'This is a test notification sent to multiple devices via FCM.',
      },
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`Message sent successfully to multiple devices: 
      Success: ${response.successCount}, 
      Failure: ${response.failureCount}`);

    response.responses.forEach((res, idx) => {
      if (!res.success) {
        console.error(
          `Failed to send message to device token at index ${idx}:`,
          res.error,
        );
      }
    });
  } catch (error) {
    console.error('Error sending message to multiple devices:', error);
  }
};
