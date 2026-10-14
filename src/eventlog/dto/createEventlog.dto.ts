import { IsString, IsNotEmpty, IsNumber } from 'class-validator';
export class CreateEventLogTypeDto {
  @IsNotEmpty()
  @IsString()
  objectType: string;

  @IsNotEmpty()
  objectID: bigint;

  @IsNotEmpty()
  @IsString()
  changeType: string;

  requestPayload: any;

  payload: any;

  @IsNotEmpty()
  @IsString()
  updatedBy: string;

  @IsNotEmpty()
  @IsNumber()
  authID: bigint;

  type: string;
}
