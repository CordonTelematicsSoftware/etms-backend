// import { AuthenticatedUserData } from './auth-user';

export interface RequestData {
  method: string;
  body: any;
  headers: any;
  user: any;
  url: string;
}
