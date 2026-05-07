import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const REFUND_METHODS = [
  'cash',
  'bank_transfer',
  'card_reversal',
  'customer_credit',
] as const;

export class RefundSaleReturnDto {
  @IsIn(REFUND_METHODS)
  method!: (typeof REFUND_METHODS)[number];

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
