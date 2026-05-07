import { IsIn, IsOptional, IsString } from 'class-validator';

export class ApproveSaleReturnDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  note?: string;
}
