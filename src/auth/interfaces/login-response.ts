export interface LoginResponseDto {
  id: bigint;
  fullName: string;
  accessToken: string;
  expiry?: number;
}
