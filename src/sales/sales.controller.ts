import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayloadUser,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ApplyCustomerCreditDto } from './dto/apply-customer-credit.dto';
import { ApproveSaleReturnDto } from './dto/approve-sale-return.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { RefundSaleReturnDto } from './dto/refund-sale-return.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Permissions('sales.credit.use')
  @Post('credits/apply')
  applyCustomerCredit(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ApplyCustomerCreditDto,
  ) {
    return this.salesService.applyCustomerCredit(user.pharmacyId, user, dto);
  }

  @Permissions('sales.return.approve')
  @Post('returns/:returnId/approve')
  approveReturn(
    @CurrentUser() user: JwtPayloadUser,
    @Param('returnId') returnId: string,
    @Body() dto: ApproveSaleReturnDto,
  ) {
    return this.salesService.approveReturn(
      user.pharmacyId,
      user,
      returnId,
      dto,
    );
  }

  @Permissions('sales.return.refund')
  @Post('returns/:returnId/refund')
  refundReturn(
    @CurrentUser() user: JwtPayloadUser,
    @Param('returnId') returnId: string,
    @Body() dto: RefundSaleReturnDto,
  ) {
    return this.salesService.refundReturn(user.pharmacyId, user, returnId, dto);
  }

  @Permissions('sales.read')
  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.salesService.findAll(user.pharmacyId);
  }

  @Permissions('sales.read')
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.salesService.findOne(user.pharmacyId, id);
  }

  @Permissions('sales.create')
  @Post()
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.pharmacyId, user, dto);
  }

  @Permissions('sales.refund')
  @Post(':id/returns')
  createReturn(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') saleId: string,
    @Body() dto: CreateSaleReturnDto,
  ) {
    return this.salesService.createReturn(user.pharmacyId, user, saleId, dto);
  }
}
