import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  create(pharmacyId: string, dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        pharmacyId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        categoryId: dto.categoryId,
        unit: dto.unit,
        form: dto.form,
        requiresPrescription: dto.requiresPrescription ?? false,
      },
    });
  }

  findAll(pharmacyId: string) {
    return this.prisma.product.findMany({
      where: { pharmacyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(pharmacyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, pharmacyId },
    });
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }

  async update(pharmacyId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(pharmacyId, id);
    return this.prisma.product.update({
      where: { id },
      data: dto,
    });
  }

  async remove(pharmacyId: string, id: string) {
    await this.findOne(pharmacyId, id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
