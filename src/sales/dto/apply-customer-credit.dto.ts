import { IsNumber, IsUUID, Min } from 'class-validator';

export class ApplyCustomerCreditDto {
  @IsUUID()
  saleId!: string;

  @IsUUID()
  customerId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  amount!: number;
}
