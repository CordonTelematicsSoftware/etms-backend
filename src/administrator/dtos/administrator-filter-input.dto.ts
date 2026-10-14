import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class AdministratorFilterInput extends ListOptionInput {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'fullName', 'email', 'createdAt'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'fullName', 'email', 'createdAt'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  // @ApiProperty({ required: false, type: Boolean })
  // @IsOptional()
  // @Transform(({ value }) => value === '1' || value === 'true')
  // @IsBoolean()
  // enabled: boolean;

  // @ApiProperty({ required: false })
  // @IsOptional()
  // @IsString()
  // filter?: string;
}
