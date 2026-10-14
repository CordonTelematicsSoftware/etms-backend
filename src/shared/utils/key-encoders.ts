import { promises as fs } from 'fs';
export async function loadFirebaseKey() {
  try {
    const keyfilePath = 'src/shared/keys/accounts.json';
    const data = await fs.readFile(keyfilePath, 'utf8');
    const accountsKeys = JSON.parse(data);
    return accountsKeys.firebase.replace(/\\n/g, '\n').toString('utf8');
  } catch (err) {
    return err;
  }
}
