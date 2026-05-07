import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayloadUser,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Permissions('products.read')
  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.productsService.findAll(user.pharmacyId);
  }

  @Permissions('products.read')
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.productsService.findOne(user.pharmacyId, id);
  }

  @Permissions('products.create')
  @Post()
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.pharmacyId, dto);
  }

  @Permissions('products.update')
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.pharmacyId, id, dto);
  }

  @Permissions('products.delete')
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.productsService.remove(user.pharmacyId, id);
  }
}
