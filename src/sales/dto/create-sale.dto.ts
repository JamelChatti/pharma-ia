import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const PAYMENT_METHODS = [
  'cash',
  'card',
  'bank_transfer',
  'mobile_payment',
] as const;

export type SalePaymentMethod = (typeof PAYMENT_METHODS)[number];

class CreateSaleLineDto {
  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  discount?: number;
}

class CreateSalePaymentDto {
  @IsEnum(PAYMENT_METHODS)
  paymentMethod!: SalePaymentMethod;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;
}

export class CreateSaleDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  registerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  lines!: CreateSaleLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments!: CreateSalePaymentDto[];
}
