import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(100)
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MaxLength(50)
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  form?: string;

  @IsOptional()
  @IsBoolean()
  requiresPrescription?: boolean;
}
