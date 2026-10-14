import { ApiProperty } from '@nestjs/swagger';

export class UpdateGrievanceInput {
  @ApiProperty({ required: true })
  categoryId: number;

  @ApiProperty({ required: true })
  description: string;
}
