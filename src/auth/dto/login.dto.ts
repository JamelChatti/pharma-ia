import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @ValidateIf((_, v) => v != null && v !== '')
  @IsOptional()
  @IsEmail()
  email?: string;

  @ValidateIf((_, v) => v != null && v !== '')
  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
