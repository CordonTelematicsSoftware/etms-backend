import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsOptional, IsString } from 'class-validator';
import { EmployeeType } from 'src/shared/enums';

export class RoleInputDto {
  @ApiProperty({ required: true })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({ default: false })
  enabled: boolean;

  @ApiProperty({ required: true })
  @IsDefined()
  permissions: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orgID?: string;

  @ApiProperty({
    required: false,
    enum: EmployeeType,
    default: null,
  })
  @IsOptional()
  @IsOptional()
  // @IsEnum(EmployeeType, { message: 'Invalid employee type' })
  employeeType?: EmployeeType | null;
}
