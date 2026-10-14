import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';

export class FilterGmsCategoryInput extends ListOptionInput {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  status: string;
}
