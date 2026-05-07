import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceAccountType,
  FinanceTxnType,
  PaymentStatus,
  Prisma,
  RefundMethod,
  ReturnCondition,
  SaleReturnStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyCustomerCreditDto } from './dto/apply-customer-credit.dto';
import { ApproveSaleReturnDto } from './dto/approve-sale-return.dto';
import { CreateSaleReturnDto } from './dto/create-sale-return.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { RefundSaleReturnDto } from './dto/refund-sale-return.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(pharmacyId: string) {
    return this.prisma.sale.findMany({
      where: { pharmacyId },
      orderBy: { saleDate: 'desc' },
      include: { lines: true, payments: true },
      take: 100,
    });
  }

  async findOne(pharmacyId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, pharmacyId },
      include: { lines: true, payments: true },
    });
    if (!sale) throw new NotFoundException('Vente introuvable');
    return sale;
  }

  async create(pharmacyId: string, user: JwtPayloadUser, dto: CreateSaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: dto.warehouseId, pharmacyId },
      });
      if (!warehouse) throw new BadRequestException('Dépôt invalide');

      if (dto.customerId) {
        const cust = await tx.customer.findFirst({
          where: { id: dto.customerId, pharmacyId },
        });
        if (!cust) throw new BadRequestException('Client invalide');
      }

      if (dto.registerId) {
        const reg = await tx.register.findFirst({
          where: { id: dto.registerId, pharmacyId },
        });
        if (!reg) throw new BadRequestException('Caisse invalide');
      }

      const productIds = dto.lines.map((l) => l.productId);
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          pharmacyId,
          isActive: true,
        },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('Un ou plusieurs produits invalides');
      }

      const saleNumber = `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

      let subtotal = new Prisma.Decimal(0);
      let discountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);

      const saleLinesData: Array<{
        productId: string;
        batchId: string | null;
        qty: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        discount: Prisma.Decimal;
        taxRate: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }> = [];

      const movementIds: string[] = [];

      for (const inputLine of dto.lines) {
        const product = products.find((p) => p.id === inputLine.productId)!;

        const latestPrice = await tx.productPrice.findFirst({
          where: { productId: product.id },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (!latestPrice) {
          throw new BadRequestException(`Prix manquant pour ${product.name}`);
        }

        const unitPrice = new Prisma.Decimal(latestPrice.salePrice.toString());
        const lineDiscountInput = new Prisma.Decimal(
          (inputLine.discount ?? 0).toString(),
        );

        let taxRate = new Prisma.Decimal('0');
        if (latestPrice.taxRateId) {
          const tr = await tx.taxRate.findUnique({
            where: { id: latestPrice.taxRateId },
          });
          if (tr) taxRate = new Prisma.Decimal(tr.rate.toString());
        }

        const qtyNeeded = new Prisma.Decimal(inputLine.qty.toString());

        const rawBalances = await tx.stockBalance.findMany({
          where: {
            warehouseId: dto.warehouseId,
            productId: product.id,
            quantityOnHand: { gt: 0 },
          },
          include: { batch: true },
        });

        const balances = rawBalances.sort((a, b) => {
          const aExp =
            a.batch?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bExp =
            b.batch?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          if (aExp !== bExp) return aExp - bExp;
          const aC = a.batch?.createdAt?.getTime() ?? 0;
          const bC = b.batch?.createdAt?.getTime() ?? 0;
          return aC - bC;
        });

        let remaining = qtyNeeded;

        for (const b of balances) {
          if (remaining.lte(0)) break;

          const onHand = new Prisma.Decimal(b.quantityOnHand.toString());
          const reserved = new Prisma.Decimal(b.quantityReserved.toString());
          const available = onHand.minus(reserved);
          if (available.lte(0)) continue;

          const take = Prisma.Decimal.min(available, remaining);
          const discountShare = lineDiscountInput.mul(take).div(qtyNeeded);

          await tx.stockBalance.update({
            where: { id: b.id },
            data: {
              quantityOnHand: onHand.minus(take),
            },
          });

          const mov = await tx.stockMovement.create({
            data: {
              pharmacyId,
              warehouseId: dto.warehouseId,
              productId: product.id,
              batchId: b.batchId,
              movementType: StockMovementType.out,
              qty: take,
              unitCost: b.batch
                ? new Prisma.Decimal(b.batch.purchaseCost.toString())
                : new Prisma.Decimal(0),
              referenceType: 'sale',
              movedBy: user.sub,
              note: undefined,
            },
          });
          movementIds.push(mov.id);

          const gross = unitPrice.mul(take);
          const taxable = gross.minus(discountShare);
          const taxAmt = taxable.mul(taxRate).div(new Prisma.Decimal(100));
          const lineTotal = taxable.plus(taxAmt);

          saleLinesData.push({
            productId: product.id,
            batchId: b.batchId,
            qty: take,
            unitPrice,
            discount: discountShare,
            taxRate,
            lineTotal,
          });

          subtotal = subtotal.plus(gross);
          discountTotal = discountTotal.plus(discountShare);
          taxTotal = taxTotal.plus(taxAmt);
          remaining = remaining.minus(take);
        }

        if (remaining.gt(0)) {
          throw new BadRequestException(
            `Stock insuffisant pour ${product.name}`,
          );
        }
      }

      const totalBeforePay = subtotal.minus(discountTotal).plus(taxTotal);

      const paid = dto.payments.reduce(
        (acc, p) => acc.plus(new Prisma.Decimal(p.amount.toString())),
        new Prisma.Decimal(0),
      );

      if (paid.lt(totalBeforePay)) {
        throw new BadRequestException('Paiement insuffisant');
      }

      const sale = await tx.sale.create({
        data: {
          pharmacyId,
          registerId: dto.registerId ?? null,
          saleNumber,
          customerId: dto.customerId ?? null,
          cashierId: user.sub,
          status: SaleStatus.completed,
          paymentStatus: PaymentStatus.paid,
          subtotal,
          discountTotal,
          taxTotal,
          total: totalBeforePay,
          lines: {
            create: saleLinesData.map((l) => ({
              productId: l.productId,
              batchId: l.batchId,
              qty: l.qty,
              unitPrice: l.unitPrice,
              discount: l.discount,
              taxRate: l.taxRate,
              lineTotal: l.lineTotal,
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              paymentMethod: p.paymentMethod,
              amount: new Prisma.Decimal(p.amount.toString()),
              reference: p.reference,
              paidAt: new Date(),
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      await tx.stockMovement.updateMany({
        where: { id: { in: movementIds } },
        data: { referenceId: sale.id },
      });

      return sale;
    });
  }

  /** Retour : en attente si montant > seuil, sinon stock + remboursement dans la même transaction. */
  async createReturn(
    pharmacyId: string,
    user: JwtPayloadUser,
    saleId: string,
    dto: CreateSaleReturnDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, pharmacyId },
        include: { lines: { include: { product: true } } },
      });
      if (!sale) throw new NotFoundException('Vente introuvable');
      if (sale.status === SaleStatus.cancelled) {
        throw new BadRequestException('Vente annulée, retour impossible');
      }

      const settings = await this.resolvePharmacyReturnSettings(tx, pharmacyId);

      const saleAgeDays =
        (Date.now() - new Date(sale.saleDate).getTime()) /
        (1000 * 60 * 60 * 24);

      let grossTotal = new Prisma.Decimal(0);

      type PreparedLine = {
        saleLineId: string;
        qty: Prisma.Decimal;
        condition: ReturnCondition;
        refundable: Prisma.Decimal;
      };
      const prepared: PreparedLine[] = [];

      for (const row of dto.lines) {
        const saleLine = sale.lines.find((l) => l.id === row.saleLineId);
        if (!saleLine) {
          throw new BadRequestException(
            `Ligne de vente ${row.saleLineId} invalide`,
          );
        }

        const product = saleLine.product;
        if (!product.isReturnable) {
          throw new BadRequestException(
            `Le produit ${product.name} n’est pas retournable`,
          );
        }

        const windowDays =
          product.returnWindowDays ?? settings.defaultReturnWindowDays;
        if (saleAgeDays > windowDays + 1e-9) {
          throw new BadRequestException(
            `Délai de retour dépassé (${Math.floor(windowDays)} j.)`,
          );
        }

        if (row.condition === 'expired' && !settings.allowExpiredReturn) {
          throw new BadRequestException(
            'Retour « expiré » non autorisé par la pharmacie',
          );
        }

        const qtyReq = new Prisma.Decimal(row.qty.toString());
        const already = await this.sumReturnedQty(
          tx,
          pharmacyId,
          sale.id,
          saleLine.id,
        );
        const maxRet = new Prisma.Decimal(saleLine.qty.toString()).minus(
          already,
        );
        if (qtyReq.gt(maxRet)) {
          throw new BadRequestException(
            `Quantité retournée trop élevée pour la ligne (${product.name})`,
          );
        }

        const refundable = this.lineRefundableShare(saleLine, qtyReq);
        grossTotal = grossTotal.plus(refundable);

        prepared.push({
          saleLineId: saleLine.id,
          qty: qtyReq,
          condition:
            row.condition === 'damaged'
              ? ReturnCondition.damaged
              : row.condition === 'expired'
                ? ReturnCondition.expired
                : ReturnCondition.resellable,
          refundable,
        });
      }

      const feePercent = new Prisma.Decimal(
        (dto.restockingFeePercent ?? 0).toString(),
      );
      const feeAmount = grossTotal.mul(feePercent).div(new Prisma.Decimal(100));
      let finalAmount = grossTotal.minus(feeAmount);

      if (dto.overrideAmount != null) {
        finalAmount = new Prisma.Decimal(dto.overrideAmount.toString());
        if (finalAmount.lt(0))
          throw new BadRequestException('Montant override invalide');
      }

      const needsApproval = finalAmount.gt(settings.requireManagerApprovalOver);

      if (!needsApproval) {
        if (!dto.refundMethod) {
          throw new BadRequestException(
            'refundMethod requis pour un retour hors approbation (sous seuil)',
          );
        }
        this.ensureRefundAccounts(dto.refundMethod, dto);
      }

      const returnNumber = `R-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

      const sr = await tx.saleReturn.create({
        data: {
          pharmacyId,
          saleId: sale.id,
          returnNumber,
          total: finalAmount,
          reason: dto.reason ?? null,
          createdBy: user.sub,
          status: SaleReturnStatus.pending_approval,
          restockingFeePercent: feePercent,
          restockingFeeAmount: feeAmount,
          refundMethod: dto.refundMethod
            ? this.dtoToRefundMethod(dto.refundMethod)
            : null,
          lines: {
            create: prepared.map((p) => ({
              saleLineId: p.saleLineId,
              qty: p.qty,
              condition: p.condition,
            })),
          },
        },
      });

      if (needsApproval) {
        await this.refreshSaleReturnedStatus(tx, pharmacyId, sale.id);
        return {
          saleReturnId: sr.id,
          returnNumber,
          total: finalAmount,
          status: SaleReturnStatus.pending_approval,
          needsApproval: true,
        };
      }

      const full = await tx.saleReturn.findFirstOrThrow({
        where: { id: sr.id },
        include: {
          lines: { include: { saleLine: true } },
          sale: { include: { lines: true } },
        },
      });

      await this.applyReturnStock(tx, pharmacyId, user.sub, full);
      await tx.saleReturn.update({
        where: { id: sr.id },
        data: {
          status: SaleReturnStatus.approved,
          approvedBy: user.sub,
          approvalNote: 'Auto (sous seuil)',
        },
      });

      await this.executeRefundSaleReturn(tx, pharmacyId, user.sub, sr.id, {
        method:
          dto.refundMethod === 'cash'
            ? 'cash'
            : dto.refundMethod === 'bank_transfer'
              ? 'bank_transfer'
              : dto.refundMethod === 'card_reversal'
                ? 'card_reversal'
                : 'customer_credit',
        cashAccountId: dto.cashAccountId,
        bankAccountId: dto.bankAccountId,
      });

      await this.refreshSaleReturnedStatus(tx, pharmacyId, sale.id);

      return tx.saleReturn.findFirstOrThrow({
        where: { id: sr.id },
        include: { lines: true, credits: true },
      });
    });
  }

  async approveReturn(
    pharmacyId: string,
    manager: JwtPayloadUser,
    returnId: string,
    dto: ApproveSaleReturnDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sr = await tx.saleReturn.findFirst({
        where: { id: returnId, pharmacyId },
        include: {
          lines: { include: { saleLine: true } },
          sale: { include: { lines: { include: { product: true } } } },
        },
      });
      if (!sr) throw new NotFoundException('Retour introuvable');
      if (sr.status !== SaleReturnStatus.pending_approval) {
        throw new BadRequestException('Ce retour ne peut plus être approuvé');
      }

      if (dto.decision === 'rejected') {
        await tx.saleReturn.update({
          where: { id: sr.id },
          data: {
            status: SaleReturnStatus.rejected,
            approvedBy: manager.sub,
            approvalNote: dto.note ?? null,
          },
        });
        await this.refreshSaleReturnedStatus(tx, pharmacyId, sr.saleId);
        return tx.saleReturn.findFirstOrThrow({ where: { id: sr.id } });
      }

      await this.applyReturnStock(tx, pharmacyId, manager.sub, sr);
      await tx.saleReturn.update({
        where: { id: sr.id },
        data: {
          status: SaleReturnStatus.approved,
          approvedBy: manager.sub,
          approvalNote: dto.note ?? null,
        },
      });
      await this.refreshSaleReturnedStatus(tx, pharmacyId, sr.saleId);

      return tx.saleReturn.findFirstOrThrow({
        where: { id: sr.id },
        include: { lines: true },
      });
    });
  }

  async refundReturn(
    pharmacyId: string,
    user: JwtPayloadUser,
    returnId: string,
    dto: RefundSaleReturnDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sr = await tx.saleReturn.findFirst({
        where: { id: returnId, pharmacyId },
        include: { sale: true },
      });
      if (!sr) throw new NotFoundException('Retour introuvable');
      if (sr.status === SaleReturnStatus.rejected) {
        throw new BadRequestException('Retour rejeté');
      }
      if (sr.status === SaleReturnStatus.refunded) {
        throw new BadRequestException('Déjà remboursé');
      }
      if (sr.status !== SaleReturnStatus.approved) {
        throw new BadRequestException(
          'Le retour doit être approuvé avant remboursement',
        );
      }

      await this.executeRefundSaleReturn(tx, pharmacyId, user.sub, sr.id, dto);
      await this.refreshSaleReturnedStatus(tx, pharmacyId, sr.saleId);

      return tx.saleReturn.findFirstOrThrow({
        where: { id: sr.id },
        include: { lines: true, credits: true },
      });
    });
  }

  async applyCustomerCredit(
    pharmacyId: string,
    user: JwtPayloadUser,
    dto: ApplyCustomerCreditDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: dto.saleId, pharmacyId },
      });
      if (!sale) throw new NotFoundException('Vente introuvable');
      if (!sale.customerId || sale.customerId !== dto.customerId) {
        throw new BadRequestException('Client incohérent avec la vente');
      }

      const requested = new Prisma.Decimal(dto.amount.toString());
      const credits = await tx.customerCredit.findMany({
        where: {
          pharmacyId,
          customerId: dto.customerId,
          remaining: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (credits.length === 0) {
        throw new BadRequestException('Aucun avoir disponible');
      }

      let remainingToApply = requested;
      for (const credit of credits) {
        if (remainingToApply.lte(0)) break;
        const avail = new Prisma.Decimal(credit.remaining.toString());
        const take = avail.lt(remainingToApply) ? avail : remainingToApply;
        await tx.customerCredit.update({
          where: { id: credit.id },
          data: { remaining: avail.minus(take) },
        });
        await tx.salePayment.create({
          data: {
            saleId: sale.id,
            paymentMethod: 'customer_credit',
            amount: take,
            paidAt: new Date(),
            reference: `credit:${credit.id}`,
          },
        });
        remainingToApply = remainingToApply.minus(take);
      }

      const applied = requested.minus(remainingToApply);
      if (applied.lte(0)) {
        throw new BadRequestException('Impossible d’appliquer l’avoir');
      }

      const paidAgg = await tx.salePayment.aggregate({
        where: { saleId: sale.id },
        _sum: { amount: true },
      });
      const paid = new Prisma.Decimal(paidAgg._sum.amount?.toString() ?? '0');
      const total = new Prisma.Decimal(sale.total.toString());
      let paymentStatus: PaymentStatus = PaymentStatus.unpaid;
      if (paid.gte(total)) paymentStatus = PaymentStatus.paid;
      else if (paid.gt(0)) paymentStatus = PaymentStatus.partial;

      await tx.sale.update({
        where: { id: sale.id },
        data: { paymentStatus },
      });

      return {
        saleId: sale.id,
        requested,
        applied,
        unapplied: remainingToApply,
        paymentStatus,
      };
    });
  }

  private lineRefundableShare(
    saleLine: {
      unitPrice: Prisma.Decimal;
      discount: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      qty: Prisma.Decimal;
    },
    returnQty: Prisma.Decimal,
  ): Prisma.Decimal {
    const unitPrice = new Prisma.Decimal(saleLine.unitPrice.toString());
    const lineDisc = new Prisma.Decimal(saleLine.discount.toString());
    const taxRate = new Prisma.Decimal(saleLine.taxRate.toString());
    const lineQty = new Prisma.Decimal(saleLine.qty.toString());

    const gross = unitPrice.mul(returnQty);
    const discountShare = lineDisc.mul(returnQty).div(lineQty);
    const taxable = gross.minus(discountShare);
    const tax = taxable.mul(taxRate).div(new Prisma.Decimal(100));
    return taxable.plus(tax);
  }

  private async sumReturnedQty(
    tx: Tx,
    pharmacyId: string,
    saleId: string,
    saleLineId: string,
  ) {
    const agg = await tx.saleReturnLine.aggregate({
      where: {
        saleLineId,
        saleReturn: {
          saleId,
          pharmacyId,
          status: {
            in: [
              SaleReturnStatus.pending_approval,
              SaleReturnStatus.approved,
              SaleReturnStatus.refunded,
            ],
          },
        },
      },
      _sum: { qty: true },
    });
    return new Prisma.Decimal(agg._sum.qty?.toString() ?? '0');
  }

  private async resolvePharmacyReturnSettings(tx: Tx, pharmacyId: string) {
    const row = await tx.pharmacySetting.findUnique({
      where: { pharmacyId },
    });
    return {
      defaultReturnWindowDays: row?.defaultReturnWindowDays ?? 7,
      requireManagerApprovalOver: new Prisma.Decimal(
        row?.requireManagerApprovalOver?.toString() ?? '200',
      ),
      allowExpiredReturn: row?.allowExpiredReturn ?? false,
    };
  }

  private ensureRefundAccounts(
    method: string,
    dto: { cashAccountId?: string; bankAccountId?: string },
  ) {
    if (method === 'customer_credit') return;
    if (method === 'cash' && !dto.cashAccountId) {
      throw new BadRequestException(
        'cashAccountId requis pour un remboursement caisse',
      );
    }
    if (
      (method === 'bank_transfer' || method === 'card_reversal') &&
      !dto.bankAccountId
    ) {
      throw new BadRequestException(
        'bankAccountId requis pour ce mode de remboursement',
      );
    }
  }

  private async getOrCreateQuarantineWarehouse(tx: Tx, pharmacyId: string) {
    let w = await tx.warehouse.findFirst({
      where: { pharmacyId, type: 'quarantine' },
    });
    if (!w) {
      w = await tx.warehouse.create({
        data: {
          pharmacyId,
          name: 'Quarantaine',
          type: 'quarantine',
        },
      });
    }
    return w;
  }

  private async getMainWarehouse(tx: Tx, pharmacyId: string) {
    let w = await tx.warehouse.findFirst({
      where: { pharmacyId, type: 'main' },
    });
    if (!w) {
      w = await tx.warehouse.findFirst({ where: { pharmacyId } });
    }
    if (!w) throw new BadRequestException('Aucun dépôt configuré');
    return w;
  }

  private async applyReturnStock(
    tx: Tx,
    pharmacyId: string,
    userId: string,
    sr: {
      id: string;
      lines: Array<{
        qty: Prisma.Decimal;
        condition: ReturnCondition;
        saleLine: { productId: string; batchId: string | null };
      }>;
    },
  ) {
    for (const line of sr.lines) {
      const main = await this.getMainWarehouse(tx, pharmacyId);
      const quarantine = await this.getOrCreateQuarantineWarehouse(
        tx,
        pharmacyId,
      );
      const targetId =
        line.condition === ReturnCondition.resellable ? main.id : quarantine.id;

      const qty = new Prisma.Decimal(line.qty.toString());
      const { productId, batchId } = line.saleLine;

      const existing = await tx.stockBalance.findFirst({
        where: {
          warehouseId: targetId,
          productId,
          batchId: batchId ?? null,
        },
      });

      if (existing) {
        const onHand = new Prisma.Decimal(existing.quantityOnHand.toString());
        await tx.stockBalance.update({
          where: { id: existing.id },
          data: { quantityOnHand: onHand.plus(qty) },
        });
      } else {
        await tx.stockBalance.create({
          data: {
            warehouseId: targetId,
            productId,
            batchId,
            quantityOnHand: qty,
            quantityReserved: new Prisma.Decimal(0),
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          pharmacyId,
          warehouseId: targetId,
          productId,
          batchId,
          movementType: StockMovementType.in,
          qty,
          unitCost: new Prisma.Decimal(0),
          referenceType: 'sale_return',
          referenceId: sr.id,
          movedBy: userId,
          note: 'Retour vente',
        },
      });
    }
  }

  private async refreshSaleReturnedStatus(
    tx: Tx,
    pharmacyId: string,
    saleId: string,
  ) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, pharmacyId },
      include: { lines: true },
    });
    if (!sale) return;

    const sold = sale.lines.reduce(
      (acc, l) => acc.plus(new Prisma.Decimal(l.qty.toString())),
      new Prisma.Decimal(0),
    );

    const retAgg = await tx.saleReturnLine.aggregate({
      where: {
        saleReturn: {
          saleId,
          pharmacyId,
          status: {
            in: [SaleReturnStatus.approved, SaleReturnStatus.refunded],
          },
        },
      },
      _sum: { qty: true },
    });
    const returned = new Prisma.Decimal(retAgg._sum.qty?.toString() ?? '0');

    let status: SaleStatus = SaleStatus.completed;
    if (returned.gt(0) && returned.lt(sold)) {
      status = SaleStatus.returned_partial;
    } else if (sold.gt(0) && returned.gte(sold)) {
      status = SaleStatus.returned_full;
    }

    await tx.sale.update({ where: { id: saleId }, data: { status } });
  }

  private dtoToRefundMethod(
    s: NonNullable<CreateSaleReturnDto['refundMethod']>,
  ): RefundMethod {
    switch (s) {
      case 'cash':
        return RefundMethod.cash;
      case 'bank_transfer':
        return RefundMethod.bank_transfer;
      case 'card_reversal':
        return RefundMethod.card_reversal;
      case 'customer_credit':
        return RefundMethod.customer_credit;
      default:
        throw new BadRequestException('Mode de remboursement invalide');
    }
  }

  private async executeRefundSaleReturn(
    tx: Tx,
    pharmacyId: string,
    userId: string,
    saleReturnId: string,
    dto: RefundSaleReturnDto,
  ) {
    const sr = await tx.saleReturn.findFirstOrThrow({
      where: { id: saleReturnId, pharmacyId },
      include: { sale: true },
    });
    if (sr.status !== SaleReturnStatus.approved) {
      throw new BadRequestException('Retour non approuvé');
    }

    const amount = new Prisma.Decimal(sr.total.toString());

    if (dto.method === 'customer_credit') {
      if (!sr.sale.customerId) {
        throw new BadRequestException(
          'Vente sans client : impossible d’émettre un avoir',
        );
      }
      await tx.customerCredit.create({
        data: {
          pharmacyId,
          customerId: sr.sale.customerId,
          saleReturnId: sr.id,
          amount,
          remaining: amount,
        },
      });
    } else {
      this.ensureRefundAccounts(dto.method, dto);
      const accountType =
        dto.method === 'cash'
          ? FinanceAccountType.cash
          : FinanceAccountType.bank;
      const accountId =
        dto.method === 'cash' ? dto.cashAccountId! : dto.bankAccountId!;

      await tx.financeTransaction.create({
        data: {
          pharmacyId,
          accountType,
          accountId,
          txnDate: new Date(),
          txnType: FinanceTxnType.out,
          category: 'sale_refund',
          amount,
          referenceType: 'sale_return',
          referenceId: sr.id,
          note: dto.reference ?? `Remboursement ${sr.returnNumber}`,
          createdBy: userId,
        },
      });
    }

    const refundMethodEnum =
      dto.method === 'cash'
        ? RefundMethod.cash
        : dto.method === 'bank_transfer'
          ? RefundMethod.bank_transfer
          : dto.method === 'card_reversal'
            ? RefundMethod.card_reversal
            : RefundMethod.customer_credit;

    await tx.saleReturn.update({
      where: { id: sr.id },
      data: {
        status: SaleReturnStatus.refunded,
        refundMethod: refundMethodEnum,
        refundedBy: userId,
        refundedAt: new Date(),
      },
    });
  }
}
