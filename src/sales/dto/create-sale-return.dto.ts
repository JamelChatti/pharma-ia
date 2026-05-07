import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const RETURN_CONDITIONS = ['resellable', 'damaged', 'expired'] as const;
export type ReturnConditionDto = (typeof RETURN_CONDITIONS)[number];

const REFUND_METHODS = [
  'cash',
  'bank_transfer',
  'card_reversal',
  'customer_credit',
] as const;
export type RefundMethodDto = (typeof REFUND_METHODS)[number];

export class CreateSaleReturnLineDto {
  @IsUUID()
  saleLineId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @IsIn(RETURN_CONDITIONS)
  condition!: ReturnConditionDto;
}

export class CreateSaleReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnLineDto)
  lines!: CreateSaleReturnLineDto[];

  @IsOptional()
  @IsString()
  reason?: string;

  /** Pour règlement immédiat (retour sous le seuil) : obligatoire si pas d’approbation. */
  @IsOptional()
  @IsIn(REFUND_METHODS)
  refundMethod?: RefundMethodDto;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  /** 0 à 100, appliqué sur le montant remboursable brut (avant override). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  restockingFeePercent?: number;

  /** Ignore le montant calculé si renseigné (geste commercial). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  overrideAmount?: number;
}
